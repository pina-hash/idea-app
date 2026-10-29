<!--
  SHARE ONE MODEL WITH PEOPLE (ledger 0470, report 155bba3d: "sharing sucks.
  theres no confirmation and typing manually sucks. just pickl and share.
  simple. smooth experience. and ensure many users per file").

  Three parts, top to bottom:
    1. WHO HAS IT. Everyone the model is shared with, by name and picture,
       each with Can view or Can edit changeable in place and a Remove.
    2. PICK PEOPLE. The one shared picker (`$lib/ui/PersonPicker`), teammates
       suggested the moment the box takes focus, then classmates and the
       rest of Bosco Tech by name. Each pick joins a list with its own
       Can view or Can edit; a full school email typed by hand joins it too.
    3. ONE SHARE BUTTON for the whole list, one call (0325).

  EVERY CHANGE IS CONFIRMED IN WORDS, WITH UNDO FOR `UNDO_MS`. The sentence
  comes from what the database says changed (`outcomeSentence`), never from
  what was asked, and Undo hands the database's own inverse list back to the
  same function. A refused person stays in the list with the refusal beside
  them; everyone who landed leaves it (a partial failure keeps what did not
  land, ui-standards).

  THE PANEL HOLDS NO RULE. Who can be found and who may share are 0325's;
  the panel draws what it is answered and says what it is refused.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Avatar from '$lib/Avatar.svelte';
	import type { AvatarSubject } from '$lib/avatars';
	import PersonPicker from '$lib/ui/PersonPicker.svelte';
	import type { PickerAnswer, PickerPerson } from '$lib/ui/person-picker';
	import {
		looksLikeAddress,
		outcomeSentence,
		PICK_HINT,
		PICKER_EMPTY,
		pickerRow,
		pictureOf,
		SHARE_ROLE_WORDS,
		shareSearchable,
		sharedCountSentence,
		SHARING_UNAVAILABLE,
		UNDO_MS,
		UNDONE_SENTENCE,
		type AccessList,
		type ShareChange,
		type ShareOutcome,
		type SharePerson,
		type ShareRole
	} from './share';

	let { documentId, title, api }: {
		documentId: string;
		title: string;
		api: {
			access(id: string): Promise<AccessList>;
			people(id: string, query: string): Promise<SharePerson[]>;
			setAccess(id: string, changes: ShareChange[]): Promise<ShareOutcome>;
		};
	} = $props();

	interface Staged { id: string; key: string | null; email: string | null; name: string; picture: AvatarSubject | null; detail: string; role: ShareRole; refusal: string }

	let list = $state<AccessList | null>(null);
	let loadRefusal = $state('');
	let staged = $state<Staged[]>([]);
	let box = $state('');
	let busy = $state(false);
	let notice = $state('');
	let undo = $state<ShareChange[]>([]);
	let problem = $state('');
	let undoTimer: ReturnType<typeof setTimeout> | null = null;
	let counter = 0;

	const count = $derived(list?.count ?? 0);
	const canChange = $derived(list?.canChange === true);

	onMount(() => { void load(); });
	onDestroy(() => { if (undoTimer) clearTimeout(undoTimer); });

	async function load() {
		try { list = await api.access(documentId); loadRefusal = ''; }
		catch (err) { loadRefusal = err instanceof Error ? err.message : String(err); }
	}

	/** The picker's directory: the database's rows, less anybody already in the list below the box. */
	async function directory(q: string): Promise<PickerAnswer> {
		try {
			const rows = await api.people(documentId, q.trim());
			const waiting = new Set(staged.map((s) => s.key));
			return { ok: true, rows: rows.filter((p) => !waiting.has(p.key)).map(pickerRow) };
		} catch (err) {
			return { ok: false, reason: err instanceof Error && err.message === SHARING_UNAVAILABLE ? 'unavailable' : 'failed' };
		}
	}

	function stage(p: PickerPerson | null) {
		if (!p || staged.some((s) => s.key === p.key)) return;
		problem = '';
		staged = [...staged, { id: `s${++counter}`, key: p.key, email: null, name: p.name, picture: p.picture ?? null, detail: p.detail ?? '', role: 'viewer', refusal: '' }];
	}

	function stageTyped() {
		const typed = box.trim();
		if (!looksLikeAddress(typed)) return false;
		const email = typed.toLowerCase();
		if (!staged.some((s) => s.email === email)) {
			staged = [...staged, { id: `s${++counter}`, key: null, email, name: email, picture: null, detail: 'Typed address', role: 'viewer', refusal: '' }];
		}
		box = '';
		return true;
	}

	function confirm(sentence: string, inverse: ShareChange[]) {
		if (undoTimer) clearTimeout(undoTimer);
		notice = sentence;
		undo = inverse;
		undoTimer = inverse.length ? setTimeout(() => { undo = []; undoTimer = null; }, UNDO_MS) : null;
	}

	async function send(changes: ShareChange[], after?: (out: ShareOutcome) => void) {
		busy = true; problem = '';
		try {
			const out = await api.setAccess(documentId, changes);
			list = out.access;
			after?.(out);
			confirm(outcomeSentence(out), out.undo);
			// A change made on a row of the list has no staged row to carry its refusal, so it is said here.
			if (!after) problem = out.results.flatMap((r) => (r.ok ? [] : [r.reason])).join(' ');
			return out;
		} catch (err) {
			problem = err instanceof Error ? err.message : String(err);
			return null;
		} finally { busy = false; }
	}

	async function shareStaged(event: SubmitEvent) {
		event.preventDefault();
		stageTyped();
		if (staged.length === 0) { problem = 'Pick at least one person to share with.'; return; }
		const sending = staged;
		await send(sending.map((s) => (s.key ? { key: s.key, role: s.role } : { email: s.email!, role: s.role })), (out) => {
			const refusedAt = new Map(out.results.filter((r) => !r.ok).map((r) => [r.index, r.ok ? '' : r.reason]));
			staged = sending.flatMap((s, i) => (refusedAt.has(i) ? [{ ...s, refusal: refusedAt.get(i)! }] : []));
		});
	}

	async function undoLast() {
		const inverse = undo;
		if (!inverse.length) return;
		if (undoTimer) clearTimeout(undoTimer);
		undo = []; undoTimer = null;
		const out = await send(inverse);
		if (out) confirm(out.refused ? outcomeSentence(out) : UNDONE_SENTENCE, []);
	}

	function onBoxKey(event: KeyboardEvent) {
		// Enter on a typed address adds it to the list instead of sharing at once.
		if (event.key === 'Enter' && looksLikeAddress(box)) { event.preventDefault(); stageTyped(); }
	}
</script>

<section class="share-panel" aria-label={`Share ${title}`} data-testid="share-panel">
	{#if loadRefusal}
		<p class="refusal" role="alert" data-testid="share-unavailable">{loadRefusal}</p>
	{:else if list === null}
		<p class="note">Loading who has this model.</p>
	{:else}
		<header class="head">
			<h4 data-testid="share-count">{sharedCountSentence(count)}</h4>
		</header>
		{#if list.people.length}
			<ul class="people" aria-label="People with access" data-testid="share-access-list">
				{#each list.people as person (person.key)}
					<li class="person" data-testid="share-access-row" data-key={person.key}>
						<Avatar subject={pictureOf(person)} tintKey={person.key} size={32} />
						<span class="who"><span class="name">{person.name}</span>{#if person.staff}<span class="chip mine">Staff</span>{/if}</span>
						{#if canChange}
							<label class="role-field"><span class="sr">Access for {person.name}</span>
								<select value={person.role} disabled={busy} data-testid="share-role" onchange={(e) => void send([{ key: person.key, role: (e.currentTarget as HTMLSelectElement).value as ShareRole }])}>
									<option value="viewer">{SHARE_ROLE_WORDS.viewer}</option>
									<option value="editor">{SHARE_ROLE_WORDS.editor}</option>
								</select>
							</label>
							<button type="button" class="remove" disabled={busy} data-testid="share-remove" aria-label={`Remove ${person.name}`} onclick={() => void send([{ key: person.key, role: 'none' }])}>Remove</button>
						{:else}
							<span class="chip pass">{SHARE_ROLE_WORDS[person.role]}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if canChange}
			<form class="add" onsubmit={(e) => void shareStaged(e)} data-testid="share-form">
				<p class="note">{PICK_HINT}</p>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="pick" onkeydown={onBoxKey}>
					<PersonPicker
						bind:value={box}
						search={directory}
						ready={shareSearchable}
						after="clear"
						suggest
						label="Find people by name, or type a school email"
						placeholder="Name or school email"
						emptyText={PICKER_EMPTY}
						testid="share-picker"
						onpick={stage}
					/>
				</div>
				{#if staged.length}
					<ul class="people staged" aria-label="People to share with" data-testid="share-staged">
						{#each staged as s (s.id)}
							<li class="person" class:refused={s.refusal !== ''} data-testid="share-staged-row">
								{#if s.picture}<Avatar subject={s.picture} tintKey={s.key ?? s.email} size={32} />{:else}<span class="typed" aria-hidden="true">@</span>{/if}
								<span class="who"><span class="name">{s.name}</span><span class="detail">{s.detail}</span>{#if s.refusal}<span class="why" role="alert">{s.refusal}</span>{/if}</span>
								<label class="role-field"><span class="sr">Access for {s.name}</span>
									<select value={s.role} disabled={busy} data-testid="share-staged-role" onchange={(e) => { const role = (e.currentTarget as HTMLSelectElement).value as ShareRole; staged = staged.map((x) => (x.id === s.id ? { ...x, role } : x)); }}>
										<option value="viewer">{SHARE_ROLE_WORDS.viewer}</option>
										<option value="editor">{SHARE_ROLE_WORDS.editor}</option>
									</select>
								</label>
								<button type="button" class="remove" disabled={busy} aria-label={`Take ${s.name} off the list`} onclick={() => (staged = staged.filter((x) => x.id !== s.id))}>Take off</button>
							</li>
						{/each}
					</ul>
				{/if}
				<button class="accept share" disabled={busy || (staged.length === 0 && !looksLikeAddress(box))} data-testid="share-submit">
					{busy ? 'Sharing' : staged.length > 1 ? `Share with ${staged.length} people` : 'Share'}
				</button>
			</form>
		{/if}
	{/if}
	<div class="confirm" role="status" aria-live="polite" data-testid="share-notice">
		{#if notice}
			<p class="said"><span class="chip pass">Done</span> {notice}</p>
			{#if undo.length}<button type="button" class="undo" disabled={busy} data-testid="share-undo" onclick={() => void undoLast()}>Undo</button>{/if}
		{/if}
	</div>
	{#if problem}<p class="refusal" role="alert" data-testid="share-problem">{problem}</p>{/if}
</section>

<style>
	.share-panel { container-type: inline-size; display: grid; gap: 0.6rem; padding: 0.6rem; border: 1px solid var(--ic-line); border-radius: var(--ic-radius); min-width: 0; }
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
	h4 { margin: 0; font: 600 var(--ic-fs-ui) / 1.3 var(--font-display); color: var(--ic-text-1); }
	.note { margin: 0; font: var(--ic-fs-prose) / 1.4 var(--font-display); color: var(--ic-text-2); }
	.people { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
	.person { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto auto; align-items: center; gap: 0.5rem; min-width: 0; padding: 0.3rem 0; border-top: 1px solid var(--ic-line); }
	.person:first-child { border-top: 0; }
	.person.refused { border-left: var(--ic-rail) solid var(--ic-warn); padding-left: 0.4rem; }
	.who { display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem 0.4rem; min-width: 0; }
	.name { font: 600 var(--ic-fs-ui) / 1.25 var(--font-display); color: var(--ic-text-1); overflow-wrap: anywhere; min-width: 0; }
	.detail { flex-basis: 100%; font: var(--ic-fs-label) / 1.3 var(--font-mono); color: var(--ic-text-2); }
	.why { flex-basis: 100%; font: var(--ic-fs-prose) / 1.35 var(--font-display); color: var(--ic-warn); }
	.typed { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--ic-edge); border-radius: 50%; font: var(--ic-fs-label) var(--font-mono); color: var(--ic-text-2); }
	.role-field { display: block; min-width: 0; }
	.role-field select { min-height: 44px; width: auto; max-width: 9.5rem; padding: 0 0.4rem; text-transform: none; letter-spacing: 0; }
	.remove { min-height: 44px; }
	.add { display: grid; gap: 0.5rem; min-width: 0; }
	.pick { display: flex; min-width: 0; --pp-box-bg: var(--ic-field); --pp-box-line: var(--ic-edge); --pp-box-ink: var(--ic-text-1); --pp-box-radius: var(--ic-radius); --pp-accent: var(--ic-accent); --pp-panel: var(--ic-head); --pp-panel-line: var(--ic-edge); --pp-hover: var(--ic-tint); --pp-ink: var(--ic-text-1); --pp-ink-dim: var(--ic-text-2); }
	.share { justify-self: start; min-height: 44px; }
	.confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-height: 0; }
	.confirm:empty { display: none; }
	.said { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; font: var(--ic-fs-prose) / 1.4 var(--font-display); color: var(--ic-text-1); }
	.undo { min-height: 44px; }
	.refusal { margin: 0; padding-left: 0.5rem; border-left: var(--ic-rail) solid var(--ic-warn); font: var(--ic-fs-prose) / 1.4 var(--font-display); color: var(--ic-text-1); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	/* A narrow card (a phone, or a tight grid column): the access control drops under the name rather than squeezing it. */
	@container (max-width: 340px) {
		.person { grid-template-columns: 32px minmax(0, 1fr); }
		.person .role-field, .person .remove { grid-column: 2; justify-self: start; }
	}
</style>
