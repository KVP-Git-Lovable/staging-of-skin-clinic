import { Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function VoiceCenter() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Phone className="h-6 w-6 text-primary" /> Voice
        </h1>
        <p className="page-subtitle">Part of the Communications Center</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Phone className="h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium">Voice is coming soon</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Outbound and inbound voice communications will live here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
