// tests/dom/student-work-slideshow-mount.test.ts
//
// THE WORK SLIDESHOW ON ONE STUDENT'S PAGE, mounted for real (ledger 0396,
// report 169b931d), on a fake clock so the timer can be stepped.
//
// What regresses silently: the timer stopping at the last picture instead of
// moving on to the first; Previous on the first doing nothing; and the timer
// moving on while somebody is swiping through the strip, so the strip they are
// browsing snaps away. The strip's geometry (that it centres the selected
// picture and never moves the page) is the browser pass's
// (classroom-student-state-strip-pictures-12): happy-dom lays nothing out.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import Slideshow from '$lib/classroom/StudentWorkSlideshow.svelte';
import { mountInto, type Mounted } from './mount';
import { fixtureManyPictures } from '../../src/routes/dev/classroom-student/fixture';

const S = Slideshow as unknown as Component<Record<string, unknown>>;
let m: Mounted | null = null;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
	await m?.stop();
	m = null;
	vi.useRealTimers();
});

const count = () => m!.one('[data-testid="so-slide-count"]').textContent?.trim();
function tick(ms: number) {
	vi.advanceTimersByTime(ms);
	m!.flush();
}
function press(testId: string) {
	m!.one<HTMLButtonElement>(`[data-testid="${testId}"]`).click();
	m!.flush();
}

