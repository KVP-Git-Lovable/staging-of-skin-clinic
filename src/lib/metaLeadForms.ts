/**
 * Lead ads (instant forms) — front-end mirror of supabase/functions/_shared/meta-leadforms.ts.
 * Only the documented question types, CTA types and locales are offered.
 */

export const LEAD_QUESTION_CHOICES: Array<{ type: string; label: string; custom?: boolean; multiple?: boolean }> = [
  { type: "FULL_NAME", label: "Full name" },
  { type: "EMAIL", label: "E-mail" },
  { type: "PHONE", label: "Phone number" },
  { type: "FIRST_NAME", label: "First name" },
  { type: "LAST_NAME", label: "Last name" },
  { type: "CUSTOM", label: "Custom question (short answer)", custom: true },
  { type: "CUSTOM_MULTIPLE", label: "Custom question (multiple choice)", custom: true, multiple: true },
  { type: "DATE_TIME", label: "Appointment date & time" },
];

export const LEAD_CTA_OPTIONS: Array<[string, string]> = [
  ["SIGN_UP", "Sign Up"],
  ["LEARN_MORE", "Learn More"],
  ["GET_QUOTE", "Get Quote"],
  ["APPLY_NOW", "Apply Now"],
  ["SUBSCRIBE", "Subscribe"],
  ["DOWNLOAD", "Download"],
];
export const LEAD_CTA_TYPES = new Set(LEAD_CTA_OPTIONS.map(([v]) => v));

export const LEAD_LOCALE_OPTIONS: Array<[string, string]> = [
  ["EN_US", "English (US)"],
  ["EN_GB", "English (UK)"],
  ["HI_IN", "Hindi (India)"],
];

export interface LeadQuestionDraft {
  id: string;
  type: string; // FULL_NAME… or CUSTOM / CUSTOM_MULTIPLE
  label: string;
  options: string[];
}

export interface LeadFormDraft {
  name: string;
  questions: LeadQuestionDraft[];
  privacy_url: string;
  privacy_link_text: string;
  headline: string;
  intro_title: string;
  intro_lines: string;
  intro_style: "LIST_STYLE" | "PARAGRAPH_STYLE";
  intro_button: string;
  thank_you_enabled: boolean;
  thank_you_title: string;
  thank_you_body: string;
  thank_you_button_type: "VIEW_WEBSITE" | "CALL_BUSINESS";
  thank_you_button_text: string;
  thank_you_website_url: string;
  thank_you_phone: string;
  thank_you_country: string;
  locale: string;
  optimized_for_quality: boolean;
  block_non_targeted: boolean;
}

export function emptyLeadFormDraft(): LeadFormDraft {
  return {
    name: "",
    questions: [
      { id: "q1", type: "FULL_NAME", label: "", options: [] },
      { id: "q2", type: "PHONE", label: "", options: [] },
      { id: "q3", type: "EMAIL", label: "", options: [] },
    ],
    privacy_url: "",
    privacy_link_text: "Privacy Policy",
    headline: "",
    intro_title: "",
    intro_lines: "",
    intro_style: "LIST_STYLE",
    intro_button: "",
    thank_you_enabled: true,
    thank_you_title: "Thank you!",
    thank_you_body: "We will get in touch with you shortly.",
    thank_you_button_type: "VIEW_WEBSITE",
    thank_you_button_text: "Visit website",
    thank_you_website_url: "",
    thank_you_phone: "",
    thank_you_country: "IN",
    locale: "EN_US",
    optimized_for_quality: false,
    block_non_targeted: false,
  };
}

