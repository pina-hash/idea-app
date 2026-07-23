/**
 * GREENLINE menu SFX.
 *
 * The UI had no sound at all before this, and the surfaces that need it (title,
 * garage, settings, results) carry well over a hundred buttons between them.
 * Rather than a play call in every handler, `uiSounds` is a Svelte action that
 * puts ONE delegated pointer listener pair on a panel root: any <button> inside
 * it gets the hover tick and the click, and a button that wants a different cue
 * declares it with `data-sfx` instead of wiring anything.
 *
 *   <button data-sfx="confirm">START</button>   // ascending confirm chime
 *   <button data-sfx="back">BACK</button>       // descending inverse
 *   <button data-sfx="none">…</button>          // silent (owner plays its own)
 *
 * OUTCOME cues (purchase succeeded, funds short, socket conflict, save) are
 * deliberately NOT here: they depend on what the handler decided, not on what
 * was pressed, so those call playSfx directly at the decision point.
 */

import { playSfx, type SfxRef } from './sfx';

/** Cues a button may name via `data-sfx`. */
const UI_CUES = {
	click: 'ui_click',
	confirm: 'ui_confirm',
	back: 'ui_back',
	error: 'ui_error',
	save: 'ui_save',
	tab: 'ui_tab_switch',
	purchase: 'ui_purchase',
	insufficient: 'ui_insufficient_funds',
	conflict: 'ui_socket_conflict'
} as const satisfies Record<string, SfxRef>;

type UiCue = keyof typeof UI_CUES;

/** Play a named menu cue directly (for outcome-driven moments). */
export function playUiSfx(cue: UiCue): void {
	playSfx(UI_CUES[cue]);
}

function controlFor(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	const el = target.closest('button, [role="button"], summary');
	if (!(el instanceof HTMLElement)) return null;
	// A disabled control is a non-event: clicking it should feel like nothing
	// happened, which is exactly what it sounds like.
	if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null;
	return el;
}

function cueOf(el: HTMLElement): UiCue | 'none' {
	const declared = el.dataset.sfx;
	if (!declared) return 'click';
	if (declared === 'none') return 'none';
	return declared in UI_CUES ? (declared as UiCue) : 'click';
}

/**
 * Delegated menu sounds for every control inside `node`.
 * Usage: `<div class="gg-panel" use:uiSounds>`
 */
export function uiSounds(node: HTMLElement) {
	// Track the last hovered control so sliding across one button does not
	// retrigger the tick on every pointermove-driven pointerover bubble.
	let lastHover: HTMLElement | null = null;

	const onOver = (e: PointerEvent) => {
		const el = controlFor(e.target);
		if (!el || el === lastHover) {
			if (!el) lastHover = null;
			return;
		}
		lastHover = el;
		if (cueOf(el) === 'none') return;
		playSfx('ui_hover');
	};

	const onDown = (e: PointerEvent) => {
		// Primary button only: a right-click or middle-click is not a UI press.
		if (e.button !== 0) return;
		const el = controlFor(e.target);
		if (!el) return;
		const cue = cueOf(el);
		if (cue === 'none') return;
		playSfx(UI_CUES[cue]);
	};

	const onLeave = () => {
		lastHover = null;
	};

	// Capture phase: a handler that stops propagation (several panels do, to keep
	// clicks off the scrim behind them) must not also silence the button.
	node.addEventListener('pointerover', onOver, true);
	node.addEventListener('pointerdown', onDown, true);
	node.addEventListener('pointerleave', onLeave);

	return {
		destroy() {
			node.removeEventListener('pointerover', onOver, true);
			node.removeEventListener('pointerdown', onDown, true);
			node.removeEventListener('pointerleave', onLeave);
		}
	};
}
