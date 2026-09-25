/**
 * THE HOME PAGE'S WALKTHROUGH: a student's and a staff member's (ledger 0298,
 * report R22: "the tour tutorial is extremely out of date and needs to be far
 * more thorough"). PLAIN DATA and pure decisions, client-safe;
 * `HomeTour.svelte` runs it on the spotlight engine and `HomeTourOffer.svelte`
 * offers it once to anybody who finished the old one.
 *
 * TWO PHASES IN ONE CONTINUOUS FLOW, AS BEFORE:
 *
 *   'signin' (pre-auth):  one step on the header's Google sign-in control.
 *   'home'   (post-auth): the page from the top: the welcome, the profile
 *                         menu, the quick note, the to-do, the classes, the
 *                         app grid, ONE STEP PER APP CARD THAT RENDERS, where
 *                         to report a problem, and where to find the tour again.
 *
 * SPLIT THE WAY THE CLASSROOM'S TWO TOURS ARE SPLIT, BY CALLING THAT RULE.
 * `homeTourFor` is `classroomTourFor` with no class on screen, so staff (the
 * email domain's `teacher` role, or an admin) get the teacher's words and a
 * student never does. There is one statement of "who gets which tour" and it
 * lives in `classroom-tours.ts`.
 *
 * THE STEPS USE THE CLASSROOM'S SHAPE AND ITS RESOLVER. A step is one concept
 * with VARIANTS tried in order (`ClassroomTourStep`), and `resolveTourSteps`
 * keeps the first variant on screen, never points at one control twice, and
 * turns `{mod}` into the reader's own key. So a step whose control is not on
 * this page (the to-do for a teacher, the profile menu signed out, the quick
 * note on a build that has none) is simply left out, and the engine drops
 * anything that vanished between the resolve and the mount.
 *
 * THE APP CARDS ARE DERIVED, NEVER LISTED. `homeTourDefs` walks
 * `visibleApps(isAdmin)`, which is the very list the launcher renders, so a
 * card that exists gets a step and a card that does not render (the admin
 * tools, for anyone who is not an admin) cannot get one. `APP_TOUR_WORDS`
 * only says something about an app in the tour's own voice; an app added
 * without an entry still gets its step, reading the card's own tagline, and
 * `tests/home-tour.test.ts` reddens so somebody writes it words.
 *
 * THE PAGE'S ORDER IS NOT FIXED, SO THE BODY IS WALKED IN DOCUMENT ORDER. A
 * student gets the apps above their classes and staff may get either order
 * (`appsFirst` in `src/routes/+page.svelte`), and a person's own pinned or
 * dragged layout reorders the cards. The steps marked `flow` are therefore
 * sorted by where their controls sit on the page (`orderFlow`), so the
 * spotlight moves down the page rather than bouncing around it. The welcome
 * opens the tour and Report and the tour control close it wherever they are.
 *
 * A TARGET IS A STABLE HOOK, NEVER A STYLE CLASS: `data-tour` on the home
 * page's own controls, `data-testid` where another surface already carries
 * one. `tests/home-tour.test.ts` sweeps `src/` for every one of them.
 *
 * THE WORDS ARE WRITTEN FOR SOMEBODY WHO WAS NEVER SHOWN ANYTHING: one idea
 * per step, never more than two short sentences, and every control named by
 * the word printed on it. The report control's word is `REPORT_LABEL`, read
 * here and never typed, because the update log pointed at a "Feedback button"
 * for weeks after the button changed its name.
 */

import type { TourStep } from './tour';
import { classroomTourFor, resolveTourSteps, type ClassroomTourStep } from './classroom-tours';
import type { ClassroomTourId } from '$lib/preferences/classroom';
import { visibleApps, type PortalApp } from '$lib/portal-apps';
import { REPORT_LABEL, REPORT_LABEL_SHORT } from '$lib/feedback/context';

export type TourPhase = 'signin' | 'home';

/** Which home tour: the classroom's two ids, because it is the classroom's rule. */
export type HomeTourId = ClassroomTourId;

/** A home step: the classroom's shape, plus whether it is walked in page order. */
export interface HomeTourStep extends ClassroomTourStep {
	/** Sorted among the other `flow` steps by where its control sits on the page. */
	flow?: boolean;
}

