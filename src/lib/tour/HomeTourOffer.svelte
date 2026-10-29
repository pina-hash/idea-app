<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { UserProfile } from '$lib/profile';
	import { PATHWAY_PICKER_DONE_EVENT, pathwayPickerDeferred } from '$lib/PathwayPicker.svelte';
	import { pathwayPromptWanted, todaySchoolDay } from '$lib/pathway-choice';
	import { HOME_TOUR_START_EVENT, markHomeTourSeen } from './HomeTour.svelte';
	import { TOUR_SEEN_KEY, homeTourPlan } from './orientation';

	/**
	 * THE HOME TOUR, OFFERED AGAIN ONCE, TO SOMEBODY WHO FINISHED THE OLD ONE
	 * (ledger 0298, report R22). The classroom's pattern (`ClassroomTour`):
	 * one row under the header -- words and two buttons, no dim, nothing paused,
	 * nothing focused -- and never a takeover. A first visit still starts the
	 * tour on its own (`HomeTour`); this is only for a stamp older than
	 * `HOME_TOUR_VERSION`, which is `homeTourPlan`'s 'offer'.
	 *
	 * RECORDED THE MOMENT IT SHOWS, AND IT STAYS ON SCREEN. Recording on the
	 * answer offers it forever to someone who walks away; removing it on the
	 * write removes it the moment it appears. So the stamp is written as soon
	 * as the row is on screen (`markHomeTourSeen`, through 0045's own column
	 * and 0001's own-row policy, no migration), and the row is LATCHED: it is
	 * read once from the profile the page loaded, the same answer on the server
	 * and at hydration, and nothing re-derives it after. So the page's data is
	 * refreshed once the write lands (the profile then reads as having seen
	 * this tour, and a second visit to the home page in the same session does
	 * not offer it again) while the row on screen stays exactly where it is.
	 *
	 * IT WAITS FOR THE PATHWAY PICKER. A student with no pathway gets the
	 * picker's sheet over the page, and an offer recorded under a sheet was
	 * never seen. That student's offer is held until the picker is done or
	 * deferred -- the picker's own predicate, never a second copy of it, as
	 * `HomeTour` does for the first-visit launch.
	 *
	 * A SIGNED-OUT VISITOR GETS THE SAME ROW (ledger 0468, feedback c27b2be7).
	 * The public landing used to open with the spotlight tour's full-page dim
	 * on a first visit. Now the row is offered instead, once per browser: it
	 * is decided after hydration (the record is this browser's
	 * `TOUR_SEEN_KEY`, which the server cannot read) and recorded the moment
	 * it shows, exactly as a signed-in offer is, so a second visit is quiet.
	 * "Show me around" runs the whole tour, the sign-in step first.
	 *
	 * Mounted by the home page directly under its header, where the tour's own
	 * mount cannot be: `HomeTour` sits outside the page's stacking context so
	 * the spotlight is never trapped under it, and a row belongs in the flow.
	 */
	let { onstart }: { onstart: () => void } = $props();

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);

	/** The half of the picker's show rule that needs no storage read, so it answers on the server too.
	 *  It is the picker's own rule (`pathwayPromptWanted`), never a copy: a freshman who answered
	 *  "No pathway yet" is not held back waiting for a sheet that will not come. */
	const pickerMayShow = (p: UserProfile | null) => pathwayPromptWanted(p, todaySchoolDay());

	function offerable(): boolean {
		return !!claims && !!profile && homeTourPlan(profile.tour_completed_at) === 'offer';
	}

	/* THE OFFER IS LATCHED, NOT DERIVED: read once here for the first render. */
	function initialOffer(): boolean {
		return offerable() && !pickerMayShow(profile);
	}
	let open = $state(initialOffer());
	/** Answered (a run started, or Not now): never opened again on this mount. Plain on purpose. */
	let answered = false;
	/** The stamp has been sent. Plain: written on the path that reads it. */
	let recorded = false;
	let pickerPing = $state(0);
	let offerEl = $state<HTMLElement | null>(null);

	/** Signed out, and this browser has no record of the tour: offer it. */
	let anon = $state(false);
	onMount(() => {
		if (claims) return;
		let seen: string | null = null;
		try {
			seen = localStorage.getItem(TOUR_SEEN_KEY);
		} catch {
			seen = 'unavailable';
		}
		if (seen) return;
		anon = true;
		open = true;
		try {
			localStorage.setItem(TOUR_SEEN_KEY, 'offered');
		} catch {
			/* storage unavailable: the row comes back next visit, which is harmless */
		}
	});

	/* A student held back by the picker gets the offer once it is out of the way. */
	$effect(() => {
		void pickerPing;
		if (open || answered || !offerable()) return;
		if (pickerMayShow(profile) && !pathwayPickerDeferred()) return;
		open = true;
	});

	/* SAY SO AT ONCE: the stamp goes the moment the row is on screen. The client
	   is the page's, so the call runs untracked and after the render settles. */
	$effect(() => {
		if (!open || recorded) return;
		const client = supabase;
		const id = claims?.sub;
		if (!client || !id) return;
		recorded = true;
		untrack(() =>
			queueMicrotask(async () => {
				if (await markHomeTourSeen(client, id)) await invalidateAll();
			})
		);
	});

	onMount(() => {
		const bump = () => (pickerPing += 1);
		const ran = () => {
			answered = true;
			open = false;
		};
		window.addEventListener(PATHWAY_PICKER_DONE_EVENT, bump);
		window.addEventListener(HOME_TOUR_START_EVENT, ran);
		return () => {
			window.removeEventListener(PATHWAY_PICKER_DONE_EVENT, bump);
			window.removeEventListener(HOME_TOUR_START_EVENT, ran);
		};
	});

	function showMe() {
		answered = true;
		open = false;
		onstart();
	}

	function notNow() {
		const hadFocus = !!offerEl?.contains(document.activeElement);
		answered = true;
		open = false;
		// The row that had focus is gone: hand it to the control the tour lives on.
		if (hadFocus)
			queueMicrotask(() => document.querySelector<HTMLElement>('[data-tour="tour-trigger"]')?.focus());
	}

	/*
	 * ESCAPE PUTS THE OFFER AWAY, but only where the press is plainly for it:
	 * focus inside the offer, or on nothing at all with no dialog or menu open.
	 * Anywhere else Escape belongs to whatever has focus (the profile menu, a
	 * field), and taking it from them would be the bug. The classroom's rule.
	 */
	function onWindowKey(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape' || e.defaultPrevented) return;
		const active = document.activeElement;
		const inOffer = !!offerEl && !!active && offerEl.contains(active);
		const onNothing = !active || active === document.body;
		if (!inOffer && !onNothing) return;
		if (!inOffer && document.querySelector('dialog[open], [aria-expanded="true"]')) return;
		e.preventDefault();
		notNow();
	}
