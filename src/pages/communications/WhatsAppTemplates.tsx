import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Copy, Download, FileText, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CreateTemplateDialog } from "@/components/communications/CreateTemplateDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { emptyDraft, invokeTemplates, TemplateDraft, TemplateRow } from "@/lib/comms/templatesApi";
import { toFriendlyBody } from "@/lib/comms/templateVariables";
import { onlyClinicTemplates, TEMPLATE_FILTER_LABEL } from "@/lib/comms/templateFilter";

const statusStyle: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

export default function WhatsAppTemplates() {
  const qc = useQueryClient();
  const { staffProfile } = useAuth();
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft());
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);

  const { data: templates = [], isLoading, isError } = useQuery({
    queryKey: ["comms-whatsapp-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_whatsapp_templates")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      // Import from API brings down the whole Twilio account, so the clinic's own
      // templates are picked out here rather than left for the reader to scan past.
      return onlyClinicTemplates((data || []) as unknown as TemplateRow[]);
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["comms-whatsapp-templates"] });

  const importFromApi = useMutation({
    mutationFn: () => invokeTemplates<{ imported: number; skipped: number }>({ action: "import-from-twilio" }),
    onSuccess: (r) => {
      // The counts are whole-account numbers from Twilio. Saying so stops the list
      // below looking broken when it shows fewer than the number just imported.
      toast.success(
        `Imported ${r.imported} template${r.imported === 1 ? "" : "s"}, ${r.skipped} already existed. ` +
          `Listing only those named ${TEMPLATE_FILTER_LABEL}.`
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncAll = useMutation({
    mutationFn: () => invokeTemplates<{ synced: number; failed: number }>({ action: "bulk-sync" }),
    onSuccess: (r) => {
      if (r.failed > 0) toast.warning(`Synced ${r.synced}, ${r.failed} could not be refreshed`);
      else toast.success(`Statuses synced (${r.synced})`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshOne = useMutation({
    mutationFn: (id: string) => invokeTemplates({ action: "refresh-status", template_id: id }),
    onSuccess: () => {
      toast.success("Status refreshed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comms_whatsapp_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template removed");
      setDeleteTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = useMemo(
    () =>
      templates.filter(
        (t) =>
          (status === "all" || t.status === status) &&
          (category === "all" || t.category === category) &&
          (showAll || !staffProfile || t.created_by === staffProfile.id)
      ),
    [templates, status, category, showAll, staffProfile]
  );

  const openCreate = (initial: TemplateDraft = emptyDraft()) => {
    setDraft(initial);
    setDialogOpen(true);
  };

  const duplicate = (t: TemplateRow) =>
    openCreate({
      name: `${t.name}_copy`,
      category: t.category,
      language: t.language,
      contentType: t.content_type === "media" || t.content_type === "call_to_action" ? t.content_type : "text",
      body: toFriendlyBody(t.body, t.variable_map),
      mediaUrl: t.media_url ?? "",
      ctaButtons:
        t.cta_actions && t.cta_actions.length
          ? t.cta_actions.map((a) => ({
              type: a.type === "PHONE_NUMBER" ? "PHONE_NUMBER" : "URL",
              title: a.title ?? "",
              url: a.url ?? "",
              phone: a.phone ?? "",
            }))
          : emptyDraft().ctaButtons,
    });

  return (
    <div>
      <div className="page-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link to="/communications/whatsapp" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> WhatsApp Center
          </Link>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> WhatsApp Templates
          </h1>
          <p className="page-subtitle">
            Create and manage WhatsApp message templates via API. Showing only templates named {TEMPLATE_FILTER_LABEL}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => importFromApi.mutate()} disabled={importFromApi.isPending}>
            {importFromApi.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Import from API
          </Button>
          <Button variant="outline" onClick={() => syncAll.mutate()} disabled={syncAll.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} /> Sync All
          </Button>
          <Button onClick={() => openCreate()}>
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="UTILITY">Utility</SelectItem>
            <SelectItem value="MARKETING">Marketing</SelectItem>
            <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show Mine" : "Show All"}</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-4 h-48" />
          ) : isError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Templates could not be loaded. The templates table may not be set up yet for this project.
            </p>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {templates.length === 0
                ? `No templates named ${TEMPLATE_FILTER_LABEL} yet. Create one, or use Import from API to bring in matching templates already on your Twilio account.`
                : "No templates match these filters."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-sm align-top">
                      <p className="font-medium">{t.name}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{toFriendlyBody(t.body, t.variable_map)}</p>
                      <p className="text-xs text-muted-foreground">{t.language} · {t.content_type.replace(/_/g, " ")}</p>
                    </TableCell>
                    <TableCell className="align-top"><Badge variant="outline" className="capitalize">{t.category.toLowerCase()}</Badge></TableCell>
                    <TableCell className="align-top">
                      <Badge className={statusStyle[t.status] ?? ""}>{t.status}</Badge>
                      {t.rejection_reason && <p className="mt-1 max-w-48 text-xs text-destructive">{t.rejection_reason}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top text-sm text-muted-foreground">
                      {format(new Date(t.updated_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex justify-end gap-1">
                        {t.twilio_content_sid && (
                          <Button variant="ghost" size="icon" title="Refresh status" onClick={() => refreshOne.mutate(t.id)} disabled={refreshOne.isPending}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Duplicate" onClick={() => duplicate(t)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteTarget(t)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateTemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={draft} onCreated={refresh} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from this list only. The template stays on your Twilio account, and Import from API would bring it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
