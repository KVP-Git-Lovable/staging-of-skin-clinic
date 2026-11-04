/**
 * Which list view a module opens on.
 *
 * Two mechanisms, and for a long time the wrong one won. Pinning wrote
 * is_default to the database; opening the page read the last view clicked, out
 * of the browser, and consulted the pin only when that was missing. Since the
 * pin button deliberately does not select the row it pins, a pinned view lost
 * to any earlier click on every remount - and the page remounts on every tab
 * change.
 *
 * Worse, is_default was a single column on a row that may be shared with the
 * whole clinic, so it was never one person's answer: the front desk opened the
 * menu, found a colleague's pinned view already flagged, and pressed the pin -
 * which the UI read as "unpin" and which moved them to All Appointments. The
 * pin now lives in list_view_defaults, one row per person per module, and
 * `pinned` here is that person's own.
 *
 * The rule, stated once rather than buried in an effect:
 *
 *   1. what you were last looking at in this session, if it still resolves;
 *   2. otherwise your pin, which is why opening the app fresh lands there;
 *   3. otherwise All.
 *
 * Step 1 lasts as long as the visit to the module and no longer - see
 * moduleChoice.ts. Opening a record and coming back keeps what you clicked;
 * going to another module, or reloading, hands the decision back to the pin.
 * Kept in sessionStorage it outlived the visit, so one click on All
 * Appointments beat the pin for the rest of the day on a tab the clinic never
 * closes, which is how a pinned view came to look broken.
 */

import { ALL_VIEW_ID, isStandardViewId } from "./standardViews";

export interface PickableView {
  id: string;
}

export interface PickActiveView {
  /** The id remembered for this session on this browser, if any. */
  stored?: string | null;
  /** This user's own pinned view id, from list_view_defaults. */
  pinned?: string | null;
  views: PickableView[];
}

export interface ActiveViewChoice {
  id: string;
  /** True when `stored` named a view this user can no longer see. */
  forget: boolean;
}

const resolves = (id: string | null | undefined, views: PickableView[]): boolean =>
  isStandardViewId(id) || (!!id && views.some((v) => v.id === id));

export function pickActiveView({ stored, pinned, views }: PickActiveView): ActiveViewChoice {
  if (resolves(stored, views)) return { id: stored as string, forget: false };

  // A remembered id that no longer resolves is forgotten rather than kept for
  // ever. Clinic machines are shared, so it was often another user's private
  // view - it could never resolve for this one, and the page fell back
  // silently on every load.
  const forget = Boolean(stored);

  // A pin may name a view somebody else owns and shared, which is the usual
  // case here: the clinic's landing view was created by one person for all of
  // them. It may also name a deleted view, and then there is nothing to go to.
  if (resolves(pinned, views)) return { id: pinned as string, forget };

  return { id: ALL_VIEW_ID, forget };
}

