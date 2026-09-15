import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Home, Calendar, ClipboardList, Camera, Receipt, Pill,
  LogOut, Clock, User, ChevronRight, Plus, Send, Loader2, Stethoscope,
  MessageCircle, ShoppingBag, ClipboardCheck, Eye, Download,
} from "lucide-react";
import PortalShop from "@/components/portal/PortalShop";
import PortalBot from "@/components/portal/PortalBot";
import PortalSurveyFill from "@/components/portal/PortalSurveyFill";
import clinicLogo from "@/assets/skin-clinic-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { portalRequest, PortalSessionError, clearPortalSession } from "@/lib/portalApi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PortalSession {
  patientId: string;
  sessionToken: string;
  patientName: string;
  expiresAt: string;
}

const tabs = [
  { id: "home", label: "Home", icon: Home },
  { id: "appointments", label: "Appts", icon: Calendar },
  { id: "procedures", label: "History", icon: ClipboardList },
  { id: "photos", label: "Photos", icon: Camera },
  { id: "billing", label: "Bills", icon: Receipt },
  { id: "pharmacy", label: "Shop", icon: ShoppingBag },
  { id: "surveys", label: "Surveys", icon: ClipboardCheck },
  { id: "bot", label: "AI Bot", icon: MessageCircle },
];

