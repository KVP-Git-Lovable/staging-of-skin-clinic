ALTER TABLE public.portal_settings
  ADD COLUMN IF NOT EXISTS appointments_booking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appointments_reschedule_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS treatment_history_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS procedure_history_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS clinical_photos_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bills_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS outstanding_balance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS surveys_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_bot_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS our_team_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS clinic_hours_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quick_action_request_appointment_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quick_action_order_medicine_enabled boolean NOT NULL DEFAULT true;