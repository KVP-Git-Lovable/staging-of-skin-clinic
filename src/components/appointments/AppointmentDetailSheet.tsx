import { useState, useEffect, useMemo, useRef } from "react";
import { DateInput } from "@/components/shared/DateInput";
import { ViewPrescriptionButton } from "@/components/prescriptions/ViewPrescriptionButton";
import { withDrPrefix } from "@/lib/staffName";
import { MANUAL_APPOINTMENT_STATUSES, appointmentStatusLabel, showsAsBilled, BILLED_BADGE_CLASSES } from "@/lib/appointmentStatus";
import { invoiceMapByAppointment, type VisitBill } from "@/lib/invoicesForAppointments";
import { APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED } from "@/lib/whatsappNotifications";
import { confirmationSendPlan } from "@/lib/confirmationSend";
import { useLiveAppointments } from "@/hooks/useLiveAppointments";
import { GOOGLE_REVIEW_MESSAGE, isReviewRequestMessage, reviewContactNotice, reviewRequestState } from "@/lib/googleReview";
import { openAppointmentNotice, type AppointmentChange } from "@/lib/liveAppointments";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { rescheduleVerdict, rescheduleWarning } from "@/lib/appointmentReschedule";
import { format, isWithinInterval, parseISO, addMonths, addWeeks, addDays } from "date-fns";
import { X, Save, Trash2, Plus, Camera, Eye, FileText, Pill, IndianRupee, Image as ImageIcon, ScanEye, Phone, ExternalLink, AlertTriangle, CalendarClock, Check, Star, MessageSquare, CalendarIcon, ClipboardCheck, StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MicButton } from "@/components/shared/MicButton";
import { Input } from "@/components/ui/input";
import TimePicker12h from "@/components/shared/TimePicker12h";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientAttachments } from "@/components/patients/PatientAttachments";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { SystemRecordSection } from "@/components/shared/SystemRecordSection";
import { RecordOwnerField } from "@/components/shared/RecordOwnerField";
import { FieldHistorySection } from "@/components/shared/FieldHistorySection";
import { moveToTrash } from "@/lib/trash";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { allocateInvoiceNumber, allocateInvoiceNumbers } from "@/lib/invoiceNumber";
import { assertWrote } from "@/lib/rowAccess";
import { forgetOpenAppointment, rememberOpenAppointment } from "@/lib/openAppointment";
import { StickyNotes } from "@/components/shared/StickyNotes";
import { StaffCombobox } from "@/components/shared/StaffCombobox";
import { THERAPIST_ROLES, therapistDisplayName, therapistNoteTitle } from "@/lib/appointmentTherapist";
import { CameraCapture } from "@/components/shared/CameraCapture";
import { SkinTracker } from "@/components/shared/SkinTracker";
import { ProcedureFormDialog } from "@/components/procedures/ProcedureFormDialog";
import { ProcedureDetailSheet } from "@/components/procedures/ProcedureDetailSheet";
import { ScanProcedureDialog } from "@/components/procedures/ScanProcedureDialog";
import { CaseAnalysis } from "@/components/shared/CaseAnalysis";

/**
 * When the browser will not open a tab at all.
 *
 * Deliberately does NOT offer to open the link again. Three rounds of this
 * button failed on "the browser would not open it", so a fallback whose only
 * escape is another window.open is no fallback. Copying the message always
 * works: the staff member switches to the WhatsApp Web tab they already have
 * open, picks the patient, and pastes.
 */
function offerReviewFallback() {
  toast.message("Your browser blocked the WhatsApp tab", {
    description: "Copy the message, then paste it into the patient's WhatsApp chat.",
    action: {
      label: "Copy message",
      onClick: () => {
        navigator.clipboard.writeText(GOOGLE_REVIEW_MESSAGE).then(
          () => toast.success("Message copied"),
          () => toast.error("Could not copy - your browser blocked the clipboard."),
        );
      },
    },
    duration: 20000,
  });
}
import { AiRepository } from "@/components/shared/AiRepository";
import { SurveyFill } from "@/components/surveys/SurveyFill";
import { SurveyRecommendations } from "@/components/surveys/SurveyRecommendations";
import { useAuth } from "@/hooks/useAuth";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";
import { procedureDateLabel } from "@/lib/procedureDate";
import { appointmentDeleteNote } from "@/lib/appointmentDeleteNote";
// Shared with the Patient Feedback report, so a visit cannot read "Passive"
// on one screen and "Promoter" on the other.
import { npsCategory, ratingLabel } from "@/lib/feedbackScores";
import { AttachPhotosButton } from "@/components/photos/AttachPhotosButton";
import { PhotoViewer } from "@/components/patients/PhotoViewer";
import { orderAppointmentPhotos, photoPositionIn } from "@/lib/appointmentPhotos";
import { investigationText } from "@/lib/investigationText";
import { displayDate } from "@/lib/dateInput";
import { appointmentPatientName, appointmentPatientIsVip } from "@/lib/appointmentPatientName";
import { VipBadge } from "@/components/shared/VipBadge";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const statusOptions = [...MANUAL_APPOINTMENT_STATUSES];
const visitStatusOptions = ["Follow-up visit", "Recurring visit"];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Reserved: "bg-info/15 text-info border-info/30",
  Confirmed: "bg-success/15 text-success border-success/30",
  "Checked In": "bg-warning/15 text-warning border-warning/30",
  Cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  Completed: "bg-success/15 text-success border-success/30",
  "No Show": "bg-destructive/15 text-destructive border-destructive/30",
  "Follow Up": "bg-warning/15 text-warning border-warning/30",
};

const NPS_LABELS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

