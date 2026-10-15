import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Rocket, Target, Megaphone, CreditCard, RefreshCw, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  accountStatusInfo,
  fetchBillingStatus,
  formatMinor,
  fundingTypeLabel,
  openMetaWindow,
  type BillingStatus,
} from "@/lib/metaBilling";

const cards = [
  {
    title: "Campaigns",
    description: "Create and manage advertising campaigns across Meta platforms",
    icon: Rocket,
    href: "/communications/meta/campaigns",
  },
  {
    title: "Ad Sets",
    description: "Organize campaigns into ad sets with specific targeting and budgets",
    icon: Target,
    href: "/communications/meta/ad-sets",
  },
  {
    title: "Ads",
    description: "Create individual ads, upload creative content, and manage performance",
    icon: Megaphone,
    href: "/communications/meta/ads",
  },
];

type AdAccountRow = { ad_account_id: string; name: string | null };

const bare = (v: string | null | undefined) => String(v ?? "").replace(/^act_/, "").trim();

export default function MetaMarketing() {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Billing card state
  const [accounts, setAccounts] = useState<AdAccountRow[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string>("");
  const [waitingForMeta, setWaitingForMeta] = useState(false);
  const stopPollRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      const { data } = await supabase
        .from("social_connections")
        .select("id, default_ad_account_id")
        .eq("platform", "meta")
        .maybeSingle();
      setIsConnected(!!data);
      if (data) {
        const { data: rows } = await supabase
          .from("social_ad_accounts")
          .select("ad_account_id, name")
          .eq("connection_id", data.id)
          .order("name");
        setAccounts((rows || []) as AdAccountRow[]);
        setAccountId(bare(data.default_ad_account_id) || bare(rows?.[0]?.ad_account_id));
      }
      setLoading(false);
    };
    checkConnection();
    return () => { stopPollRef.current?.(); };
  }, []);

  const loadBilling = useCallback(async (id: string, quiet = false) => {
    if (!id) return;
    setBillingLoading(true);
    setBillingError("");
    try {
      const status = await fetchBillingStatus(`act_${id}`);
      setBilling(status);
      if (!quiet) toast({ title: "Billing details refreshed" });
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : String(e));
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountId) loadBilling(accountId, true);
  }, [accountId, loadBilling]);

  const recharge = () => {
    if (!billing) return;
    stopPollRef.current?.();
    const stop = openMetaWindow(billing.recharge_url, "meta-billing", () => {
      setWaitingForMeta(false);
      stopPollRef.current = null;
      loadBilling(accountId);
    });
    if (!stop) {
      toast({ title: "Pop-up blocked", description: "Opening Meta's payment page in a new tab instead. Click Refresh when you are done." });
      window.open(billing.recharge_url, "_blank", "noopener");
      return;
    }
    stopPollRef.current = stop;
    setWaitingForMeta(true);
  };

  const account = billing?.account;
  const status = accountStatusInfo(account?.account_status);
  const funding = account?.funding_source;
  const expired = account?.expired_funding_source;

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Meta Advertisements</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Meta advertising campaigns, ad sets, and individual ads all in one place.
          </p>
        </div>
        {!loading && (
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Not Connected"}
          </Badge>
        )}
      </div>

      {isConnected && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" /> Ads account billing</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Payment method and balance of the ad account, read live from Meta. Money is added on Meta's payment page.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {accounts.length > 1 && (
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Ad account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.ad_account_id} value={bare(a.ad_account_id)}>{a.name || a.ad_account_id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="ghost" size="sm" onClick={() => loadBilling(accountId)} disabled={!accountId || billingLoading} className="gap-2">
                  {billingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
                </Button>
                <Button onClick={recharge} disabled={!billing || waitingForMeta} className="gap-2">
                  {waitingForMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {waitingForMeta ? "Waiting for Meta…" : "Recharge Ads account"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!accountId ? (
              <p className="text-sm text-muted-foreground">Choose a default Ad Account in Communications Center → Meta Connection first.</p>
            ) : billingError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{billingError}</span>
              </div>
            ) : !account ? (
              <p className="text-sm text-muted-foreground">Reading billing details from Meta…</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment method</p>
                    {funding ? (
                      <>
                        <p className="mt-1 text-sm font-medium">{funding.display_string || fundingTypeLabel(funding.type)}</p>
                        <p className="text-xs text-muted-foreground">{fundingTypeLabel(funding.type)}</p>
                      </>
                    ) : expired ? (
                      <>
                        <p className="mt-1 text-sm font-medium text-destructive">Expired: {expired.display_string || fundingTypeLabel(expired.type)}</p>
                        <p className="text-xs text-muted-foreground">Add a new payment method on Meta.</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm font-medium text-destructive">No payment method</p>
                        <p className="text-xs text-muted-foreground">Ads will not deliver until one is added.</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment setting</p>
                    <p className="mt-1 text-sm font-medium">{account.is_prepay_account ? "Prepaid (manual payments)" : "Automatic payments"}</p>
                    <p className="text-xs text-muted-foreground">{account.is_prepay_account ? "Ads spend from money added in advance." : "Meta charges the payment method as ads run."}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Account status</p>
                    <div className="mt-1"><Badge variant={status.variant}>{status.label}</Badge></div>
                    {status.hint && <p className="mt-1 text-xs text-muted-foreground">{status.hint}{account.disable_reason ? ` (reason ${account.disable_reason})` : ""}</p>}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Spend</p>
                    <p className="mt-1 text-sm"><span className="text-muted-foreground">Spent:</span> <span className="font-medium">{formatMinor(account.amount_spent, account.currency)}</span></p>
                    <p className="text-sm"><span className="text-muted-foreground">Balance due:</span> <span className="font-medium">{formatMinor(account.balance, account.currency)}</span></p>
                    <p className="text-sm"><span className="text-muted-foreground">Spend cap:</span> <span className="font-medium">{account.spend_cap ? formatMinor(account.spend_cap, account.currency) : "None"}</span></p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {account.name ? `${account.name} · ` : ""}act_{account.id.replace(/^act_/, "")} · checked {new Date(account.checked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
                    {" "}Meta does not expose the remaining prepaid balance; see it on the payment page.
                  </span>
                  <a href={billing?.fallback_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Open in Ads Manager <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card
            key={card.title}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(card.href)}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{card.title}</CardTitle>
                  <CardDescription className="text-xs mt-1">{card.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
