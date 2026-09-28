/* weblly service worker — only handles push notifications (no offline caching). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "weblly";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      lang: "he",
      dir: "rtl",
      data: { url: data.url || "/today" },
    }),
  );
});

// Tap on a notification → focus the open app and navigate, or open it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
