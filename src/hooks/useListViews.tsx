import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Filter {
  field: string;
  operator: string; // 'equals', 'contains', 'is_one_of', etc
  value: string | string[];
}

export interface ListViewConfig {
  id?: string;
  name: string;
  section: "appointments" | "procedures" | "patients" | "billing";
  filters: Filter[];
  displayFields: string[];
  sortBy: string;
  sortDirection: "asc" | "desc";
  isShared?: boolean;
}

export function useListViews(section: "appointments" | "procedures" | "patients" | "billing") {
  const queryClient = useQueryClient();
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  // Fetch all views for the section
  const { data: views = [] } = useQuery({
    queryKey: ["list-views", section],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("list_views")
        .select("*")
        .eq("section", section)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Get current selected view
  const currentView = views.find((v: any) => v.id === selectedViewId) as unknown as
    | {
        id: string;
        name: string;
        section: string;
        filters: Filter[];
        display_fields: string[];
        sort_by: string;
        sort_direction: "asc" | "desc";
        is_shared: boolean;
      }
    | undefined;

  // Create view mutation
  const createViewMutation = useMutation({
    mutationFn: async (config: ListViewConfig) => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("You must be signed in to create a view");
      const { data, error } = await supabase.from("list_views").insert({
        name: config.name,
        section: config.section,
        user_id: userId,
        filters: config.filters as unknown as any,
        display_fields: config.displayFields,
        sort_by: config.sortBy,
        sort_direction: config.sortDirection,
        is_shared: config.isShared || false,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-views", section] });
      toast.success("View created successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create view");
    },
  });

  // Update view mutation
  const updateViewMutation = useMutation({
    mutationFn: async (config: ListViewConfig) => {
      if (!config.id) throw new Error("View ID is required");

      const { data, error } = await supabase
        .from("list_views")
        .update({
          name: config.name,
          filters: config.filters as unknown as any,
          display_fields: config.displayFields,
          sort_by: config.sortBy,
          sort_direction: config.sortDirection,
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-views", section] });
      toast.success("View updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update view");
    },
  });

  // Delete view mutation
  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      const { error } = await supabase
        .from("list_views")
        .delete()
        .eq("id", viewId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-views", section] });
      setSelectedViewId(null);
      toast.success("View deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete view");
    },
  });

  return {
    views,
    currentView,
    selectedViewId,
    setSelectedViewId,
    createView: createViewMutation.mutateAsync,
    updateView: updateViewMutation.mutateAsync,
    deleteView: deleteViewMutation.mutateAsync,
    isCreating: createViewMutation.isPending,
    isUpdating: updateViewMutation.isPending,
    isDeleting: deleteViewMutation.isPending,
  };
}
