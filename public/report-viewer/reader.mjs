const $ = id => document.getElementById(id);
const viewport = $("viewport"), content = $("content"), status = $("status");
const previous = $("previous"), next = $("next"), zoomIn = $("zoom-in"), zoomOut = $("zoom-out");
const controller = new AbortController();
let pdf, loadingTask, renderTask, imageUrl, image, page = 1, zoom = 1, generation = 0, disposed = false;
const assetRoot = "/report-viewer/pdfjs-6.4.299/";

function controls() {
  previous.disabled = !pdf || page <= 1;
  next.disabled = !pdf || page >= pdf.numPages;
  zoomIn.disabled = (!pdf && !image) || zoom >= 3;
  zoomOut.disabled = (!pdf && !image) || zoom <= 1;
  $("page-label").textContent = pdf ? `${page} / ${pdf.numPages}` : "";
  $("zoom-label").textContent = `${Math.round(zoom * 100)}%`;
}

async function render() {
  if (disposed) return;
  const current = ++generation;
  renderTask?.cancel();
  controls();
  const width = Math.max(160, viewport.clientWidth - 20);
  if (image) {
    image.style.width = `${Math.round(Math.min(width, image.naturalWidth) * zoom)}px`;
    return;
  }
  if (!pdf) return;
  try {
    const pdfPage = await pdf.getPage(page);
    if (disposed || generation !== current) return;
    const unit = pdfPage.getViewport({ scale: 1 });
    const displayWidth = Math.min(width, 1200) * zoom;
    // Bound pixel count to avoid exhausting mobile canvas memory on long PDF pages.
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const scale = displayWidth / unit.width;
    const pixelScale = Math.min(density, Math.sqrt(8000000 / (unit.width * unit.height * scale * scale)));
    const view = pdfPage.getViewport({ scale: scale * pixelScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${Math.round(unit.height * scale)}px`;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Report page ${page} of ${pdf.numPages}`);
    const task = pdfPage.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: view });
    renderTask = task;
    await task.promise;
    if (disposed || generation !== current) return;
    content.replaceChildren(canvas);
    status.textContent = "";
  } catch (error) {
    if (disposed || current !== generation || error?.name === "RenderingCancelledException") return;
    status.className = "error";
    status.textContent = "Could not display this page. Use Download above to save the report, or Back to Dashboard to return.";
  }
}

previous.addEventListener("click", () => { if (pdf && page > 1) { page--; viewport.scrollTo(0, 0); void render(); } });
next.addEventListener("click", () => { if (pdf && page < pdf.numPages) { page++; viewport.scrollTo(0, 0); void render(); } });
zoomIn.addEventListener("click", () => { zoom = Math.min(3, zoom + .25); void render(); });
zoomOut.addEventListener("click", () => { zoom = Math.max(1, zoom - .25); void render(); });
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => void render(), 100); });
window.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); parent.postMessage({ type: "motisons-report-close" }, location.origin); }
});
window.addEventListener("pagehide", () => {
  disposed = true; generation++; controller.abort(); renderTask?.cancel();
  if (loadingTask) void loadingTask.destroy();
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  clearTimeout(resizeTimer);
}, { once: true });

try {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) throw new Error("Missing report.");
  const response = await fetch(`/api/employee-reports/${encodeURIComponent(id)}/file`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
  if (!response.ok) throw new Error(response.status === 401 ? "Your login has expired. Return to the dashboard and log in again." : "Report unavailable or access denied.");
  const blob = await response.blob();
  if (disposed) throw new Error("Closed");
  if (blob.type.toLowerCase().startsWith("image/")) {
    imageUrl = URL.createObjectURL(blob);
    image = document.createElement("img"); image.alt = "Employee report"; image.src = imageUrl;
    await image.decode();
    if (!disposed) { content.replaceChildren(image); status.textContent = ""; await render(); controls(); }
  } else {
    const pdfjs = await import(`${assetRoot}pdf.mjs`);
    if (disposed) throw new Error("Closed");
    pdfjs.GlobalWorkerOptions.workerSrc = `${assetRoot}pdf.worker.mjs`;
    loadingTask = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: `${assetRoot}cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${assetRoot}standard_fonts/`, wasmUrl: `${assetRoot}wasm/`, isEvalSupported: false });
    pdf = await loadingTask.promise;
    if (!disposed) { previous.hidden = next.hidden = pdf.numPages <= 1; await render(); controls(); }
  }
} catch (error) {
  if (!disposed) {
    status.className = "error";
    status.textContent = error?.name === "PasswordException" ? "This PDF requires a password. Use Download above to open it in your PDF app; Back to Dashboard remains available."
      : `${error?.message || "Could not open report."} Use Back to Dashboard to return.`;
  }
}
