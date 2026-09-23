<script lang="ts">
	/**
	 * THE COMMAND PALETTE: Ctrl+K (Cmd+K on a Mac) from any classroom or notebook
	 * page, or the Search control in the classroom header.
	 *
	 * One field over everything the page already loaded -- the class's items and
	 * units, the viewer's other classes, their check-ins, the registry's actions
	 * for their role and this screen, and a manager's roster -- ranked by
	 * `$lib/shell/search` with one-typo tolerance and recent picks first. `#`
	 * narrows to items, `@` to students (managers), `>` to actions; the three
	 * scope buttons under the field say so without a sentence.
	 *
	 * `?`, outside anything you are typing in, opens the SAME dialog on the
	 * shortcut legend (`ShortcutLegend`), which reads the registry, and `/`
	 * jumps to the class page's own search when one is mounted.
	 *
	 * A NATIVE <dialog> WITH showModal, the HallPass/PhotoViewer shape: the
	 * browser owns the top layer, the focus trap, Escape and the inert page
	 * behind it. It is mounted only while open, and closing returns focus to
	 * whatever had it (the trigger, when the trigger opened it).
	 *
	 * NO KEY HERE FIRES INSIDE A TEXT FIELD, A TEXTAREA OR AN EDITOR
	 * (`isTypingTarget`), which is also what leaves a rich-text editor its own
	 * Ctrl+K, and none fires while another dialog is open, so the grading
	 * console's and the review console's own keys and this never contend.
	 */
	import { goto } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import { isTypingTarget } from './keys';
	import {
		ICONS,
		isLegendKey,
		isPaletteChord,
		keysFor,
		shortcutLegend,
		type CommandEnv
	} from './commands';
	import { liveCommandIds, registerCommandHandler, runCommand } from './command-handlers';
	import {
		PALETTE_KIND_LABELS,
		paletteEntries,
		parsePaletteQuery,
		searchPalette,
		type PaletteEntry,
		type PaletteScope,
		type PaletteSources,
		type PaletteStudent
	} from './palette';
	import ShortcutLegend from './ShortcutLegend.svelte';
	import { recordRecentPick, type ClassroomPreferences } from '$lib/preferences/classroom';
	import type { PreferenceStore } from '$lib/preferences/store';
	import { reactivePreferences } from '$lib/preferences/context';

	let {
		sources,
		env,
		preferences = null,
		loadStudents = null
	}: {
		sources: PaletteSources;
		/** Where the palette is open, minus the live handler set, which it reads itself at open. */
		env: Omit<CommandEnv, 'handlers'>;
		/** Where recent picks are remembered (per device). Null remembers nothing. */
		preferences?: PreferenceStore<ClassroomPreferences> | null;
		/** A manager's roster for `@`. Null offers no people, which is every student's case. */
		loadStudents?: ((sectionId: string) => Promise<PaletteStudent[]>) | null;
	} = $props();

	type Mode = 'closed' | 'search' | 'keys';
	let mode = $state<Mode>('closed');
	let query = $state('');
	let active = $state(0);
	let dialogEl = $state<HTMLDialogElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLUListElement | null>(null);
	/* Plain, not $state: written when the dialog opens, read when it closes. */
	let returnFocus: HTMLElement | null = null;
	/** The live handlers as they stood when the dialog opened. */
	let handlerIds = $state<Set<string>>(new Set());
	/** The roster, per class, once asked for. */
	let students = $state<Record<string, PaletteStudent[]>>({});
	let platform = $state('');

	/* SSR-safe: the platform is read once in the browser, for the key labels. */
	$effect(() => {
		platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
	});

	const prefs = $derived(preferences ? reactivePreferences(preferences) : null);
	const recent = $derived(prefs?.current.search.recent ?? []);

	const fullEnv = $derived<CommandEnv>({ ...env, handlers: handlerIds });
	const entries = $derived(
		paletteEntries(
			{ ...sources, students: env.sectionId ? (students[env.sectionId] ?? null) : null },
			fullEnv
		)
	);
	const parsed = $derived(parsePaletteQuery(query));
	const results = $derived(searchPalette(query, entries, recent));
	const legendRows = $derived(shortcutLegend(fullEnv));
	const scopes = $derived<{ scope: PaletteScope; prefix: string; label: string }[]>([
		{ scope: 'items', prefix: '#', label: 'Items' },
		...(env.role === 'manager' && env.sectionId && loadStudents
			? [{ scope: 'students' as const, prefix: '@', label: 'Students' }]
			: []),
		{ scope: 'actions', prefix: '>', label: 'Actions' }
	]);

	/** Open the dialog in one of its two modes. Exported for the header's Search control. */
	export function open(next: 'search' | 'keys' = 'search') {
		if (mode !== 'closed') {
			mode = next;
			return;
		}
		const focused = document.activeElement;
		returnFocus = focused instanceof HTMLElement && focused !== document.body ? focused : null;
		handlerIds = liveCommandIds();
		query = '';
		active = 0;
		mode = next;
		// A manager's roster, asked for once per class and only when the palette
		// opens, never on page load: most opens are for an item.
		const sectionId = env.sectionId;
		if (next === 'search' && env.role === 'manager' && sectionId && loadStudents && !students[sectionId]) {
			const load = loadStudents;
			void load(sectionId).then(
				(rows) => (students = { ...students, [sectionId]: rows }),
				() => undefined
			);
		}
	}

	export function close() {
		if (mode === 'closed') return;
		mode = 'closed';
		// CLOSE THE NATIVE DIALOG BEFORE MOVING FOCUS: while it is open the page
		// is inert and focus() on anything behind it is refused silently (the
		// HallPass measurement).
		const el = dialogEl;
		if (el?.open) el.close();
		const back = returnFocus;
		returnFocus = null;
		if (back?.isConnected) back.focus();
	}

	/* The palette is itself a registered command target: the legend is a row. */
	$effect(() => registerCommandHandler('palette.shortcuts', () => open('keys')));

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		if (!el.open) el.showModal();
		const onClose = () => close();
		const onCancel = (e: Event) => {
			e.preventDefault();
			close();
		};
		const onPointerdown = (e: PointerEvent) => {
			if (e.target === el) close();
		};
		el.addEventListener('close', onClose);
		el.addEventListener('cancel', onCancel);
		el.addEventListener('pointerdown', onPointerdown);
		return () => {
			el.removeEventListener('close', onClose);
			el.removeEventListener('cancel', onCancel);
			el.removeEventListener('pointerdown', onPointerdown);
			if (el.open) el.close();
		};
	});

	/* Focus the field when the search mode is on screen: keyed on the ELEMENT. */
	$effect(() => {
		const input = inputEl;
		if (input && mode === 'search') untrack(() => input.focus());
	});

	/* A new query puts the highlight back on the best match. */
	$effect(() => {
		void query;
		active = 0;
	});

	function onWindowKey(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		const target = event.target as (HTMLElement & { isContentEditable?: boolean }) | null;
		if (target && isTypingTarget(target)) return;
		if (mode !== 'closed') return;
		if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return;
		if (isPaletteChord(event)) {
			event.preventDefault();
			open('search');
		} else if (isLegendKey(event)) {
			event.preventDefault();
			open('keys');
		} else if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
			if (runCommand('class.search')) event.preventDefault();
		}
	}

	async function activate(entry: PaletteEntry | undefined) {
		if (!entry) return;
		preferences?.set('search', { recent: recordRecentPick(recent, entry.key) });
		close();
		if (entry.run) {
			await tick();
			runCommand(entry.run.id, entry.run.arg);
		} else if (entry.href) {
			await goto(entry.href);
		}
	}

	function scrollActive() {
		void tick().then(() =>
			listEl
				?.querySelector<HTMLElement>(`[data-index="${active}"]`)
				?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
		);
	}

	function onInputKey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = Math.min(active + 1, Math.max(results.length - 1, 0));
			scrollActive();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = Math.max(active - 1, 0);
			scrollActive();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			void activate(results[active]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	}

	function onDialogKey(event: KeyboardEvent) {
		// Escape anywhere in the dialog closes it, and must not reach a
		// console's own window listener as "back to roster" after it has.
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	}

	function setScope(prefix: string) {
		const text = parsed.text;
		query = parsed.scope !== 'all' && query.trimStart().startsWith(prefix) ? text : `${prefix}${text}`;
		inputEl?.focus();
	}

	const listId = 'cmd-palette-list';
