import { Toaster } from "@/components/ui/toaster";
import { AppLoadingScreen } from "@/components/shared/AppLoadingScreen";
import { ALL_FEEDBACKS_KEY } from "@/lib/reportsCatalog";
import { staffAccess } from "@/lib/staffAccess";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ModalProvider } from "@/hooks/useModal";
import { AppLayout } from "@/components/layout/AppLayout";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { ReactNode, Suspense } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { useCurrencySettings } from "@/lib/currency";
import { AppErrorBoundary } from "@/components/shared/AppErrorBoundary";

// Every page is its own lazy-loaded chunk instead of one large upfront
// bundle - the browser only downloads the page currently being visited.
const Index = lazyWithReload(() => import("./pages/Index"));
const Patients = lazyWithReload(() => import("./pages/Patients"));
const PatientDetail = lazyWithReload(() => import("./pages/PatientDetail"));
const Appointments = lazyWithReload(() => import("./pages/Appointments"));
const AppointmentDetail = lazyWithReload(() => import("./pages/AppointmentDetail"));
const Services = lazyWithReload(() => import("./pages/Services"));
const Billing = lazyWithReload(() => import("./pages/Billing"));
const Reports = lazyWithReload(() => import("./pages/Reports"));
const ReportView = lazyWithReload(() => import("./pages/ReportView"));
const ReportConfigurator = lazyWithReload(() => import("./pages/ReportConfigurator"));
const Dashboards = lazyWithReload(() => import("./pages/Dashboards"));
const DashboardView = lazyWithReload(() => import("./pages/DashboardView"));
const DashboardExplore = lazyWithReload(() => import("./pages/DashboardExplore"));
const Procedures = lazyWithReload(() => import("./pages/Procedures"));
const ProcedureNew = lazyWithReload(() => import("./pages/ProcedureNew"));
const Pharma = lazyWithReload(() => import("./pages/Pharma"));
const Photos = lazyWithReload(() => import("./pages/Photos"));
const LeaveManagement = lazyWithReload(() => import("./pages/LeaveManagement"));
const Assets = lazyWithReload(() => import("./pages/Assets"));
const Settings = lazyWithReload(() => import("./pages/Settings"));
const TaxMasterForm = lazyWithReload(() => import("./pages/TaxMasterForm"));
const TaxMasterDetail = lazyWithReload(() => import("./pages/TaxMasterDetail"));
const Orders = lazyWithReload(() => import("./pages/Orders"));
const TaxMaster = lazyWithReload(() => import("./pages/TaxMaster"));
const Expenses = lazyWithReload(() => import("./pages/Expenses"));
const StaffManagement = lazyWithReload(() => import("./pages/StaffManagement"));
const StaffDetail = lazyWithReload(() => import("./pages/StaffDetail"));
const WhatsAppLog = lazyWithReload(() => import("./pages/WhatsAppLog"));
const Leads = lazyWithReload(() => import("./pages/Leads"));
const WhatsAppCenter = lazyWithReload(() => import("./pages/communications/WhatsAppCenter"));
const WhatsAppTemplates = lazyWithReload(() => import("./pages/communications/WhatsAppTemplates"));
const WhatsAppConfig = lazyWithReload(() => import("./pages/communications/WhatsAppConfig"));
const WhatsAppConversations = lazyWithReload(() => import("./pages/communications/WhatsAppConversations"));
const WhatsAppOptOuts = lazyWithReload(() => import("./pages/communications/WhatsAppOptOuts"));
const AgenticMarketing = lazyWithReload(() => import("./pages/communications/AgenticMarketing"));
const VoiceCenter = lazyWithReload(() => import("./pages/communications/VoiceCenter"));
const EmailCenter = lazyWithReload(() => import("./pages/communications/EmailCenter"));
const CommunicationsCalendar = lazyWithReload(() => import("./pages/communications/CommunicationsCalendar"));
const JourneyBuilder = lazyWithReload(() => import("./pages/communications/JourneyBuilder"));
const JourneyCanvas = lazyWithReload(() => import("./pages/communications/JourneyCanvas"));
const JourneyAnalytics = lazyWithReload(() => import("./pages/communications/JourneyAnalytics"));
const JourneyFailures = lazyWithReload(() => import("./pages/communications/JourneyFailures"));
const MetaHub = lazyWithReload(() => import("./pages/communications/meta/MetaHub"));
const MetaConnection = lazyWithReload(() => import("./pages/communications/meta/MetaConnection"));
const MetaMarketing = lazyWithReload(() => import("./pages/communications/meta/MetaMarketing"));
const MetaCampaigns = lazyWithReload(() => import("./pages/communications/meta/MetaCampaigns"));
const MetaAdSets = lazyWithReload(() => import("./pages/communications/meta/MetaAdSets"));
const MetaAds = lazyWithReload(() => import("./pages/communications/meta/MetaAds"));
const AdPerformance = lazyWithReload(() => import("./pages/communications/meta/AdPerformance"));
const MetaOrganicPosts = lazyWithReload(() => import("./pages/communications/meta/MetaOrganicPosts"));
const MetaDiagnostics = lazyWithReload(() => import("./pages/communications/meta/MetaDiagnostics"));
const OAuthResult = lazyWithReload(() => import("./pages/auth/OAuthResult"));
const Campaigns = lazyWithReload(() => import("./pages/Campaigns"));
const CampaignDetail = lazyWithReload(() => import("./pages/CampaignDetail"));
const PortalLanding = lazyWithReload(() => import("./pages/portal/PortalLanding"));
const PortalLogin = lazyWithReload(() => import("./pages/portal/PortalLogin"));
const Portal = lazyWithReload(() => import("./pages/portal/Portal"));
const Login = lazyWithReload(() => import("./pages/auth/Login"));
const OAuthConsent = lazyWithReload(() => import("./pages/auth/OAuthConsent"));
const ShopHome = lazyWithReload(() => import("./pages/shop/ShopHome"));
const ShopProduct = lazyWithReload(() => import("./pages/shop/ShopProduct"));
const ShopCart = lazyWithReload(() => import("./pages/shop/ShopCart"));
const ShopCheckout = lazyWithReload(() => import("./pages/shop/ShopCheckout"));
const ShopOrders = lazyWithReload(() => import("./pages/shop/ShopOrders"));
const Website = lazyWithReload(() => import("./pages/Website"));
const Landing = lazyWithReload(() => import("./pages/clinic/Landing"));
const ProblemAreas = lazyWithReload(() => import("./pages/ProblemAreas"));
const DuplicateManagement = lazyWithReload(() => import("./pages/DuplicateManagement"));
const SurveyTemplates = lazyWithReload(() => import("./pages/SurveyTemplates"));
const SurveyTemplateDetail = lazyWithReload(() => import("./pages/SurveyTemplateDetail"));
const AllSurveys = lazyWithReload(() => import("./pages/AllSurveys"));
const SurveyResponseDetail = lazyWithReload(() => import("./pages/SurveyResponseDetail"));
const SurveyResponseEdit = lazyWithReload(() => import("./pages/SurveyResponseEdit"));
const SurveyNew = lazyWithReload(() => import("./pages/SurveyNew"));
const Vendors = lazyWithReload(() => import("./pages/Vendors"));
const UserManagement = lazyWithReload(() => import("./pages/UserManagement"));
const HistoryTracking = lazyWithReload(() => import("./pages/admin/HistoryTracking"));
const PhotoFingerprints = lazyWithReload(() => import("./pages/admin/PhotoFingerprints"));
const KnowledgeCategories = lazyWithReload(() => import("./pages/admin/KnowledgeCategories"));
const KnowledgeArticles = lazyWithReload(() => import("./pages/KnowledgeArticles"));
const FeedbackRca = lazyWithReload(() => import("./pages/FeedbackRca"));
const FeedbackRcaDetail = lazyWithReload(() => import("./pages/FeedbackRcaDetail"));
const KnowledgeArticleDetail = lazyWithReload(() => import("./pages/KnowledgeArticleDetail"));
const Attendance = lazyWithReload(() => import("./pages/Attendance"));
const AttendanceAdmin = lazyWithReload(() => import("./pages/admin/AttendanceAdmin"));
const VisitsNeedingReview = lazyWithReload(() => import("./pages/admin/VisitsNeedingReview"));
const CurrencyBilling = lazyWithReload(() => import("./pages/admin/CurrencyBilling"));
const PortalModules = lazyWithReload(() => import("./pages/admin/PortalModules"));
const FeedbackSettings = lazyWithReload(() => import("./pages/admin/FeedbackSettings"));
const UnitMaster = lazyWithReload(() => import("./pages/UnitMaster"));
const ValidationRules = lazyWithReload(() => import("./pages/ValidationRules"));
const ValidationRuleBuilder = lazyWithReload(() => import("./pages/ValidationRuleBuilder"));
const CustomFields = lazyWithReload(() => import("./pages/CustomFields"));
const Admin = lazyWithReload(() => import("./pages/Admin"));
const TrashPage = lazyWithReload(() => import("./pages/Trash"));
const TrashAdmin = lazyWithReload(() => import("./pages/TrashAdmin"));
const CategoryMaster = lazyWithReload(() => import("./pages/CategoryMaster"));
const Profile = lazyWithReload(() => import("./pages/Profile"));
const AccessDenied = lazyWithReload(() => import("./pages/AccessDenied"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      networkMode: "always",
      // Without these two every query was stale the instant it resolved AND
      // refetched whenever the window regained focus - so clicking back into
      // the browser re-ran every query on the page, whole-table fetches
      // included. That is most of the reported slowness, and the flicker of
      // spinners and rows redrawing is what staff described as the app
      // refreshing by itself.
      //
      // A minute of staleness is the right trade: mutations already invalidate
      // the keys they touch, so anything this user changes is still immediate,
      // and the clinic does not need another user's edit within the same minute.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // No retry. A mutation is not idempotent: retrying a failed INSERT is how
      // you get two invoices for one bill. It bit here because creating a
      // record for another doctor writes the row and THEN fails, when
      // PostgREST runs the row-scope SELECT policy over the RETURNING clause -
      // so the retry created a second row every time.
      retry: 0,
      networkMode: "always",
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error("Query failed:", query.queryKey, error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      console.error("Mutation failed:", mutation.options.mutationKey, error);
    },
  }),
});

