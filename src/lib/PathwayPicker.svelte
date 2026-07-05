<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { PATHWAYS, withAlpha, type PathwayId } from '$lib/pathways';
	import type { UserProfile } from '$lib/profile';

	/**
	 * First-login pathway picker, mounted once in the root layout. Self-contained
	 * like ProfileMenu: reads the session from page data and renders nothing
	 * unless the signed-in user is a STUDENT with no pathway set. Choosing
	 * persists profiles.pathway through the browser client (the "update own
	 * profile" RLS policy), so once set it never prompts again. "Choose later"
	 * hides it for this browser session only; it returns next session until a
	 * pathway is chosen. Pathway is identity only, never an access gate, so the
	 * picker never blocks navigation.
	 */

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);

	const DISMISS_KEY = 'pathway-picker-dismissed';
	let dismissed = $state(false);
	try {
		dismissed = !!sessionStorage.getItem(DISMISS_KEY);
	} catch {
		/* sessionStorage unavailable (SSR); the render gate below re-checks nothing */
	}

	let selected: PathwayId | null = $state(null);
	let saving = $state(false);
	let errorMsg = $state('');

	const show = $derived(
		!dismissed && !!claims && profile?.role === 'student' && !profile.pathway
	);

	const later = () => {
		dismissed = true;
		try {
			sessionStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* session-only convenience; losing it just means the prompt returns */
		}
	};

	const confirm = async () => {
		if (!claims || !selected) return;
		saving = true;
		errorMsg = '';
		// Select the row back to confirm the write actually landed (a zero-row
		// RLS-blocked update otherwise reads as success; see ProfileMenu).
		const { data, error } = await supabase
			.from('profiles')
			.update({ pathway: selected })
			.eq('id', claims.sub)
			.select('id');
		if (error) {
			errorMsg = error.message;
		} else if (!data || data.length === 0) {
			errorMsg = 'Could not save your pathway. Try signing out and back in.';
		} else {
			await invalidateAll();
		}
		saving = false;
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (show && e.key === 'Escape') later();
	};
</script>

<svelte:window onkeydown={onKeydown} />

{#if show}
	<div class="pwp-overlay">
		<div class="pwp-panel" role="dialog" aria-modal="true" aria-labelledby="pwp-title">
			<div class="pwp-eyebrow">Bosco Tech</div>
			<h2 id="pwp-title">Choose your pathway</h2>
			<p class="pwp-sub">
				Every Bosco Tech student is identified by their pathway. Pick yours once and it becomes part
				of your profile across the portal. It never limits what you can access, and a teacher can
				correct it later if needed.
			</p>

			<div class="pwp-grid">
				{#each PATHWAYS as p (p.id)}
					<button
						class="pwp-option"
						class:selected={selected === p.id}
						type="button"
						disabled={saving}
						style="--pw:{p.color}; --pw-bg:{withAlpha(p.color, 0.1)}; --pw-line:{withAlpha(p.color, 0.45)}"
						onclick={() => (selected = p.id)}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- static markup from the pathways registry, never user input -->
							{@html p.icon}
						</svg>
						<span class="pwp-code">{p.label}</span>
					</button>
				{/each}
			</div>

			{#if errorMsg}
				<p class="pwp-error">{errorMsg}</p>
			{/if}

			<div class="pwp-actions">
				<button class="pwp-confirm" type="button" disabled={!selected || saving} onclick={confirm}>
					{saving ? 'Saving...' : selected ? `Confirm ${selected}` : 'Pick a pathway'}
				</button>
				<button class="pwp-later" type="button" disabled={saving} onclick={later}>
					Choose later
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.pwp-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(3px);
	}
	.pwp-panel {
		width: min(600px, 100%);
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		background: var(--bg1, #050f07);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 8px;
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.7);
		padding: 1.6rem;
	}
	.pwp-eyebrow {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	h2 {
		margin: 0.35rem 0 0;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 700;
		font-size: 1.5rem;
		letter-spacing: 0.03em;
		color: var(--white, #e8ffe8);
	}
	.pwp-sub {
		margin: 0.5rem 0 1.1rem;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--dim, #4a7a52);
	}
	.pwp-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}
	@media (max-width: 480px) {
		.pwp-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.pwp-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.9rem 0.5rem 0.75rem;
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 6px;
		color: var(--pw);
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
	}
	.pwp-option:hover {
		border-color: var(--pw-line);
		background: var(--pw-bg);
	}
	.pwp-option.selected {
		border-color: var(--pw);
		background: var(--pw-bg);
		box-shadow: 0 0 12px var(--pw-line);
	}
	.pwp-option svg {
		width: 30px;
		height: 30px;
	}
	.pwp-code {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		letter-spacing: 0.16em;
	}
	.pwp-error {
		margin: 0.8rem 0 0;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		color: var(--amber, #ff8c00);
	}
	.pwp-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 1.2rem;
	}
	.pwp-confirm {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green, #00ff41);
		background: rgba(0, 255, 65, 0.08);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 4px;
		padding: 0.55rem 1.1rem;
		cursor: pointer;
	}
	.pwp-confirm:hover:not(:disabled) {
		border-color: var(--green, #00ff41);
		box-shadow: 0 0 10px rgba(0, 255, 65, 0.3);
	}
	.pwp-confirm:disabled {
		color: var(--dim, #4a7a52);
		background: none;
		cursor: default;
		box-shadow: none;
	}
	.pwp-later {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		color: var(--dim, #4a7a52);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
	}
	.pwp-later:hover {
		color: var(--white, #e8ffe8);
	}
	@media (prefers-reduced-motion: reduce) {
		.pwp-option {
			transition: none;
		}
	}
</style>
