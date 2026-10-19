// tests/armory-part-numbers-parity.test.ts
//
// ONE FORMAT, TWO SPELLINGS, ONE CORPUS. `src/lib/armory/part-numbers.ts` is
// the website's statement of the part number and COTS formats and migration
// 0274's `armory_part_number_problem` / `armory_cots_problem` are the
// database's. Every case below is put to BOTH and the answers (null or the
// sentence) must be equal character for character. The SQL is read out of the
// real migration file, its first section, and applied to an empty database,
// so this pins the file that ships rather than a copy.
//
// The expected answers are ALSO written out for a handful of cases, because a
// parity check alone passes when both sides are wrong the same way.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestDb, type TestDb } from './db/harness';
import {
	COTS_PROBLEMS,
	cotsProblem,
	formatPartNumber,
	parsePartNumber,
	PART_NUMBER_PROBLEMS,
	partNumberProblem
} from '../src/lib/armory/part-numbers';

const DIR = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
const FILE = readdirSync(DIR).filter((f) => /^\d{4}_armory_part_numbers\.sql$/.test(f));
if (FILE.length !== 1) throw new Error(`expected one *_armory_part_numbers migration, found ${FILE.length}`);
const SQL = readFileSync(join(DIR, FILE[0]), 'utf8');
const SECTION = SQL.slice(SQL.indexOf('-- 1. The format'), SQL.indexOf('-- 2. The subsystem codes'));

const PART_CORPUS: Array<string | null> = [
	null,
	'',
	'   ',
	'5669-27-DT-0104',
	'5669-27-DT-0100',
	' 5669-27-DT-0104 ',
	'5669-27-dt-0104',
	'idea100-27-fr-0201',
	'IDEA100-27-FR-0201',
	'5669-27-DT-0000',
	'5669-27-DT-0104B',
	'5669-27-DT-0104-B',
	'5669-27-DT-0104 B',
	'5669-27-DT-0104 REV B',
	'5669-27-DT-0104 Rev. C',
	'5669-27-DT-0104AA',
	'5669-27-DT-0104ABC',
	'5669-27-DT-01-04',
	'5669-27-DT',
	'5669 27 DT 0104',
	'5669-2027-DT-0104',
	'5669-7-DT-0104',
	'5669-2A-DT-0104',
	'5669-27-D-0104',
	'5669-27-DTX-0104',
	'5669-27-D1-0104',
	'5669-27-DT-104',
	'5669-27-DT-01040',
	'5669-27-DT-01A4',
	'5-27-DT-0104',
	'ABCDEFGHIJK-27-DT-0104',
	'ABCDEFGHIJ-27-DT-0104',
	'56_9-27-DT-0104',
	'\t5669-27-DT-0104',
	'5669-27-DT-0104\n',
	'5669–27–DT–0104',
	'5669-27-ß-0104',
	'5669-27-DÉ-0104',
	'-27-DT-0104',
	'5669--DT-0104',
	'WCP-0388',
	'HW-SHCS-10-32x0.75',
	'5669-27-DT-0104 ',
	'5669-27-DT-0104   rev  b'
];

const COTS_CORPUS: Array<[string | null, string | null]> = [
	['WCP', '0388'],
	['wcp', '0388'],
	['REV', '21-1650'],
	['AM', '0059'],
	['HW', 'SHCS-10-32x0.75'],
	['HW', 'NUT-NYLOCK-10-32'],
	['VEX', '217-6359'],
	['TTB', '#25-chain'],
	['MCM', '6383K13/A'],
	[null, '0388'],
	['', '0388'],
	['  ', '0388'],
	['W C P', '0388'],
	['1WCP', '0388'],
	['WCPWCPWCP', '0388'],
	['WCPWCPWC', '0388'],
	['WC-P', '0388'],
	['WÇP', '0388'],
	['WCP', null],
	['WCP', ''],
	['WCP', '  '],
	['WCP', '03 88'],
	['WCP', '-0388'],
	['WCP', '.0388'],
	['WCP', 'a'.repeat(48)],
	['WCP', 'a'.repeat(49)],
	['WCP', '0388?'],
	['WCP', ' 0388 '],
	['WCP', '0388\t']
];

