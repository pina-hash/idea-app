// tests/dom/anchored-resize-mount.test.ts
//
// THE ANCHORED ACTION FOLLOWS ITS PANEL'S OWN SIZE, AND CANNOT LOOP DOING IT
// (ledger 0396, integration review 3).
//
// The header's Quick note was placed at 344px while its editor loaded, grew to
// 448px about 100ms later, and nothing placed it again until something
// scrolled; and every scroll INSIDE the panel (a long note following its
// caret) re-placed the whole panel. The action now observes the panel's size
// and ignores a scroll of the panel's own content.
//
// happy-dom has no layout engine, so every box here is STUBBED: the panel's
// size is a function of what the action wrote on it (its `--anchor-room` cap,
// and in the loop case its left), and the fake ResizeObserver reports a size
// change exactly when that function's answer moves, the way a browser's does.
// No geometry is measured; the instrument is a COUNT of placements, which is
// what "it cannot loop" is a claim about.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANCHOR_RESIZE_CHAIN_LIMIT, anchorInWindow, anchored } from '../../src/lib/shell/anchored';

type Box = { left: number; top: number; width: number; height: number };
const rect = (b: Box) => ({ ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => b });

/** A ResizeObserver that reports when the observed node's stubbed size changes, as a browser does after layout. */
class FakeResizeObserver {
	static live = new Set<FakeResizeObserver>();
	private seen = new Map<Element, string>();
	constructor(private callback: ResizeObserverCallback) {}
	observe(el: Element) {
		this.seen.set(el, '');
		FakeResizeObserver.live.add(this);
	}
	unobserve(el: Element) {
		this.seen.delete(el);
	}
	disconnect() {
		this.seen.clear();
		FakeResizeObserver.live.delete(this);
	}
	/** One layout: deliver for every observed node whose size moved. */
	deliver() {
		const changed: Element[] = [];
		for (const [el, last] of this.seen) {
			const r = el.getBoundingClientRect();
			const now = `${r.width}x${r.height}`;
			if (now !== last) {
				this.seen.set(el, now);
				changed.push(el);
			}
		}
		if (changed.length) this.callback(changed.map((target) => ({ target }) as ResizeObserverEntry), this as unknown as ResizeObserver);
	}
	static frame() {
		for (const o of [...FakeResizeObserver.live]) o.deliver();
	}
}

const savedRaf = globalThis.requestAnimationFrame;
const savedRO = globalThis.ResizeObserver;

