let pending = 0;
export function pendingDataLoads() { return pending; }
export function beginDataLoad() {
  if (typeof window === "undefined") return () => {};
  pending++;
  window.dispatchEvent(new Event("motisons-data-loading"));
  let completed = false;
  return () => {
    if (completed) return;
    completed = true; pending = Math.max(0, pending - 1);
    window.dispatchEvent(new Event("motisons-data-loading"));
  };
}
