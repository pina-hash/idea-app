<script lang="ts">
	import { onMount } from 'svelte';
	import Avatar from '$lib/Avatar.svelte';
	import { rosterSubject } from '$lib/avatars';
	import CoinTransactionRows from '$lib/coin-balance/CoinTransactionRows.svelte';
	import { coins as coinAmount } from '$lib/coin-format';
	import { formatDue, sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		hallPassClockLabel,
		hallPassDurationLabel,
		hallPassLimitSummary,
		hallPassOverrideLabel,
		type HallPassState
	} from '$lib/classroom/hall-pass';
	import {
		PRESENCE_NEVER_OPENED,
		PRESENCE_UNKNOWN,
		presenceActiveLabel,
		presenceCoverageNote
	} from '$lib/classroom/presence/state';
	import { laCalendarDay } from '$lib/classroom/school-calendar';
	import { timelineDayLabel } from '$lib/notebook/timeline';
	import { ICONS } from '$lib/shell/commands';
	import {
		foundryAppHref,
		STUDENT_OVERVIEW_ERROR_NOTE,
		STUDENT_OVERVIEW_PENDING_NOTE,
		type StudentPageData
	} from '$lib/classroom/student-overview';

	/**
	 * ONE STUDENT'S PAGE IN ONE CLASS (the 2026-10-07 round, reports 792eb6b1
	 * and 63fb1c49): everything this class holds about one student, for the
	 * teacher, and a printout for a parent conference.
	 *
	 * PROPS ONLY, NO FETCHING AND NO WRITE. The route and `/dev/classroom-student`
	 * mount this identical component with the page `buildStudentPage` made, so
	 * the harness measures the real projection. There is no poll and no live
	 * subscription: a page opened for a conference is read, not watched.
	 *
	 * NOTHING HERE NAMES ANOTHER STUDENT. The data was reduced to this one
	 * student on the server; a team is a name and a size, never its members.
	 *
	 * PRINTING. The Print key and Ctrl+P go through the same two events:
	 * `beforeprint` puts the page on Space White for the length of the print
	 * (paper is white, and a dark theme's light ink would print pale), and
	 * `afterprint` restores exactly what was there. The site chrome, the keys and
	 * every section whose "Include when printing" box is cleared are left off the
	 * paper. Those boxes start ticked on every visit and are not remembered: what
	 * goes to a meeting is decided for that meeting.
	 */
	let {
		section,
		data,
		today,
		peopleHref,
		itemHref,
		notebookHref = null
	}: {
		section: ClassroomSection;
		data: StudentPageData;
		/** The section load's one LA calendar day. */
		today: string;
		peopleHref: string;
		itemHref: (itemId: string) => string;
		/**
		 * The student's whole notebook, read-only. NULL removes the link and says
		 * why: it opens only while they are on the live roster (or for an admin),
		 * because the notebook's own reviewer gate asks for an active enrollment.
		 */
		notebookHref?: string | null;
	} = $props();

	const SECTIONS = [
		{ id: 'assignments', label: 'Assignments' },
		{ id: 'notebook', label: 'Notebook' },
		{ id: 'activity', label: 'Activity' },
		{ id: 'hall-passes', label: 'Hall passes' },
		{ id: 'teams', label: 'Teams' },
		{ id: 'coins', label: 'Coins and music' },
		{ id: 'models', label: 'Models and apps' }
	] as const;
	type SectionId = (typeof SECTIONS)[number]['id'];

	let printing = $state<Record<SectionId, boolean>>({
		assignments: true,
		notebook: true,
		activity: true,
		'hall-passes': true,
		teams: true,
		coins: true,
		models: true
	});

	const name = $derived(data.student.display_name || data.student.email);
	const totals = $derived(data.totals);
	const coverage = $derived(presenceCoverageNote(data.presenceLimits));
	const overviewNote = $derived(
		data.sources.overview === 'unavailable'
			? STUDENT_OVERVIEW_PENDING_NOTE
			: data.sources.overview === 'error'
				? STUDENT_OVERVIEW_ERROR_NOTE
				: null
	);
	const limitsLine = $derived(
		data.hallPasses?.limits
			? hallPassLimitSummary({ limits: data.hallPasses.limits } as unknown as HallPassState)
			: null
	);
	const hasModels = $derived(data.ideacad.length > 0 || data.foundry.length > 0);

	function day(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : timelineDayLabel(laCalendarDay(d), today);
	}
	function when(iso: string | null): string {
		return iso ? formatDue(iso, today) : '';
	}
	function minutes(n: number): string {
		return n === 1 ? '1 minute' : `${n} minutes`;
	}
	function plural(n: number, one: string, many: string): string {
		return `${n} ${n === 1 ? one : many}`;
	}

	onMount(() => {
		const root = document.documentElement;
		let saved: string | null = null;
		let swapped = false;
		const before = () => {
			if (swapped) return;
			saved = root.getAttribute('data-theme');
			swapped = true;
			root.setAttribute('data-theme', 'space-white');
		};
		const after = () => {
			if (!swapped) return;
			swapped = false;
			if (saved === null) root.removeAttribute('data-theme');
			else root.setAttribute('data-theme', saved);
		};
		window.addEventListener('beforeprint', before);
		window.addEventListener('afterprint', after);
		return () => {
			window.removeEventListener('beforeprint', before);
			window.removeEventListener('afterprint', after);
			after();
		};
	});
