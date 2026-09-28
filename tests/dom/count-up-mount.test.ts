// tests/dom/count-up-mount.test.ts
//
// THE SHARED COUNT-UP FINISHES WHETHER OR NOT A FRAME EVER COMES (report R10).
//
// `$lib/count-up` is GAUNTLET's stat-tile action lifted into one module so the
// home page's lines-of-code chip can count up with the same code. The move is
// also a repair: GAUNTLET's copy scheduled on requestAnimationFrame alone, and a
// window that is backgrounded or throttled never ticks one -- so a count
// started in a tab opened behind another sat at 0 until somebody looked, and a
// reader in that tab was shown a figure that was not the figure. CLAUDE.md's
// DOM trap is "schedule on rAF-OR-TIMEOUT, never rAF alone"; that failure is
// silent, which is why it is a test.
//
// This is the DOM project because the action writes a real node's text and
// data attribute. NOTHING HERE READS A BOX: happy-dom has no layout, so the
// width-holding half is left to `npm run verify:browser`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNT_UP_FALLBACK_MS, COUNT_UP_MS, countUp, countUpValue, easeOutCubic } from '../../src/lib/count-up';
import { groupDigits } from '../../src/lib/code-census';

let reduce = false;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
	reduce = false;
	frames = [];
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
	/* THE HIDDEN TAB: a frame is requested and never delivered. */
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
	vi.stubGlobal('cancelAnimationFrame', () => {});
	vi.stubGlobal('matchMedia', (q: string) => ({ matches: /reduce/.test(q) ? reduce : false, media: q }));
	window.matchMedia = ((q: string) => ({ matches: /reduce/.test(q) ? reduce : false, media: q })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.innerHTML = '';
});

function node(text: string): HTMLElement {
	const el = document.createElement('span');
	el.textContent = text;
	document.body.appendChild(el);
	return el;
}

describe('the arithmetic', () => {
	it('eases from 0 to the target and never past it', () => {
		expect(countUpValue(123456, 0)).toBe(0);
		expect(countUpValue(123456, COUNT_UP_MS)).toBe(123456);
		expect(countUpValue(123456, COUNT_UP_MS * 5)).toBe(123456);
		let prev = -1;
		for (let t = 0; t <= COUNT_UP_MS; t += 30) {
			const v = countUpValue(123456, t);
			expect(v).toBeGreaterThanOrEqual(prev);
			expect(v).toBeLessThanOrEqual(123456);
			prev = v;
		}
		expect(easeOutCubic(-1)).toBe(0);
		expect(easeOutCubic(2)).toBe(1);
		// A figure that is not a number is handed back, never counted.
		expect(Number.isNaN(countUpValue(NaN, 100))).toBe(true);
	});
});

describe('the action', () => {
	it('with no frame ever delivered, the count still ends on the final figure', () => {
		const el = node(groupDigits(123456));
		const act = countUp(el, { value: 123456, format: groupDigits, once: true });
		expect(el.dataset.counting).toBe('true');
		expect(el.textContent).toBe('0');
		expect(frames.length).toBeGreaterThan(0); // a frame WAS asked for, and never came
		vi.advanceTimersByTime(COUNT_UP_MS + COUNT_UP_FALLBACK_MS * 2);
		expect(el.textContent).toBe('123\u2009456');
		expect(el.dataset.counting).toBeUndefined();
		act.destroy();
	});

	it('writes every intermediate figure through the formatter', () => {
		const el = node('');
		const act = countUp(el, { value: 123456, format: groupDigits });
		const seen = new Set<string>();
		for (let i = 0; i < 30; i++) {
			vi.advanceTimersByTime(COUNT_UP_FALLBACK_MS);
			seen.add(el.textContent ?? '');
		}
		expect(seen.size).toBeGreaterThan(5);
		for (const s of seen) expect(s).toMatch(/^\d{1,3}(\u2009\d{3})*$/);
		act.destroy();
	});

	it('a delivered frame drives it too, and the timeout it raced is cancelled', () => {
		const el = node('');
		const act = countUp(el, 42);
		const first = frames.shift()!;
		first(performance.now() + COUNT_UP_MS + 1);
		expect(el.textContent).toBe('42');
		expect(el.dataset.counting).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
		act.destroy();
	});

	it('under reduced motion it writes the final figure at once and schedules nothing', () => {
		reduce = true;
		const el = node('');
		const act = countUp(el, { value: 98765, format: groupDigits });
		expect(el.textContent).toBe('98\u2009765');
		expect(el.dataset.counting).toBeUndefined();
		expect(frames.length).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		act.destroy();
	});

	it('`once` counts on the first run only; a later value is written at once', () => {
		const el = node('');
		const act = countUp(el, { value: 500, once: true });
		vi.advanceTimersByTime(COUNT_UP_MS + 200);
		expect(el.textContent).toBe('500');
		act.update({ value: 900, once: true });
		expect(el.textContent).toBe('900');
		expect(vi.getTimerCount()).toBe(0);
		act.destroy();
	});

	it("GAUNTLET's bare-number form still re-counts on a new value, and destroy stops it", () => {
		const el = node('');
		const act = countUp(el, 10);
		vi.advanceTimersByTime(COUNT_UP_MS + 200);
		expect(el.textContent).toBe('10');
		act.update(20);
		expect(el.textContent).toBe('0');
		expect(el.dataset.counting).toBe('true');
		act.destroy();
		expect(el.dataset.counting).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
	});
});
