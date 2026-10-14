// Wraps user HTML in an email-safe container and appends the compliance footer (clinic name + address
// from clinic_settings). Used by both launch and test-send so preview and real send match.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface CompanyFooter {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
}

export function buildCompanyAddressLine(c: CompanyFooter | null | undefined): string {
  if (!c) return "";
  const parts = [c.address, c.city, c.state, c.postal_code, c.country].filter(Boolean);
  return parts.join(", ");
}

export interface WrapOpts {
  html: string;
  previewText?: string | null;
  subject: string;
  company: CompanyFooter | null;
  unsubscribeUrl: string; // Mailchimp merge tag *|UNSUB|*
  showUnsubscribe?: boolean;
}

export function wrapMarketingEmail(opts: WrapOpts): string {
  const { html, previewText, subject, company, unsubscribeUrl, showUnsubscribe = true } = opts;
  const companyName = company?.name ? escapeHtml(company.name) : "";
  const addressLine = escapeHtml(buildCompanyAddressLine(company));

  const preheader = previewText
    ? `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${escapeHtml(previewText)}</div>`
    : "";

  const footer = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:32px;border-top:1px solid #e5e7eb;">
      <tr>
        <td align="center" style="padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
          ${companyName ? `<div style="font-weight:600;color:#111827;margin-bottom:4px;">${companyName}</div>` : ""}
          ${addressLine ? `<div style="margin-bottom:8px;">${addressLine}</div>` : ""}
          ${
            showUnsubscribe
              ? `<div>You received this email because you are a patient or contact of ${companyName || "our clinic"}. <a href="${unsubscribeUrl}" style="color:#2563eb;text-decoration:underline;">Unsubscribe</a></div>`
              : `<div style="color:#9ca3af;">This is a preview / test email.</div>`
          }
        </td>
      </tr>
    </table>
  `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    ${preheader}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.55;">
                ${html}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">${footer}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Build a plain-text fallback by stripping tags (very lightweight).
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// deno-lint-ignore no-explicit-any
export async function loadCompanyFooter(db: any): Promise<CompanyFooter | null> {
  const { data } = await db
    .from("clinic_settings")
    .select("name, address, city, state, pincode")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name,
    address: data.address || null,
    city: data.city,
    state: data.state,
    country: "India",
    postal_code: data.pincode,
  };
}
