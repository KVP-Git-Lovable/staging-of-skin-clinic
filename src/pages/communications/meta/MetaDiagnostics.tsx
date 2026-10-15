import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BackButton } from "@/components/shared/BackButton";
import { toast } from "@/hooks/use-toast";
import { CONNECTION_COLUMNS, PAGE_COLUMNS } from "@/lib/metaColumns";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Loader2, PlayCircle, RefreshCw, Trash2, XCircle,
} from "lucide-react";

type TestResult = {
  category: string;
  name: string;
  status: "success" | "failed";
  http_method: string;
  endpoint: string;
  http_status: number | null;
  duration_ms: number;
  records_returned: number | null;
  meta_error_code: string | null;
  meta_error_subcode: string | null;
  meta_error_message: string | null;
  fbtrace_id: string | null;
  fields: string | null;
  sample: unknown;
  ranAt?: string;
};

const CATEGORIES = [
  { key: "account", label: "Ad Account", tests: ["Get basic Ad Account information", "Get currency and timezone", "Get account status", "Get spending information", "Get business information"] },
  { key: "campaigns", label: "Campaigns", tests: ["Get campaigns", "Get campaign status", "Get campaign objective", "Get campaign budgets", "Get campaign dates"] },
  { key: "adsets", label: "Ad Sets", tests: ["Get Ad Sets", "Get Ad Set budgets", "Get targeting", "Get schedule", "Get optimization/billing configuration"] },
  { key: "ads", label: "Ads", tests: ["Get Ads", "Get Ad to Ad Set relationship", "Get Ad to Campaign relationship", "Get Ad status", "Get Ad Creative information"] },
  { key: "creatives", label: "Ad Creatives", tests: ["Get creatives", "Get creative status", "Get object_story_spec", "Get asset_feed_spec", "Get thumbnail/creative information"] },
  { key: "insights", label: "Insights / Reporting", tests: ["Account-level insights", "Campaign-level insights", "Ad Set-level insights", "Ad-level insights", "Date-range insights"] },
] as const;

const TOTAL_TESTS = CATEGORIES.length * 5;

const fmtTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" }) : "—";

