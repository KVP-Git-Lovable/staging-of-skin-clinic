import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_CURRENCY_SETTINGS,
  formatMoney,
  setCurrencySettingsCache,
  useCurrencySettings,
  type CurrencySettings,
} from "@/lib/currency";

export default function CurrencyBilling() {
  const { data } = useCurrencySettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<CurrencySettings>(DEFAULT_CURRENCY_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (patch: Partial<CurrencySettings>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setCurrencySettingsCache(next); // live preview
  };

  const onSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("currency_settings")
      .upsert({ id: true, ...form }, { onConflict: "id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    setCurrencySettingsCache(form);
    qc.invalidateQueries({ queryKey: ["currency-settings"] });
    toast.success("Currency settings saved");
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Currency &amp; Billing</h1>
        <p className="text-sm text-muted-foreground">
          Controls how every amount is displayed across the app.
        </p>
      </div>

      <Card className="p-4 space-y-5 max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Currency symbol</Label>
            <Input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} className="max-w-[120px]" />
          </div>

          <div className="space-y-1.5">
            <Label>Number style</Label>
            <Select value={form.number_style} onValueChange={(v) => set({ number_style: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="indian">Indian — Lakhs &amp; Crores (12,34,567)</SelectItem>
                <SelectItem value="us">US — Thousands &amp; Millions (1,234,567)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Show decimals</p>
            <p className="text-xs text-muted-foreground">Turn off to round every amount to whole numbers.</p>
          </div>
          <Switch checked={form.show_decimals} onCheckedChange={(v) => set({ show_decimals: v })} />
        </div>

        {form.show_decimals && (
          <div className="space-y-1.5">
            <Label>Decimal digits</Label>
            <Input
              type="number"
              min={0}
              max={6}
              value={form.decimal_digits}
              onChange={(e) => set({ decimal_digits: Number(e.target.value) })}
              className="max-w-[120px]"
            />
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Abbreviate large amounts</p>
            <p className="text-xs text-muted-foreground">
              {form.number_style === "indian" ? "Shows 12.35 L / 1.20 Cr" : "Shows 1.2K / 1.20M"}
            </p>
          </div>
          <Switch checked={form.abbreviate} onCheckedChange={(v) => set({ abbreviate: v })} />
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Preview: </span>
          <span className="font-semibold tabular-nums">{formatMoney(1234567.891)}</span>
        </div>

        <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </Card>
    </div>
  );
}
