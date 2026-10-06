import { signInWithTabs, selectFiles, describeError } from "../../src/index.js";
const backend = "https://api.uploads.example.org"; // Replace with your own declared origin.
let session = null;
const status = document.querySelector("#status"),
  upload = document.querySelector("#upload"),
  signout = document.querySelector("#signout");
document.querySelector("#signin").addEventListener("click", async () => {
  try {
    session = await signInWithTabs({ backendOrigin: backend });
    upload.disabled = false;
    signout.disabled = false;
    status.textContent = `Signed in as ${session.did}.`;
  } catch (error) {
    status.textContent = describeError(error);
  }
});
upload.addEventListener("click", async () => {
  // Keep the chooser call synchronous with this user gesture.
  const selection = selectFiles();
  try {
    const [file] = await selection;
    if (!file || !session) return;
    if (file.size > 8 * 1024 * 1024) {
      status.textContent = "Choose a file smaller than 8 MiB for this example.";
      return;
    }
    const response = await fetch(`${backend}/upload`, {
      method: "PUT",
      redirect: "error",
      credentials: "omit",
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
        "content-type": "application/octet-stream",
      },
      body: file,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error();
    const result = await response.json();
    status.textContent = `Saved ${file.name} (${result.size} bytes).`;
  } catch (error) {
    status.textContent = describeError(error);
  }
});
signout.addEventListener("click", async () => {
  const previous = session;
  session = null;
  upload.disabled = true;
  signout.disabled = true;
  status.textContent = "Signed out.";
  if (previous)
    await fetch(`${backend}/auth/logout`, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers: { authorization: `Bearer ${previous.sessionToken}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
});
