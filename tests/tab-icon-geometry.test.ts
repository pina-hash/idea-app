// tests/tab-icon-geometry.test.ts
//
// The tab icon's geometry, held to the design module it was ported from
// (ledger 0396).
//
// WHY THIS IS A TEST. `src/lib/tab-icon/geometry.ts` is a retyping of the
// `idea-tab-icon.js` module Mr. Pina chose from, and a retyping can move one
// coordinate or one colour without anyone seeing it at 16 px until a student
// does. `tests/fixtures/tab-icon-golden.json` was generated MECHANICALLY from
// the original module by `tools/tab-icon/golden.mjs` before the port existed,
// so the expected value here never came from the code under test. Every key in
// the fixture is its own argument list; this file rebuilds each call from its
// key and compares the port's SVG hash with the original's.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
	appIcon,
	G,
	icon,
	TAB_SECTIONS,
	url,
	type AppIconKind,
	type TabIconKind,
	type TabIconStatus,
	type TabSection
} from '../src/lib/tab-icon/geometry';
import { sectionForPath } from '../src/lib/tab-icon/sections';

type Golden = {
	source_sha256: string;
	sections: string[];
	case_count: number;
	cases: Record<string, string>;
	full: Record<string, string>;
};

const golden = JSON.parse(
	readFileSync(new URL('./fixtures/tab-icon-golden.json', import.meta.url), 'utf8')
) as Golden;

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Rebuild the call a fixture key names. */
function render(key: string): string {
	const parts = key.split('|');
	if (parts[0] === 'app') return appIcon('gearkey', parts[1] as AppIconKind);
	const [, section, kind, n, p, phase, uid] = parts;
	const un = (v: string) => (v === '-' ? undefined : v);
	const status: TabIconStatus | null =
		kind === '-'
			? null
			: {
					kind: kind as TabIconKind,
					...(un(n) !== undefined ? { n: Number(n) } : {}),
					...(un(p) !== undefined ? { p: Number(p) } : {}),
					...(un(phase) !== undefined ? { phase: Number(phase) } : {})
				};
	return icon('gearkey', (un(section) as TabSection | undefined) ?? null, status, un(uid));
}

describe('the port is the design module, byte for byte', () => {
	it('the fixture is the full cross product, not an empty file', () => {
		// The positive control on the fixture itself: a sweep over zero cases
		// passes everything. 15 sections plus a null one, 24 statuses, two id
		// prefixes, and the three home-screen icons.
		expect(golden.sections).toHaveLength(16);
		expect(golden.case_count).toBe(16 * 24 * 2 + 3);
		expect(Object.keys(golden.cases)).toHaveLength(golden.case_count);
		expect(golden.sections.filter((s) => s !== '-').sort()).toEqual([...TAB_SECTIONS].sort());
	});

	it('every case renders the bytes the original module rendered', () => {
		const wrong: string[] = [];
		for (const [key, expected] of Object.entries(golden.cases)) {
			if (hash(render(key)) !== expected) wrong.push(key);
		}
		expect(wrong).toEqual([]);
	});

	it('the cases stored whole match whole, so a failure can be read', () => {
		const keys = Object.keys(golden.full);
		expect(keys.length).toBeGreaterThanOrEqual(10);
		for (const key of keys) expect(render(key)).toBe(golden.full[key]);
	});

	it('the hash comparison bites (a one-character change moves it)', () => {
		const svg = icon('gearkey', 'maps', { kind: 'none' });
		const key = 'icon|maps|none|-|-|-|-';
		expect(hash(svg)).toBe(golden.cases[key]);
		expect(hash(svg.replace('#40E3B1', '#40E3B2'))).not.toBe(golden.cases[key]);
	});
});