export default function MetaDiagnostics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [results, setResults] = useState<Record<string, TestResult[]>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [stats, setStats] = useState({ success: 0, failed: 0, last: null as string | null, last15: 0 });
  const [testMode, setTestMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<any[]>([]);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [pendingObjects, setPendingObjects] = useState(0);
  const [checks, setChecks] = useState<{ label: string; status: "ok" | "warn" | "fail"; detail: string }[]>([]);
  const [checkBusy, setCheckBusy] = useState(false);


  const loadConnection = useCallback(async () => {
    setLoading(true);
    const { data: c } = await supabase.from("social_connections").select(CONNECTION_COLUMNS).eq("platform", "meta").maybeSingle();
    setConn(c ?? null);
    if (c?.default_ad_account_id) {
      const { data: a } = await supabase
        .from("social_ad_accounts").select("*")
        .eq("connection_id", c.id).eq("ad_account_id", c.default_ad_account_id).maybeSingle();
      setAccount(a ?? null);
    } else {
      setAccount(null);
    }
    setLoading(false);
  }, []);

  const loadActivity = useCallback(async () => {
    const [{ data: rows }, { count: successCount }, { count: failedCount }, { data: lastOk }, { count: recent }] =
      await Promise.all([
        supabase.from("meta_api_diagnostics").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("meta_api_diagnostics").select("id", { count: "exact", head: true }).eq("status", "success"),
        supabase.from("meta_api_diagnostics").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("meta_api_diagnostics").select("created_at").eq("status", "success").order("created_at", { ascending: false }).limit(1),
        supabase.from("meta_api_diagnostics").select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 15 * 86400000).toISOString()),
      ]);
    setActivity(rows || []);
    setStats({
      success: successCount || 0,
      failed: failedCount || 0,
      last: lastOk?.[0]?.created_at ?? null,
      last15: recent || 0,
    });
    const { count: pending } = await supabase
      .from("meta_api_diagnostic_test_objects")
      .select("id", { count: "exact", head: true }).is("cleaned_up_at", null);
    setPendingObjects(pending || 0);
  }, []);

  useEffect(() => { loadConnection(); loadActivity(); }, [loadConnection, loadActivity]);

  const readError = async (error: any, data: any) => {
    if (data?.error) return data.error as string;
    try {
      const body = await error?.context?.json?.();
      if (body?.error) return body.error as string;
    } catch { /* ignore */ }
    return error?.message || "Something went wrong";
  };

  const runPublishingCheck = async () => {
    setCheckBusy(true);
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: "publishing_check", payload: {} },
    });
    setCheckBusy(false);
    if (error || data?.error) {
      toast({ title: "Check failed", description: await readError(error, data), variant: "destructive" });
      return;
    }
    setChecks(data.checks || []);
  };

  const runCategory = async (key: string) => {

    setRunning(key);
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: `diagnostic_${key}`, payload: {} },
    });
    setRunning(null);
    if (error || data?.error) {
      toast({ title: "Diagnostics failed", description: await readError(error, data), variant: "destructive" });
      return false;
    }
    const stamped: TestResult[] = (data.results || []).map((r: TestResult) => ({ ...r, ranAt: new Date().toISOString() }));
    setResults((prev) => ({ ...prev, [key]: stamped }));
    setLastRun(new Date().toISOString());
    return true;
  };

  const runAll = async () => {
    setRunningAll(true);
    setResults({});
    for (const cat of CATEGORIES) {
      const ok = await runCategory(cat.key);
      if (!ok) break;
    }
    setRunningAll(false);
    loadActivity();
  };

  const runOne = async (key: string) => {
    await runCategory(key);
    loadActivity();
  };

  const runLifecycle = async () => {
    setConfirmOpen(false);
    setLifecycleBusy(true);
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: "diagnostic_lifecycle_run", payload: {} },
    });
    setLifecycleBusy(false);
    if (error || data?.error) {
      toast({ title: "Lifecycle test failed", description: await readError(error, data), variant: "destructive" });
      return;
    }
    setLifecycle(data.steps || []);
    toast({ title: "Lifecycle test completed" });
    loadActivity();
  };

  const cleanup = async () => {
    setCleanupBusy(true);
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: "diagnostic_lifecycle_cleanup", payload: {} },
    });
    setCleanupBusy(false);
    if (error || data?.error) {
      toast({ title: "Cleanup failed", description: await readError(error, data), variant: "destructive" });
      return;
    }
    const failed = (data.cleaned || []).filter((c: any) => c.status === "failed").length;
    toast({
      title: "Cleanup finished",
      description: `${(data.cleaned || []).length - failed} removed${failed ? `, ${failed} could not be removed` : ""}`,
    });
    loadActivity();
  };

  const allResults = useMemo(() => Object.values(results).flat(), [results]);
  const passed = allResults.filter((r) => r.status === "success").length;
  const failed = allResults.filter((r) => r.status === "failed").length;
  const completed = allResults.length;
  const successRate = completed ? Math.round((passed / completed) * 1000) / 10 : 0;
  const activityRate = stats.success + stats.failed
    ? Math.round((stats.success / (stats.success + stats.failed)) * 10000) / 100
    : 0;

  const adAccountDisplay = conn?.default_ad_account_id
    ? conn.default_ad_account_id.startsWith("act_") ? conn.default_ad_account_id : `act_${conn.default_ad_account_id}`
    : "—";

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Meta API Diagnostics</h1>
        <p className="mt-1 text-muted-foreground">
          Test the connected Meta Ad Account and verify that this app can successfully communicate with the Meta Marketing API.
        </p>
      </div>

      {!conn && (
        <Card><CardContent className="space-y-4 py-10 text-center">
          <p className="text-muted-foreground">Meta is not connected. Please connect a Meta Business account before running diagnostics.</p>
          <Button onClick={() => navigate("/communications/meta/connection")}>Connect Meta</Button>
        </CardContent></Card>
      )}

      {conn && !conn.default_ad_account_id && (
        <Card><CardContent className="space-y-4 py-10 text-center">
          <p className="text-muted-foreground">No Meta Ad Account is configured. Please select an Ad Account in Meta Connection settings.</p>
          <Button onClick={() => navigate("/communications/meta/connection")}>Configure Meta</Button>
        </CardContent></Card>
      )}

      {conn && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Meta Connection</CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={loadConnection}>
              <RefreshCw className="h-4 w-4" /> Refresh Connection
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Status">
              <Badge variant={conn.status === "active" ? "default" : "secondary"}>
                {conn.status === "active" ? "Connected" : conn.status}
              </Badge>
            </Field>
            <Field label="Meta Business">{conn.business_name || "—"}</Field>
            <Field label="Facebook User">{conn.external_user_name || "—"}</Field>
            <Field label="Ad Account">{account?.name || "—"}</Field>
            <Field label="Ad Account ID"><span className="font-mono text-sm">{adAccountDisplay}</span></Field>
            <Field label="Currency">{account?.currency || "—"}</Field>
            <Field label="Timezone">{account?.timezone_name || "—"}</Field>
            <Field label="Account Status">{account?.account_status || "—"}</Field>
          </CardContent>
        </Card>
      )}

      {conn && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Publishing Check</CardTitle>
              <CardDescription>
                Confirms which Meta person the app is signed in as, what that person is allowed to do, and whether Meta
                is holding anything against the account. Reads only — nothing in Ads Manager is changed.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={runPublishingCheck} disabled={checkBusy}>
              {checkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Run Check
            </Button>
          </CardHeader>
          {checks.length > 0 && (
            <CardContent className="space-y-2">
              {checks.map((c, i) => (
                <div key={`${c.label}-${i}`} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                  {c.status === "ok"
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    : c.status === "warn"
                      ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                  <div className="min-w-0">
                    <p className="font-medium">{c.label}</p>
                    <p className="break-words text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {conn?.default_ad_account_id && (

        <>
          <Card>
            <CardHeader>
              <CardTitle>Marketing API Diagnostics</CardTitle>
              <CardDescription>Run live API tests against your connected Meta Ad Account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Button size="lg" className="gap-2" onClick={runAll} disabled={runningAll || !!running}>
                {runningAll ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                Run All Diagnostics
              </Button>

              {(runningAll || completed > 0) && (
                <div className="space-y-3">
                  <Progress value={(completed / TOTAL_TESTS) * 100} />
                  <p className="text-sm text-muted-foreground">{completed} / {TOTAL_TESTS} tests completed</p>
                </div>
              )}

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Tests" value={String(completed)} />
                <Stat label="Successful" value={String(passed)} tone="success" />
                <Stat label="Failed" value={String(failed)} tone={failed ? "danger" : undefined} />
                <Stat label="Success Rate" value={`${successRate}%`} />
              </div>
              <p className="text-xs text-muted-foreground">Last run: {fmtTime(lastRun)}</p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const rows = results[cat.key];
              const ok = rows?.filter((r) => r.status === "success").length ?? 0;
              const isRunning = running === cat.key;
              return (
                <Card key={cat.key}>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <StatusDot state={isRunning ? "running" : !rows ? "idle" : ok === rows.length ? "success" : "failed"} />
                      <div>
                        <CardTitle className="text-lg">{cat.label}</CardTitle>
                        <CardDescription>{rows ? `${ok}/${rows.length} passed` : `${cat.tests.length} tests`}</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => runOne(cat.key)} disabled={!!running || runningAll}>
                      {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Run Tests
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(rows ?? cat.tests.map((name) => null)).map((row, index) => {
                      const name = row?.name ?? cat.tests[index];
                      if (!row) {
                        return (
                          <div key={name} className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                            <StatusDot state="idle" /> {name} — not tested
                          </div>
                        );
                      }
                      return <TestRow key={`${name}-${index}`} row={row} />;
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Marketing API Activity</CardTitle>
              <CardDescription>Application-side API activity tracking</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Successful API Calls" value={String(stats.success)} tone="success" />
                <Stat label="Failed API Calls" value={String(stats.failed)} tone={stats.failed ? "danger" : undefined} />
                <Stat label="Success Rate" value={`${activityRate}%`} />
                <Stat label="API calls in last 15 days" value={String(stats.last15)} />
              </div>
              <p className="text-sm text-muted-foreground">Last successful call: {fmtTime(stats.last)}</p>
              <p className="text-xs text-muted-foreground">
                Meta determines Marketing API access eligibility independently. This counter is provided for diagnostics and monitoring only.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>API Activity</CardTitle></CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No diagnostic activity recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Time</TableHead><TableHead>Category</TableHead><TableHead>Endpoint</TableHead>
                      <TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Duration</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {activity.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap">{fmtTime(row.created_at)}</TableCell>
                          <TableCell className="capitalize">{row.test_category}</TableCell>
                          <TableCell className="font-mono text-xs">{row.endpoint}</TableCell>
                          <TableCell>{row.http_method}</TableCell>
                          <TableCell>
                            <Badge variant={row.status === "success" ? "default" : "destructive"}>
                              {row.http_status ?? row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">{row.duration_ms ?? 0} ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Marketing API Lifecycle Tests</CardTitle>
              <CardDescription>
                These tests verify that this app can perform actual advertising-management operations. They are separate from
                read-only diagnostics and never run automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={testMode} onCheckedChange={setTestMode} id="meta-test-mode" />
                <label htmlFor="meta-test-mode" className="text-sm font-medium">Enable Test Mode</label>
              </div>

              {testMode && (
                <>
                  <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    <p>
                      These tests can create real Meta advertising objects in the connected Ad Account and may incur advertising
                      costs if subsequently activated. Use only with an appropriate test campaign/ad account.
                    </p>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Create Test Campaign → Create Test Ad Set → Create Test Creative → Create Test Ad → Read Created Ad → Pause Test Ad
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setConfirmOpen(true)} disabled={lifecycleBusy} className="gap-2">
                      {lifecycleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                      Run Lifecycle Test
                    </Button>
                    <Button variant="outline" onClick={cleanup} disabled={cleanupBusy || pendingObjects === 0} className="gap-2">
                      {cleanupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Clean Up Test Objects{pendingObjects ? ` (${pendingObjects})` : ""}
                    </Button>
                  </div>

                  {lifecycle.length > 0 && (
                    <div className="space-y-2">
                      {lifecycle.map((step, index) => (
                        <div key={`${step.step}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span className="flex items-center gap-2">
                            {step.status === "success"
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              : <XCircle className="h-4 w-4 text-destructive" />}
                            {step.step}
                          </span>
                          <span className="text-muted-foreground">
                            {step.external_id ? <span className="mr-3 font-mono text-xs">{step.external_id}</span> : null}
                            {step.message ? <span className="mr-3 text-destructive">{step.message}</span> : null}
                            {step.duration_ms} ms
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create test objects in Meta?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create real objects in the connected Meta Ad Account. It will NOT automatically activate or spend money —
              every object is created in a paused state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runLifecycle}>Create Test Objects</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function StatusDot({ state }: { state: "success" | "failed" | "running" | "idle" }) {
  const cls = state === "success" ? "bg-emerald-500"
    : state === "failed" ? "bg-destructive"
    : state === "running" ? "bg-amber-500 animate-pulse"
    : "bg-muted-foreground/40";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />;
}

function TestRow({ row }: { row: TestResult }) {
  const [open, setOpen] = useState(false);
  const ok = row.status === "success";
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
          <span className="font-medium">{row.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>HTTP {row.http_status ?? "—"}</span>
          <span>{row.duration_ms} ms</span>
          {ok ? <span>{row.records_returned ?? 0} records</span> : <span className="text-destructive">{row.meta_error_message}</span>}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              View Details <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent className="space-y-2 border-t px-3 py-3 text-xs">
        <p><span className="text-muted-foreground">Endpoint:</span> <span className="font-mono">{row.http_method} {row.endpoint}</span></p>
        {row.fields && <p><span className="text-muted-foreground">Fields:</span> <span className="font-mono">{row.fields}</span></p>}
        <p><span className="text-muted-foreground">Timestamp:</span> {fmtTime(row.ranAt)}</p>
        {!ok && (
          <>
            {row.meta_error_code && <p><span className="text-muted-foreground">Error Code:</span> {row.meta_error_code}{row.meta_error_subcode ? ` / ${row.meta_error_subcode}` : ""}</p>}
            {row.fbtrace_id && <p><span className="text-muted-foreground">fbtrace_id:</span> <span className="font-mono">{row.fbtrace_id}</span></p>}
          </>
        )}
        <pre className="max-h-64 overflow-auto rounded bg-muted p-3">{JSON.stringify(row.sample, null, 2)}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
