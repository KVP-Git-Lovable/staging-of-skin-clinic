import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AudienceBuilder } from "@/components/communications/journey/AudienceBuilder";
import type { AudienceConfig } from "@/lib/comms/journeys";
import { RichEmailEditor } from "@/components/communications/email/RichEmailEditor";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Save, Send, Eye, TestTube2, ShieldAlert, Loader2, ClipboardCheck } from "lucide-react";
import {
  connectionReadyToSend,
  mailchimpApi,
  roundUpToQuarterHour,
  splitEmail,
  type MailchimpChecklist,
  type MailchimpConnection,
  type MailchimpDomain,
} from "@/lib/comms/mailchimp";

const STEPS = ["Details", "Audience", "Designer", "Review", "Schedule"] as const;

interface Props {
  campaignId: string | null;
  templateId?: string | null;
  onDone: () => void;
  onCancel: () => void;
}

/** Campaign wizard for Email Marketing. Campaigns are sent through Mailchimp. */
export function CampaignWizard({ campaignId, templateId, onDone, onCancel }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [audience, setAudience] = useState<AudienceConfig | null>(null);
  const [html, setHtml] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [testEmails, setTestEmails] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [checklist, setChecklist] = useState<MailchimpChecklist | null>(null);

  // Mailchimp connection: account health, default audience and verified sending domains
  const { data: mcStatus, isLoading: mcLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["mailchimp-status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        return await mailchimpApi<{ ok: boolean; connection: MailchimpConnection }>("status");
      } catch {
        return { ok: false, connection: null as MailchimpConnection | null };
      }
    },
  });
  const mcConn = mcStatus?.ok ? mcStatus.connection : null;
  const { data: mcDomains = [] } = useQuery({
    queryKey: ["mailchimp-domains"],
    enabled: !!mcConn,
    queryFn: async () => (await mailchimpApi<{ domains: MailchimpDomain[] }>("domains")).domains,
  });
  const verifiedDomains = mcDomains.filter((d) => d.verified).map((d) => d.domain.toLowerCase());
  const senderOk = connectionReadyToSend(mcConn) && verifiedDomains.length > 0;
  const fromParts = splitEmail(fromEmail);
  const fromDomainOk = !!fromParts.domain && verifiedDomains.includes(fromParts.domain);

  // Load existing campaign
  useEffect(() => {
    if (!campaignId) return;
    (async () => {
      const { data } = await supabase.from("comms_email_campaigns").select("*").eq("id", campaignId).maybeSingle();
      if (!data) return;
      setName(data.name || "");
      setSubject(data.subject || "");
      setPreviewText(data.preview_text || "");
      setFromName(data.from_name || "");
      setFromEmail(data.from_email || "");
      setHtml(data.html || "");
      setAudience((data.audience_config as unknown as AudienceConfig) || null);
      setTimezone(data.timezone || timezone);
      if (data.scheduled_at) {
        const d = new Date(data.scheduled_at);
        setScheduleMode("later");
        setScheduleDate(d.toISOString().slice(0, 10));
        setScheduleTime(d.toTimeString().slice(0, 5));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Load template preset
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const { data } = await supabase.from("comms_email_templates").select("*").eq("id", templateId).maybeSingle();
      if (!data) return;
      if (!subject) setSubject(data.subject || "");
      if (!previewText) setPreviewText(data.preview_text || "");
      if (!html) setHtml(data.html || "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Sendable-audience count (patients with a valid, unsubscribed-free email) for the review step.
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  useEffect(() => {
    const valid = (audience?.segments || []).filter((s) => s.list_view_id);
    if (!valid.length) { setAudienceCount(null); return; }
    let alive = true;
    mailchimpApi<{ total?: number }>("audience_preview", { audience_config: audience })
      .then((r) => { if (alive) setAudienceCount(typeof r.total === "number" ? r.total : null); })
      .catch(() => { if (alive) setAudienceCount(null); });
    return () => { alive = false; };
  }, [audience]);

  const canNext = useMemo(() => {
    if (step === 0) return name.trim() && subject.trim() && fromName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) && fromDomainOk;
    if (step === 1) return (audience?.segments || []).some((s) => s.list_view_id);
    if (step === 2) return html.replace(/<[^>]+>/g, "").trim().length > 10;
    if (step === 3) return true;
    if (step === 4) {
      if (scheduleMode === "later") return !!scheduleDate && !!scheduleTime;
      return true;
    }
    return true;
  }, [step, name, subject, fromName, fromEmail, fromDomainOk, audience, html, scheduleMode, scheduleDate, scheduleTime]);

  const saveDraft = useMutation({
    mutationFn: async (): Promise<string> => {
      const payload: any = {
        name: name.trim(),
        subject: subject.trim(),
        preview_text: previewText || null,
        from_name: fromName.trim(),
        from_email: fromEmail.trim().toLowerCase(),
        // Mailchimp replies to the From address; there is no separate reply-to.
        reply_to: fromEmail.trim().toLowerCase() || null,
        html,
        audience_config: audience,
        timezone,
      };
      if (campaignId) {
        const { error } = await supabase.from("comms_email_campaigns").update(payload).eq("id", campaignId);
        if (error) throw error;
        return campaignId;
      } else {
        payload.status = "draft";
        const { data, error } = await supabase.from("comms_email_campaigns").insert(payload).select("id").single();
        if (error) throw error;
        return (data as any).id;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); toast({ title: "Draft saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const list = testEmails.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
      if (!list.length) throw new Error("Enter at least one test recipient");
      const id = await saveDraft.mutateAsync();
      await mailchimpApi("test", { campaign_id: id, recipients: list });
    },
    onSuccess: () => toast({ title: "Test email sent" }),
    onError: (e: Error) => toast({ title: "Test send failed", description: e.message, variant: "destructive" }),
  });

  const runChecklist = useMutation({
    mutationFn: async () => {
      const id = await saveDraft.mutateAsync();
      return mailchimpApi<{ checklist: MailchimpChecklist }>("prepare", { campaign_id: id });
    },
    onSuccess: (d) => setChecklist(d.checklist),
    onError: (e: Error) => toast({ title: "Mailchimp checklist failed", description: e.message, variant: "destructive" }),
  });

  const launch = useMutation({
    mutationFn: async () => {
      const id = await saveDraft.mutateAsync();
      let sched: string | null = null;
      if (scheduleMode === "later") {
        const local = new Date(`${scheduleDate}T${scheduleTime}:00`);
        if (local.getTime() < Date.now() + 60_000) throw new Error("Scheduled time must be at least 1 minute in the future");
        sched = local.toISOString();
      }
      return mailchimpApi<{ effective_schedule_time?: string | null; rejected_count?: number; audience_count?: number }>("launch", {
        campaign_id: id,
        send_now: scheduleMode === "now",
        scheduled_at: sched,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      const rejected = res?.rejected_count ? ` ${res.rejected_count} address(es) were refused by Mailchimp.` : "";
      const when = res?.effective_schedule_time ? `Scheduled for ${new Date(res.effective_schedule_time).toLocaleString()}` : "Scheduled";
      toast({ title: "Campaign launched", description: scheduleMode === "now" ? `Sending now via Mailchimp.${rejected}` : `${when}.${rejected}` });
      onDone();
    },
    onError: (e: Error) => toast({ title: "Launch failed", description: e.message, variant: "destructive" }),
  });

  const largeAudience = (audienceCount || 0) > 1000;
  const confirmMatches = !largeAudience || confirmText.trim().toUpperCase() === "SEND";
  const effectiveTime = scheduleMode === "later" && scheduleDate && scheduleTime
    ? roundUpToQuarterHour(new Date(`${scheduleDate}T${scheduleTime}:00`))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" />Back to campaigns</Button>
          <h2 className="text-xl font-semibold mt-2">{campaignId ? "Edit campaign" : "New campaign"}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending || !name.trim()}>
          <Save className="h-4 w-4 mr-2" />Save draft
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={`px-3 py-1.5 rounded-full text-xs border ${i === step ? "bg-primary text-primary-foreground border-primary" : i < step ? "bg-muted" : "text-muted-foreground"}`}
            onClick={() => setStep(i)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {!senderOk && !mcLoading && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-medium">Mailchimp is not ready to send</div>
              <div className="text-muted-foreground">
                {!mcConn ? "The Mailchimp connection is not available. Open Connections and press Recheck. " : ""}
                {mcConn && !mcConn.default_list_id ? "Choose a default audience under Connections. " : ""}
                {mcConn && verifiedDomains.length === 0 ? "Verify a sending domain under Connections. " : ""}
                You can still save a draft.
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetchStatus()}>Recheck</Button>
          </CardContent>
        </Card>
      )}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign details</CardTitle>
            <CardDescription>Sent through Mailchimp{mcConn?.account_name ? ` (${mcConn.account_name})` : ""} from a verified domain.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Campaign name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. October offers" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Subject line</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject shown in inbox" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Preview text</Label>
              <Input value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Short preview shown after the subject" />
            </div>
            <div className="space-y-1.5">
              <Label>From name</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Brand or person name" />
            </div>
            <div className="space-y-1.5">
              <Label>From email</Label>
              <div className="flex items-center gap-1">
                <Input
                  className="flex-1"
                  value={fromParts.local}
                  onChange={(e) => setFromEmail(`${e.target.value.trim()}@${fromParts.domain || verifiedDomains[0] || ""}`)}
                  placeholder="hello"
                />
                <span className="text-muted-foreground">@</span>
                <Select value={fromParts.domain || verifiedDomains[0] || ""} onValueChange={(d) => setFromEmail(`${fromParts.local}@${d}`)}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Verified domain" /></SelectTrigger>
                  <SelectContent>
                    {verifiedDomains.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    {verifiedDomains.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No verified domains</div>}
                  </SelectContent>
                </Select>
              </div>
              {!fromDomainOk && fromEmail && <p className="text-xs text-destructive">Pick a domain verified in Mailchimp.</p>}
              <p className="text-xs text-muted-foreground">Replies go to this address; Mailchimp has no separate reply-to.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audience</CardTitle>
            <CardDescription>Uses your saved Patients list views. Only patients with an email address who have not unsubscribed receive the campaign; they are added to the default Mailchimp audience at launch.</CardDescription>
          </CardHeader>
          <CardContent>
            <AudienceBuilder value={audience} onChange={setAudience} previewAction={async (config) => { const r = await mailchimpApi<{ total: number; per_segment: Record<string, number>; without_email: number; suppressed: number }>("audience_preview", { audience_config: config }); return { per_segment: r.per_segment, total: r.total, skipped: r.without_email + r.suppressed }; }} contactNoun="with an email address" />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email designer</CardTitle>
            <CardDescription>Rich HTML with merge variables. The unsubscribe link and company address footer are added automatically at send time.</CardDescription>
          </CardHeader>
          <CardContent>
            <RichEmailEditor value={html} onChange={setHtml} minHeight={420} />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Review</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 text-sm">
              <div><div className="text-muted-foreground text-xs">Sender</div><div>{fromName} &lt;{fromEmail}&gt;</div></div>
              <div><div className="text-muted-foreground text-xs">Mailchimp audience</div><div>{mcConn?.default_list_name || "—"}</div></div>
              <div className="md:col-span-2"><div className="text-muted-foreground text-xs">Subject</div><div className="font-medium">{subject}</div></div>
              {previewText && <div className="md:col-span-2"><div className="text-muted-foreground text-xs">Preview text</div><div>{previewText}</div></div>}
              <div><div className="text-muted-foreground text-xs">Estimated recipients</div><div className="font-semibold">{audienceCount != null ? audienceCount.toLocaleString() : "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Timezone</div><div>{timezone}</div></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4 mr-2" />Preview email</Button>
              <Button variant="outline" size="sm" onClick={() => runChecklist.mutate()} disabled={runChecklist.isPending || !senderOk}>
                {runChecklist.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}Check with Mailchimp
              </Button>
            </div>
            {checklist && (
              <div className="rounded-md border p-3 space-y-1.5 text-sm">
                <div className="font-medium">Mailchimp send checklist {checklist.is_ready ? <Badge className="ml-1 bg-emerald-600 hover:bg-emerald-600">Ready</Badge> : <Badge variant="outline" className="ml-1">Needs attention</Badge>}</div>
                {(checklist.items || []).filter((i) => i.type !== "success").map((i) => (
                  <div key={`${i.id}-${i.heading}`} className="flex gap-2">
                    <Badge variant={i.type === "error" ? "destructive" : "secondary"} className="h-5 shrink-0">{i.type}</Badge>
                    <span><b>{i.heading}</b> — {i.details}</span>
                  </div>
                ))}
                {(checklist.items || []).every((i) => i.type === "success") && <div className="text-muted-foreground">No warnings. Audience size is confirmed at launch.</div>}
              </div>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2"><TestTube2 className="h-4 w-4" /><span className="text-sm font-medium">Send test email</span></div>
              <Textarea rows={2} placeholder="test1@example.com, test2@example.com" value={testEmails} onChange={(e) => setTestEmails(e.target.value)} />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => sendTest.mutate()} disabled={sendTest.isPending || !senderOk}>
                  {sendTest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Send test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Test sends never affect campaign analytics.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={scheduleMode} onValueChange={(v) => setScheduleMode(v as any)}>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="now" id="sm-now" /><span>Send now</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="later" id="sm-later" /><span>Schedule for later</span>
              </label>
            </RadioGroup>

            {scheduleMode === "later" && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Time</Label><Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Timezone</Label><Input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></div>
              </div>
            )}

            {effectiveTime && (
              <p className="text-xs text-muted-foreground">
                Mailchimp sends on the quarter hour (:00, :15, :30, :45). This campaign will go out at <b>{effectiveTime.toLocaleString()}</b>.
                {mcConn?.pricing_plan_type === "forever_free" && " Scheduling is not available on the Free plan; choose Send now."}
              </p>
            )}

            {audienceCount != null && (
              <div className="text-sm text-muted-foreground">
                Estimated recipients: <Badge variant="outline">{audienceCount.toLocaleString()}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!canNext}>
            Next<ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)} disabled={!canNext || !senderOk}>
            <Send className="h-4 w-4 mr-2" />
            {scheduleMode === "now" ? "Send campaign" : "Schedule campaign"}
          </Button>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl h-[80vh]">
          <DialogHeader><DialogTitle>Email preview</DialogTitle></DialogHeader>
          <iframe title="preview" srcDoc={html} className="w-full h-full border rounded" />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setConfirmText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm launch</DialogTitle>
            <DialogDescription>Review your campaign before we hand it to Mailchimp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Name:</span> {name}</div>
            <div><span className="text-muted-foreground">Audience:</span> {audienceCount?.toLocaleString() || "—"} contacts</div>
            <div><span className="text-muted-foreground">When:</span> {scheduleMode === "now" ? "Immediately" : effectiveTime ? effectiveTime.toLocaleString() : `${scheduleDate} ${scheduleTime} ${timezone}`}</div>
          </div>
          {largeAudience && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-sm">
              This is a large audience. Type <b>SEND</b> to confirm.
              <Input className="mt-2" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { setConfirmOpen(false); launch.mutate(); }}
              disabled={launch.isPending || !confirmMatches}
            >
              {launch.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Confirm launch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CampaignWizard;
