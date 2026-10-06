import { getHost, recordKey } from "../../src/index.js";
import { element, run } from "../shared/ui.js";
const collection = "org.example.recipes.recipe";
// Relative path uses the developer's publisher origin, not the Tabs AppView.
// If using another origin, change this and declare it in manifest.networkAccess.
const feedUrl = "/api/recipes";
let last = null; // Example-only cache. A new device/reload does not recover ownership history.
const value = () => ({
  $type: collection,
  title: element("title").value.trim(),
  ingredients: [{ name: element("ingredient").value.trim(), quantity: 2 }],
});
element("publish").onclick = () =>
  run(async () => {
    last = await getHost().records.create({ collection, value: value() });
    element("status").textContent =
      `Published ${last.uri}. The developer's index may take a minute to refresh.`;
  });
element("update").onclick = () =>
  run(async () => {
    if (!last) {
      element("status").textContent = "Publish a recipe in this visit first.";
      return;
    }
    last = await getHost().records.update({
      collection,
      rkey: recordKey(last.uri, collection),
      value: value(),
    });
    element("status").textContent = "Public recipe updated.";
  });
element("delete").onclick = () =>
  run(async () => {
    if (!last) {
      element("status").textContent = "Publish a recipe in this visit first.";
      return;
    }
    await getHost().records.delete({
      collection,
      rkey: recordKey(last.uri, collection),
    });
    last = null;
    element("status").textContent =
      "Public recipe deleted; index refresh is asynchronous.";
  });
element("browse").onclick = () =>
  run(async () => {
    const response = await fetch(feedUrl, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Recipe feed unavailable");
    const page = await response.json();
    if (!Array.isArray(page.records) || page.records.length > 100)
      throw new Error("Invalid recipe feed");
    element("feed").replaceChildren(
      ...page.records.map((item) => {
        const row = document.createElement("li");
        row.textContent = `${item.record.title} · @${item.author.handle}`;
        return row;
      }),
    );
    element("status").textContent =
      page.source === "developer-backend-preview-fixture"
        ? "Developer API preview fixture. This feed is separate from mock publications."
        : "Loaded from the developer's own API.";
  });
