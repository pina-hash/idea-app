<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { UserProfile } from '$lib/profile';
	import { PATHWAY_PICKER_DONE_EVENT } from '$lib/PathwayPicker.svelte';
	import SpotlightTour from './SpotlightTour.svelte';
	import { ORIENTATION_STEPS, TOUR_SEEN_KEY, type TourPhase } from './orientation';
	import type { TourCloseReason, TourStep } from './tour';

	/**
	 * Orchestration for the first-time orientation tour, mounted on the home
	 * page (self-contained like ProfileMenu: reads the session from page data).
	 *
	 * Auto-launch, once per mount:
	 * - Anonymous visitor, no local seen-flag: the pre-auth 'signin' phase.
	 * - Signed in with profiles.tour_completed_at STRICTLY null: the 'home'
	 *   phase. Undefined (0045 unapplied) fails soft: no auto-launch, no write.
	 *   If the first-login pathway picker owns the screen, the tour waits for
	 *   its done event / the profile update before starting.
	 *
	 * Any exit (finish, Skip, X, Esc) counts as seen: signed-in stamps
	 * tour_completed_at through the existing "update own profile" policy;
	 * anonymous sets the localStorage flag. The header's "Take the tour" control
	 * calls start() to replay the full tour regardless of either flag (the
	 * engine drops steps whose targets are absent, so the sign-in step
	 * disappears once signed in).
	 */

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);

	let activeSteps = $state<TourStep[] | null>(null);
	// Once per mount, and consumed even while the launch delay is pending.
	let autoLaunched = false;
	// Bumped by the pathway picker's done event so the launch effect re-checks.
	let pickerPing = $state(0);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	export function start(phase: TourPhase | 'all' = 'all') {
		activeSteps =
			phase === 'all' ? [...ORIENTATION_STEPS] : ORIENTATION_STEPS.filter((s) => s.phase === phase);
	}

	/** Mirrors PathwayPicker's own show condition: while it owns the screen, wait. */
	const pickerShowing = () => {
		if (!claims || profile?.role !== 'student' || profile?.pathway) return false;
		try {
			return !sessionStorage.getItem('pathway-picker-dismissed');
		} catch {
			return false;
		}
	};

	$effect(() => {
		void pickerPing;
		if (activeSteps || autoLaunched) return;
		let phase: TourPhase | null = null;
		if (claims) {
			if (profile && profile.tour_completed_at === null && !pickerShowing()) phase = 'home';
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
			// Stamp only when it is genuinely unset: a manual replay never
			// rewrites, and an unreadable column (pre-0045) is never written.
			if (profile?.tour_completed_at === null) {
				const { error } = await supabase
					.from('profiles')
					.update({ tour_completed_at: new Date().toISOString() })
					.eq('id', claims.sub);
				// Fail soft on error: the tour simply offers itself again next visit.
				if (!error) await invalidateAll();
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
