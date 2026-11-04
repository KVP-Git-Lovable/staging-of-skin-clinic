CREATE OR REPLACE FUNCTION public.knowledge_file_visible(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_manage_knowledge() OR (public.is_knowledge_staff() AND EXISTS(SELECT 1 FROM public.knowledge_articles a,jsonb_array_elements(a.resources) r WHERE a.deleted_at IS NULL AND a.status='published' AND a.is_active AND r->>'path'=_path)); $$;
REVOKE ALL ON FUNCTION public.knowledge_file_visible(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.knowledge_file_visible(text) TO authenticated;
ALTER POLICY knowledge_files_read ON storage.objects USING(bucket_id='knowledge-attachments' AND public.knowledge_file_visible(name));
DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef('public.purge_trash_item(uuid)'::regprocedure) INTO def;
 def=replace(def,'  UPDATE public.trash_items', '  IF item.object_type = ''knowledge_articles'' THEN
    IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION ''Only doctors and admins can purge knowledge articles''; END IF;
    DELETE FROM public.knowledge_article_votes WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_article_comments WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_article_opens WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_article_revisions WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_articles WHERE id=item.record_id AND deleted_at IS NOT NULL;
  END IF;
  UPDATE public.trash_items'); EXECUTE def; END $$;