/**
 * localStorage flag: the anonymous pre-auth tour was completed or dismissed on
 * this browser, so it never auto-opens again. The authoritative flag for
 * signed-in users is profiles.tour_completed_at (0045); this local one only
 * stops the pre-auth step from nagging before an account exists.
 */
export const TOUR_SEEN_KEY = 'idea_tour_seen';

/* -------------------------------------------------------------------------
 * WHO HAS SEEN THIS TOUR: a date compared with the stamp 0045 already stores.
 * ---------------------------------------------------------------------- */

/**
 * THE WHOLE OF HOW A REWRITTEN TOUR IS OFFERED AGAIN WITH NO MIGRATION.
 * `profiles.tour_completed_at` is a timestamp (0045: "non-null means they
 * have seen it"), so a stamp older than this instant (the START of this day in
 * the school's calendar, Pacific) means somebody saw an older tour. Move it
 * forward in the same change that rewrites the steps, and everybody is offered
 * the new one once.
 *
 * IT MUST NOT BE EARLIER THAN THE DEPLOY THAT SHIPS THE NEW STEPS, AND LATER
 * IS SAFE. A student who first signs in on the deploy's own day, before it,
 * finishes the OLD tour with a stamp from that day; a version at the start of
 * that day reads it as this tour and never offers them the new one. A version
 * AFTER the deploy costs nothing, because `homeTourSeenStamp` never writes a
 * stamp earlier than the version, so everybody who sees the new tour before
 * the date is recorded AT it. This one is the day after the rewrite was
 * written (ledger 0298, 2026-09-25), so a deploy at any hour of the 25th,
 * school day included, lands before it.
 *
 * The offset is Pacific DAYLIGHT time; a date from November to mid-March is
 * UTC-8, so write that offset for such a date.
 */
export const HOME_TOUR_VERSION = '2026-09-26';

const VERSION_AT = Date.parse(`${HOME_TOUR_VERSION}T00:00:00-07:00`);

/**
 * What the home page does about the tour for a signed-in person, read off the
 * stamp alone:
 *
 *   'run'   never seen any tour (null): it starts on its own, as it always did.
 *   'offer' saw an older tour: a one-line offer under the header, never a
 *           takeover (the classroom's rule: offered once, never blocking).
 *   null    has seen this one, or the column cannot be read (undefined: 0045
 *           not applied; an unparseable value). Nothing is started or offered,
 *           and nothing is written.
 */
export type HomeTourPlan = 'run' | 'offer' | null;

export function homeTourPlan(stamp: string | null | undefined): HomeTourPlan {
	if (stamp === undefined) return null;
	if (stamp === null) return 'run';
	const at = Date.parse(stamp);
	if (Number.isNaN(at)) return null;
	return at < VERSION_AT ? 'offer' : null;
}

/**
 * THE STAMP WRITTEN WHEN THE TOUR IS SEEN OR OFFERED, WHICH IS NEVER OLDER
 * THAN THIS VERSION. The value comes from the browser's clock, and a school
 * computer whose clock is behind would otherwise write a stamp that still
 * reads as "saw an older tour", so the offer would come back on every visit
 * for ever. Clamping to the version's own instant is what makes "offered
 * once" true whatever the clock says.
 */
export function homeTourSeenStamp(now: Date): string {
	return new Date(Math.max(now.getTime(), VERSION_AT)).toISOString();
}

/**
 * WHICH TOUR THIS VIEWER GETS: the classroom's decision with no class on
 * screen. Staff (the email domain's `teacher` role) or an admin get the staff
 * tour; everybody else, a signed-out visitor included, gets the student's.
 */
export function homeTourFor(who: { isStaff: boolean; isAdmin: boolean }): HomeTourId {
	return classroomTourFor({ inClass: false, canManage: false, isStaff: who.isStaff, isAdmin: who.isAdmin });
}

/* -------------------------------------------------------------------------
 * THE STEPS.
 * ---------------------------------------------------------------------- */

const hook = (id: string) => `[data-tour="${id}"]`;
const tid = (id: string) => `[data-testid="${id}"]`;

