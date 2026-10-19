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
import { callArgs, callEntries, directEntries, endpointArgs, endpointEntries, FACADES, findTools, toolList, type ArgSpec } from '../src/lib/server/connector/registry';

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
				'set_points', 'set_published', 'set_rubric', 'undo_last', 'report_gap', 'record_eval_result',
				// ledger 0416: the site's own feedback list
				'list_site_feedback', 'feedback_screenshot'
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
			// Every argument goes by a spoken noun, never its database name.
			for (const a of callArgs(e)) expect(a.name.startsWith('p_'), `${e.name}.${a.param} has a spoken name`).toBe(false);
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

describe('every endpoint entry reads well too', () => {
	for (const e of endpointEntries()) {
		it(e.tool as string, () => {
			expect((e.describe ?? '').length).toBeGreaterThan(20);
			expect((e.describe ?? '').length).toBeLessThan(200);
			expect((e.say ?? []).length).toBeGreaterThanOrEqual(3);
			assertWords(`${e.tool} describe`, e.describe ?? '');
			for (const s of e.say ?? []) assertWords(`${e.tool} say`, s);
			for (const a of endpointArgs(e)) {
				expect(IDENTIFIER.test(a.name), `${e.tool}.${a.name} is a spoken noun`).toBe(false);
				expect(a.describe, `${e.tool}.${a.name} has a description`).toBeTruthy();
				assertWords(`${e.tool}.${a.name}`, a.describe ?? '');
			}
		});
	}
});

describe('the MCP tool list', () => {
	const tools = toolList();
	it('is the facades, the promoted entries, site_find_tool and site_call, each with a valid input schema', () => {
		const direct = directEntries().map((e) => e.tool ?? e.name);
		expect(direct.length).toBeGreaterThanOrEqual(10);
		expect(tools.map((t) => t.name).sort()).toEqual([...Object.keys(FACADES), ...direct, 'site_call', 'site_find_tool'].sort());
		expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
		for (const t of tools) {
			expect(t.inputSchema.type).toBe('object');
			for (const r of t.inputSchema.required ?? []) expect(t.inputSchema.properties[r], `${t.name} requires ${r}`).toBeDefined();
		}
	});
	it('stays small enough to read on every turn (about twenty facades, DESIGN.md section 8)', () => {
		expect(tools.length).toBeLessThanOrEqual(40);
	});
	it('every tool takes said, his request in his own words, and requires it', () => {
		for (const t of tools) {
			expect(t.inputSchema.properties.said, `${t.name} takes said`).toBeDefined();
			expect(t.inputSchema.required, `${t.name} requires said`).toContain('said');
		}
	});
	it('every promoted tool reads well aloud, with spoken argument names', () => {
		for (const e of directEntries()) {
			const t = tools.find((x) => x.name === (e.tool ?? e.name))!;
			assertWords(`${t.name} description`, e.describe ?? '');
			for (const name of Object.keys(t.inputSchema.properties)) {
				if (['dry_run', 'request_id', 'confirm_token', 'again', 'said'].includes(name)) continue;
				expect(IDENTIFIER.test(name), `${t.name} argument ${name}`).toBe(false);
			}
		}
	});
	it('site_find_tool answers at most five, each with the exact site_call to make, and nothing for nonsense', () => {
		const pin = findTools('pin the syllabus post in Block 4');
		expect(pin.length).toBeGreaterThan(0);
		expect(pin.length).toBeLessThanOrEqual(5);
		for (const m of pin) expect(m.call.name).toBe(m.name);
		const versions = findTools('show me the old versions of Tolerance Check');
		expect(versions.map((m) => m.name)).toContain('classroom_item_revisions');
		expect(findTools('qwertyuiop zxcvbnm')).toEqual([]);
		const purge = findTools('purge that Armory project');
		expect(purge.map((m) => m.name)).toContain('delete_project_forever');
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
