import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StaffComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  roleFilter?: string[];
  /** Only show staff who have a login account (system users). Default false -
   *  selecting a doctor/assistant for a record has nothing to do with
   *  whether they've been set up with an app login. */
  onlyUsers?: boolean;
}

export function StaffCombobox({
  value,
  onValueChange,
  placeholder = "Select staff",
  allowNone = false,
  noneLabel = "No staff assigned",
  className,
  roleFilter,
  onlyUsers = false,
}: StaffComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list", roleFilter?.join(",") || "all", onlyUsers],
    queryFn: async () => {
      let q = supabase
        .from("staff")
        .select("id, first_name, last_name, role, specialization, auth_user_id")
        .eq("is_active", true)
        .order("first_name");
      if (onlyUsers) {
        q = q.not("auth_user_id", "is", null);
      }
      if (roleFilter && roleFilter.length > 0) {
        q = q.in("role", roleFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const getDisplayName = (s: any) => `${s.first_name} ${s.last_name}`;

  const filtered = staffList.filter((s) =>
    getDisplayName(s).toLowerCase().includes(search.toLowerCase()) ||
    (s.role || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.specialization || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedStaff = staffList.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {selectedStaff ? getDisplayName(selectedStaff) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div
          className="max-h-52 overflow-y-auto overscroll-contain space-y-0.5"
          style={{ scrollbarGutter: "stable", WebkitOverflowScrolling: "touch" }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {allowNone && (
            <button
              className={cn(
                "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 hover:bg-accent",
                !value && "bg-accent"
              )}
              onClick={() => {
                onValueChange("");
                setOpen(false);
                setSearch("");
              }}
            >
              <Check className={cn("h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")} />
              <span className="text-muted-foreground">{noneLabel}</span>
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No staff found</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 hover:bg-accent",
                  value === s.id && "bg-accent"
                )}
                onClick={() => {
                  onValueChange(s.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check className={cn("h-3.5 w-3.5", value === s.id ? "opacity-100" : "opacity-0")} />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{getDisplayName(s)}</p>
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
  );
}
