// tests/armory-class-placeholders.test.ts
//
// LEDGER 0463: the two placeholder texts of a class folder. The migration
// stores their SHA-256 and length as literals; the website stores the bytes.
// If the two ever disagree, every lab computer fails the download with a hash
// mismatch, which reads on screen as a file that never arrives.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { PLACEHOLDERS, placeholderBytes, placeholderKindForHash, placeholderText } from '../src/lib/armory/placeholders';

const SQL = readFileSync(new URL('../supabase/migrations/0319_armory_class_projects.sql', import.meta.url), 'utf8');

describe('the placeholder texts', () => {
	for (const kind of ['personal', 'team'] as const) {
		test(`${kind}: the bytes hash to the constant and the migration's literal`, () => {
			const bytes = placeholderBytes(kind);
			expect(createHash('sha256').update(bytes).digest('hex')).toBe(PLACEHOLDERS[kind].hash);
			expect(bytes.byteLength).toBe(PLACEHOLDERS[kind].bytes);
			expect(SQL).toContain(`when '${kind}' then '${PLACEHOLDERS[kind].hash}'`);
			expect(SQL).toContain(`when '${kind}' then ${PLACEHOLDERS[kind].bytes}::bigint`);
			expect(placeholderKindForHash(PLACEHOLDERS[kind].hash)).toBe(kind);
		});
	}
	test('plain ASCII, Windows line endings, no em dash', () => {
		for (const kind of ['personal', 'team'] as const) {
			const text = placeholderText(kind);
			expect(/^[\x20-\x7e\r\n]*$/.test(text)).toBe(true);
			expect(text.split('\r\n').length).toBe(7);
		}
		expect(placeholderKindForHash('0'.repeat(64))).toBeNull();
	});
});
