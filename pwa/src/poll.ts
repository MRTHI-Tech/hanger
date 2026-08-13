import {useEffect, useRef} from 'react';

/** How often to ask, while anyone is looking. */
const DEFAULT_INTERVAL = 1500;

/**
 * Ask the server how a job is going, but only while the screen is on.
 *
 * The panel polls with a recursive `setTimeout` and nothing else, which is
 * right there: a side panel is either open and visible or closed and unmounted.
 * A phone has a third state the panel doesn't — the screen locks, or you switch
 * to Messages for ten seconds, and the tab is alive but nobody is looking. A
 * timer left running there is asking a server questions on a battery for
 * answers no one will read, and the browser throttles it to roughly once a
 * minute anyway, so the first thing you'd see on coming back is a stale screen
 * that takes a minute to catch up.
 *
 * So this stops when the page is hidden and asks again the moment it is shown.
 *
 * **Nothing is lost while it is stopped**, which is the fact that makes this
 * cheap rather than hard. Every long job — a try-on, an outfit chain, a video —
 * runs to completion inside the server (`void execute(...)`, with the row as
 * the handle). The client's polling has never been what drives the work
 * forward; it only watches. A locked phone misses the view, not the result.
 */
export function usePollWhileVisible(
  tick: () => void | Promise<void>,
  isActive: boolean,
  intervalMs: number = DEFAULT_INTERVAL,
): void {
  // Kept in a ref so a caller can pass a fresh closure every render — which
  // they will, since it reads their state — without restarting the loop.
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    let timer: number | undefined;

    async function run() {
      if (cancelled || document.hidden) return;
      await latest.current();
      // Re-checked after the await: the screen can lock during a request.
      if (cancelled || document.hidden) return;
      timer = window.setTimeout(run, intervalMs);
    }

    function onVisibilityChange() {
      if (document.hidden) {
        window.clearTimeout(timer);
        return;
      }
      // Straight back in without waiting out an interval. Coming back to a
      // spinner that already finished is the thing this exists to avoid.
      window.clearTimeout(timer);
      void run();
    }

    void run();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isActive, intervalMs]);
}
