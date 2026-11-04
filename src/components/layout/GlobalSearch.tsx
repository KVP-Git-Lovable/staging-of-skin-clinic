import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, User, CalendarDays, Stethoscope, Receipt, Loader2, ChevronDown,
  UserCog, Sparkles, Pill, Clock, ArrowRight, X, ImageIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { MicButton } from "@/components/shared/MicButton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { buildOrFilter, buildPrefixFilter, buildTokenFilters, fuzzyRank } from "@/lib/fuzzySearch";
import { hashImageFile } from "@/lib/photoHashImage";
import { matchQualityLabel, POSSIBLE_MAX } from "@/lib/photoHash";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { procedureDateLabel } from "@/lib/procedureDate";
import {
  readRecentSearches, rememberRecentSearch, readLastSearch, rememberLastSearch, forgetLastSearch,
} from "@/lib/recentSearch";

type Kind = "patient" | "appointment" | "procedure" | "invoice" | "staff" | "service" | "product" | "photo";

/** The patient columns this dropdown selects - the only shape the new
 * prefix/broad merge below needs to know about. */
type PatientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

/** One row of search_patient_photos_by_hash. */
type PhotoMatch = {
  photo_id: string;
  patient_id: string;
  photo_url: string | null;
  taken_at: string | null;
  distance: number;
};

type Result = {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  route: string;
};

const KIND_META: Record<Kind, { label: string; icon: any; listRoute: string }> = {
  patient: { label: "Patients", icon: User, listRoute: "/patients" },
  appointment: { label: "Appointments", icon: CalendarDays, listRoute: "/appointments" },
  procedure: { label: "Prescriptions", icon: Stethoscope, listRoute: "/procedures" },
  invoice: { label: "Invoices", icon: Receipt, listRoute: "/billing" },
  staff: { label: "Staff", icon: UserCog, listRoute: "/staff" },
  service: { label: "Services", icon: Sparkles, listRoute: "/services" },
  product: { label: "Products", icon: Pill, listRoute: "/pharma" },
  // Photo results ARE patients - the photo is only how they were found -
  // so they lead to the patient record like any other patient row.
  photo: { label: "Photos", icon: ImageIcon, listRoute: "/patients" },
};

