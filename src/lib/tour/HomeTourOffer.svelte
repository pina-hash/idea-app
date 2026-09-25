<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { UserProfile } from '$lib/profile';
	import { PATHWAY_PICKER_DONE_EVENT, pathwayPickerDeferred } from '$lib/PathwayPicker.svelte';
	import { HOME_TOUR_START_EVENT, markHomeTourSeen } from './HomeTour.svelte';
	import { homeTourPlan } from './orientation';

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
	 * and at hydration, and nothing re-derives it after. The write does not
	 * reload the page for the same reason.
	 *
	 * IT WAITS FOR THE PATHWAY PICKER. A student with no pathway gets the
	 * picker's sheet over the page, and an offer recorded under a sheet was
	 * never seen. That student's offer is held until the picker is done or
	 * deferred -- the picker's own predicate, never a second copy of it, as
	 * `HomeTour` does for the first-visit launch.
	 *
	 * Mounted by the home page directly under its header, where the tour's own
	 * mount cannot be: `HomeTour` sits outside the page's stacking context so
	 * the spotlight is never trapped under it, and a row belongs in the flow.
	 */
	let { onstart }: { onstart: () => void } = $props();

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);

	/** The half of the picker's show rule that needs no storage read, so it answers on the server too. */
	const pickerMayShow = (p: UserProfile | null) => p?.role === 'student' && !p?.pathway;

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
		untrack(() => queueMicrotask(() => void markHomeTourSeen(client, id)));
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
		<section class="hto" aria-label="Tour offer" data-testid="tour-offer" bind:this={offerEl}>
			<svg class="hto-glyph" viewBox="0 0 24 24" aria-hidden="true"
				><path d="M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM9.5 14.5l1.5-4.5 4.5-1.5-1.5 4.5z" /></svg
			>
			<p class="hto-text">The tour of this page is new, and now covers every app and your profile.</p>
			<div class="hto-actions">
				<button type="button" class="hto-btn primary" data-testid="tour-offer-start" onclick={showMe}
					>Show me around</button
				>
				<button type="button" class="hto-btn" data-testid="tour-offer-dismiss" onclick={notNow}>Not now</button>
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
	.hto {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-left: 3px solid var(--green);
		border-radius: var(--radius-card, 4px);
		background: var(--surface-1);
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
		appearance: none;
		min-height: 44px;
		padding: 0 var(--space-3, 0.75rem);
		font: inherit;
		font-size: 0.95rem;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		cursor: pointer;
		white-space: nowrap;
	}
	.hto-btn:hover {
		border-color: var(--hover-ink, var(--gold));
	}
	.hto-btn:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	/* The primary is marked by an edge and a rule as well as its colour. */
	.hto-btn.primary {
		border-color: var(--green);
		box-shadow: inset 0 -2px 0 var(--green);
		font-weight: 600;
	}
</style>
