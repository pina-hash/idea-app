<script lang="ts">
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState, type SaveOutcome } from '$lib/save-state.svelte';
	import {
		ACCENT_PRESETS,
		BADGES,
		NEUTRAL_ACCENT,
		TEAM_NAME_MAX,
		TEAM_TAGLINE_MAX,
		clearedTeamLook,
		teamLabel,
		teamStyleChanged,
		teamStyleDraftProblems,
		teamStyleInputOf,
		type SaveTeamStyleInput,
		type TeamStyleDraft,
		type TeamStyleResult
	} from '$lib/classroom/teams';
	import type { ClassTeam } from '$lib/classroom/class-teams';

	/**
	 * A TEAM'S NAME AND LOOK, CHOSEN BY THE STUDENTS ON IT (ledger 0360, report
	 * R17).
	 *
	 * 0223 built the write -- `classroom_set_team_style`, gated on being ON the
	 * team or teaching the class -- and no screen ever called it but the People
	 * tab's manager-only Rename. This is the student's half: a name, a motto, a
	 * colour, a background and a badge, over the SHARED identity registries
	 * (`ACCENT_PRESETS`, `BADGES`, `BadgeIcon`), so a team offers exactly the
	 * vocabulary a tournament entry and a profile offer and gains the badge
	 * set's new art with no edit here.
	 *
	 * WHY NOT THE TOURNAMENT EDITOR. `EntryStyleEditor` takes a
	 * `TournamentEntry`, imports the tournament room's stylesheet and offers an
	 * IMAGE background, which 0223 refuses (no bucket, no upload path). A
	 * control whose only outcome is a refusal is not offered, so this is a
	 * classroom editor over the same pure layer, not a second copy of it.
	 *
	 * A DRAFT AND A DELIBERATE SAVE, NEVER IMMEDIATE WRITES. The RPC replaces all
	 * seven columns at once and the whole class reads the result, so each swatch
	 * press writing a row would publish every intermediate choice to thirty
	 * people. The draft is the caller's (`bind:draft`), which is what lets the
	 * card above the editor render it live as the preview: the card a student
	 * looks at while choosing is the card the class gets.
	 *
	 * THE FLOURISH IS NOT OFFERED. No team card draws one, so the stored value
	 * is carried over unchanged by `teamStyleInputOf` instead.
	 *
	 * NO NAVIGATION GUARD, ON PURPOSE. This lives in the section layout, which
	 * survives every navigation inside the class, and the item page already runs
	 * the save guard: a second guard on one page races the first. A draft is
	 * lost only by leaving the class, and the Save here is one press away.
	 */
	let {
		team,
		draft = $bindable(),
		who = 'member',
		onsave,
		onsaved,
		oncancel,
		id
	}: {
		/** The team as it is STORED: the baseline, never the draft. */
		team: ClassTeam;
		/** The look being chosen. The caller holds it so its card can preview it. */
		draft: TeamStyleDraft;
		/** A student on the team, or a teacher of the class: only the sentence differs. */
		who?: 'member' | 'teacher';
		/** The write. Its refusal sentence is shown verbatim and the draft is kept. */
		onsave: (input: SaveTeamStyleInput) => Promise<TeamStyleResult>;
		/** Told once the database acknowledged the save, with exactly what was sent. */
		onsaved: (input: SaveTeamStyleInput) => void;
		oncancel: () => void;
		/** The region's id, for the trigger's `aria-controls`. */
		id: string;
	} = $props();

	const FALLBACK = 'That did not save. Try again in a moment.';

	/*
	 * ONE PREDICATE FOR "is there anything to save", read by the control AND by
	 * the handler (CLAUDE.md: two spellings of "is this ready" is a click that
	 * does nothing).
	 */
	const problems = $derived(teamStyleDraftProblems(draft));
	const changed = $derived(teamStyleChanged(team, draft));
	const canSave = $derived(changed && problems.length === 0);
	let why = $state<string | null>(null);

	/*
	 * THE ONE SAVE STATE (CLAUDE.md), with no autosave: a write here is
	 * something a whole class reads. The save function reads the draft FRESH on
	 * every attempt, so a retry sends what is on screen now.
	 */
	const save = new SaveState({
		autosave: false,
		fallbackMessage: FALLBACK,
		save: async (): Promise<SaveOutcome> => {
			const input = teamStyleInputOf(team.id, draft, team);
			const res = await onsave(input);
			if (res.ok) {
				onsaved(input);
				return { ok: true };
			}
			const message = res.message || FALLBACK;
			return res.retryable ? { ok: false, retryable: true, message } : { ok: false, retryable: false, message };
		}
	});
	$effect(() => save.attach());
	const writing = $derived(save.phase === 'writing');

	async function submit() {
		if (writing) return;
		if (!canSave) {
			why = problems[0] ?? 'Nothing has changed yet: this is the look your class already sees.';
			return;
		}
		why = null;
		save.markDirty();
		await save.saveNow();
	}

	const accentIsPreset = $derived(
		draft.accent !== null && ACCENT_PRESETS.some((p) => p.hex.toLowerCase() === draft.accent)
	);
	const customAccent = $derived(draft.accent !== null && !accentIsPreset);

	/** A colour for an inline style, only ever a checked `#rrggbb`. */
	const safe = (hex: string | null | undefined, fallback: string) =>
		typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;

	const sentence = $derived(
		who === 'teacher'
			? "Everyone in this class sees this team's name and look. Students on the team can change it too; the last save wins."
			: "Everyone in this class sees your team's name and look. Anyone on the team can change it; the last save wins."
	);
