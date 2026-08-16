<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		ratioDescription,
		capacityLabel,
		questionsAnswered,
		suggestedExpirationDate,
		dateInputToExpiresAt,
		holderStatus,
		type CoinRoleApplicationRow,
		type CoinRoleDefinition,
		type CoinRoleHolderRow,
		type RoleAnswerRecord,
		type RoleBulkLogResponse,
		type RoleCapacity,
		type RoleQuizQuestion
	} from './roles';
	import { sectionDisplayName, type CoinSectionRow } from './sections';
	import { COIN_SYMBOL } from '$lib/coin-format';

	/**
	 * Roles admin: Shop Steward / Quartermaster / Safety Officer / Lab Tech
	 * (migration 0074, real questions + expiration in 0076). Built the SAME
	 * way SectionManager.svelte was built -- its own card, plain email
	 * inputs (no separate typeahead), and the per-section expand/collapse
	 * pattern for "current holders" -- rather than a parallel roster page.
	 * Factored out of CoinDeskTool.svelte for the same reason SectionManager
	 * was: a dev harness can mount this against a fake ledger too.
	 *
	 * `sections` is read-only here (unlike SectionManager's bindable prop):
	 * this component never creates or edits a section, only reads the list
	 * SectionManager already owns, for the section picker and "current
	 * holders by section" list.
	 */
	let {
		supabase,
		roleDefinitions = [],
		sections = [],
		configured = true
	}: {
		supabase: SupabaseClient;
		roleDefinitions?: CoinRoleDefinition[];
		sections?: CoinSectionRow[];
		configured?: boolean;
	} = $props();

	const activeRoles = $derived(
		roleDefinitions.filter((r) => r.active).sort((a, b) => a.sort_order - b.sort_order)
	);

	function roleById(roleId: string): CoinRoleDefinition | undefined {
		return roleDefinitions.find((r) => r.id === roleId);
	}

	function roleName(roleId: string): string {
		return roleById(roleId)?.name ?? roleId;
	}

	function reasonMessage(r: {
		reason?: string;
		cap?: number;
		held?: number;
		balance?: number;
		cap_period?: string;
		message?: string;
	}): string {
		switch (r.reason) {
			case 'already_holds_role':
				return 'This student already holds this role.';
			case 'ratio_cap_reached':
				return `Blocked: role at capacity (${r.held}/${r.cap} filled for this section).`;
			case 'debt':
				return `Blocked: balance is negative (${r.balance}${COIN_SYMBOL}) -- purchases are locked until it clears.`;
			case 'cap_reached':
				return `Blocked: already logged the max for this ${r.cap_period === 'day' ? 'day' : 'calendar month'}.`;
			case 'error':
				return r.message ? `Error: ${r.message}` : 'An unexpected error occurred.';
			default:
				return r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
		}
	}

	// ---------------------------------------------------------------------
	// Log an application. No student self-serve apply flow exists yet (see
	// CLAUDE.md's Roles section) -- every application is admin-entered, the
	// same way every other coin-desk write is. The question set is loaded
	// live from coin_role_quiz_questions (0076) for whichever role is
	// selected -- MC renders as radio options, written as free text -- so a
	// role with no questions configured yet just shows no fields to fill.
	// ---------------------------------------------------------------------
	let newAppEmail = $state('');
	let newAppRoleId = $state('');
	let newAppQuestions = $state<RoleQuizQuestion[]>([]);
	let newAppAnswers = $state<Record<string, { written?: string; selected?: number }>>({});
	let newAppQuestionsBusy = $state(false);
	let newAppBusy = $state(false);
	let newAppError = $state('');
	let newAppNotice = $state('');

	async function onRoleChange() {
		newAppError = '';
		newAppNotice = '';
		newAppQuestions = [];
		newAppAnswers = {};
		if (!newAppRoleId) return;
		newAppQuestionsBusy = true;
		const resp = await supabase.rpc('coin_role_admin_list_role_questions', {
			p_role_id: newAppRoleId
		});
		newAppQuestionsBusy = false;
		if (resp.error) {
			newAppError = resp.error.message;
			return;
		}
		newAppQuestions = (resp.data ?? []) as RoleQuizQuestion[];
	}

	function setWritten(questionId: string, value: string) {
		newAppAnswers = { ...newAppAnswers, [questionId]: { ...newAppAnswers[questionId], written: value } };
	}
	function setSelected(questionId: string, index: number) {
		newAppAnswers = { ...newAppAnswers, [questionId]: { ...newAppAnswers[questionId], selected: index } };
	}

	const canSubmitApplication = $derived(
		!!newAppEmail.trim() &&
			!!newAppRoleId &&
			!newAppQuestionsBusy &&
			questionsAnswered(newAppQuestions, newAppAnswers)
	);

	async function submitApplication() {
		if (!canSubmitApplication) return;
		newAppBusy = true;
		newAppError = '';
		newAppNotice = '';
		const answers = newAppQuestions.map((q) => {
			const a = newAppAnswers[q.id];
			return q.type === 'written'
				? { question_id: q.id, written_answer: (a?.written ?? '').trim() }
				: { question_id: q.id, selected_option_index: a?.selected };
		});
		const resp = await supabase.rpc('coin_role_apply', {
			p_student_email: newAppEmail.trim().toLowerCase(),
			p_role_id: newAppRoleId,
			p_answers: answers
		});
		newAppBusy = false;
		if (resp.error) {
			newAppError = resp.error.message;
			return;
		}
		const r = resp.data as { ok: boolean; reason?: string };
		if (!r.ok) {
			newAppError = reasonMessage(r);
			return;
		}
		newAppNotice = 'Application logged -- it now shows in Pending applications below.';
		newAppEmail = '';
		newAppRoleId = '';
		newAppQuestions = [];
		newAppAnswers = {};
		await loadApplications();
	}

	// ---------------------------------------------------------------------
	// Pending applications: review, see the question/answer pairs (with an
	// MC correctness indicator -- informational only, never a gate),
	// approve or reject. Approve sets an expiration (pre-filled from the
	// role's suggested duration, always editable before submitting) and is
	// ratio-checked server-side (coin_role_admin_review), returning the SAME
	// {ok:false, reason:...} shape Extra Credit's cap and bulk logging's
	// per-student results already use, not a new one.
	// ---------------------------------------------------------------------
	let applications = $state<CoinRoleApplicationRow[]>([]);
	let applicationsBusy = $state(false);
	let applicationsError = $state('');
	let capacityByKey = $state<Record<string, RoleCapacity>>({});
	let reviewNotes = $state<Record<string, string>>({});
	let reviewExpiresAt = $state<Record<string, string>>({});
	let reviewBusy = $state<Record<string, boolean>>({});
	let reviewFeedback = $state<Record<string, { ok: boolean; message: string }>>({});

	function capacityKey(roleId: string, sectionId: string): string {
		return `${roleId}::${sectionId}`;
	}

	async function refreshCapacities() {
		const keys = new Set(applications.map((a) => capacityKey(a.role_id, a.section_id)));
		const entries = await Promise.all(
			Array.from(keys).map(async (key) => {
				const [roleId, sectionId] = key.split('::');
				const resp = await supabase.rpc('coin_role_admin_capacity', {
					p_role_id: roleId,
					p_section_id: sectionId
				});
				if (resp.error) return null;
				return [key, resp.data as RoleCapacity] as const;
			})
		);
		const next = { ...capacityByKey };
		for (const e of entries) if (e) next[e[0]] = e[1];
		capacityByKey = next;
	}

	async function loadApplications() {
		applicationsBusy = true;
		applicationsError = '';
		const resp = await supabase.rpc('coin_role_admin_list_applications', { p_status: 'pending' });
		applicationsBusy = false;
		if (resp.error) {
			applicationsError = resp.error.message;
			return;
		}
		applications = (resp.data ?? []) as CoinRoleApplicationRow[];
		// Pre-fill (never overwrite) an expiration date for any application
		// newly seen -- an admin already editing another row's date must
		// never have it reset out from under them by a later reload.
		const nextExpires = { ...reviewExpiresAt };
		for (const a of applications) {
			if (!(a.id in nextExpires)) {
				nextExpires[a.id] = suggestedExpirationDate(roleById(a.role_id)) ?? '';
			}
		}
		reviewExpiresAt = nextExpires;
		await refreshCapacities();
	}

	onMount(() => {
		if (configured) loadApplications();
	});

	async function reviewApplication(app: CoinRoleApplicationRow, decision: 'approve' | 'reject') {
		reviewBusy = { ...reviewBusy, [app.id]: true };
		const { [app.id]: _clearedFeedback, ...restFeedback } = reviewFeedback;
		reviewFeedback = restFeedback;

		const resp = await supabase.rpc('coin_role_admin_review', {
			p_application_id: app.id,
			p_decision: decision,
			p_note: (reviewNotes[app.id] ?? '').trim() || null,
			p_expires_at: decision === 'approve' ? dateInputToExpiresAt(reviewExpiresAt[app.id] ?? '') : null
		});
		reviewBusy = { ...reviewBusy, [app.id]: false };

		if (resp.error) {
			reviewFeedback = { ...reviewFeedback, [app.id]: { ok: false, message: resp.error.message } };
			return;
		}
		const r = resp.data as { ok: boolean; status?: string; reason?: string; cap?: number; held?: number };
		if (!r.ok) {
			// Ratio-capped or already-held -- stays pending, refusal shown inline.
			reviewFeedback = { ...reviewFeedback, [app.id]: { ok: false, message: reasonMessage(r) } };
			return;
		}

		applications = applications.filter((a) => a.id !== app.id);
		const { [app.id]: _clearedNote, ...restNotes } = reviewNotes;
		reviewNotes = restNotes;
		const { [app.id]: _clearedExpires, ...restExpires } = reviewExpiresAt;
		reviewExpiresAt = restExpires;
		await refreshCapacities();

		// An approval just changed who holds a role in app.section_id. The
		// "current holders" list below is cached per section (the
		// SectionManager roster pattern: fetch once, reuse) so it can go
		// stale here even when collapsed -- if this section's holders were
		// EVER loaded, force a refetch rather than leaving the cache behind.
		if (decision === 'approve' && holdersBySection[app.section_id]) {
			await loadHolders(app.section_id);
		}
	}

	// ---------------------------------------------------------------------
	// Current holders by section -- the SAME expand-a-section-row pattern
	// SectionManager uses for its roster, not a separate roster view. Each
	// row shows a status (active / expired / revoked, from roles.ts's
	// holderStatus -- the one place that rule is decided) and an expiration
	// that's independently editable, no revoke required.
	// ---------------------------------------------------------------------
	let expandedSectionId = $state<string | null>(null);
	let holdersBySection = $state<Record<string, CoinRoleHolderRow[]>>({});
	let holdersBusy = $state<Record<string, boolean>>({});
	let revokeConfirmId = $state<string | null>(null);
	let revokeBusy = $state<Record<string, boolean>>({});
	let revokeError = $state('');

	let editExpiresId = $state<string | null>(null);
	let editExpiresValue = $state<Record<string, string>>({});
	let editExpiresBusy = $state<Record<string, boolean>>({});
	let editExpiresError = $state('');

	async function loadHolders(sectionId: string) {
		holdersBusy = { ...holdersBusy, [sectionId]: true };
		const resp = await supabase.rpc('coin_role_admin_list_holders', {
			p_section_id: sectionId,
			p_include_revoked: true
		});
		holdersBusy = { ...holdersBusy, [sectionId]: false };
		if (!resp.error) {
			holdersBySection = { ...holdersBySection, [sectionId]: (resp.data ?? []) as CoinRoleHolderRow[] };
		}
	}

	async function toggleExpandSection(sectionId: string) {
		if (expandedSectionId === sectionId) {
			expandedSectionId = null;
			return;
		}
		expandedSectionId = sectionId;
		revokeConfirmId = null;
		revokeError = '';
		editExpiresId = null;
		editExpiresError = '';
		if (!holdersBySection[sectionId]) await loadHolders(sectionId);
	}

	function askRevoke(holderId: string) {
		revokeConfirmId = holderId;
		revokeError = '';
		editExpiresId = null;
	}

	async function confirmRevoke(sectionId: string, holderId: string) {
		revokeBusy = { ...revokeBusy, [holderId]: true };
		const resp = await supabase.rpc('coin_role_admin_revoke', { p_holder_id: holderId, p_reason: null });
		revokeBusy = { ...revokeBusy, [holderId]: false };
		revokeConfirmId = null;
		if (resp.error) {
			revokeError = resp.error.message;
			return;
		}
		await loadHolders(sectionId);
		// A freed slot changes capacity for any pending application against
		// this role/section -- keep the review list's preview honest.
		await refreshCapacities();
	}

	function startEditExpires(h: CoinRoleHolderRow) {
		editExpiresId = h.id;
		editExpiresValue = { ...editExpiresValue, [h.id]: h.expires_at ? h.expires_at.slice(0, 10) : '' };
		editExpiresError = '';
		revokeConfirmId = null;
	}

	function cancelEditExpires() {
		editExpiresId = null;
		editExpiresError = '';
	}

	async function saveEditExpires(sectionId: string, holderId: string) {
		editExpiresBusy = { ...editExpiresBusy, [holderId]: true };
		const value = editExpiresValue[holderId] ?? '';
		const resp = await supabase.rpc('coin_role_admin_set_expiration', {
			p_holder_id: holderId,
			p_expires_at: dateInputToExpiresAt(value)
		});
		editExpiresBusy = { ...editExpiresBusy, [holderId]: false };
		if (resp.error) {
			editExpiresError = resp.error.message;
			return;
		}
		editExpiresId = null;
		await loadHolders(sectionId);
		// Clearing or shortening an expiration can free (or refill) a ratio
		// slot immediately -- same reasoning as revoke above.
		await refreshCapacities();
	}

	// ---------------------------------------------------------------------
	// Bulk-log Weekly Role Stipend -- its own RPC (coin_bulk_log_role_stipend),
	// not coin_bulk_log_section, since the audience is "current role
	// holders", not "everyone in a section". See sections.ts / 0074's header.
	// (0076: only ACTIVE holders are paid -- a naturally-expired one stops
	// being included the moment their expiration passes, same as it stops
	// counting toward ratio capacity.)
	// ---------------------------------------------------------------------
	let stipendRoleId = $state('');
	let stipendSectionId = $state('');
	let stipendBusy = $state(false);
	let stipendError = $state('');
	let stipendResponse = $state<RoleBulkLogResponse | null>(null);

	async function submitStipend() {
		stipendBusy = true;
		stipendError = '';
		stipendResponse = null;
		const resp = await supabase.rpc('coin_bulk_log_role_stipend', {
			p_role_id: stipendRoleId || null,
			p_section_id: stipendSectionId || null,
			p_note: null
		});
		stipendBusy = false;
		if (resp.error) {
			stipendError = resp.error.message;
			return;
		}
		stipendResponse = resp.data as RoleBulkLogResponse;
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
	}

	function statusLabel(h: CoinRoleHolderRow): string {
		const s = holderStatus(h);
		if (s === 'active') return h.expires_at ? `active · expires ${when(h.expires_at)}` : 'active';
		if (s === 'expired') return `expired ${h.expires_at ? when(h.expires_at) : ''}`.trim();
		return `revoked ${when(h.revoked_at as string)}`;
	}

	function answerDisplay(a: RoleAnswerRecord): string {
		if (a.type === 'written') return a.written_answer ?? '';
		if (a.selected_option_index == null || !a.options) return '(no answer)';
		return a.options[a.selected_option_index] ?? '(no answer)';
	}

	function correctOptionDisplay(a: RoleAnswerRecord): string | null {
		if (a.type !== 'mc' || a.correct_option_index == null || !a.options) return null;
		return a.options[a.correct_option_index] ?? null;
	}
