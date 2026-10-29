<script lang="ts">
	import AppSubNav from '$lib/shell/AppSubNav.svelte';
	import { areasForScope, type CoinDeskAreaId, type CoinStaffScope } from './nav';

	/**
	 * The persistent sub-nav for the /coin-desk route group. ONE component,
	 * two modes, so the real layout and the dev harness can never drift apart
	 * on what areas exist or what they are called:
	 *
	 *  - no `onSelect` (the real layout): renders real <a href> links, so each
	 *    area is a real route with a real URL.
	 *  - with `onSelect` (the dev harness, which has no router): renders
	 *    buttons that switch a local view instead.
	 *
	 * The strip is the site's one app sub-nav (`$lib/shell/AppSubNav`, ledger
	 * 0468): the Plate's pads with their LEDs, the current area lit. It was the
	 * Ledger's underlined tab bar in Orbitron; every app's places are pads now.
	 */
	let {
		active,
		scope = 'full',
		onSelect
	}: {
		active: CoinDeskAreaId;
		/** Section coin staff are offered only their areas (decision 68). */
		scope?: CoinStaffScope;
		onSelect?: (id: CoinDeskAreaId) => void;
	} = $props();

	const areas = $derived(areasForScope(scope));
	const current = $derived(areas.find((a) => a.id === active) ?? areas[0]);
</script>

<div class="desk-nav">
	<AppSubNav
		label="Coin Desk sections"
		testid="desk-nav"
		items={areas.map((a) => ({ id: a.id, label: a.label, href: onSelect ? undefined : a.href, current: a.id === active }))}
		onselect={onSelect ? (id) => onSelect?.(id as CoinDeskAreaId) : undefined}
		blurb={current.blurb}
	/>
</div>
