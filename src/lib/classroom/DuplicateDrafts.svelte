<!--
	DuplicateDrafts.svelte -- the surplus copies of a draft, grouped, with the
	oldest kept, and one Remove per row.

	WHY THE PURE LAYER IS IN THIS FILE'S `<script module>` BLOCK. The shape 0187
	answers in, the sentence that says why a row cannot be removed, and the one
	predicate deciding whether a Remove may be offered are ordinary data and
	arithmetic, and the registry convention wants them assertable without a
	browser. They are exported from the module block rather than from a second
	file so that `$lib/classroom` stays self-contained: a component in `$lib`
	reaching into `src/routes` for its own types is a dependency pointing the
	wrong way. `tests/classroom-duplicate-drafts.test.ts` imports them straight
	off this file.

	THE COMPONENT FETCHES NOTHING. The route owns the load and hands the answer
	down; removal is an INJECTED transport, so an omitted `remove` removes every
	Remove control down through the list. Read-only is then structural rather
	than a discipline -- there is no write to execute.

	AND THE CLIENT IS NOT THE BOUNDARY. `copyIsRemovable` decides what is
	OFFERED. What is ALLOWED is decided again, server-side, by the route behind
	the transport, on counts it reads itself. A surface that asked for a
	blocked row anyway is refused there.
-->
<script module lang="ts">
/** The per-item counts 0187 projects. Keys mirror the SQL exactly. */
export type AttachedCounts = {
	postings: number;
	submissions: number;
	responses: number;
	approvals: number;
	files: number;
	resources: number;
	specs: number;
	reference_specs: number;
	rubrics: number;
	decks: number;
	instructor_files: number;
	instructor_resources: number;
	instructor_responses: number;
	instructor_keys: number;
};

export type SurplusCopy = {
	id: string;
	created_at: string;
	removable: boolean;
	student_work: number;
	authored: number;
	counts: AttachedCounts;
};

export type DuplicateGroup = {
	author_email: string;
	author_name: string | null;
	kind: string;
	title: string | null;
	copies: number;
	first_written: string;
	last_written: string;
	keep_id: string;
	surplus_count: number;
	removable_count: number;
	blocked_count: number;
	surplus: SurplusCopy[];
};

export type DuplicateAnswer = {
	groups: DuplicateGroup[];
	totals: { groups: number; surplus: number; removable: number; blocked: number };
};

/** The answer a database with no duplicates gives, and the one a missing 0187 degrades to. */
export const EMPTY_ANSWER: DuplicateAnswer = {
	groups: [],
	totals: { groups: 0, surplus: 0, removable: 0, blocked: 0 }
};

/**
 * MAY THIS ROW BE OFFERED A REMOVE CONTROL?
 *
 * ONE implementation, read by the component, by the guarded removal route and
 * by the tests. Two spellings of "is this safe" is what produces a control that
 * refuses when pressed -- or, far worse here, a control that does not.
 *
 * It asks the DATABASE'S OWN verdict (`removable`) rather than re-deriving it
 * from the counts beside it: the counts are projected so a person can read WHY,
 * and a second derivation is the thing that stops agreeing with the first.
 */
export function copyIsRemovable(copy: Pick<SurplusCopy, 'removable'>): boolean {
	return copy.removable === true;
}

/**
 * WHY THIS ROW CANNOT BE REMOVED, in words, or null when it can.
 *
 * A control that is absent for a reason says the reason, where every sibling
 * row has one -- a list whose one row lacks a button reads as a bug, and one
 * sentence in its place is the difference between a rule and a defect.
 *
 * The wording names STUDENT WORK specifically rather than "attachments",
 * because that is the only thing that blocks and a vaguer sentence would read
 * as though authored material blocked too.
 */
export function removalBlockedReason(copy: SurplusCopy): string | null {
	if (copyIsRemovable(copy)) return null;
	const parts: string[] = [];
	if (copy.counts.submissions > 0) parts.push(plural(copy.counts.submissions, 'hand-in', 'hand-ins'));
	if (copy.counts.responses > 0) parts.push(plural(copy.counts.responses, 'saved answer', 'saved answers'));
	if (copy.counts.approvals > 0) parts.push(plural(copy.counts.approvals, 'approval', 'approvals'));
	const what = parts.length ? parts.join(', ') : 'student work';
	return `A student has work on this copy (${what}). Removing it would take that work with it, so this one is not offered for removal.`;
}

