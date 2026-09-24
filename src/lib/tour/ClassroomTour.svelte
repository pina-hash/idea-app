<script lang="ts">
	import { untrack } from 'svelte';
	import SpotlightTour from './SpotlightTour.svelte';
	import {
		CLASSROOM_TOURS,
		resolveTourSteps,
		shouldOfferTour,
		tourModKey,
		tourStateAfter
	} from './classroom-tours';
	import type { TourCloseReason, TourStep } from './tour';
	import type { ClassroomPreferences, ClassroomTourId, TourState } from '$lib/preferences/classroom';
	import type { PreferenceStore } from '$lib/preferences/store';
	import { reactivePreferences } from '$lib/preferences/context';
	import { registerCommandHandler } from '$lib/shell/command-handlers';

	/**
	 * THE CLASSROOM'S WALKTHROUGH: the one-time offer and the run (ledger 0297,
	 * LEARN). Mounted once, by `ClassroomShell`, which is not remounted as the
	 * URL moves inside /classroom -- so an offer made on the first page is still
	 * there on the next one until it is answered, and a run survives nothing it
	 * should not (a navigation ends the page it was pointing at, and the engine
	 * re-measures or drops a target that went away).
	 *
	 * OFFERED ONCE, NEVER BLOCKING. A person whose tour state is `unseen` sees a
	 * one-line offer under the header -- words and two buttons, no dim, nothing
	 * paused, nothing focused -- and the state becomes `offered` the moment it is
	 * shown, so it is never shown again on any computer (the state lives in the
	 * account half of the classroom's preference store). "Not now" and Escape put
	 * it away; the header's Tour control and the palette's "Take the tour" run it
	 * at any time after.
	 *
	 * WHICH TOUR IS THE SHELL'S ANSWER, `classroomTourFor`: the teacher's only for
	 * somebody who manages the class on screen (or is staff, outside a class).
	 * This component is handed the id and never works it out, so the rule has one
	 * home.
	 *
	 * The offer's text states a fact and asks nothing to be read before acting:
	 * the only instruction on it is the two buttons.
	 */
	let {
		tour,
		preferences = null,
		canOffer = true,
		returnFocus = null,
		onstart = null
	}: {
		tour: ClassroomTourId;
		/** Null (a harness with no store) means no offer and no stored state; the Tour control still runs it. */
		preferences?: PreferenceStore<ClassroomPreferences> | null;
		/** False where an offer must not appear: somebody else's classroom (view-as), a deck on the wall. */
		canOffer?: boolean;
		/** Where focus goes when a run ends and what had it is gone. */
		returnFocus?: (() => HTMLElement | null) | null;
		/** Called before a run starts, so the shell can close its Menu first. */
		onstart?: (() => void) | null;
	} = $props();

	const prefs = $derived(preferences ? reactivePreferences(preferences) : null);

	/*
	 * THE OFFER IS LATCHED, NOT DERIVED. The stored state flips to `offered` the
	 * moment the offer is shown, so an offer derived from the store would vanish
	 * on the frame it appeared. It is read ONCE here for the first render -- the
	 * same answer on the server and at hydration, because both read the profile
	 * row the page loaded -- and after that only the effect below opens it.
	 */
	function initialOffer(): boolean {
		if (!preferences || !canOffer) return false;
		return shouldOfferTour(preferences.current.guidance.tours[tour]);
	}
	let offerOpen = $state(initialOffer());

	let runSteps = $state<TourStep[] | null>(null);
	let runTour = $state<ClassroomTourId | null>(null);
	let runKey = $state(0);
	let offerEl = $state<HTMLElement | null>(null);

	/** Write one tour's state through the store: one group, merged, never a clobber. */
	function setTourState(store: PreferenceStore<ClassroomPreferences>, id: ClassroomTourId, state: TourState) {
		const g = store.current.guidance;
		if (g.tours[id] === state) return;
		store.set('guidance', { ...g, tours: { ...g.tours, [id]: state } });
	}

	/*
	 * OFFER WHAT HAS NOT BEEN OFFERED, AND SAY SO AT ONCE. Tracked: the store's
	 * state for the tour on screen, the tour id and whether this place may offer
	 * at all. The write is the store's (injected), so it runs untracked and
	 * after the render settles.
	 */
	$effect(() => {
		const store = preferences;
		const id = tour;
		if (!store || !canOffer || !prefs) return;
		const state = prefs.current.guidance.tours[id];
		if (!shouldOfferTour(state)) return;
		untrack(() => {
			if (runSteps) return;
			offerOpen = true;
			// Only over `unseen`: an answer given before this lands ("Not now",
			// a run that already ended) is the newer fact and must not be undone.
			queueMicrotask(() => {
				if (shouldOfferTour(store.current.guidance.tours[id])) setTourState(store, id, 'offered');
			});
		});
	});

	/** Where the steps are, for this page, at this width, now. */
	function targetShown(selector: string): boolean {
		const el = document.querySelector<HTMLElement>(selector);
		if (!el) return false;
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0;
	}

	/** Run the tour for the viewer on screen. Exported for the header's Tour control. */
	export function start() {
		onstart?.();
		offerOpen = false;
		const id = tour;
		// Let a closing menu leave the layout before anything is measured.
		queueMicrotask(() => {
			const steps = resolveTourSteps(CLASSROOM_TOURS[id], targetShown, tourModKey(navigator.platform));
			runTour = id;
			runSteps = steps;
			runKey += 1;
		});
	}

	function onRunClose(reason: TourCloseReason) {
		const id = runTour;
		runSteps = null;
		runTour = null;
		const store = preferences;
		if (!store || !id) return;
		// A replay never takes "taken" back: skipping a second look is not
		// the same fact as never having finished it.
		const before = store.current.guidance.tours[id];
		setTourState(store, id, before === 'finished' ? 'finished' : tourStateAfter(reason));
	}

	function notNow() {
		const store = preferences;
		const id = tour;
		const hadFocus = !!offerEl?.contains(document.activeElement);
		offerOpen = false;
		if (store) setTourState(store, id, 'dismissed');
		if (hadFocus) queueMicrotask(() => returnFocus?.()?.focus());
	}

	/*
	 * ESCAPE PUTS THE OFFER AWAY, but only where the press is plainly for it:
	 * focus inside the offer, or on nothing at all with no dialog or menu open.
	 * Anywhere else Escape belongs to whatever has focus (the class menu, a
	 * field, the palette), and taking it from them would be the bug.
	 */
	function onWindowKey(e: KeyboardEvent) {
		if (!offerOpen || e.key !== 'Escape' || e.defaultPrevented) return;
		const active = document.activeElement;
		const inOffer = !!offerEl && !!active && offerEl.contains(active);
		const onNothing = !active || active === document.body;
		if (!inOffer && !onNothing) return;
		if (!inOffer && document.querySelector('dialog[open], [aria-expanded="true"]')) return;
		e.preventDefault();
		notNow();
	}

	$effect(() => registerCommandHandler('tour.start', () => start()));
