<script lang="ts">
	/**
	 * THE CHECKED OUT VIEW (Armory v0.3 item 2, and Mr. Pina's report of
	 * 2026-10-07 that sixty checkouts meant scrolling tens of times): one
	 * compact table, oldest first, searched, filtered by holder, paged 25 at a
	 * time. One line a row above 48rem of view; two below.
	 *
	 * FORCE CHECK IN IS THE SAME RPC THE APP'S BUTTON CALLS (`armory_break_lock`),
	 * offered when the route hands a `force` transport in: a mentor, a CAD lead,
	 * or a site admin once the server has 0233. Absent, the column says why
	 * rather than going quiet (CLAUDE.md, "A CONTROL THAT IS ABSENT FOR A REASON
	 * SAYS THE REASON").
	 *
	 * THE HOLDER FILTER IS COMPONENT STATE (`holder`, bindable so the Team view
	 * can open this view on one person). It never enters the address: a full
	 * reload would carry a student's school address to the server's logs.
	 */
	import { untrack } from 'svelte';
	import { CHECKOUT_PAGE, filterCheckouts, holderChips, holderFilterOf, type HolderFilter } from './checkouts';
	import type { ForceCheckIn } from './force-check-in.svelte';
	import { holderWords } from './team';
	import { holderName, VERBS, whenWords, type ArmoryCheckout } from './view';

	let {
		projectId,
		checkouts,
		names,
		now,
		me,
		force = null,
		forceNeedsComputer = false,
		holder = $bindable('all'),
		initialQuery = ''
	}: {
		projectId: string;
		checkouts: ArmoryCheckout[];
		names: ReadonlyMap<string, string | null>;
		now: number;
		me: string;
		force?: ForceCheckIn | null;
		/** The caller may force a check in, but this database still needs one of their computers to send it from. */
		forceNeedsComputer?: boolean;
		holder?: HolderFilter;
		initialQuery?: string;
	} = $props();

	let query = $state(untrack(() => initialQuery));
	let limit = $state(CHECKOUT_PAGE);

	const chips = $derived(holderChips(checkouts, me, names));
	/* The filter IN FORCE is asked of the list every read: a person who has
	   checked everything in since the filter was chosen (a reload, the Team
	   view's link) names nobody, so the view shows everyone and says why
	   rather than "0 of N shown" under keys none of which is pressed. */
	const active = $derived(holderFilterOf(holder, checkouts));
	const gone = $derived(active !== holder ? holderName(holder, names) : null);
	const shown = $derived(filterCheckouts(checkouts, active, query, me, names));
	const rows = $derived(shown.slice(0, limit));

	function pick(id: HolderFilter) {
		holder = id;
		limit = CHECKOUT_PAGE;
	}
</script>

