<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	/**
	 * FspStudentPreview — a modal overlay that shows /fsp/ask inside a mobile
	 * phone frame, so a presenter can see exactly what students see on their
	 * phones without leaving the deck / console. Shared by /fsp/day1 (presenter
	 * toolbar) and /fsp/live (controls). Staff-only surfaces mount it, so it has
	 * no auth logic of its own; the host page renders the trigger button and
	 * binds `open`.
	 *
	 * Escape closes it (the modal only claims Escape while open, and only when
	 * not in native fullscreen — there Escape belongs to exiting fullscreen).
	 */

	let { open = $bindable(false) } = $props();

	const ASK_SRC = '/fsp/ask';

	function close() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		// In fullscreen, Escape exits fullscreen natively; don't also close here.
		if (e.key === 'Escape' && !document.fullscreenElement) {
			e.preventDefault();
			close();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
	});
	onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if open}
	<div
		class="sp-backdrop"
		role="presentation"
		onclick={close}
		onkeydown={() => {}}
	>
		<div
			class="phone"
			role="dialog"
			aria-modal="true"
			aria-label="Student view preview"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="phone-bar">
				<span class="phone-label">Student view &middot; /fsp/ask</span>
				<button class="close" onclick={close} aria-label="Close student view" title="Close">
					&times;
				</button>
			</div>
			<div class="phone-screen">
				<iframe src={ASK_SRC} title="Student view of /fsp/ask" loading="lazy"></iframe>
			</div>
		</div>
	</div>
{/if}

<style>
	.sp-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(3px);
		display: grid;
		place-items: center;
		padding: 1.25rem;
	}
	.phone {
		position: relative;
		width: 390px;
		max-width: 100%;
		height: min(844px, 92vh);
		background: #0a0a0a;
		border: 2px solid rgba(0, 255, 65, 0.3);
		border-radius: 28px;
		box-shadow:
			0 0 0 6px #05060a,
			0 24px 70px rgba(0, 0, 0, 0.7),
			0 0 44px rgba(0, 255, 65, 0.12);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.phone-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.55rem 0.7rem 0.55rem 0.95rem;
		background: #0c110c;
		border-bottom: 1px solid rgba(0, 255, 65, 0.18);
	}
	.phone-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #6fae77;
	}
	.close {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		font-size: 1.4rem;
		line-height: 1;
		border-radius: 8px;
		border: 1px solid rgba(0, 255, 65, 0.3);
		background: transparent;
		color: var(--green, #00ff41);
		cursor: pointer;
	}
	.close:hover {
		background: rgba(0, 255, 65, 0.14);
	}
	.phone-screen {
		flex: 1;
		min-height: 0;
	}
	.phone-screen iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
</style>