describe('icon() is pure and well formed', () => {
	const KINDS: TabIconStatus[] = [
		{ kind: 'none' },
		{ kind: 'unread', n: 3 },
		{ kind: 'attention' },
		{ kind: 'progress', p: 0.4 },
		{ kind: 'saving', phase: 0.125 },
		{ kind: 'live', phase: 0.125 },
		{ kind: 'done' },
		{ kind: 'error' },
		{ kind: 'offline' }
	];
	const parser = new (new Window().DOMParser)();

	it('returns the same string for the same arguments, every section in every state', () => {
		let checked = 0;
		for (const section of TAB_SECTIONS)
			for (const status of KINDS) {
				const a = icon('gearkey', section, status, 'u1');
				const b = icon('gearkey', section, { ...status }, 'u1');
				expect(a).toBe(b);
				const doc = parser.parseFromString(a, 'image/svg+xml');
				expect(doc.querySelectorAll('parsererror')).toHaveLength(0);
				expect(doc.documentElement?.tagName.toLowerCase()).toBe('svg');
				expect(doc.documentElement?.getAttribute('viewBox')).toBe('0 0 32 32');
				expect(a).not.toMatch(/NaN|undefined|null/);
				checked++;
			}
		expect(checked).toBe(TAB_SECTIONS.length * KINDS.length);
	});

	it('gradient ids carry the uid, so two icons on one page do not collide', () => {
		const a = icon('gearkey', 'home', null, 'aa');
		const b = icon('gearkey', 'home', null, 'bb');
		expect(a).toMatch(/id="aah"/);
		expect(a).toMatch(/url\(#aam\)/);
		expect(b).toMatch(/id="bbh"/);
		expect(a).not.toMatch(/id="bb/);
	});

	it('the three home-screen icons parse, and only iOS and maskable fill the tile', () => {
		for (const kind of ['ios', 'android', 'maskable'] as const) {
			const svg = appIcon('gearkey', kind);
			const doc = parser.parseFromString(svg, 'image/svg+xml');
			expect(doc.querySelectorAll('parsererror')).toHaveLength(0);
			const rects = doc.querySelectorAll('rect');
			// Android `any` is the key on transparency, so no full-tile rect; iOS
			// and maskable fill every pixel so nothing paints black or a hole.
			expect(rects.length).toBe(kind === 'android' ? 0 : 1);
		}
	});

	it('url() is a data URL of the same bytes', () => {
		const svg = icon('gearkey', 'gauntlet', null);
		const href = url(svg);
		expect(href.startsWith('data:image/svg+xml,')).toBe(true);
		expect(decodeURIComponent(href.slice('data:image/svg+xml,'.length))).toBe(svg);
	});
});

describe('sectionForPath: every real route resolves by longest prefix', () => {
	it('every section route and every extra prefix resolves to its own section', () => {
		let checked = 0;
		for (const section of TAB_SECTIONS) {
			if (section === 'home') continue;
			for (const r of [G[section].route, ...(G[section].also ?? [])]) {
				expect(sectionForPath(r), r).toBe(section);
				expect(sectionForPath(r + '/anything/deeper'), r).toBe(section);
				checked++;
			}
		}
		expect(checked).toBeGreaterThanOrEqual(TAB_SECTIONS.length - 1);
	});

	it('the notebook is Notebook, not Classroom, though both prefixes match', () => {
		expect(sectionForPath('/classroom/notebook')).toBe('notebook');
		expect(sectionForPath('/classroom/notebook/review')).toBe('notebook');
		// The positive control: the shorter prefix still owns everything else.
		expect(sectionForPath('/classroom')).toBe('classroom');
		expect(sectionForPath('/classroom/abc-123/item/def')).toBe('classroom');
		// A class's own Notebook tab is a tab inside one class.
		expect(sectionForPath('/classroom/abc-123/notebook')).toBe('classroom');
	});

	it('real routes found by the audit resolve where the audit says', () => {
		const cases: Array<[string, TabSection]> = [
			['/', 'home'],
			['/archive', 'home'],
			['/fsp/day1', 'home'],
			['/coin-desk/fine', 'coins'],
			['/coin-balance', 'coins'],
			['/coins/index.html', 'coins'],
			['/dashboard', 'admin'],
			['/admin/feedback', 'admin'],
			['/reference/abc', 'classroom'],
			['/notebook', 'notebook'],
			['/maps/edit/shelf', 'maps'],
			['/certifications/desk', 'certs'],
			['/frc/references', 'frc'],
			['/tournaments/x/match/y', 'tournaments'],
			['/vanguard/', 'vanguard']
		];
		for (const [path, section] of cases) expect(sectionForPath(path), path).toBe(section);
	});

	it('a prefix matches on a path boundary only, and unknown routes are Home', () => {
		expect(sectionForPath('/mapsfoo')).toBe('home');
		expect(sectionForPath('/classroomx')).toBe('home');
		expect(sectionForPath('/no-such-page')).toBe('home');
		expect(sectionForPath('/dev/tab-icon')).toBe('home');
	});
});
