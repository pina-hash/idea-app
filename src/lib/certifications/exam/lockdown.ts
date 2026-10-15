/**
 * EXAM LOCKDOWN LISTENERS (ledger 0391, docs/CERTIFICATIONS.md "Lockdown").
 *
 * Leaving the tab, losing focus, leaving full screen and shrinking the window
 * are LOGGED, with a kind, for the proctor to decide about; copy, paste, the
 * context menu and text selection are PREVENTED on the exam screen, and the
 * first three are logged too. Nothing here blocks the student: a flag is a
 * fact the proctor reads live (`cert_exam_flag`, `cert_exam_live`), never a
 * gate.
 *
 * Pure DOM: listeners on a root element, its document and its window, handed
 * one callback. `attachLockdown` returns the detach, is idempotent to detach
 * twice, and takes its document and window from the root (overridable), so
 * `tests/dom/cert-exam-lockdown.test.ts` drives it with happy-dom's own events
 * and reads `defaultPrevented` back.
 *
 * TWO LISTENERS CAN FIRE FOR ONE ACT. A tab switch fires `blur` on the window
 * and then `visibilitychange` on the document, so the proctor sees "Lost
 * focus" and "Left the tab" a few milliseconds apart. That is kept: the two
 * are different facts (an alt-tab to another window fires only the first), and
 * folding them would hide one of them half the time.
 *
 * THE RESIZE BASELINE MOVES WITH FULL SCREEN. Entering full screen enlarges
 * the window and leaving it shrinks it back, so a baseline taken inside full
 * screen would flag every exit twice. The baseline is re-taken on every
 * `fullscreenchange`, and `fullscreen_exit` is the only flag an exit earns.
 */
import type { ExamFlagKind } from '../types';

/** A window under this fraction of its starting width or height flags `resize`. */
export const LOCKDOWN_RESIZE_FRACTION = 0.8;

export interface LockdownOptions {
	doc?: Document;
	win?: Window;
	resizeFraction?: number;
}

/**
 * Attach every lockdown listener. `onflag` is called with the kind, from the
 * event handlers only, and a throw inside it is swallowed: logging must never
 * take the exam down.
 */
export function attachLockdown(
	root: HTMLElement,
	onflag: (kind: ExamFlagKind) => void,
	options: LockdownOptions = {}
): () => void {
	const doc = options.doc ?? root.ownerDocument;
	const win = options.win ?? doc.defaultView ?? window;
	const fraction = options.resizeFraction ?? LOCKDOWN_RESIZE_FRACTION;

	const flag = (kind: ExamFlagKind) => {
		try {
			onflag(kind);
		} catch {
			// A logger that throws must not stop the exam.
		}
	};

	const onVisibility = () => {
		if (doc.visibilityState === 'hidden' || doc.hidden) flag('hidden');
	};
	const onBlur = () => flag('blur');

	let inFull = !!doc.fullscreenElement;
	let baseW = win.innerWidth;
	let baseH = win.innerHeight;
	let shrunk = false;
	const onFullscreen = () => {
		const nowFull = !!doc.fullscreenElement;
		if (inFull && !nowFull) flag('fullscreen_exit');
		inFull = nowFull;
		baseW = win.innerWidth;
		baseH = win.innerHeight;
		shrunk = false;
	};
	const onResize = () => {
		const small = win.innerWidth < baseW * fraction || win.innerHeight < baseH * fraction;
		if (small && !shrunk) {
			shrunk = true;
			flag('resize');
		} else if (!small) {
			shrunk = false;
		}
	};

	const prevent = (kind: ExamFlagKind | null) => (e: Event) => {
		e.preventDefault();
		if (kind) flag(kind);
	};
	const onCopy = prevent('copy');
	const onCut = prevent('copy');
	const onPaste = prevent('paste');
	const onContextMenu = prevent('contextmenu');
	const onSelectStart = prevent(null);
	const onDragStart = prevent(null);

	doc.addEventListener('visibilitychange', onVisibility);
	win.addEventListener('blur', onBlur);
	doc.addEventListener('fullscreenchange', onFullscreen);
	win.addEventListener('resize', onResize);
	root.addEventListener('copy', onCopy);
	root.addEventListener('cut', onCut);
	root.addEventListener('paste', onPaste);
	root.addEventListener('contextmenu', onContextMenu);
	root.addEventListener('selectstart', onSelectStart);
	root.addEventListener('dragstart', onDragStart);

	let detached = false;
	return () => {
		if (detached) return;
		detached = true;
		doc.removeEventListener('visibilitychange', onVisibility);
		win.removeEventListener('blur', onBlur);
		doc.removeEventListener('fullscreenchange', onFullscreen);
		win.removeEventListener('resize', onResize);
		root.removeEventListener('copy', onCopy);
		root.removeEventListener('cut', onCut);
		root.removeEventListener('paste', onPaste);
		root.removeEventListener('contextmenu', onContextMenu);
		root.removeEventListener('selectstart', onSelectStart);
		root.removeEventListener('dragstart', onDragStart);
	};
}
