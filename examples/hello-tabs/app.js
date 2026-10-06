import { getHost } from "../../src/index.js";
import { element, run } from "../shared/ui.js";
element("self").onclick = () =>
  run(async () => {
    const self = await getHost().identity.getSelf();
    element("identity").textContent = `@${self.handle} · ${self.did}`;
    element("status").textContent = "Public identity loaded.";
  });
