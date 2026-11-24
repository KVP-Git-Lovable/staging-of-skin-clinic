import { Label } from "@/components/ui/label";

/**
 * One setting: what it is on the left, the control on the right.
 *
 * Lifted out of AttendanceSettings so the leave cards on the same tab can use
 * it without the two files importing each other. The layout is the whole
 * point - a settings page where every row sits differently is a settings page
 * nobody scans.
 */
export function SettingRow({
  label, hint, children,
}: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <div className="shrink-0 pt-1">{children}</div>
    </div>
  );
}

export default SettingRow;
