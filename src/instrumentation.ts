/**
 * Runs once when the server starts, and starts two jobs that run inside it:
 *
 *  - the web-notification sender: a pass every five minutes over everyone
 *    who turned notifications on in a browser. MOX_PUSH=off switches it off.
 *  - Formula 1 news for the Sports tab, read and translated every quarter
 *    hour (src/lib/sports-news.ts), so a story is in Arabic before anyone
 *    opens it. MOX_SPORTS=off switches it off; without a model key the feeds
 *    are still read but nothing is translated, so nothing shows.
 *
 * In-process rather than separate scheduled jobs so they need nothing from
 * the deploy — they are up whenever the site is.
 *
 * Each import sits directly under the runtime check: the edge build follows
 * any import it cannot prove is Node-only, and the database is Node-only.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.MOX_SPORTS !== "off") {
    const { sportsPass } = await import("./lib/sports-news");
    setTimeout(() => {
      void sportsPass();
      setInterval(() => void sportsPass(), 15 * 60_000);
    }, 30_000);
  }

  if (process.env.MOX_PUSH !== "off") {
    const { runSender } = await import("./lib/push");
    // Not at once: the first minute after a restart belongs to serving pages.
    setTimeout(() => {
      void runSender();
      setInterval(() => void runSender(), 5 * 60_000);
    }, 60_000);
  }
}
