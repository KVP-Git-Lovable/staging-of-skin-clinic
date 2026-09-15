import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, Search, Copy, Send, Mic, MicOff, Sparkles, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

interface Question {
  id?: string;
  question_text: string;
  question_type: string;
  options: string[];
  ideal_answer: any;
  sort_order: number;
}

interface TemplateProduct {
  id?: string;
  product_id: string;
  product_name?: string;
  advice_text: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

interface TemplateService {
  id?: string;
  service_id: string;
  service_name?: string;
  advice_text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
}

export function SurveyTemplateForm({ open, onOpenChange, templateId }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("basic");

  // Basic fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ageMin, setAgeMin] = useState(0);
  const [ageMax, setAgeMax] = useState(120);
  const [problemAreaId, setProblemAreaId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [isActive, setIsActive] = useState(true);

  // AI bar
  const [dictation, setDictation] = useState("");
  const [elaborating, setElaborating] = useState(false);
  const [descShimmer, setDescShimmer] = useState(false);
  const lastParsedRef = useRef("");
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speech = useSpeechRecognition({
    language: "en-IN",
    continuous: true,
    interimResults: true,
    onFinal: (text) => {
      setDictation((prev) => (prev ? prev + " " : "") + text);
    },
  });

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<Question[]>([]);
  const [suggestCount, setSuggestCount] = useState(10);
  const [suggesting, setSuggesting] = useState(false);

  // Products & Services
  const [templateProducts, setTemplateProducts] = useState<TemplateProduct[]>([]);
  const [templateServices, setTemplateServices] = useState<TemplateService[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");

  // Lookups
  const { data: problemAreas = [] } = useQuery({
    queryKey: ["problem-areas"],
    queryFn: async () => {
      const { data } = await supabase.from("problem_areas").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["pharma-products"],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_products").select("id, name").order("name");
      return data || [];
    },
  });

  // Load template data
  useEffect(() => {
    if (!open) return;
    if (!templateId) {
      resetForm();
      return;
    }
    loadTemplate();
  }, [open, templateId]);

  const resetForm = () => {
    setName(""); setDescription(""); setAgeMin(0); setAgeMax(120);
    setProblemAreaId(""); setServiceId(""); setIsActive(true);
    setQuestions([]); setSuggestedQuestions([]); setTemplateProducts([]); setTemplateServices([]);
    setTab("basic");
    setDictation(""); lastParsedRef.current = "";
  };

  const loadTemplate = async () => {
    const { data: t } = await supabase.from("survey_templates").select("*").eq("id", templateId!).single();
    if (!t) return;
    setName(t.name); setDescription(t.description || ""); setAgeMin(t.age_range_min || 0);
    setAgeMax(t.age_range_max || 120); setProblemAreaId(t.problem_area_id || "");
    setServiceId(t.service_id || ""); setIsActive(t.is_active ?? true);

    const { data: qs } = await supabase.from("survey_questions").select("*").eq("template_id", templateId!).order("sort_order");
    setQuestions((qs || []).map((q: any) => ({
      id: q.id, question_text: q.question_text, question_type: q.question_type,
      options: Array.isArray(q.options) ? q.options : [], ideal_answer: q.ideal_answer || {},
      sort_order: q.sort_order,
    })));

    const { data: prods } = await supabase.from("survey_template_products").select("*, pharma_products(name)").eq("template_id", templateId!);
    setTemplateProducts((prods || []).map((p: any) => ({
      id: p.id, product_id: p.product_id, product_name: p.pharma_products?.name, advice_text: p.advice_text || "",
      dosage: p.dosage || "", frequency: p.frequency || "", duration: p.duration || "", instructions: p.instructions || "",
    })));

    const { data: svcs } = await supabase.from("survey_template_services").select("*, services(name)").eq("template_id", templateId!);
    setTemplateServices((svcs || []).map((s: any) => ({
      id: s.id, service_id: s.service_id, service_name: s.services?.name, advice_text: s.advice_text || "",
    })));
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      question_text: "", question_type: "text", options: [], ideal_answer: {}, sort_order: questions.length,
    }]);
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const addProduct = (productId: string) => {
    if (templateProducts.some(p => p.product_id === productId)) return;
    const prod = products.find((p: any) => p.id === productId);
    setTemplateProducts([...templateProducts, { product_id: productId, product_name: prod?.name, advice_text: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  };

  const addService = (svcId: string) => {
    if (templateServices.some(s => s.service_id === svcId)) return;
    const svc = services.find((s: any) => s.id === svcId);
    setTemplateServices([...templateServices, { service_id: svcId, service_name: svc?.name, advice_text: "" }]);
  };

  const saveTemplate = async (targetId: string | null, approvalStatus?: string) => {
    if (!name.trim()) { toast.error("Template name is required"); return null; }
    setSaving(true);
    try {
      let tplId = targetId;
      const templateData: any = {
        name, description, age_range_min: ageMin, age_range_max: ageMax,
        problem_area_id: problemAreaId || null, service_id: serviceId || null, is_active: isActive,
      };
      if (approvalStatus) templateData.approval_status = approvalStatus;

      if (tplId) {
        const { error } = await supabase.from("survey_templates").update(templateData).eq("id", tplId);
        if (error) throw error;
      } else {
        if (!approvalStatus) templateData.approval_status = "draft";
        const { data, error } = await supabase.from("survey_templates").insert(templateData).select("id").single();
        if (error) throw error;
        tplId = data.id;
      }

      // Sync questions
      await supabase.from("survey_questions").delete().eq("template_id", tplId!);
      if (questions.length > 0) {
        const qRows = questions.map((q, i) => ({
          template_id: tplId!, question_text: q.question_text, question_type: q.question_type,
          options: q.options, ideal_answer: q.ideal_answer, sort_order: i,
        }));
        const { error } = await supabase.from("survey_questions").insert(qRows);
        if (error) throw error;
      }

      // Sync products
      await supabase.from("survey_template_products").delete().eq("template_id", tplId!);
      if (templateProducts.length > 0) {
        const pRows = templateProducts.map(p => ({
          template_id: tplId!, product_id: p.product_id, advice_text: p.advice_text,
          dosage: p.dosage || null, frequency: p.frequency || null, duration: p.duration || null, instructions: p.instructions || null,
        }));
        const { error } = await supabase.from("survey_template_products").insert(pRows);
        if (error) throw error;
      }

      // Sync services
      await supabase.from("survey_template_services").delete().eq("template_id", tplId!);
      if (templateServices.length > 0) {
        const sRows = templateServices.map(s => ({
          template_id: tplId!, service_id: s.service_id, advice_text: s.advice_text,
        }));
        const { error } = await supabase.from("survey_template_services").insert(sRows);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["survey-templates"] });
      return tplId;
    } catch (e: any) {
      toast.error(e.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const result = await saveTemplate(templateId);
    if (result) {
      toast.success(templateId ? "Template updated" : "Template created");
      onOpenChange(false);
    }
  };

  const handleSaveAsNew = async () => {
    const cloneName = name.trim() + " (Copy)";
    setName(cloneName);
    const result = await saveTemplate(null, "draft");
    if (result) {
      toast.success("Saved as new template (Draft)");
      onOpenChange(false);
    }
  };

  const handleSendForApproval = async () => {
    const result = await saveTemplate(templateId, "pending_approval");
    if (result) {
      toast.success("Template sent for approval");
      onOpenChange(false);
    }
  };

  const filteredProducts = products.filter((p: any) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) &&
    !templateProducts.some(tp => tp.product_id === p.id)
  );

  const filteredServices = services.filter((s: any) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase()) &&
    !templateServices.some(ts => ts.service_id === s.id)
  );

  // Parse spoken/typed dictation into form fields
  const parseDictation = (text: string) => {
    if (!text.trim() || text === lastParsedRef.current) return;
    lastParsedRef.current = text;
    let consumed = "";
    const t = text.replace(/\s+/g, " ").trim();

    const matchAndConsume = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
      const m = t.match(re);
      if (m) { fn(m); consumed += " " + m[0]; }
    };

    matchAndConsume(/template name (?:is |:\s*)([^.,;]+?)(?=(?:,|\.|$|\s+(?:description|age|problem|service|active|inactive)\b))/i,
      (m) => setName(m[1].trim()));
    matchAndConsume(/(?:description (?:is |:\s*)|this survey covers )([^.;]+?)(?=(?:\.|;|$|\s+(?:age|problem|service|active|inactive|template)\b))/i,
      (m) => setDescription(m[1].trim()));
    matchAndConsume(/age range (?:from )?(\d{1,3})\s*(?:to|-|–)\s*(\d{1,3})/i,
      (m) => { setAgeMin(Number(m[1])); setAgeMax(Number(m[2])); });

    matchAndConsume(/problem area (?:is |:\s*)([^.,;]+?)(?=(?:,|\.|$|\s+(?:service|age|active|inactive|template|description)\b))/i,
      (m) => {
        const term = m[1].trim().toLowerCase();
        const hit = (problemAreas as any[]).find(p => p.name.toLowerCase() === term)
          || (problemAreas as any[]).find(p => p.name.toLowerCase().includes(term) || term.includes(p.name.toLowerCase()));
        if (hit) setProblemAreaId(hit.id);
        else toast.info(`Primary concern "${m[1].trim()}" not found`);
      });

    matchAndConsume(/service (?:type )?(?:is |:\s*)([^.,;]+?)(?=(?:,|\.|$|\s+(?:problem|age|active|inactive|template|description)\b))/i,
      (m) => {
        const term = m[1].trim().toLowerCase();
        const hit = (services as any[]).find(s => s.name.toLowerCase() === term)
          || (services as any[]).find(s => s.name.toLowerCase().includes(term) || term.includes(s.name.toLowerCase()));
        if (hit) setServiceId(hit.id);
        else toast.info(`Service "${m[1].trim()}" not found`);
      });

    if (/\binactive\b/i.test(t)) { setIsActive(false); consumed += " inactive"; }
    else if (/\bactive\b/i.test(t)) { setIsActive(true); consumed += " active"; }

    // Fallback: leftover text → append to description
    let leftover = t;
    consumed.split(/\s+/).filter(Boolean).forEach(w => {
      leftover = leftover.replace(w, "");
    });
    leftover = leftover.replace(/\s+/g, " ").trim().replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "");
    if (leftover && leftover.length > 6 && !/^(and|the|a|is|to)$/i.test(leftover)) {
      setDescription((d) => d ? (d.trim().replace(/[.;]?\s*$/, ". ") + leftover) : leftover);
    }
    toast.success("Fields filled from dictation");
  };

  // Auto-parse 1.2s after dictation settles
  useEffect(() => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    if (!dictation.trim() || speech.listening) return;
    parseTimerRef.current = setTimeout(() => parseDictation(dictation), 1200);
    return () => { if (parseTimerRef.current) clearTimeout(parseTimerRef.current); };
  }, [dictation, speech.listening]);

