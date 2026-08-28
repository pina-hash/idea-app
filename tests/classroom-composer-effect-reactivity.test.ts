// tests/classroom-composer-effect-reactivity.test.ts
//
// THE INJECTED-CALLBACK CONTRACT, asserted against the SHIPPING BYTES of
// ContentComposer rather than against a copy of its effect.
//
// Reading state inside an `$effect` subscribes to it, and that includes state
// read inside the functions the effect calls. `transports.loadCategorySuggestions`
// is INJECTED -- written by whoever mounts the composer, who cannot see this
// effect -- so anything it touches reactively before its first `await` joins
// this effect's dependency set, and anything it writes re-triggers the effect.
// A dev-harness transport that read fixture state and appended a log line took
// the composer down with `effect_update_depth_exceeded` the moment it opened.
// The production transport is a plain Supabase call with no reactivity in it,
// so production never looped -- which is luck, not design.
//
// WHY THIS IS A SOURCE ASSERTION AND NOT A MOUNT.
// Proving it behaviourally means mounting the real component so its effects
// actually run, and effects do not run under `svelte/server`. Vitest here is
// `environment: 'node'` with no DOM package installed, and `svelte` resolves to
// its SERVER build, so `mount()` raises `lifecycle_function_unavailable` and
// even a bare `$effect.root` in a `.svelte.ts` fixture never runs its effect
// (measured: 0 runs). A runtime control written in-bounds today would be GREEN
// AND VACUOUS, which is worse than no control. See this bundle's history entry
// for the two-line config change that would make a mount test possible, and for
// exactly what remains unproven without it.
//
// SO THIS TEST TAKES THE OTHER HALF, AND DELIBERATELY TAKES THE WIDER ONE: it
// does not look for the one call that was fixed, it walks EVERY `$effect` in
// the file and flags EVERY synchronous call into a caller-supplied binding that
// is not wrapped in `untrack`. It reddens for the next one somebody writes.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';

const COMPOSER = 'src/lib/classroom/ContentComposer.svelte';

/**
 * Collection reads that invoke no caller-supplied code. `sections.filter(fn)`
 * runs Array.prototype.filter over a prop ARRAY with a LOCAL callback; nothing
 * the mounting surface wrote gets to execute, so it takes no dependency the
 * effect did not already want by reading `sections` itself.
 *
 * A transport must never be NAMED after one of these. That is the cost of
 * discriminating by method name, and it is asserted below: a non-allowlisted
 * member on the same prop object IS flagged.
 */
const PURE_COLLECTION_METHODS = new Set([
	'map', 'filter', 'find', 'findIndex', 'some', 'every', 'includes', 'indexOf',
	'slice', 'join', 'concat', 'flat', 'flatMap', 'reduce', 'sort', 'at',
	'has', 'get', 'keys', 'values', 'entries', 'toString'
]);

const FN_TYPES = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration']);

interface Finding {
	line: number;
	text: string;
	root: string;
	member: string | null;
	wrapped: boolean;
	pure: boolean;
}

function walkAst(node: unknown, visit: (n: any, parents: any[]) => void, parents: any[] = []): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const n of node) walkAst(n, visit, parents);
		return;
	}
	const n = node as Record<string, unknown>;
	if (typeof n.type === 'string') visit(n, parents);
	const next = typeof n.type === 'string' ? [...parents, n] : parents;
	for (const k of Object.keys(n)) {
		if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue;
		walkAst(n[k], visit, next);
	}
}

/** The root identifier of a callee: `a.b.c()` -> `a`, `a()` -> `a`. */
function rootOf(node: any): string | null {
	let c = node;
	while (c) {
		if (c.type === 'Identifier') return c.name;
		if (c.type === 'MemberExpression') { c = c.object; continue; }
		if (c.type === 'ChainExpression') { c = c.expression; continue; }
		if (c.type === 'CallExpression') { c = c.callee; continue; }
		if (c.type === 'TSNonNullExpression') { c = c.expression; continue; }
		return null;
	}
	return null;
}

/** True when the callee is reached THROUGH a call, i.e. `a.b().then`. */
function chainsThroughCall(node: any): boolean {
	let c = node;
	while (c) {
		if (c.type === 'MemberExpression') { c = c.object; continue; }
		if (c.type === 'ChainExpression') { c = c.expression; continue; }
		if (c.type === 'TSNonNullExpression') { c = c.expression; continue; }
		return c.type === 'CallExpression';
	}
	return false;
}

function memberOf(node: any): string | null {
	let c = node;
	if (c?.type === 'ChainExpression') c = c.expression;
	if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') return c.property.name;
	return null;
}