let db: TestDb;

beforeAll(async () => {
	db = await startTestDb([]);
	await db.sql(SECTION);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('the SQL section under test', () => {
	test('is the two functions and nothing else', () => {
		expect(SECTION.match(/create or replace function/g)?.length).toBe(2);
		expect(SECTION).toContain('public.armory_part_number_problem');
		expect(SECTION).toContain('public.armory_cots_problem');
	});
});

describe('one corpus, two answers', () => {
	test(`every part number case answers the same on both sides (${PART_CORPUS.length} cases)`, async () => {
		expect(PART_CORPUS.length).toBeGreaterThan(40);
		const mismatches: string[] = [];
		let valid = 0;
		for (const c of PART_CORPUS) {
			const sql = (await db.sql<{ p: string | null }>('select public.armory_part_number_problem($1) as p', [c])).rows[0].p;
			const ts = partNumberProblem(c);
			if (sql !== ts) mismatches.push(`${JSON.stringify(c)}: sql=${sql} ts=${ts}`);
			if (sql === null) valid++;
		}
		expect(mismatches).toEqual([]);
		// Both directions are exercised: some valid, most not.
		expect(valid).toBe(9);
	});

	test(`every COTS case answers the same on both sides (${COTS_CORPUS.length} cases)`, async () => {
		const mismatches: string[] = [];
		let valid = 0;
		for (const [v, p] of COTS_CORPUS) {
			const sql = (await db.sql<{ p: string | null }>('select public.armory_cots_problem($1, $2) as p', [v, p])).rows[0].p;
			const ts = cotsProblem(v, p);
			if (sql !== ts) mismatches.push(`${JSON.stringify([v, p])}: sql=${sql} ts=${ts}`);
			if (sql === null) valid++;
		}
		expect(mismatches).toEqual([]);
		expect(valid).toBe(11);
	});

	test('the answers themselves, written out', () => {
		expect(partNumberProblem('5669-27-DT-0104')).toBeNull();
		expect(partNumberProblem('IDEA100-27-FR-0201')).toBeNull();
		expect(partNumberProblem('')).toBe(PART_NUMBER_PROBLEMS.empty);
		expect(partNumberProblem('5669-27-DT-0104B')).toBe(
			'A revision letter goes beside the number, never in it: write 5669-27-DT-0104 and Rev B separately.'
		);
		expect(partNumberProblem('5669-27-DT-0104 Rev B')).toBe(PART_NUMBER_PROBLEMS.revision);
		expect(partNumberProblem('5669-27-DT-01-04')).toBe(PART_NUMBER_PROBLEMS.shape);
		expect(partNumberProblem('5669-2027-DT-0104')).toBe(PART_NUMBER_PROBLEMS.season);
		expect(partNumberProblem('5669-27-D1-0104')).toBe(PART_NUMBER_PROBLEMS.subsystem);
		expect(partNumberProblem('5669-27-DT-104')).toBe(PART_NUMBER_PROBLEMS.last);
		expect(cotsProblem('HW', 'SHCS-10-32x0.75')).toBeNull();
		expect(cotsProblem('WCP', '03 88')).toBe(COTS_PROBLEMS.part);
	});

	test('parse and format round trip, and a malformed number parses to null', () => {
		const p = parsePartNumber(' 5669-27-dt-0104 ');
		expect(p).toEqual({ prefix: '5669', seasonYY: 27, subsystem: 'DT', assembly: 1, part: 4 });
		expect(formatPartNumber(p!)).toBe('5669-27-DT-0104');
		expect(formatPartNumber({ prefix: 'IDEA100', seasonYY: 7, subsystem: 'FR', assembly: 12, part: 0 })).toBe('IDEA100-07-FR-1200');
		expect(parsePartNumber('5669-27-DT-0104B')).toBeNull();
	});
});
