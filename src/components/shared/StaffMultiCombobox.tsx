import { useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  roleFilter?: string[];
}

/** Multi-select version of StaffCombobox - picks any number of active staff members. */
export function StaffMultiCombobox({
  value,
  onValueChange,
  placeholder = "Select staff",
  className,
  roleFilter,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list", roleFilter?.join(",") || "all", false],
    queryFn: async () => {
      let q = supabase
        .from("staff")
        .select("id, first_name, last_name, role, specialization, auth_user_id")
        .eq("is_active", true)
        .order("first_name");
      if (roleFilter && roleFilter.length > 0) q = q.in("role", roleFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const name = (s: any) => `${s.first_name} ${s.last_name}`;
  const filtered = staffList.filter(
    (s) =>
      name(s).toLowerCase().includes(search.toLowerCase()) ||
      (s.role || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.specialization || "").toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id: string) =>
    onValueChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const selected = value
    .map((id) => staffList.find((s) => s.id === id))
    .filter(Boolean) as any[];

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="truncate">
              {value.length === 0 ? placeholder : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-2" align="start">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
          </div>
          <div
            className="max-h-52 overflow-y-auto overscroll-contain space-y-0.5"
            style={{ scrollbarGutter: "stable", WebkitOverflowScrolling: "touch" }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No staff found</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 hover:bg-accent",
                    value.includes(s.id) && "bg-accent",
                  )}
                  onClick={() => toggle(s.id)}
                >
                  <Check className={cn("h-3.5 w-3.5", value.includes(s.id) ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{name(s)}</p>
                    {(s.role || s.specialization) && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {[s.role, s.specialization].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1 font-normal">
              {name(s)}
              <button type="button" onClick={() => toggle(s.id)} aria-label={`Remove ${name(s)}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default StaffMultiCombobox;