/** Turns the draft into the `form` payload the edge function validates and forwards to Meta. */
export function draftToLeadForm(d: LeadFormDraft): Record<string, unknown> {
  const questions = d.questions.map((q) => {
    if (q.type === "CUSTOM_MULTIPLE") return { type: "CUSTOM", label: q.label, options: q.options.filter((o) => o.trim()).map((o) => ({ value: o.trim() })) };
    if (q.type === "CUSTOM") return { type: "CUSTOM", label: q.label };
    return { type: q.type };
  });
  const out: Record<string, unknown> = {
    name: d.name,
    questions,
    privacy_policy: { url: d.privacy_url.trim(), link_text: d.privacy_link_text.trim() || "Privacy Policy" },
    locale: d.locale,
    is_optimized_for_quality: d.optimized_for_quality,
    block_display_for_non_targeted_viewer: d.block_non_targeted,
  };
  if (d.headline.trim()) out.question_page_custom_headline = d.headline.trim();
  const introLines = d.intro_lines.split("\n").map((l) => l.trim()).filter(Boolean);
  if (d.intro_title.trim() || introLines.length) {
    out.context_card = { title: d.intro_title.trim() || undefined, content: introLines, style: d.intro_style, button_text: d.intro_button.trim() || undefined };
  }
  if (d.thank_you_enabled) {
    out.thank_you_page = {
      title: d.thank_you_title,
      body: d.thank_you_body || undefined,
      button_type: d.thank_you_button_type,
      button_text: d.thank_you_button_text || undefined,
      website_url: d.thank_you_button_type === "VIEW_WEBSITE" ? d.thank_you_website_url.trim() : undefined,
      business_phone_number: d.thank_you_button_type === "CALL_BUSINESS" ? d.thank_you_phone.trim() : undefined,
      country_code: d.thank_you_button_type === "CALL_BUSINESS" ? d.thank_you_country.trim().toUpperCase() : undefined,
    };
  }
  return out;
}

/** Client-side checks so obvious problems are shown before the round trip. */
export function validateLeadFormDraft(d: LeadFormDraft): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push("Form name is required");
  if (d.questions.length === 0) errors.push("Add at least one question");
  d.questions.forEach((q, i) => {
    if ((q.type === "CUSTOM" || q.type === "CUSTOM_MULTIPLE") && !q.label.trim()) errors.push(`Question ${i + 1}: custom questions need a label`);
    if (q.type === "CUSTOM_MULTIPLE" && q.options.filter((o) => o.trim()).length < 2) errors.push(`Question ${i + 1}: add at least 2 options`);
  });
  const seen = new Set<string>();
  for (const q of d.questions) {
    const key = q.type.startsWith("CUSTOM") ? q.label.trim().toLowerCase() : q.type;
    if (seen.has(key)) errors.push(`Duplicate question: ${q.type.startsWith("CUSTOM") ? q.label : q.type.replace("_", " ").toLowerCase()}`);
    seen.add(key);
  }
  if (!/^https:\/\/\S+$/i.test(d.privacy_url.trim())) errors.push("Privacy policy URL must start with https://");
  if (d.thank_you_enabled) {
    if (!d.thank_you_title.trim()) errors.push("Thank-you page title is required");
    if (d.thank_you_button_type === "VIEW_WEBSITE" && !/^https?:\/\/\S+$/i.test(d.thank_you_website_url.trim())) errors.push("Thank-you page needs a website URL");
    if (d.thank_you_button_type === "CALL_BUSINESS" && (!d.thank_you_phone.trim() || !d.thank_you_country.trim())) errors.push("Thank-you page needs a phone number and country code");
  }
  return errors;
}

export interface LeadFormRow {
  id: string;
  external_id: string | null;
  name: string;
  status: string;
  leads_count: number;
  imported: boolean;
  created_at: string;
  page_id: string;
}

export interface LeadAdsReadiness {
  page_id?: string;
  page_name?: string | null;
  tos_accepted?: boolean | null;
  tos_time?: string | null;
  permissions?: Record<string, boolean>;
  missing_permissions?: string[];
  errors?: string[];
  error?: string;
}

export const LEAD_ADS_TOS_URL = "https://www.facebook.com/ads/leadgen/tos";
