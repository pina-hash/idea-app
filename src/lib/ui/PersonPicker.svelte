<script lang="ts">
	/**
	 * THE ONE PERSON PICKER (ledger 0470, from ledger 0455's tournament picker).
	 * A combobox over a directory the caller hands in: type a couple of letters
	 * of a name, arrow or click to pick. Tournaments and IdeaCAD sharing both
	 * mount this; a third surface that needs to pick people mounts it too,
	 * never a second picker.
	 *
	 * TWO WAYS A PICK LANDS (`after`):
	 *   fill   the box holds the picked person's `fill` (an address, for the
	 *          tournament rows whose own button sends it) and their name shows
	 *          beside it. Typing again un-picks.
	 *   clear  the pick is handed to `onpick` and the box empties with focus
	 *          kept, so several people are picked in a row (IdeaCAD sharing).
	 *
	 * A typed entry is never blocked: the box is an ordinary input, and a
	 * directory that is missing or refused leaves exactly that plain box.
	 * `suggest` asks the directory with an empty query when the box takes
	 * focus empty, which is how teammates appear before anybody types.
	 *
	 * THE SEARCH RUNS FROM THE INPUT HANDLER, NEVER FROM AN `$effect`: a
	 * debounce and a request counter, so a slow answer to "an" never replaces
	 * the answer to "ana".
	 *
	 * Colours come from `--pp-*` custom properties with the app's own tokens
	 * as fallbacks, so each room sets its look on a wrapper and the markup
	 * stays one.
	 */
	import { onDestroy } from 'svelte';
	import Avatar from '$lib/Avatar.svelte';
	import { firstPickable, PICKER_DEBOUNCE_MS, type PickerAnswer, type PickerPerson } from './person-picker';

	let {
		value = $bindable(''),
		search,
		ready,
		after = 'fill',
		suggest = false,
		placeholder = 'Name or school email',
		label,
		disabled = false,
		onpick = null,
		testid = 'person-picker',
		field = 'person',
		emptyText = 'Nobody by that name. A school email still works.',
		debounceMs = PICKER_DEBOUNCE_MS
	}: {
		/** The box's text. */
		value?: string;
		/** Null: no directory here, the box is a plain field. */
		search: ((q: string) => Promise<PickerAnswer>) | null;
		/** Whether the words in the box are enough to ask about (the directory's own floor). */
		ready: (q: string) => boolean;
		after?: 'fill' | 'clear';
		suggest?: boolean;
		placeholder?: string;
		/** The visually hidden name of the box, for a screen reader. */
		label: string;
		disabled?: boolean;
		/** Told the person picked (null when a `fill` box is typed into again). */
		onpick?: ((p: PickerPerson | null) => void) | null;
		testid?: string;
		/** The box's `data-field`, so a row keeps the name its callers already use. */
		field?: string;
		emptyText?: string;
		debounceMs?: number;
	} = $props();

	const uid = $props.id();
	const listId = `pp-${uid}`;

	let box: HTMLInputElement | undefined = $state();
	let results = $state<PickerPerson[]>([]);
	let open = $state(false);
	let highlighted = $state(-1);
	let searching = $state(false);
	let picked = $state<PickerPerson | null>(null);
	let unavailable = $state(false);

	let timer: ReturnType<typeof setTimeout> | null = null;
	let seq = 0;
	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	function quiet() {
		seq++;
		results = [];
		open = false;
		searching = false;
	}

	function onInput(event: Event) {
		if (timer) clearTimeout(timer);
		const q = (event.currentTarget as HTMLInputElement).value;
		// A list drawn for the words before this keystroke is not a list for
		// these: Enter must not pick from it while the new answer is on its way.
		highlighted = -1;
		if (picked) {
			picked = null;
			onpick?.(null);
		}
		if (!search || unavailable) return quiet();
		if (q.trim() === '' && suggest) {
			searching = true;
			timer = setTimeout(() => void ask(''), debounceMs);
			return;
		}
		if (!ready(q)) return quiet();
		searching = true;
		timer = setTimeout(() => void ask(q), debounceMs);
	}

	async function ask(q: string) {
		if (!search) return;
		const mine = ++seq;
		const answer = await search(q);
		if (mine !== seq) return;
		searching = false;
		if (!answer.ok) {
			results = [];
			open = false;
			if (answer.reason !== 'failed') unavailable = true;
			return;
		}
		results = answer.rows;
		highlighted = firstPickable(results);
		// An empty suggestion is no list at all; an empty search says so.
		open = q !== '' || results.length > 0;
	}

	function pick(p: PickerPerson) {
		if (timer) clearTimeout(timer);
		timer = null;
		seq++;
		searching = false;
		results = [];
		open = false;
		highlighted = -1;
		if (after === 'fill') {
			value = p.fill ?? p.name;
			picked = p;
			onpick?.(p);
			return;
		}
		value = '';
		onpick?.(p);
		box?.focus();
		if (suggest && search && !unavailable) void ask('');
	}

	function onFocus() {
		if (results.length) {
			open = true;
			return;
		}
		if (suggest && search && !unavailable && value.trim() === '') void ask('');
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			open = false;
			return;
		}
		if (!open && event.key === 'ArrowDown' && results.length > 0) {
			event.preventDefault();
			open = true;
			return;
		}
		if (!open || results.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = (highlighted + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = (highlighted - 1 + results.length) % results.length;
		} else if (event.key === 'Enter' && highlighted >= 0) {
			event.preventDefault();
			pick(results[highlighted]);
		}
	}