<section class="ar-view-panel" aria-labelledby="ar-out-h" data-testid="armory-checkouts">
	<h2 class="ar-visually-hidden" id="ar-out-h">Checked out</h2>
	{#if checkouts.length === 0}
		<p class="ar-message" data-testid="armory-checkouts-none">Nothing is checked out. Every file is available.</p>
	{:else}
		<div class="ar-toolbar">
			<label class="ar-field ar-search">
				<span>Search what is checked out</span>
				<input
					class="plate-well"
					type="search"
					bind:value={query}
					oninput={() => (limit = CHECKOUT_PAGE)}
					placeholder="Part, folder, person or computer"
					data-testid="armory-out-search"
				/>
			</label>
			<!-- Keys beside the search where the view is wide; one select where it
			     is not, because seven keys wrapped to 255px on a phone. One state,
			     two spellings of the control, and only one is ever displayed. -->
			<div class="ar-filters ar-holders" role="group" aria-label="Checked out by">
				{#each chips as chip (chip.id)}
					<button
						class="btn secondary ar-btn ar-filter"
						type="button"
						aria-pressed={active === chip.id}
						data-testid="armory-holder"
						data-holder={chip.id === 'all' || chip.id === 'me' ? chip.id : 'person'}
						data-count={chip.count}
						onclick={() => pick(chip.id)}
					>
						{chip.label} ({chip.count})
					</button>
				{/each}
			</div>
			<label class="ar-field ar-holder-pick">
				<span>Checked out by</span>
				<select
					class="plate-well"
					value={active}
					data-testid="armory-holder-select"
					onchange={(e) => pick((e.currentTarget as HTMLSelectElement).value)}
				>
					{#each chips as chip (chip.id)}<option value={chip.id}>{chip.label} ({chip.count})</option>{/each}
				</select>
			</label>
		</div>
		{#if gone}
			<p class="ar-message" data-testid="armory-holder-gone">{gone} has nothing checked out now, so everyone is shown.</p>
		{/if}
		<p class="ar-message ar-count" role="status" data-testid="armory-out-count">
			{shown.length === checkouts.length
				? `${checkouts.length} ${checkouts.length === 1 ? 'file' : 'files'} checked out, oldest first.`
				: `${shown.length} of ${checkouts.length} shown, oldest first.`}
			{#if shown.length > rows.length}Showing the first {rows.length}.{/if}
		</p>
		{#if forceNeedsComputer}
			<p class="ar-message" data-testid="armory-take-back-needs-computer">
				{VERBS.takeBack} works once one of your computers is connected, until the server has the Armory 0.3
				update. <a href="/armory/start">Set one up</a>.
			</p>
		{/if}
		{#if force?.message}<p class={`ar-message ${force.bad ? 'bad' : ''}`} role="status">{force.message}</p>{/if}
		{#if shown.length === 0}
			<p class="ar-message" data-testid="armory-out-none">Nothing checked out matches that.</p>
		{:else}
			<!-- The rows change `display` below 48rem, which some engines (Safari
			     among them) take as leaving the table, so the roles are written
			     out and the column headers are still announced. They restate the
			     implicit roles on purpose, hence each ignore. -->
			<!-- svelte-ignore a11y_no_redundant_roles -->
			<table class="ar-well ar-out-table" role="table" data-testid="armory-out-table">
				<!-- svelte-ignore a11y_no_redundant_roles -->
				<thead role="rowgroup">
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<tr role="row">
						<th scope="col" role="columnheader">File and folder</th>
						<th scope="col" role="columnheader">Checked out by</th>
						<th scope="col" role="columnheader">Computer</th>
						<th scope="col" role="columnheader">Since</th>
						<th scope="col" role="columnheader"><span class="ar-visually-hidden">{VERBS.takeBack}</span></th>
					</tr>
				</thead>
				<!-- svelte-ignore a11y_no_redundant_roles -->
				<tbody role="rowgroup">
					{#each rows as c (c.file_id)}
						<!-- svelte-ignore a11y_no_redundant_roles -->
						<tr class="ar-out-row" role="row" data-testid="armory-checkout">
							<td class="ar-out-file" role="cell">
								<a href={`/armory/${projectId}/file/${c.file_id}`} title={`${c.folder ? `${c.folder}/` : ''}${c.name}`}>
									<span class="ar-file-glyph ar-tone-editing" aria-hidden="true">✎</span>
									<span class="ar-out-name">{c.name}</span>
									{#if c.folder}<span class="ar-out-folder">{c.folder}</span>{/if}
								</a>
							</td>
							<td class="ar-out-who" role="cell">{holderWords(c.holder_email, me, names)}</td>
							<td class="ar-out-device" role="cell">{c.device_name ?? 'a computer'}</td>
							<td class="ar-out-since" role="cell">{whenWords(c.since, now)}</td>
							<td class="ar-out-key" role="cell">
								{#if force && c.holder_email !== me}
									<button
										class={`btn ar-btn ar-row-key ${force.armed === c.file_id ? 'danger' : 'secondary'}`}
										type="button"
										aria-disabled={force.busy}
										data-testid="armory-take-back"
										onclick={() => force.press(c.file_id, c.name)}
									>
										{force.armed === c.file_id ? `${VERBS.takeBack}?` : VERBS.takeBack}
									</button>
								{/if}
							</td>
						</tr>
						{#if force && force.armed === c.file_id}
							<!-- svelte-ignore a11y_no_redundant_roles -->
							<tr class="ar-out-warn-row" role="row">
								<td colspan="5" role="cell">
									<p class="ar-message bad ar-warn" role="alert" data-testid="armory-take-back-warning">
										Press {VERBS.takeBack} again. Anything {holderName(c.holder_email, names)} has not saved on
										{c.device_name ?? 'their computer'} is kept as a side version when that computer next connects, and
										the file becomes available to everyone.
									</p>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
			{#if shown.length > rows.length}
				<div class="ar-row-actions ar-more">
					<button class="btn secondary ar-btn" type="button" data-testid="armory-out-more" onclick={() => (limit += CHECKOUT_PAGE)}>
						Show {Math.min(CHECKOUT_PAGE, shown.length - rows.length)} more
					</button>
					<button class="btn secondary ar-btn" type="button" data-testid="armory-out-all" onclick={() => (limit = shown.length)}>
						Show all {shown.length}
					</button>
				</div>
			{/if}
		{/if}
	{/if}
</section>
