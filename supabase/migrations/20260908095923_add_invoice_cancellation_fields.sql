-- "Deleting" an invoice used to hard-delete it (via the generic Trash
-- system), which removed the row entirely and left a gap in the invoice
-- number sequence with no record of why - an audit red flag. Invoices
-- now get cancelled in place instead (status = 'Cancelled'), keeping the
-- row and its invoice_number intact. These columns record why, when, and
-- by whom, and surface in the Invoices & Revenue report.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_name text;