</script>

<div class="pp" data-testid={testid}>
	<input
		bind:this={box}
		class="pp-box"
		type="text"
		role="combobox"
		aria-label={label}
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-activedescendant={open && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
		autocomplete="off"
		spellcheck="false"
		{placeholder}
		{disabled}
		bind:value
		oninput={onInput}
		onkeydown={onKeydown}
		onblur={() => setTimeout(() => (open = false), 150)}
		onfocus={onFocus}
		data-field={field}
	/>
	{#if picked}
		<span class="pp-chosen" data-testid="person-picked">{picked.name}</span>
	{:else if searching}
		<span class="pp-state" aria-live="polite">Looking</span>
	{/if}
	{#if open}
		<ul class="pp-list" id={listId} role="listbox" aria-label={label}>
			{#if results.length === 0}
				<li class="pp-empty" role="option" aria-disabled="true" aria-selected="false">{emptyText}</li>
			{/if}
			{#each results as p, i (p.key)}
				<li
					id={`${listId}-${i}`}
					role="option"
					aria-selected={i === highlighted}
					class="pp-option"
					class:on={i === highlighted}
					class:muted={p.muted}
					class:pictured={p.picture !== undefined}
					data-testid="person-option"
					data-key={p.key}
					onmousedown={(e) => {
						e.preventDefault();
						pick(p);
					}}
					onmouseenter={() => (highlighted = i)}
				>
					{#if p.picture !== undefined}
						<Avatar subject={p.picture} tintKey={p.key} size={32} />
					{/if}
					<span class="pp-words">
						<span class="pp-name">{p.name}</span>
						{#if p.email}<span class="pp-email" data-testid="person-email">{p.email}</span>{/if}
						{#if p.detail}<span class="pp-detail">{p.detail}</span>{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.pp {
		position: relative;
		flex: 1;
		min-width: 11rem;
		display: flex;
		align-items: center;
	}
	.pp-box {
		width: 100%;
		min-height: 44px;
		box-sizing: border-box;
		background: var(--pp-box-bg, var(--bg0));
		border: 1px solid var(--pp-box-line, var(--line));
		border-radius: var(--pp-box-radius, 4px);
		color: var(--pp-box-ink, var(--white));
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.4rem 0.6rem;
	}
	.pp-box:focus-visible {
		outline: 2px solid var(--pp-accent, var(--green));
		outline-offset: 1px;
	}
	.pp-chosen,
	.pp-state {
		position: absolute;
		right: 0.6rem;
		top: 50%;
		transform: translateY(-50%);
		max-width: 45%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--pp-ink-dim, var(--dim));
	}
	.pp-chosen {
		color: var(--pp-accent, var(--green));
	}
	.pp-list {
		position: absolute;
		z-index: 5;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		max-height: 18rem;
		overflow-y: auto;
		background: var(--pp-panel, var(--bg1));
		border: 1px solid var(--pp-panel-line, var(--line));
		border-radius: 6px;
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
	}
	.pp-option,
	.pp-empty {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.45rem 0.6rem;
		min-height: 44px;
		box-sizing: border-box;
		justify-content: center;
		border-radius: 4px;
	}
	.pp-option {
		cursor: pointer;
	}
	.pp-option.pictured {
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 0.6rem;
	}
	.pp-words {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.pp-option.on {
		background: var(--pp-hover, color-mix(in srgb, var(--green) 14%, transparent));
	}
	.pp-name {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--pp-ink, var(--white));
		overflow-wrap: anywhere;
	}
	.pp-email {
		font-family: var(--font-display);
		font-size: 0.9rem;
		color: var(--pp-ink-dim, var(--dim));
		overflow-wrap: anywhere;
	}
	.pp-detail,
	.pp-empty {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--pp-ink-dim, var(--dim));
		overflow-wrap: anywhere;
	}
	.pp-option.muted .pp-name {
		color: var(--pp-ink-dim, var(--dim));
	}
</style>
