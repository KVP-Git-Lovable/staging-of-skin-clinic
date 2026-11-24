import {
  LayoutDashboard,
  Users,
  Calendar,
  Stethoscope,
  Receipt,
  BarChart3,
  Settings,
  ClipboardList,
  Pill,
  Camera,
  CalendarDays,
  Package,
  FileBarChart,
  ShoppingBag,
  Wallet,
  UserCog,
  AlertCircle,
  ClipboardCheck,
  Building2,
  Tags,
  Percent,
  ChevronDown,
  FileText,
  ListChecks,
  ShieldCheck,
  Megaphone,
  Trash2,
  MessageCircle,
  Phone,
  Mail,
  Target,
  Workflow,
  Share2,
  Link2,
  Sparkles,
  BookOpen,
  CalendarCheck,
  AlertTriangle,
  MessageSquareHeart,
  MoreHorizontal,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import skinClinicLogo from "@/assets/skin-clinic-logo.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { canViewModule } from "@/lib/staffAccess";
import { ADMIN_LINKS, visibleAdminLinks } from "@/lib/adminSections";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, moduleKey: "dashboard" },
  { title: "Patients", url: "/patients", icon: Users, moduleKey: "patients" },
  { title: "Appointments", url: "/appointments", icon: Calendar, moduleKey: "appointments" },
  { title: "Prescriptions", url: "/procedures", icon: ClipboardList, moduleKey: "procedures" },
  { title: "Billing", url: "/billing", icon: Receipt, moduleKey: "billing" },
  { title: "Pharmacy", url: "/pharma", icon: Pill, moduleKey: "pharmacy" },
  { title: "Photos", url: "/photos", icon: Camera, moduleKey: "photos" },
  { title: "Assets", url: "/assets", icon: Package, moduleKey: "assets" },
  { title: "Reports", url: "/reports", icon: BarChart3, moduleKey: "reports" },
  { title: "Leads", url: "/leads", icon: Target, moduleKey: "leads" },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone, moduleKey: "campaigns" },
  { title: "WhatsApp Delivery", url: "/whatsapp-log", icon: MessageCircle, moduleKey: "campaigns" },
];

// Journey Builder, Meta and Meta Connection join this list when their pages land; until then a
// link here would only lead to a 404.
const communicationsItems = [
  { title: "WhatsApp", url: "/communications/whatsapp", icon: MessageCircle },
  { title: "Voice", url: "/communications/voice", icon: Phone },
  { title: "Email", url: "/communications/email", icon: Mail },
  { title: "Journey Builder", url: "/communications/journeys", icon: Workflow },
  { title: "Calendar", url: "/communications/calendar", icon: CalendarDays },
  { title: "Meta", url: "/communications/meta", icon: Share2 },
  { title: "Meta Connection", url: "/communications/meta/connection", icon: Link2 },
  { title: "Agentic Marketing", url: "/communications/agentic-marketing", icon: Sparkles },
];

const employeesSubItems = [
  { title: "Staff", url: "/staff", icon: UserCog, moduleKey: "staff" },
  { title: "My Attendance", url: "/attendance", icon: CalendarCheck, moduleKey: "attendance" },
  { title: "Leave", url: "/leave", icon: CalendarDays, moduleKey: "leave" },
];

/**
 * The occasional pages, out of the daily run.
 *
 * Each keeps the moduleKey it carried in the main list, so who can see what is
 * exactly as it was - this group moves where they sit, not who they are for.
 */
const othersItems = [
  { title: "Dashboards", url: "/dashboards", icon: LayoutDashboard, moduleKey: "dashboards" },
  { title: "Report Builder", url: "/report-builder", icon: FileBarChart, moduleKey: "report_builder" },
  { title: "Portal Orders", url: "/orders", icon: ShoppingBag, moduleKey: "portal_orders" },
  { title: "Expenses", url: "/expenses", icon: Wallet, moduleKey: "expenses" },
];

/**
 * It sits below WhatsApp Delivery, where the clinic looks for it.
 *
 * All Feedbacks comes first: it is where every score is read, and the cases
 * below it are what some of those scores turn into.
 */
