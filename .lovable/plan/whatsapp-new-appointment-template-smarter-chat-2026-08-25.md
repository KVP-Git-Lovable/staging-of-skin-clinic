# WhatsApp: new appointment template + smarter chat

## 1. New appointment-confirmation template

Switch the new-appointment WhatsApp message to Twilio template `HX3605e6c6e69354ac1eba0b5858fba0c0`, which has two quick-reply buttons ("I need to modify", "I want to cancel").

Variables sent:

- `{{1}}` patient name (with Mr./Ms. title as today)
- `{{2}}` appointment date and time (e.g. "Friday, 23 May 2026 at 12:00 PM", IST)
- `{{3}}` service name (defaults to "Consultation")

The sender number, credentials and all other appointment logic stay untouched. The old 5-variable payload (clinic phone / city) is dropped since the new template only takes three.

## 2. Button handling in the WhatsApp chat

When a patient taps a button, Twilio delivers it to the existing inbound webhook as a normal message plus button metadata. The webhook will:

- Detect the button press (button payload/text, or the exact phrases "I need to modify" / "I want to cancel").
- Resolve which appointment it refers to: the patient's next upcoming non-cancelled appointment.
- **I need to modify** → reply politely with this Whatsapp message "To modify or cancel your booking, please call us on +91 96201 23030 / +91 63607 53030.  
The Skin Clinic, Mangalore"
- **I want to cancel** → reply politely with this Whatsapp message ""To modify or cancel your booking, please call us on +91 96201 23030 / +91 63607 53030.  
The Skin Clinic, Mangalore"
- If no upcoming appointment is found, reply politely asking them to confirm which appointment, and let the normal AI flow take over.

Both inbound and outbound messages keep being logged to the conversation history as today.

## 3. Better understanding of generic messages

For anything that is not a button press, keep using the AI assistant but make it more capable at free-text intent:

- Expand the system prompt with explicit intent guidance: reschedule/cancel/booking, clinic timings and location, pricing or service enquiries, order/delivery status, prescription or report questions, complaints/feedback, and "talk to a human".
- Instruct it to infer intent from vague or mixed-language (Hinglish/Kannada-English) phrasing, ask one short clarifying question when genuinely ambiguous instead of guessing, and always end with a helpful next step.
- Give it the patient's upcoming appointments context so "change my appointment" works without the patient specifying which one.
- Non-medical fallback: for anything it cannot handle, it offers to connect the patient with the clinic instead of replying "I don't understand".
- Keep the existing guardrails: no diagnosis, confirm before any booking/cancel/reschedule/order, short WhatsApp-friendly replies.

## Technical notes

- `supabase/functions/send-appointment-whatsapp/index.ts`: new `TEMPLATE_SID`, 3-variable `ContentVariables`, combined IST date+time string.
- `supabase/functions/whatsapp-webhook/index.ts`: read `ButtonText` / `ButtonPayload` (and `ListId`) from the Twilio form payload; add a pre-AI fast path for the two button intents using the existing `cancel_appointment` logic; extend the system prompt and inject upcoming-appointment context.
- Both functions are redeployed after the edit; no schema changes, no changes to `send-appointment-update-whatsapp` or the recurring variants.