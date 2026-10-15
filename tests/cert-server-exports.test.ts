// tests/cert-server-exports.test.ts
//
// THE CSV WRITER AND THE EXPORT README (ledger 0391). A CSV that mishandled a
// comma inside a feedback sentence would shift every later column of that row
// and nothing would say so; a README missing a kind would ship an export a
// Claude chat cannot read. Both are checked here.

import { describe, expect, it } from 'vitest';
import {
	EXPORT_FIELD_NOTES,
	csvColumns,
	exportReadme,
	exportZipName,
	isExportKind,
	toCsv
} from '../src/lib/server/certifications/exports';
import { EXPORT_KINDS } from '../src/lib/certifications/types';

describe('toCsv', () => {
	it('quotes commas, quotes, CR and LF, doubles quotes, and ends every record with CRLF', () => {
		const csv = toCsv([
			{ a: 'plain', b: 'has, comma', c: 'has "quote"', d: 'line\nbreak', e: 'cr\rhere' }
		]);
		expect(csv).toBe('a,b,c,d,e\r\nplain,"has, comma","has ""quote""","line\nbreak","cr\rhere"\r\n');
	});

	it('takes the union of keys over every row in first-seen order and leaves missing cells empty', () => {
		const csv = toCsv([{ id: 1, kind: 'x' }, { id: 2, extra: true }, { kind: 'y', id: 3 }]);
		expect(csv.split('\r\n')[0]).toBe('id,kind,extra');
		expect(csv).toBe('id,kind,extra\r\n1,x,\r\n2,,true\r\n3,y,\r\n');
	});

	it('writes null and undefined as empty, numbers and booleans plainly, objects and arrays as JSON', () => {
		const csv = toCsv([{ n: null, u: undefined, num: 12.5, b: false, obj: { k: 'v' }, arr: [1, 'two'] }]);
		expect(csv).toBe('n,u,num,b,obj,arr\r\n,,12.5,false,"{""k"":""v""}","[1,""two""]"\r\n');
	});

	it('keeps unicode as UTF-8 text with no byte order mark', () => {
		const csv = toCsv([{ name: 'José Álvarez', note: 'café ☕' }]);
		expect(csv.charCodeAt(0)).toBe('n'.charCodeAt(0));
		expect(csv).toBe('name,note\r\nJosé Álvarez,café ☕\r\n');
	});

	it('an empty row set is a header-only file, or a bare CRLF with no columns', () => {
		expect(toCsv([])).toBe('\r\n');
		expect(toCsv([], ['a', 'b'])).toBe('a,b\r\n');
		expect(csvColumns([{ z: 1, a: 2 }])).toEqual(['z', 'a']);
	});
});

describe('exportReadme', () => {
	it('has a paragraph for every export kind, and isExportKind admits exactly those', () => {
		for (const kind of EXPORT_KINDS) {
			expect(EXPORT_FIELD_NOTES[kind].length).toBeGreaterThan(80);
			expect(isExportKind(kind)).toBe(true);
			const readme = exportReadme({ kind, count: 3, from: null, to: null, exportedAt: '2026-10-15T20:00:00.000Z' });
			expect(readme).toContain(`\`${kind}.json\``);
			expect(readme).toContain(`\`${kind}.csv\``);
			expect(readme).toContain(EXPORT_FIELD_NOTES[kind]);
			expect(readme).not.toMatch(/\u2014/); // no em dashes
		}
		expect(isExportKind('holders')).toBe(false);
		expect(isExportKind('')).toBe(false);
		expect(isExportKind(null)).toBe(false);
	});

	it('states the range and the cap in words', () => {
		const ranged = exportReadme({ kind: 'events', count: 1, from: '2026-08-17T00:00:00.000Z', to: null, exportedAt: 'now', truncated: true });
		expect(ranged).toContain('Rows from 2026-08-17T00:00:00.000Z to now.');
		expect(ranged).toContain('1 row.');
		expect(ranged).toContain('50,000 row cap');
		expect(exportReadme({ kind: 'sync', count: 0, from: null, to: null, exportedAt: 'now' })).toContain('Every row on record');
	});
});

describe('exportZipName', () => {
	it('names the file cert-<kind>-<YYYYMMDD>.zip on the Los Angeles calendar', () => {
		// 03:30 UTC on Oct 16 is still Oct 15 in Los Angeles.
		expect(exportZipName('awards', new Date('2026-10-16T03:30:00Z'))).toBe('cert-awards-20261015.zip');
		expect(exportZipName('events', new Date('2026-10-16T12:00:00Z'))).toBe('cert-events-20261016.zip');
	});
});