/** Loads admin currency settings once so every amount formats consistently. */
function CurrencyLoader() {
  useCurrencySettings();
  return null;
}

/** Shown briefly while a lazy-loaded page chunk downloads. */
function PageLoader() {
  // A page file that stalls (rather than fails) used to spin for ever.
  return <AppLoadingScreen variant="spinner" />;
}

/** Admin-only routes (user & profile management). */
/** Signed in, but the staff record has been switched off. */
function DeactivatedNotice() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">This account has been deactivated</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Ask an administrator to reactivate it if you still need access.
        </p>
        <button className="mt-4 text-sm text-primary hover:underline" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// Signed in, but not a clinic staff member (for example a patient who created an
// account). The clinic app is for staff only; the database refuses these accounts too.
function NotStaffNotice() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">This app is for clinic staff only</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your account does not have access. Patients can use the patient portal instead.
        </p>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <a className="text-primary hover:underline" href="/portal">Go to patient portal</a>
          <button className="text-primary hover:underline" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, staffDeactivated, staffProfile, loading, session } = useAuth();
  if (loading) return <AppLoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (staffDeactivated) return <DeactivatedNotice />;
  if (!staffProfile) return <NotStaffNotice />;
  return isAdmin ? <>{children}</> : <AccessDenied />;
}

