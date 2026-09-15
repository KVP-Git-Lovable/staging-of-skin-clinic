import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import {
  getObjectByKey,
  getOperatorsForType,
  operatorNeedsValue,
  OPERATOR_LABELS,
  type ReportFilter,
  type ReportField,
  type ReportFilterOperator,
} from "@/lib/reportObjects";

interface Props {
  filter: ReportFilter;
  allFields: (ReportField & { objectKey: string; prefix: string })[];
  fieldKeyFn: (f: { objectKey: string; key: string }) => string;
  onChange: (patch: Partial<ReportFilter>) => void;
  onRemove: () => void;
  /** Show the Salesforce-style filter number used by filter logic */
  index?: number;
  lockField?: boolean;
}

export function FilterRow({ filter, allFields, fieldKeyFn, onChange, onRemove, index, lockField }: Props) {
  const [distinctValues, setDistinctValues] = useState<string[]>([]);

  const [objKey, fieldKey] = filter.field.split(".");
  const fieldDef = getObjectByKey(objKey)?.fields.find((f) => f.key === fieldKey);
  const fieldType = fieldDef?.type || "text";
  const operators = getOperatorsForType(fieldType);

  useEffect(() => {
    const fetchDistinct = async () => {
      const obj = getObjectByKey(objKey);
      if (!obj) return;
      const field = obj.fields.find((f) => f.key === fieldKey);
      if (!field || field.type !== "text" || field.key.startsWith("_")) {
        setDistinctValues([]);
        return;
      }
      try {
        const { data } = await supabase
          .from(obj.table as any)
          .select(fieldKey)
          .not(fieldKey, "is", null)
          .limit(500);
        if (data) {
          const unique = [...new Set(data.map((r: any) => String(r[fieldKey])))].filter(Boolean).sort();
          setDistinctValues(unique.length <= 30 ? unique : []);
        }
      } catch {
        setDistinctValues([]);
      }
    };
    fetchDistinct();
  }, [filter.field, objKey, fieldKey]);

  // Keep the operator valid whenever the field type changes.
  useEffect(() => {
    if (!operators.includes(filter.operator)) {
      onChange({ operator: operators[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.field]);

  const showDropdown =
    distinctValues.length > 0 && ["equals", "not_equals"].includes(filter.operator);

  const changeField = (v: string) => {
    const nextObj = v.split(".")[0];
    onChange({ field: v, objectKey: nextObj });
  };

  const valueInput = () => {
    if (!operatorNeedsValue(filter.operator)) return null;
    if (fieldType === "boolean") {
      return (
        <Select value={filter.value} onValueChange={(v) => onChange({ value: v })}>
          <SelectTrigger className="h-6 text-[11px] flex-1">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true" className="text-xs">True</SelectItem>
            <SelectItem value="false" className="text-xs">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if (fieldType === "date") {
      return (
        <Input
          type="date"
          value={(filter.value || "").slice(0, 10)}
          onChange={(e) => onChange({ value: e.target.value })}
          className="h-6 text-[11px] flex-1"
        />
      );
    }
    if (showDropdown) {
      return (
        <Select value={filter.value} onValueChange={(v) => onChange({ value: v })}>
          <SelectTrigger className="h-6 text-[11px] flex-1">
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            {distinctValues.map((v) => (
              <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={fieldType === "number" && !["in", "not_in"].includes(filter.operator) ? "number" : "text"}
        value={filter.value}
        onChange={(e) => onChange({ value: e.target.value })}
        className="h-6 text-[11px] flex-1"
        placeholder={["in", "not_in"].includes(filter.operator) ? "Comma separated values" : "Value"}
      />
    );
  };

  return (
    <div className="flex flex-col gap-1 p-1.5 bg-muted/30 rounded text-[11px]">
      <div className="flex gap-1 items-center">
        {index !== undefined && (
          <span className="shrink-0 h-4 min-w-4 px-1 rounded bg-primary/10 text-primary font-semibold text-[10px] flex items-center justify-center">
            {index}
          </span>
        )}
        {lockField ? (
          <div className="flex-1 truncate font-medium px-1 py-0.5 rounded bg-background border border-border/50">
            {(() => {
              const f = allFields.find((af) => fieldKeyFn(af) === filter.field);
              return f ? `${f.prefix}.${f.label}` : filter.field;
            })()}
          </div>
        ) : (
          <Select value={filter.field} onValueChange={changeField}>
            <SelectTrigger className="h-6 text-[11px] flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {allFields.map((f) => (
                <SelectItem key={fieldKeyFn(f)} value={fieldKeyFn(f)} className="text-xs">
                  {f.prefix}.{f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!lockField && (
          <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={onRemove}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
      <div className="flex gap-1">
        <Select
          value={filter.operator}
          onValueChange={(v: ReportFilterOperator) => onChange({ operator: v })}
        >
          <SelectTrigger className="h-6 text-[11px] w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op} value={op} className="text-xs">{OPERATOR_LABELS[op]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {valueInput()}
      </div>
    </div>
  );
}
