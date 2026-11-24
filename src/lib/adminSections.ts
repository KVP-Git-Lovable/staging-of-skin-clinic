import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Coins,
  CopyCheck,
  History,
  ImageIcon,
  MessageSquareWarning,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { canViewModule } from "@/lib/staffAccess";

/**
 * Every admin page, in one list.
 *
 * The sidebar and Admin Home each used to keep their own array of these, and
 * they had drifted apart: the sidebar offered Feedback and Attendance, which
 * Admin Home had never heard of, while Admin Home offered Knowledge Articles,
 * Photo Fingerprints and Visits to Review, which the sidebar did not. Nobody
 * did that on purpose - it is what two hand-maintained copies of a list do.
 *
 * So the sidebar's Admin group is now one entry pointing at Admin Home, and
 * this is the list behind both of them. Adding an admin page means adding it
 * here, once.
 *
 * ── The moduleKey matters ──
 *
 * Each entry carries the key its own route guards with in src/App.tsx, not a
 * blanket "settings". Admin Home never filtered its tiles at all, which was
 * harmless while the sidebar was the way in and did filter; now that the
 * tiles ARE the way in, a tile nobody can open would be the only thing the
 * clinic sees. A test asserts each key here still matches that route.
 */

export const ADMIN_GROUPS = [
  "Data & customisation",
  "Clinic settings",
  "Knowledge",
  "People",
  "Records & retention",
] as const;

export type AdminGroup = (typeof ADMIN_GROUPS)[number];

export type AdminLink = {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
  group: AdminGroup;
  /** The key its route in App.tsx guards with. */
  moduleKey?: string;
  /** Guarded by AdminRoute rather than ProtectedRoute. */
  adminOnly?: boolean;
};

export const ADMIN_LINKS: AdminLink[] = [
  {
    title: "Validation Rules",
    description: "Enforce data quality with branching criteria, error and alert messages.",
    url: "/validation-rules",
    icon: ShieldCheck,
    group: "Data & customisation",
    moduleKey: "settings",
  },
  {
    title: "Custom Fields",
    description: "Create sections and custom fields on any object with a drag-and-drop layout.",
    url: "/custom-fields",
    icon: SlidersHorizontal,
    group: "Data & customisation",
    moduleKey: "settings",
  },
  {
    title: "Duplicate Management",
    description: "Define duplicate matching rules, notification text and the actions users can take.",
    url: "/duplicate-management",
    icon: CopyCheck,
    group: "Data & customisation",
    moduleKey: "settings",
  },
  {
    title: "History Tracking",
    description: "Enable field history per object and choose up to 20 fields to track on every record.",
    url: "/admin/history-tracking",
    icon: History,
    group: "Data & customisation",
    moduleKey: "settings",
  },
  {
    title: "Currency & Billing",
    description: "Set decimals, decimal digits and Indian (Lakh/Crore) or US (K/M) number formatting.",
    url: "/admin/currency",
    icon: Coins,
    group: "Clinic settings",
    moduleKey: "settings",
  },
  {
    title: "Patient Portal Configuration",
    description:
      "Switch on and off what patients see in the portal — bills, photos, history, shop, surveys, feedback — and configure the surveys.",
    url: "/admin/portal-modules",
    icon: Smartphone,
    group: "Clinic settings",
    moduleKey: "settings",
  },
  {
    title: "Feedback",
    description: "Set how low a score has to be before a case opens, and what the root cause analysis asks.",
    url: "/admin/feedback",
    icon: MessageSquareWarning,
    group: "Clinic settings",
    moduleKey: "settings",
  },
  {
    title: "Knowledge Articles",
    description: "Clinical protocols, reviewed and versioned, that staff read against a service.",
    url: "/knowledge",
    icon: BookOpen,
    group: "Knowledge",
    moduleKey: "services",
  },
  {
    title: "Knowledge Article Categories",
    description: "Create, edit, order and activate the categories used for service knowledge articles.",
    url: "/admin/knowledge-categories",
    icon: BookOpen,
    group: "Knowledge",
    moduleKey: "settings",
  },
  {
    title: "User Management",
    description: "Create users, manage profiles and assign profiles. Admins only.",
    url: "/user-management",
    icon: Users,
    group: "People",
    adminOnly: true,
  },
  {
    title: "Attendance",
    description: "The whole clinic's attendance, the policy behind it, week offs and holidays.",
    url: "/admin/attendance",
    icon: CalendarCheck,
    group: "People",
    moduleKey: "attendance_admin",
  },
  {
    title: "Photo Fingerprints",
    description: "Let Photos search find a patient from a copy of a photo already on their record.",
    url: "/admin/photo-fingerprints",
    icon: ImageIcon,
    group: "Records & retention",
    moduleKey: "settings",
  },
  {
    title: "Visits to Review",
    description: "Past visits marked Completed with no bill and no procedure recorded against them.",
    url: "/admin/visits-to-review",
    icon: ClipboardList,
    group: "Records & retention",
    moduleKey: "settings",
  },
  {
    title: "Trash Policy & Audit",
    description: "Set how long deleted records are retained and review deletion activity for every user.",
    url: "/admin/trash",
    icon: Trash2,
    group: "Records & retention",
    moduleKey: "settings",
  },
];

/** The icon beside an empty search, kept here so the page imports one place. */
export const ADMIN_EMPTY_ICON = AlertTriangle;

/**
 * The admin pages this person may actually open.
 *
 * Through canViewModule, the same function ProtectedRoute and the sidebar
 * ask, so a tile can never offer a page that then refuses - or hide one that
 * would have opened.
 */
export function visibleAdminLinks(input: {
  isAdmin: boolean;
  permissions: Record<string, { can_view?: boolean } | undefined>;
}): AdminLink[] {
  return ADMIN_LINKS.filter((link) =>
    link.adminOnly
      ? input.isAdmin
      : !!link.moduleKey && canViewModule({ ...input, moduleKey: link.moduleKey }),
  );
}

/**
 * Whether a link answers what was typed.
 *
 * Description as well as title, because somebody looking for week offs is
 * typing "holiday", not "Attendance". A blank box matches everything.
 */
export function matchesAdminSearch(link: AdminLink, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${link.title} ${link.description}`.toLowerCase().includes(q);
}

/** The groups that still have something in them, in ADMIN_GROUPS order. */
export function adminGroupsOf(links: AdminLink[]): AdminGroup[] {
  return ADMIN_GROUPS.filter((g) => links.some((l) => l.group === g));
}
