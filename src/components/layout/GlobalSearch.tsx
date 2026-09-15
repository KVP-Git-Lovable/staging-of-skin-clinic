import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, User, CalendarDays, Stethoscope, Receipt, Loader2, ChevronDown,
  UserCog, Sparkles, Pill, Clock, ArrowRight, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { MicButton } from "@/components/shared/MicButton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { buildOrFilter, fuzzyRank } from "@/lib/fuzzySearch";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Kind = "patient" | "appointment" | "procedure" | "invoice" | "staff" | "service" | "product";

type Result = {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  route: string;
};

const KIND_META: Record<Kind, { label: string; icon: any; listRoute: string }> = {
  patient: { label: "Patients", icon: User, listRoute: "/patients" },
  appointment: { label: "Appointments", icon: CalendarDays, listRoute: "/appointments" },
  procedure: { label: "Prescriptions", icon: Stethoscope, listRoute: "/procedures" },
  invoice: { label: "Invoices", icon: Receipt, listRoute: "/billing" },
  staff: { label: "Staff", icon: UserCog, listRoute: "/staff" },
  service: { label: "Services", icon: Sparkles, listRoute: "/services" },
  product: { label: "Products", icon: Pill, listRoute: "/pharma" },
};

const SCOPES: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "patient", label: "Patients" },
  { key: "appointment", label: "Appointments" },
  { key: "procedure", label: "Prescriptions" },
  { key: "invoice", label: "Invoices" },
  { key: "staff", label: "Staff" },
  { key: "service", label: "Services" },
  { key: "product", label: "Products" },
];

const RECENTS_KEY = "globalSearch.recents";

