CREATE OR REPLACE FUNCTION public.can_manage_knowledge()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.staff s JOIN public.user_roles_config r ON r.id=s.role_id WHERE s.auth_user_id=auth.uid() AND s.is_active IS NOT FALSE AND lower(r.name) IN ('admin','doctor'));
$$;
REVOKE ALL ON FUNCTION public.can_manage_knowledge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_knowledge() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.is_knowledge_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.staff WHERE auth_user_id=auth.uid() AND is_active IS NOT FALSE);
$$;
REVOKE ALL ON FUNCTION public.is_knowledge_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_knowledge_staff() TO authenticated, service_role;
CREATE TABLE public.knowledge_articles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_id uuid NOT NULL REFERENCES public.services(id),
 category_id uuid NOT NULL REFERENCES public.knowledge_article_categories(id),
 title text NOT NULL,
 summary text NOT NULL DEFAULT '',
 gender text NOT NULL DEFAULT 'both' CHECK (gender IN ('both','female','male','other')),
 age_rule text NOT NULL DEFAULT 'all_ages' CHECK (age_rule IN ('all_ages','custom_range')),
 min_age integer,
 max_age integer,
 is_critical boolean NOT NULL DEFAULT false,
 clinical_protocol text NOT NULL DEFAULT '',
 contraindications text NOT NULL DEFAULT '',
 pre_post_care text NOT NULL DEFAULT '',
 complications_management text NOT NULL DEFAULT '',
 sources text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','published')),
 is_active boolean NOT NULL DEFAULT true,
 reviewed_by uuid,
 reviewed_at timestamptz,
 ai_generated boolean NOT NULL DEFAULT false,
 ai_change_summary text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 created_by uuid,
 updated_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT knowledge_age_range CHECK ((age_rule='all_ages' AND min_age IS NULL AND max_age IS NULL) OR (age_rule='custom_range' AND min_age IS NOT NULL AND max_age IS NOT NULL AND min_age>=0 AND max_age>=min_age AND max_age<=150))
);
GRANT SELECT,INSERT,UPDATE ON public.knowledge_articles TO authenticated;
GRANT ALL ON public.knowledge_articles TO service_role;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_read ON public.knowledge_articles FOR SELECT TO authenticated USING (public.can_manage_knowledge() OR (public.is_knowledge_staff() AND status='published' AND is_active));
CREATE POLICY knowledge_create ON public.knowledge_articles FOR INSERT TO authenticated WITH CHECK (public.can_manage_knowledge());
CREATE POLICY knowledge_edit ON public.knowledge_articles FOR UPDATE TO authenticated USING (public.can_manage_knowledge()) WITH CHECK (public.can_manage_knowledge());
CREATE INDEX knowledge_service_status ON public.knowledge_articles(service_id,status,is_active);
CREATE TABLE public.knowledge_article_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 article_id uuid NOT NULL REFERENCES public.knowledge_articles(id),
 revision integer NOT NULL,
 snapshot jsonb NOT NULL,
 changed_by uuid,
 changed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(article_id,revision)
);
GRANT SELECT ON public.knowledge_article_revisions TO authenticated;
GRANT ALL ON public.knowledge_article_revisions TO service_role;
ALTER TABLE public.knowledge_article_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_revision_read ON public.knowledge_article_revisions FOR SELECT TO authenticated USING (public.can_manage_knowledge());
CREATE OR REPLACE FUNCTION public.knowledge_article_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only active doctors and admins can manage knowledge articles' USING ERRCODE='42501'; END IF;
 IF btrim(NEW.title)='' THEN RAISE EXCEPTION 'Article title is required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.knowledge_article_categories WHERE id=NEW.category_id AND is_active) AND (TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN RAISE EXCEPTION 'Choose an active category'; END IF;
 NEW.updated_at=clock_timestamp(); NEW.updated_by=auth.uid();
 IF TG_OP='INSERT' THEN NEW.created_by=auth.uid(); NEW.created_at=clock_timestamp(); NEW.revision=1;
 ELSE NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at; NEW.revision=OLD.revision+1; END IF;
 IF NEW.status IN ('reviewed','published') THEN
  IF btrim(NEW.summary)='' OR btrim(NEW.clinical_protocol)='' THEN RAISE EXCEPTION 'Summary and clinical protocol are required before review or publication'; END IF;
  NEW.reviewed_by=auth.uid(); NEW.reviewed_at=clock_timestamp();
 ELSE NEW.reviewed_by=NULL; NEW.reviewed_at=NULL; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER knowledge_article_guard BEFORE INSERT OR UPDATE ON public.knowledge_articles FOR EACH ROW EXECUTE FUNCTION public.knowledge_article_guard();
CREATE OR REPLACE FUNCTION public.knowledge_article_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.knowledge_article_revisions(article_id,revision,snapshot,changed_by) VALUES(NEW.id,NEW.revision,to_jsonb(NEW),auth.uid()); RETURN NEW;
END; $$;
CREATE TRIGGER knowledge_article_snapshot AFTER INSERT OR UPDATE ON public.knowledge_articles FOR EACH ROW EXECUTE FUNCTION public.knowledge_article_snapshot();
CREATE TABLE public.knowledge_ai_state (
 id text PRIMARY KEY DEFAULT 'knowledge' CHECK (id='knowledge'),
 reason text NOT NULL,
 status_code integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,DELETE ON public.knowledge_ai_state TO authenticated;
GRANT ALL ON public.knowledge_ai_state TO service_role;
ALTER TABLE public.knowledge_ai_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_ai_state_read ON public.knowledge_ai_state FOR SELECT TO authenticated USING (public.can_manage_knowledge());
CREATE POLICY knowledge_ai_state_resume ON public.knowledge_ai_state FOR DELETE TO authenticated USING (public.is_admin_user());