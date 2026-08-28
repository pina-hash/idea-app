// tests/classroom-composer-effect-reactivity.test.ts
//
// THE INJECTED-CALLBACK CONTRACT, asserted over EVERY `$effect` IN `src/`.
//
// THE FILENAME IS HISTORICAL AND IS KEPT DELIBERATELY. This began as a source
// assertion over ContentComposer alone, because that is where the defect was
// found. The defect was never ContentComposer's: a repo-wide sweep on the same
// checker turned up six more in five other files, in three subsystems, none of
// which had anything to do with the classroom. So the sweep is the test now and
// the composer is one of its inputs. The name stays so existing references do
// not orphan, the way `IDEA_VERIFICATION_ADDENDA.md` keeps its own.
//
// THE RULE. Reading state inside an `$effect` subscribes to it, and that
// includes state read inside the functions the effect calls. A transport, a
// prop callback, an injected client -- any caller-supplied binding -- is code
// written by whoever MOUNTS the component, who cannot see the effect that calls
// it. So everything it touches reactively before its first `await` joins that
// effect's dependency set, and anything it writes re-triggers the effect. A
// dev-harness transport that read fixture state and appended a log line took
// the composer down with `effect_update_depth_exceeded` the moment it opened.
// The production transport is a plain Supabase call with no reactivity in it,
// so production never looped -- which is luck, not design, and is exactly the
// reason a source sweep is worth more here than a runtime one.
//
// THE FIX IS ALWAYS THE SAME SHAPE: track the inputs, untrack the CALL.
// Untracking the whole effect body buys the same safety by deleting the reason
// the effect exists, and nothing on screen reports an effect that stopped
// re-running.
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
// SCOPE: every `.svelte` file under `src/`. `.svelte.ts` modules are NOT
// walked -- they have no `$props()`, so "caller-supplied" has a different shape
// there (a constructor argument, a factory parameter) and detecting it is a
// different analysis. That is a real gap, so it is pinned rather than assumed:
// no `.svelte.ts` module in the repo calls `$effect(` today, and the assertion
// below reddens the moment one does, which forces the decision instead of
// silently leaving the file uncovered.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parse } from 'svelte/compiler';

const SRC_ROOT = 'src';
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
// THE REPO-WIDE SWEEP.
// ---------------------------------------------------------------------------

/** Every `.svelte` file under `src/`, in a stable order. */
function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir).sort()) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) svelteFiles(p, out);
		else if (p.endsWith('.svelte')) out.push(p.split(sep).join('/'));
	}
	return out;
}

/** Every `.svelte.ts` module under `src/`, for the scope tripwire below. */
function svelteModules(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir).sort()) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) svelteModules(p, out);
		else if (p.endsWith('.svelte.ts')) out.push(p.split(sep).join('/'));
	}
	return out;
}

interface Site extends Finding {
	file: string;
}

/**
 * THE ALLOWLIST, AND WHY IT IS PER SITE RATHER THAN PER METHOD NAME.
 *
 * `PURE_COLLECTION_METHODS` is a heuristic and it has a hole in it that only
 * shows up at repo scale: `get`, `has` and `find` are on that list because
 * `Map.get` and `Array.find` belong there, and a transport called
 * `transports.get(id)` or `store.find(q)` would be waved straight through by
 * the same rule. One file could be eyeballed. Three hundred and fifty cannot.
 *
 * So a pure-looking call clears only when it is NAMED HERE, with the reason
 * somebody checked. That makes every entry a decision that was made rather
 * than a hole that was left, and it makes the heuristic a first filter rather
 * than the verdict.
 *
 * `count` is asserted exactly, so a SECOND call appearing at a site somebody
 * already blessed still has to be looked at. Line numbers are deliberately not
 * part of the key: they churn on every unrelated edit above, and an allowlist
 * that has to be renumbered is one that gets renumbered without being read.
 */
