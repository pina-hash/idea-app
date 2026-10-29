<script lang="ts">
	import PageHeader from '$lib/shell/PageHeader.svelte';
	/**
	 * THE IDEA CALENDAR PAGE (ledger 0439): a month, or a list of the days with
	 * something on them, every layer the viewer left on, the chosen day's events
	 * beside it, the phone subscription and, for a site admin, adding a program
	 * event. `/calendar` and a class's own calendar mount it; `scope` narrows the
	 * class layers to one class.
	 *
	 * IT READS NO CLOCK. `today` and every event arrive in the load; the month
	 * moves by address (`?m=YYYY-MM`), so the load runs again for the new days.
	 * A layer or class switched off is saved through the site's one preferences
	 * path and applied on screen at once.
	 */
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		CALENDAR_LAYERS,
		WEEK_HEADS,
		dayWords,
		eventHref,
		eventStateWords,
		eventTimeWords,
		eventsOnDay,
		isNoSchoolDay,
		layerInfo,
		mergeEvents,
		monthGrid,
		monthOf,
		monthPlus,
		monthWords,
		sectionLabel,
		spanWords,
		visibleEvents,
		type CalendarEvent,
		type CalendarFeed,
		type CalendarLayer,
		type CalendarPrefs
	} from './model';
	import { subscriptionUrls, type CalendarEventDraft, type CalendarTransports } from './transports';
	import LayerMark from './LayerMark.svelte';

	type FeedState = { events: CalendarEvent[]; status: 'ok' | 'stale' | 'off' | 'failed' };

	let {
		feed,
		month,
		today,
		school,
		robotics,
		transports = null,
		scope = null,
		basePath = '/classroom',
		hrefFor = (m: string) => `?m=${m}`,
		origin = '',
		initialView = null
	}: {
		feed: CalendarFeed | null;
		month: string;
		today: string;
		school: FeedState;
		robotics: FeedState;
		transports?: CalendarTransports | null;
		/** One class: its id and how to name it. */
		scope?: { id: string; label: string } | null;
		basePath?: string;
		hrefFor?: (month: string) => string;
		/** The site's origin, for the subscription address. */
		origin?: string;
		/** Open on this view whatever this browser remembers (a harness). */
		initialView?: 'month' | 'list' | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	let prefs = $state<CalendarPrefs>(feed?.prefs ?? { hidden: [], hiddenSections: [] });
	let prefsNote = $state<string | null>(null);
	let view = $state<'month' | 'list'>('month');
	/* THE FILTERS SIT BEHIND ONE KEY ON A PHONE (ledger 0467): seven layer keys
	   and the class list took 205px of a 375px screen before the month began.
	   Wider than a phone the key is not drawn and the filters always show. */
	let filtersOpen = $state(false);
	const layersOn = $derived(CALENDAR_LAYERS.filter((l) => !prefs.hidden.includes(l.id)).length);
	// svelte-ignore state_referenced_locally
	let selected = $state<string>(monthOf(today) === month ? today : `${month}-01`);

	const VIEW_KEY = 'idea.calendar.view';
	onMount(() => {
		if (initialView) {
			view = initialView;
			return;
		}
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(VIEW_KEY);
		} catch {
			stored = null;
		}
		if (stored === 'month' || stored === 'list') view = stored;
		else if (window.matchMedia('(max-width: 719px)').matches) view = 'list';
	});
	function setView(v: 'month' | 'list') {
		view = v;
		try {
			localStorage.setItem(VIEW_KEY, v);
		} catch {
			/* a private window keeps the choice for this visit only */
		}
	}

	const all = $derived(mergeEvents(feed?.events ?? [], school.events, robotics.events));
	const shown = $derived(visibleEvents(all, prefs, scope?.id ?? null));
	const weeks = $derived(monthGrid(month));
	const thisYear = $derived(today.slice(0, 4));
	const dayEvents = $derived(eventsOnDay(shown, selected));
	const sections = $derived(feed?.sections ?? []);
	const listDays = $derived.by(() => {
		const days = new Map<string, CalendarEvent[]>();
		const first = `${month}-01`;
		const last = weeks[weeks.length - 1][6];
		for (const e of shown) {
			// A multi-day event lists on its first day in the month.
			const day = e.day < first ? first : e.day;
			if (day > last || (e.endDay ?? e.day) < first) continue;
			if (!days.has(day)) days.set(day, []);
			days.get(day)!.push(e);
		}
		return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	async function savePrefs(next: CalendarPrefs) {
		prefs = next;
		prefsNote = null;
		if (!transports) return;
		const res = await transports.savePrefs(next);
		if (!res.ok) prefsNote = res.message;
	}
	function toggleLayer(id: CalendarLayer) {
		const hidden = prefs.hidden.includes(id) ? prefs.hidden.filter((l) => l !== id) : [...prefs.hidden, id];
		void savePrefs({ ...prefs, hidden });
	}
	function toggleSection(id: string) {
		const off = prefs.hiddenSections.includes(id) ? prefs.hiddenSections.filter((s) => s !== id) : [...prefs.hiddenSections, id];
		void savePrefs({ ...prefs, hiddenSections: off });
	}

	const sectionName = (id: string) => {
		const s = sections.find((x) => x.id === id);
		return s ? sectionLabel(s) : null;
	};
	const countWords = (n: number) => (n === 0 ? 'nothing on' : n === 1 ? '1 thing on' : `${n} things on`);

	// --- the subscription -----------------------------------------------------
	// svelte-ignore state_referenced_locally
	let hasLink = $state(feed?.link ?? false);
	let token = $state<string | null>(null);
	let linkBusy = $state(false);
	let linkNote = $state<string | null>(null);
	let copied = $state(false);
	const urls = $derived(token ? subscriptionUrls(origin, token) : null);
	async function getLink(reset: boolean) {
		if (!transports) return;
		linkBusy = true;
		linkNote = null;
		const res = await transports.link(reset);
		linkBusy = false;
		if (!res.ok) {
			linkNote = res.message;
			return;
		}
		token = res.token;
		hasLink = true;
		if (reset) linkNote = 'A new link is ready. The old one stopped working.';
	}
	async function revoke() {
		if (!transports) return;
		linkBusy = true;
		const res = await transports.revokeLink();
		linkBusy = false;
		if (!res.ok) {
			linkNote = res.message;
			return;
		}
		token = null;
		hasLink = false;
		linkNote = 'Your link is off. A phone that had it stops updating.';
	}
	async function copyLink() {
		if (!urls) return;
		try {
			await navigator.clipboard.writeText(urls.https);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	// --- an admin's program events -------------------------------------------
	const blankDraft = (): CalendarEventDraft => ({
		id: null,
		layer: 'idea',
		title: '',
		startsOn: selected,
		endsOn: null,
		startTime: null,
		endTime: null,
		location: null,
		notes: null
	});
	let draft = $state<CalendarEventDraft | null>(null);
	let draftNote = $state<string | null>(null);
	let saving = $state(false);

	function editEvent(e: CalendarEvent) {
		draft = {
			id: e.eventId,
			layer: e.layer === 'robotics' ? 'robotics' : 'idea',
			title: e.title,
			startsOn: e.day,
			endsOn: e.endDay,
			startTime: e.startTime,
			endTime: e.endTime,
			location: e.location,
			notes: e.notes
		};
		draftNote = null;
	}
	async function saveDraft(ev: SubmitEvent) {
		ev.preventDefault();
		if (!draft || !transports) return;
		saving = true;
		const res = await transports.saveEvent({ ...draft, title: draft.title.trim(), endsOn: draft.endsOn || null, startTime: draft.startTime || null, endTime: draft.endTime || null });
		saving = false;
		if (!res.ok) {
			draftNote = res.message;
			return;
		}
		selected = draft.startsOn;
		draft = null;
		await invalidateAll();
	}
	async function removeEvent(e: CalendarEvent) {
		if (!transports || !e.eventId) return;
		const res = await transports.removeEvent(e.eventId);
		if (res.ok) await invalidateAll();
	}

	const statusLine = $derived(
		[
			school.status === 'failed' && !prefs.hidden.includes('school') ? 'The Bosco Tech calendar could not be read just now; its events are missing.' : null,
			school.status === 'stale' ? 'The Bosco Tech calendar is showing its last good copy.' : null,
			robotics.status === 'failed' && !prefs.hidden.includes('robotics') ? 'The robotics team calendar could not be read just now.' : null
		].filter(Boolean) as string[]
	);
</script>

{#snippet eventRow(e: CalendarEvent, withDay: boolean)}
	{@const info = layerInfo(e.layer)}
	{@const href = eventHref(e, basePath, scope?.id ?? null)}
	{@const time = eventTimeWords(e)}
	{@const state = eventStateWords(e)}
	{@const where = !scope && e.sectionIds.length ? sectionName(e.sectionIds[0]) : null}
	<li class="ev" style:--layer={info.color} data-layer={e.layer} data-kind={e.kind}>
		<span class="ev-stripe" aria-hidden="true"></span>
		<div class="ev-main">
			<p class="ev-title">
				{#if href}<a {href}>{e.title}</a>{:else}{e.title}{/if}
			</p>
			<p class="ev-meta">
				<span class="ev-layer"><LayerMark layer={info} size={10} />{info.label}</span>
				{#if e.kind === 'pacing' && e.itemTitle}<span>{e.itemTitle}</span>{/if}
				{#if withDay}<span>{spanWords(e, thisYear)}</span>{:else if e.endDay}<span>{spanWords(e, thisYear)}</span>{/if}
				{#if time}<span class:ev-due={e.kind === 'due'}>{time}</span>{/if}
				{#if where}<span>{where}</span>{/if}
				{#if e.location}<span>{e.location}</span>{/if}
				{#if state}<span class="ev-state">{state}</span>{/if}
			</p>
			{#if e.gate}<p class="ev-note">{e.gate}</p>{/if}
			{#if e.notes}<p class="ev-note">{e.notes}</p>{/if}
		</div>
		{#if feed?.admin && transports && e.eventId}
			<div class="ev-tools">
				<button type="button" class="btn secondary tiny" onclick={() => editEvent(e)}>Edit</button>
				<button type="button" class="btn secondary tiny" onclick={() => removeEvent(e)}>Remove</button>
			</div>
		{/if}
	</li>
{/snippet}

<div class="cal" data-testid="calendar" data-view={view}>
	<PageHeader
		eyebrow="IDEA Calendar"
		title={scope ? `${scope.label} calendar` : 'Calendar'}
		meta={scope
			? 'This class: posts, due dates, pacing and your team, with the school calendar.'
			: 'Your classes, your team, IDEA, robotics and the Bosco Tech calendar in one place.'}
	/>

	{#if !feed}
		<section class="card cal-empty" data-testid="calendar-not-ready">
			<h2 class="section-label">Calendar</h2>
			<p class="note">Your calendar is not available right now. Reload in a moment.</p>
		</section>
	{/if}

	<div class="cal-bar">
		<nav class="cal-nav" aria-label="Month">
			<a class="btn secondary" href={hrefFor(monthPlus(month, -1))} aria-label="Previous month" data-sveltekit-noscroll>
				<span aria-hidden="true">&lsaquo;</span>
			</a>
			<h2 class="cal-month" aria-live="polite">{monthWords(month)}</h2>
			<a class="btn secondary" href={hrefFor(monthPlus(month, 1))} aria-label="Next month" data-sveltekit-noscroll>
				<span aria-hidden="true">&rsaquo;</span>
			</a>
			{#if monthOf(today) !== month}
				<a class="btn secondary" href={hrefFor(monthOf(today))} data-sveltekit-noscroll>Today</a>
			{/if}
		</nav>
		<div class="cal-views" role="group" aria-label="View">
			<button type="button" class="btn secondary" aria-pressed={view === 'month'} onclick={() => setView('month')}>Month</button>
			<button type="button" class="btn secondary" aria-pressed={view === 'list'} onclick={() => setView('list')}>List</button>
		</div>
	</div>

	<div class="cal-filters" class:open={filtersOpen}>
		<button
			type="button"
			class="btn secondary cal-filters-toggle"
			aria-expanded={filtersOpen}
			aria-controls="cal-filters-panel"
			data-testid="calendar-filters-toggle"
			onclick={() => (filtersOpen = !filtersOpen)}
		>
			Layers: {layersOn} of {CALENDAR_LAYERS.length} on<span class="cal-filters-caret" aria-hidden="true"></span>
		</button>
		<div class="cal-filters-panel" id="cal-filters-panel">
			<!-- A key that is ON is lit in its OWN layer's colour, never in the
			     site green (green means act and done), and its glyph is solid; a
			     key that is off is a plain key with a hollow glyph. The word and
			     `aria-pressed` say it too. -->
			<div class="cal-layers" role="group" aria-label="Show on the calendar" data-testid="calendar-layers">
				{#each CALENDAR_LAYERS as layer (layer.id)}
					<button
						type="button"
						class="btn secondary layer-key"
						style:--layer={layer.color}
						aria-pressed={!prefs.hidden.includes(layer.id)}
						title={layer.describe}
						data-layer={layer.id}
						onclick={() => toggleLayer(layer.id)}
					>
						<LayerMark {layer} off={prefs.hidden.includes(layer.id)} />{layer.label}
					</button>
				{/each}
			</div>
			{#if !scope && sections.length > 1}
				<details class="cal-classes">
					<summary>Classes ({sections.length - prefs.hiddenSections.filter((s) => sections.some((x) => x.id === s)).length} of {sections.length} shown)</summary>
					<div class="cal-class-keys" role="group" aria-label="Classes on the calendar">
						{#each sections as s (s.id)}
							<button type="button" class="btn secondary tiny" aria-pressed={!prefs.hiddenSections.includes(s.id)} onclick={() => toggleSection(s.id)}>
								{sectionLabel(s)}
							</button>
						{/each}
					</div>
				</details>
			{/if}
		</div>
	</div>
	{#if prefsNote}<p class="note cal-warn" role="status">{prefsNote}</p>{/if}
	{#each statusLine as line (line)}<p class="note cal-warn" role="status">{line}</p>{/each}

	<div class="cal-body">
		{#if view === 'month'}
			<div class="cal-grid card" data-testid="calendar-month">
				<div class="cal-row cal-heads" aria-hidden="true">
					{#each WEEK_HEADS as h (h)}<span class="cal-head-cell">{h}</span>{/each}
				</div>
				{#each weeks as week (week[0])}
					<div class="cal-row">
						{#each week as day (day)}
							{@const items = eventsOnDay(shown, day)}
							{@const out = monthOf(day) !== month}
							{@const closed = isNoSchoolDay(shown, day)}
							<button
								type="button"
								class="cal-cell"
								class:out
								class:closed
								class:today={day === today}
								aria-pressed={day === selected}
								aria-label={`${dayWords(day, thisYear)}${day === today ? ', today' : ''}, ${countWords(items.length)}`}
								data-day={day}
								onclick={() => (selected = day)}
							>
								<span class="cal-date">{Number(day.slice(8))}</span>
								<span class="cal-chips">
									{#each items.slice(0, 3) as e (e.id)}
										{@const li = layerInfo(e.layer)}
										<span class="chip-ev" style:--layer={li.color} data-kind={e.kind} data-layer={e.layer}
											><LayerMark layer={li} size={9} />{#if e.kind === 'due'}<b>Due</b>{/if}<span class="chip-t">{e.title}</span></span
										>
									{/each}
									{#if items.length > 3}<span class="chip-more">+{items.length - 3}</span>{/if}
								</span>
								<span class="cal-dots" aria-hidden="true">
									{#each items.slice(0, 4) as e (e.id)}<span class="dot" data-layer={e.layer}><LayerMark layer={layerInfo(e.layer)} size={9} /></span>{/each}
								</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>
			<section class="cal-day card" aria-label={`Events on ${dayWords(selected, thisYear)}`} data-testid="calendar-day">
				<h2 class="section-label">{dayWords(selected, thisYear)}{selected === today ? ' (today)' : ''}</h2>
				{#if dayEvents.length}
					<ul class="ev-list">
						{#each dayEvents as e (e.id)}{@render eventRow(e, false)}{/each}
					</ul>
				{:else}
					<p class="note">Nothing on this day.</p>
				{/if}
				{#if feed?.admin && transports}
					<button type="button" class="btn secondary" onclick={() => ((draft = blankDraft()), (draftNote = null))}>Add an event on {dayWords(selected, thisYear)}</button>
				{/if}
			</section>
		{:else}
			<section class="cal-list card" data-testid="calendar-list">
				{#if listDays.length}
					{#each listDays as [day, items] (day)}
						<div class="list-day" class:today={day === today} class:past={day < today}>
							<h3 class="list-date">{dayWords(day, thisYear)}{day === today ? ' (today)' : ''}</h3>
							<ul class="ev-list">
								{#each items as e (e.id)}{@render eventRow(e, !!e.endDay)}{/each}
							</ul>
						</div>
					{/each}
				{:else}
					<p class="note">Nothing in {monthWords(month)} with these layers on.</p>
				{/if}
				{#if feed?.admin && transports}
					<button type="button" class="btn secondary" onclick={() => ((draft = blankDraft()), (draftNote = null))}>Add an event</button>
				{/if}
			</section>
		{/if}
	</div>

	{#if draft}
		<form class="card cal-form" onsubmit={saveDraft} data-testid="calendar-event-form">
			<h2 class="section-label">{draft.id ? 'Edit event' : 'Add an event'}</h2>
			<div class="form-grid">
				<label>Calendar
					<select bind:value={draft.layer}>
						<option value="idea">IDEA</option>
						<option value="robotics">Robotics</option>
					</select>
				</label>
				<label class="wide">Name <input type="text" bind:value={draft.title} maxlength="120" required /></label>
				<label>First day <input type="date" bind:value={draft.startsOn} required /></label>
				<label>Last day <input type="date" bind:value={draft.endsOn} min={draft.startsOn} /></label>
				<label>Starts <input type="time" bind:value={draft.startTime} /></label>
				<label>Ends <input type="time" bind:value={draft.endTime} /></label>
				<label class="wide">Where <input type="text" bind:value={draft.location} maxlength="120" /></label>
				<label class="wide">Notes <textarea bind:value={draft.notes} maxlength="500" rows="2"></textarea></label>
			</div>
			{#if draftNote}<p class="note cal-warn" role="alert">{draftNote}</p>{/if}
			<div class="btn-row">
				<button type="submit" class="btn" disabled={saving}>{saving ? 'Saving' : 'Save event'}</button>
				<button type="button" class="btn secondary" onclick={() => (draft = null)}>Cancel</button>
			</div>
		</form>
	{/if}

	{#if transports}
		<details class="card cal-sub-panel" data-testid="calendar-subscribe">
			<summary>Put this calendar on your phone</summary>
			<p class="note">
				A private link your phone's calendar app follows. It shows the layers and classes you have on here, and updates about every
				hour. Anyone with the link can read your calendar, so keep it to yourself.
			</p>
			{#if urls}
				<div class="link-box">
					<input type="text" readonly value={urls.https} aria-label="Your calendar link" onfocus={(e) => e.currentTarget.select()} />
					<div class="btn-row">
						<a class="btn" href={urls.webcal}>Open in my calendar app</a>
						<button type="button" class="btn secondary" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
					</div>
				</div>
				<p class="note">On Google Calendar: Other calendars, From URL, then paste the link.</p>
			{/if}
			<div class="btn-row">
				{#if !urls}
					<button type="button" class="btn" disabled={linkBusy} onclick={() => getLink(false)}>{hasLink ? 'Show my link' : 'Make my link'}</button>
				{/if}
				{#if hasLink}
					<button type="button" class="btn secondary" disabled={linkBusy} onclick={() => getLink(true)}>Replace link</button>
					<button type="button" class="btn secondary" disabled={linkBusy} onclick={revoke}>Turn off link</button>
				{/if}
			</div>
			{#if linkNote}<p class="note" role="status">{linkNote}</p>{/if}
		</details>
	{/if}
</div>

<style>
	.cal {
		display: grid;
		gap: 0.9rem;
		width: min(100%, 1440px);
		margin: 0 auto;
		padding: 1rem clamp(0.75rem, 2vw, 1.5rem) 3rem;
		font-family: var(--font-display);
		color: var(--white);
	}
	.cal-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.cal-nav,
	.cal-views,
	.cal-layers,
	.cal-class-keys,
	.btn-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
	}
	.cal-nav .btn {
		min-width: 44px;
		min-height: 44px;
		justify-content: center;
		font-size: 1.3rem;
	}
	.cal-nav .btn:last-child:not([aria-label]) {
		font-size: inherit;
	}
	.cal-month {
		margin: 0;
		min-width: 9.5rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 1.05rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.cal-views .btn,
	.layer-key {
		min-height: 44px;
	}
	.layer-key {
		gap: 0.45rem;
		/* LIT IN ITS OWN LAYER'S COLOUR, NOT THE SITE GREEN (ledger 0467). The
		   plate draws a lit key's ring from --plate-accent and its inner tint
		   and glow from the two beside it; declared on the key itself, they
		   beat the plate's inherited green without touching plate.css. */
		--plate-accent: var(--layer);
		--plate-accent-tint: color-mix(in srgb, var(--layer) 35%, transparent);
		--plate-accent-glow: color-mix(in srgb, var(--layer) 45%, transparent);
	}
	.layer-key[aria-pressed='false'] {
		opacity: 0.72;
	}
	/* ONE KEY ON A PHONE. */
	.cal-filters {
		display: grid;
		gap: 0.45rem;
	}
	.cal-filters-panel {
		display: grid;
		gap: 0.45rem;
	}
	.cal-filters-toggle {
		display: none;
		min-height: 44px;
		justify-self: start;
		gap: 0.5rem;
	}
	.cal-filters-caret {
		display: inline-block;
		width: 0.45rem;
		height: 0.45rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: translateY(-0.12rem) rotate(45deg);
	}
	.cal-filters.open .cal-filters-caret {
		transform: translateY(0.12rem) rotate(225deg);
	}
	@media (max-width: 719px) {
		.cal-filters-toggle {
			display: inline-flex;
			align-items: center;
		}
		.cal-filters:not(.open) .cal-filters-panel {
			display: none;
		}
	}
	.cal-classes summary,
	.cal-sub-panel summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.cal-class-keys {
		padding: 0.25rem 0 0.5rem;
	}
	.cal-warn {
		margin: 0;
		color: var(--amber);
	}
	.cal-body {
		display: grid;
		gap: 0.9rem;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
	}
	@media (min-width: 1100px) {
		.cal[data-view='month'] .cal-body {
			grid-template-columns: minmax(0, 1fr) 22rem;
		}
	}
	.cal-grid {
		display: grid;
		gap: 4px;
		padding: 0.6rem;
	}
	.cal-row {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
	}
	.cal-head-cell {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
		text-align: center;
		padding: 0.2rem 0;
	}
	.cal-cell {
		all: unset;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-height: 6.4rem;
		min-width: 0;
		padding: 0.35rem 0.4rem;
		border-radius: 8px;
		cursor: pointer;
		background: linear-gradient(var(--plate-inset-top, var(--bg1)), var(--plate-inset-bot, var(--bg0)));
		box-shadow: inset 0 1px 2px var(--plate-inset-shade, rgb(0 0 0 / 0.4)), inset 0 -1px 0 var(--plate-chip-lip, rgb(255 255 255 / 0.04));
	}
	.cal-cell:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.cal-cell.out {
		opacity: 0.45;
	}
	.cal-cell.closed {
		background: repeating-linear-gradient(135deg, transparent 0 6px, rgb(127 127 127 / 0.08) 6px 12px),
			linear-gradient(var(--plate-inset-top, var(--bg1)), var(--plate-inset-bot, var(--bg0)));
	}
	.cal-cell[aria-pressed='true'] {
		box-shadow: inset 0 0 0 2px var(--plate-accent, var(--green));
	}
	.cal-date {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--dim);
		line-height: 1;
	}
	.cal-cell.today .cal-date {
		display: inline-grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		margin: -0.2rem 0 0 -0.2rem;
		border-radius: 50%;
		background: var(--green);
		color: var(--bg0);
		font-weight: 700;
	}
	.cal-chips {
		display: grid;
		gap: 3px;
		min-width: 0;
	}
	.chip-ev {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 0.82rem;
		line-height: 1.25;
		padding: 0.08rem 0.35rem;
		border-radius: 4px;
		background: color-mix(in srgb, var(--layer) 14%, transparent);
		color: var(--white);
	}
	.chip-t {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip-ev[data-layer='school'] {
		color: var(--dim);
	}
	.chip-ev b {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-weight: 400;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--amber);
	}
	.chip-more {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--dim);
	}
	.cal-dots {
		display: none;
		gap: 3px;
		flex-wrap: wrap;
	}
	.dot {
		display: inline-flex;
		line-height: 0;
	}
	@media (max-width: 719px) {
		.cal-grid {
			padding: 0.35rem;
			gap: 3px;
		}
		.cal-row {
			gap: 3px;
		}
		.cal-cell {
			min-height: 3.4rem;
			padding: 0.3rem;
			align-items: center;
		}
		.cal-chips {
			display: none;
		}
		.cal-dots {
			display: flex;
			justify-content: center;
		}
	}
	.cal-day > .section-label,
	.cal-form > .section-label {
		margin-top: 0;
	}
	.cal-day,
	.cal-list,
	.cal-form,
	.cal-sub-panel {
		display: grid;
		gap: 0.6rem;
		align-content: start;
	}
	.ev-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}
	.ev {
		display: grid;
		grid-template-columns: 4px minmax(0, 1fr) auto;
		gap: 0.6rem;
		align-items: start;
		min-height: 44px;
		padding: 0.45rem 0.55rem 0.45rem 0;
		border-radius: 8px;
		background: color-mix(in srgb, var(--layer) 7%, transparent);
	}
	.ev-stripe {
		align-self: stretch;
		border-radius: 0 3px 3px 0;
		background: var(--layer);
	}
	.ev-main {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.ev-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.ev-title a {
		color: inherit;
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--white) 35%, transparent);
		text-underline-offset: 3px;
	}
	.ev-meta {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--cyan);
	}
	.ev-layer {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--dim);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.ev-due {
		color: var(--amber);
		text-transform: uppercase;
	}
	.ev-state {
		color: var(--white);
	}
	.ev-note {
		margin: 0;
		color: var(--dim);
		font-size: 0.95rem;
	}
	.ev-tools {
		display: flex;
		gap: 0.35rem;
	}
	.list-day {
		display: grid;
		gap: 0.4rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--plate-divider, rgb(255 255 255 / 0.06));
	}
	.list-day.past {
		opacity: 0.7;
	}
	.list-date {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.list-day.today .list-date {
		color: var(--green);
	}
	.form-grid {
		display: grid;
		gap: 0.6rem;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
	}
	.form-grid label {
		display: grid;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.form-grid .wide {
		grid-column: 1 / -1;
	}
	.form-grid :is(input, select, textarea) {
		font-family: var(--font-display);
		font-size: 1rem;
		min-height: 44px;
		text-transform: none;
		letter-spacing: normal;
	}
	.link-box {
		display: grid;
		gap: 0.5rem;
	}
	.link-box input {
		width: 100%;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	.cal-empty {
		display: grid;
		gap: 0.4rem;
	}
	@media (prefers-reduced-motion: no-preference) {
		.cal-cell {
			transition: box-shadow 120ms ease;
		}
	}
</style>
