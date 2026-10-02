/* Epic F2: notificationclick deep-link (imported by VitePWA workbox). */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification && event.notification.data ? event.notification.data : {};
  let url = "/app/inventory/stock-entries";
  if (data && typeof data.url === "string" && data.url.trim()) {
    url = data.url.trim();
  } else if (event.notification && event.notification.data && typeof event.notification.data === "string") {
    try {
      const parsed = JSON.parse(event.notification.data);
      if (parsed && typeof parsed.url === "string" && parsed.url.trim()) url = parsed.url.trim();
    } catch (_) {
      /* ignore */
    }
  }
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client && typeof client.navigate === "function") {
            return client.navigate(url).then(() => client.focus());
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    }),
  );
});
