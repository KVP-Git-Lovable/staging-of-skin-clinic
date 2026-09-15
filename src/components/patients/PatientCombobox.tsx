import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildOrFilter, buildFuzzyOrFilter, fuzzyRank, normalize, fuzzyScore } from "@/lib/fuzzySearch";

const PHONE_LIKE_NAME = /^[+\d\s()\-]{7,}$/;

export interface PatientLite {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  source?: string | null;
  source_ad_details?: string | null;
  source_referral_doctor?: string | null;
}

interface PatientComboboxProps {
  value: string;
  onValueChange: (value: string, patient?: PatientLite) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  disabled?: boolean;
  withSource?: boolean;
}

const PAGE_SIZE = 50;

const buildColumns = (withSource: boolean) =>
  withSource
    ? "id, first_name, last_name, phone, source, source_ad_details, source_referral_doctor"
    : "id, first_name, last_name, phone";

export function PatientCombobox({
  value,
  onValueChange,
  placeholder = "Select patient",
  allowNone = false,
  noneLabel = "No patient",
  className,
  disabled,
  withSource = false,
}: PatientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const queryClient = useQueryClient();
  const columns = buildColumns(withSource);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch first page (initial list) — cached, only when opened
  const { data: initialList = [], isLoading: loadingInitial } = useQuery({
    queryKey: ["patients-combobox-initial", withSource],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select(columns)
        .order("first_name")
        .range(0, PAGE_SIZE * 2 - 1);
      if (error) throw error;
      const all = ((data ?? []) as unknown) as PatientLite[];
      const withNames = all.filter(p => p.first_name && p.first_name.trim());
      return withNames.slice(0, PAGE_SIZE);
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // Server-side search when user types
  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["patients-combobox-search", withSource, debounced],
    queryFn: async () => {
      const q = debounced.replace(/[%,]/g, " ").trim();
      if (!q) return [];

      const tokens = q.split(/\s+/).filter(Boolean);
      let rows: PatientLite[] = [];

      // For 2+ token searches, try exact match first (first_name + last_name)
      if (tokens.length >= 2) {
        const [firstName, ...rest] = tokens;
        const lastName = rest.join(" ");

        // Step 1: Exact match
        const { data: exactMatch } = await supabase
          .from("patients")
          .select(columns)
          .ilike("first_name", firstName)
          .ilike("last_name", lastName)
          .order("first_name")
          .limit(PAGE_SIZE);

        if (exactMatch && exactMatch.length > 0) {
          return ((exactMatch ?? []) as unknown) as PatientLite[];
        }

        // Step 2: Prefix match
        const { data: prefixMatch } = await supabase
          .from("patients")
          .select(columns)
          .ilike("first_name", `${firstName}%`)
          .ilike("last_name", `${lastName}%`)
          .order("first_name")
          .limit(PAGE_SIZE);

        if (prefixMatch && prefixMatch.length > 0) {
          return ((prefixMatch ?? []) as unknown) as PatientLite[];
        }
      } else if (tokens.length === 1) {
        // Single word: try exact match first
        const token = tokens[0];

        // Step 1: Exact match
        const { data: exactMatch } = await supabase
          .from("patients")
          .select(columns)
          .or(`first_name.ilike.${token},last_name.ilike.${token},phone.ilike.${token}`)
          .order("first_name")
          .limit(PAGE_SIZE);

        if (exactMatch && exactMatch.length > 0) {
          return ((exactMatch ?? []) as unknown) as PatientLite[];
        }

        // Step 2: Prefix match
        const { data: prefixMatch } = await supabase
          .from("patients")
          .select(columns)
          .or(`first_name.ilike.${token}%,last_name.ilike.${token}%,phone.ilike.${token}%`)
          .order("first_name")
          .limit(PAGE_SIZE);

        if (prefixMatch && prefixMatch.length > 0) {
          return ((prefixMatch ?? []) as unknown) as PatientLite[];
        }
      }

      // Final fallback: standard OR search
      const or = buildOrFilter(q, ["first_name", "last_name", "phone"]);
      const { data: orResults, error } = await supabase
        .from("patients")
        .select(columns)
        .or(or)
        .order("first_name")
        .limit(PAGE_SIZE);
      if (error) throw error;
      rows = ((orResults ?? []) as unknown) as PatientLite[];
      if (rows.length > 0) return rows;

      // Typo-tolerant fallback
      const looseOr = buildFuzzyOrFilter(q, ["first_name", "last_name"]);
      if (!looseOr) return rows;
      const { data: loose } = await supabase
        .from("patients")
        .select(columns)
        .or(looseOr)
        .limit(300);
      return fuzzyRank(
        ((loose ?? []) as unknown) as PatientLite[],
        q,
        (p) => `${p.first_name || ""} ${p.last_name || ""} ${p.phone || ""}`,
        0.55
      ).slice(0, PAGE_SIZE);
    },
    enabled: open && debounced.length > 0,
    staleTime: 60_000,
  });

  // Fetch the selected patient's details (so the trigger can render a name even if not in the loaded set)
  const { data: selectedPatient } = useQuery({
    queryKey: ["patients-combobox-selected", value, withSource],
    queryFn: async () => {
      if (!value) return null;
      const { data, error } = await supabase
        .from("patients")
        .select(columns)
        .eq("id", value)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown) as PatientLite | null;
    },
    enabled: !!value,
    staleTime: 5 * 60_000,
  });

  const list = debounced ? searchResults : initialList;

  const getRawName = (p: PatientLite) =>
    `${p.first_name || ""} ${p.last_name || ""}`.replace(/\s+/g, " ").trim();

  const hasMeaningfulName = (p: PatientLite) => {
    const name = getRawName(p);
    return !!name && !PHONE_LIKE_NAME.test(name);
  };

  const displayName = (p: PatientLite) => {
    const name = getRawName(p);
    if (hasMeaningfulName(p)) return name;
    return "Unnamed";
  };

  const displayRow = (p: PatientLite) => {
    // Deterministic label builder — guarantees a row never renders as a bare phone.
    const name = hasMeaningfulName(p) ? getRawName(p) : "Unnamed";
    const phone = (p.phone || "").trim();
    const label = phone ? `${name} — ${phone}` : name;
    // Final guard: if for any reason the label is still phone-like, prepend "Unnamed — ".
    if (PHONE_LIKE_NAME.test(label)) return `Unnamed — ${label}`;
    return label;
  };

  const sorted = useMemo(() => {
    const q = normalize(debounced);
    // Relevance rank: exact full-name match, then full-name prefix,
    // then any word prefix, then substring, then fuzzy similarity.
    const rank = (p: PatientLite) => {
      if (!q) return 5;
      const name = normalize(getRawName(p));
      const phone = (p.phone || "").replace(/\D/g, "");
      if (name === q) return 0;
      if (name.startsWith(q)) return 1;
      if (name.split(" ").some((w) => w.startsWith(q))) return 2;
      if (name.includes(q) || (phone && phone.includes(q.replace(/\D/g, "")))) return 3;
      return 4;
    };
    return [...list].sort((a, b) => {
      if (q) {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const sa = fuzzyScore(q, getRawName(a));
        const sb = fuzzyScore(q, getRawName(b));
        if (sa !== sb) return sb - sa;
      }
      const an = hasMeaningfulName(a);
      const bn = hasMeaningfulName(b);
      if (an !== bn) return an ? -1 : 1;
      const keyA = an ? getRawName(a) : (a.phone || "").trim();
      const keyB = bn ? getRawName(b) : (b.phone || "").trim();
      return keyA.localeCompare(keyB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [list, debounced]);

  const selected = selectedPatient || sorted.find((p) => p.id === value);
  const isLoading = debounced ? searching : loadingInitial;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSearch("");
          setDebounced("");
        } else {
          // Warm initial cache aggressively
          queryClient.prefetchQuery({
            queryKey: ["patients-combobox-initial", withSource],
            queryFn: async () => {
              const { data } = await supabase
                .from("patients")
                .select(columns)
                .order("first_name")
                .range(0, PAGE_SIZE - 1);
              return ((data ?? []) as unknown) as PatientLite[];
            },
          });
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {selected ? displayRow(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2" align="start">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div
          className="max-h-64 overflow-y-auto overscroll-contain space-y-0.5 pr-1"
          style={{ scrollbarGutter: "stable", WebkitOverflowScrolling: "touch" }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {allowNone && (
            <button
              type="button"
              className={cn(
                "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 hover:bg-accent",
                !value && "bg-accent"
              )}
              onClick={() => {
                onValueChange("");
                setOpen(false);
              }}
            >
              <Check className={cn("h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")} />
              <span className="text-muted-foreground">{noneLabel}</span>
            </button>
          )}
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {debounced ? "No patients match" : "No patients found"}
            </p>
          ) : (
            sorted.map((p) => (
              <button
                type="button"
                key={p.id}
                data-testid="patient-row"
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 hover:bg-accent",
                  value === p.id && "bg-accent"
                )}
                onClick={() => {
                  onValueChange(p.id, p);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    value === p.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{displayRow(p)}</p>
                </div>
              </button>
            ))
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-center pt-1.5 border-t mt-1">
          {debounced
            ? `Showing up to ${PAGE_SIZE} matches`
            : `Type to search all patients`}
        </p>
      </PopoverContent>
    </Popover>
  );
}
