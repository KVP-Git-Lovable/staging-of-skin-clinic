-- The delivery log refuses what is not the clinic's.
--
-- 20261014140000 removed the other businesses' messages from this table and
-- taught whatsapp-delivery-sync to ask Twilio only for messages sent from the
-- clinic's own WhatsApp number. Within hours they were all back - 8,211 Trayi
-- Jewellers rows, the newest stamped minutes before the clinic reported it.
--
-- Nothing had failed. The function had not been deployed, and Refresh on the
-- WhatsApp page asks for 180 days of history, so one press ran the old code
-- and pulled the whole shared account back in. Deleting rows is no answer on
-- its own when anyone can undo it with one button, and the deploy is somebody
-- else's to do.
--
-- So the rule moves to where it holds whichever version of the function is
-- running. The sync upserts on message_sid; a before insert trigger returning
-- null skips the row before on conflict ever sees it, the same silent-skip
-- shape stamp_record_owner uses.
--
-- The predicate is deliberately narrower than the one-off cleanup was. That
-- cleanup matched store, orders, products and scheme as well, which was safe
-- because each case was checked by hand against this database - the order ids
-- read INV2026-xxxxx where the clinic's read INV-xxxxx, the clinic has no
-- portal orders, the products named are in no clinic catalogue. Standing in a
-- trigger for ever, those same words are how a clinic message nobody has
-- thought of yet gets dropped in silence. Here only high-signal wording counts,
-- and anything naming the clinic, DermaCare, an appointment, a consultation, a
-- doctor, a patient, a survey or a prescription is ours whatever else it says.
--
-- This is the belt. The deploy is still the braces: it stops the messages being
-- fetched at all, rather than fetched and thrown away on every refresh.

create or replace function public.whatsapp_message_is_foreign(body text)
returns boolean
language sql
immutable
as $$
  select coalesce(body, '') ilike any (array[
           '%Trayi%','%jewel%','%diamond%','%हीरे%','%Making Charges%','%Gold Coin%',
           '%Field Sales Assistant%','%StoreOps%','%QuickApp%','%Your Store Details%',
           '%Indian Food Stores%','%Laxmi Medical Stores%','%Aushadi Dhanvantari%',
           '%Ramakanti Stores%','%Sharma store%','%{{contact.name}}%',
           '%I do not have that information%','%couldn''t assist with that request%',
           '%INV2026-%','%Available Schemes%','%Daily Chai%','%retailer%',
           '%continued patro%','%bestie%','%finely crafted%','%Order Confirmation%'
         ])
     and coalesce(body, '') not ilike '%The Skin Clinic%'
     and coalesce(body, '') not ilike '%DermaCare%'
     and coalesce(body, '') not ilike '%appointment%'
     and coalesce(body, '') not ilike '%consultation%'
     and coalesce(body, '') not ilike '%doctor%'
     and coalesce(body, '') not ilike '%patient%'
     and coalesce(body, '') not ilike '%survey%'
     and coalesce(body, '') not ilike '%prescription%';
$$;

comment on function public.whatsapp_message_is_foreign(text) is
  'True when a WhatsApp body was sent by one of the other businesses on the shared Twilio account. Never true for a clinic message.';

create or replace function public.whatsapp_delivery_log_only_ours()
returns trigger
language plpgsql
as $$
begin
  -- Returning null skips the row rather than raising: the sync writes in
  -- batches of 500, and one rejected row must not fail the other 499.
  if public.whatsapp_message_is_foreign(new.body_preview) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_delivery_log_only_ours on public.whatsapp_delivery_log;
create trigger whatsapp_delivery_log_only_ours
  before insert or update on public.whatsapp_delivery_log
  for each row execute function public.whatsapp_delivery_log_only_ours();

-- What came back, removed again. Both the predicate above and the broader
-- one-off list from 20261014140000, which between them left 844 rows - 723 of
-- them already matched to a patient.
delete from public.whatsapp_delivery_log
 where public.whatsapp_message_is_foreign(body_preview)
    or ((body_preview ilike any (array[
          '%place an order%','%Delivery Status%','%order summary%','%past orders%',
          '%available product%','%happy to invite you%','%happy to inform you about%',
          '%Order: #%','%assist with order%','%your order%','%placing the order%','%Scheme%',
          '%products%','%catalog%','%revenue%','%Order #%','%matching product%',
          '%/piece%','%RED LABEL%','%Nivea%','%store%','%orders%','% order%',
          '%product laun%','%delivery date%','%shop details%'
        ]) or coalesce(body_preview, '') = '')
        and coalesce(body_preview, '') not ilike '%The Skin Clinic%'
        and coalesce(body_preview, '') not ilike '%DermaCare%'
        and coalesce(body_preview, '') not ilike '%appointment%'
        and coalesce(body_preview, '') not ilike '%consultation%'
        and coalesce(body_preview, '') not ilike '%doctor%'
        and coalesce(body_preview, '') not ilike '%patient%'
        and coalesce(body_preview, '') not ilike '%survey%'
        and coalesce(body_preview, '') not ilike '%prescription%');
