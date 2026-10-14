<script lang="ts">
	/**
	 * A CLASS'S FOUNDRY SCHEDULE (ledger 0380, report 84e293d4): the days and
	 * times the Foundry stands down for one class, and date exceptions for the
	 * odd schedule day.
	 *
	 * ONE SECTION AT A TIME, picked from the sections the caller manages (the
	 * same list the open and close control above it uses). The state is read
	 * when a section is picked, from the input handler and never from an effect,
	 * and written through injected transports; the database re-checks
	 * `classroom_manages_section` in every function, so nothing here is the
	 * boundary. Absence of the transports removes the whole panel, which is also
	 * what a database before 0237 gets (`load` answering null says so in words).
	 *
	 * THE HAND SWITCH IS UNCHANGED AND THE PANEL SAYS SO
	 * (`SCHEDULE_HAND_SENTENCE`): a schedule narrows nothing about the teacher's
	 * own control.
	 */
	import Pending from '$lib/Pending.svelte';
	import { pendingLabel } from '$lib/pending';

	import type { FoundryManagedSection } from './access.ts';
	import {
		SCHEDULE_HAND_SENTENCE,
		SCHEDULE_MAX_DAY_WINDOWS,
		SCHEDULE_NOT_READY,
		SCHEDULE_WEEKDAYS,
		dayWindowsProblem,
		dayWords,
		scheduleNowWords,
		weekdayName,
		weeklyProblem,
		windowWords,
		windowsOn,
		type ScheduleDayWindow,
		type ScheduleState,
		type ScheduleWindow
	} from './schedule.ts';

	type Outcome = { ok: true } | { ok: false; message: string };

	let {
		sections = [],
		load,
		saveWeekly,
		saveDay,
		clearDay
	}: {
		sections?: FoundryManagedSection[];
		/** Null means the schedule is not there (a database before 0237). */
		load?: (sectionId: string) => Promise<ScheduleState | null>;
		saveWeekly?: (sectionId: string, enabled: boolean, weekly: ScheduleWindow[]) => Promise<Outcome>;
		saveDay?: (
			sectionId: string,
			onDate: string,
			kind: 'no_class' | 'window',
			windows: ScheduleDayWindow[],
			note: string | null
		) => Promise<Outcome>;
		clearDay?: (sectionId: string, onDate: string) => Promise<Outcome>;
	} = $props();

	let sectionId = $state('');
	let sched = $state<ScheduleState | null>(null);
	let unavailable = $state(false);
	let loading = $state(false);
	let busy = $state(false);
	let said = $state<string | null>(null);
	let problem = $state<string | null>(null);

	// The editable draft of the weekly pattern.
	let enabled = $state(false);
	let weekly = $state<ScheduleWindow[]>([]);

	// The date-exception form.
	let dayDate = $state('');
	let dayKind = $state<'no_class' | 'window'>('window');
	let dayWindows = $state<ScheduleDayWindow[]>([{ starts: '', ends: '' }]);
	let dayNote = $state('');

	const section = $derived(sections.find((s) => s.section_id === sectionId) ?? null);

	async function pick(event: Event) {
		sectionId = (event.currentTarget as HTMLSelectElement).value;
		sched = null;
		said = null;
		problem = null;
		unavailable = false;
		if (!sectionId || !load) return;
		await refresh();
	}

	async function refresh() {
		if (!load || !sectionId) return;
		const asked = sectionId;
		loading = true;
		try {
			const s = await load(asked);
			if (asked !== sectionId) return;
			if (!s) {
				unavailable = true;
				sched = null;
				return;
			}
			sched = s;
			enabled = s.enabled;
			weekly = s.weekly.map((w) => ({ ...w }));
		} catch {
			if (asked === sectionId) unavailable = true;
		} finally {
			loading = false;
		}
	}

	async function run(action: () => Promise<Outcome>, done: string) {
		busy = true;
		said = null;
		problem = null;
		try {
			const r = await action();
			if (!r.ok) {
				problem = r.message;
				return;
			}
			said = done;
			await refresh();
		} catch {
			problem = 'Could not reach the server. Try again.';
		} finally {
			busy = false;
		}
	}

	function addWindow(weekday: number) {
		const day = windowsOn(weekly, weekday);
		const last = day[day.length - 1];
		weekly = [...weekly, { weekday, starts: last ? last.ends : '09:00', ends: last ? last.ends : '09:50' }];
	}
	function removeWindow(target: ScheduleWindow) {
		weekly = weekly.filter((w) => w !== target);
	}

	const weeklyIssue = $derived(weeklyProblem(weekly));

	function saveWeeklyNow() {
		if (!saveWeekly || !sectionId) return;
		if (weeklyIssue) {
			problem = weeklyIssue;
			said = null;
			return;
		}
		void run(() => saveWeekly(sectionId, enabled, weekly), 'Saved the weekly schedule.');
	}

	const dayIssue = $derived.by(() => {
		if (!dayDate) return 'Pick a date.';
		if (dayKind === 'no_class') return null;
		return dayWindowsProblem(dayWindows);
	});

	function saveDayNow() {
		if (!saveDay || !sectionId) return;
		if (dayIssue) {
			problem = dayIssue;
			said = null;
			return;
		}
		const windows = dayKind === 'window' ? dayWindows : [];
		void run(
			() => saveDay(sectionId, dayDate, dayKind, windows, dayNote.trim() || null),
			`Saved ${dayWords(dayDate)}.`
		).then(() => {
			dayDate = '';
			dayNote = '';
			dayWindows = [{ starts: '', ends: '' }];
		});
	}

	/** One line per stored exception date. */
	const dayList = $derived.by(() => {
		const out = new Map<string, { date: string; words: string; note: string | null }>();
		for (const d of sched?.days ?? []) {
			const row = out.get(d.on_date) ?? { date: d.on_date, words: '', note: d.note };
			const part = d.kind === 'no_class' ? 'No class. The Foundry stays open.' : windowWords({ starts: d.starts ?? '', ends: d.ends ?? '' });
			row.words = row.words ? `${row.words}, ${part}` : part;
			out.set(d.on_date, row);
		}
		return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
	});
