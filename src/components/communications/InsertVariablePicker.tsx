import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VARIABLE_GROUPS } from "@/lib/comms/templateVariables";

export function InsertVariablePicker({ onPick }: { onPick: (name: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" /> Insert Variable
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        {VARIABLE_GROUPS.map((group, i) => (
          <div key={group.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.variables.map((v) => (
                <DropdownMenuItem key={v.name} onSelect={() => onPick(v.name)}>
                  <span className="flex-1">{v.label}</span>
                  <code className="text-xs text-muted-foreground">{v.name}</code>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