/**
 * Every synchronous call into a caller-supplied binding inside an `$effect`.
 *
 * "Caller-supplied" is a `$props()` name, or a binding whose initializer is a
 * DIRECT reference to one (`const load = transports.loadCategorySuggestions`).
 * An initializer that merely mentions a prop is NOT caller-supplied -- the
 * composer's `const save = new SaveState({ ... })` closes over props but is an
 * object this file constructed, and `save.attach()` is our own shared code.
 */
export function injectedCallsInEffects(source: string, filename = 'inline.svelte') {
	const ast = parse(source, { modern: true, filename }) as any;
	const instance = ast.instance;
	const findings: Finding[] = [];
	let effects = 0;
	if (!instance) return { effects, findings };

	const roots = new Set<string>();
	walkAst(instance.content, (n) => {
		if (n.type !== 'VariableDeclarator' || !n.init) return;
		if (n.init.type !== 'CallExpression') return;
		if (n.init.callee?.type !== 'Identifier' || n.init.callee.name !== '$props') return;
		if (n.id.type === 'ObjectPattern') {
			for (const p of n.id.properties) {
				const v = p.type === 'RestElement' ? p.argument : p.value;
				const t = v?.type === 'AssignmentPattern' ? v.left : v;
				if (t?.type === 'Identifier') roots.add(t.name);
			}
		} else if (n.id.type === 'Identifier') roots.add(n.id.name);
	});

	// Direct aliases only, to a fixpoint.
	const DIRECT = new Set(['Identifier', 'MemberExpression', 'ChainExpression', 'TSNonNullExpression']);
	for (let pass = 0; pass < 5; pass++) {
		const before = roots.size;
		walkAst(instance.content, (n) => {
			if (n.type !== 'VariableDeclarator' || !n.init) return;
			if (n.id.type !== 'Identifier' || roots.has(n.id.name)) return;
			if (!DIRECT.has(n.init.type)) return;
			const r = rootOf(n.init);
			if (r && roots.has(r)) roots.add(n.id.name);
		});
		if (roots.size === before) break;
	}

	walkAst(instance.content, (n) => {
		const isEffect =
			n.type === 'CallExpression' &&
			((n.callee?.type === 'Identifier' && n.callee.name === '$effect') ||
				(n.callee?.type === 'MemberExpression' &&
					n.callee.object?.type === 'Identifier' &&
					n.callee.object.name === '$effect' &&
					n.callee.property?.name === 'pre'));
		if (!isEffect) return;
		const cb = n.arguments?.[0];
		if (!cb || !FN_TYPES.has(cb.type)) return;
		effects++;
		walkAst(cb.body, (c, parents) => {
			if (c.type !== 'CallExpression') return;
			// Only calls that run SYNCHRONOUSLY in the effect body. A call inside a
			// nested function (a `.then` handler, a cleanup, a local helper literal)
			// runs outside the tracking context and is not this rule's business.
			//
			// `untrack(() => ...)` is the ONE nesting that still runs synchronously,
			// so its callback does not defer the call -- it is exactly the wrapping
			// this test is looking for, and skipping it as "nested" would count
			// every correctly fixed call as absent and let the file pass vacuously.
			const enclosing = parents
				.map((p, i) => ({ p, i }))
				.filter(({ p }) => FN_TYPES.has(p.type));
			const isUntrackArg = ({ p, i }: { p: any; i: number }) => {
				const owner = parents[i - 1];
				return (
					owner?.type === 'CallExpression' &&
					owner.callee?.type === 'Identifier' &&
					owner.callee.name === 'untrack' &&
					owner.arguments?.[0] === p
				);
			};
			if (!enclosing.every(isUntrackArg)) return;
			// `transports.load().then(...)` is ONE injected call, not two. The
			// `.then` is invoked on the promise that call returned, so only the
			// innermost call is reported; otherwise a single defect prints twice
			// and the expected-value lists below stop meaning anything.
			if (chainsThroughCall(c.callee)) return;
			const root = rootOf(c.callee);
			if (!root || !roots.has(root)) return;
			const member = memberOf(c.callee);
			const wrapped = enclosing.length > 0;
			findings.push({
				line: source.slice(0, c.start).split('\n').length,
				text: source.slice(c.callee.start, c.callee.end).replace(/\s+/g, ' ').slice(0, 70),
				root,
				member,
				wrapped,
				pure: member !== null && PURE_COLLECTION_METHODS.has(member)
			});
		});
	});
	return { effects, findings };
}

const unwrapped = (r: ReturnType<typeof injectedCallsInEffects>) =>
	r.findings.filter((f) => !f.wrapped && !f.pure);

// ---------------------------------------------------------------------------
// THE INSTRUMENT FIRST. A check that has never failed has not been tested, and
// a checker that silently finds nothing certifies whatever is in front of it.
// ---------------------------------------------------------------------------

