import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type ThemeType = "amber" | "blue-black" | "light-pink" | "forest-green" | "ocean-blue" | "purple" | "slate";

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "amber",
  setTheme: async () => {},
  loading: true,
});

export const useTheme = () => useContext(ThemeContext);

const THEME_STORAGE_KEY = "skin-clinic-theme";
const THEME_PENDING_KEY = "skin-clinic-theme-pending";
const THEME_MIGRATED_KEY = "skin-clinic-theme-migrated";

const themeVariables: Record<ThemeType, Record<string, string>> = {
  // All themes use a soft, light sidebar — no black surfaces.
  "amber": {
    "--sidebar-background": "34 40% 97%",
    "--sidebar-foreground": "28 18% 32%",
    "--sidebar-accent": "32 78% 94%",
    "--sidebar-accent-foreground": "26 78% 38%",
    "--sidebar-primary": "26 84% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-border": "32 30% 90%",
    "--sidebar-ring": "26 84% 48%",
    "--primary": "26 84% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "32 78% 94%",
    "--accent-foreground": "26 78% 34%",
    "--ring": "26 84% 48%",
    "--sidebar-header-bg": "linear-gradient(135deg, hsl(30 92% 55%) 0%, hsl(22 88% 46%) 100%)",
  },
  "blue-black": {
    "--sidebar-background": "180 30% 97%",
    "--sidebar-foreground": "195 18% 32%",
    "--sidebar-accent": "174 55% 92%",
    "--sidebar-accent-foreground": "174 70% 28%",
    "--sidebar-primary": "174 62% 38%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-border": "180 22% 90%",
    "--sidebar-ring": "174 62% 38%",
    "--primary": "174 62% 38%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "174 45% 92%",
    "--accent-foreground": "174 70% 26%",
    "--ring": "174 62% 38%",
    "--sidebar-header-bg": "linear-gradient(135deg, hsl(168 62% 45%) 0%, hsl(186 62% 34%) 100%)",
  },
  "light-pink": {
    "--sidebar-background": "340 45% 98%",
    "--sidebar-foreground": "330 14% 34%",
    "--sidebar-accent": "340 70% 94%",
    "--sidebar-accent-foreground": "336 60% 40%",
    "--sidebar-primary": "336 62% 52%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-border": "340 30% 92%",
    "--sidebar-ring": "336 62% 52%",
    "--primary": "336 62% 52%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "340 70% 94%",
    "--accent-foreground": "336 60% 38%",
    "--ring": "336 62% 52%",
    "--sidebar-header-bg": "linear-gradient(135deg, hsl(340 78% 68%) 0%, hsl(300 42% 52%) 100%)",
  },
  "forest-green": {
    "--sidebar-background": "140 28% 97%",
    "--sidebar-foreground": "150 14% 30%",
    "--sidebar-accent": "148 45% 92%",
    "--sidebar-accent-foreground": "152 55% 26%",
    "--sidebar-primary": "152 52% 32%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-border": "140 22% 90%",
    "--sidebar-ring": "152 52% 32%",
    "--primary": "152 52% 32%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "148 45% 92%",
    "--accent-foreground": "152 55% 24%",
    "--ring": "152 52% 32%",
    "--sidebar-header-bg": "linear-gradient(135deg, hsl(146 48% 46%) 0%, hsl(158 55% 28%) 100%)",
  },
  "ocean-blue": {
    "--sidebar-background": "205 40% 98%",
    "--sidebar-foreground": "210 16% 32%",
    "--sidebar-accent": "205 70% 93%",
    "--sidebar-accent-foreground": "208 65% 32%",
    "--sidebar-primary": "208 68% 42%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-border": "205 28% 91%",
    "--sidebar-ring": "208 68% 42%",
    "--primary": "208 68% 42%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "205 70% 93%",
    "--accent-foreground": "208 65% 30%",
    "--ring": "208 68% 42%",
    "--sidebar-header-bg": "linear-gradient(135deg, hsl(200 72% 52%) 0%, hsl(214 68% 38%) 100%)",
  },
  "purple": {
    "--sidebar-background": "280 35% 98%",
    "--sidebar-foreground": "275 14% 33%",
    "--sidebar-accent": "275 55% 94%",
    "--sidebar-accent-foreground": "272 52% 40%",
    "--sidebar-primary": "272 52% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-border": "280 25% 92%",
    "--sidebar-ring": "272 52% 48%",
    "--primary": "272 52% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "275 55% 94%",
    "--accent-foreground": "272 52% 38%",
    "--ring": "272 52% 48%",
    "--sidebar-header-bg": "linear-gradient(135deg, hsl(280 60% 62%) 0%, hsl(262 52% 44%) 100%)",
  },
  "slate": {
    "--sidebar-background": "215 25% 97%",
    "--sidebar-foreground": "215 16% 34%",
    "--sidebar-accent": "213 40% 93%",
    "--sidebar-accent-foreground": "215 42% 32%",
    "--sidebar-primary": "215 40% 40%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-border": "215 20% 90%",
    "--sidebar-ring": "215 40% 40%",
    "--primary": "215 40% 40%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "213 40% 93%",
    "--accent-foreground": "215 42% 30%",
    "--ring": "215 40% 40%",
    "--sidebar-header-bg": "linear-gradient(135deg, hsl(212 30% 55%) 0%, hsl(216 32% 36%) 100%)",
  },
};

