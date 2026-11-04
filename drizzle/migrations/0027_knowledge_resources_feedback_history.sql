ALTER TABLE public.knowledge_articles ADD COLUMN resources jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN deleted_at timestamptz, ADD COLUMN created_by_name text, ADD COLUMN updated_by_name text;
ALTER TABLE public.knowledge_article_revisions ADD COLUMN changed_by_name text, ADD COLUMN changes jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.knowledge_article_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; actor text;
BEGIN
 IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only active doctors and admins can manage knowledge articles' USING ERRCODE='42501'; END IF;
 IF btrim(NEW.title)='' THEN RAISE EXCEPTION 'Article title is required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.knowledge_article_categories WHERE id=NEW.category_id AND is_active) AND (TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN RAISE EXCEPTION 'Choose an active category'; END IF;
 IF jsonb_typeof(NEW.resources)<>'array' OR jsonb_array_length(NEW.resources)>50 THEN RAISE EXCEPTION 'Invalid article resources'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(NEW.resources) LOOP
  IF coalesce(r->>'kind','') NOT IN ('file','image','link','video','article') OR coalesce(btrim(r->>'title'),'')='' THEN RAISE EXCEPTION 'Resource title and type are required'; END IF;
  IF r->>'path' IS NOT NULL THEN
   IF r->>'path' !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$' THEN RAISE EXCEPTION 'Invalid attachment path'; END IF;
  ELSIF r->>'kind'='article' THEN
   IF NOT EXISTS(SELECT 1 FROM public.knowledge_articles WHERE id::text=r->>'article_id' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Related article not found'; END IF;
  ELSIF coalesce(r->>'url','') !~ '^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'Resource links must use http or https'; END IF;
 END LOOP;
 SELECT coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),'Staff member') INTO actor FROM public.staff WHERE auth_user_id=auth.uid() LIMIT 1;
 NEW.updated_at=clock_timestamp(); NEW.updated_by=auth.uid(); NEW.updated_by_name=actor;
 IF TG_OP='INSERT' THEN NEW.created_by=auth.uid(); NEW.created_at=clock_timestamp(); NEW.created_by_name=actor; NEW.revision=1;
 ELSE NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at; NEW.created_by_name=OLD.created_by_name; NEW.revision=OLD.revision+1; END IF;
 IF NEW.status IN ('reviewed','published') THEN
  IF btrim(NEW.summary)='' OR btrim(NEW.clinical_protocol)='' THEN RAISE EXCEPTION 'Summary and clinical protocol are required before review or publication'; END IF;
  NEW.reviewed_by=auth.uid(); NEW.reviewed_at=clock_timestamp();
 ELSE NEW.reviewed_by=NULL; NEW.reviewed_at=NULL; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.knowledge_article_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE diff jsonb;
BEGIN
 IF TG_OP='INSERT' THEN diff=jsonb_build_object('created',jsonb_build_object('before',null,'after',NEW.title));
 ELSE SELECT coalesce(jsonb_object_agg(n.key,jsonb_build_object('before',o.value,'after',n.value)),'{}'::jsonb) INTO diff FROM jsonb_each(to_jsonb(NEW)) n LEFT JOIN jsonb_each(to_jsonb(OLD)) o ON n.key=o.key WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('updated_at','updated_by','updated_by_name','revision','reviewed_at','reviewed_by'); END IF;
 INSERT INTO public.knowledge_article_revisions(article_id,revision,snapshot,changed_by,changed_by_name,changes) VALUES(NEW.id,NEW.revision,to_jsonb(NEW),auth.uid(),NEW.updated_by_name,diff); RETURN NEW;
