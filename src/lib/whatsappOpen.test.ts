import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WHATSAPP_WINDOW_NAME, openWhatsApp } from "./whatsappOpen";
import { isEmbedded } from "./embeddedPreview";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

/**
 * Opening WhatsApp for a staff member.
 *
 * It used to be window.open(url, "_blank") on a web address, which meant a new
 * tab on every single click and the clinic's installed WhatsApp Desktop never
 * being reached. The message now goes to the app, which creates no tab at all,
 * and the web is the way back for a machine that has no app.
 *
 * The preview-frame case is unchanged and still records nothing: that is the
 * failure these were written for, after two rows were written on 10 Nov for
 * clicks that showed a blocked page.
 */

const URL_ = "https://web.whatsapp.com/send?phone=919606342269&text=Hello";
const MESSAGE = "Hello Ms. Surekha,\nThis is a quick follow-up";

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
const fakeWindow = () => ({ opener: {} as unknown }) as Window;

/** The anchor the protocol launch goes through, as it was when clicked. */
const launched = () => clickSpy.mock.instances[0] as HTMLAnchorElement | undefined;

beforeEach(() => {
  openSpy = vi.fn(() => fakeWindow());
  vi.stubGlobal("open", openSpy);
  vi.mocked(toast.message).mockReset();
  vi.spyOn(window, "confirm");
  // Clicking a real anchor in jsdom attempts a navigation it has not
  // implemented; the spy stands in for the operating system taking the link.
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  unframed();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isEmbedded", () => {
  it("is false for a window that is its own top", () => {
    const w = {} as { self: unknown; top: unknown };
    w.self = w;
    w.top = w;
    expect(isEmbedded(w)).toBe(false);
  });

  it("is true inside a frame", () => {
    expect(isEmbedded({ self: { a: 1 }, top: { b: 2 } })).toBe(true);
  });

  it("treats a window.top that throws as embedded", () => {
    // A throw means we are certainly inside something. Swallowing it to
    // "not embedded" would open the doomed tab after all.
    const hostile = {
      self: {},
      get top(): unknown {
        throw new Error("cross-origin");
      },
    };
    expect(isEmbedded(hostile)).toBe(true);
  });
});

describe("in a normal tab", () => {
  beforeEach(() => {
    // jsdom's window is its own top, so this is the unframed case already.
    expect(isEmbedded()).toBe(false);
  });

  it("hands the message to WhatsApp Desktop and opens no tab", () => {
    // The whole point: a protocol launch creates no tab, which is what stops
    // three follow-ups leaving three WhatsApp tabs behind.
    expect(openWhatsApp(URL_, MESSAGE)).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("sends the app the same number and message as the web link", () => {
    openWhatsApp(URL_, MESSAGE);
    expect(launched()?.getAttribute("href"))
      .toBe("whatsapp://send?phone=919606342269&text=Hello");
  });

  it("leaves nothing behind in the page", () => {
    openWhatsApp(URL_, MESSAGE);
    expect(document.querySelectorAll('a[href^="whatsapp:"]')).toHaveLength(0);
  });

  it("asks no browser dialog on the way", () => {
    openWhatsApp(URL_, MESSAGE);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("offers the web and the clipboard, because nothing reports back", () => {
    // A protocol launch has no success or failure to read, so the way out is
    // offered every time rather than only when something went wrong.
    openWhatsApp(URL_, MESSAGE);
    const [title, opts] = vi.mocked(toast.message).mock.calls[0] as unknown as [
      string,
      { action: { label: string }; cancel: { label: string } },
    ];
    expect(title).toContain("WhatsApp");
    expect(opts.action.label).toBe("Use WhatsApp Web");
    expect(opts.cancel.label).toBe("Copy message");
  });
});

describe("the way back to WhatsApp Web", () => {
  const useWeb = () => {
    openWhatsApp(URL_, MESSAGE);
    const [, opts] = vi.mocked(toast.message).mock.calls[0] as unknown as [
      string,
      { action: { onClick: () => void } },
    ];
    opts.action.onClick();
  };

  it("reuses one named tab instead of opening another every time", () => {
    // "_blank" was the bug: three follow-ups, three tabs.
    useWeb();
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target, features] = openSpy.mock.calls[0];
    expect(url).toBe(URL_);
    expect(target).toBe(WHATSAPP_WINDOW_NAME);
    expect(target).not.toBe("_blank");
    // A features string risks "noopener" creeping back, which makes
    // window.open return null even on success.
    expect(features).toBeUndefined();
  });

  it("disowns the tab it opened", () => {
    const win = fakeWindow();
    openSpy.mockReturnValue(win);
    useWeb();
    expect(win.opener).toBeNull();
  });

  it("offers the copy when the browser blocks that tab", () => {
    openSpy.mockReturnValue(null);
    useWeb();
    const titles = vi.mocked(toast.message).mock.calls.map((c) => c[0]);
    expect(titles.some((t) => String(t).includes("blocked"))).toBe(true);
  });
});

describe("inside the Lovable editor's preview frame", () => {
  beforeEach(() => {
    // A popup from a sandboxed frame inherits the sandbox and WhatsApp
    // answers ERR_BLOCKED_BY_RESPONSE.
    framed();
  });

  it("opens nothing at all - no tab, and no hand-off to the app", () => {
    expect(openWhatsApp(URL_, MESSAGE)).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("says why, and names the way out rather than just 'blocked'", () => {
    openWhatsApp(URL_, MESSAGE);
    const [title, opts] = vi.mocked(toast.message).mock.calls[0] as unknown as [
      string,
      { description: string },
    ];
    expect(title).toContain("preview panel");
    // "Blocked" on its own sends somebody looking for a setting in WhatsApp,
    // which is the one place the problem is not.
    expect(opts.description).toContain("own browser tab");
    expect(opts.description).toContain("Lovable");
  });

  it("still offers the message to copy, so the work is not stuck", () => {
    openWhatsApp(URL_, MESSAGE);
    const [, opts] = vi.mocked(toast.message).mock.calls[0] as unknown as [
      string,
      { action: { label: string } },
    ];
    expect(opts.action.label).toBe("Copy message");
  });
});
