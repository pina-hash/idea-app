<script lang="ts">
	/**
	 * Dev harness for TURNING THE BLADE EDITOR ON AND OFF (0223).
	 *
	 * WHAT IT IS FOR. `ideacad_set_editor` has been applied since 0201 and no
	 * surface outside `src/routes/dev/` called it, so no classroom item in
	 * production ever carried `assignment_schema_version` 4 and every student
	 * path below was dead code. The control that closes that lives in
	 * `ItemDetail`'s instructor arm, and it is the one IdeaCAD surface no
	 * existing harness can reach: `/dev/ideacad-item` mounts the STUDENT arm
	 * (`canManage={false}`), and the inspector is inside one `{#if canManage}`.
	 *
	 * A NEW ROUTE RATHER THAN A STATE ON `/dev/ideacad-item`, which is ledger
	 * 0190's argument and 0201's: a new URL collides with nobody, and
	 * `tools/browser-verify/routes.mjs` derives a spec's filename from its own
	 * path, so two lanes adding two routes always produce two different files.
	 *
	 * THE TRANSPORT ENFORCES NOTHING, and that is the same rule
	 * `/dev/ideacad-item` states. `_classroom_manages_item` is the boundary and
	 * a harness that re-implemented it would be a second copy of the rule under
	 * test. What it does is ANSWER -- including with the refusals 0201 raises,
	 * verbatim -- and COUNT, so "the call was never made" is a measured zero
	 * rather than an absence nobody looked for.
	 *
	 * States by query string:
	 *   role=teacher&state=off       an ordinary assignment: the On control
	 *   role=teacher&state=on        already schema 4: the Off control, the
	 *                                typed confirmation, and the warning that
	 *                                names both halves of what Off does
	 *   role=teacher&state=other     schema 3, so the RPC would refuse: NO
	 *                                control, and the reason in its place
	 *   role=teacher&state=badconfig a config `bladeConfigShaped` refuses. The
	 *                                press must refuse LOCALLY and the call
	 *                                count must stay at 0 -- a row written with
	 *                                a config that cannot build a tree is an
	 *                                assignment that opens for nobody
	 *   role=teacher&state=refused   the database raises the schema-3 sentence
	 *                                anyway, which is reachable in production
	 *                                when another manager imports a document
	 *                                between this page loading and the press
	 *   role=teacher&state=material  a material, not an assignment: no control
	 *   role=student                 canManage false and no attach prop: the
	 *                                whole inspector is gone
	 */
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	/* THE ROOM PRODUCTION IS IN, AND ITS STYLESHEET WITH IT -- `.cr-root` is
	   where `.btn.tiny`'s 24px instructor-density floor is declared, so a
	   harness without it measures controls that are a different size from the
	   ones anybody ships. */
	import '$lib/classroom/classroom.css';
	import { SECTION, ITEMS } from '../classroom-split/fixture';
	import type { ClassroomItem } from '$lib/classroom/classroom';
	import { itemInspector } from '$lib/classroom/inspector.svelte';
	import { DEFAULT_BLADE_CONFIG } from '$lib/ideacad/blade/materials';
	import type { IdeacadAttachControl } from '$lib/ideacad/transports';

	function query(key: string, fallback: string): string {
		if (typeof window === 'undefined') return fallback;
		return new URLSearchParams(location.search).get(key) ?? fallback;
	}
	const role = query('role', 'teacher');
	const variant = query('state', 'off');
	const isTeacher = role !== 'student';

	/** The schema-3 refusal `0201` raises, quoted from the migration so the
	 *  harness cannot drift from the sentence a teacher would really read. */
	const OTHER_SURFACE_REFUSAL =
		'This assignment already uses another work surface. Remove it first.';

	/**
	 * THE ITEM, BUILT FROM THE SPLIT FIXTURE'S OWN ROWS rather than typed out.
	 * `ideacadAttachState` reads `assignment_schema_version` through the same
	 * two predicates every other surface uses, and a hand-written item is a
	 * shape the fixture's producer never emits.
	 */
	const ITEM: ClassroomItem = (() => {
		const wantMaterial = variant === 'material';
		const found = ITEMS.find((i) =>
			wantMaterial ? i.kind === 'material' : i.kind === 'assignment' && i.published
		);
		if (!found) throw new Error('the split fixture has no item of that kind');
		const version = variant === 'on' ? 4 : variant === 'other' ? 3 : null;
		const next = { ...found } as ClassroomItem & { assignment_schema_version?: number | null };
		/* ATTACHED ONLY WHEN THERE IS ONE, so `state=off` is the genuine
		   "column is null" shape an ordinary assignment has rather than an item
		   carrying an explicit null nothing in production writes. */
		if (version === null) delete next.assignment_schema_version;
		else next.assignment_schema_version = version;
		return next as ClassroomItem;
	})();

	/** Every call the control made, in order, so an absence is a counted zero. */
	let calls = $state<string[]>([]);
	let reloads = $state(0);

	/**
	 * THE ATTACH BOUNDARY. `state=badconfig` hands a config that
	 * `bladeConfigShaped` refuses -- shaped like a config, with a
	 * `defaultFeatures` `validateBladeTree` will not accept -- which is the one
	 * failure mode that must be caught on this side, before anything is
	 * written.
	 */
	const attach: IdeacadAttachControl = {
		bladeConfig:
			variant === 'badconfig'
				? { ...DEFAULT_BLADE_CONFIG, defaultFeatures: { schema: 1, editor: 'blade', features: [] } }
				: DEFAULT_BLADE_CONFIG,
		setEditor: async (itemId: string, editor: string | null) => {
			calls = [...calls, `setEditor(${itemId}, ${editor === null ? 'null' : editor})`];
			if (variant === 'refused') throw new Error(OTHER_SURFACE_REFUSAL);
			return {};
		}
	};

	/* THE INSPECTOR STARTS COLLAPSED (`inspector.svelte.ts`, deliberately), and
	   the control is inside its body -- so a harness that did not open it would
	   measure an empty region and report every absence as a pass. Opened through
	   the REAL module, never by a second copy of its state. */
	$effect(() => {
		itemInspector.open = true;
	});

	function all(selector: string): HTMLElement[] {
		return Array.from(document.querySelectorAll<HTMLElement>(selector));
	}
	function box(selector: string): DOMRect | null {
		const el = document.querySelector(selector);
		return el ? el.getBoundingClientRect() : null;
	}

	/**
	 * WHAT IS ON SCREEN, COUNTED. Every absence claim rides beside a positive
	 * control in the same object: `block` and `state` are non-zero on every
	 * teacher state, so a zero in `on`/`off` cannot be a selector that is simply
	 * wrong.
	 */
	function controls(): Record<string, number | string> {
		const n = (sel: string) => document.querySelectorAll(sel).length;
		return {
			inspector: n('[data-testid="item-inspector"]'),
			block: n('[data-testid="insp-ideacad-attach"]'),
			state: n('[data-testid="ideacad-attach-state"]'),
			blocked: n('[data-testid="ideacad-attach-blocked"]'),
			on: n('[data-testid="ideacad-attach-on"]'),
			off: n('[data-testid="ideacad-attach-off"]'),
			warning: n('[data-testid="ideacad-attach-off-warning"]'),
			input: n('[data-testid="ideacad-attach-off-input"]'),
			confirm: n('[data-testid="ideacad-attach-off-confirm"]'),
			cancel: n('[data-testid="ideacad-attach-off-cancel"]'),
			error: n('[data-testid="ideacad-attach-error"]'),
			notice: n('[data-testid="ideacad-attach-notice"]'),
			errorText:
				document.querySelector('[data-testid="ideacad-attach-error"]')?.textContent?.trim() ?? '',
			blockedText:
				document.querySelector('[data-testid="ideacad-attach-blocked"]')?.textContent?.trim() ?? '',
			calls: calls.length,
			lastCall: calls[calls.length - 1] ?? '',
			reloads
		};
	}

	/**
	 * THE GEOMETRY PROBES. THIS CHROMIUM PAINTS NO SCROLLBAR INTO A SCREENSHOT
	 * AT ANY COLOUR, so a control past its container's edge is invisible to the
	 * eye AND to every content check. Only a geometric read tells them apart.
	 *
	 * THE 24px FLOOR AND NOT 44px, because this is an instructor-only surface
	 * that DECLARES it: `.cr-root .btn.tiny` in `classroom.css` is the named
	 * class carrying the IDEA_INTERFACE_STANDARDS 10 exemption, and the whole
	 * region is one `{#if canManage}`. The floor is asserted anyway, because a
	 * declared exemption is still a floor.
	 */
	function verdicts(): string[] {
		const out: string[] = [];
		const say = (label: string, ok: boolean) => out.push(`${label} ${ok ? 'ok' : 'FAIL'}`);
		say(
			'nothing is wider than the window',
			document.documentElement.scrollWidth <= window.innerWidth + 1
		);
		const block = box('[data-testid="insp-ideacad-attach"]');
		const inspector = box('[data-testid="item-inspector"]');
		if (block && inspector) {
			say('the block has a box', block.width > 0 && block.height > 0);
			say(
				'the block sits inside the inspector',
				block.left >= inspector.left - 0.5 && block.right <= inspector.right + 0.5
			);
			const kids = all('[data-testid="insp-ideacad-attach"] button, [data-testid="insp-ideacad-attach"] input, [data-testid="insp-ideacad-attach"] p');
			say(
				'every control and sentence sits inside the block',
				kids.every((el) => {
					const r = el.getBoundingClientRect();
					return r.left >= block.left - 0.5 && r.right <= block.right + 0.5;
				})
			);
			say(
				'every control clears the declared 24px floor',
				all('[data-testid="insp-ideacad-attach"] button, [data-testid="insp-ideacad-attach"] input').every(
					(el) => el.getBoundingClientRect().height >= 24
				)
			);
			say(
				'no control stretches the whole block',
				all('[data-testid="insp-ideacad-attach"] button').every(
					(el) => el.getBoundingClientRect().width <= block.width - 8
				)
			);
		}
		/* THE TWO CLAIMS ON ONE SCREEN, COMPARED -- ledger 0201's third defect.
		   A block that says the editor is on must not also offer to turn it on. */
		say(
			'the block never offers both directions at once',
			!(
				document.querySelector('[data-testid="ideacad-attach-on"]') &&
				document.querySelector('[data-testid="ideacad-attach-off"]')
			)
		);
		/* A CONTROL ABSENT FOR A REASON SAYS THE REASON. The schema-3 state is
		   the whole case for that rule: a block with a heading and no button is
		   a defect unless a sentence stands where the button was. */
		const blocked = document.querySelector('[data-testid="ideacad-attach-blocked"]');
		if (blocked) {
			say('nothing is offered on a schema-3 item', !document.querySelector('[data-testid="ideacad-attach-on"]') && !document.querySelector('[data-testid="ideacad-attach-off"]'));
			say('a sentence stands where the control would be', (blocked.textContent ?? '').trim().length > 20);
		}
		return out;
	}

	/** Press On, then report. Returns the call count so a refusal that never
	 *  reached the transport is a measured 0 rather than an unchecked claim. */
	async function pressOn(): Promise<Record<string, number | string>> {
		document.querySelector<HTMLButtonElement>('[data-testid="ideacad-attach-on"]')?.click();
		await new Promise((r) => setTimeout(r, 60));
		return controls();
	}

	/** Arm Off, type `word`, press confirm, report. */
	async function pressOff(word: string): Promise<Record<string, number | string>> {
		document.querySelector<HTMLButtonElement>('[data-testid="ideacad-attach-off"]')?.click();
		await new Promise((r) => setTimeout(r, 30));
		const input = document.querySelector<HTMLInputElement>('[data-testid="ideacad-attach-off-input"]');
		if (input) {
			input.value = word;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
		await new Promise((r) => setTimeout(r, 30));
		document.querySelector<HTMLButtonElement>('[data-testid="ideacad-attach-off-confirm"]')?.click();
		await new Promise((r) => setTimeout(r, 60));
		return controls();
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__attachControls = controls;
		w.__attachVerdicts = verdicts;
		w.__attachPressOn = pressOn;
		w.__attachPressOff = pressOff;
	}
</script>

<div class="cr-root" data-testid="ideacad-attach-room">
	<main class="harness">
		<h1>Turning the Blade editor on</h1>
		<p class="ctx" data-testid="ideacad-attach-ctx">
			role={role} &middot; state={variant} &middot; kind={ITEM.kind} &middot; schema={String(
				(ITEM as { assignment_schema_version?: number }).assignment_schema_version ?? 'null'
			)} &middot; calls={calls.length}
		</p>

		<!--
			THE REAL COMPONENT, NEVER A COPY OF ITS MARKUP. Every prop below is
			what `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`
			builds; the one thing this file substitutes is the transport.

			`ideacadAttach` IS NULL FOR THE STUDENT, which is the page's own
			`data.canManage ? ideacadTransports : null` and is what makes
			read-only structural here rather than a flag.
		-->
		<ItemDetail
			section={SECTION}
			item={ITEM}
			canManage={isTeacher}
			transports={null}
			ideacadAttach={isTeacher ? attach : null}
			onchanged={() => {
				reloads += 1;
			}}
		/>

		<section class="probe" data-testid="ideacad-attach-probe">
			<h2>Calls</h2>
			<p data-testid="ideacad-attach-calls">{calls.length}</p>
			<ul>
				{#each calls as line, index (index)}
					<li>{line}</li>
				{/each}
			</ul>
		</section>
	</main>
</div>

<style>
	.harness {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		max-width: 72rem;
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
		color: var(--text-1);
	}
	.ctx {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.probe {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		padding: 0.6rem;
	}
	.probe h2 {
		margin: 0 0 0.4rem;
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.probe p,
	.probe li {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.probe ul {
		margin: 0.3rem 0 0;
		padding-left: 1rem;
	}
</style>
