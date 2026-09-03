<script lang="ts">
	/**
	 * THE INSTRUCTOR'S OWN CONTROL: close the Foundry for a class, and open it
	 * again (0173, decision 01).
	 *
	 * WHY IT IS A SECTION MANAGER'S AND NOT AN ADMIN'S. The whole point of the
	 * decision is that the teacher standing in the room can close it when the
	 * room should be doing something else. `classroom_manages_section` is the
	 * predicate, inside the RPC, and it is the existing one -- no second
	 * statement of "who runs this class" is written anywhere in this feature.
	 *
	 * WHERE IT IS MOUNTED, AND THE HONEST LIMIT ON THAT. It belongs on the
	 * classroom's own section page, beside everything else somebody manages
	 * about that class. `src/routes/classroom/**` is outside this bundle's
	 * files, so it is mounted here instead: on /foundry, listing exactly the
	 * sections the caller manages, which is as close to "where they already
	 * manage that section" as this bundle can reach. Moving it is a one-line
	 * mount in a bundle that owns the classroom.
	 *
	 * ABSENCE IS THE MECHANISM, as everywhere else here. No `setOpen`
	 * transport means no control: a surface that cannot write cannot offer a
	 * switch, so read-only is structural rather than a `readOnly` prop
	 * somebody has to remember.
	 *
	 * TWO STEPS TO CLOSE, ONE TO OPEN. Closing takes a room's tool away from a
	 * class of students, so it arms and then confirms; opening gives it back
	 * and needs no ceremony. That asymmetry is deliberate: a confirm on the
	 * harmless direction is a confirm nobody reads.
	 */
	import Pending from '$lib/Pending.svelte';
	import { pendingLabel } from '$lib/pending';

	import {
		foundrySectionOrder,
		foundrySectionStateLabel,
		type FoundryManagedSection
	} from './access.ts';

	let {
		sections = [],
		setOpen
	}: {
		sections?: FoundryManagedSection[];
		/** Omitted removes every control. The RPC is the boundary regardless. */
		setOpen?: (
			sectionId: string,
			open: boolean,
			note: string | null
		) => Promise<{ ok: boolean; message?: string }>;
	} = $props();

	/**
	 * OPTIMISTIC STATE AS AN OVERLAY, NEVER A MIRROR OF THE PROP.
	 *
	 * The obvious shape -- `let rows = $state([...sections])` plus an
	 * `$effect` copying the prop back over it -- is two defects in three
	 * lines. It reads state inside an effect it then writes, which is the
	 * loop shape the Svelte 5 rules are about, and it silently DISCARDS a
	 * fresh load whenever the local copy is newer, because the effect and the
	 * click race. It also costs a `state_referenced_locally` warning, which is
	 * the compiler saying the same thing.
	 *
	 * So the prop stays the source of truth and what a click just changed is
	 * held BESIDE it, keyed by section. `$derived` merges them on every read,
	 * so a reload of the page wins the moment it lands and nothing has to
	 * decide which copy is newer.
	 */
	let changed = $state<Record<string, { closed_at: string | null; note: string | null }>>({});

	const ordered = $derived(
		foundrySectionOrder(
			sections.map((s) => {
				const over = changed[s.section_id];
				return over
					? { ...s, foundry_closed_at: over.closed_at, foundry_closed_note: over.note }
					: s;
			})
		)
	);

	/** Which row is armed for a close, and the note being typed with it. */
	let arming = $state<string | null>(null);
	let note = $state('');
	let busy = $state<string | null>(null);
	let problem = $state<string | null>(null);

	function arm(sectionId: string) {
		arming = sectionId;
		note = '';
		problem = null;
	}

	function cancel() {
		arming = null;
		note = '';
	}

	async function send(section: FoundryManagedSection, open: boolean) {
		if (!setOpen) return;
		busy = section.section_id;
		problem = null;
		try {
			const r = await setOpen(section.section_id, open, open ? null : note.trim() || null);
			if (!r.ok) {
				problem = r.message ?? 'That did not go through.';
				return;
			}
			// Recorded as an overlay on the section this click named, never as
			// a rewrite of the list: the next load of the page replaces it
			// with what the database actually holds.
			changed = {
				...changed,
				[section.section_id]: {
					closed_at: open ? null : new Date().toISOString(),
					note: open ? null : note.trim() || null
				}
			};
			arming = null;
			note = '';
		} finally {
			// In `finally`, so a throw mid-submit cannot disable the row forever.
			busy = null;
		}
	}
</script>

