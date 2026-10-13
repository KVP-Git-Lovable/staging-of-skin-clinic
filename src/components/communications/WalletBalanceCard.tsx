import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type BalanceResponse = {
  balance: string;
  currency: string;
  account_sid_last4: string;
  fetched_at: string;
};

async function fetchBalance(): Promise<BalanceResponse> {
  const { data, error } = await supabase.functions.invoke("comms-twilio-balance");
  if (error || !data || data.error) throw new Error(data?.error || error?.message || "balance_unavailable");
  return data as BalanceResponse;
}

async function fetchUsdToInr(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    return typeof json?.rates?.INR === "number" ? json.rates.INR : null;
  } catch {
    return null;
  }
}

export function WalletBalanceCard() {
  const balance = useQuery({ queryKey: ["comms-twilio-balance"], queryFn: fetchBalance, staleTime: 180_000, retry: false });
  const rate = useQuery({ queryKey: ["usd-inr-rate"], queryFn: fetchUsdToInr, staleTime: 3_600_000, retry: false });

  const usd = balance.data ? Number(balance.data.balance) : null;
  const inr = usd !== null && rate.data ? usd * rate.data : null;

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Wallet balance</p>
            {balance.isLoading ? (
              <Skeleton className="mt-1 h-8 w-32" />
            ) : usd !== null ? (
              <p className="text-2xl font-bold">
                {balance.data!.currency === "USD" ? "$" : `${balance.data!.currency} `}
                {usd.toFixed(2)}
                {inr !== null && (
                  <span className="ml-3 text-base font-medium text-muted-foreground">
                    ≈ ₹{inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
            {balance.isError && (
              <p className="text-xs text-muted-foreground">
                Balance unavailable — check the Twilio credentials configured for this project.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {balance.data && (
            <span>
              Account …{balance.data.account_sid_last4} · updated{" "}
              {formatDistanceToNow(new Date(balance.data.fetched_at), { addSuffix: true })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => balance.refetch()}
            disabled={balance.isFetching}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${balance.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
