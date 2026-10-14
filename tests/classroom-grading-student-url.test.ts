// Ledger 0380, report b31afb76: the student being graded survives a refresh,
// and the address never carries the student's school email.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findStudentByToken, isStudentToken, studentToken, STUDENT_PARAM } from '$lib/classroom/grading-student-url';

const ITEM = '323ae8b2-b63a-4fed-be75-4e7bc8df8bf4';

describe('the student token', () => {
	it('is sixteen hex characters, stable, case-insensitive on the address, and contains no part of it', async () => {
		const a = await studentToken(ITEM, 'Ana.Reyes.2030@boscotech.net');
		expect(a).toMatch(/^[0-9a-f]{16}$/);
		expect(await studentToken(ITEM, ' ana.reyes.2030@BOSCOTECH.net ')).toBe(a);
		expect(a).not.toContain('ana');
		expect(isStudentToken(a)).toBe(true);
	});
	it('differs by student and by assignment', async () => {
		const a = await studentToken(ITEM, 'ana@boscotech.net');
		expect(await studentToken(ITEM, 'bruno@boscotech.net')).not.toBe(a);
		expect(await studentToken('other-item', 'ana@boscotech.net')).not.toBe(a);
	});
	it('only a token is accepted from the address: an email, a short value and nothing are not', () => {
		for (const bad of ['ana@boscotech.net', 'abc', '', null, undefined, 'ZZZZZZZZZZZZZZZZ', '0123456789abcdef0']) {
			expect(isStudentToken(bad as never), String(bad)).toBe(false);
		}
	});
});

describe('resolving a token against the roster', () => {
	const rows = [{ email: 'ana@boscotech.net' }, { email: 'bruno@boscotech.net' }, { email: 'carla@boscotech.net' }];
	it('finds the student it names', async () => {
		const token = await studentToken(ITEM, 'bruno@boscotech.net');
		expect(await findStudentByToken(rows, ITEM, token)).toBe('bruno@boscotech.net');
	});
	it('a token for nobody on this roster, or from another assignment, opens nobody', async () => {
		expect(await findStudentByToken(rows, ITEM, await studentToken(ITEM, 'zed@boscotech.net'))).toBeNull();
		expect(await findStudentByToken(rows, ITEM, await studentToken('another', 'ana@boscotech.net'))).toBeNull();
		expect(await findStudentByToken(rows, ITEM, 'not-a-token')).toBeNull();
		expect(await findStudentByToken([], ITEM, await studentToken(ITEM, 'ana@boscotech.net'))).toBeNull();
	});
});

describe('both grading routes wire it, and neither writes an address', () => {
	for (const file of ['src/routes/classroom/[sectionId]/item/[itemId]/grade/+page.svelte', 'src/routes/classroom/grading/[itemId]/+page.svelte']) {
		it(file, () => {
			const src = readFileSync(file, 'utf8');
			expect(src).toContain('initialStudent');
			expect(src).toContain('replaceState');
			expect(src).not.toMatch(/goto\(/); // a navigation would rerun every load
			expect(src).toContain(STUDENT_PARAM);
			expect(src).not.toMatch(/searchParams\.set\([^)]*email/i);
		});
	}
});
