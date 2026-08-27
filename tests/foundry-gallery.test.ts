// tests/foundry-gallery.test.ts
//
// FOUR THINGS ABOUT THE FOUNDRY READING SURFACES WHOSE REGRESSION IS SILENT.
//
// 1. THE SANDBOX. `allow-scripts` and `allow-same-origin` together let a frame
//    reach into the PARENT document, strip the attribute off its own <iframe>
//    and reload unsandboxed -- but only when the child is same-origin with that
//    parent, which is why the flags are a function of the two origins rather
//    than a constant. Every case here looks EXACTLY the same on screen: a frame
//    that granted the flag when it should not have, and one that withheld it
//    when it should not have, both render the app. There is nothing to see,
//    which is the whole argument for pinning it here.
//
// 2. THE NULL CLASS. `owner_class` is legitimately null (0132) and must render
//    as nothing at all. The failure is a card reading "Ana Reyes ·", or a bare
//    "Class:" label, or an empty chip -- all of which look like data problems
//    rather than rendering ones, so they get reported as "the roster is wrong".
//
// 3. ROLE PARITY. The review queue is the student page plus an inspector,
//    through the same render path. The regression is a second gallery growing
//    beside the first, which is invisible until the two disagree about
//    something months later.
//
// 4. THE REJECTION GATE. A rejection with no note is refused by the database by
//    name (0130), so a console that lets one be sent produces an exception where
//    a sentence belongs.
//
// SSR-ONLY, the tests/home-order-and-accent.test.ts pattern: `svelte/server`'s
// render() mounts the REAL components and hands back markup. Assertions are
// about that markup, which is what a browser actually receives.
//
// EVERY EXPECTED VALUE COMES FROM THE FIXTURES BELOW, never from what the
// component returned.

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';

import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
import FoundryDetail from '$lib/foundry/FoundryDetail.svelte';
import ReviewQueue from '$lib/foundry/ReviewQueue.svelte';
import AppFrame from '$lib/foundry/AppFrame.svelte';
import { queueOrder, reviewBlockedBecause, reviewCanSend, buildFileTree } from '$lib/foundry/review';
import { foundryBundleCsp, foundryPortalOrigin } from '$lib/foundry/bundle-headers';
import { withPageData } from './stubs/app-state.ts';

/*
 * `AppStage` READS THE APPS ORIGIN FROM THE ENVIRONMENT AND RENDERS NO LAUNCH
 * CONTROL WITHOUT IT, on purpose -- falling back to the current origin would
 * serve bundles off the main, cookie-carrying host, silently. So these SSR
 * renders have to supply one or every launch assertion below is really an
 * assertion about an unset variable. The dynamic-env stub reads process.env
 * live, which is what makes this the same read a deployment does.
 */
beforeAll(() => {
	process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = 'https://apps.ideabosco.com';
});
import type { FoundryApp, FoundryAppSummary, FoundryVersion } from '$lib/foundry/transports';

/* --------------------------------------------------------------- fixtures */

const NOW = new Date('2026-08-24T12:00:00Z');

/** The author shapes production actually produces. Named, so an assertion can
    say WHICH one it expects rather than repeating a literal. */
const NAMED_WITH_CLASS = {
	owner_display_name: null,
	owner_full_name: 'Ana Reyes',
	owner_class: 'Engineering I Honors'
};
/** The null-class case. Everything about it must render as nothing. */
const NAMED_NO_CLASS = {
	owner_display_name: null,
	owner_full_name: 'Sam Cruz',
	owner_class: null
};

function summary(over: Partial<FoundryAppSummary> & { id: string; slug: string; title: string }) {
	return {
		tagline: null,
		cover_path: null,
		...NAMED_NO_CLASS,
		published_version_id: 'v-1',
		published_ordinal: 1,
		version_count: 1,
		submitted_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		updated_at: '2026-08-20T09:00:00Z',
		...over
	} as FoundryAppSummary;
}

function version(over: Partial<FoundryVersion> & { id: string }): FoundryVersion {
	return {
		ordinal: 1,
		status: 'approved',
		byte_size: 2048,
		file_count: 3,
		created_at: '2026-08-18T08:40:00Z',
		reviewed_at: '2026-08-18T10:00:00Z',
		review_note: null,
		reject_reason: null,
		manifest: {},
		...over
	} as FoundryVersion;
}

