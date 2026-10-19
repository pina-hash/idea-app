<script lang="ts">
	/**
	 * A PROJECT'S PART NUMBERS (ledger 0405, decision 41, scheme A): every
	 * number this project has handed out, by subsystem and then by assembly,
	 * and the one form that takes a new one. The SolidWorks add-in asks the same
	 * database function (`armory_part_number_take`); this form is the way in
	 * until it ships, and stays for anybody without SolidWorks open.
	 *
	 * Presentation only: the route owns the read and hands in the transports,
	 * and an absent transport removes its control (CLAUDE.md, "An omitted
	 * optional transport REMOVES the control it drives"). The format, the
	 * grouping and the search are `$lib/armory/part-numbers`, the one spelling.
	 */
	import {
		groupPartNumbers,
		partMatches,
		type PartNumberRow,
		type PrefixAnswer,
		type ProjectPartNumbers,
		type TakeAnswer
	} from '$lib/armory/part-numbers';
	import { whenWords } from '$lib/armory/view';

	let {
		data,
		now,
		take = null,
		setPrefix = null
	}: {
		data: ProjectPartNumbers;
		now: number;
		/** Hands out a number; absent for a viewer who may not, and on an archived project. */
		take?: ((input: { subsystem: string; assembly: number | null; description: string }) => Promise<TakeAnswer>) | null;
		/** A mentor's or a site admin's. */
		setPrefix?: ((prefix: string) => Promise<PrefixAnswer>) | null;
	} = $props();

	let query = $state('');
	const live = $derived(data.subsystems.filter((s) => !s.retired));
	const shown = $derived(data.numbers.filter((n) => partMatches(n, query)));
	const groups = $derived(groupPartNumbers(shown, data.subsystems));
	const assemblies = $derived(data.numbers.filter((n) => n.part === 0).length);
	const parts = $derived(data.numbers.length - assemblies);
	const yy = $derived(String(data.project.season_yy).padStart(2, '0'));
	const pattern = $derived(`${data.project.prefix}-${yy}-SS-AAPP`);

	/* The take form. */
	let subsystem = $state('');
	let kind = $state<'assembly' | 'part'>('assembly');
	let assembly = $state('');
	let description = $state('');
	let busy = $state(false);
	let result = $state<{ bad: boolean; text: string; number?: string } | null>(null);

	const chosenSub = $derived(subsystem || live[0]?.code || '');
	const heads = $derived(
		data.numbers
			.filter((n) => n.subsystem === chosenSub && n.part === 0)
			.sort((a, b) => a.assembly - b.assembly)
	);
	const chosenAsm = $derived(heads.some((h) => String(h.assembly) === assembly) ? assembly : String(heads[0]?.assembly ?? ''));
	const effectiveKind = $derived(heads.length === 0 ? 'assembly' : kind);
	const preview = $derived(
		effectiveKind === 'assembly'
			? `The next ${chosenSub} assembly number, ending 00`
			: `The next part in assembly ${data.project.prefix}-${yy}-${chosenSub}-${chosenAsm.padStart(2, '0')}00`
	);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!take || busy || !chosenSub) return;
		busy = true;
		result = null;
		try {
			const answer = await take({
				subsystem: chosenSub,
				assembly: effectiveKind === 'assembly' ? null : Number(chosenAsm),
				description: description.trim()
			});
			if (answer.ok) {
				result = {
					bad: false,
					text: answer.row.kind === 'assembly' ? 'New assembly number:' : 'New part number:',
					number: answer.row.part_number
				};
				description = '';
			} else {
				result = { bad: true, text: answer.message };
			}
		} finally {
			busy = false;
		}
	}

	/* The prefix form. */
	let prefixDraft = $state<string | null>(null);
	let prefixBusy = $state(false);
	let prefixResult = $state<{ bad: boolean; text: string } | null>(null);
	const prefixValue = $derived(prefixDraft ?? data.project.prefix);

	async function savePrefix(e: SubmitEvent) {
		e.preventDefault();
		if (!setPrefix || prefixBusy) return;
		prefixBusy = true;
		prefixResult = null;
		try {
			const answer = await setPrefix(prefixValue.trim());
			prefixResult = answer.ok
				? { bad: false, text: 'Saved. New numbers start with it; numbers already taken keep theirs.' }
				: { bad: true, text: answer.message };
			if (answer.ok) prefixDraft = null;
		} finally {
			prefixBusy = false;
		}
	}

	function fileHref(row: PartNumberRow): string | null {
		return row.file_id && data.project.id ? `/armory/${data.project.id}/file/${row.file_id}` : null;
	}
	function label(row: PartNumberRow): string {
		return row.description || row.file_name || (row.kind === 'assembly' ? 'Assembly' : 'Part');
	}
