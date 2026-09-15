import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FieldPropertiesDialog } from "@/components/custom-fields/FieldPropertiesDialog";
import {
  useCustomFields,
  useCustomFieldSections,
  useDeleteField,
  useDeleteSection,
  useReorderFields,
  useSaveField,
  useSaveSection,
} from "@/lib/custom-fields/api";
import {
  CUSTOM_FIELD_OBJECTS,
  CUSTOM_FIELD_TYPES,
  CustomField,
  CustomFieldType,
  getFieldTypeMeta,
} from "@/lib/custom-fields/types";

const NONE = "__none__";

function TypeIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as any)[name] ?? Icons.Square;
  return <Cmp className={className} />;
}

export default function CustomFields() {
  const [objectKey, setObjectKey] = useState(CUSTOM_FIELD_OBJECTS[0].key);
  const object = CUSTOM_FIELD_OBJECTS.find((o) => o.key === objectKey)!;

  const { data: sections = [] } = useCustomFieldSections(objectKey);
  const { data: fields = [] } = useCustomFields(objectKey);

  const saveField = useSaveField(objectKey, object.table);
  const deleteField = useDeleteField(objectKey, object.table);
  const saveSection = useSaveSection(objectKey);
  const deleteSection = useDeleteSection(objectKey);
  const reorder = useReorderFields(objectKey);

  const [editing, setEditing] = useState<Partial<CustomField> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sectionDialog, setSectionDialog] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [sectionCols, setSectionCols] = useState("2");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomField | null>(null);
  const [dragField, setDragField] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, CustomField[]>();
    for (const f of fields) {
      const key = f.section_id ?? NONE;
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return map;
  }, [fields]);

  const blocks = [
    ...sections.map((s) => ({ id: s.id, name: s.name, columns: s.column_count, removable: true })),
    { id: NONE, name: "Additional Information", columns: 2, removable: false },
  ];

  const openNewField = (type: CustomFieldType, sectionId?: string) => {
    setEditing({ field_type: type, section_id: sectionId === NONE ? null : sectionId ?? null });
    setDialogOpen(true);
  };

  const handleSaveField = (payload: any) => {
    saveField.mutate(
      { ...payload, display_order: payload.display_order ?? fields.length },
      {
        onSuccess: () => {
          toast.success("Field saved");
          setDialogOpen(false);
        },
        onError: (e: any) => toast.error(e.message ?? "Could not save field"),
      },
    );
  };

  const handleSaveSection = () => {
    if (!sectionName.trim()) return;
    saveSection.mutate(
      {
        id: editingSectionId ?? undefined,
        name: sectionName.trim(),
        column_count: Number(sectionCols),
        display_order: sections.length,
      },
      {
        onSuccess: () => {
          toast.success("Section saved");
          setSectionDialog(false);
          setSectionName("");
          setEditingSectionId(null);
        },
        onError: (e: any) => toast.error(e.message ?? "Could not save section"),
      },
    );
  };

  const dropOnSection = (sectionId: string) => {
    if (!dragField) return;
    const target = sectionId === NONE ? null : sectionId;
    const f = fields.find((x) => x.id === dragField);
    setDragField(null);
    if (!f || f.section_id === target) return;
    reorder.mutate([{ id: f.id, section_id: target, display_order: (grouped.get(sectionId)?.length ?? 0) }], {
      onError: (e: any) => toast.error(e.message ?? "Could not move field"),
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custom Fields</h1>
          <p className="text-sm text-muted-foreground">
            Configure sections and fields for each object. Fields appear on record forms instantly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={objectKey} onValueChange={setObjectKey}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {CUSTOM_FIELD_OBJECTS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              setEditingSectionId(null);
              setSectionName("");
              setSectionCols("2");
              setSectionDialog(true);
            }}
          >
            <Icons.Plus className="mr-1 h-4 w-4" />
            New Section
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Field type palette */}
        <Card className="h-fit p-4 lg:sticky lg:top-4">
          <h3 className="mb-3 text-sm font-semibold">New Fields</h3>
          <div className="grid grid-cols-2 gap-2">
            {CUSTOM_FIELD_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => openNewField(t.type)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-2 text-left text-xs font-medium transition-colors hover:border-primary hover:bg-accent"
              >
                <TypeIcon name={t.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Click a field type to add it to {object.label}.
          </p>
        </Card>

        {/* Layout canvas */}
        <div className="space-y-4">
          {blocks.map((block) => {
            const list = grouped.get(block.id) ?? [];
            const section = sections.find((s) => s.id === block.id);
            return (
              <Card
                key={block.id}
                className="p-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOnSection(block.id)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icons.LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{block.name}</h3>
                    <Badge variant="secondary">{list.length}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openNewField("text", block.id)}>
                      <Icons.Plus className="h-4 w-4" />
                    </Button>
                    {block.removable && section && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingSectionId(section.id);
                            setSectionName(section.name);
                            setSectionCols(String(section.column_count));
                            setSectionDialog(true);
                          }}
                        >
                          <Icons.Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            deleteSection.mutate(section.id, {
                              onSuccess: () => toast.success("Section removed"),
                            })
                          }
                        >
                          <Icons.Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {list.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                    Drag fields here or click + to add
                  </div>
                ) : (
                  <div className={`grid gap-2 ${block.columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                    {list.map((f) => {
                      const meta = getFieldTypeMeta(f.field_type);
                      return (
                        <div
                          key={f.id}
                          draggable
                          onDragStart={() => setDragField(f.id)}
                          className="group flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                        >
                          <Icons.GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                          <TypeIcon name={meta.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {f.label}
                              {f.is_required && <span className="ml-1 text-destructive">*</span>}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {meta.label} · {f.column_name}
                            </p>
                          </div>
                          {!f.is_active && <Badge variant="outline">Hidden</Badge>}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditing(f);
                              setDialogOpen(true);
                            }}
                          >
                            <Icons.Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setPendingDelete(f)}
                          >
                            <Icons.Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <FieldPropertiesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={editing}
        sections={sections}
        onSave={handleSaveField}
        saving={saveField.isPending}
      />

      <Dialog open={sectionDialog} onOpenChange={setSectionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSectionId ? "Edit" : "New"} Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Section Name *</Label>
              <Input value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Columns</Label>
              <Select value={sectionCols} onValueChange={setSectionCols}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="1">Single column</SelectItem>
                  <SelectItem value="2">Two columns</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSection} disabled={!sectionName.trim() || saveSection.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the field and any data stored in it across all {object.label} records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                deleteField.mutate(
                  { id: pendingDelete.id, columnName: pendingDelete.column_name, dropColumn: true },
                  {
                    onSuccess: () => toast.success("Field deleted"),
                    onError: (e: any) => toast.error(e.message ?? "Could not delete field"),
                  },
                );
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}