function app(over: Partial<FoundryApp> & { id: string; slug: string; title: string }): FoundryApp {
	return {
		tagline: null,
		description: null,
		cover_path: null,
		build_notes: 'Generated with an AI tool, then rewritten by hand.',
		owner: '00000000-0000-4000-8000-000000000001',
		...NAMED_NO_CLASS,
		published_version_id: 'v-1',
		metadata_flagged_at: null,
		hidden_at: null,
		created_at: '2026-08-10T09:00:00Z',
		updated_at: '2026-08-20T09:00:00Z',
		versions: [version({ id: 'v-1' })],
		...over
	} as FoundryApp;
}

const APPS: FoundryAppSummary[] = [
	summary({ id: 'a', slug: 'tide-clock', title: 'Tide Clock', ...NAMED_WITH_CLASS }),
	summary({ id: 'b', slug: 'gear-ratio', title: 'Gear Ratio', ...NAMED_NO_CLASS })
];

const noop = () => {};

/**
 * NO LAUNCH TRANSPORT EXISTS ANY MORE, and the stage renders its control on the
 * strength of being able to BUILD a src instead. `PUBLIC_SUPABASE_URL` comes
 * from the placeholder stand-in in tests/stubs, which is all `foundryBundleUrl`
 * needs to answer non-null -- so an empty transports object is now the shape
 * that produces a launch control, where it used to be the shape that removed
 * one. Kept as a named constant so the two spellings do not drift.
 */
const NO_TRANSPORTS = {};

function galleryHtml(over: { selected?: FoundryApp | null } = {}) {
	return render(FoundryGallery, {
		props: {
			apps: APPS,
			selected: over.selected ?? null,
			transports: NO_TRANSPORTS,
			onSelect: noop
		}
	}).body;
}

/* ------------------------------------------------------------ 1. sandbox */

