/**
 * Saving a template's questions without throwing away the answers.
 *
 * The form used to save by deleting every question of the template and
 * inserting the list again. That gave each question a NEW id every time
 * anybody pressed Save, and survey_responses.answers is keyed by question id -
 * so each save quietly cut old answers loose from the questions they answered.
 * It had already happened: three of the eleven answer keys in the live
 * responses pointed at questions that no longer existed.
 *
 * It also made the clinic's own settings impossible. A picture they uploaded,
 * the help text they wrote, a question they marked optional - all of it lives
 * on the question row, and all of it would have been deleted by the next save
 * of that template.
 *
 * So a question keeps its id for life. This works out what actually changed:
 * the ones to update, the genuinely new ones to insert, and only those the
 * clinic really removed to delete.
 */

export interface QuestionDraft {
  /** Absent on a question the clinic has just added and not yet saved. */
  id?: string;
}

export interface QuestionSyncPlan<T extends QuestionDraft> {
  update: (T & { id: string; sort_order: number })[];
  insert: (Omit<T, "id"> & { sort_order: number })[];
  deleteIds: string[];
}

/**
 * What to do to the database to make it match the list on screen.
 *
 * `sort_order` comes from the position in the list, which is what reordering
 * means here - the clinic drags a question up and its order follows.
 *
 * An id on screen that is not in the database is treated as new rather than
 * updated, so a stale draft cannot resurrect a deleted row.
 */
export function questionSyncPlan<T extends QuestionDraft>(
  existingIds: string[],
  questions: T[],
): QuestionSyncPlan<T> {
  const known = new Set(existingIds);
  const kept = new Set<string>();
  const update: QuestionSyncPlan<T>["update"] = [];
  const insert: QuestionSyncPlan<T>["insert"] = [];

  questions.forEach((q, index) => {
    const withOrder = { ...q, sort_order: index };
    if (q.id && known.has(q.id)) {
      kept.add(q.id);
      update.push(withOrder as T & { id: string; sort_order: number });
    } else {
      const { id: _dropped, ...rest } = withOrder;
      insert.push(rest as Omit<T, "id"> & { sort_order: number });
    }
  });

  return { update, insert, deleteIds: existingIds.filter((id) => !kept.has(id)) };
}