</script>

<form
	class="tse"
	{id}
	data-testid="team-style-editor"
	aria-label="Customize {teamLabel(team)}"
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
>
	<p class="tse-note">{sentence}</p>

	<div class="tse-fields">
		<label class="tse-field">
			<span class="tse-label">Team name</span>
			<input
				type="text"
				maxlength={TEAM_NAME_MAX}
				placeholder="Team {team.team_number}"
				autocomplete="off"
				bind:value={draft.name}
				data-testid="team-style-name"
			/>
		</label>
		<label class="tse-field">
			<span class="tse-label">Motto</span>
			<input
				type="text"
				maxlength={TEAM_TAGLINE_MAX}
				placeholder="A few words, if you like"
				autocomplete="off"
				bind:value={draft.tagline}
				data-testid="team-style-motto"
			/>
		</label>
	</div>

	<fieldset class="tse-group" data-testid="team-style-colour">
		<legend class="tse-label">Colour</legend>
		<div class="tse-row">
			<button
				type="button"
				class="btn secondary tiny tse-opt"
				aria-pressed={draft.accent === null}
				onclick={() => (draft.accent = null)}>None</button
			>
			{#each ACCENT_PRESETS as p (p.id)}
				<button
					type="button"
					class="btn secondary tiny tse-opt"
					aria-pressed={draft.accent === p.hex.toLowerCase()}
					onclick={() => (draft.accent = p.hex.toLowerCase())}
				>
					<span class="tse-dot" style="background:{p.hex}" aria-hidden="true"></span>{p.label}
				</button>
			{/each}
			<label class="btn secondary tiny tse-opt tse-well" class:on={customAccent}>
				<span>Custom</span>
				<input
					type="color"
					value={safe(draft.accent, NEUTRAL_ACCENT)}
					oninput={(e) => (draft.accent = (e.currentTarget as HTMLInputElement).value.toLowerCase())}
					data-testid="team-style-accent-custom"
				/>
			</label>
		</div>
	</fieldset>

	<fieldset class="tse-group" data-testid="team-style-background">
		<legend class="tse-label">Background</legend>
		<div class="tse-row">
			<button
				type="button"
				class="btn secondary tiny tse-opt"
				aria-pressed={draft.bg === 'none'}
				onclick={() => (draft.bg = 'none')}>None</button
			>
			<button
				type="button"
				class="btn secondary tiny tse-opt"
				aria-pressed={draft.bg === 'solid'}
				data-testid="team-style-bg-solid"
				onclick={() => (draft.bg = 'solid')}
			>
				<span class="tse-dot" style="background:{safe(draft.solid, '#3e7bfa')}" aria-hidden="true"></span>Solid
			</button>
			<button
				type="button"
				class="btn secondary tiny tse-opt"
				aria-pressed={draft.bg === 'gradient'}
				data-testid="team-style-bg-gradient"
				onclick={() => (draft.bg = 'gradient')}
			>
				<span
					class="tse-dot"
					style="background:linear-gradient(135deg,{safe(draft.gradA, '#1d5a4f')},{safe(draft.gradB, '#3e7bfa')})"
					aria-hidden="true"
				></span>Gradient
			</button>
		</div>
		<!-- THE WELLS APPEAR ONLY FOR THE MODE THAT USES THEM (ProfileMenu's
		     rule): a colour well that changes nothing is a control whose only
		     outcome is nothing. Each is its own label, which is what a finger hits. -->
		{#if draft.bg === 'solid'}
			<div class="tse-row">
				<label class="btn secondary tiny tse-opt tse-well">
					<span>Colour</span>
					<input
						type="color"
						value={safe(draft.solid, '#3e7bfa')}
						oninput={(e) => (draft.solid = (e.currentTarget as HTMLInputElement).value.toLowerCase())}
						data-testid="team-style-solid"
					/>
				</label>
			</div>
		{:else if draft.bg === 'gradient'}
			<div class="tse-row">
				<label class="btn secondary tiny tse-opt tse-well">
					<span>From</span>
					<input
						type="color"
						value={safe(draft.gradA, '#1d5a4f')}
						oninput={(e) => (draft.gradA = (e.currentTarget as HTMLInputElement).value.toLowerCase())}
						data-testid="team-style-grad-a"
					/>
				</label>
				<label class="btn secondary tiny tse-opt tse-well">
					<span>To</span>
					<input
						type="color"
						value={safe(draft.gradB, '#3e7bfa')}
						oninput={(e) => (draft.gradB = (e.currentTarget as HTMLInputElement).value.toLowerCase())}
						data-testid="team-style-grad-b"
					/>
				</label>
			</div>
		{/if}
	</fieldset>

	<fieldset class="tse-group" data-testid="team-style-badge">
		<legend class="tse-label">Badge</legend>
		<div class="tse-row">
			<button
				type="button"
				class="btn secondary tiny tse-opt"
				aria-pressed={draft.badge === null}
				onclick={() => (draft.badge = null)}>None</button
			>
			{#each BADGES as b (b.id)}
				<button
					type="button"
					class="btn secondary tiny tse-opt"
					aria-pressed={draft.badge === b.id}
					data-badge={b.id}
					onclick={() => (draft.badge = b.id)}
				>
					<span class="tse-glyph"><BadgeIcon id={b.id} size="1.1em" /></span>{b.label}
				</button>
			{/each}
		</div>
	</fieldset>

	{#if problems.length}
		<ul class="tse-problems" data-testid="team-style-problems">
			{#each problems as p (p)}<li>{p}</li>{/each}
		</ul>
	{/if}

	<div class="tse-foot">
	<div class="tse-actions">
		<button
			type="submit"
			class="btn tiny"
			aria-disabled={!canSave || writing}
			data-testid="team-style-save">Save</button
		>
		<button type="button" class="btn secondary tiny" data-testid="team-style-cancel" onclick={() => oncancel()}
			>Cancel</button
		>
		<button
			type="button"
			class="btn secondary tiny"
			data-testid="team-style-clear"
			onclick={() => {
				draft = clearedTeamLook(draft);
				why = null;
			}}>Clear look</button
		>
		<SaveIndicator state={save} />
	</div>
	<!-- ALWAYS MOUNTED, ONLY ITS TEXT MOVES: why a pressed Save did nothing. It
	     sits in the foot's own block flow, so empty it is a zero box with no
	     grid gap of its own. -->
	<p class="tse-why" role="status" data-testid="team-style-why">{why ?? ''}</p>
	</div>
</form>

<style>
	.tse {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		min-width: 0;
	}
	.tse-note {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.tse-fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.tse-field {
		display: grid;
		gap: 0.2rem;
		flex: 1 1 12rem;
		min-width: 0;
	}
	.tse-field input {
		min-height: 44px;
		width: 100%;
		box-sizing: border-box;
		padding: 0 var(--space-2);
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.tse-field input:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	/* Labels at 11px or more (the label floor), on --text-2, which clears 4.5:1
	   on every classroom card ground. */
	.tse-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
		padding: 0;
	}
	.tse-group {
		margin: 0;
		padding: 0;
		border: 0;
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.tse-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		min-width: 0;
	}
	.tse-opt {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	/* The swatch is its own element: the plate paints a key's face, so a
	   colour sits ON the key rather than being the key. Colour is never the
	   only signal -- every swatch carries its word. */
	.tse-dot {
		flex: none;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		border: 1px solid var(--boundary);
	}
	.tse-glyph {
		display: inline-flex;
		color: var(--text-1);
	}
	.tse-well {
		cursor: pointer;
	}
	.tse-well input[type='color'] {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		background: none;
		cursor: pointer;
	}
	.tse-problems {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-1);
	}
	.tse-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.tse-foot {
		min-width: 0;
	}
	.tse-why {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-1);
	}
	.tse-why:not(:empty) {
		margin-top: var(--space-1);
	}
</style>
