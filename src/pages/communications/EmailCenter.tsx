import { Mail } from "lucide-react";
import { MarketingTab } from "@/components/communications/email/MarketingTab";

export default function EmailCenter() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" /> Email
        </h1>
        <p className="page-subtitle">Run marketing campaigns through Mailchimp from your verified sender domains</p>
      </div>
      <MarketingTab />
    </div>
  );
}
