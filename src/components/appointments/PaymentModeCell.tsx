import { Badge } from "@/components/ui/badge";
import { formatMoneyExact } from "@/lib/currency";
import { paymentModeLabel, paymentSplitParts } from "@/lib/paymentSplits";

interface Props {
  mode?: string | null;
  splits?: unknown;
}

/**
 * How a bill was paid, and how much went each way.
 *
 * The column has been asked the same question twice. It used to print the
 * single stored word "Split", which told the front desk nothing, so it learned
 * to name the modes - "Card + UPI". The next question was how much on each.
 *
 * So a split gets one badge per mode carrying its own amount, rather than one
 * long badge: the column is narrow, the pills are already the shape of this
 * column, and nobody has to read across to work out which figure belongs to
 * which mode. An ordinary bill is a single badge exactly as before.
 *
 * formatMoneyExact, not formatMoney: these figures are reconciled against the
 * drawer, and "₹26.9K" cannot be reconciled against anything.
 */
export function PaymentModeCell({ mode, splits }: Props) {
  const parts = paymentSplitParts(mode, splits);

  if (parts.length === 0) {
    // Not a split, or a split whose rows name no mode - the stored word stands.
    const label = paymentModeLabel(mode, splits);
    return (
      <Badge variant="outline" className="text-xs">
        {label || "—"}
      </Badge>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {parts.map((part) => (
        <Badge key={part.mode.toLowerCase()} variant="outline" className="text-xs whitespace-nowrap">
          {part.mode} {formatMoneyExact(part.amount)}
        </Badge>
      ))}
    </span>
  );
}
