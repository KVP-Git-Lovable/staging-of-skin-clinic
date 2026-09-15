const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
  return `+${cleaned}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      phone,
      patientName,
      invoiceNumber,
      totalAmount,
      paidAmount,
      balanceAmount,
      status,
      invoiceUrl,
    } = await req.json();

    if (!phone || !patientName || !invoiceNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phone, patientName, invoiceNumber" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const templateSid = Deno.env.get("TWILIO_INVOICE_TEMPLATE_SID");

    if (!accountSid || !authToken || !fromNumber) {
      console.error("Missing Twilio credentials");
      return new Response(
        JSON.stringify({ error: "Twilio not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const toNumber = normalizePhone(phone);
    if (!toNumber) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromFormatted = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    const toFormatted = `whatsapp:${toNumber}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = btoa(`${accountSid}:${authToken}`);

    let body: URLSearchParams;

    if (templateSid) {
      // Use approved template (recommended for WhatsApp Business outside session window)
      // Template uses named variables. The invoice PDF URL in the template is
      // built as ".../invoices/{{inf}}.pdf", so {{inf}} must be just the
      // invoice number (e.g. INV-874623), not the full URL.
      const contentVariables = JSON.stringify({
        // Named variables (current template)
        name: String(patientName),
        inf: String(invoiceNumber),
        total: String(totalAmount ?? ""),
        paid: String(paidAmount ?? ""),
        balance: String(balanceAmount ?? ""),
        status: String(status ?? ""),
        // Numeric fallbacks in case template still references {{1}}..{{7}}
        "1": String(patientName),
        "2": String(invoiceNumber),
        "3": String(totalAmount ?? ""),
        "4": String(paidAmount ?? ""),
        "5": String(balanceAmount ?? ""),
        "6": String(status ?? ""),
        "7": String(invoiceUrl ?? ""),
      });
      body = new URLSearchParams({
        To: toFormatted,
        From: fromFormatted,
        ContentSid: templateSid,
        ContentVariables: contentVariables,
      });
    } else {
      // Fallback: free-form message (works only inside 24h customer-care window)
      const text =
        `Hello ${patientName},\n\n` +
        `Your invoice ${invoiceNumber} has been created.\n` +
        `Total: ${totalAmount}\n` +
        `Paid: ${paidAmount}\n` +
        `Balance: ${balanceAmount}\n` +
        `Status: ${status}\n\n` +
        (invoiceUrl ? `View / download invoice PDF:\n${invoiceUrl}\n\n` : "") +
        `Thank you for choosing The Skin Clinic.`;
      body = new URLSearchParams({
        To: toFormatted,
        From: fromFormatted,
        Body: text,
      });
    }

    const twilioRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const result = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error("Twilio API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message", details: result }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Invoice WhatsApp sent:", { sid: result.sid, to: toFormatted, invoiceNumber });

    // Attach the invoice PDF as a follow-up media message so the patient
    // actually receives the document (templates cannot carry media here).
    let mediaSid: string | null = null;
    let mediaError: unknown = null;
    if (invoiceUrl) {
      const mediaRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: toFormatted,
          From: fromFormatted,
          Body: `Invoice ${invoiceNumber}`,
          MediaUrl: String(invoiceUrl),
        }).toString(),
      });
      const mediaJson = await mediaRes.json();
      if (mediaRes.ok) {
        mediaSid = mediaJson.sid;
      } else {
        mediaError = mediaJson;
        console.error("Twilio media message error:", mediaJson);
      }
    }

    // Poll the delivery status once so failures surface to the caller instead
    // of silently showing "sent" in the UI.
    let deliveryStatus: string | null = null;
    let deliveryError: unknown = null;
    try {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${result.sid}.json`,
        { headers: { Authorization: `Basic ${auth}` } },
      );
      const statusJson = await statusRes.json();
      if (statusRes.ok) {
        deliveryStatus = statusJson.status ?? null;
        if (statusJson.error_code) {
          deliveryError = { code: statusJson.error_code, message: statusJson.error_message };
          console.error("Twilio delivery error:", deliveryError);
        }
      }
    } catch (e) {
      console.error("Status poll failed:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageSid: result.sid,
        mediaSid,
        mediaError,
        deliveryStatus,
        deliveryError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("send-invoice-whatsapp error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});