/**
 * Runs once when the server starts. Starts the web-notification sender: a pass
 * every five minutes over everyone who turned notifications on in a browser.
 *
 * In-process rather than a separate scheduled job so it needs nothing from the
 * deploy — it is up whenever the site is. MOX_PUSH=off switches it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.MOX_PUSH === "off") return;
  const { runSender } = await import("./lib/push");
  const every = 5 * 60_000;
  // Not at once: the first minute after a restart belongs to serving pages.
  setTimeout(() => {
    void runSender();
    setInterval(() => void runSender(), every);
  }, 60_000);
}
