import { createRecordSchemas } from "../common/records.js";
import { parseManifest, failure } from "./host.js";

export const libraryKey = "tabs-sdk-simulator-library-v1";

export function appUrl(value, baseUrl) {
  const url = new URL(value, baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw failure(
      "INVALID_INPUT",
      "Use an HTTP or HTTPS app URL without credentials.",
    );
  return url.href;
}

// Consent is tied to the complete manifest, including network/collection changes.
function signature(value) {
  if (Array.isArray(value)) return value.map(signature);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, signature(value[key])]),
    );
  return value;
}
export function sameManifest(left, right) {
  return JSON.stringify(signature(left)) === JSON.stringify(signature(right));
}

export function createProjectLibrary({
  storage,
  baseUrl,
  seeds = [],
  onStorageError = () => {},
}) {
  let projects = [];
  function save() {
    try {
      storage?.setItem(libraryKey, JSON.stringify({ v: 1, projects }));
    } catch {
      onStorageError(
        "Browser storage is unavailable. Projects will last for this browser session only.",
      );
    }
  }
  function clean(value) {
    const url = appUrl(value.url, baseUrl),
      manifest = parseManifest(value.manifest);
    const lexicons = structuredClone(value.lexicons ?? []);
    createRecordSchemas(lexicons);
    const permissions = Object.fromEntries(
      Object.entries(value.permissions ?? {}).filter(
        ([capability, decision]) =>
          manifest.permissions.includes(capability) &&
          ["allow", "deny"].includes(decision),
      ),
    );
    let iconUrl, manifestUrl;
    try {
      if (value.iconUrl) iconUrl = appUrl(value.iconUrl, url);
    } catch {
      /* Invalid branding uses initials. */
    }
    try {
      if (value.manifestUrl) manifestUrl = appUrl(value.manifestUrl, url);
    } catch {
      /* Ignore obsolete source. */
    }
    return {
      url,
      manifest,
      lexicons,
      iconUrl,
      manifestUrl,
      sourceSignature:
        typeof value.sourceSignature === "string" &&
        value.sourceSignature.length <= 2097152
          ? value.sourceSignature
          : undefined,
      reviewed: value.reviewed === true,
      permissions,
    };
  }
  try {
    const saved = JSON.parse(storage?.getItem(libraryKey) ?? "null");
    if (saved?.v === 1 && Array.isArray(saved.projects)) {
      for (const value of saved.projects.slice(0, 100)) {
        try {
          const project = clean(value);
          if (!projects.some((item) => item.url === project.url))
            projects.push(project);
        } catch {
          /* Ignore obsolete or invalid local entries. */
        }
      }
    }
  } catch {
    onStorageError(
      "Saved projects could not be read. The simulator is using a fresh library.",
    );
  }
  function add(value) {
    const project = clean(value),
      old = projects.find((item) => item.url === project.url);
    if (old) project.sourceSignature = old.sourceSignature;
    if (old && value.lexicons === undefined) project.lexicons = old.lexicons;
    if (old && value.iconUrl === undefined) project.iconUrl = old.iconUrl;
    if (old && value.manifestUrl === undefined)
      project.manifestUrl = old.manifestUrl;
    if (
      old &&
      sameManifest(old.manifest, project.manifest) &&
      sameManifest(old.lexicons, project.lexicons)
    ) {
      project.reviewed = old.reviewed;
      project.permissions = old.permissions;
    } else {
      project.reviewed = false;
      project.permissions = {};
    }
    if (!old && projects.length >= 100)
      throw failure(
        "INVALID_INPUT",
        "The library supports up to 100 projects. Remove a project before adding another.",
      );
    projects = old
      ? projects.map((item) => (item.url === project.url ? project : item))
      : [...projects, project];
    save();
    return structuredClone(project);
  }
  for (const seed of seeds) {
    const url = appUrl(seed.url, baseUrl);
    const sourceSignature = JSON.stringify(
      signature({ manifest: seed.manifest, lexicons: seed.lexicons ?? [] }),
    );
    const old = projects.find((item) => item.url === url);
    // Refresh changed files, but preserve inspector overrides when the source is unchanged.
    if (
      !old ||
      (old.sourceSignature !== undefined &&
        old.sourceSignature !== sourceSignature) ||
      (old.sourceSignature === undefined &&
        (!sameManifest(old.manifest, seed.manifest) ||
          !sameManifest(old.lexicons, seed.lexicons ?? [])))
    )
      add(seed);
    projects.find((item) => item.url === url).sourceSignature = sourceSignature;
  }
  if (seeds.length) save();

  return {
    list: () => structuredClone(projects),
    get: (url) => structuredClone(projects.find((item) => item.url === url)),
    add,
    remember(url, state) {
      const project = projects.find((item) => item.url === url);
      if (
        !project ||
        !sameManifest(project.manifest, state.manifest) ||
        (state.lexicons !== undefined &&
          !sameManifest(project.lexicons, state.lexicons))
      )
        return;
      project.reviewed = state.reviewed === true;
      project.permissions = Object.fromEntries(
        Object.entries(state.permissions).filter(
          ([capability, decision]) =>
            project.manifest.permissions.includes(capability) &&
            ["allow", "deny"].includes(decision),
        ),
      );
      save();
    },
    forgetConsent(url) {
      const project = projects.find((item) => item.url === url);
      if (project) {
        project.reviewed = false;
        project.permissions = {};
        save();
      }
    },
    remove(url) {
      projects = projects.filter((item) => item.url !== url);
      save();
    },
  };
}
