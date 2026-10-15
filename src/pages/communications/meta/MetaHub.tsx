import { useNavigate } from "react-router-dom";
import { Activity, Megaphone, Newspaper } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BackButton } from "@/components/shared/BackButton";
import { useAuth } from "@/hooks/useAuth";
import metaLogo from "@/assets/logos/Meta-Logo.png";
import facebookLogo from "@/assets/logos/Facebook-Logo.png";
import instagramLogo from "@/assets/logos/Instagram-logo.png";

// Entry points, in the order they must appear. Each is shown only when the
// signed-in role can view the target page (same rule as the sidebar).
const cards = [
  {
    title: "Meta Organic Posts",
    description: "Compose, schedule and publish posts to your Facebook Page and Instagram account.",
    icon: Newspaper,
    href: "/communications/meta/organic",
    moduleKey: "meta",
  },
  {
    title: "Meta Advertisements",
    description: "Create and manage paid campaigns, ad sets and ads, and keep the ads account topped up.",
    icon: Megaphone,
    href: "/communications/meta/marketing",
    moduleKey: "meta",
  },
  {
    title: "Meta Diagnostics",
    description: "Check the health of the Meta connection, tokens, permissions and recent API calls.",
    icon: Activity,
    href: "/communications/meta/diagnostics",
    moduleKey: "meta",
  },
];

const logos = [
  { src: metaLogo, alt: "Meta" },
  { src: facebookLogo, alt: "Facebook" },
  { src: instagramLogo, alt: "Instagram" },
];

export default function MetaHub() {
  const navigate = useNavigate();
  const { isAdmin, permissions } = useAuth();
  // Same rule as ProtectedRoute: admins, roles with view access, or no permissions loaded at all.
  const canView = (key: string) => isAdmin || Object.keys(permissions).length === 0 || !!permissions[key]?.can_view;
  const visible = cards.filter((c) => canView(c.moduleKey));

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Meta</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Run your Facebook and Instagram presence from one place: publish organic posts, manage paid
            advertising, and check the health of your Meta connection. Use Meta Connection to link or
            change the account these pages work with.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0" aria-label="Meta, Facebook and Instagram">
          {logos.map((l) => (
            <img key={l.alt} src={l.src} alt={l.alt} className="h-10 w-auto max-w-[72px] object-contain" />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Meta pages are enabled for your role.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visible.map((card) => (
            <Card
              key={card.title}
              role="button"
              tabIndex={0}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(card.href)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(card.href); } }}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <card.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{card.title}</CardTitle>
                    <CardDescription className="text-xs mt-1">{card.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
