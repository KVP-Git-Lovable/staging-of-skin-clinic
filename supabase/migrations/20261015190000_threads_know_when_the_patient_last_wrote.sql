-- A conversation thread records when the PATIENT last wrote.
--
-- The unread mark shipped yesterday and could never fire. It asked whether the
-- thread's last message came in - and no thread's does: whatsapp-webhook
-- answers every patient message automatically ("Thanks for confirming", "To
-- modify or cancel your booking, please call us"), so all 346 threads end
-- outbound. The bot replying is not a person reading, and the case that
-- matters looks exactly like the one that failed: the patient writes "I need
-- to modify", the bot says "please call us", and somebody still has to act.
--
-- So the view carries the patient's own last message, and unread is counted
-- from that. Null for a number the clinic has only ever messaged.
--
-- Dropped and recreated rather than replaced: Postgres will not let a column
-- be inserted into the middle of a view, and last_inbound_at goes last to keep
-- the rest of the shape exactly as it was.

drop view if exists public.whatsapp_conversation_threads;

create view public.whatsapp_conversation_threads as
 with per_phone as (
   select m.phone,
          max(m.created_at) as last_at,
          count(*) as message_count,
          (array_agg(m.content order by m.created_at desc))[1] as last_content,
          (array_agg(m.direction order by m.created_at desc))[1] as last_direction,
          (array_agg(m.patient_id order by m.created_at desc) filter (where m.patient_id is not null))[1] as patient_id,
          max(m.created_at) filter (where m.direction = 'inbound') as last_inbound_at
     from whatsapp_thread_messages m
    group by m.phone
 )
 select t.phone,
        t.last_at,
        t.message_count,
        t.last_content,
        t.last_direction,
        t.patient_id,
        p.first_name,
        p.last_name,
        t.last_inbound_at
   from per_phone t
   left join patients p on p.id = t.patient_id;
