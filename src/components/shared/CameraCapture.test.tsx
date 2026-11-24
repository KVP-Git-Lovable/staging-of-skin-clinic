import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A photo must be on the patient's record before the next one is taken.
 *
 * The clinic photographs patients through the iPhone's own full-screen
 * camera. iOS suspends the web app while that camera is open and, with
 * several multi-megabyte File objects held in React state, discards it: the
 * installed app relaunches at its start URL - "it goes back automatically" -
 * and every photo taken so far goes with the state that held it.
 *
 * So these tests press no Upload button. If a photo is only on the record
 * after a press, the fault is still there.
 */

/** Every storage upload and every row written, in order. */
const uploads: { path: string; file: File }[] = [];
const inserts: Record<string, unknown>[] = [];
const updates: { values: Record<string, unknown>; ids: string[] }[] = [];
/** Set to make the NEXT n uploads fail, the way a dropped connection does. */
let failNext = 0;
let rowId = 0;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string, file: File) => {
          uploads.push({ path, file });
          if (failNext > 0) {
            failNext--;
            return Promise.resolve({ error: new Error("network") });
          }
          return Promise.resolve({ error: null });
        },
      }),
    },
    from: () => ({
      insert: (record: Record<string, unknown>) => {
        inserts.push(record);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: `row-${++rowId}` }, error: null }),
          }),
        };
      },
      update: (values: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => {
          updates.push({ values, ids });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }));

/**
 * The live camera, stubbed down to the one thing that matters here: it hands
 * back files. The phone's own camera and the gallery reach the same function.
 */
vi.mock("@/components/shared/CameraDialog", () => ({
  CameraDialog: ({ onCaptureMany }: { onCaptureMany?: (f: File[]) => void }) => (
    <button type="button" onClick={() => onCaptureMany?.([photo()])}>
      stub-capture
    </button>
  ),
}));

import { CameraCapture } from "@/components/shared/CameraCapture";

let n = 0;
const photo = () => new File([`bytes-${++n}`], `photo-${n}.jpg`, { type: "image/jpeg" });

const onOpenChange = vi.fn();

function open() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CameraCapture
        open
        onOpenChange={onOpenChange}
        patientId="pat-1"
        patientName="Megha Shetty"
        context="appointment"
        contextId="appt-1"
      />
    </QueryClientProvider>,
  );
}

/** Take one photo, the way the camera hands it over. */
const take = () => fireEvent.click(screen.getByText("stub-capture"));
const button = () => screen.getByRole("button", { name: /Saving|Retry|Done/ });

beforeEach(() => {
  uploads.length = 0;
  inserts.length = 0;
  updates.length = 0;
  failNext = 0;
  rowId = 0;
  n = 0;
  onOpenChange.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => `blob:shot-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});

describe("a photo is saved as it is taken", () => {
  it("reaches the record with no button pressed", async () => {
    open();
    take();
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toMatch(/^pat-1\/\d+-\d+-[a-z0-9]+\.jpg$/);
  });

  it("writes the same row the clinic has always had", async () => {
    open();
    take();
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]).toMatchObject({ patient_id: "pat-1", appointment_id: "appt-1", notes: null });
    expect(inserts[0].procedure_id).toBeUndefined();
    expect(String(inserts[0].photo_url)).toContain("/patient-photos/pat-1/");
  });

  it("says so on the photo itself", async () => {
    open();
    take();
    expect(await screen.findByLabelText("Photo 1 saved")).toBeInTheDocument();
  });

  it("sends three photos without one waiting for the others", async () => {
    open();
    take();
    await waitFor(() => expect(inserts).toHaveLength(1));
    take();
    await waitFor(() => expect(inserts).toHaveLength(2));
    take();
    await waitFor(() => expect(inserts).toHaveLength(3));
    expect(new Set(uploads.map((u) => u.path)).size).toBe(3);
    // The position in the set, which is what keeps two photos taken in the
    // same millisecond from overwriting each other in storage.
    expect(uploads.map((u) => u.path.match(/-(\d+)-[a-z0-9]+\.jpg$/)?.[1])).toEqual(["0", "1", "2"]);
    expect(await screen.findByLabelText("Photo 3 saved")).toBeInTheDocument();
  });

  it("goes in with the note already typed", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Area treated, observations..."), {
      target: { value: "Left cheek" },
    });
    take();
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0].notes).toBe("Left cheek");
  });
});

describe("closing cannot lose it", () => {
  it("removes nothing from the record on close", async () => {
    open();
    take();
    await waitFor(() => expect(inserts).toHaveLength(1));
    fireEvent.click(button());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    // Nothing was deleted and nothing was re-sent.
    expect(inserts).toHaveLength(1);
    expect(uploads).toHaveLength(1);
  });

  it("says the photos are safe while the dialog is still open", async () => {
    open();
    take();
    expect(await screen.findByText(/already on the record/)).toBeInTheDocument();
  });

  it("puts a note typed afterwards on what was saved", async () => {
    open();
    take();
    await waitFor(() => expect(inserts).toHaveLength(1));
    fireEvent.change(screen.getByPlaceholderText("Area treated, observations..."), {
      target: { value: "Right cheek, 2 weeks post" },
    });
    fireEvent.click(button());
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({ values: { notes: "Right cheek, 2 weeks post" }, ids: ["row-1"] });
  });
});

describe("one that did not go in", () => {
  it("stays on screen and offers a retry", async () => {
    failNext = 1;
    open();
    take();
    await waitFor(() => expect(screen.getByLabelText("Photo 1 not saved")).toBeInTheDocument());
    expect(inserts).toHaveLength(0);
    expect(button()).toHaveTextContent("Retry 1 Photo");
    expect(toastError).toHaveBeenCalled();
  });

  it("sends only the one that failed when retried", async () => {
    open();
    take();
    await waitFor(() => expect(inserts).toHaveLength(1));
    failNext = 1;
    take();
    await waitFor(() => expect(screen.getByLabelText("Photo 2 not saved")).toBeInTheDocument());

    fireEvent.click(button());
    await waitFor(() => expect(inserts).toHaveLength(2));
    // Three storage attempts for two photos: the first, the failure, the retry.
    expect(uploads).toHaveLength(3);
    expect(uploads[2].file.name).toBe(uploads[1].file.name);
    expect(await screen.findByLabelText("Photo 2 saved")).toBeInTheDocument();
  });

  it("lets a failed photo be dropped, and a saved one not", async () => {
    failNext = 1;
    open();
    take();
    await waitFor(() => expect(screen.getByLabelText("Remove photo 1")).toBeInTheDocument());
    take();
    await waitFor(() => expect(screen.getByLabelText("Photo 2 saved")).toBeInTheDocument());
    expect(screen.queryByLabelText("Remove photo 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Remove photo 1"));
    expect(screen.queryByLabelText("Photo 1 not saved")).not.toBeInTheDocument();
  });
});