</script>

<section class="card roles-manager">
	<h2>Roles</h2>
	<p class="note">
		Shop Steward, Quartermaster, Safety Officer, and Lab Tech -- section-scoped ratio caps keyed
		off the real coin_sections roster (0073), not a separate headcount. Application fee is 0{COIN_SYMBOL}
		on purpose: the free-response answer is the real gate, checked here by an admin, not a
		payment. The ratio cap is enforced when an application is APPROVED, not when it's submitted.
		A role can also carry an expiration -- a holder stops counting toward capacity the moment it
		passes, with nothing that needs to run on a schedule.
	</p>

	{#if !configured}
		<p class="feedback error">
			Migration 0074/0076 does not appear to be applied yet -- roles are unavailable. Apply them
			in the Supabase SQL editor, then reload this page.
		</p>
	{:else}
		<div class="role-defs">
			{#each activeRoles as r (r.id)}
				<div class="role-def-chip">
					<span class="role-def-name">{r.name}</span>
					<span class="role-def-ratio">{ratioDescription(r)}</span>
					{#if r.ratio_is_default}
						<span class="tag default-tag" title={r.notes ?? ''}>default, not settled</span>
					{/if}
				</div>
			{/each}
		</div>

		<div class="sub-panel">
			<h3>Log an application</h3>
			{#if newAppError}<p class="feedback error">{newAppError}</p>{/if}
			{#if newAppNotice}<p class="feedback notice">{newAppNotice}</p>{/if}
			<div class="field-row">
				<label for="role-app-email">Student email</label>
				<input
					id="role-app-email"
					type="email"
					placeholder="student@boscotech.net"
					bind:value={newAppEmail}
				/>
			</div>
			<div class="field-row">
				<label for="role-app-role">Role</label>
				<select id="role-app-role" bind:value={newAppRoleId} onchange={onRoleChange}>
					<option value="" disabled selected>Choose a role&hellip;</option>
					{#each activeRoles as r (r.id)}
						<option value={r.id}>{r.name}</option>
					{/each}
				</select>
			</div>
			{#if newAppRoleId}
				{#if newAppQuestionsBusy}
					<p class="note">Loading questions&hellip;</p>
				{:else if !newAppQuestions.length}
					<p class="note">No application questions have been added for this role yet.</p>
				{:else}
					{#each newAppQuestions as q (q.id)}
						<div class="field-row">
							<span class="question-label">{q.question_text}</span>
							{#if q.type === 'written'}
								<textarea
									rows="2"
									value={newAppAnswers[q.id]?.written ?? ''}
									oninput={(e) => setWritten(q.id, (e.target as HTMLTextAreaElement).value)}
								></textarea>
							{:else}
								<div class="mc-options" role="radiogroup" aria-label={q.question_text}>
									{#each q.options ?? [] as opt, i (i)}
										<label class="mc-option">
											<input
												type="radio"
												name={`role-app-q-${q.id}`}
												checked={newAppAnswers[q.id]?.selected === i}
												onchange={() => setSelected(q.id, i)}
											/>
											<span>{opt}</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			{/if}
			<div class="btn-row">
				<button class="btn" disabled={newAppBusy || !canSubmitApplication} onclick={submitApplication}>
					{newAppBusy ? 'Logging…' : 'Log application'}
				</button>
			</div>
			<p class="note small">
				The student must already be assigned to a coin section above -- the ratio cap is checked
				against that section when this application is later approved.
			</p>
		</div>

		<div class="sub-panel">
			<h3>Pending applications</h3>
			{#if applicationsError}<p class="feedback error">{applicationsError}</p>{/if}
			{#if applicationsBusy}
				<p class="note">Loading&hellip;</p>
			{:else if !applications.length}
				<p class="note">No pending applications.</p>
			{:else}
				<div class="rows app-rows">
					{#each applications as app (app.id)}
						{@const cap = capacityByKey[capacityKey(app.role_id, app.section_id)] ?? null}
						{@const feedback = reviewFeedback[app.id]}
						<div class="row app-row">
							<div class="who">
								<span class="email">{app.display_name || app.full_name || app.student_email}</span>
								<span class="tag role-tag">{app.role_name}</span>
							</div>
							<div class="meta">
								<span class="since">
									{sectionDisplayName({ id: app.section_id, label: null })} &middot; applied
									{when(app.submitted_at)} by {app.submitted_by}
								</span>
								<span class="capacity-chip">{capacityLabel(cap)}</span>
							</div>
							<div class="answers">
								{#if !app.answers.length}
									<p class="note small">No questions were configured for this role at submission time.</p>
								{/if}
								{#each app.answers as a (a.question_id)}
									{@const correctText = correctOptionDisplay(a)}
									<div class="answer">
										<span class="answer-q">
											{a.question}
											{#if a.type === 'mc'}<span class="tag mc-tag">multiple choice</span>{/if}
										</span>
										<span class="answer-a">{answerDisplay(a)}</span>
										{#if a.type === 'mc'}
											{#if a.is_correct}
												<span class="correct-badge">&#10003; correct</span>
											{:else}
												<span class="incorrect-badge">
													&#10007; incorrect{#if correctText} -- correct answer: {correctText}{/if}
												</span>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
							{#if feedback}
								<p class="feedback error inline-feedback">{feedback.message}</p>
							{/if}
							<div class="field-row review-note-row">
								<label for={`review-note-${app.id}`}>Review note (optional)</label>
								<input
									id={`review-note-${app.id}`}
									type="text"
									maxlength="500"
									bind:value={reviewNotes[app.id]}
								/>
							</div>
							<div class="field-row review-note-row">
								<label for={`review-expires-${app.id}`}>
									Expires on approval (optional -- blank means no expiration)
								</label>
								<input
									id={`review-expires-${app.id}`}
									type="date"
									bind:value={reviewExpiresAt[app.id]}
								/>
							</div>
							<div class="actions review-actions">
								<button
									class="btn secondary"
									disabled={reviewBusy[app.id]}
									onclick={() => reviewApplication(app, 'approve')}
								>
									{reviewBusy[app.id] ? '…' : 'Approve'}
								</button>
								<button
									class="mini danger"
									disabled={reviewBusy[app.id]}
									onclick={() => reviewApplication(app, 'reject')}
								>
									Reject
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="sub-panel">
			<h3>Current holders by section</h3>
			<p class="note small">
				Expand a section to see who currently holds a role there, revoke one, or edit an
				expiration independently of revoking.
			</p>
			{#if revokeError}<p class="feedback error">{revokeError}</p>{/if}
			{#if editExpiresError}<p class="feedback error">{editExpiresError}</p>{/if}
			<div class="rows section-rows">
				{#each sections as s (s.id)}
					<div class="row section-row" class:archived={!s.active}>
						<div class="who">
							<span class="swatch" style={`background:${s.color ?? 'var(--dim)'}`}></span>
							<span class="email">{sectionDisplayName(s)}</span>
						</div>
						<div class="actions">
							<button class="mini" onclick={() => toggleExpandSection(s.id)}>
								{expandedSectionId === s.id ? 'close' : 'roles'}
							</button>
						</div>
					</div>

					{#if expandedSectionId === s.id}
						<div class="sub-panel">
							{#if holdersBusy[s.id]}
								<p class="note">Loading&hellip;</p>
							{:else if holdersBySection[s.id]?.length}
								<div class="rows roster-rows">
									{#each holdersBySection[s.id] as h (h.id)}
										{@const status = holderStatus(h)}
										<div class="row" class:inactive-row={status !== 'active'}>
											<div class="who">
												<span class="email">{h.display_name || h.full_name || h.student_email}</span>
												<span class="tag role-tag">{h.role_name}</span>
												<span class={`status-badge status-${status}`}>{status}</span>
											</div>
											<div class="meta">
												<span class="since">since {when(h.since)} &middot; by {h.assigned_by}</span>
												<span class="since">{statusLabel(h)}</span>
											</div>
											<div class="actions">
												{#if editExpiresId === h.id}
													<input
														type="date"
														class="mini-date"
														bind:value={editExpiresValue[h.id]}
													/>
													<button
														class="mini"
														disabled={editExpiresBusy[h.id]}
														onclick={() => saveEditExpires(s.id, h.id)}
													>
														{editExpiresBusy[h.id] ? '…' : 'save'}
													</button>
													<button class="mini" onclick={cancelEditExpires}>cancel</button>
												{:else if revokeConfirmId === h.id}
													<span class="confirm-text">Revoke?</span>
													<button
														class="mini danger"
														disabled={revokeBusy[h.id]}
														onclick={() => confirmRevoke(s.id, h.id)}
													>
														{revokeBusy[h.id] ? '…' : 'confirm'}
													</button>
													<button class="mini" onclick={() => (revokeConfirmId = null)}>cancel</button>
												{:else}
													<button class="mini" onclick={() => startEditExpires(h)}>expiration</button>
													{#if !h.revoked_at}
														<button class="mini danger" onclick={() => askRevoke(h.id)}>revoke</button>
													{/if}
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<p class="note">No one currently holds a role in this section.</p>
							{/if}
						</div>
					{/if}
				{/each}
				{#if !sections.length}
					<p class="note">No sections yet -- add one above.</p>
				{/if}
			</div>
		</div>

		<div class="sub-panel">
			<h3>Pay Weekly Role Stipend</h3>
			<p class="note small">
				Logs the 2{COIN_SYMBOL}/week stipend against every student who CURRENTLY holds a role (active,
				not expired), filtered by role and/or section if set -- never against a whole section's
				enrollment (see the note above "Log a transaction" &rarr; Section mode, which deliberately
				excludes this category).
			</p>
			{#if stipendError}<p class="feedback error">{stipendError}</p>{/if}
			<div class="field-row">
				<label for="stipend-role">Role (optional -- blank means every role)</label>
				<select id="stipend-role" bind:value={stipendRoleId}>
					<option value="">All roles</option>
					{#each activeRoles as r (r.id)}
						<option value={r.id}>{r.name}</option>
					{/each}
				</select>
			</div>
			<div class="field-row">
				<label for="stipend-section">Section (optional -- blank means every section)</label>
				<select id="stipend-section" bind:value={stipendSectionId}>
					<option value="">All sections</option>
					{#each sections.filter((s) => s.active) as s (s.id)}
						<option value={s.id}>{sectionDisplayName(s)}</option>
					{/each}
				</select>
			</div>
			<div class="btn-row">
				<button class="btn" disabled={stipendBusy} onclick={submitStipend}>
					{stipendBusy ? 'Logging…' : 'Log stipend'}
				</button>
			</div>
			{#if stipendResponse}
				<p class="feedback notice">
					Logged against {stipendResponse.total} holder{stipendResponse.total === 1 ? '' : 's'}:
					{stipendResponse.succeeded} succeeded, {stipendResponse.refused} refused.
				</p>
				<div class="rows bulk-rows">
					{#each stipendResponse.results as r (r.email)}
						<div class="row">
							<div class="who"><span class="email">{r.email}</span></div>
							<div class="actions">
								{#if r.ok}
									<span class="txn-pos">
										{typeof r.amount === 'number' ? `${r.amount > 0 ? '+' : ''}${r.amount}{COIN_SYMBOL}` : 'logged'}
									</span>
								{:else}
									<span class="txn-neg">{reasonMessage(r)}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.note.small {
		font-size: 0.78rem;
		margin-top: 0.3rem;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin-bottom: 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line);
	}
	.inline-feedback {
		margin: 0.4rem 0;
	}
	.role-defs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.6rem 0 1rem;
	}
	.role-def-chip {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		font-size: 0.8rem;
	}
	.role-def-name {
		color: var(--white);
		font-weight: 700;
	}
	.role-def-ratio {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--cyan);
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}
	.default-tag {
		color: var(--amber);
	}
	.role-tag {
		color: var(--cyan);
	}
	.mc-tag {
		color: var(--dim);
		margin-left: 0.4rem;
	}
	.status-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}
	.status-active {
		color: var(--green);
	}
	.status-expired {
		color: var(--amber);
	}
	.status-revoked {
		color: var(--crimson, #ff3355);
	}
	.inactive-row {
		opacity: 0.7;
	}
	.sub-panel {
		margin: 0.4rem 0 0.9rem;
		padding: 0.7rem 0.85rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.sub-panel h3 {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		color: var(--green);
	}
	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.8rem;
	}
	.field-row label,
	.question-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.field-row input,
	.field-row select,
	.field-row textarea {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.field-row textarea {
		resize: vertical;
	}
	.field-row input:focus,
	.field-row select:focus,
	.field-row textarea:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.mc-options {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.mc-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		color: var(--white);
		cursor: pointer;
	}
	.review-note-row {
		margin-top: 0.6rem;
	}
	.btn-row {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.section-rows,
	.app-rows {
		margin-top: 0.6rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.app-row {
		flex-direction: column;
		align-items: stretch;
		gap: 0.3rem;
	}
	.section-row.archived {
		opacity: 0.55;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
	}
	.swatch {
		display: inline-block;
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 3px;
		border: 1px solid var(--line-strong);
		flex-shrink: 0;
	}
	.email {
		font-weight: 700;
		color: var(--white);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
	}
	.capacity-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--cyan);
	}
	.answers {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.4rem 0.6rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 5px;
	}
	.answer {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.answer-q {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--green);
	}
	.answer-a {
		font-size: 0.88rem;
		color: var(--white);
		white-space: pre-wrap;
	}
	.correct-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--green);
	}
	.incorrect-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--amber);
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}
	.review-actions {
		margin-left: 0;
		margin-top: 0.3rem;
	}
	.confirm-text {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--amber);
	}
	.mini {
		background: none;
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.mini:hover:not(:disabled) {
		color: var(--white);
		border-color: var(--green);
	}
	.mini.danger {
		color: var(--crimson, #ff3355);
		border-color: var(--crimson, #ff3355);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.mini-date {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.4rem;
	}
	.txn-neg {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
	}
	.txn-pos {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
	}
	.bulk-rows {
		margin-top: 0.6rem;
	}
</style>