describe('the frame cancels nothing', () => {
	const APPS = 'https://apps.ideabosco.com';
	const PORTAL = 'https://ideabosco.com';
	const SRC = `${APPS}/b/a/v-1/`;

	/**
	 * THE EXPECTED FLAGS ARE WRITTEN OUT HERE, IN THE TEST, rather than read
	 * out of the component or the shared module -- a check derived from the
	 * implementation's own string cannot fail. Adding a flag to the shipped set
	 * is meant to redden this, so that granting one is a decision written down
	 * twice.
	 */
	const STRICT = [
		'allow-downloads',
		'allow-forms',
		'allow-modals',
		'allow-orientation-lock',
		'allow-pointer-lock',
		'allow-popups',
		'allow-scripts'
	];
	const CROSS = [...STRICT, 'allow-same-origin'].sort();

	/**
	 * Render the REAL component with a chosen pair of origins in the environment.
	 *
	 * BOTH VARIABLES ARE CONTROLLED NOW, AND THAT IS THE GENERALIZATION. The
	 * helper used to set the portal variable alone, on the understanding that it
	 * WAS the portal origin. It is not any more: the portal origin is RESOLVED
	 * from the pair, so the apps origin is what decides whether an unset portal
	 * variable falls back to the canonical host or stays empty, and a helper that
	 * left it at whatever the file happened to set at module scope would be
	 * describing one arrangement while claiming to test another.
	 *
	 * `null` means the variable is DELETED rather than set empty, which is what
	 * an unset Vercel variable actually looks like.
	 */
	function frameWith(portalOrigin: string | null, appsOrigin: string | null = APPS): string {
		const beforePortal = process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
		const beforeApps = process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
		const set = (key: string, value: string | null) => {
			if (value === null) delete process.env[key];
			else process.env[key] = value;
		};
		set('PUBLIC_FOUNDRY_PORTAL_ORIGIN', portalOrigin);
		set('PUBLIC_FOUNDRY_APPS_ORIGIN', appsOrigin);
		try {
			return render(AppFrame, { props: { src: SRC, title: 'Tide Clock' } }).body;
		} finally {
			set('PUBLIC_FOUNDRY_PORTAL_ORIGIN', beforePortal ?? null);
			set('PUBLIC_FOUNDRY_APPS_ORIGIN', beforeApps ?? null);
		}
	}

	function sandboxOf(html: string): string[] {
		const match = /sandbox="([^"]*)"/.exec(html);
		expect(match, 'the frame carries no sandbox attribute at all').not.toBeNull();
		return match![1].split(/\s+/).filter(Boolean).sort();
	}

	/**
	 * THE BASE SET IS UNCONDITIONAL, and asserting it that way is what survives
	 * the portal origin becoming a resolved value rather than a raw read.
	 *
	 * This used to be one call with the portal variable unset, on the assumption
	 * that unset meant the strict set. It does not any more -- unset with an apps
	 * origin configured now resolves to the canonical portal host and grants the
	 * conditional flag -- so the assertion is restated as the thing that was
	 * actually being claimed: these seven are present in EVERY configuration, and
	 * the eighth is the only one that moves.
	 */
	it('grants scripts, modals, pointer lock, forms, downloads, popups and orientation lock', () => {
		for (const [portal, apps] of [
			[PORTAL, APPS],
			[null, APPS],
			[null, null],
			[APPS, APPS],
			['', null]
		] as const) {
			const flags = sandboxOf(frameWith(portal, apps));
			for (const flag of STRICT) {
				expect(flags, `${flag} with portal ${portal} / apps ${apps}`).toContain(flag);
			}
		}
		// POSITIVE CONTROL: at least one of those really is the bare strict set,
		// so "contains all seven" is not passing on a set that grants everything.
		expect(sandboxOf(frameWith(null, null))).toEqual(STRICT);
	});

	/**
	 * THE PAIR. A frame whose bundle origin differs from the origin framing it
	 * gets `allow-same-origin`, because the escape needs same-origin access to
	 * the parent and there is none. A frame on the SAME origin as the portal --
	 * which is what a deployment with no apps origin configured produces -- does
	 * not, and neither does one that cannot tell.
	 *
	 * ONE DIRECTION ALONE IS NOT A TEST. Asserting only the absence passes on a
	 * component that never grants the flag (which is what shipped before, so the
	 * change would be untested); asserting only the presence passes on one that
	 * always grants it, which is the actual hazard.
	 */
	it('grants allow-same-origin only when the bundle and RESOLVED portal origins differ', () => {
		// POSITIVE: production's arrangement, two real and different origins.
		expect(sandboxOf(frameWith(PORTAL)), 'configured').toEqual(CROSS);

		// POSITIVE, AND THIS ROW IS THE WHOLE POINT OF THE BUNDLE: the portal
		// variable is UNSET and the flag is still granted, because an apps origin
		// is configured and the portal origin falls back to the canonical host.
		// This case used to be a negative -- it asserted STRICT -- which is
		// exactly the production configuration the previous bundle would have
		// been silently inert in.
		expect(sandboxOf(frameWith(null, APPS)), 'portal unset, apps set').toEqual(CROSS);
		expect(sandboxOf(frameWith('', APPS)), 'portal empty, apps set').toEqual(CROSS);

		// NEGATIVE: the two origins are the same string, so the escape is real
		// and the flag must go, configured apps origin or not.
		expect(sandboxOf(frameWith(APPS, APPS)), 'same origin').toEqual(STRICT);

		// NEGATIVE: no apps origin, which is dev and preview. No fallback fires,
		// the resolved portal origin is empty, and the strict set applies
		// whatever the portal variable says -- including when it says something.
		expect(sandboxOf(frameWith(null, null)), 'neither').toEqual(STRICT);
		expect(sandboxOf(frameWith('', null)), 'apps unset, portal empty').toEqual(STRICT);
	});

	/**
	 * THE APPS ORIGIN GATES THE FALLBACK, NOT THE CONFIGURED VALUE, and the
	 * difference is worth its own case because the two collapse into one in
	 * every other row above.
	 *
	 * With no apps origin but a portal variable that IS set, the resolved portal
	 * origin is that variable -- so a frame whose src is on a genuinely different
	 * origin still gets the flag. A resolver that read "no apps origin" as "no
	 * portal origin" would fail this while passing everything else.
	 */
	it('honours a configured portal origin even with no apps origin', () => {
		expect(sandboxOf(frameWith(PORTAL, null))).toEqual(CROSS);
	});

	/**
	 * AN UNPARSEABLE `src` FAILS CLOSED. A relative or malformed URL yields no
	 * origin, and no origin must never be read as "different from the portal".
	 */
	it('withholds the flag when the src has no origin to compare', () => {
		const before = process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
		process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN = PORTAL;
		try {
			for (const src of ['/b/a/v-1/', '', 'not a url']) {
				const html = render(AppFrame, { props: { src, title: 'x' } }).body;
				expect(sandboxOf(html), src).toEqual(STRICT);
			}
		} finally {
			if (before === undefined) delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
			else process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN = before;
		}
	});

	/**
	 * THE ATTRIBUTE AND THE DIRECTIVE ARE ONE STRING, WHICH IS THE HALF THAT
	 * CANNOT BE READ OFF THE SOURCE.
	 *
	 * `tests/foundry-bundle-url.test.ts` asserts the frame REACHES the shared
	 * function; this compares the string the real component actually rendered
	 * against the `sandbox` directive the real policy actually emits, for the
	 * same two origins. It is what catches the two callers being handed
	 * different arguments -- which is the only way one function can still
	 * produce two answers.
	 */
	it('renders exactly the sandbox directive the CSP sends, in both cases', () => {
		// THE PAIR IS THE INPUT NOW, because both sides resolve the portal origin
		// from both variables. Feeding the CSP the raw variable while the
		// component resolves it would compare two different questions and pass
		// only by luck.
		for (const [portal, apps] of [
			[PORTAL, APPS],
			[null, APPS],
			[APPS, APPS],
			[null, null],
			['', null]
		] as const) {
			const resolved = foundryPortalOrigin(apps, portal);
			const directive = foundryBundleCsp(APPS, resolved)
				.split('; ')
				.find((d) => d.startsWith('sandbox '))!
				.slice('sandbox '.length);
			expect(sandboxOf(frameWith(portal, apps)), `${portal} / ${apps}`).toEqual(
				directive.split(/\s+/).filter(Boolean).sort()
			);
		}
	});

	it('writes the flags down in exactly one place', () => {
		// A second frame written elsewhere would look identical and isolate
		// nothing, so the sweep is over every Foundry module rather than over
		// this one's output.
		//
		// IT COUNTS DECLARATIONS, NOT ATTRIBUTES, AND THAT IS THE
		// GENERALIZATION. The flags used to be a literal in AppFrame's markup, so
		// counting `sandbox="` was the same question; they live in
		// `bundle-headers.ts` now because the SERVING side has to send the
		// identical set as a CSP `sandbox` directive, and a `sandbox="allow-..."`
		// count answers zero on a tree that is correct. What has to stay true
		// either way is that the grant is written down ONCE.
		const FILES = [
			'src/lib/foundry/bundle-headers.ts',
			'src/lib/foundry/AppFrame.svelte',
			'src/lib/foundry/AppStage.svelte',
			'src/lib/foundry/FoundryDetail.svelte',
			'src/lib/foundry/FoundryGallery.svelte',
			'src/lib/foundry/ReviewQueue.svelte',
			'src/lib/foundry/FoundryInspector.svelte'
		];
		let declarations = 0;
		for (const file of FILES) {
			const src = readFileSync(file, 'utf8');
			// NO COMPONENT SPELLS AN ATTRIBUTE OUT. The flags are a function of
			// two origins now, so a hardcoded `sandbox="allow-..."` anywhere is
			// by construction a set that ignores them.
			expect(src, `${file} hardcodes a sandbox attribute`).not.toMatch(/sandbox="allow-/);
			if (/allow-scripts allow-modals/.test(src)) declarations += 1;
		}
		// POSITIVE CONTROL: exactly one file states the grant at all. Zero would
		// mean the sweep is looking at the wrong thing; two is the defect.
		expect(declarations, 'the sandbox flags are written in more than one place').toBe(1);
		// And the one that states them is the shared module, not a component.
		expect(readFileSync('src/lib/foundry/bundle-headers.ts', 'utf8')).toMatch(
			/allow-scripts allow-modals/
		);
		// The component computes its attribute rather than carrying one.
		expect(readFileSync('src/lib/foundry/AppFrame.svelte', 'utf8')).toContain(
			'sandbox={sandboxFlags}'
		);
	});


	/**
	 * THE RESOLVED CONFIGURATION IS ON SCREEN, FOR AN ADMIN AND NOBODY ELSE.
	 *
	 * WHY THIS IS A TEST AND NOT A HARNESS PASS. It is a visibility boundary --
	 * the class of assertion where a wrong result is invisible in normal use.
	 * Nothing about a student silently seeing an internal configuration line
	 * fails visibly; the first person to notice is the wrong person. So it is
	 * asserted in both directions, with the counts, on the REAL component.
	 *
	 * AND THE VALUES MUST BE THE RESOLVED ONES. A line that reported the raw
	 * variables would be worse than no line at all: the whole reason it exists
	 * is that the raw variables do not tell you what the browser is going to
	 * get, and a diagnostic that restates the input has answered a question
	 * nobody asked.
	 */
	describe('the admin configuration line', () => {
		const adminFrame = (portal: string | null, apps: string | null = APPS) =>
			withPageData({ isAdmin: true }, () => frameWith(portal, apps));
		const studentFrame = (portal: string | null, apps: string | null = APPS) =>
			withPageData({ isAdmin: false }, () => frameWith(portal, apps));

		it('states the resolved pair, the fallback and the grant, for an admin', () => {
			// PRODUCTION AS IT MAY ACTUALLY BE WIRED: apps origin set, portal
			// variable never set. The line has to say the origin it RESOLVED and
			// say that it was a fallback, because "resolved to ideabosco.com" and
			// "resolved to ideabosco.com because nobody set the variable" are
			// different facts and only the second is worth acting on.
			const fellBack = adminFrame(null, APPS);
			expect(fellBack).toContain(`apps origin ${APPS}`);
			expect(fellBack).toContain(`portal origin ${PORTAL}`);
			expect(fellBack).toContain('(fallback)');
			expect(fellBack).toContain('allow-same-origin granted');

			// CONFIGURED: the same resolved origin, reached the other way, and the
			// fallback marker must be ABSENT. Without this row the marker could be
			// unconditional text and the row above would not notice.
			const configured = adminFrame(PORTAL, APPS);
			expect(configured).toContain(`portal origin ${PORTAL}`);
			expect(configured).not.toContain('(fallback)');
			expect(configured).toContain('allow-same-origin granted');

			// DEV: neither variable set. Every field has to say so rather than
			// going blank, and the grant is withheld.
			const dev = adminFrame(null, null);
			expect(dev).toContain('apps origin unset');
			expect(dev).toContain('portal origin unset');
			expect(dev).not.toContain('(fallback)');
			expect(dev).toContain('allow-same-origin withheld');
		});

		/**
		 * THE GRANT IT REPORTS IS THE GRANT THE FRAME GOT. Recomputing it from
		 * the origins would let the line and the attribute disagree, which is the
		 * one way a diagnostic like this becomes actively harmful -- somebody
		 * reads "granted", believes storage works, and the frame beside it says
		 * otherwise. Compared against the real `sandbox` attribute in the same
		 * render, in both directions.
		 */
		it('never reports a grant the frame beside it did not get', () => {
			for (const [portal, apps] of [
				[PORTAL, APPS],
				[null, APPS],
				[APPS, APPS],
				[null, null]
			] as const) {
				const html = adminFrame(portal, apps);
				const granted = sandboxOf(html).includes('allow-same-origin');
				expect(html, `${portal} / ${apps}`).toContain(
					`allow-same-origin ${granted ? 'granted' : 'withheld'}`
				);
			}
			// POSITIVE CONTROLS: both words really do occur across that loop, so
			// the agreement above is not vacuous over four identical cases.
			expect(adminFrame(null, APPS)).toContain('granted');
			expect(adminFrame(null, null)).toContain('withheld');
		});

		/**
		 * A STUDENT SEES NOTHING, and neither does a signed-out visitor. The
		 * element is not rendered rather than hidden, so there is no markup to
		 * inspect and no CSS to defeat.
		 */
		it('renders nothing at all for a student or a visitor', () => {
			for (const data of [{ isAdmin: false }, {}, { isAdmin: 'yes' }, { isAdmin: 1 }]) {
				const html = withPageData(data, () => frameWith(null, APPS));
				expect(html, JSON.stringify(data)).not.toContain('fdy-config');
				expect(html, JSON.stringify(data)).not.toContain('allow-same-origin granted');
				expect(html, JSON.stringify(data)).not.toContain('portal origin');
				expect(html, JSON.stringify(data)).not.toContain('apps origin');
				// POSITIVE CONTROL, IN THE SAME RENDER: the frame itself is still
				// there, so the four absences are about the line and not about a
				// component that failed to render anything.
				expect(html.split('<iframe').length - 1, JSON.stringify(data)).toBe(1);
			}

			// AND THE OTHER DIRECTION, on the identical configuration: an admin
			// gets exactly one of these lines. Without this the sweep above would
			// pass on a component that never renders the line for anyone.
			const admin = adminFrame(null, APPS);
			expect(admin.split('fdy-config').length - 1).toBeGreaterThanOrEqual(1);
			expect(admin).toContain('apps origin');
			expect(studentFrame(null, APPS)).not.toContain('apps origin');
		});
	});

	it('does not render a frame until something is launched', () => {
		// The stage is the lifecycle; a gallery that framed every app on load
		// would start every bundle in the list.
		const html = galleryHtml({ selected: app({ id: 'a', slug: 'tide-clock', title: 'Tide Clock' }) });
		expect(html).toContain('Launch app');
		expect(html.split('<iframe').length - 1).toBe(0);
		// POSITIVE CONTROL: the frame component really does emit an <iframe>, so
		// the zero above is about the stage and not about a broken assertion.
		expect(frameWith(null).split('<iframe').length - 1).toBe(1);
	});

	/**
	 * NO APPS ORIGIN MEANS NO LAUNCH CONTROL, AND THAT IS THE STRICT DIRECTION.
	 *
	 * The alternative -- falling back to the page's own origin -- would serve
	 * student bundles off `ideabosco.com`, the host carrying the session
	 * cookies, and it would do it silently on any deployment that forgot the
	 * variable. That is the one failure nobody would notice. A missing launch
	 * button is a bug report on the first day.
	 *
	 * BOTH DIRECTIONS, because "renders nothing" is also what a broken render
	 * looks like.
	 */
	it('renders no launch control when no apps origin is configured', () => {
		const selected = app({ id: 'a', slug: 'tide-clock', title: 'Tide Clock' });
		const configured = galleryHtml({ selected });
		expect(configured).toContain('Launch app');

		delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
		try {
			const bare = galleryHtml({ selected });
			expect(bare).not.toContain('Launch app');
			expect(bare).toContain('cannot be started from here');
			// POSITIVE CONTROL: the same render still produced the app itself, so
			// the absence above is the launch control and not an empty string.
			expect(bare).toContain('Tide Clock');
		} finally {
			process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = 'https://apps.ideabosco.com';
		}
	});
});

