import { useEffect, useState } from "react";
import { PortalSurveyConfig } from "@/components/surveys/PortalSurveyConfig";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PORTAL_MODULES,
  PORTAL_MODULE_GROUPS,
  portalModuleDefaults,
  portalModuleEnabled,
  portalModulesInGroup,
  type PortalModuleKey,
} from "@/lib/portalModules";

/**
 * What the patient portal shows, and what its surveys ask.
 *
 * Two tabs: the module switches, and survey configuration. They were stacked,
 * one card below the other, until the page grew long enough that the clinic
 * asked to switch between them instead - and long enough that "Patient Portal
 * Modules" had stopped describing what was on it.
 *
 * These switches already existed, in a tab of the Pharmacy screen called
 * "Customer Portal Configuration" that neither Admin nor the sidebar links to.
 * This is the same settings row (portal_settings), reached from where the
 * clinic looks for it, driven off src/lib/portalModules.ts so a new module
 * appears here without anybody having to remember this file.
 *
 * The Pharmacy tab still works; it writes the same row, naming its keys
 * explicitly, so saving there cannot overwrite what is set here.
 */
export default function PortalModules() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["portal-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<Record<PortalModuleKey, boolean>>(portalModuleDefaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    // Read through the resolver, so the page shows what the portal actually
    // does with this row rather than a raw null.
    const next = {} as Record<PortalModuleKey, boolean>;
    for (const m of PORTAL_MODULES) next[m.key] = portalModuleEnabled(settings, m.key);
    setForm(next);
  }, [settings]);

  const dirty = settings
    ? PORTAL_MODULES.some((m) => form[m.key] !== portalModuleEnabled(settings, m.key))
    : false;

  const onSave = async () => {
    const id = (settings as { id?: string } | null)?.id;
    if (!id) {
      toast.error("No portal settings row to save to.");
      return;
    }
    setSaving(true);
    // Only the module flags, so this never touches the shop settings that
    // share this row (stock behaviour, expiry threshold, low-stock level).
    const { error } = await supabase.from("portal_settings").update(form).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["portal-settings"] });
    toast.success("Patient portal modules saved");
  };

  const hiddenCount = PORTAL_MODULES.filter((m) => !form[m.key]).length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Patient Portal Configuration</h1>
        <p className="text-sm text-muted-foreground">
          What patients see in the portal, and what the surveys ask.
        </p>
      </div>

      {/* Two halves of one screen rather than one long scroll: the switches
          decide whether patients see surveys at all, and the other tab is
          what those surveys ask. Same Tabs the rest of Admin uses. */}
      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Patient Portal Modules</TabsTrigger>
          <TabsTrigger value="surveys">Surveys Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="pt-4 space-y-4">
          {/* This line belongs to the switches, so it travels with them. */}
          <p className="text-sm text-muted-foreground">
            Choose what patients can see when they sign in to the portal. A switch takes effect the
            next time a patient opens or reloads it.
          </p>

          <Card className="p-4 space-y-6 max-w-2xl">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              PORTAL_MODULE_GROUPS.map((group) => (
                <div key={group} className="space-y-4">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {group}
                  </h2>
                  {portalModulesInGroup(group).map((m) => (
                    <div
                      key={m.key}
                      className="flex items-center justify-between gap-4 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <Label htmlFor={m.key} className="text-sm font-medium">
                          {m.label}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                      </div>
                      <Switch
                        id={m.key}
                        checked={form[m.key]}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, [m.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              ))
            )}

            <div className="flex items-center gap-3 pt-2 border-t">
              <Button onClick={onSave} disabled={saving || isLoading || !dirty}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {hiddenCount === 0
                  ? "Everything is switched on."
                  : `${hiddenCount} of ${PORTAL_MODULES.length} switched off.`}
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="surveys" className="pt-4">
          <PortalSurveyConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
