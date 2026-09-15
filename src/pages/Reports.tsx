import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Users, CalendarCheck, IndianRupee, Receipt, Pill, Megaphone } from "lucide-react";
import { REPORTS } from "@/lib/reportsCatalog";

const ICONS: Record<string, any> = {
  patients: Users,
  appointments: CalendarCheck,
  invoices: IndianRupee,
  expenses: Receipt,
  pharma_bills: Pill,
  campaigns: Megaphone,
};

const CATEGORY_ORDER = ["Patients", "Operations", "Finance", "Marketing"] as const;

const Reports = () => {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: REPORTS.filter((r) => r.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Browse standard reports — filter, sort and drill into any record.</p>
      </div>

      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.category}>
            <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">
              {group.category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((r, i) => {
                const Icon = ICONS[r.key] ?? Users;
                return (
                  <motion.div
                    key={r.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                  >
                    <Link
                      to={`/reports/${r.key}`}
                      className="data-table p-4 flex items-start gap-3 hover:border-primary/40 hover:bg-primary/5 transition-colors group h-full"
                    >
                      <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-display font-semibold text-sm text-foreground group-hover:text-primary truncate">
                            {r.title}
                          </h3>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</p>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default Reports;