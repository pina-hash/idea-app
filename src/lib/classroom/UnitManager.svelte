<script lang="ts">
	import { sortUnits, type ClassroomUnit, type ClassroomUnitTransports } from '$lib/classroom/classroom';

	/**
	 * Create, rename, reorder and delete a course's units (0111).
	 *
	 * Presentation + injected transports (the SectionManager convention), so the
	 * dev harness drives the identical component against an in-memory store.
	 * Every write here is one of 0111's four SECURITY DEFINER RPCs, each of which
	 * re-checks that the caller teaches a section of this course -- this component
	 * is not a boundary and never was.
	 *
	 * A unit belongs to the COURSE, so the panel says so: renaming "Unit 1" here
	 * renames it in every section of this course at once, which is the whole point
	 * on a course whose three sections run identical pacing.
	 */
	let {
		courseId,
		courseLabel = null,
		units = [],
		transports,
		chrome = true,
		onchanged = null
	}: {
		courseId: string;
		/** Named in the copy so "every class of this course" is not abstract. */
		courseLabel?: string | null;
		units?: ClassroomUnit[];
		transports: ClassroomUnitTransports;
		/**
		 * FALSE when a caller has already spent a control on opening this: the
		 * card, its title and its own open/close button are dropped, and the panel
		 * renders expanded. The class view's sidebar toolbar does exactly that --
		 * a whole card whose only job was to hold one button was most of a 26rem
		 * pane's first screen, and two toggles for one panel is one too many.
		 */
		chrome?: boolean;
		onchanged?: ((units: ClassroomUnit[]) => void) | null;
	} = $props();

	let open = $state(false);
	const showing = $derived(!chrome || open);
	let busy = $state(false);
	let message = $state<{ ok: boolean; text: string } | null>(null);
	let newName = $state('');
	let renaming = $state<string | null>(null);
	let renameText = $state('');
	let armDelete = $state<string | null>(null);

	const ordered = $derived(sortUnits(units));

	async function refresh() {
		const res = await transports.reloadUnits(courseId);
		if (res.ok) onchanged?.(res.data);
	}

	async function create() {
		if (busy || !newName.trim()) return;
		busy = true;
		message = null;
		const res = await transports.upsertUnit(courseId, newName.trim());
		busy = false;
		if (!res.ok) {
			message = { ok: false, text: res.message };
			return;
		}
		if (res.data.duplicate) {
			message = { ok: false, text: `This course already has a unit called "${newName.trim()}".` };
			return;
		}
		message = { ok: true, text: `"${newName.trim()}" added.` };
		newName = '';
		await refresh();
	}

	function startRename(unit: ClassroomUnit) {
		renaming = renaming === unit.id ? null : unit.id;
		renameText = unit.name;
		armDelete = null;
		message = null;
	}

	async function saveRename(unit: ClassroomUnit) {
		if (busy || !renameText.trim()) return;
		busy = true;
		message = null;
		const res = await transports.upsertUnit(courseId, renameText.trim(), unit.id);
		busy = false;
		if (!res.ok) {
			message = { ok: false, text: res.message };
			return;
		}
		if (res.data.duplicate) {
			message = { ok: false, text: `This course already has a unit called "${renameText.trim()}".` };
			return;
		}
		renaming = null;
		message = { ok: true, text: 'Unit renamed.' };
		await refresh();
	}

	/**
	 * Two-step, and the second step NAMES THE COST -- the count comes from the
	 * RPC's own answer, so the confirmation cannot claim something the delete did
	 * not do. Nothing is lost either way: the items are unfiled, not deleted.
	 */
	async function remove(unit: ClassroomUnit) {
		if (armDelete !== unit.id) {
			armDelete = unit.id;
			renaming = null;
			return;
		}
		armDelete = null;
		busy = true;
		message = null;
		const res = await transports.deleteUnit(unit.id);
		busy = false;
		if (!res.ok) {
			message = { ok: false, text: res.message };
			return;
		}
		message = {
			ok: true,
			text: res.data.unfiled
				? `"${unit.name}" removed. ${res.data.unfiled} item${res.data.unfiled === 1 ? '' : 's'} moved to "Not in a unit".`
				: `"${unit.name}" removed.`
		};
		await refresh();
	}

	/** The FULL list in its new order, so what is stored is what was on screen. */
	async function move(unit: ClassroomUnit, direction: -1 | 1) {
		if (busy) return;
		const ids = ordered.map((u) => u.id);
		const at = ids.indexOf(unit.id);
		const to = at + direction;
		if (at < 0 || to < 0 || to >= ids.length) return;
		[ids[at], ids[to]] = [ids[to], ids[at]];
		busy = true;
		message = null;
		const res = await transports.setUnitOrder(courseId, ids);
		busy = false;
		if (!res.ok) {
			message = { ok: false, text: res.message };
			return;
		}
		await refresh();
	}
