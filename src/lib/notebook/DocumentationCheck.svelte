<script lang="ts">
	import { untrack } from 'svelte';
	import {
		criterionMax,
		isOverrideScore,
		levelIndexForScore,
		rubricTotal,
		type RubricCriterion
	} from '$lib/classroom/assignment-spec';
	import { sectionName, summarize, type ReviewSection, type SectionGrid } from '$lib/notebook-review';
	import {
		DOC_CHECK_CRITERIA,
		DOC_CHECK_PRESENCE_ID,
		flagEvidence,
		gradableEmail,
		presenceCriterion,
		presenceEvidence,
		presenceScoreFor,
		type DocCheckData,
		type DocCheckTransports
	} from '$lib/notebook-documentation-check';

	/**
	 * The Documentation Check: grading one notebook unit as an ordinary IDEA
	 * Classroom assignment, from the evidence sitting in the grid above it.
	 *
	 * WHAT IT DOES NOT DO, and this is the design rather than an omission:
	 *
	 *   * It does not write a grade. `transports.gradeSubmission` is the SAME
	 *     classroom_grade_submission the Classroom grading console calls, with
	 *     the same arguments, so a Documentation Check lands in
	 *     classroom_submissions in exactly the shape every other assignment
	 *     does and exports through the same FACTS CSV.
	 *   * It does not total anything. The live figure here is a preview; the
	 *     authoritative score is whatever the RPC answers with, and the panel
	 *     re-reads after every save rather than trusting its own arithmetic.
	 *   * It does not decide who may grade. That is
	 *     classroom_can_review_submission inside the RPC -- the caller manages
	 *     a section the item is posted to AND that the student is enrolled in.
	 *     A teacher of one class cannot grade another's student here any more
	 *     than they can from the Classroom console.
	 *   * NOTHING AUTO-SUBMITS. The presence criterion arrives pre-filled from
	 *     real counts; every criterion, and the decision to save at all, is the
	 *     instructor's.
	 */
	let {
		section,
		unitNumber,
		grid,
		transports
	}: {
		section: ReviewSection;
		/** null = "all units": there is no single unit to grade. */
		unitNumber: number | null;
		grid: SectionGrid | null;
		transports: DocCheckTransports;
	} = $props();

	let data = $state<DocCheckData | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let busy = $state(false);
	let actionError = $state<string | null>(null);
	let notice = $state<string | null>(null);

	/** Which assignment the picker has selected, before Link is pressed. */
	let candidateId = $state<string>('');

	/** The open student's email, or null. One editor at a time. */
	let openEmail = $state<string | null>(null);
	let scores = $state<Record<string, number | null>>({});
	let critComments = $state<Record<string, string>>({});
	let overrideOpen = $state<Record<string, boolean>>({});
	let comment = $state('');
	let needComment = $state<string[]>([]);

	/** Per-student counts from the grid, the same `summarize` the table uses. */
	const summaries = $derived(grid ? summarize(grid) : []);
	const rubric = $derived(data?.rubric ?? null);
	const outOf = $derived(rubric?.length ? rubricTotal(rubric) : (data?.item?.points ?? 0));
	const presence = $derived(presenceCriterion(rubric));

	let loadToken = 0;

	async function refresh(sectionId = section.id, unit = unitNumber) {
		if (unit === null) {
			data = null;
			return;
		}
		const token = ++loadToken;
		loading = true;
		loadError = null;
		const result = await transports.load(sectionId, unit);
		if (token !== loadToken) return;
		loading = false;
		if (!result.ok) {
			loadError = result.error;
			data = null;
			return;
		}
		data = result.value;
	}

	/**
	 * Reload on section or unit change, and ONLY then. The refetch is
	 * `untrack`ed for the reason ReviewConsole's own is: an effect tracks every
	 * reactive read that happens while it runs, including inside the injected
	 * transports, which would make this effect depend on whatever state they
	 * touch.
	 */
	$effect(() => {
		const id = section.id;
		const unit = unitNumber;
		untrack(() => {
			closeStudent();
			candidateId = '';
			notice = null;
			actionError = null;
			void refresh(id, unit);
		});
	});

	function closeStudent() {
		openEmail = null;
		needComment = [];
	}

	function openStudent(email: string) {
		if (openEmail === email) {
			closeStudent();
			return;
		}
		openEmail = email;
		actionError = null;
		notice = null;
		needComment = [];
		const saved = data?.submissions[email] ?? null;
		const summary = summaries.find((s) => gradableEmail(s) === email) ?? null;
		const savedScores = saved?.rubric_scores ?? {};
		const savedNotes = saved?.criterion_comments ?? {};

		scores = Object.fromEntries(
			(rubric ?? []).map((c) => {
				const stored = savedScores[c.id];
				if (typeof stored === 'number') return [c.id, stored];
				// The pre-fill, and the ONLY criterion that gets one: presence is
				// the one question the grid can answer.
				if (c.id === DOC_CHECK_PRESENCE_ID && summary) {
					return [c.id, presenceScoreFor(summary, criterionMax(c))];
				}
				return [c.id, null];
			})
		);
		critComments = Object.fromEntries(
			(rubric ?? []).map((c) => {
				const stored = savedNotes[c.id];
				if (stored) return [c.id, stored];
				if (c.id === DOC_CHECK_PRESENCE_ID && summary) {
					return [c.id, presenceEvidence(summary)];
				}
				return [c.id, ''];
			})
		);
		// A saved score matching no level IS an override, so its input opens on
		// its own; the state is read back from the number, never stored.
		overrideOpen = Object.fromEntries(
			(rubric ?? []).map((c) => [c.id, isOverrideScore(c, scores[c.id])])
		);
		comment = saved?.teacher_comment ?? '';
	}

	const liveTotal = $derived(
		(rubric ?? []).reduce((sum, c) => sum + (Number(scores[c.id]) || 0), 0)
	);

	function pickLevel(c: RubricCriterion, points: number) {
		scores = { ...scores, [c.id]: points };
		overrideOpen = { ...overrideOpen, [c.id]: false };
		needComment = needComment.filter((id) => id !== c.id);
	}

	function toggleOverride(c: RubricCriterion) {
		const open = !overrideOpen[c.id];
		overrideOpen = { ...overrideOpen, [c.id]: open };
		if (!open && isOverrideScore(c, scores[c.id])) {
			scores = { ...scores, [c.id]: null };
			needComment = needComment.filter((id) => id !== c.id);
		}
	}

	/**
	 * `bind:value` on `<input type="number">` COERCES to a number, so an
	 * override field can hand back either. Read it as text before parsing --
	 * this repo has been caught by `.trim()` on a coerced number three times.
	 */
	function setOverride(c: RubricCriterion, raw: string | number) {
		const text = String(raw ?? '').trim();
		scores = { ...scores, [c.id]: text === '' ? null : Number(text) };
		needComment = needComment.filter((id) => id !== c.id);
	}

	async function saveGrade(release: boolean) {
		const email = openEmail;
		if (!email || !data?.item || !rubric?.length) return;
		actionError = null;
		notice = null;
		needComment = [];

		const payload: Record<string, number> = {};
		const notes: Record<string, string> = {};
		const summary = summaries.find((s) => gradableEmail(s) === email) ?? null;
		for (const c of rubric) {
			const value = scores[c.id];
			if (value != null && !Number.isNaN(Number(value))) payload[c.id] = Number(value);
			let note = (critComments[c.id] ?? '').trim();
			// Presence always carries its derivation. A computed score can land
			// between levels, and an off-level score needs a comment explaining
			// it -- the derivation IS that explanation, so the instructor is
			// never asked to justify arithmetic the grid did for them.
			if (!note && c.id === DOC_CHECK_PRESENCE_ID && summary && payload[c.id] != null) {
				note = presenceEvidence(summary);
			}
			if (note) notes[c.id] = note;
		}

		busy = true;
		const result = await transports.gradeSubmission(
			data.item.id,
			email,
			payload,
			comment.trim() || null,
			release,
			notes
		);
		busy = false;
		if (!result.ok) {
			actionError = result.error;
			return;
		}
		const outcome = result.value;
		if (outcome.ok === false) {
			if (outcome.reason === 'override_needs_comment') {
				needComment = outcome.missing ?? [];
				actionError = 'Say why you scored between levels on the criteria marked below.';
			} else if (outcome.reason === 'incomplete_scores') {
				actionError = `Score every criterion before returning it (${outcome.missing?.length ?? 0} left).`;
			} else {
				actionError = 'That grade was refused.';
			}
			return;
		}
		notice = release
			? `Returned -- ${outcome.score} of ${outOf} is visible to the student now.`
			: `Draft saved at ${outcome.score} of ${outOf}. Nothing is released until you return it.`;
		await refresh();
	}

	async function link() {
		if (!candidateId || unitNumber === null) return;
		busy = true;
		actionError = null;
		const result = await transports.linkItem(section.id, unitNumber, candidateId);
		busy = false;
		if (!result.ok) {
			actionError = result.error;
			return;
		}
		candidateId = '';
		await refresh();
	}

	let confirmUnlink = $state(false);
	async function unlink() {
		if (unitNumber === null) return;
		busy = true;
		actionError = null;
		const result = await transports.unlinkItem(section.id, unitNumber);
		busy = false;
		confirmUnlink = false;
		if (!result.ok) {
			actionError = result.error;
			return;
		}
		closeStudent();
		await refresh();
	}

	async function installRubric() {
		if (!data?.item) return;
		busy = true;
		actionError = null;
		const result = await transports.installRubric(data.item.id, DOC_CHECK_CRITERIA);
		busy = false;
		if (!result.ok) {
			actionError = result.error;
			return;
		}
		await refresh();
	}

	function statusOf(email: string): { label: string; cls: string } {
		const saved = data?.submissions[email];
		if (!saved || saved.graded_at === null) return { label: 'Not graded', cls: 'none' };
		if (saved.state === 'returned') {
			return { label: `Returned · ${saved.score ?? '—'} / ${outOf}`, cls: 'returned' };
		}
		return { label: `Draft · ${saved.score ?? '—'} / ${outOf}`, cls: 'draft' };
	}
