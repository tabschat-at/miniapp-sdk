// Physical panel specifications are sourced in ../README.md. Reference DPR is a
// chosen layout density, not a claim about every device's Android display setting.
export const hostChrome = { status: 28, header: 56, navigation: 20, border: 7 };
export const chromeHeight =
  hostChrome.status + hostChrome.header + hostChrome.navigation;
const google = "https://support.google.com/pixelphone/answer/7158570?hl=en";
const samsung =
  "https://www.samsung.com/uk/support/mobile-devices/what-is-the-difference-between-the-galaxy-z-fold-models/";
function preset(name, physicalWidth, physicalHeight, dpr, source, fold = {}) {
  const screenWidth = Math.ceil(physicalWidth / dpr);
  const screenHeight = Math.ceil(physicalHeight / dpr);
  return {
    name,
    physicalWidth,
    physicalHeight,
    dpr,
    source,
    screenWidth,
    screenHeight,
    width: screenWidth,
    height: screenHeight - chromeHeight,
    ...fold,
  };
}
export const devices = [
  preset("Pixel 9", 1080, 2424, 2.625, google),
  preset(
    "Galaxy S24",
    1080,
    2340,
    3,
    "https://www.samsung.com/uk/smartphones/galaxy-s24/specs/",
  ),
  preset("Pixel 9 Pro XL", 1344, 2992, 3, google),
  preset(
    "iPhone SE · layout only",
    750,
    1334,
    2,
    "https://support.apple.com/en-us/111882",
  ),
  preset(
    "iPhone 16 Pro · layout only",
    1206,
    2622,
    3,
    "https://support.apple.com/en-us/121031",
  ),
  preset("Tablet", 1600, 2560, 2, null),
  preset("Pixel 10", 1080, 2424, 2.625, google),
  preset("Pixel 10 Pro XL", 1344, 2992, 3, google),
  preset(
    "Galaxy S26",
    1080,
    2340,
    3,
    "https://www.samsung.com/au/business/smartphones/galaxy-s/galaxy-s26-black-256gb-sm-s942bzkeats/",
  ),
  preset(
    "Galaxy S26 Ultra",
    1440,
    3120,
    3.5,
    "https://www.samsung.com/ca/business/smartphones/galaxy-s/galaxy-s26-ultra-sm-s948wzdaxac/",
  ),
  preset(
    "iPhone 17 Pro · layout only",
    1206,
    2622,
    3,
    "https://support.apple.com/en-us/125090",
  ),
  preset("Pixel 10 Pro Fold · folded", 1080, 2364, 2.625, google, {
    foldFamily: "pixel-10-pro-fold",
    folded: true,
  }),
  preset("Pixel 10 Pro Fold · unfolded", 2076, 2152, 2.625, google, {
    foldFamily: "pixel-10-pro-fold",
    folded: false,
  }),
  preset("Galaxy Z Fold8 · folded · wide", 1248, 1972, 3, samsung, {
    foldFamily: "galaxy-z-fold8",
    folded: true,
  }),
  preset("Galaxy Z Fold8 · unfolded · wide", 2448, 1848, 3, samsung, {
    foldFamily: "galaxy-z-fold8",
    folded: false,
  }),
];
export function deviceViewport(device, rotated = false) {
  return {
    width: rotated ? device.screenHeight : device.screenWidth,
    height: (rotated ? device.screenWidth : device.screenHeight) - chromeHeight,
  };
}

// Folding is a viewport change, preserving the current orientation and app session.
export function toggleFold(device, viewport) {
  if (!device?.foldFamily) return null;
  const next = devices.find(
    (candidate) =>
      candidate.foldFamily === device.foldFamily &&
      candidate.folded !== device.folded,
  );
  if (!next) return null;
  const rotated = deviceViewport(device, true);
  return {
    device: next,
    viewport: deviceViewport(
      next,
      viewport.width === rotated.width && viewport.height === rotated.height,
    ),
  };
}
