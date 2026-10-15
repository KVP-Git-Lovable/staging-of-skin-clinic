import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { readMetaApiError } from "@/lib/metaErrors";
import {
  CITY_RADIUS_OPTIONS,
  COUNTRY_OPTIONS,
  type GeoSelection,
  countryName,
  geoIsEmpty,
} from "@/lib/metaTargeting";

type SearchHit = {
  key: string;
  name: string;
  type: "country" | "region" | "city" | string;
  country_code?: string;
  country_name?: string;
  region?: string;
};

interface Props {
  value: GeoSelection;
  onChange: (next: GeoSelection) => void;
  /** True when the value was derived from the old free-text field. */
  fromLegacy?: boolean;
  legacyText?: string;
}

/**
 * Locations for an ad set: countries from a fixed list, regions and cities
 * looked up through Meta's location search (meta-api `search_geo`).
 */
export function LocationPicker({ value, onChange, fromLegacy, legacyText }: Props) {
  const [countryPick, setCountryPick] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const timer = useRef<number | null>(null);

  const availableCountries = useMemo(
    () => COUNTRY_OPTIONS.filter((c) => !value.countries.includes(c.code)),
    [value.countries],
  );

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) { setHits([]); setSearchError(""); return; }
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      const { data, error } = await supabase.functions.invoke("meta-api", {
        body: { action: "search_geo", payload: { q, types: ["region", "city"] } },
      });
      setSearching(false);
      if (error || data?.error) {
        setSearchError(await readMetaApiError(error, data));
        setHits([]);
        return;
      }
      setHits(((data?.results as SearchHit[]) || []).slice(0, 15));
    }, 400);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query]);

  const addCountry = (code: string) => {
    if (!code || value.countries.includes(code)) return;
    onChange({ ...value, countries: [...value.countries, code] });
    setCountryPick("");
  };

  const addHit = (h: SearchHit) => {
    if (h.type === "country" && h.country_code) { addCountry(h.country_code.toUpperCase()); }
    else if (h.type === "region") {
      if (value.regions.some((r) => r.key === h.key)) return;
      onChange({ ...value, regions: [...value.regions, { key: h.key, name: h.name, country: h.country_code }] });
    } else if (h.type === "city") {
      if (value.cities.some((c) => c.key === h.key)) return;
      onChange({ ...value, cities: [...value.cities, { key: h.key, name: h.name, country: h.country_code, region: h.region, radius: 25, distance_unit: "kilometer" }] });
    }
    setQuery("");
    setHits([]);
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-1.5">
        {value.countries.map((code) => (
          <Badge key={`c-${code}`} variant="secondary" className="gap-1 pr-1">
            {countryName(code)} <span className="text-[10px] text-muted-foreground">{code}</span>
            <button type="button" className="ml-1 rounded hover:bg-background" onClick={() => onChange({ ...value, countries: value.countries.filter((c) => c !== code) })} aria-label={`Remove ${code}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {value.regions.map((r) => (
          <Badge key={`r-${r.key}`} variant="secondary" className="gap-1 pr-1">
            {r.name}{r.country ? <span className="text-[10px] text-muted-foreground">{r.country}</span> : null}
            <button type="button" className="ml-1 rounded hover:bg-background" onClick={() => onChange({ ...value, regions: value.regions.filter((x) => x.key !== r.key) })} aria-label={`Remove ${r.name}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {value.cities.map((c) => (
          <span key={`ci-${c.key}`} className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-0.5 text-xs">
            <MapPin className="h-3 w-3" /> {c.name}{c.region ? <span className="text-muted-foreground">, {c.region}</span> : null}
            <Select value={String(c.radius)} onValueChange={(v) => onChange({ ...value, cities: value.cities.map((x) => x.key === c.key ? { ...x, radius: Number(v) } : x) })}>
              <SelectTrigger className="ml-1 h-6 w-[84px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CITY_RADIUS_OPTIONS.map((r) => <SelectItem key={r} value={String(r)}>+{r} km</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" className="ml-1 rounded hover:bg-background" onClick={() => onChange({ ...value, cities: value.cities.filter((x) => x.key !== c.key) })} aria-label={`Remove ${c.name}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {geoIsEmpty(value) && <span className="text-xs text-muted-foreground">No location yet — India is used when nothing is chosen.</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={countryPick} onValueChange={addCountry}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Add a country" /></SelectTrigger>
          <SelectContent className="max-h-64">
            {availableCountries.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a city or state (e.g. Mangaluru)" className="h-9 pl-8 text-sm" />
          {searching && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {(hits.length > 0 || searchError) && (
        <div className="max-h-44 overflow-auto rounded-md border bg-background">
          {searchError && <p className="p-2 text-xs text-destructive">{searchError}</p>}
          {hits.map((h) => (
            <Button key={`${h.type}-${h.key}`} type="button" variant="ghost" size="sm" className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left" onClick={() => addHit(h)}>
              <Badge variant="outline" className="text-[10px] capitalize">{h.type}</Badge>
              <span className="text-sm">{h.name}</span>
              <span className="text-xs text-muted-foreground">{[h.region, h.country_name || h.country_code].filter(Boolean).join(", ")}</span>
            </Button>
          ))}
        </div>
      )}

      {fromLegacy && legacyText && (
        <p className="text-[11px] text-muted-foreground">
          Previously typed: "{legacyText}". Only two-letter country codes from that text were ever applied; pick cities or states above to target them.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">Cities apply within the chosen radius. Regions are states or provinces as Meta defines them.</p>
    </div>
  );
}
