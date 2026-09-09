<script lang="ts">
	/**
	 * THE REGISTRATION FORM (prompt 0110, item 7), presentation only. It used
	 * to be inline in `/tournaments/[id]/+page.svelte` where no harness could
	 * mount it; the route now hands it `teamSize` and a transport and does the
	 * upload and the RPC call itself.
	 *
	 * ONE FORM, TWO SHAPES. For a solo event (teamSize 1) it is the form it
	 * always was: an entry name, a description, a picture. For a team event
	 * the name field becomes the TEAM name and two things appear under it:
	 * the registrant's own name on the roster (which defaults to the team
	 * name when left blank -- the server does the same) and up to
	 * teamSize - 1 teammate names. A teammate typed here is an UNLINKED
	 * member (no account); one with an account can also join the entry
	 * themselves from the event page, and the hint says so, because a captain
	 * who types a friend's name and a friend who then tries to join would
	 * otherwise collide on the server's one-account-per-tournament rule.
	 *
	 * `accept="image/*"` stays on the file input: this is a picture the
	 * FEATURE consumes (a thumbnail), not a hand-in, so the classroom's
	 * no-accept rule does not reach it -- the same standing the deck zip has.
	 *
	 * Submit is a real form submit, so Enter in the name field registers; it
	 * is disabled until the name is non-blank, which mirrors the server's
	 * 1..40 rule rather than replacing it. The identity sentence stays: a
	 * student should know what they are about to show a room before they
	 * show it.
	 */
	let {
		teamSize,
		invite = false,
		busy = false,
		error = '',
		onregister,
		ondecline
	}: {
		/** Registrants per entry; > 1 turns this into the team form. */
		teamSize: number;
		/** Accepting an invite: the heading and the submit word change. */
		invite?: boolean;
		busy?: boolean;
		error?: string;
		onregister: (draft: {
			display_name: string;
			description: string;
			member_name: string;
			teammates: string[];
			file: File | null;
		}) => void;
		/** Absent: no Decline control (there is no invite to decline). */
		ondecline?: () => void;
	} = $props();

	let name = $state('');
	let memberName = $state('');
	let description = $state('');
	// Keyed by slot rather than an array sized from the prop, so the initial
	// value reads no prop (the `state_referenced_locally` trap) and a team
	// size that changes underneath does not strand typed names.
	let teammates = $state<Record<number, string>>({});
	let files = $state<FileList | null>(null);

	const team = $derived(teamSize > 1);
	const slots = $derived(Array.from({ length: Math.max(0, teamSize - 1) }, (_, i) => i));
	const canSubmit = $derived(!busy && name.trim().length > 0);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		onregister({
			display_name: name.trim(),
			description: description.trim(),
			member_name: memberName.trim(),
			teammates: slots.map((i) => (teammates[i] ?? '').trim()).filter((s) => s.length > 0),
			file: files?.[0] ?? null
		});
	}
</script>

<section class="card register reg" id="register" data-testid="register-entry">
	<h2>{invite ? 'You are invited' : 'Register'}</h2>
	<p class="note">
		Your public identity in this tournament is the display name and picture you choose here.
	</p>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<form class="reg-form" onsubmit={submit}>
		<label class="field">
			<span class="f-label">{team ? 'Team name' : 'Entry name'}</span>
			<input type="text" maxlength="40" required bind:value={name} data-field="display_name" />
		</label>
		{#if team}
			<label class="field">
				<span class="f-label">Your name on the roster</span>
				<input
					type="text"
					maxlength="40"
					placeholder="Defaults to the team name"
					bind:value={memberName}
					data-field="member_name"
				/>
			</label>
			<fieldset class="teammates">
				<legend class="f-label">Teammates (up to {teamSize - 1})</legend>
				{#each slots as i (i)}
					<label class="field">
						<span class="f-label">Teammate {i + 1}</span>
						<input
							type="text"
							maxlength="40"
							placeholder="Name (optional)"
							bind:value={teammates[i]}
							data-field="teammate"
						/>
					</label>
				{/each}
				<p class="hint">
					Teammates with an account can also join your entry themselves from this page.
				</p>
			</fieldset>
		{/if}
		<label class="field">
			<span class="f-label">Short description (optional)</span>
			<input type="text" maxlength="200" bind:value={description} data-field="description" />
		</label>
		<label class="field file">
			<span class="f-label">Thumbnail (optional)</span>
			<input type="file" accept="image/*" bind:files data-field="file" />
		</label>
		<div class="tnm-actions">
			<button type="submit" class="btn" disabled={!canSubmit} data-action="register">
				{invite ? 'Accept & register' : 'Register'}
			</button>
			{#if ondecline}
				<button type="button" class="btn secondary" disabled={busy} onclick={ondecline}>
					Decline invite
				</button>
			{/if}
		</div>
	</form>
</section>

<style>
	/* Room tokens throughout (tournaments-theme.css measures them): ink
	   #edede8 on the input plate panel-2 12.72:1, ink-dim #93a09a on the card
	   6.10:1, amber #d08030 for a refusal 5.37:1 on the card. The input edge
	   is ink-dim, a `--boundary`-class line for a control (5.50:1 on panel-2). */
	.reg {
		margin: 0 0 1.1rem;
	}
	.note {
		margin: 0 0 0.8rem;
		color: var(--tnm-ink-dim);
		font-size: 0.92rem;
	}
	.error {
		margin: 0 0 0.6rem;
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
	.reg-form {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.f-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.field input {
		box-sizing: border-box;
		min-height: 44px;
		background: var(--tnm-panel-2);
		border: 1px solid var(--tnm-ink-dim);
		border-radius: 6px;
		color: var(--tnm-ink);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.4rem 0.6rem;
		max-width: 28rem;
	}
	.field.file input {
		padding: 0.55rem 0.6rem;
	}
	.teammates {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0.7rem 0.8rem 0.8rem;
		border: 1px solid var(--tnm-line-strong);
		border-radius: 8px;
		min-width: 0;
	}
	.teammates legend {
		padding: 0 0.3rem;
	}
	.hint {
		margin: 0;
		font-size: 0.85rem;
		color: var(--tnm-ink-dim);
	}
	.tnm-actions {
		margin-top: 0.3rem;
	}
</style>