</script>

<svelte:window onkeydown={onWindowKey} />

{#if mode !== 'closed'}
	<dialog
		bind:this={dialogEl}
		class="cp-dialog"
		aria-label={mode === 'keys' ? 'Keyboard shortcuts' : 'Search and commands'}
		data-testid="command-palette"
		data-mode={mode}
		onkeydown={onDialogKey}
	>
		<div class="cp-panel">
			{#if mode === 'search'}
				<div class="cp-head">
					<svg class="cp-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.search} /></svg>
					<input
						bind:this={inputEl}
						bind:value={query}
						class="cp-input"
						type="text"
						role="combobox"
						aria-expanded="true"
						aria-controls={listId}
						aria-autocomplete="list"
						aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
						aria-label="Search items, units, classes and actions"
						placeholder="Search everything"
						autocomplete="off"
						spellcheck="false"
						data-testid="palette-input"
						onkeydown={onInputKey}
					/>
					<button type="button" class="cp-btn" data-testid="palette-close" onclick={close}>Close</button>
				</div>
				<div class="cp-scopes" role="group" aria-label="Search only">
					{#each scopes as s (s.scope)}
						<button
							type="button"
							class="cp-scope"
							aria-pressed={parsed.scope === s.scope}
							data-testid="palette-scope-{s.scope}"
							onclick={() => setScope(s.prefix)}
						>
							<kbd>{s.prefix}</kbd>{s.label}
						</button>
					{/each}
					<button
						type="button"
						class="cp-scope cp-keys-link"
						data-testid="palette-show-keys"
						onclick={() => (mode = 'keys')}
					>
						<kbd>?</kbd>Shortcuts
					</button>
				</div>
				<ul class="cp-list" id={listId} role="listbox" aria-label="Results" bind:this={listEl}>
					{#each results as entry, i (entry.key)}
						<li
							id="{listId}-{i}"
							role="option"
							tabindex="-1"
							aria-selected={i === active}
							class="cp-row"
							class:active={i === active}
							data-index={i}
							data-key={entry.key}
							data-kind={entry.kind}
							data-testid="palette-row"
							onclick={() => void activate(entry)}
							onkeydown={(e) => {
								if (e.key === 'Enter') void activate(entry);
							}}
							onpointermove={() => (active = i)}
						>
							<svg class="cp-row-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={entry.icon} /></svg>
							<span class="cp-row-text">
								<span class="cp-row-name">{entry.name}</span>
								{#if entry.detail}<span class="cp-row-detail">{entry.detail}</span>{/if}
							</span>
							{#if entry.keys}<kbd class="cp-row-keys">{keysFor(entry.keys, platform)}</kbd>{/if}
							<span class="cp-row-kind">{PALETTE_KIND_LABELS[entry.kind]}</span>
						</li>
					{:else}
						<li class="cp-none" role="presentation" data-testid="palette-none">No matches</li>
					{/each}
				</ul>
				<p class="cp-count" aria-live="polite" data-testid="palette-count">
					{results.length}
					{results.length === 1 ? 'result' : 'results'}
				</p>
			{:else}
				<div class="cp-head cp-head-keys">
					<h2 class="cp-title">Keyboard shortcuts</h2>
					<button type="button" class="cp-btn" data-testid="palette-back" onclick={() => (mode = 'search')}>Search</button>
					<button type="button" class="cp-btn" data-testid="palette-close" onclick={close}>Close</button>
				</div>
				<div class="cp-legend">
					<ShortcutLegend rows={legendRows} {platform} />
				</div>
			{/if}
		</div>
	</dialog>
{/if}

<style>
	.cp-dialog {
		/* The top layer, centred near the top so the list grows downward. */
		position: fixed;
		inset: 0;
		margin: max(6vh, 16px) auto auto;
		width: min(40rem, calc(100vw - 32px));
		max-height: min(34rem, calc(100dvh - 12vh));
		padding: 0;
		background: var(--surface-1);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		overflow: hidden;
	}
	.cp-dialog::backdrop {
		background: color-mix(in srgb, var(--surface-0) 72%, transparent);
	}
	.cp-panel {
		display: flex;
		flex-direction: column;
		max-height: inherit;
		min-height: 0;
	}
	.cp-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
	}
	.cp-glyph,
	.cp-row-glyph {
		flex: none;
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--text-2);
	}
	.cp-input {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 44px;
		padding: 0 var(--space-2);
		font: inherit;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text-1);
		background: transparent;
		border: 0;
		outline: none;
	}
	.cp-input::placeholder {
		color: var(--text-2);
		font-weight: 500;
	}
	.cp-head:focus-within {
		box-shadow: inset 0 -2px 0 var(--focus-ring);
	}
	.cp-btn {
		flex: none;
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
	.cp-btn:hover {
		border-color: var(--gold);
	}
	.cp-scopes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
	}
	.cp-scope {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0 var(--space-3);
		font: inherit;
		font-size: 0.9rem;
		color: var(--text-1);
		background: transparent;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		cursor: pointer;
	}
	.cp-scope[aria-pressed='true'] {
		border-color: var(--green);
		box-shadow: inset 0 -2px 0 var(--green);
	}
	.cp-keys-link {
		margin-left: auto;
	}
	.cp-scope kbd,
	.cp-row-keys {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.05rem 0.4rem;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.cp-list {
		list-style: none;
		margin: 0;
		padding: var(--space-1, 0.25rem);
		overflow-y: auto;
		min-height: 0;
		flex: 1 1 auto;
	}
	.cp-row {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--space-3);
		min-height: 48px;
		padding: 0.3rem var(--space-3);
		border-radius: var(--radius-card);
		cursor: pointer;
		border: 1px solid transparent;
	}
	/* The highlighted row is marked by an edge and a fill, never by colour alone. */
	.cp-row.active {
		background: var(--surface-2);
		border-color: var(--boundary);
		box-shadow: inset 3px 0 0 var(--green);
	}
	.cp-row-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cp-row-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cp-row-detail {
		font-size: 0.82rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cp-row-kind {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cp-none {
		padding: var(--space-4) var(--space-3);
		color: var(--text-2);
	}
	.cp-count {
		margin: 0;
		padding: var(--space-1, 0.25rem) var(--space-3) var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
		border-top: 1px solid var(--hairline);
	}
	.cp-head-keys {
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
	}
	.cp-title {
		flex: 1 1 auto;
		margin: 0;
		font-size: 1.05rem;
	}
	.cp-legend {
		padding: var(--space-3) var(--space-4) var(--space-4);
		overflow-y: auto;
		min-height: 0;
	}
	/* A phone: the shortcut chip gives way (a phone has no keys to press), the
	   kind word stays, because it is the row's one word saying what it is. */
	@media (max-width: 520px) {
		.cp-row {
			grid-template-columns: 20px minmax(0, 1fr) auto;
		}
		.cp-row-keys {
			display: none;
		}
		.cp-keys-link {
			margin-left: 0;
		}
	}
</style>
