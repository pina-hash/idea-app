// tests/dom/app-navigation-stub-mount.test.ts
//
// THE STUB IS A CONTRACT WITH A MODULE, AND A MISSING EXPORT IS A DEAD MOUNT.
//
// `tests/stubs/app-navigation.ts` stands in for `$app/navigation` for the whole
// suite (aliased in `vitest.config.ts`, imported by three files by name and by
// every mount implicitly). It exported the four navigation functions an SSR
// render happens to reach and NO lifecycle hook, so a component whose init
// calls `beforeNavigate` -- which is `AssignmentEngine`, through
// `guardSaveNavigation` (`save-guard.svelte.ts:64`) -- died before rendering a
// single node, with a stack naming the GUARD rather than the missing export.
//
// TWO SESSIONS EACH REACHED FOR `vi.mock` + `importActual` LOCALLY rather than
// widen a file three suites import. That is the shape this file exists to stop
// being repeated: a local mock fixes one test and leaves the next mount to
// rediscover the same thing from the same misleading stack.
//
// SO THE ASSERTION IS THE RULE, NOT THE ONE NAME. The first half reads the real
// `@sveltejs/kit` module's export list off DISK and requires the stub to carry
// every one of them, so the day Kit adds a thirteenth this file says so instead
// of a mount somewhere else failing obscurely six months later. Pinning the
// seven that were missing would have been a list that needs renumbering rather
// than reading -- and a list a legitimate change necessarily breaks is the one
// this repo says to generalize instead of edit.
//
// THE SECOND HALF IS THE POSITIVE CONTROL, and without it the first is a string
// comparison: the real `AssignmentEngine` is mounted, renders nodes, and the
// callback its guard registered is READABLE afterwards. The stub keeps it
// rather than dropping it on the floor, which is what makes "what does this
// component do about a navigation" an assertable question at all -- the thing
// neither local mock could answer.
//
// IT DOES NOT FIRE ON ITS OWN, deliberately. The real `afterNavigate` also runs
// its callback once on mount; a stub that simulated that would be deciding a
// component's behaviour rather than recording it, and every existing mount in
// this directory would silently gain a navigation nobody asked for.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import AssignmentEngine from '$lib/classroom/AssignmentEngine.svelte';
import * as stub from '../stubs/app-navigation';
import { mountInto, type Mounted } from './mount';
import type { ClassroomItem } from '$lib/classroom/classroom';
import type {
	AssignmentEngineTransports,
	StudentEngineData
} from '$lib/classroom/assignment-spec';

const Engine = AssignmentEngine as unknown as Component<Record<string, unknown>>;

/**
 * Every name `$app/navigation` re-exports, read from the installed package
 * rather than written down here. The module is a single re-export block, which
 * is why a regex over it is honest: there is nothing else in the file.
 *
 * RESOLVED FROM `process.cwd()`, NOT FROM `import.meta.url`. Under happy-dom
 * that URL is an `http://` one and `fileURLToPath` throws `The URL must be of
 * scheme file` -- measured here, and a trap worth leaving written down for the
 * next file in this directory that wants to read something off disk.
 */
function realNavigationExports(): string[] {
	const path = join(
		process.cwd(),
		'node_modules/@sveltejs/kit/src/runtime/app/navigation.js'
	);
	const source = readFileSync(path, 'utf8');
	const block = /export\s*\{([^}]*)\}\s*from/.exec(source);
	if (!block) throw new Error('$app/navigation is no longer a single re-export block');
	return block[1]
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

const ITEM: ClassroomItem = {
	id: 'item-1',
	kind: 'assignment',
	title: 'Bridge loading worksheet',
	body: '',
	points: 10,
	due_at: null,
	category: null,
	author_email: 'teacher@boscotech.edu',
	author_name: 'A Teacher',
	published: true,
	pinned: false,
	sort_order: 0,
	first_published_at: '2026-08-01T00:00:00Z',
	edited_at: null,
	created_at: '2026-08-01T00:00:00Z',
	updated_at: '2026-08-01T00:00:00Z',
	links: [],
	attachments: [],
	postings: []
};