function FeedbackTabContent({
  appointmentId, patientId, patientName, patientPhone,
  npsScore, setNpsScore, serviceRating, setServiceRating,
  feedbackSubmitting, setFeedbackSubmitting, queryClient,
}: {
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  patientPhone: string;
  npsScore: number | null;
  setNpsScore: (v: number | null) => void;
  serviceRating: number | null;
  setServiceRating: (v: number | null) => void;
  feedbackSubmitting: boolean;
  setFeedbackSubmitting: (v: boolean) => void;
  queryClient: any;
}) {
  const { data: existingFeedback, isLoading } = useQuery({
    queryKey: ["patient-feedback", appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_feedback")
        .select("*")
        .eq("appointment_id", appointmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!appointmentId,
  });

  const [comments, setComments] = useState("");

  const handleSubmitFeedback = async () => {
    if (npsScore === null || serviceRating === null) {
      toast.error("Please answer both questions");
      return;
    }
    setFeedbackSubmitting(true);
    try {
      const { error } = await supabase.from("patient_feedback").insert({
        appointment_id: appointmentId,
        patient_id: patientId || "00000000-0000-0000-0000-000000000000",
        patient_name: patientName,
        nps_score: npsScore,
        service_rating: serviceRating,
        comments: comments.trim() || null,
      } as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["patient-feedback", appointmentId] });
      toast.success("Feedback recorded!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  /**
   * Asking for a Google review, at the moment the patient has just said
   * something kind. Opens WhatsApp with the clinic's wording and this
   * patient's number already filled in; staff press send.
   *
   * It opened WhatsApp, then sent through the app once Meta approved the
   * template, and now opens WhatsApp again. That is not indecision - the
   * approved body lives at META, not here, and it still carries the OLD
   * review link, the one that makes a patient sign in to Google before they
   * can write anything. Most gave up at that screen. The wording in
   * googleReview.ts has the corrected link, so sending it from a staff
   * member's own WhatsApp is the only way the patient gets the good link
   * today.
   *
   * send-google-review-whatsapp and its template are left in place, switched
   * off from here rather than deleted: when Meta approves the corrected body
   * and TWILIO_GOOGLE_REVIEW_TEMPLATE_SID points at the new SID, this goes
   * back to sending itself.
   */
  const review = reviewRequestState(patientPhone);
  /**
   * When this patient last had a review request.
   *
   * Read from whatsapp_conversations, which the sender writes synchronously -
   * whatsapp_delivery_log is filled in afterwards by the delivery webhook and
   * would still be empty for a second press made 43 seconds later, which is
   * exactly the gap that sent one patient the same message twice.
   */
  const { data: lastReviewSentAt, refetch: refetchLastReview } = useQuery({
    queryKey: ["review-request-sent", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("content, created_at")
        .eq("patient_id", patientId!)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data || []).find((m) => isReviewRequestMessage(m.content))?.created_at ?? null;
    },
  });
  /**
   * When this patient last had the review link opened for them.
   *
   * The send through the app is switched off, so whatsapp_conversations hears
   * nothing any more and the notice above would quietly stop updating. This
   * is what keeps it alive - see the google_review_opens migration for what a
   * row does and does not mean.
   *
   * `as never` rather than `any`: the table was added by 20261102100000 and
   * the generated Supabase types are regenerated on sync, so until then the
   * table is real and the types do not know it.
   */
  const { data: lastReviewOpenedAt, refetch: refetchLastOpen } = useQuery({
    queryKey: ["review-link-opened", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("google_review_opens" as never)
        .select("opened_at")
        .eq("patient_id", patientId!)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { opened_at?: string } | null)?.opened_at ?? null;
    },
  });
  const alreadySent = reviewContactNotice(lastReviewSentAt, lastReviewOpenedAt);
  const [askAgainOpen, setAskAgainOpen] = useState(false);
  /**
   * Record that the review link was opened for this patient.
   *
   * Deliberately NOT awaited, and the click never waits on it. The tab has
   * already been claimed and pointed at WhatsApp by the time this runs, and
   * an await anywhere in that path would spend the click's permission to
   * open a tab at all - which is the whole reason this button broke once
   * already.
   *
   * So the record is best-effort and the send is not. If the insert fails
   * the patient still gets asked; all that is lost is the notice next time,
   * which is the right way round.
   */
  const recordReviewOpen = () => {
    if (!patientId) return;
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        await supabase.from("google_review_opens" as never).insert({
          patient_id: patientId,
          appointment_id: appointmentId ?? null,
          opened_by: auth?.user?.id ?? null,
        } as never);
        void refetchLastOpen();
      } catch {
        // Silent on purpose. WhatsApp is already opening in the other tab and
        // a toast about bookkeeping would land on a screen nobody is reading.
      }
    })();
  };

  /**
   * Open WhatsApp in a new tab.
   *
   * A plain <a target="_blank"> was tried first and gave staff
   * "api.whatsapp.com is blocked / ERR_BLOCKED_BY_RESPONSE" - Chrome's
   * wording for a page refusing to be framed, which means the link loaded
   * INSIDE the frame rather than in a tab. window.open gives a genuine
   * top-level tab, and X-Frame-Options cannot apply to a top-level document.
   *
   * It also tells us when the browser refused outright, which an anchor
   * cannot, so that case gets a usable fallback instead of a dead page.
   *
   * NEVER put a confirm(), alert() or prompt() in this function, and never
   * call one between the click and this. window.open focuses the new tab,
   * which leaves this page in the background, and Chrome ignores a dialog
   * asked for by a background tab - it shows nothing and returns false. That
   * is exactly how "Ask again" came to open a tab and instantly close it
   * again: the screen jolted and nothing happened. Anything that needs
   * asking is asked before this runs, by askAgainOpen below.
   */
  const openWhatsAppNow = () => {
    if (!review.enabled || !review.url) return;
    // One window.open carrying the real URL, exactly as PhotoViewer,
    // PdfPreviewDialog and the report drill-downs do it.
    //
    // This used to go through reserveTab().navigate(), which opens about:blank
    // and navigates it afterwards, and the tab sat on the placeholder for
    // ever: navigate() disowns the window (opener = null) before assigning
    // location, and a disowned popup is no longer the opener's to steer, with
    // the failure swallowed by a catch. reserveTab earns that two-step dance
    // when a tab must be claimed BEFORE an await - a PDF being built, an edge
    // function being called. Nothing is awaited here; the URL is already
    // known, so there was never anything to reserve.
    // Do NOT pass "noopener" in the features string: the HTML spec makes
    // window.open return null whenever noopener is set, even when the tab
    // opened fine, so the null check below would fire the fallback on every
    // successful click and recordReviewOpen would never run. Open without it
    // and disown the opener manually instead - same protection, truthful
    // return value.
    const win = window.open(review.url, "_blank");
    if (!win) {
      offerReviewFallback();
      return;
    }
    win.opener = null;
    recordReviewOpen();
  };

  /**
   * The button. Asking a patient twice is worth a question; asking a patient
   * who has never been asked is not.
   *
   * The dialog's own button is a fresh user gesture, so opening the tab from
   * there works exactly as it does on a first press.
   */
  const openReviewRequest = () => {
    if (!review.enabled || !review.url) return;
    if (alreadySent) {
      setAskAgainOpen(true);
      return;
    }
    openWhatsAppNow();
  };

  const reviewRequestButton = (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        data-testid="send-google-review"
        disabled={!review.enabled}
        onClick={openReviewRequest}
      >
        <Star className="h-3.5 w-3.5" />
        {alreadySent ? "Ask again on WhatsApp" : "Send Google review request"}
      </Button>
      {!review.enabled && (
        <p className="text-[11px] text-muted-foreground mt-1">{review.reason}</p>
      )}
      {review.enabled && alreadySent && (
        <p className="text-[11px] text-muted-foreground mt-1" data-testid="review-already-sent">
          {alreadySent}
        </p>
      )}

      {/* Asked before anything opens - see openWhatsAppNow for why that order
          is not negotiable. */}
      <AlertDialog open={askAgainOpen} onOpenChange={setAskAgainOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ask this patient again?</AlertDialogTitle>
            <AlertDialogDescription>
              {alreadySent}. Sending a second request is fine if the first one
              did not reach them — but a patient who gets the same message
              twice usually just received it late.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-ask-again"
              onClick={() => {
                setAskAgainOpen(false);
                openWhatsAppNow();
              }}
            >
              Open WhatsApp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const getNpsColor = (score: number) => {
    if (score <= 6) return "bg-destructive text-destructive-foreground";
    if (score <= 8) return "bg-yellow-500 text-white";
    return "bg-green-600 text-white";
  };


  if (isLoading) return <TabsContent value="feedback" className="p-6 mt-0"><p className="text-sm text-muted-foreground text-center py-8">Loading...</p></TabsContent>;

  if (existingFeedback) {
    return (
      <TabsContent value="feedback" className="p-6 space-y-5 mt-0">
        <h3 className="text-sm font-semibold font-display flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Feedback Received
        </h3>
        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">How likely are you to recommend us? (NPS)</p>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold ${getNpsColor(existingFeedback.nps_score)}`}>
                {existingFeedback.nps_score}
              </span>
              <Badge variant="outline" className="text-xs">{npsCategory(existingFeedback.nps_score)}</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Overall Service Quality</p>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={`h-5 w-5 ${s <= existingFeedback.service_rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
              ))}
            </div>
          </div>
          {(existingFeedback as any).comments && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Comments</p>
              <p className="text-sm whitespace-pre-wrap">{(existingFeedback as any).comments}</p>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">Submitted {format(new Date(existingFeedback.created_at), "MMM d, yyyy · h:mm a")}</p>
        </div>
        {reviewRequestButton}
      </TabsContent>
    );
  }

  return (
    <TabsContent value="feedback" className="p-6 space-y-5 mt-0">
      <h3 className="text-sm font-semibold font-display flex items-center gap-2">
        <MessageSquare className="h-4 w-4" /> Patient Feedback
      </h3>
      {reviewRequestButton}

      {/* NPS Question */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">How likely are you to recommend us to a friend or colleague?</Label>
        <div className="flex gap-1 flex-wrap">
          {NPS_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setNpsScore(i)}
              className={`h-8 w-8 rounded-md text-xs font-semibold border transition-all ${
                npsScore === i
                  ? getNpsColor(i)
                  : "bg-background hover:bg-accent text-foreground border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
        {npsScore !== null && (
          <Badge variant="outline" className="text-xs">{npsCategory(npsScore)}</Badge>
        )}
      </div>

      {/* Service Quality */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">How would you rate the overall quality of service?</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setServiceRating(s)}
              className="p-1 transition-transform hover:scale-110"
            >
              <Star className={`h-7 w-7 ${serviceRating !== null && s <= serviceRating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-300"}`} />
            </button>
          ))}
        </div>
        {serviceRating !== null && (
          <p className="text-xs text-muted-foreground">
            {ratingLabel(serviceRating)}
          </p>
        )}
      </div>

      {/* Written / dictated feedback */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Any comments or suggestions?</Label>
        <div className="flex items-start gap-2">
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Type the patient's feedback, or use the mic to dictate…"
            rows={3}
            className="flex-1 text-sm"
          />
          <MicButton value={comments} onChange={setComments} size="md" title="Dictate feedback" />
        </div>
      </div>

      <Button
        onClick={handleSubmitFeedback}
        disabled={feedbackSubmitting || npsScore === null || serviceRating === null}
        className="w-full gap-2"
      >
        <Check className="h-4 w-4" /> Submit Feedback
      </Button>
    </TabsContent>
  );
}

interface AppointmentDetailSheetProps {
  appointmentId: string | null;
  onClose: () => void;
  variant?: "sheet" | "page";
  fullScreen?: boolean;
}

export function AppointmentDetailSheet({ appointmentId, onClose, variant = "sheet", fullScreen = false }: AppointmentDetailSheetProps) {
  const canSeeBilling = useCanSeeBillingAmounts();
  const isPage = variant === "page";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [skinTrackerOpen, setSkinTrackerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [procFormOpen, setProcFormOpen] = useState(false);
  const [scanProcOpen, setScanProcOpen] = useState(false);
  const [selectedProcId, setSelectedProcId] = useState<string | null>(null);
  // An index into the photos as the tab lays them out, not the photo itself:
  // that is what lets the viewer step to the next one. Mirrors PatientDetail.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Radix's Dialog/Sheet scroll-lock only touches document.body, but this
  // app's real scroll container is <main overflow-auto> in AppLayout.tsx -
  // lock it directly while this sheet is open so the page behind it can't
  // keep scrolling independently. Skip when rendered as a full page
  // (variant="page"), since then this component's own content IS <main>'s
  // content and locking it would break normal page scrolling.
  useEffect(() => {
    if (!appointmentId || isPage) return;
    const main = document.querySelector("main");
    if (!main) return;
    const prevOverflow = main.style.overflow;
    main.style.overflow = "hidden";
    return () => {
      main.style.overflow = prevOverflow;
    };
  }, [appointmentId, isPage]);

  // Billing plan state
  const [billingTotal, setBillingTotal] = useState(0);
  const [billingType, setBillingType] = useState<"one-time" | "recurring">("one-time");
  const [billingFrequency, setBillingFrequency] = useState<"weekly" | "monthly">("monthly");
  const [billingInstallments, setBillingInstallments] = useState(2);
  const [billingMode, setBillingMode] = useState("Cash");
  const [billingConfirmed, setBillingConfirmed] = useState(false);
  const [billingCreating, setBillingCreating] = useState(false);
  const [selectedInstallments, setSelectedInstallments] = useState<string[]>([]);
  const [collectMode, setCollectMode] = useState("Cash");
  const [collecting, setCollecting] = useState(false);
  const [customSchedule, setCustomSchedule] = useState<{ date: Date; amount: number }[]>([]);
  // Feedback state
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [serviceRating, setServiceRating] = useState<number | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [surveyFillOpen, setSurveyFillOpen] = useState(false);
  const [selectedSurveyTemplateId, setSelectedSurveyTemplateId] = useState<string | null>(null);

  // Fetch appointment
  // maybeSingle, not single: a doctor on data_scope = "own" cannot read a
  // colleague's appointment, and single() throws for that. The sheet renders
  // `isLoading || !appointment` as "Loading...", so the throw left a spinner
  // turning forever with nothing to say why. Now it resolves to null and the
  // sheet says so.
  const { data: appointment, isLoading: appointmentFetching, isError: appointmentFailed, error: appointmentError, refetch: retryAppointment } = useQuery({
    queryKey: ["appointment-detail", appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, phone, gender, is_vip), staff:staff!appointments_staff_id_fkey(first_name, last_name)")
        .eq("id", appointmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!appointmentId,
  });

  // Fetch matching survey templates
  const { data: surveyTemplates = [] } = useQuery({
    queryKey: ["survey-templates-for-appointment", appointment?.service],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_templates").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!appointment,
  });

  // Editable fields
  const [editService, setEditService] = useState("");
  // What the list calls Investigation: the free text for this visit, stored in
  // reason_for_consultation (the column the Salesforce import fills from
  // Investigation__c). Service stays beside it because it drives billing.
  const [editInvestigation, setEditInvestigation] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editVisitStatus, setEditVisitStatus] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editStaffId, setEditStaffId] = useState("");
  // Who actually carries out the treatment. Separate from the doctor: the
  // clinic needs both, and a therapist is routinely swapped at short notice.
  const [editTherapistId, setEditTherapistId] = useState("");
  const [editProblemAreas, setEditProblemAreas] = useState<string[]>([]);
  const [editAppointmentId, setEditAppointmentId] = useState<string | null>(null);

  // Fetch staff list for dropdown
  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, role, specialization").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const doctorsList = (staffList as any[]).filter((s: any) => s.role === "Doctor");

  const { data: servicesList = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: problemAreasList = [] } = useQuery({
    queryKey: ["problem-areas-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("problem_areas").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch approved leaves to show on-leave indicator
  const { data: approvedLeaves = [] } = useQuery({
    queryKey: ["approved-leaves-today"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("leave_applications")
        .select("staff_id, start_date, end_date")
        .eq("status", "Approved")
        .lte("start_date", today)
        .gte("end_date", today);
      if (error) throw error;
      return data;
    },
  });

  const staffOnLeaveIds = new Set(approvedLeaves.map((l: any) => l.staff_id));

  // The sheet stays mounted while Previous Appointments switches records.
  // Seed the form only after the query has returned that exact appointment;
  // doing this during render left one render where the new record was paired
  // with the previous record's date fields, so a quick Save copied the wrong
  // date onto the newly opened appointment.
  useEffect(() => {
    setEditAppointmentId(null);
    if (!appointment || appointment.id !== appointmentId) return;
    setEditService(appointment.service || "");
    setEditInvestigation(appointment.reason_for_consultation || "");
    setEditStatus(appointment.status || "Reserved");
    setEditVisitStatus((appointment as any).visit_status || "");
    setEditStartTime(appointment.start_time ? format(new Date(appointment.start_time), "yyyy-MM-dd'T'HH:mm") : "");
    setEditEndTime(appointment.end_time ? format(new Date(appointment.end_time), "yyyy-MM-dd'T'HH:mm") : "");
    setEditStaffId(appointment.staff_id || "");
    setEditTherapistId(appointment.therapist_id || "");
    setEditProblemAreas(((appointment as any).problem_area_ids as string[]) || []);
    setEditAppointmentId(appointment.id);
  }, [appointment, appointmentId]);

  // Nothing that navigates away calls this first any more. Closing the panel
  // before leaving stripped it out of the address, so the history entry left
  // behind was the bare list and Back could never return to the appointment.
  // On the screens where onClose is navigate(-1) it was worse still: a pop and
  // a push fired in the same tick. Only the delete path closes on its own, and
  // it should - the record is gone.
  const handleClose = () => {
    setActiveTab("details");
    forgetOpenAppointment();
    onClose();
  };

  // Fetch procedures for this appointment
  const { data: procedures = [] } = useQuery({
    queryKey: ["appointment-procedures", appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("*, staff:staff!procedures_staff_id_fkey(first_name, last_name)")
        .eq("appointment_id", appointmentId!)
        // Visits imported without a date are left out: the clinic wants the
        // record to match Salesforce exactly, nothing more. The rows are still
        // in the database - see the 20260925 migration - just not listed.
        .eq("date_not_recorded", false)
        .order("procedure_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!appointmentId,
  });

  // Kept for procedure UI badges, but no longer affects appointment status
  const hasCompletedProcedure = procedures.some((p: any) => p.status === "Completed");

  // All previous appointments for this patient (excluding the current one)
  const { data: previousAppointments = [] } = useQuery({
    queryKey: ["patient-previous-appointments", appointment?.patient_id, appointmentId],
    enabled: !!appointment?.patient_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, staff:staff!appointments_staff_id_fkey(first_name, last_name)")
        .eq("patient_id", appointment!.patient_id!)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return (data || []).filter((a: any) => a.id !== appointmentId);
    },
  });

  // All procedures for this patient
  const { data: previousProcedures = [] } = useQuery({
    queryKey: ["patient-previous-procedures", appointment?.patient_id],
    enabled: !!appointment?.patient_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("*, staff:staff!procedures_staff_id_fkey(first_name, last_name)")
        .eq("patient_id", appointment!.patient_id!)
        // Visits imported without a date are left out: the clinic wants the
        // record to match Salesforce exactly, nothing more. The rows are still
        // in the database - see the 20260925 migration - just not listed.
        .eq("date_not_recorded", false)
        .order("procedure_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Prescriptions brought in by the April 2026 bulk load carry no appointment_id,
  // so they can never show up in the per-visit tab however much history the
  // patient has. Counted here so that tab can point at them instead of reading
  // as a bare "none", which looks like the records were lost.
  const unlinkedProcedureCount = previousProcedures.filter((p) => !p.appointment_id).length;

  const { data: invoices = [] } = useQuery({
    queryKey: ["appointment-invoices", appointment?.patient_id],
    queryFn: async () => {
      if (!appointment?.patient_id) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("patient_id", appointment.patient_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!appointment?.patient_id,
  });

  const deletePhoto = async (photo: any) => {
    if (!confirm("Delete this photo?")) return;
    try {
      const parts = photo.photo_url?.split("/patient-photos/");
      if (parts && parts[1]) {
        await supabase.storage.from("patient-photos").remove([parts[1]]);
      }
      const { error } = await supabase.from("patient_photos").delete().eq("id", photo.id);
      if (error) throw error;
      toast.success("Photo deleted");
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete photo");
    }
  };

  // Prescribed pharma products across this appointment's procedures (for New Bill prefill)
  // Recurring plan: parent appointment + every installment invoice in the family
  const rootAppointmentId = (appointment as any)?.parent_appointment_id || appointmentId || null;

  const { data: parentAppointment } = useQuery({
    queryKey: ["parent-appointment", (appointment as any)?.parent_appointment_id],
    queryFn: async () => {
      const pid = (appointment as any)?.parent_appointment_id;
      const { data, error } = await supabase
        .from("appointments")
        .select("id, service, start_time, status, patient_name")
        .eq("id", pid)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!(appointment as any)?.parent_appointment_id,
  });

  const { data: recurringFamily = [] } = useQuery({
    queryKey: ["recurring-family", rootAppointmentId],
    queryFn: async () => {
      if (!rootAppointmentId) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_time, status")
        .or(`id.eq.${rootAppointmentId},parent_appointment_id.eq.${rootAppointmentId}`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!rootAppointmentId,
  });

  const familyIds = (recurringFamily as any[]).map((a: any) => a.id);
  const { data: installments = [] } = useQuery({
    queryKey: ["recurring-installments", familyIds.join(",")],
    queryFn: async () => {
      if (familyIds.length === 0) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .in("appointment_id", familyIds)
        .eq("payment_type", "Recurring")
        .order("installment_number", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: familyIds.length > 0,
  });

  const procedureIds = (procedures as any[]).map((p: any) => p.id);

  // ---- Recurring installments: due-today collection & merged payment ----
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const instBalance = (inv: any) => Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
  const isDueNow = (inv: any) => !!inv.due_date && String(inv.due_date).slice(0, 10) <= todayKey;
  const isCollectable = (inv: any) => instBalance(inv) > 0.5 && inv.status !== "Merged" && isDueNow(inv);
  const instTax = (inv: any) => {
    const base = instBalance(inv);
    const rate = Number(inv.tax_rate) || 0;
    const tax = Math.round(base * rate) / 100;
    return { base, tax, total: base + tax };
  };
  const selectedRows = (installments as any[]).filter((i: any) => selectedInstallments.includes(i.id));
  const selectedTotals = selectedRows.reduce(
    (acc, inv) => {
      const { base, tax, total } = instTax(inv);
      return { base: acc.base + base, tax: acc.tax + tax, total: acc.total + total };
    },
    { base: 0, tax: 0, total: 0 },
  );

  const collectSelected = async () => {
    if (selectedRows.length === 0) return;
    setCollecting(true);
    try {
      if (selectedRows.length === 1) {
        const inv = selectedRows[0];
        const { base, tax, total } = instTax(inv);
        const { error } = await supabase
          .from("invoices")
          .update({
            total_amount: total,
            tax_amount: tax,
            cgst_amount: tax / 2,
            sgst_amount: tax / 2,
            paid_amount: total,
            status: "Paid",
            payment_mode: collectMode,
            notes: `${inv.notes || ""} | Collected ${format(new Date(), "dd MMM yyyy")}`.trim(),
          } as any)
          .eq("id", inv.id);
        if (error) throw error;
        toast.success(`Collected ₹${total.toLocaleString()} (incl. tax ₹${tax.toFixed(2)})`);
      } else {
        const number = await allocateInvoiceNumber();
        const { data: merged, error: mErr } = await supabase
          .from("invoices")
          .insert({
            invoice_number: number,
            patient_id: appointment?.patient_id || null,
            patient_name: appointment?.patient_name || patientName,
            services: selectedRows[0]?.services || [],
            line_items: selectedRows[0]?.line_items || null,
            doctor_id: appointment?.staff_id || null,
            appointment_id: appointmentId || null,
            recurring_group_id: selectedRows[0]?.recurring_group_id || null,
            total_amount: selectedTotals.total,
            paid_amount: selectedTotals.total,
            status: "Paid",
            payment_type: "Recurring",
            payment_mode: collectMode,
            tax_amount: selectedTotals.tax,
            cgst_amount: selectedTotals.tax / 2,
            sgst_amount: selectedTotals.tax / 2,
            igst_amount: 0,
            notes: `Merged payment for installments ${selectedRows
              .map((r: any) => r.installment_number)
              .join(", ")}`,
          } as any)
          .select("id")
          .single();
        if (mErr) throw mErr;
        const { error: uErr } = await supabase
          .from("invoices")
          .update({ status: "Merged", merged_into_invoice_id: merged.id } as any)
          .in("id", selectedRows.map((r: any) => r.id));
        if (uErr) throw uErr;
        toast.success(`Merged into ${number} — ₹${selectedTotals.total.toLocaleString()} collected`);
      }
      setSelectedInstallments([]);
      queryClient.invalidateQueries({ queryKey: ["recurring-installments"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-bounded"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
    } catch (e: any) {
      toast.error(e.message || "Could not collect payment");
    } finally {
      setCollecting(false);
    }
  };

  const { data: procPrescriptions = [] } = useQuery({
    queryKey: ["appointment-prescriptions", appointmentId, procedureIds.join(",")],
    queryFn: async () => {
      if (procedureIds.length === 0) return [];
      const { data, error } = await supabase
        .from("prescriptions")
        .select("medicine_name, quantity, product_id")
        .in("procedure_id", procedureIds);
      if (error) throw error;
      return data || [];
    },
    enabled: procedureIds.length > 0,
  });

  const { data: procServices = [] } = useQuery({
    queryKey: ["appointment-procedure-services", procedureIds],
    queryFn: async () => {
      if (procedureIds.length === 0) return [];
      const { data, error } = await supabase
        .from("procedure_services")
        .select("service_name, service_id, sort_order, procedure_id")
        .in("procedure_id", procedureIds)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: procedureIds.length > 0,
  });

  // Open the Billing module's Create Invoice dialog pre-filled from this appointment
  const handleNewBill = () => {
    const services = Array.from(
      new Set(
        [
          ...(procServices as any[]).map((s: any) => s.service_name),
          ...((procServices as any[]).length === 0
            ? (procedures as any[]).map((p: any) => p.service_name)
            : []),
          ...(procedures.length === 0 && appointment?.service ? [appointment.service] : []),
        ].filter(Boolean),
      ),
    );

    const products = (procPrescriptions as any[])
      .filter((p: any) => p.medicine_name || p.product_id)
      .map((p: any) => ({
        name: p.medicine_name,
        product_id: p.product_id || null,
        quantity: Number(p.quantity) || 1,
      }));

    // The linked procedure's visit cadence (single/recurring) is intentionally
    // not passed through here - it no longer drives Billing's Payment Type. A
    // recurring visit plan and an installment payment plan are independent;
    // staff picks "Recurring" billing explicitly in Billing when a package
    // needs to be split into payments.
    sessionStorage.setItem(
      "billing_prefill",
      JSON.stringify({
        patientId: appointment?.patient_id || "",
        doctorId: appointment?.staff_id || "",
        appointmentId: appointmentId || "",
        services,
        products,
      }),
    );
    navigate("/billing?newInvoice=1");
  };

  const { data: photos = [] } = useQuery({
    queryKey: ["patient-photos", "appointment", appointmentId, appointment?.patient_id],
    queryFn: async () => {
      if (!appointment?.patient_id) return [];
      const { data, error } = await supabase
        .from("patient_photos")
        .select("*, procedures(service_name)")
        .eq("patient_id", appointment.patient_id)
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!appointment?.patient_id,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!appointmentId || editAppointmentId !== appointmentId) {
        throw new Error("Please wait for this appointment to finish loading");
      }
      // A time being retyped is not a time. Without this the half-typed value
      // reached toISOString(), which raises "Invalid time value" - a message
      // that tells the front desk nothing about what to do.
      if (Number.isNaN(new Date(editStartTime).getTime()) || Number.isNaN(new Date(editEndTime).getTime())) {
        throw new Error("Enter a start and end time before saving.");
      }
      const prevStatus = appointment?.status || null;
      const prevStaffId = appointment?.staff_id || null;
      const newStatus = editStatus;
      const newStaffId = editStaffId || null;

      // Ask for the row back. Appointments carry a restrictive RLS policy on
      // UPDATE, and a write it filters out is not an error - Postgres reports
      // zero rows and no error - so without this the toast said "Appointment
      // updated", and the WhatsApp below went to the patient, for a
      // reschedule that never saved. Every other path that moves an
      // appointment already guards this way.
      const { data: written, error } = await supabase
        .from("appointments")
        .update({
          service: editService,
          reason_for_consultation: editInvestigation.trim() || null,
          status: newStatus,
          visit_status: editVisitStatus || null,
          start_time: new Date(editStartTime).toISOString(),
          end_time: new Date(editEndTime).toISOString(),
          staff_id: newStaffId,
          therapist_id: editTherapistId || null,
          problem_area_ids: editProblemAreas,
        } as any)
        .eq("id", appointmentId!)
        .select("id");
      if (error) throw error;
      assertWrote(written);

      // WhatsApp notifications on save
      try {
        const phone = (appointment as any)?.patients?.phone;
        console.log("[appt-notify] check", { phone, prevStatus, newStatus, prevStaffId, newStaffId });
        if (phone) {
          const startDate = new Date(editStartTime);
          const apptDate = format(startDate, "dd MMM yyyy");
          const apptTime = format(startDate, "hh:mm a");
          const notifyStatuses = ["Confirmed", "Cancelled"];
          const statusChanged = newStatus !== prevStatus && notifyStatuses.includes(newStatus);

          if (newStatus === "Cancelled" && statusChanged) {
            const { error: nErr } = await supabase.functions.invoke("send-appointment-update-whatsapp", {
              body: {
                kind: "cancelled",
                phone,
                patientName,
                appointmentDate: apptDate,
                appointmentTime: apptTime,
              },
            });
            if (nErr) { console.error("[appt-notify] cancel error", nErr); toast.error("WhatsApp notification failed"); }
            else toast.success("WhatsApp cancellation sent");
          } else if (newStatus === "Confirmed" && statusChanged && APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED) {
            // Confirming sends the booking-confirmation template, not the update one -
            // see the matching comment in Appointments.tsx. The doctor name that used
            // to be resolved here fed only the update template, which no longer runs
            // on this path.
            const { error: nErr } = await supabase.functions.invoke("send-appointment-whatsapp", {
              body: {
                phone,
                patientName,
                appointmentDate: apptDate,
                appointmentTime: apptTime,
                serviceName: editService || "-",
                patientGender: (appointment as any)?.patients?.gender || null,
              },
            });
            if (nErr) {
              // The reason, not just "failed" - a template mismatch, a number
              // not on WhatsApp and a daily limit all read the same otherwise.
              console.error("[appt-notify] update error", nErr);
              toast.error(await edgeFunctionErrorMessage(nErr, "The WhatsApp confirmation could not be sent."));
            } else toast.success("WhatsApp notification sent");
          } else {
            console.log("[appt-notify] status not Confirmed/Cancelled or unchanged — skipping notification");
          }
        }
      } catch (notifyErr) {
        console.error("WhatsApp notify failed:", notifyErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-detail", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", appointment?.patient_id] });
      toast.success("Appointment updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * What already happened at this appointment.
   *
   * Both lists are loaded for the patient, so the rows belonging to this visit
   * are the ones naming it.
   */
  /**
   * Every bill this patient has, keyed by the visit it belongs to.
   *
   * invoiceMapByAppointment is the clinic's one definition of "this visit has
   * a bill": it drops rows with no appointment, and drops Cancelled and
   * Merged bills, which are not money anybody was charged. The check below
   * used to be a bare .some() on appointment_id with no status filter at all,
   * so a cancelled bill counted as evidence the visit had been billed.
   */
  const billsByAppointment = useMemo(
    () => invoiceMapByAppointment(invoices as VisitBill[]),
    [invoices],
  );

  const visitEvidence = useMemo(
    () => ({
      hasInvoice: billsByAppointment.has(appointmentId),
      hasProcedure: (previousProcedures as { appointment_id?: string | null }[]).some(
        (p) => p.appointment_id === appointmentId,
      ),
    }),
    [billsByAppointment, previousProcedures, appointmentId],
  );

  const [moveVisitOpen, setMoveVisitOpen] = useState(false);

  /**
   * Save, unless saving would move a visit that already happened onto another
   * day. Tahniya's 25 September visit was overwritten that way, and her bill
   * went with it - see appointmentReschedule.ts.
   */
  const saveChanges = () => {
    if (rescheduleVerdict(appointment, editStartTime, visitEvidence) === "confirm") {
      setMoveVisitOpen(true);
      return;
    }
    updateMutation.mutate();
  };

  /** The answer the clinic almost always wants: keep the visit, book the new date. */
  const bookInsteadMutation = useMutation({
    mutationFn: async () => {
      if (!appointment?.patient_id) throw new Error("This appointment has no patient on it");
      if (Number.isNaN(new Date(editStartTime).getTime()) || Number.isNaN(new Date(editEndTime).getTime())) {
        throw new Error("Enter a start and end time before saving.");
      }
      const { error } = await supabase.from("appointments").insert({
        patient_id: appointment.patient_id,
        patient_name: appointment.patient_name ?? null,
        staff_id: editStaffId || appointment.staff_id || null,
        therapist_id: editTherapistId || appointment.therapist_id || null,
        service: editService || appointment.service || null,
        reason_for_consultation: editInvestigation.trim() || null,
        start_time: new Date(editStartTime).toISOString(),
        end_time: new Date(editEndTime).toISOString(),
        status: "Reserved",
        problem_area_ids: editProblemAreas,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", appointment?.patient_id] });
      queryClient.invalidateQueries({ queryKey: ["patient-previous-appointments", appointment?.patient_id] });
      setMoveVisitOpen(false);
      toast.success("New appointment booked - the earlier visit is unchanged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const error: any = await moveToTrash("appointments", appointmentId!).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment deleted");
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Generate installment schedule (used to seed customSchedule)
  const generateDefaultSchedule = () => {
    if (billingTotal <= 0) return [];
    const baseDate = appointment?.start_time ? new Date(appointment.start_time) : new Date();
    if (billingType === "one-time") {
      return [{ date: baseDate, amount: billingTotal }];
    }
    const count = Math.max(2, billingInstallments);
    const perInstallment = Math.floor(billingTotal / count);
    const remainder = billingTotal - perInstallment * count;
    return Array.from({ length: count }, (_, i) => {
      const date = billingFrequency === "monthly" ? addMonths(baseDate, i) : addWeeks(baseDate, i);
      return { date, amount: i === 0 ? perInstallment + remainder : perInstallment };
    });
  };

  // Recalculate schedule when inputs change
  const regenerateSchedule = () => {
    const schedule = generateDefaultSchedule();
    setCustomSchedule(schedule);
    setBillingConfirmed(false);
  };

  const scheduleTotal = customSchedule.reduce((s, i) => s + i.amount, 0);
  const scheduleMismatch = customSchedule.length > 0 && scheduleTotal !== billingTotal;

  const updateScheduleDate = (idx: number, date: Date) => {
    const updated = [...customSchedule];
    updated[idx] = { ...updated[idx], date };
    setCustomSchedule(updated);
    setBillingConfirmed(false);
  };

  const updateScheduleAmount = (idx: number, amount: number) => {
    const updated = [...customSchedule];
    updated[idx] = { ...updated[idx], amount };
    setCustomSchedule(updated);
    setBillingConfirmed(false);
  };

  const addScheduleRow = () => {
    const lastDate = customSchedule.length > 0 ? customSchedule[customSchedule.length - 1].date : new Date();
    const nextDate = billingFrequency === "monthly" ? addMonths(lastDate, 1) : addWeeks(lastDate, 1);
    setCustomSchedule([...customSchedule, { date: nextDate, amount: 0 }]);
    setBillingConfirmed(false);
  };

  const removeScheduleRow = (idx: number) => {
    if (customSchedule.length <= 1) return;
    setCustomSchedule(customSchedule.filter((_, i) => i !== idx));
    setBillingConfirmed(false);
  };

  const handleCreateBillingInvoices = async () => {
    if (billingTotal <= 0) { toast.error("Enter a valid amount"); return; }
    if (scheduleMismatch) { toast.error("Schedule amounts don't match the total bill amount"); return; }
    setBillingCreating(true);
    try {
      const schedule = customSchedule;
      const services = [appointment?.service || ""].filter(Boolean);
      const numbers = await allocateInvoiceNumbers(schedule.length);
      const inserts = schedule.map((inst, i) => {
        return {
          invoice_number: numbers[i],
          patient_id: appointment?.patient_id || null,
          patient_name: patientName,
          services,
          total_amount: inst.amount,
          paid_amount: 0,
          status: "Pending" as const,
          payment_type: billingType === "one-time" ? "One-time" : "Staged",
          payment_mode: billingMode,
          notes: billingType === "recurring" ? `Installment ${i + 1} of ${schedule.length}` : null,
          appointment_id: appointmentId,
        };
      });
      const { error } = await supabase.from("invoices").insert(inserts);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["appointment-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-bounded"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      toast.success(`${inserts.length} invoice(s) created`);
      setBillingConfirmed(false);
      setBillingTotal(0);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBillingCreating(false);
    }
  };

  const patientName = appointmentPatientName(appointment, "Unknown");
  const patientIsVip = appointmentPatientIsVip(appointment);

  const patientPhone = appointment?.patients?.phone || "";

  /**
   * Send the confirmation again, by hand.
   *
   * A confirmation can be missed - a browser running an older build, a Twilio
   * refusal, a number added to the record after the booking - and until this
   * existed the only way to get one out was to re-book the patient. Asks
   * first, because it reaches a real person.
   */
  /**
   * What the front desk has done to this appointment while it has been open.
   *
   * Shown as a line at the top and nothing more. The page is deliberately NOT
   * re-read: re-drawing a half-written consultation from the database is the
   * one thing that must never happen here, so a change offers a link and a
   * deletion simply says so - the visit saves to the patient either way, see
   * procedureAppointment.ts.
   */
  const [frontDeskChange, setFrontDeskChange] = useState<AppointmentChange | null>(null);
  useLiveAppointments({
    onAppointment: (id, kind) => {
      if (appointmentId && id === appointmentId) setFrontDeskChange(kind);
    },
  });

  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const resendConfirmation = async () => {
    const plan = confirmationSendPlan({ status: "Confirmed", phone: patientPhone, patientName });
    if (!plan.send) {
      toast.warning(plan.skippedBecause ?? "This appointment cannot be confirmed by WhatsApp.");
      return;
    }
    if (!window.confirm(`Send the appointment confirmation to ${patientName} on ${patientPhone}?`)) return;
    setResendingConfirmation(true);
    try {
      const start = new Date(appointment!.start_time);
      const { error } = await supabase.functions.invoke("send-appointment-whatsapp", {
        body: {
          phone: patientPhone,
          patientName,
          appointmentDate: format(start, "dd MMM yyyy"),
          appointmentTime: format(start, "hh:mm a"),
          serviceName: appointment!.service || "-",
          patientGender: (appointment as any)?.patients?.gender || null,
        },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error, "The WhatsApp confirmation could not be sent."));
      toast.success("WhatsApp confirmation sent");
    } catch (e: any) {
      toast.error(e?.message || "The WhatsApp confirmation could not be sent.");
    } finally {
      setResendingConfirmation(false);
    }
  };

  const sendConfirmationButton = patientPhone ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-2 h-7 gap-1.5 text-xs"
      disabled={resendingConfirmation}
      onClick={resendConfirmation}
    >
      <MessageSquare className="h-3 w-3" />
      {resendingConfirmation ? "Sending…" : "Send confirmation"}
    </Button>
  ) : null;
  const patientId = appointment?.patients?.id || appointment?.patient_id;

  // While this appointment is open, every other page offers one tap back to it.
  // Front desk leave here for Billing and then reach for the Appointments menu
  // item, which lands them on the list - the browser's Back button works, but
  // nobody uses it.
  useEffect(() => {
    if (appointmentId && appointment) {
      rememberOpenAppointment({ id: appointmentId, patientName });
    }
  }, [appointmentId, appointment, patientName]);

  // Both grids and the full-size viewer read from one place, so the order the
  // page shows and the order the arrows step through cannot drift apart.
  const {
    thisAppointment: appointmentPhotos,
    others: otherPhotos,
    ordered: orderedPhotos,
  } = orderAppointmentPhotos(photos as any[], appointmentId);

  const TitleTag: any = isPage ? "h1" : SheetTitle;

  // isLoading is false while the query is DISABLED, so an id that has not
  // arrived yet used to fall straight through to "not available" - the click
  // looked like it had opened an empty panel. Waiting for an id is loading.
  const isLoading = !appointmentId || appointmentFetching;

  const inner = (isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Loading...</div>
          ) : appointmentFailed ? (
            // A failed lookup is not a missing appointment. This used to show
            // "not available" for a network blip, so staff retried by closing
            // and reopening and saw the same thing.
            <div className="p-8 text-center text-muted-foreground">
              <p className="font-medium text-foreground">Could not load this appointment</p>
              <p className="text-sm mt-1">{appointmentError instanceof Error ? appointmentError.message : "Something went wrong."}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void retryAppointment()}>Try again</Button>
            </div>
          ) : !appointment ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="font-medium text-foreground">This appointment is not available</p>
              <p className="text-sm mt-1">It may have been deleted, or it belongs to another doctor.</p>
            </div>
          ) : (
            <>
              {frontDeskChange && (
                <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-6 py-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{openAppointmentNotice(frontDeskChange)}</span>
                  {frontDeskChange === "changed" && (
                    <button
                      type="button"
                      className="underline underline-offset-2 font-medium"
                      onClick={() => {
                        setFrontDeskChange(null);
                        void retryAppointment();
                      }}
                    >
                      Show the new details
                    </button>
                  )}
                </div>
              )}
              <SheetHeader className="p-6 pb-4 border-b bg-muted/30">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground mb-1.5 font-normal">Appointment</Badge>
                    <TitleTag className="font-display text-lg font-semibold flex items-center gap-2">
                      <button
                        className="hover:text-primary underline-offset-2 hover:underline transition-colors text-left"
                        onClick={() => {
                          if (patientId) {
                            navigate(`/patients/${patientId}`);
                          }
                        }}
                      >
                        {patientName}
                      </button>
                      {patientIsVip && <VipBadge shimmer />}
                      {patientId && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                    </TitleTag>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(appointment.start_time), "EEE, MMM d, yyyy · h:mm a")}
                    </p>
                    {patientPhone && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {patientPhone}
                      </p>
                    )}
                    {sendConfirmationButton}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {(() => {
                      const s = appointment.status;
                      return <Badge variant="outline" className={`text-xs ${STATUS_BADGE_CLASSES[s] || ""}`}>{s}</Badge>;
                    })()}
                    <RecordOwnerField
                      variant="inline"
                      objectType="appointments"
                      objectLabel="Appointment"
                      recordId={appointment.id}
                      recordLabel={appointmentPatientName(appointment, "Appointment")}
                      ownerId={appointment.owner_id}
                      link="/appointments"
                      onChanged={() => queryClient.invalidateQueries({ queryKey: ["appointment-detail", appointmentId] })}
                    />
                  </div>

                </div>
              </SheetHeader>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b px-6 bg-transparent h-auto p-0">
                  <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Details</TabsTrigger>
                  <TabsTrigger value="procedures" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Prescriptions</TabsTrigger>
                  <TabsTrigger value="prev-appointments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Previous Appointments</TabsTrigger>
                  <TabsTrigger value="prev-procedures" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Previous Prescriptions</TabsTrigger>
                  {canSeeBilling && (
                  <TabsTrigger value="billing" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Billing</TabsTrigger>
                  )}
                  <TabsTrigger value="photos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Photos</TabsTrigger>
                  <TabsTrigger value="feedback" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Feedback</TabsTrigger>
                  <TabsTrigger value="survey" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Survey</TabsTrigger>
                  <TabsTrigger value="attachments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Attachments</TabsTrigger>
                  <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">Notes</TabsTrigger>
                  <TabsTrigger value="ai-repo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs py-3">AI Repository</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className={isPage ? "p-6 grid gap-4 md:grid-cols-2 md:items-start mt-0" : "p-6 space-y-4 mt-0"}>
                  <div>
                    <Label>Patient</Label>
                    <div className="mt-1.5">
                      <Button
                        variant="outline"
                        className="w-full justify-start font-normal text-left"
                        onClick={() => {
                          if (patientId) {
                            navigate(`/patients/${patientId}`);
                          }
                        }}
                      >
                        {patientName}
                        {patientIsVip && <VipBadge />}
                        {patientId && <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />}
                      </Button>
                    </div>
                    {patientPhone && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {patientPhone}
                      </p>
                    )}
                    {sendConfirmationButton}
                  </div>
                  <div>
                    <Label>Investigation</Label>
                    <Textarea
                      className="mt-1.5 min-h-[72px]"
                      placeholder="What was done or planned this visit"
                      value={editInvestigation}
                      onChange={(e) => setEditInvestigation(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Service</Label>
                    <Select value={editService} onValueChange={setEditService}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select service" /></SelectTrigger>
                      <SelectContent>
                        {servicesList.map((s: any) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Primary Concern</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full mt-1.5 justify-start text-left font-normal", editProblemAreas.length === 0 && "text-muted-foreground")}
                        >
                          {editProblemAreas.length === 0
                            ? "Select primary concern"
                            : (problemAreasList as any[])
                                .filter((p: any) => editProblemAreas.includes(p.id))
                                .map((p: any) => p.name)
                                .join(", ")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-2 max-h-64 overflow-y-auto" align="start">
                        {(problemAreasList as any[]).map((pa: any) => (
                          <label key={pa.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                            <Checkbox
                              checked={editProblemAreas.includes(pa.id)}
                              onCheckedChange={(c) =>
                                setEditProblemAreas((prev) => (c ? [...prev, pa.id] : prev.filter((id) => id !== pa.id)))
                              }
                            />
                            {pa.name}
                          </label>
                        ))}
                        {(problemAreasList as any[]).length === 0 && (
                          <p className="text-xs text-muted-foreground p-2">No primary concerns configured.</p>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                  {parentAppointment && (
                    <div>
                      <Label>Parent Appointment</Label>
                      <Button
                        variant="outline"
                        className="w-full justify-start font-normal text-left mt-1.5"
                        onClick={() => { navigate(`/appointments/${(parentAppointment as any).id}`); }}
                      >
                        {(parentAppointment as any).service || "Appointment"} · {format(new Date((parentAppointment as any).start_time), "dd MMM yyyy")}
                        <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                  <div>
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {((procedures as any[]).some((p: any) => !!p?.visit_type) || !!editVisitStatus) && (
                    <div>
                      <Label>Next visit</Label>
                      <Select value={editVisitStatus || "none"} onValueChange={(v) => setEditVisitStatus(v === "none" ? "" : v)}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {visitStatusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <Label>Date</Label>
                      <DateInput
                        className="mt-1.5"
                        withCalendar
                        value={(editStartTime || "").split("T")[0] || ""}
                        onChange={(isoDate) => {
                          const d = isoDate;
                          setEditStartTime((prev) => (d ? `${d}T${(prev || "").split("T")[1] || "09:00"}` : ""));
                          setEditEndTime((prev) => (d ? `${d}T${(prev || "").split("T")[1] || "09:30"}` : ""));
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-0">
                      <div>
                        <Label>Start</Label>
                        <TimePicker12h
                          className="mt-1.5"
                          value={((editStartTime || "").split("T")[1] || "").slice(0, 5)}
                          onChange={(t) => setEditStartTime((prev) => `${(prev || "").split("T")[0] || ""}T${t}`)}
                        />
                      </div>
                      <div>
                        <Label>End</Label>
                        <TimePicker12h
                          className="mt-1.5"
                          value={((editEndTime || "").split("T")[1] || "").slice(0, 5)}
                          onChange={(t) => setEditEndTime((prev) => `${(prev || (editStartTime || "")).split("T")[0] || ""}T${t}`)}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label>Doctor</Label>
                    <Select value={editStaffId || "none"} onValueChange={(v) => setEditStaffId(v === "none" ? "" : v)}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No doctor assigned</SelectItem>
                        {doctorsList.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.first_name} {d.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Beneath the doctor rather than beside it: the row reads
                      "who saw them, then who treated them", and on a phone the
                      two stack anyway. Swapping one costs two taps. */}
                  <div>
                    <Label>Therapist</Label>
                    <StaffCombobox
                      className="mt-1.5"
                      value={editTherapistId}
                      onValueChange={setEditTherapistId}
                      roleFilter={[...THERAPIST_ROLES]}
                      allowNone
                      noneLabel="No therapist assigned"
                      placeholder="Select therapist"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-xs ${((appointment as any).appointment_type || "Walk-in") === "Online" ? "bg-primary/10 text-primary border-primary/30" : ""}`}
                    >
                      {(appointment as any).appointment_type || "Walk-in"}
                    </Badge>
                    {appointment.source && (
                      <Badge variant="outline" className="text-xs">Source: {appointment.source}</Badge>
                    )}
                    {appointment.is_recurring && <Badge variant="outline" className="text-xs">Recurring</Badge>}
                  </div>

                  {/* Moving a visit that already happened writes next week's
                      booking over last week's record, and its bill goes with it.
                      Offered the other way round: booking is the default. */}
                  <AlertDialog open={moveVisitOpen} onOpenChange={setMoveVisitOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Book a new appointment instead?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {appointment.start_time
                            ? `${patientName} was seen on ${format(new Date(appointment.start_time), "dd MMM yyyy")}. `
                            : ""}
                          {rescheduleWarning(visitEvidence)} Changing the date to{" "}
                          {displayDate(editStartTime) || "the new date"} removes that
                          visit from the patient's history and takes the bill with it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={bookInsteadMutation.isPending}>Cancel</AlertDialogCancel>
                        <Button
                          variant="outline"
                          disabled={bookInsteadMutation.isPending || updateMutation.isPending}
                          onClick={() => {
                            setMoveVisitOpen(false);
                            updateMutation.mutate();
                          }}
                        >
                          Move it anyway
                        </Button>
                        <AlertDialogAction
                          disabled={bookInsteadMutation.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            bookInsteadMutation.mutate();
                          }}
                        >
                          {bookInsteadMutation.isPending ? "Booking..." : "Book a new appointment"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div className="flex gap-2 pt-4 border-t">
                    <Button onClick={saveChanges} disabled={updateMutation.isPending || editAppointmentId !== appointmentId} className="flex-1 gap-2">
                      <Save className="h-4 w-4" />
                      {updateMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete appointment?</AlertDialogTitle>
                          {/* It said "permanently remove", which was never true - the row
                              goes to Trash and can be restored. The second sentence is
                              the one that matters now: a Salesforce appointment used to
                              be put back by the next sync, and no longer is. */}
                          <AlertDialogDescription>
                            This will move the appointment to Trash. {appointmentDeleteNote(!!(appointment as any)?.sf_id)}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <SystemRecordSection
                      record={appointment}
                      owner={{
                        objectType: "appointments",
                        objectLabel: "Appointment",
                        recordLabel: appointmentPatientName(appointment, "Appointment"),
                        link: `/appointments`,
                        onChanged: () => queryClient.invalidateQueries({ queryKey: ["appointment-detail", appointmentId] }),
                      }}
                    />
                    <FieldHistorySection objectType="appointments" recordId={appointment.id} />
                  </div>
                </TabsContent>

                <TabsContent value="procedures" className="p-6 space-y-4 mt-0">
                  {appointment.patient_id ? (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold font-display flex items-center gap-2">
                          <Pill className="h-4 w-4" /> Linked Prescriptions
                        </h3>
                        <div className="flex gap-2">
                          <CaseAnalysis patientId={appointment.patient_id} patientName={patientName} appointmentId={appointment.id} />
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setScanProcOpen(true)}>
                            <ScanEye className="h-3 w-3" /> Scan Prescription
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setProcFormOpen(true)}>
                            <Plus className="h-3 w-3" /> Add Prescription
                          </Button>
                        </div>
                      </div>
                      {procedures.length === 0 ? (
                        <div className="text-center py-8 space-y-2">
                          <p className="text-sm text-muted-foreground">No prescriptions linked to this visit. Click "Add Prescription" to create one.</p>
                          {unlinkedProcedureCount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              This patient has {unlinkedProcedureCount.toLocaleString()} imported prescription record{unlinkedProcedureCount === 1 ? "" : "s"} not tied to any appointment.{" "}
                              <button
                                type="button"
                                className="underline underline-offset-2 hover:text-foreground"
                                onClick={() => setActiveTab("prev-procedures")}
                              >
                                View in Previous Prescriptions
                              </button>
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {procedures.map((proc: any) => (
                            <div key={proc.id} className="border rounded-lg p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedProcId(proc.id)}>
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-sm">{proc.service_name}</p>
                                <Badge variant="secondary" className="text-xs">{proc.status}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {procedureDateLabel(proc, "dd/MM/yyyy")}
                                {proc.staff && ` · ${withDrPrefix(`${proc.staff.first_name}`)}`}
                              </p>
                              {proc.diagnosis && <p className="text-xs mt-2 text-muted-foreground">{proc.diagnosis}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No patient linked to this appointment.</p>
                  )}
                </TabsContent>

                <TabsContent value="prev-appointments" className="p-6 space-y-4 mt-0">
                  {appointment.patient_id ? (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold font-display">Previous Appointments</h3>
                        <CaseAnalysis patientId={appointment.patient_id} patientName={patientName} appointmentId={appointment.id} />
                      </div>
                      {previousAppointments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No other appointments for this patient.</p>
                      ) : (
                        <div className="space-y-2">
                          {(previousAppointments as any[]).map((apt: any) => (
                            <div
                              key={apt.id}
                              className="border rounded-lg p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => { navigate(`/appointments/${apt.id}`); }}
                            >
                              {/* What was actually done leads the card. The
                                  service is "Consultation" on most of these and
                                  says nothing; the Investigation text is what a
                                  doctor is looking for. Falls back to the
                                  service when there is no text. */}
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-sm">{investigationText(apt, apt.service || "Consultation")}</p>
                                <Badge variant="outline" className={`text-xs shrink-0 ${showsAsBilled(apt.status, billsByAppointment.has(apt.id)) ? BILLED_BADGE_CLASSES : STATUS_BADGE_CLASSES[apt.status] || ""}`}>{appointmentStatusLabel(apt.status, billsByAppointment.has(apt.id))}</Badge>
                              </div>
                              <p className="text-xs mt-1">
                                <span className="font-medium text-foreground">{displayDate(apt.start_time)}</span>
                                <span className="text-muted-foreground">
                                  {` · ${format(new Date(apt.start_time), "h:mm a")}`}
                                  {apt.staff && ` · ${withDrPrefix(`${apt.staff.first_name} ${apt.staff.last_name}`)}`}
                                </span>
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No patient linked to this appointment.</p>
                  )}
                </TabsContent>

                <TabsContent value="prev-procedures" className="p-6 space-y-4 mt-0">
                  {appointment.patient_id ? (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold font-display">Previous Prescriptions</h3>
                        <CaseAnalysis patientId={appointment.patient_id} patientName={patientName} appointmentId={appointment.id} />
                      </div>
                      {previousProcedures.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No procedures recorded for this patient.</p>
                      ) : (
                        <div className="space-y-2">
                          {(previousProcedures as any[]).map((proc: any) => (
                            <div
                              key={proc.id}
                              className="border rounded-lg p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setSelectedProcId(proc.id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-sm">{proc.service_name}</p>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Badge variant="secondary" className="text-xs">{proc.status}</Badge>
                                  {/* Reading one should not mean opening the
                                      visit that wrote it. */}
                                  <ViewPrescriptionButton procedureId={proc.id} />
                                </div>
                              </div>
                              <p className="text-xs mt-1">
                                <span className="font-medium text-foreground">{procedureDateLabel(proc, "dd/MM/yyyy")}</span>
                                <span className="text-muted-foreground">
                                  {proc.staff && ` · ${withDrPrefix(`${proc.staff.first_name} ${proc.staff.last_name}`)}`}
                                </span>
                              </p>
                              {proc.diagnosis && <p className="text-xs mt-2 text-muted-foreground">{proc.diagnosis}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No patient linked to this appointment.</p>
                  )}
                </TabsContent>

                {canSeeBilling && (
                <TabsContent value="billing" className="p-6 space-y-4 mt-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold font-display flex items-center gap-2">
                      <IndianRupee className="h-4 w-4" /> Billing
                    </h3>
                    {appointment.patient_id && (
                      <Button size="sm" className="gap-2" onClick={handleNewBill}>
                        <Plus className="h-4 w-4" /> New Bill
                      </Button>
                    )}
                  </div>

                  {appointment.patient_id && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Past Bills ({invoices.length})</p>
                      {invoices.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/20">
                          No bills yet. Click "New Bill" to create one.
                        </p>
                      ) : (
                        invoices.map((inv: any) => (
                          <div
                            key={inv.id}
                            className="border rounded-lg p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => { navigate(`/billing?viewInvoice=${inv.id}`); }}
                            title="Open bill"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm">{inv.invoice_number}</p>
                                <ExternalLink className="h-3 w-3 text-primary" />
                              </div>
                              <Badge variant="secondary" className={`text-xs ${inv.status === "Paid" ? "bg-success/10 text-success" : inv.status === "Partial" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>
                                {inv.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(inv.created_at), "dd MMM yyyy")} · {inv.services?.join(", ")}
                            </p>
                            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                              <span>Total: ₹{Number(inv.total_amount).toLocaleString()}</span>
                              <span>Paid: ₹{Number(inv.paid_amount).toLocaleString()}</span>
                              <span>Balance: ₹{(Number(inv.total_amount) - Number(inv.paid_amount)).toLocaleString()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {(parentAppointment || installments.length > 0) && (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs font-semibold text-muted-foreground">Recurring Installments</p>
                      {parentAppointment && (
                        <button
                          className="w-full text-left border rounded-lg p-2 bg-muted/20 hover:bg-muted/40 transition-colors"
                          onClick={() => { navigate(`/appointments/${(parentAppointment as any).id}`); }}
                        >
                          <span className="text-xs text-muted-foreground">Parent appointment</span>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            {(parentAppointment as any).service || "Appointment"}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date((parentAppointment as any).start_time), "dd MMM yyyy, h:mm a")}
                            </span>
                            <ExternalLink className="h-3 w-3 text-primary" />
                          </p>
                        </button>
                      )}
                      {installments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No installments recorded for this plan.</p>
                      ) : (
                        (installments as any[]).map((inv: any) => {
                          const balance = instBalance(inv);
                          const merged = inv.status === "Merged";
                          const open = balance > 0.5 && !merged;
                          const scheduled = open && (inv.installment_number || 1) > 1 && Number(inv.tax_amount || 0) === 0;
                          const collectable = isCollectable(inv);
                          const { tax: dueTax, total: dueTotal } = instTax(inv);
                          return (
                            <div
                              key={inv.id}
                              className="border rounded-lg p-2.5 hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {collectable && (
                                    <Checkbox
                                      checked={selectedInstallments.includes(inv.id)}
                                      onCheckedChange={(c) =>
                                        setSelectedInstallments((prev) =>
                                          c ? [...prev, inv.id] : prev.filter((id) => id !== inv.id),
                                        )
                                      }
                                    />
                                  )}
                                  <button
                                    className="text-sm font-medium text-left hover:underline flex items-center gap-1.5"
                                    onClick={() => { navigate(`/billing?viewInvoice=${inv.id}`); }}
                                  >
                                    {scheduled ? "Scheduled amount" : "Installment"} {inv.installment_number || "—"} of {inv.installment_count || "—"}
                                    <ExternalLink className="h-3 w-3 text-primary" />
                                  </button>
                                  {inv.appointment_id === appointmentId && (
                                    <span className="ml-2 text-[10px] text-primary">this appointment</span>
                                  )}
                                </div>
                                <Badge variant="secondary" className={`text-xs shrink-0 ${open ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                                  {merged ? "Merged" : open ? "Open" : "Closed"}
                                </Badge>
                              </div>
                              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                                <span>Due {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}</span>
                                <span>Total ₹{Number(inv.total_amount).toLocaleString()}</span>
                                <span>Balance ₹{balance.toLocaleString()}</span>
                              </div>
                              {inv.appointment_id && inv.appointment_id !== appointmentId && (
                                <button
                                  className="mt-1 text-[11px] text-primary hover:underline flex items-center gap-1"
                                  onClick={() => { navigate(`/appointments/${inv.appointment_id}`); }}
                                >
                                  View linked appointment <ExternalLink className="h-3 w-3" />
                                </button>
                              )}
                              {open && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {collectable
                                    ? `Billable today — tax ₹${dueTax.toFixed(2)}, payable ₹${dueTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                    : "Not billable yet — becomes payable on its due date"}
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                      {(installments as any[]).some((i: any) => isCollectable(i)) && (
                        <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                          <p className="text-xs font-semibold">Collect due payments</p>
                          <p className="text-[11px] text-muted-foreground">
                            Select one or more instalments due today (or earlier). Selecting more than one merges them into a single invoice.
                          </p>
                          <div className="flex items-center gap-2">
                            <Select value={collectMode} onValueChange={setCollectMode}>
                              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["Cash", "Card", "UPI", "Bank Transfer", "Cheque"].map((m) => (
                                  <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              disabled={selectedRows.length === 0 || collecting}
                              onClick={collectSelected}
                            >
                              {collecting
                                ? "Collecting..."
                                : `Collect ₹${selectedTotals.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}${selectedRows.length > 1 ? ` (merge ${selectedRows.length})` : ""}`}
                            </Button>
                          </div>
                          {selectedRows.length > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              Base ₹{selectedTotals.base.toLocaleString(undefined, { maximumFractionDigits: 2 })} + tax ₹{selectedTotals.tax.toFixed(2)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!appointment.patient_id && (
                    <p className="text-sm text-muted-foreground text-center py-8">No patient linked to this appointment.</p>
                  )}
                </TabsContent>
                )}

                <TabsContent value="photos" className="p-6 space-y-4 mt-0">
                  {/* Wraps, because the heading and three buttons are wider
                      than a phone. Without this the row ran off the right edge
                      and took the camera button with it, so the tab showed an
                      empty-state line naming a button that was off-screen.
                      PatientToolsBar beside this already wraps for the same
                      reason. */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold font-display flex items-center gap-2">
                      <Camera className="h-4 w-4" /> Photos
                    </h3>
                    {appointment.patient_id && (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* This tab had no way to attach a photo already on the
                            machine - only the camera. The appointment id is
                            passed so an attached photo lands under "This
                            Appointment" below, not just in the patient's pile. */}
                        <AttachPhotosButton
                          patientId={appointment.patient_id}
                          appointmentId={appointmentId}
                          size="sm"
                          className="gap-1"
                        />
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setSkinTrackerOpen(true)}>
                          <ScanEye className="h-3 w-3" /> Skin Tracker
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setCameraOpen(true)}>
                          <Plus className="h-3 w-3" /> Take Photo
                        </Button>
                      </div>
                    )}
                  </div>

                  {appointmentPhotos.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">This Appointment</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        {appointmentPhotos.map((photo: any) => (
                          <div key={photo.id} className="stat-card p-0 overflow-hidden group">
                            <div className="relative">
                              {/* A button, not a clickable div, so the thumbnail
                                  is reachable from the keyboard - and the delete
                                  control is a sibling rather than nested inside
                                  it. Same shape as the patient record's grid. */}
                              <button
                                type="button"
                                aria-label="View photo full size"
                                className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setViewerIndex(photoPositionIn(orderedPhotos, photo))}
                              >
                                <img src={photo.photo_url} alt="" loading="lazy" className="w-full aspect-square object-cover" />
                              </button>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1.5 right-1.5 h-7 w-7 opacity-90"
                                onClick={(e) => { e.stopPropagation(); deletePhoto(photo); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="p-2 bg-card">
                              <p className="text-xs font-medium truncate">{patientName}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(photo.taken_at), "dd MMM yyyy")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {otherPhotos.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">All Patient Photos</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        {otherPhotos.map((photo: any) => (
                          <div key={photo.id} className="stat-card p-0 overflow-hidden group">
                            <div className="relative">
                              {/* A button, not a clickable div, so the thumbnail
                                  is reachable from the keyboard - and the delete
                                  control is a sibling rather than nested inside
                                  it. Same shape as the patient record's grid. */}
                              <button
                                type="button"
                                aria-label="View photo full size"
                                className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setViewerIndex(photoPositionIn(orderedPhotos, photo))}
                              >
                                <img src={photo.photo_url} alt="" loading="lazy" className="w-full aspect-square object-cover" />
                              </button>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1.5 right-1.5 h-7 w-7 opacity-90"
                                onClick={(e) => { e.stopPropagation(); deletePhoto(photo); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="p-2 bg-card">
                              <p className="text-xs font-medium truncate">{patientName}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(photo.taken_at), "dd MMM yyyy")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {photos.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No photos yet. Click "Take Photo" to add one.</p>
                  )}
                </TabsContent>

                <FeedbackTabContent
                  appointmentId={appointmentId!}
                  patientId={appointment.patient_id}
                  patientName={patientName}
                  patientPhone={patientPhone}
                  npsScore={npsScore}
                  setNpsScore={setNpsScore}
                  serviceRating={serviceRating}
                  setServiceRating={setServiceRating}
                  feedbackSubmitting={feedbackSubmitting}
                  setFeedbackSubmitting={setFeedbackSubmitting}
                  queryClient={queryClient}
                />

                <TabsContent value="survey" className="p-6 space-y-4 mt-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold font-display flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4" /> Patient Survey
                    </h3>
                  </div>

                  {!appointment.patient_id ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No patient linked to this appointment.</p>
                  ) : surveyTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No active survey templates available. Create one in the Surveys module.</p>
                  ) : (
                    <>
                      <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                        <Label className="text-xs font-medium">Select Survey Template</Label>
                        <Select
                          value={selectedSurveyTemplateId || ""}
                          onValueChange={(v) => setSelectedSurveyTemplateId(v)}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Choose a survey template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {surveyTemplates.map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1"
                            disabled={!selectedSurveyTemplateId}
                            onClick={async () => {
                              const tpl = surveyTemplates.find((t: any) => t.id === selectedSurveyTemplateId);
                              if (!tpl || !appointment.patient_id) return;
                              // Ensure a pending assignment exists so the portal shows this survey
                              const { data: existing } = await supabase
                                .from("survey_assignments")
                                .select("id")
                                .eq("patient_id", appointment.patient_id)
                                .eq("template_id", tpl.id)
                                .eq("status", "pending")
                                .maybeSingle();
                              if (!existing) {
                                await supabase.from("survey_assignments").insert({
                                  patient_id: appointment.patient_id,
                                  template_id: tpl.id,
                                  status: "pending",
                                });
                              }
                              const { error } = await supabase.functions.invoke("send-survey-whatsapp", {
                                body: {
                                  patient_id: appointment.patient_id,
                                  template_name: tpl.name,
                                  template_id: tpl.id,
                                  appointment_id: appointmentId,
                                },
                              });
                              if (error) toast.error("Failed to send survey link");
                              else toast.success("Survey link sent on WhatsApp");
                            }}
                          >
                            Send Survey Link
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 gap-1"
                            disabled={!selectedSurveyTemplateId}
                            onClick={() => setSurveyFillOpen(true)}
                          >
                            Fill Now
                          </Button>
                        </div>
                      </div>
                      <SurveyRecommendations appointmentId={appointmentId!} patientId={appointment.patient_id} />
                    </>
                  )}
                </TabsContent>

                {/* The patient's whole document set, the same list and the same
                    component as the patient page's Attachments tab - a consent
                    form signed last year is exactly what is wanted while the
                    patient is in the chair. */}
                <TabsContent value="attachments" className="p-6 pt-2 mt-0">
                  {!appointment.patient_id ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No patient linked to this appointment.</p>
                  ) : (
                    <PatientAttachments patientId={appointment.patient_id} title="Attachments" />
                  )}
                </TabsContent>

                <TabsContent value="notes" className="p-6 space-y-4 mt-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-sm font-semibold font-display flex items-center gap-2">
                      <StickyNote className="h-4 w-4" /> Notes
                    </h3>
                    {/* Who did the treatment, without anybody having to type
                        it. Read from the appointment, so a swap is reflected
                        here the moment it is saved. */}
                    <p className="text-xs text-muted-foreground">
                      {therapistDisplayName(appointment as never)
                        ? <>Therapist: <span className="font-medium text-foreground">{therapistDisplayName(appointment as never)}</span></>
                        : "No therapist assigned"}
                    </p>
                  </div>
                  {/* No draft mode here, unlike the New Procedure form: the
                      appointment always exists by the time this sheet is open,
                      so notes save straight away. */}
                  <StickyNotes
                    appointmentId={appointmentId}
                    composerDefaults={{ title: therapistNoteTitle(therapistDisplayName(appointment as never)) }}
                  />
                </TabsContent>
                <TabsContent value="ai-repo" className="p-6 mt-0">
                  <AiRepository patientId={appointment.patient_id} patientName={patientName} />
                </TabsContent>
              </Tabs>
            </>
          ));

  return (
    <>
      {isPage ? (
        <div className="w-full rounded-xl border bg-card overflow-hidden">{inner}</div>
      ) : (
        <Sheet open={!!appointmentId} onOpenChange={(open) => { if (!open) handleClose(); }}>
          <SheetContent className={fullScreen ? "w-screen sm:max-w-none max-w-none overflow-y-auto p-0" : "sm:max-w-xl w-full overflow-y-auto p-0"}>{inner}</SheetContent>
        </Sheet>
      )}

      {/* The same viewer the patient record opens: chevrons, the arrow keys, a
          counter and the original. It used to be a bare dialog here, so seeing
          the next photo meant closing this one and finding the next tile. */}
      <PhotoViewer
        photos={orderedPhotos}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        patientName={patientName}
      />
      {cameraOpen && appointment?.patient_id && (
        <CameraCapture
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          patientId={appointment.patient_id}
          patientName={patientName}
          context="appointment"
          contextId={appointmentId!}
        />
      )}

      {skinTrackerOpen && appointment?.patient_id && (
        <SkinTracker
          open={skinTrackerOpen}
          onOpenChange={setSkinTrackerOpen}
          photos={photos}
          patientName={patientName}
          patientId={appointment.patient_id}
          appointmentId={appointmentId ?? undefined}
        />
      )}

      {procFormOpen && appointment?.patient_id && (
        <ProcedureFormDialog
          open={procFormOpen}
          onOpenChange={setProcFormOpen}
          defaultPatientId={appointment.patient_id}
          defaultAppointmentId={appointmentId!}
          defaultStaffId={appointment.staff_id}
          defaultProblemAreaIds={((appointment as any).problem_area_ids as string[]) || []}
        />
      )}

      {scanProcOpen && appointment?.patient_id && (
        <ScanProcedureDialog
          open={scanProcOpen}
          onOpenChange={setScanProcOpen}
          appointmentId={appointmentId!}
          patientId={appointment.patient_id}
          staffId={appointment.staff_id}
        />
      )}

      <ProcedureDetailSheet procedureId={selectedProcId} onClose={() => setSelectedProcId(null)} />

      {surveyFillOpen && appointment?.patient_id && selectedSurveyTemplateId && (
        <SurveyFill
          open={surveyFillOpen}
          onOpenChange={(v) => { setSurveyFillOpen(v); if (!v) setSelectedSurveyTemplateId(null); }}
          templateId={selectedSurveyTemplateId}
          appointmentId={appointmentId!}
          patientId={appointment.patient_id}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ["survey-responses", appointmentId] })}
        />
      )}
    </>
  );
}

