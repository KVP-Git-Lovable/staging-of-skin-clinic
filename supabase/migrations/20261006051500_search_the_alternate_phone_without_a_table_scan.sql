-- Patient search ORs across five columns. Four carry trigram indexes; the
-- fifth, alternate_phone (added so a patient who gave the clinic both an Indian
-- and an international number is found by either), carried none - and one
-- unindexed column in an OR forces a sequential scan of all five.
--
-- Measured on the live data: the five-column search cost 127ms, and 3.8ms with
-- this index in place. It makes the existing search faster, not only its count.
--
-- Created with CONCURRENTLY on the live database so no write waited on it;
-- recorded here without, because migrations run inside a transaction and the
-- index already exists.
CREATE INDEX IF NOT EXISTS idx_patients_alternate_phone_trgm
  ON public.patients USING gin (alternate_phone gin_trgm_ops);
