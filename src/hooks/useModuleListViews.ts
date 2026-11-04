// Generic saved-views hook, extracted from usePatientListViews.ts. Backs
// the same list_views table (section is unconstrained beyond
// lowercase+underscores at the DB level - see
// supabase/migrations/20260829044228_*.sql), same view shape - the only
// per-module input is a `defaultColumns` fallback for new/standard views.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ListView } from "@/lib/listViews/engine";
import { ALL_VIEW_ID, buildStandardViews, setStandardColumns } from "@/lib/listViews/standardViews";
import { pickActiveView } from "@/lib/listViews/pickActiveView";
import { choiceFor, noteModuleOpened, rememberChoice } from "@/lib/listViews/moduleChoice";
import { NOT_YOURS_MESSAGE } from "@/lib/rowAccess";

function normalize(row: any, defaultColumns: string[]): ListView {
  const rawFilters = row.filters;
  const conditions = Array.isArray(rawFilters)
    ? rawFilters
    : Array.isArray(rawFilters?.conditions)
      ? rawFilters.conditions
      : [];
  return {
    id: row.id,
    name: row.name,
    owner_id: row.user_id,
    filters: {
      match: (row.filter_match === "any" ? "any" : "all") as "all" | "any",
      conditions,
    },
    columns: row.display_fields?.length ? row.display_fields : defaultColumns,
    sort_field: row.sort_by ?? "created_at",
    sort_dir: row.sort_direction === "asc" ? "asc" : "desc",
    visibility: (row.visibility ?? "private") as ListView["visibility"],
    shared_user_ids: row.shared_with ?? [],
    // Whether THIS person pinned it - filled in by `allViews` below from
    // list_view_defaults. The list_views.is_default column it used to come
    // from sits on a row the whole clinic may share, so it could never answer
    // that question. See pickActiveView.ts.
    is_default: false,
    charts: Array.isArray(row.charts) ? row.charts : [],
  };
}

/**
 * Who is signed in, read locally first.
 *
 * getUser() goes to the server. When it came back empty - a slow connection,
 * a token mid-refresh - the pin query below was skipped entirely, the page
 * settled on All, and `initialised` meant it never looked again for the whole
 * visit. getSession() is served from storage, the way useAuth.tsx reads it, so
 * the common case needs no round trip at all.
 */
const currentUserId = async (): Promise<string | undefined> => {
  const { data: session } = await supabase.auth.getSession();
  if (session.session?.user?.id) return session.session.user.id;
  const { data: user } = await supabase.auth.getUser();
  return user.user?.id;
};

