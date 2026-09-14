<script lang="ts">
	/**
	 * THE PARTS LIST: who holds what, live, and one tap to take or let go.
	 *
	 * Mr. Pina's design, 2026-09-12: an IDEA-Blade is several parts, ONE PERSON
	 * HOLDS A PART AT A TIME, switching who holds what must be "extremely easy
	 * and intuitive", and the assembly owner reassigns teammates to parts LIVE.
	 * `0207` is the data layer, `assembly.ts` its client types and predicates,
	 * `checkout.ts` the controller. This renders it and does nothing else.
	 *
	 * ---------------------------------------------------------------------------
	 * ONE PRIMARY CONTROL PER ROW, AND ITS WORD IS THE STATE.
	 * ---------------------------------------------------------------------------
	 *
	 * "Extremely easy" is a design constraint here, so a row carries exactly one
	 * button and the word on it says what pressing it does: **Take this part**
	 * when it is free, **Release** when it is yours. A part somebody else is
	 * holding has NO button at all -- it says who has it instead. That is the
	 * viewer rule applied per row: a control whose only possible outcome is a
	 * refusal must not be offered, and `ideacad_claim_part` answers `held` for
	 * exactly this case.
	 *
	 * THE ROW MODEL IS `partRows`, NOT AN EXPRESSION IN THE MARKUP. Whether a
	 * part is mine, who is blocking it and which of the four actions applies is
	 * one pure function in `checkout.ts`; written inline this would be the second
	 * statement of a rule about who may press what, and the one that drifts.
	 *
	 * ---------------------------------------------------------------------------
	 * A VIEWER SEES THE ASSEMBLY AND NOT ONE CONTROL THAT WOULD BE REFUSED.
	 * ---------------------------------------------------------------------------
	 *
	 * `canWrite` false makes every action `'none'`, so there is no button in the
	 * markup at all -- absent, not disabled. `IDEACAD_CHECKOUT_VIEW_ONLY` is the
	 * sentence that says why, because a list with nothing pressable and no
	 * explanation reads as broken rather than as read-only.
	 *
	 * ---------------------------------------------------------------------------
	 * A LAPSED HOLD IS ON SCREEN BEFORE IT COSTS ANYTHING.
	 * ---------------------------------------------------------------------------
	 *
	 * `secondsLeft` comes off the controller's own clock against the window
	 * `ideacad_assembly` returned, and the row says so while it is running down
	 * rather than after it has gone. A student who has lost a part reads the
	 * terminal notice, which states that the work on screen is still there and
	 * that taking the part again is the way back -- never a console error and
	 * never a silently refused write.
	 *
	 * ---------------------------------------------------------------------------
	 * THE OWNER'S REASSIGN IS A PICKER, AND ITS LABEL IS ABOVE IT.
	 * ---------------------------------------------------------------------------
	 *
	 * Ledger 0186 measured a side-by-side label clipping a select and cutting off
	 * exactly the marker that mattered, so every label here is stacked. The
	 * picker lists the people the document is actually shared with plus the
	 * owner, and "Nobody" clears the part -- which is `ideacad_assign_part`'s own
	 * null, not a separate control.
	 *
	 * ---------------------------------------------------------------------------
	 * THE SHAPE REGION: LEDGER 0255'S MODEL LAYER, REACHED.
	 * ---------------------------------------------------------------------------
	 *
	 * `0255` built `blade/parts.ts` and the six operations in `blade/ops.ts` --
	 * add, delete, duplicate, reorder, move along the hex core, rotate about it --
	 * and NOTHING IN THE INTERFACE CALLED ANY OF THEM. This region is that call,
	 * and it CALLS them: `addPart`, `deletePart`, `duplicatePart`, `reorderPart`,
	 * `movePart` and `rotatePart` are imported and invoked, never reimplemented.
	 * The panel owns the press, the model owns the rule, and `onbladetree` hands
	 * the accepted tree back to whoever is responsible for saving it.
	 *
	 * TWO PART COLLECTIONS SIT IN THIS PANEL AND THEY ARE NOT THE SAME THING.
	 * The list above is the ASSEMBLY: `ideacad_parts` rows, one holder each, a
	 * database uuid per row. The list below is the SHAPE of one part -- the bodies
	 * and blade rows inside a single feature tree, with ids minted from that tree's
	 * own features. They share no id space, which is why there is no join between
	 * them and why one must not be invented here.
	 *
	 * WHICH ALSO SETTLES WHERE THE HOLD IS ENFORCED. A shape edit writes the tree
	 * of the assembly part the viewer is working in, and `_ideacad_part_writer`
	 * refuses that write from anybody but its holder. So this region does not
	 * re-ask "do I hold this" per row -- there is no row-level answer to ask -- it
	 * offers the controls when the caller handed down a way to save
	 * (`onbladetree`) and the assembly says `canWrite`, and the database is the
	 * boundary exactly as it is everywhere else.
	 *
	 * ---------------------------------------------------------------------------
	 * A REFUSAL FROM THE MODEL LAYER IS RENDERED VERBATIM.
	 * ---------------------------------------------------------------------------
	 *
	 * Every one of the six operations answers `{ ok: false, code, message }` with a
	 * sentence written to be read -- "A blade design needs one body part, so the
	 * last body cannot be deleted." is the model's own wording, and this panel
	 * shows that string and never a shortened, re-toned or generic one. `apply()`
	 * is the single place an answer is unpacked, so there is one statement of what
	 * happens to a refusal rather than six.
	 *
	 * A CONTROL WHOSE ONLY POSSIBLE OUTCOME IS A REFUSAL IS STILL NOT OFFERED,
	 * WHICH IS THIS FILE'S OPENING RULE AND IT APPLIES DOWN HERE TOO. Move up on
	 * the first piece is the case: there is no position above it, `reorderPart`
	 * refuses, and the sentence it refuses with -- "Choose a position inside the
	 * parts collection." -- is written for a programmatic caller and tells a
	 * student nothing about the row in front of them. So the arrow is ABSENT at
	 * each end of the list, exactly as the claim button is absent on a part
	 * somebody else holds.
	 *
	 * `aria-disabled` WAS THE FIRST ANSWER HERE AND IS THE WRONG ONE. It is the
	 * repo's rule for a control that must still EXPLAIN itself, and this one has
	 * nothing useful to say; worse, it is an inconsistent state -- the browser
	 * dispatches a real click while assistive tech and tooling read the control as
	 * unavailable. MEASURED: Playwright refused to click it as "not enabled" while
	 * the same press reached the handler through `.click()`. A refusal is still
	 * rendered wherever one is genuinely informative, which is what deleting the
	 * last body and an unparseable number are.
	 *
	 * ---------------------------------------------------------------------------
	 * SELECTION IS ONE ID, AND THE PANEL IS CONTROLLED ONLY WHEN SOMEBODY LISTENS.
	 * ---------------------------------------------------------------------------
	 *
	 * `selectedPartId` in, `onselect` out, so selecting a part here selects it
	 * wherever else that id is rendered. WITH NO `onselect` THE PANEL KEEPS ITS
	 * OWN SELECTION, because selection is also what opens a row's controls: a
	 * mount that does not care about a viewport must still be able to use them.
	 * Both lists reflect the same id, so a selection is marked in whichever of
	 * them holds it; only the shape rows are pressable, because an assembly row
	 * already has its one primary control and a second button in it is the rule
	 * this file opens with.
	 */
	import {
		IDEACAD_CHECKOUT_VIEW_ONLY,
		IDEACAD_SHAPE_VIEW_ONLY,
		holdIsExpiring,
		partRows,
		type IdeacadCheckoutNotice,
		type IdeacadCheckoutPhase
	} from '../checkout';
	import type { IdeacadAssembly } from '../assembly';
	import {
		addPart,
		deletePart,
		duplicatePart,
		movePart,
		reorderPart,
		rotatePart,
		type BladePartOperationResult,
		type BladePartRefusal
	} from '../blade/ops';
	import { upgradeBladeParts, type BladePartDefinition } from '../blade/parts';
	import { DEFAULT_BLADE_TREE } from '../blade/materials';
	import type { BladeTree } from '../blade/tree';

	let {
		assembly = null,
		myPartId = null,
		secondsLeft = null,
		phase = 'idle',
		notice = null,
		teammates = [],
		onclaim = undefined,
		onrelease = undefined,
		onassign = undefined,
		ondismiss = undefined,
		bladeTree = null,
		selectedPartId = null,
		onselect = undefined,
		onbladetree = undefined
	}: {
		assembly?: IdeacadAssembly | null;
		myPartId?: string | null;
		secondsLeft?: number | null;
		phase?: IdeacadCheckoutPhase;
		notice?: IdeacadCheckoutNotice | null;
		/** Addresses the owner may reassign to: whoever the document is shared with. */
		teammates?: string[];
		/** ABSENT REMOVES THE CONTROL, on every one of these. */
		onclaim?: (partId: string) => void;
		onrelease?: (partId: string) => void;
		onassign?: (partId: string, email: string | null) => void;
		ondismiss?: () => void;
		/**
		 * The feature tree whose SHAPE parts are listed below the assembly. A
		 * pre-0255 document with no `parts` array is fine: `upgradeBladeParts`
		 * derives them from the features without changing a stored byte.
		 */
		bladeTree?: BladeTree | null;
		/** The selected part, in whichever of the two lists holds that id. */
		selectedPartId?: string | null;
		/** ABSENT MAKES THE PANEL KEEP ITS OWN SELECTION. See the header. */
		onselect?: (partId: string | null) => void;
		/**
		 * Where an ACCEPTED tree goes. ABSENT REMOVES EVERY SHAPE CONTROL -- there
		 * is nowhere to save to, so there is nothing to press, and the list is a
		 * read of the design rather than a broken editor.
		 */
		onbladetree?: (tree: BladeTree) => void;
	} = $props();

	const rows = $derived(assembly ? partRows(assembly) : []);
	const busy = $derived(phase === 'busy');
	const expiring = $derived(
		assembly ? holdIsExpiring(secondsLeft, assembly.holdWindowSeconds) : false
	);
	/** The owner's own reassign list. The owner is on it: taking a part back is
	 *  reassigning it to yourself, not a second verb. */
	const assignable = $derived(
		assembly ? [assembly.viewer, ...teammates.filter((t) => t !== assembly.viewer)] : []
	);

	/**
	 * THE SEED FOR A NEW PART IS THE DEFAULT DESIGN'S OWN, PUT THROUGH THE MODEL
	 * LAYER. `upgradeBladeParts(DEFAULT_BLADE_TREE)` yields one valid body and one
	 * valid blade row, so this panel invents no geometry and cannot disagree with
	 * `validatePartCollection` about what a usable part is. Writing four numbers
	 * here would be exactly the second implementation this bundle exists to avoid.
	 */
	const SEED = upgradeBladeParts(DEFAULT_BLADE_TREE).parts;

	/** The last refusal, held until the next accepted press or a dismissal. */
	let refusal = $state<BladePartRefusal | null>(null);
	/** Delete is two presses: this is the armed row, and it names what it costs. */
	let armedDelete = $state<string | null>(null);
	/** The panel's own selection, used only when nobody handed down `onselect`. */
	let ownSelection = $state<string | null>(null);

	const shapeParts = $derived(bladeTree ? upgradeBladeParts(bladeTree).parts : []);
	const selection = $derived(onselect ? selectedPartId : ownSelection);
	/**
	 * DEFENCE IN DEPTH, IN THE ORDER THAT MATTERS: absence of a save path removes
	 * the controls, and `canWrite` removes them again for a viewer whose mount
	 * handed one down anyway. An assembly-less mount (the blade editor on a
	 * document with no assembly read) is writable, because there is no assembly
	 * to have said otherwise and the database still decides.
	 */
	const shapeWrites = $derived(!!onbladetree && !!bladeTree && (assembly?.canWrite ?? true));

	/** The word beside a part, never a hue alone. */
	const KIND_WORD = { body: 'Body', blade: 'Blade row' } as const;

	/** Toggling: pressing the open row closes it, which is how it is deselected. */
	function select(id: string) {
		const next = selection === id ? null : id;
		armedDelete = null;
		if (onselect) onselect(next);
		else ownSelection = next;
	}

	/**
	 * THE ONE PLACE AN OPERATION'S ANSWER IS UNPACKED. A refusal becomes the
	 * sentence on screen; an acceptance clears it, disarms the delete and hands
	 * the tree up. Six call sites, one statement of what happens.
	 */
	function apply(result: BladePartOperationResult) {
		if (!result.ok) {
			refusal = result;
			return;
		}
		refusal = null;
		armedDelete = null;
		onbladetree?.(result.tree);
	}

	function freeId(base: string): string {
		let candidate = base;
		let n = 2;
		while (shapeParts.some((part) => part.id === candidate)) candidate = `${base}-${n++}`;
		return candidate;
	}

	function add(kind: 'body' | 'blade') {
		const source = SEED.find((part) => part.kind === kind);
		if (!source || !bladeTree) return;
		const seeded = structuredClone(source) as BladePartDefinition;
		const base = kind;
		const id = freeId(base);
		seeded.id = id;
		seeded.name = id === base ? KIND_WORD[kind] : `${KIND_WORD[kind]} ${id.slice(base.length + 1)}`;
		seeded.z = 0;
		seeded.angleDeg = 0;
		// THE MATERIAL COMES FROM THIS DESIGN, NEVER FROM THE DEFAULT CONFIG'S.
		// A new part made of something nobody chose is a mass figure that is wrong
		// and looks right.
		if (seeded.kind === 'body') {
			seeded.parameters.material = bladeTree.materials.body;
			seeded.parameters.solidFraction = bladeTree.materials.bodySolidFraction;
		} else {
			seeded.parameters.stock = bladeTree.materials.bladeStock;
		}
		apply(addPart(bladeTree, seeded));
	}

	function reorder(id: string, position: number) {
		if (bladeTree) apply(reorderPart(bladeTree, id, position));
	}
	function duplicate(id: string) {
		if (bladeTree) apply(duplicatePart(bladeTree, id));
	}
	function remove(id: string) {
		if (bladeTree) apply(deletePart(bladeTree, id));
	}
	/**
	 * NO `bind:value` ON THESE NUMBER INPUTS, deliberately: the binding coerces and
	 * the tree is not this panel's to mutate. `valueAsNumber` is NaN for an empty
	 * or unparseable box, which `movePart` and `rotatePart` refuse in their own
	 * words -- which is the answer a reader needs rather than a silent no-op.
	 */
	function place(id: string, key: 'z' | 'angleDeg', value: number) {
		if (!bladeTree) return;
		apply(key === 'z' ? movePart(bladeTree, id, value) : rotatePart(bladeTree, id, value));
	}

	/**
	 * THE ROW'S SECOND LINE, WITH THE KIND WORD DROPPED WHEN THE NAME ALREADY
	 * SAYS IT. A seeded part is called "Blade row", so the obvious spelling put
	 * "Blade row · Blade row · 1.25 in up · 0° round" on screen -- a stutter that
	 * reads as a bug. CAUGHT BY RASTERIZING AND LOOKING: every measured number on
	 * that row was correct, and no assertion anywhere could have said it.
	 *
	 * The word is never LOST, which is what makes the drop safe: it is dropped
	 * only in the case where the name above it is already the word.
	 */
	function meta(piece: BladePartDefinition): string {
		const kind = KIND_WORD[piece.kind];
		const named = piece.name.trim().toLowerCase().startsWith(kind.toLowerCase());
		return [...(named ? [] : [kind]), `${num(piece.z)} in up`, `${num(piece.angleDeg)}° round`].join(
			' · '
		);
	}

	/** A short number, so a row reads as a measurement and not as a float. */
	function num(value: number): string {
		if (!Number.isFinite(value)) return '--';
		return String(Math.round(value * 1000) / 1000);
	}

	/** Minutes and seconds, so a number nobody has to divide is on screen. */
	function clock(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return m > 0 ? `${m} min ${s < 10 ? '0' : ''}${s} s` : `${s} s`;
	}
