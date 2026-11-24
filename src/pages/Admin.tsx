import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import {
  adminGroupsOf,
  matchesAdminSearch,
  visibleAdminLinks,
} from "@/lib/adminSections";

/**
 * Every admin page, on one screen.
 *
 * The sidebar's Admin group used to list these eleven-odd entries itself and
 * filled the sidebar doing it. It is one link now, and this is where they
 * live - grouped, so fourteen tiles read as five short lists, and searchable,
 * because the clinic asked to find a page by typing rather than by scanning.
 *
 * The list and the two helpers are in src/lib/adminSections.ts. This file is
 * presentation: what used to be wrong here was that it showed every tile to
 * everybody, while the sidebar filtered the same entries by permission. Now
 * both read one list through one filter.
 */
export default function Admin() {
  const { isAdmin, permissions } = useAuth();
  const [query, setQuery] = useState("");

  const mine = useMemo(() => visibleAdminLinks({ isAdmin, permissions }), [isAdmin, permissions]);
  const shown = useMemo(() => mine.filter((l) => matchesAdminSearch(l, query)), [mine, query]);
  const groups = adminGroupsOf(shown);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Configure organisation-wide data rules and object customisation.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search admin settings…"
          aria-label="Search admin settings"
          className="pl-9"
        />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {mine.length === 0
            ? "There are no admin pages you can open."
            : `No admin page matches “${query.trim()}”.`}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {shown
                .filter((s) => s.group === group)
                .map((s) => (
                  <Link key={s.url} to={s.url}>
                    <Card className="p-4 h-full flex items-start gap-3 hover:bg-muted/50 transition-colors">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <s.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center gap-1">
                          {s.title}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                    </Card>
                  </Link>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
