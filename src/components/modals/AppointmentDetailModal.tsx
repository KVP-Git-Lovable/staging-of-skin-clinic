import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUrlPanel } from "@/hooks/useUrlPanel";
import AppointmentDetail from "@/pages/AppointmentDetail";
import { forgetOpenAppointment } from "@/lib/openAppointment";

/**
 * An appointment opened from the list, full screen.
 *
 * The id is in the address so Back returns to it, but the presentation is
 * unchanged - converting the Appointments page to a URL panel briefly turned
 * this into a side drawer, which is not what the clinic opens an appointment
 * into.
 *
 * Its own parameter, not the "appointment" one: Patients and Billing already
 * use that for their own side sheets, and a shared name would open this over
 * them too.
 */
export function AppointmentDetailModal() {
  const { openId: selectedAppointmentId, close: closePanel } = useUrlPanel("appointmentDetail");

  // Closing the modal is a deliberate exit, same as "Back to Appointments" on
  // the route version - drop the "back to this appointment" offer so it does
  // not keep pointing at a visit the front desk already finished with.
  const close = () => {
    forgetOpenAppointment();
    closePanel();
  };

  if (!selectedAppointmentId) return null;

  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Header with Close Button */}
      <div className="flex justify-between items-center p-4 bg-background border-b shrink-0">
        <h2 className="text-lg font-semibold">Appointment Details</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          className="h-8 w-8"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Modal Content - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-3 md:px-6 py-4">
          <AppointmentDetail appointmentId={selectedAppointmentId} onClose={close} />
        </div>
      </div>
    </div>
  );
}
