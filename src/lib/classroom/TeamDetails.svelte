<script lang="ts">
	/**
	 * A CLASS TEAM'S DESCRIPTION, PICTURE AND TOURNAMENTS (0296, ledger 0433,
	 * connector gap 5f6a37e8). The class team is the one record a tournament
	 * follows, so what a member writes here is what the bracket shows, and the
	 * tournaments it plays in are linked from the card.
	 *
	 * PRESENTATION ONLY. `onsave` is the membership-gated write
	 * (`classroom_set_team_details`); ABSENT, there is no Edit control at all.
	 * A refusal is shown verbatim, as the look's is. The picture goes through
	 * the tournament module's one decision about which addresses reach an
	 * `src` (`thumbnailSrc`), and a picture that fails to load is dropped
	 * rather than drawn as a broken box.
	 */
	import { thumbnailSrc } from '$lib/tournaments/thumbnail';
	import type { ClassTeam, TeamDetailsInput } from '$lib/classroom/class-teams';
	import type { TeamStyleResult } from '$lib/classroom/teams';

	let {
		team,
		onsave = null,
		onsaved = null
	}: {
		team: Pick<ClassTeam, 'id' | 'description' | 'picture_url' | 'tournaments'>;
		onsave?: ((input: TeamDetailsInput) => Promise<TeamStyleResult>) | null;
		onsaved?: ((input: TeamDetailsInput) => void) | null;
	} = $props();

	const src = $derived(thumbnailSrc(team.picture_url));
	let failed = $state<string | null>(null);
	const showPicture = $derived(src !== null && failed !== src);
	const tournaments = $derived(team.tournaments ?? []);

	let open = $state(false);
	let description = $state('');
	let picture = $state('');
	let busy = $state(false);
	let error = $state('');

	function start() {
		description = team.description ?? '';
		picture = team.picture_url ?? '';
		error = '';
		open = true;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!onsave || busy) return;
		const input = { teamId: team.id, description: description.trim(), pictureUrl: picture.trim() };
		if (input.pictureUrl && !thumbnailSrc(input.pictureUrl)) {
			error = 'A team picture must be a web address starting with https://';
			return;
		}
		busy = true;
		error = '';
		try {
			const res = await onsave(input);
			if (!res.ok) {
				error = res.message ?? 'That did not save.';
				return;
			}
			open = false;
			onsaved?.(input);
		} finally {
			busy = false;
		}
	}
</script>

{#if showPicture || team.description || tournaments.length || onsave}
	<div class="td" data-testid="class-team-details">
		{#if showPicture || team.description}
			<div class="td-body">
				{#if showPicture && src}
					<img
						class="td-pic"
						{src}
						alt=""
						loading="lazy"
						onerror={() => (failed = src)}
						data-testid="class-team-picture"
					/>
				{/if}
				{#if team.description}<p class="td-desc" data-testid="class-team-description">{team.description}</p>{/if}
			</div>
		{/if}
		{#if tournaments.length}
			<p class="td-tourn" data-testid="class-team-tournaments">
				<span class="td-label">In the bracket</span>
				{#each tournaments as t (t.id)}
					<a class="td-link" href="/tournaments/{t.id}">{t.name}</a>
				{/each}
			</p>
		{/if}
		{#if onsave}
			{#if open}
				<form class="td-form" onsubmit={save} data-testid="class-team-details-form">
					<label class="td-field">
						<span class="td-label">Description</span>
						<textarea rows="2" maxlength="200" bind:value={description}></textarea>
					</label>
					<label class="td-field">
						<span class="td-label">Picture (web address)</span>
						<input type="url" maxlength="600" placeholder="https://" bind:value={picture} />
					</label>
					<p class="td-hint">Shows here and in every tournament your team plays in.</p>
					{#if error}<p class="td-error" role="alert">{error}</p>{/if}
					<div class="td-actions">
						<button type="submit" class="btn tiny" disabled={busy} data-testid="class-team-details-save">Save details</button>
						<button type="button" class="btn secondary tiny" onclick={() => (open = false)}>Cancel</button>
					</div>
				</form>
			{:else}
				<button type="button" class="btn secondary tiny td-edit" onclick={start} data-testid="class-team-details-edit">
					Edit details
				</button>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.td {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.45rem;
		min-width: 0;
	}
	.td-body {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		min-width: 0;
	}
	.td-pic {
		flex: none;
		width: 3.25rem;
		height: 3.25rem;
		object-fit: cover;
		border-radius: 8px;
		border: 1px solid var(--boundary);
	}
	.td-desc {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.35;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.td-tourn {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.5rem;
		margin: 0;
	}
	.td-label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.td-link {
		font-size: 0.9rem;
		color: var(--text-1);
		text-decoration: underline;
		text-underline-offset: 2px;
		overflow-wrap: anywhere;
	}
	.td-form {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.td-field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.td-field textarea,
	.td-field input {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		padding: 0.4rem 0.55rem;
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text-1);
		background: var(--surface-2, var(--bg2));
		border: 1px solid var(--boundary);
		border-radius: 6px;
	}
	.td-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}
	.td-error {
		margin: 0;
		font-size: 0.85rem;
		color: var(--amber);
	}
	.td-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.4rem);
	}
	.td-edit {
		align-self: flex-start;
	}
</style>
