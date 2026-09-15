import { supabase } from "@/integrations/supabase/client";

// The patient portal is not a Supabase-auth app, so it cannot read patient,
// billing or clinical tables directly (those are closed to the anonymous
// role). All portal data goes through the `portal-data` edge function, which
// validates the login session server-side.

export interface PortalSession {
  patientId: string;
  sessionToken: string;
  patientName: string;
  expiresAt: string;
}

export class PortalSessionError extends Error {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message);
    this.name = "PortalSessionError";
  }
}

export function readPortalSession(): PortalSession | null {
  const stored = localStorage.getItem("portal_session");
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as PortalSession;
    if (!parsed?.patientId || !parsed?.sessionToken) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPortalSession() {
  localStorage.removeItem("portal_session");
}

export async function portalRequest<T = any>(
  action: string,
  payload: Record<string, any> = {},
): Promise<T> {
  const session = readPortalSession();
  if (!session) throw new PortalSessionError();

  const { data, error } = await supabase.functions.invoke("portal-data", {
    body: { token: session.sessionToken, action, payload },
  });

  if (error) {
    // Edge functions surface non-2xx as a generic FunctionsHttpError; treat an
    // unusable session as a sign-in prompt rather than a silent empty screen.
    const status = (error as any)?.context?.status;
    if (status === 401) {
      clearPortalSession();
      throw new PortalSessionError();
    }
    throw new Error(error.message || "Could not load your details. Please try again.");
  }

  if (data?.code === "unauthorized") {
    clearPortalSession();
    throw new PortalSessionError();
  }
  if (data?.error) throw new Error(data.error);

  return data?.data as T;
}
