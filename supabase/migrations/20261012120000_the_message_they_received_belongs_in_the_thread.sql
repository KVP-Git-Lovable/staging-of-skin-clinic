-- Show the patient the whole exchange, not only their half of it.
--
-- whatsapp_conversations is written by the webhook, so it holds a patient's
-- reply and the bot's answer to it - but not the message the clinic sent that
-- the patient was replying TO. That message is Twilio's, and it reaches us
-- through whatsapp_delivery_log. A thread built from conversations alone opens
-- on the patient saying "Confirm" with nothing above it to confirm, which is
-- what the front desk reported.
--
-- whatsapp_thread_messages puts both back on one timeline, keyed by phone. The
-- delivery log's rows are outbound by definition and carry Twilio's status, so
-- a message that never reached the phone can be drawn as such instead of
-- looking like one that did. The two tables share no message SID, so nothing
-- appears twice.
--
-- security_invoker keeps each table's own rules: whatsapp_conversations is
-- readable by any authenticated staff member, whatsapp_delivery_log only
-- within the reader's data scope. Neither is widened here, and the page
-- remains read-only.
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
FROM public.whatsapp_delivery_log d;

COMMENT ON VIEW public.whatsapp_thread_messages IS
  'One timeline per WhatsApp number: replies and bot answers from whatsapp_conversations, messages the clinic sent from whatsapp_delivery_log. Read-only.';

-- The conversation list now counts, dates and previews the same timeline, so a
-- number the clinic has written to shows up even if it never wrote back.
CREATE OR REPLACE VIEW public.whatsapp_conversation_threads
WITH (security_invoker = true) AS
WITH per_phone AS (
  SELECT
    m.phone,
    max(m.created_at) AS last_at,
    count(*)          AS message_count,
    (array_agg(m.content   ORDER BY m.created_at DESC))[1] AS last_content,
    (array_agg(m.direction ORDER BY m.created_at DESC))[1] AS last_direction,
    -- The number may have been matched to a patient only on later messages,
    -- so take the most recent non-null rather than the newest row's value.
    (array_agg(m.patient_id ORDER BY m.created_at DESC)
       FILTER (WHERE m.patient_id IS NOT NULL))[1]         AS patient_id
  FROM public.whatsapp_thread_messages m
  GROUP BY m.phone
)
SELECT
  t.phone,
  t.last_at,
  t.message_count,
  t.last_content,
  t.last_direction,
  t.patient_id,
  p.first_name,
  p.last_name
FROM per_phone t
LEFT JOIN public.patients p ON p.id = t.patient_id;
