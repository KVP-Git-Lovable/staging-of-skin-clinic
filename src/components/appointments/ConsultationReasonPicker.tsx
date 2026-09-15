import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export const AESTHETIC_REASONS = [
  "Acne", "Pigmentation", "Anti Aging", "Undereye Dark Circles", "Lip Darkening",
  "Sagging of Face", "Neck Rejuvenation", "Hair Loss", "Dandruff", "Hair Growth",
  "Routine Skin Checkup / Glow", "Uneven Skin Tone", "Bridal", "Others",
];

export const CLINICAL_REASONS = [
  "Itching", "Fungal Infection", "Rashes", "White Patch", "Swelling", "Dry Skin", "Others",
];

export const CONSULTATION_TYPES = ["None", "Aesthetic", "Clinical", "Aesthetic & Clinical"] as const;
export type ConsultationType = typeof CONSULTATION_TYPES[number];

const OTHER_AESTHETIC = "Others (Aesthetic)";
const OTHER_CLINICAL = "Others (Clinical)";

function buildTag(group: "aesthetic" | "clinical", reason: string) {
  if (reason === "Others") {
    return group === "aesthetic" ? OTHER_AESTHETIC : OTHER_CLINICAL;
  }
  return reason;
}

interface Props {
  consultationType: ConsultationType | "";
  setConsultationType?: (v: ConsultationType) => void;
  onConsultationTypeChange?: (v: ConsultationType) => void;
  reasons?: string[];
  consultationReasons?: string[];
  setReasons?: (r: string[]) => void;
  onConsultationReasonsChange?: (r: string[]) => void;
  othersAestheticText: string;
  setOthersAestheticText: (v: string) => void;
  othersClinicalText: string;
  setOthersClinicalText: (v: string) => void;
}

export function ConsultationReasonPicker({
  consultationType,
  setConsultationType,
  onConsultationTypeChange,
  reasons: reasonsProp,
  consultationReasons,
  setReasons: setReasonsProp,
  onConsultationReasonsChange,
  othersAestheticText,
  setOthersAestheticText,
  othersClinicalText,
  setOthersClinicalText,
}: Props) {
  const [activeTab, setActiveTab] = useState<"aesthetic" | "clinical">("aesthetic");
  const reasons = reasonsProp ?? consultationReasons ?? [];
  const setReasons = setReasonsProp ?? onConsultationReasonsChange ?? (() => {});
  const setType = (type: ConsultationType) => {
    const setter = setConsultationType ?? onConsultationTypeChange ?? (() => {});

    // Clear or filter reasons based on new type
    if (type === "None") {
      if (reasons.length > 0) setReasons([]);
    } else if (type === "Aesthetic" && reasons.length > 0) {
      // Keep only aesthetic reasons
      const validReasons = reasons.filter(r => !r.includes("Clinical"));
      if (validReasons.length !== reasons.length) setReasons(validReasons);
    } else if (type === "Clinical" && reasons.length > 0) {
      // Keep only clinical reasons
      const validReasons = reasons.filter(r => !r.includes("Aesthetic"));
      if (validReasons.length !== reasons.length) setReasons(validReasons);
    }
    // For "Aesthetic & Clinical", keep all reasons

    setter(type);
  };

  const toggle = (group: "aesthetic" | "clinical", reason: string) => {
    const tag = buildTag(group, reason);
    if (reasons.includes(tag)) {
      setReasons(reasons.filter((r) => r !== tag));
    } else {
      setReasons([...reasons, tag]);
    }
  };

  const showAesthetic = consultationType === "Aesthetic" || consultationType === "Aesthetic & Clinical";
  const showClinical = consultationType === "Clinical" || consultationType === "Aesthetic & Clinical";

  const renderReasons = (group: "aesthetic" | "clinical", options: string[]) => {
    const otherTag = group === "aesthetic" ? OTHER_AESTHETIC : OTHER_CLINICAL;
    const othersSelected = reasons.includes(otherTag);
    const othersValue = group === "aesthetic" ? othersAestheticText : othersClinicalText;
    const setOthers = group === "aesthetic" ? setOthersAestheticText : setOthersClinicalText;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {options.map((opt) => {
            const tag = buildTag(group, opt);
            const active = reasons.includes(tag);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(group, opt)}
                className={cn(
                  "px-3 py-2 rounded-md border text-sm transition-all font-medium",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background hover:bg-muted border-input hover:border-primary/30",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {othersSelected && (
          <Input
            value={othersValue}
            onChange={(e) => setOthers(e.target.value)}
            placeholder={`Specify ${group} concern...`}
            className="mt-2"
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Reason for Consultation</Label>
        <Select value={consultationType || "None"} onValueChange={(v) => setType(v as ConsultationType)}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            {CONSULTATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(showAesthetic || showClinical) && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
          {showAesthetic && showClinical && (
            <div className="flex gap-2 border-b">
              {(["aesthetic", "clinical"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px capitalize",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          {showAesthetic && showClinical ? (
            activeTab === "aesthetic" ? renderReasons("aesthetic", AESTHETIC_REASONS) : renderReasons("clinical", CLINICAL_REASONS)
          ) : showAesthetic ? (
            renderReasons("aesthetic", AESTHETIC_REASONS)
          ) : (
            renderReasons("clinical", CLINICAL_REASONS)
          )}
        </div>
      )}

      {reasons.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Selected Reasons</p>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <Badge key={r} variant="secondary" className="gap-1.5 px-3 py-1.5">
                {r}
                <button
                  type="button"
                  onClick={() => setReasons(reasons.filter((x) => x !== r))}
                  className="hover:bg-muted-foreground/30 rounded-full p-0.5 ml-1"
                  aria-label={`Remove ${r}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function buildConsultationReasonsForSave(
  reasons: string[],
  othersAestheticText: string,
  othersClinicalText: string,
): string[] {
  return reasons.map((r) => {
    if (r === OTHER_AESTHETIC) return othersAestheticText.trim() ? `Others (Aesthetic): ${othersAestheticText.trim()}` : OTHER_AESTHETIC;
    if (r === OTHER_CLINICAL) return othersClinicalText.trim() ? `Others (Clinical): ${othersClinicalText.trim()}` : OTHER_CLINICAL;
    return r;
  });
}