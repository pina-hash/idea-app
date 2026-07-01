<script lang="ts">
	import { prefersReducedMotion } from './motion';

	/**
	 * 3-2-1-BUILD flourish for live-room start. Purely visual: it is triggered
	 * by observing the existing room state transition and never touches the
	 * server-authoritative clock. Skipped entirely under reduced motion.
	 */

	let {
		active = false,
		onDone
	}: {
		active?: boolean;
		onDone?: () => void;
	} = $props();

	let step = $state<string | null>(null);
	let timers: ReturnType<typeof setTimeout>[] = [];

	$effect(() => {
		if (!active) return;
		if (prefersReducedMotion()) {
			onDone?.();
			return;
		}
		const seq = ['3', '2', '1', 'BUILD'];
		seq.forEach((s, i) => {
			timers.push(setTimeout(() => (step = s), i * 800));
		});
		timers.push(
			setTimeout(() => {
				step = null;
				onDone?.();
			}, seq.length * 800 + 500)
		);
		return () => {
			timers.forEach(clearTimeout);
			timers = [];
			step = null;
		};
	});
</script>

{#if step !== null}
	<div class="gt-countdown" aria-hidden="true">
		{#key step}
			<span class="ring"></span>
			<span class="numeral" class:build={step === 'BUILD'}>{step}</span>
		{/key}
	</div>
{/if}

<style>
	.gt-countdown {
		position: fixed;
		inset: 0;
		z-index: 800;
		display: grid;
		place-items: center;
		pointer-events: none;
		background: rgba(4, 7, 10, 0.55);
	}
	.numeral {
		grid-area: 1 / 1;
		font-family: var(--font-head);
		font-weight: 900;
		font-size: clamp(5rem, 18vw, 11rem);
		line-height: 1;
		background: linear-gradient(160deg, var(--green), var(--lime));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 24px rgba(0, 255, 65, 0.45));
		animation: gt-pop 0.75s cubic-bezier(0.2, 0.9, 0.3, 1) both;
	}
	.numeral.build {
		font-size: clamp(3.4rem, 13vw, 8rem);
		letter-spacing: 0.08em;
	}
	.ring {
		grid-area: 1 / 1;
		width: 12rem;
		height: 12rem;
		border: 2px solid var(--green);
		border-radius: 50%;
		opacity: 0;
		animation: gt-ring 0.8s ease-out both;
	}
	@keyframes gt-pop {
		from {
			transform: scale(0.55);
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
	@keyframes gt-ring {
		from {
			transform: scale(0.4);
			opacity: 0.8;
		}
		to {
			transform: scale(1.7);
			opacity: 0;
		}
	}
</style>
