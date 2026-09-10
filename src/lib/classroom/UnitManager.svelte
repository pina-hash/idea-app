<script lang="ts">
	import { sortUnits, type ClassroomUnit, type ClassroomUnitTransports } from '$lib/classroom/classroom';
	import { movedList, sortDrag } from '$lib/classroom/sort-drag';

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

	/**
	 * RENAME IS INLINE: the name itself becomes the input, with a visible Save
	 * and Cancel beside it (prompt 0118). Enter saves and Escape cancels
	 * because that is what an inline field does everywhere else; the two
	 * buttons are there because a phone has neither key and the visible-word
	 * rule wants the outcome named. The input is focused on the ELEMENT, the
	 * autofocus rule, so a second Rename press lands the caret without a
	 * second tap.
	 */
	function startRename(unit: ClassroomUnit) {
		if (renaming === unit.id) {
			cancelRename();
			return;
		}
		renaming = unit.id;
		renameText = unit.name;
		armDelete = null;
		message = null;
	}

	function cancelRename() {
		renaming = null;
		renameText = '';
	}

	function focusRename(el: HTMLInputElement) {
		el.focus();
		el.select();
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

	/**
	 * REORDER, BY DRAG OR BY THE ARROW KEYS ON A GRIP, one commit.
	 *
	 * `sortDrag` hands back indices over the rows it counted, which are
	 * `ordered`'s indices exactly (every row is a unit, nothing interleaves),
	 * and `movedList` turns them into the FULL list in its new order -- so what
	 * is stored is what was on screen. The `↑`/`↓` glyph buttons this replaced
	 * were the visible-word rule broken twice per row; the grip carries the
	 * word "Move" and the arrow keys are its keyboard spelling.
	 */
	async function reorder(from: number, to: number) {
		if (busy) return;
		const ids = movedList(
			ordered.map((u) => u.id),
			from,
			to
		);
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
			units in the same order. File an item once and all of them read it the same way.
		</p>

		{#if message}
			<p class="feedback" class:ok={message.ok} class:error={!message.ok}>{message.text}</p>
		{/if}

		{#if ordered.length}
			<!-- The list is the sortable; each row is an item and its grip the
			     handle. The ACTION is what refuses a press mid-write (`disabled:
			     busy` below, read on both the pointer and the keyboard path). -->
			<ul
				class="unit-list"
				use:sortDrag={{
					items: '[data-sort-item]',
					disabled: busy,
					ondrop: (from, to) => void reorder(from, to)
				}}
			>
				{#each ordered as unit (unit.id)}
					<li class="unit-row" data-testid="unit-row" data-sort-item data-unit-id={unit.id}>
						<!--
							THE GRIP IS `aria-disabled` MID-WRITE, NEVER `disabled`, and the
							reason is focus. `reorder()` sets `busy` synchronously inside
							the action's `ondrop`, so a `disabled={busy}` binding lands in
							the DOM before the action's own microtask refocus runs; Chrome
							blurs a button the moment it becomes disabled, the refocus is
							then a no-op, focus drops to <body>, and the NEXT arrow press
							goes nowhere (measured: one write per two presses). The
							ClassView row grip is written the same way. The action already
							ignores a press while `busy`, so nothing is lost by the
							attribute's absence; the dimming is keyed on `aria-disabled`.
						-->
						<button
							type="button"
							class="unit-grip"
							data-sort-handle
							data-testid="unit-grip"
							aria-disabled={busy}
							aria-label="Reorder {unit.name}: drag, or use the arrow keys"
						>
							<span class="unit-grip-glyph" aria-hidden="true">&#10495;</span>
							<span class="unit-grip-word">Move</span>
						</button>
						{#if renaming === unit.id}
							<form
								class="unit-rename"
								data-testid="unit-rename-form"
								onsubmit={(e) => {
									e.preventDefault();
									saveRename(unit);
								}}
							>
								<input
									type="text"
									class="unit-rename-input"
									bind:value={renameText}
									use:focusRename
									maxlength="60"
									required
									aria-label="New name for {unit.name}"
									data-testid="unit-rename-input"
									onkeydown={(e) => {
										if (e.key === 'Escape') {
											e.preventDefault();
											cancelRename();
										}
									}}
								/>
								<button class="btn tiny" type="submit" disabled={busy || !renameText.trim()} data-testid="unit-rename-save">
									Save
								</button>
								<button type="button" class="btn secondary tiny" disabled={busy} data-testid="unit-rename-cancel" onclick={cancelRename}>
									Cancel
								</button>
							</form>
						{:else}
							<span class="unit-name">{unit.name}</span>
						{/if}
						<span class="unit-actions">
							<button
								type="button"
								class="btn secondary tiny"
								aria-expanded={renaming === unit.id}
								disabled={busy}
								data-testid="unit-rename"
								onclick={() => startRename(unit)}
							>
								Rename
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
						{#if armDelete === unit.id}
							<p class="note unit-warn">
								Removing a unit keeps every item in it. They move to "Not in a unit".
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
	/* NO FIXED HEIGHTS ANYWHERE IN THE ROW: every control carries the 44px
	   floor as a `min-height`, and the row's height is whatever its tallest
	   child needs -- an inline rename form on a phone wraps to a second line
	   rather than clipping. The row keeps a surface while it is being dragged
	   (`.is-dragging` in classroom.css lifts it); the border is on the row so
	   the eased neighbours carry theirs with them. */
	.unit-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--boundary);
		background: var(--surface-1, transparent);
	}
	.unit-row:last-child {
		border-bottom: none;
	}
	/* THE GRIP CARRIES A WORD. There is room here (a panel, not a 26rem row),
	   so the visible-word rule is met on the control itself rather than by a
	   menu beside it. Grab cursor, 44px, `min-height` never a height. */
	.unit-grip {
		appearance: none;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.5rem;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-card);
		color: var(--text-2);
		cursor: grab;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		user-select: none;
	}
	.unit-grip:hover:not([aria-disabled='true']) {
		color: var(--text-1);
		border-color: var(--boundary);
	}
	.unit-grip:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	/* `.is-dragging` is set by the action at runtime, so it is global to the
	   compiler's eye. */
	.unit-grip:active:not([aria-disabled='true']),
	:global(.is-dragging) .unit-grip {
		cursor: grabbing;
	}
	/* Dimmed while a write is in flight; `aria-disabled`, not `disabled`, so
	   the control keeps focus across the round trip (see the markup). */
	.unit-grip[aria-disabled='true'] {
		opacity: 0.5;
		cursor: default;
	}
	.unit-grip-glyph {
		font-size: 0.9rem;
	}
	.unit-name {
		font-weight: 700;
		font-size: 0.92rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.unit-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	/* The inline rename takes the name's slot: input, Save, Cancel on one
	   line where there is room, wrapping under the grip where there is not. */
	.unit-rename {
		display: flex;
		flex: 1 1 14rem;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
		min-width: 0;
	}
	.unit-rename-input {
		flex: 1 1 8rem;
		min-width: 0;
		min-height: 44px;
	}
	/* Every control in the row clears the floor; `.cr-root .btn.tiny` pins a
	   24px chip floor and outranks a single-class rule, so both classes are
	   named (the ClassView `.group-bar` note). */
	.unit-row .btn,
	.unit-row .btn.tiny,
	.unit-form .btn,
	.unit-form .btn.tiny {
		min-height: 44px;
		padding-block: var(--space-2);
		display: inline-flex;
		align-items: center;
	}
	.unit-form input {
		min-height: 44px;
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
