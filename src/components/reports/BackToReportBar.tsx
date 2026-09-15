import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function BackToReportBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [referrer, setReferrer] = useState<string | null>(null);

  useEffect(() => {
    try {
      const ref = sessionStorage.getItem("reportReferrer");
      // Don't show on the report page itself or on routes that have nothing to do with records
      if (ref && !location.pathname.startsWith("/reports")) {
        setReferrer(ref);
      } else {
        setReferrer(null);
      }
    } catch {
      setReferrer(null);
    }
  }, [location.pathname]);

  if (!referrer) return null;

  const handleClick = () => {
    try {
      sessionStorage.removeItem("reportReferrer");
    } catch {}
    navigate(referrer);
  };

  return (
    <div className="mb-3">
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Report
      </button>
    </div>
  );
}