const feedbackItems = [
  { title: "All Feedbacks", url: "/all-feedbacks", icon: MessageSquareHeart, moduleKey: "feedback_rca" },
  { title: "Root Cause Analysis", url: "/feedback-rca", icon: AlertTriangle, moduleKey: "feedback_rca" },
];

/**
 * Master Data, with the two survey pages folded into one entry.
 *
 * Eight lines read as congestion, and Survey Templates and All Surveys are one
 * subject sharing one permission key. The parent opens a group rather than a
 * page: there is no /surveys index route, and /surveys/* already belongs to the
 * survey RESPONSE pages, so a url here would 404 and then light the entry up on
 * every /surveys/:id.
 *
 * The parent keeps moduleKey "surveys" - the key both children carried - because
 * canView hides any entry without one. Who sees this is exactly who saw the two
 * entries before. The children need no key of their own: nothing reaches them
 * except through a parent already asking the same question.
 */
const masterDataItems = [
  { title: "Service Master", url: "/services", icon: Stethoscope, moduleKey: "services" },
  { title: "Knowledge Articles", url: "/knowledge", icon: BookOpen, moduleKey: "services" },
  { title: "Vendor Master", url: "/vendors", icon: Building2, moduleKey: "vendors" },
  { title: "Category Master", url: "/category-master", icon: Tags, moduleKey: "category_master" },
  { title: "Tax Master", url: "/tax-master", icon: Percent, moduleKey: "settings" },
  { title: "Primary Concern", url: "/problem-areas", icon: AlertCircle, moduleKey: "problem_areas" },
  {
    title: "Surveys",
    icon: ClipboardCheck,
    moduleKey: "surveys",
    children: [
      { title: "Survey Templates", url: "/survey-templates", icon: FileText },
      { title: "All Surveys", url: "/all-surveys", icon: ListChecks },
    ],
  },
] as {
  title: string;
  url?: string;
  icon: typeof Users;
  moduleKey?: string;
  children?: { title: string; url: string; icon: typeof Users }[];
}[];

const settingsItems = [
  // Trash had no moduleKey and no route guard, so it was on everybody's menu.
  // Its own key rather than "settings": doctors can reach Trash today and must
  // keep it, and they have no settings permission.
  { title: "Trash", url: "/trash", icon: Trash2, moduleKey: "trash" },
  { title: "Settings", url: "/settings", icon: Settings, moduleKey: "settings" },
];

