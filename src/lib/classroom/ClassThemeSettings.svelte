<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		SECTION_ACCENTS,
		sectionAccentLabel,
		themeColourCss,
		type ClassThemeTransports
	} from '$lib/classroom/class-theme';

	/**
	 * A TEACHER'S HALF OF THE CLASS THEME (decision 45), on the class's own
	 * Settings tab: the one colour that tells this block from the other blocks
	 * of the course, whether the class may vote, and a reset.
	 *
	 * THE VOTE ITSELF IS THE STUDENTS'. Nothing here chooses a palette, a
	 * pattern or a badge; a teacher opens and closes voting and can start it
	 * over, and the database refuses a teacher's vote outright.
	 *
	 * A RESET DELETES NOTHING, and the confirm says so before the press: it
	 * stamps a time, votes cast before it stop counting, and a student who votes
	 * again is counted again. Two steps, inline, because it costs the class its
	 * current look.
	 *
	 * ABSENCE IS THE MECHANISM: a read answering `unavailable` (no 0225 yet) or
	 * "Not found." renders no card at all.
	 */
	let {
		sectionId,
		courseId,
		transports,
		onchanged = null
	}: {
		sectionId: string;
		courseId: string;
		transports: ClassThemeTransports;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let phase = $state<'loading' | 'ready' | 'hidden'>('loading');
	let accent = $state<string | null>(null);
	let votingOpen = $state(true);
	let voters = $state(0);
	let busy = $state(false);
	let armedReset = $state(false);
	let msg = $state<{ ok: boolean; text: string } | null>(null);

	async function load() {
		const t = transports;
		const [tally, themes] = await untrack(() =>
			Promise.all([t.tally(courseId), t.themes([sectionId])])
		);
		if (!tally.ok) {
			if (tally.reason === 'unavailable' || tally.message === 'Not found.') {
				phase = 'hidden';
				return;
			}
			msg = { ok: false, text: tally.message };
		} else {
			votingOpen = tally.tally.voting_open;
			voters = tally.tally.voters;
		}
		if (themes.ok) {
			accent = themes.themes.find((c) => c.section_id === sectionId)?.accent ?? null;
		} else if (themes.reason === 'unavailable') {
			phase = 'hidden';
			return;
		}
		phase = 'ready';
	}

	onMount(() => {
		void load();
	});

	async function changed() {
		const notify = onchanged;
		if (notify) await untrack(() => notify());
	}

	async function pickAccent(next: string | null) {
		if (busy || next === accent) return;
		busy = true;
		msg = null;
		try {
			const t = transports;
			const res = await untrack(() => t.setAccent(sectionId, next));
			if (res.ok) {
				accent = res.accent;
				msg = {
					ok: true,
					text: res.accent
						? `This block's color is now ${sectionAccentLabel(res.accent)}.`
						: 'This block has no color of its own now.'
				};
				await changed();
			} else if (res.reason === 'unavailable') {
				phase = 'hidden';
			} else {
				msg = { ok: false, text: res.message };
			}
		} finally {
			busy = false;
		}
	}

	async function setVoting(open: boolean) {
		if (busy) return;
		busy = true;
		msg = null;
		try {
			const t = transports;
			const res = await untrack(() => t.setVoting(courseId, open));
			if (res.ok) {
				votingOpen = res.voting_open;
				msg = {
					ok: true,
					text: res.voting_open ? 'Voting is open.' : 'Voting is closed. The current look stays.'
				};
			} else if (res.reason === 'unavailable') {
				phase = 'hidden';
			} else {
				msg = { ok: false, text: res.message };
			}
		} finally {
			busy = false;
		}
	}

	async function reset() {
		if (busy) return;
		busy = true;
		msg = null;
		try {
			const t = transports;
			const res = await untrack(() => t.reset(courseId));
			if (res.ok) {
				voters = 0;
				votingOpen = res.voting_open;
				msg = { ok: true, text: 'The vote starts over. Earlier votes no longer count.' };
				await changed();
			} else if (res.reason === 'unavailable') {
				phase = 'hidden';
			} else {
				msg = { ok: false, text: res.message };
			}
		} finally {
			busy = false;
			armedReset = false;
		}
	}

	function swatch(id: string): string {
		const a = SECTION_ACCENTS.find((x) => x.id === id);
		return a
			? `--sw-a:${themeColourCss(a.colour, 'dark')};--sw-a-light:${themeColourCss(a.colour, 'light')}`
			: '';
	}
</script>

{#if phase === 'ready'}
	<section class="card cts" data-testid="settings-theme">
		<h2>Class theme</h2>
		<p class="note">
			Students vote on a palette, a pattern and a badge for this class, and every block of it
			shares the result. The color below is this block's own, so two blocks of one class look
			different.
		</p>

		<div class="cts-group" role="group" aria-labelledby="cts-accent-{sectionId}">
			<h3 id="cts-accent-{sectionId}" class="cts-label">This block's color</h3>
			<div class="cts-keys">
				<button
					type="button"
					class="btn tiny tap-44 cts-key"
					class:on={accent === null}
					aria-pressed={accent === null}
					aria-disabled={busy}
					data-testid="settings-accent"
					data-accent=""
					onclick={() => void pickAccent(null)}
				>
					<span class="cts-swatch cts-none" aria-hidden="true"></span>
					No color
				</button>
				{#each SECTION_ACCENTS as a (a.id)}
					<button
						type="button"
						class="btn tiny tap-44 cts-key"
						class:on={accent === a.id}
						aria-pressed={accent === a.id}
						aria-disabled={busy}
						data-testid="settings-accent"
						data-accent={a.id}
						onclick={() => void pickAccent(a.id)}
					>
						<span class="cts-swatch" style={swatch(a.id)} aria-hidden="true"></span>
						{a.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="cts-group">
			<h3 class="cts-label">Voting</h3>
			<p class="note" data-testid="settings-voting-state">
				{votingOpen ? 'Voting is open.' : 'Voting is closed.'}
				{voters}
				{voters === 1 ? 'person has' : 'people have'} voted since the last reset.
			</p>
			<div class="cts-keys">
				<button
					type="button"
					class="btn tiny tap-44"
					aria-disabled={busy}
					data-testid="settings-voting-toggle"
					onclick={() => void setVoting(!votingOpen)}
				>
					{votingOpen ? 'Close voting' : 'Open voting'}
				</button>
				{#if armedReset}
					<span class="note cts-reset-note" data-testid="settings-reset-note">
						Reset the vote? Votes cast so far stop counting and the class goes back to the
						default look until people vote again. Nothing is deleted.
					</span>
					<button
						type="button"
						class="btn tiny danger tap-44"
						aria-disabled={busy}
						data-testid="settings-reset-confirm"
						onclick={() => void reset()}
					>
						Reset
					</button>
					<button
						type="button"
						class="btn tiny tap-44"
						data-testid="settings-reset-cancel"
						onclick={() => (armedReset = false)}
					>
						Keep the votes
					</button>
				{:else}
					<button
						type="button"
						class="btn tiny tap-44"
						data-testid="settings-reset"
						onclick={() => (armedReset = true)}
					>
						Reset the vote
					</button>
				{/if}
			</div>
		</div>

		<p class="note cts-msg" class:bad={msg && !msg.ok} role="status" data-testid="settings-theme-msg">
			{msg?.text ?? ''}
		</p>
	</section>
{/if}

<style>
	/* In the Settings grid it takes the whole row under the two cards above
	   it; anywhere else these change nothing. */
	.cts {
		grid-column: 1 / -1;
		min-width: 0;
		margin: 0;
	}
	.cts-group {
		margin-top: var(--space-3, 0.75rem);
	}
	.cts-label {
		margin: 0 0 0.4rem;
		font-size: 1rem;
	}
	.cts-keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.cts-key {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.cts-swatch {
		--sw: var(--sw-a);
		flex: none;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--sw);
		border: 1px solid var(--boundary);
	}
	:global(:root[data-theme='space-white']) .cts-swatch {
		--sw: var(--sw-a-light);
	}
	.cts-none {
		background: transparent;
		border-style: dashed;
	}
	.cts-reset-note {
		flex-basis: 100%;
		margin: 0;
	}
	.cts-msg {
		margin: var(--space-3, 0.75rem) 0 0;
	}
	.cts-msg:empty {
		margin: 0;
	}
	.cts-msg.bad {
		padding-left: 0.5rem;
		border-left: 3px solid var(--amber);
		color: var(--text-1);
	}
</style>