const applyTheme = (themeType: ThemeType) => {
  const variables = themeVariables[themeType];
  Object.entries(variables).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
};

const isThemeType = (value: string | null): value is ThemeType =>
  value !== null && Object.prototype.hasOwnProperty.call(themeVariables, value);

const readStoredTheme = () => {
  if (typeof window === "undefined") return "amber" as ThemeType;
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeType(savedTheme) ? savedTheme : "amber";
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeType>(() => {
    const initialTheme = readStoredTheme();
    applyTheme(initialTheme);
    return initialTheme;
  });
  const [loading, setLoading] = useState(true);
  const { staffProfile, user, loading: authLoading } = useAuth();
  const loadedStaffIdRef = useRef<string | null>(null);
  const changedDuringLoadRef = useRef(false);

  useEffect(() => {
    const loadTheme = async () => {
      if (!user) {
        const storedTheme = readStoredTheme();
        setThemeState(storedTheme);
        applyTheme(storedTheme);
        setLoading(false);
        return;
      }

      // Auth can resolve before the staff profile. Wait rather than repainting
      // the theme while the staff lookup is still in progress.
      if (authLoading) return;
      if (!staffProfile) {
        const storedTheme = readStoredTheme();
        setThemeState(storedTheme);
        applyTheme(storedTheme);
        setLoading(false);
        return;
      }
      if (loadedStaffIdRef.current === staffProfile.id) return;

      loadedStaffIdRef.current = staffProfile.id;
      changedDuringLoadRef.current = false;
      setLoading(true);

      try {
        const { data, error } = await (supabase as any)
          .from("staff")
          .select("theme_preference")
          .eq("id", staffProfile.id)
          .maybeSingle();

        if (error) throw error;
        if (changedDuringLoadRef.current) return;

        const pendingTheme = localStorage.getItem(`${THEME_PENDING_KEY}:${staffProfile.id}`);
        const migrationKey = `${THEME_MIGRATED_KEY}:${staffProfile.id}`;
        const hasMigratedLegacyTheme = localStorage.getItem(migrationKey) === "true";
        const storedTheme = readStoredTheme();
        const databaseTheme = isThemeType(data?.theme_preference) ? data.theme_preference : null;

        if (isThemeType(pendingTheme)) {
          const { data: syncedRows, error: syncError } = await (supabase as any)
            .from("staff")
            .update({ theme_preference: pendingTheme })
            .eq("id", staffProfile.id)
            .select("id");

          if (!syncError && syncedRows?.length === 1) {
            localStorage.removeItem(`${THEME_PENDING_KEY}:${staffProfile.id}`);
          }
          if (!changedDuringLoadRef.current) {
            setThemeState(pendingTheme);
            applyTheme(pendingTheme);
            localStorage.setItem(THEME_STORAGE_KEY, pendingTheme);
          }
        } else if (!hasMigratedLegacyTheme && storedTheme !== "amber" && databaseTheme === "amber") {
          // Older versions could apply a theme locally while silently failing to
          // persist it. Migrate that existing choice once instead of allowing the
          // database default to erase it on the first load after this fix.
          const { data: migratedRows, error: migrationError } = await (supabase as any)
            .from("staff")
            .update({ theme_preference: storedTheme })
            .eq("id", staffProfile.id)
            .select("id");

          if (migrationError || migratedRows?.length !== 1) {
            localStorage.setItem(`${THEME_PENDING_KEY}:${staffProfile.id}`, storedTheme);
          } else {
            localStorage.setItem(migrationKey, "true");
          }
          if (!changedDuringLoadRef.current) {
            setThemeState(storedTheme);
            applyTheme(storedTheme);
          }
        } else if (databaseTheme) {
          setThemeState(databaseTheme);
          applyTheme(databaseTheme);
          localStorage.setItem(THEME_STORAGE_KEY, databaseTheme);
          localStorage.setItem(migrationKey, "true");
        }
      } catch (error) {
        console.warn("Failed to load theme from database:", error);
        if (!changedDuringLoadRef.current) {
          const storedTheme = readStoredTheme();
          setThemeState(storedTheme);
          applyTheme(storedTheme);
        }
      } finally {
        setLoading(false);
      }
    };

    loadTheme();
  }, [user, staffProfile, authLoading]);

  const setTheme = async (newTheme: ThemeType) => {
    changedDuringLoadRef.current = true;
    setThemeState(newTheme);
    applyTheme(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);

    if (!staffProfile) {
      toast.success(`Theme changed to ${newTheme.replace('-', ' ')}`);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from("staff")
        .update({ theme_preference: newTheme })
        .eq("id", staffProfile.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length !== 1) throw new Error("Your staff profile could not be updated.");

      localStorage.removeItem(`${THEME_PENDING_KEY}:${staffProfile.id}`);
      localStorage.setItem(`${THEME_MIGRATED_KEY}:${staffProfile.id}`, "true");
      toast.success(`Theme saved as ${newTheme.replace('-', ' ')}`);
    } catch (error) {
      console.warn("Theme is applied locally but could not be saved to the profile:", error);
      localStorage.setItem(`${THEME_PENDING_KEY}:${staffProfile.id}`, newTheme);
      toast.warning("Theme applied on this device. We'll retry saving it to your profile next time.");
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}
