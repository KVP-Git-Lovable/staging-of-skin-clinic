export type MatchType = "exact" | "case_insensitive" | "fuzzy" | "starts_with";

export interface MatchField {
  id: string;
  field_key: string;
  matchType: MatchType;
  /** How this field combines with the previous one. */
  joiner: "and" | "or";
  /** What happens when this field matches: warn the user or stop the save. */
  severity?: "alert" | "block";
}


export interface DuplicateNotification {
  title: string;
  message: string;
  severity: "alert" | "error";
  showMatchList: boolean;
}

export interface DuplicateAction {
  key: string;
  label: string;
}

export interface DuplicateRule {
  id: string;
  object_key: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  match_fields: MatchField[];
  notification: DuplicateNotification;
  actions: DuplicateAction[];
  created_at?: string;
  updated_at?: string;
}

export const DUPLICATE_ACTIONS: {
  key: string;
  label: string;
  description: string;
  objects?: string[];
}[] = [
  {
    key: "open_record",
    label: "Go to duplicate record",
    description: "Opens the existing matching record instead of creating a new one.",
  },
  {
    key: "create_appointment",
    label: "Create appointment for this patient",
    description: "Books a new appointment against the existing matching record.",
    objects: ["patients"],
  },
  {
    key: "merge",
    label: "Merge into existing record",
    description: "Copies the new details onto the existing record.",
  },
  {
    key: "ignore",
    label: "Ignore and continue",
    description: "Lets the user save anyway (only possible for alert severity).",
  },
];

export const emptyNotification = (): DuplicateNotification => ({
  title: "Possible duplicate found",
  message: "A similar record already exists: {{match}}",
  severity: "alert",
  showMatchList: true,
});

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
