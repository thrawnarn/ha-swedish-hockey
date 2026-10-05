/** Scrolling the dialog's panel to the part of a list worth seeing first. */

/** Put a view's next game at the top of the panel, its day's heading with it
 *  where it is the day's first game, clear of the view switch where that is
 *  shown and held at the top. Returns false if there is nothing to scroll to
 *  yet, so the caller asks again after its next render. */
export function scrollToNext(view: HTMLElement): boolean {
  let row = view.querySelector<HTMLElement>(".fixture-row.next");
  if (row?.previousElementSibling?.classList.contains("team-section")) {
    row = row.previousElementSibling as HTMLElement;
  }
  const panel = view.closest<HTMLElement>(".panel");
  if (!row || !panel) return false;
  const held = panel.querySelector<HTMLElement>(".section-switch")?.offsetHeight ?? 0;
  panel.scrollTop = row.offsetTop - panel.offsetTop - 8 - held;
  return true;
}

/** Back to the top of the panel, once the view has drawn what was asked
 *  for: a table opened from a leader card should not open halfway down. */
export async function toTop(view: HTMLElement, settled: Promise<void>) {
  await settled;
  const panel = view.closest<HTMLElement>(".panel");
  if (panel) panel.scrollTop = 0;
}