/**
 * The Admin group is one link now.
 *
 * It used to list eleven sub-items, which filled the sidebar and pushed Trash
 * and Settings off the bottom. They live on Admin Home instead, drawn from
 * ADMIN_LINKS in src/lib/adminSections.ts - one list, so the menu and that
 * page can no longer drift apart the way they had.
 *
 * ── Why it is not simply a link ──
 *
 * /admin is guarded by moduleKey="settings", so Admin Home can only serve
 * somebody who holds that key. A role given attendance_admin WITHOUT settings
 * can open /admin/attendance but not /admin, and collapsing the group blindly
 * would strand them. So: with settings, one Admin link; without it, the old
 * collapsible carrying only what they can still reach, and no Admin Home
 * entry, because that page would refuse them. Nobody is in that state on the
 * live clinic today - only the Admin role holds either key - but one tick in
 * User Management creates it.
 */

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const { isAdmin, permissions } = useAuth();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [currentPath, isMobile, setOpenMobile]);

  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  // The same answer the route guard gives, from the same function, so the menu
  // can never offer a page that then refuses to open - or hide one that would.
  const canView = (moduleKey?: string) =>
    !!moduleKey && canViewModule({ isAdmin, permissions, moduleKey });

  const filteredMain = mainItems.filter((i) => canView(i.moduleKey));
  // The Communications Center renders between "Dashboards" and "Campaigns", which one .map()
  // cannot express - so the list is drawn in two slices with the group in between. The split is
  // found on the filtered list, not mainItems, so it stays put if canView ever starts hiding
  // things. A missing Campaigns entry puts the group at the end rather than losing it.
  const campaignsAt = filteredMain.findIndex((i) => i.url === "/campaigns");
  const commsSplitAt = campaignsAt === -1 ? filteredMain.length : campaignsAt;
  const filteredMainBeforeComms = filteredMain.slice(0, commsSplitAt);
  const filteredMainAfterComms = filteredMain.slice(commsSplitAt);
  const showCommunications = canView("communications");
  const communicationsPaths = communicationsItems.map((i) => i.url);
  const filteredMaster = masterDataItems.filter((i) => canView(i.moduleKey));
  const showEmployees = canView("staff") || canView("attendance") || canView("leave");
  const filteredOthers = othersItems.filter((i) => canView(i.moduleKey));
  const filteredFeedback = feedbackItems.filter((i) => canView(i.moduleKey));
  const othersPaths = othersItems.map((i) => i.url);
  const feedbackPaths = feedbackItems.map((i) => i.url);

  const employeesPaths = ["/staff", "/leave", "/attendance"];
  // Admin Home itself. With it, the group is one link; without it, whatever
  // admin pages they can still reach have to be offered directly.
  const canOpenAdminHome = canView("settings");
  const adminLeftovers = canOpenAdminHome
    ? []
    : visibleAdminLinks({ isAdmin, permissions });
  const adminPaths = ["/admin", ...ADMIN_LINKS.map((i) => i.url)];
  const showAdmin = canOpenAdminHome || adminLeftovers.length > 0;
  // Flattened, not mapped: the Surveys entry has no url of its own, and the two
  // pages beneath it still have to open Master Data when one of them is the page
  // you are on.
  const masterPaths = masterDataItems.flatMap((i) =>
    i.url ? [i.url] : (i.children ?? []).map((c) => c.url),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 theme-header">
        <div className={collapsed ? "flex items-center justify-center" : "flex items-center gap-2"}>
          {!collapsed && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/95 shadow-sm ring-1 ring-black/5">
              <img src={skinClinicLogo} alt="The Skin Clinic" className="h-7 w-7 object-contain" />
            </span>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm font-bold leading-tight drop-shadow-sm truncate">
                The Skin Clinic
              </h2>
              <p className="text-xs opacity-90 leading-tight">Clinic Manager</p>
            </div>
          )}
          <SidebarTrigger
            className="h-8 w-8 shrink-0 hover:bg-white/20"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMainBeforeComms.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {(
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}

              {showCommunications && (
                <Collapsible
                  defaultOpen={currentPath.startsWith("/communications")}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Communications Center"
                        isActive={currentPath.startsWith("/communications")}
                      >
                        <MessageCircle className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Communications Center</span>}
                        {!collapsed && (
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {communicationsItems.map((sub) => (
                          <SidebarMenuSubItem key={sub.url}>
                            <SidebarMenuSubButton
                              asChild
                              // The WhatsApp hub owns /communications/whatsapp, but its own
                              // sub-pages are separate entries, so a plain prefix match would
                              // light it up on all of them.
                              isActive={
                                sub.url === "/communications/whatsapp"
                                  ? currentPath === sub.url
                                  : sub.url === "/communications/meta"
                                    ? isActive(sub.url) && !currentPath.startsWith("/communications/meta/connection")
                                    : isActive(sub.url)
                              }
                            >
                              <Link to={sub.url}>
                                <sub.icon className="mr-2 h-3.5 w-3.5" />
                                <span>{sub.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {filteredMainAfterComms.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {(
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}

              {filteredFeedback.length > 0 && (
                <Collapsible
                  defaultOpen={feedbackPaths.some((p) => currentPath.startsWith(p))}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Feedback"
                        isActive={feedbackPaths.some((p) => currentPath.startsWith(p))}
                      >
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Feedback</span>}
                        {!collapsed && (
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {filteredFeedback.map((sub) => (
                          <SidebarMenuSubItem key={sub.url}>
                            <SidebarMenuSubButton asChild isActive={isActive(sub.url)}>
                              <Link to={sub.url}>
                                <sub.icon className="mr-2 h-3.5 w-3.5" />
                                <span>{sub.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {showEmployees && (
                <Collapsible
                  defaultOpen={employeesPaths.some((p) => currentPath.startsWith(p))}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Employees"
                        isActive={employeesPaths.some((p) => currentPath.startsWith(p))}
                      >
                        <UserCog className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Employees</span>}
                        {!collapsed && (
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {employeesSubItems
                          .filter((sub) => canView(sub.moduleKey))
                          .map((sub) => (
                            <SidebarMenuSubItem key={sub.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActive(sub.url)}
                              >
                                <Link to={sub.url}>
                                  <sub.icon className="mr-2 h-3.5 w-3.5" />
                                  <span>{sub.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {filteredOthers.length > 0 && (
                <Collapsible
                  defaultOpen={othersPaths.some((p) => currentPath.startsWith(p))}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Others"
                        isActive={othersPaths.some((p) => currentPath.startsWith(p))}
                      >
                        <MoreHorizontal className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Others</span>}
                        {!collapsed && (
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {filteredOthers.map((sub) => (
                          <SidebarMenuSubItem key={sub.url}>
                            <SidebarMenuSubButton asChild isActive={isActive(sub.url)}>
                              <Link to={sub.url}>
                                <sub.icon className="mr-2 h-3.5 w-3.5" />
                                <span>{sub.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredMaster.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Master Data</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible
                  defaultOpen={masterPaths.some((p) => currentPath.startsWith(p))}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Master Data"
                        isActive={masterPaths.some((p) => currentPath.startsWith(p))}
                      >
                        <Building2 className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Master Data</span>}
                        {!collapsed && (
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {filteredMaster.map((item) =>
                          item.children ? (
                            // The one entry with pages under it. Its own group
                            // name - never group/collapsible, which Master Data
                            // above already owns, or the two chevrons turn
                            // together on one state.
                            <Collapsible
                              key={item.title}
                              defaultOpen={item.children.some((c) => currentPath.startsWith(c.url))}
                              className="group/surveys"
                            >
                              <SidebarMenuSubItem>
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={item.children.some((c) => currentPath.startsWith(c.url))}
                                  >
                                    {/* A button, not the default anchor: it opens
                                        a group rather than going anywhere, and an
                                        href here would count as a page. */}
                                    <button type="button" className="w-full">
                                      <item.icon className="mr-2 h-3.5 w-3.5" />
                                      <span>{item.title}</span>
                                      <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/surveys:rotate-180" />
                                    </button>
                                  </SidebarMenuSubButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  {/* mx-1 pl-2 rather than the default mx-3.5
                                      px-2.5: a third level at full indent reads
                                      as two steps in, not one. */}
                                  <SidebarMenuSub className="mx-1 px-0 pl-2">
                                    {item.children.map((sub) => (
                                      <SidebarMenuSubItem key={sub.url}>
                                        <SidebarMenuSubButton asChild isActive={isActive(sub.url)}>
                                          <Link to={sub.url}>
                                            <sub.icon className="mr-2 h-3.5 w-3.5" />
                                            <span>{sub.title}</span>
                                          </Link>
                                        </SidebarMenuSubButton>
                                      </SidebarMenuSubItem>
                                    ))}
                                  </SidebarMenuSub>
                                </CollapsibleContent>
                              </SidebarMenuSubItem>
                            </Collapsible>
                          ) : (
                            <SidebarMenuSubItem key={item.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActive(item.url!)}
                              >
                                <Link to={item.url!}>
                                  <item.icon className="mr-2 h-3.5 w-3.5" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ),
                        )}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canOpenAdminHome ? (
                  /* One entry. Everything that used to hang under it is on
                     Admin Home, which is what this opens. */
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Admin"
                      isActive={adminPaths.some((p) => currentPath.startsWith(p))}
                    >
                      <Link to="/admin">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Admin</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  /* They cannot open Admin Home, so the pages they CAN open
                     are offered directly rather than behind a door that
                     refuses them. */
                  <Collapsible
                    defaultOpen={adminPaths.some((p) => currentPath.startsWith(p))}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip="Admin"
                          isActive={adminPaths.some((p) => currentPath.startsWith(p))}
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          {!collapsed && <span>Admin</span>}
                          {!collapsed && (
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          )}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {adminLeftovers.map((item) => (
                            <SidebarMenuSubItem key={item.title}>
                              <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
                                <Link to={item.url}>
                                  <item.icon className="mr-2 h-3.5 w-3.5" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.filter((i) => canView(i.moduleKey)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
