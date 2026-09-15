import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ClipboardCheck, User, FileText, Bot, Pill, Stethoscope, Loader2, Check } from "lucide-react";
import { format } from "date-fns";
import { approveSurveyResponse } from "@/lib/surveyApproval";
import { toast } from "sonner";
import { useState } from "react";

function getStatusVariant(status: string | null): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "reviewed") return "secondary";
  return "outline";
}

function getStatusLabel(status: string | null) {
  if (status === "approved") return "✅ Approved";
  if (status === "reviewed") return "👁 Reviewed";
  return "⏳ Pending Review";
}

function calcAge(dob: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))} yrs`;
}

export default function SurveyResponseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [approving, setApproving] = useState(false);

  const { data: response, isLoading } = useQuery({
    queryKey: ["survey-response-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("*, survey_templates(name, description, problem_area_id), patients(id, first_name, last_name, phone, date_of_birth, gender), appointments(start_time, service), staff(first_name, last_name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["survey-questions", response?.template_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_questions")
        .select("*")
        .eq("template_id", response!.template_id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!response?.template_id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!response) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Survey response not found.</p>
      </div>
    );
  }

  const answers = (response.answers as Record<string, any>) || {};
  const aiRec = response.ai_recommendation as any;
  const aiProducts = (response.ai_products || []) as any[];
  const aiServices = (response.ai_services || []) as any[];
  const selectedProducts = (response.selected_products || []) as any[];
  const selectedServices = (response.selected_services || []) as any[];
  const approvedProducts = selectedProducts.length > 0 ? selectedProducts : (response.dr_status === "approved" ? aiProducts : []);
  const approvedServices = selectedServices.length > 0 ? selectedServices : (response.dr_status === "approved" ? aiServices : []);

  const patient = response.patients as any;
  const template = response.survey_templates as any;
  const appt = response.appointments as any;
  const reviewer = response.staff as any;

  const handleApprove = async () => {
    setApproving(true);
    try {
      const { rxCount, procCount } = await approveSurveyResponse(
        { ...response, survey_templates: template },
        { queryClient }
      );
      toast.success(`Approved — ${rxCount} Rx, ${procCount} procedure(s) added`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setApproving(false);
    }
  };

  const answerKeys = Object.keys(answers);
  const getAnswer = (q: any, idx: number) => {
    if (answers[q.id] !== undefined) return answers[q.id];
    if (answerKeys[idx] !== undefined) return answers[answerKeys[idx]];
    return null;
  };

  const aiText = (() => {
    if (!aiRec) return null;
    if (typeof aiRec === "object") return aiRec.recommendation || aiRec.text || null;
    if (typeof aiRec === "string") {
      try {
        const p = JSON.parse(aiRec);
        return p.recommendation || p.text || aiRec;
      } catch {
        return aiRec;
      }
    }
    return null;
  })();

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(response.dr_status)} className="text-xs">
            {getStatusLabel(response.dr_status)}
          </Badge>
          {response.dr_status !== "approved" && (
            <Button size="sm" className="gap-1.5" onClick={handleApprove} disabled={approving}>
              <Check className="h-3.5 w-3.5" /> {approving ? "Approving..." : "Approve"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-display font-bold">{template?.name || "Survey Response"}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Patient Info */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-primary" /> Patient
          </div>
          {patient ? (
            <div className="space-y-1 text-sm">
              <p>
                <Link to={`/patients/${patient.id}`} className="text-primary hover:underline font-medium">
                  {patient.first_name} {patient.last_name}
                </Link>
              </p>
              {patient.phone && <p className="text-muted-foreground text-xs">{patient.phone}</p>}
              <p className="text-muted-foreground text-xs">
                {calcAge(patient.date_of_birth)}{patient.gender ? ` • ${patient.gender}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Card>

        {/* Template Info */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" /> Template
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{template?.name || "—"}</p>
            {appt?.service && <p className="text-muted-foreground text-xs">Service: {appt.service}</p>}
            <p className="text-muted-foreground text-xs">
              Submitted: {format(new Date(response.created_at), "dd MMM yyyy, hh:mm a")}
            </p>
          </div>
        </Card>
      </div>

      {/* Answers */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Answers</h2>
        {questions.length === 0 ? (
          <div className="space-y-2">
            {Object.entries(answers).map(([qId, ans], i) => (
              <div key={qId} className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">Question {i + 1}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {Array.isArray(ans) ? ans.join(", ") : typeof ans === "object" ? JSON.stringify(ans) : String(ans)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {questions.map((q: any, i: number) => {
              const ans = getAnswer(q, i);
              return (
                <div key={q.id} className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium">{i + 1}. {q.question_text}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {ans == null ? "—" : Array.isArray(ans) ? ans.join(", ") : typeof ans === "object" ? JSON.stringify(ans) : String(ans)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* AI Recommendation */}
      {aiText && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-primary" /> AI Recommendation
          </div>
          <p className="text-sm whitespace-pre-wrap">{aiText}</p>
        </Card>
      )}

      {/* Approved / Recommended Products */}
      {(approvedProducts.length > 0 || aiProducts.length > 0) && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Pill className="h-4 w-4 text-primary" />
            {response.dr_status === "approved" ? "Approved Products" : "Recommended Products"}
            <Badge variant="outline" className="text-[10px]">
              {(response.dr_status === "approved" ? approvedProducts : aiProducts).length}
            </Badge>
          </div>
          <div className="space-y-2">
            {(response.dr_status === "approved" ? approvedProducts : aiProducts).map((p: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 bg-muted/30">
                <p className="text-sm font-medium">{p.product_name || p.name || "Product"}</p>
                {p.advice && <p className="text-xs text-muted-foreground mt-0.5">{p.advice}</p>}
                {p.dosage && <p className="text-xs text-muted-foreground">Dosage: {p.dosage}</p>}
                {p.frequency && <p className="text-xs text-muted-foreground">Frequency: {p.frequency}</p>}
                {p.duration && <p className="text-xs text-muted-foreground">Duration: {p.duration}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Approved / Recommended Services */}
      {(approvedServices.length > 0 || aiServices.length > 0) && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Stethoscope className="h-4 w-4 text-primary" />
            {response.dr_status === "approved" ? "Approved Services" : "Recommended Services"}
            <Badge variant="outline" className="text-[10px]">
              {(response.dr_status === "approved" ? approvedServices : aiServices).length}
            </Badge>
          </div>
          <div className="space-y-2">
            {(response.dr_status === "approved" ? approvedServices : aiServices).map((s: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 bg-muted/30">
                <p className="text-sm font-medium">{s.service_name || s.name || "Service"}</p>
                {s.advice && <p className="text-xs text-muted-foreground mt-0.5">{s.advice}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Doctor Notes */}
      {response.dr_notes && (
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-semibold">Doctor Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{response.dr_notes}</p>
          {reviewer && (
            <p className="text-[10px] text-muted-foreground">
              Reviewed by Dr. {reviewer.first_name} {reviewer.last_name}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