  const elaborateAll = async () => {
    if (!name.trim() && !description.trim()) {
      toast.info("Add a template name first, then Elaborate.");
      return;
    }
    setElaborating(true);
    setDescShimmer(true);
    try {
      const problemArea = (problemAreas as any[]).find(p => p.id === problemAreaId)?.name || "";
      const serviceType = (services as any[]).find(s => s.id === serviceId)?.name || "";
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/survey-template-elaborate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ name, description, problemArea, serviceType, ageMin, ageMax }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Elaborate failed");
      if (json.description) setDescription(json.description);
      toast.success("Description elaborated");
    } catch (e: any) {
      toast.error(e.message || "Failed to elaborate");
    } finally {
      setElaborating(false);
      setTimeout(() => setDescShimmer(false), 400);
    }
  };

  const suggestQuestions = async () => {
    if (!description.trim()) {
      toast.info("Add a description first, then Suggest Questions.");
      return;
    }
    setSuggesting(true);
    try {
      const problemArea = (problemAreas as any[]).find(p => p.id === problemAreaId)?.name || "";
      const serviceType = (services as any[]).find(s => s.id === serviceId)?.name || "";
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/survey-question-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ description, problemArea, serviceType, ageMin, ageMax, count: suggestCount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Suggest failed");
      const incoming: Question[] = (json.questions || []).map((q: any) => ({
        question_text: q.question_text || "",
        question_type: q.question_type || "text",
        options: Array.isArray(q.options) ? q.options : [],
        ideal_answer: {},
        sort_order: 0,
      })).filter((q: Question) => q.question_text.trim());
      if (incoming.length === 0) {
        toast.info("No questions generated — try adding more detail to the description.");
      } else {
        setSuggestedQuestions((prev) => [...prev, ...incoming]);
        toast.success(`${incoming.length} suggested question${incoming.length === 1 ? "" : "s"} — review and accept below`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to suggest questions");
    } finally {
      setSuggesting(false);
    }
  };

  const acceptSuggestion = (index: number) => {
    const q = suggestedQuestions[index];
    if (!q) return;
    setQuestions((prev) => [...prev, { ...q, sort_order: prev.length }]);
    setSuggestedQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const rejectSuggestion = (index: number) => {
    setSuggestedQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const questionTypeLabel = (t: string) =>
    t === "single_choice" ? "Single Choice" : t === "multi_choice" ? "Multi Choice" : t === "scale" ? "Scale (1-10)" : "Text";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{templateId ? "Edit Survey Template" : "New Survey Template"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="basic" className="flex-1 text-xs">Basic Info</TabsTrigger>
            <TabsTrigger value="questions" className="flex-1 text-xs">Questions ({questions.length})</TabsTrigger>
            <TabsTrigger value="products" className="flex-1 text-xs">Products ({templateProducts.length})</TabsTrigger>
            <TabsTrigger value="services" className="flex-1 text-xs">Services ({templateServices.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            {/* Unified AI bar */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">AI Assist — dictate or elaborate</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={speech.listening ? "destructive" : "outline"}
                    className="h-8 gap-1.5"
                    onClick={() => (speech.listening ? speech.stop() : speech.start())}
                    disabled={!speech.supported}
                    title={speech.supported ? "Voice dictation" : "Voice not supported in this browser"}
                  >
                    {speech.listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    {speech.listening ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        Listening
                      </span>
                    ) : "Dictate"}
                  </Button>
                  <Button type="button" size="sm" className="h-8 gap-1.5" onClick={elaborateAll} disabled={elaborating}>
                    {elaborating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    AI Elaborate All
                  </Button>
                </div>
              </div>
              <Textarea
                value={dictation + (speech.interimTranscript ? (dictation ? " " : "") + speech.interimTranscript : "")}
                onChange={(e) => setDictation(e.target.value)}
                placeholder='Speak or type, e.g. "Template name is Acne Assessment, age range 18 to 35, primary concern is acne, service type is consultation, active."'
                rows={2}
                className="bg-background text-sm"
              />
              {dictation && !speech.listening && (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDictation(""); lastParsedRef.current = ""; }}>
                    Clear
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => parseDictation(dictation)}>
                    Parse & Fill Fields
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label>Template Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acne Assessment (18-35)" className="mt-1.5" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this survey covers..."
                rows={2}
                className={`mt-1.5 transition-all ${descShimmer ? "opacity-60 animate-pulse" : ""}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Age Range Min</Label>
                <Input type="number" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className="mt-1.5" />
              </div>
              <div>
                <Label>Age Range Max</Label>
                <Input type="number" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Primary Concern</Label>
              <Select value={problemAreaId || "none"} onValueChange={(v) => setProblemAreaId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select primary concern" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any</SelectItem>
                  {problemAreas.map((pa: any) => <SelectItem key={pa.id} value={pa.id}>{pa.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type</Label>
              <Select value={serviceId || "none"} onValueChange={(v) => setServiceId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any</SelectItem>
                  {services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Active</Label>
            </div>
          </TabsContent>

          <TabsContent value="questions" className="space-y-4 mt-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">AI Suggest Questions</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    Uses the description in Basic Info, in plain patient-friendly language.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={1} max={30}
                    value={suggestCount}
                    onChange={(e) => setSuggestCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                    className="h-8 w-16 text-center"
                  />
                  <Button type="button" size="sm" className="h-8 gap-1.5" onClick={suggestQuestions} disabled={suggesting}>
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Suggest
                  </Button>
                </div>
              </div>
            </div>

            {suggestedQuestions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Suggested Questions ({suggestedQuestions.length}) — accept the ones you want
                  </Label>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setSuggestedQuestions([])}>
                    Dismiss all
                  </Button>
                </div>
                {suggestedQuestions.map((q, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-dashed p-3 bg-primary/[0.03]">
                    <div className="min-w-0">
                      <p className="text-sm">{q.question_text}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px]">{questionTypeLabel(q.question_type)}</Badge>
                        {q.options.length > 0 && (
                          <span className="text-[10px] text-muted-foreground truncate">{q.options.join(" · ")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-success hover:text-success" title="Accept" onClick={() => acceptSuggestion(i)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Reject" onClick={() => rejectSuggestion(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {questions.map((q, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span>Q{i + 1}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeQuestion(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={q.question_text}
                  onChange={(e) => updateQuestion(i, "question_text", e.target.value)}
                  placeholder="Enter your question..."
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={q.question_type} onValueChange={(v) => updateQuestion(i, "question_type", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="single_choice">Single Choice</SelectItem>
                        <SelectItem value="multi_choice">Multi Choice</SelectItem>
                        <SelectItem value="scale">Scale (1-10)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {q.question_type === "scale" && (
                    <div>
                      <Label className="text-xs">Ideal Score (1-10)</Label>
                      <Input
                        type="number" min={1} max={10}
                        value={q.ideal_answer?.value || ""}
                        onChange={(e) => updateQuestion(i, "ideal_answer", { value: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
                {(q.question_type === "single_choice" || q.question_type === "multi_choice") && (
                  <div className="space-y-2">
                    <Label className="text-xs">Options (comma-separated)</Label>
                    <Input
                      value={q.options.join(", ")}
                      onChange={(e) => updateQuestion(i, "options", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                      placeholder="Option 1, Option 2, Option 3"
                    />
                    <div>
                      <Label className="text-xs">Ideal Answer</Label>
                      <Input
                        value={q.ideal_answer?.value || ""}
                        onChange={(e) => updateQuestion(i, "ideal_answer", { value: e.target.value })}
                        placeholder="The ideal/expected answer"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
                {q.question_type === "text" && (
                  <div>
                    <Label className="text-xs">Ideal Answer (keywords or expected response)</Label>
                    <Input
                      value={q.ideal_answer?.value || ""}
                      onChange={(e) => updateQuestion(i, "ideal_answer", { value: e.target.value })}
                      placeholder="Expected keywords or answer"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" className="w-full gap-2" onClick={addQuestion}>
              <Plus className="h-4 w-4" /> Add Question
            </Button>
          </TabsContent>

          <TabsContent value="products" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products to add..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9" />
            </div>
            {productSearch && filteredProducts.length > 0 && (
              <div className="border rounded-lg max-h-32 overflow-y-auto">
                {filteredProducts.slice(0, 10).map((p: any) => (
                  <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { addProduct(p.id); setProductSearch(""); }}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            {templateProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No products added yet. Search above to add.</p>
            ) : (
              <div className="space-y-3">
                {templateProducts.map((tp, i) => {
                  const updateField = (field: keyof TemplateProduct, value: string) => {
                    const updated = [...templateProducts];
                    (updated[i] as any)[field] = value;
                    setTemplateProducts(updated);
                  };
                  return (
                    <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{tp.product_name || tp.product_id}</Badge>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTemplateProducts(templateProducts.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input
                        value={tp.advice_text}
                        onChange={(e) => updateField("advice_text", e.target.value)}
                        placeholder="Advice text for this product..."
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Dosage</Label>
                          <Input
                            value={tp.dosage || ""}
                            onChange={(e) => updateField("dosage", e.target.value)}
                            placeholder="e.g. 1 tablet"
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Frequency</Label>
                          <Input
                            value={tp.frequency || ""}
                            onChange={(e) => updateField("frequency", e.target.value)}
                            placeholder="e.g. Twice daily"
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Duration</Label>
                          <Input
                            value={tp.duration || ""}
                            onChange={(e) => updateField("duration", e.target.value)}
                            placeholder="e.g. 7 days"
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Special Instructions</Label>
                          <Input
                            value={tp.instructions || ""}
                            onChange={(e) => updateField("instructions", e.target.value)}
                            placeholder="e.g. After meals"
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="services" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search services to add..." value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} className="pl-9" />
            </div>
            {serviceSearch && filteredServices.length > 0 && (
              <div className="border rounded-lg max-h-32 overflow-y-auto">
                {filteredServices.slice(0, 10).map((s: any) => (
                  <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { addService(s.id); setServiceSearch(""); }}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {templateServices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No services added yet. Search above to add.</p>
            ) : (
              <div className="space-y-3">
                {templateServices.map((ts, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{ts.service_name || ts.service_id}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTemplateServices(templateServices.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={ts.advice_text}
                      onChange={(e) => {
                        const updated = [...templateServices];
                        updated[i].advice_text = e.target.value;
                        setTemplateServices(updated);
                      }}
                      placeholder="Advice text for this service..."
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {templateId && (
            <>
              <Button variant="outline" onClick={handleSaveAsNew} disabled={saving} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" /> Save as New
              </Button>
              <Button variant="outline" onClick={handleSendForApproval} disabled={saving} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> Send for Approval
              </Button>
            </>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : templateId ? "Update Template" : "Create Template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