END $$;
ALTER POLICY knowledge_read ON public.knowledge_articles USING (deleted_at IS NULL AND (public.can_manage_knowledge() OR (public.is_knowledge_staff() AND status='published' AND is_active)));
CREATE TABLE public.knowledge_article_votes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),article_id uuid NOT NULL REFERENCES public.knowledge_articles(id),user_id uuid NOT NULL DEFAULT auth.uid(),vote smallint NOT NULL CHECK(vote IN (-1,1)),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(article_id,user_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.knowledge_article_votes TO authenticated; GRANT ALL ON public.knowledge_article_votes TO service_role;
ALTER TABLE public.knowledge_article_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_votes_read ON public.knowledge_article_votes FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.knowledge_articles a WHERE a.id=article_id));
CREATE POLICY knowledge_votes_write ON public.knowledge_article_votes FOR ALL TO authenticated USING(user_id=auth.uid() AND public.can_manage_knowledge()) WITH CHECK(user_id=auth.uid() AND public.can_manage_knowledge() AND EXISTS(SELECT 1 FROM public.knowledge_articles a WHERE a.id=article_id));
CREATE TABLE public.knowledge_article_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),article_id uuid NOT NULL REFERENCES public.knowledge_articles(id),user_id uuid NOT NULL DEFAULT auth.uid(),author_name text NOT NULL DEFAULT '',body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.knowledge_article_comments TO authenticated; GRANT ALL ON public.knowledge_article_comments TO service_role;
ALTER TABLE public.knowledge_article_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_comments_read ON public.knowledge_article_comments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.knowledge_articles a WHERE a.id=article_id));
CREATE POLICY knowledge_comments_write ON public.knowledge_article_comments FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.can_manage_knowledge() AND EXISTS(SELECT 1 FROM public.knowledge_articles a WHERE a.id=article_id));
CREATE OR REPLACE FUNCTION public.knowledge_comment_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.user_id=auth.uid(); NEW.created_at=clock_timestamp(); SELECT coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),'Doctor') INTO NEW.author_name FROM public.staff WHERE auth_user_id=auth.uid() LIMIT 1; RETURN NEW; END $$;
CREATE TRIGGER knowledge_comment_stamp BEFORE INSERT ON public.knowledge_article_comments FOR EACH ROW EXECUTE FUNCTION public.knowledge_comment_stamp();
CREATE TABLE public.knowledge_article_opens(id uuid PRIMARY KEY,article_id uuid NOT NULL REFERENCES public.knowledge_articles(id),user_id uuid NOT NULL DEFAULT auth.uid(),opened_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.knowledge_article_opens TO authenticated; GRANT ALL ON public.knowledge_article_opens TO service_role;
ALTER TABLE public.knowledge_article_opens ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_opens_read ON public.knowledge_article_opens FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.knowledge_articles a WHERE a.id=article_id));
CREATE POLICY knowledge_opens_insert ON public.knowledge_article_opens FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.is_knowledge_staff() AND EXISTS(SELECT 1 FROM public.knowledge_articles a WHERE a.id=article_id));
CREATE INDEX knowledge_comments_article ON public.knowledge_article_comments(article_id,created_at DESC);
CREATE INDEX knowledge_opens_article ON public.knowledge_article_opens(article_id);
CREATE OR REPLACE FUNCTION public.knowledge_article_stats(_ids uuid[]) RETURNS TABLE(article_id uuid,likes bigint,dislikes bigint,comments bigint,opens bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT a.id,(SELECT count(*) FROM public.knowledge_article_votes v WHERE v.article_id=a.id AND vote=1),(SELECT count(*) FROM public.knowledge_article_votes v WHERE v.article_id=a.id AND vote=-1),(SELECT count(*) FROM public.knowledge_article_comments c WHERE c.article_id=a.id),(SELECT count(*) FROM public.knowledge_article_opens o WHERE o.article_id=a.id) FROM public.knowledge_articles a WHERE a.id=ANY(_ids); $$;
REVOKE ALL ON FUNCTION public.knowledge_article_stats(uuid[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.knowledge_article_stats(uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.trash_knowledge_article(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.knowledge_articles; actor text; BEGIN
 IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only doctors and admins can delete articles' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.knowledge_articles WHERE id=_id AND deleted_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Article not found'; END IF;
 SELECT btrim(concat_ws(' ',first_name,last_name)) INTO actor FROM public.staff WHERE auth_user_id=auth.uid() LIMIT 1;
 INSERT INTO public.trash_items(object_type,record_id,record_label,record_data,child_data,deleted_by,deleted_by_name) VALUES('knowledge_articles',a.id,a.title,to_jsonb(a),'[]'::jsonb,auth.uid(),actor);
 UPDATE public.knowledge_articles SET deleted_at=clock_timestamp() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.trash_knowledge_article(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.trash_knowledge_article(uuid) TO authenticated;
DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef('public.restore_from_trash(uuid)'::regprocedure) INTO def;
 def=replace(def,'  v_sf := item.record_data->>''sf_id'';', '  IF item.object_type = ''knowledge_articles'' THEN
    IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION ''Only doctors and admins can restore articles''; END IF;
    UPDATE public.knowledge_articles SET deleted_at=NULL WHERE id=item.record_id AND deleted_at IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION ''Article is already restored or unavailable''; END IF;
    UPDATE public.trash_items SET status=''restored'',restored_at=now(),restored_by=auth.uid() WHERE id=_trash_id;
    RETURN;
  END IF;
  v_sf := item.record_data->>''sf_id'';'); EXECUTE def; END $$;
CREATE POLICY knowledge_files_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='knowledge-attachments' AND (storage.foldername(name))[1]=auth.uid()::text AND public.can_manage_knowledge());
CREATE POLICY knowledge_files_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='knowledge-attachments' AND (public.can_manage_knowledge() OR EXISTS(SELECT 1 FROM public.knowledge_articles a,jsonb_array_elements(a.resources) r WHERE r->>'path'=name)));
