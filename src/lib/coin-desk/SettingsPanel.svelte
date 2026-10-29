<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import AuditorsPanel from './AuditorsPanel.svelte';
	import DonationItemsPanel from './DonationItemsPanel.svelte';
	import FullAdminsPanel from './FullAdminsPanel.svelte';
	import SettingsSessionTwo from './SettingsSessionTwo.svelte';
	import { coins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import {
		auditLine,
		callV2,
		categoryAmountFields,
		categoryDraft,
		categoryPatch,
		fineButtonLabel,
		formatDay,
		HALL_PASS_RANGE,
		HIGHEST_GRADE_WEEKS_RANGE,
		isIsoDate,
		isMonday,
		moveItem,
		num,
		NUMBER_SETTINGS,
		PROPERTY_DAMAGE_TOKEN,
		sectionsNeverFined,
		semesterProblem,
		settingRefusal,
		settingsValues,
		V2_UNAVAILABLE,
		withNoPayWeek,
		type CategoryDraft,
		type CoinSettingKey,
		type CoinSettingsPayload,
		type CoinSettingsValues,
		type Semester,
		type SettingsCategory
	} from './v2';

	/**
	 * THE COIN SETTINGS PAGE (IDEA Coin V2, 0240). Everything here is edited
	 * live through four admin-only RPCs -- coin_settings_set (one named value),
	 * coin_settings_set_category, coin_settings_set_section_economy -- and read
	 * through coin_settings_get, which also returns the audit list (who changed
	 * what, when) shown at the bottom. Nothing is a deploy.
	 *
	 * EVERY SAVE IS ONE GROUP'S OWN. Each group keeps its own draft, and after
	 * a save only that group is re-seeded from the server's answer, so an
	 * unsaved edit in another group is never wiped by somebody else's save.
	 *
	 * A refusal is said in words, with the rule it broke (`settingRefusal`).
	 *
	 * IDEA COIN V2 SESSION TWO added the calendars, debt relief, backgrounds,
	 * donations, the role rules, the digest and the placement defaults
	 * (`SettingsSessionTwo`, the same one-key writer), who holds full coin
	 * powers (`FullAdminsPanel`), the donation want list
	 * (`DonationItemsPanel`) and the Student Auditors (`AuditorsPanel`).
	 *
	 * `userId` is the folder a want-list photo uploads into; it defaults to
	 * the signed-in caller's own id from the page, and absent removes the photo
	 * control.
	 */
	let { supabase, userId = undefined }: { supabase: SupabaseClient; userId?: string | null } = $props();

	const uploadUserId = $derived(
		userId !== undefined ? userId : ((page.data as { claims?: { sub?: string } | null }).claims?.sub ?? null)
	);

	let payload = $state<CoinSettingsPayload | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let loadMessage = $state('');

	const values = $derived<CoinSettingsValues>(settingsValues(payload?.settings));
	const categories = $derived<SettingsCategory[]>(payload?.categories ?? []);

	// --- drafts ---------------------------------------------------------------
	let catDrafts = $state<Record<string, CategoryDraft>>({});
	let autopayStart = $state('');
	let hgWeeks = $state<string | number>('');
	let hgAnchor = $state('');
	let semesters = $state<Semester[]>([]);
	let noPayAfter = $state('');
	let newNoPayWeek = $state('');
	let warnMinutes = $state<string | number>('');
	let fineMinutes = $state<string | number>('');
	let fineButtons = $state<string[]>([]);
	let addFine = $state('');
	let numbers = $state<Record<string, string | number>>({});

	type Group =
		| 'categories'
		| 'autopay'
		| 'semesters'
		| 'nopay'
		| 'hallpass'
		| 'sections'
		| 'fines'
		| 'numbers';

	function seed(group: Group | 'all', v: CoinSettingsValues, p: CoinSettingsPayload) {
		const all = group === 'all';
		if (all || group === 'categories') {
			catDrafts = Object.fromEntries(p.categories.map((c) => [c.id, categoryDraft(c)]));
		}
		if (all || group === 'autopay') {
			autopayStart = v.autopay_start;
			hgWeeks = String(v.highest_grade_weeks);
			hgAnchor = v.highest_grade_anchor;
		}
		if (all || group === 'semesters') semesters = v.semesters.map((s) => ({ ...s }));
		if (all || group === 'nopay') noPayAfter = v.no_pay_after;
		if (all || group === 'hallpass') {
			warnMinutes = String(v.hall_pass_warn_minutes);
			fineMinutes = String(v.hall_pass_fine_minutes);
		}
		if (all || group === 'fines') fineButtons = [...v.fine_buttons];
		if (all || group === 'numbers') {
			numbers = Object.fromEntries(NUMBER_SETTINGS.map((n) => [n.key, String(v[n.key])]));
		}
	}

	async function load(reseed: Group | 'all' | null) {
		const r = await callV2<CoinSettingsPayload>(supabase, 'coin_settings_get');
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			// A failed REFRESH after a save keeps the page; only a first load fails it.
			if (!payload) {
				phase = 'error';
				loadMessage = r.message;
			}
			return;
		}
		payload = r.data;
		phase = 'ready';
		if (reseed) seed(reseed, settingsValues(r.data.settings), r.data);
	}

	onMount(() => {
		void load('all');
	});

	// --- feedback, one line per group ------------------------------------------
	let feedback = $state<Record<string, { ok: boolean; text: string }>>({});
	let busy = $state<Record<string, boolean>>({});

	function say(group: string, ok: boolean, text: string) {
		feedback = { ...feedback, [group]: { ok, text } };
	}

	/**
	 * Saves named settings in order and stops at the first refusal, which is
	 * said with the rule it broke. Re-reads (and re-seeds this group) after.
	 */
	async function saveSettings(
		group: Group,
		entries: { key: CoinSettingKey; value: unknown; rule: string }[],
		done: string
	) {
		busy = { ...busy, [group]: true };
		let changed = 0;
		for (const e of entries) {
			const r = await callV2<{ ok: boolean; changed?: boolean; reason?: string }>(
				supabase,
				'coin_settings_set',
				{ p_key: e.key, p_value: e.value }
			);
			if (r.kind !== 'ok' || !r.data?.ok) {
				busy = { ...busy, [group]: false };
				say(
					group,
					false,
					r.kind === 'missing'
						? V2_UNAVAILABLE
						: r.kind === 'error'
							? r.message
							: settingRefusal(r.data?.reason, e.rule)
				);
				await load(null);
				return false;
			}
			if (r.data.changed) changed += 1;
		}
		busy = { ...busy, [group]: false };
		say(group, true, changed ? done : 'Nothing had changed.');
		await load(group);
		return true;
	}

	// --- categories --------------------------------------------------------------
	let catFilter = $state('');
	const shownCategories = $derived.by(() => {
		const t = catFilter.trim().toLowerCase();
		const list = t
			? categories.filter((c) => c.name.toLowerCase().includes(t) || c.id.includes(t))
			: categories;
		return list;
	});

	function priceLine(c: SettingsCategory): string {
		if (c.pricing_model === 'flat') return coins(num(c.amount));
		if (c.pricing_model === 'per_unit') return `${coins(num(c.amount))} per ${c.unit_label ?? 'unit'}`;
		if (c.pricing_model === 'range') return `${coins(num(c.min_amount))} to ${coins(num(c.max_amount))}`;
		if (c.pricing_model === 'formula') return 'formula';
		return 'amount entered';
	}

	async function saveCategory(c: SettingsCategory) {
		const key = `cat:${c.id}`;
		const d = catDrafts[c.id];
		if (!d) return;
		const patch = categoryPatch(c, d);
		if (patch === null) {
			say(key, true, 'Nothing had changed.');
			return;
		}
		if ('problem' in patch) {
			say(key, false, patch.problem);
			return;
		}
		busy = { ...busy, [key]: true };
		const r = await callV2<{ ok: boolean; reason?: string; category?: SettingsCategory }>(
			supabase,
			'coin_settings_set_category',
			patch.params
		);
		busy = { ...busy, [key]: false };
		if (r.kind === 'missing') return say(key, false, V2_UNAVAILABLE);
		if (r.kind === 'error') return say(key, false, r.message);
		if (!r.data?.ok) return say(key, false, settingRefusal(r.data?.reason, ''));
		say(key, true, 'Saved.');
		await load(null);
		const fresh = payload?.categories.find((x) => x.id === c.id);
		if (fresh) catDrafts = { ...catDrafts, [c.id]: categoryDraft(fresh) };
	}

	// --- autopay -----------------------------------------------------------------
	async function setPaused(paused: boolean) {
		await saveSettings(
			'autopay',
			[{ key: 'autopay_paused', value: paused, rule: 'It is on or off.' }],
			paused ? 'Autopay is paused. Nothing is paid until it is turned back on.' : 'Autopay is on.'
		);
	}

	async function saveAutopay() {
		const weeks = Number(hgWeeks);
		if (!isIsoDate(autopayStart) || !isIsoDate(hgAnchor)) {
			return say('autopay', false, 'Both dates are needed.');
		}
		if (!Number.isInteger(weeks) || weeks < HIGHEST_GRADE_WEEKS_RANGE.min || weeks > HIGHEST_GRADE_WEEKS_RANGE.max) {
			return say('autopay', false, 'The Highest Grade period is a whole number of weeks from 1 to 20.');
		}
		await saveSettings(
			'autopay',
			[
				{ key: 'autopay_start', value: autopayStart, rule: 'It must be a date.' },
				{ key: 'highest_grade_weeks', value: weeks, rule: 'A whole number of weeks from 1 to 20.' },
				{ key: 'highest_grade_anchor', value: hgAnchor, rule: 'It must be a date.' }
			],
			'Autopay dates saved.'
		);
	}

	// --- semesters -----------------------------------------------------------------
	const semesterIssue = $derived(semesterProblem(semesters));

	async function saveSemesters() {
		if (semesterIssue) return say('semesters', false, semesterIssue);
		await saveSettings(
			'semesters',
			[
				{
					key: 'semesters',
					value: semesters.map((s) => ({ key: s.key.trim(), start: s.start, end: s.end })),
					rule: 'Each semester needs a key, a start and an end on or after the start.'
				}
			],
			'Semesters saved.'
		);
	}

	// --- no-pay weeks ----------------------------------------------------------------
	async function addNoPay() {
		if (!isMonday(newNoPayWeek)) {
			return say('nopay', false, 'A no-pay week is named by its Monday. Pick a Monday.');
		}
		const ok = await saveSettings(
			'nopay',
			[
				{
					key: 'no_pay_weeks',
					value: withNoPayWeek(values.no_pay_weeks, newNoPayWeek),
					rule: 'Every entry must be a Monday.'
				}
			],
			`The week of ${formatDay(newNoPayWeek)} pays nothing now.`
		);
		if (ok) newNoPayWeek = '';
	}

	async function removeNoPay(day: string) {
		await saveSettings(
			'nopay',
			[
				{
					key: 'no_pay_weeks',
					value: values.no_pay_weeks.filter((d) => d !== day),
					rule: 'Every entry must be a Monday.'
				}
			],
			`The week of ${formatDay(day)} pays again.`
		);
	}

	async function saveNoPayAfter() {
		if (!isIsoDate(noPayAfter)) return say('nopay', false, 'Pick a date.');
		await saveSettings(
			'nopay',
			[{ key: 'no_pay_after', value: noPayAfter, rule: 'It must be a date.' }],
			`Nothing is paid after ${formatDay(noPayAfter)}.`
		);
	}

	// --- hall pass -----------------------------------------------------------------
	const draftFine = $derived(Number(fineMinutes));
	const fineForNote = $derived(
		Number.isFinite(draftFine) && draftFine >= HALL_PASS_RANGE.min ? draftFine : values.hall_pass_fine_minutes
	);
	const neverFined = $derived(sectionsNeverFined(payload?.sections ?? [], fineForNote));

	async function saveHallPass() {
		const w = Number(warnMinutes);
		const f = Number(fineMinutes);
		const inRange = (n: number) => Number.isFinite(n) && n >= HALL_PASS_RANGE.min && n <= HALL_PASS_RANGE.max;
		if (!inRange(w) || !inRange(f)) {
			return say('hallpass', false, 'Both are minutes from 1 to 240.');
		}
		if (w >= f) return say('hallpass', false, 'The warning has to come before the fine.');
		await saveSettings(
			'hallpass',
			[
				{ key: 'hall_pass_warn_minutes', value: w, rule: 'Minutes from 1 to 240.' },
				{ key: 'hall_pass_fine_minutes', value: f, rule: 'Minutes from 1 to 240.' }
			],
			'Hall pass thresholds saved.'
		);
	}

	// --- sections --------------------------------------------------------------------
	async function setEconomy(sectionId: string, on: boolean) {
		const key = `sec:${sectionId}`;
		busy = { ...busy, [key]: true };
		const r = await callV2<{ ok: boolean; reason?: string }>(
			supabase,
			'coin_settings_set_section_economy',
			{ p_section_id: sectionId, p_on: on }
		);
		busy = { ...busy, [key]: false };
		if (r.kind === 'missing') return say('sections', false, V2_UNAVAILABLE);
		if (r.kind === 'error') return say('sections', false, r.message);
		if (!r.data?.ok) return say('sections', false, settingRefusal(r.data?.reason, ''));
		say('sections', true, `Economy turned ${on ? 'on' : 'off'}.`);
		await load(null);
	}

	// --- fine buttons ----------------------------------------------------------------
	const fineChoices = $derived(
		[
			...(fineButtons.includes(PROPERTY_DAMAGE_TOKEN) ? [] : [{ id: PROPERTY_DAMAGE_TOKEN, name: 'Property Damage' }]),
			...categories
				.filter(
					(c) =>
						c.kind === 'fine' &&
						c.active &&
						!c.id.startsWith('property_damage') &&
						!fineButtons.includes(c.id)
				)
				.map((c) => ({ id: c.id, name: c.name }))
		]
	);
	const fineButtonsDirty = $derived(JSON.stringify(fineButtons) !== JSON.stringify(values.fine_buttons));

	async function saveFineButtons() {
		await saveSettings(
			'fines',
			[{ key: 'fine_buttons', value: fineButtons, rule: 'At most 30 buttons.' }],
			'Fine buttons saved.'
		);
	}

	// --- numbers ---------------------------------------------------------------------
	async function saveNumbers() {
		const entries: { key: CoinSettingKey; value: unknown; rule: string }[] = [];
		for (const n of NUMBER_SETTINGS) {
			const raw = numbers[n.key];
			const v = Number(raw);
			if (String(raw ?? '').trim() === '' || !Number.isFinite(v) || v < n.min || v > n.max) {
				return say('numbers', false, `${n.label}: from ${n.min} to ${n.max}.`);
			}
			if (v !== Number(values[n.key])) {
				entries.push({ key: n.key, value: v, rule: `${n.label}: from ${n.min} to ${n.max}.` });
			}
		}
		if (!entries.length) return say('numbers', true, 'Nothing had changed.');
		await saveSettings('numbers', entries, 'Saved.');
	}

	// --- audit -----------------------------------------------------------------------
	let auditAll = $state(false);
	const audit = $derived(payload?.audit ?? []);
	const auditShown = $derived(auditAll ? audit : audit.slice(0, 15));

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				});
	}
