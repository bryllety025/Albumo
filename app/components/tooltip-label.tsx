/**
 * A small floating label for an icon-only button, shown on hover/focus with
 * no built-in delay -- unlike the browser's native `title` tooltip, which
 * waits roughly a second (and isn't reliable inside custom-styled controls)
 * before it appears. Pure CSS (Tailwind's `group-hover`/`group-focus-visible`),
 * so it shows the instant the pointer enters.
 *
 * Render as the last child of the button/link it labels, which must also
 * carry `group/tooltip` and either `relative` or already be positioned
 * (`absolute`/`fixed`) so this can anchor to it -- see any call site for the
 * pattern. The button still needs its own `aria-label`; this is only the
 * visible hint for sighted users, not the accessible name.
 *
 * Centered under the button by default. For a button at the right edge of the
 * screen, `align="end"` lines the label's right edge up with the button's
 * instead, so it can't hang out past the edge (even while invisible, a
 * centered label takes up room and makes its scroll container pan sideways).
 */
export function TooltipLabel({ children, align = "center" }: { children: string; align?: "center" | "end" }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full z-50 mt-1.5 whitespace-nowrap ${align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"} rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-ivory opacity-0 shadow-lg transition-opacity duration-100 group-hover/tooltip:opacity-100 group-focus-visible/tooltip:opacity-100`}
    >
      {children}
    </span>
  );
}
