<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	/**
	 * FspPresentationsPanel — a modal overlay opened from the FSP homepage
	 * section's single "FSP Presentations" row. Replaces the old separate
	 * Day 1 / Day 2 archive-page links with one panel holding all three days as
	 * tabs, each embedding its Google Slides deck via the public /embed URL
	 * (no auth, no per-day route).
	 *
	 * Styled to match the rest of the FSP live-session surfaces (FspStudentPreview,
	 * FspDayArchive, /fsp/live): IDEA green on near-black, Share Tech Mono chrome.
	 *
	 * Google's /embed iframe can fail silently (a blocked share setting renders an
	 * in-frame "you need access" page without ever firing the iframe's error
	 * event), so detecting failure reliably isn't possible. Rather than gate a
	 * fallback behind unreliable error detection, a plain "Open in Google Slides"
	 * link is ALWAYS shown alongside the iframe in every tab — if the embed is
	 * blocked, the link still works and is never hidden.
	 */

	interface Deck {
		id: string;
		day: number;
		label: string;
	}

	const DECKS: Deck[] = [
		{ id: '1AfuHlF9kQyDUjUp-Wx6s0tw6RNoa8zhLxbKxwu7HSQ0', day: 1, label: 'Day 1' },
		{ id: '1wR7tAhGMakFey_FFI3TaKJlqZjmel-ZjSqwL-eYFKVI', day: 2, label: 'Day 2' },
		{ id: '1LuQrrIclPcw2ldCmadxIvFHww0zyk9_u-ZvvQJmpoOk', day: 3, label: 'Day 3' }
	];

	const embedSrc = (id: string) =>
		`https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=3000`;
	const openSrc = (id: string) => `https://docs.google.com/presentation/d/${id}/edit?usp=sharing`;

	let { open = $bindable(false) } = $props();

	let activeIdx = $state(0);
	// Per-deck load state, keyed by deck index. A deck is 'loading' from the
	// moment its tab is first opened; the iframe's own onload/onerror advance it
	// to 'loaded'/'error'. Google's embed can also render an in-frame access
	// error WITHOUT ever firing onerror, so this state only ever gates the
	// loading spinner, never the fallback link below (which always renders).
	let status = $state<Record<number, 'loading' | 'loaded' | 'error'>>({});

	function activate(i: number) {
		activeIdx = i;
		if (!status[i]) status = { ...status, [i]: 'loading' };
	}

	function onFrameLoad(i: number) {
		status = { ...status, [i]: 'loaded' };
	}
	function onFrameError(i: number) {
		status = { ...status, [i]: 'error' };
	}

	function close() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	$effect(() => {
		if (open) activate(activeIdx);
	});

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
	});
	onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if open}
	<div class="fp-backdrop" role="presentation" onclick={close} onkeydown={() => {}}>
		<div
			class="fp-panel"
			role="dialog"
			aria-modal="true"
			aria-label="FSP presentations"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="fp-bar">
				<span class="fp-title">FSP Presentations</span>
				<button class="fp-close" onclick={close} aria-label="Close presentations" title="Close">
					&times;
				</button>
			</div>

			<div class="fp-tabs" role="tablist" aria-label="Presentation day">
				{#each DECKS as deck, i (deck.id)}
					<button
						class="fp-tab"
						class:active={i === activeIdx}
						role="tab"
						aria-selected={i === activeIdx}
						onclick={() => activate(i)}
					>
						{deck.label}
					</button>
				{/each}
			</div>

			<div class="fp-stage">
				{#each DECKS as deck, i (deck.id)}
					{#if status[i]}
						<div class="fp-deck" class:hidden={i !== activeIdx}>
							{#if status[i] === 'loading'}
								<div class="fp-loading">Loading {deck.label}…</div>
							{/if}
							<iframe
								class="fp-frame"
								src={embedSrc(deck.id)}
								title="FSP {deck.label} presentation"
								allow="fullscreen"
								onload={() => onFrameLoad(i)}
								onerror={() => onFrameError(i)}
							></iframe>
							<div class="fp-fallback">
								{#if status[i] === 'error'}
									<span class="fp-fallback-note">This deck could not be embedded.</span>
								{/if}
								<a class="fp-fallback-link" href={openSrc(deck.id)} target="_blank" rel="noopener noreferrer">
									Open {deck.label} in Google Slides &#8599;
								</a>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.fp-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(3px);
		display: grid;
		place-items: center;
		padding: 1.25rem;
	}
	.fp-panel {
		position: relative;
		width: min(1100px, 100%);
		height: min(760px, 92vh);
		background: #0a0a0a;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 16px;
		box-shadow:
			0 24px 70px rgba(0, 0, 0, 0.7),
			0 0 44px rgba(0, 255, 65, 0.12);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.fp-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.7rem 0.7rem 0.7rem 1.1rem;
		background: #0c110c;
		border-bottom: 1px solid rgba(0, 255, 65, 0.18);
	}
	.fp-title {
		font-family: 'Rajdhani', system-ui, sans-serif;
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--green, #00ff41);
		text-shadow: 0 0 10px rgba(0, 255, 65, 0.4);
		letter-spacing: 0.01em;
	}
	.fp-close {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		font-size: 1.5rem;
		line-height: 1;
		border-radius: 8px;
		border: 1px solid rgba(0, 255, 65, 0.3);
		background: transparent;
		color: var(--green, #00ff41);
		cursor: pointer;
	}
	.fp-close:hover {
		background: rgba(0, 255, 65, 0.14);
	}

	.fp-tabs {
		display: flex;
		gap: 0.4rem;
		padding: 0.6rem 0.9rem;
		background: #0a0f0a;
		border-bottom: 1px solid rgba(0, 255, 65, 0.12);
	}
	.fp-tab {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.5rem 1.1rem;
		border-radius: 8px;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		background: transparent;
		color: #a9c9ad;
		cursor: pointer;
	}
	.fp-tab:hover {
		background: rgba(0, 255, 65, 0.08);
		color: var(--green, #00ff41);
	}
	.fp-tab.active {
		background: rgba(0, 255, 65, 0.16);
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
		box-shadow: 0 0 14px rgba(0, 255, 65, 0.18);
	}

	.fp-stage {
		flex: 1;
		min-height: 0;
		position: relative;
	}
	.fp-deck {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
	}
	.fp-deck.hidden {
		display: none;
	}
	.fp-loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		color: #4a7a52;
		background: #0a0a0a;
		pointer-events: none;
	}
	.fp-frame {
		flex: 1;
		min-height: 0;
		width: 100%;
		border: 0;
		display: block;
		background: #050505;
	}
	.fp-fallback {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.8rem;
		padding: 0.5rem 0.9rem;
		background: #0c110c;
		border-top: 1px solid rgba(0, 255, 65, 0.12);
	}
	.fp-fallback-note {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--gold, #c8ff00);
		margin-right: auto;
	}
	.fp-fallback-link {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--cyan, #00f0ff);
		text-decoration: none;
	}
	.fp-fallback-link:hover {
		text-decoration: underline;
	}

	@media (max-width: 640px) {
		.fp-panel {
			height: min(600px, 92vh);
		}
		.fp-tab {
			padding: 0.5rem 0.8rem;
			font-size: 0.78rem;
		}
	}
</style>
