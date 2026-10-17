import type { StampFont } from "./photoStamp";

// The heading font the page itself is using, so a photo's caption matches the
// event name above the camera. `--font-heading` has its next/font variables
// already substituted by the time it is read back from the computed style.
// Browser-only.
export function pageHeadingFont(): StampFont {
  const style = getComputedStyle(document.documentElement);

  return {
    family: style.getPropertyValue("--font-heading").trim() || "Arial, Helvetica, sans-serif",
    weight: style.getPropertyValue("--heading-weight").trim() || "700",
    scale: parseFloat(style.getPropertyValue("--heading-scale")) || 1,
  };
}
