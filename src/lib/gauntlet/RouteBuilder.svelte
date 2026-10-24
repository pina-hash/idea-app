<script lang="ts">
	/**
	 * THE COMMUNITY SPEEDRUN BUILDER (0297, ledger 0433). Pick 2 to 8 published
	 * Speedrun parts, put them in order, name it. Presentation only: `onsave`
	 * is the route's own call to `gauntlet_route_save`, which re-checks every
	 * part and every bound. The Save button carries the same refusals as words
	 * (`routeDraftProblem`) so it never offers a press whose only answer is no.
	 */
	import {
		movePart,
		routeDraftProblem,
		ROUTE_DESCRIPTION_MAX,
		ROUTE_MAX_PARTS,
		ROUTE_TITLE_MAX
	} from '$lib/gauntlet/community';

	type Part = { id: string; title: string; difficulty: number };

	let {
		parts,
		initial = { title: '', description: '', ids: [] },
		busy = false,
		error = '',
		saveLabel = 'Save speedrun',
		onsave,
		oncancel = null
	}: {
		parts: Part[];
		initial?: { title: string; description: string; ids: string[] };
		busy?: boolean;
		error?: string;
		saveLabel?: string;
		onsave: (draft: { title: string; description: string; ids: string[] }) => void;
		oncancel?: (() => void) | null;
	} = $props();

	// Seeded once from `initial`, the editor's own state from then on.
	const seed = (() => initial)();
	let title = $state(seed.title);
	let description = $state(seed.description);
	let ids = $state<string[]>([...seed.ids]);

	const byId = $derived(new Map(parts.map((p) => [p.id, p])));
	const problem = $derived(routeDraftProblem(title, ids));
	const full = $derived(ids.length >= ROUTE_MAX_PARTS);

	function toggle(id: string) {
		ids = ids.includes(id) ? ids.filter((x) => x !== id) : full ? ids : [...ids, id];
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (problem || busy) return;
		onsave({ title: title.trim(), description: description.trim(), ids: [...ids] });
	}
</script>

<form class="rb" onsubmit={submit} data-testid="route-builder">
	<div class="rb-fields">
		<label class="rb-field">
			<span class="rb-label">Name</span>
			<input type="text" maxlength={ROUTE_TITLE_MAX} bind:value={title} placeholder="Shop sprint" data-field="title" />
		</label>
		<label class="rb-field">
			<span class="rb-label">Description <span class="rb-opt">optional</span></span>
			<textarea rows="2" maxlength={ROUTE_DESCRIPTION_MAX} bind:value={description} data-field="description"></textarea>
		</label>
	</div>

	<div class="rb-cols">
		<div class="rb-col">
			<p class="rb-label">Your order <span class="rb-count">{ids.length} / {ROUTE_MAX_PARTS}</span></p>
			{#if ids.length === 0}
				<p class="rb-empty">Pick parts from the list. They run in this order.</p>
			{:else}
				<ol class="rb-order" data-testid="route-order">
					{#each ids as id, i (id)}
						<li class="rb-row">
							<span class="rb-n">{i + 1}</span>
							<span class="rb-title">{byId.get(id)?.title ?? 'A part no longer published'}</span>
							<span class="rb-tools">
								<button type="button" class="rb-mini" aria-label="Move up" disabled={i === 0} onclick={() => (ids = movePart(ids, i, -1))}>↑</button>
								<button
									type="button"
									class="rb-mini"
									aria-label="Move down"
									disabled={i === ids.length - 1}
									onclick={() => (ids = movePart(ids, i, 1))}>↓</button
								>
								<button type="button" class="rb-mini" aria-label="Remove" onclick={() => toggle(id)}>✕</button>
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
		<div class="rb-col">
			<p class="rb-label">Published parts</p>
			<ul class="rb-pick" data-testid="route-parts">
				{#each parts as p (p.id)}
					{@const on = ids.includes(p.id)}
					<li>
						<button
							type="button"
							class="rb-part"
							class:on
							aria-pressed={on}
							disabled={!on && full}
							onclick={() => toggle(p.id)}
							data-part={p.id}
						>
							<span class="rb-mark" aria-hidden="true">{on ? '✓' : '+'}</span>
							<span class="rb-title">{p.title}</span>
							<span class="rb-diff" aria-label="Difficulty {p.difficulty}">{'◆'.repeat(p.difficulty)}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	</div>

	{#if error}<p class="rb-error" role="alert">{error}</p>{/if}
	<div class="rb-actions">
		<button type="submit" class="btn" disabled={busy || problem !== null} data-action="save-route">{saveLabel}</button>
		{#if oncancel}<button type="button" class="btn secondary" onclick={oncancel}>Cancel</button>{/if}
		{#if problem}<span class="rb-why" data-testid="route-why">{problem}</span>{/if}
	</div>
</form>

<style>
	.rb {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}
	.rb-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
		gap: 0.8rem;
	}
	.rb-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.rb-label {
		margin: 0 0 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.rb-field .rb-label {
		margin: 0;
	}
	.rb-opt,
	.rb-count {
		letter-spacing: 0.04em;
		text-transform: none;
		color: var(--cyan);
	}
	.rb-field input,
	.rb-field textarea {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		padding: 0.45rem 0.6rem;
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--white);
		background: var(--bg2);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
	}
	.rb-cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
	}
	.rb-col {
		min-width: 0;
	}
	.rb-empty {
		margin: 0;
		padding: 0.9rem;
		color: var(--dim);
		border: 1px dashed var(--line-strong);
		border-radius: 4px;
	}
	.rb-order,
	.rb-pick {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.rb-pick {
		max-height: 22rem;
		overflow-y: auto;
	}
	.rb-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0 0.3rem 0 0.6rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
	}
	.rb-n {
		flex: none;
		width: 1.4rem;
		font-family: var(--font-mono);
		color: var(--cyan);
	}
	.rb-title {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--white);
	}
	.rb-tools {
		display: flex;
		flex: none;
	}
	.rb-mini {
		min-width: 44px;
		min-height: 44px;
		background: none;
		border: none;
		color: var(--dim);
		font-size: 1rem;
		cursor: pointer;
	}
	.rb-mini:hover:not(:disabled) {
		color: var(--white);
	}
	.rb-mini:disabled {
		color: var(--ice);
		cursor: default;
	}
	.rb-part {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		min-height: 44px;
		padding: 0 0.7rem;
		text-align: left;
		font-family: var(--font-display);
		font-size: 1rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		cursor: pointer;
	}
	.rb-part.on {
		border-color: var(--green);
	}
	.rb-part:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.rb-mark {
		flex: none;
		width: 1rem;
		font-family: var(--font-mono);
		color: var(--green);
	}
	.rb-diff {
		flex: none;
		font-size: 0.7rem;
		color: var(--gold);
	}
	.rb-error {
		margin: 0;
		color: var(--amber);
	}
	.rb-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}
	.rb-why {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--dim);
	}
	@media (max-width: 720px) {
		.rb-fields,
		.rb-cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
