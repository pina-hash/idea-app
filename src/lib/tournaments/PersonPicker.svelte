<script lang="ts">
	/**
	 * ONE PERSON, PICKED FROM A LIST OR TYPED (ledger 0455, report c6830880).
	 * A combobox over the host console's directory (`people.ts`): type two
	 * letters of a name or a school address, arrow or click to pick, and the
	 * box holds that person's address for the row's own button. A typed
	 * address is still accepted, so nothing a host did before stops working,
	 * and a directory that is missing or refused leaves the plain box.
	 *
	 * THE SEARCH RUNS FROM THE INPUT HANDLER, NEVER FROM AN `$effect`: a
	 * debounce and a request counter, so a slow answer to "an" never replaces
	 * the answer to "ana" (the Armory picker's shape and its reason).
	 */
	import { onDestroy } from 'svelte';
	import {
		looksLikeEmail,
		PEOPLE_DEBOUNCE_MS,
		personDetail,
		searchable,
		type PeopleAnswer,
		type PersonResult
	} from './people';

	let {
		value = $bindable(''),
		search,
		placeholder = 'Name or school email',
		label,
		disabled = false,
		onpick = null,
		testid = 'person-picker',
		field = 'person'
	}: {
		/** The address the row will send: a pick fills it, typing edits it. */
		value?: string;
		/** Null: no directory here, the box is a plain address field. */
		search: ((q: string) => Promise<PeopleAnswer>) | null;
		placeholder?: string;
		/** The visually hidden name of the box, for a screen reader. */
		label: string;
		disabled?: boolean;
		/** Told the person picked (or null when the box was typed into). */
		onpick?: ((p: PersonResult | null) => void) | null;
		testid?: string;
		/** The box's `data-field`, so a row keeps the name its callers already use. */
		field?: string;
	} = $props();

	const uid = $props.id();
	const listId = `tnm-people-${uid}`;

	let results = $state<PersonResult[]>([]);
	let open = $state(false);
	let highlighted = $state(-1);
	let searching = $state(false);
	let picked = $state<PersonResult | null>(null);
	let unavailable = $state(false);

	let timer: ReturnType<typeof setTimeout> | null = null;
	let seq = 0;
	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	function onInput(event: Event) {
		if (timer) clearTimeout(timer);
		const q = (event.currentTarget as HTMLInputElement).value;
		if (picked) {
			picked = null;
			onpick?.(null);
		}
		if (!search || unavailable || !searchable(q) || looksLikeEmail(q)) {
			seq++;
			results = [];
			open = false;
			searching = false;
			return;
		}
		searching = true;
		timer = setTimeout(() => void ask(q), PEOPLE_DEBOUNCE_MS);
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
		const first = results.findIndex((p) => !p.inTournament);
		highlighted = first >= 0 ? first : results.length ? 0 : -1;
		open = true;
	}

	function pick(p: PersonResult) {
		if (timer) clearTimeout(timer);
		timer = null;
		seq++;
		searching = false;
		value = p.email;
		picked = p;
		results = [];
		open = false;
		highlighted = -1;
		onpick?.(p);
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

<div class="tnm-picker" data-testid={testid}>
	<input
		class="tnm-picker-box"
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
		onfocus={() => {
			if (results.length) open = true;
		}}
		data-field={field}
	/>
	{#if picked}
		<span class="tnm-picker-chosen" data-testid="person-picked">{picked.name}</span>
	{:else if searching}
		<span class="tnm-picker-state" aria-live="polite">Looking</span>
	{/if}
	{#if open}
		<ul class="tnm-picker-list" id={listId} role="listbox" aria-label={label}>
			{#if results.length === 0}
				<li class="tnm-picker-empty" role="option" aria-disabled="true" aria-selected="false">
					Nobody by that name. A school email still works.
				</li>
			{/if}
			{#each results as p, i (p.email)}
				<li
					id={`${listId}-${i}`}
					role="option"
					aria-selected={i === highlighted}
					class="tnm-picker-option"
					class:on={i === highlighted}
					class:entered={p.inTournament}
					data-testid="person-option"
					onmousedown={(e) => {
						e.preventDefault();
						pick(p);
					}}
					onmouseenter={() => (highlighted = i)}
				>
					<span class="tnm-picker-name">{p.name}</span>
					<span class="tnm-picker-detail">{personDetail(p)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tnm-picker {
		position: relative;
		flex: 1;
		min-width: 11rem;
		display: flex;
		align-items: center;
	}
	.tnm-picker-box {
		width: 100%;
		min-height: 44px;
		box-sizing: border-box;
		/* The host console's own boxes (its `input[type='text']` rule), so a
		   picker reads as the field it replaced. */
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.4rem 0.6rem;
	}
	.tnm-picker-box:focus-visible {
		outline: 2px solid var(--tnm-accent);
		outline-offset: 1px;
	}
	.tnm-picker-chosen,
	.tnm-picker-state {
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
		color: var(--tnm-ink-dim);
	}
	.tnm-picker-chosen {
		color: var(--tnm-accent);
	}
	.tnm-picker-list {
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
		background: var(--tnm-panel);
		border: 1px solid var(--tnm-line-strong);
		border-radius: 6px;
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
	}
	.tnm-picker-option,
	.tnm-picker-empty {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.45rem 0.6rem;
		min-height: 44px;
		box-sizing: border-box;
		justify-content: center;
		border-radius: 4px;
	}
	.tnm-picker-option {
		cursor: pointer;
	}
	.tnm-picker-option.on {
		background: var(--tnm-accent-wash);
	}
	.tnm-picker-name {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--tnm-ink);
	}
	.tnm-picker-detail,
	.tnm-picker-empty {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--tnm-ink-dim);
		overflow-wrap: anywhere;
	}
	.tnm-picker-option.entered .tnm-picker-name {
		color: var(--tnm-ink-dim);
	}
</style>
