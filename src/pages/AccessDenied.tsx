import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function AccessDenied() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <ShieldX className="h-16 w-16 text-destructive" />
      <h1 className="text-2xl font-bold font-display">Access Denied</h1>
      <p className="text-muted-foreground max-w-md">
        You don't have permission to access this module. Please contact your administrator to request access.
      </p>
      <Button onClick={() => navigate("/")}>Go to Dashboard</Button>
    </div>
  );
}