/**
 * WHAT A REMOVAL WOULD TAKE WITH IT, in words, for the confirm.
 *
 * A destructive action names what it costs with the REAL counts before the
 * confirm. Postings are named too -- every item has at least one and it is not
 * a blocker, but "removed from 2 classes" is exactly the fact a person wants in
 * front of them at the moment they press it.
 */
export function removalCost(copy: SurplusCopy): string[] {
	const cost: string[] = [];
	const c = copy.counts;
	if (c.postings > 0) cost.push(`listed in ${plural(c.postings, 'class', 'classes')}`);
	if (c.files > 0) cost.push(plural(c.files, 'attached file', 'attached files'));
	if (c.resources > 0) cost.push(plural(c.resources, 'link', 'links'));
	if (c.specs + c.reference_specs > 0)
		cost.push(plural(c.specs + c.reference_specs, 'spec', 'specs'));
	if (c.rubrics > 0) cost.push(plural(c.rubrics, 'rubric', 'rubrics'));
	if (c.decks > 0) cost.push(plural(c.decks, 'slide deck', 'slide decks'));
	const staff =
		c.instructor_files + c.instructor_resources + c.instructor_responses + c.instructor_keys;
	if (staff > 0) cost.push(plural(staff, 'instructor-only item', 'instructor-only items'));
	return cost;
}

/** "3 copies" / "1 copy". No em dashes, per the copy conventions. */
export function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** The title a group shows. An announcement has no title; its body is its identity. */
export function groupHeading(group: Pick<DuplicateGroup, 'title' | 'kind'>): string {
	const t = (group.title ?? '').trim();
	if (t) return t;
	return group.kind === 'post' ? 'Untitled announcement' : 'Untitled';
}

/** "Assignment" / "Material" / "Announcement", for the chip beside the heading. */
export function kindLabel(kind: string): string {
	if (kind === 'assignment') return 'Assignment';
	if (kind === 'material') return 'Material';
	if (kind === 'post') return 'Announcement';
	return kind;
}

/**
 * The one-line summary above the list.
 *
 * ZERO IS A SENTENCE, NOT AN ABSENCE. A section with nothing to clean up gets a
 * deliberate statement that it was looked at and there is nothing here, because
 * a blank panel and a panel that has not loaded look identical.
 */
export function summaryLine(totals: DuplicateAnswer['totals']): string {
	if (totals.surplus === 0) {
		return 'No duplicate drafts in this class. Nothing to clean up.';
	}
	const head = `${plural(totals.surplus, 'surplus copy', 'surplus copies')} across ${plural(
		totals.groups,
		'draft',
		'drafts'
	)}.`;
	if (totals.blocked === 0) return `${head} All of them are safe to remove.`;
	if (totals.removable === 0) {
		return `${head} None can be removed: every one carries student work.`;
	}
	return `${head} ${totals.removable} safe to remove, ${totals.blocked} carrying student work.`;
}

/**
 * Reads the RPC's answer defensively.
 *
 * The row is server data rather than user input, but a client that trusts a
 * shape it did not check renders `undefined.length` on the day the shape moves,
 * and this page's whole job is to be openable.
 */
export function readAnswer(raw: unknown): DuplicateAnswer {
	if (!raw || typeof raw !== 'object') return EMPTY_ANSWER;
	const o = raw as Record<string, unknown>;
	const groups = Array.isArray(o.groups) ? (o.groups as DuplicateGroup[]) : [];
	const t = (o.totals ?? {}) as Record<string, unknown>;
	return {
		groups,
		totals: {
			groups: num(t.groups, groups.length),
			surplus: num(t.surplus, 0),
			removable: num(t.removable, 0),
			blocked: num(t.blocked, 0)
		}
	};
}

function num(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}</script>

