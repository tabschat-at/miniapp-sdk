const maximum = 8;
const maxFileBytes = 10 * 1024 * 1024;
const maxUploadBytes = 1_000_000;

// Only raster formats enter the image decoder; uploads never include original metadata.
export async function optimizeScreenshot(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Choose a PNG, JPEG or WebP image.");
  if (!file.size || file.size > maxFileBytes)
    throw Error("Each screenshot must be 10 MB or smaller.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw Error("This screenshot could not be opened. Choose a valid image.");
  });
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw Error("This image is too large. Export a smaller screenshot.");
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Could not prepare this screenshot.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.75, 0.6, 0.45]) {
      const source = canvas.toDataURL("image/jpeg", quality);
      const data = source.slice(source.indexOf(",") + 1);
      if (Math.floor((data.length * 3) / 4) <= maxUploadBytes)
        return {
          value: { mimeType: "image/jpeg", data },
          source,
          name: file.name,
        };
    }
    throw Error(
      "This screenshot is too detailed. Export a smaller image and try again.",
    );
  } finally {
    bitmap.close();
  }
}

export function screenshotLink(value) {
  try {
    if (!value || value.length > 2048 || /[\x00-\x20\x7f]/.test(value))
      throw Error();
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !url.hostname.includes(".") ||
      url.hostname.includes(":") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
      /(?:^|\.)(localhost|local|internal|home|lan)$/.test(url.hostname)
    )
      throw Error();
    url.hash = "";
    return url.href;
  } catch {
    throw Error("Use a public HTTPS link directly to an image.");
  }
}

export function screenshotEditor({
  files,
  link,
  add,
  previews,
  status,
  changed,
}) {
  const items = [];
  let preparing = false,
    locked = false;
  function controls() {
    files.disabled = add.disabled = link.disabled = preparing || locked;
    for (const button of previews.querySelectorAll("button"))
      button.disabled = preparing || locked;
    changed(preparing || locked);
  }
  function render() {
    previews.replaceChildren(
      ...items.map((item, index) => {
        const card = document.createElement("figure");
        const image = document.createElement("img");
        image.src = item.source;
        image.alt = `Screenshot ${index + 1}`;
        image.referrerPolicy = "no-referrer";
        const caption = document.createElement("figcaption");
        caption.textContent = item.name;
        image.onerror = () => {
          caption.textContent = `${item.name} — preview unavailable; check that the link opens an image publicly.`;
        };
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove screenshot ${index + 1}`);
        remove.onclick = () => {
          items.splice(index, 1);
          status.textContent = `${items.length} of ${maximum} screenshots added.`;
          render();
        };
        card.append(image, caption, remove);
        return card;
      }),
    );
    controls();
  }
  files.addEventListener("change", async () => {
    const selected = [...files.files];
    files.value = "";
    if (selected.length + items.length > maximum) {
      status.textContent =
        "You can add up to 8 screenshots in total. Remove one before adding more.";
      return;
    }
    preparing = true;
    controls();
    const errors = [];
    for (const file of selected) {
      status.textContent = `Preparing ${file.name}…`;
      try {
        items.push(await optimizeScreenshot(file));
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    preparing = false;
    status.textContent = errors.length
      ? errors.join("\n")
      : `${items.length} of ${maximum} screenshots added.`;
    render();
  });
  function addLink() {
    try {
      if (items.length >= maximum)
        throw Error("You can add up to 8 screenshots in total.");
      const source = screenshotLink(link.value.trim());
      items.push({
        value: source,
        source,
        name: new URL(source).pathname.split("/").pop() || "Linked screenshot",
      });
      link.value = "";
      status.textContent = `${items.length} of ${maximum} screenshots added.`;
      render();
    } catch (error) {
      status.textContent = error.message;
    }
  }
  add.addEventListener("click", addLink);
  link.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addLink();
    }
  });
  return {
    get busy() {
      return preparing;
    },
    values() {
      return items.map((item) => item.value);
    },
    lock(value) {
      locked = value;
      controls();
    },
    includePendingLink() {
      if (!link.value.trim()) return true;
      const count = items.length;
      addLink();
      return items.length > count;
    },
    clear() {
      items.length = 0;
      link.value = "";
      status.textContent = "";
      render();
    },
  };
}
