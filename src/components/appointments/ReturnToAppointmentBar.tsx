import { ArrowLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  forgetOpenAppointment,
  readOpenAppointment,
  returnLabel,
  shouldOfferReturn,
  type OpenAppointment,
} from "@/lib/openAppointment";

/**
 * One tap back to the appointment someone left to do something else.
 *
 * Same shape as BackToReportBar, deliberately: a second pattern for the same
 * job would be the churn the clinic has already objected to.
 */
export function ReturnToAppointmentBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [remembered, setRemembered] = useState<OpenAppointment | null>(null);

  useEffect(() => {
    const open = readOpenAppointment();
    setRemembered(shouldOfferReturn(location.pathname, open) ? open : null);
  }, [location.pathname]);

  if (!remembered) return null;

  return (
    <div className="mb-3 flex items-center gap-1">
      <button
        onClick={() => {
          forgetOpenAppointment();
          navigate(`/appointments/${remembered.id}`);
        }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {returnLabel(remembered)}
      </button>
      {/* Front desk finish with an appointment without ever tapping the chip,
          so there has to be a way to say so. It also drops on its own after
          half an hour - see openAppointment.ts. */}
      <button
        onClick={() => {
          forgetOpenAppointment();
          setRemembered(null);
        }}
        className="p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