/* -------------------------------------------------------- 2. the author line */

describe('a null class renders as nothing at all', () => {
	it('renders the class for the app that has one', () => {
		const html = galleryHtml();
		// From the fixture, not from the component.
		expect(html).toContain(NAMED_WITH_CLASS.owner_class);
		expect(html).toContain(NAMED_WITH_CLASS.owner_full_name);
		expect(html).toContain(NAMED_NO_CLASS.owner_full_name);
	});

	it('renders no placeholder, no label and no stranded separator for the null one', () => {
		const html = galleryHtml();

		// The card for the classless app, isolated so the other card's real class
		// cannot make this pass.
		const start = html.indexOf('data-app-slug="gear-ratio"');
		expect(start, 'the classless card did not render').toBeGreaterThan(-1);
		const card = html.slice(start, html.indexOf('</a>', start));

		expect(card).toContain(NAMED_NO_CLASS.owner_full_name); // positive control
		expect(card).not.toMatch(/Class\s*:/i);
		expect(card).not.toContain('·');
		expect(card).not.toContain('Unknown');
		expect(card).not.toContain('fdy-card-class');
	});

	it('renders no author block at all when there is neither name nor class', () => {
		const html = render(FoundryDetail, {
			props: {
				app: app({
					id: 'c',
					slug: 'nameless',
					title: 'Nameless',
					owner_display_name: null,
					owner_full_name: null,
					owner_class: null
				}),
				transports: NO_TRANSPORTS
			}
		}).body;
		expect(html).toContain('Nameless'); // positive control
		expect(html).not.toContain('fdy-detail-by');

		// POSITIVE CONTROL for the absence: the same component WITH an author
		// does render that block, so the class name is not simply misspelled.
		const withAuthor = render(FoundryDetail, {
			props: {
				app: app({ id: 'd', slug: 'named', title: 'Named', ...NAMED_WITH_CLASS }),
				transports: NO_TRANSPORTS
			}
		}).body;
		expect(withAuthor).toContain('fdy-detail-by');
	});
});

