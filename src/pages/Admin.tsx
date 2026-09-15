import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ShieldCheck, SlidersHorizontal, ChevronRight, CopyCheck, Trash2, History, Coins, Users } from "lucide-react";

const sections = [
  {
    title: "Validation Rules",
    description: "Enforce data quality with branching criteria, error and alert messages.",
    url: "/validation-rules",
    icon: ShieldCheck,
  },
  {
    title: "Custom Fields",
    description: "Create sections and custom fields on any object with a drag-and-drop layout.",
    url: "/custom-fields",
    icon: SlidersHorizontal,
  },
  {
    title: "Duplicate Management",
    description: "Define duplicate matching rules, notification text and the actions users can take.",
    url: "/duplicate-management",
    icon: CopyCheck,
  },
  {
    title: "History Tracking",
    description: "Enable field history per object and choose up to 20 fields to track on every record.",
    url: "/admin/history-tracking",
    icon: History,
  },
  {
    title: "Currency & Billing",
    description: "Set decimals, decimal digits and Indian (Lakh/Crore) or US (K/M) number formatting.",
    url: "/admin/currency",
    icon: Coins,
  },
  {
    title: "User Management",
    description: "Create users, manage profiles and assign profiles. Admins only.",
    url: "/user-management",
    icon: Users,
  },
  {
    title: "Trash Policy & Audit",
    description: "Set how long deleted records are retained and review deletion activity for every user.",
    url: "/admin/trash",
    icon: Trash2,
  },
];


export default function Admin() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Configure organisation-wide data rules and object customisation.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
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
  );
}
