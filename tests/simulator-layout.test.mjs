import assert from "node:assert/strict";
import { test } from "node:test";
import {
  devices,
  deviceViewport,
  toggleFold,
  chromeHeight,
  hostChrome,
} from "../dev-tools/simulator/devices.js";
import { slide, stopMotion } from "../dev-tools/simulator/motion.js";

test("presets preserve panel proportions and subtract host chrome once in either orientation", () => {
  for (const device of devices) {
    const portrait = deviceViewport(device),
      landscape = deviceViewport(device, true);
    assert.equal(portrait.width, Math.ceil(device.physicalWidth / device.dpr));
    assert.equal(
      portrait.height + chromeHeight,
      Math.ceil(device.physicalHeight / device.dpr),
    );
    assert.equal(landscape.width, portrait.height + chromeHeight);
    assert.equal(landscape.height + chromeHeight, portrait.width);
    assert.equal(
      portrait.height + chromeHeight + hostChrome.border * 2,
      device.screenHeight + 14,
    );
    assert.ok(portrait.width >= 240 && portrait.height >= 240);
    assert.ok(landscape.width >= 240 && landscape.height >= 240);
  }
  const wide = devices.filter((device) => device.name.includes("Fold8"));
  assert.equal(wide.length, 2);
  assert.deepEqual(deviceViewport(wide[0]), { width: 416, height: 554 });
  assert.deepEqual(deviceViewport(wide[1]), { width: 816, height: 512 });
});

test("folding pairs preserve device family and orientation through a round trip", () => {
  for (const device of devices) {
    for (const rotated of [false, true]) {
      const viewport = deviceViewport(device, rotated);
      const next = toggleFold(device, viewport);
      if (!device.foldFamily) {
        assert.equal(next, null);
        continue;
      }
      assert.equal(next.device.foldFamily, device.foldFamily);
      assert.equal(next.device.folded, !device.folded);
      assert.deepEqual(next.viewport, deviceViewport(next.device, rotated));
      const back = toggleFold(next.device, next.viewport);
      assert.equal(back.device, device);
      assert.deepEqual(back.viewport, viewport);
    }
  }
  assert.equal(toggleFold(undefined, { width: 500, height: 500 }), null);
});

test("interrupted motion settles without cancelling a newer transition; reduced motion is immediate", async (t) => {
  const previous = globalThis.matchMedia;
  t.after(() => {
    if (previous) globalThis.matchMedia = previous;
    else delete globalThis.matchMedia;
  });
  globalThis.matchMedia = () => ({ matches: false });
  const animations = [];
  const element = {
    clientHeight: 100,
    parentElement: { clientHeight: 500 },
    animate(frames, options) {
      let resolve, reject;
      const animation = {
        frames,
        options,
        cancelled: false,
        finished: new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
        finish() {
          resolve();
        },
        cancel() {
          this.cancelled = true;
          reject(Error("cancelled"));
        },
      };
      animations.push(animation);
      return animation;
    },
  };
  const opening = slide(element, true),
    closing = slide(element, false);
  await opening;
  assert.equal(animations[0].cancelled, true);
  assert.equal(animations[1].cancelled, false);
  assert.equal(animations[1].frames.at(-1).transform, "translateY(100%)");
  stopMotion(element);
  await closing;
  const next = slide(element, true);
  animations[2].finish();
  await next;
  assert.equal(animations[2].cancelled, true);
  globalThis.matchMedia = () => ({ matches: true });
  await slide(element, true);
  assert.equal(animations.length, 3);
});
