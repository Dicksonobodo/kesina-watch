/*
 * Browser notifications for finished / failed downloads. Only shown when the tab is in the
 * background (if you're looking at the page, the downloads panel already tells you).
 */

export function notificationsState() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function requestNotifications() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function notify(title, body) {
  if (notificationsState() !== "granted" || document.visibilityState === "visible") return;
  try {
    const n = new Notification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: title });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}
