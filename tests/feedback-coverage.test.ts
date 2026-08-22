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
	summarizeUserAgent,
	type BuildStamp,
	type FeedbackExclusionId
} from '../src/lib/feedback/context';
import {
	feedbackIsAnonymous,
	feedbackRetryable,
	feedbackWriter,
	type FeedbackRow
} from '../src/lib/feedback/feedback';
import {
	EMPTY_FEEDBACK_FILTER,
	FEEDBACK_GROUPING_THRESHOLD,
	facetValues,
	feedbackJson,
	feedbackMarkdown,
	filterFeedback,
	groupFeedbackByRoute,
	rowContact,
	rowDay,
	rowDistinctPath,
	rowIsAnonymous,
	rowRole,
	rowRoute,
	rowSection,
	type FeedbackFilter
} from '../src/lib/feedback/console';
import { SECTIONS } from '../src/lib/curriculum';

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
			'submit=',
			// WHICH KIND OF REPORT THIS WILL BE. It is what decides whether the
			// box offers a way to be reached and what the note tells the person
			// about their own report, so a mount that stopped passing it would
			// quietly start telling signed-out visitors their role was attached.
			'anonymous='
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
// 3. ABSENCE IS THE MECHANISM -- BUT BEING SIGNED OUT IS NO LONGER AN ABSENCE
// ---------------------------------------------------------------------------

describe('no transport, no control', () => {
	it('renders nothing without a writer, and the control with one', () => {
		expect(triggers({ submit: null })).toBe(0);
		expect(triggers({})).toBe(1);
		expect(triggers({ place: 'relocated', submit: null })).toBe(0);
	});
});

