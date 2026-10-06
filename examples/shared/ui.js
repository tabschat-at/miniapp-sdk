import { describeError } from "../../src/index.js";
export const element = (id) => document.getElementById(id);
let busy = false;
export async function run(action) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll("button")];
  const prior = buttons.map((button) => button.disabled);
  buttons.forEach((button) => {
    button.disabled = true;
  });
  element("status").textContent = "Working…";
  try {
    await action();
  } catch (error) {
    element("status").textContent = describeError(error);
  } finally {
    buttons.forEach((button, i) => {
      button.disabled = prior[i];
    });
    busy = false;
  }
}
