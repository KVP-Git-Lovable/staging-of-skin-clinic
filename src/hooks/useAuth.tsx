import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

interface StaffProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleName: string | null;
  roleId: string | null;
  initials: string;
}

/**
 * How much data the signed-in user's role may see. 'own' limits appointments,
 * procedures and invoices to the ones they performed or assisted on; patients stay
 * visible to everyone. Enforced in the database by RLS - this is only so the UI can
 * label and explain what is being filtered.
 */
export type DataScope = "all" | "own";

/**
 * Reporting date-range limit for this account. 'day' means reports may only cover a
 * single day at a time. It hangs off the staff row, not the role, because the
 * front-desk account shares the Admin role with a doctor who must keep full
 * reporting. Only the Reports module is affected.
 */
export type ReportPeriodLimit = "none" | "day";

type PermMap = Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  patientId: string | null;
  patientName: string | null;
  staffProfile: StaffProfile | null;
  permissions: PermMap;
  isAdmin: boolean;
  dataScope: DataScope;
  reportPeriodLimit: ReportPeriodLimit;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  patientId: null,
  patientName: null,
  staffProfile: null,
  permissions: {},
  isAdmin: false,
  dataScope: "all",
  reportPeriodLimit: "none",
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function getInitials(first: string, last: string, email?: string | null): string {
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "U";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [permissions, setPermissions] = useState<PermMap>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataScope, setDataScope] = useState<DataScope>("all");
  const [reportPeriodLimit, setReportPeriodLimit] = useState<ReportPeriodLimit>("none");
  const [loading, setLoading] = useState(true);

  const loadPatientProfile = async (u: User) => {
    const { data, error } = await supabase
      .from("patients")
      .select("id, first_name, last_name")
      .eq("auth_user_id", u.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      setPatientId(data.id);
      setPatientName(`${data.first_name} ${data.last_name}`);
      return;
    }

    const email = u.email;
    if (email) {
      const { data: byEmail } = await supabase
        .from("patients")
        .select("id, first_name, last_name")
        .eq("email", email)
        .is("auth_user_id", null)
        .maybeSingle();

      if (byEmail) {
        const { error: updateError } = await supabase
          .from("patients")
          .update({ auth_user_id: u.id })
          .eq("id", byEmail.id);
        if (updateError) throw updateError;
        setPatientId(byEmail.id);
        setPatientName(`${byEmail.first_name} ${byEmail.last_name}`);
        return;
      }
    }

    // Don't auto-create patient for staff users
  };

  const loadStaffProfile = async (u: User) => {
    // Keep this select to columns that have always existed. Anything newer is looked
    // up separately below - a failed select here returns no row, which is
    // indistinguishable from "not a staff user" and would strip the user of every
    // permission they have.
    const { data: staffData, error: staffErr } = await supabase
      .from("staff")
      .select("id, first_name, last_name, email, phone, role_id, user_roles_config(id, name)")
      .eq("auth_user_id", u.id)
      .maybeSingle();

    if (staffErr) {
      console.error("Failed to load staff profile", staffErr);
    }

    if (!staffData) {
      setStaffProfile(null);
      setPermissions({});
      setIsAdmin(false);
      setDataScope("all");
      setReportPeriodLimit("none");
      return;
    }

    const role = staffData.user_roles_config as any;
    const roleName = role?.name || null;
    const profile: StaffProfile = {
      id: staffData.id,
      firstName: staffData.first_name,
      lastName: staffData.last_name,
      email: staffData.email,
      phone: staffData.phone,
      roleName,
      roleId: staffData.role_id,
      initials: getInitials(staffData.first_name, staffData.last_name, staffData.email),
    };
    setStaffProfile(profile);

    // Looked up on its own, and tolerant of failure: data_scope ships with a
    // migration, so until that migration is applied the column simply isn't there.
    // Falling back to "all" mirrors public.has_full_data_scope() - only an explicit
    // 'own' narrows anyone - and keeps sign-in working either way.
    let scope: DataScope = "all";
    if (staffData.role_id) {
      const { data: roleRow, error: scopeErr } = await supabase
        .from("user_roles_config")
        .select("data_scope")
        .eq("id", staffData.role_id)
        .maybeSingle();
      if (scopeErr) {
        console.warn("data_scope unavailable, defaulting to full access", scopeErr.message);
      } else if (roleRow?.data_scope === "own") {
        scope = "own";
      }
    }
    setDataScope(scope);

    // Same tolerant treatment, and for the same reason: this column arrives with a
    // migration, so it may not exist yet. Unknown means unrestricted.
    let periodLimit: ReportPeriodLimit = "none";
    const { data: limitRow, error: limitErr } = await supabase
      .from("staff")
      .select("report_period_limit")
      .eq("id", staffData.id)
      .maybeSingle();
    if (limitErr) {
      console.warn("report_period_limit unavailable, defaulting to unrestricted", limitErr.message);
    } else if ((limitRow as any)?.report_period_limit === "day") {
      periodLimit = "day";
    }
    setReportPeriodLimit(periodLimit);

    const admin = roleName?.toLowerCase() === "admin";
    setIsAdmin(admin);

    if (admin) {
      // Admin has full access
      setPermissions({});
      return;
    }

    if (staffData.role_id) {
      const { data: perms } = await supabase
        .from("role_module_permissions")
        .select("module_key, can_view, can_create, can_edit, can_delete")
        .eq("role_id", staffData.role_id);

      if (perms) {
        const map: PermMap = {};
        perms.forEach((p: any) => {
          map[p.module_key] = { can_view: p.can_view, can_create: p.can_create ?? false, can_edit: p.can_edit, can_delete: p.can_delete ?? false };
        });
        setPermissions(map);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const clearAll = () => {
      if (!isMounted) return;
      setPatientId(null);
      setPatientName(null);
      setStaffProfile(null);
      setPermissions({});
      setIsAdmin(false);
    };

    const syncSessionState = async (sess: Session | null) => {
      if (!isMounted) return;

      setSession(sess);
      setUser(sess?.user ?? null);

      if (!sess?.user) {
        clearAll();
        setLoading(false);
        return;
      }

      try {
        await Promise.all([
          loadPatientProfile(sess.user).catch(console.error),
          loadStaffProfile(sess.user).catch(console.error),
        ]);
      } catch (error) {
        console.error("Failed to load profiles:", error);
        clearAll();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      window.setTimeout(() => {
        void syncSessionState(sess);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      void syncSessionState(s);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setPatientId(null);
    setPatientName(null);
    setStaffProfile(null);
    setPermissions({});
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, patientId, patientName, staffProfile, permissions, isAdmin, dataScope, reportPeriodLimit, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
