import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ClipboardCheck, Pencil, Trash2, Eye, ChevronRight, CheckCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SurveyTemplateForm } from "@/components/surveys/SurveyTemplateForm";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const APPROVAL_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  pending_approval: { label: "Pending Approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
};

const SurveyTemplates = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["survey-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_templates")
        .select("*, problem_areas(name), services(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const error: any = await moveToTrash("survey_templates", id).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-templates"] });
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("survey_templates").update({ approval_status: "approved" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-templates"] });
      toast.success("Template approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = templates.filter((t: any) =>
    t.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Survey Templates</h1>
          <p className="text-sm text-muted-foreground">Create and manage patient survey templates with AI-powered recommendations</p>
        </div>
        <Button className="gap-2" onClick={() => { setEditingId(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">No survey templates yet</p>
          <Button variant="outline" onClick={() => { setEditingId(null); setFormOpen(true); }}>Create your first template</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t: any) => {
            const approvalInfo = APPROVAL_BADGE[t.approval_status] || APPROVAL_BADGE.draft;
            return (
              <Card
                key={t.id}
                className="p-4 space-y-3 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/survey-templates/${t.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                    {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                  </div>
                  <div className="flex flex-col gap-1 ml-2 shrink-0 items-end">
                    <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">
                      {t.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant={approvalInfo.variant} className="text-[10px]">
                      {approvalInfo.label}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {t.problem_areas?.name && (
                    <Badge variant="outline" className="text-[10px]">{t.problem_areas.name}</Badge>
                  )}
                  {t.services?.name && (
                    <Badge variant="outline" className="text-[10px]">{t.services.name}</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">Age: {t.age_range_min}-{t.age_range_max}</Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 flex-wrap">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate(`/survey-templates/${t.id}`)}>
                      <Eye className="h-3 w-3" /> View
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditingId(t.id); setFormOpen(true); }}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    {isAdmin && t.approval_status === "pending_approval" && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-green-600 hover:text-green-700" onClick={() => approveMutation.mutate(t.id)}>
                        <CheckCircle className="h-3 w-3" /> Approve
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete template?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove this survey template and all its questions.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SurveyTemplateForm
        open={formOpen}
        onOpenChange={setFormOpen}
        templateId={editingId}
      />
    </div>
  );
};

export default SurveyTemplates;
