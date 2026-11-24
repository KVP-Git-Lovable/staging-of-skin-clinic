import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Copy, Printer, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ageInYears, matchesDemographics, targetLabel } from "@/lib/knowledge";
import { useKnowledgeCategories, useKnowledgeStats } from "@/hooks/useKnowledge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArticleContent } from "./ArticleContent";
import { ArticleEngagement, EngagementMeter } from "./ArticleEngagement";
import { PatientSummary } from "./PatientSummary";
import { patientSummaryIsPublic } from "@/lib/patientSummary";
import { printPatientHandout } from "@/lib/patientHandout";
import { reserveTab } from "@/lib/newTab";
import { Link } from "react-router-dom";

interface Props { patientId: string; serviceIds?: (string | null)[]; serviceNames?: string[]; onCopyCare?: (text: string, serviceId: string) => void; }
export function ClinicalGuidelines({ patientId, serviceIds = [], serviceNames = [], onCopyCare }: Props) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  /** Per article, so one open guideline can be shown to the patient while
   *  the others stay clinical. Resets on close, like `opened`. */
  const [patientView, setPatientView] = useState<Set<string>>(new Set());
  const ids = [...new Set(serviceIds.filter((id): id is string => !!id))].sort();
  const names = [...new Set(serviceNames.filter(Boolean).map((s) => s.trim()))].sort();
  const { data: categories = [] } = useKnowledgeCategories();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["knowledge", "match", patientId, ids, names], enabled: !!patientId, queryFn: async () => {
    const { data: patient, error: patientError } = await supabase.from("patients").select("date_of_birth,gender").eq("id", patientId).single();
    if (patientError) throw patientError;
    const resolved = new Set(ids);
    if (names.length) {
      const { data: services, error } = await supabase.from("services").select("id").in("name", names);
      if (error) throw error;
      services?.forEach((s) => resolved.add(s.id));
    }
    if (!resolved.size) return { articles: [], age: ageInYears(patient.date_of_birth), gender: patient.gender };
    const { data: articles, error } = await supabase.from("knowledge_articles").select("*").in("service_id", [...resolved]).is("deleted_at", null).eq("status", "published").eq("is_active", true).order("is_critical", { ascending: false }).order("title");
    if (error) throw error;
    const age = ageInYears(patient.date_of_birth);
    return { articles: (articles || []).filter((a) => matchesDemographics(a, age, patient.gender)), age, gender: patient.gender };
  }});
  const matches = data?.articles.filter((a) => categories.some((c) => c.id === a.category_id && c.is_active)) || [];
  const { data: stats = [] } = useKnowledgeStats(matches.map((a) => a.id));
  return <section className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
    <h2 className="font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />Clinical Guidelines <Badge variant="secondary">{matches.length}</Badge></h2>
    {isLoading ? <p className="text-sm text-muted-foreground">Loading guidelines…</p> : error ? <div><p className="text-sm text-destructive">{error.message}</p><Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button></div> : <>
      {(data?.age === null || !data?.gender) && <p className="text-xs text-warning">Patient age or gender is not recorded. Only eligible general guidelines are shown.</p>}
      {matches.some((a) => a.is_critical) && <div role="alert" className="border-l-4 border-destructive bg-destructive/10 p-3 text-sm"><p className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Critical safety review</p>{matches.filter((a) => a.is_critical).map((a) => <p key={a.id} className="mt-1">{a.title} — {a.summary}</p>)}</div>}
      {!matches.length && <p className="text-sm text-muted-foreground">No published guidelines match this service and patient.</p>}
      <div className="grid gap-4">
        {matches.map((a) => {
          const addCare = ids.includes(a.service_id) ? onCopyCare : undefined;
          return <details key={a.id} className="min-w-0 rounded-lg border bg-card p-4 text-card-foreground" onToggle={(e) => { const open = e.currentTarget.open; setOpened((previous) => { const next = new Set(previous); if (open) next.add(a.id); else next.delete(a.id); return next; }); }}>
            <summary className="cursor-pointer font-medium text-sm break-words">{a.title}{a.is_critical && <Badge variant="destructive" className="ml-2">Critical</Badge>}</summary>
            <p className="mt-2 text-xs text-muted-foreground">{categories.find((c) => c.id === a.category_id)?.name} · {targetLabel(a)}</p>
            {a.summary && <p className="mt-2 text-sm break-words">{a.summary}</p>}
            <div className="mt-2"><EngagementMeter stats={stats.find((s) => s.article_id === a.id)} /></div>
            {opened.has(a.id) && <div className="space-y-4 mt-3">
              <Button asChild size="sm" variant="link" className="p-0 h-auto"><Link to={`/knowledge/${a.id}`}>Open in Knowledge Master</Link></Button>
              {/* The patient's own words, for turning the screen round mid-consult.
                  Only offered where there is one: every article here is already
                  published and active, which patientSummaryIsPublic re-checks
                  rather than assuming from this panel's query. */}
              {patientSummaryIsPublic(a) && <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={patientView.has(a.id) ? "default" : "outline"} data-testid="patient-view-toggle" onClick={() => setPatientView((previous) => { const next = new Set(previous); if (next.has(a.id)) next.delete(a.id); else next.add(a.id); return next; })}>
                  <Users className="h-3.5 w-3.5 mr-2" />{patientView.has(a.id) ? "Show clinical view" : "Show patient view"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  // reserveTab FIRST, in the click itself - see src/lib/newTab.ts.
                  const tab = reserveTab();
                  void printPatientHandout(a, { serviceName: a.title }, tab).catch((e) => toast.error((e as Error).message));
                }}><Printer className="h-3.5 w-3.5 mr-2" />Print handout</Button>
              </div>}
              {patientView.has(a.id) ? <PatientSummary article={a} /> : <ArticleContent article={a} />}
              {a.pre_post_care && <Button size="sm" variant="outline" onClick={async () => {
                try { if (addCare) { addCare(a.pre_post_care, a.service_id); toast.success("Care added to prescription notes. Review before saving."); } else { await navigator.clipboard.writeText(a.pre_post_care); toast.success("Care instructions copied"); } } catch { toast.error("Could not copy care instructions"); }
              }}><Copy className="h-3.5 w-3.5 mr-2" />{addCare ? "Add care to prescription notes" : "Copy care instructions"}</Button>}
              <ArticleEngagement articleId={a.id} />
            </div>}
          </details>;
        })}
      </div>
    </>}
  </section>;
}