</script>

<section class="card doc-check">
	<h2>Documentation Check</h2>

	{#if unitNumber === null}
		<p class="note">
			Pick a single unit above to grade its Documentation Check. Grades are written to the
			linked IDEA Classroom assignment, so they sit in the gradebook beside every other piece
			of work and export from there.
		</p>
	{:else if loading && !data}
		<p class="note">Loading…</p>
	{:else if loadError}
		<p class="msg error" role="alert">{loadError}</p>
	{:else if !data}
		<p class="note">Nothing to show for this unit.</p>
	{:else if !data.link || !data.item}
		<p class="note">
			Unit {unitNumber} of {sectionName(section)} is not linked to a Classroom assignment yet, so
			there is nothing to grade it on. The grid above works exactly as it does for every other
			unit.
		</p>
		{#if data.candidates.length === 0}
			<p class="note">
				This class has no assignments posted to it yet. Create one in
				<a href={`/classroom/${section.id}`}>IDEA Classroom</a> first -- name it whatever your
				students will recognise -- then come back and point this unit at it.
			</p>
		{:else}
			<div class="link-row">
				<label class="field">
					<span>Grade this unit on</span>
					<select bind:value={candidateId} disabled={busy}>
						<option value="">Choose an assignment…</option>
						{#each data.candidates as c (c.id)}
							<option value={c.id}>{c.title}{c.points === null ? '' : ` · ${c.points} pts`}</option>
						{/each}
					</select>
				</label>
				<button type="button" class="btn" onclick={link} disabled={busy || !candidateId}>
					Link
				</button>
			</div>
		{/if}
	{:else}
		<div class="linked">
			<p class="linked-line">
				Graded on
				<a href={`/classroom/${section.id}/item/${data.item.id}`}>{data.item.title}</a>
				{#if rubric?.length}<span class="dim">· out of {outOf}</span>{/if}
			</p>
			<div class="linked-actions">
				{#if confirmUnlink}
					<span class="confirm-note">Unlink? Grades already saved stay where they are.</span>
					<button type="button" class="btn danger" onclick={unlink} disabled={busy}>
						Yes, unlink
					</button>
					<button type="button" class="btn secondary" onclick={() => (confirmUnlink = false)}>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						class="btn secondary"
						onclick={() => (confirmUnlink = true)}
						disabled={busy}
					>
						Unlink
					</button>
				{/if}
			</div>
		</div>

		{#if actionError}<p class="msg error" role="alert">{actionError}</p>{/if}
		{#if notice}<p class="msg ok">{notice}</p>{/if}

		{#if !rubric?.length}
			<p class="note">
				This assignment has no rubric yet, so nothing can be scored. Install the standard
				Documentation Check rubric -- present for every session (7), raw data recorded in the
				moment (6), dated and legible (6), specific enough to reconstruct (6) -- and edit it on
				the assignment page afterwards like any other.
			</p>
			<button type="button" class="btn" onclick={installRubric} disabled={busy}>
				Install the standard rubric
			</button>
		{:else}
			{#if !presence}
				<p class="note">
					This rubric has no <code>{DOC_CHECK_PRESENCE_ID}</code> criterion, so nothing is
					pre-filled from the grid. Every criterion is scored by hand.
				</p>
			{/if}

			<ul class="students">
				{#each summaries as summary (summary.student.student_key)}
					{@const email = gradableEmail(summary)}
					{@const flags = flagEvidence(summary)}
					<li class:open={email !== null && openEmail === email}>
						<div class="row">
							<div class="who">
								<span class="name">{summary.student.name}</span>
								{#if !summary.student.enrolled}<span class="chip left">left</span>{/if}
								<span class="counts">
									{summary.covered} of {summary.total} filed{#if summary.excused > 0}, {summary.excused}
										excused{/if}{#if flags.length > 0}, flagged: {flags.join(' · ')}{/if}
								</span>
							</div>
							{#if email}
								{@const status = statusOf(email)}
								<span class="chip {status.cls}">{status.label}</span>
								<button type="button" class="btn secondary" onclick={() => openStudent(email)}>
									{openEmail === email ? 'Close' : 'Grade'}
								</button>
							{:else}
								<span class="chip none">No account yet</span>
							{/if}
						</div>

						{#if email && openEmail === email}
							<div class="editor">
								{#each rubric as c (c.id)}
									{@const isPresence = c.id === DOC_CHECK_PRESENCE_ID}
									<div class="criterion" class:needs={needComment.includes(c.id)}>
										<div class="crit-head">
											<span class="crit-name">{c.criterion}</span>
											<span class="dim">{scores[c.id] ?? '—'} / {criterionMax(c)}</span>
										</div>
										{#if isPresence}
											<p class="evidence">{presenceEvidence(summary)}</p>
										{:else if flags.length > 0}
											<p class="evidence">Flagged in this unit: {flags.join(' · ')}.</p>
										{/if}
										<div class="levels">
											{#each c.levels as level, i (i)}
												<button
													type="button"
													class="level"
													class:picked={levelIndexForScore(c, scores[c.id]) === i}
													onclick={() => pickLevel(c, level.points)}
													title={level.descriptor ?? ''}
												>
													<span class="level-points">{level.points}</span>
													<span class="level-label">{level.label}</span>
												</button>
											{/each}
											<button type="button" class="level other" onclick={() => toggleOverride(c)}>
												Other
											</button>
										</div>
										{#if overrideOpen[c.id]}
											<label class="field inline">
												<span>Score</span>
												<input
													type="number"
													min="0"
													max={criterionMax(c)}
													step="0.5"
													value={scores[c.id] ?? ''}
													oninput={(e) => setOverride(c, e.currentTarget.value)}
												/>
											</label>
										{/if}
										<label class="field">
											<span>Note{isPresence ? '' : ' (required if you score between levels)'}</span>
											<textarea rows="2" bind:value={critComments[c.id]}></textarea>
										</label>
									</div>
								{/each}

								<label class="field">
									<span>Comment to the student</span>
									<textarea rows="3" bind:value={comment}></textarea>
								</label>

								<div class="editor-actions">
									<span class="total">{liveTotal} / {outOf}</span>
									<button
										type="button"
										class="btn secondary"
										onclick={() => saveGrade(false)}
										disabled={busy}
									>
										Save draft
									</button>
									<button type="button" class="btn" onclick={() => saveGrade(true)} disabled={busy}>
										Return to student
									</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>

			{#if summaries.length === 0}
				<p class="note">Nobody is on this section's roster yet.</p>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.doc-check h2 {
		margin: 0 0 var(--space-1);
		font-size: 1rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.88rem;
		margin: var(--space-1) 0;
	}
	.msg {
		margin: var(--space-2) 0;
		font-size: 0.9rem;
	}
	.msg.error {
		color: var(--nb-error);
	}
	.msg.ok {
		color: var(--nb-ok);
	}
	.dim {
		color: var(--text-3);
	}
	.link-row {
		display: flex;
		align-items: flex-end;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-top: var(--space-2);
	}
	.field {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
		flex: 1 1 14rem;
	}
	.field.inline {
		flex: 0 0 8rem;
	}
	.field span {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.field select,
	.field input,
	.field textarea {
		width: 100%;
		min-width: 0;
		padding: var(--space-2);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.92rem;
	}
	.field textarea {
		resize: vertical;
	}
	.linked {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin: var(--space-2) 0 var(--space-2);
	}
	.linked-line {
		margin: 0;
		font-size: 0.92rem;
	}
	.linked-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
		flex-wrap: wrap;
	}
	.confirm-note {
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.students {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.students > li {
		/* A grid item's automatic minimum is its min-content, which a nowrap
		   row would push past a phone's width. */
		min-width: 0;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		padding: var(--space-2) var(--space-3);
		background: var(--surface-1);
	}
	.students > li.open {
		border-color: var(--nb-accent);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.who {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
		flex: 1 1 12rem;
	}
	.name {
		font-weight: 600;
		font-size: 0.95rem;
	}
	.counts {
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.chip {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: var(--space-1) var(--space-2);
		border-radius: 999px;
		border: 1px solid var(--nb-hairline-strong);
		color: var(--text-2);
		white-space: nowrap;
	}
	.chip.returned {
		border-color: var(--nb-accent);
		color: var(--nb-accent-ink);
	}
	.chip.left {
		font-size: 0.65rem;
	}
	.editor {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}
	.criterion {
		display: grid;
		gap: var(--space-1);
	}
	.criterion.needs {
		border-left: 3px solid var(--nb-error);
		padding-left: var(--space-2);
	}
	.crit-head {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		flex-wrap: wrap;
	}
	.crit-name {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.evidence {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.levels {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}
	.level {
		display: grid;
		gap: var(--space-1);
		min-height: 44px;
		padding: var(--space-1) var(--space-2);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		color: var(--text-1);
		font-family: inherit;
		cursor: pointer;
		text-align: left;
	}
	.level.picked {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash, transparent);
	}
	.level-points {
		font-weight: 700;
		font-size: 0.85rem;
	}
	.level-label {
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.editor-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.total {
		font-weight: 700;
		margin-right: auto;
	}
	/* The SessionManager convention, so the two-step confirm reads the same
	   in both notebook panels. */
	.btn.danger {
		background: var(--surface-1);
		border-color: var(--nb-error);
		color: var(--nb-error);
	}
	.btn.danger:hover {
		background: var(--nb-error);
		border-color: var(--nb-error);
		color: var(--surface-1);
		box-shadow: none;
	}
</style>
