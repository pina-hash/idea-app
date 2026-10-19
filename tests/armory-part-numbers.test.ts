// tests/armory-part-numbers.test.ts
//
// The Parts view's arithmetic and the COTS search, in `$lib/armory/part-numbers`
// (ledger 0405). The format itself is pinned against the SQL in
// tests/armory-part-numbers-parity.test.ts; this holds what only the website
// does with the rows: grouping by subsystem and assembly, and searching.
// Silent if wrong: a part filed under the wrong assembly, or a search that
// finds nothing for "rev 1650", reads like an empty library.

import { describe, expect, test } from 'vitest';
import {
	cotsMatches,
	cotsVendors,
	groupPartNumbers,
	partMatches,
	partsErrorWords,
	SEED_SUBSYSTEMS,
	type CotsPart,
	type PartNumberRow
} from '../src/lib/armory/part-numbers';

const subs = SEED_SUBSYSTEMS.map((s) => ({ ...s, retired: false }));

function row(subsystem: string, assembly: number, part: number, description = ''): PartNumberRow {
	const n = `5669-26-${subsystem}-${String(assembly).padStart(2, '0')}${String(part).padStart(2, '0')}`;
	return {
		id: n,
		part_number: n,
		prefix: '5669',
		season_yy: 26,
		subsystem,
		assembly,
		part,
		kind: part === 0 ? 'assembly' : 'part',
		revision: 'A',
		description,
		made_from: null,
		project_id: 'p',
		file_id: null,
		file_name: null,
		file_folder: null,
		file_deleted: false,
		assigned_name: null,
		assigned_at: '2026-10-18T00:00:00Z'
	};
}

const cots = (vendor: string, vendorPart: string, description: string): CotsPart => ({
	id: `${vendor}-${vendorPart}`,
	vendor,
	vendor_part: vendorPart,
	cots_number: `${vendor}-${vendorPart}`,
	description,
	link: null,
	retired: false,
	file: null,
	added_at: '2026-10-18T00:00:00Z',
	corrected_at: null
});

describe('grouping', () => {
	test('subsystems in the list order, assemblies in number order, the assembly row as the head', () => {
		const rows = [row('SH', 1, 1), row('DT', 2, 0), row('DT', 1, 2), row('SH', 1, 0), row('DT', 1, 0), row('DT', 1, 1)];
		const g = groupPartNumbers(rows, subs);
		expect(g.map((x) => x.code)).toEqual(['DT', 'SH']);
		expect(g[0].assemblies.map((a) => [a.assembly, a.head?.part_number, a.parts.map((p) => p.part)])).toEqual([
			[1, '5669-26-DT-0100', [1, 2]],
			[2, '5669-26-DT-0200', []]
		]);
		expect(g[0].count).toBe(4);
		expect(g[1].name).toBe('Shooter');
	});

	test('a part whose assembly row is not here still shows, with no head; an unknown code keeps its bare code', () => {
		const g = groupPartNumbers([row('IN', 3, 4), row('ZZ', 1, 0)], subs);
		expect(g.map((x) => [x.code, x.name])).toEqual([
			['IN', 'Intake'],
			['ZZ', 'ZZ']
		]);
		expect(g[0].assemblies[0].head).toBeNull();
		expect(g[0].assemblies[0].parts).toHaveLength(1);
	});

	test('nothing in, nothing out', () => {
		expect(groupPartNumbers([], subs)).toEqual([]);
	});
});

describe('searching', () => {
	test('a part number search matches the number, the words and the file, in any case', () => {
		const r = { ...row('DT', 1, 4, 'Gear plate'), file_name: 'Plate.SLDPRT', made_from: 'WCP-0388' };
		expect(['0104', 'gear', 'PLATE.sld', 'wcp-0388', ''].map((q) => partMatches(r, q))).toEqual([true, true, true, true, true]);
		expect(partMatches(r, 'shooter')).toBe(false);
	});

	test('the COTS search takes vendor and number together, and ignores dashes', () => {
		const neo = cots('REV', '21-1650', 'NEO Motor');
		const bearing = cots('WCP', '0388', 'Hex Bearing');
		const screw = cots('HW', 'SHCS-10-32x0.75', 'Socket head cap screw');
		const all = [neo, bearing, screw];
		const find = (q: string) => all.filter((p) => cotsMatches(p, q)).map((p) => p.cots_number);
		expect(find('rev 1650')).toEqual(['REV-21-1650']);
		expect(find('211650')).toEqual(['REV-21-1650']);
		expect(find('wcp bearing')).toEqual(['WCP-0388']);
		expect(find('10-32')).toEqual(['HW-SHCS-10-32x0.75']);
		expect(find('')).toHaveLength(3);
		expect(find('rev bearing')).toEqual([]);
	});

	test('vendors, most parts first', () => {
		expect(cotsVendors([cots('HW', 'a', 'x'), cots('WCP', 'b', 'y'), cots('HW', 'c', 'z')])).toEqual([
			{ vendor: 'HW', count: 2 },
			{ vendor: 'WCP', count: 1 }
		]);
	});
});

describe('refusals in words', () => {
	test('read from the reason and the code, never the HTTP status', () => {
		expect(partsErrorWords({ code: '42501', message: 'not a project member', details: '{"reason":"not_member"}' })).toBe('You are not on this project.');
		expect(partsErrorWords({ code: '42501', message: 'x', details: '{"reason":"not_curator"}' })).toBe('Only a mentor or a site admin can change this.');
		expect(partsErrorWords({ code: 'PGRST202', message: 'x' })).toMatch(/not switched on yet/);
		const sentence = 'There is no subsystem code ZZ. The codes are DT.';
		expect(partsErrorWords({ code: '22023', message: sentence, details: '{"reason":"unknown_subsystem"}' })).toBe(sentence);
		expect(partsErrorWords({ code: '22023', message: 'x', details: 'not json' })).toBe('x');
	});
});
