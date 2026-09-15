import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  HISTORY_OBJECTS,
  MAX_TRACKED_FIELDS,
  fieldsForObject,
  useHistoryConfigs,
  useSaveHistoryConfig,
} from "@/lib/history";

export default function HistoryTracking() {
  const { data: configs = [] } = useHistoryConfigs();
  const save = useSaveHistoryConfig();
  const [objectKey, setObjectKey] = useState(HISTORY_OBJECTS[0].key);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; fields: string[] }>>({});

  const stored = configs.find((c) => c.object_key === objectKey);
  const current =
    draft[objectKey] ?? { enabled: stored?.is_enabled ?? false, fields: stored?.tracked_fields ?? [] };

  const allFields = useMemo(() => fieldsForObject(objectKey), [objectKey]);
  const fields = allFields.filter((f) =>
    search ? f.label.toLowerCase().includes(search.toLowerCase()) : true
  );

  const update = (patch: Partial<{ enabled: boolean; fields: string[] }>) =>
    setDraft((d) => ({ ...d, [objectKey]: { ...current, ...patch } }));

  const toggleField = (key: string) => {
    const has = current.fields.includes(key);
    if (!has && current.fields.length >= MAX_TRACKED_FIELDS) {
      toast.error(`You can track up to ${MAX_TRACKED_FIELDS} fields per object.`);
      return;
    }
    update({ fields: has ? current.fields.filter((f) => f !== key) : [...current.fields, key] });
  };

  const onSave = async () => {
    try {
      await save.mutateAsync({
        object_key: objectKey,
        is_enabled: current.enabled,
        tracked_fields: current.fields,
      });
      toast.success("History tracking saved");
    } catch (e: any) {
      toast.error(e.message ?? "Could not save history tracking");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">History Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Choose an object, enable tracking and pick up to {MAX_TRACKED_FIELDS} fields. Tracked changes appear in the
          History section of every record.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="p-2 h-fit">
          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
            {HISTORY_OBJECTS.map((o) => {
              const cfg = configs.find((c) => c.object_key === o.key);
              return (
                <button
                  key={o.key}
                  onClick={() => setObjectKey(o.key)}
                  className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    objectKey === o.key ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {cfg?.is_enabled && cfg.tracked_fields.length > 0 && (
                    <Badge variant="secondary" className="shrink-0">{cfg.tracked_fields.length}</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch checked={current.enabled} onCheckedChange={(v) => update({ enabled: v })} />
              <span className="text-sm font-medium">Enable history tracking for this object</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {current.fields.length}/{MAX_TRACKED_FIELDS} fields
              </span>
              <Button onClick={onSave} disabled={save.isPending}>Save</Button>
            </div>
          </div>

          <Input
            placeholder="Search fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          {allFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No field metadata available for this object yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[50vh] overflow-y-auto pr-1">
              {fields.map((f) => (
                <label
                  key={f.key}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={current.fields.includes(f.key)}
                    onCheckedChange={() => toggleField(f.key)}
                    disabled={!current.enabled}
                  />
                  <span className="truncate">{f.label}</span>
                </label>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