</script>

{#snippet feedbackLine(group: string)}
	{#if feedback[group]}
		<p class="cdx-feedback {feedback[group].ok ? 'notice' : 'error'}" data-testid="cd-set-feedback-{group}">
			{feedback[group].text}
		</p>
	{/if}
{/snippet}

{#if phase === 'loading'}
	<section class="card"><p class="cdx-note">Loading the settings…</p></section>
{:else if phase === 'missing'}
	<section class="card" data-testid="cd-settings-missing">
		<h2>Coin settings</h2>
		<p class="cdx-feedback error">{V2_UNAVAILABLE}</p>
	</section>
{:else if phase === 'error'}
	<section class="card">
		<h2>Coin settings</h2>
		<p class="cdx-feedback error">{loadMessage}</p>
	</section>
{:else if payload}
	<nav class="card jump" aria-label="Settings sections" data-testid="cd-settings">
		<a href="#cd-set-autopay">Autopay</a>
		<a href="#cd-set-nopay">No-pay weeks</a>
		<a href="#cd-set-hallpass">Hall pass</a>
		<a href="#cd-set-sections">Classes</a>
		<a href="#cd-set-fines">Fine buttons</a>
		<a href="#cd-set-numbers">Other numbers</a>
		<a href="#cd-set-calendars">Calendars</a>
		<a href="#cd-set-debt">Debt</a>
		<a href="#cd-set-backgrounds">Backgrounds</a>
		<a href="#cd-set-donations">Donations</a>
		<a href="#cd-set-roles">Roles</a>
		<a href="#cd-set-digest">Digest</a>
		<a href="#cd-set-full-admins">Full coin admins</a>
		<a href="#cd-set-donations-list">Want list</a>
		<a href="#cd-set-auditors">Student Auditors</a>
		<a href="#cd-set-categories">Categories</a>
		<a href="#cd-set-audit">Change log</a>
	</nav>

	<!-- AUTOPAY ------------------------------------------------------------------>
	<section class="card" id="cd-set-autopay">
		<h2>Autopay</h2>
		<div class="cdx-row">
			{#if values.autopay_paused}
				<StatusChip tone="warn" label="Paused" data-testid="cd-set-paused" />
				<button type="button" class="btn" disabled={busy.autopay} onclick={() => setPaused(false)}>
					Turn autopay back on
				</button>
			{:else}
				<StatusChip tone="ok" label="On" />
				<button type="button" class="btn secondary" disabled={busy.autopay} onclick={() => setPaused(true)}>
					Pause autopay
				</button>
			{/if}
		</div>
		<p class="cdx-note">
			Paused, nothing is paid automatically: wages, Highest Grade and Perfect Score all wait. Turned
			back on, each pays what it still owes.
		</p>
		<div class="cdx-row">
			<label class="cdx-field">
				<span>Start date (nothing before it is paid)</span>
				<input class="cdx-input" type="date" bind:value={autopayStart} />
			</label>
			<label class="cdx-field">
				<span>Highest Grade period (weeks)</span>
				<input
					class="cdx-input"
					type="number"
					min={HIGHEST_GRADE_WEEKS_RANGE.min}
					max={HIGHEST_GRADE_WEEKS_RANGE.max}
					step="1"
					bind:value={hgWeeks}
				/>
			</label>
			<label class="cdx-field">
				<span>Highest Grade periods start on (a Monday)</span>
				<input class="cdx-input" type="date" bind:value={hgAnchor} />
			</label>
			<button type="button" class="btn" disabled={busy.autopay} onclick={saveAutopay}>Save dates</button>
		</div>
		{#if hgAnchor && isIsoDate(hgAnchor) && !isMonday(hgAnchor)}
			<p class="cdx-note">That anchor is not a Monday; periods are counted in whole weeks from it.</p>
		{/if}
		{@render feedbackLine('autopay')}

		<h3 id="cd-set-semesters">Semesters</h3>
		<p class="cdx-note">
			Highest Grade and the extra credit cap count within a semester. The key names it (like
			2026-fall) and is stored with every purchase in it, so change a key only for a semester that
			has not started.
		</p>
		<ul class="semesters">
			{#each semesters as s, i (i)}
				<li class="cdx-row">
					<label class="cdx-field">
						<span>Key</span>
						<input class="cdx-input" type="text" maxlength="30" bind:value={s.key} />
					</label>
					<label class="cdx-field">
						<span>Starts</span>
						<input class="cdx-input" type="date" bind:value={s.start} />
					</label>
					<label class="cdx-field">
						<span>Ends</span>
						<input class="cdx-input" type="date" bind:value={s.end} />
					</label>
					<button
						type="button"
						class="btn secondary cdx-small"
						onclick={() => (semesters = semesters.filter((_, j) => j !== i))}
					>
						Remove
					</button>
				</li>
			{/each}
		</ul>
		<div class="cdx-row">
			<button
				type="button"
				class="btn secondary"
				onclick={() => (semesters = [...semesters, { key: '', start: '', end: '' }])}
			>
				Add a semester
			</button>
			<button
				type="button"
				class="btn"
				aria-disabled={!!semesterIssue || busy.semesters}
				onclick={saveSemesters}
			>
				Save semesters
			</button>
		</div>
		{#if semesterIssue}<p class="cdx-note">{semesterIssue}</p>{/if}
		{@render feedbackLine('semesters')}
	</section>

	<!-- NO-PAY WEEKS -------------------------------------------------------------->
	<section class="card" id="cd-set-nopay">
		<h2>No-pay weeks</h2>
		<p class="cdx-note">
			A week with no school pays no wage. Each week is named by its Monday. Adding or removing one
			saves at once.
		</p>
		{#if values.no_pay_weeks.length}
			<ul class="chips" data-testid="cd-set-nopay-list">
				{#each values.no_pay_weeks as day (day)}
					<li>
						<span>Week of {formatDay(day)}</span>
						<button
							type="button"
							class="btn secondary cdx-small"
							aria-label="Remove the week of {formatDay(day)}"
							disabled={busy.nopay}
							onclick={() => removeNoPay(day)}
						>
							Remove
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="cdx-note">No weeks are skipped.</p>
		{/if}
		<div class="cdx-row">
			<label class="cdx-field">
				<span>Add a week (its Monday)</span>
				<input class="cdx-input" type="date" bind:value={newNoPayWeek} />
			</label>
			<button type="button" class="btn" disabled={busy.nopay || !newNoPayWeek} onclick={addNoPay}>
				Add week
			</button>
		</div>
		{#if newNoPayWeek && !isMonday(newNoPayWeek)}
			<p class="cdx-note">That date is not a Monday.</p>
		{/if}
		<div class="cdx-row">
			<label class="cdx-field">
				<span>No pay after</span>
				<input class="cdx-input" type="date" bind:value={noPayAfter} />
			</label>
			<button type="button" class="btn" disabled={busy.nopay} onclick={saveNoPayAfter}>Save</button>
		</div>
		<p class="cdx-note">Currently: no pay after {formatDay(values.no_pay_after)}.</p>
		{@render feedbackLine('nopay')}
	</section>

	<!-- HALL PASS ------------------------------------------------------------------>
	<section class="card" id="cd-set-hallpass">
		<h2>Hall pass</h2>
		<p class="cdx-note">
			A pass open this long gets a warning, which costs nothing; this long, a Long Hall Pass fine
			when the pass ends. A pass the teacher opened or closed is never fined.
		</p>
		<div class="cdx-row">
			<label class="cdx-field">
				<span>Warning at (minutes)</span>
				<input class="cdx-input" type="number" min={HALL_PASS_RANGE.min} max={HALL_PASS_RANGE.max} step="1" bind:value={warnMinutes} />
			</label>
			<label class="cdx-field">
				<span>Fine at (minutes)</span>
				<input class="cdx-input" type="number" min={HALL_PASS_RANGE.min} max={HALL_PASS_RANGE.max} step="1" bind:value={fineMinutes} />
			</label>
			<button type="button" class="btn" disabled={busy.hallpass} onclick={saveHallPass}>Save</button>
		</div>
		{@render feedbackLine('hallpass')}
		{#if neverFined.length}
			<div class="never" data-testid="cd-set-never-fined">
				<p class="cdx-note">
					These classes can never be fined for a long pass, because their automatic check-in ends a
					pass before {fineForNote} minutes:
				</p>
				<ul>
					{#each neverFined as s (s.id)}
						<li>{s.label}: automatic check-in at {s.auto_checkin_minutes} minutes</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<!-- SECTIONS --------------------------------------------------------------------->
	<section class="card" id="cd-set-sections">
		<h2>Which classes are in the economy</h2>
		<p class="cdx-note">
			A class with the economy off pays no wage and is not on the fine screen. Each switch saves at
			once.
		</p>
		{@render feedbackLine('sections')}
		{#if !payload.sections.length}
			<p class="cdx-note">There are no active classes.</p>
		{:else}
			<ul class="sections cd-cols">
				{#each payload.sections as s (s.id)}
					<li class="section-row" data-testid="cd-set-section">
						<div class="section-who">
							<span class="section-label">{s.label}</span>
							{#if s.teacher_email}<span class="section-teacher">{s.teacher_email}</span>{/if}
						</div>
						<button
							type="button"
							class="btn secondary cdx-small"
							class:on={s.economy_on}
							role="switch"
							aria-checked={s.economy_on}
							disabled={busy[`sec:${s.id}`]}
							onclick={() => setEconomy(s.id, !s.economy_on)}
						>
							Economy {s.economy_on ? 'on' : 'off'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- FINE BUTTONS ------------------------------------------------------------------>
	<section class="card" id="cd-set-fines">
		<h2>Fine buttons</h2>
		<p class="cdx-note">
			The buttons the fine screen shows, in this order. Property Damage is one button that picks the
			right charge: a first accident, a repeat accident, or careless damage with a repair cost.
		</p>
		<ol class="fine-list" data-testid="cd-set-fine-buttons">
			{#each fineButtons as id, i (id)}
				<li>
					<span class="fine-name">{i + 1}. {fineButtonLabel(id, categories)}</span>
					<button
						type="button"
						class="btn secondary cdx-small"
						aria-label="Move {fineButtonLabel(id, categories)} up"
						disabled={i === 0}
						onclick={() => (fineButtons = moveItem(fineButtons, i, -1))}
					>
						Up
					</button>
					<button
						type="button"
						class="btn secondary cdx-small"
						aria-label="Move {fineButtonLabel(id, categories)} down"
						disabled={i === fineButtons.length - 1}
						onclick={() => (fineButtons = moveItem(fineButtons, i, 1))}
					>
						Down
					</button>
					<button
						type="button"
						class="btn secondary cdx-small"
						aria-label="Remove {fineButtonLabel(id, categories)}"
						onclick={() => (fineButtons = fineButtons.filter((x) => x !== id))}
					>
						Remove
					</button>
				</li>
			{/each}
		</ol>
		<div class="cdx-row">
			<label class="cdx-field">
				<span>Add a button</span>
				<select class="cdx-select" bind:value={addFine}>
					<option value="">Choose a fine</option>
					{#each fineChoices as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			</label>
			<button
				type="button"
				class="btn secondary"
				disabled={!addFine}
				onclick={() => {
					fineButtons = [...fineButtons, addFine];
					addFine = '';
				}}
			>
				Add
			</button>
			<button type="button" class="btn" disabled={!fineButtonsDirty || busy.fines} onclick={saveFineButtons}>
				Save buttons
			</button>
		</div>
		{#if fineButtonsDirty}<p class="cdx-note">Unsaved changes.</p>{/if}
		{@render feedbackLine('fines')}
	</section>

	<!-- NUMBERS ---------------------------------------------------------------------->
	<section class="card" id="cd-set-numbers">
		<h2>Other numbers</h2>
		<div class="numbers cd-cols">
			{#each NUMBER_SETTINGS as n (n.key)}
				<label class="cdx-field">
					<span>{n.label}</span>
					<input class="cdx-input" type="number" min={n.min} max={n.max} step={n.step} bind:value={numbers[n.key]} />
					<small class="cdx-note">{n.help}</small>
				</label>
			{/each}
		</div>
		<div class="btn-row">
			<button type="button" class="btn" disabled={busy.numbers} onclick={saveNumbers}>Save numbers</button>
		</div>
		{@render feedbackLine('numbers')}
	</section>

	<!-- SESSION TWO: calendars, debt, backgrounds, donations, roles, digest ------>
	<SettingsSessionTwo {supabase} settings={payload.settings} reload={() => load(null)} />

	<!-- WHO HOLDS FULL COIN POWERS, THE WANT LIST, THE AUDITORS ------------------>
	<FullAdminsPanel {supabase} />
	<DonationItemsPanel {supabase} userId={uploadUserId} />
	<AuditorsPanel {supabase} />

	<!-- CATEGORIES ------------------------------------------------------------------>
	<section class="card" id="cd-set-categories">
		<h2>Categories</h2>
		<p class="cdx-note">
			Every price, cap and explanation. The explanation is what students read about a category.
			Nothing is deleted: turn a category off to retire it.
		</p>
		<label class="cdx-field filter">
			<span>Find a category</span>
			<input class="cdx-input" type="search" bind:value={catFilter} placeholder="Name" />
		</label>
		<ul class="cats">
			{#each shownCategories as c (c.id)}
				{@const d = catDrafts[c.id]}
				<li class="cat cdx-disc" data-testid="cd-set-category">
					<Disclosure label={c.name} collapseWhen={true}>
						{#snippet meta()}
							<span class="cat-meta">
								<StatusChip tone="neutral" label={c.kind} />
								<span class="cat-price">{priceLine(c)}</span>
								{#if !c.active}<StatusChip tone="warn" label="Off" />{/if}
							</span>
						{/snippet}
						{#if d}
							<div class="cat-form">
								<div class="cdx-row">
									<label class="cdx-field grow">
										<span>Name</span>
										<input class="cdx-input" type="text" maxlength="120" bind:value={catDrafts[c.id].name} />
									</label>
									{#each categoryAmountFields(c.pricing_model) as f (f)}
										<label class="cdx-field">
											<span>{f === 'amount' ? (c.pricing_model === 'per_unit' ? `Coins per ${c.unit_label ?? 'unit'}` : 'Coins') : f === 'min_amount' ? 'Least (coins)' : 'Most (coins)'}</span>
											<input class="cdx-input" type="number" min="0" step="0.01" bind:value={catDrafts[c.id][f]} />
										</label>
									{/each}
								</div>
								{#if !categoryAmountFields(c.pricing_model).length}
									<p class="cdx-note">
										{c.pricing_model === 'formula'
											? 'Priced by a formula (see Other numbers).'
											: 'The amount is entered each time it is logged.'}
									</p>
								{/if}
								<div class="cdx-row">
									<label class="cdx-field">
										<span>Cap</span>
										<select class="cdx-select" bind:value={catDrafts[c.id].cap_period}>
											<option value="none">No cap</option>
											<option value="day">Per day</option>
											<option value="month">Per calendar month</option>
										</select>
									</label>
									{#if d.cap_period !== 'none'}
										<label class="cdx-field">
											<span>How many times</span>
											<input class="cdx-input" type="number" min="1" step="1" bind:value={catDrafts[c.id].cap_count} />
										</label>
									{/if}
									<label class="cdx-field check">
										<span>In use</span>
										<input type="checkbox" bind:checked={catDrafts[c.id].active} />
									</label>
								</div>
								<label class="cdx-field">
									<span>Explanation ({d.explanation.length} of 1500)</span>
									<textarea class="cdx-textarea" maxlength="1500" bind:value={catDrafts[c.id].explanation}></textarea>
								</label>
								<div class="btn-row">
									<button
										type="button"
										class="btn"
										data-testid="cd-set-category-save"
										disabled={busy[`cat:${c.id}`]}
										onclick={() => saveCategory(c)}
									>
										Save {c.name}
									</button>
								</div>
								{@render feedbackLine(`cat:${c.id}`)}
							</div>
						{/if}
					</Disclosure>
				</li>
			{/each}
			{#if !shownCategories.length}<li class="cdx-note">No category matches.</li>{/if}
		</ul>
	</section>

	<!-- AUDIT ------------------------------------------------------------------------->
	<section class="card" id="cd-set-audit">
		<h2>Change log</h2>
		<p class="cdx-note">Every change made on this page, newest first: what moved, who moved it, and when.</p>
		{#if !audit.length}
			<p class="cdx-note">Nothing has been changed yet.</p>
		{:else}
			<ol class="audit" data-testid="cd-set-audit">
				{#each auditShown as a, i (`${a.changed_at}:${a.key}:${i}`)}
					<li>
						<span class="audit-what">{auditLine(a, categories)}</span>
						<span class="audit-who">{a.changed_by}, {when(a.changed_at)}</span>
					</li>
				{/each}
			</ol>
			{#if audit.length > 15}
				<button type="button" class="btn secondary cdx-small" onclick={() => (auditAll = !auditAll)}>
					{auditAll ? 'Show the latest 15' : `Show all ${audit.length}`}
				</button>
			{/if}
		{/if}
	</section>
{/if}

<style>
	h2 {
		margin-top: 0;
	}
	h3 {
		font-size: 0.95rem;
		margin: 1.2rem 0 0.3rem;
	}
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.4rem;
		padding-top: 0.6rem;
		padding-bottom: 0.6rem;
	}
	.jump a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.5rem;
		color: var(--cyan);
	}
	.semesters,
	.chips,
	.fine-list,
	.cats,
	.audit,
	.sections {
		list-style: none;
		margin: 0.4rem 0;
		padding: 0;
	}
	.semesters li {
		margin-bottom: 0.4rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.chips li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0 0 0 0.6rem;
	}
	.never {
		border: 1px solid var(--amber);
		border-radius: 4px;
		padding: 0.3rem 0.8rem;
		margin-top: 0.5rem;
	}
	.never ul {
		margin: 0.2rem 0 0.4rem;
		padding-left: 1.2rem;
		color: var(--white);
	}
	.section-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border-bottom: 1px solid var(--line);
		padding: 0.2rem 0;
	}
	.section-who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.section-label {
		color: var(--white);
	}
	.section-teacher {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2, var(--dim));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.section-row .btn.on {
		color: var(--green);
		border-color: var(--green);
	}
	.fine-list li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--line);
		padding: 0.2rem 0;
	}
	.fine-name {
		flex: 1 1 12rem;
		color: var(--white);
	}
	.numbers {
		--cd-col: 18rem;
	}
	.filter {
		max-width: 20rem;
		margin-bottom: 0.4rem;
	}
	.cat {
		border-bottom: 1px solid var(--line);
		padding: 0.1rem 0;
	}
	.cat-meta {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.cat-price {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
	}
	.cat-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.3rem 0 0.6rem;
	}
	.grow {
		flex: 1 1 14rem;
	}
	.check input {
		width: 24px;
		height: 24px;
		margin: 10px 0;
	}
	.audit li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.2rem 1rem;
		border-bottom: 1px solid var(--line);
		padding: 0.35rem 0;
	}
	.audit-what {
		color: var(--white);
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.audit-who {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2, var(--dim));
	}
</style>
