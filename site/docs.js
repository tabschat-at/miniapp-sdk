const navigation = document.querySelector(".navigation");
const mobile = window.matchMedia("(max-width: 700px)");
navigation.open = !mobile.matches;
mobile.addEventListener("change", () => {
  navigation.open = !mobile.matches;
});
const input = document.querySelector("#docs-search");
const results = document.querySelector("#search-results");
let index;
let sequence = 0;
input.addEventListener("input", async () => {
  const current = ++sequence;
  const query = input.value.trim().toLowerCase();
  results.replaceChildren();
  if (query.length < 2) return;
  try {
    index ??= await fetch("/assets/search.json").then((r) => {
      if (!r.ok) throw new Error("Search unavailable");
      return r.json();
    });
    if (current !== sequence) return;
    const terms = query.split(/\s+/);
    const matches = index
      .filter((page) =>
        terms.every((term) =>
          `${page.title} ${page.text}`.toLowerCase().includes(term),
        ),
      )
      .sort(
        (a, b) =>
          Number(b.title.toLowerCase().includes(query)) -
          Number(a.title.toLowerCase().includes(query)),
      )
      .slice(0, 8);
    for (const page of matches) {
      const link = document.createElement("a");
      link.href = page.url;
      link.textContent = page.title;
      results.append(link);
    }
    if (!matches.length) {
      const message = document.createElement("p");
      message.textContent = "No matching pages. Try a capability name.";
      results.append(message);
    }
  } catch {
    if (current !== sequence) return;
    const message = document.createElement("p");
    message.textContent =
      "Search is unavailable. Use the documentation navigation.";
    results.append(message);
  }
});
for (const pre of document.querySelectorAll("pre")) {
  const code = pre.querySelector("code");
  if (!code || !navigator.clipboard) continue;
  const button = document.createElement("button");
  button.className = "copy";
  button.type = "button";
  const isPrompt = code.classList.contains("language-prompt");
  const label = isPrompt ? "Copy prompt" : "Copy";
  button.textContent = label;
  button.setAttribute(
    "aria-label",
    isPrompt ? "Copy agent prompt" : "Copy code example",
  );
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select to copy";
    }
    setTimeout(() => {
      button.textContent = label;
    }, 1800);
  });
  pre.append(button);
}