/* ---------------------------------------------------------- 3. role parity */

describe('the review queue is the student page plus an inspector', () => {
	const SUBMITTED = version({ id: 'v-2', ordinal: 2, status: 'submitted', reviewed_at: null });
	const IN_QUEUE = app({
		id: 'a',
		slug: 'tide-clock',
		title: 'Tide Clock',
		...NAMED_WITH_CLASS,
		versions: [SUBMITTED, version({ id: 'v-1' })]
	});

	const QUEUE_APPS = [
		summary({
			id: 'a',
			slug: 'tide-clock',
			title: 'Tide Clock',
			...NAMED_WITH_CLASS,
			submitted_version_id: 'v-2',
			updated_at: '2026-08-18T09:00:00Z'
		}),
		summary({
			id: 'b',
			slug: 'gear-ratio',
			title: 'Gear Ratio',
			submitted_version_id: 'v-9',
			updated_at: '2026-08-22T09:00:00Z'
		}),
		// Not in the queue: nothing submitted. It must not appear.
		summary({ id: 'c', slug: 'quiet', title: 'Quiet App', submitted_version_id: null })
	];

	const REVIEW_TRANSPORTS = {
		listFiles: async () => ({ ok: true as const, files: [] }),
		readFile: async () => ({ ok: true as const, text: '', path: '', byteSize: 0 }),
		decide: async () => ({ ok: true as const })
	};

	function queueHtml(over: { selected?: FoundryApp | null; transports?: object } = {}) {
		return render(ReviewQueue, {
			props: {
				apps: QUEUE_APPS,
				selected: over.selected ?? null,
				transports: over.transports ?? REVIEW_TRANSPORTS,
				onSelect: noop,
				now: NOW
			}
		}).body;
	}

	it('renders the SAME detail markup the gallery renders', () => {
		const gallery = galleryHtml({ selected: IN_QUEUE });
		const queue = queueHtml({ selected: IN_QUEUE });

		// The student-facing pieces, present in both. The build notes are the
		// case worth naming: they are the thing the whole programme is about, and
		// a staff-only re-derivation is exactly what role parity forbids.
		for (const fragment of [
			'fdy-detail-title',
			'How this was built',
			IN_QUEUE.build_notes,
			NAMED_WITH_CLASS.owner_class!
		]) {
			expect(gallery, `gallery is missing ${fragment}`).toContain(fragment);
			expect(queue, `queue is missing ${fragment}`).toContain(fragment);
		}
	});

	it('puts the inspector ONLY in the queue, and counts it both ways', () => {
		const gallery = galleryHtml({ selected: IN_QUEUE });
		const queue = queueHtml({ selected: IN_QUEUE });

		// Both directions with counts, per the verification standard: name what
		// must be ABSENT alongside what must be PRESENT.
		expect(gallery.split('data-testid="foundry-inspector"').length - 1).toBe(0);
		expect(queue.split('data-testid="foundry-inspector"').length - 1).toBe(1);

		// The controls themselves, not just the container.
		expect(gallery).not.toContain('Send decision');
		expect(gallery).not.toContain('Files in the stored bundle');
		expect(queue).toContain('Send decision');
		expect(queue).toContain('Files in the stored bundle');

		// And the queue renders exactly ONE detail, not a second copy of the app.
		expect(queue.split('fdy-detail-title').length - 1).toBe(1);
	});

	it('runs the SUBMITTED version, not the published one', () => {
		// From the fixture: v-2 is submitted, v-1 is live. The reviewer decides
		// about v-2, so that is what the stage must be pointed at.
		const queue = queueHtml({ selected: IN_QUEUE });
		expect(queue).toContain(`data-version="${SUBMITTED.id}"`);
		expect(queue).not.toContain('data-version="v-1"');
		expect(queue).toContain(`Reviewing build ${SUBMITTED.ordinal}`);

		// POSITIVE CONTROL, and the other half of the claim: the GALLERY points
		// the identical component at the PUBLISHED version instead. Same
		// component, same attribute, different value -- which is what makes this
		// a statement about the prop rather than about one surface's markup.
		const gallery = galleryHtml({ selected: IN_QUEUE });
		expect(gallery).toContain(`data-version="${IN_QUEUE.published_version_id}"`);
		expect(gallery).not.toContain(`data-version="${SUBMITTED.id}"`);
	});

	it('lists only apps with something submitted, oldest first', () => {
		// The order is decided by the fixture's own updated_at values: 'a' is
		// 2026-08-18 and 'b' is 2026-08-22, so 'a' comes first. 'c' has nothing
		// submitted and must not appear at all.
		const ordered = queueOrder(QUEUE_APPS).map((r) => r.slug);
		expect(ordered).toEqual(['tide-clock', 'gear-ratio']);

		const html = queueHtml();
		expect(html.indexOf('data-app-slug="tide-clock"')).toBeGreaterThan(-1);
		expect(html.indexOf('data-app-slug="tide-clock"')).toBeLessThan(
			html.indexOf('data-app-slug="gear-ratio"')
		);
		expect(html).not.toContain('data-app-slug="quiet"');
		// POSITIVE CONTROL: the excluded app is a real row that rendered nowhere,
		// rather than a slug nothing ever had.
		expect(QUEUE_APPS.some((a) => a.slug === 'quiet')).toBe(true);
		expect(html).not.toContain('Quiet App');
		// And the queue rendered at all, so the two absences above are not two
		// ways of searching an empty page.
		expect(html).toContain('data-testid="foundry-queue"');
	});

	it('removes each inspector control when its transport is absent', () => {
		// ABSENCE IS THE MECHANISM: read-only is structural, not a flag.
		const readOnly = queueHtml({ selected: IN_QUEUE, transports: NO_TRANSPORTS });
		expect(readOnly).toContain('data-testid="foundry-inspector"'); // positive control
		expect(readOnly).not.toContain('Send decision');
		expect(readOnly).not.toContain('Files in the stored bundle');
	});

	it('shows the metadata flag only when one is set, and claims no per-field diff', () => {
		const flagged = app({
			...IN_QUEUE,
			metadata_flagged_at: '2026-08-22T14:10:00Z'
		} as FoundryApp);
		const withFlag = queueHtml({ selected: flagged });
		const withoutFlag = queueHtml({ selected: IN_QUEUE });

		expect(withFlag.split('data-testid="foundry-metadata-flag"').length - 1).toBe(1);
		expect(withoutFlag.split('data-testid="foundry-metadata-flag"').length - 1).toBe(0);

		// The honest boundary: it says which fields COULD have moved and that the
		// answer is not recorded. A confident "Title changed from X to Y" would
		// be a sentence with nothing behind it.
		expect(withFlag).toContain('Which one is not recorded');
	});
});

