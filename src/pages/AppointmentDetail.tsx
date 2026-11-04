import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppointmentDetailSheet } from "@/components/appointments/AppointmentDetailSheet";
import { forgetOpenAppointment } from "@/lib/openAppointment";

interface AppointmentDetailProps {
  appointmentId?: string;
  /** Supplied when opened as the overlay; the route version goes back to the list. */
  onClose?: () => void;
}

export default function AppointmentDetail({ appointmentId: propAppointmentId, onClose }: AppointmentDetailProps) {
  const { id: paramsId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const appointmentId = propAppointmentId || paramsId;
  // Going back to the list is a deliberate exit, so drop the "back to this
  // appointment" offer - it is for when someone leaves for another section.
  const close =
    onClose ??
    (() => {
      forgetOpenAppointment();
      navigate("/appointments");
    });

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={close}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Appointments
      </Button>
      <AppointmentDetailSheet
        appointmentId={appointmentId ?? null}
        variant="page"
        onClose={close}
      />
    </div>
  );
}
