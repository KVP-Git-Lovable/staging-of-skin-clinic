import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  delay?: number;
  compact?: boolean;
  /** Shows a pulsing placeholder instead of value/change - use while the
   *  real number is still being fetched, so a stale/zero value never
   *  flashes on screen before the real one arrives. */
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "bg-primary/10 text-primary",
  delay = 0,
  compact = false,
  loading = false,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="stat-card h-full flex flex-col justify-between"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-muted-foreground truncate">{title}</p>
          {loading ? (
            <div className={`mt-1.5 animate-pulse rounded bg-muted ${compact ? "h-5 w-16 md:h-6" : "h-6 w-24 md:h-8"}`} />
          ) : (
            <p className={`font-bold font-display mt-1 truncate ${compact ? "text-lg md:text-xl" : "text-xl md:text-3xl"}`}>{value}</p>
          )}
          {loading ? (
            <div className="mt-2 h-3 w-14 animate-pulse rounded bg-muted" />
          ) : change ? (
            <p
              className={`text-[10px] md:text-xs mt-1.5 md:mt-2 font-medium ${
                changeType === "positive"
                  ? "text-success"
                  : changeType === "negative"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {change}
            </p>
          ) : null}
        </div>
        <div className={`p-2 md:p-3 rounded-lg md:rounded-xl shrink-0 ${iconColor}`}>
          <Icon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      </div>
    </motion.div>
  );
}
