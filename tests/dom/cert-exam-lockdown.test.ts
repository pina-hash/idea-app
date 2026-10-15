// tests/dom/cert-exam-lockdown.test.ts
//
// THE LOCKDOWN LISTENERS REACH THEIR CALLBACK (ledger 0391, surface e), with
// happy-dom dispatching the real events: a prevented copy is readable as
// `defaultPrevented`, a hidden document flags `hidden`, a blurred window flags
// `blur`, leaving full screen flags `fullscreen_exit` once, a window shrunk
// past 80% flags `resize` once until it grows back, and a detach stops every
// one of them. Nothing here reads a box: happy-dom has no layout engine.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachLockdown, LOCKDOWN_RESIZE_FRACTION } from '$lib/certifications/exam/lockdown';
import type { ExamFlagKind } from '$lib/certifications/types';

let root: HTMLElement;
let flags: ExamFlagKind[];
let detach: (() => void) | null = null;

const setVisibility = (state: 'hidden' | 'visible') => {
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
	Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
};
const setFullscreen = (el: Element | null) => {
	Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
};
const setWindowSize = (w: number, h: number) => {
	Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
	Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
};
const fire = (target: EventTarget, type: string) => {
	const e = new Event(type, { bubbles: true, cancelable: true });
	target.dispatchEvent(e);
	return e;
};

beforeEach(() => {
	root = document.createElement('div');
	document.body.appendChild(root);
	flags = [];
	setVisibility('visible');
	setFullscreen(null);
	setWindowSize(1200, 800);
});

afterEach(() => {
	detach?.();
	detach = null;
	root.remove();
});

describe('attachLockdown', () => {
	it('POSITIVE CONTROL: before attaching, a copy is not prevented and nothing is flagged', () => {
		expect(fire(root, 'copy').defaultPrevented).toBe(false);
		expect(flags).toEqual([]);
	});

	it('prevents and flags copy, cut (as copy), paste and the context menu; prevents selection without a flag', () => {
		detach = attachLockdown(root, (k) => flags.push(k));
		expect(fire(root, 'copy').defaultPrevented).toBe(true);
		expect(fire(root, 'cut').defaultPrevented).toBe(true);
		expect(fire(root, 'paste').defaultPrevented).toBe(true);
		expect(fire(root, 'contextmenu').defaultPrevented).toBe(true);
		expect(fire(root, 'selectstart').defaultPrevented).toBe(true);
		expect(fire(root, 'dragstart').defaultPrevented).toBe(true);
		expect(flags).toEqual(['copy', 'copy', 'paste', 'contextmenu']);
	});

	it('an event inside the root bubbles to the listener', () => {
		detach = attachLockdown(root, (k) => flags.push(k));
		const child = document.createElement('p');
		root.appendChild(child);
		expect(fire(child, 'copy').defaultPrevented).toBe(true);
		expect(flags).toEqual(['copy']);
	});

	it('flags a hidden document and not a visible one', () => {
		detach = attachLockdown(root, (k) => flags.push(k));
		setVisibility('hidden');
		fire(document, 'visibilitychange');
		setVisibility('visible');
		fire(document, 'visibilitychange');
		expect(flags).toEqual(['hidden']);
	});

	it('flags a blurred window', () => {
		detach = attachLockdown(root, (k) => flags.push(k));
		fire(window, 'blur');
		expect(flags).toEqual(['blur']);
	});

	it('flags leaving full screen once, and not entering it', () => {
		detach = attachLockdown(root, (k) => flags.push(k));
		setFullscreen(root);
		fire(document, 'fullscreenchange');
		expect(flags).toEqual([]);
		setFullscreen(null);
		fire(document, 'fullscreenchange');
		expect(flags).toEqual(['fullscreen_exit']);
		fire(document, 'fullscreenchange');
		expect(flags).toEqual(['fullscreen_exit']);
	});

	it('flags a window shrunk under 80% of its start once, and again after it grows back', () => {
		expect(LOCKDOWN_RESIZE_FRACTION).toBe(0.8);
		detach = attachLockdown(root, (k) => flags.push(k));
		setWindowSize(1000, 800);
		fire(window, 'resize');
		expect(flags).toEqual([]);
		setWindowSize(900, 800);
		fire(window, 'resize');
		expect(flags).toEqual(['resize']);
		setWindowSize(800, 800);
		fire(window, 'resize');
		expect(flags).toEqual(['resize']);
		setWindowSize(1200, 800);
		fire(window, 'resize');
		setWindowSize(1200, 600);
		fire(window, 'resize');
		expect(flags).toEqual(['resize', 'resize']);
	});

	it('re-takes the resize baseline on a full screen change, so leaving full screen is one flag', () => {
		detach = attachLockdown(root, (k) => flags.push(k));
		setFullscreen(root);
		setWindowSize(1920, 1080);
		fire(document, 'fullscreenchange');
		setFullscreen(null);
		setWindowSize(1200, 800);
		fire(document, 'fullscreenchange');
		fire(window, 'resize');
		expect(flags).toEqual(['fullscreen_exit']);
	});

	it('swallows a logger that throws', () => {
		detach = attachLockdown(root, () => {
			throw new Error('logger down');
		});
		expect(() => fire(root, 'copy')).not.toThrow();
		expect(fire(root, 'copy').defaultPrevented).toBe(true);
	});

	it('detach stops every listener and is safe to call twice', () => {
		const d = attachLockdown(root, (k) => flags.push(k));
		d();
		d();
		expect(fire(root, 'copy').defaultPrevented).toBe(false);
		fire(window, 'blur');
		setVisibility('hidden');
		fire(document, 'visibilitychange');
		expect(flags).toEqual([]);
	});
});
