<script lang="ts">
	/**
	 * THE WHOLE-FOUNDRY SWITCH (report c26026b0, ledger 0360). Site
	 * administrators only; the page mounts it behind `isAdmin` and
	 * `foundry_set_site_open` re-checks `is_admin()` in its own body, which is
	 * the boundary.
	 *
	 * IT SITS ON /foundry/classes, BESIDE THE PER-CLASS CONTROL, because that is
	 * where the report was filed ("In addition to Foundry access, for my
	 * classes...") and the two are the same question asked at two sizes. It is
	 * a separate panel and a separate RPC: a class closure is a teacher's, this
	 * is an administrator's, and folding them into one control would make
	 * either one easy to press by mistake.
	 *
	 * OFF IS TWO STEPS AND ON IS ONE. Turning it off costs every student the
	 * whole room, so it is armed first, with what it covers and what it cannot
	 * stop restated at the confirm (`FOUNDRY_SITE_OFF_EFFECT`). Turning it back
	 * on costs nothing and is one press.
	 *
	 * ABSENCE IS THE MECHANISM: no `setSiteOpen` transport, no controls, and the
	 * state is still stated in words.
	 */
	import Pending from '$lib/Pending.svelte';
	import { pendingLabel } from '$lib/pending';

	import {
		FOUNDRY_SITE_NOTE_MAX,
		FOUNDRY_SITE_OFF_EFFECT,
		foundrySiteStateLabel,
		type FoundrySiteState
	} from './access.ts';

	let {
		site,
		setSiteOpen,
		onChanged,
		id = 'foundry-site'
	}: {
		site: FoundrySiteState;
		setSiteOpen?: (
			open: boolean,
			note: string | null
		) => Promise<{ ok: boolean; message?: string }>;
		onChanged?: () => void;
		id?: string;
	} = $props();

	/** The last answer this panel itself got, over the loaded state, until a reload replaces it. */
	let override = $state<FoundrySiteState | null>(null);
	const current = $derived(override ?? site);

	let arming = $state(false);
	let note = $state('');
	let busy = $state(false);
	let problem = $state<string | null>(null);

	async function send(open: boolean) {
		if (!setSiteOpen || busy) return;
		busy = true;
		problem = null;
		const typed = note.trim() || null;
		try {
			const r = await setSiteOpen(open, open ? null : typed);
			if (!r.ok) {
				problem = r.message ?? 'That did not go through. Try again.';
				return;
			}
			override = {
				open,
				note: open ? null : typed,
				closedAt: open ? null : new Date().toISOString(),
				exempt: true
			};
			arming = false;
			note = '';
			onChanged?.();
		} catch (err) {
			problem = err instanceof Error ? err.message : 'That did not go through. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="fdy-block fdy-switch" {id} data-testid="foundry-site-switch">
	<header class="fdy-switch-head">
		<h2>The whole Foundry</h2>
		<!-- THE STATE IS A WORD, with a tone beside it, never a colour alone and
		     never a switch position somebody has to interpret. -->
		<span
			class="fdy-switch-state"
			data-state={current.open ? 'on' : 'off'}
			data-testid="foundry-site-state"
		>
			{foundrySiteStateLabel(current)}
		</span>
	</header>

	<p class="fdy-switch-lead">
		{current.open
			? 'The Foundry is on for everyone. Closing it here is different from closing it for one class below: it turns it off for the whole school at once.'
			: 'The Foundry is off for everyone except site administrators. Students see a notice in place of every Foundry page.'}
	</p>

	{#if !current.open && current.note}
		<p class="fdy-switch-note">
			<span class="fdy-switch-note-label">What students read</span>
			<span class="fdy-switch-note-text">{current.note}</span>
		</p>
	{/if}

	{#if setSiteOpen}
		{#if busy}
			<Pending label={pendingLabel(current.open ? 'Turning it off' : 'Turning it on')} />
		{:else if !current.open}
			<button
				type="button"
				class="btn tap-44"
				data-testid="foundry-site-on"
				onclick={() => send(true)}
			>
				Turn the Foundry back on
			</button>
		{:else if arming}
			<div class="fdy-switch-confirm" data-testid="foundry-site-confirm">
				<p class="fdy-switch-effect">{FOUNDRY_SITE_OFF_EFFECT}</p>
				<p class="fdy-switch-delay">
					It reaches share links within about 30 seconds, and every Foundry page at once.
				</p>
				<label class="fdy-switch-field">
					<span>A note for everyone who visits (optional)</span>
					<textarea
						rows="2"
						maxlength={FOUNDRY_SITE_NOTE_MAX}
						bind:value={note}
						data-testid="foundry-site-note"
					></textarea>
				</label>
				<div class="fdy-switch-do">
					<button
						type="button"
						class="btn danger tap-44"
						data-testid="foundry-site-off-confirm"
						onclick={() => send(false)}
					>
						Turn it off for everyone
					</button>
					<button
						type="button"
						class="btn secondary tap-44"
						onclick={() => {
							arming = false;
							note = '';
						}}
					>
						Keep it on
					</button>
				</div>
			</div>
		{:else}
			<button
				type="button"
				class="btn secondary tap-44"
				data-testid="foundry-site-arm"
				onclick={() => {
					arming = true;
					problem = null;
				}}
			>
				Turn the Foundry off
			</button>
		{/if}
	{/if}

	{#if problem}
		<p class="fdy-switch-problem" role="status">{problem}</p>
	{/if}
</section>

<style>
	.fdy-switch {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		margin: 0 0 1.25rem;
		padding: 1.25rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-switch-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.fdy-switch-head h2 {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	/* A recessed tag: status, not a control. The word carries the state; the
	   edge tone is beside it. */
	.fdy-switch-state {
		padding: 0.14rem 0.55rem;
		border: 1px solid var(--fg-st-done-edge, var(--hairline));
		border-radius: var(--radius-chip, 2px);
		background: var(--fg-st-done-fill, var(--surface-2));
		color: var(--fg-st-done-ink, var(--green));
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.fdy-switch-state[data-state='off'] {
		border-color: var(--fg-st-heat-edge, var(--hairline));
		background: var(--fg-st-heat-fill, var(--surface-2));
		color: var(--fg-st-heat-ink, var(--amber));
	}

	.fdy-switch-lead,
	.fdy-switch-delay {
		margin: 0;
		color: var(--text-2);
	}

	.fdy-switch-effect {
		margin: 0;
		padding: 0.6rem 0.75rem;
		color: var(--text-1);
		background: var(--surface-2);
		border-left: 3px solid var(--fg-heat-ember, var(--hairline));
		border-radius: var(--radius-sm, 4px);
	}

	.fdy-switch-note {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0;
	}

	.fdy-switch-note-label,
	.fdy-switch-field span {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-switch-note-text {
		color: var(--text-1);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.fdy-switch-confirm {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		min-width: 0;
	}

	.fdy-switch-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.fdy-switch-field textarea {
		min-height: 44px;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		background: var(--surface-2);
		color: var(--text-1);
		font: inherit;
		resize: vertical;
	}

	.fdy-switch-field textarea:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-switch-do {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.fdy-switch-problem {
		margin: 0;
		color: var(--text-1);
		padding-left: 0.6rem;
		border-left: 3px solid var(--crimson);
	}
</style>
