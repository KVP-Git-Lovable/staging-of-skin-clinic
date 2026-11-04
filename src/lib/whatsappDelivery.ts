/**
 * What actually happened to a WhatsApp message, in words the front desk can act on.
 *
 * The review request reported "sent" and the patient never received anything.
 * Both were true at different levels: Twilio accepted the request, and Meta
 * then refused to deliver it. Twilio accepting is not the patient receiving,
 * and the app was announcing the first as though it were the second.
 *
 * The real outcome is already recorded - whatsapp_delivery_log carries the
 * status and Twilio's error code, written by the delivery webhook within a
 * second or two of sending. This turns that row into something worth reading.
 */

export interface DeliveryOutcome {
  /** True only when WhatsApp actually delivered it. */
  delivered: boolean;
  /** True while the answer is still on its way - neither success nor failure. */
  pending: boolean;
  /** What to tell the person who pressed the button. */
  message: string;
}

/**
 * Meta blocked a marketing template.
 *
 * Not a fault in the clinic's setup, and not worth retrying straight away:
 * Meta caps how many marketing messages a person receives - counted across
 * EVERY business that messages them, not just this clinic - and silently drops
 * the rest. Appointment confirmations are unaffected because those are utility
 * templates, which is why they keep arriving while this one does not.
 */
export const META_BLOCKED_MARKETING = 63049;

/** Twilio's own code for a message outside the 24-hour service window. */
export const OUTSIDE_SERVICE_WINDOW = 63016;

export function deliveryOutcome(
  status: string | null | undefined,
  errorCode: number | null | undefined,
): DeliveryOutcome {
  const state = String(status ?? "").toLowerCase();

  if (state === "delivered" || state === "read") {
    return { delivered: true, pending: false, message: "Review request delivered on WhatsApp" };
  }

  if (state === "undelivered" || state === "failed") {
    if (errorCode === META_BLOCKED_MARKETING) {
      return {
        delivered: false,
        pending: false,
        message:
          "WhatsApp did not deliver this. Meta limits how many marketing messages a person " +
          "receives from all businesses, and blocked this one. Try again in a day, or reply " +
          "from the WhatsApp inbox if the patient has written in the last 24 hours.",
      };
    }
    if (errorCode === OUTSIDE_SERVICE_WINDOW) {
      return {
        delivered: false,
        pending: false,
        message: "WhatsApp did not deliver this - the 24-hour window for this patient has closed.",
      };
    }
    return {
      delivered: false,
      pending: false,
      message: errorCode
        ? `WhatsApp did not deliver this (error ${errorCode}).`
        : "WhatsApp did not deliver this.",
    };
  }

  // queued, sending, sent, accepted, or nothing logged yet. Twilio has it; the
  // patient does not necessarily.
  return {
    delivered: false,
    pending: true,
    message: "Handed to WhatsApp. Delivery is not confirmed yet - check the WhatsApp log shortly.",
  };
}
