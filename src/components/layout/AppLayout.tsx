import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Search, User, LogOut, CalendarCheck } from "lucide-react";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { ChangePasswordRequired } from "@/components/auth/ChangePasswordRequired";
import { ImpersonationBanner } from "@/components/auth/ImpersonationBanner";
import { useNavigate, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AppointmentsModal } from "@/components/modals/AppointmentsModal";
import { AppointmentDetailModal } from "@/components/modals/AppointmentDetailModal";
import { ReturnToAppointmentBar } from "@/components/appointments/ReturnToAppointmentBar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useEffect, useRef, useState } from "react";
import { BackToReportBar } from "@/components/reports/BackToReportBar";
import { MicButton } from "@/components/shared/MicButton";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { supabase } from "@/integrations/supabase/client";
import { useModal } from "@/hooks/useModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { staffProfile, user, loading, signOut, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { openModal, closeModal } = useModal();
  const [searchParams] = useSearchParams();
  // The appointment overlay lives in the address now, so the clamp below has to
  // read it from there - reading only the context left the overlay unclamped.
  const overlayOpen = !!openModal || !!searchParams.get("appointmentDetail");
  const lastPathRef = useRef(location.pathname);

  // Close any full-screen overlay modal when the route changes, so the
  // rendered page always matches the URL.
  useEffect(() => {
    if (lastPathRef.current !== location.pathname) {
      lastPathRef.current = location.pathname;
      closeModal();
    }
  }, [location.pathname, closeModal]);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Redirect to login if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const initials = staffProfile?.initials || (user?.email?.slice(0, 2).toUpperCase() ?? "U");
  const fullName = staffProfile
    ? `${staffProfile.firstName} ${staffProfile.lastName}`.trim()
    : user?.email || "User";
  const roleName = staffProfile?.roleName;
  const email = staffProfile?.email || user?.email || "";

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };


  // An admin-issued password is one-time. The gate lives here rather than in
  // ProtectedRoute because /trash and /profile have no route guard at all, but
  // they are inside this layout - and /login and /signup are outside it, so
  // signing out still works.
  if (mustChangePassword) return <ChangePasswordRequired />;

  return (
    <SidebarProvider>
      {/* While a full-screen overlay is open the shell is clamped to the viewport.
          The overlays are `absolute inset-0` against the column below, so without
          this they stretch to the height of the still-mounted page behind them -
          an appointments list is ~11,000px, which is the blank area you could
          scroll through forever after opening an appointment. */}
      <div className={cn("flex w-full", overlayOpen ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]")}>
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Modals */}
          <AppointmentsModal />
          <AppointmentDetailModal />

          <ImpersonationBanner />

          <header className="app-glass-header safe-inset-top sticky top-0 z-40 h-14 md:h-16 box-content flex items-center justify-between border-b px-3 md:px-4 gap-2 md:gap-4 shrink-0">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <SidebarTrigger className="shrink-0 md:hidden" />
              <GlobalSearch className="hidden md:block" />
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              {/* Only ever visible when a new build is genuinely waiting. */}

              <NotificationsBell />

              <ThemeSelector />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-display font-semibold text-xs md:text-sm cursor-pointer hover:opacity-90 transition-opacity">
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <div className="px-3 py-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-display font-semibold text-sm shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{fullName}</p>
                      {roleName && <Badge variant="secondary" className="text-xs mt-0.5">{roleName}</Badge>}
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/attendance")}>
                    <CalendarCheck className="h-4 w-4 mr-2" />My Attendance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    <User className="h-4 w-4 mr-2" />My Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLogoutOpen(true)} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-3 md:p-6 overflow-auto">
            <BackToReportBar />
            <ReturnToAppointmentBar />
            <div key={location.pathname} className="animate-page-reveal motion-reduce:animate-none">
              {children}
            </div>
          </main>
        </div>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be redirected to the login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Log Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
