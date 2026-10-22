// tests/armory-open-link.test.ts
//
// LEDGER 0430 (the Armory field round of 2026-10-22):
//
//   - OPEN IN SOLIDWORKS, website feedback ba81c57d. A file's page hands the
//     file's id to the IDEA Armory app through exactly the link the app accepts
//     (IDEA Armory 0.4.2, ProtocolLink.TryParseOpen): `idea-armory:open?f=<id>`
//     and nothing else, so nothing a page could add ever reaches the app. A
//     removed file or one with no version offers no Open. The page decides the
//     app did not answer only when it kept focus and stayed visible throughout.
//   - ONE COMPUTER, ONE PRESENCE LINE. Every sign-in registers a device, by
//     design; a member's devices sharing a name are one line, the one heard
//     from last, and devices of other names stay.

import { describe, expect, test } from 'vitest';
import { armoryAnswered, armoryOpenHref, openable, OPEN_FALLBACK_MS } from '../src/lib/armory/open-link';
import { deviceLabels, presenceDevices } from '../src/lib/armory/team';

describe('Open in SolidWorks hands the app a file id and nothing else', () => {
	const ID = '8b906ba1-ad34-40fd-bf54-63b7db8f7e8c';

	test('a file id becomes the one link the app takes', () => {
		expect(armoryOpenHref(ID)).toBe('idea-armory:open?f=8b906ba1-ad34-40fd-bf54-63b7db8f7e8c');
		expect(armoryOpenHref(' 8B906BA1-AD34-40FD-BF54-63B7DB8F7E8C ')).toBe('idea-armory:open?f=8b906ba1-ad34-40fd-bf54-63b7db8f7e8c');
		// At most 80 characters, as the app requires.
		expect(armoryOpenHref(ID)!.length).toBeLessThanOrEqual(80);
	});

	test('anything that is not a file id gives no link at all', () => {
		for (const bad of [null, undefined, '', 'f-2', '8b906ba1ad3440fdbf5463b7db8f7e8c', `${ID}&a=checkout`, `${ID}/../x`, '00000000-0000-0000-0000-000000000000', `{${ID}}`])
			expect(armoryOpenHref(bad)).toBeNull();
	});

	test('a removed file, or one with no version, offers no Open', () => {
		const current = { id: 'v', hash: 'h' };
		expect(openable({ deleted: false, current })).toBe(true);
		expect(openable({ deleted: true, current })).toBe(false);
		expect(openable({ deleted: false, current: null })).toBe(false);
	});

	test('the app answered when the page lost focus or was hidden; only a page left in front heard nothing', () => {
		expect(armoryAnswered({ blurred: true, hidden: false })).toBe(true);
		expect(armoryAnswered({ blurred: false, hidden: true })).toBe(true);
		expect(armoryAnswered({ blurred: false, hidden: false })).toBe(false);
		expect(OPEN_FALLBACK_MS).toBeGreaterThanOrEqual(2000);
	});
});

describe('one computer signed in to twice is one presence line', () => {
	const at = (iso: string) => iso;
	const devices = [
		{ id: 'e4755527', name: 'IDEA-06', last_seen: at('2026-10-22T21:08:00Z'), registered_at: at('2026-10-22T21:07:46Z') },
		{ id: 'laptop', name: 'Abraham laptop', last_seen: at('2026-10-20T18:00:00Z'), registered_at: at('2026-09-01T18:00:00Z') },
		{ id: '8b906ba1', name: 'idea-06 ', last_seen: at('2026-10-22T21:20:44Z'), registered_at: at('2026-10-22T21:09:54Z') },
		{ id: 'blank', name: '', last_seen: null, registered_at: null }
	];

	test('the one heard from last speaks for the name, the rest stay in order', () => {
		expect(presenceDevices(devices).map((d) => d.id)).toEqual(['laptop', '8b906ba1', 'blank']);
	});

	test('never heard from: the one registered last', () => {
		const quiet = devices.slice(0, 3).map((d) => ({ ...d, last_seen: null }));
		expect(presenceDevices(quiet).map((d) => d.id)).toEqual(['laptop', '8b906ba1']);
	});

	test('the label of the one line is the plain name, not a name with an id (the control: both devices give the id)', () => {
		expect(deviceLabels(presenceDevices(devices)).get('8b906ba1')).toBe('idea-06');
		expect(deviceLabels(devices).get('8b906ba1')).toBe('idea-06 (8b90)');
	});
});