</script>

{#if load && saveWeekly}
	<section class="fdy-sched" data-testid="foundry-schedule">
		<header>
			<h2>Class schedule</h2>
			<p class="fdy-sched-lead">
				Pick a class and set the days and times it meets. The Foundry closes for that class's
				students while class is in session and comes back when it ends. The times are on the
				school clock (Los Angeles).
			</p>
			<p class="fdy-sched-lead">{SCHEDULE_HAND_SENTENCE}</p>
		</header>

		{#if sections.length === 0}
			<p class="fdy-sched-empty">You are not the teacher of record for any section, so there is no schedule to set.</p>
		{:else}
			<div class="fdy-sched-pick">
				<label for="fdy-sched-section">Class</label>
				<select id="fdy-sched-section" class="cr-select" value={sectionId} onchange={pick} data-testid="foundry-schedule-section">
					<option value="">Choose a class</option>
					{#each sections as s (s.section_id)}
						<option value={s.section_id}>
							{s.course_title} &middot; {s.label}{s.block ? ` · ${s.block}` : ''}
						</option>
					{/each}
				</select>
			</div>

			{#if loading}
				<Pending label={pendingLabel('Loading the schedule')} />
			{:else if unavailable}
				<p class="fdy-sched-empty" data-testid="foundry-schedule-unavailable">{SCHEDULE_NOT_READY}</p>
			{:else if sched && section}
				<p class="fdy-sched-now" data-testid="foundry-schedule-now">{scheduleNowWords(sched.now, sched.enabled)}</p>

				<label class="fdy-sched-switch">
					<input type="checkbox" bind:checked={enabled} disabled={busy} data-testid="foundry-schedule-enabled" />
					<span>Close the Foundry for this class during its class periods</span>
				</label>

				<ul class="fdy-sched-week">
					{#each SCHEDULE_WEEKDAYS as d (d.n)}
						{@const rows = windowsOn(weekly, d.n)}
						<li class="fdy-sched-day">
							<h3>{d.name}</h3>
							{#if rows.length === 0}
								<p class="fdy-sched-none">No class.</p>
							{/if}
							{#each rows as w (w)}
								<div class="fdy-sched-win">
									<label class="fdy-sched-t">
										<span>Starts</span>
										<input type="time" bind:value={w.starts} disabled={busy} />
									</label>
									<label class="fdy-sched-t">
										<span>Ends</span>
										<input type="time" bind:value={w.ends} disabled={busy} />
									</label>
									<button type="button" class="btn tap-44" disabled={busy} onclick={() => removeWindow(w)}>
										Remove
									</button>
								</div>
							{/each}
							<button type="button" class="btn tap-44" disabled={busy} onclick={() => addWindow(d.n)}>
								Add a time on {d.name}
							</button>
						</li>
					{/each}
				</ul>

				<div class="fdy-sched-actions">
					<button
						type="button"
						class="btn tap-44"
						disabled={busy}
						aria-disabled={weeklyIssue !== null}
						data-testid="foundry-schedule-save"
						onclick={saveWeeklyNow}
					>
						Save the weekly schedule
					</button>
				</div>

				{#if saveDay}
					<section class="fdy-sched-days" aria-labelledby="fdy-sched-days-h">
						<h3 id="fdy-sched-days-h">Odd days</h3>
						<p class="fdy-sched-lead">
							For a day that is not the usual week: no class (the Foundry stays open all day, which is
							also how to open it early on a short day), or different times just for that date.
						</p>
						{#if dayList.length > 0}
							<ul class="fdy-sched-daylist">
								{#each dayList as d (d.date)}
									<li class="fdy-sched-dayrow">
										<span>
											<strong>{dayWords(d.date)}</strong>: {d.words}{d.note ? ` (${d.note})` : ''}
										</span>
										{#if clearDay}
											<button
												type="button"
												class="btn tap-44"
												disabled={busy}
												onclick={() => run(() => clearDay(sectionId, d.date), 'Removed. That date follows the weekly schedule again.')}
											>
												Remove
											</button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
						<div class="fdy-sched-form">
							<label class="fdy-sched-t">
								<span>Date</span>
								<input type="date" bind:value={dayDate} disabled={busy} data-testid="foundry-schedule-date" />
							</label>
							<label class="fdy-sched-t">
								<span>That day</span>
								<select class="cr-select" bind:value={dayKind} disabled={busy}>
									<option value="window">Has different times</option>
									<option value="no_class">Has no class</option>
								</select>
							</label>
							{#if dayKind === 'window'}
								{#each dayWindows as w, i (i)}
									<div class="fdy-sched-win">
										<label class="fdy-sched-t">
											<span>Starts</span>
											<input type="time" bind:value={w.starts} disabled={busy} />
										</label>
										<label class="fdy-sched-t">
											<span>Ends</span>
											<input type="time" bind:value={w.ends} disabled={busy} />
										</label>
										{#if dayWindows.length > 1}
											<button type="button" class="btn tap-44" disabled={busy} onclick={() => (dayWindows = dayWindows.filter((_, k) => k !== i))}>
												Remove
											</button>
										{/if}
									</div>
								{/each}
								{#if dayWindows.length < SCHEDULE_MAX_DAY_WINDOWS}
									<button type="button" class="btn tap-44" disabled={busy} onclick={() => (dayWindows = [...dayWindows, { starts: '', ends: '' }])}>
										Add another time
									</button>
								{/if}
							{/if}
							<label class="fdy-sched-t fdy-sched-note">
								<span>Note (optional)</span>
								<input type="text" maxlength="120" bind:value={dayNote} disabled={busy} />
							</label>
							<button
								type="button"
								class="btn tap-44"
								disabled={busy}
								aria-disabled={dayIssue !== null}
								data-testid="foundry-schedule-day-save"
								onclick={saveDayNow}
							>
								Save that day
							</button>
						</div>
					</section>
				{/if}

				{#if busy}<Pending label={pendingLabel('Saving')} />{/if}
				{#if problem}<p class="fdy-sched-problem" role="status" data-testid="foundry-schedule-problem">{problem}</p>{/if}
				{#if said}<p class="fdy-sched-said" role="status">{said}</p>{/if}
			{/if}
		{/if}
	</section>
{/if}

<style>
	.fdy-sched {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		margin-top: var(--space-6, 2rem);
		min-width: 0;
	}
	.fdy-sched h2,
	.fdy-sched h3 {
		margin: 0;
	}
	.fdy-sched-lead,
	.fdy-sched-empty,
	.fdy-sched-none {
		margin: 0;
		color: var(--text-2);
		max-width: var(--measure-reading, 42rem);
		line-height: 1.45;
	}
	.fdy-sched-now {
		margin: 0;
		color: var(--text-1);
		font-family: var(--font-mono);
	}
	.fdy-sched-pick,
	.fdy-sched-win,
	.fdy-sched-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2, 0.5rem);
	}
	.fdy-sched-pick label,
	.fdy-sched-t span {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.fdy-sched-pick select {
		flex: 1 1 14rem;
		min-height: 44px;
		min-width: 0;
	}
	.fdy-sched-t {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.fdy-sched-t input,
	.fdy-sched-t select {
		min-height: 44px;
		box-sizing: border-box;
		padding: 0 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
	}
	.fdy-sched-note {
		flex: 1 1 14rem;
	}
	.fdy-sched-switch {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
		color: var(--text-1);
	}
	.fdy-sched-switch input {
		width: 1.2rem;
		height: 1.2rem;
		accent-color: var(--green);
	}
	.fdy-sched-week,
	.fdy-sched-daylist {
		list-style: none;
		margin: 0;
		padding: 0;
		columns: 20rem 3;
		column-gap: var(--space-3, 0.75rem);
	}
	.fdy-sched-daylist {
		columns: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}
	.fdy-sched-day {
		break-inside: avoid;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-3, 0.75rem);
		margin-bottom: var(--space-3, 0.75rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
	}
	.fdy-sched-dayrow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2, 0.5rem);
		color: var(--text-1);
	}
	.fdy-sched-days {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}
	.fdy-sched .btn[aria-disabled='true'] {
		color: var(--ice);
		border-color: var(--ice);
		cursor: not-allowed;
	}
	.fdy-sched-problem {
		margin: 0;
		color: var(--amber);
	}
	.fdy-sched-said {
		margin: 0;
		color: var(--text-1);
	}
</style>
