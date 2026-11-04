-- One row per WhatsApp number, so the conversation list can page conversations.
--
-- The review page used to build its list by fetching the newest hundred
-- MESSAGES and grouping them by number in the browser. That showed only the
-- numbers that happened to fall inside that window - 37 of the clinic's 154 -
-- and the rest could not be reached without loading every message, which is
-- the bulk load this page exists to avoid.
--
-- This view answers the list's actual question instead: for each number, when
-- it last spoke, how long the conversation runs, what the last message said,
-- and which patient it belongs to. Reading is still gated by the base tables'
-- own policies (security_invoker), and the page stays read-only.
CREATE OR REPLACE VIEW public.whatsapp_conversation_threads
WITH (security_invoker = true) AS
WITH per_phone AS (
  SELECT
    c.phone,
    max(c.created_at) AS last_at,
    count(*)          AS message_count,
    (array_agg(c.content   ORDER BY c.created_at DESC))[1] AS last_content,
    (array_agg(c.direction ORDER BY c.created_at DESC))[1] AS last_direction,
    -- The number may have been matched to a patient only on later messages,
    -- so take the most recent non-null rather than the newest row's value.
    (array_agg(c.patient_id ORDER BY c.created_at DESC)
       FILTER (WHERE c.patient_id IS NOT NULL))[1]         AS patient_id
  FROM public.whatsapp_conversations c
  GROUP BY c.phone
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

COMMENT ON VIEW public.whatsapp_conversation_threads IS
  'One row per WhatsApp number: last message, message count and matched patient. Read-only; feeds the conversation list on WhatsApp Delivery.';
