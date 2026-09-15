import { useTheme, ThemeType } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Palette, Sun, Moon } from "lucide-react";

const themes = [
  {
    id: "amber",
    name: "Amber",
    description: "Warm golden theme",
    icon: "🟠",
  },
  {
    id: "blue-black",
    name: "Blue & Black",
    description: "Cool teal theme",
    icon: "🔵",
  },
  {
    id: "light-pink",
    name: "Light Pink",
    description: "Soft rose theme",
    icon: "🩷",
  },
  {
    id: "forest-green",
    name: "Forest Green",
    description: "Natural green theme",
    icon: "🟢",
  },
  {
    id: "ocean-blue",
    name: "Ocean Blue",
    description: "Professional blue theme",
    icon: "🌊",
  },
  {
    id: "purple",
    name: "Purple",
    description: "Modern purple theme",
    icon: "💜",
  },
  {
    id: "slate",
    name: "Slate",
    description: "Sleek dark theme",
    icon: "⚫",
  },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:h-9 md:w-9"
                title="Change theme"
              >
                <Palette className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Themes
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-sm font-semibold">
          Select Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {themes.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id as ThemeType)}
            className="flex items-center gap-3 cursor-pointer"
          >
            <span className="text-lg">{t.icon}</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.description}</div>
            </div>
            {theme === t.id && (
              <div className="h-2 w-2 rounded-full bg-primary ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