const SCOPES: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "patient", label: "Patients" },
  { key: "appointment", label: "Appointments" },
  { key: "procedure", label: "Prescriptions" },
  { key: "invoice", label: "Invoices" },
  { key: "staff", label: "Staff" },
  { key: "service", label: "Services" },
  { key: "product", label: "Products" },
  { key: "photo", label: "Photos" },
];

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  // The search that was last typed, so moving to another tab and back does not
  // mean typing the number again. GlobalSearch is mounted once in the header,
  // so this only has to be read back after a full reload.
  const [term, setTerm] = useState(readLastSearch);
  // The box is only searched once somebody has been in it: a term restored from
  // the last visit must not fire a seven-table query on every app load.
  const [touched, setTouched] = useState(false);
  const [scope, setScope] = useState<"all" | Kind>("all");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>(readRecentSearches);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Photo scope: there is nothing to type, so the search is driven by a chosen
  // file instead of by the term. The file itself never leaves the device -
  // only the 16-character fingerprint below is sent anywhere.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoName, setPhotoName] = useState("");
  const [photoHash, setPhotoHash] = useState("");
  const [photoError, setPhotoError] = useState("");
  const photoMode = scope === "photo";

  useEffect(() => {
    const t = setTimeout(() => {
      rememberLastSearch(term);
      if (touched) setDebounced(term.trim());
    }, 200);
    return () => clearTimeout(t);
  }, [term, touched]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Cmd/Ctrl+K focuses the search, like Salesforce's global search shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const rememberTerm = (q: string) => setRecents(rememberRecentSearch(q));

  useEffect(() => {
    let cancelled = false;
    // Photo scope has no term to search on; its own effect below owns the
    // results, so this one must not clear them out from under it.
    if (scope === "photo") return;
    const q = debounced;
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const like = `%${q}%`;
      const wants = (k: Kind) => scope === "all" || scope === k;
      const PATIENT_COLS = ["first_name", "last_name", "phone", "email"];
      // Every word has to appear somewhere on the record: separate .or() calls
      // are ANDed by PostgREST. "nisha rai" now means nisha AND rai, so it finds
      // Anisha Rai instead of every Rai in the clinic.
      const tokenFilters = buildTokenFilters(q, PATIENT_COLS);
      const strictPatients = async () => {
        let query = supabase.from("patients").select("id, first_name, last_name, phone, email");
        for (const f of tokenFilters) query = query.or(f);
        if (tokenFilters.length === 0) query = query.or(`first_name.ilike.${like}`);
        // Ordered, because this is capped. Unordered, the 25 rows the cap kept
        // were an arbitrary 25 of however many matched - 756 of them for "uma" -
        // and the person being looked for was usually not in that 25. Most
        // recently seen is the clinic's own idea of which patient is meant.
        return query.order("last_visit_date", { ascending: false, nullsFirst: false }).limit(25);
      };

      // Names that BEGIN with what was typed, which is nearly always who is
      // meant. Runs alongside the broad search rather than after it, so it costs
      // no extra wait, and its hits go above the broad ones below.
      const prefixPatients = async () => {
        const prefixFilter = buildPrefixFilter(q, ["first_name", "last_name", "phone"]);
        if (!prefixFilter) return { data: [] as PatientRow[] };
        return supabase
          .from("patients")
          .select("id, first_name, last_name, phone, email")
          .or(prefixFilter)
          .order("last_visit_date", { ascending: false, nullsFirst: false })
          .limit(10);
      };

      const noRows = { data: [] as any[] };
      const [prefixHits, patients, appts, procs, invs, staff, services, products] = await Promise.all([
        wants("patient") ? prefixPatients() : noRows,
        wants("patient") ? strictPatients() : noRows,
        wants("appointment")
          ? supabase.from("appointments").select("id, patient_name, service, start_time, status")
              .or(`patient_name.ilike.${like},service.ilike.${like},status.ilike.${like}`)
              .order("start_time", { ascending: false }).limit(12)
          : noRows,
        wants("procedure")
          ? supabase.from("procedures").select("id, service_name, procedure_date, date_not_recorded, patients(first_name, last_name)")
              .ilike("service_name", like).eq("date_not_recorded", false).order("procedure_date", { ascending: false }).limit(12)
          : noRows,
        wants("invoice")
          ? supabase.from("invoices").select("id, invoice_number, patient_name, total_amount, status, created_at")
              .or(`invoice_number.ilike.${like},patient_name.ilike.${like}`)
              .order("created_at", { ascending: false }).limit(12)
          : noRows,
        wants("staff")
          ? supabase.from("staff").select("id, first_name, last_name, role, phone")
              .or(`first_name.ilike.${like},last_name.ilike.${like},role.ilike.${like},phone.ilike.${like}`)
              .limit(8)
          : noRows,
        wants("service")
          ? supabase.from("services").select("id, name, category, price").ilike("name", like).limit(8)
          : noRows,
        wants("product")
          ? supabase.from("pharma_products").select("id, name, category, mrp")
              .or(`name.ilike.${like},generic_name.ilike.${like}`).limit(8)
          : noRows,
      ]);

      if (cancelled) return;

      let patientRows = ((patients as any).data || []) as any[];
      // Requiring every word can legitimately find nobody - a typo, a middle
      // name, a patient recorded under one name only. Rather than show an empty
      // dropdown where there used to be results, fall back to the old loose
      // match. Only when strict found nothing, so a good search is never diluted.
      if (wants("patient") && patientRows.length === 0 && tokenFilters.length > 1) {
        const loose = buildOrFilter(q, PATIENT_COLS);
        if (loose) {
          const { data: looseRows } = await supabase
            .from("patients").select("id, first_name, last_name, phone, email")
            .or(loose)
            .order("last_visit_date", { ascending: false, nullsFirst: false })
            .limit(25);
          patientRows = looseRows || [];
        }
      }
      // Prefix hits first, then the broad matches, each patient once. Topping
      // the broad list up rather than replacing it means the dropdown is never
      // shorter than it used to be; fuzzyRank's word-start tiebreak then keeps
      // these above a mid-word match that scored the same as them.
      const seenPatients = new Set<string>();
      const mergedPatients = [
        ...(((prefixHits as { data: PatientRow[] | null }).data || []) as PatientRow[]),
        ...patientRows,
      ].filter((p: PatientRow) => {
        if (!p?.id || seenPatients.has(p.id)) return false;
        seenPatients.add(p.id);
        return true;
      });
      const ranked = fuzzyRank(
        mergedPatients,
        q,
        (p: any) => `${p.first_name || ""} ${p.last_name || ""} ${p.phone || ""}`,
        0.45
      );
      const usePatients = (ranked.length ? ranked : mergedPatients).slice(0, 6);

      const out: Result[] = [
        ...usePatients.map((p: any) => ({
          id: p.id,
          kind: "patient" as const,
          title: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Patient",
          subtitle: [p.phone, p.email].filter(Boolean).join(" · ") || "Patient",
          route: `/patients/${p.id}`,
        })),
        ...(((appts as any).data || []) as any[]).slice(0, 5).map((a: any) => ({
          id: a.id,
          kind: "appointment" as const,
          title: a.patient_name || "Appointment",
          subtitle: `${a.service || "Visit"} · ${a.start_time ? format(new Date(a.start_time), "dd MMM yyyy, h:mm a") : ""}${a.status ? ` · ${a.status}` : ""}`,
          route: `/appointments/${a.id}`,
        })),
        ...(((procs as any).data || []) as any[]).slice(0, 5).map((p: any) => ({
          id: p.id,
          kind: "procedure" as const,
          title: `${p.patients?.first_name || ""} ${p.patients?.last_name || ""}`.trim() || "Prescription",
          subtitle: `${p.service_name || ""} · ${procedureDateLabel(p, "dd/MM/yyyy")}`,
          route: `/procedures?id=${p.id}`,
        })),
        ...(((invs as any).data || []) as any[]).slice(0, 5).map((i: any) => ({
          id: i.id,
          kind: "invoice" as const,
          title: i.invoice_number || "Invoice",
          subtitle: `${i.patient_name || ""} · ₹${Number(i.total_amount || 0).toLocaleString("en-IN")}${i.status ? ` · ${i.status}` : ""}`,
          route: `/billing?viewInvoice=${i.id}`,
        })),
        ...(((staff as any).data || []) as any[]).slice(0, 5).map((s: any) => ({
          id: s.id,
          kind: "staff" as const,
          title: `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Staff",
          subtitle: [s.role, s.phone].filter(Boolean).join(" · ") || "Staff",
          route: `/staff/${s.id}`,
        })),
        ...(((services as any).data || []) as any[]).slice(0, 5).map((s: any) => ({
          id: s.id,
          kind: "service" as const,
          title: s.name,
          subtitle: `${s.category || "Service"} · ₹${Number(s.price || 0).toLocaleString("en-IN")}`,
          route: `/services?q=${encodeURIComponent(s.name || "")}`,
        })),
        ...(((products as any).data || []) as any[]).slice(0, 5).map((p: any) => ({
          id: p.id,
          kind: "product" as const,
          title: p.name,
          subtitle: `${p.category || "Product"} · ₹${Number(p.mrp || 0).toLocaleString("en-IN")}`,
          route: `/pharma?q=${encodeURIComponent(p.name || "")}`,
        })),
      ];

      setResults(out);
      setActiveIndex(0);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [debounced, scope]);

  // Which patients hold this photograph. The fingerprint is matched in the
  // database (search_patient_photos_by_hash), then the patients it points at
  // are named - a photo row on its own would only show a URL.
  useEffect(() => {
    if (!photoMode || !photoHash) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("search_patient_photos_by_hash", {
          _hash: photoHash,
          // Up to "possible", so a cropped copy still surfaces as a maybe
          // rather than being thrown away silently.
          _max_distance: POSSIBLE_MAX,
          _limit: 40,
        });
        if (cancelled) return;
        if (error) throw error;

        const matches = ((data || []) as PhotoMatch[]).filter((m) => m?.patient_id);
        // One row per patient, keeping their closest-matching photo: the same
        // picture is often attached to a visit more than once.
        const best = new Map<string, PhotoMatch>();
        for (const m of matches) {
          const seen = best.get(m.patient_id);
          if (!seen || m.distance < seen.distance) best.set(m.patient_id, m);
        }

        const ids = [...best.keys()];
        const byId = new Map<string, PatientRow>();
        if (ids.length) {
          const { data: people } = await supabase
            .from("patients")
            .select("id, first_name, last_name, phone, email")
            .in("id", ids);
          for (const p of (people || []) as PatientRow[]) byId.set(p.id, p);
        }
        if (cancelled) return;

        const out: Result[] = [...best.values()]
          .sort((a, b) => a.distance - b.distance)
          .map((m) => {
            const p = byId.get(m.patient_id);
            const when = m.taken_at ? format(new Date(m.taken_at), "dd MMM yyyy") : "";
            return {
              id: m.photo_id,
              kind: "photo" as const,
              title: `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || "Patient",
              subtitle: [matchQualityLabel(m.distance), p?.phone, when].filter(Boolean).join(" \u00b7 "),
              route: `/patients/${m.patient_id}`,
            };
          });
        setResults(out);
        setActiveIndex(0);
      } catch {
        if (!cancelled) {
          setResults([]);
          setPhotoError("Could not search photos just now. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [photoMode, photoHash]);

  const grouped = useMemo(() => {
    const map = new Map<Kind, Result[]>();
    results.forEach((r) => {
      if (!map.has(r.kind)) map.set(r.kind, []);
      map.get(r.kind)!.push(r);
    });
    return [...map.entries()];
  }, [results]);

  // The term is deliberately left in the box: front desk look a patient up,
  // go to Billing, and come back to the same search rather than typing the
  // number again. The X button is the one gesture that clears it.
  // Switching scope abandons whatever the last one found, rather than leaving
  // a photo's matches sitting under "Patients" or the reverse.
  const chooseScope = (key: "all" | Kind) => {
    setScope(key);
    setResults([]);
    setActiveIndex(0);
    setPhotoName("");
    setPhotoHash("");
    setPhotoError("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // Fingerprint the chosen photo here in the browser. The picture itself is
  // never uploaded: only the 16 characters go to the database.
  const onPhotoChosen = async (file: File | undefined) => {
    if (!file) return;
    setPhotoName(file.name);
    setPhotoHash("");
    setPhotoError("");
    setResults([]);
    setOpen(true);
    setLoading(true);
    const hash = await hashImageFile(file);
    if (!hash) {
      setLoading(false);
      setPhotoError("That image could not be read. JPEG and PNG work; an iPhone HEIC may not.");
      return;
    }
    setPhotoHash(hash);
  };

  const clearPhoto = () => {
    setPhotoName("");
    setPhotoHash("");
    setPhotoError("");
    setResults([]);
    setLoading(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const go = (r: Result) => {
    // Nothing was typed in photo scope, so there is no search worth recording.
    if (term.trim()) rememberTerm(term);
    setOpen(false);
    navigate(r.route);
  };

  const viewAll = (kind: Kind) => {
    rememberTerm(term);
    setOpen(false);
    navigate(`${KIND_META[kind].listRoute}?q=${encodeURIComponent(term.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[activeIndex]); }
    else if (e.key === "Escape") setOpen(false);
  };

  let flatIndex = -1;
  const showSuggestions = open && term.trim().length < 2;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="flex items-center rounded-md bg-muted">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 pl-3 pr-2 h-9 text-xs text-muted-foreground shrink-0 hover:text-foreground">
            {SCOPES.find((s) => s.key === scope)?.label}
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-popover z-50">
            {SCOPES.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => chooseScope(s.key)}>{s.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="h-5 w-px bg-border" />
        {photoMode ? (
          /* Nothing to type here: the search is a photograph. Same height and
             width as the text box so the header does not jump when the scope
             changes. accept="image/*" is what gives a phone the choice of
             Camera or Photo Library in its own sheet - no second picker. */
          <div className="relative flex-1 flex items-center gap-2 pl-2.5 pr-1 h-9 w-64">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPhotoChosen(e.target.files?.[0])}
            />
            {!photoName ? (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImageIcon className="h-4 w-4 shrink-0" />
                Choose a photo to match
              </button>
            ) : (
              <>
                <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <button
                  type="button"
                  title={photoName}
                  onClick={() => photoInputRef.current?.click()}
                  className="text-xs truncate flex-1 text-left hover:text-foreground"
                >
                  {photoName}
                </button>
                <button
                  type="button"
                  className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={clearPhoto}
                  aria-label="Clear photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ) : (
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search patients, appointments, bills…"
            className="pl-8 pr-16 w-64 bg-transparent border-0 focus-visible:ring-0"
            value={term}
            onFocus={() => { setTouched(true); setOpen(true); }}
            onChange={(e) => { setTouched(true); setTerm(e.target.value); setOpen(true); }}
            onKeyDown={onKeyDown}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
            {term && (
              <button type="button" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => { setTerm(""); forgetLastSearch(); inputRef.current?.focus(); }} aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <MicButton
              value={term}
              onChange={(v) => { setTouched(true); setTerm(v); setOpen(true); }}
              mode="replace"
              title="Speak to search"
            />
          </div>
        </div>
        )}
      </div>

      {showSuggestions && recents.length > 0 && (
        <div className="absolute z-50 mt-1 w-[28rem] rounded-lg border bg-popover shadow-lg p-1">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Recent searches</p>
          {recents.map((r) => (
            <button
              key={r}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-accent/60"
              onClick={() => { setTouched(true); setTerm(r); inputRef.current?.focus(); }}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {r}
            </button>
          ))}
        </div>
      )}

      {open && (photoMode ? Boolean(photoName) : term.trim().length >= 2) && (
        <div className="absolute z-50 mt-1 w-[28rem] max-h-[70vh] overflow-y-auto rounded-lg border bg-popover shadow-lg p-1">
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            {loading
              ? photoMode ? "Matching photo…" : "Searching…"
              : photoMode ? "Patients with this photo" : `Top results for “${term.trim()}”`}
          </p>
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {photoMode ? "Matching photo…" : "Searching…"}
            </div>
          )}
          {!loading && photoError && (
            <p className="px-3 py-4 text-xs text-muted-foreground">{photoError}</p>
          )}
          {!loading && !photoError && results.length === 0 && (
            photoMode ? (
              /* Said plainly, because all three are real reasons and the front
                 desk should not have to guess which one they have hit. */
              <div className="px-3 py-3 text-xs text-muted-foreground space-y-1.5">
                <p>No patient record holds this photo.</p>
                <p className="text-[11px]">
                  This finds the same photograph again, through resizing or WhatsApp.
                  A fresh photo of a patient will not match, and neither will a cropped one.
                </p>
                <p className="text-[11px]">
                  Older photos are still being fingerprinted — Settings → Photo fingerprints.
                </p>
              </div>
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground">No matches for “{term}”</p>
            )
          )}
          {grouped.map(([kind, items]) => {
            const Meta = KIND_META[kind];
            const Icon = Meta.icon;
            return (
              <div key={kind} className="py-1">
                <div className="flex items-center justify-between px-3 py-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{Meta.label}</p>
                  {kind !== "photo" && (
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                      onClick={() => viewAll(kind)}
                    >
                      View more <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {items.map((r) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  return (
                    <button
                      key={`${kind}-${r.id}`}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => go(r)}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-2 rounded-md text-left transition-colors",
                        idx === activeIndex ? "bg-accent" : "hover:bg-accent/60"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm truncate">{r.title}</span>
                        <span className="block text-xs text-muted-foreground truncate">{r.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
