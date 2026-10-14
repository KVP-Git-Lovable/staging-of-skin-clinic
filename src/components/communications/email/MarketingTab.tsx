import { useSearchParams } from "react-router-dom";
import { MarketingDashboard } from "./MarketingDashboard";
import { CampaignWizard } from "./CampaignWizard";
import { CampaignAnalytics } from "./CampaignAnalytics";
import { MarketingTemplates } from "./MarketingTemplates";
import { MailchimpConnection } from "./MailchimpConnection";

export function MarketingTab() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "dashboard";
  const campaignId = params.get("id");
  const templateId = params.get("tid");

  const setView = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: false });
  };

  if (view === "wizard") {
    return (
      <CampaignWizard
        campaignId={campaignId}
        templateId={templateId}
        onDone={() => setView({ view: "dashboard", id: null, tid: null })}
        onCancel={() => setView({ view: "dashboard", id: null, tid: null })}
      />
    );
  }
  if (view === "analytics" && campaignId) {
    return (
      <CampaignAnalytics
        campaignId={campaignId}
        onBack={() => setView({ view: "dashboard", id: null })}
      />
    );
  }
  if (view === "connections") {
    return <MailchimpConnection onBack={() => setView({ view: "dashboard" })} />;
  }
  if (view === "templates") {
    return (
      <MarketingTemplates
        onNewCampaignFromTemplate={(tid) => setView({ view: "wizard", tid, id: null })}
        onBack={() => setView({ view: "dashboard" })}
      />
    );
  }
  return (
    <MarketingDashboard
      onNew={() => setView({ view: "wizard", id: null, tid: null })}
      onEdit={(id) => setView({ view: "wizard", id, tid: null })}
      onAnalytics={(id) => setView({ view: "analytics", id })}
      onOpenTemplates={() => setView({ view: "templates" })}
      onOpenConnections={() => setView({ view: "connections" })}
    />
  );
}

export default MarketingTab;
