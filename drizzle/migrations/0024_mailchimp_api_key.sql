-- The clinic supplies its own Mailchimp API key.
--
-- Until now the key was a backend secret (MAILCHIMP_API_KEY), which meant every
-- clinic needed someone with Lovable access to provision it. It now comes from
-- Email -> Connection -> Configuration and lives here, AES-GCM encrypted by
-- _shared/meta-crypto.ts - the same helper and the same META_TOKEN_ENC_KEY that
-- already protect the Meta token. The plaintext key is never written anywhere
-- and is never sent back to the browser; api_key_last4 exists only so the UI
-- can show which key is in place without decrypting anything.
alter table public.comms_mailchimp_connection
  add column if not exists api_key_enc   text,
  add column if not exists api_key_last4 text;

comment on column public.comms_mailchimp_connection.api_key_enc is
  'Mailchimp API key, AES-GCM encrypted with META_TOKEN_ENC_KEY. Service role only - never select this into a browser response.';
comment on column public.comms_mailchimp_connection.api_key_last4 is
  'Last four characters of the API key, for display as a hint alongside dc. Not a secret.';

-- This table already had RLS on with no policies, so the browser could not read
-- it - but anon and authenticated still held table-level grants, leaving the row
-- one permissive policy away from exposure. Now that a customer's own key lives
-- here, take the grant away too: service_role keeps its own grant, and every
-- read goes through comms-mailchimp-api.
revoke all on public.comms_mailchimp_connection from anon, authenticated;