describe('a signed-out visitor gets the control, which is the point of the bundle', () => {
	/**
	 * THE FAILURE THIS REPLACES. `feedbackWriter` answered null with no session,
	 * so the affordance vanished on exactly the page where a broken sign-in
	 * would be reported from. It is asserted through the REAL writer rather than
	 * by rendering with a hand-made transport, because the null was the writer's
	 * doing and a test that hands in its own function cannot see it.
	 */
	it('hands a writer to a caller with no session, and still allows none', () => {
		const client = {} as never;
		expect(feedbackWriter(client, null)).not.toBeNull();
		expect(feedbackWriter(client, undefined)).not.toBeNull();
		// No client either: the error boundary's case, where a LAYOUT load failed
		// and page.data carries nothing at all.
		expect(feedbackWriter(null, null)).not.toBeNull();
		// A surface with nothing to offer can still say so.
		expect(feedbackWriter(null, null, { allowAnonymous: false })).toBeNull();
		// POSITIVE CONTROL: a signed-in caller is a DIFFERENT writer, not the
		// same one -- the two paths do not converge.
		expect(feedbackWriter(client, 'u-1')).not.toBe(feedbackWriter(client, null));
	});

	it('answers one question about anonymity, in one place', () => {
		const client = {} as never;
		expect(feedbackIsAnonymous(client, 'u-1')).toBe(false);
		expect(feedbackIsAnonymous(client, null)).toBe(true);
		// A claim with no client to write through is a report that goes out
		// anonymously, and the box has to say so.
		expect(feedbackIsAnonymous(null, 'u-1')).toBe(true);
		expect(feedbackIsAnonymous(null, null)).toBe(true);
	});

	it('offers a way to be reached ONLY when there is no account behind it', () => {
		const anon = render(SiteFeedback, {
			props: {
				routeId: '/',
				pathname: '/',
				build: BUILD,
				submit: async () => ({ error: null, retryable: false }),
				anonymous: true
			}
		}).body;
		const signedIn = render(SiteFeedback, {
			props: {
				routeId: '/',
				pathname: '/',
				build: BUILD,
				submit: async () => ({ error: null, retryable: false }),
				anonymous: false
			}
		}).body;
		// The box is closed until the trigger is pressed, so what is asserted
		// here is the SOURCE wiring plus the note both renders would carry.
		expect(triggers({ anonymous: true })).toBe(1);
		expect(anon.length).toBeGreaterThan(0);
		expect(signedIn.length).toBeGreaterThan(0);

		const site = read('src/lib/feedback/SiteFeedback.svelte');
		expect(site).toContain('askContact={anonymous}');
		const box = read('src/lib/feedback/FeedbackBox.svelte');
		// ABSENCE IS THE MECHANISM one level in: no field, and no `contact` on
		// the entry at all.
		expect(box).toContain('{#if askContact}');
		expect(box).toContain('...(askContact ? { contact } : {})');
		// PLAINLY OPTIONAL, in the label rather than only in a placeholder.
		expect(box).toContain('(optional)');
		expect(box).toContain('Leave it empty and the report is still read.');
	});

	it('tells a signed-out reporter their report carries no name', () => {
		const site = read('src/lib/feedback/SiteFeedback.svelte');
		expect(site).toContain('You are not signed in, so this report carries no name.');
		// And the signed-in note still says what a signed-in report attaches, so
		// the two are not one string with a word swapped.
		expect(site).toContain('your role, your browser and the build are attached automatically');
	});

	it('no longer tells the error boundary to go and sign in', () => {
		// THE REJECTED SENTENCE. This page renders when a load has already
		// failed; sending the person away to sign in and come back was the one
		// thing it could not usefully ask for.
		const err = read('src/routes/+error.svelte');
		expect(err).not.toContain('We are not taking');
		expect(err).not.toContain('Sign in from the portal home page to send a report');
		expect(err).toContain('feedbackWriter(page.data.supabase, page.data.claims?.sub)');
		expect(err).toContain('{anonymous}');
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
		// The correlation id moved OUT of the fact list and onto its own line at
		// the top of the entry; assert the RULE (it is present, above the facts)
		// rather than the bullet it used to be.
		expect(md.text).toContain('abc');
		expect(md.text.indexOf('abc')).toBeLessThan(md.text.indexOf('- app:'));
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

// ---------------------------------------------------------------------------
// 8. WHAT LEAVES IN AN EXPORT
// ---------------------------------------------------------------------------

/**
 * THE EXPORT REFINEMENTS, EACH ASSERTED ON A FIXTURE THAT SHOWS THE DIFFERENCE.
 *
 * These are all quiet failures. A path printed beside an identical route id is
 * noise nobody files a bug about; a grouped bundle that never groups reads as a
 * small queue; a section id shown raw reads as a course; a multi-line message
 * that reparents the reports after it produces a bundle that is WRONG while
 * looking completely ordinary; and an identity toggle that does nothing hands
 * student names to a chat window with the box unticked.
 *
 * WHERE THE EXPECTED VALUES COME FROM. The section fixture uses a REAL id out
 * of `curriculum.ts` and the expectation is read off that registry entry, not
 * recomputed with the resolver. The user agent strings are real ones. The
 * grouping expectations are counted off the fixture by eye. Every absence
 * assertion is paired with a positive control on the same bundle.
 */

/** A real registry entry, so the expected course and period are read off it. */
const REAL_SECTION = SECTIONS.find((s) => s.id === 'eng1h-junior');

const UA_CHROME_WIN =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_SAFARI_IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const BUILD_META = {
	value: 'a1b2c3d',
	source: 'git-commit',
	means: BUILD_MEANS['git-commit'],
	historyComplete: true
};

/** One report, on a route whose path is the same string as its route id. */
const ONE: FeedbackRow[] = [
	row({
		id: 'one',
		app: 'notebook',
		message: 'The photo grid stops halfway down.',
		meta: {
			route: '/notebook',
			path: '/notebook',
			role: 'student',
			section: 'eng1h-junior',
			viewport: '1512x852',
			userAgent: UA_CHROME_WIN,
			build: BUILD_META
		}
	})
];

/**
 * Six reports over three routes: /notebook x3, /classroom/[sectionId] x2,
 * /coin-desk x1. Counted off this list by eye, which is what the grouping
 * assertions below compare against.
 */
const SIX: FeedbackRow[] = [
	row({ id: 'g1', meta: { route: '/notebook', path: '/notebook' } }),
	row({
		id: 'g2',
		meta: { route: '/classroom/[sectionId]', path: '/classroom/eng1h-junior' }
	}),
	row({ id: 'g3', meta: { route: '/notebook', path: '/notebook' } }),
	row({ id: 'g4', meta: { route: '/coin-desk', path: '/coin-desk' } }),
	row({
		id: 'g5',
		meta: { route: '/classroom/[sectionId]', path: '/classroom/intro-100-1' }
	}),
	row({ id: 'g6', meta: { route: '/notebook', path: '/notebook' } })
];

const MULTILINE = [
	'### Not a heading, it is what I typed',
	'',
	'Then the page did this:',
	'---',
	'> quoted from the error box',
	'- a bullet I actually meant',
	'# and a hash line'
].join('\n');

describe('the markdown export says where a report came from', () => {
	it('is a well-formed empty bundle when nothing matched', () => {
		const md = feedbackMarkdown([], { generatedAt: '2026-08-21T00:00:00.000Z' });
		expect(md.included).toBe(0);
		expect(md.dropped).toBe(0);
		expect(md.grouped).toBe(false);
		expect(md.text).toContain('# IDEA feedback');
		expect(md.text).toContain('Reports: 0');
		// Nothing invented to fill the space: no entry heading, no group heading.
		expect(md.text).not.toContain('### ');
		expect(md.text).not.toContain('## /');
		// Positive control for the two absences: the same call over ONE report
		// does produce an entry heading, so "no headings" cannot be the renderer
		// being broken for every input.
		expect(feedbackMarkdown(ONE).text).toContain('### 1. ');
	});

	it('carries the app, the route id, and the path only when it differs', () => {
		const md = feedbackMarkdown(ONE);
		expect(md.text).toContain('- app: notebook');
		expect(md.text).toContain('at /notebook');
		// Route id and path are the same string here, so the path line is noise.
		expect(md.text).not.toContain('- path:');
		// PAIRED POSITIVE CONTROL, same field, same renderer: a parameterised
		// route whose path resolves to something else DOES print it.
		const parameterised = feedbackMarkdown([
			row({
				id: 'p1',
				meta: { route: '/classroom/[sectionId]', path: '/classroom/eng1h-junior' }
			})
		]);
		expect(parameterised.text).toContain('- path: /classroom/eng1h-junior');

		// ONE RULE, TWO READERS. The queue's own row list asks the same helper,
		// so the export and the screen cannot start giving different answers to
		// "is this path worth showing".
		expect(rowDistinctPath(ONE[0])).toBeNull();
		expect(rowDistinctPath(SIX[1])).toBe('/classroom/eng1h-junior');
		const src = read('src/lib/classroom/FeedbackConsole.svelte');
		expect(src).toContain('rowDistinctPath(row)');
		expect(src).not.toMatch(/\{#if rowPath\(row\)\}/);
	});

	it('summarises the browser in markdown and keeps the full string in JSON', () => {
		const md = feedbackMarkdown(ONE);
		expect(md.text).toContain('- browser: Chrome 126 on Windows');
		// The bundle carries the summary and NOT the 100-character string, which
		// is the whole point of summarising it.
		expect(md.text).not.toContain('AppleWebKit');

		const parsed = JSON.parse(feedbackJson(ONE));
		expect(parsed.reports[0].meta.userAgent).toBe(UA_CHROME_WIN);
	});

	it('resolves a section id to its course and period, and says when it cannot', () => {
		// Expected values read off the registry entry, never recomputed here.
		expect(REAL_SECTION).toBeTruthy();
		const md = feedbackMarkdown(ONE);
		expect(md.text).toContain(`- section: ${REAL_SECTION?.course}, period ${REAL_SECTION?.term}`);
		// The raw id survives beside the resolution, so the stored value is still
		// greppable against the database.
		expect(md.text).toContain('(eng1h-junior)');

		const unresolvable = feedbackMarkdown([
			row({ id: 'u1', meta: { route: '/notebook', section: 'period-9-woodshop' } })
		]);
		expect(unresolvable.text).toContain('- section: period-9-woodshop (unresolved:');
		// NAMED, NOT SILENT: the raw id alone would read as a resolved answer.
		expect(unresolvable.text).toContain('not a known section id');
	});

	it('gives the error correlation id its own line at the top of the entry', () => {
		const md = feedbackMarkdown([
			row({
				id: 'e1',
				message: 'It went white.',
				meta: { route: '/notebook', status: 500, errorId: 'cid-7f3a' }
			})
		]);
		const lines = md.text.split('\n');
		const heading = lines.findIndex((l) => l.startsWith('### '));
		const idLine = lines.findIndex((l) => l.includes('cid-7f3a'));
		const firstFact = lines.findIndex((l) => l.startsWith('- '));
		expect(heading).toBeGreaterThanOrEqual(0);
		expect(firstFact).toBeGreaterThan(heading);
		// ABOVE THE FACT LIST, not inside it. The ordering IS the claim.
		expect(idLine).toBeGreaterThan(heading);
		expect(idLine).toBeLessThan(firstFact);
		expect(lines[idLine]).toContain('server log');
		// It is not also repeated as a bullet.
		expect(md.text).not.toContain('- error id:');
	});

	it('states what a build identifier means once in the header, not per report', () => {
		const many = SIX.map((r, i) =>
			row({ ...r, id: `b${i}`, meta: { ...(r.meta ?? {}), build: BUILD_META } })
		);
		const md = feedbackMarkdown(many);
		const meansCount = md.text.split(BUILD_MEANS['git-commit']).length - 1;
		expect(meansCount).toBe(1);
		// And the header is where the one copy is: it appears before any entry.
		expect(md.text.indexOf(BUILD_MEANS['git-commit'])).toBeLessThan(md.text.indexOf('### 1.'));
		// The per-report line still carries the VALUE and WHICH KIND it is, six
		// times, so dropping the paragraph did not drop the provenance.
		expect(md.text.split('- build: a1b2c3d (git-commit)').length - 1).toBe(6);
	});

	it('groups by route above the threshold and lists flat at or below it', () => {
		// SIX rows, three routes, counted off the fixture: 3 / 2 / 1.
		const grouped = feedbackMarkdown(SIX);
		expect(SIX.length).toBe(6);
		expect(grouped.grouped).toBe(true);
		expect(grouped.text).toContain('## /notebook (3 reports)');
		expect(grouped.text).toContain('## /classroom/[sectionId] (2 reports)');
		expect(grouped.text).toContain('## /coin-desk (1 report)');
		// Ordered by count descending.
		expect(grouped.text.indexOf('## /notebook')).toBeLessThan(
			grouped.text.indexOf('## /classroom/[sectionId]')
		);
		expect(grouped.text.indexOf('## /classroom/[sectionId]')).toBeLessThan(
			grouped.text.indexOf('## /coin-desk')
		);
		// Every report still present, once each.
		for (const r of SIX) expect(grouped.text).toContain(`note ${r.id}`);

		// THE THRESHOLD, ASSERTED BOTH WAYS on the same fixture minus one row: a
		// grouping rule that always grouped, or never did, passes a one-sided
		// test and fails exactly one of these.
		const five = SIX.slice(0, 5);
		expect(five.length).toBe(FEEDBACK_GROUPING_THRESHOLD);
		const flat = feedbackMarkdown(five);
		expect(flat.grouped).toBe(false);
		expect(flat.text).not.toContain('## /');
		expect(flat.text).not.toContain(' reports)');
		// Positive control on the same five rows: they ARE in the bundle, so the
		// two absences above are the grouping being off and not an empty file.
		for (const r of five) expect(flat.text).toContain(`note ${r.id}`);
		expect(flat.included).toBe(5);
	});

	it('buckets and orders groups deterministically', () => {
		const groups = groupFeedbackByRoute(SIX);
		expect(groups.map((g) => [g.route, g.rows.length])).toEqual([
			['/notebook', 3],
			['/classroom/[sectionId]', 2],
			['/coin-desk', 1]
		]);
	});

	it('orders by COUNT, not by which route was seen first', () => {
		// SIX happens to arrive largest-group-first, so it cannot tell a real
		// ordering from no ordering at all: a bucketer that simply kept insertion
		// order passes the case above. This fixture arrives smallest first.
		const smallestFirst = [
			row({ id: 'o1', meta: { route: '/coin-desk' } }),
			row({ id: 'o2', meta: { route: '/notebook' } }),
			row({ id: 'o3', meta: { route: '/notebook' } })
		];
		expect(groupFeedbackByRoute(smallestFirst).map((g) => g.route)).toEqual([
			'/notebook',
			'/coin-desk'
		]);
		// The rendered bundle agrees with the bucketer, so the ordering is not
		// something only the helper does.
		const md = feedbackMarkdown([...smallestFirst, ...smallestFirst.map((r, i) =>
			row({ ...r, id: `o${4 + i}` })
		)]);
		expect(md.grouped).toBe(true);
		expect(md.text.indexOf('## /notebook')).toBeLessThan(md.text.indexOf('## /coin-desk'));
	});

	it('breaks a tie on route id, so two exports of one set match', () => {
		const tied = [
			row({ id: 'z1', meta: { route: '/zeta' } }),
			row({ id: 'a1', meta: { route: '/alpha' } })
		];
		expect(groupFeedbackByRoute(tied).map((g) => g.route)).toEqual(['/alpha', '/zeta']);
	});

	it('keeps a multi-line message from breaking the bundle structure', () => {
		const rows = [
			row({ id: 'm1', message: MULTILINE, meta: { route: '/notebook' } }),
			row({ id: 'm2', message: 'The one after it.', meta: { route: '/notebook' } })
		];
		const md = feedbackMarkdown(rows);
		const lines = md.text.split('\n');

		// EVERY line of the message is inside the blockquote, so none of them can
		// be a document-level block that closes the entry it sits in.
		for (const raw of MULTILINE.split('\n')) {
			const trimmed = raw.trim();
			if (!trimmed) continue;
			const carried = lines.find((l) => l.startsWith('> ') && l.includes(trimmed.replace(/^[#>]/, '')));
			expect(carried, `message line not quoted: ${raw}`).toBeTruthy();
		}
		// The structure is intact: exactly two entries, and the second one's
		// heading still exists. A message that reparented the rest of the file is
		// exactly the failure that leaves this at one.
		expect(lines.filter((l) => l.startsWith('### ')).length).toBe(2);
		expect(md.text).toContain('### 2. bug at /notebook');
		// No line of the message survived at column 0 as markdown structure.
		expect(lines.some((l) => l === '### Not a heading, it is what I typed')).toBe(false);
		expect(lines.some((l) => l === '---')).toBe(false);
		expect(lines.some((l) => l === '# and a hash line')).toBe(false);

		// A RULE OF DASHES IS ESCAPED INSIDE THE QUOTE TOO. Left bare it is a
		// setext underline, which silently promotes the sentence above it to a
		// heading: the message still renders, saying something different.
		expect(md.text).toContain('> \\---');
		expect(md.text).not.toContain('> ---');
		// PAIRED CONTROL, same escaping pass: a real bullet keeps its dash,
		// because a line with words after the dash is a list the person typed.
		expect(md.text).toContain('> - a bullet I actually meant');
		// Positive control: the words are all still there, so "no structure" is
		// not "no message".
		expect(md.text).toContain('Not a heading, it is what I typed');
		expect(md.text).toContain('and a hash line');
	});

	it('summarises a second real user agent, and says so when it recognises none', () => {
		// MAJOR VERSION ONLY, uniformly: Chrome reports 126.0.0.0 and Safari 17.5,
		// and a summary that carried whatever precision each vendor happened to
		// print would not be comparable across two rows. The full string is on the
		// row for the question that needs the minor.
		expect(summarizeUserAgent(UA_SAFARI_IPHONE)).toBe('Safari 17 on iPhone');
		expect(summarizeUserAgent(UA_CHROME_WIN)).toBe('Chrome 126 on Windows');
		expect(summarizeUserAgent('SomeCrawler/1.0')).toBe('unrecognised browser');
		expect(summarizeUserAgent('')).toBeNull();
		expect(summarizeUserAgent(null)).toBeNull();
	});

	it('captures the user agent at file time, beside the viewport', () => {
		const meta = captureMeta({
			routeId: '/notebook',
			pathname: '/notebook',
			role: 'student',
			viewport: { w: 1512, h: 852 },
			userAgent: UA_CHROME_WIN,
			at: '2026-08-21T00:00:00.000Z',
			build: { value: 'x', source: 'git-commit', means: 'm', complete: true }
		});
		expect(meta.viewport).toBe('1512x852');
		expect(meta.userAgent).toBe(UA_CHROME_WIN);
		// Absent rather than an empty string when the browser gave nothing, so a
		// reader is never shown a blank where a machine should be.
		const none = captureMeta({
			routeId: '/notebook',
			pathname: '/notebook',
			role: null,
			at: '2026-08-21T00:00:00.000Z',
			build: { value: 'x', source: 'git-commit', means: 'm', complete: true }
		});
		expect(none.userAgent).toBeNull();
	});

	it('is captured by the shell, not typed by the person reporting', () => {
		// The component reads navigator itself: a userAgent that has to be passed
		// in from a route is a userAgent that arrives undefined from most of them.
		const src = read('src/lib/feedback/SiteFeedback.svelte');
		expect(src).toContain('navigator.userAgent');
		expect(src).toMatch(/captureMeta\(\{[\s\S]*userAgent,/);
	});
});

describe('submitter identity is a choice made at export', () => {
	const named = [
		row({
			id: 'n1',
			meta: { route: '/notebook' },
			submitter_name: 'Robin Vega',
			submitter_email: 'robin.vega@boscotech.net'
		})
	];

	it('includes the submitter by default, in both exports', () => {
		const md = feedbackMarkdown(named);
		expect(md.text).toContain('- from: Robin Vega');
		expect(md.text).toContain('Submitter identity: included.');
		const parsed = JSON.parse(feedbackJson(named));
		expect(parsed.submitterIdentity).toBe('included');
		expect(parsed.reports[0].submitter_name).toBe('Robin Vega');
		expect(parsed.reports[0].submitter_email).toBe('robin.vega@boscotech.net');
	});

	it('withholds it in both exports when the toggle is off, and says it did', () => {
		const md = feedbackMarkdown(named, { includeSubmitter: false });
		// NEITHER SPELLING of the identity, in either export.
		expect(md.text).not.toContain('Robin Vega');
		expect(md.text).not.toContain('robin.vega@boscotech.net');
		expect(md.text).not.toContain('- from:');
		// Stated, so a bundle with no names is not read as a bundle from nobody.
		expect(md.text).toContain('Submitter identity: withheld at export.');
		// Positive control on the SAME bundle: the report itself is still here,
		// so the four absences are the toggle and not an empty export.
		expect(md.text).toContain('note n1');
		expect(md.included).toBe(1);

		const parsed = JSON.parse(feedbackJson(named, { includeSubmitter: false }));
		expect(parsed.submitterIdentity).toBe('withheld');
		expect(parsed.count).toBe(1);
		expect(parsed.reports[0].submitter_name).toBeNull();
		expect(parsed.reports[0].submitter_email).toBeNull();
		// Everything that is NOT identity is untouched.
		expect(parsed.reports[0].id).toBe('n1');
		expect(parsed.reports[0].message).toBe('note n1');
		expect(JSON.stringify(parsed)).not.toContain('robin.vega');
	});

	it('is wired to a real control in the console, defaulting to included', () => {
		const src = read('src/lib/classroom/FeedbackConsole.svelte');
		expect(src).toContain('let includeSubmitter = $state(true);');
		// A visible word, not only a checkbox, and handed to BOTH exporters.
		expect(src).toContain('Include submitter names');
		expect(src).toMatch(/feedbackMarkdown\(visible, \{[^}]*includeSubmitter/);
		expect(src).toMatch(/feedbackJson\(visible, \{[^}]*includeSubmitter/);
	});
});

describe('the JSON export resolves the same things beside the verbatim rows', () => {
	it('lists every section the set mentions, resolved or not', () => {
		const parsed = JSON.parse(
			feedbackJson([
				...ONE,
				row({ id: 'x1', meta: { route: '/notebook', section: 'period-9-woodshop' } })
			])
		);
		expect(parsed.sections.map((s: { id: string }) => s.id)).toEqual([
			'eng1h-junior',
			'period-9-woodshop'
		]);
		const resolved = parsed.sections.find((s: { id: string }) => s.id === 'eng1h-junior');
		expect(resolved.resolved).toBe(true);
		expect(resolved.course).toBe(REAL_SECTION?.course);
		expect(resolved.period).toBe(REAL_SECTION?.term);
		const missing = parsed.sections.find((s: { id: string }) => s.id === 'period-9-woodshop');
		expect(missing.resolved).toBe(false);
		expect(missing.course).toBeNull();
	});

	it('states each build identifier meaning once, beside the rows', () => {
		const parsed = JSON.parse(feedbackJson(ONE));
		expect(parsed.buildIdentifiers).toEqual([
			{ source: 'git-commit', means: BUILD_MEANS['git-commit'] }
		]);
		// The row is still verbatim: the resolution sits NEXT TO it, not in it.
		expect(parsed.reports[0].meta.build.means).toBe(BUILD_MEANS['git-commit']);
	});
});

// ---------------------------------------------------------------------------
// 12. A REPORT WITH NOBODY BEHIND IT, THROUGH THE FILTERS AND BOTH EXPORTS
// ---------------------------------------------------------------------------

describe('an authorless row is an ordinary row everywhere except where it says so', () => {
	const anonWithContact = row({
		id: 'a1',
		message: 'Sign in bounces me back to the home page.',
		meta: { route: '/', path: '/' },
		anonymous: true,
		contact: 'ask me in 4th',
		submitter_name: null,
		submitter_email: null
	});
	const anonBare = row({
		id: 'a2',
		message: 'The QR code goes nowhere.',
		meta: { route: '/', path: '/' },
		anonymous: true,
		contact: null,
		submitter_name: null,
		submitter_email: null
	});
	/** What 0085's list returns for an authorless row: no flag, empty name. */
	const preMigration = row({
		id: 'a3',
		message: 'Filed before 0127 was applied.',
		meta: { route: '/', path: '/' },
		submitter_name: '',
		submitter_email: null
	});
	const signed = row({ id: 's1', meta: { route: '/', path: '/', role: 'student' } });

	it('is read as anonymous from the payload, and from the shape of an older one', () => {
		expect(rowIsAnonymous(anonWithContact)).toBe(true);
		expect(rowIsAnonymous(anonBare)).toBe(true);
		// The fallback: 0085's payload carries neither field, and a deployment
		// sitting between two migrations is a real state here.
		expect(rowIsAnonymous(preMigration)).toBe(true);
		// POSITIVE CONTROL: a signed row is not swept up by either branch.
		expect(rowIsAnonymous(signed)).toBe(false);
		expect(rowContact(anonWithContact)).toBe('ask me in 4th');
		expect(rowContact(anonBare)).toBeNull();
	});

	it('collapses a contact to one line, so it cannot restructure an export', () => {
		const multiline = row({ id: 'a4', anonymous: true, contact: 'text me\n### injected' });
		expect(rowContact(multiline)).toBe('text me ### injected');
	});

	it('passes every filter a signed row passes, and is excluded only by identity facets', () => {
		const all = [anonWithContact, anonBare, signed];
		// Not special-cased out of the default view, the route facet or the dates.
		expect(ids(filterFeedback(all, EMPTY_FEEDBACK_FILTER))).toEqual(['a1', 'a2', 's1']);
		expect(ids(filterFeedback(all, filter({ route: '/' })))).toEqual(['a1', 'a2', 's1']);
		expect(ids(filterFeedback(all, filter({ status: 'new' })))).toEqual(['a1', 'a2', 's1']);
		// A role facet is a question about a signed-in reporter, so choosing one
		// excludes a report that has no role. That is the facet working rather
		// than a row falling out, and the line above is the control that says so.
		expect(ids(filterFeedback(all, filter({ role: 'student' })))).toEqual(['s1']);
	});

	it('says it is anonymous in the markdown export, and carries the contact as unverified', () => {
		const md = feedbackMarkdown([anonWithContact, anonBare]);
		expect(md.included).toBe(2);
		expect(md.text).toContain('from: anonymous, left this way to be reached');
		expect(md.text).toContain('ask me in 4th');
		expect(md.text).toContain('unverified, typed by the reporter');
		// The one with nothing left says so, rather than reading as a row whose
		// field went missing.
		expect(md.text).toContain('from: anonymous, left no way to be reached');
	});

	it('withholds the contact with the names, because it is the only thing that can name them', () => {
		const md = feedbackMarkdown([anonWithContact], { includeSubmitter: false });
		expect(md.text).not.toContain('ask me in 4th');
		expect(md.text).not.toContain('- from:');
		expect(md.text).toContain('no contact string from an anonymous report either');
		// POSITIVE CONTROL on the same bundle: the report is still in it.
		expect(md.text).toContain('Sign in bounces me back');
		expect(md.included).toBe(1);

		const parsed = JSON.parse(feedbackJson([anonWithContact], { includeSubmitter: false }));
		expect(parsed.reports[0].contact).toBeNull();
		// The FACT of anonymity is not identity and is KEPT, so a blanked row is
		// not mistaken for a name that went missing.
		expect(parsed.reports[0].anonymous).toBe(true);
		expect(JSON.stringify(parsed)).not.toContain('ask me in 4th');
	});

	it('keeps the contact verbatim in the JSON export when identity is included', () => {
		const parsed = JSON.parse(feedbackJson([anonWithContact]));
		expect(parsed.submitterIdentity).toBe('included');
		expect(parsed.reports[0].contact).toBe('ask me in 4th');
		expect(parsed.reports[0].anonymous).toBe(true);
	});

	it('is rendered as anonymous by the console, never as a verified identity', () => {
		const src = read('src/lib/classroom/FeedbackConsole.svelte');
		expect(src).toContain('rowIsAnonymous(row)');
		expect(src).toContain('Anonymous');
		expect(src).toContain('typed by the reporter, nothing verified it');
		expect(src).toContain('left no way to be reached');
		// The identity toggle's word covers what it now withholds.
		expect(src).toContain('Include submitter names and contacts');
	});
});
