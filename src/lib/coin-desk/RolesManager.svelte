<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import Disclosure from '$lib/Disclosure.svelte';
	import { callV2, V2_UNAVAILABLE } from './v2';
	import {
		applicationAnswers,
		applyRefusal,
		classRoleSetting,
		dateInputToExpiresAt,
		expiresAtToDateInput,
		personName,
		proofSummary,
		questionsAnswered,
		reviewRefusal,
		ROLE_DAY_STATUS_WORDS,
		roleDayDetail,
		rulesDraft,
		rulesPayload,
		rulesProblem,
		shownRoleDays,
		stipendRefusal,
		suggestedExpirationDate,
		type RoleApplication,
		type RoleDay,
		type RoleHolder,
		type RoleQuizQuestion,
		type RolesAdmin,
		type RulesDraft
	} from './roles';

	/**
	 * ROLES AS EVIDENCE JOBS (IDEA Coin V2 session two, 0247), on one read:
	 * `coin_roles_admin()`. Five things, top to bottom:
	 *
	 *   1. Applications waiting: Accept (with an optional expiration) or
	 *      Reject. A full class and a missing class are refused in words.
	 *   2. Each class's cap and switch, per role (coin_role_class_set).
	 *   3. Holders: their last two weeks of days, with the photos, and Accept,
	 *      Reject or Clear on any day (coin_role_day_set); their own rules;
	 *      their expiration; Revoke.
	 *   4. Apply on a student's behalf, with the role's real questions.
	 *   5. The stipend: it pays itself (autopay), and a payment by hand stays
	 *      as an override.
	 *
	 * Photos are read with a short signed link only when a holder's days are
	 * opened, so a page of holders signs nothing it does not show.
	 */
	let { supabase }: { supabase: SupabaseClient } = $props();

	let data = $state<RolesAdmin | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let loadMessage = $state('');

	async function load() {
		const r = await callV2<RolesAdmin>(supabase, 'coin_roles_admin');
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			if (phase !== 'ready') {
				phase = 'error';
				loadMessage = r.message;
			}
			return;
		}
		data = r.data;
		phase = 'ready';
	}

	onMount(() => {
		void load();
	});

	const roles = $derived((data?.roles ?? []).filter((r) => r.active));
	const classes = $derived(data?.classes ?? []);

	// One feedback line per thing acted on, keyed by its id.
	let said = $state<Record<string, { ok: boolean; text: string }>>({});
	let busy = $state<Record<string, boolean>>({});
	function say(key: string, ok: boolean, text: string) {
		said = { ...said, [key]: { ok, text } };
	}

	/** One write, its answer in words, then a fresh read. */
	async function write(
		key: string,
		fn: string,
		params: Record<string, unknown>,
		done: string,
		refusal: (r: Record<string, unknown>) => string = (r) =>
			r.reason ? `Refused: ${String(r.reason)}.` : 'Refused by the server.'
	): Promise<boolean> {
		busy = { ...busy, [key]: true };
		const r = await callV2<Record<string, unknown> & { ok?: boolean }>(supabase, fn, params);
		busy = { ...busy, [key]: false };
		if (r.kind === 'missing') {
			say(key, false, V2_UNAVAILABLE);
			return false;
		}
		if (r.kind === 'error') {
			say(key, false, r.message);
			return false;
		}
		if (r.data && r.data.ok === false) {
			say(key, false, refusal(r.data));
			return false;
		}
		say(key, true, done);
		await load();
		return true;
	}

	// --- 1. applications -----------------------------------------------------------
	let expiry = $state<Record<string, string>>({});
	let reviewNote = $state<Record<string, string>>({});
	let classFor = $state<Record<string, string>>({});

	function expiryFor(a: RoleApplication): string {
		if (expiry[a.id] !== undefined) return expiry[a.id];
		return suggestedExpirationDate(roles.find((r) => r.id === a.role_id)) ?? '';
	}

	function review(a: RoleApplication, decision: 'approve' | 'reject') {
		return write(
			`app:${a.id}`,
			'coin_role_admin_review',
			{
				p_application_id: a.id,
				p_decision: decision,
				p_note: reviewNote[a.id]?.trim() || null,
				p_expires_at: decision === 'approve' ? dateInputToExpiresAt(expiryFor(a)) : null
			},
			decision === 'approve' ? `${personName(a)} is now ${a.role}.` : `Rejected ${personName(a)}'s application.`,
			(r) => reviewRefusal(r as { reason?: string; cap?: number; held?: number })
		);
	}

	function setApplicationClass(a: RoleApplication) {
		const sid = classFor[a.id];
		if (!sid) return;
		return write(
			`app:${a.id}`,
			'coin_role_set_class',
			{ p_holder_id: null, p_application_id: a.id, p_section_id: sid },
			'Class set. Accept it now.'
		);
	}

	// --- 2. caps per class -----------------------------------------------------------
	let capDraft = $state<Record<string, string>>({});

	function capKey(classId: string, roleId: string): string {
		return `cap:${classId}:${roleId}`;
	}

	function saveCap(classId: string, roleId: string, enabled: boolean) {
		const key = capKey(classId, roleId);
		const cap = Number(capDraft[key]);
		if (!Number.isInteger(cap) || cap < 0 || cap > 20) {
			say(key, false, 'A cap is a whole number from 0 to 20.');
			return;
		}
		return write(
			key,
			'coin_role_class_set',
			{ p_role_id: roleId, p_section_id: classId, p_cap: cap, p_enabled: enabled },
			`Cap saved: ${cap}.`
		).then((ok) => {
			if (ok) {
				const next = { ...capDraft };
				delete next[key];
				capDraft = next;
			}
		});
	}

	function setEnabled(classId: string, roleId: string, cap: number, on: boolean) {
		return write(
			capKey(classId, roleId),
			'coin_role_class_set',
			{ p_role_id: roleId, p_section_id: classId, p_cap: cap, p_enabled: on },
			on ? 'Switched on.' : 'Switched off: nobody can apply here for it.'
		);
	}

	// --- 3. holders ---------------------------------------------------------------------
	let photoUrls = $state<Record<string, string>>({});
	const signedFor = new Set<string>();

	async function signPhotos(h: RoleHolder) {
		if (signedFor.has(h.id)) return;
		signedFor.add(h.id);
		const paths = h.days.flatMap((d) => d.photo_paths.map((p) => p.path));
		if (!paths.length) return;
		try {
			const r = await supabase.storage.from('coin-uploads').createSignedUrls(paths, 600);
			const next = { ...photoUrls };
			for (const row of r.data ?? []) {
				if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
			}
			photoUrls = next;
		} catch {
			signedFor.delete(h.id);
		}
	}

	function setDay(h: RoleHolder, d: RoleDay, verdict: 'accepted' | 'rejected' | null) {
		const words = verdict === 'accepted' ? 'accepted' : verdict === 'rejected' ? 'rejected' : 'back to the rules';
		return write(
			`day:${h.id}:${d.day}`,
			'coin_role_day_set',
			{ p_holder_id: h.id, p_day: d.day, p_verdict: verdict, p_note: null },
			`${dayLabel(d.day)} ${words}.`
		);
	}

	let rules = $state<Record<string, RulesDraft>>({});
	function rulesOf(h: RoleHolder): RulesDraft {
		return rules[h.id] ?? rulesDraft(h.rules);
	}
	function editRules(h: RoleHolder, field: keyof RulesDraft, value: string) {
		rules = { ...rules, [h.id]: { ...rulesOf(h), [field]: value } };
	}

	async function saveRules(h: RoleHolder) {
		const d = rulesOf(h);
		const problem = rulesProblem(d);
		if (problem) return say(`rules:${h.id}`, false, problem);
		const ok = await write(
			`rules:${h.id}`,
			'coin_role_holder_rules_set',
			{ p_holder_id: h.id, p_rules: rulesPayload(d) },
			`${personName(h)} now has rules of their own.`
		);
		if (ok) clearRulesDraft(h.id);
	}

	async function clearRules(h: RoleHolder) {
		const ok = await write(
			`rules:${h.id}`,
			'coin_role_holder_rules_set',
			{ p_holder_id: h.id, p_rules: {} },
			`${personName(h)} follows the everyday rules again.`
		);
		if (ok) clearRulesDraft(h.id);
	}

	function clearRulesDraft(id: string) {
		const next = { ...rules };
		delete next[id];
		rules = next;
	}

	let holderExpiry = $state<Record<string, string>>({});
	function holderExpiryOf(h: RoleHolder): string {
		return holderExpiry[h.id] ?? expiresAtToDateInput(h.expires_at);
	}

	function saveExpiry(h: RoleHolder) {
		const value = holderExpiryOf(h);
		return write(
			`exp:${h.id}`,
			'coin_role_admin_set_expiration',
			{ p_holder_id: h.id, p_expires_at: dateInputToExpiresAt(value) },
			value ? `Ends ${dayLabel(value)}.` : 'No end date.'
		);
	}

	let holderClass = $state<Record<string, string>>({});
	function setHolderClass(h: RoleHolder) {
		const sid = holderClass[h.id];
		if (!sid) return;
		return write(
			`hold:${h.id}`,
			'coin_role_set_class',
			{ p_holder_id: h.id, p_application_id: null, p_section_id: sid },
			'Class set.'
		);
	}

	let revokeArmed = $state<string | null>(null);
	let revokeReason = $state('');
	async function revoke(h: RoleHolder) {
		const ok = await write(
			`hold:${h.id}`,
			'coin_role_admin_revoke',
			{ p_holder_id: h.id, p_reason: revokeReason.trim() || null },
			`${personName(h)} no longer holds ${h.role}.`
		);
		if (ok) {
			revokeArmed = null;
			revokeReason = '';
		}
	}

	// --- 4. apply on a student's behalf --------------------------------------------------
	let applyEmail = $state('');
	let applyRole = $state('');
	let questions = $state<RoleQuizQuestion[]>([]);
	let questionsBusy = $state(false);
	let answers = $state<Record<string, { written?: string; selected?: number }>>({});
	let questionsToken = 0;

	async function loadQuestions(roleId: string) {
		questions = [];
		answers = {};
		if (!roleId) return;
		const token = ++questionsToken;
		questionsBusy = true;
		const r = await callV2<RoleQuizQuestion[]>(supabase, 'coin_role_admin_list_role_questions', { p_role_id: roleId });
		if (token !== questionsToken) return;
		questionsBusy = false;
		questions = r.kind === 'ok' ? (r.data ?? []) : [];
		if (r.kind !== 'ok') say('apply', false, r.kind === 'missing' ? V2_UNAVAILABLE : r.message);
	}

	const applyReady = $derived(
		applyEmail.trim().includes('@') && !!applyRole && !questionsBusy && questionsAnswered(questions, answers)
	);

	async function applyOnBehalf() {
		if (!applyReady) return;
		const ok = await write(
			'apply',
			'coin_role_apply',
			{
				p_student_email: applyEmail.trim().toLowerCase(),
				p_role_id: applyRole,
				p_answers: applicationAnswers(questions, answers)
			},
			'Application logged. It is waiting above.',
			(r) => applyRefusal(r.reason as string | undefined)
		);
		if (ok) {
			applyEmail = '';
			answers = {};
		}
	}

	// --- 5. the stipend by hand ------------------------------------------------------------
	let stipendRole = $state('');
	let stipendClass = $state('');
	let stipendNote = $state('');
	let stipendArmed = $state(false);
	let stipendResult = $state('');

	const stipendHolders = $derived(
		(data?.holders ?? []).filter(
			(h) => (!stipendRole || h.role_id === stipendRole) && (!stipendClass || h.section_id === stipendClass)
		).length
	);

	async function payStipend() {
		busy = { ...busy, stipend: true };
		stipendResult = '';
		const r = await callV2<{ ok: boolean; reason?: string; total?: number; succeeded?: number; refused?: number }>(
			supabase,
			'coin_role_stipend_manual',
			{ p_role_id: stipendRole || null, p_section_id: stipendClass || null, p_note: stipendNote.trim() }
		);
		busy = { ...busy, stipend: false };
		stipendArmed = false;
		if (r.kind !== 'ok') return say('stipend', false, r.kind === 'missing' ? V2_UNAVAILABLE : r.message);
		if (!r.data?.ok) return say('stipend', false, stipendRefusal(r.data?.reason));
		say('stipend', true, 'Paid.');
		stipendResult = `Paid ${r.data.succeeded ?? 0} of ${r.data.total ?? 0} holder${r.data.total === 1 ? '' : 's'}${r.data.refused ? `; ${r.data.refused} refused` : ''}.`;
		stipendNote = '';
		await load();
	}

	function dayLabel(day: string): string {
		const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
		return Number.isNaN(d.getTime())
			? day
			: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	function when(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function photoTime(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
	}
</script>

{#snippet feedback(key: string)}
	{#if said[key]}
		<p class="cdx-feedback {said[key].ok ? 'notice' : 'error'}" data-testid="cd-roles-feedback">{said[key].text}</p>
	{/if}
{/snippet}

{#if phase === 'loading'}
	<section class="card"><p class="cdx-note">Loading roles…</p></section>
{:else if phase === 'missing'}
	<section class="card" data-testid="cd-roles-missing">
		<h2>Roles</h2>
		<p class="cdx-feedback error">{V2_UNAVAILABLE}</p>
	</section>
{:else if phase === 'error'}
	<section class="card">
		<h2>Roles</h2>
		<p class="cdx-feedback error">{loadMessage}</p>
	</section>
{:else if data}
	<!-- 1. APPLICATIONS -------------------------------------------------------------->
	<section class="card" data-testid="cd-roles-applications">
		<h2>Applications waiting ({data.applications.length})</h2>
		{#if !data.applications.length}
			<p class="cdx-note">Nobody is waiting. Students apply on their coin page.</p>
		{:else}
			<ul class="apps">
				{#each data.applications as a (a.id)}
					<li class="app" data-testid="cd-role-app">
						<div class="head">
							<span class="who" title={a.email}>{personName(a)}</span>
							<span class="cdx-chip">{a.role}</span>
							<span class="cdx-chip" class:warn={!a.section_id}>{a.section ?? 'No class yet'}</span>
							<span class="meta">Applied {when(a.submitted_at)}</span>
						</div>
						{#if a.answers.length}
							<ol class="answers">
								{#each a.answers as q, i (i)}
									<li>
										<span class="q">{q.question}</span>
										{#if q.type === 'written'}
											<span class="ans">{q.written_answer}</span>
										{:else}
											<span class="ans">
												{q.options?.[q.selected_option_index ?? -1] ?? 'No answer'}
												<span class="cdx-chip" class:ok={q.is_correct === true} class:warn={q.is_correct === false}>
													{q.is_correct ? 'Right answer' : 'Not the key'}
												</span>
											</span>
										{/if}
									</li>
								{/each}
							</ol>
						{/if}
						{#if !a.section_id}
							<div class="cdx-row">
								<label class="cdx-field">
									<span>Class for this application</span>
									<select class="cdx-select" bind:value={classFor[a.id]}>
										<option value="">Choose a class</option>
										{#each classes as c (c.id)}
											<option value={c.id}>{c.label}</option>
										{/each}
									</select>
								</label>
								<button
									type="button"
									class="btn secondary"
									aria-disabled={!classFor[a.id] || busy[`app:${a.id}`]}
									onclick={() => setApplicationClass(a)}
								>
									Set class
								</button>
							</div>
						{/if}
						<div class="cdx-row">
							<label class="cdx-field">
								<span>Ends on (optional)</span>
								<input
									class="cdx-input"
									type="date"
									value={expiryFor(a)}
									oninput={(e) => (expiry = { ...expiry, [a.id]: e.currentTarget.value })}
								/>
							</label>
							<label class="cdx-field grow">
								<span>Note (optional)</span>
								<input class="cdx-input" type="text" maxlength="300" bind:value={reviewNote[a.id]} />
							</label>
							<button
								type="button"
								class="btn"
								data-testid="cd-role-accept"
								aria-disabled={busy[`app:${a.id}`]}
								onclick={() => review(a, 'approve')}
							>
								Accept
							</button>
							<button
								type="button"
								class="btn secondary"
								data-testid="cd-role-reject"
								aria-disabled={busy[`app:${a.id}`]}
								onclick={() => review(a, 'reject')}
							>
								Reject
							</button>
						</div>
						{@render feedback(`app:${a.id}`)}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 2. CAPS ---------------------------------------------------------------------->
	<section class="card" data-testid="cd-roles-caps">
		<h2>Seats per class</h2>
		<p class="cdx-note">
			How many students may hold each role in each class (1 unless you change it), and whether the role
			is open there at all. A switch saves at once; a cap saves with its button.
		</p>
		{#if !classes.length}
			<p class="cdx-note">No class has the coin economy on.</p>
		{:else}
			<div class="caps cd-cols">
				{#each classes as c (c.id)}
					<div class="cap-class" data-testid="cd-role-class">
						<h3>{c.label}</h3>
						<ul class="cap-rows">
							{#each roles as r (r.id)}
								{@const s = classRoleSetting(c, r.id)}
								{@const key = capKey(c.id, r.id)}
								<li>
									<span class="role-name">{r.name}</span>
									<span class="held">{s.held} of {s.cap} held</span>
									<label class="cap-field">
										<span class="sr-only">Seats for {r.name} in {c.label}</span>
										<input
											class="cdx-input cap-input"
											type="number"
											min="0"
											max="20"
											step="1"
											value={capDraft[key] ?? String(s.cap)}
											oninput={(e) => (capDraft = { ...capDraft, [key]: e.currentTarget.value })}
										/>
									</label>
									{#if capDraft[key] !== undefined && capDraft[key] !== String(s.cap)}
										<button
											type="button"
											class="btn cdx-small"
											aria-disabled={busy[key]}
											onclick={() => saveCap(c.id, r.id, s.enabled)}
										>
											Save cap
										</button>
									{/if}
									<button
										type="button"
										class="btn secondary cdx-small"
										role="switch"
										aria-checked={s.enabled}
										class:on={s.enabled}
										data-testid="cd-role-switch"
										aria-disabled={busy[key]}
										onclick={() => setEnabled(c.id, r.id, s.cap, !s.enabled)}
									>
										{s.enabled ? 'On' : 'Off'}
									</button>
									{@render feedback(key)}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- 3. HOLDERS ------------------------------------------------------------------->
	<section class="card" data-testid="cd-roles-holders">
		<h2>Holders ({data.holders.length})</h2>
		<p class="cdx-note">
			Each class day a holder takes a start photo and an end photo of the same spot. A day is proven on
			its own when the photos follow the rules; accept or reject any day by hand. Absence is never
			checked: a day without photos only costs that day's share of the stipend.
		</p>
		{#if !data.holders.length}
			<p class="cdx-note">Nobody holds a role right now.</p>
		{:else}
			<ul class="holders">
				{#each data.holders as h (h.id)}
					{@const days = shownRoleDays(h.days)}
					<li class="holder" data-testid="cd-role-holder">
						<div class="head">
							<span class="who" title={h.email}>{personName(h)}</span>
							<span class="cdx-chip ok">{h.role}</span>
							<span class="cdx-chip" class:warn={!h.section_id}>{h.section ?? 'No class yet'}</span>
							<span class="meta">Since {when(h.since)}{h.expires_at ? `, ends ${when(h.expires_at)}` : ''}</span>
						</div>
						<p class="meta">{proofSummary(h.days)}{h.rules.own ? '. Has rules of their own' : ''}.</p>

						<div class="cdx-disc">
							<Disclosure
								label="Last two weeks of days"
								collapseWhen={true}
								testId="cd-role-days"
								onopenchange={(open) => {
									if (open) void signPhotos(h);
								}}
							>
								{#if !days.length}
									<p class="cdx-note">No class days yet.</p>
								{:else}
									<ul class="days">
										{#each days as d (d.day)}
											{@const k = `day:${h.id}:${d.day}`}
											<li class="day" data-status={d.status} data-testid="cd-role-day">
												<div class="day-head">
													<span class="day-name">{dayLabel(d.day)}</span>
													<span
														class="cdx-chip"
														class:ok={d.status === 'passed' || d.status === 'accepted'}
														class:warn={d.status === 'failed' || d.status === 'rejected'}
													>
														{ROLE_DAY_STATUS_WORDS[d.status]}
													</span>
													<span class="meta">{roleDayDetail(d)}</span>
												</div>
												{#if d.photo_paths.length}
													<div class="photos">
														{#each d.photo_paths as p (p.path)}
															<figure class="photo">
																{#if photoUrls[p.path]}
																	<img src={photoUrls[p.path]} alt="Evidence photo, {photoTime(p.taken_at)}" loading="lazy" />
																{:else}
																	<span class="photo-wait">Photo</span>
																{/if}
																<figcaption>{photoTime(p.taken_at)}</figcaption>
															</figure>
														{/each}
													</div>
												{/if}
												<div class="cdx-row day-actions">
													<button
														type="button"
														class="btn secondary cdx-small"
														class:on={d.override === 'accepted'}
														aria-pressed={d.override === 'accepted'}
														aria-disabled={busy[k]}
														onclick={() => setDay(h, d, 'accepted')}
													>
														Accept
													</button>
													<button
														type="button"
														class="btn secondary cdx-small"
														class:on={d.override === 'rejected'}
														aria-pressed={d.override === 'rejected'}
														aria-disabled={busy[k]}
														onclick={() => setDay(h, d, 'rejected')}
													>
														Reject
													</button>
													{#if d.override}
														<button
															type="button"
															class="btn secondary cdx-small"
															aria-disabled={busy[k]}
															onclick={() => setDay(h, d, null)}
														>
															Clear, use the rules
														</button>
													{/if}
												</div>
												{@render feedback(k)}
											</li>
										{/each}
									</ul>
								{/if}
							</Disclosure>
						</div>

						<div class="cdx-disc">
							<Disclosure label="This holder's rules" collapseWhen={true} testId="cd-role-rules">
								{@const d = rulesOf(h)}
								<p class="cdx-note">
									{h.rules.own
										? 'This holder has rules of their own.'
										: 'This holder follows the everyday rules (set on Settings). Saving here gives them their own.'}
								</p>
								<div class="cdx-row">
									<label class="cdx-field">
										<span>Minutes between first and last photo</span>
										<input
											class="cdx-input"
											type="number"
											min="0"
											max="600"
											step="1"
											value={d.min_gap_minutes}
											oninput={(e) => editRules(h, 'min_gap_minutes', e.currentTarget.value)}
										/>
									</label>
									<label class="cdx-field">
										<span>Photos a day</span>
										<input
											class="cdx-input"
											type="number"
											min="2"
											max="10"
											step="1"
											value={d.photos_per_day}
											oninput={(e) => editRules(h, 'photos_per_day', e.currentTarget.value)}
										/>
									</label>
									<label class="cdx-field">
										<span>Window opens</span>
										<input
											class="cdx-input"
											type="time"
											value={d.window_start}
											oninput={(e) => editRules(h, 'window_start', e.currentTarget.value)}
										/>
									</label>
									<label class="cdx-field">
										<span>Window closes</span>
										<input
											class="cdx-input"
											type="time"
											value={d.window_end}
											oninput={(e) => editRules(h, 'window_end', e.currentTarget.value)}
										/>
									</label>
								</div>
								<div class="cdx-row">
									<button
										type="button"
										class="btn"
										aria-disabled={busy[`rules:${h.id}`]}
										onclick={() => saveRules(h)}
									>
										Save their rules
									</button>
									{#if h.rules.own}
										<button
											type="button"
											class="btn secondary"
											aria-disabled={busy[`rules:${h.id}`]}
											onclick={() => clearRules(h)}
										>
											Use the everyday rules
										</button>
									{/if}
								</div>
								{@render feedback(`rules:${h.id}`)}
							</Disclosure>
						</div>

						<div class="cdx-row">
							<label class="cdx-field">
								<span>Ends on (empty: no end)</span>
								<input
									class="cdx-input"
									type="date"
									value={holderExpiryOf(h)}
									oninput={(e) => (holderExpiry = { ...holderExpiry, [h.id]: e.currentTarget.value })}
								/>
							</label>
							<button
								type="button"
								class="btn secondary"
								aria-disabled={busy[`exp:${h.id}`]}
								onclick={() => saveExpiry(h)}
							>
								Save end date
							</button>
							{#if !h.section_id}
								<label class="cdx-field">
									<span>Class</span>
									<select class="cdx-select" bind:value={holderClass[h.id]}>
										<option value="">Choose a class</option>
										{#each classes as c (c.id)}
											<option value={c.id}>{c.label}</option>
										{/each}
									</select>
								</label>
								<button
									type="button"
									class="btn secondary"
									aria-disabled={!holderClass[h.id] || busy[`hold:${h.id}`]}
									onclick={() => setHolderClass(h)}
								>
									Set class
								</button>
							{/if}
						</div>
						{@render feedback(`exp:${h.id}`)}

						<div class="cdx-row">
							{#if revokeArmed === h.id}
								<label class="cdx-field grow">
									<span>Why (optional, kept with the record)</span>
									<input class="cdx-input" type="text" maxlength="300" bind:value={revokeReason} />
								</label>
								<button
									type="button"
									class="btn"
									data-testid="cd-role-revoke-confirm"
									aria-disabled={busy[`hold:${h.id}`]}
									onclick={() => revoke(h)}
								>
									Confirm: {personName(h)} stops being {h.role}
								</button>
								<button type="button" class="btn secondary cdx-small" onclick={() => (revokeArmed = null)}>
									Keep
								</button>
							{:else}
								<button
									type="button"
									class="btn secondary cdx-small"
									data-testid="cd-role-revoke"
									onclick={() => {
										revokeArmed = h.id;
										revokeReason = '';
									}}
								>
									Revoke
								</button>
							{/if}
						</div>
						{@render feedback(`hold:${h.id}`)}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 4. APPLY ON A STUDENT'S BEHALF ------------------------------------------------>
	<section class="card" data-testid="cd-roles-apply">
		<h2>Apply for a student</h2>
		<p class="cdx-note">
			For a student who cannot apply on their coin page. The application lands in the list above, in
			the student's class, and still needs accepting.
		</p>
		<div class="cdx-row">
			<label class="cdx-field grow">
				<span>Student email</span>
				<input class="cdx-input" type="email" placeholder="student@boscotech.net" bind:value={applyEmail} />
			</label>
			<label class="cdx-field">
				<span>Role</span>
				<select class="cdx-select" bind:value={applyRole} onchange={() => loadQuestions(applyRole)}>
					<option value="">Choose a role</option>
					{#each roles as r (r.id)}
						<option value={r.id}>{r.name}</option>
					{/each}
				</select>
			</label>
		</div>
		{#if questionsBusy}
			<p class="cdx-note">Loading the questions…</p>
		{:else if applyRole && !questions.length}
			<p class="cdx-note">This role has no questions yet, so there is nothing to answer.</p>
		{:else}
			{#each questions as q (q.id)}
				<div class="question">
					<p class="q">{q.question_text}</p>
					{#if q.type === 'written'}
						<textarea
							class="cdx-textarea"
							maxlength="4000"
							aria-label={q.question_text}
							value={answers[q.id]?.written ?? ''}
							oninput={(e) => (answers = { ...answers, [q.id]: { written: e.currentTarget.value } })}
						></textarea>
					{:else}
						{#each q.options ?? [] as opt, i (i)}
							<label class="radio">
								<input
									type="radio"
									name="q-{q.id}"
									checked={answers[q.id]?.selected === i}
									onchange={() => (answers = { ...answers, [q.id]: { selected: i } })}
								/>
								<span>{opt}</span>
							</label>
						{/each}
					{/if}
				</div>
			{/each}
		{/if}
		<div class="cdx-row">
			<button
				type="button"
				class="btn"
				aria-disabled={!applyReady || busy.apply}
				onclick={applyOnBehalf}
			>
				Log application
			</button>
			{#if !applyReady}
				<span class="cdx-note">An email, a role, and an answer to every question.</span>
			{/if}
		</div>
		{@render feedback('apply')}
	</section>

	<!-- 5. THE STIPEND ---------------------------------------------------------------->
	<section class="card" data-testid="cd-roles-stipend">
		<h2>The stipend</h2>
		<p class="cdx-note">
			The stipend pays itself. Every two weeks autopay pays each holder the Weekly Role Stipend for
			each week, cut to the share of class days they proved. Nothing here is needed for that.
		</p>
		<div class="cdx-disc">
			<Disclosure label="Pay a stipend by hand" collapseWhen={true} testId="cd-stipend-manual">
				<p class="cdx-note">
					An override: pays one Weekly Role Stipend, once, to every current holder you pick, whatever
					their days say.
				</p>
				<div class="cdx-row">
					<label class="cdx-field">
						<span>Role</span>
						<select class="cdx-select" bind:value={stipendRole} onchange={() => (stipendArmed = false)}>
							<option value="">Every role</option>
							{#each roles as r (r.id)}
								<option value={r.id}>{r.name}</option>
							{/each}
						</select>
					</label>
					<label class="cdx-field">
						<span>Class</span>
						<select class="cdx-select" bind:value={stipendClass} onchange={() => (stipendArmed = false)}>
							<option value="">Every class</option>
							{#each classes as c (c.id)}
								<option value={c.id}>{c.label}</option>
							{/each}
						</select>
					</label>
					<label class="cdx-field grow">
						<span>Why (required)</span>
						<input class="cdx-input" type="text" maxlength="300" bind:value={stipendNote} />
					</label>
				</div>
				<div class="cdx-row">
					{#if stipendArmed}
						<button
							type="button"
							class="btn"
							data-testid="cd-stipend-confirm"
							aria-disabled={busy.stipend}
							onclick={payStipend}
						>
							Confirm: pay {stipendHolders} holder{stipendHolders === 1 ? '' : 's'} once
						</button>
						<button type="button" class="btn secondary cdx-small" onclick={() => (stipendArmed = false)}>
							Keep
						</button>
					{:else}
						<button
							type="button"
							class="btn secondary"
							data-testid="cd-stipend-pay"
							aria-disabled={!stipendNote.trim() || !stipendHolders}
							onclick={() => {
								if (stipendNote.trim() && stipendHolders) stipendArmed = true;
							}}
						>
							Pay a stipend by hand
						</button>
						{#if !stipendNote.trim()}<span class="cdx-note">Say why first.</span>{/if}
						{#if !stipendHolders}<span class="cdx-note">Nobody holds a role in that choice.</span>{/if}
					{/if}
				</div>
				{@render feedback('stipend')}
				{#if stipendResult}<p class="cdx-note">{stipendResult}</p>{/if}
			</Disclosure>
		</div>
	</section>
{/if}

<style>
	h2 {
		margin-top: 0;
	}
	h3 {
		margin: 0 0 0.4rem;
		font-size: 0.95rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.grow {
		flex: 1 1 14rem;
	}
	.apps,
	.holders,
	.days,
	.cap-rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.app,
	.holder {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		margin-bottom: 0.7rem;
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.who {
		font-weight: 700;
		color: var(--white);
		overflow-wrap: anywhere;
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2, var(--dim));
		margin: 0.2rem 0;
	}
	.answers {
		margin: 0.4rem 0;
		padding-left: 1.2rem;
	}
	.answers li {
		margin-bottom: 0.3rem;
	}
	.q {
		display: block;
		color: var(--text-2, var(--dim));
		font-size: 0.85rem;
		margin: 0;
	}
	.ans {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		color: var(--white);
	}
	.cap-class {
		break-inside: avoid;
		margin-bottom: 0.8rem;
	}
	.cap-rows li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.2rem 0;
		border-bottom: 1px solid var(--line);
	}
	.role-name {
		color: var(--white);
		flex: 1 1 8rem;
		min-width: 0;
	}
	.held {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2, var(--dim));
	}
	.cap-input {
		width: 4.5rem;
	}
	.day {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
	}
	.day-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.day-name {
		color: var(--white);
		min-width: 7rem;
	}
	.day-actions {
		margin: 0.3rem 0 0;
	}
	.photos {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.photo {
		margin: 0;
		width: 7.5rem;
	}
	.photo img,
	.photo-wait {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: contain;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--text-2, var(--dim));
		font-size: 0.75rem;
	}
	.photo figcaption {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-2, var(--dim));
	}
	.question {
		margin: 0.5rem 0;
	}
	.radio {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 44px;
		color: var(--white);
		cursor: pointer;
	}
	.radio input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--green);
	}
</style>
