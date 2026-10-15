<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { coins, coinNumber } from '$lib/coin-format';
	import { startPoller, type Poller, type PollOutcome } from '$lib/classroom/poll';
	import {
		FINE_HOLD_MS,
		FINE_ROSTER_POLL_MS,
		FINE_UNDO_MS,
		PROPERTY_DAMAGE,
		awardButtons,
		fineButtons,
		fineRefusalWords,
		landingSection,
		namesSentence,
		num,
		parseFineAmount,
		parseRepairCost,
		postedIds,
		tileNames,
		tileOrder,
		type FineButton,
		type FineRoster,
		type FineSection,
		type FineSettings,
		type FineTransports
	} from './fine';

	/**
	 * THE FINE SCREEN (IDEA Coin V2, ledger 0384): two taps, a student and a
	 * fine, on a phone held in one hand at the front of the room.
	 *
	 * TAP ONE IS A NAME. Large first-name tiles in a fixed alphabetical order
	 * (`tileOrder`), so a thumb learns where a name is and a balance change never
	 * moves a tile. Pressing and holding a tile (`FINE_HOLD_MS`) starts picking
	 * several; after that a tap toggles. "Pick several" is the same thing as a
	 * button, because a hold has no keyboard.
	 *
	 * TAP TWO IS THE FINE. The buttons are the settings' own list in its own
	 * order, each labelled with the category's name and amount, and a press
	 * posts at once through `coin_fine_log`. Property Damage asks Accident or
	 * Careless, and Careless asks the repair cost (the only fine that asks
	 * anything); an award in a range or set by hand asks its amount.
	 *
	 * EVERY POST CAN BE TAKEN BACK FOR `FINE_UNDO_MS`: one press reverses every
	 * transaction that post made (`coin_reverse_transaction`, a reversing row,
	 * never a delete). Omitting `reverse` from the transports removes the Undo.
	 *
	 * PRESENTATION PLUS INJECTED TRANSPORTS. Nothing here is a boundary: every
	 * call is admin-only inside the database, and a refusal arrives in words.
	 */
	let {
		transports,
		section = null,
		lastSection = null,
		onSectionUsed = null,
		onPosted = null,
		embedded = false,
		clock = () => Date.now(),
		pollMs = FINE_ROSTER_POLL_MS
	}: {
		transports: FineTransports;
		/** A class to stay on (the live class panel). Set, there is no class picker. */
		section?: string | null;
		/** The class used last, from the viewer's preferences; where to land when nothing is in session. */
		lastSection?: string | null;
		/** Told whenever the viewer opens a class, so the page can remember it. */
		onSectionUsed?: ((sectionId: string) => void) | null;
		/** Told after a post or an undo lands (the live panel re-reads its no-shop list). */
		onPosted?: (() => void) | null;
		/** Drawn inside another page (no page heading of its own). */
		embedded?: boolean;
		clock?: () => number;
		pollMs?: number;
	} = $props();

	// ---------------------------------------------------------------------
	// WHAT IS LOADED
	// ---------------------------------------------------------------------
	let sections = $state<FineSection[]>([]);
	let sectionId = $state<string | null>(null);
	let roster = $state<FineRoster | null>(null);
	let settings = $state<FineSettings | null>(null);
	let missing = $state(false);
	let loadError = $state<string | null>(null);
	let loading = $state(true);

	const students = $derived(roster ? tileOrder(roster.students) : []);
	const names = $derived(tileNames(roster?.students ?? []));
	const fines = $derived(settings ? fineButtons(settings) : []);
	const awards = $derived(settings ? awardButtons(settings.categories) : []);
	const current = $derived(sections.find((s) => s.id === sectionId) ?? null);

	async function loadSettings(): Promise<void> {
		const res = await transports.settings();
		if (res.ok) settings = res.data;
		else if (res.missing) missing = true;
		else loadError = res.message;
	}

	let rosterSeq = 0;
	async function loadRoster(id: string): Promise<PollOutcome> {
		const seq = ++rosterSeq;
		const res = await transports.roster(id);
		// A slow answer for a class somebody has since switched away from is dropped.
		if (seq !== rosterSeq || id !== sectionId) return 'ok';
		if (res.ok) {
			roster = res.data;
			loadError = null;
			return 'ok';
		}
		if (res.missing) missing = true;
		else loadError = res.message;
		return 'failed';
	}

	async function boot(): Promise<void> {
		loading = true;
		const pinned = section;
		const jobs: Promise<unknown>[] = [loadSettings()];
		if (pinned) {
			sectionId = pinned;
			jobs.push(loadRoster(pinned));
		} else {
			jobs.push(
				(async () => {
					const res = await transports.sections();
					if (!res.ok) {
						if (res.missing) missing = true;
						else loadError = res.message;
						return;
					}
					sections = res.data;
					const land = landingSection(res.data, lastSection);
					sectionId = land;
					if (land) await loadRoster(land);
				})()
			);
		}
		await Promise.all(jobs);
		loading = false;
	}

	let poller: Poller | null = null;
	onMount(() => {
		void boot();
		const p = startPoller({
			intervalMs: pollMs,
			run: () => (sectionId ? loadRoster(sectionId) : 'ok')
		});
		poller = p;
		return () => {
			p.stop();
			poller = null;
			cancelHold();
			if (undoTimer) clearTimeout(undoTimer);
			if (tickTimer) clearInterval(tickTimer);
		};
	});

	function chooseSection(id: string): void {
		if (!id || id === sectionId) return;
		sectionId = id;
		roster = null;
		clearSelection();
		void loadRoster(id);
		onSectionUsed?.(id);
	}

	// ---------------------------------------------------------------------
	// TAP ONE: WHO
	// ---------------------------------------------------------------------
	let multi = $state(false);
	let selected = $state<string[]>([]);
	const selectedSet = $derived(new Set(selected));

	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	/** The tile a hold just started a selection on, so the click that ends the press does not undo it. */
	let heldEmail: string | null = null;

	function cancelHold(): void {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}

	function pressStart(e: PointerEvent, email: string): void {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		cancelHold();
		heldEmail = null;
		holdTimer = setTimeout(() => {
			holdTimer = null;
			heldEmail = email;
			multi = true;
			if (!selectedSet.has(email)) selected = [...selected, email];
			try {
				navigator.vibrate?.(15);
			} catch {
				/* a vibration refused is nothing to report */
			}
		}, FINE_HOLD_MS);
	}

	function tap(email: string): void {
		cancelHold();
		if (heldEmail === email) {
			heldEmail = null;
			return;
		}
		heldEmail = null;
		if (multi) {
			selected = selectedSet.has(email) ? selected.filter((x) => x !== email) : [...selected, email];
			return;
		}
		selected = [email];
		openSheet();
	}

	function startMulti(): void {
		multi = true;
	}

	function clearSelection(): void {
		selected = [];
		multi = false;
	}

	const selectedNames = $derived(selected.map((e) => names.get(e) ?? e));

	// ---------------------------------------------------------------------
	// TAP TWO: WHAT -- a native modal <dialog>
	// ---------------------------------------------------------------------
	type Step =
		| { step: 'fines' }
		| { step: 'awards' }
		| { step: 'amount'; button: FineButton; award: boolean }
		| { step: 'damage' }
		| { step: 'careless' };
	let sheet = $state<Step | null>(null);
	let amountText = $state<string | number>('');
	let costText = $state<string | number>('');
	let formError = $state<string | null>(null);
	let busy = $state(false);
	let dialogEl = $state<HTMLDialogElement | null>(null);

	function openSheet(): void {
		if (selected.length === 0) return;
		formError = null;
		sheet = { step: 'fines' };
	}

	function go(next: Step): void {
		formError = null;
		amountText = '';
		costText = '';
		sheet = next;
	}

	function closeSheet(): void {
		if (!sheet) return;
		sheet = null;
		formError = null;
		const el = dialogEl;
		if (el?.open) el.close();
		// One student picked by a tap was a one-off; several picked on purpose stay picked.
		if (!multi) selected = [];
	}

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		if (!el.open) el.showModal();
		const onClose = () => closeSheet();
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			closeSheet();
		};
		const onPointerdown = (e: PointerEvent) => {
			if (e.target === el) closeSheet();
		};
		el.addEventListener('close', onClose);
		el.addEventListener('keydown', onKeydown);
		el.addEventListener('pointerdown', onPointerdown);
		return () => {
			el.removeEventListener('close', onClose);
			el.removeEventListener('keydown', onKeydown);
			el.removeEventListener('pointerdown', onPointerdown);
			if (el.open) el.close();
		};
	});

	// ---------------------------------------------------------------------
	// POSTING, AND THE UNDO
	// ---------------------------------------------------------------------
	let notice = $state<string | null>(null);
	let refusals = $state<string[]>([]);
	let undo = $state<{ ids: string[]; until: number } | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | null = null;
	let tickTimer: ReturnType<typeof setInterval> | null = null;
	let now = $state(untrack(() => clock()));
	const undoSeconds = $derived(undo ? Math.max(0, Math.ceil((undo.until - now) / 1000)) : 0);

	function armUndo(ids: string[]): void {
		if (undoTimer) clearTimeout(undoTimer);
		if (tickTimer) clearInterval(tickTimer);
		undoTimer = null;
		tickTimer = null;
		if (ids.length === 0 || !transports.reverse) {
			undo = null;
			return;
		}
		const read = clock;
		now = read();
		undo = { ids, until: now + FINE_UNDO_MS };
		tickTimer = setInterval(() => (now = read()), 250);
		undoTimer = setTimeout(() => {
			undo = null;
			if (tickTimer) clearInterval(tickTimer);
			tickTimer = null;
		}, FINE_UNDO_MS);
	}

	async function post(button: FineButton, award: boolean, options: { amount?: number; carelessCost?: number } = {}): Promise<void> {
		if (busy || selected.length === 0) return;
		const emails = [...selected];
		const label = names;
		busy = true;
		formError = null;
		try {
			const res = await transports.log(emails, button.id === PROPERTY_DAMAGE ? PROPERTY_DAMAGE : button.id, {
				amount: options.amount ?? null,
				carelessCost: options.carelessCost ?? null
			});
			if (!res.ok) {
				formError = res.missing ? 'The coin database update has not landed yet, so nothing was posted.' : res.message;
				return;
			}
			const ok = res.data.results.filter((r) => r.ok);
			const bad = res.data.results.filter((r) => !r.ok);
			const who = namesSentence(ok.map((r) => label.get(r.email) ?? r.email));
			const amounts = [...new Set(ok.map((r) => Math.abs(num(r.amount ?? null) ?? 0)))];
			const each = amounts.length === 1 ? ` ${coins(amounts[0])}${ok.length > 1 ? ' each' : ''}` : '';
			const verb = award ? 'Awarded' : 'Fined';
			notice = ok.length === 0 ? `Nothing was posted for ${button.name}.` : `${verb} ${who}${each} for ${button.name}.`;
			refusals = bad.map((r) => `${label.get(r.email) ?? r.email}: ${fineRefusalWords(r)}`);
			armUndo(postedIds(res.data));
			sheet = null;
			if (dialogEl?.open) dialogEl.close();
			selected = [];
			multi = false;
			if (ok.length > 0) {
				onPosted?.();
				if (!section && sectionId) onSectionUsed?.(sectionId);
			}
		} catch {
			formError = 'Could not reach the coin database. Check the connection and try again.';
		} finally {
			busy = false;
			if (sectionId) void loadRoster(sectionId);
		}
	}

	async function undoLast(): Promise<void> {
		const reverse = transports.reverse;
		const job = undo;
		if (!job || !reverse || busy) return;
		busy = true;
		armUndo([]);
		let done = 0;
		const why: string[] = [];
		try {
			for (const id of job.ids) {
				const res = await reverse(id);
				if (res.ok && res.data.ok) done += 1;
				else why.push(res.ok ? fineRefusalWords({ reason: res.data.reason }) : res.message);
			}
		} catch {
			why.push('Could not reach the coin database.');
		} finally {
			busy = false;
		}
		notice =
			done === job.ids.length
				? 'Undone.'
				: `Undid ${done} of ${job.ids.length}. ${[...new Set(why)].join(' ')}`.trim();
		refusals = [];
		if (done > 0) onPosted?.();
		if (sectionId) void loadRoster(sectionId);
	}

	function pressButton(button: FineButton, award: boolean): void {
		if (button.ask === 'property_damage') return go({ step: 'damage' });
		if (button.ask === 'amount') return go({ step: 'amount', button, award });
		void post(button, award);
	}

	function submitAmount(e: SubmitEvent): void {
		e.preventDefault();
		if (sheet?.step !== 'amount') return;
		const parsed = parseFineAmount(amountText, sheet.button);
		if (!parsed.ok) {
			formError = parsed.message;
			return;
		}
		void post(sheet.button, sheet.award, { amount: parsed.amount });
	}

	const DAMAGE: FineButton = { id: PROPERTY_DAMAGE, name: 'Property Damage', amount: null, min: null, max: null, ask: 'property_damage' };

	function submitCareless(e: SubmitEvent): void {
		e.preventDefault();
		const parsed = parseRepairCost(costText);
		if (!parsed.ok) {
			formError = parsed.message;
			return;
		}
		void post(DAMAGE, false, { carelessCost: parsed.dollars });
	}

	function rangeWords(b: FineButton): string {
		if (b.min != null && b.max != null) return `${coinNumber(b.min)} to ${coins(b.max)}`;
		return 'you choose';
	}

	const who = $derived(
		selected.length === 1 ? (selectedNames[0] ?? '') : `${selected.length} students: ${namesSentence(selectedNames)}`
	);
