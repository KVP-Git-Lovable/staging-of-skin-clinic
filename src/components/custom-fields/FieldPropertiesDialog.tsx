import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import {
  CustomField,
  CustomFieldSection,
  CustomFieldType,
  getFieldTypeMeta,
  toColumnName,
} from "@/lib/custom-fields/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: Partial<CustomField> | null;
  sections: CustomFieldSection[];
  onSave: (field: Partial<CustomField> & { label: string; field_type: CustomFieldType; column_name: string }) => void;
  saving?: boolean;
}

export function FieldPropertiesDialog({ open, onOpenChange, field, sections, onSave, saving }: Props) {
  const [label, setLabel] = useState("");
  const [helpText, setHelpText] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [required, setRequired] = useState(false);
  const [active, setActive] = useState(true);
  const [sectionId, setSectionId] = useState<string>("__none__");
  const [options, setOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState("");
  const [maxLength, setMaxLength] = useState<string>("");
  const [decimals, setDecimals] = useState<string>("2");

  const isNew = !field?.id;
  const type = (field?.field_type ?? "text") as CustomFieldType;
  const meta = getFieldTypeMeta(type);

  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? "");
    setHelpText(field?.help_text ?? "");
    setPlaceholder(field?.placeholder ?? "");
    setRequired(field?.is_required ?? false);
    setActive(field?.is_active ?? true);
    setSectionId(field?.section_id ?? "__none__");
    setOptions(field?.options ?? []);
    setOptionDraft("");
    setMaxLength(field?.max_length ? String(field.max_length) : "");
    setDecimals(field?.decimal_places != null ? String(field.decimal_places) : "2");
  }, [open, field]);

  const columnName = field?.column_name ?? toColumnName(label);

  const addOption = () => {
    const v = optionDraft.trim();
    if (!v || options.includes(v)) return;
    setOptions([...options, v]);
    setOptionDraft("");
  };

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({
      ...field,
      label: label.trim(),
      field_type: type,
      column_name: columnName,
      section_id: sectionId === "__none__" ? null : sectionId,
      options,
      is_required: required,
      is_active: active,
      help_text: helpText || null,
      placeholder: placeholder || null,
      max_length: maxLength ? Number(maxLength) : null,
      decimal_places: meta.hasDecimals ? Number(decimals) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "New" : "Edit"} {meta.label} Field
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Field Label *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Referral Source" />
            <p className="text-xs text-muted-foreground">API name: {columnName}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="__none__">Additional Information</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {meta.hasOptions && (
            <div className="space-y-1.5">
              <Label>Options</Label>
              <div className="flex gap-2">
                <Input
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Add an option and press Enter"
                />
                <Button type="button" variant="outline" onClick={addOption}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {options.map((o) => (
                  <Badge key={o} variant="secondary" className="gap-1">
                    {o}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setOptions(options.filter((x) => x !== o))}
                    />
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {meta.hasLength && (
            <div className="space-y-1.5">
              <Label>Max Length</Label>
              <Input type="number" value={maxLength} onChange={(e) => setMaxLength(e.target.value)} placeholder="255" />
            </div>
          )}

          {meta.hasDecimals && (
            <div className="space-y-1.5">
              <Label>Decimal Places</Label>
              <Input type="number" value={decimals} onChange={(e) => setDecimals(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Placeholder</Label>
            <Input value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Help Text</Label>
            <Textarea value={helpText} onChange={(e) => setHelpText(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Required</p>
              <p className="text-xs text-muted-foreground">Users must fill this before saving</p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Show this field on record forms</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!label.trim() || saving}>
            {saving ? "Saving..." : "Save Field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}