export function useModuleListViews(section: string, objectLabel: string, defaultColumns: string[]) {
  const [views, setViews] = useState<ListView[]>([]);
  const [standardViews, setStandardViews] = useState<ListView[]>(() => buildStandardViews(section, objectLabel, defaultColumns));
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | undefined>();
  const [pinnedViewId, setPinnedViewId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(ALL_VIEW_ID);
  const [initialised, setInitialised] = useState(false);

  const load = useCallback(async () => {
    const uid = await currentUserId();
    setUserId(uid);
    // Which list opened last is how "you left the module" is known - see
    // moduleChoice.ts.
    noteModuleOpened(section);

    const [viewsResult, pinResult] = await Promise.all([
      supabase.from("list_views").select("*").eq("section", section).order("created_at", { ascending: false }),
      uid
        ? supabase.from("list_view_defaults").select("view_id").eq("section", section).eq("user_id", uid).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
    ]);

    if (viewsResult.error) {
      toast.error(viewsResult.error.message);
      setLoading(false);
      return { list: [] as ListView[], pinned: null as string | null };
    }
    const list = (viewsResult.data || []).map((row) => normalize(row, defaultColumns));
    // A missing pin is not a failure worth a toast - most people have none.
    const pinned = (pinResult.data as { view_id?: string } | null)?.view_id ?? null;
    setViews(list);
    setPinnedViewId(pinned);
    setLoading(false);
    return { list, pinned };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    load().then(({ list, pinned }) => {
      if (initialised) return;
      const choice = pickActiveView({ stored: choiceFor(section), pinned, views: list });
      if (choice.forget) rememberChoice(section, null);
      setActiveViewId(choice.id);
      setInitialised(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const selectView = useCallback((id: string | null) => {
    const next = id ?? ALL_VIEW_ID;
    setActiveViewId(next);
    rememberChoice(section, next);
  }, [section]);

  const allViews = useMemo(
    // `is_default` means "pinned by me" everywhere it is read - the pin icon,
    // its title, the gear menu. Drawn from list_views.is_default it showed a
    // colleague's pin on a shared view as though it were yours, and pressing
    // it was read as an unpin.
    () => [...standardViews, ...views].map((v) => ({ ...v, is_default: v.id === pinnedViewId })),
    [standardViews, views, pinnedViewId]
  );

  const activeView = useMemo(
    () => allViews.find((v) => v.id === activeViewId) ?? allViews[0] ?? null,
    [allViews, activeViewId]
  );

  /** Standard views keep locked filters, but their displayed columns are user-configurable. */
  const updateStandardColumns = useCallback(
    (viewId: string, columns: string[]) => {
      setStandardColumns(section, viewId, columns);
      setStandardViews((prev) => prev.map((v) => (v.id === viewId ? { ...v, columns } : v)));
    },
    [section]
  );

  const saveView = useCallback(
    async (payload: Partial<ListView> & { name: string }) => {
      const uid = await currentUserId();
      if (!uid) {
        toast.error("You must be signed in to save a view");
        return;
      }
      // No is_default here. It is nobody's preference any more (that lives in
      // list_view_defaults), and the editor only ever passed back whatever it
      // was given, so writing it would overwrite the historical value with the
      // client's "pinned by me" meaning.
      const record = {
        name: payload.name,
        section,
        user_id: uid,
        filters: (payload.filters?.conditions ?? []) as any,
        filter_match: payload.filters?.match ?? "all",
        display_fields: payload.columns?.length ? payload.columns : defaultColumns,
        sort_by: payload.sort_field ?? "created_at",
        sort_direction: payload.sort_dir ?? "desc",
        visibility: payload.visibility ?? "private",
        shared_with: payload.visibility === "selected" ? payload.shared_user_ids ?? [] : [],
        is_shared: (payload.visibility ?? "private") !== "private",
        charts: (payload.charts ?? []) as any,
      };

      if (payload.id) {
        // .select() so RLS filtering the row is visible. Without it an update
        // a user is not allowed to make returns no error and no rows, and the
        // app cheerfully said "View updated" before reloading the old values -
        // which reads as the app losing the change.
        const { data: updated, error } = await supabase
          .from("list_views")
          .update({ ...record, updated_at: new Date().toISOString() })
          .eq("id", payload.id)
          .select("id");
        if (error) return toast.error(error.message);
        if (!updated || updated.length === 0) return toast.error(NOT_YOURS_MESSAGE);
        toast.success("View updated");
        await load();
        selectView(payload.id);
      } else {
        const { data, error } = await supabase
          .from("list_views")
          .insert({ ...record, is_default: false })
          .select("id")
          .single();
        if (error) return toast.error(error.message);
        toast.success("View created");
        await load();
        if (data?.id) selectView(data.id);
      }
    },
    [section, load, selectView, defaultColumns]
  );

  const saveCharts = useCallback(
    async (viewId: string, charts: ListView["charts"]) => {
      // Charts live on the view row, so they inherit the view's sharing rules.
      setViews((prev) => prev.map((v) => (v.id === viewId ? { ...v, charts } : v)));
      const { error } = await supabase
        .from("list_views")
        .update({ charts: charts as any, updated_at: new Date().toISOString() })
        .eq("id", viewId);
      if (error) {
        toast.error(error.message);
        await load();
      }
    },
    [load]
  );

  const deleteView = useCallback(
    async (view: ListView) => {
      const { data: removed, error } = await supabase
        .from("list_views")
        .delete()
        .eq("id", view.id)
        .select("id");
      if (error) return toast.error(error.message);
      // Same as the update above: a delete nobody is allowed to make is not an
      // error, it is zero rows - and the view reappeared on the next load.
      if (!removed || removed.length === 0) return toast.error(NOT_YOURS_MESSAGE);
      toast.success("View deleted");
      selectView(null);
      await load();
    },
    [load, selectView]
  );

  /**
   * Pin a view as where this person lands when they open the app.
   *
   * Any view they can see, their colleagues' shared ones and the standard ones
   * included - the clinic's landing view was created by one person for all of
   * them, and refusing to pin it was the whole complaint. The pin is a row of
   * their own, so it cannot disturb anybody else's.
   */
  const pinDefault = useCallback(
    async (view: ListView) => {
      const uid = await currentUserId();
      if (!uid) return toast.error("You must be signed in to pin a view");
      const { error } = await supabase
        .from("list_view_defaults")
        .upsert({ user_id: uid, section, view_id: view.id, updated_at: new Date().toISOString() },
          { onConflict: "user_id,section" });
      if (error) return toast.error(error.message);
      setPinnedViewId(view.id);
      // Switching to the view it just pinned is the caller's job - on
      // Appointments that also moves the quick-date chips. See ViewBar.tsx.
      toast.success(`"${view.name}" pinned as default`);
    },
    [section]
  );

  /**
   * Clear it. Separate from pinDefault because passing it null used to mean
   * both "unpin" and "pin a standard view", and the branch that handled both
   * announced `"All ${objectLabel}" pinned as default` for an unpin - and
   * moved the page there.
   */
  const unpinDefault = useCallback(async () => {
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await supabase
      .from("list_view_defaults")
      .delete()
      .eq("user_id", uid)
      .eq("section", section);
    if (error) return toast.error(error.message);
    setPinnedViewId(null);
    // Deliberately no selectView: unpinning says nothing about what you want
    // to be looking at right now.
    toast.success("Default view cleared");
  }, [section]);

  return {
    views,
    allViews,
    standardViews,
    updateStandardColumns,

    loading,
    /**
     * The remembered view has been restored (or settled on a default).
     *
     * Until this is true `activeView` is whatever standard view happens to be
     * first - "All Appointments" - which says nothing about dates. A screen that
     * fetches on that answer fetches the wrong window, and the saved view's own
     * conditions then filter the result to nothing: "Todays Appointments" read
     * "0 items" every time the clinic left the page and came back.
     */
    viewsReady: initialised,
    userId,
    activeView,
    activeViewId,
    pinnedViewId,
    selectView,
    saveView,
    saveCharts,
    deleteView,

    pinDefault,
    unpinDefault,
    reload: load,
  };
}
