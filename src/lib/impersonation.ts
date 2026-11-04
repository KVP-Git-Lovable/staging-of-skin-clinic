import { supabase } from "@/integrations/supabase/client";

/**
 * "Log in as another staff member" for a very small, server-checked list of admins.
 *
 * The admin's own session is parked in sessionStorage so Return puts them straight
 * back without signing in again. Nothing here decides who is allowed - the edge
 * function re-checks the allow-list secret on every call.
 */
const KEY = "impersonation.v1";

export interface ImpersonationState {
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  actorAccessToken: string;
  actorRefreshToken: string;
  targetName: string;
}

export function readImpersonation(): ImpersonationState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch {
    return null;
  }
}

export function isImpersonating(): boolean {
  return readImpersonation() !== null;
}

export async function canImpersonate(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("impersonate", {
    body: { action: "can_impersonate" },
  });
  if (error) return false;
  return Boolean((data as any)?.allowed);
}

/** Switches the browser session to the target staff member. Reload after this resolves. */
export async function startImpersonation(targetAuthUserId: string, actorName: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const current = sessionData.session;
  if (!current) throw new Error("Your session has expired - please sign in again.");

  const { data, error } = await supabase.functions.invoke("impersonate", {
    body: { action: "start", target_auth_user_id: targetAuthUserId },
  });
  if (error) throw new Error((await readFnError(error)) ?? "Could not start the session");
  const tokenHash = (data as any)?.token_hash as string | undefined;
  if (!tokenHash) throw new Error((data as any)?.error ?? "Could not start the session");

  const state: ImpersonationState = {
    actorUserId: current.user.id,
    actorName,
    actorEmail: current.user.email ?? "",
    actorAccessToken: current.access_token,
    actorRefreshToken: current.refresh_token,
    targetName: ((data as any)?.target_name as string) || "another user",
  };
  // Saved before the swap: once verifyOtp replaces the session the old tokens are
  // no longer reachable from the client.
  sessionStorage.setItem(KEY, JSON.stringify(state));

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (otpErr) {
    sessionStorage.removeItem(KEY);
    throw new Error(otpErr.message);
  }
}

/** Restores the admin's own session. Reload after this resolves. */
export async function stopImpersonation() {
  const state = readImpersonation();
  if (!state) return;

  try {
    await supabase.functions.invoke("impersonate", {
      body: { action: "end", actor_user_id: state.actorUserId },
    });
  } catch {
    // Closing the audit row must never block getting back to your own account.
  }

  sessionStorage.removeItem(KEY);
  const { error } = await supabase.auth.setSession({
    access_token: state.actorAccessToken,
    refresh_token: state.actorRefreshToken,
  });
  if (error) {
    // The parked session expired - a normal sign-in is the only way back.
    await supabase.auth.signOut();
    throw new Error("Your own session expired. Please sign in again.");
  }
}

async function readFnError(error: unknown): Promise<string | null> {
  const ctx = (error as any)?.context;
  try {
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch {
    /* ignore */
  }
  return (error as any)?.message ?? null;
}
