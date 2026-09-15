import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CustomField } from "@/lib/custom-fields/types";

interface Props {
  field: CustomField;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  error?: string;
}

export function CustomFieldInput({ field, value, onChange, disabled, error }: Props) {
  const common = {
    id: field.column_name,
    disabled,
    placeholder: field.placeholder ?? "",
  };

  const renderControl = () => {
    switch (field.field_type) {
      case "textarea":
        return (
          <Textarea
            {...common}
            value={value ?? ""}
            maxLength={field.max_length ?? undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "checkbox":
        return (
          <div className="flex h-10 items-center">
            <Checkbox
              id={field.column_name}
              checked={!!value}
              disabled={disabled}
              onCheckedChange={(v) => onChange(!!v)}
            />
          </div>
        );
      case "picklist":
        return (
          <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {field.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multiselect": {
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-wrap gap-2 rounded-md border border-input p-2">
            {field.options.map((o) => {
              const active = selected.includes(o);
              return (
                <Badge
                  key={o}
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() =>
                    !disabled &&
                    onChange(active ? selected.filter((s) => s !== o) : [...selected, o])
                  }
                >
                  {o}
                </Badge>
              );
            })}
            {field.options.length === 0 && (
              <span className="text-xs text-muted-foreground">No options configured</span>
            )}
          </div>
        );
      }
      case "number":
      case "decimal":
      case "currency":
      case "percent":
        return (
          <Input
            {...common}
            type="number"
            step={field.field_type === "number" ? 1 : Math.pow(10, -(field.decimal_places ?? 2))}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        );
      case "date":
        return (
          <Input {...common} type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />
        );
      case "datetime":
        return (
          <Input
            {...common}
            type="datetime-local"
            value={value ? String(value).slice(0, 16) : ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );
      case "email":
        return <Input {...common} type="email" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      case "phone":
        return <Input {...common} type="tel" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      case "url":
        return <Input {...common} type="url" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      default:
        return (
          <Input
            {...common}
            value={value ?? ""}
            maxLength={field.max_length ?? undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.column_name} className="text-sm">
        {field.label}
        {field.is_required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {renderControl()}
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}