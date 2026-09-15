import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2, ChevronRight, ChevronLeft, ChevronUp, ChevronDown } from "lucide-react";
import { ListViewConfig, Filter } from "@/hooks/useListViews";

interface NewListViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: "appointments" | "procedures" | "patients" | "billing";
  availableFields: { value: string; label: string }[];
  defaultFields: string[];
  onCreate: (config: ListViewConfig) => Promise<void>;
  isLoading?: boolean;
  teamMembers?: { id: string; name: string }[];
  fieldOptions?: Record<string, { value: string; label: string }[]>;
}

export function NewListViewDialog({
  open,
  onOpenChange,
  section,
  availableFields,
  defaultFields,
  onCreate,
  isLoading = false,
  teamMembers = [],
  fieldOptions = {},
}: NewListViewDialogProps) {
  const [viewName, setViewName] = useState("");
  const [displayFields, setDisplayFields] = useState<string[]>(defaultFields);
  const [sortBy, setSortBy] = useState(availableFields[0]?.value || "");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filterLogic, setFilterLogic] = useState<"all" | "any">("all");
  const [sharingMode, setSharingMode] = useState<"only_me" | "all_users" | "selected_team">("only_me");
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setViewName("");
      setDisplayFields(defaultFields);
      setSortBy(availableFields[0]?.value || "");
      setSortDirection("desc");
      setFilters([]);
      setFilterLogic("all");
      setSharingMode("only_me");
      setSelectedTeamMembers([]);
    }
  }, [open, defaultFields, availableFields]);

  const availableFieldOptions = availableFields.filter((f) => !displayFields.includes(f.value));
  const visibleFieldOptions = displayFields.map((f) =>
    availableFields.find((af) => af.value === f)
  ).filter(Boolean) as { value: string; label: string }[];

  const handleCreateView = async () => {
    if (!viewName.trim()) {
      alert("Please enter a view name");
      return;
    }

    if (displayFields.length === 0) {
      alert("Please select at least one field to display");
      return;
    }

    await onCreate({
      name: viewName,
      section,
      filters,
      displayFields,
      sortBy,
      sortDirection,
      isShared: sharingMode !== "only_me",
    });

    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setViewName("");
    setDisplayFields(defaultFields);
    setSortBy(availableFields[0]?.value || "");
    setSortDirection("desc");
    setFilters([]);
    setFilterLogic("all");
    setSharingMode("only_me");
  };

  const addFilter = () => {
    setFilters([...filters, { field: availableFields[0]?.value || "", operator: "equals", value: "" }]);
  };

  const updateFilter = (idx: number, field: keyof Filter, value: any) => {
    const newFilters = [...filters];
    newFilters[idx] = { ...newFilters[idx], [field]: value };
    setFilters(newFilters);
    // Clear search when changing field
    if (field === "field") {
      setFilterSearch("");
    }
  };

  const deleteFilter = (idx: number) => {
    setFilters(filters.filter((_, i) => i !== idx));
  };

  const [filterSearch, setFilterSearch] = useState("");

  const getFilteredOptions = (options: { value: string; label: string }[]) => {
    if (!filterSearch) return options;
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(filterSearch.toLowerCase())
    );
  };

  const moveFieldToVisible = (field: string) => {
    setDisplayFields([...displayFields, field]);
  };

  const moveFieldToAvailable = (field: string) => {
    setDisplayFields(displayFields.filter((f) => f !== field));
  };

  const moveFieldUp = (index: number) => {
    if (index > 0) {
      const newFields = [...displayFields];
      [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
      setDisplayFields(newFields);
    }
  };

  const moveFieldDown = (index: number) => {
    if (index < displayFields.length - 1) {
      const newFields = [...displayFields];
      [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
      setDisplayFields(newFields);
    }
  };

  const getOperatorLabel = (op: string) => {
    const labels: Record<string, string> = {
      equals: "equals",
      contains: "contains",
      starts_with: "starts with",
      ends_with: "ends with",
      greater_than: "greater than",
      less_than: "less than",
      is_empty: "is empty",
      is_not_empty: "is not empty",
      is_one_of: "is one of (multi-select)",
    };
    return labels[op] || op;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New List View</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* View Name */}
          <div>
            <Label htmlFor="view-name" className="text-sm font-medium">
              View Name *
            </Label>
            <Input
              id="view-name"
              placeholder="e.g. My Open Requisitions"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Filters - Inline */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">⚙ Filters</span>
              <div className="flex items-center gap-2">
                <Select value={filterLogic} onValueChange={(v) => setFilterLogic(v as "all" | "any")}>
                  <SelectTrigger className="w-48 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Match ALL filters</SelectItem>
                    <SelectItem value="any">Match ANY filter</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={addFilter}
                >
                  + Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {filters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No filters — this view shows all records.</p>
              ) : (
                filters.map((filter, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={filter.field} onValueChange={(v) => updateFilter(idx, "field", v)}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filter.operator} onValueChange={(v) => updateFilter(idx, "operator", v)}>
                      <SelectTrigger className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">equals</SelectItem>
                        <SelectItem value="is_one_of">is one of (multi-select)</SelectItem>
                        <SelectItem value="contains">contains</SelectItem>
                        <SelectItem value="starts_with">starts with</SelectItem>
                        <SelectItem value="ends_with">ends with</SelectItem>
                        <SelectItem value="greater_than">greater than</SelectItem>
                        <SelectItem value="less_than">less than</SelectItem>
                        <SelectItem value="is_empty">is empty</SelectItem>
                        <SelectItem value="is_not_empty">is not empty</SelectItem>
                      </SelectContent>
                    </Select>

                    {filter.operator !== "is_empty" && filter.operator !== "is_not_empty" && (
                      filter.operator === "is_one_of" ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Input
                              placeholder="Select one or more..."
                              value={Array.isArray(filter.value) ? filter.value.join(", ") : ""}
                              readOnly
                              className="flex-1 cursor-pointer"
                            />
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Select values:</p>
                              <Input
                                placeholder="Search..."
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                className="mb-2 h-8 text-sm"
                              />
                              {getFilteredOptions(fieldOptions[filter.field] || []).map((option) => (
                                <div key={option.value} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`${idx}-${option.value}`}
                                    checked={Array.isArray(filter.value) && filter.value.includes(option.value)}
                                    onCheckedChange={(checked) => {
                                      const currentValues = Array.isArray(filter.value) ? filter.value : [];
                                      if (checked) {
                                        updateFilter(idx, "value", [...currentValues, option.value]);
                                      } else {
                                        updateFilter(idx, "value", currentValues.filter((v: string) => v !== option.value));
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`${idx}-${option.value}`} className="text-sm cursor-pointer">{option.label}</Label>
                                </div>
                              ))}
                              {(!fieldOptions[filter.field] || fieldOptions[filter.field].length === 0) && (
                                <p className="text-xs text-muted-foreground italic">No options available for this field</p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <Input
                          placeholder="Enter value"
                          value={Array.isArray(filter.value) ? filter.value.join(", ") : filter.value}
                          onChange={(e) => updateFilter(idx, "value", e.target.value)}
                          className="flex-1"
                        />
                      )
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => deleteFilter(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Display Fields - Dual Panel */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Display Fields</Label>
            <div className="grid grid-cols-3 gap-4">
              {/* Available Fields */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Available Fields</p>
                <div className="border rounded-lg bg-white p-3 min-h-[280px] space-y-1 overflow-y-auto">
                  {availableFieldOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">All fields are visible</p>
                  ) : (
                    availableFieldOptions.map((field) => (
                      <div
                        key={field.value}
                        onClick={() => moveFieldToVisible(field.value)}
                        className="flex items-center justify-between p-2.5 hover:bg-muted/50 rounded cursor-pointer group text-sm transition-colors"
                      >
                        <span>{field.label}</span>
                        <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chevron Buttons */}
              <div className="flex flex-col items-center justify-center gap-2">
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-lg bg-primary hover:bg-primary/90 text-white"
                  onClick={() => {
                    const firstAvailable = availableFieldOptions[0]?.value;
                    if (firstAvailable) moveFieldToVisible(firstAvailable);
                  }}
                  disabled={availableFieldOptions.length === 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-lg bg-primary hover:bg-primary/90 text-white"
                  onClick={() => {
                    const lastVisible = displayFields[displayFields.length - 1];
                    if (lastVisible) moveFieldToAvailable(lastVisible);
                  }}
                  disabled={visibleFieldOptions.length === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>

              {/* Visible Fields */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Visible Fields (In Order)</p>
                <div className="border rounded-lg bg-white p-3 min-h-[280px] space-y-1 overflow-y-auto">
                  {visibleFieldOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Select fields to display</p>
                  ) : (
                    visibleFieldOptions.map((field, idx) => (
                      <div
                        key={field?.value}
                        className="flex items-center justify-between p-2.5 bg-muted/30 rounded border text-sm"
                      >
                        <span className="flex-1">{field?.label}</span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0"
                            disabled={idx === 0}
                            onClick={() => moveFieldUp(idx)}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0"
                            disabled={idx === visibleFieldOptions.length - 1}
                            onClick={() => moveFieldDown(idx)}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sort Options */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sort-by" className="text-sm font-medium">
                Sort by
              </Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort-by" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sort-direction" className="text-sm font-medium">
                Direction
              </Label>
              <Select value={sortDirection} onValueChange={(v) => setSortDirection(v as "asc" | "desc")}>
                <SelectTrigger id="sort-direction" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sharing */}
          <div>
            <Label className="text-sm font-medium mb-3 block">👥 Sharing</Label>
            <Select value={sharingMode} onValueChange={(v) => setSharingMode(v as "only_me" | "all_users" | "selected_team")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="only_me">Only me</SelectItem>
                <SelectItem value="all_users">All users</SelectItem>
                <SelectItem value="selected_team">Selected team members</SelectItem>
              </SelectContent>
            </Select>

            {sharingMode === "selected_team" && (
              <div className="mt-3 p-3 border rounded-lg bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground mb-3">Select team members to share with:</p>
                <div className="space-y-2">
                  {teamMembers.length > 0 ? (
                    teamMembers.map((member) => (
                      <div key={member.id} className="flex items-center gap-2">
                        <Checkbox
                          id={member.id}
                          checked={selectedTeamMembers.includes(member.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTeamMembers([...selectedTeamMembers, member.id]);
                            } else {
                              setSelectedTeamMembers(selectedTeamMembers.filter((m) => m !== member.id));
                            }
                          }}
                        />
                        <Label htmlFor={member.id} className="text-sm cursor-pointer">{member.name}</Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No team members available</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleCreateView} disabled={isLoading} className="gap-2 min-w-[120px]">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create View
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
