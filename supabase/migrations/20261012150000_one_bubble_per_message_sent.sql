-- One bubble per message actually sent.
--
-- The bot's own replies are written twice. The webhook records what it sends
-- into whatsapp_conversations, and - now that whatsapp-delivery-sync records
-- every outbound WhatsApp message rather than only appointment confirmations
-- - Twilio hands the same message back into whatsapp_delivery_log. Both rows
-- carry the same Twilio SID, so the thread drew each bot reply twice: all 355
-- of them, which is every outbound row the webhook has ever written.
--
-- The webhook's copy wins. It is the one the bot composed, it carries the
-- conversation role, and it arrives the moment the message is sent rather
-- than whenever someone next presses Refresh. The delivery-log row still
-- exists and still drives the delivery page; it is simply not drawn a second
-- time in the thread.
CREATE OR REPLACE VIEW public.whatsapp_thread_messages
WITH (security_invoker = true) AS
SELECT
  c.id::text    AS id,
  c.phone       AS phone,
  c.patient_id  AS patient_id,
  c.direction   AS direction,
  c.content     AS content,
  c.created_at  AS created_at,
  'reply'::text AS source,
  NULL::text    AS status
FROM public.whatsapp_conversations c
UNION ALL
SELECT
  'sent:' || d.message_sid,
  d.phone,
  d.patient_id,
  'outbound'::text,
  COALESCE(d.body_preview, ''),
  d.sent_at,
  'sent'::text,
  d.status
FROM public.whatsapp_delivery_log d
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_conversations c
   WHERE c.message_sid = d.message_sid
);
