import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Check, Info, Loader2, Plus, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { OPERATORS, type FilterCondition } from "@/lib/listViews/engine";
import { PATIENT_FIELDS, SOURCE_OPTIONS, applyFilters, fieldDef } from "@/lib/patientFields";
import { fetchAll } from "@/lib/supabasePaginate";
import {
  approveRun, DEFAULT_AGENT_SETTINGS, formatIstStart, planPrompt, rejectRun, saveAgentSettings,
  type AgentCheck, type AgentSettings, type ApproveResponse, type JourneyPlan, type MetaPlan, type PlanResponse,
} from "@/lib/comms/agent";

/* Fields the agent and the table filter on. Same list the server accepts. */
const FILTER_FIELD_KEYS = [
  "city", "state", "gender", "age", "date_of_birth", "status", "skin_type", "source", "total_visits", "lifetime_value",
  "last_visit_date", "days_since_last_visit", "engagement_score", "engagement_tier", "registered_at", "created_at",
];
const FILTER_FIELDS = PATIENT_FIELDS.filter((f) => FILTER_FIELD_KEYS.includes(f.key));
const FIXED_OPTIONS: Record<string, string[]> = {
  gender: ["Male", "Female", "Other"],
  status: ["Active", "Inactive"],
  skin_type: ["Normal", "Dry", "Oily", "Combination", "Sensitive"],
  engagement_tier: ["Platinum", "Gold", "Silver", "Early"],
  source: SOURCE_OPTIONS.map((o) => o.value),
};
const NO_VALUE_OPS = ["is_empty", "is_not_empty", "today", "yesterday", "tomorrow", "this_week", "last_week", "next_week", "this_month", "last_month", "next_month", "this_quarter", "last_quarter", "next_quarter", "this_year", "last_year", "next_year"];

const COLUMNS = "id, first_name, last_name, city, state, gender, date_of_birth, status, skin_type, source, engagement_tier, engagement_score, lifetime_value, total_visits, last_visit_date, days_since_last_visit, registered_at, created_at";
type PatientRow = Record<string, unknown> & { id: string; first_name: string | null; last_name: string | null; lifetime_value: number | null; total_visits: number | null };