/** The one step that asks for a click, so it is the one step that lets the reader through to it. */
export const SIGNIN_STEP: TourStep = {
	target: hook('signin'),
	interactive: true,
	title: 'Sign in with Google',
	body: 'Use your Bosco Tech Google account, the same one you use for school. Signing in loads your classes, saves your work, and keeps your progress on every device. Go ahead and click it now.'
};

/** Words that differ by reader, or one sentence for both. */
export type HomeTourWords = string | Record<HomeTourId, string>;
const say = (w: HomeTourWords, tour: HomeTourId) => (typeof w === 'string' ? w : w[tour]);

/**
 * WHAT THE TOUR SAYS ABOUT EACH APP, keyed by the registry's own id. Only the
 * words live here; which cards get a step is `visibleApps`' answer. A key that
 * names no app is a test failure, not a silent no-op.
 */
export const APP_TOUR_WORDS: Readonly<Record<string, HomeTourWords>> = {
	classroom: {
		student:
			'Every class you are in. Inside, Search ({mod} K) finds any class or assignment, and Light turns on the white theme.',
		teacher:
			'Every class you teach. Inside, Search ({mod} K) finds any class, student or action, and Light turns on the white theme.'
	},
	notebook: {
		student: 'Every notebook entry you have written, in every class. Each class also has its own Notebook tab.',
		teacher: "Your own notebook, across every class. Your students' entries are in each class's Notebook tab."
	},
	ideacad:
		'Model parts in 3D right in the browser, with the feature tree, properties and design rules beside the model.',
	maps: 'Find any room, storage unit or tool, down to the drawer it lives in. Anyone can open it, even signed out.',
	coins: {
		student:
			'Your coin balance, the leaderboard, every transaction, open contracts and role applications. Nothing here changes a balance.',
		teacher:
			'Every coin balance, the leaderboard, every transaction, open contracts and role applications. Nothing here changes a balance.'
	},
	gauntlet:
		'The CAD skills dojo: read drawings, model against the clock, and climb the leaderboard on every challenge.',
	frc: "Team 5669's training track: CAD, mechanisms, controls, strategy and drive team.",
	greenline: 'Build a machine, take it to Proving Ground 07, and race it under the floodlights.',
	vanguard: 'A top-down arcade shooter. Clear the sectors, chain your combos and chase the high score.',
	foundry: {
		student:
			'Web apps built and published by students. Open one to play it, or publish your own and share its link.',
		teacher:
			'Web apps your students built and published. Open one to play it; each published app has a link you can share.'
	},
	tournaments: 'Live double-elimination brackets: register a team and follow every match as it is played.',
	'coin-desk': 'Where staff log fines, awards and purchases. It is the only tool that changes a coin balance.',
	dashboard:
		'The control desk: review queues, reports from every page, the admin roster, short links and the Drive connection.'
};

/** One step per card the launcher renders for this viewer, in the registry's order. */
function appSteps(tour: HomeTourId, isAdmin: boolean): HomeTourStep[] {
	return visibleApps(isAdmin).map((app: PortalApp) => {
		const words = APP_TOUR_WORDS[app.id];
		return {
			id: `app-${app.id}`,
			flow: true,
			// `data-tour={app.id}` is on the card in both of its states (a link, or a
			// reorderable tile while customizing), so the step finds it either way.
			variants: [{ target: hook(app.id), title: app.title, body: words === undefined ? app.sub : say(words, tour) }]
		};
	});
}

/**
 * THE STEPS FOR ONE READER, before anything is resolved against the page. The
 * welcome first, the header's controls next, then the page body (`flow`, put
 * into page order when it runs), then where to report and where the tour lives.
 */