</script>

<svelte:window onkeydown={onWindowKey} />

{#if open}
	<div class="hto-wrap">
		<section class="hto tour-offer" aria-label="Tour offer" data-testid="tour-offer" bind:this={offerEl}>
			<svg class="hto-glyph" viewBox="0 0 24 24" aria-hidden="true"
				><path d="M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM9.5 14.5l1.5-4.5 4.5-1.5-1.5 4.5z" /></svg
			>
			<p class="hto-text">
				{anon
					? 'New here? A short tour shows what this site is and what signing in adds.'
					: 'The tour of this page is new, and now covers every app and your profile.'}
			</p>
			<div class="hto-actions">
				<button type="button" class="hto-btn tour-offer-btn primary" data-testid="tour-offer-start" onclick={showMe}
					>Show me around</button
				>
				<button type="button" class="hto-btn tour-offer-btn" data-testid="tour-offer-dismiss" onclick={notNow}>Not now</button>
			</div>
		</section>
	</div>
{/if}

<style>
	/* In the launcher's own column (1100px, the same gutters as the to-do door
	   and the app grid), above the page's background canvas like both of them. */
	.hto-wrap {
		position: relative;
		z-index: 1;
		max-width: 1100px;
		margin: 1rem auto 0;
		padding: 0 2rem;
	}
	@media (max-width: 768px) {
		.hto-wrap {
			padding: 0 1rem;
		}
	}
	/* One line where it fits, the buttons wrapping under the words on a phone.
	   The row's geometry is the classroom offer's, on the same register tokens,
	   so a theme moves both the same way. */
	/* One line where it fits, the buttons wrapping under the words on a phone.
	   It wears the classroom offer's own Plate classes (`tour-offer` is a
	   panel and `tour-offer-btn` a key in plate.css, the primary the one green
	   key), so the two rows are one recipe; only the layout is here. */
	.hto {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		color: var(--text-1);
		font-family: var(--font-display);
	}
	.hto-glyph {
		flex: none;
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--text-2);
	}
	.hto-text {
		flex: 1 1 12rem;
		margin: 0;
		font-size: 1rem;
		line-height: 1.4;
		color: var(--text-1);
	}
	.hto-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.hto-btn {
		min-height: 44px;
		padding: 0 var(--space-3, 0.75rem);
		font: inherit;
		font-size: 0.95rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.hto-btn:focus-visible {
		outline: 2px solid var(--focus-ring, var(--green));
		outline-offset: 2px;
	}
</style>
