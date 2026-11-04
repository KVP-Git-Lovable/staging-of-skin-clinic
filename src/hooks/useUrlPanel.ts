import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * A detail panel that lives in the address bar, so Back closes it.
 *
 * The panels were held in component state alone, which meant the address
 * never changed when one opened - so pressing Back did not close the panel,
 * it walked out of the list entirely and lost the filters, the scroll and the
 * page the user was on. The clinic reported it as the back button "completely
 * coming back".
 *
 * Opening now pushes a search parameter, which is a history entry Back can
 * pop. Changing a search parameter does not remount the route, so the list
 * keeps its state and its loaded data while the panel opens and closes over
 * it.
 */
export function useUrlPanel(param: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const openId = searchParams.get(param);

  const open = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set(param, id);
      // Pushed, not replaced: the whole point is to leave something for Back.
      setSearchParams(next);
    },
    [param, searchParams, setSearchParams],
  );

  const close = useCallback(() => {
    if (!searchParams.get(param)) return;
    // Going back rather than stripping the parameter keeps the history clean:
    // opening and closing a panel five times should not leave five entries
    // for the user to press Back through to escape the page.
    navigate(-1);
  }, [navigate, param, searchParams]);

  /**
   * Closes without touching history - for when the record itself has gone
   * (deleted, or moved to trash) and going back would land on a panel for
   * something that no longer exists.
   */
  const dismiss = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    setSearchParams(next, { replace: true });
  }, [param, searchParams, setSearchParams]);

  return { openId, open, close, dismiss };
}