/* ------------------------------------------------------- 4. the reject gate */

describe('a rejection cannot be sent without a reason and a note', () => {
	it('lets an approval through with nothing else filled in', () => {
		expect(reviewCanSend({ decision: 'approve', note: '', reasonId: null })).toBe(true);
		expect(reviewBlockedBecause({ decision: 'approve', note: '', reasonId: null })).toBeNull();
	});

	it('refuses a rejection missing either half, and says which', () => {
		const cases: Array<[string, string | null, boolean]> = [
			['', null, false],
			['Fix the start button.', null, false],
			['', 'does-not-run', false],
			['   ', 'does-not-run', false],
			['Fix the start button.', 'does-not-run', true],
			// A reason that is not on the list is not a reason.
			['Fix the start button.', 'invented-reason', false]
		];
		for (const [note, reasonId, expected] of cases) {
			expect(
				`${JSON.stringify(note)}/${reasonId} -> ${reviewCanSend({ decision: 'reject', note, reasonId })}`
			).toBe(`${JSON.stringify(note)}/${reasonId} -> ${expected}`);
		}
		expect(cases).toHaveLength(6);

		expect(reviewBlockedBecause({ decision: 'reject', note: '', reasonId: null })).toContain(
			'a reason and a note'
		);
		expect(
			reviewBlockedBecause({ decision: 'reject', note: 'x', reasonId: null })
		).toContain('a reason');
		expect(
			reviewBlockedBecause({ decision: 'reject', note: '', reasonId: 'content' })
		).toContain('a note');
	});

	it('refuses when no decision has been chosen at all', () => {
		expect(reviewCanSend({ decision: null, note: 'x', reasonId: 'content' })).toBe(false);
		expect(reviewBlockedBecause({ decision: null, note: '', reasonId: null })).toContain(
			'Choose approve or send back'
		);
	});
});

