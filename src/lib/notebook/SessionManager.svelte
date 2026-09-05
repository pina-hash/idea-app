<script lang="ts">
	import CheckInGuidance from '$lib/CheckInGuidance.svelte';
	import { hasGuidance } from '$lib/check-in-guidance';
	import {
		checkInEditKind,
		checkInLoad,
		checkInLoadIndex,
		type CheckInLoad,
		type LinkTargetItem,
		type SessionItemLink,
		type SessionItemTransports
	} from '$lib/notebook/admin-actions';
	import type { TiptapNode } from '$lib/rich-text';
	import {
		sectionName,
		sessionsInOrder,
		shortDate,
		type GridSession,
		type ReviewResult,
		type ReviewSection,
		type SessionInput
	} from '$lib/notebook-review';
	import type { CheckInLoadCell as GridLoadCell } from '$lib/notebook/admin-actions';

	/**
	 * The section's scheduled check-ins: list, add, edit, delete, and (since
	 * 0098) which sections each one runs in.
	 *
	 * This has to exist for the grid to have columns at all -- before it there
	 * was no way to create a notebook_sessions row outside direct database
	 * access, so every section's grid was necessarily empty.
	 *
	 * MULTI-SECTION IS THE POINT OF THE FORM. Three sections on identical
	 * pacing used to mean creating the same check-in three times, with three
	 * chances to mistype the date. One canonical check-in posted to three
	 * sections is one date, edited once.
	 *
	 * Presentation + callbacks only (the Minimap / FrcReviewQueue convention):
	 * every callback carries a ready-made payload to its RPC and the parent
	 * refetches. Each RPC enforces its own tier inside the function -- and they
	 * are deliberately not the same tier (editing needs every section the
	 * check-in runs in; taking your OWN class off it needs only that section),
	 * so this component does no permission check of its own. A second copy of
	 * that rule is a copy that can drift.
	 */
	let {
		sectionId,
		sections,
		sessions,
		onSave,
		onDelete,
		onAddSections,
		onRemoveSection,
		onSetGuidance = null,
		itemLink = null,
		itemLinks = [],
		itemCandidates = [],
		grid = null
	}: {
		sectionId: string;
		/** Every section the caller manages -- what a check-in may be posted to. */
		sections: ReviewSection[];
		sessions: GridSession[];
		onSave: (input: SessionInput) => Promise<ReviewResult<{ session_id: string }>>;
		onDelete: (sessionId: string) => Promise<ReviewResult<{ detached_entries: number }>>;
		onAddSections: (
			sessionId: string,
			sectionIds: string[]
		) => Promise<ReviewResult<{ added: number }>>;
		onRemoveSection: (
			sessionId: string,
			sectionId: string
		) => Promise<
			ReviewResult<{ ok: boolean; reason?: string; detached_entries?: number; remaining?: number }>
		>;
		/**
		 * Write one check-in's guidance prompt (0123). ABSENT removes the field
		 * outright -- there is no write to execute -- which is the honest state on
		 * a deployment where 0123 is not applied, and is what keeps read-only
		 * structural rather than a discipline.
		 */
		onSetGuidance?:
			| ((sessionId: string, doc: TiptapNode | null) => Promise<ReviewResult<{ cleared: boolean }>>)
			| null;
		/**
		 * ATTACHING AN ALREADY-SCHEDULED CHECK-IN TO A CLASSWORK ITEM (0120,
		 * `notebook_link_session_item` / `notebook_unlink_session_item`).
		 *
		 * THIS IS WHERE IT BELONGS BECAUSE THIS IS WHERE CHECK-INS ARE SCHEDULED.
		 * 0120 gave a posting an `item_id` so the day's material and its notebook
		 * requirement are one row in the class stream, and the only path to that
		 * has been `notebook_create_item_check_in`, which MAKES a new check-in. So
		 * a check-in already on the calendar could never be attached to the item it
		 * belongs with -- the workaround is to delete it and recreate it from the
		 * item, which detaches every entry already filed against it.
		 *
		 * INSTRUCTOR TIER, and it is worth saying because two of its neighbours in
		 * the same audit are not: the RPC asks `classroom_manages_section`, the same
		 * question `onAddSections` and `onSetGuidance` already ask. Nothing here is
		 * admin-only.
		 *
		 * NULL REMOVES THE CONTROL, the way `onSetGuidance` does: a deployment
		 * without 0120 has no column to write.
		 */
		itemLink?: SessionItemTransports | null;
		/** Which check-ins in THIS section already point at an item. */
		itemLinks?: SessionItemLink[];
		/** Items posted to this section: what a check-in may be attached to. */
		itemCandidates?: LinkTargetItem[];
		/**
		 * THE GRID THIS MANAGER SITS BESIDE, read ONLY to count what is already
		 * filed against each check-in before an edit or a delete moves it.
		 *
		 * The console has this payload in hand to draw the grid, so passing it
		 * costs nothing and asks the database nothing. It is not a second source
		 * of truth about the check-ins themselves -- `sessions` stays that -- and
		 * nothing here reads a cell for any purpose but the two counts.
		 *
		 * NULL IS SUPPORTED AND MEANS `CANNOT TELL`, never `nothing is filed`. A
		 * caller with no grid to hand still gets every control; what it loses is
		 * the number in the warning, which then says so in words. That is the
		 * honest degradation and it is why this is optional rather than required.
		 */
		grid?: { sessions: { id: string }[]; cells: GridLoadCell[] } | null;
	} = $props();

	const ordered = $derived(sessionsInOrder(sessions));

	/**
	 * WHAT IS ALREADY FILED AGAINST EACH CHECK-IN, derived from the grid rather
	 * than fetched. Rebuilt when the grid is, so a warning can never quote a
	 * count from before the last refresh.
	 */
	const loadIndex = $derived(checkInLoadIndex(grid));
	/** `null` = the grid does not cover this check-in, so the count is unknown. */
	function loadOf(sessionId: string): CheckInLoad | null {
		return checkInLoad(loadIndex, sessionId);
	}

	/**
	 * The sentence naming what is filed against a check-in, or null when there is
	 * nothing to say (a covered check-in with no answers and no excusals).
	 *
	 * ONE SPELLING FOR ALL THREE PLACES it is needed -- the edit form, the delete
	 * confirm and the row itself -- because three hand-written versions of
	 * "12 students have answered" is how the delete confirm and the warning above
	 * it come to quote different numbers off the same index.
	 */
	function loadSentence(sessionId: string): string | null {
		const load = loadOf(sessionId);
		if (!load) {
			// CANNOT TELL, said out loud. Silence here would read as "nothing is
			// filed", which is the one wrong answer this whole path exists to
			// avoid.
			return 'Work already filed against this check-in is not counted on screen right now (the grid is filtered to another unit). Assume there is some.';
		}
		const parts: string[] = [];
		if (load.answered > 0) {
			parts.push(
				`${load.answered} ${load.answered === 1 ? 'student has' : 'students have'} already filed against it`
			);
		}
		if (load.excused > 0) {
			parts.push(`${load.excused} ${load.excused === 1 ? 'excusal' : 'excusals'} granted on it`);
		}
		if (parts.length === 0) return null;
		return `${parts.join(', and ')}.`;
	}

	/** The sections a check-in runs in, falling back to the one being viewed. */
	function postedTo(session: GridSession): string[] {
		return session.section_ids?.length ? session.section_ids : [sectionId];
	}

	function nameOf(id: string): string {
		const found = sections.find((s) => s.id === id);
		return found ? sectionName(found) : 'Another section';
	}

	/** null = closed, 'new' = the add form, otherwise the session being edited. */
	let editing = $state<string | null>(null);
	/**
	 * The check-in the open edit form was SEEDED FROM, kept so the pending change
	 * can be classified against it.
	 *
	 * The row in `sessions` is not a substitute: the parent refetches after every
	 * write, so reading the live list would compare the form against whatever the
	 * last save produced rather than against what this form opened on.
	 */
	let editingBefore = $state<GridSession | null>(null);
	/**
	 * `string | number` on purpose: `bind:value` on `<input type="number">`
	 * COERCES, so this holds a number once the field is edited (and null when
	 * it is cleared) even though it is seeded with a string. Treating it as a
	 * string threw `.trim is not a function` and silently wedged the Save
	 * button; everything below goes through `unitText` instead.
	 */
	let unitNumber = $state<string | number | null>('');
	let sessionDate = $state('');
	let sessionLabel = $state('');
	/**
	 * Which sections a NEW check-in runs in. Only the add form offers this: an
	 * edit sends the current set unchanged, so the upsert's reconcile can never
	 * unpost a class as a side effect of fixing a typo. Adding and removing are
	 * their own actions on the row, where the consequence can be stated.
	 */
	let newSections = $state<string[]>([]);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let notice = $state<string | null>(null);
	/** Two-step delete confirm (the gauntlet-room / SectionManager pattern). */
	let confirmDelete = $state<string | null>(null);
	/** Which session's "posted to" panel is open, if any. */
	let managing = $state<string | null>(null);
	/**
	 * Which session's GUIDANCE panel is open, if any (0123). Its own state, not
	 * a second use of `managing`: the two answer different questions and a
	 * teacher fixing a prompt should not have the class list open under it.
	 */
	let guiding = $state<string | null>(null);
	/** Two-step confirm on an unpost, since it detaches that class's entries. */
	let confirmRemove = $state<string | null>(null);
	/** Sections ticked in the open panel's "add a class" list. */
	let addSections = $state<string[]>([]);

	function toggle(list: string[], id: string): string[] {
		return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
	}

	function todayIso(): string {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	}

	function openNew() {
		editing = 'new';
		editingBefore = null;
		errorMsg = null;
		// Carry the most recent session's unit forward: a run of check-ins
		// almost always belongs to the same unit, and retyping it every time
		// is the sort of friction that gets a tool abandoned.
		unitNumber = ordered.length ? String(ordered[ordered.length - 1].unit_number) : '1';
		sessionDate = todayIso();
		sessionLabel = '';
		// The section being viewed, and only that one: adding classes is a
		// decision, never a default.
		newSections = [sectionId];
	}

	function openEdit(session: GridSession) {
		editing = session.id;
		editingBefore = session;
		errorMsg = null;
		unitNumber = String(session.unit_number);
		sessionDate = session.session_date;
		sessionLabel = session.session_label;
		newSections = postedTo(session);
	}

	function close() {
		editing = null;
		editingBefore = null;
		errorMsg = null;
	}

	/**
	 * WHAT THE OPEN EDIT WOULD CHANGE, recomputed as the fields are typed.
	 *
	 * This is the bundle's design decision in one derived value. An edit that
	 * moves only the DAY or the UNIT is a reschedule: it touches no answer and
	 * changes nothing about what was asked, so no warning about filed work is
	 * shown for it. An edit that moves the NAME is an identity change -- every
	 * student who has already filed sees the new name over their own page -- so
	 * that is the one the count is named at.
	 *
	 * ON THE ADD FORM IT IS ALWAYS `none`: a check-in that does not exist yet has
	 * nothing filed against it and nothing to warn about.
	 */
	const pendingEdit = $derived.by(() => {
		if (!editingBefore || !unitValid) return 'none' as const;
		return checkInEditKind(
			{
				unit_number: editingBefore.unit_number,
				session_date: editingBefore.session_date,
				session_label: editingBefore.session_label
			},
			{
				unit_number: Number(unitText),
				session_date: sessionDate,
				session_label: sessionLabel
			}
		);
	});

	/**
	 * The warning the open edit earns, or null.
	 *
	 * ONLY an identity change earns one, which is B2's requirement expressed as
	 * a condition rather than as a second form: a teacher moving a date never
	 * sees a sentence about answers, because moving a date does not put their
	 * answers under a different name.
	 */
	const editWarning = $derived(
		pendingEdit === 'identity' && editingBefore ? loadSentence(editingBefore.id) : null
	);

	const unitText = $derived(String(unitNumber ?? '').trim());
	const unitValid = $derived(
		/^\d+$/.test(unitText) && Number(unitText) >= 0 && Number(unitText) <= 1000
	);
	const canSave = $derived(
		unitValid && sessionDate !== '' && sessionLabel.trim() !== '' && newSections.length > 0
	);

	async function save() {
		if (busy || !canSave || editing === null) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const creating = editing === 'new';
		const result = await onSave({
			id: creating ? null : editing,
			section_ids: newSections,
			unit_number: Number(unitText),
			session_date: sessionDate,
			session_label: sessionLabel.trim()
		});
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		notice = creating
			? newSections.length > 1
				? `Check-in added to ${newSections.length} classes.`
				: 'Check-in added.'
			: 'Check-in updated everywhere it runs.';
		close();
	}

	// ---- attaching a check-in to a classwork item (0120) ---------------------

	/**
	 * Which session's ITEM panel is open. Its own state beside `managing` and
	 * `guiding` for the same reason those two are separate from each other: they
	 * answer different questions and opening one should not leave another hanging
	 * open under it.
	 */
	let linking = $state<string | null>(null);
	/** The picker's value while the panel is open. '' is "pick one". */
	let linkChoice = $state('');
	let linkBusy = $state(false);
	let linkErr = $state<string | null>(null);
	/** Two-step confirm on the DETACH, which changes where students look for it. */
	let confirmUnlink = $state<string | null>(null);

	/**
	 * The item this check-in points at IN THE SECTION BEING VIEWED.
	 *
	 * Per POSTING, never per check-in: 0120 put `item_id` on
	 * `notebook_session_postings`, so one canonical check-in can hang off a
	 * material in period 2 and stand alone in period 5. Keying the lookup on the
	 * pair is what keeps this row honest about the class it is being read in.
	 */
	function linkedItem(sessionId: string): LinkTargetItem | null {
		const row = itemLinks.find((l) => l.session_id === sessionId && l.section_id === sectionId);
		if (!row?.item_id) return null;
		const found = itemCandidates.find((c) => c.id === row.item_id);
		// A linked item that is not in `candidates` is a real state, not a bug: the
		// item was unposted from this class after the link was made. Naming it as an
		// unknown item is more honest than rendering "not linked", which is false.
		return found ?? { id: row.item_id, title: 'An item no longer posted to this class' };
	}

	function openLink(session: GridSession) {
		linking = linking === session.id ? null : session.id;
		confirmUnlink = null;
		linkErr = null;
		linkChoice = linkedItem(session.id)?.id ?? '';
	}

	async function applyLink(sessionId: string) {
		if (!itemLink || linkBusy || linkChoice === '') return;
		linkBusy = true;
		linkErr = null;
		try {
			const result = await itemLink.link(sessionId, sectionId, linkChoice);
			if (!result.ok) {
				linkErr = result.error;
				return;
			}
			notice = 'Check-in attached. It now shows on that item in this class.';
			linking = null;
		} finally {
			linkBusy = false;
		}
	}

	async function applyUnlink(sessionId: string) {
		if (!itemLink || linkBusy) return;
		if (confirmUnlink !== sessionId) {
			confirmUnlink = sessionId;
			return;
		}
		linkBusy = true;
		linkErr = null;
		try {
			const result = await itemLink.unlink(sessionId, sectionId);
			if (!result.ok) {
				linkErr = result.error;
				return;
			}
			notice = 'Check-in detached. It is its own row in the class stream again.';
			confirmUnlink = null;
			linking = null;
		} finally {
			linkBusy = false;
		}
	}

	function openManage(session: GridSession) {
		managing = managing === session.id ? null : session.id;
		confirmRemove = null;
		addSections = [];
		errorMsg = null;
	}

	function openGuidance(session: GridSession) {
		guiding = guiding === session.id ? null : session.id;
		errorMsg = null;
	}

	async function addTo(session: GridSession) {
		if (busy || addSections.length === 0) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onAddSections(session.id, addSections);
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		const n = result.value.added;
		notice = `Now also running in ${n} more ${n === 1 ? 'class' : 'classes'}.`;
		addSections = [];
	}

	async function removeFrom(session: GridSession, id: string) {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onRemoveSection(session.id, id);
		busy = false;
		confirmRemove = null;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		if (!result.value.ok) {
			errorMsg =
				result.value.reason === 'last_posting'
					? 'This is the only class it runs in. Delete the check-in instead.'
					: 'That class could not be removed.';
			return;
		}
		const n = result.value.detached_entries ?? 0;
		notice =
			n === 0
				? `Removed from ${nameOf(id)}.`
				: `Removed from ${nameOf(id)}. ${n} ${n === 1 ? 'entry was' : 'entries were'} kept and relabelled.`;
	}

	async function remove(session: GridSession) {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onDelete(session.id);
		busy = false;
		confirmDelete = null;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		const n = result.value.detached_entries;
		notice =
			n === 0
				? 'Check-in deleted.'
				: `Check-in deleted. ${n} ${n === 1 ? 'entry was' : 'entries were'} kept and relabelled.`;
	}
