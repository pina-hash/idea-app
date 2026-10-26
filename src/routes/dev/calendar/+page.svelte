<script lang="ts">
	/**
	 * THE CALENDAR HARNESS (ledger 0439). Mounts the REAL `CalendarPage`,
	 * `WeekStrip` and `PacingStrip` over `_fixture.ts`:
	 *   ?part=page (default)  the calendar; &view=list, &scope=1 (one class),
	 *                         &admin=1 (the event form), &m=YYYY-MM
	 *   ?part=strip           the "this week" strip, as My Classes shows it
	 *   ?part=pacing          the day-by-day plan above a worksheet
	 * Writes go to an in-memory stand-in; `window.__calendar` holds the counts
	 * the browser pass reads.
	 */
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import CalendarPage from '$lib/calendar/CalendarPage.svelte';
	import WeekStrip from '$lib/calendar/WeekStrip.svelte';
	import PacingStrip from '$lib/calendar/PacingStrip.svelte';
	import { parseCalendarFeed, type CalendarEvent } from '$lib/calendar/model';
	import { hxScheduleFor, parseItemPacing } from '$lib/calendar/item-schedule';
	import type { CalendarTransports } from '$lib/calendar/transports';
	import type { HxProgress } from '$lib/classroom/html-assignment/progress';
	import { SECTION_A, fixtureFeed, fixturePacing } from './_fixture';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const q = (k: string) => page.url.searchParams.get(k);
	const part = $derived(q('part') ?? 'page');
	const admin = $derived(q('admin') === '1');
	const feed = $derived(parseCalendarFeed(fixtureFeed({ admin }))!);
	const schoolState = $derived({ events: data.school as CalendarEvent[], status: 'ok' as const });
	const roboticsState = $derived({ events: data.robotics as CalendarEvent[], status: 'ok' as const });

	const transports: CalendarTransports = {
		savePrefs: async () => ({ ok: true }),
		link: async () => ({ ok: true, token: 'a'.repeat(64) }),
		revokeLink: async () => ({ ok: true }),
		saveEvent: async () => ({ ok: true, id: 'new' }),
		removeEvent: async () => ({ ok: true })
	};

	// The rail's answer for the pacing strip: the brief and roles modules done.
	const progress = {
		modules: [
			{ id: 'brief', weight: 1, done: true },
			{ id: 'roles', weight: 1, done: false },
			{ id: 'sketch', weight: 1, done: false },
			{ id: 'energy', weight: 1, done: false }
		]
	} as unknown as HxProgress;
	const schedule = hxScheduleFor(parseItemPacing(fixturePacing())!, progress);

	$effect(() => {
		if (!browser) return;
		void part;
		queueMicrotask(() => {
			(window as unknown as Record<string, unknown>).__calendar = {
				cells: document.querySelectorAll('.cal-cell').length,
				layers: document.querySelectorAll('[data-testid="calendar-layers"] button').length,
				events: document.querySelectorAll('.ev').length,
				stripDays: document.querySelectorAll('[data-testid="week-strip"] .wd').length,
				paceSteps: document.querySelectorAll('[data-testid="pacing-strip"] .pace-step').length
			};
		});
	});
</script>

<div class="harness">
	{#if part === 'strip'}
		<div class="strip-wrap">
			<WeekStrip supabase={null} preload={{ feed, outside: [...schoolState.events, ...roboticsState.events] }} />
		</div>
	{:else if part === 'pacing'}
		<div class="strip-wrap">
			<PacingStrip {schedule} />
		</div>
	{:else}
		{#key `${data.month}-${q('view')}-${q('scope')}`}
			<CalendarPage
				{feed}
				month={data.month}
				today={feed.today}
				school={schoolState}
				robotics={roboticsState}
				{transports}
				scope={q('scope') === '1' ? { id: SECTION_A, label: 'Block 2' } : null}
				hrefFor={(m) => `?m=${m}${admin ? '&admin=1' : ''}`}
				origin="https://ideabosco.com"
				initialView={q('view') === 'list' ? 'list' : q('view') === 'month' ? 'month' : null}
			/>
		{/key}
	{/if}
</div>

<style>
	.harness {
		min-height: 100vh;
		background: var(--bg0);
	}
	.strip-wrap {
		max-width: 960px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