<section class="fdy-access" data-testid="foundry-class-access">
	<header class="fdy-access-head">
		<h2>Foundry access for your classes</h2>
		<p class="fdy-access-lead">
			Closing it stops students in that class opening the Foundry until you open it
			again. Their apps and everything published stay exactly as they are.
		</p>
	</header>

	{#if ordered.length === 0}
		<p class="fdy-access-empty">
			You are not the teacher of record for any section, so there is nothing to open or
			close here.
		</p>
	{:else}
		<ul class="fdy-access-list">
			{#each ordered as section (section.section_id)}
				{@const closed = section.foundry_closed_at !== null}
				<li class="fdy-access-row" class:is-closed={closed}>
					<div class="fdy-access-who">
						<span class="fdy-access-course">{section.course_title}</span>
						<span class="fdy-access-label">
							{section.course_code} &middot; {section.label}{section.block
								? ` · ${section.block}`
								: ''}
						</span>
						{#if closed && section.foundry_closed_note}
							<span class="fdy-access-note">{section.foundry_closed_note}</span>
						{/if}
					</div>

					<!-- COLOUR IS NEVER THE ONLY SIGNAL: the word is the state, the
					     tone sits beside it. -->
					<span class="fdy-access-state" data-state={closed ? 'closed' : 'open'}>
						{foundrySectionStateLabel(section)}
					</span>

					<div class="fdy-access-do">
						{#if busy === section.section_id}
							<Pending label={pendingLabel(closed ? 'Opening' : 'Closing')} />
						{:else if setOpen}
							{#if closed}
								<button
									type="button"
									class="btn tap-44"
									onclick={() => send(section, true)}
								>
									Open it
								</button>
							{:else if arming === section.section_id}
								<div class="fdy-access-confirm">
									<label class="fdy-access-note-field">
										<span>Why, for the students (optional)</span>
										<input
											type="text"
											maxlength="200"
											bind:value={note}
											placeholder="We are on the CAD assessment today."
										/>
									</label>
									<div class="fdy-access-confirm-do">
										<button
											type="button"
											class="btn tap-44"
											onclick={() => send(section, false)}
										>
											Close it for {section.label}
										</button>
										<button type="button" class="btn tap-44" onclick={cancel}>
											Keep it open
										</button>
									</div>
								</div>
							{:else}
								<button
									type="button"
									class="btn tap-44"
									onclick={() => arm(section.section_id)}
								>
									Close it
								</button>
							{/if}
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if problem}
		<!-- The refusal renders where the person was working, in words the
		     database gave, rather than in a second place they have to learn. -->
		<p class="fdy-access-problem" role="status">{problem}</p>
	{/if}
</section>

<style>
	.fdy-access {
		/* THE CONTAINER THE @container RULE BELOW MEASURES AGAINST. Declared
		   rather than assumed: a container query whose container never
		   establishes one simply never fires, with no unused-selector notice
		   and no svelte-check warning, and the fallback single-column layout
		   looks deliberate because it is also written. The 34rem threshold is
		   measured on the real page at 375 and 1440 in the browser pass. */
		container-type: inline-size;
		padding: 1.25rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-access-head h2 {
		margin: 0 0 0.4rem;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-access-lead,
	.fdy-access-empty {
		margin: 0 0 1rem;
		color: var(--text-2);
	}

	.fdy-access-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.75rem;
	}

	.fdy-access-row {
		display: grid;
		gap: 0.6rem;
		padding: 0.75rem;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
		/* min-width: 0 on the grid children below; the row itself must be able
		   to shrink or a nowrap label forces the whole page wider. */
		min-width: 0;
	}

	@container (min-width: 34rem) {
		.fdy-access-row {
			grid-template-columns: 1fr auto auto;
			align-items: start;
		}
	}

	.fdy-access-who,
	.fdy-access-do {
		min-width: 0;
	}

	.fdy-access-course {
		display: block;
		color: var(--text-1);
		font-weight: 600;
	}

	.fdy-access-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.fdy-access-note {
		display: block;
		margin-top: 0.3rem;
		color: var(--text-2);
		font-size: 0.9rem;
	}

	.fdy-access-state {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		align-self: center;
		white-space: nowrap;
	}

	.fdy-access-state[data-state='open'] {
		color: var(--fg-st-live-ink, var(--green));
		background: var(--fg-st-live-fill, transparent);
		border: 1px solid var(--fg-st-live-edge, var(--boundary));
	}

	.fdy-access-state[data-state='closed'] {
		color: var(--fg-st-shelf-ink, var(--text-2));
		background: var(--fg-st-shelf-fill, transparent);
		border: 1px solid var(--fg-st-shelf-edge, var(--boundary));
	}

	.fdy-access-confirm {
		display: grid;
		gap: 0.5rem;
	}

	.fdy-access-note-field span {
		display: block;
		font-size: 0.8rem;
		color: var(--text-2);
		margin-bottom: 0.2rem;
	}

	.fdy-access-note-field input {
		width: 100%;
		min-height: 44px;
		padding: 0 0.6rem;
		background: var(--surface-1);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		font-family: var(--font-display);
	}

	.fdy-access-confirm-do {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.fdy-access-problem {
		margin: 1rem 0 0;
		color: var(--fg-error, var(--crimson));
	}
</style>
