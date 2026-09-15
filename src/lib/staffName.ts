/** Prefix a person's name with "Dr." unless it already starts with Dr/Dr. */
export const withDrPrefix = (name: string) => {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return /^dr\.?\s/i.test(clean) ? clean.replace(/^dr\.?\s/i, "Dr. ") : `Dr. ${clean}`;
};
