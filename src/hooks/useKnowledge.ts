import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useKnowledgeCategories() {
  return useQuery({ queryKey: ["knowledge-categories"], queryFn: async () => {
    const { data, error } = await supabase.from("knowledge_article_categories").select("*").order("sort_order").order("name");
    if (error) throw error;
    return data;
  }});
}
export function useKnowledgeServices() {
  return useQuery({ queryKey: ["knowledge-services"], queryFn: async () => {
    const { data, error } = await supabase.from("services").select("id,name").order("name").limit(1000);
    if (error) throw error;
    return data;
  }});
}
export function useKnowledgeStats(ids: string[]) {
  return useQuery({ queryKey: ["knowledge-stats", [...ids].sort()], enabled: ids.length > 0, queryFn: async () => {
    const { data, error } = await supabase.rpc("knowledge_article_stats", { _ids: ids });
    if (error) throw error;
    return data || [];
  }});
}