beforeEach(() => {
	vi.useFakeTimers();
	// The action schedules on rAF OR a 16ms timeout; with rAF gone, every
	// scheduled placement is a fake timer this test steps.
	(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
	(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
	Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
	Object.defineProperty(window, 'innerHeight', { configurable: true, value: 548 });
});

afterEach(() => {
	vi.useRealTimers();
	globalThis.requestAnimationFrame = savedRaf;
	(globalThis as { ResizeObserver?: unknown }).ResizeObserver = savedRO;
	FakeResizeObserver.live.clear();
	document.body.innerHTML = '';
});

/** One frame: timers due within 16ms run (the scheduled placement), then layout reports sizes. */
function frame() {
	vi.advanceTimersByTime(16);
	FakeResizeObserver.frame();
}

/**
 * A key and a panel. `content` is the panel's natural height; its drawn height
 * is that capped by `--anchor-room` (the Quick note's own max-height rule).
 * Every write of `left` is counted, because every placement writes it.
 */
function mountPanel(opts: { content: number; width?: number | ((left: number) => number); key: Box; avoid?: Box }) {
	const anchor = document.createElement('button');
	const node = document.createElement('div');
	const inner = document.createElement('div');
	node.append(inner);
	document.body.append(anchor, node);
	anchor.getBoundingClientRect = () => rect(opts.key) as DOMRect;
	let placements = 0;
	const state = { content: opts.content };
	const widthAt = (left: number) => (typeof opts.width === 'function' ? opts.width(left) : (opts.width ?? 359));
	node.getBoundingClientRect = () => {
		const cap = parseFloat(node.style.getPropertyValue('--anchor-room'));
		const height = Number.isFinite(cap) ? Math.min(state.content, cap) : state.content;
		const left = parseFloat(node.style.left) || 0;
		return rect({ left, top: parseFloat(node.style.top) || 0, width: widthAt(left), height }) as DOMRect;
	};
	const style = node.style;
	const setLeft = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(style), 'left');
	Object.defineProperty(style, 'left', {
		configurable: true,
		get: () => setLeft?.get?.call(style),
		set: (v: string) => {
			if (v) placements += 1;
			setLeft?.set?.call(style, v);
		}
	});
	const avoid = opts.avoid ? (rect(opts.avoid) as DOMRect) : null;
	const action = anchored(node, avoid ? { anchor, open: true, prefer: 'below', align: 'end', avoid } : { anchor, open: true, prefer: 'below', align: 'end', keepClear: false });
	return { node, inner, anchor, state, action, count: () => placements };
}

describe('anchored follows the panel it places', () => {
	it('re-places once when content arriving after it opened grows the panel, capped to the room under its key', () => {
		// The Menu key and the feedback button at 375x548 as measured, and a panel that opens at 344px
		// and grows to 448.
		const p = mountPanel({
			content: 344,
			key: { left: 210, top: 12, width: 44, height: 44 },
			avoid: { left: 198, top: 476, width: 161, height: 48 }
		});
		frame();
		frame();
		const opened = p.count();
		expect(opened).toBeGreaterThan(0);
		expect(p.node.style.top).toBe('62px');
		// The room under the key: the button's top less the margin, less the key's foot and the gap.
		expect(p.node.style.getPropertyValue('--anchor-room')).toBe(`${476 - 8 - (56 + 6)}px`);

		p.state.content = 448;
		for (let i = 0; i < 30; i++) frame();
		// Followed, and exactly once: the cap held the panel in the room under its key, so it stayed
		// there, clear of the button, instead of being clamped up over the key.
		expect(p.count()).toBe(opened + 1);
		expect(p.node.style.top).toBe('62px');
		expect(p.node.getBoundingClientRect().height).toBe(406);
		expect(62 + 406).toBeLessThanOrEqual(476 - 8);
		p.action.destroy();
	});

	it('caps a panel that is already too tall when it opens before it places it, so its first frame is right', () => {
		const p = mountPanel({
			content: 448,
			key: { left: 210, top: 12, width: 44, height: 44 },
			avoid: { left: 198, top: 476, width: 161, height: 48 }
		});
		// No frame has run: this is the placement made the moment it opened.
		expect(p.node.style.top).toBe('62px');
		expect(p.node.getBoundingClientRect().height).toBe(406);
		p.action.destroy();
	});

	it('follows content that keeps growing with the panel held in place, every time', () => {
		const p = mountPanel({ content: 120, key: { left: 210, top: 12, width: 44, height: 44 } });
		frame();
		const opened = p.count();
		for (let line = 1; line <= 10; line++) {
			p.state.content = 120 + line * 22;
			frame();
			frame();
		}
		// Ten growths, ten placements: none of them moved the columns, so none counted towards the loop limit.
		expect(p.count()).toBe(opened + 10);
		p.action.destroy();
	});

	it('stops following a panel whose placement keeps resizing it, and starts again on the next scroll', () => {
		// A panel that is wide when it sits left of 200px and narrow otherwise: end-aligned to a key at the
		// window's right edge, every placement moves it across 200 and every move resizes it. Unguarded,
		// that is one placement a frame, forever.
		const p = mountPanel({
			content: 200,
			width: (left) => (left < 200 ? 120 : 300),
			key: { left: 300, top: 12, width: 60, height: 44 }
		});
		for (let i = 0; i < 200; i++) frame();
		const settled = p.count();
		// Bounded by the open, its second pass and the chain limit.
		expect(settled).toBeLessThanOrEqual(2 + ANCHOR_RESIZE_CHAIN_LIMIT);
		for (let i = 0; i < 200; i++) frame();
		expect(p.count()).toBe(settled);

		// A scroll of the page is a placement the page asked for: it runs, and the chain starts over.
		window.dispatchEvent(new Event('scroll'));
		const afterScroll = p.count();
		expect(afterScroll).toBe(settled + 1);
		for (let i = 0; i < 200; i++) frame();
		expect(p.count()).toBeLessThanOrEqual(afterScroll + ANCHOR_RESIZE_CHAIN_LIMIT);
		p.action.destroy();
	});

	it('ignores a scroll of its own content and re-places on a scroll of the page', () => {
		const p = mountPanel({ content: 300, key: { left: 210, top: 12, width: 44, height: 44 } });
		frame();
		frame();
		const opened = p.count();
		p.inner.dispatchEvent(new Event('scroll'));
		p.node.dispatchEvent(new Event('scroll'));
		expect(p.count()).toBe(opened);
		document.dispatchEvent(new Event('scroll'));
		expect(p.count()).toBe(opened + 1);
		p.action.destroy();
	});

	it('stops observing once closed, and removes the room it wrote', () => {
		const p = mountPanel({ content: 300, key: { left: 210, top: 12, width: 44, height: 44 } });
		frame();
		expect(FakeResizeObserver.live.size).toBe(1);
		expect(p.node.style.getPropertyValue('--anchor-room')).not.toBe('');
		p.action.update({ anchor: p.anchor, open: false });
		expect(FakeResizeObserver.live.size).toBe(0);
		expect(p.node.style.getPropertyValue('--anchor-room')).toBe('');
		const closed = p.count();
		p.state.content = 500;
		for (let i = 0; i < 10; i++) frame();
		expect(p.count()).toBe(closed);
		p.action.destroy();
	});
});

describe('anchorInWindow reads the corner reserve the way the action does', () => {
	it('keeps a panel placed by hand off the element carrying data-corner-reserve, unless told none', () => {
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
		const corner = document.createElement('div');
		corner.setAttribute('data-corner-reserve', '');
		corner.getBoundingClientRect = () => rect({ left: 1285, top: 844, width: 143, height: 44 }) as DOMRect;
		document.body.append(corner);
		// IdeaCAD's right-click menu, opened at (1325,656): 219 x 230, below the point first.
		const point = { left: 1325, right: 1325, top: 656, bottom: 656, width: 0, height: 0 };
		const size = { width: 219, height: 230 };
		const at = anchorInWindow(point, size, { prefer: 'below', align: 'start', gap: 2, margin: 8 });
		expect(at.side).toBe('above');
		expect(at.top + size.height).toBeLessThanOrEqual(656);
		// Told there is none, it opens below and runs to 888, under the button, as it did before.
		const plain = anchorInWindow(point, size, { prefer: 'below', align: 'start', gap: 2, margin: 8, avoid: null });
		expect(plain.side).toBe('below');
		expect(plain.top + size.height).toBeGreaterThan(844);
	});
});
