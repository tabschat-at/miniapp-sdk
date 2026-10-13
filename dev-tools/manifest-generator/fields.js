const types = [
  ["string", "Text"],
  ["integer", "Integer"],
  ["boolean", "Yes / no"],
  ["datetime", "Date & time"],
  ["array", "List of text"],
];
const make = (tag, text) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
};

// Imported advanced definitions stay intact; only explicitly edited properties change.
export function schemaEditor(doc, onChange) {
  const card = make("div");
  card.className = "schema-card";
  const title = make("h3", doc.id);
  card.append(title);
  const record =
    doc.defs?.main?.type === "record" ? doc.defs.main.record : null;
  const rows = make("div");
  card.append(rows);
  const notify = () => {
    onChange();
    raw.value = JSON.stringify(doc, null, 2);
  };
  const fieldType = (def) =>
    def.type === "string" && def.format === "datetime" ? "datetime" : def.type;
  function draw() {
    rows.replaceChildren();
    if (!record || record.type !== "object") return;
    for (const [originalName, def] of Object.entries(record.properties)) {
      let name = originalName;
      const limitControls = [];
      const row = make("div");
      row.className = "field-row";
      const label = make("label", "Field name"),
        input = make("input");
      input.value = name;
      input.setAttribute("aria-label", `Field name ${name}`);
      label.append(input);
      input.oninput = () => {
        const next = input.value.trim();
        if (
          !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(next) ||
          (next !== name && Object.hasOwn(record.properties, next))
        ) {
          input.setCustomValidity(
            "Use a unique field name starting with a letter.",
          );
          notify();
          return;
        }
        input.setCustomValidity("");
        record.properties = Object.fromEntries(
          Object.entries(record.properties).map(([k, v]) => [
            k === name ? next : k,
            v,
          ]),
        );
        for (const key of ["required", "nullable"])
          if (record[key])
            record[key] = record[key].map((k) => (k === name ? next : k));
        name = next;
        input.setAttribute("aria-label", `Field name ${name}`);
        select.setAttribute("aria-label", `Type of ${name}`);
        checkbox.setAttribute("aria-label", `Require ${name}`);
        remove.setAttribute("aria-label", `Remove ${name}`);
        for (const [control, text] of limitControls)
          control.setAttribute("aria-label", `${name} ${text}`);
        notify();
      };
      const typeLabel = make("label", "Type"),
        select = make("select");
      select.setAttribute("aria-label", `Type of ${name}`);
      const basic =
        types.some(([type]) => type === fieldType(def)) &&
        (def.type !== "array" || def.items?.type === "string");
      for (const [value, text] of types) {
        const option = make("option", text);
        option.value = value;
        select.append(option);
      }
      if (!basic) {
        const option = make("option", "Advanced JSON");
        option.value = "advanced";
        select.append(option);
      }
      select.value = basic ? fieldType(def) : "advanced";
      typeLabel.append(select);
      select.onchange = () => {
        if (select.value === "advanced") return;
        record.properties[name] =
          select.value === "datetime"
            ? { type: "string", format: "datetime" }
            : select.value === "array"
              ? {
                  type: "array",
                  maxLength: 100,
                  items: { type: "string", maxLength: 300 },
                }
              : { type: select.value };
        draw();
        notify();
      };
      const required = make("label", "Required"),
        checkbox = make("input");
      checkbox.type = "checkbox";
      checkbox.checked = record.required?.includes(name) ?? false;
      checkbox.setAttribute("aria-label", `Require ${name}`);
      required.prepend(checkbox);
      required.className = "required-field";
      checkbox.onchange = () => {
        record.required = [
          ...new Set([
            ...(record.required ?? []).filter((k) => k !== name),
            ...(checkbox.checked ? [name] : []),
          ]),
        ];
        notify();
      };
      const remove = make("button", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${name}`);
      remove.onclick = () => {
        delete record.properties[name];
        for (const key of ["required", "nullable"])
          if (record[key]) record[key] = record[key].filter((k) => k !== name);
        draw();
        notify();
      };
      row.append(label, typeLabel, required, remove);
      rows.append(row);
      if (
        ["string", "integer", "array"].includes(def.type) &&
        def.format !== "datetime"
      ) {
        const limits = make("div");
        limits.className = "field-limits";
        for (const [key, text] of def.type === "integer"
          ? [
              ["minimum", "Minimum"],
              ["maximum", "Maximum"],
            ]
          : [
              [
                "minLength",
                def.type === "array" ? "Min items" : "Min UTF-8 bytes",
              ],
              [
                "maxLength",
                def.type === "array" ? "Max items" : "Max UTF-8 bytes",
              ],
            ]) {
          const label = make("label", text),
            control = make("input");
          control.type = "number";
          control.step = "1";
          if (def.type !== "integer") control.min = "0";
          control.value = def[key] ?? "";
          control.setAttribute("aria-label", `${name} ${text}`);
          limitControls.push([control, text]);
          label.append(control);
          limits.append(label);
          control.oninput = () => {
            if (control.value === "") delete def[key];
            else def[key] = Number(control.value);
            notify();
          };
        }
        rows.append(limits);
      }
    }
  }
  if (record?.type === "object") {
    const add = make("button", "+ Add field");
    add.type = "button";
    add.onclick = () => {
      let i = 1;
      while (Object.hasOwn(record.properties, `field${i}`)) i++;
      record.properties[`field${i}`] = { type: "string", maxLength: 300 };
      draw();
      notify();
    };
    card.append(add);
  }
  const advanced = make("details"),
    summary = make("summary", "Advanced Lexicon JSON"),
    raw = make("textarea");
  raw.rows = 14;
  raw.spellcheck = false;
  raw.value = JSON.stringify(doc, null, 2);
  raw.setAttribute("aria-label", `Lexicon JSON ${doc.id}`);
  const apply = make("button", "Apply JSON");
  apply.type = "button";
  const error = make("p");
  error.className = "schema-error";
  error.setAttribute("role", "alert");
  apply.onclick = () => {
    try {
      const value = JSON.parse(raw.value);
      if (value.id !== doc.id || value.lexicon !== 1 || !value.defs)
        throw Error("Keep the same Lexicon ID and supply a V1 document.");
      for (const key of Object.keys(doc)) delete doc[key];
      Object.assign(doc, value);
      onChange(true);
      error.textContent = "";
    } catch (e) {
      error.textContent = e.message;
    }
  };
  advanced.append(summary, raw, apply, error);
  card.append(advanced);
  draw();
  card.addEventListener("input", (event) => event.stopPropagation());
  return card;
}
