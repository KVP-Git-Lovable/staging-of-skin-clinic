import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Search, Download, Eye, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

const SurveyTemplateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [viewingResponse, setViewingResponse] = useState<any>(null);

  // Fetch template
  const { data: template, isLoading: tLoading } = useQuery({
    queryKey: ["survey-template", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_templates")
        .select("*, problem_areas(name), services(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch questions
  const { data: questions = [] } = useQuery({
    queryKey: ["survey-questions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_questions")
        .select("*")
        .eq("template_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch responses with patient info
  const { data: responses = [] } = useQuery({
    queryKey: ["survey-responses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("*, patients(id, first_name, last_name, phone)")
        .eq("template_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const filteredResponses = responses.filter((r: any) => {
    const name = `${r.patients?.first_name || ""} ${r.patients?.last_name || ""}`.toLowerCase();
    const phone = r.patients?.phone || "";
    return name.includes(search.toLowerCase()) || phone.includes(search.toLowerCase());
  });

  // answers can be {question_id: answer_value} object or array
  const normalizeAnswers = (answers: any): { question_id: string; answer: any }[] => {
    if (!answers) return [];
    if (Array.isArray(answers)) return answers;
    if (typeof answers === "object") {
      return Object.entries(answers).map(([qId, ans]) => ({ question_id: qId, answer: ans }));
    }
    return [];
  };

  const getScore = (response: any) => {
    const entries = normalizeAnswers(response.answers);
    const scaleAnswers = entries.filter((a) => typeof a.answer === "number" || (!isNaN(Number(a.answer)) && a.answer !== ""));
    if (scaleAnswers.length === 0) return "—";
    const avg = scaleAnswers.reduce((s, a) => s + Number(a.answer), 0) / scaleAnswers.length;
    return avg.toFixed(1);
  };

  const exportCSV = () => {
    const headers = ["Patient Name", "Phone", "Date Submitted", "Score", "Status"];
    const rows = filteredResponses.map((r: any) => [
      `${r.patients?.first_name || ""} ${r.patients?.last_name || ""}`.trim(),
      r.patients?.phone || "",
      format(new Date(r.created_at), "dd/MM/yyyy HH:mm"),
      getScore(r),
      r.dr_status,
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template?.name || "survey"}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (tLoading) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (!template) return <div className="text-center py-12 text-muted-foreground">Template not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/survey-templates")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-bold text-foreground">{template.name}</h1>
            <Badge variant={template.is_active ? "default" : "secondary"}>
              {template.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
          )}
        </div>
      </div>

      {/* Template Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Template Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Primary Concern</span>
              <p className="font-medium">{template.problem_areas?.name || "Any"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Service</span>
              <p className="font-medium">{template.services?.name || "Any"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Age Range</span>
              <p className="font-medium">{template.age_range_min}–{template.age_range_max}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Responses</span>
              <p className="font-medium">{responses.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Questions ({questions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No questions added yet.</p>
          ) : (
            <div className="space-y-3">
              {questions.map((q: any, i: number) => (
                <div key={q.id} className="flex gap-3 items-start p-3 rounded-lg bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground mt-0.5 shrink-0">Q{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{q.question_text}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Badge variant="outline" className="text-[10px]">{q.question_type}</Badge>
                      {Array.isArray(q.options) && q.options.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          Options: {q.options.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Responses */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Patient Responses</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV} disabled={filteredResponses.length === 0}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredResponses.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No responses yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Date Submitted</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResponses.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        to={`/patients/${r.patients?.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {r.patients?.first_name} {r.patients?.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.patients?.phone || "—"}</TableCell>
                    <TableCell>{format(new Date(r.created_at), "dd MMM yyyy, hh:mm a")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getScore(r)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.dr_status === "Reviewed" ? "default" : "secondary"} className="text-[10px]">
                        {r.dr_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setViewingResponse(r)}>
                        <Eye className="h-3 w-3" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Response Detail Modal */}
      <Dialog open={!!viewingResponse} onOpenChange={() => setViewingResponse(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Survey Response — {viewingResponse?.patients?.first_name} {viewingResponse?.patients?.last_name}
            </DialogTitle>
          </DialogHeader>
          {viewingResponse && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Submitted</span>
                  <p className="font-medium">{format(new Date(viewingResponse.created_at), "dd MMM yyyy, hh:mm a")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p><Badge variant={viewingResponse.dr_status === "Reviewed" ? "default" : "secondary"}>{viewingResponse.dr_status}</Badge></p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Answers</h4>
                {(() => {
                  const entries = normalizeAnswers(viewingResponse.answers);
                  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No answers recorded.</p>;
                  return entries.map((ans: any, i: number) => {
                    const q = questions.find((qu: any) => qu.id === ans.question_id);
                    return (
                      <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-1">
                        <p className="text-xs text-muted-foreground">Q{i + 1}: {q?.question_text || ans.question_id}</p>
                        <p className="text-sm font-medium">
                          {Array.isArray(ans.answer) ? ans.answer.join(", ") : String(ans.answer ?? "—")}
                        </p>
                      </div>
                    );
                  });
                })()}
              </div>

              {viewingResponse.dr_notes && (
                <div>
                  <h4 className="text-sm font-semibold">Doctor Notes</h4>
                  <p className="text-sm mt-1 text-muted-foreground">{viewingResponse.dr_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SurveyTemplateDetail;
