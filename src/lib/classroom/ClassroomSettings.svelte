<script lang="ts">
	/**
	 * THE CLASSROOM'S SETTINGS: one compact panel, opened from the Settings
	 * control in the classroom header or from the palette.
	 *
	 * Every group the viewer's role is offered (`CLASSROOM_SETTINGS`), each with
	 * its choices, a word saying where it is kept (this device, or the account so
	 * it follows them), and a Reset that appears only when the group differs from
	 * its defaults. What a group means and where it lives is decided in
	 * `$lib/preferences/classroom`; this renders it and writes through the store,
	 * which is the only thing that knows how a choice is kept.
	 *
	 * A native <dialog> with showModal, mounted only while open, focus returned
	 * to what had it -- the palette's shape, for the palette's reasons.
	 */
	import {
		CLASSROOM_SETTINGS,
		groupIsDefault,
		homeLabel,
		CLASSROOM_PREFERENCE_HOMES,
		type ClassroomPreferences,
		type SettingRole
	} from '$lib/preferences/classroom';
	import type { PreferenceStore } from '$lib/preferences/store';
	import { reactivePreferences } from '$lib/preferences/context';

	let {
		preferences,
		role
	}: {
		preferences: PreferenceStore<ClassroomPreferences>;
		/** Which groups are offered: a student has no instructor surfaces to make compact. */
		role: SettingRole;
	} = $props();

	let isOpen = $state(false);
	let dialogEl = $state<HTMLDialogElement | null>(null);
	let returnFocus: HTMLElement | null = null;

	const prefs = $derived(reactivePreferences(preferences));
	const current = $derived(prefs.current);
	const offered = $derived(CLASSROOM_SETTINGS.filter((s) => s.roles.includes(role)));

	export function open() {
		if (isOpen) return;
		const focused = document.activeElement;
		returnFocus = focused instanceof HTMLElement && focused !== document.body ? focused : null;
		isOpen = true;
	}

	export function close() {
		if (!isOpen) return;
		isOpen = false;
		const el = dialogEl;
		if (el?.open) el.close();
		const back = returnFocus;
		returnFocus = null;
		if (back?.isConnected) back.focus();
	}

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		if (!el.open) el.showModal();
		const onClose = () => close();
		const onCancel = (e: Event) => {
			e.preventDefault();
			close();
		};
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			e.stopPropagation();
			close();
		};
		const onPointerdown = (e: PointerEvent) => {
			if (e.target === el) close();
		};
		el.addEventListener('close', onClose);
		el.addEventListener('cancel', onCancel);
		el.addEventListener('keydown', onKeydown);
		el.addEventListener('pointerdown', onPointerdown);
		return () => {
			el.removeEventListener('close', onClose);
			el.removeEventListener('cancel', onCancel);
			el.removeEventListener('keydown', onKeydown);
			el.removeEventListener('pointerdown', onPointerdown);
			if (el.open) el.close();
		};
	});

	function choose(group: keyof ClassroomPreferences, field: string, value: string) {
		preferences.set(group, { ...(current[group] as Record<string, unknown>), [field]: value } as never);
	}

	/** The stored value a group's radio group shows. */
	function valueOf(group: keyof ClassroomPreferences, field: string): string {
		return String((current[group] as Record<string, unknown>)[field] ?? '');
	}

	const recentCount = $derived(current.search.recent.length);
</script>

{#snippet home(group: keyof ClassroomPreferences)}
	<span class="cs-home" data-home={CLASSROOM_PREFERENCE_HOMES[group]}>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			{#if CLASSROOM_PREFERENCE_HOMES[group] === 'device'}
				<path d="M3.5 5h17v11h-17zM9 20h6M12 16v4" />
			{:else}
				<path d="M12 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM5 20.5a7 7 0 0 1 14 0" />
			{/if}
		</svg>
		{homeLabel(group)}
	</span>
{/snippet}

{#snippet reset(group: keyof ClassroomPreferences, label: string)}
	{#if groupIsDefault(current, group)}
		<span class="cs-default" data-testid="settings-default-{group}">Default</span>
	{:else}
		<button
			type="button"
			class="cs-btn"
			data-testid="settings-reset-{group}"
			aria-label="Reset {label} to its default"
			onclick={() => preferences.reset(group)}>Reset</button
		>
	{/if}
{/snippet}

{#if isOpen}
	<dialog
		bind:this={dialogEl}
		class="cs-dialog"
		aria-labelledby="cs-title"
		data-testid="classroom-settings"
	>
		<div class="cs-head">
			<h2 id="cs-title" class="cs-title">Classroom settings</h2>
			<button type="button" class="cs-btn" data-testid="settings-close" onclick={close}>Close</button>
		</div>
		<div class="cs-body">
			{#each offered as s (s.group)}
				<section class="cs-group" data-group={s.group} data-testid="settings-group">
					<div class="cs-group-head">
						<h3 class="cs-group-title" id="cs-{s.group}">{s.title}</h3>
						{@render home(s.group)}
						{@render reset(s.group, s.title)}
					</div>
					<div class="cs-options" role="radiogroup" aria-labelledby="cs-{s.group}">
						{#each s.options(role) as o (o.value)}
							<label class="cs-option" data-testid="settings-option-{s.group}-{o.value}">
								<input
									type="radio"
									name="cs-{s.group}"
									value={o.value}
									checked={valueOf(s.group, s.field) === o.value}
									onchange={() => choose(s.group, s.field, o.value)}
								/>
								<span>{o.label}</span>
							</label>
						{/each}
					</div>
				</section>
			{/each}
			<section class="cs-group" data-group="search" data-testid="settings-group">
				<div class="cs-group-head">
					<h3 class="cs-group-title">Recent searches</h3>
					{@render home('search')}
					{@render reset('search', 'Recent searches')}
				</div>
				<p class="cs-value" data-testid="settings-recent-count">
					{recentCount}
					{recentCount === 1 ? 'pick remembered' : 'picks remembered'}
				</p>
			</section>
		</div>
	</dialog>
{/if}

<style>
	.cs-dialog {
		position: fixed;
		inset: 0;
		margin: max(6vh, 16px) auto auto;
		width: min(30rem, calc(100vw - 32px));
		max-height: min(36rem, calc(100dvh - 12vh));
		padding: 0;
		background: var(--surface-1);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		overflow: auto;
	}
	.cs-dialog::backdrop {
		background: color-mix(in srgb, var(--surface-0) 72%, transparent);
	}
	.cs-head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--hairline);
	}
	.cs-title {
		flex: 1 1 auto;
		margin: 0;
		font-size: 1.05rem;
	}
	.cs-body {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4) var(--space-4);
	}
	.cs-group {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--hairline);
	}
	.cs-group:last-child {
		border-bottom: 0;
	}
	.cs-group-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.cs-group-title {
		margin: 0;
		font-size: 0.98rem;
	}
	.cs-home {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.cs-home svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.cs-default {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.cs-btn {
		min-height: 44px;
		padding: 0 var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		cursor: pointer;
	}
	.cs-group-head .cs-btn {
		margin-left: auto;
	}
	.cs-btn:hover {
		border-color: var(--gold);
	}
	.cs-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.cs-option {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 44px;
		padding: 0 var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		cursor: pointer;
	}
	/* The chosen option is marked by its own radio dot, an edge and a rule, never colour alone. */
	.cs-option:has(input:checked) {
		border-color: var(--green);
		box-shadow: inset 0 -2px 0 var(--green);
	}
	.cs-option input {
		accent-color: var(--green);
		width: 18px;
		height: 18px;
		margin: 0;
	}
	.cs-value {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
</style>
