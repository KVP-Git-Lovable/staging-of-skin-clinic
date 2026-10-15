import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";

const STORAGE_KEY = "meta.adAccountFilter";

/**
 * "Choose Ad Account" selection shared by the Campaigns, Ad Sets and Ads pages.
 * Pure view state: read from ?account=, then from localStorage, else "all";
 * kept in both so the choice follows the user between the three pages.
 */
export function useAdAccountFilter(): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState<string>(() => {
    const fromUrl = searchParams.get("account");
    if (fromUrl) return fromUrl;
    try { return localStorage.getItem(STORAGE_KEY) || "all"; } catch { return "all"; }
  });
  const apply = useCallback((next: string) => {
    setValue(next);
    try { if (next === "all") localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("account"); else params.set("account", next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);
  return [value, apply];
}
