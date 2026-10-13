// A workspace introduction, separate from each app's first-run permission review.
export function showWelcomeTour({ user, complete }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("welcome-tour"),
    card = dialog.querySelector(".tour-card"),
    highlight = $("tour-highlight"),
    previousFocus = document.activeElement;
  const steps = [
    {
      target: document.querySelector(".host-session"),
      title: "Your simulated Tabschat user",
      description: user
        ? `${user.displayName} is already selected as your simulated Tabschat user. Your mini-app receives this user after permissions are accepted. Choose Switch user to try another account.`
        : "This is the simulated Tabschat user entering your apps. New workspaces start with a user selected for you. Choose Sign in here to select a user before opening an app.",
    },
    {
      target: $("add-app"),
      title: "Add your app",
      description:
        "Use + to enter your app’s URL. We’ll discover its name, icon and permissions, then add it to this Apps screen. Open its icon to experience the first-run permission prompts. You’re ready to start!",
    },
  ];
  let step = 0,
    frame;
  function position() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!dialog.open) return;
      const rect = steps[step].target.getBoundingClientRect();
      const padding = 6,
        margin = 16,
        gap = 22;
      Object.assign(highlight.style, {
        left: `${rect.left - padding}px`,
        top: `${rect.top - padding}px`,
        width: `${rect.width + padding * 2}px`,
        height: `${rect.height + padding * 2}px`,
      });
      const { width, height } = card.getBoundingClientRect();
      let left = rect.right - width,
        top = rect.bottom + gap;
      if (step === 1 && rect.right + gap + width <= innerWidth - margin) {
        left = rect.right + gap;
        top = rect.top;
      } else if (top + height > innerHeight - margin) {
        top = rect.top - gap - height;
      }
      card.style.left = `${Math.max(margin, Math.min(left, innerWidth - width - margin))}px`;
      card.style.top = `${Math.max(margin, Math.min(top, innerHeight - height - margin))}px`;
    });
  }
  function render() {
    $("tour-step").textContent = `WELCOME · ${step + 1} OF ${steps.length}`;
    $("tour-title").textContent = steps[step].title;
    $("tour-description").textContent = steps[step].description;
    $("tour-back").hidden = step === 0;
    $("tour-next").textContent = step === steps.length - 1 ? "Finish" : "Next";
    position();
    $("tour-next").focus();
  }
  function finish(focusAdd = false) {
    complete();
    dialog.close();
    cancelAnimationFrame(frame);
    observer.disconnect();
    removeEventListener("resize", position);
    document.removeEventListener("scroll", position, true);
    (focusAdd ? $("add-app") : previousFocus)?.focus();
  }
  $("tour-next").onclick = () => {
    if (step === steps.length - 1) finish(true);
    else {
      step++;
      render();
    }
  };
  $("tour-back").onclick = () => {
    step--;
    render();
  };
  $("tour-skip").onclick = () => finish();
  dialog.oncancel = (event) => {
    event.preventDefault();
    finish();
  };
  const observer = new ResizeObserver(position);
  for (const { target } of steps) observer.observe(target);
  observer.observe(card);
  addEventListener("resize", position);
  document.addEventListener("scroll", position, true);
  dialog.showModal();
  render();
}
