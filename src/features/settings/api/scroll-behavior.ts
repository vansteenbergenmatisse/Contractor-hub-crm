// Page scrolls glide, unless the system asks for less motion.
export function scrollBehavior(): ScrollBehavior {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? "auto" : "smooth";
}
