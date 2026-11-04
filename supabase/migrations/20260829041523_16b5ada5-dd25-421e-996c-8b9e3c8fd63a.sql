ALTER TABLE public.list_views
  ADD COLUMN IF NOT EXISTS filter_match text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

UPDATE public.list_views SET visibility = 'everyone' WHERE is_shared IS TRUE AND visibility = 'private';

DROP POLICY IF EXISTS "Users can view own views" ON public.list_views;

CREATE POLICY "Users can view own and shared views"
ON public.list_views
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() = ANY (shared_with)
  OR visibility = 'everyone'
);