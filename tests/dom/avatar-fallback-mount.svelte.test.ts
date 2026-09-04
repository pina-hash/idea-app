// tests/dom/avatar-fallback-mount.test.ts
//
// A FACE THAT IS MISSING MUST STILL BE A MARK, AND A FACE THAT BREAKS MUST
// BECOME ONE.
//
// This bundle puts an avatar beside a student's name on staff surfaces. Two of
// the three states it has to survive fail SILENTLY and neither shows up in a
// type check:
//
//   1. NO PICTURE. Most people at this school have chosen none, so the tile is
//      the ordinary path rather than an edge. An empty circle down a roster of
//      thirty reads as a rendering fault.
//   2. AN IMAGE THAT 404s. An uploaded avatar is an UNSIGNED public-bucket URL
//      built from a stored path, so a deleted object or a stale path is a
//      live case and not a hypothetical. Without an `onerror` the browser
//      paints its broken-image glyph inside the circle and keeps it there.
//
// Both are asserted STRUCTURALLY -- which node is in the DOM -- because that
// is what this project can measure. NO GEOMETRY IS ASSERTED HERE: happy-dom
// has no layout engine, so a row-height claim would read 0 and pass
// vacuously. The row heights are measured in
// `tools/browser-verify/routes/avatars.mjs` and nowhere else.

import { afterEach, describe, expect, it } from 'vitest';
import Avatar from '$lib/Avatar.svelte';
import { AVATAR_TINTS, avatarTint, rosterSubject } from '$lib/avatars';
import { mountInto, type Mounted } from './mount';

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
});

const row = (over: Record<string, unknown> = {}) =>
	rosterSubject({
		student_email: 'alice@boscotech.net',
		display_name: 'Alice Alvarez',
		avatar: null,
		avatar_url: null,
		...over
	});

describe('the no-picture tile', () => {
	it('RENDERS INITIALS, not an empty box', () => {
		m = mountInto(Avatar as never, { subject: row(), tintKey: 'alice@boscotech.net' });
		const tile = m.target.querySelector('.initials');
		expect(tile).not.toBeNull();
		expect(tile?.textContent?.trim()).toBe('AA');
		// And no image element at all -- an <img> with no src is the broken box.
		expect(m.target.querySelector('img')).toBeNull();
	});

	it('falls back to the ADDRESS when there is no name, never to nothing', () => {
		m = mountInto(Avatar as never, {
			subject: rosterSubject({ student_email: 'zeph.quill@boscotech.net', display_name: null })
		});
		expect(m.target.querySelector('.initials')?.textContent?.trim()).toBe('ZQ');
	});

	it('renders a mark even for a subject with NOTHING on it', () => {
		m = mountInto(Avatar as never, { subject: null });
		expect(m.target.querySelector('.initials')?.textContent?.trim()).toBe('?');
	});
});

describe('an image that fails to load', () => {
	it('SWAPS TO THE TILE on error, and the initials are still right', () => {
		m = mountInto(Avatar as never, {
			subject: row({ avatar_url: 'https://example.invalid/gone.png' }),
			tintKey: 'alice@boscotech.net'
		});
		const img = m.target.querySelector('img');
		expect(img).not.toBeNull();
		expect(m.target.querySelector('.initials')).toBeNull();

		// The browser's own signal, dispatched at the element that carries the
		// handler. (An `error` event is not something `disabled` or anything
		// else suppresses here; this is the real path.)
		img!.dispatchEvent(new Event('error'));
		m.flush();

		expect(m.target.querySelector('img')).toBeNull();
		expect(m.target.querySelector('.initials')?.textContent?.trim()).toBe('AA');
	});

	it('DOES NOT LATCH THE FAILURE ONTO THE NEXT PERSON -- the {#each} reuse case', async () => {
		// A roster re-sort reuses this instance. A failure remembered as a bare
		// boolean would paint a tile over the next person's working picture,
		// and nothing on screen would say why.
		const target = document.createElement('div');
		document.body.appendChild(target);
		const { mount, flushSync, unmount } = await import('svelte');
		const props = $state({
			subject: row({ avatar_url: 'https://example.invalid/gone.png' }),
			tintKey: 'alice@boscotech.net'
		});
		const app = mount(Avatar as never, { target, props });
		flushSync();
		target.querySelector('img')!.dispatchEvent(new Event('error'));
		flushSync();
		expect(target.querySelector('.initials')).not.toBeNull();

		// Same component instance, a different person whose picture is fine.
		props.subject = rosterSubject({
			student_email: 'bruno@boscotech.net',
			display_name: 'Bruno Barros',
			avatar_url: 'https://example.invalid/bruno.png'
		});
		props.tintKey = 'bruno@boscotech.net';
		flushSync();
		expect(target.querySelector('img')).not.toBeNull();
		expect(target.querySelector('.initials')).toBeNull();

		await unmount(app);
		target.remove();
	});
});

describe('the tint', () => {
	it('IS STABLE for one person and comes from the measured set', () => {
		const a = avatarTint('alice@boscotech.net');
		expect(avatarTint('alice@boscotech.net')).toBe(a);
		expect(avatarTint('ALICE@BoscoTech.net ')).toBe(a);
		expect(AVATAR_TINTS).toContain(a);
	});

	it('reaches the element as a custom property, so the tile is not one colour', () => {
		m = mountInto(Avatar as never, { subject: row(), tintKey: 'alice@boscotech.net' });
		const box = m.target.querySelector('.avatar') as HTMLElement;
		expect(box.getAttribute('style')).toContain('--avatar-tint:');
		expect(box.getAttribute('style')).toContain(avatarTint('alice@boscotech.net'));
	});

	it('SPREADS over a realistic roster rather than collapsing to one bucket', () => {
		// A hash that answered the same tint for everybody would pass every
		// assertion above and defeat the whole point of having a set.
		const names = Array.from({ length: 30 }, (_, i) => `student${i}@boscotech.net`);
		const used = new Set(names.map(avatarTint));
		expect(used.size).toBeGreaterThanOrEqual(5);
	});

	it('answers a tint for an empty key rather than throwing', () => {
		expect(AVATAR_TINTS).toContain(avatarTint(''));
		expect(AVATAR_TINTS).toContain(avatarTint(null));
	});
});

describe('the picture that DOES load -- the positive control for all of the above', () => {
	it('renders an img and no tile', () => {
		m = mountInto(Avatar as never, {
			subject: row({ avatar_url: 'https://example.invalid/alice.png' })
		});
		expect(m.target.querySelector('img')).not.toBeNull();
		expect(m.target.querySelector('.initials')).toBeNull();
	});

	it('and a chosen PRESET renders its glyph, not a tile and not an img', () => {
		m = mountInto(Avatar as never, { subject: row({ avatar: 'preset:hex' }) });
		expect(m.target.querySelector('svg path')).not.toBeNull();
		expect(m.target.querySelector('.initials')).toBeNull();
		expect(m.target.querySelector('img')).toBeNull();
	});
});