const DATA: StudentEngineData = {
	spec: {
		schemaVersion: 1,
		meta: { assignmentId: 'a-1', title: 'Bridge loading worksheet', totalPoints: 10 },
		modules: [
			{
				id: 'm1',
				title: 'Design notes',
				points: 10,
				blocks: [{ type: 'textField', id: 'reasoning', prompt: 'Why this design?' }]
			}
		]
	},
	rubric: null,
	submission: null,
	responses: [],
	files: [],
	approvals: []
};

/** Every member throws: this file drives no write, it drives a MOUNT. */
const TRANSPORTS = new Proxy(
	{},
	{
		get: (_t, prop) => () => {
			throw new Error(`${String(prop)} was called; this file drives the mount only`);
		}
	}
) as unknown as AssignmentEngineTransports;

let mounted: Mounted | null = null;
beforeEach(() => stub.reset());
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	stub.reset();
});

describe('the stub carries the real module s whole export list', () => {
	it('exports every name @sveltejs/kit re-exports from $app/navigation', () => {
		const real = realNavigationExports();
		// POSITIVE CONTROL: the reader found a real list, not an empty match that
		// would make the subset check below pass over nothing.
		expect(real.length).toBeGreaterThanOrEqual(12);
		expect(real).toContain('beforeNavigate');

		const missing = real.filter((name) => !(name in stub));
		expect(missing).toEqual([]);
	});

	it('exports each one as a callable, so a caller reaches a function not undefined', () => {
		// `name in stub` is true for a name exported as `undefined`, which is
		// exactly the state that killed the mount. This is the half that bites.
		const notCallable = realNavigationExports().filter(
			(name) => typeof (stub as Record<string, unknown>)[name] !== 'function'
		);
		expect(notCallable).toEqual([]);
	});
});

describe('a component whose init registers a navigation guard now mounts', () => {
	it('renders, and the guard s callback is readable afterwards', () => {
		const m = (mounted = mountInto(Engine, {
			item: ITEM,
			data: DATA,
			transports: TRANSPORTS
		}));

		// It rendered at all, which is the whole finding: before the widening this
		// threw inside `guardSaveNavigation` and produced no node.
		expect(m.target.children.length).toBeGreaterThan(0);
		expect(m.target.textContent).toContain('Why this design?');

		// And the registration is visible, so this is not "nothing threw" -- the
		// guard genuinely ran and handed over a callback.
		expect(stub.navigationHooks.beforeNavigate.length).toBe(1);
		expect(typeof stub.navigationHooks.beforeNavigate[0]).toBe('function');
		expect(stub.calls.map((c) => c.fn)).toContain('beforeNavigate');
	});

	it('registers nothing before a mount, and nothing fires on its own', () => {
		// The negative control for the count above, and the statement that these
		// registrars record rather than simulate.
		expect(stub.navigationHooks.beforeNavigate).toEqual([]);
		expect(stub.navigationHooks.afterNavigate).toEqual([]);
		expect(stub.navigationHooks.onNavigate).toEqual([]);
		expect(stub.calls).toEqual([]);

		mounted = mountInto(Engine, { item: ITEM, data: DATA, transports: TRANSPORTS });

		// One registration, and the guard did NOT also invoke it.
		expect(stub.navigationHooks.beforeNavigate.length).toBe(1);
		expect(stub.calls.filter((c) => c.fn === 'goto')).toEqual([]);
	});

	it('lets a clean surface be asked about a navigation, and it does not cancel', () => {
		// WHAT THE LOCAL MOCKS COULD NOT ASK. With nothing typed into the engine
		// the guard must let a navigation through: a confirm on every move is a
		// confirm nobody reads, which is the rule the save-guard is written to.
		mounted = mountInto(Engine, { item: ITEM, data: DATA, transports: TRANSPORTS });
		const guard = stub.navigationHooks.beforeNavigate[0];

		let cancelled = false;
		guard({
			type: 'link',
			from: { route: { id: '/classroom/[sectionId]/item/[itemId]' }, url: new URL('http://x/a') },
			to: { route: { id: '/classroom/[sectionId]' }, url: new URL('http://x/b') },
			cancel: () => {
				cancelled = true;
			}
		});

		expect(cancelled).toBe(false);
	});
});
