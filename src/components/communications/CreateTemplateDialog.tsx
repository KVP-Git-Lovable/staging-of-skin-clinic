import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImageIcon, Link2, Loader2, MessageCircle, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { InsertVariablePicker } from "@/components/communications/InsertVariablePicker";
import { ContentType, CtaButton, emptyCta, invokeTemplates, TemplateDraft } from "@/lib/comms/templatesApi";
import { extractFriendlyVariables, sampleFor, toTwilioBody, validateFriendlyBody } from "@/lib/comms/templateVariables";

const CONTENT_TYPES: { value: ContentType; title: string; hint: string; icon: typeof MessageCircle }[] = [
  { value: "text", title: "Text", hint: "Plain message", icon: MessageCircle },
  { value: "media", title: "Media", hint: "Image, video or PDF", icon: ImageIcon },
  { value: "call_to_action", title: "Call to action", hint: "Button to URL or phone", icon: Link2 },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

export function CreateTemplateDialog({
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TemplateDraft;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<TemplateDraft>(initial);
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [mediaTab, setMediaTab] = useState<"url" | "upload">("url");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setSamples({});
      setMediaTab("url");
    }
  }, [open, initial]);

  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => setForm((f) => ({ ...f, [key]: value }));

  const variables = useMemo(() => extractFriendlyVariables(form.body), [form.body]);
  const warnings = useMemo(() => validateFriendlyBody(form.body), [form.body]);
  const { twilioBody, mapping } = useMemo(() => toTwilioBody(form.body), [form.body]);
  const sampleOf = (name: string) => samples[name] ?? sampleFor(name);

  const nameValid = /^[a-z][a-z0-9_]*$/.test(form.name);
  const samplesValid = variables.every((v) => sampleOf(v).trim());
  const mediaValid = form.contentType !== "media" || /^https:\/\/\S+$/.test(form.mediaUrl.trim());
  const ctaValid =
    form.contentType !== "call_to_action" ||
    form.ctaButtons.every((b) =>
      b.title.trim() && (b.type === "URL" ? /^https:\/\/\S+$/.test(b.url.trim()) : /^\+[1-9]\d{6,14}$/.test(b.phone.trim()))
    );
  const canSubmit = nameValid && form.body.trim() && form.body.length <= 1024 && warnings.length === 0 && samplesValid && mediaValid && ctaValid;

  const insertVariable = (name: string) => {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    if (!el) return set("body", form.body + token);
    const start = el.selectionStart ?? form.body.length;
    const end = el.selectionEnd ?? form.body.length;
    set("body", form.body.slice(0, start) + token + form.body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const uploadMedia = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("File must be 16 MB or smaller");
    if (!user) return toast.error("Please sign in again");
    setUploading(true);
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("whatsapp-media").upload(path, file, { cacheControl: "3600" });
    setUploading(false);
    if (error) return toast.error(`Upload failed: ${error.message}`);
    set("mediaUrl", supabase.storage.from("whatsapp-media").getPublicUrl(path).data.publicUrl);
    toast.success("File uploaded");
  };

  const payload = () => {
    const variableSamples = Object.fromEntries(Object.entries(mapping).map(([n, friendly]) => [n, sampleOf(friendly).trim()]));
    return {
      name: form.name,
      category: form.category,
      language: form.language,
      body: twilioBody,
      content_type: form.contentType,
      variable_map: mapping,
      variable_samples: variableSamples,
      ...(form.contentType === "media" ? { media_url: form.mediaUrl.trim() } : {}),
      ...(form.contentType === "call_to_action"
        ? {
            cta_actions: form.ctaButtons.map((b) =>
              b.type === "URL"
                ? { type: "URL", title: b.title.trim(), url: b.url.trim() }
                : { type: "PHONE_NUMBER", title: b.title.trim(), phone: b.phone.trim() }
            ),
          }
        : {}),
    };
  };

  const submit = useMutation({
    mutationFn: () => invokeTemplates<{ warning?: string | null }>(payload()),
    onSuccess: (res) => {
      if (res.warning) toast.warning(`Saved, but approval was not requested: ${res.warning}`);
      else toast.success("Template submitted for WhatsApp approval");
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCta = (i: number, patch: Partial<CtaButton>) =>
    set("ctaButtons", form.ctaButtons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(form.mediaUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create WhatsApp Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="mb-2 block">Content Type</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CONTENT_TYPES.map(({ value, title, hint, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("contentType", value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.contentType === value ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <Icon className="mb-2 h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="tpl-name">Template Name</Label>
            <Input
              id="tpl-name"
              className="mt-1.5"
              placeholder="e.g. appointment_reminder"
              value={form.name}
              onChange={(e) => set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Lowercase with underscores only, starting with a letter
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={form.language} onValueChange={(v) => set("language", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.contentType === "media" && (
            <div className="rounded-lg border p-4">
              <Label className="mb-3 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> Header Media</Label>
              <Tabs value={mediaTab} onValueChange={(v) => setMediaTab(v as "url" | "upload")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="url">Paste URL</TabsTrigger>
                  <TabsTrigger value="upload">Upload file</TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="mt-3">
                  <Input placeholder="https://example.com/image.jpg" value={form.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)} />
                </TabsContent>
                <TabsContent value="upload" className="mt-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadMedia(file);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {uploading ? "Uploading…" : "Choose image, video or PDF (max 16 MB)"}
                  </Button>
                  {form.mediaUrl && <p className="mt-2 break-all text-xs text-muted-foreground">{form.mediaUrl}</p>}
                </TabsContent>
              </Tabs>
              {isImage && <img src={form.mediaUrl} alt="Header preview" className="mt-3 max-h-40 rounded-md border object-contain" />}
              {form.mediaUrl && !mediaValid && <p className="mt-2 text-xs text-destructive">Media URL must start with https://</p>}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="tpl-body">Message Body</Label>
              <InsertVariablePicker onPick={insertVariable} />
            </div>
            <Textarea
              id="tpl-body"
              ref={bodyRef}
              rows={5}
              placeholder="Hello {{patient_name}}, your appointment is confirmed for {{appointment_date}}."
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Click "Insert Variable" to add named variables — they get auto-mapped to {"{{1}}"}, {"{{2}}"} for the API.
            </p>
            {form.body.length > 1024 && <p className="mt-1 text-xs text-destructive">Body must be 1024 characters or fewer.</p>}
            {warnings.map((w) => (
              <p key={w} className="mt-1 text-xs text-destructive">{w}</p>
            ))}
          </div>

          {variables.length > 0 && (
            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium">Sample values <span className="font-normal text-muted-foreground">(required by WhatsApp review)</span></p>
              {variables.map((v) => (
                <div key={v} className="flex items-center gap-3">
                  <Badge variant="outline" className="shrink-0 font-mono text-xs">{`{{${v}}} → {{${variables.indexOf(v) + 1}}}`}</Badge>
                  <Input value={sampleOf(v)} placeholder="Sample value" onChange={(e) => setSamples((s) => ({ ...s, [v]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}

          {form.contentType === "call_to_action" && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label>Buttons ({form.ctaButtons.length}/2)</Label>
                {form.ctaButtons.length < 2 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => set("ctaButtons", [...form.ctaButtons, emptyCta()])}>
                    <Plus className="mr-1 h-4 w-4" /> Add button
                  </Button>
                )}
              </div>
              {form.ctaButtons.map((b, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[170px_1fr_1fr_auto]">
                  <Select value={b.type} onValueChange={(v) => updateCta(i, { type: v as CtaButton["type"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="URL">Visit Website</SelectItem>
                      <SelectItem value="PHONE_NUMBER">Call Phone Number</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input maxLength={25} placeholder="Button text" value={b.title} onChange={(e) => updateCta(i, { title: e.target.value })} />
                  {b.type === "URL" ? (
                    <Input placeholder="https://example.com" value={b.url} onChange={(e) => updateCta(i, { url: e.target.value })} />
                  ) : (
                    <Input placeholder="+919876543210" value={b.phone} onChange={(e) => updateCta(i, { phone: e.target.value })} />
                  )}
                  {form.ctaButtons.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => set("ctaButtons", form.ctaButtons.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="api">API format</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <div className="rounded-lg bg-muted/60 p-4">
                <div className="max-w-xs rounded-lg bg-card p-3 text-sm shadow-sm">
                  {isImage && form.contentType === "media" && <img src={form.mediaUrl} alt="" className="mb-2 rounded-md" />}
                  <p className="whitespace-pre-wrap">
                    {form.body.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_m, n: string) => sampleOf(n) || `{{${n}}}`) || "Your message will appear here"}
                  </p>
                  {form.contentType === "call_to_action" &&
                    form.ctaButtons.filter((b) => b.title).map((b, i) => (
                      <div key={i} className="mt-2 border-t pt-2 text-center text-xs font-medium text-primary">{b.title}</div>
                    ))}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="api">
              <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(payload(), null, 2)}</pre>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create &amp; Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
