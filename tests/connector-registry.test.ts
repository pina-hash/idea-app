// tests/connector-registry.test.ts
//
// THE STRUCTURAL JUDGE OF THE TOOL LIST (docs/connector/DESIGN.md section 2):
// descriptions good enough for voice. Every tool and every call entry has a
// `describe` under 200 characters, three or more `say` lines, a description on
// every argument, and no table name, column name or internal identifier
// anywhere a person or Claude reads. The tool list itself comes from the
// registry and nowhere else.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { callArgs, callEntries, FACADES, toolList, type ArgSpec } from '../src/lib/server/connector/registry';

const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../src/lib/server/connector/schema.generated.json', import.meta.url)), 'utf8'));

/** Every snake_case identifier is a table, a column, a function or an argument: none belongs in words. */
const IDENTIFIER = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/;
/** Table names that are a single English word, checked by name. */
const SINGLE_WORD_TABLES = ['profiles', 'tournaments'];

function wordsOf(spec: ArgSpec | undefined, out: string[] = []): string[] {
	if (!spec) return out;
	if (spec.describe) out.push(spec.describe);
	for (const p of Object.values(spec.properties ?? {})) wordsOf(p, out);
	if (spec.items && typeof spec.items === 'object') wordsOf(spec.items as ArgSpec, out);
	return out;
}

function assertWords(where: string, text: string) {
	expect(IDENTIFIER.test(text), `${where} names an identifier: "${text}"`).toBe(false);
	for (const t of SINGLE_WORD_TABLES) expect(new RegExp(`\\b${t}\\b`, 'i').test(text), `${where} names the ${t} table`).toBe(false);
}

describe('every facade tool reads well aloud', () => {
	const facades = Object.values(FACADES);
	it('there are the first slice\'s facades', () => {
		expect(facades.map((f) => f.name).sort()).toEqual(
			[
				'award_coins', 'coin_balance', 'connector_disconnect', 'create_post', 'find_student', 'fine_coins', 'get_post', 'grade',
				'list_classes', 'list_posts', 'read_answers', 'read_grades', 'replace_html_assignment', 'send_feedback', 'set_due',
				'set_points', 'set_published', 'set_rubric', 'undo_last'
			].sort()
		);
	});
	for (const f of facades) {
		it(f.name, () => {
			expect(f.describe.length, 'describe under 200 characters').toBeLessThan(200);
			expect(f.describe.length).toBeGreaterThan(20);
			expect(f.say.length, 'three or more say lines').toBeGreaterThanOrEqual(3);
			assertWords(`${f.name} describe`, f.describe);
			for (const s of f.say) assertWords(`${f.name} say`, s);
			for (const [name, spec] of Object.entries(f.args ?? {})) {
				expect(IDENTIFIER.test(name), `${f.name} argument ${name} is a spoken noun`).toBe(false);
				const words = wordsOf(spec);
				expect(words.length, `${f.name}.${name} has a description`).toBeGreaterThan(0);
				for (const w of words) assertWords(`${f.name}.${name}`, w);
			}
		});
	}
});

describe('every call entry site_find_tool can return reads well too', () => {
	const entries = callEntries();
	it('there are call entries', () => {
		expect(entries.length).toBeGreaterThanOrEqual(25);
	});
	for (const e of entries) {
		it(e.name, () => {
			expect((e.describe ?? '').length).toBeGreaterThan(20);
			expect((e.describe ?? '').length).toBeLessThan(200);
			expect((e.say ?? []).length).toBeGreaterThanOrEqual(3);
			assertWords(`${e.name} describe`, e.describe ?? '');
			for (const s of e.say ?? []) assertWords(`${e.name} say`, s);
			for (const [param, spec] of Object.entries(e.args ?? {})) {
				expect(schema.functions[e.name].some((o: { args: Array<{ name: string }> }) => o.args.some((a) => a.name === param)), `${e.name} has an argument ${param}`).toBe(true);
				expect(spec.describe, `${e.name}.${param} has a description`).toBeTruthy();
				assertWords(`${e.name}.${param}`, spec.describe ?? '');
				expect(IDENTIFIER.test(spec.name ?? ''), `${e.name}.${param} has a spoken name`).toBe(false);
			}
			expect(callArgs(e).length).toBe(new Set(callArgs(e).map((a) => a.name)).size);
		});
	}
});

describe('the MCP tool list', () => {
	const tools = toolList();
	it('is the facades plus site_find_tool and site_call, each with a valid input schema', () => {
		expect(tools.map((t) => t.name).sort()).toEqual([...Object.keys(FACADES), 'site_call', 'site_find_tool'].sort());
		for (const t of tools) {
			expect(t.inputSchema.type).toBe('object');
			for (const r of t.inputSchema.required ?? []) expect(t.inputSchema.properties[r], `${t.name} requires ${r}`).toBeDefined();
		}
	});
	it('stays small enough to read on every turn', () => {
		expect(tools.length).toBeLessThanOrEqual(30);
	});
	it('every write tool takes dry_run, request_id, confirm_token and again; no read tool does', () => {
		for (const t of tools) {
			const write = !t.annotations?.readOnlyHint;
			for (const p of ['dry_run', 'request_id', 'confirm_token', 'again']) {
				expect(p in t.inputSchema.properties, `${t.name} ${p}`).toBe(write);
			}
		}
	});
});
