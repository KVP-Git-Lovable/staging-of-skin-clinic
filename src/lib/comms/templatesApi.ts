import { supabase } from "@/integrations/supabase/client";

export type CtaButton = { type: "URL" | "PHONE_NUMBER"; title: string; url: string; phone: string };

export type ContentType = "text" | "media" | "call_to_action";

export type TemplateDraft = {
  name: string;
  category: string;
  language: string;
  contentType: ContentType;
  body: string;
  mediaUrl: string;
  ctaButtons: CtaButton[];
};

export const emptyCta = (): CtaButton => ({ type: "URL", title: "", url: "", phone: "" });

export const emptyDraft = (): TemplateDraft => ({
  name: "",
  category: "UTILITY",
  language: "en",
  contentType: "text",
  body: "",
  mediaUrl: "",
  ctaButtons: [emptyCta()],
});

export type TemplateRow = {
  id: string;
  name: string;
  category: string;
  language: string;
  body: string;
  content_type: string;
  media_url: string | null;
  cta_actions: { type: string; title: string; url?: string; phone?: string }[] | null;
  variable_map: Record<string, string> | null;
  variable_samples: Record<string, string> | null;
  status: string;
  rejection_reason: string | null;
  twilio_content_sid: string | null;
  twilio_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// supabase.functions.invoke hides the response body on non-2xx; this surfaces the function's own error text.
export async function invokeTemplates<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("comms-whatsapp-templates", { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json().catch(() => null);
      if (parsed?.error) message = parsed.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
