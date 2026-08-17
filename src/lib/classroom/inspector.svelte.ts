/**
 * WHETHER THE ITEM PAGE'S INSTRUCTOR INSPECTOR IS OPEN.
 *
 * It lives out here rather than inside ItemDetail because ItemDetail is the
 * PAGE component: opening a different item remounts it, and a teacher who
 * opened the tools once should not have to open them again on every item they
 * click through. Module state survives that remount, which is exactly the
 * "across item navigation within a session" the tools want.
 *
 * DELIBERATELY NOT PERSISTED. This is not a preference about who you are, it
 * is where you are in a sitting -- the same reasoning that keeps the notebook's
 * theme in localStorage and this out of it. A fresh load starts collapsed,
 * which is the right default for a page whose content is the student's view.
 *
 * The reactive-module convention this follows is creative.svelte.ts /
 * audio-settings.svelte.ts / notebook-theme.svelte.ts: a `$state` object
 * exported by a `.svelte.ts` module, mutated through its own property.
 */
export const itemInspector = $state({ open: false });

export function toggleItemInspector(): void {
	itemInspector.open = !itemInspector.open;
}
