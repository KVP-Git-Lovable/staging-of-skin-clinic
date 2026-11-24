import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  photoQueueAction,
  photoQueueLabel,
  photoQueueSummary,
  savedPhotoIds,
  shotsToRetry,
  type QueuedShot,
  type ShotStatus,
} from "@/lib/photoQueue";

/**
 * Patient photos are saved as they are taken.
 *
 * The clinic photographs patients through the iPhone's own full-screen
 * camera. While that camera is open iOS suspends the web app and, holding
 * several multi-megabyte File objects, discards it - the installed app
 * relaunches at its start URL ("it goes back automatically") and every photo
 * taken so far is gone with the React state that held it.
 */

const code = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CAPTURE = "src/components/shared/CameraCapture.tsx";

const shot = (status: ShotStatus, photoId?: string): QueuedShot =>
  ({ file: new File([], "p.jpg"), url: `blob:${status}-${photoId ?? Math.random()}`, status, photoId });

describe("counting what is where", () => {
  it("counts nothing for an empty set", () => {
    expect(photoQueueSummary([])).toEqual({ uploading: 0, saved: 0, failed: 0, total: 0 });
  });

  it("counts each state separately", () => {
    const s = photoQueueSummary([shot("saved"), shot("uploading"), shot("failed"), shot("saved")]);
    expect(s).toEqual({ uploading: 1, saved: 2, failed: 1, total: 4 });
  });
});

describe("the one button at the bottom", () => {
  const sum = (over: Partial<ReturnType<typeof photoQueueSummary>>) =>
    ({ uploading: 0, saved: 0, failed: 0, total: 0, ...over });

  it("waits while anything is still going in", () => {
    // Closing over an upload, or retrying beside one, is how a photo gets
    // sent twice or dropped.
    expect(photoQueueAction(sum({ uploading: 1, total: 1 }))).toBe("saving");
    expect(photoQueueLabel(sum({ uploading: 1, total: 1 }))).toBe("Saving…");
    expect(photoQueueLabel(sum({ uploading: 3, total: 3 }))).toBe("Saving 3…");
  });

  it("waits even when something has already failed", () => {
    expect(photoQueueAction(sum({ uploading: 1, failed: 2, total: 3 }))).toBe("saving");
  });

  it("offers a retry once the failures are all that is left", () => {
    expect(photoQueueAction(sum({ saved: 2, failed: 1, total: 3 }))).toBe("retry");
    expect(photoQueueLabel(sum({ saved: 2, failed: 1, total: 3 }))).toBe("Retry 1 Photo");
    expect(photoQueueLabel(sum({ failed: 4, total: 4 }))).toBe("Retry 4 Photos");
  });

  it("just closes when every photo is on the record", () => {
    expect(photoQueueAction(sum({ saved: 3, total: 3 }))).toBe("done");
    expect(photoQueueLabel(sum({ saved: 3, total: 3 }))).toBe("Done");
    expect(photoQueueLabel(sum({}))).toBe("Done");
  });
});

describe("what a retry sends again", () => {
  it("sends the failures and nothing else", () => {
    // A saved shot sent twice is a duplicate picture on the patient's record.
    const shots = [shot("saved", "a"), shot("failed"), shot("uploading"), shot("failed")];
    expect(shotsToRetry(shots)).toHaveLength(2);
    expect(shotsToRetry(shots).every((s) => s.status === "failed")).toBe(true);
  });

  it("sends nothing when nothing failed", () => {
    expect(shotsToRetry([shot("saved", "a"), shot("uploading")])).toEqual([]);
  });
});

describe("which rows a note belongs on", () => {
  it("takes the ids of the saved photos only", () => {
    expect(savedPhotoIds([shot("saved", "a"), shot("failed"), shot("saved", "b")])).toEqual(["a", "b"]);
  });

  it("goes by the status, not by whether an id happens to be there", () => {
    // Status is the authority on whether a photo is on the record. A note
    // written against a row the upload did not finish would be a note on a
    // photo nobody can see.
    const stale: QueuedShot = { ...shot("failed"), photoId: "row-7" };
    expect(savedPhotoIds([shot("saved", "a"), stale])).toEqual(["a"]);
  });

  it("skips a saved shot with no id rather than passing undefined to the query", () => {
    const odd = { ...shot("saved"), photoId: undefined };
    expect(savedPhotoIds([odd])).toEqual([]);
  });
});

describe("the capture dialog no longer holds a photo back", () => {
  it("sends each photo the moment it arrives, with no button pressed", () => {
    // Every route in - the live camera, the phone's own camera, the gallery -
    // goes through addFiles, so this is the one place it has to happen.
    const source = code(CAPTURE);
    const start = source.indexOf("const addFiles = (files: File[]) => {");
    const end = source.indexOf("const removeShot", start);
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, end)).toContain("void sendOne(shot)");
  });

  it("has no collect-then-upload path left at all", () => {
    // The old shape: hold every File in state, loop over them on the press.
    const source = code(CAPTURE);
    expect(source).not.toContain("uploadMutation");
    expect(source).not.toContain("Upload ${shots.length} Photos");
    expect(source).not.toContain("useMutation");
  });

  it("keeps the row id, which is what the note is written against", () => {
    const source = code(CAPTURE);
    const at = source.indexOf(".insert(record)");
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, at + 140)).toContain('.select("id")');
  });

  it("writes the note only onto photos that are already saved", () => {
    const source = code(CAPTURE);
    const at = source.indexOf(".update({ notes: notes || null })");
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, at + 120)).toContain('.in("id", ids)');
    expect(source).toContain("const ids = savedPhotoIds(shots)");
  });

  it("refreshes the lists as each photo lands, not once at the end", () => {
    const source = code(CAPTURE);
    const start = source.indexOf("const sendOne = async (shot: QueuedShot) => {");
    const end = source.indexOf("const addFiles", start);
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, end)).toContain('invalidateQueries({ queryKey: ["patient-photos"] })');
  });

  it("adds no way to remove a photo from the record", () => {
    // This dialog has never deleted anything, and a fix for lost photos is
    // the last place to introduce one.
    const source = code(CAPTURE);
    expect(source).not.toMatch(/\.remove\(/);
    expect(source).not.toMatch(/\.delete\(/);
  });

  it("offers the remove cross only on a photo that failed", () => {
    // On a saved one it would promise something it does not do.
    const source = code(CAPTURE);
    const at = source.indexOf("Remove photo");
    expect(at).toBeGreaterThan(-1);
    const lastCheck = source.lastIndexOf("shot.status ===", at);
    expect(lastCheck).toBeGreaterThan(-1);
    expect(source.slice(lastCheck, at)).toContain('"failed"');
  });

  it("still releases every thumbnail when it closes", () => {
    const source = code(CAPTURE);
    const start = source.indexOf("const resetForm = () => {");
    const end = source.indexOf("const finish", start);
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, end)).toContain("URL.revokeObjectURL(s.url)");
  });
});

describe("the patient tools bar sees the new photos", () => {
  it("uses the shared key prefix the uploads invalidate", () => {
    // It had its own "patient-tools-photos" key, which
    // invalidateQueries(["patient-photos"]) does not reach.
    const source = code("src/components/shared/PatientToolsBar.tsx");
    expect(source).toContain('queryKey: ["patient-photos", "tools", patientId]');
    expect(source).not.toContain("patient-tools-photos");
  });
});
