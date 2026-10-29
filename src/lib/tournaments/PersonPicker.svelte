<script lang="ts">
	/**
	 * ONE PERSON, PICKED FROM A LIST OR TYPED (ledger 0455, report c6830880),
	 * NOW DRAWN BY THE ONE SHARED PICKER (ledger 0470, `$lib/ui/PersonPicker`).
	 * This file keeps the props the host console and the entry panel already
	 * pass and maps the host console's directory (`people.ts`) onto the shared
	 * picker's rows, so a tournament box behaves exactly as it did: two letters
	 * of a name or a school address, a picked person's address in the box, a
	 * typed address passed through untouched, the tournament's own colours.
	 */
	import SharedPicker from '$lib/ui/PersonPicker.svelte';
	import type { PickerAnswer, PickerPerson } from '$lib/ui/person-picker';
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

	/** The last answer's people by address, so a pick hands back the tournament's own row. */
	let byKey = new Map<string, PersonResult>();

	const ready = (q: string) => searchable(q) && !looksLikeEmail(q);

	const directory = $derived(
		search
			? async (q: string): Promise<PickerAnswer> => {
					const answer = await search(q);
					if (!answer.ok) return answer;
					byKey = new Map(answer.rows.map((p) => [p.email, p]));
					return {
						ok: true,
						rows: answer.rows.map(
							(p): PickerPerson => ({ key: p.email, name: p.name, detail: personDetail(p), muted: p.inTournament, fill: p.email })
						)
					};
				}
			: null
	);
</script>

<div class="tnm-picker">
	<SharedPicker
		bind:value
		search={directory}
		{ready}
		after="fill"
		{placeholder}
		{label}
		{disabled}
		{testid}
		{field}
		debounceMs={PEOPLE_DEBOUNCE_MS}
		onpick={(p) => onpick?.(p ? (byKey.get(p.key) ?? null) : null)}
	/>
</div>

<style>
	/* The host console's own boxes and panels, handed to the shared picker. */
	.tnm-picker {
		display: contents;
		--pp-box-bg: var(--bg0);
		--pp-box-line: var(--line);
		--pp-box-ink: var(--white);
		--pp-accent: var(--tnm-accent);
		--pp-panel: var(--tnm-panel);
		--pp-panel-line: var(--tnm-line-strong);
		--pp-hover: var(--tnm-accent-wash);
		--pp-ink: var(--tnm-ink);
		--pp-ink-dim: var(--tnm-ink-dim);
	}
</style>
