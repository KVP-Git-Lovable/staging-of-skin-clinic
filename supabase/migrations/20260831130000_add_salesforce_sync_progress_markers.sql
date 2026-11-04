-- Per-patient markers for whether the Salesforce clinical/pictures/attachments
-- sync has already processed them, so a "Sync from Salesforce" button in the
-- UI can find exactly the pending work on every click without re-scanning
-- everyone or tracking a position cursor (a cursor breaks the moment a new
-- patient gets linked to Salesforce after earlier ones were already synced,
-- since linking order and creation order aren't the same).

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sf_clinical_synced_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sf_pictures_synced_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sf_attachments_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_patients_sf_clinical_pending
  ON public.patients (created_at) WHERE sf_id IS NOT NULL AND sf_clinical_synced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_sf_pictures_pending
  ON public.patients (created_at) WHERE sf_id IS NOT NULL AND sf_pictures_synced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_sf_attachments_pending
  ON public.patients (created_at) WHERE sf_id IS NOT NULL AND sf_attachments_synced_at IS NULL;
