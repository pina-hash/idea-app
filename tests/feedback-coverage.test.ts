import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SiteFeedback from '../src/lib/feedback/SiteFeedback.svelte';
import {
	BUILD_MEANS,
	FEEDBACK_EXCLUSIONS,
	appForRouteId,
	captureMeta,
	contextOf,
	describeBuild,
	feedbackExclusion,
	type BuildStamp,
	type FeedbackExclusionId
} from '../src/lib/feedback/context';
import { feedbackRetryable, type FeedbackRow } from '../src/lib/feedback/feedback';
import {
	EMPTY_FEEDBACK_FILTER,
	facetValues,
	feedbackJson,
	feedbackMarkdown,
	filterFeedback,
	rowDay,
	rowRole,
	rowRoute,
	rowSection,
	type FeedbackFilter
} from '../src/lib/feedback/console';

/**
 * EVERY SURFACE REPORTS ITS OWN DEFECTS, asserted where it fails SILENTLY.
 *
 * The three claims here all look completely normal when they are broken. A
 * route with no report affordance is a page that works. An exclusion that hid
 * the control everywhere rather than relocating it is a tidy screen. A
 * "coverage" test that checks three known routes is green forever, including on
 * the fourth route somebody adds next month -- which is the exact failure it
 * exists to catch, so it is written as a SWEEP over the route tree rather than
 * a list.
 *
 * WHERE THE EXPECTED VALUES COME FROM. The route list is read off the
 * filesystem, not typed out. The exclusion cases come from the registry's own
 * `samples`, and the test asserts the CASE COUNT and that every category is
 * represented, so a registry that generated nothing cannot pass vacuously.
 * Every absence assertion is paired with a positive control rendering the SAME
 * component in the placement where it must appear. The console fixtures are
 * hand-built rows with an expected membership picked by reading them, never
 * derived from the filter's own rule.
 *
 * WHAT IS SOURCE-WALKED RATHER THAN RENDERED, and why: the root layout, the
 * root error boundary, the deck route and the GAUNTLET layout all import
 * `$app/state`, `$app/navigation` and font CSS, none of which exist under
 * `environment: 'node'`. What matters about them is structural -- WHERE the
 * component is mounted and WHICH props it is handed -- so those are read from
 * the files. The component's own behaviour is rendered for real.
 */

const ROOT = new URL('../', import.meta.url);

function read(path: string): string {
	return readFileSync(new URL(path, ROOT), 'utf8').replace(/\r\n/g, '\n');
}

function walk(rel: string, out: string[] = []): string[] {
	const dir = fileURLToPath(new URL(rel, ROOT));
	for (const name of readdirSync(dir)) {
		const child = `${rel}/${name}`;
		if (statSync(fileURLToPath(new URL(child, ROOT))).isDirectory()) walk(child, out);
		else out.push(child);
	}
	return out;
}

const ROUTE_FILES = walk('src/routes');
const PAGES = ROUTE_FILES.filter((f) => f.endsWith('/+page.svelte'));

const BUILD: BuildStamp = describeBuild({ sha: 'a1b2c3d', complete: true }, null);