</script>

{#snippet numberRow(row: PartNumberRow)}
	<li class="ap-row" data-testid="armory-part-row" data-kind={row.kind}>
		<span class="ap-num" data-testid="armory-part-number">{row.part_number}</span>
		<div class="ap-main">
			<span class="ap-title">
				<span class="ap-kind">{row.kind === 'assembly' ? 'Assembly' : 'Part'}</span>
				{label(row)}
			</span>
			<span class="ap-meta">
				{#if fileHref(row) && row.file_name}
					<a class="ap-file" href={fileHref(row)}>{row.file_folder ? `${row.file_folder}/` : ''}{row.file_name}</a>{#if row.file_deleted}<span>
							(removed)</span
						>{/if}
				{:else if row.file_name && row.description}
					<span>{row.file_name}</span>
				{/if}
				{#if row.made_from}<span data-testid="armory-part-made-from">Made from {row.made_from}</span>{/if}
				<span>{row.assigned_name ?? 'Someone'}, {whenWords(row.assigned_at, now)}</span>
			</span>
		</div>
		<span class="ar-readout ap-rev" title="The revision sits beside the number, never in it">Rev {row.revision}</span>
	</li>
{/snippet}

<section class="ar-view ap-root" data-testid="armory-parts">
	<div class="ar-readouts ap-readouts" aria-label="This project's numbers">
		<span class="ar-readout" data-testid="armory-parts-prefix">Prefix {data.project.prefix}</span>
		<span class="ar-readout">Season {yy}</span>
		<span class="ar-readout" data-testid="armory-parts-count"
			>{assemblies} {assemblies === 1 ? 'assembly' : 'assemblies'}, {parts} {parts === 1 ? 'part' : 'parts'}</span
		>
		<span class="ar-readout ap-pattern">{pattern}</span>
	</div>

	{#if data.project.archived}
		<p class="ar-message" data-testid="armory-parts-archived">This project is archived, so it takes no new numbers. Every number it took stays taken.</p>
	{/if}

	<div class="ap-top">
		{#if take}
			<form class="ar-panel ap-take" onsubmit={submit} data-testid="armory-part-take">
				<h2>Take a number</h2>
				<div class="ap-take-fields">
					<label class="ar-field">
						<span>Subsystem</span>
						<select
							class="plate-well"
							value={chosenSub}
							onchange={(e) => (subsystem = (e.currentTarget as HTMLSelectElement).value)}
							data-testid="armory-part-subsystem"
						>
							{#each live as s (s.code)}<option value={s.code}>{s.code}, {s.name}</option>{/each}
						</select>
					</label>
					<fieldset class="ap-kinds">
						<legend>What it is</legend>
						<label class="ap-choice">
							<input type="radio" name="ap-kind" value="assembly" checked={effectiveKind === 'assembly'} onchange={() => (kind = 'assembly')} />
							<span>A new assembly</span>
						</label>
						<label class="ap-choice">
							<input
								type="radio"
								name="ap-kind"
								value="part"
								disabled={heads.length === 0}
								checked={effectiveKind === 'part'}
								onchange={() => (kind = 'part')}
							/>
							<span>A part in an assembly</span>
						</label>
					</fieldset>
					{#if effectiveKind === 'part'}
						<label class="ar-field">
							<span>Assembly</span>
							<select
								class="plate-well"
								value={chosenAsm}
								onchange={(e) => (assembly = (e.currentTarget as HTMLSelectElement).value)}
								data-testid="armory-part-assembly"
							>
								{#each heads as h (h.id)}
									<option value={String(h.assembly)}>{h.part_number}, {label(h)}</option>
								{/each}
							</select>
						</label>
					{:else if heads.length === 0}
						<p class="ar-message ap-why">{chosenSub} has no assembly on this project yet, so the first number is an assembly.</p>
					{/if}
					<label class="ar-field ap-desc">
						<span>Description (optional)</span>
						<input class="plate-well" type="text" maxlength="200" bind:value={description} placeholder="Gearbox plate" />
					</label>
				</div>
				<div class="ap-take-go">
					<button class="btn ar-btn" type="submit" aria-disabled={busy} data-testid="armory-part-take-key">
						{busy ? 'Taking...' : 'Take the number'}
					</button>
					<span class="ap-preview">{preview}</span>
				</div>
				{#if result}
					<p class={`ar-message ${result.bad ? 'bad' : ''}`} role="status" data-testid="armory-part-result">
						{result.text}
						{#if result.number}<strong class="ap-num ap-got">{result.number}</strong>{/if}
					</p>
				{/if}
			</form>
		{/if}
		<div class="ar-panel ap-how">
			<h2>How a number reads</h2>
			<p class="ap-sample" aria-label="5669-27-DT-0104"><span>5669</span>-<span>27</span>-<span>DT</span>-<span>01</span><span>04</span></p>
			<dl class="ap-legend">
				<div><dt>5669</dt><dd>Team, or the course for a class project</dd></div>
				<div><dt>27</dt><dd>Season</dd></div>
				<div><dt>DT</dt><dd>Subsystem</dd></div>
				<div><dt>01 04</dt><dd>Assembly, then part. An assembly ends 00.</dd></div>
			</dl>
			<p class="ar-message">
				The revision is a letter beside the number, never in it. A number is never reused. Bought parts take a
				<a href="/armory/cots">COTS library</a> name instead.
			</p>
			{#if setPrefix}
				<form class="ap-prefix" onsubmit={savePrefix} data-testid="armory-part-prefix-form">
					<label class="ar-field">
						<span>Number prefix (team or course)</span>
						<input
							class="plate-well"
							type="text"
							maxlength="10"
							value={prefixValue}
							oninput={(e) => (prefixDraft = (e.currentTarget as HTMLInputElement).value)}
							data-testid="armory-part-prefix"
						/>
					</label>
					<button class="btn secondary ar-btn" type="submit" aria-disabled={prefixBusy}>Save prefix</button>
				</form>
				{#if prefixResult}<p class={`ar-message ${prefixResult.bad ? 'bad' : ''}`} role="status">{prefixResult.text}</p>{/if}
			{/if}
		</div>
	</div>

	{#if data.numbers.length === 0}
		<p class="ar-message" data-testid="armory-parts-empty">
			No part numbers yet. The SolidWorks add-in asks for one when a part is saved{take ? ', or take one above' : ''}.
		</p>
	{:else}
		<div class="ar-toolbar ap-toolbar">
			<label class="ar-field ar-search">
				<span>Search part numbers</span>
				<input class="plate-well" type="search" bind:value={query} placeholder="Number, description, file or made from" data-testid="armory-parts-search" />
			</label>
		</div>
		<p class="ar-message ar-count" role="status">
			{shown.length === data.numbers.length ? `${data.numbers.length} numbers.` : `${shown.length} of ${data.numbers.length} shown.`}
		</p>
		{#each groups as g (g.code)}
			<section class="ap-sub" data-testid="armory-parts-subsystem" data-code={g.code}>
				<h2 class="ar-view-h ap-sub-h">
					<span class="ap-code">{g.code}</span>
					{g.name}
					{#if g.retired}<span class="ar-readout">retired</span>{/if}
					<span class="ap-count">{g.count} {g.count === 1 ? 'number' : 'numbers'}</span>
				</h2>
				{#each g.assemblies as a (a.assembly)}
					<ul class="ar-well ap-asm" data-testid="armory-parts-assembly">
						{#if a.head}{@render numberRow(a.head)}{/if}
						{#if a.parts.length > 0}
							<li class="ap-parts-li">
								<ul class="ap-parts">
									{#each a.parts as row (row.id)}{@render numberRow(row)}{/each}
								</ul>
							</li>
						{/if}
					</ul>
				{/each}
			</section>
		{/each}
		{#if shown.length === 0}<p class="ar-message">No number matches that.</p>{/if}
	{/if}
</section>

<style>
	.ap-readouts {
		margin: 0 0 1rem;
	}
	.ap-top {
		display: grid;
		align-items: start;
		grid-template-columns: minmax(0, 1fr);
		gap: 0 1.25rem;
	}
	@container ar-view (min-width: 52rem) {
		.ap-top {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		}
	}
	.ap-take-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
	}
	.ap-kinds {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 1rem;
	}
	.ap-kinds legend {
		padding: 0;
		margin-bottom: 0.2rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
	}
	.ap-choice {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		cursor: pointer;
	}
	.ap-choice input {
		width: 1.15rem;
		height: 1.15rem;
		accent-color: var(--green);
	}
	.ap-why {
		margin: 0;
	}
	.ap-take-go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin-top: 0.9rem;
	}
	.ap-preview {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.04em;
	}
	.ap-got {
		display: inline-block;
		margin-left: 0.35rem;
		color: var(--text-1);
		font-size: 1.05rem;
	}
	.ap-sample {
		margin: 0 0 0.6rem;
		font-family: var(--font-mono);
		font-size: clamp(1.25rem, 3.4vw, 1.6rem);
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.ap-sample span {
		color: var(--text-1);
	}
	.ap-legend {
		display: grid;
		gap: 0.25rem;
		margin: 0 0 0.6rem;
	}
	.ap-legend div {
		display: grid;
		grid-template-columns: 3.4rem minmax(0, 1fr);
		gap: 0.5rem;
	}
	.ap-legend dt {
		font-family: var(--font-mono);
		color: var(--text-1);
	}
	.ap-legend dd {
		margin: 0;
		color: var(--text-2);
	}
	.ap-prefix {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.ap-prefix .ar-field {
		flex: 1 1 12rem;
	}
	.ap-toolbar {
		margin-bottom: 0.25rem;
	}
	.ap-sub {
		margin: 0 0 1.25rem;
	}
	.ap-sub-h {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.6rem;
	}
	.ap-code {
		color: var(--text-1);
		font-weight: 700;
	}
	.ap-count {
		margin-left: auto;
		letter-spacing: 0.04em;
		text-transform: none;
	}
	.ap-asm {
		padding: 0.1rem 0.75rem;
	}
	.ap-parts-li {
		padding: 0 0 0.25rem;
	}
	.ap-parts {
		list-style: none;
		margin: 0 0 0 0.4rem;
		padding: 0 0 0 0.9rem;
		border-left: 1px solid var(--hairline, var(--line));
	}
	.ap-parts > li + li {
		border-top: 1px solid var(--hairline, var(--line));
	}
	.ap-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'num rev' 'main main';
		align-items: center;
		gap: 0.15rem 0.75rem;
		min-height: 44px;
		padding: 0.45rem 0;
	}
	@container ar-view (min-width: 44rem) {
		.ap-row {
			grid-template-columns: 11.5rem minmax(0, 1fr) auto;
			grid-template-areas: 'num main rev';
		}
		.ap-parts .ap-row {
			grid-template-columns: 10.4rem minmax(0, 1fr) auto;
		}
	}
	.ap-num {
		grid-area: num;
		font-family: var(--font-mono);
		font-size: 0.95rem;
		letter-spacing: 0.04em;
		color: var(--text-1);
		white-space: nowrap;
	}
	.ap-row[data-kind='assembly'] .ap-num {
		font-weight: 700;
	}
	.ap-main {
		grid-area: main;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.ap-title {
		color: var(--text-1);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.ap-kind {
		margin-right: 0.35rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.ap-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.9rem;
		color: var(--text-2);
		font-size: 0.92rem;
		line-height: 1.35;
	}
	.ap-file {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.ap-file:hover {
		color: var(--hover-ink, var(--gold));
	}
	.ap-rev {
		grid-area: rev;
		justify-self: end;
	}
</style>
