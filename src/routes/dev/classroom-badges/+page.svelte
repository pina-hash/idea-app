<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import { BADGES } from '$lib/identity-style';

	/*
	 * THE BADGE EMBLEMS, AS THE SITE DRAWS THEM (ledger 0360, report R16).
	 * Everything that draws is the shipping `BadgeIcon`; the keys are real
	 * `.btn` keys inside the classroom plate, so their ink and their ground are
	 * the ballot's. The sizes are the ones the site uses: 0.7rem (the class
	 * strip key), 1rem (chips and cards), 1.2rem (the ballot) and 1.7rem (the
	 * class banner).
	 */
	const themeParam = page.url.searchParams.get('theme');

	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	const SIZES = ['0.7rem', '1rem', '1.2rem', '1.7rem'] as const;

	/* The pressed key, as a vote is: pressing another moves it. */
	let pressed = $state<string>('gear');
	/* Replay remounts the once row, which is what a first view is. */
	let replays = $state(0);

	/* `?replay=loop` remounts it every 700ms, so a browser pass sweeping for
	   motion always finds a beat in flight (the draw and beat take 1.2s). The
	   HARNESS loops; the component never does. */
	const loop = page.url.searchParams.get('replay') === 'loop';
	$effect(() => {
		if (!loop) return;
		const t = setInterval(() => (replays += 1), 700);
		return () => clearInterval(t);
	});
</script>

<svelte:head><title>dev / classroom badges</title></svelte:head>

<div class="cr-root {CLASSROOM_PLATE}" data-testid="badge-harness">
	<main class="bh">
		<h1 class="bh-title">Badge emblems</h1>

		<section class="card bh-card" aria-labelledby="bh-sizes">
			<h2 id="bh-sizes" class="bh-h">Every emblem at every size the site draws</h2>
			<div class="bh-grid">
				{#each BADGES as b (b.id)}
					<div class="bh-row">
						<span class="bh-name">{b.label}</span>
						{#each SIZES as s (s)}
							<span class="bh-cell" data-testid="badge-cell" data-badge={b.id} data-size={s}>
								<BadgeIcon id={b.id} size={s} />
							</span>
						{/each}
					</div>
				{/each}
			</div>
		</section>

		<section class="card bh-card" aria-labelledby="bh-keys">
			<h2 id="bh-keys" class="bh-h">On keys: the beat plays on hover, on focus, and when a key becomes pressed</h2>
			<div class="bh-keys">
				{#each BADGES as b (b.id)}
					<button
						type="button"
						class="btn secondary bh-key"
						data-testid="badge-key"
						data-badge={b.id}
						aria-pressed={pressed === b.id}
						onclick={() => (pressed = b.id)}
					>
						<BadgeIcon id={b.id} size="1.2rem" />
						<span>{b.label}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="card bh-card" aria-labelledby="bh-once">
			<h2 id="bh-once" class="bh-h">Once: drawn on first view, as the class banner draws it</h2>
			<button type="button" class="btn secondary" data-testid="badge-replay" onclick={() => (replays += 1)}>
				Replay
			</button>
			{#key replays}
				<div class="bh-once-row" data-testid="badge-once-row" data-replays={replays}>
					{#each BADGES as b (b.id)}
						<span class="bh-once" data-testid="badge-once" data-badge={b.id}>
							<BadgeIcon id={b.id} size="2.6rem" motion="once" />
							<span class="bh-once-name">{b.label}</span>
						</span>
					{/each}
				</div>
			{/key}
		</section>
	</main>
</div>

<style>
	.bh {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1rem;
		display: grid;
		gap: 1.25rem;
	}
	.bh-title {
		margin: 0;
		font-size: 1.3rem;
		color: var(--text-1);
	}
	.bh-card {
		padding: 1rem;
		display: grid;
		gap: 0.85rem;
		min-width: 0;
	}
	.bh-h {
		margin: 0;
		font-size: 1rem;
		color: var(--text-1);
	}
	.bh-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr));
		gap: 0.75rem 1.5rem;
	}
	.bh-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		min-width: 0;
		color: var(--text-1);
	}
	.bh-name {
		width: 4.5rem;
		font-size: 0.85rem;
		color: var(--text-1);
	}
	.bh-cell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
	}
	.bh-card > .btn {
		justify-self: start;
	}
	.bh-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.bh-key {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
	.bh-once-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
		color: var(--text-1);
	}
	.bh-once {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		min-width: 4.5rem;
	}
	.bh-once-name {
		font-size: 0.8rem;
		color: var(--text-1);
	}
</style>