</script>

<section class="fs-root" class:fs-embedded={embedded} data-testid="fine-screen">
	<div class="fs-top">
		{#if !embedded}
			<h2 class="fs-title">Fine</h2>
		{/if}
		{#if !section && sections.length > 0}
			<label class="fs-class">
				<span class="fs-label">Class</span>
				<select
					class="fs-select"
					data-testid="fine-section"
					value={sectionId ?? ''}
					onchange={(e) => chooseSection((e.currentTarget as HTMLSelectElement).value)}
				>
					{#each sections as s (s.id)}
						<option value={s.id}>{s.label}{s.in_session ? ' (in session)' : ''}</option>
					{/each}
				</select>
			</label>
		{/if}
		{#if current?.in_session}
			<span class="fs-chip fs-chip-live" data-testid="fine-in-session"><span aria-hidden="true">●</span> In session</span>
		{/if}
	</div>

	{#if missing}
		<p class="fs-banner" role="status" data-testid="fine-missing">
			The coin database update has not landed yet, so the fine screen cannot load. It will work once it does.
		</p>
	{:else if loadError}
		<p class="fs-banner" role="status" data-testid="fine-error">{loadError}</p>
	{/if}

	{#if !missing}
		<div class="fs-tools">
			{#if multi}
				<p class="fs-hint" data-testid="fine-multi-hint">Tap names to add or remove them.</p>
			{:else}
				<p class="fs-hint">Tap a name, then a fine. Hold a name to pick several.</p>
				<button type="button" class="fs-key" data-testid="fine-multi" onclick={startMulti} disabled={students.length === 0}>
					Pick several
				</button>
			{/if}
		</div>

		{#if loading && !roster}
			<p class="fs-empty">Loading the class&hellip;</p>
		{:else if roster && students.length === 0}
			<p class="fs-empty" data-testid="fine-no-students">Nobody in this class is in the coin economy.</p>
		{:else if !roster && !loading && sections.length === 0 && !section && !loadError}
			<p class="fs-empty" data-testid="fine-no-classes">No class has the coin economy turned on.</p>
		{/if}

		<ul class="fs-tiles" data-testid="fine-tiles" aria-label="Students">
			{#each students as s (s.email)}
				{@const bal = num(s.balance) ?? 0}
				<li class="fs-tile-item">
					<button
						type="button"
						class="fs-tile"
						class:is-on={selectedSet.has(s.email)}
						data-testid="fine-tile"
						data-email={s.email}
						aria-pressed={multi ? selectedSet.has(s.email) : undefined}
						title={s.display_name ?? s.email}
						onpointerdown={(e) => pressStart(e, s.email)}
						onpointerup={cancelHold}
						onpointerleave={cancelHold}
						onpointercancel={cancelHold}
						oncontextmenu={(e) => e.preventDefault()}
						onclick={() => tap(s.email)}
					>
						{#if multi}
							<span class="fs-check" aria-hidden="true">{selectedSet.has(s.email) ? '✓' : ''}</span>
						{/if}
						<span class="fs-name">{names.get(s.email) ?? s.email}</span>
						<span class="fs-bal" class:is-neg={bal < 0}>{coins(bal)}</span>
						{#if s.out_on_pass || s.no_shop}
							<span class="fs-badges">
								{#if s.out_on_pass}
									<span class="fs-badge fs-badge-pass" data-testid="fine-badge-pass"><span aria-hidden="true">◐</span> Hall pass</span>
								{/if}
								{#if s.no_shop}
									<span class="fs-badge fs-badge-shop" data-testid="fine-badge-shop"><span aria-hidden="true">⊘</span> No shop</span>
								{/if}
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>

		{#if notice || refusals.length > 0 || multi}
			<div class="fs-dock" data-testid="fine-dock">
				{#if multi}
					<div class="fs-dock-row" data-testid="fine-selection">
						<span class="fs-count" role="status">{selected.length} selected</span>
						<button type="button" class="fs-key" data-testid="fine-clear" onclick={clearSelection}>Clear</button>
						<button
							type="button"
							class="fs-key fs-key-go"
							data-testid="fine-choose"
							aria-disabled={selected.length === 0}
							onclick={openSheet}
						>
							Choose a fine
						</button>
					</div>
				{/if}
				{#if notice}
					<div class="fs-dock-row" data-testid="fine-posted">
						{#if undo}
							<button type="button" class="fs-key fs-key-undo" data-testid="fine-undo" disabled={busy} onclick={undoLast}>
								Undo <span class="fs-secs">{undoSeconds}s</span>
							</button>
						{/if}
						<p class="fs-notice" role="status">{notice}</p>
					</div>
				{/if}
				{#if refusals.length > 0}
					<ul class="fs-refusals" data-testid="fine-refusals">
						{#each refusals as r (r)}
							<li><span aria-hidden="true">!</span> {r}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	{/if}

	{#if sheet}
		<dialog bind:this={dialogEl} class="fs-sheet" aria-label="Choose a fine" data-testid="fine-sheet">
			<div class="fs-sheet-head">
				<p class="fs-sheet-who" data-testid="fine-sheet-who">
					<span class="fs-label">For</span>
					<span class="fs-sheet-name">{who}</span>
				</p>
				<button type="button" class="fs-key" data-testid="fine-sheet-close" onclick={closeSheet}>Close</button>
			</div>

			{#if sheet.step === 'fines'}
				<div class="fs-grid" role="group" aria-label="Fines">
					{#each fines as b (b.id)}
						<button type="button" class="fs-fine" data-testid="fine-button" data-category={b.id} disabled={busy} onclick={() => pressButton(b, false)}>
							<span class="fs-fine-name">{b.name}</span>
							<span class="fs-fine-amount">
								{#if b.amount != null}{coins(b.amount)}{:else if b.ask === 'property_damage'}Asks first{:else}{rangeWords(b)}{/if}
							</span>
						</button>
					{/each}
				</div>
				{#if fines.length === 0 && settings}
					<p class="fs-empty">No fine buttons are set up. They are chosen in the coin settings.</p>
				{/if}
				{#if awards.length > 0}
					<button type="button" class="fs-key fs-key-award" data-testid="fine-award" disabled={busy} onclick={() => go({ step: 'awards' })}>
						<span aria-hidden="true">+</span> Award instead
					</button>
				{/if}
			{:else if sheet.step === 'awards'}
				<div class="fs-grid" role="group" aria-label="Awards">
					{#each awards as b (b.id)}
						<button type="button" class="fs-fine fs-award" data-testid="award-button" data-category={b.id} disabled={busy} onclick={() => pressButton(b, true)}>
							<span class="fs-fine-name">{b.name}</span>
							<span class="fs-fine-amount">{b.amount != null ? coins(b.amount) : rangeWords(b)}</span>
						</button>
					{/each}
				</div>
				<button type="button" class="fs-key" data-testid="fine-back" onclick={() => go({ step: 'fines' })}>Back to fines</button>
			{:else if sheet.step === 'amount'}
				<form class="fs-form" onsubmit={submitAmount}>
					<label class="fs-field">
						<span class="fs-label">{sheet.button.name}: how many coins? ({rangeWords(sheet.button)})</span>
						<!-- svelte-ignore a11y_autofocus -->
						<input class="fs-input" type="text" inputmode="decimal" autocomplete="off" bind:value={amountText} data-testid="fine-amount" autofocus />
					</label>
					<div class="fs-form-row">
						<button type="button" class="fs-key" onclick={() => go(sheet?.step === 'amount' && sheet.award ? { step: 'awards' } : { step: 'fines' })}>Back</button>
						<button type="submit" class="fs-key fs-key-go" data-testid="fine-amount-post" disabled={busy}>Post</button>
					</div>
				</form>
			{:else if sheet.step === 'damage'}
				<p class="fs-question">Property Damage: was it an accident, or careless?</p>
				<div class="fs-grid fs-grid-two">
					<button type="button" class="fs-fine" data-testid="damage-accident" disabled={busy} onclick={() => post(DAMAGE, false)}>
						<span class="fs-fine-name">Accident</span>
						<span class="fs-fine-amount">First one this semester is free</span>
					</button>
					<button type="button" class="fs-fine" data-testid="damage-careless" disabled={busy} onclick={() => go({ step: 'careless' })}>
						<span class="fs-fine-name">Careless</span>
						<span class="fs-fine-amount">Asks the repair cost</span>
					</button>
				</div>
				<button type="button" class="fs-key" onclick={() => go({ step: 'fines' })}>Back to fines</button>
			{:else if sheet.step === 'careless'}
				<form class="fs-form" onsubmit={submitCareless}>
					<label class="fs-field">
						<span class="fs-label">Repair cost in dollars</span>
						<!-- svelte-ignore a11y_autofocus -->
						<input class="fs-input" type="text" inputmode="decimal" autocomplete="off" bind:value={costText} data-testid="damage-cost" autofocus />
					</label>
					<p class="fs-small">The fine is worked out from the cost.</p>
					<div class="fs-form-row">
						<button type="button" class="fs-key" onclick={() => go({ step: 'damage' })}>Back</button>
						<button type="submit" class="fs-key fs-key-go" data-testid="damage-post" disabled={busy}>Post</button>
					</div>
				</form>
			{/if}

			{#if formError}
				<p class="fs-form-error" role="alert" data-testid="fine-form-error">{formError}</p>
			{/if}
		</dialog>
	{/if}
</section>

<style>
	.fs-root {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
		color: var(--text-1);
	}
	.fs-top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem 0.75rem;
	}
	.fs-title {
		margin: 0;
		font-size: 1.6rem;
		line-height: 1.1;
		flex: 1 1 100%;
	}
	.fs-title::before {
		content: none;
	}
	.fs-class {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1 1 14rem;
		max-width: 28rem;
		min-width: 0;
	}
	.fs-label {
		font-family: var(--font-mono, monospace);
		font-size: 0.78rem;
		color: var(--text-2);
		letter-spacing: 0.04em;
	}
	.fs-select,
	.fs-input {
		min-height: 48px;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		font: inherit;
		font-size: 1.05rem;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		padding: 0 0.6rem;
	}
	.fs-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 32px;
		padding: 0 0.6rem;
		border-radius: 999px;
		font-family: var(--font-mono, monospace);
		font-size: 0.8rem;
		border: 1px solid var(--boundary);
	}
	.fs-chip-live {
		color: var(--status-ok, var(--green));
	}
	.fs-banner {
		margin: 0;
		padding: 0.75rem;
		border: 1px solid var(--status-warn, var(--amber));
		border-radius: var(--radius-card, 4px);
		background: var(--status-warn-fill, transparent);
	}
	.fs-tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.fs-hint {
		margin: 0;
		flex: 1 1 12rem;
		color: var(--text-2);
		font-size: 0.92rem;
	}
	.fs-empty {
		margin: 0;
		color: var(--text-2);
	}
	.fs-key {
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		font: inherit;
		font-family: var(--font-mono, monospace);
		font-size: 0.9rem;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		cursor: pointer;
	}
	.fs-key:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.fs-key-go {
		background: var(--accent-fill, var(--green));
		color: var(--accent-on-fill, #0a0c0d);
		border-color: var(--accent-fill, var(--green));
		font-weight: 700;
	}
	.fs-key-go[aria-disabled='true'] {
		opacity: 0.55;
	}
	.fs-key-undo {
		border-color: var(--status-warn, var(--amber));
		font-weight: 700;
	}
	.fs-secs {
		color: var(--text-2);
		font-weight: 400;
	}
	.fs-key-award {
		align-self: flex-start;
		margin-top: 0.75rem;
	}

	.fs-tiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(6.75rem, 100%), 1fr));
		gap: 0.5rem;
	}
	.fs-tile-item {
		min-width: 0;
		display: flex;
	}
	.fs-tile {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 76px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.15rem;
		padding: 0.55rem 0.6rem;
		font: inherit;
		color: var(--text-1);
		text-align: left;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		touch-action: manipulation;
	}
	.fs-tile.is-on {
		background: var(--green-tint, var(--surface-2));
		border-color: var(--accent-ink, var(--green));
		box-shadow: inset 0 0 0 1px var(--accent-ink, var(--green));
	}
	/* On the selected fill the red and copper inks fall under 4.5:1 (3.46 and
	   4.09, computed), so a picked tile writes them in the body ink; the minus
	   sign and the badge's glyph and word still carry the meaning. */
	.fs-tile.is-on .fs-bal.is-neg,
	.fs-tile.is-on .fs-badge-shop {
		color: var(--text-1);
	}
	.fs-check {
		position: absolute;
		top: 0.3rem;
		right: 0.35rem;
		width: 1.3rem;
		height: 1.3rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--boundary);
		border-radius: 3px;
		font-size: 0.85rem;
		color: var(--accent-ink, var(--green));
	}
	.fs-name {
		font-size: 1.2rem;
		font-weight: 700;
		line-height: 1.15;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fs-bal {
		font-family: var(--font-mono, monospace);
		font-size: 0.82rem;
		color: var(--text-2);
	}
	.fs-bal.is-neg {
		color: var(--status-danger, var(--crimson));
	}
	.fs-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
	}
	.fs-badge {
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		padding: 0.05rem 0.3rem;
		border-radius: 3px;
		border: 1px solid currentColor;
		white-space: nowrap;
	}
	.fs-badge-pass {
		color: var(--status-info, var(--cyan));
	}
	.fs-badge-shop {
		color: var(--status-warn, var(--amber));
	}

	/*
	 * THE DOCK STAYS IN REACH AND CLEAR OF THE SITE'S FLOATING FEEDBACK PILL,
	 * which sits in the bottom right corner of a page that does not dock it
	 * (measured at 390: the pill covered Undo when the dock sat at the very
	 * bottom). Undo leads the row for the same reason. Inside another page
	 * (the live class, whose header docks the pill) it sits at the bottom.
	 */
	.fs-dock {
		position: sticky;
		bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem;
		background: var(--surface-raised, var(--surface-1));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
	}
	.fs-embedded .fs-dock {
		bottom: 0;
	}
	.fs-dock-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.fs-count {
		flex: 1 1 auto;
		font-weight: 700;
	}
	.fs-notice {
		margin: 0;
		flex: 1 1 12rem;
	}
	.fs-refusals {
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--status-danger, var(--crimson));
		font-size: 0.92rem;
	}

	.fs-sheet {
		box-sizing: border-box;
		width: min(40rem, 100%);
		max-width: 100%;
		max-height: 88dvh;
		margin: auto auto 0;
		padding: 0.9rem;
		overflow: auto;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: 10px 10px 0 0;
	}
	.fs-sheet::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}
	@media (min-width: 48rem) {
		.fs-sheet {
			margin: auto;
			border-radius: 10px;
		}
	}
	.fs-sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.fs-sheet-who {
		margin: 0;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.fs-sheet-name {
		font-size: 1.2rem;
		font-weight: 700;
		overflow-wrap: break-word;
	}
	.fs-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(9rem, 100%), 1fr));
		gap: 0.5rem;
	}
	.fs-grid-two {
		grid-template-columns: 1fr 1fr;
		margin-bottom: 0.75rem;
	}
	.fs-fine {
		min-height: 64px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.15rem;
		padding: 0.5rem 0.65rem;
		font: inherit;
		text-align: left;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-left: 4px solid var(--status-warn, var(--amber));
		border-radius: var(--radius-card, 4px);
		cursor: pointer;
	}
	.fs-award {
		border-left-color: var(--status-ok, var(--green));
	}
	.fs-fine:disabled {
		opacity: 0.55;
	}
	.fs-fine-name {
		font-weight: 700;
		font-size: 1.02rem;
		line-height: 1.15;
	}
	.fs-fine-amount {
		font-family: var(--font-mono, monospace);
		font-size: 0.82rem;
		color: var(--text-2);
	}
	.fs-question {
		margin: 0 0 0.6rem;
		font-weight: 700;
	}
	.fs-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.fs-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.fs-form-row {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
	.fs-small {
		margin: 0;
		color: var(--text-2);
		font-size: 0.88rem;
	}
	.fs-form-error {
		margin: 0.6rem 0 0;
		color: var(--status-danger, var(--crimson));
	}
	@media (prefers-reduced-motion: no-preference) {
		.fs-tile {
			transition: background-color 120ms ease, border-color 120ms ease;
		}
	}
</style>
