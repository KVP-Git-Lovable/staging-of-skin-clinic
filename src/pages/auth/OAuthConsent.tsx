import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import skinClinicLogo from "@/assets/skin-clinic-logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Details = {
  authorization_id: string;
  redirect_uri: string;
  client: { name?: string; uri?: string; logo_uri?: string };
  user: { id: string; email: string };
  scope: string;
};

/**
 * Consent page for the app's OAuth/MCP server. Supabase Auth sends the user's
 * browser here with ?authorization_id=... after sign-in; we show which
 * application is asking for access and let the user approve or deny, then
 * follow the redirect back to that application.
 */
const OAuthConsent = () => {
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const authorizationId = searchParams.get("authorization_id") || "";

  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    if (loading || !user || !authorizationId) return;
    let cancelled = false;
    supabase.auth.oauth
      .getAuthorizationDetails(authorizationId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          return;
        }
        if (data && "authorization_id" in data) {
          setDetails(data as Details);
        } else if (data && "redirect_url" in data) {
          // Already consented previously — go straight back to the client.
          window.location.href = data.redirect_url;
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [loading, user, authorizationId]);

  if (!authorizationId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-muted-foreground">Missing authorization request.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(`/.lovable/oauth/consent?authorization_id=${authorizationId}`)}`}
        replace
      />
    );
  }

  const decide = async (action: "approve" | "deny") => {
    setActing(action);
    setError(null);
    const fn =
      action === "approve"
        ? supabase.auth.oauth.approveAuthorization
        : supabase.auth.oauth.denyAuthorization;
    const { data, error: err } = await fn(authorizationId, { skipBrowserRedirect: true });
    if (err) {
      setError(err.message);
      setActing(null);
      return;
    }
    if (data && "redirect_url" in data) {
      window.location.href = data.redirect_url;
    }
  };

  const scopes = details?.scope?.split(" ").filter(Boolean) ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(174,62%,95%)] via-background to-accent flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={skinClinicLogo} alt="The Skin Clinic" className="h-[70px] w-auto mb-4 object-contain mx-auto" />
          <h1 className="text-2xl font-bold text-foreground font-display">Authorize application</h1>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border p-6 space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!details && !error && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {details && (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{details.client.name || "An application"}</span>{" "}
                wants to access your account <span className="font-medium text-foreground">{details.user.email}</span>.
              </p>

              {scopes.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1.5">This will allow it to:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {scopes.map((s) => (
                      <li key={s} className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 h-11 gap-2"
                  disabled={acting !== null}
                  onClick={() => decide("deny")}
                >
                  {acting === "deny" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldX className="h-4 w-4" />}
                  Deny
                </Button>
                <Button className="flex-1 h-11 gap-2" disabled={acting !== null} onClick={() => decide("approve")}>
                  {acting === "approve" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Approve
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OAuthConsent;