/* -------------------------------------------------------- the file tree */

describe('the file tree is rebuilt from the flat allowlist', () => {
	it('nests, sums directory sizes, and sorts directories before files', () => {
		// Expected values are arithmetic over the fixture: 10 + 20 = 30 in
		// assets/, and 'assets' sorts before 'index.html' because it is a
		// directory, not because 'a' < 'i'.
		const tree = buildFileTree([
			{ path: 'index.html', byteSize: 100, contentType: 'text/html' },
			{ path: 'assets/b.png', byteSize: 20, contentType: 'image/png' },
			{ path: 'assets/a.css', byteSize: 10, contentType: 'text/css' }
		]);
		expect(tree.map((n) => n.name)).toEqual(['assets', 'index.html']);
		expect(tree[0].kind).toBe('dir');
		expect(tree[0].byteSize).toBe(30);
		expect(tree[0].children.map((n) => n.name)).toEqual(['a.css', 'b.png']);
		expect(tree[1].byteSize).toBe(100);
	});

	it('handles a deeper path without losing an intermediate directory', () => {
		const tree = buildFileTree([
			{ path: 'a/b/c/deep.js', byteSize: 5, contentType: 'text/javascript' }
		]);
		expect(tree.map((n) => n.name)).toEqual(['a']);
		expect(tree[0].children[0].name).toBe('b');
		expect(tree[0].children[0].children[0].name).toBe('c');
		expect(tree[0].children[0].children[0].children[0].name).toBe('deep.js');
		expect(tree[0].byteSize).toBe(5);
	});
});
