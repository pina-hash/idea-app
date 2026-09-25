<script module lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { homeTourSeenStamp } from './orientation';

	/**
	 * FIRED ON `window` WHEN A HOME TOUR RUN STARTS, by any door (the header's
	 * Take the tour, the offer's Show me around, the first-visit auto-launch).
	 * `HomeTourOffer` listens for it and puts itself away: a run is the answer to
	 * the offer, and an offer left standing under a tour that is already running
	 * would ask the same question twice. The same shape as the pathway picker's
	 * done event, for the same reason: the two components are mounted apart.
	 */
	export const HOME_TOUR_START_EVENT = 'idea:home-tour-start';

	/**
	 * THE ONE WRITE: this person has seen (or been offered) the current home
	 * tour. Through 0001's "update own profile" policy, as 0045 intended, with a
	 * stamp that is never older than the tour's version (see
	 * `homeTourSeenStamp`). Resolves true when the row took it; a failure is
	 * soft on purpose, because the only cost is the tour offering itself again
	 * next visit.
	 */
	export async function markHomeTourSeen(supabase: SupabaseClient, userId: string): Promise<boolean> {
		try {
			const { error } = await supabase
				.from('profiles')
				.update({ tour_completed_at: homeTourSeenStamp(new Date()) })
				.eq('id', userId);
			return !error;
		} catch {
			return false;
		}
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { UserProfile } from '$lib/profile';
	import { PATHWAY_PICKER_DONE_EVENT, pathwayPickerDeferred } from '$lib/PathwayPicker.svelte';
	import SpotlightTour from './SpotlightTour.svelte';
	import { tourModKey } from './classroom-tours';
	import {
		SIGNIN_STEP,
		TOUR_SEEN_KEY,
		homeTourDefs,
		homeTourFor,
		homeTourPlan,
		resolveHomeTour,
		type TourPhase
	} from './orientation';
	import type { TourCloseReason, TourStep } from './tour';

	/**
	 * Orchestration for the home page's walkthrough, mounted once on the home
	 * page (self-contained like ProfileMenu: reads the session from page data).
	 *
	 * Auto-launch, once per mount:
	 * - Anonymous visitor, no local seen-flag: the pre-auth 'signin' phase.
	 * - Signed in with profiles.tour_completed_at STRICTLY null: the 'home'
	 *   phase. Undefined (0045 unapplied) fails soft: no auto-launch, no write.
	 *   If the first-login pathway picker owns the screen, the tour waits for
	 *   its done event / the profile update before starting.
	 * - Signed in with a stamp OLDER than `HOME_TOUR_VERSION`: nothing starts on
	 *   its own. `HomeTourOffer` offers it once, under the header (ledger 0298).
	 *
	 * WHICH TOUR, AND WHICH STEPS, ARE DECIDED WHEN IT STARTS. The reader is
	 * `homeTourFor` (the classroom's rule with no class on screen), the steps
	 * are that reader's, resolved against what is on the page at this width,
	 * and the page body is walked in document order, because a student's apps
	 * sit above their classes and a person's own layout moves the cards.
	 *
	 * Any exit (finish, Skip, X, Esc) counts as seen: signed-in stamps
	 * tour_completed_at through the existing "update own profile" policy when
	 * the person had not yet seen THIS version; anonymous sets the localStorage
	 * flag. The header's "Take the tour" control calls start() to replay the
	 * whole tour regardless of either flag (the engine drops steps whose
	 * targets are absent, so the sign-in step disappears once signed in).
	 */

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);
	const isAdmin = $derived(page.data.isAdmin === true);

	let activeSteps = $state<TourStep[] | null>(null);
	// Once per mount, and consumed even while the launch delay is pending.
	let autoLaunched = false;
	// Bumped by the pathway picker's done event so the launch effect re-checks.
	let pickerPing = $state(0);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	/** On the page, with a box: the question the classroom tour's resolver asks too. */
	function targetShown(selector: string): boolean {
		const el = document.querySelector<HTMLElement>(selector);
		if (!el) return false;
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0;
	}

	/** Which of two targets comes first in the document (negative: the first). */
	function pageOrder(a: string, b: string): number {
		const ea = document.querySelector(a);
		const eb = document.querySelector(b);
		if (!ea || !eb || ea === eb) return 0;
		return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
	}

	export function start(phase: TourPhase | 'all' = 'all') {
		clearTimeout(settleTimer);
		const steps: TourStep[] = [];
		if (phase !== 'home') steps.push(SIGNIN_STEP);
		if (phase !== 'signin') {
			const tour = homeTourFor({ isStaff: profile?.role === 'teacher', isAdmin });
			steps.push(
				...resolveHomeTour(homeTourDefs(tour, isAdmin), targetShown, tourModKey(navigator.platform), pageOrder)
			);
		}
		activeSteps = steps;
		window.dispatchEvent(new CustomEvent(HOME_TOUR_START_EVENT));
	}

	/**
	 * Mirrors PathwayPicker's own show condition: while it owns the screen, wait.
	 *
	 * THE DEFERRAL HALF IS THE PICKER'S OWN PREDICATE, NOT A SECOND COPY OF IT.
	 * This used to read `sessionStorage.getItem('pathway-picker-dismissed')`
	 * inline -- a literal key and a literal store, thirty lines from the
	 * component that owns both. Ledger 0276 moved the deferral to a durable,
	 * expiring localStorage record, and an inline reader would have gone on
	 * asking a key nothing writes any more: the tour would have decided the
	 * picker was showing when it was not, and waited for a done event that was
	 * never coming. Calling `pathwayPickerDeferred` is what makes that
	 * impossible rather than merely fixed.
	 */
	const pickerShowing = () => {
		if (!claims || profile?.role !== 'student' || profile?.pathway) return false;
		return !pathwayPickerDeferred();
	};

	$effect(() => {
		void pickerPing;
		if (activeSteps || autoLaunched) return;
		let phase: TourPhase | null = null;
		if (claims) {
			if (profile && homeTourPlan(profile.tour_completed_at) === 'run' && !pickerShowing()) phase = 'home';
		} else {
			let seen: string | null = null;
			try {
				seen = localStorage.getItem(TOUR_SEEN_KEY);
			} catch {
				seen = 'unavailable';
			}
			if (!seen) phase = 'signin';
		}
		if (!phase) return;
		autoLaunched = true;
		// Give the page's entrance animations a beat to settle before measuring.
		const p = phase;
		settleTimer = setTimeout(() => start(p), 500);
	});

	onMount(() => {
		const bump = () => (pickerPing += 1);
		window.addEventListener(PATHWAY_PICKER_DONE_EVENT, bump);
		return () => {
			window.removeEventListener(PATHWAY_PICKER_DONE_EVENT, bump);
			clearTimeout(settleTimer);
		};
	});

	const onTourClose = async (reason: TourCloseReason) => {
		activeSteps = null;
		if (claims) {
			// Stamp only while THIS version is unseen: a replay by somebody who has
			// seen it never rewrites, and an unreadable column (pre-0045) is never
			// written. Fail soft on error: the tour simply offers itself again.
			if (profile && homeTourPlan(profile.tour_completed_at) !== null) {
				if (await markHomeTourSeen(supabase, claims.sub)) await invalidateAll();
			}
		} else {
			try {
				localStorage.setItem(TOUR_SEEN_KEY, reason);
			} catch {
				/* storage unavailable; the pre-auth step returns next visit */
			}
		}
	};
</script>

{#if activeSteps}
	<SpotlightTour steps={activeSteps} onclose={onTourClose} />
{/if}
