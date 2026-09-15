import { useTheme, ThemeType } from "@/hooks/useTheme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const THEME_OPTIONS: {
  id: ThemeType;
  name: string;
  description: string;
  swatches: string[];
}[] = [
  { id: "amber", name: "Warm Amber", description: "Soft ivory sidebar, amber accents", swatches: ["#fbf7f2", "#fdebd6", "#e07b1f", "#b95a10"] },
  { id: "blue-black", name: "Clinic Teal", description: "Cool mint sidebar, teal accents", swatches: ["#f4faf9", "#d5f0ea", "#25a08c", "#1d7c74"] },
  { id: "light-pink", name: "Blush Rose", description: "Soft blush sidebar, rose accents", swatches: ["#fdf5f8", "#fadfe9", "#d1497f", "#a83a76"] },
  { id: "forest-green", name: "Forest", description: "Pale sage sidebar, green accents", swatches: ["#f5faf6", "#dcf0e4", "#2b7d54", "#1f6045"] },
  { id: "ocean-blue", name: "Ocean", description: "Airy blue sidebar, deep blue accents", swatches: ["#f6fafd", "#dbeefb", "#2374b5", "#1a5a92"] },
  { id: "purple", name: "Lavender", description: "Light lilac sidebar, violet accents", swatches: ["#faf7fd", "#ece0f8", "#7a45ba", "#5f3a94"] },
  { id: "slate", name: "Slate", description: "Neutral grey sidebar, steel accents", swatches: ["#f6f8fa", "#e2e9f1", "#476085", "#33455f"] },
];

export function ThemePicker() {
  const { theme, setTheme, loading } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Colour Theme</CardTitle>
        <CardDescription>
          Choose your preferred colour theme. It is saved to your profile and applies every time you sign in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_OPTIONS.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={loading}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "group relative rounded-xl border p-4 text-left transition-all hover:shadow-md",
                  active ? "border-primary ring-2 ring-primary/30" : "border-border"
                )}
              >
                {active && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div className="flex gap-1.5">
                  {t.swatches.map((c) => (
                    <span
                      key={c}
                      className="h-8 w-8 rounded-md border border-border"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="mt-3 text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