</script>

<section class="parts" data-testid="ideacad-parts" aria-labelledby="ic-parts-h">
	<header>
		<h3 id="ic-parts-h">Parts</h3>
		{#if myPartId && secondsLeft !== null}
			<!--
				THE COUNTDOWN IS A WORD AND A NUMBER, never a colour alone, and it is
				`aria-live` because it is the one thing on this panel that changes
				without anybody pressing anything.
			-->
			<span
				class="chip hold"
				class:expiring
				data-testid="ideacad-hold-clock"
				aria-live="polite"
			>
				Your part for {clock(secondsLeft)}
			</span>
		{/if}
	</header>

	{#if notice}
		<!--
			A REFUSAL IS A SURFACE. Every one of these sentences is
			`checkout.ts`'s, which is a `Record` over the database's own reason
			union, so a reason with no sentence is a type error rather than a blank
			line on a student's screen.
		-->
		<p
			class="notice {notice.tone}"
			role="status"
			data-testid="ideacad-parts-notice"
			data-reason={notice.reason}
		>
			<span class="mark" aria-hidden="true"
				>{notice.tone === 'terminal' ? '!' : notice.tone === 'refusal' ? '×' : '✓'}</span
			>
			<span>{notice.text}</span>
			{#if ondismiss && notice.tone !== 'terminal'}
				<button type="button" class="dismiss" onclick={ondismiss}>Dismiss</button>
			{/if}
		</p>
	{/if}

	{#if assembly && !assembly.canWrite}
		<p class="note" data-testid="ideacad-parts-viewonly">{IDEACAD_CHECKOUT_VIEW_ONLY}</p>
	{/if}

	{#if rows.length === 0}
		<p class="note">This assembly has no parts yet.</p>
	{:else}
		<ul>
			{#each rows as row (row.part.id)}
				<!--
					THE ASSEMBLY ROW REFLECTS THE SELECTION AND DOES NOT SET IT. One
					primary control per row is this panel's opening rule, so the
					selectable rows are the shape ones below; if the selected id
					happens to be an assembly part's, this is where it is marked.
				-->
				<li
					class:mine={row.mine}
					class:picked={selection === row.part.id}
					aria-current={selection === row.part.id ? 'true' : undefined}
					data-testid="ideacad-part-row"
					data-part={row.part.id}
				>
					<span class="nm">
						<span class="pname">{row.part.name}</span>
						<!--
							WHO HOLDS IT, IN WORDS, ALWAYS. The colour of the row says the
							same thing a second time and never on its own.
						-->
						<small data-testid="ideacad-part-holder">
							{#if row.mine}
								Yours
							{:else if row.blockedBy}
								{row.blockedBy} has it
							{:else}
								Free
							{/if}
						</small>
					</span>

					{#if row.action === 'release' && onrelease}
						<button
							type="button"
							class="act release"
							aria-disabled={busy}
							onclick={() => onrelease(row.part.id)}
						>
							Release
						</button>
					{:else if row.action === 'claim' && onclaim}
						<button
							type="button"
							class="act claim"
							aria-disabled={busy}
							onclick={() => onclaim(row.part.id)}
						>
							Take this part
						</button>
					{:else if row.action === 'blocked'}
						<!--
							NO BUTTON, AND A SENTENCE IN ITS PLACE. A control that is absent
							for a reason says the reason where every sibling row has one, or
							the row reads as a bug.
						-->
						<span class="held" data-testid="ideacad-part-blocked">In use</span>
					{/if}

					{#if assembly?.isOwner && onassign}
						<label class="assign">
							<span class="lab">Owner: give to</span>
							<select
								data-testid="ideacad-part-assign"
								value={row.holder ?? ''}
								disabled={busy}
								onchange={(e) => onassign(row.part.id, e.currentTarget.value || null)}
							>
								<option value="">Nobody</option>
								{#each assignable as who (who)}
									<option value={who}>{who}</option>
								{/each}
							</select>
						</label>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if bladeTree}
		<!--
			THE SHAPE OF THIS PART: `blade/ops.ts`'s six operations, on screen.
			Rendered whenever there is a tree, because reading how a design is put
			together is not a write -- what `onbladetree` gates is changing it.
		-->
		<section class="shape" aria-labelledby="ic-shape-h" data-testid="ideacad-shape">
			<header>
				<h4 id="ic-shape-h">Shape</h4>
				<span class="chip"
					>{shapeParts.length}
					{shapeParts.length === 1 ? 'piece' : 'pieces'} on the core</span
				>
			</header>

			{#if refusal}
				<!--
					THE MODEL LAYER'S OWN SENTENCE, VERBATIM. `data-reason` carries the
					refusal code so a sweep can key on the decision rather than on the
					wording, and the wording stays the model's.
				-->
				<p
					class="notice refusal"
					role="status"
					data-testid="ideacad-shape-refusal"
					data-reason={refusal.code}
				>
					<span class="mark" aria-hidden="true">×</span>
					<span>{refusal.message}</span>
					<button type="button" class="dismiss" onclick={() => (refusal = null)}>Dismiss</button>
				</p>
			{/if}

			{#if shapeParts.length === 0}
				<p class="note">This part has no pieces yet.</p>
			{:else}
				<ul class="shape-list">
					{#each shapeParts as piece, index (piece.id)}
						<li
							class:picked={selection === piece.id}
							data-testid="ideacad-shape-row"
							data-part={piece.id}
						>
							<button
								type="button"
								class="pick"
								aria-expanded={selection === piece.id}
								aria-controls="ic-ops-{piece.id}"
								aria-current={selection === piece.id ? 'true' : undefined}
								data-testid="ideacad-shape-select"
								onclick={() => select(piece.id)}
							>
								<span class="pname">{piece.name}</span>
								<small>{meta(piece)}</small>
							</button>

							{#if selection === piece.id && shapeWrites}
								<div class="ops" id="ic-ops-{piece.id}" data-testid="ideacad-shape-ops">
									<div class="row">
										<!--
											ABSENT AT EACH END, never disabled: there is no position
											above the first piece, and the top of a list is the one
											thing a reader can already see.
										-->
										{#if index > 0}
											<button
												type="button"
												class="op"
												data-testid="ideacad-shape-up"
												onclick={() => reorder(piece.id, index - 1)}>Move up</button
											>
										{/if}
										{#if index < shapeParts.length - 1}
											<button
												type="button"
												class="op"
												data-testid="ideacad-shape-down"
												onclick={() => reorder(piece.id, index + 1)}>Move down</button
											>
										{/if}
										<button
											type="button"
											class="op"
											data-testid="ideacad-shape-duplicate"
											onclick={() => duplicate(piece.id)}>Duplicate</button
										>
										{#if armedDelete === piece.id}
											<!--
												A DESTRUCTIVE PRESS NAMES WHAT IT COSTS. Two presses,
												inline, no dialog: arm, then a button carrying the
												piece's own name.
											-->
											<button
												type="button"
												class="op danger"
												data-testid="ideacad-shape-delete-confirm"
												onclick={() => remove(piece.id)}>Delete “{piece.name}”</button
											>
											<button
												type="button"
												class="op"
												data-testid="ideacad-shape-delete-cancel"
												onclick={() => (armedDelete = null)}>Keep it</button
											>
										{:else}
											<button
												type="button"
												class="op"
												data-testid="ideacad-shape-delete"
												onclick={() => (armedDelete = piece.id)}>Delete</button
											>
										{/if}
									</div>

									<div class="row">
										<label class="field">
											<span class="lab">Up the core (in)</span>
											<input
												type="number"
												step="0.05"
												value={piece.z}
												data-testid="ideacad-shape-z"
												onchange={(e) => place(piece.id, 'z', e.currentTarget.valueAsNumber)}
											/>
										</label>
										<label class="field">
											<span class="lab">Round the core (°)</span>
											<input
												type="number"
												step="5"
												value={piece.angleDeg}
												data-testid="ideacad-shape-angle"
												onchange={(e) =>
													place(piece.id, 'angleDeg', e.currentTarget.valueAsNumber)}
											/>
										</label>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if shapeWrites}
				<div class="add" data-testid="ideacad-shape-add">
					<button
						type="button"
						class="op"
						data-testid="ideacad-shape-add-body"
						onclick={() => add('body')}>Add a body</button
					>
					<button
						type="button"
						class="op"
						data-testid="ideacad-shape-add-blade"
						onclick={() => add('blade')}>Add a blade row</button
					>
				</div>
			{:else}
				<p class="note" data-testid="ideacad-shape-readonly">{IDEACAD_SHAPE_VIEW_ONLY}</p>
			{/if}
		</section>
	{/if}
</section>

<style>
	.parts {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		/* A CONTAINER, NOT A MEDIA QUERY, and CLAUDE.md's own reason: this panel
		   is mounted inside somebody else's pane, so the viewport says nothing
		   about how much room it actually has. A breakpoint written against the
		   viewport would be dead code in a narrow pane and would fire in a wide
		   one that happens to sit on a narrow screen. */
		container-type: inline-size;
	}
	header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	h3,
	h4 {
		margin: 0;
		font-size: 1rem;
		color: var(--text-1);
	}
	h4 {
		font-size: 0.95rem;
	}
	.chip {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0.15rem 0.4rem;
	}
	.chip.expiring {
		border-color: var(--copper);
		color: var(--copper);
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.notice {
		display: flex;
		flex-wrap: wrap;
		/* THE MARK ALIGNS TO THE FIRST LINE, NOT THE MIDDLE ONE. Centred, a
		   three-line notice put the "!" beside line two, where it reads as an
		   interruption in the middle of a sentence rather than as a marker on
		   the block. Only visible at 375, where the sentence wraps. */
		align-items: flex-start;
		gap: 0.4rem;
		margin: 0;
		padding: 0.4rem 0.5rem;
		font-size: 0.9rem;
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.notice .mark {
		flex: 0 0 auto;
		font: 14px 'Share Tech Mono', monospace;
	}
	/* THE SENTENCE SHRINKS SO THE MARK STAYS BESIDE IT. Its automatic minimum is
	   its min-content -- the longest word -- which on a wrapping row is enough to
	   push the mark onto a line of its own above the text. Caught by looking: the
	   terminal notice rendered a bare "!" on one line with the sentence under it. */
	.notice > span:not(.mark) {
		flex: 1 1 12rem;
		min-width: 0;
	}
	.notice.refusal {
		border-color: var(--copper);
	}
	.notice.terminal {
		border-color: var(--crimson);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-0);
	}
	li.mine {
		border-color: var(--green);
	}
	/* THE SELECTED ROW IS MARKED TWICE, never by hue alone: the edge moves and
	   `aria-current` is on the element, which is what a reader not seeing colour
	   gets. An assembly row that is BOTH mine and selected keeps the green edge
	   and takes the inset, so the two marks do not fight over one property. */
	li.picked {
		box-shadow: inset 0 0 0 1px var(--boundary);
	}
	.nm {
		flex: 1 1 9rem;
		/* Its automatic minimum is min-content, so without this a long part name
		   forces the row, the panel and the page wider than the viewport. */
		min-width: 0;
	}
	.pname {
		display: block;
		color: var(--text-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		display: block;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	li.mine small {
		color: var(--green);
	}
	button {
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}
	button:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
	}
	.act.claim {
		border-color: var(--green);
	}
	.held {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.5rem;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.dismiss {
		min-height: 44px;
	}
	/* THE LABEL IS ABOVE THE SELECT, NOT BESIDE IT -- ledger 0186's clipped
	   marker. `flex-basis` reserves the picker's width rather than letting it be
	   squeezed by whatever shares the row. */
	.assign {
		display: grid;
		/* AN EXPLICIT SINGLE COLUMN. An implicit `auto` track makes the select's
		   `width: 100%` a percentage against a track sized FROM the select, so
		   the browser uses its intrinsic width -- the longest option text -- and
		   the control stops filling the box reserved for it. It happens to look
		   right here only because an email address is wider than 13rem; a short
		   roster would silently shrink the picker. Same fix and same reason as
		   `.field` in `SharePanel`, where it was measured at 103px in a 176px
		   box. */
		grid-template-columns: minmax(0, 1fr);
		gap: 0.2rem;
		flex: 0 1 13rem;
		min-width: 0;
	}
	.lab {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	select {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		padding: 0 0.5rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}

	/*
	 * THE NARROW ROW: THE NAME TAKES THE WHOLE LINE AND THE CONTROL DROPS BELOW.
	 *
	 * MEASURED, IN BOTH DIRECTIONS, RATHER THAN CHOSEN. In the harness this
	 * panel is 343px wide at a 375px viewport and 416px at 1440, so 24rem
	 * (384px) fires on one and not the other -- a threshold no container ever
	 * reaches is a rule that silently never applies, and nothing on screen or in
	 * any type check reports it.
	 *
	 * WHAT IT FIXES, caught by rasterizing and looking rather than by any check:
	 * at 375 the holder line is an EMAIL ADDRESS, which wrapped to two lines
	 * inside a 230px column while "In use" floated on the right beside a 55px
	 * block. Given the row, the address fits on one line and the marker sits
	 * under it where a thumb expects it.
	 */
	/*
	 * THE SHAPE REGION. A nested panel rather than a second component, because it
	 * is the same list of the same word "part" one level in, and splitting it out
	 * would put the selection prop, the refusal state and the tree on two files
	 * that have to agree.
	 */
	.shape {
		display: grid;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--boundary);
	}
	.shape-list {
		gap: 0.4rem;
	}
	/* A SHAPE ROW IS A COLUMN, not the assembly row's flex line: its controls
	   open UNDER the name rather than beside it, so a row that is closed reads at
	   one height and an open one does not reflow the list beside it. */
	.shape-list li {
		display: grid;
		gap: 0.4rem;
	}
	.pick {
		/* THE WHOLE NAME IS THE TARGET, left aligned, full width: a thumb going for
		   a part name should not have to find a chevron. */
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.35rem 0.5rem;
		background: none;
		border: 1px solid transparent;
	}
	.shape-list li.picked .pick {
		border-color: var(--green);
		background: var(--surface-2);
	}
	.ops {
		display: grid;
		gap: 0.4rem;
		padding: 0 0.15rem 0.15rem;
		/* Its automatic minimum as a grid item is its min-content, which a number
		   input and a four-word button both push well past a narrow pane. */
		min-width: 0;
	}
	.ops .row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		min-width: 0;
	}
	.op {
		flex: 0 0 auto;
		padding: 0 0.7rem;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
	}
	.op.danger {
		border-color: var(--crimson);
		color: var(--crimson);
	}
	/* Same stacked-label rule as `.assign`, and the same explicit single column:
	   an implicit `auto` track sizes from the input's intrinsic width, so a
	   number box silently stops filling the space reserved for it. */
	.field {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.2rem;
		flex: 1 1 9rem;
		min-width: 0;
	}
	input[type='number'] {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		padding: 0 0.5rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}
	input[type='number']:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	@container (max-width: 24rem) {
		.nm {
			flex-basis: 100%;
		}
		.act,
		.held {
			flex: 1 1 auto;
			justify-content: center;
			text-align: center;
		}
		.assign {
			flex-basis: 100%;
		}
		/* AT A NARROW PANE THE SHAPE BUTTONS GO TWO UP, NOT FOUR DOWN.
		   MEASURED IN THE PANE RATHER THAN CHOSEN: the ops row is 294px inside a
		   343px panel, so a 40% basis puts two 12px mono buttons on a line at
		   ~145px each -- comfortably past "Move down"'s own min-content -- and
		   takes the block from four rows (190px) to two (94px). The basis is not a
		   cap, so the armed delete, which carries the piece's NAME, still takes
		   the whole row rather than breaking a word. */
		.op {
			flex: 1 1 40%;
			text-align: center;
		}
		.field {
			flex-basis: 100%;
		}
	}
</style>