function PortalSurveysList({ patientId, onOpen }: { patientId: string; onOpen: (templateId: string, assignmentId?: string) => void }) {
  const { data: assigned = [] } = useQuery({
    queryKey: ["portal-assigned-surveys", patientId],
    queryFn: async () => {
      return (await portalRequest("assigned_surveys")) || [];
    },
    enabled: !!patientId,
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-lg mb-2">Assigned Surveys</h2>
        {assigned.length === 0 ? (
          <div className="bg-card rounded-xl border p-4 text-sm text-muted-foreground text-center">
            No surveys assigned by your clinic yet.
          </div>
        ) : (
          <div className="space-y-2">
            {assigned.map((a: any) => (
              <button
                key={a.id}
                onClick={() => onOpen(a.template_id, a.id)}
                className="w-full text-left bg-card rounded-xl border shadow-sm p-4 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{a.survey_templates?.name || "Survey"}</p>
                  {a.survey_templates?.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{a.survey_templates.description}</p>
                  )}
                  <Badge variant="secondary" className="mt-1.5 text-[10px]">Assigned by clinic</Badge>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Portal = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const tabSlugMap: Record<string, string> = {
    home: "home",
    appointments: "appointments",
    appts: "appointments",
    procedures: "procedures",
    history: "procedures",
    photos: "photos",
    bills: "billing",
    billing: "billing",
    invoices: "billing",
    pharmacy: "pharmacy",
    shop: "pharmacy",
    bot: "bot",
    surveys: "surveys",
  };
  const tabToUrlSlug: Record<string, string> = {
    home: "home",
    appointments: "appointments",
    procedures: "history",
    photos: "photos",
    billing: "bills",
    pharmacy: "pharmacy",
    surveys: "surveys",
    bot: "ai-bot",
  };
  const initialTab = (tabParam && tabSlugMap[tabParam.toLowerCase()]) || "home";
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => {
    if (tabParam && tabSlugMap[tabParam.toLowerCase()]) {
      setActiveTab(tabSlugMap[tabParam.toLowerCase()]);
    }
  }, [tabParam]);
  const [session, setSession] = useState<PortalSession | null>(null);
  const [apptOpen, setApptOpen] = useState(false);
  const [pharmaOpen, setPharmaOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<any>(null);
  const [activeSurvey, setActiveSurvey] = useState<{ templateId: string; assignmentId?: string } | null>(null);

  // Appointment request form
  const [apptService, setApptService] = useState("");
  const [apptDate, setApptDate] = useState("");
  const [apptTime, setApptTime] = useState("");
  const [apptNotes, setApptNotes] = useState("");

  // Pharma request form
  const [pharmaProductId, setPharmaProductId] = useState("");
  const [pharmaQty, setPharmaQty] = useState(1);
  const [pharmaNotes, setPharmaNotes] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("portal_session");
    if (!stored) {
      navigate("/portal");
      return;
    }
    const parsed = JSON.parse(stored) as PortalSession;
    if (new Date(parsed.expiresAt) < new Date()) {
      localStorage.removeItem("portal_session");
      navigate("/portal");
      return;
    }
    setSession(parsed);
  }, [navigate]);

  const patientId = session?.patientId;


  const logout = () => {
    localStorage.removeItem("portal_session");
    navigate("/portal");
  };

  // A rejected session must send the patient back to sign-in rather than
  // leaving them staring at an empty profile or billing page.
  const handleQueryError = (error: unknown) => {
    if (error instanceof PortalSessionError) {
      clearPortalSession();
      toast.error(error.message);
      navigate("/portal");
    }
  };

  // ─── Queries ─────────────────────────────────────
  const { data: patient, error: patientError, refetch: refetchPatient } = useQuery({
    queryKey: ["portal-patient", patientId],
    queryFn: async () => {
      return await portalRequest("profile");
    },
    enabled: !!patientId,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["portal-appointments", patientId],
    queryFn: async () => {
      return (await portalRequest("appointments")) || [];
    },
    enabled: !!patientId,
  });

  const { data: procedures = [] } = useQuery({
    queryKey: ["portal-procedures", patientId],
    queryFn: async () => {
      return (await portalRequest("procedures")) || [];
    },
    enabled: !!patientId,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ["portal-photos", patientId],
    queryFn: async () => {
      return (await portalRequest("photos")) || [];
    },
    enabled: !!patientId,
  });

  const { data: invoices = [], error: invoicesError, refetch: refetchInvoices } = useQuery({
    queryKey: ["portal-invoices", patientId],
    queryFn: async () => {
      return (await portalRequest("invoices")) || [];
    },
    enabled: !!patientId,
  });

  const { data: pharmaProducts = [] } = useQuery({
    queryKey: ["portal-pharma-products"],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_products").select("*").order("name");
      return data || [];
    },
  });

  const { data: pharmaRequests = [] } = useQuery({
    queryKey: ["portal-pharma-requests", patientId],
    queryFn: async () => {
      return (await portalRequest("pharma_requests")) || [];
    },
    enabled: !!patientId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["portal-staff-active-list", patientId],
    queryFn: async () => {
      return (await portalRequest("staff")) || [];
    },
    enabled: !!patientId,
  });

  useEffect(() => {
    handleQueryError(patientError);
    handleQueryError(invoicesError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientError, invoicesError]);

  const { data: workingHours = [] } = useQuery({
    queryKey: ["portal-working-hours"],
    queryFn: async () => {
      const { data } = await supabase.from("working_hours").select("*").eq("is_open", true).order("day_of_week");
      return data || [];
    },
  });

  const { data: portalSettings } = useQuery({
    queryKey: ["portal-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("portal_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });
  const ps: any = portalSettings || {};
  const flag = (key: string) => ps[key] !== false; // default true
  const shopEnabled = flag("shop_enabled");
  const apptsBookingEnabled = flag("appointments_booking_enabled");
  const apptsRescheduleEnabled = flag("appointments_reschedule_enabled");
  const treatmentHistoryEnabled = flag("treatment_history_enabled");
  const procedureHistoryEnabled = flag("procedure_history_enabled");
  const clinicalPhotosEnabled = flag("clinical_photos_enabled");
  const billsEnabled = flag("bills_enabled");
  const outstandingBalanceEnabled = flag("outstanding_balance_enabled");
  const surveysEnabled = flag("surveys_enabled");
  const aiBotEnabled = flag("ai_bot_enabled");
  const ourTeamEnabled = flag("our_team_enabled");
  const clinicHoursEnabled = flag("clinic_hours_enabled");
  const qaRequestApptEnabled = flag("quick_action_request_appointment_enabled");
  const qaOrderMedicineEnabled = flag("quick_action_order_medicine_enabled");
  const historyTabEnabled = treatmentHistoryEnabled || procedureHistoryEnabled;
  const apptsTabEnabled = apptsBookingEnabled || true; // viewing appointments always allowed; booking gated separately

  const visibleTabs = tabs.filter((t) => {
    if (t.id === "pharmacy") return shopEnabled;
    if (t.id === "procedures") return historyTabEnabled;
    if (t.id === "photos") return clinicalPhotosEnabled;
    if (t.id === "billing") return billsEnabled;
    if (t.id === "surveys") return surveysEnabled;
    if (t.id === "bot") return aiBotEnabled;
    return true;
  });

  // Reset to home if active tab gets hidden
  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === activeTab)) {
      setActiveTab("home");
      navigate("/portal/home", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopEnabled, historyTabEnabled, clinicalPhotosEnabled, billsEnabled, surveysEnabled, aiBotEnabled]);

  // ─── Mutations ──────────────────────────────────
  const requestAppointment = useMutation({
    mutationFn: async () => {
      const startTime = new Date(`${apptDate}T${apptTime}`);
      const endTime = new Date(startTime.getTime() + 30 * 60000);
      await portalRequest("create_appointment_request", {
        patientName: session?.patientName,
        service: apptService,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-appointments"] });
      toast.success("Appointment request submitted!");
      setApptOpen(false);
      setApptService("");
      setApptDate("");
      setApptTime("");
      setApptNotes("");
    },
    onError: () => toast.error("Failed to submit request"),
  });

  const requestPharma = useMutation({
    mutationFn: async () => {
      const product = pharmaProducts.find((p: any) => p.id === pharmaProductId);
      await portalRequest("create_pharma_request", {
        productId: pharmaProductId,
        productName: product?.name || "",
        quantity: pharmaQty,
        notes: pharmaNotes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-pharma-requests"] });
      toast.success("Product request submitted!");
      setPharmaOpen(false);
      setPharmaProductId("");
      setPharmaQty(1);
      setPharmaNotes("");
    },
    onError: () => toast.error("Failed to submit request"),
  });

  if (!session) return null;

  const upcomingAppts = appointments.filter((a: any) => new Date(a.start_time) >= new Date());
  const pastAppts = appointments.filter((a: any) => new Date(a.start_time) < new Date());
  const totalDue = invoices
    .filter((i: any) => i.status !== "Paid")
    .reduce((s: number, i: any) => s + (Number(i.total_amount) - Number(i.paid_amount)), 0);

  const statusColors: Record<string, string> = {
    Scheduled: "bg-primary/10 text-primary",
    Requested: "bg-warning/10 text-warning",
    Completed: "bg-success/10 text-success",
    Cancelled: "bg-destructive/10 text-destructive",
    Confirmed: "bg-primary/10 text-primary",
  };

  const invoiceStatusColors: Record<string, string> = {
    Paid: "bg-success/10 text-success",
    Partial: "bg-warning/10 text-warning",
    Pending: "bg-destructive/10 text-destructive",
  };

  const getInvoicePdfUrl = async (inv: any): Promise<string | null> => {
    if (!inv?.id) return null;
    // Always regenerate to pick up the latest line items, pricing, HSN, GST and
    // clinic details. The cached pdf_url can be stale (older function version or
    // CDN-cached) so we re-run the builder and cache-bust the resulting URL.
    const { error } = await supabase.functions.invoke("generate-invoice-pdf", {
      body: { invoiceId: inv.id },
    });
    if (error) {
      console.error("PDF generate failed:", error);
      // Fall back to the cached URL if regeneration failed
      return inv?.pdf_url ? `${inv.pdf_url}?t=${Date.now()}` : null;
    }
    // Edge fn rebuilds in background; poll the row briefly for updated pdf_url
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const row = await portalRequest<any>("invoice_pdf_url", { invoiceId: inv.id }).catch(() => null);
      if (row?.pdf_url) return `${row.pdf_url}?t=${Date.now()}`;
    }
    return inv?.pdf_url ? `${inv.pdf_url}?t=${Date.now()}` : null;
  };

  const viewInvoicePdf = async (inv: any) => {
    const win = window.open("", "_blank");
    const url = await getInvoicePdfUrl(inv);
    if (!url) {
      toast.error("Failed to open invoice PDF");
      if (win) win.close();
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["portal-invoices"] });
    if (win) win.location.href = url;
    else window.location.href = url;
  };

  const downloadInvoicePdf = async (inv: any) => {
    const url = await getInvoicePdfUrl(inv);
    if (!url) {
      toast.error("Failed to download invoice PDF");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["portal-invoices"] });
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${inv.invoice_number || "invoice"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const requestStatusColors: Record<string, string> = {
    Pending: "bg-warning/10 text-warning",
    Confirmed: "bg-success/10 text-success",
    Declined: "bg-destructive/10 text-destructive",
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary to-[hsl(174,62%,30%)] text-primary-foreground px-4 py-4 safe-area-top">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={clinicLogo} alt="The Skin Clinic" className="h-9 w-9 rounded-lg bg-white object-contain p-0.5" />
            <div>
              <p className="font-bold text-sm" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>The Skin Clinic</p>
              <p className="text-xs opacity-80">Patient Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs opacity-80">Welcome</p>
              <p className="text-sm font-semibold">{session.patientName}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <div className="max-w-lg mx-auto px-4 py-5">
          {patientError && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
              <p className="text-sm text-destructive mb-3">We couldn't load your details right now.</p>
              <Button variant="outline" size="sm" onClick={() => refetchPatient()}>Try again</Button>
            </div>
          )}
          <AnimatePresence mode="wait">
            {/* ─── HOME ─── */}
            {activeTab === "home" && (
              <motion.div key="home" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card rounded-xl p-4 border shadow-sm">
                    <Calendar className="h-5 w-5 text-primary mb-2" />
                    <p className="text-2xl font-bold">{upcomingAppts.length}</p>
                    <p className="text-xs text-muted-foreground">Upcoming Appointments</p>
                  </div>
                  {outstandingBalanceEnabled && (
                    <div className="bg-card rounded-xl p-4 border shadow-sm">
                      <Receipt className="h-5 w-5 text-warning mb-2" />
                      <p className="text-2xl font-bold">₹{totalDue.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                    </div>
                  )}
                  <div className="bg-card rounded-xl p-4 border shadow-sm">
                    <ClipboardList className="h-5 w-5 text-success mb-2" />
                    <p className="text-2xl font-bold">{procedures.length}</p>
                    <p className="text-xs text-muted-foreground">Total Procedures</p>
                  </div>
                  {clinicalPhotosEnabled && (
                    <div className="bg-card rounded-xl p-4 border shadow-sm">
                      <Camera className="h-5 w-5 text-accent-foreground mb-2" />
                      <p className="text-2xl font-bold">{photos.length}</p>
                      <p className="text-xs text-muted-foreground">Clinical Photos</p>
                    </div>
                  )}
                </div>

                {/* Quick actions */}
                {(qaRequestApptEnabled || qaOrderMedicineEnabled) && (
                  <div className="bg-card rounded-xl border shadow-sm p-4">
                    <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {qaRequestApptEnabled && apptsBookingEnabled && (
                        <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => { setActiveTab("appointments"); setApptOpen(true); }}>
                          <Plus className="h-4 w-4 text-primary" />
                          <span className="text-xs">Request Appointment</span>
                        </Button>
                      )}
                      {qaOrderMedicineEnabled && shopEnabled && (
                        <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => setActiveTab("pharmacy")}>
                          <Pill className="h-4 w-4 text-primary" />
                          <span className="text-xs">Order Medicine</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Doctor availability */}
                {clinicHoursEnabled && (
                <div className="bg-card rounded-xl border shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-primary" /> Clinic Hours
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Mon – Sat</span>
                      <span className="font-medium">10:00 AM – 8:00 PM</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sun</span>
                      <span className="font-medium text-destructive">Closed</span>
                    </div>
                  </div>
                </div>
                )}

                {/* Staff */}
                {ourTeamEnabled && staff.length > 0 && (
                  <div className="bg-card rounded-xl border shadow-sm p-4">
                    <h3 className="font-semibold text-sm mb-3">Our Team</h3>
                    <div className="space-y-2">
                      {staff.map((s: any) => (
                        <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors" onClick={() => setSelectedStaff(s)}>
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {s.first_name?.[0] || "S"}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{s.first_name} {s.last_name}</p>
                            {s.specialization && <p className="text-xs text-muted-foreground">{s.specialization}</p>}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next appointment */}
                {upcomingAppts.length > 0 && (
                  <div className="bg-primary/5 rounded-xl border border-primary/20 p-4">
                    <h3 className="font-semibold text-sm mb-2 text-primary">Next Appointment</h3>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{(upcomingAppts[0] as any).service}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date((upcomingAppts[0] as any).start_time).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
                          {" at "}
                          {new Date((upcomingAppts[0] as any).start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── APPOINTMENTS ─── */}
            {activeTab === "appointments" && (
              <motion.div key="appointments" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-lg">Appointments</h2>
                  {apptsBookingEnabled && (
                    <Button size="sm" className="gap-1" onClick={() => setApptOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Request
                    </Button>
                  )}
                </div>

                {upcomingAppts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Upcoming</p>
                    <div className="space-y-2">
                      {upcomingAppts.map((a: any) => (
                        <div key={a.id} className="bg-card rounded-xl border p-4 shadow-sm">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{a.service}</p>
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(a.start_time).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
                                {" • "}
                                {new Date(a.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              {a.staff && <p className="text-xs text-muted-foreground mt-0.5">Dr. {a.staff.first_name} {a.staff.last_name}</p>}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[a.status] || ""}`}>
                              {a.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pastAppts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Past</p>
                    <div className="space-y-2">
                      {pastAppts.slice(0, 10).map((a: any) => (
                        <div key={a.id} className="bg-card rounded-xl border p-3 shadow-sm opacity-70">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{a.service}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(a.start_time).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[a.status] || ""}`}>
                              {a.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {appointments.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No appointments yet</p>
                    {apptsBookingEnabled && (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => setApptOpen(true)}>Request your first appointment</Button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── PROCEDURES ─── */}
            {activeTab === "procedures" && (
              <motion.div key="procedures" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                <h2 className="font-bold text-lg">Procedure History</h2>
                {procedures.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No procedures recorded yet</p>
                  </div>
                ) : procedures.map((p: any) => (
                  <div key={p.id} className="bg-card rounded-xl border p-4 shadow-sm cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedProcedure(p)}>
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="font-semibold text-sm">{p.service_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(p.procedure_date).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}
                          {p.staff && ` • Dr. ${p.staff.first_name} ${p.staff.last_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">{p.status}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    {p.diagnosis && <p className="text-xs text-muted-foreground line-clamp-1">{p.diagnosis}</p>}
                  </div>
                ))}
              </motion.div>
            )}

            {/* ─── PHOTOS ─── */}
            {activeTab === "photos" && (
              <motion.div key="photos" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                <h2 className="font-bold text-lg">Clinical Photos</h2>
                {photos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Camera className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No photos available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {photos.map((photo: any) => (
                      <div key={photo.id} className="bg-card rounded-xl border overflow-hidden shadow-sm">
                        <img src={photo.photo_url} alt="Clinical" className="w-full aspect-square object-cover" />
                        <div className="p-2">
                          <p className="text-xs font-medium">{photo.photo_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(photo.taken_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                          </p>
                          {photo.procedures?.service_name && (
                            <p className="text-xs text-primary mt-0.5">{photo.procedures.service_name}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── BILLING ─── */}
            {activeTab === "billing" && (
              <motion.div key="billing" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                <h2 className="font-bold text-lg">Billing</h2>

                {outstandingBalanceEnabled && totalDue > 0 && (
                  <div className="bg-warning/5 border border-warning/20 rounded-xl p-4">
                    <p className="text-xs text-warning font-semibold mb-1">Outstanding Balance</p>
                    <p className="text-2xl font-bold">₹{totalDue.toLocaleString()}</p>
                  </div>
                )}

                {invoicesError ? (
                  <div className="text-center py-12">
                    <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-3">We couldn't load your bills.</p>
                    <Button variant="outline" size="sm" onClick={() => refetchInvoices()}>Try again</Button>
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No invoices yet</p>
                  </div>
                ) : invoices.map((inv: any) => (
                  <div
                    key={inv.id}
                    className="bg-card rounded-xl border p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => viewInvoicePdf(inv)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(inv.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${invoiceStatusColors[inv.status] || ""}`}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {(inv.services || []).map((s: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold">₹{Number(inv.total_amount).toLocaleString()}</span>
                    </div>
                    {inv.status !== "Pending" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="text-success">₹{Number(inv.paid_amount).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={(e) => { e.stopPropagation(); viewInvoicePdf(inv); }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" /> View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={(e) => { e.stopPropagation(); downloadInvoicePdf(inv); }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                      </Button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* ─── SHOP ─── */}
            {activeTab === "pharmacy" && shopEnabled && (
              <motion.div key="pharmacy" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <PortalShop patientId={patientId!} patientName={session.patientName} />
              </motion.div>
            )}

            {/* ─── AI BOT ─── */}
            {activeTab === "bot" && (
              <motion.div key="bot" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <PortalBot patientId={patientId!} patientName={session.patientName} />
              </motion.div>
            )}

            {/* ─── SURVEYS ─── */}
            {activeTab === "surveys" && (
              <motion.div key="surveys" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                {activeSurvey ? (
                  <PortalSurveyFill
                    patientId={patientId!}
                    templateId={activeSurvey.templateId}
                    assignmentId={activeSurvey.assignmentId}
                    onClose={() => setActiveSurvey(null)}
                    onSubmitted={() => {
                      queryClient.invalidateQueries({ queryKey: ["portal-assigned-surveys"] });
                    }}
                  />
                ) : (
                  <PortalSurveysList patientId={patientId!} onOpen={(t, a) => setActiveSurvey({ templateId: t, assignmentId: a })} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ─── Appointment Request Dialog ─── */}
      <Dialog open={apptOpen} onOpenChange={setApptOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Request Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Service / Reason *</Label>
              <Input className="mt-1.5" placeholder="e.g. Skin consultation" value={apptService} onChange={(e) => setApptService(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preferred Date *</Label>
                <Input type="date" className="mt-1.5" value={apptDate} onChange={(e) => setApptDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <Label>Preferred Time *</Label>
                <TimePicker12h className="mt-1.5" value={apptTime} onChange={setApptTime} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1.5" placeholder="Any additional details..." rows={2} value={apptNotes} onChange={(e) => setApptNotes(e.target.value)} />
            </div>
            <Button className="w-full gap-2" onClick={() => requestAppointment.mutate()} disabled={!apptService || !apptDate || !apptTime || requestAppointment.isPending}>
              {requestAppointment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Request
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              The clinic will confirm or suggest an alternative time.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Pharma Request Dialog ─── */}
      <Dialog open={pharmaOpen} onOpenChange={setPharmaOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Request Medicine</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Product *</Label>
              <Select value={pharmaProductId} onValueChange={setPharmaProductId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {pharmaProducts.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — ₹{p.selling_price}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" className="mt-1.5" min={1} value={pharmaQty} onChange={(e) => setPharmaQty(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1.5" placeholder="Any special instructions..." rows={2} value={pharmaNotes} onChange={(e) => setPharmaNotes(e.target.value)} />
            </div>
            <Button className="w-full gap-2" onClick={() => requestPharma.mutate()} disabled={!pharmaProductId || requestPharma.isPending}>
              {requestPharma.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Request
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              The clinic will process your request and contact you.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Staff Detail Dialog ─── */}
      <Dialog open={!!selectedStaff} onOpenChange={(open) => !open && setSelectedStaff(null)}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Team Member</DialogTitle>
          </DialogHeader>
          {selectedStaff && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                  {selectedStaff.first_name?.[0] || "S"}
                </div>
                <div>
                  <p className="font-semibold text-lg">{selectedStaff.first_name} {selectedStaff.last_name}</p>
                  <Badge variant="secondary" className="mt-1">{selectedStaff.role}</Badge>
                </div>
              </div>
              {selectedStaff.specialization && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Specialization</p>
                  <p className="text-sm font-medium">{selectedStaff.specialization}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Procedure Detail Dialog ─── */}
      <Dialog open={!!selectedProcedure} onOpenChange={(open) => !open && setSelectedProcedure(null)}>
        <DialogContent className="max-w-md mx-4 rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Procedure Details</DialogTitle>
          </DialogHeader>
          {selectedProcedure && (
            <div className="space-y-4 pt-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-base">{selectedProcedure.service_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(selectedProcedure.procedure_date).toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <Badge variant="secondary">{selectedProcedure.status}</Badge>
              </div>

              {selectedProcedure.staff && (
                <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                  <User className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Performed by</p>
                    <p className="text-sm font-medium">Dr. {selectedProcedure.staff.first_name} {selectedProcedure.staff.last_name}</p>
                  </div>
                </div>
              )}

              {selectedProcedure.symptoms && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Symptoms</p>
                  <p className="text-sm">{selectedProcedure.symptoms}</p>
                </div>
              )}

              {selectedProcedure.diagnosis && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Diagnosis</p>
                  <p className="text-sm">{selectedProcedure.diagnosis}</p>
                </div>
              )}

              {selectedProcedure.procedure_notes && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Procedure Notes</p>
                  <p className="text-sm">{selectedProcedure.procedure_notes}</p>
                </div>
              )}

              {selectedProcedure.recommendations && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Recommendations</p>
                  <p className="text-sm">{selectedProcedure.recommendations}</p>
                </div>
              )}

              {selectedProcedure.prescriptions && selectedProcedure.prescriptions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Prescriptions</p>
                  <div className="space-y-2">
                    {selectedProcedure.prescriptions.map((rx: any) => (
                      <div key={rx.id} className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                        <p className="font-medium text-sm">{rx.medicine_name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {rx.frequency && <span className="text-xs text-muted-foreground">Frequency: {rx.frequency}</span>}
                          {rx.duration && <span className="text-xs text-muted-foreground">Duration: {rx.duration}</span>}
                          {rx.quantity > 0 && <span className="text-xs text-muted-foreground">Qty: {rx.quantity}</span>}
                        </div>
                        {rx.instructions && <p className="text-xs text-muted-foreground mt-1 italic">{rx.instructions}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t safe-area-bottom z-50">
        <div className="max-w-lg mx-auto flex">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  navigate(`/portal/${tabToUrlSlug[tab.id] || tab.id}`);
                }}
                className={`flex-1 flex flex-col items-center py-2 pt-2.5 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                <span className={`text-[10px] mt-0.5 ${isActive ? "font-semibold" : ""}`}>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="portal-tab-indicator"
                    className="h-0.5 w-5 bg-primary rounded-full mt-0.5"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Portal;