describe('the slideshow wraps both ways, the timer included', () => {
	it('moves on by itself, and from the last picture to the first', () => {
		m = mountInto(S, { items: fixtureManyPictures(4), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		expect(count()).toBe('1 of 4');
		tick(1000);
		expect(count()).toBe('2 of 4');
		// One step per tick: each move schedules the next once the page settles.
		tick(1000);
		tick(1000);
		expect(count()).toBe('4 of 4');
		tick(1000);
		expect(count()).toBe('1 of 4');
	});

	it('Next on the last is the first, and Previous on the first is the last', () => {
		m = mountInto(S, { items: fixtureManyPictures(4), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		press('so-slide-play');
		press('so-slide-prev');
		expect(count()).toBe('4 of 4');
		expect(m.all('.sws-thumb')[3].classList.contains('on')).toBe(true);
		press('so-slide-next');
		expect(count()).toBe('1 of 4');
		expect(m.all('.sws-thumb')[0].getAttribute('aria-current')).toBe('true');
	});

	it('somebody scrolling the strip holds the timer, and it moves on again once they stop', () => {
		m = mountInto(S, { items: fixtureManyPictures(6), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		const strip = m.one<HTMLElement>('.sws-strip');
		strip.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, bubbles: true }));
		m.flush();
		expect(strip.dataset.browsing).toBe('true');
		expect(m.one('[data-testid="so-slideshow"]').getAttribute('data-moving')).toBe('false');
		tick(5900);
		expect(count()).toBe('1 of 6');
		tick(200);
		expect(strip.dataset.browsing).toBeUndefined();
		tick(1000);
		expect(count()).toBe('2 of 6');
	});
});

describe('the play key says what it will do, and is never drawn pressed (polish round C)', () => {
	it('reads Pause while playing and Play while paused, with no pressed state either way', () => {
		m = mountInto(S, { items: fixtureManyPictures(4), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		const key = () => m!.one<HTMLButtonElement>('[data-testid="so-slide-play"]');
		const word = () => m!.one('[data-testid="so-slide-play-word"]').textContent?.trim();
		const spare = () => m!.one('.sws-play-spare');
		const show = () => m!.one('[data-testid="so-slideshow"]');
		// Playing: the word is the action, the slideshow is moving. The other word
		// is in the key too, hidden and out of the accessible name, so the key is
		// one width in both states (polish round 1: at 375 it jumped a line).
		expect(word()).toBe('Pause');
		expect(spare().textContent?.trim()).toBe('Play');
		expect(spare().getAttribute('aria-hidden')).toBe('true');
		expect(key().getAttribute('aria-label')).toBe('Pause the slideshow');
		expect(key().hasAttribute('aria-pressed')).toBe(false);
		expect(show().getAttribute('data-moving')).toBe('true');
		press('so-slide-play');
		// Paused: Play, still no pressed state (the plate lights aria-pressed), and nothing moves.
		expect(word()).toBe('Play');
		expect(spare().textContent?.trim()).toBe('Pause');
		expect(key().getAttribute('aria-label')).toBe('Play the slideshow');
		expect(key().hasAttribute('aria-pressed')).toBe(false);
		expect(show().getAttribute('data-moving')).toBe('false');
		tick(3000);
		expect(count()).toBe('1 of 4');
		press('so-slide-play');
		expect(word()).toBe('Pause');
		tick(1000);
		expect(count()).toBe('2 of 4');
		// Nowhere in the slideshow is a key drawn lit.
		expect(m!.all('[aria-pressed="true"]')).toHaveLength(0);
	});
});

/*
 * THE PLAY KEY NEVER HOLDS THE SLIDESHOW (polish round 1). Pressing a key
 * leaves focus on it (Chrome does that for a mouse click as well as for the
 * keyboard), and while focus anywhere inside counted as a hold, a slideshow
 * somebody had just asked to play stood still under a key reading "Pause"
 * until they clicked somewhere else. happy-dom answers `:focus-visible` as
 * plain focus, so every focus here is a keyboard focus: the case that holds
 * everywhere but on the play key.
 */
describe('pressing Play plays, whatever is holding it, and "Pause" is then true', () => {
	const key = () => m!.one<HTMLButtonElement>('[data-testid="so-slide-play"]');
	const moving = () => m!.one('[data-testid="so-slideshow"]').getAttribute('data-moving');
	const word = () => m!.one('[data-testid="so-slide-play-word"]').textContent?.trim();

	it('focus on the play key holds nothing: Pause then Play with the key focused, and it moves on', () => {
		m = mountInto(S, { items: fixtureManyPictures(4), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		key().focus();
		m.flush();
		expect(document.activeElement).toBe(key());
		// Focus on the key alone: still moving, and the key says Pause.
		expect(moving()).toBe('true');
		press('so-slide-play');
		expect(word()).toBe('Play');
		expect(moving()).toBe('false');
		press('so-slide-play');
		expect(document.activeElement).toBe(key());
		expect(word()).toBe('Pause');
		expect(moving()).toBe('true');
		tick(1000);
		expect(count()).toBe('2 of 4');
	});

	it('keyboard focus on any other control holds it, and moving focus to the play key lets it go', () => {
		m = mountInto(S, { items: fixtureManyPictures(4), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		m.one<HTMLButtonElement>('[data-testid="so-slide-next"]').focus();
		m.flush();
		expect(moving()).toBe('false');
		tick(3000);
		expect(count()).toBe('1 of 4');
		m.all<HTMLButtonElement>('.sws-thumb')[2].focus();
		m.flush();
		expect(moving()).toBe('false');
		key().focus();
		m.flush();
		expect(moving()).toBe('true');
		tick(1000);
		expect(count()).toBe('2 of 4');
	});

	it('a key pressed inside holds it, except on the play key', () => {
		m = mountInto(S, { items: fixtureManyPictures(4), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		key().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		m.flush();
		expect(moving()).toBe('true');
		m.one('[data-testid="so-slide-next"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		m.flush();
		expect(moving()).toBe('false');
	});

	it('a mouse over the slideshow holds it, a mouse over the play key does not, and a finger never does', () => {
		m = mountInto(S, { items: fixtureManyPictures(4), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		const over = (el: Element, pointerType: string) => {
			el.dispatchEvent(new PointerEvent('pointerover', { pointerType, bubbles: true }));
			m!.flush();
		};
		over(m.one('[data-testid="so-slide"]'), 'mouse');
		expect(moving()).toBe('false');
		over(m.one('[data-testid="so-slide-play-word"]'), 'mouse');
		expect(moving()).toBe('true');
		over(m.one('[data-testid="so-slide-prev"]'), 'mouse');
		expect(moving()).toBe('false');
		m.one('[data-testid="so-slideshow"]').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		m.flush();
		expect(moving()).toBe('true');
		over(m.one('[data-testid="so-slide"]'), 'touch');
		expect(moving()).toBe('true');
	});

	it('Play ends a strip-browsing hold at once', () => {
		m = mountInto(S, { items: fixtureManyPictures(6), name: 'Ana Reyes', day: () => '', intervalMs: 1000 });
		press('so-slide-play');
		const strip = m.one<HTMLElement>('.sws-strip');
		strip.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, bubbles: true }));
		m.flush();
		expect(strip.dataset.browsing).toBe('true');
		press('so-slide-play');
		expect(strip.dataset.browsing).toBeUndefined();
		expect(moving()).toBe('true');
		tick(1000);
		expect(count()).toBe('2 of 6');
	});
});
