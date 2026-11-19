ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zoho_invoice_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zoho_invoice_synced_at timestamptz;
COMMENT ON COLUMN public.invoices.zoho_invoice_id IS 'Zoho Books invoice id, written by zoho-push-invoice once Zoho has created the invoice. A set value blocks any resend.';
COMMENT ON COLUMN public.invoices.zoho_invoice_synced_at IS 'When the invoice was created in Zoho Books.';