const ALLOWED_PURE: ReadonlyArray<{ file: string; callee: string; count: number; why: string }> = [
	{
		file: 'src/lib/classroom/ClassView.svelte',
		callee: 'items.map',
		count: 1,
		why: 'Array.prototype.map over the `items` prop with a local `(i) => i.id`. The effect already reads `items` to build the id list it exists for, so the call adds no dependency it did not want.'
	},
	{
		file: 'src/lib/frc/FrcInteractiveDrill.svelte',
		callee: 'bank.items.map',
		count: 1,
		why: 'Array.prototype.map over `bank.items` with the local `buildState`. `bank` is read tracked on the line above ON PURPOSE, so the drill re-seeds when the bank changes.'
	},
	{
		file: 'src/lib/notebook/NotebookView.svelte',
		callee: 'folders.some',
		count: 2,
		why: 'Two stale-selection guards (the folder picker, and the feed filter) asking Array.prototype.some over the `folders` prop with a local id comparison. Both must re-run when `folders` changes, which is the dependency the read itself already takes.'
	},
	{
		file: 'src/lib/notebook/NotebookView.svelte',
		callee: 'sessions.find',
		count: 1,
		why: 'Array.prototype.find over the `sessions` prop resolving a pending capture to its section. `find`, not a transport lookup: the callback is a local id comparison.'
	},
	{
		file: 'src/lib/notebook/PhotoStager.svelte',
		callee: 'staged.map',
		count: 1,
		why: 'Array.prototype.map over the `staged` prop with the local `shownFile`, building the live set the object-URL cache is swept against.'
	},
	{
		file: 'src/lib/notebook/ReviewConsole.svelte',
		callee: 'sections.some',
		count: 1,
		why: 'Array.prototype.some over the `sections` prop, the stale-section guard. Same shape as NotebookView\'s, and named separately so a change to one cannot be waved through on the other\'s reason.'
	},
	{
		file: 'src/lib/tournaments/RewardRulesEditor.svelte',
		callee: 'r.find',
		count: 1,
		why: 'Array.prototype.find over `r`, a direct alias of the `rules` prop, with a local trigger-type comparison. The alias is why the checker reports it at all.'
	},
	{
		file: 'src/lib/tournaments/RewardRulesEditor.svelte',
		callee: 'r .filter',
		count: 1,
		why: 'Array.prototype.filter over the same alias, re-seeding the round rows. The space in the callee text is a line break the checker collapses, not a typo.'
	},
	{
		file: 'src/routes/gauntlet/author/+page.svelte',
		callee: 'data.series.map',
		count: 1,
		why: 'Array.prototype.map over `data.series` from the page load, copying rows into local editable state. `data` is the props object, which is what puts it in front of the checker.'
	}
];

const ALLOWED_KEY = (file: string, callee: string) => `${file}::${callee}`;

