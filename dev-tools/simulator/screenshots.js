import { chromeHeight, deviceViewport, hostChrome } from "./devices.js";

export function screenshotSize(device, viewport) {
  if (!device)
    return { width: viewport.width, height: viewport.height + chromeHeight };
  const landscape = deviceViewport(device, true);
  const rotated =
    viewport.width === landscape.width && viewport.height === landscape.height;
  return {
    width: rotated ? device.physicalHeight : device.physicalWidth,
    height: rotated ? device.physicalWidth : device.physicalHeight,
  };
}
export function screenshotName(app, device, size, now = new Date()) {
  const slug = (value) =>
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "app";
  return `${slug(app)}-${slug(device)}-${size.width}x${size.height}-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z.png`;
}
export function screenshotSource(width, height, viewport) {
  const outerWidth = viewport.width + hostChrome.border * 2;
  const outerHeight = viewport.height + chromeHeight + hostChrome.border * 2;
  // A whole-tab or partially clipped frame must never become a device screenshot.
  if (
    width <= 0 ||
    height <= 0 ||
    Math.abs(width / height - outerWidth / outerHeight) > 0.01
  )
    throw Error(
      "The full device could not be captured. Choose this simulator tab and keep it visible.",
    );
  const x = (width * hostChrome.border) / outerWidth;
  const y = (height * hostChrome.border) / outerHeight;
  return { x, y, width: width - x * 2, height: height - y * 2 };
}
function timeout(promise, message, milliseconds = 8000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
export function screenshotError(error) {
  if (["NotAllowedError", "AbortError"].includes(error?.name))
    return "Screenshot canceled. Nothing was saved.";
  if (error?.name === "NotReadableError")
    return "The browser could not capture this tab. Check your system’s screen-recording permission and try again.";
  return error?.message || "Could not capture a screenshot. Please try again.";
}

/** Native tab pixels include cross-origin app frames; no app credentials or pixels leave this browser. */
export async function captureScreenshot({
  element,
  viewport,
  output,
  mediaDevices = navigator.mediaDevices,
  CropTarget = globalThis.CropTarget,
  document = globalThis.document,
  handle,
  origin = globalThis.location?.origin,
}) {
  if (!mediaDevices?.getDisplayMedia || !CropTarget?.fromElement)
    throw Error(
      "Screenshot capture needs desktop Chrome or Edge. Open the simulator there and choose this tab when prompted.",
    );
  let stream, video;
  try {
    // Invoke synchronously within the button's user gesture; the browser owns the chooser.
    stream = await mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "browser",
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
      monitorTypeSurfaces: "exclude",
    });
    const track = stream.getVideoTracks()[0];
    if (
      !track ||
      track.getSettings().displaySurface !== "browser" ||
      typeof track.cropTo !== "function"
    )
      throw Error(
        "Choose this simulator tab, rather than a window or an entire screen.",
      );
    if (handle && typeof track.getCaptureHandle === "function") {
      const captured = track.getCaptureHandle();
      if (captured?.handle !== handle || captured?.origin !== origin)
        throw Error(
          "Choose this simulator tab so only the selected device is saved.",
        );
    }
    const target = await CropTarget.fromElement(element);
    await timeout(
      track.cropTo(target).catch(() => {
        throw Error(
          "Choose this simulator tab so the browser can capture the device. Nothing was saved.",
        );
      }),
      "The browser could not crop to the device. Choose this simulator tab and try again.",
    );
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    video.className = "screenshot-video";
    const ready = new Promise((resolve, reject) => {
      video.addEventListener("loadeddata", resolve, { once: true });
      video.addEventListener(
        "error",
        () => reject(Error("Could not read the captured device image.")),
        { once: true },
      );
      track.addEventListener(
        "ended",
        () =>
          reject(
            Error("Screen capture stopped before the screenshot was ready."),
          ),
        { once: true },
      );
    });
    document.body.append(video);
    video.srcObject = stream;
    await timeout(
      Promise.all([ready, video.play()]),
      "No image arrived from the browser. Keep the simulator tab visible and try again.",
    );
    const source = screenshotSource(
      video.videoWidth,
      video.videoHeight,
      viewport,
    );
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Could not prepare this screenshot.");
    context.drawImage(
      video,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      output.width,
      output.height,
    );
    const blob = await timeout(
      new Promise((resolve) => canvas.toBlob(resolve, "image/png")),
      "Could not save the screenshot.",
    );
    if (!blob) throw Error("Could not save the screenshot.");
    return blob;
  } finally {
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (video) {
      video.pause();
      video.srcObject = null;
      video.remove();
    }
  }
}

export function setupScreenshots({
  button,
  phone,
  getDisplay,
  prepare,
  restore,
  status,
  dialog,
  preview,
  details,
  download,
  close,
}) {
  let handle = null,
    objectUrl = null;
  try {
    if (navigator.mediaDevices?.setCaptureHandleConfig) {
      handle = crypto.randomUUID();
      navigator.mediaDevices.setCaptureHandleConfig({
        handle,
        exposeOrigin: true,
        permittedOrigins: [location.origin],
      });
    }
  } catch {
    handle = null;
  }
  function clear() {
    preview.removeAttribute("src");
    download.removeAttribute("href");
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  close.onclick = () => dialog.close();
  dialog.addEventListener("close", clear);
  window.addEventListener("pagehide", clear);
  button.onclick = async () => {
    if (button.disabled) return;
    const display = getDisplay();
    const size = screenshotSize(display.device, display.viewport);
    button.disabled = true;
    status.hidden = false;
    status.textContent =
      "Choose this simulator tab in the browser’s sharing prompt. Only the device screenshot will be saved locally.";
    prepare();
    try {
      const blob = await captureScreenshot({
        element: phone,
        viewport: display.viewport,
        output: size,
        handle,
      });
      clear();
      objectUrl = URL.createObjectURL(blob);
      preview.src = download.href = objectUrl;
      download.download = screenshotName(
        display.app,
        display.device?.name ?? "Custom viewport",
        size,
      );
      details.textContent = `${display.device?.name ?? "Custom viewport"} · ${size.width} × ${size.height} · PNG`;
      status.textContent =
        "Screenshot ready. Download the PNG, then upload it in the app submission form. Screen capture has stopped.";
      dialog.showModal();
    } catch (error) {
      status.textContent = screenshotError(error);
    } finally {
      restore();
      button.disabled = false;
    }
  };
}