<script lang="ts">
	// Every pure helper below comes from this file's own `<script module>` block.
	type RemoveResult = { ok: boolean; error?: string };

	let {
		sectionName = '',
		answer,
		ready = true,
		remove,
		onremoved
	}: {
		sectionName?: string;
		answer: DuplicateAnswer;
		/** False when the project has no 0187: the page says so rather than blanking. */
		ready?: boolean;
		/** OMITTED REMOVES EVERY REMOVE CONTROL. Absence is the mechanism. */
		remove?: (id: string) => Promise<RemoveResult>;
		onremoved?: (id: string) => void;
	} = $props();

	/** Which row is armed. Two-step inline confirm: arm, then confirm. */
	let armed = $state<string | null>(null);
	let busy = $state<string | null>(null);
	/**
	 * THE ACKNOWLEDGEMENT LIVES ON THE LIST, NOT ON THE ROW.
	 *
	 * A "removed" note cannot render where the removed thing was, because the
	 * row it would render in is what just went. So it sits above the list,
	 * which is what is on screen afterwards.
	 */
	let note = $state<string | null>(null);
	let failure = $state<string | null>(null);

	async function confirmRemove(group: DuplicateGroup, copy: SurplusCopy) {
		if (!remove || !copyIsRemovable(copy)) return;
		busy = copy.id;
		failure = null;
		try {
			const res = await remove(copy.id);
			if (res.ok) {
				note = `Removed one surplus copy of "${groupHeading(group)}". The oldest copy was kept.`;
				armed = null;
				onremoved?.(copy.id);
			} else {
				failure = res.error ?? 'That copy could not be removed.';
			}
		} catch {
			failure = 'That copy could not be removed. Nothing was changed.';
		} finally {
			// Cleared in `finally`: a throw mid-remove would otherwise disable
			// the row forever.
			busy = null;
		}
	}

	function when(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	const summary = $derived(summaryLine(answer.totals));
</script>

<section class="dd" data-duplicate-drafts aria-labelledby="dd-title">
	<header class="dd-head">
		<h2 id="dd-title">Duplicate drafts{sectionName ? ` in ${sectionName}` : ''}</h2>
		<p class="dd-sum" data-dd-summary>{summary}</p>
		<p class="dd-why">
			A draft is a copy when another draft has the same author, the same kind, the same title and
			the same words. The oldest is always kept. Nothing here is visible to a student: an
			unpublished item does not appear in any class until it is posted.
		</p>
	</header>

	{#if !ready}
		<p class="dd-cold" data-dd-unready>
			This class cannot be checked yet. The count comes from a database function that has not been
			installed on this deployment, so nothing is missing from your class, only from this page.
		</p>
	{:else if answer.groups.length === 0}
		<p class="dd-empty" data-dd-empty>
			Nothing to clean up. Every draft in this class is the only copy of itself.
		</p>
	{:else}
		{#if note}
			<p class="dd-note" role="status" data-dd-note>{note}</p>
		{/if}
		{#if failure}
			<p class="dd-fail" role="alert" data-dd-failure>{failure}</p>
		{/if}

		<ol class="dd-groups">
			{#each answer.groups as group (group.keep_id)}
				{@const blocked = group.surplus.filter((c) => !copyIsRemovable(c))}
				{@const safe = group.surplus.filter((c) => copyIsRemovable(c))}
				<li class="dd-group" data-dd-group>
					<div class="dd-g-head">
						<h3 class="dd-g-title">{groupHeading(group)}</h3>
						<span class="dd-chip">{kindLabel(group.kind)}</span>
						<span class="dd-count" data-dd-copies>{plural(group.copies, 'copy', 'copies')}</span>
					</div>
					<p class="dd-g-meta">
						{group.author_name || group.author_email}
						<span class="dd-sep" aria-hidden="true">&middot;</span>
						oldest written {when(group.first_written)}
					</p>
					<p class="dd-keep" data-dd-keep>
						Keeping the copy written {when(group.first_written)}. It is not listed below.
					</p>

					{#if safe.length > 0}
						<ul class="dd-copies">
							{#each safe as copy (copy.id)}
								{@const cost = removalCost(copy)}
								<li class="dd-copy" data-dd-copy data-removable="true">
									<div class="dd-c-line">
										<span class="dd-c-when">Written {when(copy.created_at)}</span>
										<span class="dd-c-facts">
											{cost.length ? cost.join(', ') : 'nothing attached'}
										</span>
									</div>
									{#if remove}
										{#if armed === copy.id}
											<div class="dd-confirm" data-dd-confirm>
												<p class="dd-c-cost">
													Remove this copy of "{groupHeading(group)}" written {when(copy.created_at)}?
													{#if cost.length}
														It is {cost.join(', ')}. Those go with it.
													{/if}
													This cannot be undone.
												</p>
												<div class="dd-c-actions">
													<button
														type="button"
														class="btn danger tap-44"
														data-dd-do-remove
														disabled={busy === copy.id}
														onclick={() => confirmRemove(group, copy)}
													>
														{busy === copy.id ? 'Removing' : 'Yes, remove this copy'}
													</button>
													<button
														type="button"
														class="btn tap-44"
														data-dd-cancel
														onclick={() => (armed = null)}
													>
														Keep it
													</button>
												</div>
											</div>
										{:else}
											<button
												type="button"
												class="btn tap-44 dd-arm"
												data-dd-arm
												onclick={() => {
													armed = copy.id;
													failure = null;
												}}
											>
												Remove this copy
											</button>
										{/if}
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if blocked.length > 0}
						<div class="dd-blocked" data-dd-blocked>
							<h4 class="dd-b-title">
								Not removable ({plural(blocked.length, 'copy', 'copies')})
							</h4>
							<ul class="dd-copies">
								{#each blocked as copy (copy.id)}
									<li class="dd-copy" data-dd-copy data-removable="false">
										<div class="dd-c-line">
											<span class="dd-c-when">Written {when(copy.created_at)}</span>
										</div>
										<p class="dd-b-reason" data-dd-reason>{removalBlockedReason(copy)}</p>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.dd {
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 1rem);
	}

	.dd-head h2 {
		margin: 0 0 var(--space-2, 0.5rem);
		font-family: var(--font-display);
		font-size: 1.35rem;
		color: var(--text-1);
	}

	.dd-sum {
		margin: 0 0 var(--space-2, 0.5rem);
		font-family: var(--font-mono);
		font-size: 0.95rem;
		color: var(--text-1);
	}

	.dd-why,
	.dd-cold,
	.dd-empty {
		margin: 0;
		max-width: var(--measure-reading, 60ch);
		color: var(--text-2);
		font-size: 0.92rem;
		line-height: 1.5;
	}

	.dd-cold,
	.dd-empty {
		padding: var(--space-4, 1rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 8px);
		background: var(--surface-1);
	}

	.dd-note,
	.dd-fail {
		margin: 0;
		padding: var(--space-3, 0.75rem);
		border-radius: var(--radius-2, 8px);
		border: 1px solid var(--boundary);
		font-size: 0.92rem;
	}

	.dd-note {
		color: var(--text-1);
		background: var(--surface-2);
	}

	.dd-fail {
		color: var(--amber);
		background: var(--surface-2);
	}

	.dd-groups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-4, 1rem);
		grid-template-columns: repeat(auto-fit, minmax(min(28rem, 100%), 1fr));
	}

	.dd-group {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 8px);
		background: var(--surface-1);
		padding: var(--space-4, 1rem);
	}

	.dd-g-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	.dd-g-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.dd-chip,
	.dd-count {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--cyan);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}

	.dd-count {
		color: var(--amber);
	}

	.dd-g-meta,
	.dd-keep {
		margin: var(--space-2, 0.5rem) 0 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}

	.dd-sep {
		color: var(--boundary);
		padding: 0 0.25rem;
	}

	.dd-keep {
		color: var(--green);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.dd-copies {
		list-style: none;
		margin: var(--space-3, 0.75rem) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}

	.dd-copy {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1, 6px);
		padding: var(--space-3, 0.75rem);
		background: var(--surface-2);
		min-width: 0;
	}

	.dd-c-line {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: baseline;
		min-width: 0;
	}

	.dd-c-when {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--text-1);
	}

	.dd-c-facts {
		font-size: 0.82rem;
		color: var(--text-2);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.dd-arm {
		margin-top: var(--space-2, 0.5rem);
	}

	.dd-confirm {
		margin-top: var(--space-2, 0.5rem);
		border-top: 1px solid var(--boundary);
		padding-top: var(--space-2, 0.5rem);
	}

	.dd-c-cost {
		margin: 0 0 var(--space-2, 0.5rem);
		font-size: 0.88rem;
		color: var(--text-1);
		line-height: 1.45;
	}

	.dd-c-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}

	.dd-blocked {
		margin-top: var(--space-3, 0.75rem);
		border-top: 1px solid var(--boundary);
		padding-top: var(--space-3, 0.75rem);
	}

	.dd-b-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--amber);
	}

	.dd-b-reason {
		margin: var(--space-2, 0.5rem) 0 0;
		font-size: 0.85rem;
		color: var(--text-2);
		line-height: 1.45;
	}
</style>
