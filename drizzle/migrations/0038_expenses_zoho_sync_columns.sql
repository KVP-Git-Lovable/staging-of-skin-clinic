ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS zoho_expense_id text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS zoho_synced_at timestamptz;
COMMENT ON COLUMN public.expenses.zoho_expense_id IS 'Zoho Books expense_id, written only after a successful push; a set value means the expense must not be sent again.';
COMMENT ON COLUMN public.expenses.zoho_synced_at IS 'When the expense was pushed to Zoho Books; written together with zoho_expense_id.';