const readRecents = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"); } catch { return []; }
};

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [scope, setScope] = useState<"all" | Kind>("all");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>(readRecents);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Cmd/Ctrl+K focuses the search, like Salesforce's global search shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const rememberTerm = (q: string) => {
    const clean = q.trim();
    if (clean.length < 2) return;
    const next = [clean, ...readRecents().filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
    setRecents(next);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    let cancelled = false;
    const q = debounced;
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const like = `%${q}%`;
      const wants = (k: Kind) => scope === "all" || scope === k;
      const patientFilter = buildOrFilter(q, ["first_name", "last_name", "phone", "email"]);

      const noRows = { data: [] as any[] };
      const [patients, appts, procs, invs, staff, services, products] = await Promise.all([
        wants("patient")
          ? supabase.from("patients").select("id, first_name, last_name, phone, email")
              .or(patientFilter || `first_name.ilike.${like}`).limit(25)
          : noRows,
        wants("appointment")
          ? supabase.from("appointments").select("id, patient_name, service, start_time, status")
              .or(`patient_name.ilike.${like},service.ilike.${like},status.ilike.${like}`)
              .order("start_time", { ascending: false }).limit(12)
          : noRows,
        wants("procedure")
          ? supabase.from("procedures").select("id, service_name, procedure_date, patients(first_name, last_name)")
              .ilike("service_name", like).order("procedure_date", { ascending: false }).limit(12)
          : noRows,
        wants("invoice")
          ? supabase.from("invoices").select("id, invoice_number, patient_name, total_amount, status, created_at")
              .or(`invoice_number.ilike.${like},patient_name.ilike.${like}`)
              .order("created_at", { ascending: false }).limit(12)
          : noRows,
        wants("staff")
          ? supabase.from("staff").select("id, first_name, last_name, role, phone")
              .or(`first_name.ilike.${like},last_name.ilike.${like},role.ilike.${like},phone.ilike.${like}`)
              .limit(8)
          : noRows,
        wants("service")
          ? supabase.from("services").select("id, name, category, price").ilike("name", like).limit(8)
          : noRows,
        wants("product")
          ? supabase.from("pharma_products").select("id, name, category, mrp")
              .or(`name.ilike.${like},generic_name.ilike.${like}`).limit(8)
          : noRows,
      ]);

      if (cancelled) return;

      const patientRows = ((patients as any).data || []) as any[];
      const ranked = fuzzyRank(
        patientRows,
        q,
        (p: any) => `${p.first_name || ""} ${p.last_name || ""} ${p.phone || ""}`,
        0.45
      );
      const usePatients = (ranked.length ? ranked : patientRows).slice(0, 6);

      const out: Result[] = [
        ...usePatients.map((p: any) => ({
          id: p.id,
          kind: "patient" as const,
          title: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Patient",
          subtitle: [p.phone, p.email].filter(Boolean).join(" · ") || "Patient",
          route: `/patients/${p.id}`,
        })),
        ...(((appts as any).data || []) as any[]).slice(0, 5).map((a: any) => ({
          id: a.id,
          kind: "appointment" as const,
          title: a.patient_name || "Appointment",
          subtitle: `${a.service || "Visit"} · ${a.start_time ? format(new Date(a.start_time), "dd MMM yyyy, h:mm a") : ""}${a.status ? ` · ${a.status}` : ""}`,
          route: `/appointments/${a.id}`,
        })),
        ...(((procs as any).data || []) as any[]).slice(0, 5).map((p: any) => ({
          id: p.id,
          kind: "procedure" as const,
          title: `${p.patients?.first_name || ""} ${p.patients?.last_name || ""}`.trim() || "Prescription",
          subtitle: `${p.service_name || ""} · ${p.procedure_date ? format(new Date(p.procedure_date), "dd MMM yyyy") : ""}`,
          route: `/procedures?id=${p.id}`,
        })),
        ...(((invs as any).data || []) as any[]).slice(0, 5).map((i: any) => ({
          id: i.id,
          kind: "invoice" as const,
          title: i.invoice_number || "Invoice",
          subtitle: `${i.patient_name || ""} · ₹${Number(i.total_amount || 0).toLocaleString("en-IN")}${i.status ? ` · ${i.status}` : ""}`,
          route: `/billing?viewInvoice=${i.id}`,
        })),
        ...(((staff as any).data || []) as any[]).slice(0, 5).map((s: any) => ({
          id: s.id,
          kind: "staff" as const,
          title: `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Staff",
          subtitle: [s.role, s.phone].filter(Boolean).join(" · ") || "Staff",
          route: `/staff/${s.id}`,
        })),
        ...(((services as any).data || []) as any[]).slice(0, 5).map((s: any) => ({
          id: s.id,
          kind: "service" as const,
          title: s.name,
          subtitle: `${s.category || "Service"} · ₹${Number(s.price || 0).toLocaleString("en-IN")}`,
          route: `/services?q=${encodeURIComponent(s.name || "")}`,
        })),
        ...(((products as any).data || []) as any[]).slice(0, 5).map((p: any) => ({
          id: p.id,
          kind: "product" as const,
          title: p.name,
          subtitle: `${p.category || "Product"} · ₹${Number(p.mrp || 0).toLocaleString("en-IN")}`,
          route: `/pharma?q=${encodeURIComponent(p.name || "")}`,
        })),
      ];

      setResults(out);
      setActiveIndex(0);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [debounced, scope]);

  const grouped = useMemo(() => {
    const map = new Map<Kind, Result[]>();
    results.forEach((r) => {
      if (!map.has(r.kind)) map.set(r.kind, []);
      map.get(r.kind)!.push(r);
    });
    return [...map.entries()];
  }, [results]);

  const go = (r: Result) => {
    rememberTerm(term);
    setOpen(false);
    setTerm("");
    navigate(r.route);
  };

  const viewAll = (kind: Kind) => {
    rememberTerm(term);
    setOpen(false);
    const q = term.trim();
    setTerm("");
    navigate(`${KIND_META[kind].listRoute}?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[activeIndex]); }
    else if (e.key === "Escape") setOpen(false);
  };

  let flatIndex = -1;
  const showSuggestions = open && term.trim().length < 2;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="flex items-center rounded-md bg-muted">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 pl-3 pr-2 h-9 text-xs text-muted-foreground shrink-0 hover:text-foreground">
            {SCOPES.find((s) => s.key === scope)?.label}
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-popover z-50">
            {SCOPES.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => setScope(s.key)}>{s.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="h-5 w-px bg-border" />
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search patients, appointments, bills…"
            className="pl-8 pr-16 w-64 bg-transparent border-0 focus-visible:ring-0"
            value={term}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
            onKeyDown={onKeyDown}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
            {term && (
              <button type="button" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => { setTerm(""); inputRef.current?.focus(); }} aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <MicButton
              value={term}
              onChange={(v) => { setTerm(v); setOpen(true); }}
              mode="replace"
              title="Speak to search"
            />
          </div>
        </div>
      </div>

      {showSuggestions && recents.length > 0 && (
        <div className="absolute z-50 mt-1 w-[28rem] rounded-lg border bg-popover shadow-lg p-1">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Recent searches</p>
          {recents.map((r) => (
            <button
              key={r}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-accent/60"
              onClick={() => { setTerm(r); inputRef.current?.focus(); }}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {r}
            </button>
          ))}
        </div>
      )}

      {open && term.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-[28rem] max-h-[70vh] overflow-y-auto rounded-lg border bg-popover shadow-lg p-1">
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            {loading ? "Searching…" : `Top results for “${term.trim()}”`}
          </p>
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">No matches for “{term}”</p>
          )}
          {grouped.map(([kind, items]) => {
            const Meta = KIND_META[kind];
            const Icon = Meta.icon;
            return (
              <div key={kind} className="py-1">
                <div className="flex items-center justify-between px-3 py-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{Meta.label}</p>
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                    onClick={() => viewAll(kind)}
                  >
                    View more <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                {items.map((r) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  return (
                    <button
                      key={`${kind}-${r.id}`}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => go(r)}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-2 rounded-md text-left transition-colors",
                        idx === activeIndex ? "bg-accent" : "hover:bg-accent/60"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm truncate">{r.title}</span>
                        <span className="block text-xs text-muted-foreground truncate">{r.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