export function homeTourDefs(tour: HomeTourId, isAdmin: boolean): HomeTourStep[] {
	return [
		{
			id: 'welcome',
			variants: [
				{
					target: hook('hero'),
					title: 'Welcome to IDEA',
					body: say(
						{
							student:
								'This is the IDEA portal for the whole school. Your classes, notebook, training and games live here, and your work saves to your account.',
							teacher:
								'This is the IDEA portal. Your classes, the tools you teach with and every app your students use live here.'
						},
						tour
					)
				}
			]
		},
		{
			id: 'profile',
			variants: [
				{
					target: hook('profile'),
					title: 'Your profile',
					body: say(
						{
							student:
								'Your picture and pathway. Open it for Change picture, Pathway, Identity and Theme, where Space White is the light one.',
							teacher:
								'Your picture and name. Open it for Change picture, Identity and Theme; Space White reads best on a projector.'
						},
						tour
					)
				}
			]
		},
		{
			// The quick note (ledger 0298, the notebook bundle) docks its trigger in
			// this header; on a build without it the step is simply not on screen.
			id: 'note',
			variants: [
				{
					target: tid('qn-trigger'),
					title: 'Note',
					body: "Note jots down a private note from any page. Written in a class it is filed there; anywhere else it waits in your notebook's Inbox."
				}
			]
		},
		{
			id: 'todo',
			flow: true,
			variants: [
				{
					target: tid('todo-strip'),
					title: 'Your to-do',
					body: 'What is missing and due this week, in every class. Press it for the whole list of what is assigned, missing and done.'
				}
			]
		},
		{
			id: 'classes',
			flow: true,
			variants: [
				{
					target: hook('classes'),
					title: 'Your classes',
					body: say(
						{
							student:
								'What each teacher posted, what is due next and work handed back. Open a class to see its work unit by unit.',
							teacher:
								'Every class you teach, with what is waiting to be graded. Open one to post, grade or start a Live class.'
						},
						tour
					)
				}
			]
		},
		{
			id: 'apps',
			flow: true,
			variants: [
				{
					target: hook('app-tools'),
					title: 'Apps',
					body: 'Every app in one grid. Customize lets you drag cards and pin favorites, and the sort menu can put your most used first.'
				}
			]
		},
		...appSteps(tour, isAdmin),
		{
			id: 'report',
			variants: [
				{
					target: hook('report'),
					title: REPORT_LABEL,
					body: `Press ${REPORT_LABEL} on any page when something is broken or confusing. In a class it sits in the header as ${REPORT_LABEL_SHORT}.`
				}
			]
		},
		{
			id: 'tour-again',
			variants: [
				{
					target: hook('tour-trigger'),
					title: 'Take the tour',
					body: 'Take the tour shows you around this page again whenever you want. Each class has its own Tour too.'
				}
			]
		}
	];
}

/**
 * THE FLOW STEPS IN PAGE ORDER, everything else where it stands. `compare`
 * answers which of two targets comes first on the page (negative: the first
 * one); a stable sort keeps the registry's order for any pair it cannot tell
 * apart. Pure, so the ordering is assertable without a page.
 */
export function orderFlow<T extends { id: string; target: string }>(
	steps: readonly T[],
	flowIds: ReadonlySet<string>,
	compare: (a: string, b: string) => number
): T[] {
	const slots: number[] = [];
	const flow: T[] = [];
	steps.forEach((s, i) => {
		if (flowIds.has(s.id)) {
			slots.push(i);
			flow.push(s);
		}
	});
	const sorted = [...flow].sort((a, b) => compare(a.target, b.target));
	const out = [...steps];
	slots.forEach((slot, k) => (out[slot] = sorted[k]));
	return out;
}

/**
 * THE HOME STEPS TO RUN, for what is on screen: each concept's first variant
 * that is present (the classroom's resolver), then the body in page order.
 */
export function resolveHomeTour(
	defs: readonly HomeTourStep[],
	present: (selector: string) => boolean,
	mod = 'Ctrl',
	compare: ((a: string, b: string) => number) | null = null
): (TourStep & { id: string })[] {
	const resolved = resolveTourSteps(defs, present, mod);
	if (!compare) return resolved;
	return orderFlow(resolved, new Set(defs.filter((d) => d.flow).map((d) => d.id)), compare);
}

/** Every hook either reader's tour can point at, admin or not, for the sweep. */
export function homeTourTargets(): string[] {
	const out = new Set<string>([SIGNIN_STEP.target]);
	for (const tour of ['student', 'teacher'] as const)
		for (const isAdmin of [false, true])
			for (const d of homeTourDefs(tour, isAdmin)) for (const v of d.variants) out.add(v.target);
	return [...out];
}
