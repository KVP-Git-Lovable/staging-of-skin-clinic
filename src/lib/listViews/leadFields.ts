// Field config for the Leads saved-views system (same shape as procedureFields.ts).
import type { FieldDef } from "./engine";

export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "appointment_booked", label: "Appointment booked" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export const LEAD_SOURCES = ["Meta Lead Ad", "Walk-in", "Phone enquiry", "Website", "Referral", "Google", "Facebook", "Instagram", "Advertisement", "Other"];

export const LEAD_VIEW_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "source", label: "Source", type: "picklist", optionsSource: "source" },
  { key: "interest", label: "Interest", type: "text" },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status" },
  { key: "owner_id", label: "Owner", type: "picklist", optionsSource: "owner" },
  { key: "created_at", label: "Created Date", type: "date" },
  { key: "updated_at", label: "Last Modified", type: "date" },
];

export const DEFAULT_LEAD_VIEW_COLUMNS = ["name", "phone", "source", "interest", "status", "owner_id", "created_at"];