</script>

<svelte:window onkeydown={onWindowKey} />

{#if offerOpen && !runSteps}
	<section class="tour-offer" aria-label="Tour offer" data-testid="tour-offer" data-tour-id={tour} bind:this={offerEl}>
		<svg class="tour-offer-glyph" viewBox="0 0 24 24" aria-hidden="true"
			><path d="M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM9.5 14.5l1.5-4.5 4.5-1.5-1.5 4.5z" /></svg
		>
		<p class="tour-offer-text">New to IDEA Classroom?</p>
		<div class="tour-offer-actions">
			<button type="button" class="tour-offer-btn primary" data-testid="tour-offer-start" onclick={start}
				>Show me around</button
			>
			<button type="button" class="tour-offer-btn" data-testid="tour-offer-dismiss" onclick={notNow}>Not now</button>
		</div>
	</section>
{/if}

{#if runSteps}
	{#key runKey}
		<SpotlightTour steps={runSteps} onclose={onRunClose} {returnFocus} />
	{/key}
{/if}

<style>
	/* One line under the header at every width it fits, wrapping the buttons
	   under the words on a phone. It is chrome, so it spans the content from
	   the gutter like the trail below it. */
	.tour-offer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin: var(--space-2) var(--cr-gutter, 1.2rem) 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--boundary);
		border-left: 3px solid var(--green);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		color: var(--text-1);
	}
	.tour-offer-glyph {
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
	.tour-offer-text {
		flex: 1 1 12rem;
		margin: 0;
		font-size: 0.95rem;
	}
	.tour-offer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.tour-offer-btn {
		appearance: none;
		min-height: 44px;
		padding: 0 var(--space-3);
		font: inherit;
		font-size: 0.86rem;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		cursor: pointer;
		white-space: nowrap;
	}
	.tour-offer-btn:hover {
		border-color: var(--gold);
	}
	/* The primary is marked by an edge and a rule as well as its colour. */
	.tour-offer-btn.primary {
		border-color: var(--green);
		box-shadow: inset 0 -2px 0 var(--green);
		font-weight: 600;
	}
</style>
