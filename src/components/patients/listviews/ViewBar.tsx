// Thin wrapper over the generic src/components/listViews/ViewBar.tsx -
// preserves the exact original Patients behavior (itemLabel "Patients",
// all four display modes offered) so nothing else in the Patients page
// needs to change.
import GenericViewBar from "@/components/listViews/ViewBar";
import type { ListDisplayMode, ListView } from "@/lib/patientFields";

interface Props {
  views: ListView[];
  activeView: ListView | null;
  currentUserId?: string;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  onEdit: (v: ListView) => void;
  onDelete: (v: ListView) => void;
  onPin: (v: ListView | null) => void;
  onClone: (v: ListView) => void;
  onFields: () => void;
  onRefresh: () => void;
  display: ListDisplayMode;
  onDisplayChange: (d: ListDisplayMode) => void;
  onKanbanSettings: () => void;
  count: number;
  search: string;
  onSearchChange: (v: string) => void;
  chartsOpen?: boolean;
  onToggleCharts?: () => void;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
}

export default function ViewBar(props: Props) {
  return <GenericViewBar {...props} itemLabel="Patients" />;
}