</script>

{#snippet printToggle(id: SectionId, label: string)}
	<label class="so-print-toggle" data-testid="so-print-toggle">
		<input type="checkbox" bind:checked={printing[id]} aria-label="Include when printing: {label}" />
		<span>Include when printing</span>
	</label>
{/snippet}

{#snippet presenceCell(row: StudentPageData['assignments'][number])}
	{#if row.presence === 'row'}
		<span class="so-figure">{presenceActiveLabel(row.activeSeconds ?? 0)}</span>
	{:else if row.presence === 'unknown'}
		<span class="so-quiet">{PRESENCE_UNKNOWN}</span>
	{:else if row.presence === 'never-opened'}
		<span class="so-quiet" data-testid="so-not-opened">{PRESENCE_NEVER_OPENED}</span>
	{/if}
{/snippet}

<main class="classroom-page cr-instructor-surface so-root" data-testid="student-overview">
	<header class="card so-identity" data-testid="so-identity">
		<p class="so-print-only so-print-line">
			IDEA Classroom &middot; {sectionTitle(section)} &middot; as of {when(data.at)}
		</p>
		<div class="so-id-row">
			<span class="so-avatar">
				<Avatar subject={rosterSubject({ ...data.student, student_email: data.student.email })} tintKey={data.student.email} size={56} />
			</span>
			<div class="so-id-text">
				<h1 class="so-name person-name" title={name}>{name}</h1>
				<p class="so-email">{data.student.email}</p>
				<p class="so-class">{sectionTitle(section)}</p>
				<p class="so-id-chips">
					{#if data.student.active}
						<span class="chip tone-good" data-testid="so-roster-chip">On the class roster</span>
					{:else}
						<span class="chip tone-attention" data-testid="so-roster-chip">Not on the live roster</span>
					{/if}
					{#if data.student.has_account === false}
						<span class="chip tone-muted" data-testid="so-no-account">Has not signed in yet</span>
					{/if}
					{#if data.student.enrolled_at}
						<span class="so-meta">On this roster since {day(data.student.enrolled_at)}</span>
					{/if}
				</p>
			</div>
		</div>
		<div class="so-actions">
			<button type="button" class="btn tiny" data-testid="so-print" onclick={() => window.print()}>Print</button>
			<a class="btn secondary tiny" href={peopleHref}>Back to People</a>
			{#if notebookHref}
				<a class="btn secondary tiny" href={notebookHref} data-testid="so-notebook-link">Open full notebook</a>
			{/if}
		</div>
		{#if !notebookHref}
			<p class="note so-actions" data-testid="so-notebook-closed">
				Their full notebook opens only while they are on the live roster. Their check-ins in this class
				are listed below.
			</p>
		{/if}
	</header>

	<section class="so-glance" aria-label="At a glance" data-testid="so-glance">
		<div class="so-tile">
			<span class="so-tile-label">Assignments done</span>
			<span class="so-tile-figure">{totals.done} of {totals.assigned}</span>
			<span class="so-tile-sub">{totals.missing} missing, {totals.todo} to do</span>
		</div>
		<div class="so-tile">
			<span class="so-tile-label">Waiting for grading</span>
			<span class="so-tile-figure">{totals.awaitingGrade}</span>
			<span class="so-tile-sub">{plural(totals.returned, 'returned', 'returned')} so far</span>
		</div>
		<div class="so-tile">
			<span class="so-tile-label">Points on returned work</span>
			<span class="so-tile-figure">
				{totals.pointsPossible > 0 ? `${totals.pointsEarned} of ${totals.pointsPossible}` : 'None yet'}
			</span>
			<span class="so-tile-sub">The grade of record is in FACTS.</span>
		</div>
		<div class="so-tile">
			<span class="so-tile-label">Notebook check-ins</span>
			<span class="so-tile-figure">
				{data.notebook ? `${data.notebook.covered} of ${data.notebook.total}` : 'Not known'}
			</span>
			<span class="so-tile-sub">
				{#if data.streak !== null}{plural(data.streak, 'class day', 'class days')} in a row{:else}Streak not known{/if}
			</span>
		</div>
		<div class="so-tile">
			<span class="so-tile-label">Working time</span>
			<span class="so-tile-figure">{data.workingSeconds === null ? 'None recorded' : presenceActiveLabel(data.workingSeconds)}</span>
			<span class="so-tile-sub">See the note under Assignments.</span>
		</div>
		<div class="so-tile">
			<span class="so-tile-label">Hall passes</span>
			<span class="so-tile-figure">{data.hallPasses ? data.hallPasses.summary.total : 'Not known'}</span>
			<span class="so-tile-sub">
				{data.hallPasses ? `${minutes(data.hallPasses.summary.minutesTotal)} out in all` : 'See Hall passes'}
			</span>
		</div>
		<div class="so-tile">
			<span class="so-tile-label">IDEA Coins</span>
			<span class="so-tile-figure">{data.coins ? coinAmount(data.coins.balance) : 'Not known'}</span>
			<span class="so-tile-sub">Across all classes</span>
		</div>
	</section>

	<section class="card so-card so-assignments-card" class:so-noprint={!printing.assignments} data-testid="so-assignments" aria-labelledby="so-h-assignments">
		<div class="so-card-head">
			<h2 id="so-h-assignments">Assignments</h2>
			{@render printToggle('assignments', 'Assignments')}
		</div>
		{#if !data.sources.submissions}
			<p class="note so-source-note" data-testid="so-source-note">Could not load their hand-ins just now, so every status below is a guess. Reload to try again.</p>
		{/if}
		{#if data.assignments.length}
			<div class="so-table-wrap">
				<table class="so-table">
					<thead>
						<tr>
							<th scope="col">Assignment</th>
							<th scope="col">Due</th>
							<th scope="col">Status</th>
							<th scope="col">Turned in</th>
							<th scope="col">Score</th>
							<th scope="col">Working time</th>
							<th scope="col">Last typed</th>
							<th scope="col">Last opened</th>
						</tr>
					</thead>
					<tbody>
						{#each data.assignments as row (row.itemId)}
							<tr data-testid="so-assignment-row" data-item={row.itemId}>
								<th scope="row" class="so-col-title" data-label="Assignment">
									<a class="so-link tap-44" href={itemHref(row.itemId)}>{row.title}</a>
									{#if !row.posted}<span class="chip tone-muted">Not posted now</span>{/if}
								</th>
								<td class="so-when" data-label="Due">{row.dueAt ? when(row.dueAt) : 'No due date'}</td>
								<td data-label="Status">
									<span class="chip work-chip tone-{row.chip.tone}" data-testid="so-status" data-missing={row.chip.missing ? 'true' : undefined}>
										{#if row.chip.missing}
											<svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.missing} /></svg>
										{:else if row.chip.done}
											<svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.done} /></svg>
										{/if}
										{row.chip.label}
									</span>
									{#if row.awaitingGrade}<span class="so-meta">Waiting for grading</span>{/if}
								</td>
								<td class="so-when" data-label="Turned in">
									{#if row.turnedInAt}
										{when(row.turnedInAt)}{#if row.late}<span class="so-late">, late</span>{/if}
									{/if}
								</td>
								<td data-label="Score">
									{#if row.score !== null}{row.points !== null ? `${row.score} of ${row.points}` : row.score}{/if}
								</td>
								<td data-label="Working time">{@render presenceCell(row)}</td>
								<td class="so-when" data-label="Last typed">
									{#if row.presence === 'row'}{row.lastWorkedAt ? when(row.lastWorkedAt) : 'No typing yet'}{/if}
								</td>
								<td class="so-when" data-label="Last opened">
									{row.lastOpenedAt ? when(row.lastOpenedAt) : data.sources.overview === 'ready' ? 'No open recorded' : ''}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="note">No assignments are posted to this class yet.</p>
		{/if}
		<!-- THE ONE SENTENCE, VERBATIM, directly under the rows its last clause
		     points at ("What they handed in is on the row above it"). Printed in
		     full rather than behind a tip, because paper has no hover. -->
		<p class="note so-coverage" data-testid="so-coverage">{coverage}</p>
	</section>

	<div class="so-panels">
		<section class="card so-card" class:so-noprint={!printing.notebook} data-testid="so-notebook" aria-labelledby="so-h-notebook">
			<div class="so-card-head">
				<h2 id="so-h-notebook">Notebook</h2>
				{@render printToggle('notebook', 'Notebook')}
			</div>
			{#if data.notebook}
				<p class="so-line">
					Check-ins covered: <strong>{data.notebook.covered} of {data.notebook.total}</strong>.
					{#if data.notebook.excused}Excused: {data.notebook.excused}.{/if}
					{#if data.notebook.flagged}Flagged: {data.notebook.flagged}.{/if}
					{#if data.notebook.scheduled}Not due yet: {data.notebook.scheduled}.{/if}
				</p>
				{#if data.streak !== null}
					<p class="so-line" data-testid="so-streak">
						{plural(data.streak, 'class day', 'class days')} in a row with a turned-in entry.
						{#if data.entriesFiled !== null}{plural(data.entriesFiled, 'entry', 'entries')} turned in to this class.{/if}
					</p>
				{/if}
				{#if data.notebook.checkIns.length}
					<ul class="so-list">
						{#each data.notebook.checkIns as c (c.sessionId)}
							<li class="so-list-row" data-testid="so-check-in">
								<span class="so-cell so-cell-{c.display}" aria-hidden="true">{c.glyph}</span>
								<span class="so-word">{c.word}</span>
								<span class="so-list-main">{c.label}</span>
								<span class="so-meta">{timelineDayLabel(c.date, today)}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="note">This class has no notebook check-ins yet.</p>
				{/if}
			{:else if data.sources.notebook === 'ready'}
				<p class="note">They have no row on this class's notebook grid.</p>
			{:else if data.sources.notebook === 'unavailable'}
				<p class="note">The notebook is not set up on this deployment.</p>
			{:else}
				<p class="note">Could not load the notebook for this class just now.</p>
			{/if}
		</section>

		<section class="card so-card" class:so-noprint={!printing.activity} data-testid="so-activity" aria-labelledby="so-h-activity">
			<div class="so-card-head">
				<h2 id="so-h-activity">Activity</h2>
				{@render printToggle('activity', 'Activity')}
			</div>
			{#if overviewNote}
				<p class="note" data-testid="so-overview-note">{overviewNote}</p>
			{:else if data.materials.length}
				<p class="so-line">When they last opened each handout and announcement in this class.</p>
				<ul class="so-list">
					{#each data.materials as m (m.itemId)}
						<li class="so-list-row" data-testid="so-material">
							<a class="so-list-main so-link tap-44" href={itemHref(m.itemId)}>{m.title}</a>
							<span class="so-meta">{m.lastOpenedAt ? `Last opened ${when(m.lastOpenedAt)}` : 'No open recorded'}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="note">This class has no handouts or announcements yet.</p>
			{/if}
		</section>

		<section class="card so-card" class:so-noprint={!printing['hall-passes']} data-testid="so-hall-passes" aria-labelledby="so-h-passes">
			<div class="so-card-head">
				<h2 id="so-h-passes">Hall passes</h2>
				{@render printToggle('hall-passes', 'Hall passes')}
			</div>
			{#if data.hallPasses}
				{@const s = data.hallPasses.summary}
				{#if s.total === 0}
					<p class="so-line">No hall passes in this class.</p>
				{:else}
					<p class="so-line">
						{plural(s.total, 'pass', 'passes')} in this class, {minutes(s.minutesTotal)} out in all, the longest
						{minutes(s.longestMinutes)}.{#if s.overrides}{' '}{plural(s.overrides, 'was', 'were')} sent by a teacher.{/if}{#if s.openNow}{' '}Out now.{/if}
					</p>
					{#if s.shown < s.total}
						<p class="note">Showing the newest {s.shown} of {s.total}.</p>
					{/if}
					<ul class="so-list">
						{#each data.hallPasses.entries as e (e.pass_id)}
							{@const override = hallPassOverrideLabel(e)}
							<li class="so-list-row" data-testid="so-hall-pass">
								<span class="so-list-main">{day(e.opened_at)}, {hallPassClockLabel(e.opened_at)}</span>
								<span class="so-figure">{e.closed_at ? hallPassDurationLabel(e) : 'Still out'}</span>
								{#if override}<span class="so-meta">{override}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if limitsLine}<p class="note">{limitsLine}</p>{/if}
			{:else}
				<p class="note" data-testid="so-overview-note">{overviewNote}</p>
			{/if}
		</section>

		<section class="card so-card" class:so-noprint={!printing.teams} data-testid="so-teams" aria-labelledby="so-h-teams">
			<div class="so-card-head">
				<h2 id="so-h-teams">Teams</h2>
				{@render printToggle('teams', 'Teams')}
			</div>
			{#if data.sources.teams === 'error'}
				<p class="note">Could not load the saved teams just now.</p>
			{:else if data.sources.teams === 'unavailable'}
				<p class="note">Saved teams are not set up on this deployment.</p>
			{:else if data.teams.length}
				<ul class="so-list">
					{#each data.teams as t (t.setId)}
						<li class="so-list-row" data-testid="so-team">
							<span class="so-list-main">{t.label}: <strong>{t.teamName}</strong>, a team of {t.size}</span>
							<span class="so-meta">
								{day(t.createdAt)}{t.posted ? ', posted to the class' : ''}{t.edited ? `, ${t.edited.toLowerCase()}` : ''}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="note">Not on any saved team in this class.</p>
			{/if}
		</section>

		<section class="card so-card" class:so-noprint={!printing.coins} data-testid="so-coins" aria-labelledby="so-h-coins">
			<div class="so-card-head">
				<h2 id="so-h-coins">Coins and music</h2>
				{@render printToggle('coins', 'Coins and music')}
			</div>
			{#if data.coins && data.songs}
				<p class="so-line">
					IDEA Coins, across all classes: <strong>{coinAmount(data.coins.balance)}</strong>
					({coinAmount(data.coins.physical)} physical, {coinAmount(data.coins.digital)} digital).
				</p>
				<p class="so-line" data-testid="so-songs">
					Music requests in this class: {data.songs.requested} asked, {data.songs.approved} played,
					{data.songs.rejected} turned down, {data.songs.pending} waiting.
				</p>
				{#if data.coins.rows.length < data.coins.total}
					<p class="note">Showing the newest {data.coins.rows.length} of {data.coins.total} transactions.</p>
				{/if}
				<div class="so-coin-rows">
					<CoinTransactionRows transactions={data.coins.rows} kinds={data.coins.kinds} showActor={false} emptyMessage="No IDEA Coin transactions yet." />
				</div>
			{:else}
				<p class="note" data-testid="so-overview-note">{overviewNote}</p>
			{/if}
		</section>

		{#if hasModels || !data.sources.ideacad}
			<section class="card so-card" class:so-noprint={!printing.models} data-testid="so-models" aria-labelledby="so-h-models">
				<div class="so-card-head">
					<h2 id="so-h-models">Models and apps</h2>
					{@render printToggle('models', 'Models and apps')}
				</div>
				{#if !data.sources.ideacad}
					<p class="note">Could not load their IdeaCAD models just now.</p>
				{:else if data.ideacad.length}
					<h3 class="so-h3">IdeaCAD models for this class</h3>
					<ul class="so-list">
						{#each data.ideacad as d (d.id)}
							<li class="so-list-row" data-testid="so-ideacad">
								<span class="so-list-main">{d.title}{#if d.itemTitle && d.itemTitle !== d.title}<span class="so-meta">, for {d.itemTitle}</span>{/if}</span>
								{#if d.updatedAt}<span class="so-meta">Saved {when(d.updatedAt)}</span>{/if}
								{#if d.archived}<span class="chip tone-muted">Archived</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if data.foundry.length}
					<h3 class="so-h3">Apps of theirs you can see in the Foundry gallery</h3>
					<ul class="so-list">
						{#each data.foundry as a (a.id)}
							<li class="so-list-row" data-testid="so-foundry">
								<a class="so-list-main so-link tap-44" href={foundryAppHref(a.slug)}>{a.title}</a>
							</li>
						{/each}
					</ul>
					{#if data.foundryAuthorHref}
						<p class="so-line"><a class="so-link tap-44" href={data.foundryAuthorHref}>Their Foundry page</a></p>
					{/if}
				{/if}
			</section>
		{/if}
	</div>
</main>

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: var(--space-3, 0.75rem) var(--cr-gutter, 1rem) var(--space-6, 2rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.so-root :global(.card) {
		margin: 0;
	}
	.so-identity {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}
	.so-id-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.so-avatar {
		flex: none;
	}
	.so-id-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.so-name {
		margin: 0;
		font-size: 1.6rem;
		line-height: 1.15;
		color: var(--text-1);
	}
	.so-email,
	.so-class {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.so-id-chips {
		margin: 0.2rem 0 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.so-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		margin: 0;
	}
	.chip {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		white-space: nowrap;
	}
	.tone-good {
		color: var(--green);
		border-color: var(--green);
	}
	.tone-attention {
		color: var(--amber);
		border-color: var(--amber);
	}
	.tone-info {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.tone-muted {
		color: var(--text-2);
	}
	/* Missing is its own tone, as on the class page: the word leads, and a mark,
	   a fill and the weight set it apart from "In progress". Never colour alone. */
	.tone-missing {
		color: var(--amber);
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber) 14%, transparent);
		font-weight: 700;
	}
	.work-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.chip-mark {
		flex: none;
		width: 0.7rem;
		height: 0.7rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.so-meta {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.so-quiet {
		color: var(--text-2);
	}
	.so-late {
		color: var(--amber);
		font-weight: 700;
	}
	.so-figure {
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
	}

	/* AT A GLANCE: each tile a word and a figure, never colour alone. */
	.so-glance {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
		gap: var(--space-2, 0.5rem);
	}
	.so-tile {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
		background: var(--surface-1, var(--bg1));
		min-width: 0;
	}
	.so-tile-label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.so-tile-figure {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-1);
		font-variant-numeric: tabular-nums;
	}
	.so-tile-sub {
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.so-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
		container-type: inline-size;
	}
	.so-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.so-card-head h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.so-h3 {
		margin: 0.4rem 0 0;
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.so-print-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
		cursor: pointer;
	}
	.so-print-toggle input {
		width: 1.1rem;
		height: 1.1rem;
		margin: 0;
	}
	.so-line {
		margin: 0;
		color: var(--text-1);
	}
	.so-coverage {
		margin: 0;
		color: var(--text-2);
		max-width: var(--measure-reading);
	}
	.so-source-note {
		color: var(--amber);
	}
	/* Two classes, so it outranks the list's own ink on a link that is also the
	   row's main text. */
	a.so-link {
		color: var(--body-link, var(--cyan));
	}

	.so-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.so-list-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.6rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--hairline);
		min-width: 0;
	}
	.so-list-row:last-child {
		border-bottom: none;
	}
	.so-list-main {
		flex: 1 1 12rem;
		min-width: 0;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.so-word {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-1);
		min-width: 7.5rem;
	}
	.so-cell {
		flex: none;
		width: 1.6rem;
		height: 1.6rem;
		display: inline-grid;
		place-items: center;
		font-family: var(--font-mono);
		font-weight: 700;
		border: 1px solid var(--boundary);
		border-radius: 4px;
		color: var(--text-1);
	}
	.so-cell-on_time {
		color: var(--green);
		border-color: var(--green);
	}
	.so-cell-late,
	.so-cell-missing {
		color: var(--amber);
		border-color: var(--amber);
	}
	.so-cell-flagged {
		color: var(--amber);
		border-color: var(--amber);
		border-style: dashed;
	}

	/* THE ASSIGNMENTS TABLE. A real table where there is room; below 46rem of
	   its own card each row stacks into a labelled block, so a phone never
	   scrolls the page sideways. */
	.so-table-wrap {
		overflow-x: auto;
		min-width: 0;
	}
	.so-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.so-table th,
	.so-table td {
		text-align: left;
		vertical-align: top;
		padding: 0.45rem 0.5rem;
		border-bottom: 1px solid var(--hairline);
		color: var(--text-1);
	}
	.so-table thead th {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
		white-space: nowrap;
	}
	.so-col-title {
		font-weight: 700;
		min-width: 10rem;
	}
	.so-col-title .chip {
		margin-left: 0.3rem;
	}
	.so-table td .so-meta {
		display: block;
		margin-top: 0.15rem;
	}
	@container (width < 46rem) {
		.so-table thead {
			display: none;
		}
		.so-table,
		.so-table tbody,
		.so-table tr,
		.so-table th,
		.so-table td {
			display: block;
			width: auto;
		}
		.so-table tr {
			padding: 0.4rem 0;
			border-bottom: 1px solid var(--boundary);
		}
		.so-table th,
		.so-table td {
			border-bottom: none;
			padding: 0.15rem 0;
		}
		.so-table td:empty {
			display: none;
		}
		.so-table td::before {
			content: attr(data-label) ': ';
			font-family: var(--font-mono);
			font-size: 0.66rem;
			text-transform: uppercase;
			color: var(--text-2);
		}
	}

	/* PANELS OF UNEQUAL HEIGHT GO IN COLUMNS, NEVER A GRID (CLAUDE.md): a grid
	   row is as tall as its tallest panel. Capped at two, so a short pane holds
	   one and a wide one shares the measure. */
	.so-panels {
		columns: 26rem 2;
		column-gap: var(--space-3, 0.75rem);
	}
	.so-panels > .so-card {
		break-inside: avoid;
		margin: 0 0 var(--space-3, 0.75rem);
	}
	.so-coin-rows {
		min-width: 0;
	}

	.so-print-only {
		display: none;
	}
	.so-print-line {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}

	/* PRINT. Every rule that names something outside this component carries
	   the `body:has(.so-root)` condition, because a route's stylesheet stays in
	   the page after a client-side navigation (CLAUDE.md's DOM trap). */
	@media print {
		:global(body:has(.so-root)) :global(:is(.cr-header, .cr-chrome, .bg-fx, .sfb, [data-nav-progress], #bg-canvas)) {
			display: none !important;
		}
		:global(body:has(.so-root)) {
			background: #fff !important;
		}
		.so-print-only {
			display: block;
		}
		.so-actions,
		.so-print-toggle,
		.so-noprint {
			display: none !important;
		}
		.classroom-page {
			max-width: none;
			padding: 0;
		}
		.so-root :global(.card),
		.so-tile {
			box-shadow: none !important;
			background: none !important;
			break-inside: avoid;
		}
		/* THE ASSIGNMENTS CARD MAY BREAK BETWEEN ROWS. Held whole, it is taller
		   than what is left of the first sheet and pushed the whole table onto
		   the second, leaving the first two-thirds blank (measured). A row never
		   breaks, and the head repeats on each sheet. */
		.so-root .so-assignments-card {
			break-inside: auto;
		}
		.so-panels {
			columns: auto;
		}
		.so-table-wrap {
			overflow: visible;
		}
		.so-table {
			font-size: 0.72rem;
		}
		.so-table th,
		.so-table td {
			padding: 0.3rem 0.35rem;
		}
		.so-table thead {
			display: table-header-group;
		}
		.so-table tr {
			break-inside: avoid;
		}
		.so-when {
			white-space: nowrap;
		}
		a.so-link {
			color: inherit;
			text-decoration: none;
		}
	}
</style>
