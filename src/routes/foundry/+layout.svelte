<script lang="ts">
	/**
	 * The Foundry's own room.
	 *
	 * THREE JOBS, the classroom layout's three, each exactly once: it loads the
	 * forge stylesheet (forge.css), provides the `.fg-root` wrapper every rule
	 * in it is scoped under -- which is also what the `.bg-fx` suppression keys
	 * off -- and renders the PERSISTENT SHELL: the masthead, the molten seam
	 * and the tabs, so every page under /foundry sits inside one structure
	 * instead of each owning its own header and its own way back.
	 *
	 * The routing knowledge lives in `$lib/foundry/nav`, not in the shell: the
	 * shell takes finished props, so a dev harness can mount it with no router.
	 * A COMPONENT reading `page.url` is fine here -- the layout LOAD is what
	 * must never read `url`, and it does not.
	 *
	 * `isAdmin` rides `page.data` from the root layout; `reviewPending` comes
	 * from this route's own layout load, which asks only for admins.
	 */
	import { page } from '$app/state';

	import '$lib/foundry/forge.css';
	import FoundryClosed from '$lib/foundry/FoundryClosed.svelte';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import { foundryClosureBlocks } from '$lib/foundry/access';
	import { locateFoundry } from '$lib/foundry/nav';

	let { data, children } = $props();

	const active = $derived(locateFoundry(page.url.pathname));

	/**
	 * THE CLASS GATE'S CLIENT HALF (0173, decision 01), NARROWED.
	 *
	 * The page loads beneath this already return nothing when a class has
	 * closed it AND this place is one a closure reaches -- that is the
	 * enforcement, on the server -- so what is left here is rendering the
	 * REASON rather than an empty area. Reading it off `data` rather than
	 * re-asking is what keeps one answer in one place; a component that asked
	 * again could disagree with the load that already withheld the payload.
	 *
	 * WHICH PLACES A CLOSURE REACHES IS `foundryClosureBlocks`, ONCE. The
	 * gallery stands down; the student's own shelf, the publish flow, the
	 * build contract and the manager's own control do not. The argument for
	 * that set is on `FOUNDRY_CLOSURE_BLOCKS` in `$lib/foundry/access`, and
	 * this reads it rather than restating it: a second list of blocked routes
	 * is how a page comes to be dark on the server and lit here.
	 *
	 * A COMPONENT MAY READ `page.url`; the layout LOAD may not, which is why
	 * the place is resolved here and not there. `active` is the same answer
	 * the tabs already read, so there is one resolution of it per render.
	 *
	 * ON A SURFACE A CLOSURE DOES NOT REACH, THE STUDENT IS STILL TOLD. A
	 * shelf that renders normally while the gallery tab answers a refusal is
	 * a room whose behaviour a student cannot predict, so the same component
	 * carries the same sentence as a notice above the page. One component,
	 * one sentence, two weights.
	 *
	 * THE SHELL STAYS. A closed student keeps the masthead and the way out,
	 * because the alternative is a page that looks broken.
	 */
	/**
	 * THE TWO PLACES A STUDENT'S BUNDLE ACTUALLY RUNS, and the only two that
	 * are full-height applications.
	 *
	 * THE REPORT THIS ANSWERS: "an open game scrolls off screen while the list
	 * scrolls under it." Under `scroll="page"` neither pane bounds itself, so
	 * the document owns the one scroll and moving down the card list carries
	 * the running app off the top. That is the right trade for a long form,
	 * which is why `page-flow` shipped and why the notebook keeps it -- its
	 * compose pane measures ~1200px and a sticky pane would answer a report
	 * about two scrollbars with two scrollbars. It is the WRONG trade for a
	 * pane whose content is a fixed-size stage you are watching.
	 *
	 * `fill` IS THE VARIANT THAT NAMES NO CHROME HEIGHT, which is why this is
	 * a class on the room rather than a `100vh - <constant>` anywhere: the
	 * masthead measures itself and the body takes the rest, so a wrapped
	 * wordmark or an added notice costs a row instead of producing a second
	 * scrollbar. Above 1024px only; a phone keeps the document's single
	 * scroll.
	 *
	 * Read off `active`, the same answer the tabs read, rather than from a
	 * second list of routes.
	 */
	const isAppShell = $derived(active === 'gallery' || active === 'review');

	const closedSections = $derived(data.foundryAccess?.closed ?? []);
	const isClosed = $derived(data.foundryAccess ? data.foundryAccess.open === false : false);
	/** Closed AND this is a place a closure reaches. */
	const isBlocked = $derived(isClosed && foundryClosureBlocks(active));
	/** Closed, but this place carries on. The notice, not the refusal. */
	const isNoticed = $derived(isClosed && !isBlocked);
</script>

<div class="fg-root" class:cr-app={isAppShell && !isBlocked}>
	<FoundryShell
		{active}
		isAdmin={page.data.isAdmin === true}
		managesSection={data.managesSection === true}
		reviewPending={data.reviewPending ?? null}
	>
		{#if isBlocked}
			<FoundryClosed closed={closedSections} />
		{:else}
			{#if isNoticed}
				<FoundryClosed closed={closedSections} variant="notice" />
			{/if}
			{@render children()}
		{/if}
	</FoundryShell>
</div>
