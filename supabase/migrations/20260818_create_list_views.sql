-- Create list_views table for storing custom views with filters and display settings
CREATE TABLE public.list_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  section text NOT NULL CHECK (section IN ('appointments', 'procedures')),
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_fields text[] NOT NULL,
  sort_by text NOT NULL DEFAULT 'created_at',
  sort_direction text NOT NULL DEFAULT 'desc' CHECK (sort_direction IN ('asc', 'desc')),
  is_shared boolean DEFAULT false,
  shared_with uuid[] DEFAULT '{}'::uuid[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.list_views ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own views" ON public.list_views
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = ANY(shared_with));

CREATE POLICY "Users can create views" ON public.list_views
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own views" ON public.list_views
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own views" ON public.list_views
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for better query performance
CREATE INDEX idx_list_views_user_id ON public.list_views(user_id);
CREATE INDEX idx_list_views_section ON public.list_views(section);
CREATE INDEX idx_list_views_created_at ON public.list_views(created_at DESC);
