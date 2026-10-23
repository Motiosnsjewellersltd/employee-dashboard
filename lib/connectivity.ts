// Browser connectivity signals are separate from failed API/server requests.
// Suspended mobile tabs can reject a request while the phone is still online.
export function watchOfflineStatus(onChange: (offline: boolean) => void, environment = {
  window, document, navigator
}) {
  const { window: win, document: doc, navigator: nav } = environment;
  let timer: number | undefined;
  let disposed = false;
  let previous: boolean | undefined;
  function report(offline: boolean) { if (previous !== offline) { previous = offline; onChange(offline); } }
  function cancel() { if (timer !== undefined) win.clearTimeout(timer); timer = undefined; }
  function check() {
    if (disposed) return;
    if (nav.onLine) { cancel(); report(false); return; }
    if (doc.visibilityState === "hidden") { cancel(); return; }
    if (timer !== undefined) return;
    timer = win.setTimeout(() => {
      timer = undefined;
      if (!disposed && doc.visibilityState !== "hidden") report(!nav.onLine);
    }, 1500);
  }
  win.addEventListener("online", check);
  win.addEventListener("offline", check);
  win.addEventListener("focus", check);
  win.addEventListener("motisons-network-unavailable", check);
  doc.addEventListener("visibilitychange", check);
  check();
  return () => {
    disposed = true; cancel();
    win.removeEventListener("online", check);
    win.removeEventListener("offline", check);
    win.removeEventListener("focus", check);
    win.removeEventListener("motisons-network-unavailable", check);
    doc.removeEventListener("visibilitychange", check);
  };
}
