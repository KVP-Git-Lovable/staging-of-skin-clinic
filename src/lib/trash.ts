import { supabase } from "@/integrations/supabase/client";

export type TrashStatus = "trashed" | "restored" | "purged";

export interface TrashItem {
  id: string;
  object_type: string;
  record_id: string;
  record_label: string | null;
  record_data: any;
  status: TrashStatus;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  restored_by: string | null;
  restored_at: string | null;
  purged_by: string | null;
  purged_at: string | null;
}

/** Human labels for the objects that support trash. */
export const TRASH_OBJECT_LABELS: Record<string, string> = {
  patients: "Patient",
  appointments: "Appointment",
  procedures: "Procedure",
  invoices: "Invoice",
  pharma_products: "Pharmacy Product",
  pharma_bills: "Pharmacy Bill",
  expenses: "Expense",
  assets: "Asset",
  vendors: "Vendor",
  services: "Service",
  doctors: "Doctor",
  staff: "Staff",
  campaigns: "Campaign",
  portal_orders: "Portal Order",
  survey_templates: "Survey Template",
  survey_responses: "Survey Response",
  patient_photos: "Patient Photo",
  prescriptions: "Prescription",
  list_views: "List View",
  problem_areas: "Problem Area",
  tax_master: "Tax Master",
  hsn_tax_master: "HSN Tax",
  category_master: "Category",
  unit_master: "Unit",
  saved_reports: "Saved Report",
};

export function objectLabel(objectType: string) {
  return TRASH_OBJECT_LABELS[objectType] ?? objectType;
}

/** Soft-delete a record: copies it into Trash then removes it from its table. */
export async function moveToTrash(objectType: string, recordId: string, label?: string) {
  const { error } = await supabase.rpc("move_to_trash" as any, {
    _object_type: objectType,
    _record_id: recordId,
    _label: label ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function moveManyToTrash(objectType: string, ids: string[], labelFor?: (id: string) => string) {
  for (const id of ids) {
    await moveToTrash(objectType, id, labelFor?.(id));
  }
}

export async function restoreFromTrash(trashId: string) {
  const { error } = await supabase.rpc("restore_from_trash" as any, { _trash_id: trashId });
  if (error) throw new Error(error.message);
}

export async function purgeTrashItem(trashId: string) {
  const { error } = await supabase.rpc("purge_trash_item" as any, { _trash_id: trashId });
  if (error) throw new Error(error.message);
}

export async function fetchTrashSettings(): Promise<{ retention_days: number; auto_purge: boolean }> {
  const { data } = await supabase.from("trash_settings" as any).select("*").limit(1).maybeSingle();
  const row = data as any;
  return { retention_days: row?.retention_days ?? 30, auto_purge: !!row?.auto_purge };
}

export async function saveTrashSettings(retentionDays: number, autoPurge: boolean) {
  const { error } = await supabase
    .from("trash_settings" as any)
    .upsert({ id: true, retention_days: retentionDays, auto_purge: autoPurge, updated_at: new Date().toISOString() } as any);
  if (error) throw new Error(error.message);
}

export function purgeAvailableOn(deletedAt: string, retentionDays: number) {
  const d = new Date(deletedAt);
  d.setDate(d.getDate() + retentionDays);
  return d;
}

export function canPurge(deletedAt: string, retentionDays: number) {
  return purgeAvailableOn(deletedAt, retentionDays).getTime() <= Date.now();
}
