<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import {
		criterionIncomplete,
		criterionMax,
		gateApproved,
		gradesCsv,
		isOverrideScore,
		levelIndexForScore,
		rubricTotal,
		scoresTotal,
		submissionFileSrc,
		submissionStateLabel,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type GradingData,
		type RubricCriterion,
		type StudentWork,
		studentWorkRows
	}	from '$lib/classroom/assignment-spec';
	import {
		formatBytes,
		itemTitle,
		sectionTitle,
		type ClassroomItem,
		type ClassroomSection
	} from '$lib/classroom/classroom';

	/**
	 * The grading console for one assignment in one section: the roster with
	 * submission status at a glance, each student's files and rendered spec
	 * responses read-only, rubric scoring with a live total and a private
	 * comment, save-as-draft then return-to-student, and the FACTS-ready CSV.
	 *
	 * The RPCs are the boundary (classroom_grade_submission /
	 * classroom_approve_module re-check classroom_can_review_submission);
	 * everything visual here is convenience over what RLS already scoped.
	 */
	let {
		section,
		item,
		spec = null,
		rubric = null,
		transports,
		basePath = '/classroom'
	}: {
		section: ClassroomSection;
		item: ClassroomItem;
		spec: AssignmentSpec | null;
		rubric: RubricCriterion[] | null;
		transports: AssignmentTeacherTransports;
		basePath?: string;
	} = $props();

	let data = $state<GradingData | null>(null);
	let loadError = $state<string | null>(null);
	let selectedEmail = $state<string | null>(null);
	let scores = $state<Record<string, number | null>>({});
	/** Per-criterion comments. The server REQUIRES one on every override. */
	let critComments = $state<Record<string, string>>({});
	/** Which criteria have the between-levels input open (UI only). */
	let overrideOpen = $state<Record<string, boolean>>({});
	/** Criterion ids the server refused for a missing override comment. */
	let needComment = $state<string[]>([]);
	let comment = $state('');
	let busy = $state(false);
	let gradeError = $state<string | null>(null);
	let gradeNotice = $state<string | null>(null);

	const students = $derived(data ? studentWorkRows(data) : []);
	const selected = $derived(students.find((s) => s.email === selectedEmail) ?? null);
	const outOf = $derived(rubric ? rubricTotal(rubric) : (item.points ?? 0));
	const liveTotal = $derived(
		rubric ? scoresTotal(rubric, scores as Record<string, number>) : 0
	);
	const gateModule = $derived(spec?.approvalGate?.afterModule ?? null);

	async function load() {
		const res = await transports.loadGrading(item.id, section.id);
		if (!res.ok) {
			loadError = res.message;
			return;
		}
		loadError = null;
		data = res.data;
	}
	$effect(() => {
		// Deferred out of the effect body (the ClassPage state_unsafe_mutation
		// lesson): the transport writes state synchronously before its first
		// await in the dev harness.
		queueMicrotask(() => void load());
	});

	function select(student: StudentWork) {
		selectedEmail = student.email;
		gradeError = null;
		gradeNotice = null;
		needComment = [];
		comment = student.submission?.teacher_comment ?? '';
		const saved = student.submission?.rubric_scores ?? {};
		const notes = student.submission?.criterion_comments ?? {};
		scores = Object.fromEntries((rubric ?? []).map((c) => [c.id, saved[c.id] ?? null]));
		critComments = Object.fromEntries((rubric ?? []).map((c) => [c.id, notes[c.id] ?? '']));
		// A saved score that matches no level IS an override, so its input opens
		// on its own -- the state is read back from the number, never stored.
		overrideOpen = Object.fromEntries(
			(rubric ?? []).map((c) => [c.id, isOverrideScore(c, saved[c.id])])
		);
	}

	function pickLevel(c: RubricCriterion, points: number) {
		scores = { ...scores, [c.id]: points };
		overrideOpen = { ...overrideOpen, [c.id]: false };
		needComment = needComment.filter((id) => id !== c.id);
	}

	function toggleOverride(c: RubricCriterion) {
		const open = !overrideOpen[c.id];
		overrideOpen = { ...overrideOpen, [c.id]: open };
		if (!open && isOverrideScore(c, scores[c.id])) {
			// Closing the override clears the off-level score rather than leaving
			// a number behind that no level explains.
			scores = { ...scores, [c.id]: null };
			needComment = needComment.filter((id) => id !== c.id);
		}
	}

	function statusChip(s: StudentWork): { label: string; cls: string } {
		const state = s.submission?.state ?? null;
		if (state === 'returned') {
			return { label: `Returned · ${s.submission?.score ?? '—'}/${outOf}`, cls: 'returned' };
		}
		if (state === 'submitted') return { label: 'Submitted', cls: 'submitted' };
		if (s.responses.length || s.files.length) return { label: 'In progress', cls: 'progress' };
		return { label: 'Not submitted', cls: 'none' };
	}

	async function grade(release: boolean) {
		if (!selected || !rubric) return;
		gradeError = null;
		gradeNotice = null;
		needComment = [];
		const payload: Record<string, number> = {};
		const notes: Record<string, string> = {};
		for (const c of rubric) {
			const v = scores[c.id];
			if (v != null && !Number.isNaN(Number(v))) payload[c.id] = Number(v);
			const note = (critComments[c.id] ?? '').trim();
			if (note) notes[c.id] = note;
		}
		busy = true;
		const res = await transports.gradeSubmission(
			item.id,
			selected.email,
			payload,
			comment.trim() || null,
			release,
			notes
		);
		busy = false;
		if (!res.ok) {
			gradeError = res.message;
			return;
		}
		if (res.data.ok === false) {
			if (res.data.reason === 'override_needs_comment') {
				needComment = res.data.missing ?? [];
				gradeError =
					needComment.length === 1
						? 'Say why you scored between levels (1 criterion still needs a comment).'
						: `Say why you scored between levels (${needComment.length} criteria still need a comment).`;
				return;
			}
			gradeError =
				res.data.reason === 'incomplete_scores'
					? `Score every criterion before returning (${res.data.missing?.length ?? 0} left).`
					: 'The grade was refused.';
			return;
		}
		gradeNotice = release
			? `Returned to ${selected.displayName} -- they can see the score and comment now.`
			: 'Draft saved. Nothing is released until you return it.';
		await load();
	}

	async function setGate(approvedNow: boolean) {
		if (!selected || !gateModule) return;
		busy = true;
		const res = await transports.approveModule(item.id, selected.email, gateModule, approvedNow);
		busy = false;
		if (!res.ok) {
			gradeError = res.message;
			return;
		}
		await load();
	}

	function exportCsv() {
		const rows = students.map((s) => ({
			displayName: s.displayName,
			email: s.email,
			score: s.submission?.state === 'returned' ? (s.submission.score ?? null) : null,
			outOf
		}));
		const csv = gradesCsv(rows);
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const label = (item.title ?? 'assignment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		a.download = `grades-${label}-${sectionSlug()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
	function sectionSlug(): string {
		return sectionTitle(section).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	const returnedCount = $derived(
		students.filter((s) => s.submission?.state === 'returned').length
	);
</script>

<svelte:head>
	<title>Grading // {itemTitle(item)}</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href={`${basePath}/${section.id}/item/${item.id}`}>&lsaquo; {itemTitle(item)}</a>
		<ProfileMenu />
	</div>
</div>

<main class="grading-page">
	<section class="hero">
		<div class="eyebrow">Grading</div>
		<h1>{itemTitle(item)}</h1>
		<p class="meta-line">{sectionTitle(section)} · out of {outOf} pts</p>
	</section>

	{#if loadError}
		<p class="feedback error">{loadError}</p>
	{:else if !data}
		<p class="note">Loading the roster…</p>
	{:else}
		{#if !rubric?.length}
			<section class="card warn-card">
				<p class="warn-line">
					This assignment has no rubric yet, so nothing can be scored. Build one on the
					assignment page (or generate it from the spec), then come back.
				</p>
			</section>
		{/if}

		<div class="console" class:split={!!selected}>
			<section class="roster card">
				<div class="roster-head">
					<h2 class="section-label">Roster</h2>
					<button type="button" class="btn secondary tiny" onclick={exportCsv}>
						Export CSV
					</button>
				</div>
				{#if returnedCount < students.length}
					<p class="csv-hint">
						CSV scores fill in as work is returned ({returnedCount}/{students.length} returned).
					</p>
				{/if}
				<ul class="roster-list">
					{#each students as s (s.email)}
						{@const chip = statusChip(s)}
						<li>
							<button
								type="button"
								class="roster-row"
								class:active={selectedEmail === s.email}
								class:inactive={!s.active}
								onclick={() => select(s)}
							>
								<span class="roster-name">{s.displayName}</span>
								<span class="roster-chip {chip.cls}">{chip.label}</span>
							</button>
						</li>
					{/each}
					{#if students.length === 0}
						<li class="note">No students enrolled in this section.</li>
					{/if}
				</ul>
			</section>

			{#if selected}
				<section class="work">
					<div class="card work-head">
						<div>
							<h2 class="work-name">{selected.displayName}</h2>
							<p class="work-meta">
								{selected.email}
								{#if selected.submission?.submitted_at}
									· submitted {new Date(selected.submission.submitted_at).toLocaleString(undefined, {
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit'
									})}
								{/if}
								· {submissionStateLabel(selected.submission?.state)}
							</p>
						</div>
						<button type="button" class="btn secondary tiny" onclick={() => (selectedEmail = null)}>
							Close
						</button>
					</div>

					{#if spec && gateModule}
						{@const approved = gateApproved(spec, selected.approvals)}
						<div class="card gate-row" class:approved>
							<span class="gate-text">
								{spec.approvalGate?.label ?? 'Instructor approval'}:
								{approved ? ' approved' : ' not yet approved'}
							</span>
							<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => setGate(!approved)}>
								{approved ? 'Withdraw approval' : 'Approve'}
							</button>
						</div>
					{/if}

					{#if selected.files.filter((f) => !f.block_id).length}
						<div class="card">
							<h3 class="section-label">Files handed in</h3>
							<ul class="file-list">
								{#each selected.files.filter((f) => !f.block_id) as f (f.id)}
									<li>
										<a href={submissionFileSrc(f.id)} target="_blank" rel="noopener noreferrer">{f.filename}</a>
										<span class="file-meta">{formatBytes(f.size_bytes)}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if spec}
						<h3 class="section-label responses-label">Responses</h3>
						{#key selected.email}
							<SpecRenderer
								{spec}
								initialValues={Object.fromEntries(
									selected.responses.map((r) => [r.block_id, r.value ?? {}])
								)}
								files={selected.files}
								readonly
								approved={gateApproved(spec, selected.approvals)}
							/>
						{/key}
					{:else if !selected.files.length}
						<p class="note card">Nothing handed in yet.</p>
					{/if}

					{#if rubric?.length}
						<div class="card score-card">
							<h3 class="section-label">Rubric score</h3>
							<!-- Grading is a LEVEL CHOICE, not a typed number: every level's
							     descriptor stays on screen so the decision is made against the
							     written standard, and the level's points are what apply. -->
							{#each rubric as c (c.id)}
								{@const max = criterionMax(c)}
								{@const chosen = levelIndexForScore(c, scores[c.id])}
								{@const override = isOverrideScore(c, scores[c.id])}
								{@const missingNote = needComment.includes(c.id)}
								<div class="score-row" class:override class:flagged={missingNote}>
									<div class="score-head">
										<span class="score-crit">{c.criterion}</span>
										<span class="score-value" class:override>
											{scores[c.id] ?? '—'} / {max}
											{#if override}<span class="override-chip">Override</span>{/if}
										</span>
									</div>
									{#if criterionIncomplete(c)}
										<p class="score-unfinished">
											This criterion’s levels are unfinished, so most scores need an override.
										</p>
									{/if}
									<div class="level-picker" role="group" aria-label={`Levels for ${c.criterion}`}>
										{#each c.levels ?? [] as level, li (li)}
											<button
												type="button"
												class="level-btn"
												class:picked={li === chosen}
												aria-pressed={li === chosen}
												onclick={() => pickLevel(c, level.points)}
											>
												<span class="level-top">
													<span class="level-points">{level.points}</span>
													<span class="level-label">{level.label}</span>
												</span>
												{#if level.descriptor}
													<span class="level-desc">{level.descriptor}</span>
												{/if}
											</button>
										{/each}
									</div>
									<button type="button" class="override-toggle" onclick={() => toggleOverride(c)}>
										{overrideOpen[c.id] ? 'Use a level instead' : 'Score between levels'}
									</button>
									{#if overrideOpen[c.id]}
										<div class="override-box">
											<span class="score-input">
												<input
													type="number"
													min="0"
													max={max}
													step="0.5"
													bind:value={scores[c.id]}
													aria-label={`Score for ${c.criterion}`}
												/>
												<span class="score-out">/ {max}</span>
											</span>
											<textarea
												class="crit-comment"
												rows="2"
												placeholder="Why this score and not a level? (required)"
												aria-label={`Comment on ${c.criterion}`}
												bind:value={critComments[c.id]}
											></textarea>
										</div>
									{:else if critComments[c.id]}
										<p class="score-note">{critComments[c.id]}</p>
									{/if}
									{#if missingNote}
										<p class="score-flag">A comment is required to score between levels.</p>
									{/if}
								</div>
							{/each}
							<div class="score-total">Total: {liveTotal} / {outOf} pts</div>
							<label class="comment-label" for="grade-comment">Comment to the student</label>
							<textarea id="grade-comment" class="comment" rows="3" bind:value={comment}></textarea>
							{#if gradeError}<p class="feedback error">{gradeError}</p>{/if}
							{#if gradeNotice}<p class="feedback ok">{gradeNotice}</p>{/if}
							<span class="grade-actions">
								<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => grade(false)}>
									Save draft
								</button>
								<button type="button" class="btn tiny" disabled={busy} onclick={() => grade(true)}>
									Return to student
								</button>
							</span>
						</div>
					{/if}
				</section>
			{/if}
		</div>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.grading-page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.meta-line {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
		margin: 0.2rem 0 0;
	}
	.console {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.9rem;
		align-items: start;
	}
	.console.split {
		grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr);
	}
	@media (max-width: 800px) {
		.console.split {
			grid-template-columns: 1fr;
		}
	}
	.section-label {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.roster-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
	.csv-hint {
		margin: 0 0 0.5rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
	}
	.roster-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.roster-row {
		appearance: none;
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 6px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.9rem;
		padding: 0.4rem 0.55rem;
		cursor: pointer;
		text-align: left;
	}
	.roster-row:hover,
	.roster-row.active {
		border-color: var(--line-strong);
	}
	.roster-row.active {
		background: var(--bg0);
	}
	.roster-row.inactive {
		opacity: 0.6;
	}
	.roster-name {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.roster-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.06rem 0.45rem;
		color: var(--dim);
		white-space: nowrap;
	}
	.roster-chip.submitted {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.roster-chip.returned {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.roster-chip.progress {
		color: var(--teal);
		border-color: var(--teal);
	}
	.work {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.card {
		margin-bottom: 0.9rem;
	}
	.work-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.6rem;
	}
	.work-name {
		margin: 0;
		font-size: 1.05rem;
	}
	.work-meta {
		margin: 0.15rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim);
	}
	.gate-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		border-color: var(--gold);
	}
	.gate-row.approved {
		border-color: var(--line-strong);
	}
	.gate-text {
		font-size: 0.88rem;
	}
	.responses-label {
		margin: 0.2rem 0 0.5rem;
	}
	.file-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.file-list a {
		overflow-wrap: anywhere;
	}
	.file-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
		margin-left: 0.4rem;
	}
	.score-card {
		border-color: var(--line-strong);
	}
	.score-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem 0 0.6rem;
		border-bottom: 1px solid var(--line);
		border-left: 2px solid transparent;
	}
	.score-row.override {
		border-left-color: var(--amber);
		padding-left: 0.5rem;
	}
	.score-row.flagged {
		border-left-color: var(--crimson);
		padding-left: 0.5rem;
	}
	.score-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
	}
	.score-crit {
		font-size: 0.88rem;
		min-width: 0;
	}
	.score-value {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--green);
		white-space: nowrap;
	}
	.score-value.override {
		color: var(--amber);
	}
	.override-chip {
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.05rem 0.4rem;
		margin-left: 0.3rem;
	}
	.level-picker {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.level-btn {
		appearance: none;
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		width: 100%;
		text-align: left;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.55rem;
		min-height: 2.75rem;
		cursor: pointer;
	}
	.level-btn:hover {
		border-color: var(--line-strong);
	}
	.level-btn.picked {
		border-color: var(--green);
		background: var(--bg0);
	}
	.level-top {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}
	.level-points {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--gold);
		min-width: 1.6rem;
	}
	.level-label {
		font-size: 0.85rem;
	}
	.level-desc {
		font-size: 0.76rem;
		color: var(--dim);
	}
	.override-toggle {
		appearance: none;
		background: none;
		border: none;
		color: var(--cyan);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		text-align: left;
		padding: 0.35rem 0;
		cursor: pointer;
	}
	.override-box {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.crit-comment {
		width: 100%;
		box-sizing: border-box;
		background: var(--bg0);
		border: 1px solid var(--amber);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.85rem;
		padding: 0.35rem 0.5rem;
	}
	.score-note {
		margin: 0;
		font-size: 0.78rem;
		color: var(--dim);
	}
	.score-flag {
		margin: 0;
		font-size: 0.76rem;
		color: var(--crimson);
	}
	.score-unfinished {
		margin: 0;
		font-size: 0.74rem;
		color: var(--amber);
	}
	.score-input {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.score-input input {
		width: 4.2rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		padding: 0.25rem 0.35rem;
	}
	.score-input input:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.score-out {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.score-total {
		margin: 0.6rem 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		color: var(--gold);
	}
	.comment-label {
		display: block;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-bottom: 0.25rem;
	}
	.comment {
		width: 100%;
		box-sizing: border-box;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.9rem;
		padding: 0.4rem 0.55rem;
		margin-bottom: 0.5rem;
	}
	.grade-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.btn.tiny,
	.btn.secondary.tiny {
		font-size: 0.65rem;
		padding: 0.28rem 0.6rem;
	}
	.warn-card {
		border-color: var(--amber);
	}
	.warn-line {
		margin: 0;
		color: var(--amber);
		font-size: 0.88rem;
	}
	.note {
		color: var(--dim);
		font-size: 0.85rem;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		border-radius: 5px;
		padding: 0.4rem 0.65rem;
		margin: 0.4rem 0;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
