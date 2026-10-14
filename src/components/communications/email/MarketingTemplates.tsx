import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichEmailEditor } from "@/components/communications/email/RichEmailEditor";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Copy, Trash2, Play } from "lucide-react";

const CATEGORIES = ["welcome", "promotions", "offers", "newsletters", "followup", "custom"] as const;

interface Props {
  onNewCampaignFromTemplate: (templateId: string) => void;
  onBack: () => void;
}

export function MarketingTemplates({ onNewCampaignFromTemplate, onBack }: Props) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("custom");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [html, setHtml] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["mkt-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("comms_email_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const reset = () => { setEditingId(null); setName(""); setCategory("custom"); setSubject(""); setPreviewText(""); setHtml(""); };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setName(t.name || "");
    setCategory(t.category || "custom");
    setSubject(t.subject || "");
    setPreviewText(t.preview_text || "");
    setHtml(t.html || "");
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const payload: any = { name, category, subject, preview_text: previewText, html };
      if (editingId) {
        const { error } = await supabase.from("comms_email_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("comms_email_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mkt-templates"] }); setDialogOpen(false); reset(); toast({ title: "Template saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comms_email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt-templates"] }),
  });

  const duplicate = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await supabase.from("comms_email_templates").insert({
        name: `${t.name} (copy)`, category: t.category, subject: t.subject, preview_text: t.preview_text, html: t.html,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt-templates"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back to campaigns</Button>
          <h2 className="text-xl font-semibold mt-2">Templates</h2>
          <p className="text-sm text-muted-foreground">Reusable email designs. Use as a starting point for new campaigns.</p>
        </div>
        <Button onClick={() => { reset(); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />New template</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No templates yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(templates as any[]).map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="line-clamp-1">{t.name}</span>
                  <Badge variant="outline" className="capitalize">{t.category}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground line-clamp-2">{t.subject || "—"}</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onNewCampaignFromTemplate(t.id)}><Play className="h-3 w-3 mr-1" />Use</Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => duplicate.mutate(t)}><Copy className="h-3 w-3 mr-1" />Copy</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete template?")) remove.mutate(t.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Preview text</Label><Input value={previewText} onChange={(e) => setPreviewText(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>HTML</Label><RichEmailEditor value={html} onChange={setHtml} minHeight={320} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MarketingTemplates;
