CREATE TABLE IF NOT EXISTS public.sf_backfill_staging (
  kind text NOT NULL,
  key text NOT NULL,
  value text
);
GRANT SELECT, INSERT ON public.sf_backfill_staging TO service_role;
GRANT SELECT, INSERT ON public.sf_backfill_staging TO sandbox_exec;
GRANT ALL ON public.sf_backfill_staging TO service_role;
ALTER TABLE public.sf_backfill_staging ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sf_backfill_staging_kind_key_idx ON public.sf_backfill_staging (kind, key);