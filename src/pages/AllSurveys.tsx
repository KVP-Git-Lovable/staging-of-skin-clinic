import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardCheck, ChevronDown, Filter, X, Eye, Package, Stethoscope, Pencil } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { approveSurveyResponse } from "@/lib/surveyApproval";
import { useModuleListViews } from "@/hooks/useModuleListViews";
import ViewBar from "@/components/listViews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/listViews/ViewEditorDialog";
import ViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
import { applyFilters as applyListFilters, type ListView } from "@/lib/listViews/engine";
import { SURVEY_VIEW_FIELDS, DEFAULT_SURVEY_VIEW_COLUMNS } from "@/lib/listViews/surveyFields";

const STATUS_OPTIONS = [
  { value: "pending_review", label: "⏳ Pending Review", variant: "outline" as const },
  { value: "reviewed", label: "👁 Reviewed", variant: "secondary" as const },
  { value: "approved", label: "✅ Approved", variant: "default" as const },
];

function getStatusDisplay(status: string | null) {
  return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
}


function SurveyAnswersSection({ templateId, answers }: { templateId: string; answers: Record<string, any> }) {
  const { data: questions = [] } = useQuery({
    queryKey: ["survey-questions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_questions").select("*").eq("template_id", templateId).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Match answers: try by question ID first, then fall back to sort-order matching
  const answerKeys = Object.keys(answers);
  const getAnswer = (q: any, idx: number) => {
    if (answers[q.id] !== undefined) return answers[q.id];
    // Fallback: match by position if IDs don't match (seeded data)
    if (answerKeys.length > 0 && answerKeys[idx] !== undefined) return answers[answerKeys[idx]];
    return null;
  };

  if (questions.length === 0) {
    // Fallback: show raw answers if questions can't be loaded
    return (
      <div className="space-y-2">
        {Object.entries(answers).map(([qId, answer], idx) => (
          <div key={qId} className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium">Question {idx + 1}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {Array.isArray(answer) ? answer.join(", ") : (typeof answer === "object" ? JSON.stringify(answer) : String(answer))}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {questions.map((q: any, i: number) => {
        const answer = getAnswer(q, i);
        return (
          <div key={q.id} className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium">{i + 1}. {q.question_text}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {answer == null ? "—" : Array.isArray(answer) ? answer.join(", ") : (typeof answer === "object" ? JSON.stringify(answer) : String(answer))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function AllSurveys() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedResponse, setSelectedResponse] = useState<any>(null);

  // Selective approval state
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const {
    allViews, userId: viewsUserId, activeView, selectView, saveView, deleteView, pinDefault,
  } = useModuleListViews("surveys", "Survey Responses", DEFAULT_SURVEY_VIEW_COLUMNS);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [viewFiltersOpen, setViewFiltersOpen] = useState(false);

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, auth_user_id").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["all-survey-responses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("*, survey_templates(name, approval_status, is_active), patients(id, first_name, last_name, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((r: any) =>
        r.survey_templates?.is_active === true && r.survey_templates?.approval_status === "approved"
      );
    },
  });

  const templateNames = [...new Set(responses.map((r: any) => r.survey_templates?.name).filter(Boolean))].sort();

  const filtered = responses.filter((r: any) => {
    const q = search.toLowerCase();
    const patientName = r.patients ? `${r.patients.first_name} ${r.patients.last_name}`.toLowerCase() : "";
    const templateName = r.survey_templates?.name?.toLowerCase() || "";
    if (q && !patientName.includes(q) && !templateName.includes(q)) return false;
    if (statusFilter !== "all" && (r.dr_status || "pending_review") !== statusFilter) return false;
    if (templateFilter !== "all" && r.survey_templates?.name !== templateFilter) return false;
    if (dateFilter !== "all") {
      const created = new Date(r.created_at);
      const now = new Date();
      if (dateFilter === "today" && created < startOfDay(now)) return false;
      if (dateFilter === "7days" && created < startOfDay(subDays(now, 7))) return false;
      if (dateFilter === "30days" && created < startOfDay(subDays(now, 30))) return false;
    }
    return true;
  });

  // Denormalize a response into the flat shape SURVEY_VIEW_FIELDS' filter engine reads
  const toViewRow = (r: any) => ({
    id: r.id,
    patient: r.patients ? `${r.patients.first_name} ${r.patients.last_name}`.trim() : "",
    template: r.survey_templates?.name || "",
    status: r.dr_status || "pending_review",
    created_at: r.created_at,
  });

  // Apply the active saved view's filters (if any), on top of the quick filters above
  const viewFiltered = (() => {
    if (!activeView?.filters?.conditions?.length) return filtered;
    const denormalized = filtered.map(toViewRow);
    const kept = new Set(applyListFilters(denormalized, activeView.filters, SURVEY_VIEW_FIELDS).map((r) => r.id));
    return filtered.filter((r: any) => kept.has(r.id));
  })();

  // Saved-view filter builder options for the picklist fields
  const viewOptionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "status": return STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }));
      case "template": return templateNames.map((t) => ({ value: t, label: t }));
      default: return [];
    }
  };

  const openDetail = (r: any) => {
    setSelectedResponse(r);
    // Pre-select already saved selections or all AI recommendations
    const aiProducts = (r.ai_products || []) as any[];
    const aiServices = (r.ai_services || []) as any[];
    const savedProducts = r.selected_products as any[];
    const savedServices = r.selected_services as any[];

    if (savedProducts && savedProducts.length > 0) {
      setSelectedProducts(savedProducts.map((p: any) => typeof p === "string" ? p : (p.product_id || p.name)));
    } else {
      setSelectedProducts(aiProducts.map((_: any, i: number) => String(i)));
    }
    if (savedServices && savedServices.length > 0) {
      setSelectedServices(savedServices.map((s: any) => typeof s === "string" ? s : (s.service_id || s.name)));
    } else {
      setSelectedServices(aiServices.map((_: any, i: number) => String(i)));
    }
  };

  const handleStatusChange = async (response: any, newStatus: string) => {
    if (newStatus === "approved") {
      const aiProducts = (response.ai_products || []) as any[];
      const aiServices = (response.ai_services || []) as any[];

      const chosenProducts = aiProducts.filter((_: any, i: number) => selectedProducts.includes(String(i)));
      const chosenServices = aiServices.filter((_: any, i: number) => selectedServices.includes(String(i)));

      try {
        const { rxCount, procCount } = await approveSurveyResponse(response, {
          selectedProducts: chosenProducts,
          selectedServices: chosenServices,
          queryClient,
        });
        toast.success(`Approved — ${rxCount} Rx, ${procCount} procedure(s) added`);
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    } else {
      const { error } = await supabase.from("survey_responses").update({ dr_status: newStatus }).eq("id", response.id);
      if (error) { toast.error(error.message); return; }
      toast.success(`Status set to ${getStatusDisplay(newStatus).label}`);
    }

    queryClient.invalidateQueries({ queryKey: ["all-survey-responses"] });
    if (response.patients?.id) {
      queryClient.invalidateQueries({ queryKey: ["patient-surveys", response.patients.id] });
    }
    setSelectedResponse(null);
  };

  const hasActiveFilters = statusFilter !== "all" || templateFilter !== "all" || dateFilter !== "all" || search;

  const clearFilters = () => {
    setSearch(""); setStatusFilter("all"); setTemplateFilter("all"); setDateFilter("all");
  };

  const toggleAllProducts = (checked: boolean) => {
    if (!selectedResponse) return;
    const aiProducts = (selectedResponse.ai_products || []) as any[];
    setSelectedProducts(checked ? aiProducts.map((_: any, i: number) => String(i)) : []);
  };

  const toggleAllServices = (checked: boolean) => {
    if (!selectedResponse) return;
    const aiServices = (selectedResponse.ai_services || []) as any[];
    setSelectedServices(checked ? aiServices.map((_: any, i: number) => String(i)) : []);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">All Surveys</h1>
          <p className="text-sm text-muted-foreground">Survey responses across all patients</p>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-xs">
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
      </div>

      <ViewBar
        views={allViews}
        activeView={activeView}
        currentUserId={viewsUserId}
        onSelect={selectView}
        onNew={() => { setEditingView(null); setViewEditorOpen(true); }}
        onEdit={(v) => { setEditingView(v); setViewEditorOpen(true); }}
        onDelete={(v) => setDeleteViewTarget(v)}
        onPin={pinDefault}
        onClone={(v) => { setEditingView({ ...v, id: undefined as any, name: `${v.name} (Copy)`, is_default: false }); setViewEditorOpen(true); }}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["all-survey-responses"] })}
        display="cards"
        onDisplayChange={() => {}}
        displayModes={["cards"]}
        count={viewFiltered.length}
        search={search}
        onSearchChange={setSearch}
        itemLabel="Surveys"
        filtersOpen={viewFiltersOpen}
        onToggleFilters={() => setViewFiltersOpen((o) => !o)}
      />

      {viewFiltersOpen && (
        <Sheet open onOpenChange={(o) => { if (!o) setViewFiltersOpen(false); }}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            <ViewFiltersPanel
              view={activeView}
              canManage={!!activeView && !activeView.is_standard && activeView.owner_id === viewsUserId}
              fields={SURVEY_VIEW_FIELDS}
              optionsFor={viewOptionsFor}
              onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
              onClose={() => setViewFiltersOpen(false)}
              itemLabel="survey responses"
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Filter Row */}
      <div className="flex flex-wrap gap-3 items-center p-3 rounded-lg border bg-muted/30">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Date range" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Time</SelectItem>
            <SelectItem value="today" className="text-xs">Today</SelectItem>
            <SelectItem value="7days" className="text-xs">Last 7 Days</SelectItem>
            <SelectItem value="30days" className="text-xs">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={templateFilter} onValueChange={setTemplateFilter}>
          <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="Template" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Templates</SelectItem>
            {templateNames.map(t => (
              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Card Grid */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : viewFiltered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">No survey responses found</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {viewFiltered.map((r: any) => {
            const status = getStatusDisplay(r.dr_status);
            const patientName = r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "—";
            const aiProducts = (r.ai_products || []) as any[];
            const aiServices = (r.ai_services || []) as any[];
            return (
              <Card key={r.id} className="p-4 space-y-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/surveys/${r.id}`)}>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {r.patients ? (
                        <Link to={`/patients/${r.patients.id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
                          {patientName}
                        </Link>
                      ) : "—"}
                    </h3>
                    <p className="text-xs text-muted-foreground">{r.survey_templates?.name || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy, hh:mm a")}</p>
                  </div>
                  <Badge variant={status.variant} className="text-[10px] ml-2 shrink-0">
                    {status.label}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.patients?.phone && (
                    <Badge variant="outline" className="text-[10px]">{r.patients.phone}</Badge>
                  )}
                  {aiProducts.length > 0 && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Package className="h-2.5 w-2.5" /> {aiProducts.length} Products
                    </Badge>
                  )}
                  {aiServices.length > 0 && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Stethoscope className="h-2.5 w-2.5" /> {aiServices.length} Services
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate(`/surveys/${r.id}`)}>
                      <Eye className="h-3 w-3" /> View
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate(`/surveys/${r.id}/edit`)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                        Status <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {STATUS_OPTIONS.filter(o => o.value !== "approved").map(opt => (
                        <DropdownMenuItem key={opt.value} className="text-xs" onClick={() => handleStatusChange(r, opt.value)}>
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog with selective approval */}
      <Dialog open={!!selectedResponse} onOpenChange={() => setSelectedResponse(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Survey Response
            </DialogTitle>
          </DialogHeader>
          {selectedResponse && (
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Patient</p>
                    <p className="font-medium">
                      {selectedResponse.patients
                        ? `${selectedResponse.patients.first_name} ${selectedResponse.patients.last_name}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Template</p>
                    <p className="font-medium">{selectedResponse.survey_templates?.name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(selectedResponse.created_at), "dd MMM yyyy, hh:mm a")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant={getStatusDisplay(selectedResponse.dr_status).variant}>
                      {getStatusDisplay(selectedResponse.dr_status).label}
                    </Badge>
                  </div>
                </div>

                {/* Answers */}
                <div>
                  <p className="font-medium mb-2">Answers</p>
                  <SurveyAnswersSection templateId={selectedResponse.template_id} answers={selectedResponse.answers as Record<string, any> || {}} />
                </div>

                {/* AI Recommendation text */}
                {selectedResponse.ai_recommendation && (
                  <div>
                    <p className="font-medium mb-1">AI Recommendation</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {(() => {
                        const raw = selectedResponse.ai_recommendation;
                        if (!raw) return "—";
                        // If it's an object, extract .recommendation or .text
                        if (typeof raw === "object") {
                          return (raw as any).recommendation || (raw as any).text || JSON.stringify(raw, null, 2);
                        }
                        // If it's a string that looks like JSON, try to parse and extract
                        if (typeof raw === "string") {
                          try {
                            const parsed = JSON.parse(raw);
                            if (typeof parsed === "object" && parsed !== null) {
                              return parsed.recommendation || parsed.text || raw;
                            }
                          } catch { /* not JSON, use as-is */ }
                        }
                        return String(raw);
                      })()}
                    </p>
                  </div>
                )}

                {/* Selectable Products */}
                {(() => {
                  const aiProducts = (selectedResponse.ai_products || []) as any[];
                  if (aiProducts.length === 0) return null;
                  const allSelected = aiProducts.every((_: any, i: number) => selectedProducts.includes(String(i)));
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium flex items-center gap-1.5">
                          <Package className="h-4 w-4" /> Recommended Products ({aiProducts.length})
                        </p>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Select All</Label>
                          <Switch checked={allSelected} onCheckedChange={toggleAllProducts} />
                        </div>
                      </div>
                      {aiProducts.map((p: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 border rounded-lg p-2.5 bg-muted/30">
                          <Checkbox
                            checked={selectedProducts.includes(String(i))}
                            onCheckedChange={(checked) => {
                              setSelectedProducts(prev =>
                                checked ? [...prev, String(i)] : prev.filter(x => x !== String(i))
                              );
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{p.product_name || p.name || "Product"}</p>
                            {p.advice && <p className="text-xs text-muted-foreground">{p.advice}</p>}
                            {p.dosage && <p className="text-xs text-muted-foreground">Dosage: {p.dosage}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Selectable Services */}
                {(() => {
                  const aiServices = (selectedResponse.ai_services || []) as any[];
                  if (aiServices.length === 0) return null;
                  const allSelected = aiServices.every((_: any, i: number) => selectedServices.includes(String(i)));
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium flex items-center gap-1.5">
                          <Stethoscope className="h-4 w-4" /> Recommended Services ({aiServices.length})
                        </p>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Select All</Label>
                          <Switch checked={allSelected} onCheckedChange={toggleAllServices} />
                        </div>
                      </div>
                      {aiServices.map((s: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 border rounded-lg p-2.5 bg-muted/30">
                          <Checkbox
                            checked={selectedServices.includes(String(i))}
                            onCheckedChange={(checked) => {
                              setSelectedServices(prev =>
                                checked ? [...prev, String(i)] : prev.filter(x => x !== String(i))
                              );
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{s.service_name || s.name || "Service"}</p>
                            {s.advice && <p className="text-xs text-muted-foreground">{s.advice}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Approve button in dialog */}
                {(selectedResponse.dr_status || "pending_review") !== "approved" && (
                  <div className="flex justify-end gap-2 pt-3 border-t">
                    <Button variant="outline" onClick={() => setSelectedResponse(null)}>Close</Button>
                    <Button onClick={() => handleStatusChange(selectedResponse, "approved")} className="gap-1.5">
                      ✅ Approve Selected
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <ViewEditorDialog
        open={viewEditorOpen}
        onOpenChange={setViewEditorOpen}
        view={editingView}
        onSave={saveView}
        fields={SURVEY_VIEW_FIELDS}
        defaultColumns={DEFAULT_SURVEY_VIEW_COLUMNS}
        optionsFor={viewOptionsFor}
        people={staffList
          .filter((s: any) => s.auth_user_id)
          .map((s: any) => ({ value: s.auth_user_id, label: `${s.first_name || ""} ${s.last_name || ""}`.trim() }))}
        itemLabel="survey responses"
      />

      <AlertDialog open={!!deleteViewTarget} onOpenChange={(o) => { if (!o) setDeleteViewTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteViewTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This list view will be removed for everyone it is shared with.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteViewTarget) deleteView(deleteViewTarget);
                setDeleteViewTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