describe('the checker itself', () => {
	const wrap = (body: string, props = 'transports, onthing = null, sections = []') =>
		`<script lang="ts">\n\timport { untrack } from 'svelte';\n\tlet { ${props} } = $props();\n\tlet out = $state([]);\n${body}\n</script>`;

	it('FLAGS a transport called straight from an effect body', () => {
		const r = injectedCallsInEffects(wrap(`$effect(() => { transports.loadThings().then((v) => { out = v; }); });`));
		expect(r.effects).toBe(1);
		expect(unwrapped(r).map((f) => f.text)).toEqual(['transports.loadThings']);
	});

	it('FLAGS a prop callback invoked from an effect body', () => {
		const r = injectedCallsInEffects(wrap(`$effect(() => { onthing?.(out); });`));
		expect(unwrapped(r).map((f) => f.root)).toEqual(['onthing']);
	});

	it('FLAGS a call nested in a plain if-block, which brace counting misses', () => {
		const r = injectedCallsInEffects(
			wrap(`$effect(() => { if (sections.length) { transports.loadThings(); } });`)
		);
		expect(unwrapped(r).map((f) => f.text)).toEqual(['transports.loadThings']);
	});

	it('FLAGS a transport reached through a local alias', () => {
		const r = injectedCallsInEffects(
			wrap(`$effect(() => { const load = transports.loadThings; if (load) load(1); });`)
		);
		expect(unwrapped(r).map((f) => f.root)).toEqual(['load']);
	});

	it('FLAGS a non-allowlisted member on a prop object, so the allowlist cannot hide one', () => {
		const r = injectedCallsInEffects(wrap(`$effect(() => { transports.refresh(); });`));
		expect(unwrapped(r).map((f) => f.member)).toEqual(['refresh']);
	});

	it('CLEARS a call wrapped in untrack, and still counts it', () => {
		const r = injectedCallsInEffects(
			wrap(`$effect(() => { const ids = sections.length; untrack(() => transports.loadThings(ids)); });`)
		);
		expect(unwrapped(r)).toEqual([]);
		expect(r.findings.filter((f) => f.wrapped)).toHaveLength(1);
	});

	it('CLEARS a call made inside a nested callback, which never runs tracked', () => {
		const r = injectedCallsInEffects(
			wrap(`$effect(() => { Promise.resolve().then(() => transports.loadThings()); });`)
		);
		expect(unwrapped(r)).toEqual([]);
	});

	it('CLEARS a pure collection read over prop DATA', () => {
		const r = injectedCallsInEffects(wrap(`$effect(() => { out = sections.map((s) => s.id); });`));
		expect(unwrapped(r)).toEqual([]);
		expect(r.findings.filter((f) => f.pure)).toHaveLength(1);
	});

	it('CLEARS a method on an object this file constructed, however many props it closes over', () => {
		const r = injectedCallsInEffects(
			wrap(`\tconst save = new SaveState({ onsave: () => transports.save() });\n\t$effect(() => save.attach());`)
		);
		expect(unwrapped(r)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// THE REAL FILE.
// ---------------------------------------------------------------------------

describe('ContentComposer: no injected callback runs inside a tracking context', () => {
	const source = readFileSync(COMPOSER, 'utf8');
	const result = injectedCallsInEffects(source, COMPOSER);

	it('walked the real effects and found real candidates, so a pass is not vacuous', () => {
		// A sweep that generated nothing passes every absence assertion below.
		expect(result.effects).toBeGreaterThanOrEqual(4);
		expect(result.findings.length).toBeGreaterThanOrEqual(2);
		expect(result.findings.filter((f) => f.wrapped).length).toBeGreaterThanOrEqual(2);
	});

	it('has no unwrapped injected call in any effect', () => {
		const bad = unwrapped(result);
		expect(
			bad.map((f) => `${COMPOSER}:${f.line} ${f.text}(...) -- wrap the CALL in untrack()`)
		).toEqual([]);
	});

	it('still tracks the dependencies the suggestions effect exists for', () => {
		// The fix must not have bought its safety by untracking the whole effect:
		// the course scope and the transport lookup stay OUTSIDE the untrack, so a
		// change of scope still re-runs it and still drops a stale response.
		const effect = source.slice(source.indexOf('let categorySuggestions'));
		const body = effect.slice(0, effect.indexOf('const categoryListId'));
		expect(body).toMatch(/const courseIds = categoryCourseIds;/);
		expect(body).toMatch(/const load = transports\.loadCategorySuggestions;/);
		expect(body).toMatch(/untrack\(\(\) => load\(courseIds\)\)/);
		expect(body).toMatch(/if \(cancelled\) return;/);
		// and both of those reads are outside the untrack call
		expect(body.indexOf('const courseIds')).toBeLessThan(body.indexOf('untrack('));
		expect(body.indexOf('const load =')).toBeLessThan(body.indexOf('untrack('));
	});
});
