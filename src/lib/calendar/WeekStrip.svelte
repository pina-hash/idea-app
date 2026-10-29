<script lang="ts">
	/**
	 * THIS WEEK, WHERE A STUDENT ALREADY LOOKS (ledger 0439): Monday to Friday
	 * of the school week (the next one on a weekend), every layer the viewer
	 * left on, three events a day and a count of the rest, and the door to the
	 * whole calendar. My Classes shows every class; a class page shows its own.
	 *
	 * IT LOADS ITSELF, once, on mount: `calendar_feed` (which re-checks the
	 * caller and names today) and the outside feeds through
	 * `/api/calendar/outside`. It runs no interval, and it renders nothing when
	 * the calendar cannot be read: a strip that says "error" on every class page
	 * is worse than one that is absent for a moment.
	 */
	import { onMount, untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import LayerMark from './LayerMark.svelte';
	import {
		dayWords,
		eventHref,
		eventsOnDay,
		isNoSchoolDay,
		layerInfo,
		mergeEvents,
		parseCalendarFeed,
		schoolWeek,
		visibleEvents,
		type CalendarEvent,
		type CalendarFeed
	} from './model';

	let {
		supabase,
		scope = null,
		calendarHref = '/calendar',
		basePath = '/classroom',
		/** A harness hands the answers in instead of the network. */
		preload = null
	}: {
		supabase: SupabaseClient | null;
		scope?: string | null;
		calendarHref?: string;
		basePath?: string;
		preload?: { feed: CalendarFeed; outside: CalendarEvent[] } | null;
	} = $props();

	let feed = $state<CalendarFeed | null>(null);
	let outside = $state<CalendarEvent[]>([]);

	async function read() {
		if (preload) {
			feed = preload.feed;
			outside = preload.outside;
			return;
		}
		if (!supabase) return;
		const { data, error } = await supabase.rpc('calendar_feed', { p_from: null, p_to: null });
		if (error) return;
		const parsed = parseCalendarFeed(data);
		if (!parsed) return;
		feed = parsed;
		const week = schoolWeek(parsed.today);
		try {
			const res = await fetch(`/api/calendar/outside?from=${week[0]}&to=${week[4]}`);
			if (res.ok) {
				const body = (await res.json()) as { school?: CalendarEvent[]; robotics?: CalendarEvent[] };
				outside = [...(body.school ?? []), ...(body.robotics ?? [])];
			}
		} catch {
			outside = [];
		}
	}
	onMount(() => {
		untrack(() => void read());
	});

	const week = $derived(feed ? schoolWeek(feed.today) : []);
	const shown = $derived(feed ? visibleEvents(mergeEvents(feed.events, outside), feed.prefs, scope) : []);
	const days = $derived(week.map((day) => ({ day, events: eventsOnDay(shown, day), closed: isNoSchoolDay(shown, day) })));
	const total = $derived(days.reduce((n, d) => n + d.events.length, 0));
	const thisYear = $derived(feed?.today.slice(0, 4) ?? null);
</script>

{#if feed}
	<section class="week card" aria-labelledby="week-strip-title" data-testid="week-strip">
		<div class="week-head">
			<h2 class="section-label" id="week-strip-title">{week[0] && feed.today < week[0] ? 'Next week' : 'This week'}</h2>
			<a class="btn secondary tiny week-open" href={calendarHref}>Calendar</a>
		</div>
		{#if total === 0}
			<p class="note">Nothing on the calendar {feed.today < week[0] ? 'next' : 'this'} week.</p>
		{:else}
			<ol class="week-days">
				{#each days as d (d.day)}
					<li class="wd" class:today={d.day === feed.today} class:closed={d.closed} class:empty={!d.events.length} data-day={d.day}>
						<p class="wd-date">{dayWords(d.day, thisYear)}{d.day === feed.today ? ' · today' : ''}</p>
						{#if d.events.length}
							<!-- A DENSE STRIP, DECLARED (ledger 0469): three events a day, 3px
							     apart, each a 24px line. 44px each would make a week three
							     times as tall, and the full calendar one tap away has the 44px
							     rows; so the strip stands on the 24px absolute floor and says
							     so where the visual pass reads it. -->
							<ul class="wd-events" data-tap-floor="24">
								{#each d.events.slice(0, 3) as e (e.id)}
									{@const href = eventHref(e, basePath, scope)}
									{@const li = layerInfo(e.layer)}
									<li class="wd-ev" style:--layer={li.color} data-kind={e.kind} data-layer={e.layer}>
										<LayerMark layer={li} size={9} />
										{#if e.kind === 'due'}<b>Due</b>{/if}
										{#if href}<a class="wd-ev-link" {href}>{e.title}</a>{:else}<span>{e.title}</span>{/if}
									</li>
								{/each}
								{#if d.events.length > 3}<li class="wd-more"><a class="wd-more-link" href={calendarHref}>{d.events.length - 3} more</a></li>{/if}
							</ul>
						{:else}
							<p class="wd-none">Nothing</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
{/if}

<style>
	.week {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
	}
	.week-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.week-head .section-label {
		margin: 0;
	}
	.week-open {
		min-height: 44px;
	}
	.week-days {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
	.wd {
		display: grid;
		align-content: start;
		gap: 0.3rem;
		min-width: 0;
		padding: 0.45rem 0.5rem;
		border-radius: 8px;
		background: linear-gradient(var(--plate-inset-top, var(--bg1)), var(--plate-inset-bot, var(--bg0)));
		box-shadow: inset 0 1px 2px var(--plate-inset-shade, rgb(0 0 0 / 0.4));
	}
	.wd.today {
		box-shadow: inset 0 0 0 2px var(--plate-accent, var(--green));
	}
	.wd.closed {
		background: repeating-linear-gradient(135deg, transparent 0 6px, rgb(127 127 127 / 0.08) 6px 12px),
			linear-gradient(var(--plate-inset-top, var(--bg1)), var(--plate-inset-bot, var(--bg0)));
	}
	.wd-date {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.wd.today .wd-date {
		color: var(--green);
	}
	.wd-events {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 3px;
	}
	.wd-ev {
		display: flex;
		gap: 0.3rem;
		align-items: center;
		min-width: 0;
		font-size: 0.9rem;
		line-height: 1.3;
		padding: 0 0.35rem;
		border-radius: 4px;
		background: color-mix(in srgb, var(--layer) 12%, transparent);
	}
	.wd-ev :is(a, span) {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--white);
	}
	.wd-ev a {
		text-decoration: none;
		/* The 24px line the strip declares (it read 18.7). */
		line-height: 24px;
	}
	.wd-ev a:hover {
		text-decoration: underline;
	}
	.wd-ev b {
		flex: none;
		font-family: var(--font-mono);
		font-weight: 400;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--amber);
	}
	.wd-more,
	.wd-none {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--dim);
	}
	.wd-more a {
		display: inline-block;
		line-height: 24px;
		color: inherit;
	}
	/* A phone: one day per line, and a day with nothing on takes no room. */
	@media (max-width: 719px) {
		.week-days {
			grid-template-columns: minmax(0, 1fr);
		}
		.wd.empty:not(.today) {
			display: none;
		}
		.wd {
			grid-template-columns: 5.5rem minmax(0, 1fr);
			align-items: start;
		}
	}
</style>
