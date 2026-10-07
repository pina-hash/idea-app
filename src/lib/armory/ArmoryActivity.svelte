<script lang="ts">
	/**
	 * THE ACTIVITY VIEW: what happened lately, in words, newest first. Fifteen
	 * lines, then "Show more" up to the forty the page load holds. Names come
	 * from the page's one name map, so a person reads the same here as on a file
	 * row or in the team.
	 */
	import { activityWords, checkedInReleases, whenWords, type ArmoryChange } from './view';

	const FIRST = 15;

	let {
		activity,
		fileName,
		names,
		now
	}: {
		activity: ArmoryChange[];
		fileName: (id: string) => string | null;
		names: ReadonlyMap<string, string | null>;
		now: number;
	} = $props();

	let all = $state(false);
	const checkedIn = $derived(checkedInReleases(activity));
	const lines = $derived(
		activity
			.map((c) => ({ c, words: activityWords(c, fileName, checkedIn.has(c.cursor), names) }))
			.filter((x): x is { c: ArmoryChange; words: string } => x.words !== null)
	);
	const shown = $derived(all ? lines : lines.slice(0, FIRST));
</script>

<section class="ar-view-panel" aria-labelledby="ar-activity-h" data-testid="armory-activity">
	<h2 class="ar-visually-hidden" id="ar-activity-h">What happened lately</h2>
	{#if lines.length === 0}
		<p class="ar-message">Nothing yet.</p>
	{:else}
		<ol class="ar-well ar-activity">
			{#each shown as { c, words } (c.cursor)}
				<li data-kind={c.kind}>
					<span class="ar-activity-when">{whenWords(c.created_at, now)}</span>
					<span>{words}</span>
				</li>
			{/each}
		</ol>
		{#if lines.length > shown.length}
			<div class="ar-row-actions ar-more">
				<button class="btn secondary ar-btn" type="button" data-testid="armory-activity-more" onclick={() => (all = true)}>
					Show {lines.length - shown.length} more
				</button>
			</div>
		{/if}
	{/if}
</section>