</script>

<section class="card sessions">
	<header class="sessions-head">
		<div>
			<h2>Check-ins</h2>
			<p class="note">
				The scheduled notebook check-ins for this section. Each one becomes a column in the grid
				below. A check-in can run in several classes at once: schedule it once and every class
				it runs in gets the same date and label.
			</p>
		</div>
		{#if editing !== 'new'}
			<button type="button" class="btn" onclick={openNew} disabled={busy}>Add check-in</button>
		{/if}
	</header>

	{#if errorMsg}
		<p class="msg error" role="alert">{errorMsg}</p>
	{/if}
	{#if notice}
		<p class="msg ok">{notice}</p>
	{/if}

	{#if editing === 'new'}
		{@render form('Add a check-in')}
	{/if}

	{#if ordered.length === 0}
		<p class="empty">
			No check-ins scheduled yet. Add one and every student in this section gets a column for it.
		</p>
	{:else}
		<ul class="session-list">
			{#each ordered as session (session.id)}
				<!-- The row carries its own id so a harness can drive ONE check-in
				     rather than the first one it finds. Every state this component has
				     is per-check-in, so a selector that cannot name one can only ever
				     verify the row that happens to sort first. -->
				<li class="session-row" data-session-id={session.id}>
					{#if editing === session.id}
						{@render form('Edit check-in')}
					{:else}
						<div class="session-main">
							<span class="unit">Unit {session.unit_number}</span>
							<span class="label">{session.session_label}</span>
							<span class="date">{shortDate(session.session_date)}</span>
							{#if postedTo(session).length > 1}
								<span class="shared">in {postedTo(session).length} classes</span>
							{/if}
							<!--
								WHAT IS ON IT, ON THE ROW, before any control is pressed. The
								warnings below fire at the moment of the act; this is what lets a
								teacher see which check-ins are safe to touch at all without
								opening each one in turn. `loadOf` null renders nothing here on
								purpose -- the row is not the place to explain a filtered grid,
								and the two confirms that DO act on it both say so in full.
							-->
							{#if (loadOf(session.id)?.answered ?? 0) > 0}
								<span class="session-load" data-testid="session-load">
									{loadOf(session.id)!.answered} filed
								</span>
							{/if}
						</div>
						<div class="session-actions">
							{#if confirmDelete === session.id}
								<!-- The sibling "remove from one class" confirm has always
							     said what happens to the work; this one, which takes
							     the check-in off EVERY class it runs in, said only
							     "Delete this check-in?" -- so the more destructive of
							     the two read as the safer. -->
							<span class="confirm-hint" data-testid="delete-confirm-hint">
								Delete it from {postedTo(session).length > 1
									? `all ${postedTo(session).length} classes`
									: 'this class'}?
								<!--
									THE COUNT COMES BEFORE THE DESTRUCTION, not after it. This
									confirm used to state the RULE ("entries are kept and
									relabelled") with no NUMBER in it, and the number only ever
									appeared in the note afterwards -- so the one moment a teacher
									could still change their mind was the one moment they could not
									see how much was on it.
								-->
								{#if loadSentence(session.id)}
									<strong data-testid="delete-load">{loadSentence(session.id)}</strong>
								{:else}
									Nothing has been filed against it yet.
								{/if}
								{#if (loadOf(session.id)?.answered ?? 0) > 0 || !loadOf(session.id)}
									Every entry is <strong>kept</strong> and relabelled with this check-in's name,
									so nobody loses written work.
								{/if}
								{#if (loadOf(session.id)?.excused ?? 0) > 0}
									<!-- THE ONE THING A DELETE REALLY DESTROYS, and nothing has ever
									     said so: notebook_session_excusals is `on delete cascade`, so
									     an excusal goes with the check-in and no restore path exists
									     for it. -->
									The
									{loadOf(session.id)!.excused === 1 ? 'excusal is' : 'excusals are'}
									<strong>deleted</strong> with it and cannot be restored.
								{/if}
							</span>
								<button
									type="button"
									class="btn danger"
									onclick={() => remove(session)}
									disabled={busy}>Yes, delete</button
								>
								<button type="button" class="btn secondary" onclick={() => (confirmDelete = null)}>
									Cancel
								</button>
							{:else}
								<button
									type="button"
									class="btn secondary"
									aria-expanded={managing === session.id}
									onclick={() => openManage(session)}>Classes</button
								>
								<!-- Only where it can be WRITTEN: no transport, no control.
								     The word is on the button, never a glyph alone. -->
								{#if onSetGuidance}
									<button
										type="button"
										class="btn secondary"
										data-testid="session-guidance-open"
										aria-expanded={guiding === session.id}
										onclick={() => openGuidance(session)}
									>
										Guidance{hasGuidance(session.guidance_doc) ? ' ✓' : ''}
									</button>
								{/if}
								<!-- Same rule as Guidance beside it: no transport, no control.
								     The check mark says the check-in is already attached, and
								     the word carries the meaning on its own. -->
								{#if itemLink}
									<button
										type="button"
										class="btn secondary"
										data-testid="session-item-open"
										aria-expanded={linking === session.id}
										onclick={() => openLink(session)}
									>
										Item{linkedItem(session.id) ? ' \u2713' : ''}
									</button>
								{/if}
								<button
								type="button"
								class="btn secondary"
								data-testid="session-edit"
								onclick={() => openEdit(session)}
							>
									Edit
								</button>
								<button
									type="button"
									class="btn secondary"
									data-testid="session-delete"
									onclick={() => (confirmDelete = session.id)}>Delete</button
								>
							{/if}
						</div>
						<!--
							THE PROMPT, EDITED WHERE THE CHECK-IN IS EDITED (0123). A
							check-in's date, label and classes are changed on this row, so a
							prompt authorable only in the classroom composer would be the
							split that produces "why can't I change this here".

							IT IS `{#key}`ED ON THE CHECK-IN, so opening a different row seeds
							Tiptap with that row's own prompt: the editor takes `value` once,
							on mount, and without the key the second row opened would show the
							first one's paragraph over its own save.

							ONE PROMPT, WHEREVER IT RUNS. The guidance is on the canonical
							check-in and not on the posting, so this is not per-class and the
							panel says so.
						-->
						{#if onSetGuidance && guiding === session.id}
							<div class="guidance-panel" data-testid="session-guidance-panel">
								{#key session.id}
									<CheckInGuidance
										value={session.guidance_doc ?? null}
										disabled={busy}
										testId="session-guidance-field"
										hint={postedTo(session).length > 1
											? `Every one of the ${postedTo(session).length} classes this runs in reads the same prompt.`
											: 'Students read this in their notebook, above the entry they are about to file.'}
										onchange={() => {}}
										onsave={async (doc) => {
											const res = await onSetGuidance(session.id, doc);
											return res.ok
												? { ok: true as const, cleared: res.value.cleared }
												: { ok: false as const, message: res.error };
										}}
									/>
								{/key}
								<p class="note">
									Leave it empty to remove the prompt. Editing it changes what every class
									this check-in runs in reads, including students who have already filed.
								</p>
							</div>
						{/if}

						<!--
							ATTACHING THIS CHECK-IN TO A CLASSWORK ITEM (0120).

							PER CLASS, unlike the guidance panel above it, and the sentence
							says so: `item_id` is a column on the POSTING, so a check-in that
							runs in three classes can hang off a material in one of them and
							stand alone in the other two. Every call names the section being
							viewed and never touches the others.

							WHAT THE PICKER OFFERS IS WHAT THE RPC WILL ACCEPT. The candidates
							are read as "items posted to this section", which is exactly the
							condition `notebook_link_session_item` refuses on, so the list can
							never contain something that would be turned down.
						-->
						{#if itemLink && linking === session.id}
							{@const current = linkedItem(session.id)}
							<div class="item-panel" data-testid="session-item-panel">
								<h4>Attached item</h4>
								{#if current}
									<p class="note" data-testid="session-item-current">
										This check-in shows on <strong>{current.title}</strong> in {nameOf(sectionId)}.
									</p>
								{:else}
									<p class="note" data-testid="session-item-none">
										This check-in stands on its own in the {nameOf(sectionId)} stream. Attaching it
										to an item puts the day's material and its notebook requirement in one row.
									</p>
								{/if}

								{#if itemCandidates.length === 0}
									<!-- A CONTROL THAT IS ABSENT FOR A REASON SAYS THE REASON. -->
									<p class="note" data-testid="session-item-empty">
										Nothing is posted to this class yet, so there is no item to attach this to.
									</p>
								{:else}
									<label class="field">
										<span>Item in {nameOf(sectionId)}</span>
										<select bind:value={linkChoice} data-testid="session-item-pick">
											<option value="">Pick an item...</option>
											{#each itemCandidates as c (c.id)}
												<option value={c.id}>{c.title}</option>
											{/each}
										</select>
									</label>
									<div class="item-actions">
										<button
											type="button"
											class="btn"
											aria-disabled={linkChoice === '' || linkChoice === current?.id || linkBusy}
											data-testid="session-item-apply"
											onclick={() => applyLink(session.id)}
										>
											{linkBusy ? 'Working...' : current ? 'Attach to this instead' : 'Attach'}
										</button>
										{#if current}
											<button
												type="button"
												class="btn secondary"
												disabled={linkBusy}
												data-testid="session-item-unlink"
												onclick={() => applyUnlink(session.id)}
											>
												{confirmUnlink === session.id ? 'Yes, detach' : 'Detach'}
											</button>
										{/if}
									</div>
									{#if confirmUnlink === session.id}
										<p class="confirm-hint" data-testid="session-item-unlink-confirm">
											It goes back to being its own row in the stream. The check-in, its dates and
											every entry filed against it are untouched.
										</p>
									{/if}
								{/if}
								{#if linkErr}
									<p class="msg error" role="alert" data-testid="session-item-error">{linkErr}</p>
								{/if}
							</div>
						{/if}

						{#if managing === session.id}
							{@const posted = postedTo(session)}
							{@const available = sections.filter((s) => !posted.includes(s.id))}
							<div class="posted-panel">
								<h4>Runs in</h4>
								<ul class="posted-list">
									{#each posted as id (id)}
										<li>
											<span class="posted-name">{nameOf(id)}</span>
											{#if !sections.some((s) => s.id === id)}
												<!-- Another teacher's class. They own the decision to
												     take it off, and the RPC refuses anyone else, so
												     there is no control to offer here. -->
												<span class="note">not yours to remove</span>
											{:else if confirmRemove === id}
												<span class="confirm-hint">
													Remove it from this class? Entries already filed against it are kept
													and relabelled.
												</span>
												<button
													type="button"
													class="btn danger"
													onclick={() => removeFrom(session, id)}
													disabled={busy}>Yes, remove</button
												>
												<button
													type="button"
													class="btn secondary"
													onclick={() => (confirmRemove = null)}>Cancel</button
												>
											{:else}
												<button
													type="button"
													class="btn secondary"
													onclick={() => (confirmRemove = id)}
													disabled={busy}>Remove</button
												>
											{/if}
										</li>
									{/each}
								</ul>

								{#if available.length === 0}
									<p class="note">It already runs in every class you teach.</p>
								{:else}
									<h4>Add a class</h4>
									<div class="section-picker">
										{#each available as s (s.id)}
											<label class="check">
												<input
													type="checkbox"
													checked={addSections.includes(s.id)}
													onchange={() => (addSections = toggle(addSections, s.id))}
												/>
												<span>{sectionName(s)}</span>
											</label>
										{/each}
									</div>
									<button
										type="button"
										class="btn"
										onclick={() => addTo(session)}
										disabled={busy || addSections.length === 0}
									>
										{busy ? 'Working...' : 'Add'}
									</button>
								{/if}
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#snippet form(title: string)}
	<div class="session-form">
		<h3>{title}</h3>
		<div class="form-grid">
			<label class="field">
				<span>Unit</span>
				<input
					type="number"
					min="0"
					max="1000"
					data-testid="session-unit"
					bind:value={unitNumber}
				/>
			</label>
			<label class="field">
				<span>Date</span>
				<input type="date" data-testid="session-date" bind:value={sessionDate} />
			</label>
			<label class="field wide">
				<span>Label</span>
				<input
					type="text"
					maxlength="200"
					placeholder="Bearing teardown"
					data-testid="session-label"
					bind:value={sessionLabel}
				/>
			</label>
		</div>
		{#if editing === 'new'}
			<fieldset class="section-field">
				<legend>Classes</legend>
				<div class="section-picker">
					{#each sections as s (s.id)}
						<label class="check">
							<input
								type="checkbox"
								checked={newSections.includes(s.id)}
								onchange={() => (newSections = toggle(newSections, s.id))}
							/>
							<span>{sectionName(s)}</span>
						</label>
					{/each}
				</div>
				<p class="note">
					One check-in, one date, in every class you tick. Editing it later changes all of them.
				</p>
			</fieldset>
		{:else}
			<p class="note">
				This edit applies in every class this check-in runs in. Use <strong>Classes</strong> on
				the row to add or remove one.
			</p>
			<!--
				THE WARNING IS CONDITIONAL ON WHAT ACTUALLY MOVED, which is the whole
				design. Moving the day or the unit shows nothing: a reschedule touches
				no answer and asks nothing new, and walking a teacher through a
				sentence about filed work every time they fix a date is how a warning
				stops being read by the time it matters.

				Changing the NAME shows the count, because every student who has
				already filed sees the new name over the page they filed.
			-->
			{#if editWarning}
				<p class="msg warn" role="status" data-testid="edit-answers-warning">
					<strong>You are renaming a check-in that has work on it.</strong>
					{editWarning} Their entries stay exactly where they are and nothing is deleted, but the
					name over them changes to the new one. Rename it only if the new name still describes
					the page they filed.
				</p>
			{:else if pendingEdit === 'schedule'}
				<!-- FIRM, NOT FLEXIBLE. A moved date moves what the grid counts as on
				     time, and saying so is the honest version of "the date changed" --
				     it is a statement about the record, never an offer of leniency. -->
				<p class="note" data-testid="edit-reschedule-note">
					Moving the day changes which entries the grid counts as on time, in every class this
					check-in runs in. Nothing already filed is deleted or detached.
				</p>
			{/if}
		{/if}
		<div class="form-actions">
			<button
				type="button"
				class="btn"
				data-testid="session-save"
				onclick={save}
				disabled={busy || !canSave}
			>
				<!-- The button NAMES THE ACT it is about to perform, so a reschedule and
				     a rename are not one word. `Save` stays the word on the add form and
				     on an edit that has not moved anything yet. -->
				{busy
					? 'Saving...'
					: pendingEdit === 'schedule'
						? 'Reschedule'
						: pendingEdit === 'identity'
							? 'Rename and save'
							: 'Save'}
			</button>
			<button type="button" class="btn secondary" onclick={close} disabled={busy}>Cancel</button>
			{#if !unitValid && unitText !== ''}
				<span class="hint">Unit must be a whole number from 0 to 1000.</span>
			{/if}
			{#if newSections.length === 0}
				<span class="hint">Tick at least one class.</span>
			{/if}
		</div>
		<p class="note">
			Deleting a check-in never deletes written work: entries filed against it are kept and
			relabelled with its name. Excusals granted on it are deleted with it.
		</p>
	</div>
{/snippet}

<style>
	.sessions {
		display: grid;
		gap: var(--space-4);
	}
	.sessions-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.sessions-head h2 {
		margin: 0;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
		margin: var(--space-1) 0 0;
	}
	.empty {
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.session-list {
		list-style: none;
		display: grid;
		gap: var(--space-2);
	}
	.session-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.session-main {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.unit {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
		white-space: nowrap;
	}
	.label {
		color: var(--text-1);
		font-weight: 500;
	}
	.date {
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}
	.shared {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--nb-accent-ink);
		white-space: nowrap;
	}
	.session-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.guidance-panel,
	.item-panel,
	.posted-panel {
		/* A row is a wrapping flex line; the panel is a block under it. */
		width: 100%;
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
	.guidance-panel {
		/* Its own gap: the editor, its counter and the note under it are three
		   blocks, not a list of rows like the posted panel's. */
		gap: var(--space-3);
	}
	.item-panel h4,
	.posted-panel h4 {
		margin: 0;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.posted-list {
		list-style: none;
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
	}
	.posted-list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.posted-name {
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.section-field {
		border: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.section-field legend {
		padding: 0;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.section-picker {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.9rem;
		color: var(--text-1);
		/* A 44px tap target on a phone without moving the label off the line. */
		min-height: 2.75rem;
	}
	.check input {
		width: 1.05rem;
		height: 1.05rem;
		accent-color: var(--nb-accent-ink);
	}
	.confirm-hint {
		font-size: 0.8rem;
		color: var(--nb-warn);
	}
	.session-form {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		width: 100%;
	}
	.session-form h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.form-grid {
		display: grid;
		grid-template-columns: 6rem 11rem 1fr;
		gap: var(--space-3);
	}
	.field {
		display: grid;
		gap: var(--space-1);
	}
	.field span {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.field input {
		width: 100%;
		padding: var(--space-2);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.95rem;
	}
	.field select {
		width: 100%;
		max-width: 100%;
		min-height: 44px;
		padding: 0 var(--space-2);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.95rem;
	}
	.field input:focus,
	.field select:focus {
		outline: none;
		border-color: var(--nb-accent);
	}
	.item-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.item-actions [aria-disabled='true'] {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.form-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.hint {
		font-size: 0.8rem;
		color: var(--nb-warn);
	}
	.msg {
		margin: 0;
		font-size: 0.88rem;
	}
	.msg.error {
		color: var(--nb-error);
	}
	.msg.ok {
		color: var(--nb-ok);
	}
	/* THE ROOM'S OWN CORRECTED INK, never the portal's `--amber`. `--nb-warn` is
	   declared per plate precisely because the raw semantic token is measured
	   against the portal's dark ground and fails on this room's paper. */
	.msg.warn {
		color: var(--nb-warn);
		/* A block a reader has to cross rather than a line they can skim past:
		   this is the one sentence in the form that is about somebody else's
		   work. The rule is on the reading edge, so it does not draw a box the
		   `--boundary` contract would have to answer for. */
		border-left: 3px solid var(--nb-warn);
		padding-left: var(--space-3);
	}
	/* The standing load line on a row: metadata about the row, in the room's
	   meta register, and never coloured as a warning -- it is a fact about the
	   check-in, not a refusal. */
	.session-load {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
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
		text-shadow: none;
	}

	@media (max-width: 640px) {
		.form-grid {
			grid-template-columns: 1fr 1fr;
		}
		.field.wide {
			grid-column: 1 / -1;
		}
	}
</style>
