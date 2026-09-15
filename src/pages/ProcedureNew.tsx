import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcedureFormDialog } from "@/components/procedures/ProcedureFormDialog";

export default function ProcedureNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const patientId = params.get("patient_id") || undefined;
  const appointmentId = params.get("appointment_id") || undefined;
  const staffId = params.get("staff_id") || undefined;
  const serviceName = params.get("service") || undefined;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/procedures")}>
        <ArrowLeft className="h-4 w-4" /> Back to Prescriptions
      </Button>
      <div className="page-header">
        <h1 className="page-title">New Prescription</h1>
        <p className="page-subtitle">Record consultation, prescriptions & next appointment</p>
      </div>
      <ProcedureFormDialog
        asPage
        open
        onOpenChange={(o) => { if (!o) navigate("/procedures"); }}
        defaultPatientId={patientId}
        defaultAppointmentId={appointmentId}
        defaultStaffId={staffId}
        defaultServiceName={serviceName}
        onSaved={(id) => navigate(`/procedures?id=${id}`)}
      />
    </div>
  );
}
