import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AudienceConfig,
  AudienceSegment,
  COMBINATOR_LABELS,
  Combinator,
  invokeJourneyActions,
} from "@/lib/comms/journeys";

export function usePatientViews() {
  return useQuery({
    queryKey: ["comms-patient-list-views"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("list_views")
        .select("id, name")
        .eq("section", "patients")
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
  });
}

type Preview = { per_segment: Record<string, number>; total: number; without_phone: number };

type PreviewFn = (config: AudienceConfig) => Promise<{ per_segment: Record<string, number>; total: number; skipped: number }>;

export function AudienceBuilder({
  value,
  onChange,
  previewAction,
  contactNoun = "with a valid phone",
}: {
  value: AudienceConfig | null;
  onChange: (config: AudienceConfig | null) => void;
  /** Override how the live count is fetched (defaults to the journey audience preview). */
  previewAction?: PreviewFn;
  contactNoun?: string;
}) {
  const { data: views = [], isLoading } = usePatientViews();
  const segments = value?.segments ?? [];
  const combinator: Combinator = value?.combinator ?? "union";
  const primary = value?.primary ?? "A";

  const emit = (next: AudienceSegment[], c: Combinator = combinator, p: "A" | "B" = primary) =>
    onChange(next.length ? { segments: next, combinator: c, primary: p } : null);

  const setSegmentView = (index: number, viewId: string) => {
    const view = views.find((v) => v.id === viewId);
    const key = index === 0 ? "A" : "B";
    const next = [...segments];
    next[index] = { key, label: view?.name ?? "", list_view_id: viewId, entity_type: "patients" };
    emit(viewId ? next : next.slice(0, index));
  };

  const addSegment = () =>
    emit([...segments, { key: "B", label: "", list_view_id: "", entity_type: "patients" }]);

  const ready = segments.length > 0 && segments.every((s) => s.list_view_id);
  const previewKey = useMemo(() => (ready ? JSON.stringify(value) : ""), [ready, value]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!previewKey) return;
    setLoadingPreview(true);
    const timer = setTimeout(async () => {
      try {
        if (previewAction) {
          const r = await previewAction(value!);
          setPreview({ per_segment: r.per_segment, total: r.total, without_phone: r.skipped });
        } else {
          setPreview(await invokeJourneyActions<Preview>({ action: "audience-preview", audience_config: value }));
        }
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "Preview failed");
      } finally {
        setLoadingPreview(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const options = views.map((v) => ({ id: v.id, name: v.name }));
  const rows = segments.length === 0 ? [null] : segments.length === 1 && ready ? [...segments] : segments;

  return (
    <div className="space-y-3">
      <Label>Audience Segments</Label>
      <div className="space-y-2 rounded-lg border p-3">
        {rows.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <Badge variant="outline" className="w-8 justify-center font-mono">{i === 0 ? "A" : "B"}</Badge>
            <Select value="patients" disabled={false}>
              <SelectTrigger className="w-36 shrink-0"><SelectValue placeholder="Object..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="patients">Patients</SelectItem>
              </SelectContent>
            </Select>
            <div className="min-w-0 flex-1">
              <SearchableSelect
                value={seg?.list_view_id ?? ""}
                onChange={(id) => setSegmentView(i, id)}
                options={options}
                placeholder={isLoading ? "Loading views…" : "Select a patient view"}
                searchPlaceholder="Search views…"
                emptyText="No saved patient views yet"
              />
            </div>
            {i === 1 && (
              <Button type="button" variant="ghost" size="icon" onClick={() => emit(segments.slice(0, 1))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {ready && segments.length === 1 && (
          <Button type="button" variant="outline" size="sm" onClick={addSegment}>
            <Plus className="mr-1 h-4 w-4" /> Add segment
          </Button>
        )}

        {segments.length === 2 && ready && (
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs">Combine using</Label>
            <RadioGroup value={combinator} onValueChange={(v) => emit(segments, v as Combinator)} className="gap-1.5">
              {(Object.keys(COMBINATOR_LABELS) as Combinator[]).map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <RadioGroupItem value={c} id={`comb-${c}`} />
                  <Label htmlFor={`comb-${c}`} className="text-sm font-normal">{COMBINATOR_LABELS[c]}</Label>
                </div>
              ))}
            </RadioGroup>
            {combinator === "difference" && (
              <div className="flex items-center gap-2 text-sm">
                <span>Keep patients from</span>
                <Select value={primary} onValueChange={(v) => emit(segments, combinator, v as "A" | "B")}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>

      {ready && (
        <div className="rounded-md bg-muted/60 p-3 text-sm">
          {loadingPreview ? (
            <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Counting audience…</span>
          ) : previewError ? (
            <span className="text-destructive">{previewError}</span>
          ) : preview ? (
            <div className="space-y-0.5">
              {segments.map((s) => (
                <p key={s.key} className="text-muted-foreground">{s.key}: {s.label} — {preview.per_segment[s.key] ?? 0} patients</p>
              ))}
              <p className="font-medium">
                Final audience: {preview.total} patient{preview.total === 1 ? "" : "s"} {contactNoun}
                {preview.without_phone > 0 && <span className="font-normal text-muted-foreground"> ({preview.without_phone} skipped)</span>}
              </p>
            </div>
          ) : null}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Segments use Patients saved views. Final audience is deduplicated — each patient receives the journey only once.
      </p>
      <a href="/patients" target="_blank" rel="noreferrer" className="inline-flex items-center text-sm text-primary hover:underline">
        Manage list views <ExternalLink className="ml-1 h-3.5 w-3.5" />
      </a>
    </div>
  );
}
