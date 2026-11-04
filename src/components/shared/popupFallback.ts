import { toast } from "sonner";

/**
 * Last resort when the browser refuses even the tab we reserved inside the
 * click - which means pop-ups are blocked for the whole site and no amount
 * of care on our side will open one.
 *
 * Clicking the toast's action is a new gesture, and a gesture that opens a
 * tab straight away is always honoured, so this gets the document open in
 * one extra click instead of failing silently.
 */
export function offerBlockedLink(url: string, what: string) {
  toast.message(`Your browser blocked the ${what} window`, {
    description: `Click Open ${what} to view it, or allow pop-ups for this site.`,
    action: {
      label: `Open ${what}`,
      onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
    },
    duration: 15000,
  });
}
