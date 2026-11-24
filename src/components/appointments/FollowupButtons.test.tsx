import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FollowupButtons } from "./FollowupButtons";
import { followupMessage } from "@/lib/followupSend";
import { toast } from "sonner";

/**
 * The two follow-up buttons in a DOM.
 *
 * What matters here is the tab: it must be a real top-level window.open with
 * the message already in the URL, and nothing may stand between the click and
 * that call. The reasoning is in the component; this is what holds it.
 */

const inserted: Record<string, unknown>[] = [];
let conversations: { content: string; created_at: string }[] = [];
let opens: { kind: string; opened_at: string }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chainOn = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
    chain.limit = () => Promise.resolve({ data: rows, error: null });
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => ({
        ...chainOn(table === "followup_opens" ? opens : conversations),
        insert: (row: Record<string, unknown>) => {
          inserted.push({ table, ...row });
          return Promise.resolve({ error: null });
        },
      }),
      auth: { getUser: async () => ({ data: { user: { id: "staff-1" } } }) },
    },
  };
});

vi.mock("sonner", () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

const props = {
  patientId: "11111111-1111-1111-1111-111111111111",
  appointmentId: "22222222-2222-2222-2222-222222222222",
  patientPhone: "9606342269",
  patient: { first_name: "Surekha", last_name: "", gender: "Female" },
};

/**
 * Pretend this window is inside a frame.
 *
 * Only `top` is redefined. Replacing the whole `window` object breaks React and
 * jsdom - "Right-hand side of 'instanceof' is not an object" - and leaks into
 * every test that follows.
 */
function framed() {
  Object.defineProperty(window, "top", { value: { notUs: true }, configurable: true });
}
function unframed() {
  Object.defineProperty(window, "top", { value: window, configurable: true });
}

let openSpy: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;
/** The href of the anchor the protocol launch went through. */
const launchedHref = () =>
  (clickSpy.mock.instances[0] as HTMLAnchorElement | undefined)?.getAttribute("href");
const fakeWindow = () => ({ opener: {} as unknown }) as Window;

beforeEach(() => {
  inserted.length = 0;
  conversations = [];
  opens = [];
  openSpy = vi.fn(() => fakeWindow());
  vi.stubGlobal("open", openSpy);
  vi.spyOn(window, "confirm");
  // Clicking a real anchor in jsdom attempts a navigation it has not
  // implemented; the spy stands in for the operating system taking the link.
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  unframed();
  // Without this, a later test reads mock.calls[0] and gets the FIRST toast of
  // the whole file rather than its own - which is how the blocked-popup check
  // came to assert against the preview-frame message.
  vi.mocked(toast.message).mockReset();
});

describe("opening WhatsApp", () => {
  it("hands the patient's number and message to WhatsApp Desktop, with no tab", async () => {
    wrap(<FollowupButtons {...props} />);
    fireEvent.click(await screen.findByTestId("send-followup-24h"));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    // No tab at all is the fix: three follow-ups used to leave three tabs.
    expect(openSpy).not.toHaveBeenCalled();

    const href = String(launchedHref());
    expect(href.startsWith("whatsapp://send?")).toBe(true);
    const parsed = new URL(href.replace("whatsapp://send?", "https://x/?"));
    expect(parsed.searchParams.get("phone")).toBe("919606342269");
    expect(parsed.searchParams.get("text")).toBe(followupMessage("24h", props.patient));
  });

  it("sends each button's own message", async () => {
    wrap(<FollowupButtons {...props} />);
    fireEvent.click(await screen.findByTestId("send-followup-1week"));
    const href = String(launchedHref());
    const text = new URL(href.replace("whatsapp://send?", "https://x/?")).searchParams.get("text");
    expect(text).toContain("one week follow up");
    expect(text).not.toContain("quick follow-up regarding your treatment");
  });

  it("never asks a browser dialog before opening", async () => {
    // Chrome ignores a dialog asked for by a background tab, which is how this
    // pattern once opened a tab and instantly closed it again.
    wrap(<FollowupButtons {...props} />);
    fireEvent.click(await screen.findByTestId("send-followup-24h"));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("reuses one named tab when the web is used instead", async () => {
    // Reached from the toast after a hand-off, for a machine with no app.
    const win = fakeWindow();
    openSpy.mockReturnValue(win);
    wrap(<FollowupButtons {...props} />);
    fireEvent.click(await screen.findByTestId("send-followup-24h"));

    const [, opts] = vi.mocked(toast.message).mock.calls[0] as unknown as [
      string,
      { action: { onClick: () => void } },
    ];
    opts.action.onClick();

    const [url, target] = openSpy.mock.calls[0];
    expect(String(url).startsWith("https://web.whatsapp.com/send?")).toBe(true);
    expect(target).not.toBe("_blank");
    expect(win.opener).toBeNull();
  });

  it("records the open, with the kind, against this patient and visit", async () => {
    wrap(<FollowupButtons {...props} />);
    fireEvent.click(await screen.findByTestId("send-followup-1week"));
    await waitFor(() => expect(inserted.length).toBe(1));
    expect(inserted[0]).toMatchObject({
      table: "followup_opens",
      patient_id: props.patientId,
      appointment_id: props.appointmentId,
      kind: "1week",
      opened_by: "staff-1",
    });
  });
});

describe("inside the Lovable editor's preview frame", () => {
  it("opens nothing and records nothing", async () => {
    // A popup from that sandboxed frame inherits the sandbox and WhatsApp
    // answers ERR_BLOCKED_BY_RESPONSE. Two rows were written on 10 Nov for
    // exactly such clicks, each claiming the patient had been contacted.
    framed();
    wrap(<FollowupButtons {...props} />);
    fireEvent.click(await screen.findByTestId("send-followup-24h"));

    expect(openSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    expect(inserted, "a blocked click was recorded as contact").toHaveLength(0);
  });
});

describe("when the browser blocks the web tab", () => {
  it("offers the message to copy instead", async () => {
    // Only reachable from the toast now: the first press goes to the app,
    // which a popup blocker has no say over.
    openSpy.mockReturnValue(null);
    wrap(<FollowupButtons {...props} />);
    fireEvent.click(await screen.findByTestId("send-followup-24h"));

    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    const [, opts] = vi.mocked(toast.message).mock.calls[0] as unknown as [
      string,
      { action: { onClick: () => void } },
    ];
    opts.action.onClick();

    const titles = vi.mocked(toast.message).mock.calls.map((c) => String(c[0]));
    expect(titles.some((t) => t.includes("blocked"))).toBe(true);
  });
});

describe("a patient who has already been contacted", () => {
  it("asks first, and opens nothing until that is confirmed", async () => {
    opens = [{ kind: "24h", opened_at: new Date(Date.now() - 3600_000).toISOString() }];
    wrap(<FollowupButtons {...props} />);
    await screen.findByTestId("followup-sent-24h");

    fireEvent.click(screen.getByTestId("send-followup-24h"));
    expect(clickSpy).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByTestId("confirm-followup-again"));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
  });

  it("notices the one follow-up that really was sent through the old sender", async () => {
    // Ms. Surekha, 10 Nov 2026. A send is a stronger claim than an open, and
    // the wording has to say so.
    conversations = [
      {
        content: "Hello Ms. Surekha,\nThis is a quick follow-up regarding your treatment done.",
        created_at: new Date(Date.now() - 7200_000).toISOString(),
      },
    ];
    wrap(<FollowupButtons {...props} />);
    const line = await screen.findByTestId("followup-sent-24h");
    expect(line.textContent).toContain("Already sent");
    // The other button is untouched by it.
    expect(screen.queryByTestId("followup-sent-1week")).toBeNull();
  });

  it("offers to send again rather than pretending it is the first time", async () => {
    opens = [{ kind: "1week", opened_at: new Date(Date.now() - 3600_000).toISOString() }];
    wrap(<FollowupButtons {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("send-followup-1week").textContent).toContain("again"),
    );
    expect(screen.getByTestId("send-followup-24h").textContent).not.toContain("again");
  });
});

describe("patients the buttons cannot work for", () => {
  it("greys both out, with the reason, when there is no usable number", async () => {
    wrap(<FollowupButtons {...props} patientPhone="" />);
    expect(await screen.findByTestId("send-followup-24h")).toBeDisabled();
    expect(screen.getByTestId("send-followup-1week")).toBeDisabled();
    expect(screen.getByText(/no usable phone number/i)).toBeInTheDocument();
  });

  it("STILL works when the name is a phone number, falling back to 'Hello,'", async () => {
    // 161 such patients. These used to be refused outright; the message simply
    // loses the name now.
    wrap(<FollowupButtons {...props} patient={{ first_name: "9663438657", last_name: "" }} />);
    const button = await screen.findByTestId("send-followup-24h");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    const href = String(launchedHref()).replace("whatsapp://send?", "https://x/?");
    const text = new URL(href).searchParams.get("text") ?? "";
    expect(text.startsWith("Hello,\n")).toBe(true);
    expect(text).not.toContain("9663438657");
  });

  it("renders nothing at all without a patient id", () => {
    const { container } = wrap(<FollowupButtons {...props} patientId={undefined} />);
    expect(container.textContent).toBe("");
  });
});
