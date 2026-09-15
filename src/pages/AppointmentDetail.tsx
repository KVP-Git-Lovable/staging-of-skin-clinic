import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppointmentDetailSheet } from "@/components/appointments/AppointmentDetailSheet";
import { useModal } from "@/hooks/useModal";

interface AppointmentDetailProps {
  appointmentId?: string;
}

export default function AppointmentDetail({ appointmentId: propAppointmentId }: AppointmentDetailProps) {
  const { id: paramsId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { closeModal } = useModal();

  const appointmentId = propAppointmentId || paramsId;
  const isModal = !!propAppointmentId;

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => isModal ? closeModal() : navigate("/appointments")}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Appointments
      </Button>
      <AppointmentDetailSheet
        appointmentId={appointmentId ?? null}
        variant="page"
        onClose={() => isModal ? closeModal() : navigate("/appointments")}
      />
    </div>
  );
}
