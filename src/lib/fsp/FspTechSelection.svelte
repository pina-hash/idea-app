<script lang="ts">
	import { onMount } from 'svelte';
	import { FSP_TECHS, fspTechById, type FspTechId } from './techs';
	import { postSelection, type FspPayload, type FspSelection } from './client';

	/**
	 * The FSP tech-ranking tool UI + save orchestration, factored out of the
	 * route so the dev harness can mount the EXACT same interaction with a mock
	 * signed-in student and an injected save primitive (no real OAuth / network).
	 *
	 * The caller (the real route) does the sign-in gate and the prefill GET, then
	 * hands us `email` + `initial`. We own: the ordered picker (up to 4, no
	 * duplicates, removable and reorderable by drag or by up/down buttons), an
	 * 800ms debounce, retry-with-backoff, the persistent saving/saved/error
	 * indicator, a sendBeacon flush on page hide, and a native <form> fallback
	 * that works with JS disabled.
	 *
	 * A ranking autosaves as soon as a name is entered and AT LEAST ONE pathway
	 * is picked — a full 4-pick ranking is never required to save. A student who
	 * is only considering two options can rank just those two and it persists;
	 * they can add more later. See `readyToSave` below (deliberately not called
	 * "complete": a partial ranking is a valid, saved state, not an incomplete
	 * one).
	 */

	interface Props {
		/** Signed-in, domain-verified email (the upsert key). */
		email: string;
		/** Existing selection to prefill, or null for a first-time student. */
		initial?: FspSelection | null;
		/** Apps Script /exec URL, or null when the placeholder env var is unset. */
		execUrl: string | null;
		/** Single-attempt save primitive; defaults to the real POST. Injected by
		 *  the harness to simulate latency and failures. Must throw on failure. */
		saveOnce?: (payload: FspPayload) => Promise<void>;
		/** Where the "See how staff view this" link points. */
		previewHref?: string;
	}

	let {
		email,
		initial = null,
		execUrl,
		saveOnce,
		previewHref = '/fsp-tech-selection/preview'
	}: Props = $props();

	const DEBOUNCE_MS = 800;
	const MAX_ATTEMPTS = 5;

	let lastName = $state(initial?.lastName ?? '');
	let firstName = $state(initial?.firstName ?? '');
	let studentId = $state(initial?.studentId ?? '');
	// Only keep valid, de-duplicated tech ids from the prefill.
	let choices = $state<FspTechId[]>(
		(initial?.choices ?? []).filter(
			(c, i, a): c is FspTechId => !!fspTechById(c) && a.indexOf(c) === i
		) as FspTechId[]
	);

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
	let status = $state<SaveStatus>('idle');
	let errorDetail = $state('');
	let mounted = $state(false);

	let debTimer: ReturnType<typeof setTimeout> | null = null;
	let inflight = false;
	let pendingChange = false;
	// Serialized payload most recently confirmed saved (baseline = the prefill).
	let lastSavedSerial = '';

	const namesReady = $derived(lastName.trim().length > 0 && firstName.trim().length > 0);
	const hasPicks = $derived(choices.length > 0);
	// A ranking is saveable once a name is entered and at least one pathway is
	// picked; it does not need to reach 4. See the header note above.
	const readyToSave = $derived(namesReady && hasPicks);
	const availableCount = $derived(FSP_TECHS.length - choices.length);

	// Persistent "N of 4 ranked" indicator, separate from the saving/saved/error
	// pill: it always shows the count, regardless of save status. The count
	// itself is always live off `choices`. `pickTouched` becomes true on the
	// first client-side add/remove; until then, for a returning student, we
	// prefer the server's `complete` verdict from the GET prefill (rather than
	// recomputing it ourselves) for the very first paint, as requested.
	// Afterward it always tracks the live `choices` array.
	let pickTouched = $state(false);
	const rankedCount = $derived(choices.length);
	const isComplete = $derived(
		!pickTouched && initial?.complete !== undefined ? initial.complete : rankedCount >= 4
	);

	let dragIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function snapshot(): FspPayload {
		return {
			email,
			lastName: lastName.trim(),
			firstName: firstName.trim(),
			studentId: studentId.trim(),
			choices: [...choices]
		};
	}

	const serial = $derived(readyToSave ? JSON.stringify(snapshot()) : '');

	// Baseline: if the prefill is already a complete, on-file selection, treat it
	// as saved so we do not immediately re-POST an unchanged row on load.
	$effect(() => {
		if (initial && serial && lastSavedSerial === '') {
			lastSavedSerial = serial;
			status = 'saved';
		}
	});

	const rankOf = (id: FspTechId) => {
		const i = choices.indexOf(id);
		return i === -1 ? 0 : i + 1;
	};

	function toggleTech(id: FspTechId) {
		pickTouched = true;
		const i = choices.indexOf(id);
		if (i !== -1) {
			choices = choices.filter((c) => c !== id); // remove (renumbers the rest)
		} else if (choices.length < 4) {
			choices = [...choices, id]; // append as the next-lowest choice
		}
		// duplicates are impossible by construction (append only when absent)
	}

	function moveChoice(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= choices.length) return;
		const next = [...choices];
		[next[i], next[j]] = [next[j], next[i]];
		choices = next;
	}

	function removeAt(i: number) {
		pickTouched = true;
		choices = choices.filter((_, k) => k !== i);
	}

	function reorder(from: number, to: number) {
		if (from === to || from < 0 || from >= choices.length || to < 0 || to >= choices.length) return;
		const next = [...choices];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		choices = next;
	}

	// Drag-to-reorder (mouse/touch pointer path). The up/down buttons stay the
	// primary keyboard/screen-reader-accessible way to reorder; drag is an
	// additional, not a replacement, interaction.
	function onDragStart(e: DragEvent, index: number) {
		dragIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}
	function onDragEnter(index: number) {
		if (dragIndex === null || index >= choices.length) return;
		dragOverIndex = index;
	}
	function onDragOver(e: DragEvent) {
		e.preventDefault(); // required to allow a drop
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}
	function onDrop(e: DragEvent, index: number) {
		e.preventDefault();
		const from = dragIndex;
		dragIndex = null;
		dragOverIndex = null;
		if (from !== null) reorder(from, index);
	}
	function onDragEnd() {
		dragIndex = null;
		dragOverIndex = null;
	}

	function backoffMs(attempt: number) {
		return Math.min(DEBOUNCE_MS * 2 ** (attempt - 1), 8000);
	}
	const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

	function doSaveOnce(payload: FspPayload): Promise<void> {
		if (saveOnce) return saveOnce(payload);
		if (!execUrl) return Promise.reject(new Error('not-configured'));
		return postSelection(execUrl, payload);
	}

	/**
	 * Persist the CURRENT state (read fresh each attempt, so retries and any
	 * in-flight coalescing always send the latest = last-write-wins). Retries
	 * with exponential backoff; after MAX_ATTEMPTS surfaces a visible error with
	 * a manual Retry, never a silent failure. A change arriving mid-save is
	 * coalesced into one more run when the current one settles.
	 */
	async function persist() {
		if (!readyToSave) return;
		if (!saveOnce && !execUrl) {
			status = 'error';
			errorDetail = 'Saving is not configured yet (endpoint URL not set).';
			return;
		}
		if (inflight) {
			pendingChange = true;
			return;
		}
		inflight = true;
		status = 'saving';
		errorDetail = '';

		let saved = false;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const payload = snapshot();
			const s = JSON.stringify(payload);
			try {
				await doSaveOnce(payload);
				lastSavedSerial = s;
				status = 'saved';
				errorDetail = '';
				saved = true;
				break;
			} catch (err) {
				if (attempt < MAX_ATTEMPTS) {
					status = 'saving';
					errorDetail = `Retrying (attempt ${attempt + 1} of ${MAX_ATTEMPTS})…`;
					await wait(backoffMs(attempt));
				} else {
					status = 'error';
					errorDetail =
						err instanceof Error && err.message === 'not-configured'
							? 'Saving is not configured yet (endpoint URL not set).'
							: 'Could not save your ranking. Tap Retry, or just leave this page open.';
				}
			}
		}

		inflight = false;
		pendingChange = false;
		// If a newer edit landed mid-save, flush that latest state (last-write-wins).
		// Only when it actually differs from what saved, so we never re-POST an
		// identical row. On failure we do NOT loop here: the debounce effect (and
		// the manual Retry) re-drive the slow background retry instead.
		if (saved && readyToSave && serial !== lastSavedSerial) {
			void persist();
		}
	}

	// Debounced auto-save: any change to a saveable selection (name entered,
	// at least 1 pick, need not reach 4) schedules a save.
	$effect(() => {
		const s = serial;
		if (!s || s === lastSavedSerial) return;
		if (status !== 'error') status = 'saving';
		if (debTimer) clearTimeout(debTimer);
		debTimer = setTimeout(() => {
			debTimer = null;
			void persist();
		}, DEBOUNCE_MS);
		return () => {
			if (debTimer) clearTimeout(debTimer);
		};
	});

	function saveNow() {
		if (debTimer) {
			clearTimeout(debTimer);
			debTimer = null;
		}
		void persist();
	}

	function retry() {
		errorDetail = '';
		saveNow();
	}

	/** Native <form> submit (JS path): never navigate away, just save now. */
	function onFormSubmit(e: SubmitEvent) {
		e.preventDefault();
		saveNow();
	}

	// Best-effort durability net: if the tab is hidden/closed with unsaved
	// changes, fire one sendBeacon so the latest state still lands.
	function flushBeacon() {
		if (!execUrl || saveOnce) return;
		if (!readyToSave || serial === lastSavedSerial) return;
		try {
			const blob = new Blob([JSON.stringify(snapshot())], { type: 'text/plain;charset=utf-8' });
			navigator.sendBeacon?.(execUrl, blob);
		} catch {
			/* best effort only */
		}
	}

	onMount(() => {
		mounted = true;
		const onHide = () => {
			if (document.visibilityState === 'hidden') flushBeacon();
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', flushBeacon);
		return () => {
			document.removeEventListener('visibilitychange', onHide);
			window.removeEventListener('pagehide', flushBeacon);
			if (debTimer) clearTimeout(debTimer);
		};
	});

	// What the persistent status pill shows. Not-yet-saveable (no name, or no
	// picks yet) overrides the transient saving/saved/error states; once at
	// least 1 pick exists it tracks the real save status, same as a full 4.
	const pill = $derived.by(() => {
		if (!namesReady) return { kind: 'idle', text: 'Enter your name to begin' };
		if (!hasPicks) return { kind: 'idle', text: 'Pick at least 1 pathway to save' };
		if (status === 'saving') return { kind: 'saving', text: 'Saving…' };
		if (status === 'saved') return { kind: 'saved', text: 'Saved' };
		if (status === 'error') return { kind: 'error', text: 'Not saved' };
		return { kind: 'idle', text: 'Ready' };
	});
</script>

<div class="fsp-tool">
	<div class="topline">
		<a class="staff-link" href={previewHref}>See how staff view this &rarr;</a>
	</div>

	<header class="tool-head">
		<h1>Tech Selection</h1>
		<p class="lede">
			Rank up to four Bosco Tech pathways in order of preference. Even a partial ranking, just one
			or two, saves automatically, so you can start now and add more later. You can come back and
			change your ranking any time during FSP; only your latest ranking is kept.
		</p>
	</header>

	<div class="signed-as">
		Signed in as <strong>{email}</strong>
	</div>

	<div class="rank-status" class:complete={isComplete} role="status">
		{#if isComplete}
			<span class="rank-status-icon" aria-hidden="true">&checkmark;</span> All 4 ranked
		{:else}
			<span class="rank-status-icon" aria-hidden="true">{rankedCount}/4</span>
			{rankedCount} of 4 ranked &middot; come back before FSP ends
		{/if}
	</div>

	<form method="POST" action={execUrl ?? ''} onsubmit={onFormSubmit} class="fsp-form">
		{#if mounted}
			<input type="hidden" name="email" value={email} />
		{/if}

		<fieldset class="who">
			<legend>About you</legend>
			<div class="fields">
				<label class="field">
					<span>Last Name</span>
					<input
						type="text"
						name="lastName"
						bind:value={lastName}
						autocomplete="family-name"
						required
					/>
				</label>
				<label class="field">
					<span>First Name</span>
					<input
						type="text"
						name="firstName"
						bind:value={firstName}
						autocomplete="given-name"
						required
					/>
				</label>
				<label class="field">
					<span>Student ID <em>(if known)</em></span>
					<input type="text" name="studentId" bind:value={studentId} inputmode="numeric" />
				</label>
			</div>
		</fieldset>

		<!-- JS-enhanced picker. Hidden in the no-JS path (see <noscript> below). -->
		<div class="picker js-picker" class:locked={!namesReady}>
			<div class="picker-head">
				<h2>Your ranking</h2>
				{#if !namesReady}
					<span class="lock-note">Enter your name above to unlock the picker.</span>
				{/if}
			</div>

			<div class="chips" role="group" aria-label="Bosco Tech pathways">
				{#each FSP_TECHS as tech (tech.id)}
					{@const rank = rankOf(tech.id)}
					{@const selected = rank > 0}
					{@const full = !selected && choices.length >= 4}
					<button
						type="button"
						class="chip"
						class:selected
						style="--tc:{tech.color}"
						aria-pressed={selected}
						disabled={!namesReady || full}
						onclick={() => toggleTech(tech.id)}
					>
						{#if selected}<span class="rank">{rank}</span>{/if}
						<span class="chip-icon" aria-hidden="true">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
								stroke-linecap="round" stroke-linejoin="round">{@html tech.icon}</svg>
						</span>
						<span class="chip-label">{tech.label}</span>
					</button>
				{/each}
			</div>

			<ol class="ranked" aria-label="Your ranked choices, drag to reorder or use the up/down buttons">
				{#each [0, 1, 2, 3] as slot (slot)}
					{@const id = choices[slot]}
					{@const tech = id ? fspTechById(id) : undefined}
					<li
						class="slot"
						class:empty={!tech}
						class:dragging={dragIndex === slot}
						class:drag-over={dragOverIndex === slot && dragIndex !== slot}
						draggable={tech ? 'true' : 'false'}
						ondragstart={tech ? (e) => onDragStart(e, slot) : undefined}
						ondragenter={tech ? () => onDragEnter(slot) : undefined}
						ondragover={tech ? onDragOver : undefined}
						ondrop={tech ? (e) => onDrop(e, slot) : undefined}
						ondragend={tech ? onDragEnd : undefined}
					>
						{#if tech}
							<span class="drag-handle" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span>
							<span class="slot-num">{slot + 1}</span>
							<span class="slot-dot" style="background:{tech.color}"></span>
							<span class="slot-label">{tech.label}</span>
							<span class="slot-actions">
								<button
									type="button"
									class="mini"
									title="Move up"
									aria-label="Move {tech.label} up"
									disabled={slot === 0}
									onclick={() => moveChoice(slot, -1)}>&uarr;</button
								>
								<button
									type="button"
									class="mini"
									title="Move down"
									aria-label="Move {tech.label} down"
									disabled={slot >= choices.length - 1}
									onclick={() => moveChoice(slot, 1)}>&darr;</button
								>
								<button
									type="button"
									class="mini remove"
									title="Remove"
									aria-label="Remove {tech.label}"
									onclick={() => removeAt(slot)}>&times;</button
								>
							</span>
						{:else}
							<span class="slot-num">{slot + 1}</span>
							<span class="slot-empty">Tap a pathway above</span>
						{/if}
					</li>
				{/each}
			</ol>

			<p class="pick-hint">
				{#if choices.length === 0}
					Pick at least 1 pathway to save your ranking. Rank up to 4 if you can.
				{:else if choices.length < 4}
					{choices.length} of 4 chosen &middot; saved automatically &middot; {availableCount} more
					you could add
				{:else}
					All 4 chosen. Drag to reorder, or swap any time, your latest ranking auto-saves.
				{/if}
			</p>
		</div>

		<!-- Hidden mirrors so a manual native submit (JS path) still carries data. -->
		{#if mounted}
			{#each [0, 1, 2, 3] as slot (slot)}
				<input type="hidden" name={`choice${slot + 1}`} value={choices[slot] ?? ''} />
			{/each}
		{/if}

		<div class="status-row">
			<div class="status-pill {pill.kind}" role="status" aria-live="polite">
				{#if pill.kind === 'saving'}<span class="spinner" aria-hidden="true"></span>{/if}
				{#if pill.kind === 'saved'}<span class="tick" aria-hidden="true">&checkmark;</span>{/if}
				{#if pill.kind === 'error'}<span class="bang" aria-hidden="true">!</span>{/if}
				<span class="status-text">{pill.text}</span>
			</div>
			{#if status === 'error' && readyToSave}
				<button type="button" class="retry" onclick={retry}>Retry</button>
			{/if}
			{#if mounted}
				<button type="submit" class="save-now" disabled={!readyToSave}>Save now</button>
			{/if}
		</div>
		{#if errorDetail}
			<p class="detail" class:err={status === 'error'}>{errorDetail}</p>
		{/if}

		<!-- No-JS fallback: plain selects posting the same fields to the same URL. -->
		<noscript>
			<style>
				.js-picker,
				.status-row,
				.signed-as {
					display: none !important;
				}
			</style>
			<div class="nojs">
				<p class="nojs-note">
					JavaScript is off, so the tap-to-rank picker is unavailable. Enter your Bosco Tech email
					and at least your 1st choice below, then press Save. You can leave the rest blank and
					come back to add more later.
				</p>
				<label class="field">
					<span>Bosco Tech email</span>
					<input type="email" name="email" placeholder="you@boscotech.net" required />
				</label>
				{#each [1, 2, 3, 4] as n (n)}
					<label class="field">
						<span>{n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : '4th'} choice{n > 1
								? ' (optional)'
								: ''}</span>
						<select name={`choice${n}`} required={n === 1}>
							<option value="" disabled={n === 1} selected>{n === 1 ? 'Choose a pathway' : 'None'}</option>
							{#each FSP_TECHS as tech (tech.id)}
								<option value={tech.id}>{tech.label}</option>
							{/each}
						</select>
					</label>
				{/each}
				<button type="submit" class="save-now">Save</button>
			</div>
		</noscript>
	</form>
</div>

<style>
	.fsp-tool {
		max-width: 640px;
		margin: 0 auto;
		padding: 1.25rem 1.25rem 4rem;
	}
	.topline {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
	}
	.staff-link {
		font-size: 0.85rem;
		color: var(--fsp-navy-2);
		text-decoration: none;
		border-bottom: 1px dotted currentColor;
		padding-bottom: 1px;
	}
	.staff-link:hover {
		color: var(--fsp-navy);
	}
	.tool-head h1 {
		font-size: 1.7rem;
		font-weight: 800;
		color: var(--fsp-navy);
		margin-bottom: 0.35rem;
	}
	.lede {
		color: var(--fsp-muted);
		font-size: 0.98rem;
		margin: 0;
	}
	.signed-as {
		margin: 0.9rem 0 0;
		font-size: 0.85rem;
		color: var(--fsp-muted);
	}
	.signed-as strong {
		color: var(--fsp-ink);
	}

	/* Persistent ranked-count indicator: always navy/gold, never red, since an
	   incomplete ranking mid-program is expected, not an error. Distinct from
	   the transient saving/saved/error pill below the form. */
	.rank-status {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.7rem 0 0;
		padding: 0.4rem 0.85rem;
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 700;
		border: 1px solid var(--fsp-line);
		background: var(--fsp-surface-2);
		color: var(--fsp-navy);
	}
	.rank-status.complete {
		border-color: color-mix(in srgb, var(--fsp-gold) 55%, transparent);
		background: color-mix(in srgb, var(--fsp-gold) 16%, #fff);
	}
	.rank-status-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.4rem;
		height: 1.4rem;
		padding: 0 0.3rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 800;
		background: var(--fsp-navy);
		color: #fff;
	}
	.rank-status.complete .rank-status-icon {
		background: var(--fsp-gold);
		color: var(--fsp-navy-deep);
	}

	.fsp-form {
		margin-top: 1.1rem;
	}
	fieldset.who {
		border: 1px solid var(--fsp-line);
		border-radius: 12px;
		background: var(--fsp-surface);
		padding: 1rem 1.1rem 1.15rem;
	}
	legend {
		font-weight: 700;
		color: var(--fsp-navy);
		padding: 0 0.4rem;
		font-size: 0.95rem;
	}
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	.field:last-child {
		grid-column: 1 / -1;
	}
	.field span {
		color: var(--fsp-muted);
		font-weight: 600;
	}
	.field em {
		font-style: normal;
		color: var(--fsp-muted);
		font-weight: 400;
	}
	.field input,
	.field select {
		font: inherit;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--fsp-line);
		border-radius: 8px;
		background: #fff;
		color: var(--fsp-ink);
	}
	.field input:focus,
	.field select:focus {
		outline: 2px solid var(--fsp-gold);
		outline-offset: 1px;
		border-color: var(--fsp-gold);
	}

	.picker {
		margin-top: 1.15rem;
		border: 1px solid var(--fsp-line);
		border-radius: 12px;
		background: var(--fsp-surface);
		padding: 1rem 1.1rem 1.15rem;
	}
	.picker.locked {
		opacity: 0.6;
	}
	.picker-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.8rem;
	}
	.picker-head h2 {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--fsp-navy);
	}
	.lock-note {
		font-size: 0.8rem;
		color: var(--fsp-muted);
	}
	.chips {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}
	.chip {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 0.7rem 0.4rem;
		border: 2px solid var(--fsp-line);
		border-radius: 10px;
		background: #fff;
		color: var(--fsp-ink);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		transition:
			border-color 0.12s,
			background 0.12s,
			transform 0.06s;
	}
	.chip:hover:not(:disabled) {
		border-color: var(--tc);
	}
	.chip:active:not(:disabled) {
		transform: translateY(1px);
	}
	.chip.selected {
		border-color: var(--tc);
		background: color-mix(in srgb, var(--tc) 14%, #fff);
	}
	.chip:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.chip-icon {
		color: var(--tc);
		width: 26px;
		height: 26px;
	}
	.chip-icon :global(svg) {
		width: 100%;
		height: 100%;
	}
	.chip-label {
		font-size: 0.9rem;
		letter-spacing: 0.02em;
	}
	.rank {
		position: absolute;
		top: -8px;
		left: -8px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--fsp-navy);
		color: #fff;
		font-size: 0.78rem;
		font-weight: 800;
		display: grid;
		place-items: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.ranked {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.slot {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--fsp-line);
		border-radius: 8px;
		background: var(--fsp-surface-2);
		transition:
			opacity 0.12s,
			border-color 0.12s,
			background 0.12s;
	}
	.slot.empty {
		border-style: dashed;
		background: transparent;
	}
	.slot[draggable='true'] {
		cursor: grab;
	}
	.slot.dragging {
		opacity: 0.45;
	}
	.slot.drag-over {
		border-color: var(--fsp-gold);
		background: color-mix(in srgb, var(--fsp-gold) 14%, var(--fsp-surface-2));
	}
	.drag-handle {
		flex: none;
		color: var(--fsp-muted);
		font-size: 0.95rem;
		line-height: 1;
		padding: 0 0.1rem;
		cursor: grab;
		user-select: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.slot {
			transition: none;
		}
	}
	.slot-num {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--fsp-navy);
		color: #fff;
		font-size: 0.78rem;
		font-weight: 800;
		display: grid;
		place-items: center;
		flex: none;
	}
	.slot.empty .slot-num {
		background: var(--fsp-line);
		color: var(--fsp-muted);
	}
	.slot-dot {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		flex: none;
	}
	.slot-label {
		font-weight: 700;
	}
	.slot-empty {
		color: var(--fsp-muted);
		font-size: 0.88rem;
	}
	.slot-actions {
		margin-left: auto;
		display: flex;
		gap: 0.25rem;
	}
	.mini {
		width: 28px;
		height: 28px;
		border: 1px solid var(--fsp-line);
		border-radius: 6px;
		background: #fff;
		color: var(--fsp-navy);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.mini.remove {
		color: var(--fsp-warn);
	}
	.pick-hint {
		margin: 0.85rem 0 0;
		font-size: 0.83rem;
		color: var(--fsp-muted);
	}

	.status-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 1.1rem;
	}
	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 700;
		border: 1px solid var(--fsp-line);
		background: var(--fsp-surface-2);
		color: var(--fsp-muted);
	}
	.status-pill.saving {
		color: var(--fsp-navy);
		border-color: color-mix(in srgb, var(--fsp-navy) 30%, #fff);
		background: color-mix(in srgb, var(--fsp-navy) 8%, #fff);
	}
	.status-pill.saved {
		color: var(--fsp-ok);
		border-color: color-mix(in srgb, var(--fsp-ok) 35%, #fff);
		background: color-mix(in srgb, var(--fsp-ok) 10%, #fff);
	}
	.status-pill.error {
		color: var(--fsp-warn);
		border-color: color-mix(in srgb, var(--fsp-warn) 40%, #fff);
		background: color-mix(in srgb, var(--fsp-warn) 10%, #fff);
	}
	.tick,
	.bang {
		font-weight: 900;
	}
	.spinner {
		width: 13px;
		height: 13px;
		border: 2px solid color-mix(in srgb, var(--fsp-navy) 25%, #fff);
		border-top-color: var(--fsp-navy);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 1.6s;
		}
	}
	.retry,
	.save-now {
		font: inherit;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.45rem 0.9rem;
		border-radius: 8px;
		cursor: pointer;
		border: 1px solid transparent;
	}
	.retry {
		background: var(--fsp-warn);
		color: #fff;
	}
	.save-now {
		margin-left: auto;
		background: var(--fsp-gold);
		color: var(--fsp-navy-deep);
		border-color: color-mix(in srgb, var(--fsp-gold) 60%, #000);
	}
	.save-now:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.detail {
		margin: 0.5rem 0 0;
		font-size: 0.82rem;
		color: var(--fsp-muted);
	}
	.detail.err {
		color: var(--fsp-warn);
	}
	.nojs {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		margin-top: 1rem;
		padding: 1rem;
		border: 1px solid var(--fsp-line);
		border-radius: 12px;
		background: var(--fsp-surface);
	}
	.nojs-note {
		font-size: 0.85rem;
		color: var(--fsp-muted);
		margin: 0;
	}

	@media (max-width: 480px) {
		.fields {
			grid-template-columns: 1fr;
		}
		.chips {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