function ProtectedRoute({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { isAdmin, permissions, staffDeactivated, staffProfile, loading, session } = useAuth();
  if (loading) return <AppLoadingScreen />;
  const access = staffAccess({
    hasSession: !!session,
    isStaff: !!staffProfile,
    staffDeactivated,
    isAdmin,
    permissions,
    moduleKey,
  });
  if (access === "sign_in") return <Navigate to="/login" replace />;
  if (access === "deactivated") return <DeactivatedNotice />;
  if (access === "not_staff") return <NotStaffNotice />;
  if (access === "allowed") return <>{children}</>;
  return <AccessDenied />;
}

const App = () => (
  <AppErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ThemeProvider>
          <ModalProvider>
          <BrowserRouter>
            <Toaster />
            <Sonner />
            <InstallBanner />
            <CurrencyLoader />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Marketing website */}
            <Route path="/website" element={<Website />} />
            <Route path="/clinic" element={<Landing />} />

            {/* Auth pages */}
            <Route path="/login" element={<Login />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            {/* Public sign-up is closed: staff logins are created by an admin in User Management. */}
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            {/* Where the Meta connect popup lands; it reads the result from the URL fragment
                and posts it back to the opener. Deliberately outside AppLayout. */}
            <Route path="/oauth/result" element={<OAuthResult />} />

            {/* Public Shop — own layout */}
            <Route path="/shop" element={<ShopLayout />}>
              <Route index element={<ShopHome />} />
              <Route path="product/:id" element={<ShopProduct />} />
              <Route path="cart" element={<ShopCart />} />
              <Route path="checkout" element={<ShopCheckout />} />
              <Route path="orders" element={<ShopOrders />} />
            </Route>

            {/* Patient Portal — outside clinic layout */}
            <Route path="/portal" element={<PortalLanding />} />
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal/dashboard" element={<Portal />} />
            <Route path="/portal/dashboard/:tab" element={<Portal />} />
            <Route path="/portal/:tab" element={<Portal />} />

            {/* Clinic app — inside sidebar layout */}
            <Route
              path="*"
              element={
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<ProtectedRoute moduleKey="dashboard"><Index /></ProtectedRoute>} />
                    <Route path="/patients" element={<ProtectedRoute moduleKey="patients"><Patients /></ProtectedRoute>} />
                    <Route path="/patients/:id" element={<ProtectedRoute moduleKey="patients"><PatientDetail /></ProtectedRoute>} />
                    <Route path="/leave" element={<ProtectedRoute moduleKey="leave"><LeaveManagement /></ProtectedRoute>} />
                    <Route path="/admin/attendance" element={<ProtectedRoute moduleKey="attendance_admin"><AttendanceAdmin /></ProtectedRoute>} />
                    <Route path="/admin/visits-to-review" element={<ProtectedRoute moduleKey="settings"><VisitsNeedingReview /></ProtectedRoute>} />
                    <Route path="/appointments" element={<ProtectedRoute moduleKey="appointments"><Appointments /></ProtectedRoute>} />
                    <Route path="/appointments/:id" element={<ProtectedRoute moduleKey="appointments"><AppointmentDetail /></ProtectedRoute>} />
                    <Route path="/services" element={<ProtectedRoute moduleKey="services"><Services /></ProtectedRoute>} />
                    <Route path="/knowledge" element={<ProtectedRoute moduleKey="services"><KnowledgeArticles /></ProtectedRoute>} />
            <Route path="/all-feedbacks" element={<ProtectedRoute moduleKey="feedback_rca"><ReportView reportKey={ALL_FEEDBACKS_KEY} /></ProtectedRoute>} />
            <Route path="/feedback-rca" element={<ProtectedRoute moduleKey="feedback_rca"><FeedbackRca /></ProtectedRoute>} />
            <Route path="/feedback-rca/:id" element={<ProtectedRoute moduleKey="feedback_rca"><FeedbackRcaDetail /></ProtectedRoute>} />
                    <Route path="/knowledge/:id" element={<ProtectedRoute moduleKey="services"><KnowledgeArticleDetail /></ProtectedRoute>} />
                    <Route path="/billing" element={<ProtectedRoute moduleKey="billing"><Billing /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute moduleKey="reports"><Reports /></ProtectedRoute>} />
                    <Route path="/reports/:key" element={<ProtectedRoute moduleKey="reports"><ReportView /></ProtectedRoute>} />
                    <Route path="/report-builder" element={<ProtectedRoute moduleKey="report_builder"><ReportConfigurator /></ProtectedRoute>} />
                    <Route path="/dashboards" element={<ProtectedRoute moduleKey="dashboards"><Dashboards /></ProtectedRoute>} />
                    <Route path="/dashboards/:id" element={<ProtectedRoute moduleKey="dashboards"><DashboardView /></ProtectedRoute>} />
                    <Route path="/dashboard-explore" element={<ProtectedRoute moduleKey="dashboard"><DashboardExplore /></ProtectedRoute>} />
                    <Route path="/whatsapp-log" element={<ProtectedRoute moduleKey="campaigns"><WhatsAppLog /></ProtectedRoute>} />
                    <Route path="/leads" element={<ProtectedRoute moduleKey="leads"><Leads /></ProtectedRoute>} />
                    <Route path="/communications/whatsapp" element={<ProtectedRoute moduleKey="communications"><WhatsAppCenter /></ProtectedRoute>} />
                    <Route path="/communications/whatsapp/templates" element={<ProtectedRoute moduleKey="communications"><WhatsAppTemplates /></ProtectedRoute>} />
                    <Route path="/communications/whatsapp/config" element={<ProtectedRoute moduleKey="communications"><WhatsAppConfig /></ProtectedRoute>} />
                    <Route path="/communications/whatsapp/conversations" element={<ProtectedRoute moduleKey="communications"><WhatsAppConversations /></ProtectedRoute>} />
                    <Route path="/communications/whatsapp/opt-outs" element={<ProtectedRoute moduleKey="communications"><WhatsAppOptOuts /></ProtectedRoute>} />
                    <Route path="/communications/voice" element={<ProtectedRoute moduleKey="communications"><VoiceCenter /></ProtectedRoute>} />
                    <Route path="/communications/email" element={<ProtectedRoute moduleKey="communications"><EmailCenter /></ProtectedRoute>} />
                    <Route path="/communications/calendar" element={<ProtectedRoute moduleKey="communications"><CommunicationsCalendar /></ProtectedRoute>} />
                    <Route path="/communications/agentic-marketing" element={<ProtectedRoute moduleKey="agentic_marketing"><AgenticMarketing /></ProtectedRoute>} />
                    <Route path="/communications/journeys" element={<ProtectedRoute moduleKey="communications"><JourneyBuilder /></ProtectedRoute>} />
                    <Route path="/communications/journeys/:id/analytics" element={<ProtectedRoute moduleKey="communications"><JourneyAnalytics /></ProtectedRoute>} />
                    <Route path="/communications/journeys/:id/failures" element={<ProtectedRoute moduleKey="communications"><JourneyFailures /></ProtectedRoute>} />
                    <Route path="/communications/journeys/:id" element={<ProtectedRoute moduleKey="communications"><JourneyCanvas /></ProtectedRoute>} />
                    <Route path="/communications/meta" element={<ProtectedRoute moduleKey="meta"><MetaHub /></ProtectedRoute>} />
                    <Route path="/communications/meta/connection" element={<ProtectedRoute moduleKey="meta_connection"><MetaConnection /></ProtectedRoute>} />
                    <Route path="/communications/meta/marketing" element={<ProtectedRoute moduleKey="meta"><MetaMarketing /></ProtectedRoute>} />
                    <Route path="/communications/meta/campaigns" element={<ProtectedRoute moduleKey="meta"><MetaCampaigns /></ProtectedRoute>} />
                    <Route path="/communications/meta/ad-sets" element={<ProtectedRoute moduleKey="meta"><MetaAdSets /></ProtectedRoute>} />
                    <Route path="/communications/meta/ads/:id/performance" element={<ProtectedRoute moduleKey="meta"><AdPerformance /></ProtectedRoute>} />
                    <Route path="/communications/meta/ads" element={<ProtectedRoute moduleKey="meta"><MetaAds /></ProtectedRoute>} />
                    <Route path="/communications/meta/organic" element={<ProtectedRoute moduleKey="meta"><MetaOrganicPosts /></ProtectedRoute>} />
                    <Route path="/communications/meta/diagnostics" element={<ProtectedRoute moduleKey="meta"><MetaDiagnostics /></ProtectedRoute>} />
                    <Route path="/campaigns" element={<ProtectedRoute moduleKey="campaigns"><Campaigns /></ProtectedRoute>} />
                    <Route path="/campaigns/:id" element={<ProtectedRoute moduleKey="campaigns"><CampaignDetail /></ProtectedRoute>} />
                    <Route path="/procedures" element={<ProtectedRoute moduleKey="procedures"><Procedures /></ProtectedRoute>} />
                    <Route path="/procedures/new" element={<ProtectedRoute moduleKey="procedures"><ProcedureNew /></ProtectedRoute>} />
                    <Route path="/pharma" element={<ProtectedRoute moduleKey="pharmacy"><Pharma /></ProtectedRoute>} />
                    <Route path="/photos" element={<ProtectedRoute moduleKey="photos"><Photos /></ProtectedRoute>} />
                    <Route path="/assets" element={<ProtectedRoute moduleKey="assets"><Assets /></ProtectedRoute>} />
                    <Route path="/orders" element={<ProtectedRoute moduleKey="portal_orders"><Orders /></ProtectedRoute>} />
                    <Route path="/expenses" element={<ProtectedRoute moduleKey="expenses"><Expenses /></ProtectedRoute>} />
                    <Route path="/staff" element={<ProtectedRoute moduleKey="staff"><StaffManagement /></ProtectedRoute>} />
                    <Route path="/staff/:id" element={<ProtectedRoute moduleKey="staff"><StaffDetail /></ProtectedRoute>} />
                    <Route path="/problem-areas" element={<ProtectedRoute moduleKey="problem_areas"><ProblemAreas /></ProtectedRoute>} />
                    <Route path="/survey-templates" element={<ProtectedRoute moduleKey="surveys"><SurveyTemplates /></ProtectedRoute>} />
                    <Route path="/survey-templates/:id" element={<ProtectedRoute moduleKey="surveys"><SurveyTemplateDetail /></ProtectedRoute>} />
                    <Route path="/all-surveys" element={<ProtectedRoute moduleKey="surveys"><AllSurveys /></ProtectedRoute>} />
                    <Route path="/surveys/new" element={<ProtectedRoute moduleKey="surveys"><SurveyNew /></ProtectedRoute>} />
                    <Route path="/surveys/:id" element={<ProtectedRoute moduleKey="surveys"><SurveyResponseDetail /></ProtectedRoute>} />
                    <Route path="/surveys/:id/edit" element={<ProtectedRoute moduleKey="surveys"><SurveyResponseEdit /></ProtectedRoute>} />
                    <Route path="/vendors" element={<ProtectedRoute moduleKey="vendors"><Vendors /></ProtectedRoute>} />
                    <Route path="/unit-master" element={<ProtectedRoute moduleKey="unit_master"><UnitMaster /></ProtectedRoute>} />
                    <Route path="/Unit-master" element={<Navigate to="/unit-master" replace />} />
                    <Route path="/category-master" element={<ProtectedRoute moduleKey="category_master"><CategoryMaster /></ProtectedRoute>} />
                    <Route path="/tax-master" element={<ProtectedRoute moduleKey="settings"><TaxMaster /></ProtectedRoute>} />
                    <Route path="/tax-master/:id" element={<ProtectedRoute moduleKey="settings"><TaxMasterDetail /></ProtectedRoute>} />
                    <Route path="/user-management" element={<AdminRoute><UserManagement /></AdminRoute>} />
                    <Route path="/validation-rules" element={<ProtectedRoute moduleKey="settings"><ValidationRules /></ProtectedRoute>} />
                    <Route path="/admin" element={<ProtectedRoute moduleKey="settings"><Admin /></ProtectedRoute>} />
                    <Route path="/trash" element={<ProtectedRoute moduleKey="trash"><TrashPage /></ProtectedRoute>} />
                    <Route path="/admin/history-tracking" element={<ProtectedRoute moduleKey="settings"><HistoryTracking /></ProtectedRoute>} />
                    <Route path="/admin/photo-fingerprints" element={<ProtectedRoute moduleKey="settings"><PhotoFingerprints /></ProtectedRoute>} />
                    <Route path="/admin/knowledge-categories" element={<ProtectedRoute moduleKey="settings"><KnowledgeCategories /></ProtectedRoute>} />
                    <Route path="/admin/currency" element={<ProtectedRoute moduleKey="settings"><CurrencyBilling /></ProtectedRoute>} />
                    <Route path="/admin/portal-modules" element={<ProtectedRoute moduleKey="settings"><PortalModules /></ProtectedRoute>} />
                    <Route path="/admin/feedback" element={<ProtectedRoute moduleKey="settings"><FeedbackSettings /></ProtectedRoute>} />
                    <Route path="/admin/trash" element={<ProtectedRoute moduleKey="settings"><TrashAdmin /></ProtectedRoute>} />
                    <Route path="/validation-rules/:id" element={<ProtectedRoute moduleKey="settings"><ValidationRuleBuilder /></ProtectedRoute>} />
                    <Route path="/duplicate-management" element={<ProtectedRoute moduleKey="settings"><DuplicateManagement /></ProtectedRoute>} />
                    <Route path="/custom-fields" element={<ProtectedRoute moduleKey="settings"><CustomFields /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute moduleKey="settings"><Settings /></ProtectedRoute>} />
                    <Route path="/settings/tax-master/new" element={<ProtectedRoute moduleKey="settings"><TaxMasterForm /></ProtectedRoute>} />
                    <Route path="/settings/tax-master/:id" element={<ProtectedRoute moduleKey="settings"><TaxMasterForm /></ProtectedRoute>} />
                    <Route path="/attendance" element={<ProtectedRoute moduleKey="attendance"><Attendance /></ProtectedRoute>} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              }
            />
          </Routes>
          </Suspense>
          </BrowserRouter>
        </ModalProvider>
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
