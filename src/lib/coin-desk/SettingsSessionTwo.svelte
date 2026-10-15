<script lang="ts">
	import { untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { callV2, formatDay, V2_UNAVAILABLE } from './v2';
	import {
		DATE_LIST_SETTINGS,
		fieldDraft,
		fieldValue,
		isIsoDay,
		placementDefaults,
		placementProblem,
		roleIdLabel,
		roleInstructions,
		roleInstructionsValue,
		SESSION_TWO_GROUPS,
		storedDays,
		withDay,
		type SettingGroup
	} from './settings-session-two';

	/**
	 * THE SETTINGS IDEA COIN V2 SESSION TWO ADDED, mounted inside the settings
	 * page: the three calendars (no-class days, paydays, quarter ends), debt
	 * relief, backgrounds, donations, the role rules and stipend period, the
	 * role instructions, the digest and the tournament placement defaults.
	 *
	 * Every save is `coin_settings_set`, one key at a time, and stops at the
	 * first refusal, which is said with the rule it broke. After a save the
	 * page re-reads (`reload`) and only the saved group is re-seeded, so an
	 * unsaved edit in another group is never wiped by somebody else's save.
	 */
	let {
		supabase,
		settings,
		reload
	}: {
		supabase: SupabaseClient;
		/** `coin_settings_get().settings`, as the page holds it now. */
		settings: Record<string, unknown>;
		reload: () => Promise<void>;
	} = $props();

	let said = $state<Record<string, { ok: boolean; text: string }>>({});
	let busy = $state<Record<string, boolean>>({});
	function say(group: string, ok: boolean, text: string) {
		said = { ...said, [group]: { ok, text } };
	}

	/** Saves keys in order; the first refusal stops the run and is said. */
	async function save(group: string, entries: { key: string; value: unknown; rule: string }[], done: string): Promise<boolean> {
		busy = { ...busy, [group]: true };
		let changed = 0;
		for (const e of entries) {
			const r = await callV2<{ ok: boolean; changed?: boolean; reason?: string }>(supabase, 'coin_settings_set', {
				p_key: e.key,
				p_value: e.value
			});
			if (r.kind !== 'ok' || !r.data?.ok) {
				busy = { ...busy, [group]: false };
				say(
					group,
					false,
					r.kind === 'missing'
						? V2_UNAVAILABLE
						: r.kind === 'error'
							? r.message
							: `That value was refused. ${e.rule}`
				);
				await reload();
				return false;
			}
			if (r.data.changed) changed += 1;
		}
		busy = { ...busy, [group]: false };
		say(group, true, changed ? done : 'Nothing had changed.');
		await reload();
		return true;
	}

	// --- the one-value groups -------------------------------------------------------
	function seedGroup(g: SettingGroup): Record<string, string> {
		return Object.fromEntries(g.fields.map((f) => [f.key, fieldDraft(f, settings[f.key])]));
	}
	let drafts = $state<Record<string, Record<string, string>>>(
		untrack(() => Object.fromEntries(SESSION_TWO_GROUPS.map((g) => [g.id, seedGroup(g)])))
	);

	async function saveGroup(g: SettingGroup) {
		const entries: { key: string; value: unknown; rule: string }[] = [];
		for (const f of g.fields) {
			const v = fieldValue(f, drafts[g.id][f.key] ?? '');
			if ('problem' in v) return say(g.id, false, v.problem);
			if (JSON.stringify(v.value) !== JSON.stringify(settings[f.key])) {
				entries.push({ key: f.key, value: v.value, rule: f.help });
			}
		}
		if (!entries.length) return say(g.id, true, 'Nothing had changed.');
		const ok = await save(g.id, entries, `${g.title} saved.`);
		if (ok) drafts = { ...drafts, [g.id]: seedGroup(g) };
	}

	// --- the date lists ---------------------------------------------------------------
	let newDay = $state<Record<string, string>>({});

	async function addDay(key: string, title: string) {
		const day = (newDay[key] ?? '').trim();
		if (!isIsoDay(day)) return say(key, false, 'Pick a date first.');
		const list = storedDays(settings[key]);
		if (list.includes(day)) return say(key, true, `${formatDay(day)} is already listed.`);
		const ok = await save(key, [{ key, value: withDay(list, day), rule: 'Every entry must be a date.' }], `${title}: ${formatDay(day)} added.`);
		if (ok) newDay = { ...newDay, [key]: '' };
	}

	function removeDay(key: string, title: string, day: string) {
		return save(
			key,
			[{ key, value: storedDays(settings[key]).filter((d) => d !== day), rule: 'Every entry must be a date.' }],
			`${title}: ${formatDay(day)} removed.`
		);
	}

	// --- role instructions --------------------------------------------------------------
	let instructions = $state<Record<string, string>>(untrack(() => roleInstructions(settings.role_instructions)));

	async function saveInstructions() {
		const v = roleInstructionsValue(instructions);
		if ('problem' in v) return say('role_instructions', false, v.problem);
		const ok = await save(
			'role_instructions',
			[{ key: 'role_instructions', value: v.value, rule: 'Each role has at most 4000 characters.' }],
			'Role instructions saved.'
		);
		if (ok) instructions = roleInstructions(settings.role_instructions);
	}

	// --- tournament placement defaults ----------------------------------------------------
	let placement = $state<string[]>(untrack(() => [...placementDefaults(settings.tournament_placement_defaults)]));
	const placementIssue = $derived(placementProblem(placement));

	async function savePlacement() {
		if (placementIssue) return say('placement', false, placementIssue);
		const ok = await save(
			'placement',
			[
				{
					key: 'tournament_placement_defaults',
					value: placement.map((x) => Number(x)),
					rule: 'Three numbers from 0 to 1000.'
				}
			],
			'Placement defaults saved.'
		);
		if (ok) placement = [...placementDefaults(settings.tournament_placement_defaults)];
	}
</script>

{#snippet feedbackLine(group: string)}
	{#if said[group]}
		<p class="cdx-feedback {said[group].ok ? 'notice' : 'error'}" data-testid="cd-set-feedback-{group}">
			{said[group].text}
		</p>
	{/if}
{/snippet}

<section class="card" id="cd-set-calendars" data-testid="cd-set-calendars">
	<h2>Calendars</h2>
	<div class="calendars cd-cols">
		{#each DATE_LIST_SETTINGS as d (d.key)}
			{@const days = storedDays(settings[d.key])}
			<div class="calendar" data-testid="cd-set-{d.key}">
				<h3>{d.title}</h3>
				<p class="cdx-note">{d.help}</p>
				{#if days.length}
					<ul class="chips">
						{#each days as day (day)}
							<li>
								<span>{formatDay(day)}</span>
								<button
									type="button"
									class="btn secondary cdx-small"
									aria-label="Remove {formatDay(day)} from {d.title}"
									aria-disabled={busy[d.key]}
									onclick={() => removeDay(d.key, d.title, day)}
								>
									Remove
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="cdx-note">{d.empty}</p>
				{/if}
				<div class="cdx-row">
					<label class="cdx-field">
						<span>Add a day</span>
						<input class="cdx-input" type="date" bind:value={newDay[d.key]} />
					</label>
					<button
						type="button"
						class="btn"
						aria-disabled={busy[d.key] || !newDay[d.key]}
						onclick={() => addDay(d.key, d.title)}
					>
						Add
					</button>
				</div>
				{@render feedbackLine(d.key)}
			</div>
		{/each}
	</div>
</section>

{#each SESSION_TWO_GROUPS as g (g.id)}
	<section class="card" id="cd-set-{g.id}" data-testid="cd-set-group-{g.id}">
		<h2>{g.title}</h2>
		<p class="cdx-note">{g.intro}</p>
		<div class="fields cd-cols">
			{#each g.fields as f (f.key)}
				<label class="cdx-field" class:wide={f.kind === 'text'}>
					<span>{f.label}</span>
					{#if f.kind === 'text'}
						<textarea class="cdx-textarea" maxlength={f.maxLength} bind:value={drafts[g.id][f.key]}></textarea>
					{:else if f.kind === 'date'}
						<input class="cdx-input" type="date" bind:value={drafts[g.id][f.key]} />
					{:else if f.kind === 'time'}
						<input class="cdx-input" type="time" bind:value={drafts[g.id][f.key]} />
					{:else}
						<input
							class="cdx-input"
							type="number"
							min={f.min}
							max={f.max}
							step={f.kind === 'int' ? 1 : 0.01}
							bind:value={drafts[g.id][f.key]}
						/>
					{/if}
					<small class="cdx-note">{f.help}</small>
				</label>
			{/each}
		</div>

		{#if g.id === 'roles'}
			<h3>What each role is told</h3>
			<p class="cdx-note">
				Shown to a holder above the camera. Left empty, the role's own description shows instead.
			</p>
			<div class="fields cd-cols">
				{#each Object.keys(instructions) as id (id)}
					<label class="cdx-field">
						<span>{roleIdLabel(id)}</span>
						<textarea class="cdx-textarea" maxlength="4000" bind:value={instructions[id]}></textarea>
					</label>
				{/each}
			</div>
			<div class="cdx-row">
				<button type="button" class="btn secondary" aria-disabled={busy.role_instructions} onclick={saveInstructions}>
					Save role instructions
				</button>
			</div>
			{@render feedbackLine('role_instructions')}
		{/if}

		{#if g.id === 'digest'}
			<h3>Tournament placement defaults</h3>
			<p class="cdx-note">
				Coins for first, second and third place when a concluded tournament's rules set none. Filled in
				on the Tournaments area, where they can still be changed before the transfer.
			</p>
			<div class="cdx-row">
				{#each ['First', 'Second', 'Third'] as word, i (word)}
					<label class="cdx-field">
						<span>{word} place (coins)</span>
						<input class="cdx-input" type="number" min="0" max="1000" step="0.01" bind:value={placement[i]} />
					</label>
				{/each}
				<button type="button" class="btn secondary" aria-disabled={busy.placement} onclick={savePlacement}>
					Save placement defaults
				</button>
			</div>
			{#if placementIssue}<p class="cdx-note">{placementIssue}</p>{/if}
			{@render feedbackLine('placement')}
		{/if}

		<div class="cdx-row">
			<button type="button" class="btn" data-testid="cd-set-save-{g.id}" aria-disabled={busy[g.id]} onclick={() => saveGroup(g)}>
				Save {g.title.toLowerCase()}
			</button>
		</div>
		{@render feedbackLine(g.id)}
	</section>
{/each}

<style>
	h2 {
		margin-top: 0;
	}
	h3 {
		font-size: 0.95rem;
		margin: 1rem 0 0.3rem;
	}
	.calendar {
		break-inside: avoid;
		margin-bottom: 0.8rem;
	}
	.calendar h3 {
		margin-top: 0;
	}
	.chips {
		list-style: none;
		margin: 0.4rem 0;
		padding: 0;
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
		color: var(--white);
	}
	.fields {
		--cd-col: 18rem;
	}
	.fields .cdx-field {
		break-inside: avoid;
		margin-bottom: 0.7rem;
	}
</style>