const EXAMPLES = [
  { label: "Welcome offer to new patients", text: "Create a Journey where I can send the WhatsApp template 'skin_welcome_offer' to those Patients who were created since 15th March 2026, and start sending them a message from next Monday" },
  { label: "Win back Gold and Platinum", text: "Send 'skin_followup_reminder' to Gold and Platinum patients who haven't visited in 90 days, starting tomorrow" },
  { label: "Meta ad draft", text: "Run a Meta lead campaign for Hydrafacial in Bengaluru with ₹500 a day" },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-IN");
const patientName = (p: { first_name: string | null; last_name: string | null }) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";

function checkIcon(level: AgentCheck["level"]) {
  if (level === "ok") return <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"><Check className="h-3 w-3" /></span>;
  if (level === "bad") return <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"><X className="h-3 w-3" /></span>;
  if (level === "warn") return <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"><TriangleAlert className="h-3 w-3" /></span>;
  return <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Info className="h-3 w-3" /></span>;
}

function describeFilter(c: FilterCondition): string {
  const label = fieldDef(c.field)?.label ?? c.field;
  const vals = c.values?.length ? c.values.join(" or ") : c.value;
  const rng = c.value2 ? ` and ${c.value2}` : "";
  return `${label} ${c.operator.replace(/_/g, " ")} ${vals ?? ""}${rng}`.trim();
}

/* ------------------------------ filter row ------------------------------ */

function FilterRow({ c, onChange, onRemove }: { c: FilterCondition; onChange: (n: FilterCondition) => void; onRemove: () => void }) {
  const def = fieldDef(c.field);
  const type = def?.type ?? "text";
  const ops = OPERATORS[type];
  const needsValue = !NO_VALUE_OPS.includes(c.operator);
  const options = FIXED_OPTIONS[c.field];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={c.field} onValueChange={(f) => { const d = fieldDef(f); onChange({ field: f, operator: OPERATORS[d?.type ?? "text"][0].value, value: "" }); }}>
        <SelectTrigger className="h-8 w-[170px]" aria-label="Field"><SelectValue /></SelectTrigger>
        <SelectContent>{FILTER_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={c.operator} onValueChange={(op) => onChange({ ...c, operator: op, values: undefined })}>
        <SelectTrigger className="h-8 w-[170px]" aria-label="Operator"><SelectValue /></SelectTrigger>
        <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {needsValue && (
        c.operator === "in" ? (
          <Input className="h-8 w-[200px]" aria-label="Values" placeholder="Gold, Platinum" value={(c.values ?? []).join(", ")}
            onChange={(e) => onChange({ ...c, values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
        ) : options && (c.operator === "equals" || c.operator === "not_equals") ? (
          <Select value={c.value || undefined} onValueChange={(v) => onChange({ ...c, value: v })}>
            <SelectTrigger className="h-8 w-[160px]" aria-label="Value"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input className="h-8 w-[150px]" aria-label="Value" type={type === "date" && c.operator !== "last_n_days" && c.operator !== "next_n_days" ? "date" : type === "number" || c.operator.endsWith("_n_days") ? "number" : "text"}
            value={c.value ?? ""} onChange={(e) => onChange({ ...c, value: e.target.value })} />
        )
      )}
      {c.operator === "between" && (
        <Input className="h-8 w-[150px]" aria-label="To" type={type === "date" ? "date" : "number"} value={c.value2 ?? ""} onChange={(e) => onChange({ ...c, value2: e.target.value })} />
      )}
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove} aria-label="Remove filter"><X className="h-4 w-4" /></Button>
    </div>
  );
}

/* -------------------------------- plan card ------------------------------- */

function FlowNode({ title, body, tone }: { title: string; body: string; tone?: "msg" }) {
  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2 text-xs ${tone === "msg" ? "border-primary bg-primary/10" : "bg-muted/40"}`}>
      <div className="font-semibold">{title}</div>
      <div className="break-words text-muted-foreground">{body}</div>
    </div>
  );
}

function PlanCard({ run, onDone, onEdit }: { run: PlanResponse; onDone: (r: ApproveResponse | null) => void; onEdit: () => void }) {
  const plan = run.plan;
  const [confirmCap, setConfirmCap] = useState(false);
  const approve = useMutation({
    mutationFn: () => approveRun(run.run_id, confirmCap),
    onSuccess: (r) => onDone(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: () => rejectRun(run.run_id),
    onSuccess: () => { toast.success("Plan discarded"); onDone(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (plan.kind === "question") {
    return <div className="rounded-lg bg-muted p-3 text-sm">{plan.question}</div>;
  }
  const blocked = plan.blocked;
  const needsCap = plan.kind === "journey" && plan.needs_second_confirmation;
  const busy = approve.isPending || reject.isPending;

  return (
    <div className={`space-y-4 rounded-lg border p-4 ${blocked ? "border-destructive" : "border-primary"}`}>
      {plan.kind === "journey" ? <JourneyDetails plan={plan} /> : <MetaDetails plan={plan} />}
      <div>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Checks</h3>
        <ul className="space-y-1.5">
          {plan.checks.map((c, i) => <li key={i} className="flex items-start gap-2 text-sm">{checkIcon(c.level)}<span>{c.message}</span></li>)}
        </ul>
      </div>
      {needsCap && !blocked && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={confirmCap} onCheckedChange={(v) => setConfirmCap(v === true)} /> I confirm sending to this larger audience
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={blocked || busy || (needsCap && !confirmCap)} onClick={() => approve.mutate()}>
          {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {plan.kind === "journey" ? "Create draft journey" : "Create campaign draft"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onEdit}>Edit prompt</Button>
        <Button variant="ghost" disabled={busy} onClick={() => reject.mutate()}>Discard</Button>
      </div>
    </div>
  );
}

function JourneyDetails({ plan }: { plan: JourneyPlan }) {
  return (
    <>
      <div>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Journey to create</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <FlowNode title="Audience" body={`${num(plan.audience.reachable)} patients`} />
          <FlowNode title="Starts" body={formatIstStart(plan.start_iso)} />
          <FlowNode title="WhatsApp" body={plan.template?.name ?? plan.template_name} tone="msg" />
          <FlowNode title="End" body="Journey completes" />
        </div>
      </div>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Name</dt><dd>{plan.journey_name}</dd>
        <dt className="text-muted-foreground">Audience</dt><dd>{plan.filters_text.join(" and ") || "All patients"}</dd>
        {plan.template && <><dt className="text-muted-foreground">Message</dt><dd>“{plan.template.body}”</dd></>}
        <dt className="text-muted-foreground">Estimated cost</dt><dd>{inr(plan.cost_estimate)} <span className="text-xs text-muted-foreground">(estimate)</span></dd>
        <dt className="text-muted-foreground">Sample</dt>
        <dd className="flex flex-wrap gap-1.5">{plan.sample.length ? plan.sample.map((s) => <span key={s} className="rounded bg-muted px-2 py-0.5 text-xs">{s}</span>) : "—"}</dd>
      </dl>
    </>
  );
}

function MetaDetails({ plan }: { plan: MetaPlan }) {
  return (
    <>
      <div>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Meta campaign draft</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <FlowNode title="Objective" body={plan.objective} />
          <FlowNode title="Location" body={plan.city} />
          <FlowNode title="Budget" body={`₹${num(plan.daily_budget_inr)} per day`} tone="msg" />
        </div>
      </div>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Name</dt><dd>{plan.campaign_name}</dd>
        <dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline">Draft, not published</Badge></dd>
        <dt className="text-muted-foreground">Next steps</dt><dd>Add the ad set and ad on the Meta Campaigns pages, then publish when ready.</dd>
      </dl>
    </>
  );
}

/* ------------------------------- run history ------------------------------ */

type RunRow = {
  id: string; prompt: string; status: string; created_at: string; journey_id: string | null; campaign_id: string | null;
  plan: { kind?: string; audience?: { reachable?: number } } | null;
  creator: { first_name: string | null; last_name: string | null } | null;
};

function RunHistory() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, prompt, status, created_at, journey_id, campaign_id, plan, creator:staff!agent_runs_created_by_fkey(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as RunRow[];
    },
  });
  if (isLoading) return <Skeleton className="h-24" />;
  if (error) return <p className="text-sm text-destructive">Could not load runs: {(error as Error).message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No plans yet. Describe a campaign on the Compose tab.</p>;
  const tone: Record<string, string> = { approved: "bg-success/10 text-success", planned: "bg-primary/10 text-primary", rejected: "bg-destructive/10 text-destructive", failed: "bg-destructive/10 text-destructive" };
  return (
    <div className="space-y-2">
      {data.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-1.5 py-3">
            <p className="text-sm">“{r.prompt}”</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge className={tone[r.status] ?? ""} variant="outline">{r.status === "approved" ? "Draft created" : r.status === "planned" ? "Planned" : r.status}</Badge>
              <span>{r.plan?.kind === "meta" ? "Meta ad" : r.plan?.kind === "journey" ? "Journey" : "Question"}</span>
              <span>{format(new Date(r.created_at), "d MMM yyyy, h:mm a")}</span>
              {r.creator && <span>by {patientName(r.creator)}</span>}
              {r.plan?.audience?.reachable !== undefined && <span>{num(r.plan.audience.reachable)} recipients</span>}
              {r.journey_id && <Link className="text-primary hover:underline" to={`/communications/journeys/${r.journey_id}`}>Open journey</Link>}
              {r.campaign_id && <Link className="text-primary hover:underline" to="/communications/meta/campaigns">Open campaigns</Link>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------- guardrails ------------------------------ */

function Guardrails() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["agent-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("comms_agent_settings").select("*").limit(1).maybeSingle();
      return { ...DEFAULT_AGENT_SETTINGS, ...(data ?? {}) } as AgentSettings;
    },
  });
  const [draft, setDraft] = useState<Partial<AgentSettings>>({});
  const value = { ...DEFAULT_AGENT_SETTINGS, ...data, ...draft } as AgentSettings;
  const save = useMutation({
    mutationFn: () => saveAgentSettings(value),
    onSuccess: () => { toast.success("Guardrails saved"); setDraft({}); qc.invalidateQueries({ queryKey: ["agent-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const field = (k: keyof AgentSettings, label: string, hint: string, step = "1") => (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div><Label htmlFor={`g-${k}`}>{label}</Label><p className="text-xs text-muted-foreground">{hint}</p></div>
      <Input id={`g-${k}`} className="w-28" type="number" step={step} value={value[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Limits</CardTitle></CardHeader>
        <CardContent>
          {field("audience_cap", "Maximum audience per run", "Larger audiences need a second confirmation.")}
          {field("send_window_start", "Send window starts (hour, IST)", "Messages can only be scheduled at or after this hour.")}
          {field("send_window_end", "Send window ends (hour, IST)", "Messages can only be scheduled before this hour.")}
          {field("ad_spend_cap", "Daily ad spend cap (₹)", "Ad drafts above this are refused.")}
          {field("cost_per_message", "Estimated cost per message (₹)", "Used only for the estimate on a plan.", "0.05")}
          <div className="pt-3"><Button onClick={() => save.mutate()} disabled={save.isPending || Object.keys(draft).length === 0}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Always on</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><b>Drafts only.</b> The agent creates a draft journey or a local campaign draft. It never activates, publishes, sends or spends.</p>
          <p><b>Another set of eyes.</b> A draft journey still goes through Submit for Approval, then Activate, in Journey Builder.</p>
          <p><b>Opted-out patients</b> and patients without a usable phone number are left out of every audience.</p>
          <p><b>Only approved WhatsApp templates</b> can be used, and every variable must have a patient value chosen.</p>
          <p><b>What the AI sees:</b> your prompt, field names, template names and today's date. Never patient names or phone numbers.</p>
          <p><b>Who can use it:</b> admins and managers.</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function AgenticMarketing() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [prompt, setPrompt] = useState("");
  const [run, setRun] = useState<PlanResponse | null>(null);
  const [created, setCreated] = useState<ApproveResponse | null>(null);
  const [limit, setLimit] = useState(10);

  const { data: patients, isLoading } = useQuery({
    queryKey: ["agentic-patients"],
    staleTime: 5 * 60_000,
    queryFn: () => fetchAll<PatientRow>((from, to) => supabase.from("patients").select(COLUMNS).order("id").range(from, to)),
  });

  const rows = useMemo(
    () => (patients ? applyFilters(patients, { match: "all", conditions: filters.filter((c) => c.field && c.operator) }) : []),
    [patients, filters],
  );
  const kpis = useMemo(() => {
    const active = rows.filter((r) => typeof r.days_since_last_visit === "number");
    return {
      revenue: rows.reduce((s, r) => s + Number(r.lifetime_value ?? 0), 0),
      purchases: rows.reduce((s, r) => s + Number(r.total_visits ?? 0), 0),
      avgDays: active.length ? active.reduce((s, r) => s + Number(r.days_since_last_visit), 0) / active.length : null,
    };
  }, [rows]);

  const plan = useMutation({
    mutationFn: () => planPrompt(prompt.trim(), filters.filter((c) => c.field && c.operator)),
    onMutate: () => { setRun(null); setCreated(null); },
    onSuccess: (r) => { setRun(r); qc.invalidateQueries({ queryKey: ["agent-runs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFilter = () => setFilters([...filters, { field: "created_at", operator: "after", value: "" }]);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/communications/whatsapp"><ArrowLeft className="mr-2 h-4 w-4" /> Communications Center</Link>
      </Button>
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight md:text-2xl"><Sparkles className="h-6 w-6 text-primary" /> Agentic Marketing</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose who to reach, filter them by revenue, purchases and dates, then describe the campaign in plain words. The agent drafts it.
          You approve before anything is created, and a draft journey still needs the usual approval before it can run.
        </p>
      </div>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="runs">Run history</TabsTrigger>
          <TabsTrigger value="rules">Guardrails</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">1. Object</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed="true" className="min-w-[150px] flex-1 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-left">
                    <b className="block text-sm">Patients</b><span className="text-xs text-muted-foreground">{patients ? `${num(patients.length)} records` : "Loading…"}</span>
                  </button>
                  <div className="min-w-[150px] flex-1 rounded-lg border border-dashed px-3 py-2 text-muted-foreground"><b className="block text-sm">Leads</b><span className="text-xs">Coming later</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">2. Filter</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-live="polite">
                    {[
                      ["Matching", isLoading ? "…" : num(rows.length)],
                      ["Revenue generated", isLoading ? "…" : inr(kpis.revenue)],
                      ["Total purchases", isLoading ? "…" : num(kpis.purchases)],
                      ["Avg days since last visit", isLoading || kpis.avgDays === null ? "—" : num(kpis.avgDays)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-muted/50 px-3 py-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="text-lg font-semibold tabular-nums">{value}</div></div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {filters.length === 0 && <p className="text-xs text-muted-foreground">No filters: every patient is included.</p>}
                    {filters.map((c, i) => (
                      <FilterRow key={i} c={c} onChange={(n) => setFilters(filters.map((x, j) => (j === i ? n : x)))} onRemove={() => setFilters(filters.filter((_, j) => j !== i))} />
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={addFilter}><Plus className="mr-1 h-3.5 w-3.5" /> Add filter</Button>
                      {filters.length > 0 && <Button size="sm" variant="ghost" onClick={() => setFilters([])}>Clear</Button>}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead><TableHead>City</TableHead><TableHead>Tier</TableHead>
                          <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Purchases</TableHead>
                          <TableHead>Active since</TableHead><TableHead className="text-right">Days since visit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          <TableRow><TableCell colSpan={7}><Skeleton className="h-6" /></TableCell></TableRow>
                        ) : rows.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-muted-foreground">No patients match these filters.</TableCell></TableRow>
                        ) : rows.slice(0, limit).map((r) => {
                          const since = (r.registered_at ?? r.created_at) as string | null;
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="whitespace-nowrap">{patientName(r)}</TableCell>
                              <TableCell>{(r.city as string) || "—"}</TableCell>
                              <TableCell>{(r.engagement_tier as string) || "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{inr(Number(r.lifetime_value ?? 0))}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(Number(r.total_visits ?? 0))}</TableCell>
                              <TableCell className="whitespace-nowrap">{since ? format(new Date(since), "d MMM yyyy") : "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{typeof r.days_since_last_visit === "number" ? r.days_since_last_visit : "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Showing {Math.min(limit, rows.length)} of {num(rows.length)}</span>
                    {rows.length > limit && <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 15)}>Show more</Button>}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">3. Tell the agent what to do</CardTitle>
                    <Badge variant="outline">Patients: {isLoading ? "…" : num(rows.length)} selected</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Label htmlFor="agent-prompt" className="text-xs text-muted-foreground">The agent works on the patients matching your filters, plus anything you say here.</Label>
                  <Textarea id="agent-prompt" rows={5} maxLength={1500} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Create a Journey that sends the WhatsApp template 'skin_welcome_offer' to Patients created since 15th March 2026, starting next Monday" />
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLES.map((e) => <button key={e.label} type="button" className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs hover:border-primary" onClick={() => setPrompt(e.text)}>{e.label}</button>)}
                  </div>
                  <Button onClick={() => plan.mutate()} disabled={plan.isPending || prompt.trim().length < 5}>
                    {plan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {plan.isPending ? "Planning…" : "Plan with agent"}
                  </Button>
                </CardContent>
              </Card>

              {(plan.isPending || run || created) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">4. Agent plan</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {plan.isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading your prompt and checking it against your data…</p>}
                    {run && !created && (
                      <>
                        {run.tool_calls.length > 0 && (
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {run.tool_calls.map((t, i) => (
                              <li key={i}>Called <code className="rounded bg-muted px-1">{t.name}</code>{t.error ? <span className="text-destructive"> — {t.error}</span> : null}</li>
                            ))}
                          </ul>
                        )}
                        <PlanCard run={run} onEdit={() => document.getElementById("agent-prompt")?.focus()}
                          onDone={(r) => { setCreated(r); if (!r) setRun(null); qc.invalidateQueries({ queryKey: ["agent-runs"] }); }} />
                      </>
                    )}
                    {created && (
                      <div className="space-y-2 rounded-lg bg-success/10 p-3 text-sm">
                        <p className="font-semibold">{created.kind === "journey" ? "Draft journey created" : "Campaign draft created"}</p>
                        {created.kind === "journey" ? (
                          <ol className="list-decimal space-y-1 pl-5">
                            <li>Open it in Journey Builder to review the steps and audience.</li>
                            <li>Use Submit for Approval. An admin or manager approves it.</li>
                            <li>After approval it can be activated. Nothing is sent before that.</li>
                          </ol>
                        ) : (
                          <ol className="list-decimal space-y-1 pl-5">
                            <li>Open Meta › Campaigns to review the draft and add the ad set and ad.</li>
                            <li>An admin or manager publishes it when ready. Nothing is published or spent now.</li>
                          </ol>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button asChild size="sm"><Link to={created.kind === "journey" ? `/communications/journeys/${created.journey_id}` : "/communications/meta/campaigns"}>{created.kind === "journey" ? "Open journey" : "Open campaigns"}</Link></Button>
                          <Button size="sm" variant="outline" onClick={() => { setCreated(null); setRun(null); setPrompt(""); }}>Start another</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-4"><RunHistory /></TabsContent>
        <TabsContent value="rules" className="mt-4"><Guardrails /></TabsContent>
      </Tabs>
    </div>
  );
}
