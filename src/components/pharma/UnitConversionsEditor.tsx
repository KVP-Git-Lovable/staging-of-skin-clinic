import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface ConversionRow {
  id?: string; // existing DB id when editing
  sub_unit: string;
  conversion_value: number;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
}

interface Props {
  value: ConversionRow[];
  onChange: (rows: ConversionRow[]) => void;
  unitOptions: Array<{ id: string; name: string }>;
  baseUnit?: string;
}

export function UnitConversionsEditor({ value, onChange, unitOptions, baseUnit }: Props) {
  const summary = useMemo(() => {
    return value
      .filter((r) => r.is_active && r.sub_unit && Number(r.conversion_value) > 1)
      .map((r) => `1 ${baseUnit || "Base"} = ${r.conversion_value} ${r.sub_unit}`)
      .join(" · ");
  }, [value, baseUnit]);

  const update = (idx: number, patch: Partial<ConversionRow>) => {
    const next = value.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const setDefault = (idx: number) => {
    const next = value.map((r, i) => ({ ...r, is_default: i === idx }));
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const add = () => {
    const sortOrder = value.length;
    const isFirst = value.length === 0;
    onChange([
      ...value,
      { sub_unit: "", conversion_value: 1, is_active: true, is_default: isFirst, sort_order: sortOrder },
    ]);
  };

  // Ensure exactly one default exists among active rows.
  const activeRows = value.filter((r) => r.is_active);
  const hasDefault = activeRows.some((r) => r.is_default);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Unit Conversions</Label>
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-7 gap-1">
          <Plus className="h-3 w-3" /> Add conversion
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground border border-dashed rounded-md px-3 py-3 text-center">
          No sub-unit conversions. Product will be sold by its Base Unit only.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((row, idx) => (
            <div
              key={row.id || idx}
              className="grid grid-cols-12 gap-2 items-end rounded-md border bg-muted/30 p-2"
            >
              <div className="col-span-4">
                <Label className="text-[11px] text-muted-foreground">Sub Unit</Label>
                <Select value={row.sub_unit || ""} onValueChange={(v) => update(idx, { sub_unit: v })}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="e.g. ml, Tablet" /></SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((u) => (
                      <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label className="text-[11px] text-muted-foreground">
                  {row.sub_unit && baseUnit ? `${row.sub_unit} per ${baseUnit}` : "Units per Base"}
                </Label>
                <Input
                  type="number"
                  className="mt-1 h-8"
                  value={row.conversion_value}
                  onChange={(e) => update(idx, { conversion_value: parseFloat(e.target.value) || 1 })}
                  min={1}
                />
              </div>
              <div className="col-span-2 flex flex-col items-center">
                <Label className="text-[11px] text-muted-foreground">Default</Label>
                <input
                  type="radio"
                  className="mt-2 h-4 w-4 accent-primary"
                  name="default-conversion"
                  checked={!!row.is_default}
                  disabled={!row.is_active}
                  onChange={() => setDefault(idx)}
                />
              </div>
              <div className="col-span-2 flex flex-col items-center">
                <Label className="text-[11px] text-muted-foreground">Active</Label>
                <Switch
                  className="mt-1.5"
                  checked={row.is_active}
                  onCheckedChange={(v) => {
                    // If turning off the default row, reassign default to another active row.
                    if (!v && row.is_default) {
                      const next = value.map((r, i) => {
                        if (i === idx) return { ...r, is_active: false, is_default: false };
                        return r;
                      });
                      const nextDefIdx = next.findIndex((r) => r.is_active);
                      if (nextDefIdx >= 0) next[nextDefIdx] = { ...next[nextDefIdx], is_default: true };
                      onChange(next);
                    } else {
                      update(idx, { is_active: v });
                    }
                  }}
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary && <p className="text-[11px] text-muted-foreground">{summary}</p>}
      {activeRows.length > 0 && !hasDefault && (
        <p className="text-[11px] text-destructive">Pick one row as Default.</p>
      )}
    </div>
  );
}

/** Replace all conversion rows for a product transactionally. */
export async function syncProductUnits(
  supabase: any,
  productId: string,
  rows: ConversionRow[],
) {
  // Delete existing rows then insert the new set. Simple and predictable.
  const { error: delErr } = await supabase
    .from("pharma_product_units")
    .delete()
    .eq("product_id", productId);
  if (delErr) throw delErr;

  const valid = rows
    .filter((r) => r.sub_unit && Number(r.conversion_value) > 0)
    .map((r, i) => ({
      product_id: productId,
      sub_unit: r.sub_unit,
      conversion_value: Number(r.conversion_value) || 1,
      is_active: !!r.is_active,
      is_default: !!r.is_default,
      sort_order: i,
    }));

  if (valid.length === 0) return null;

  const { error: insErr } = await supabase.from("pharma_product_units").insert(valid);
  if (insErr) throw insErr;

  // Return the active default (if any) so caller can mirror to legacy columns.
  const def = valid.find((r) => r.is_active && r.is_default) || valid.find((r) => r.is_active) || null;
  return def;
}