describe('src/: no injected callback runs inside a tracking context', () => {
	const files = svelteFiles(SRC_ROOT);
	const sites: Site[] = [];
	const parseFailures: string[] = [];
	let effects = 0;

	for (const file of files) {
		let result: ReturnType<typeof injectedCallsInEffects>;
		try {
			result = injectedCallsInEffects(readFileSync(file, 'utf8'), file);
		} catch (e) {
			// A file the checker cannot parse is NOT a pass. It is a file that was
			// never checked, and silently skipping it is how the sweep comes back
			// clean over code it never read.
			parseFailures.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
			continue;
		}
		effects += result.effects;
		for (const f of result.findings) sites.push({ ...f, file });
	}

	const unwrappedSites = sites.filter((s) => !s.wrapped);
	const pureSites = unwrappedSites.filter((s) => s.pure);
	const defects = unwrappedSites.filter((s) => !s.pure);

	it('read every component in src/ and parsed all of them', () => {
		expect(parseFailures).toEqual([]);
		// A sweep that generated nothing passes every absence assertion below.
		// These are floors on the CORPUS, not pins on it: adding a component or
		// an effect is ordinary and must not redden anything.
		expect(files.length).toBeGreaterThanOrEqual(300);
		expect(effects).toBeGreaterThanOrEqual(120);
	});

	it('found real candidates, so a clean result is not a checker that walked nothing', () => {
		// The positive control for the whole sweep. If this ever goes to zero the
		// walk has stopped finding calls at all, and every assertion under it is
		// vacuous rather than satisfied.
		expect(sites.length).toBeGreaterThanOrEqual(20);
		expect(sites.filter((s) => s.wrapped).length).toBeGreaterThanOrEqual(8);
		expect(pureSites.length).toBeGreaterThanOrEqual(10);
	});

	it('has no unwrapped injected call in any effect, anywhere in src/', () => {
		expect(
			defects.map(
				(s) => `${s.file}:${s.line} ${s.text}(...) -- wrap the CALL in untrack()`
			)
		).toEqual([]);
	});

	it('clears every pure-looking call through the explicit allowlist, and nothing else', () => {
		const allowed = new Set(ALLOWED_PURE.map((a) => ALLOWED_KEY(a.file, a.callee)));
		const unlisted = pureSites.filter((s) => !allowed.has(ALLOWED_KEY(s.file, s.text)));
		expect(
			unlisted.map(
				(s) =>
					`${s.file}:${s.line} ${s.text}(...) -- a pure-looking call at an unlisted site. ` +
					`Either wrap the CALL in untrack(), or add it to ALLOWED_PURE with the reason it is safe.`
			)
		).toEqual([]);
	});

	it('counts each allowlisted site exactly, so a second call there is still looked at', () => {
		const seen = new Map<string, number>();
		for (const s of pureSites) {
			const k = ALLOWED_KEY(s.file, s.text);
			seen.set(k, (seen.get(k) ?? 0) + 1);
		}
		expect(
			ALLOWED_PURE.map((a) => `${ALLOWED_KEY(a.file, a.callee)} x${seen.get(ALLOWED_KEY(a.file, a.callee)) ?? 0}`)
		).toEqual(ALLOWED_PURE.map((a) => `${ALLOWED_KEY(a.file, a.callee)} x${a.count}`));
	});

	it('pins the allowlist, so an entry cannot be added without saying so', () => {
		// The length is the tripwire the reasons hang off: an entry appended in a
		// hurry moves this number and has to be argued for in review rather than
		// merged as a one-line diff.
		expect(ALLOWED_PURE).toHaveLength(9);
		expect(ALLOWED_PURE.reduce((n, a) => n + a.count, 0)).toBe(10);
		// Every entry carries a real reason, and no entry is a duplicate key.
		for (const a of ALLOWED_PURE) expect(a.why.length).toBeGreaterThan(40);
		expect(new Set(ALLOWED_PURE.map((a) => ALLOWED_KEY(a.file, a.callee))).size).toBe(
			ALLOWED_PURE.length
		);
	});

	it('has no STALE allowlist entry, so a blessing cannot outlive its call', () => {
		// An entry whose site is gone is a pre-approval for whatever gets written
		// there next, which is the opposite of what this list is for.
		const live = new Set(pureSites.map((s) => ALLOWED_KEY(s.file, s.text)));
		expect(
			ALLOWED_PURE.filter((a) => !live.has(ALLOWED_KEY(a.file, a.callee))).map(
				(a) => `${ALLOWED_KEY(a.file, a.callee)} -- allowlisted, but no such call exists any more`
			)
		).toEqual([]);
	});

	it('covers every effect in the repo, because no .svelte.ts module has one', () => {
		// THE SCOPE TRIPWIRE. `.svelte.ts` modules are outside this sweep (see the
		// header): they have no `$props()`, so "caller-supplied" is a different
		// shape there. That gap costs nothing only while no such module runs an
		// effect. The moment one does, this reddens and somebody decides, rather
		// than the file sitting unchecked with the sweep still reporting clean.
		const withEffects = svelteModules(SRC_ROOT).filter((f) =>
			/\$effect(\.pre)?\s*\(/.test(readFileSync(f, 'utf8'))
		);
		expect(withEffects).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// THE COMPOSER, WHICH IS WHERE THIS STARTED. The sweep above already asserts it
// has no unwrapped call; this asserts the SHAPE of the fix, which the sweep
// cannot see -- a whole-body untrack would satisfy the sweep and quietly stop
// the effect re-running.
// ---------------------------------------------------------------------------

describe('ContentComposer: the fix tracks its inputs and untracks only the call', () => {
	const source = readFileSync(COMPOSER, 'utf8');
	const result = injectedCallsInEffects(source, COMPOSER);

	it('walked the real effects and found real candidates, so a pass is not vacuous', () => {
		expect(result.effects).toBeGreaterThanOrEqual(4);
		expect(result.findings.length).toBeGreaterThanOrEqual(2);
		expect(result.findings.filter((f) => f.wrapped).length).toBeGreaterThanOrEqual(2);
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
