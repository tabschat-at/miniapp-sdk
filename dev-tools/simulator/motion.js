const running = new WeakMap();

export function stopMotion(element) {
  running.get(element)?.cancel();
  running.delete(element);
}

export function slide(element, opening) {
  stopMotion(element);
  if (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !element.animate
  )
    return Promise.resolve();
  // Move only this panel by its own height. Its backdrop and screen stay fixed.
  const frames = [
    { transform: "translateY(100%)" },
    { transform: "translateY(0)" },
  ];
  const animation = element.animate(opening ? frames : frames.toReversed(), {
    duration: opening ? 280 : 220,
    easing: opening
      ? "cubic-bezier(.215,.61,.355,1)"
      : "cubic-bezier(.55,.055,.675,.19)",
    fill: "both",
  });
  running.set(element, animation);
  return animation.finished
    .catch(() => {})
    .finally(() => {
      if (running.get(element) === animation) {
        running.delete(element);
        animation.cancel();
      }
    });
}