/** Render the real component and count the trigger buttons it produced. */
function triggers(props: Record<string, unknown>): number {
	const { body } = render(SiteFeedback, {
		props: {
			routeId: '/notebook',
			pathname: '/notebook',
			build: BUILD,
			submit: async () => ({ error: null, retryable: false }),
			...props
		}
	});
	return (body.match(/class="sfb-trigger/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// 1. COVERAGE COMES FROM THE SHELL
// ---------------------------------------------------------------------------

describe('coverage is structural, not per page', () => {
	it('sweeps a real, non-trivial set of page routes', () => {
		// Assert the case count of the sweep: a walk that found nothing would
		// otherwise make every claim below vacuously true.
		expect(PAGES.length).toBeGreaterThan(100);
	});

	it('has no layout reset anywhere, so the root layout wraps every page', () => {
		// `+page@.svelte` / `+layout@.svelte` are the ONLY way a route escapes an
		// ancestor layout in SvelteKit. One of these appearing is what would make
		// the shell mount stop being total, silently and for one route only.
		const resets = ROUTE_FILES.filter((f) => /\/\+(page|layout|error)@[^/]*\.svelte$/.test(f));
		expect(resets).toEqual([]);
		// Positive control: the detector finds one when the pattern is present.
		expect(
			['src/routes/x/+page@.svelte', 'src/routes/y/+layout@root.svelte'].filter((f) =>
				/\/\+(page|layout|error)@[^/]*\.svelte$/.test(f)
			)
		).toHaveLength(2);
	});

	it('mounts the affordance in the root layout', () => {
		const layout = read('src/routes/+layout.svelte');
		expect(layout).toContain("import SiteFeedback from '$lib/feedback/SiteFeedback.svelte'");
		expect(layout).toMatch(/<SiteFeedback\b/);
	});

	it('hands the root mount everything a report needs, captured not typed', () => {
		const layout = read('src/routes/+layout.svelte');
		const mount = layout.slice(layout.indexOf('<SiteFeedback'));
		for (const prop of [
			'routeId={page.route.id}',
			'pathname={page.url.pathname}',
			'role=',
			'sectionId={page.params.sectionId ?? null}',
			'{build}',
			'submit='
		]) {
			expect(mount).toContain(prop);
		}
		// Both build candidates reach describeBuild, which is what makes the row
		// able to say WHICH one it carried.
		expect(layout).toContain("import { version as buildId } from '$app/environment'");
		expect(layout).toContain("import { deploy } from 'virtual:site-versions'");
		expect(layout).toContain('describeBuild(deploy, buildId)');
	});

	it('is not mounted per page: no page route carries a shell placement', () => {
		// THE REJECTED ALTERNATIVE. Mounting this per page is what the shell mount
		// replaces; a page doing it again would be a second control on that page
		// and a coverage story that stops being true for the next route added.
		// Excluded: the dev harness, which drives the component's own placements
		// on purpose, and the three RELOCATED mounts, which are checked below.
		const offenders = PAGES.filter((f) => !f.startsWith('src/routes/dev/')).filter((f) => {
			const src = read(f);
			if (!src.includes('<SiteFeedback')) return false;
			return !src.includes('place="relocated"');
		});
		expect(offenders).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 2. EXCLUSIONS RELOCATE, THEY DO NOT DELETE
// ---------------------------------------------------------------------------

type Case = { id: FeedbackExclusionId; routeId: string; status: number | null };

const EXCLUSION_CASES: Case[] = FEEDBACK_EXCLUSIONS.flatMap((rule): Case[] =>
	rule.samples.length
		? rule.samples.map((routeId) => ({ id: rule.id, routeId, status: null }))
		: // The error category is not a route: it is asked for with the flag set.
			[{ id: rule.id, routeId: '/notebook', status: 500 }]
);

describe('every exclusion is by category, and each has a positive control', () => {
	it('generates a case for every category in the registry', () => {
		expect(EXCLUSION_CASES.length).toBeGreaterThanOrEqual(FEEDBACK_EXCLUSIONS.length);
		expect(new Set(EXCLUSION_CASES.map((c) => c.id))).toEqual(
			new Set(FEEDBACK_EXCLUSIONS.map((r) => r.id))
		);
		// A category with no relocation is an exclusion that deleted the control.
		for (const rule of FEEDBACK_EXCLUSIONS) expect(rule.relocatedTo.trim().length).toBeGreaterThan(0);
	});

	it.each(EXCLUSION_CASES)(
		'$id: $routeId renders nothing in the shell and the control when relocated',
		({ id, routeId, status }) => {
			expect(feedbackExclusion(routeId, { hasError: status !== null })?.id).toBe(id);
			// ABSENT where it must be absent...
			expect(triggers({ place: 'shell', routeId, pathname: routeId, status })).toBe(0);
			// ...and PRESENT in the same render path, which is what makes the zero
			// above a result rather than a component that renders nothing at all.
			expect(triggers({ place: 'relocated', routeId, pathname: routeId, status })).toBe(1);
		}
	);

	it('an ordinary route keeps the shell control (the whole-file positive control)', () => {
		for (const routeId of ['/', '/notebook', '/classroom/[sectionId]', '/greenline/builder']) {
			expect(feedbackExclusion(routeId)).toBeNull();
			expect(triggers({ place: 'shell', routeId, pathname: routeId })).toBe(1);
		}
	});

	it('a nested route inherits its category rather than having to remember it', () => {
		// The point of matching route ids by CATEGORY: a mode added under
		// /gauntlet next month is excluded without anyone editing the registry.
		expect(feedbackExclusion('/gauntlet/some-new-mode-2027/[id]')?.id).toBe('gauntlet');
		expect(feedbackExclusion('/gauntlet-adjacent')).toBeNull();
	});

	it('each relocation is real: the named surface mounts the same component', () => {
		const relocations: Record<string, string> = {
			deck: 'src/routes/classroom/[sectionId]/item/[itemId]/deck/+page.svelte',
			gauntlet: 'src/routes/gauntlet/+layout.svelte',
			error: 'src/routes/+error.svelte'
		};
		for (const [id, file] of Object.entries(relocations)) {
			const src = read(file);
			expect(src, id).toContain('SiteFeedback');
			expect(src, id).toContain('place="relocated"');
		}
		// GREENLINE's relocation predates this bundle: the race mounts the shared
		// FeedbackBox from its own title / garage / race / results menus.
		const greenline = read('src/routes/greenline/+page.svelte');
		expect(greenline).toContain('<FeedbackBox');
		expect((greenline.match(/onFeedback=\{/g) ?? []).length).toBeGreaterThanOrEqual(4);
	});

	it('print takes it off the page', () => {
		const css = read('src/lib/feedback/SiteFeedback.svelte');
		expect(css).toMatch(/@media print \{\s*\.sfb \{\s*display: none/);
	});
});

// ---------------------------------------------------------------------------
// 3. SIGNED-IN ONLY, AND ABSENCE IS THE MECHANISM
// ---------------------------------------------------------------------------

describe('no transport, no control', () => {
	it('renders nothing without a writer, and the control with one', () => {
		expect(triggers({ submit: null })).toBe(0);
		expect(triggers({})).toBe(1);
		expect(triggers({ place: 'relocated', submit: null })).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 4. CONTEXT IS CAPTURED, NOT TYPED
// ---------------------------------------------------------------------------

describe('what a report carries', () => {
	it('captures the route, path, role, section, viewport and time', () => {
		const meta = captureMeta({
			routeId: '/classroom/[sectionId]/item/[itemId]',
			pathname: '/classroom/s-1/item/i-9',
			role: 'student',
			sectionId: 's-1',
			viewport: { w: 1440, h: 900 },
			at: '2026-08-21T14:05:00.000Z',
			build: BUILD
		});
		expect(meta.route).toBe('/classroom/[sectionId]/item/[itemId]');
		expect(meta.path).toBe('/classroom/s-1/item/i-9');
		expect(meta.role).toBe('student');
		expect(meta.section).toBe('s-1');
		expect(meta.viewport).toBe('1440x900');
		expect(meta.at).toBe('2026-08-21T14:05:00.000Z');
		// Nothing here came from a field somebody had to fill in.
		expect(meta.status).toBeUndefined();
		expect(meta.error).toBeUndefined();
	});

	it('carries the status, the message and the correlation id from an error page', () => {
		const meta = captureMeta({
			routeId: '/notebook',
			pathname: '/notebook',
			role: 'teacher',
			at: '2026-08-21T14:05:00.000Z',
			build: BUILD,
			status: 500,
			errorMessage: 'Something went wrong on our side.',
			errorId: 'f0e1d2c3-0000-4000-8000-000000000000'
		});
		expect(meta.status).toBe(500);
		expect(meta.error).toBe('Something went wrong on our side.');
		expect(meta.errorId).toBe('f0e1d2c3-0000-4000-8000-000000000000');
	});

	it('names the surface by route id, which is stable across parameters', () => {
		expect(contextOf({ routeId: '/notebook/review', pathname: '/notebook/review' })).toBe(
			'/notebook/review'
		);
		// A route id is not always available (an unmatched path); the path is the
		// fallback, never an empty string.
		expect(contextOf({ routeId: null, pathname: '/whatever' })).toBe('/whatever');
	});

	it('discriminates the app from the route without a second path map', () => {
		expect(appForRouteId('/notebook/review')).toBe('notebook');
		expect(appForRouteId('/coin-desk/students')).toBe('coins');
		expect(appForRouteId('/fsp-pulse')).toBe('fsp');
		expect(appForRouteId('/')).toBe('portal');
		expect(appForRouteId(null, '/tournaments/x')).toBe('tournaments');
	});
});

describe('the build identifier is labelled as what it is', () => {
	it('reports a git commit as a commit, and says it names the input', () => {
		const stamp = describeBuild({ sha: 'deadbee', complete: true }, '1755735000000');
		expect(stamp.source).toBe('git-commit');
		expect(stamp.value).toBe('deadbee');
		expect(stamp.means).toBe(BUILD_MEANS['git-commit']);
		expect(stamp.complete).toBe(true);
	});

	it("falls back to SvelteKit's build id and says that is a timestamp", () => {
		const stamp = describeBuild(null, '1755735000000');
		expect(stamp.source).toBe('build-id');
		expect(stamp.value).toBe('1755735000000');
		expect(stamp.means).toBe(BUILD_MEANS['build-id']);
	});

	it("does not dress up deriveDeploy's 'dev' placeholder as a commit", () => {
		// 'dev' is what the version substrate emits when there was no history at
		// all. Presenting it as the commit this build came from is exactly the
		// plausible-value-as-more-than-it-is problem.
		expect(describeBuild({ sha: 'dev' }, 'x').source).toBe('build-id');
		expect(describeBuild({ sha: 'dev' }, null).source).toBe('none');
	});

	it('never puts a value on a row without what it means', () => {
		for (const stamp of [
			describeBuild({ sha: 'deadbee', complete: false }, null),
			describeBuild(null, '1755735000000'),
			describeBuild(null, null)
		]) {
			const meta = captureMeta({
				routeId: '/',
				pathname: '/',
				role: null,
				at: '2026-08-21T00:00:00.000Z',
				build: stamp
			});
			const build = meta.build as Record<string, unknown>;
			expect(typeof build.means).toBe('string');
			expect((build.means as string).length).toBeGreaterThan(20);
			expect(build.source).toBe(stamp.source);
		}
		// The three descriptions are genuinely different sentences: a shared one
		// would make "which identifier is this" unanswerable from the row.
		expect(new Set(Object.values(BUILD_MEANS)).size).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// 5. ONE VOCABULARY: A REFUSAL IS NOT A RETRY
// ---------------------------------------------------------------------------

describe('the box speaks the shared save vocabulary', () => {
	it('treats a coded PostgREST error as a refusal and a codeless one as retryable', () => {
		// A code means the database considered the row and said no.
		expect(feedbackRetryable('23514')).toBe(false);
		expect(feedbackRetryable('42501')).toBe(false);
		expect(feedbackRetryable('PGRST204')).toBe(false);
		// No code means nothing on the far side ever answered.
		expect(feedbackRetryable('')).toBe(true);
		expect(feedbackRetryable(null)).toBe(true);
		expect(feedbackRetryable(undefined)).toBe(true);
	});

	it('runs on the shared SaveState in one-shot mode, not a private one', () => {
		const box = read('src/lib/feedback/FeedbackBox.svelte');
		expect(box).toContain("import { SaveState } from '$lib/save-state.svelte'");
		expect(box).toContain("import SaveIndicator from '$lib/SaveIndicator.svelte'");
		expect(box).toContain('autosave: false');
		// The retryable flag has to reach the machine, or backoff and refusal
		// collapse back into one outcome.
		expect(box).toContain('retryable: res.retryable');
		// No private vocabulary for the same five states.
		expect(box).not.toMatch(/\bsending\b\s*=\s*\$state/);
	});

	it('is per instance: no shell banner speaks for a surface it does not own', () => {
		const layout = read('src/routes/+layout.svelte');
		expect(layout).not.toContain('SaveIndicator');
	});
});

// ---------------------------------------------------------------------------
// 6. THE ERROR BOUNDARY
// ---------------------------------------------------------------------------

describe('the first error boundary', () => {
	it('exists at the root, in the app chrome, carrying the affordance', () => {
		const err = read('src/routes/+error.svelte');
		expect(err).toContain('AnimatedLogo');
		expect(err).toContain('VersionBadge');
		expect(err).toContain('place="relocated"');
		// The status and the route are already filled in: the person answers what
		// they were doing, not where they were.
		expect(err).toContain('status={page.status}');
		expect(err).toContain('routeId={page.route.id}');
		expect(err).toContain('pathname={page.url.pathname}');
		expect(err).toContain('{errorId}');
	});

	it('records enough server-side to correlate a log line with a report', () => {
		const hooks = read('src/hooks.server.ts');
		expect(hooks).toContain('export const handleError');
		expect(hooks).toContain('crypto.randomUUID()');
		// The id must reach the page, or there is nothing to correlate ON.
		expect(hooks).toMatch(/return \{[^}]*id[^}]*\}/s);
		// An internal error's own text is never handed back to the caller.
		expect(hooks).toContain("status === 500 ? 'Something went wrong on our side.'");
		const appd = read('src/app.d.ts');
		expect(appd).toMatch(/interface Error \{[^}]*id\?: string/s);
	});

	it('has a route that really fails, so the boundary can be driven', () => {
		const boom = read('src/routes/dev/feedback/boom/+page.ts');
		expect(boom).toContain("if (!dev) error(404, 'Not found')");
		expect(boom).toContain('error(500');
		expect(boom).toContain('throw new Error');
	});
});

// ---------------------------------------------------------------------------
// 7. THE CONSOLE: FILTER FIRST, EXPORT SECOND
// ---------------------------------------------------------------------------

function row(over: Partial<FeedbackRow> & { id: string }): FeedbackRow {
	return {
		app: 'portal',
		context: '/notebook',
		kind: 'bug',
		message: `note ${over.id}`,
		meta: {},
		status: 'new',
		created_at: '2026-08-10T12:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'A Student',
		submitter_email: 'a@boscotech.net',
		...over
	} as FeedbackRow;
}

/**
 * Six rows, written out so the expected membership of every filter below can be
 * read off them by eye rather than recomputed with the rule under test.
 */
const ROWS: FeedbackRow[] = [
	row({
		id: 'r1',
		meta: { route: '/notebook', path: '/notebook', role: 'student', section: 's-1' },
		created_at: '2026-08-10T12:00:00.000Z'
	}),
	row({
		id: 'r2',
		meta: { route: '/notebook/review', path: '/notebook/review', role: 'teacher', section: 's-1' },
		created_at: '2026-08-11T12:00:00.000Z',
		status: 'seen'
	}),
	row({
		id: 'r3',
		meta: { route: '/classroom/[sectionId]', path: '/classroom/s-2', role: 'student', section: 's-2' },
		created_at: '2026-08-12T12:00:00.000Z'
	}),
	row({
		id: 'r4',
		meta: { route: '/greenline', path: '/greenline', role: 'student' },
		created_at: '2026-08-13T12:00:00.000Z',
		status: 'resolved'
	}),
	row({
		id: 'r5',
		// An older row filed before the shell mount: no meta at all, so the
		// console has to fall back to the `context` column rather than hide it.
		meta: {},
		context: '/coin-desk',
		created_at: '2026-08-14T12:00:00.000Z'
	}),
	row({
		id: 'r6',
		meta: {
			route: '/notebook',
			path: '/notebook',
			role: 'teacher',
			section: 's-3',
			status: 500,
			errorId: 'abc'
		},
		created_at: '2026-08-15T12:00:00.000Z'
	})
];

const ids = (rows: FeedbackRow[]) => rows.map((r) => r.id);
const filter = (over: Partial<FeedbackFilter>): FeedbackFilter => ({
	...EMPTY_FEEDBACK_FILTER,
	...over
});

describe('the console filters on every facet', () => {
	it('reads the route off meta, and falls back to context for an older row', () => {
		expect(rowRoute(ROWS[0])).toBe('/notebook');
		expect(rowRoute(ROWS[4])).toBe('/coin-desk');
		expect(rowRole(ROWS[4])).toBeNull();
		expect(rowSection(ROWS[2])).toBe('s-2');
		expect(rowDay(ROWS[0])).toMatch(/^2026-08-\d\d$/);
	});

	it('filters by route substring', () => {
		expect(ids(filterFeedback(ROWS, filter({ route: 'notebook' })))).toEqual(['r1', 'r2', 'r6']);
		expect(ids(filterFeedback(ROWS, filter({ route: 'coin' })))).toEqual(['r5']);
	});

	it('filters by role, section and status', () => {
		expect(ids(filterFeedback(ROWS, filter({ role: 'teacher' })))).toEqual(['r2', 'r6']);
		expect(ids(filterFeedback(ROWS, filter({ section: 's-1' })))).toEqual(['r1', 'r2']);
		expect(ids(filterFeedback(ROWS, filter({ status: 'resolved' })))).toEqual(['r4']);
		// Positive control for the three above: the same call with no facet set
		// returns everything, so an empty result can never be the filter being
		// broken rather than the facet biting.
		expect(ids(filterFeedback(ROWS, filter({})))).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
	});

	it('filters by an inclusive date range', () => {
		const day = (r: FeedbackRow) => rowDay(r);
		// Bounds are read from the fixture's OWN rendered days, so the assertion
		// does not turn on the machine's timezone.
		expect(ids(filterFeedback(ROWS, filter({ from: day(ROWS[2]), to: day(ROWS[3]) })))).toEqual([
			'r3',
			'r4'
		]);
		expect(ids(filterFeedback(ROWS, filter({ from: day(ROWS[5]) })))).toEqual(['r6']);
	});

	it('combines facets', () => {
		expect(ids(filterFeedback(ROWS, filter({ route: 'notebook', role: 'teacher' })))).toEqual([
			'r2',
			'r6'
		]);
		expect(
			ids(filterFeedback(ROWS, filter({ route: 'notebook', role: 'teacher', section: 's-1' })))
		).toEqual(['r2']);
	});

	it('offers only the facet values actually present', () => {
		expect(facetValues(ROWS, rowRole)).toEqual(['student', 'teacher']);
		expect(facetValues(ROWS, rowSection)).toEqual(['s-1', 's-2', 's-3']);
	});

	it('honours the optimistic status a click has already applied', () => {
		const moved = (r: FeedbackRow) => (r.id === 'r1' ? 'seen' : r.status);
		expect(ids(filterFeedback(ROWS, filter({ status: 'new' }), moved))).toEqual(['r3', 'r5', 'r6']);
		expect(ids(filterFeedback(ROWS, filter({ status: 'seen' }), moved))).toEqual(['r1', 'r2']);
	});
});

describe('export takes the filtered set, and says what it left out', () => {
	const narrowed = filterFeedback(ROWS, filter({ route: 'notebook', role: 'teacher' }));

	it('exports only what the filter admitted', () => {
		expect(ids(narrowed)).toEqual(['r2', 'r6']);
		const md = feedbackMarkdown(narrowed, { filter: filter({ route: 'notebook', role: 'teacher' }) });
		expect(md.included).toBe(2);
		expect(md.dropped).toBe(0);
		expect(md.text).toContain('note r2');
		expect(md.text).toContain('note r6');
		// The rows the filter excluded are not in the bundle. Paired with the two
		// above, so a bundle that was empty for an unrelated reason fails.
		expect(md.text).not.toContain('note r1');
		expect(md.text).not.toContain('note r4');
	});

	it('says what the filter was, so a pasted bundle describes itself', () => {
		const f = filter({ route: 'notebook', role: 'teacher', status: 'new', from: '2026-08-01' });
		const md = feedbackMarkdown(ROWS, { filter: f, generatedAt: '2026-08-21T00:00:00.000Z' });
		expect(md.text).toContain('route contains "notebook"');
		expect(md.text).toContain('role: teacher');
		expect(md.text).toContain('from 2026-08-01');
		expect(md.text).toContain('2026-08-21T00:00:00.000Z');
	});

	it('carries the captured context, including the build and what it means', () => {
		const md = feedbackMarkdown([ROWS[5]]);
		expect(md.text).toContain('role: teacher');
		expect(md.text).toContain('section: s-3');
		expect(md.text).toContain('http status: 500');
		expect(md.text).toContain('error id: abc');
	});

	it('truncates a bundle to stay pasteable, and NAMES what it dropped', () => {
		// NO SILENT CAPS. A bundle that quietly stops after N reads as "that is
		// all of them", which is the reading that gets acted on.
		const many = Array.from({ length: 40 }, (_, i) =>
			row({ id: `m${i}`, message: 'x'.repeat(400) })
		);
		const md = feedbackMarkdown(many, { budget: 4000 });
		expect(md.included).toBeGreaterThan(0);
		expect(md.included).toBeLessThan(40);
		expect(md.dropped).toBe(40 - md.included);
		expect(md.text).toContain(`${md.dropped} more report`);
		expect(md.text.length).toBeLessThanOrEqual(4000);
	});

	it('is wired to the FILTERED set in the console, not the whole load', () => {
		// The ordering is the feature, and it lives in the component: `visible` is
		// the filtered derivation, `rows` is the semester. Handing `rows` to the
		// exporters would pass every unit test above and still ship the defect.
		const src = read('src/lib/classroom/FeedbackConsole.svelte');
		expect(src).toMatch(/feedbackMarkdown\(visible,/);
		expect(src).toMatch(/feedbackJson\(visible,/);
		expect(src).not.toMatch(/feedback(Markdown|Json)\(rows,/);
	});

	it('exports the same filtered set as JSON, verbatim', () => {
		const parsed = JSON.parse(feedbackJson(narrowed, { generatedAt: 'stamp' }));
		expect(parsed.count).toBe(2);
		expect(parsed.reports.map((r: FeedbackRow) => r.id)).toEqual(['r2', 'r6']);
		// Verbatim: nothing summarised away, so the JSON can answer a question the
		// markdown was not shaped for.
		expect(parsed.reports[1].meta.errorId).toBe('abc');
	});
});

describe('the console controls clear the tap-target floor', () => {
	it('puts every interactive control in one 44px rule', () => {
		const src = read('src/lib/classroom/FeedbackConsole.svelte');
		expect(src).toMatch(/\.fbc-control \{\s*min-height: 44px;\s*min-width: 44px;\s*\}/);
		// The status buttons measured 22.9px because they were `.btn.secondary
		// .tiny`. Nothing in this console may carry that class again.
		expect(src).not.toContain('tiny');
		// Every control on the page is in the set: one compliant control beside a
		// non-compliant one reads as a broken row.
		const controls = src.match(/<(button|input|select)\b[^>]*/g) ?? [];
		expect(controls.length).toBeGreaterThan(8);
		for (const tag of controls) expect(tag).toContain('fbc-control');
	});
});
