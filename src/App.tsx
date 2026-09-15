import { Toaster } from "@/components/ui/toaster";
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
const Campaigns = lazyWithReload(() => import("./pages/Campaigns"));
const CampaignDetail = lazyWithReload(() => import("./pages/CampaignDetail"));
const PortalLanding = lazyWithReload(() => import("./pages/portal/PortalLanding"));
const PortalLogin = lazyWithReload(() => import("./pages/portal/PortalLogin"));
const Portal = lazyWithReload(() => import("./pages/portal/Portal"));
const Login = lazyWithReload(() => import("./pages/auth/Login"));
const Signup = lazyWithReload(() => import("./pages/auth/Signup"));
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
const CurrencyBilling = lazyWithReload(() => import("./pages/admin/CurrencyBilling"));
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
    },
    mutations: {
      retry: 1,
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
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

/** Admin-only routes (user & profile management). */
function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  return isAdmin ? <>{children}</> : <AccessDenied />;
}

function ProtectedRoute({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { isAdmin, permissions, loading, session } = useAuth();
  if (loading) return null;
  // Without a session every query reaches the database as "anon", which the
  // grants deny - send the user to sign in instead of rendering empty panels.
  if (!session) return <Navigate to="/login" replace />;
  if (isAdmin) return <>{children}</>;
  if (permissions[moduleKey]?.can_view) return <>{children}</>;
  // If no permissions loaded at all (no staff profile / not logged in as staff), allow access
  if (Object.keys(permissions).length === 0) return <>{children}</>;
  return <AccessDenied />;
}

const App = () => (
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
            <Route path="/signup" element={<Signup />} />

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
                    <Route path="/appointments" element={<ProtectedRoute moduleKey="appointments"><Appointments /></ProtectedRoute>} />
                    <Route path="/appointments/:id" element={<ProtectedRoute moduleKey="appointments"><AppointmentDetail /></ProtectedRoute>} />
                    <Route path="/services" element={<ProtectedRoute moduleKey="services"><Services /></ProtectedRoute>} />
                    <Route path="/billing" element={<ProtectedRoute moduleKey="billing"><Billing /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute moduleKey="reports"><Reports /></ProtectedRoute>} />
                    <Route path="/reports/:key" element={<ProtectedRoute moduleKey="reports"><ReportView /></ProtectedRoute>} />
                    <Route path="/report-builder" element={<ProtectedRoute moduleKey="report_builder"><ReportConfigurator /></ProtectedRoute>} />
                    <Route path="/dashboards" element={<ProtectedRoute moduleKey="dashboards"><Dashboards /></ProtectedRoute>} />
                    <Route path="/dashboards/:id" element={<ProtectedRoute moduleKey="dashboards"><DashboardView /></ProtectedRoute>} />
                    <Route path="/dashboard-explore" element={<ProtectedRoute moduleKey="dashboard"><DashboardExplore /></ProtectedRoute>} />
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
                    <Route path="/trash" element={<TrashPage />} />
                    <Route path="/admin/history-tracking" element={<ProtectedRoute moduleKey="settings"><HistoryTracking /></ProtectedRoute>} />
                    <Route path="/admin/currency" element={<ProtectedRoute moduleKey="settings"><CurrencyBilling /></ProtectedRoute>} />
                    <Route path="/admin/trash" element={<ProtectedRoute moduleKey="settings"><TrashAdmin /></ProtectedRoute>} />
                    <Route path="/validation-rules/:id" element={<ProtectedRoute moduleKey="settings"><ValidationRuleBuilder /></ProtectedRoute>} />
                    <Route path="/duplicate-management" element={<ProtectedRoute moduleKey="settings"><DuplicateManagement /></ProtectedRoute>} />
                    <Route path="/custom-fields" element={<ProtectedRoute moduleKey="settings"><CustomFields /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute moduleKey="settings"><Settings /></ProtectedRoute>} />
                    <Route path="/settings/tax-master/new" element={<ProtectedRoute moduleKey="settings"><TaxMasterForm /></ProtectedRoute>} />
                    <Route path="/settings/tax-master/:id" element={<ProtectedRoute moduleKey="settings"><TaxMasterForm /></ProtectedRoute>} />
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
);

export default App;
