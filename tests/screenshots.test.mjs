import assert from "node:assert/strict";
import { test } from "node:test";
import {
  devices,
  deviceViewport,
  chromeHeight,
  hostChrome,
} from "../dev-tools/simulator/devices.js";
import {
  screenshotSize,
  screenshotName,
  screenshotSource,
  captureScreenshot,
  screenshotError,
} from "../dev-tools/simulator/screenshots.js";

test("screenshot output follows each device, rotation, folding and custom viewport", () => {
  for (const device of devices) {
    assert.deepEqual(screenshotSize(device, deviceViewport(device)), {
      width: device.physicalWidth,
      height: device.physicalHeight,
    });
    assert.deepEqual(screenshotSize(device, deviceViewport(device, true)), {
      width: device.physicalHeight,
      height: device.physicalWidth,
    });
  }
  assert.deepEqual(screenshotSize(null, { width: 640, height: 480 }), {
    width: 640,
    height: 480 + chromeHeight,
  });
  const name = screenshotName(
    "An app /?",
    "Pixel · folded",
    { width: 1080, height: 2424 },
    new Date("2026-10-15T01:00:00.000Z"),
  );
  assert.equal(name, "an-app-pixel-folded-1080x2424-20261015T010000Z.png");
  assert.ok(!/[\\/:?]/.test(name));
});
function setup({
  surface = "browser",
  handle = "own",
  cropError,
  encodingError = false,
  frameError = false,
} = {}) {
  const viewport = deviceViewport(devices[0]),
    output = screenshotSize(devices[0], viewport);
  let stopped = 0,
    draw,
    options,
    paused = false,
    removed = false,
    exported = false;
  const track = new EventTarget();
  Object.assign(track, {
    getSettings: () => ({ displaySurface: surface }),
    getCaptureHandle: () => ({
      handle,
      origin: "https://developers.tabschat.com",
    }),
    cropTo: async () => {
      if (cropError) throw cropError;
    },
    stop() {
      stopped++;
    },
  });
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const mediaDevices = {
    getDisplayMedia: async (value) => {
      options = value;
      return stream;
    },
  };
  const video = new EventTarget();
  Object.assign(video, {
    videoWidth: viewport.width + hostChrome.border * 2,
    videoHeight: viewport.height + chromeHeight + hostChrome.border * 2,
    setAttribute() {},
    play: async () => {
      queueMicrotask(() =>
        video.dispatchEvent(new Event(frameError ? "error" : "loadeddata")),
      );
    },
    pause() {
      paused = true;
    },
    remove() {
      removed = true;
    },
  });
  const blob = new Blob(["png fixture"], { type: "image/png" });
  const canvas = {
    getContext: () => ({
      drawImage(...args) {
        draw = args;
      },
    }),
    toBlob(callback) {
      exported = true;
      callback(encodingError ? null : blob);
    },
  };
  const document = {
    body: { append() {} },
    createElement: (name) => (name === "video" ? video : canvas),
  };
  return {
    args: {
      element: {},
      viewport,
      output,
      mediaDevices,
      CropTarget: { fromElement: async () => ({}) },
      document,
      handle: "own",
      origin: "https://developers.tabschat.com",
    },
    state: () => ({
      stopped,
      draw,
      options,
      paused,
      removed,
      exported,
      video,
      canvas,
    }),
    blob,
  };
}
test("capture exports only cropped device pixels and always stops the browser stream", async () => {
  const fixture = setup();
  assert.equal(await captureScreenshot(fixture.args), fixture.blob);
  const { stopped, draw, options, paused, removed, video, canvas } =
    fixture.state();
  assert.equal(options.audio, false);
  assert.equal(options.preferCurrentTab, true);
  assert.equal(stopped, 1);
  assert.equal(paused, true);
  assert.equal(removed, true);
  assert.equal(video.srcObject, null);
  assert.deepEqual(draw.slice(1), [7, 7, 412, 924, 0, 0, 1080, 2424]);
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 2424);
});
test("wrong tabs, windows and failed cropping cannot export any pixels; tracks stop", async () => {
  for (const settings of [
    { surface: "monitor" },
    { surface: "window" },
    { handle: "other" },
    { cropError: Error("crop failed") },
  ]) {
    const fixture = setup(settings);
    await assert.rejects(captureScreenshot(fixture.args));
    assert.equal(fixture.state().stopped, 1);
    assert.equal(fixture.state().exported, false);
  }
  const fixture = setup();
  fixture.args.CropTarget = null;
  await assert.rejects(
    captureScreenshot(fixture.args),
    /desktop Chrome or Edge/,
  );
  assert.equal(fixture.state().options, undefined);
});
test("frame/encoder errors stop capture and reject whole-tab or clipped frames", async () => {
  for (const settings of [{ encodingError: true }, { frameError: true }]) {
    const fixture = setup(settings);
    await assert.rejects(captureScreenshot(fixture.args));
    assert.equal(fixture.state().stopped, 1);
    assert.equal(fixture.state().paused, true);
  }
  assert.throws(
    () => screenshotSource(1920, 1080, deviceViewport(devices[0])),
    /full device/,
  );
  assert.throws(
    () => screenshotSource(0, 0, deviceViewport(devices[0])),
    /full device/,
  );
  assert.equal(
    screenshotError({ name: "NotAllowedError" }),
    "Screenshot canceled. Nothing was saved.",
  );
});
