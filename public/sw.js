/*
 * mox's service worker: it only receives web notifications and opens the
 * page one is about when it is tapped. No caching, no offline copy — the site
 * is always read fresh.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MOX", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "MOX", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // A mox tab already open is reused rather than opening another.
      const tab = open.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        return tab.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});

// Take over at once, so a first visit can subscribe without a reload.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
