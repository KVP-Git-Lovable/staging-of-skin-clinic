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

/** Every digit, grouped the configured way. The one place the locale and the
 *  decimal clamp are decided, so the formatters below cannot drift. */
const grouped = (n: number, s: CurrencySettings, fractionDigits = digits(s)) =>
  n.toLocaleString(s.number_style === "indian" ? "en-IN" : "en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

/**
 * Decimal places for a figure that gets reconciled against another system.
 *
 * The clinic has chosen whole rupees, and for almost every amount that is
 * right. But a total carrying paise is then rounded, and the two systems round
 * the same half-rupee in opposite directions: 21 September took
 * Rs 1,66,322.50, which printed as Rs 1,66,323 on the report against
 * Salesforce's Rs 1,66,322. Neither was wrong and neither could be reconciled.
 *
 * So: the configured digits when decimals are switched on, and otherwise two
 * only when the amount actually has paise to show. A whole amount stays whole,
 * which is what the setting was chosen for.
 */
const reconcilableDigits = (n: number, s: CurrencySettings) => {
  if (s.show_decimals) return digits(s);
  // Judged at paise resolution: summing a column of numerics can land on
  // 166322.49999999, which is a half-rupee and must not read as a whole one.
  return Math.round(n * 100) % 100 === 0 ? 0 : 2;
};

/** Plain grouped number, honouring Indian vs US grouping and decimal settings. */
export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  const s = cache;
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
  return grouped(n, s);
}

/** Currency string using the admin-configured symbol, decimals and grouping style. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return `${cache.symbol}0`;
  return `${cache.symbol}${formatNumber(n)}`;
}

/**
 * Currency with every digit shown - never Lakh/Crore/K, whatever `abbreviate`
 * says.
 *
 * The report KPI cards use this. A total on one of those cards is read off and
 * reconciled against a bank statement or the cash drawer, and "Rs 1.95 L"
 * cannot be reconciled against anything. formatMoney is not enough on its own
 * because it inherits the abbreviate setting through formatNumber.
 */
export function formatMoneyExact(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return `${cache.symbol}0`;
  // Sign outside the symbol - "-₹2,000", the way formatMoneyCompact writes the
  // negatives it shortens, rather than formatMoney's "₹-2,000".
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  // Paise shown only when there are paise - see reconcilableDigits.
  return `${sign}${cache.symbol}${grouped(abs, cache, reconcilableDigits(abs, cache))}`;
}

/**
 * The same number `formatMoneyExact` prints, without the currency symbol.
 *
 * The report PDF's table cells need this: `reportColumnHeader` already puts
 * "(Rs)" in the column heading, so the cells carry the figure alone. They used
 * to go through `formatNumber`, which rounds to whole rupees while decimals are
 * off - so a day whose summary card read Rs 1,66,322.50 printed rows adding up
 * to Rs 1,66,324.00, and the document could not be reconciled against itself.
 * Three half-rupee bills, each rounded up.
 *
 * Shares `reconcilableDigits` with formatMoneyExact rather than restating the
 * rule, so the printed document and the screen cannot drift apart.
 */
export function formatAmountExact(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${grouped(abs, cache, reconcilableDigits(abs, cache))}`;
}

/**
 * Currency with two decimals always, whatever `show_decimals` says.
 *
 * For a GST invoice this is not a display preference. The clinic has chosen
 * whole rupees for the app generally, and that is fine everywhere except a tax
 * document, where rounding stops the figures reconciling: a ₹4,000 bill at 5%
 * inclusive is ₹3,809.52 + ₹190.48, and rounding it prints CGST ₹95 + SGST ₹95
 * = ₹190 against a tax line of ₹190.48. The printed PDF already shows the exact
 * figures, so rounding on screen also made the two disagree about the same bill.
 *
 * Used for amounts and tax heads on invoices. Everything else keeps the
 * configured setting.
 */
export function formatMoneyPrecise(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return `${cache.symbol}0.00`;
  const sign = n < 0 ? "-" : "";
  const body = Math.abs(n).toLocaleString(
    cache.number_style === "indian" ? "en-IN" : "en-US",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );
  return `${sign}${cache.symbol}${body}`;
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
