/**
 * Patient photos are saved one at a time, as they are taken.
 *
 * The clinic photographs a patient on an iPhone, through the phone's own
 * full-screen camera. Every photo used to be held in React state until the
 * Upload button was pressed - and while the native camera is in the
 * foreground iOS suspends the web app and, holding several multi-megabyte
 * File objects, routinely discards it. The installed app then relaunches at
 * its start URL, which is what the clinic saw as "it goes back
 * automatically", and `shots` was gone with every photo in it.
 *
 * Nothing could survive that, because nothing was written anywhere until the
 * final press. So each photo is now uploaded the moment it comes back from
 * the camera, before the next one is taken: nothing is ever held waiting, and
 * the phone killing the app can no longer lose a picture of a patient.
 *
 * This file is the part of that with no network and no React in it, so the
 * rule can be proved rather than only read.
 */

export type ShotStatus = "uploading" | "saved" | "failed";

export interface QueuedShot {
  file: File;
  /**
   * An object URL - the thumbnail, and the shot's identity. A fresh one comes
   * back from every createObjectURL call, so two copies of the same photo are
   * still two shots.
   */
  url: string;
  status: ShotStatus;
  /** The patient_photos row, once it exists. Only a saved shot has one. */
  photoId?: string;
}

export interface PhotoQueueSummary {
  uploading: number;
  saved: number;
  failed: number;
  total: number;
}

export function photoQueueSummary(shots: readonly { status: ShotStatus }[]): PhotoQueueSummary {
  return {
    uploading: shots.filter((s) => s.status === "uploading").length,
    saved: shots.filter((s) => s.status === "saved").length,
    failed: shots.filter((s) => s.status === "failed").length,
    total: shots.length,
  };
}

/**
 * What the one button at the bottom does.
 *
 * Saving comes first: while anything is still going in, pressing anything
 * else would either close over an upload or send a photo twice. Failures come
 * next, because they are the only thing left to act on. Otherwise every photo
 * is on the record and there is nothing to do but close.
 */
export type PhotoQueueAction = "saving" | "retry" | "done";

export function photoQueueAction(summary: PhotoQueueSummary): PhotoQueueAction {
  if (summary.uploading > 0) return "saving";
  if (summary.failed > 0) return "retry";
  return "done";
}

/** The words on it. */
export function photoQueueLabel(summary: PhotoQueueSummary): string {
  switch (photoQueueAction(summary)) {
    case "saving":
      return summary.uploading === 1 ? "Saving…" : `Saving ${summary.uploading}…`;
    case "retry":
      return summary.failed === 1 ? "Retry 1 Photo" : `Retry ${summary.failed} Photos`;
    default:
      return "Done";
  }
}

/**
 * The shots a retry should send again: the ones that failed, and only those.
 *
 * A saved shot sent a second time would put a duplicate picture on the
 * patient's record, which is its own kind of wrong answer.
 */
export function shotsToRetry<T extends { status: ShotStatus }>(shots: readonly T[]): T[] {
  return shots.filter((s) => s.status === "failed");
}

/** The rows a note typed at the end belongs on. */
export function savedPhotoIds(shots: readonly QueuedShot[]): string[] {
  return shots.flatMap((s) => (s.status === "saved" && s.photoId ? [s.photoId] : []));
}
