-- Google-Keep-style freeform notes on a procedure. Named "procedure_sticky_notes"
-- (not "procedure_notes") because that name is already taken in meaning by
-- procedures.procedure_notes / procedure_services.procedure_notes (clinical
-- treatment notes per service line) - keeping this table distinctly named
-- avoids confusion with that existing column.

CREATE TABLE public.procedure_sticky_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL DEFAULT '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX procedure_sticky_notes_procedure_updated_idx
  ON public.procedure_sticky_notes (procedure_id, updated_at DESC);

ALTER TABLE public.procedure_sticky_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth manage procedure_sticky_notes" ON public.procedure_sticky_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reuses the existing generic audit-stamp trigger (already attached to ~19
-- other tables) - stamps created_by/updated_by from auth.uid() server-side,
-- so a client can never spoof who created or edited a note.
CREATE TRIGGER stamp_audit_user BEFORE INSERT OR UPDATE ON public.procedure_sticky_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_user();

CREATE TRIGGER procedure_sticky_notes_updated_at BEFORE UPDATE ON public.procedure_sticky_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
