import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CurrencySettings {
  symbol: string;
  show_decimals: boolean;
  decimal_digits: number;
  /** indian → Lakh / Crore grouping, us → K / M grouping */
  number_style: "indian" | "us";
  /** abbreviate large numbers (1.2 L / 1.2K) */
  abbreviate: boolean;
}

export const DEFAULT_CURRENCY_SETTINGS: CurrencySettings = {
  symbol: "₹",
  show_decimals: false,
  decimal_digits: 2,
  number_style: "indian",
  abbreviate: false,
};

let cache: CurrencySettings = DEFAULT_CURRENCY_SETTINGS;
const EVENT = "currency-settings-changed";

export const getCurrencySettings = () => cache;

export function setCurrencySettingsCache(next: Partial<CurrencySettings> | null) {
  cache = { ...DEFAULT_CURRENCY_SETTINGS, ...(next ?? {}) };
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

const digits = (s: CurrencySettings) => (s.show_decimals ? Math.min(Math.max(s.decimal_digits, 0), 6) : 0);

/** Plain grouped number, honouring Indian vs US grouping and decimal settings. */
export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  const s = cache;
  const d = digits(s);
  const locale = s.number_style === "indian" ? "en-IN" : "en-US";
  if (s.abbreviate) {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (s.number_style === "indian") {
      if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(2)} Cr`;
      if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(2)} L`;
      if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
    } else {
      if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
      if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
    }
  }
  return n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Currency string using the admin-configured symbol, decimals and grouping style. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return `${cache.symbol}0`;
  return `${cache.symbol}${formatNumber(n)}`;
}

/** Currency string that always shortens large amounts (Lakh/Crore or K/M),
 *  so big figures never overflow a small card. Small amounts stay grouped. */
export function formatMoneyCompact(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return `${cache.symbol}0`;
  const s = cache;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (s.number_style === "indian") {
    if (abs >= 1_00_00_000) return `${sign}${s.symbol}${(abs / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `${sign}${s.symbol}${(abs / 1_00_000).toFixed(2)} L`;
  } else {
    if (abs >= 1_000_000_000) return `${sign}${s.symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}${s.symbol}${(abs / 1_000_000).toFixed(2)}M`;
  }
  return formatMoney(n);
}

async function fetchCurrencySettings(): Promise<CurrencySettings> {
  const { data } = await supabase.from("currency_settings").select("*").maybeSingle();
  return { ...DEFAULT_CURRENCY_SETTINGS, ...((data as any) ?? {}) };
}

/** Loads currency settings and keeps the formatter cache in sync. */
export function useCurrencySettings() {
  const query = useQuery({
    queryKey: ["currency-settings"],
    queryFn: fetchCurrencySettings,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) setCurrencySettingsCache(query.data);
  }, [query.data]);

  return query;
}

/** Re-renders the caller whenever currency settings change. */
export function useMoneyFormat() {
  useCurrencySettings();
  const [, force] = useState(0);
  useEffect(() => {
    const handler = () => force((n) => n + 1);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return { formatMoney, formatNumber, settings: getCurrencySettings() };
}
