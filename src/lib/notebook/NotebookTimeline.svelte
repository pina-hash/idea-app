<script lang="ts">
	import { entryTitle } from '$lib/notebook';
	import { submissionFileSrc } from '$lib/classroom/assignment-spec';
	import { timelineDayLabel, type TimelineDay } from '$lib/notebook/timeline';

	/**
	 * ONE CLASS'S PROJECT TIMELINE (ledger 0297, package F4b): the student's
	 * notebook entries, their hand-ins and the photos they put into
	 * assignments, newest first, grouped by school day. Read-only for
	 * everything that came from an assignment: it is shown where it already is,
	 * never copied. `$lib/notebook/timeline` builds it; this renders it.
	 *
	 * The streak is the student's own count of class days in a row with an
	 * entry. It is never compared with anybody's, and at zero it says nothing.
	 */
	let {
		days,
		today,
		streak = 0,
		handInsReady = true,
		notebookHref,
		itemHref
	}: {
		days: TimelineDay[];
		today: string;
		streak?: number;
		/** False when the hand-in read failed: the timeline says so rather than looking empty. */
		handInsReady?: boolean;
		notebookHref: string;
		itemHref: (itemId: string) => string;
	} = $props();

	/** A picture that fails to decode shows its name instead (the classroom's own rule). */
	let broken = $state<Record<string, true>>({});
</script>

<section class="nbt" data-testid="notebook-timeline" aria-labelledby="nbt-head">
	<header class="nbt-head">
		<h1 id="nbt-head" class="nbt-title">Timeline</h1>
		{#if streak > 0}
			<span class="nbt-streak" data-testid="nbt-streak">
				<span aria-hidden="true">▮</span>
				{streak === 1 ? '1 class day in a row' : `${streak} class days in a row`}
			</span>
		{/if}
		<a class="nbt-back tap-44" href={notebookHref}>Notebook</a>
	</header>
	{#if !handInsReady}
		<p class="nbt-note" role="status">Your hand-ins could not be loaded, so only notebook entries are shown.</p>
	{/if}

	{#if days.length}
		<ol class="nbt-days">
			{#each days as day (day.day)}
				<li class="nbt-day" data-testid="nbt-day">
					<h2 class="nbt-day-head">{timelineDayLabel(day.day, today)}</h2>
					<ul class="nbt-events">
						{#each day.events as ev (ev.id)}
							<li class="nbt-event" data-kind={ev.kind} data-testid="nbt-event">
								{#if ev.kind === 'entry'}
									<span class="nbt-kind"><span aria-hidden="true">✎</span> Notebook</span>
									<a class="nbt-link tap-44" href={notebookHref}>{entryTitle(ev.entry)}</a>
									<span class="nbt-meta">
										{ev.photos === 1 ? '1 photo' : `${ev.photos} photos`}{ev.draft ? ' · Draft' : ''}
									</span>
								{:else if ev.kind === 'hand-in'}
									<span class="nbt-kind"><span aria-hidden="true">↥</span> Handed in</span>
									<a class="nbt-link tap-44" href={itemHref(ev.itemId)}>{ev.itemTitle}</a>
									<span class="nbt-meta">{ev.returned ? 'Returned' : 'Turned in'}</span>
								{:else}
									<span class="nbt-kind"><span aria-hidden="true">▣</span> Photos in an assignment</span>
									<a class="nbt-link tap-44" href={itemHref(ev.itemId)}>{ev.itemTitle}</a>
									<span class="nbt-thumbs">
										{#each ev.files.slice(0, 6) as f (f.id)}
											{#if broken[f.id]}
												<span class="nbt-meta">{f.filename}</span>
											{:else}
												<img
													src={submissionFileSrc(f.id)}
													alt={f.filename}
													loading="lazy"
													onerror={() => (broken = { ...broken, [f.id]: true })}
												/>
											{/if}
										{/each}
										{#if ev.files.length > 6}<span class="nbt-meta">+{ev.files.length - 6}</span>{/if}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="nbt-note" data-testid="nbt-empty">Nothing in this class yet.</p>
	{/if}
</section>

<style>
	.nbt {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		max-width: var(--measure-reading, 44rem);
		width: 100%;
		margin: 0 auto;
		padding: var(--space-4, 1rem) var(--cr-gutter, 1rem);
		box-sizing: border-box;
		min-width: 0;
	}
	.nbt-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
	}
	.nbt-title {
		margin: 0;
		font-size: 1.6rem;
	}
	.nbt-streak {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
	}
	.nbt-back {
		margin-left: auto;
		color: var(--body-link, var(--cyan));
	}
	.nbt-note {
		margin: 0;
		color: var(--text-2);
	}
	.nbt-days,
	.nbt-events {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.nbt-day + .nbt-day {
		margin-top: var(--space-4, 1rem);
	}
	.nbt-day-head {
		margin: 0 0 var(--space-2, 0.5rem);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.nbt-day-head::before {
		content: none;
	}
	.nbt-event {
		display: grid;
		gap: 2px;
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		border-left: 2px solid var(--hairline);
		min-width: 0;
	}
	.nbt-event + .nbt-event {
		margin-top: var(--space-2, 0.5rem);
	}
	.nbt-kind {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.nbt-link {
		color: var(--body-link, var(--cyan));
		overflow-wrap: anywhere;
	}
	.nbt-meta {
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.nbt-thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
		align-items: center;
	}
	.nbt-thumbs img {
		width: 4rem;
		height: 4rem;
		object-fit: contain;
		background: var(--surface-2);
		border-radius: var(--radius-sm, 6px);
	}
</style>
