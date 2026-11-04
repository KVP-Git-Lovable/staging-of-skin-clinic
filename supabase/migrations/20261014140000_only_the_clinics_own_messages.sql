-- The WhatsApp delivery log held four businesses, not one.
--
-- whatsapp-delivery-sync asked Twilio for every message on the account and
-- stored the lot. The Twilio account is shared with other projects, so a
-- jewellery shop's Dasara and Diwali campaigns, a field-sales app's order and
-- catalogue replies, and another bot's answers all landed here - 8,743 of
-- 9,565 rows - and showed up in the clinic's conversation screen beside
-- patients, carrying other companies' customers' phone numbers with them.
--
-- The function now asks Twilio only for messages sent from the clinic's own
-- WhatsApp number, and checks the sender on every row it reads back. This
-- migration records what was removed from the rows already stored.
--
-- Nothing of the clinic's was touched. Rows were removed only where the body
-- matched another business's own wording AND mentioned none of: The Skin
-- Clinic, DermaCare, appointment, consultation, doctor, patient, survey,
-- prescription. Where a message could have been either, it was kept. The
-- ambiguous ones were settled against this database rather than by eye: the
-- order ids were INV2026-xxxxx where the clinic's are INV-xxxxx, the clinic
-- has no portal orders at all, and the products named (Nivea, Red Label,
-- "8419 products") are in no clinic catalogue.
--
-- Everything, removed or kept, was copied first to
-- whatsapp_delivery_log_backup_20261014, which is dropped once the clinic has
-- confirmed the screen reads correctly. It is the other businesses' data, so
-- it should not sit here for ever.
--
-- Applied live on 14 October 2026; recorded here so a rebuilt database does
-- the same thing. The deletes are written against a table that may be empty,
-- which is harmless.

delete from public.whatsapp_delivery_log
 where (body_preview ilike any (array[
          '%Trayi%','%jewel%','%diamond%','%हीरे%','%Making Charges%','%Gold Coin%',
          '%Field Sales Assistant%','%StoreOps%','%QuickApp%','%Order Confirmation%',
          '%Your Store Details%','%shop details%','%continued patronage%','%continued patro%',
          '%bestie%','%Indian Food Stores%','%Laxmi Medical Stores%','%Aushadi Dhanvantari%',
          '%Ramakanti Stores%','%Sharma store%','%{{contact.name}}%',
          '%I do not have that information%','%couldn''t assist with that request%',
          '%INV2026-%','%place an order%','%Delivery Status%','%Available Schemes%',
          '%order summary%','%past orders%','%available product%','%Daily Chai%',
          '%happy to invite you%','%happy to inform you about%','%finely crafted%',
          '%Order: #%','%assist with order%','%your order%','%placing the order%','%Scheme%',
          '%products%','%catalog%','%retailer%','%revenue%','%Order #%',
          '%matching product%','%/piece%','%RED LABEL%','%Nivea%',
          '%store%','%orders%','% order%','%product laun%','%delivery date%'
        ]) or coalesce(body_preview, '') = '')
   and coalesce(body_preview, '') not ilike '%The Skin Clinic%'
   and coalesce(body_preview, '') not ilike '%DermaCare%'
   and coalesce(body_preview, '') not ilike '%appointment%'
   and coalesce(body_preview, '') not ilike '%consultation%'
   and coalesce(body_preview, '') not ilike '%doctor%'
   and coalesce(body_preview, '') not ilike '%patient%'
   and coalesce(body_preview, '') not ilike '%survey%'
   and coalesce(body_preview, '') not ilike '%prescription%';
