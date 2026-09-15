import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface ViewSelectorProps {
  views: any[];
  selectedViewId: string | null;
  onSelectView: (viewId: string | null) => void;
  onCreateView: () => void;
  onDeleteView: (viewId: string) => void;
  currentViewName?: string;
}

export function ViewSelector({
  views,
  selectedViewId,
  onSelectView,
  onCreateView,
  onDeleteView,
  currentViewName,
}: ViewSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {currentViewName || "All Items"}
          <Badge variant="secondary" className="ml-1">
            {views.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          SAVED VIEWS
        </DropdownMenuLabel>

        {views.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">No saved views yet</div>
        ) : (
          <>
            {/* Reset to all items */}
            <DropdownMenuItem
              onClick={() => onSelectView(null)}
              className={selectedViewId === null ? "bg-accent" : ""}
            >
              <span className="font-medium">All Items</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Saved views */}
            {views.map((view: any) => (
              <div
                key={view.id}
                className={`flex items-center justify-between px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer group ${
                  selectedViewId === view.id ? "bg-accent" : ""
                }`}
                onClick={() => onSelectView(view.id)}
              >
                <span className="flex-1">{view.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteView(view.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </>
        )}

        <DropdownMenuSeparator />

        {/* Create new view */}
        <DropdownMenuItem onClick={onCreateView} className="gap-2">
          <Plus className="h-4 w-4" />
          <span>Create New View</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