</script>

<section class="unit-card" class:card={chrome}>
	{#if chrome}
		<div class="unit-head">
			<h2 class="unit-title">Units</h2>
			<button
				type="button"
				class="btn secondary tiny"
				aria-expanded={open}
				data-testid="units-toggle"
				onclick={() => (open = !open)}
			>
				{open ? 'Close' : ordered.length ? `Edit units (${ordered.length})` : 'Add units'}
			</button>
		</div>
	{/if}

	{#if showing}
		<p class="note">
			Units organize this class's content. They belong to
			{courseLabel ? ` ${courseLabel}` : ' this course'}, so every section of it shows the same
			units in the same order &mdash; file an item once and all of them read it the same way.
		</p>

		{#if message}
			<p class="feedback" class:ok={message.ok} class:error={!message.ok}>{message.text}</p>
		{/if}

		{#if ordered.length}
			<ul class="unit-list">
				{#each ordered as unit, i (unit.id)}
					<li class="unit-row" data-testid="unit-row">
						<span class="unit-name">{unit.name}</span>
						<span class="unit-actions">
							<button
								type="button"
								class="btn secondary tiny"
								aria-label="Move {unit.name} up"
								disabled={busy || i === 0}
								data-testid="unit-up"
								onclick={() => move(unit, -1)}>&uarr;</button
							>
							<button
								type="button"
								class="btn secondary tiny"
								aria-label="Move {unit.name} down"
								disabled={busy || i === ordered.length - 1}
								data-testid="unit-down"
								onclick={() => move(unit, 1)}>&darr;</button
							>
							<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => startRename(unit)}>
								{renaming === unit.id ? 'Close' : 'Rename'}
							</button>
							<button
								type="button"
								class="btn secondary tiny danger"
								disabled={busy}
								data-testid="unit-delete"
								onclick={() => remove(unit)}
							>
								{armDelete === unit.id ? 'Really remove?' : 'Remove'}
							</button>
						</span>
						{#if renaming === unit.id}
							<form
								class="unit-form"
								onsubmit={(e) => {
									e.preventDefault();
									saveRename(unit);
								}}
							>
								<input type="text" bind:value={renameText} maxlength="60" required aria-label="Unit name" />
								<button class="btn tiny" type="submit" disabled={busy}>Save</button>
							</form>
						{/if}
						{#if armDelete === unit.id}
							<p class="note unit-warn">
								Removing a unit keeps every item in it &mdash; they move to "Not in a unit".
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="note empty-state">
				No units yet. Everything shows in one list until you add the first one.
			</p>
		{/if}

		<form
			class="unit-form"
			onsubmit={(e) => {
				e.preventDefault();
				create();
			}}
		>
			<input
				type="text"
				placeholder="Unit 1"
				bind:value={newName}
				maxlength="60"
				required
				aria-label="New unit name"
				data-testid="unit-new-name"
			/>
			<button class="btn tiny" type="submit" disabled={busy || !newName.trim()} data-testid="unit-add">
				Add unit
			</button>
		</form>
	{/if}
</section>

<style>
	.unit-card {
		margin-bottom: var(--space-4);
	}
	/* Without its own chrome the caller owns the surface and the spacing. */
	.unit-card:not(.card) {
		margin-bottom: 0;
	}
	.unit-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.unit-title {
		margin: 0;
		font-size: 1rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.empty-state {
		padding: 0.3rem 0;
	}
	.unit-list {
		list-style: none;
		margin: 0.7rem 0;
		padding: 0;
	}
	.unit-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--boundary);
	}
	.unit-row:last-child {
		border-bottom: none;
	}
	.unit-name {
		font-weight: 700;
		font-size: 0.92rem;
	}
	.unit-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.unit-warn {
		flex-basis: 100%;
		margin: 0.2rem 0 0;
	}
	.unit-form {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		align-items: center;
		margin-top: 0.5rem;
		flex-basis: 100%;
	}
	.unit-form input {
		flex: 1 1 10rem;
		min-width: 0;
	}
	@media (max-width: 560px) {
		.unit-actions {
			margin-left: 0;
		}
	}
</style>
