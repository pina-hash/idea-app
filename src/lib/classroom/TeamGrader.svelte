<script lang="ts">
	/**
	 * ONE TEAM, ONE SCREEN (ledger 0436, 0305; decision 71; rubric standard 1.4).
	 *
	 * The team criteria are scored once and the role blocks once each, by
	 * tapping a level; the individual criteria are scored per member. Every
	 * member's total updates as you tap, by the database's own rule (the mean
	 * of a double owner's two role blocks), so the screen shows what each
	 * student will see. Save writes every member through the bulk path; Save
	 * and return also returns them, and only lights when nothing is missing.
	 * Built to be used on a phone during a live presentation: each level is a
	 * 48px key carrying its short form, and the descriptor is one tap away.
	 */
	import { untrack } from 'svelte';
	import { levelShort, type RubricCriterion } from './assignment-spec';
	import {
		teamCriterionGroups,
		teamGradeArgs,
		teamGradeComplete,
		teamGradeStart,
		teamGradeWords,
		teamMemberPreview,
		teamUnownedRoles,
		type TeamGradeDraft,
		type TeamGrading
	} from './team-grade';

	let {
		grading,
		onsave,
		next = null,
		documentHref = null
	}: {
		grading: TeamGrading;
		onsave: (args: ReturnType<typeof teamGradeArgs>, comment: string, ret: boolean) => Promise<unknown>;
		next?: { href: string; name: string } | null;
		documentHref?: string | null;
	} = $props();

	let draft = $state<TeamGradeDraft>(untrack(() => teamGradeStart(grading)));
	let shownFor = untrack(() => grading.team.id);
	$effect(() => {
		const id = grading.team.id;
		if (id === shownFor) return;
		shownFor = id;
		draft = untrack(() => teamGradeStart(grading));
		said = null;
	});

	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);
	const groups = $derived(teamCriterionGroups(grading));
	const complete = $derived(teamGradeComplete(grading, draft));
	const unowned = $derived(teamUnownedRoles(grading, draft));
	const roleTitle = (id: string) => grading.roles.find((r) => r.id === id)?.title ?? id;

	function pickShared(c: RubricCriterion, points: number) {
		draft.shared[c.id] = draft.shared[c.id] === points ? null : points;
	}
	function pickMember(email: string, c: RubricCriterion, points: number) {
		const mine = draft.member[email] ?? (draft.member[email] = {});
		mine[c.id] = mine[c.id] === points ? null : points;
	}
	async function save(ret: boolean) {
		busy = true;
		said = null;
		const out = await onsave(teamGradeArgs(draft), draft.comment, ret).catch(() => null);
		busy = false;
		said = teamGradeWords(out, ret);
	}
</script>

{#snippet levels(c: RubricCriterion, value: number | null | undefined, pick: (points: number) => void, label: string)}
	<div class="tg-levels" role="group" aria-label={label}>
		{#each c.levels ?? [] as level, li (li)}
			<button
				type="button"
				class="btn secondary tg-level"
				aria-pressed={value === level.points}
				title={level.descriptor}
				onclick={() => pick(level.points)}
			>
				<span class="tg-short">{levelShort(level, c.id, null)}</span>
				<span class="tg-pts">{level.points}</span>
			</button>
		{/each}
	</div>
{/snippet}

{#snippet criterion(c: RubricCriterion, value: number | null | undefined, pick: (points: number) => void)}
	<div class="tg-crit" class:scored={value != null}>
		<p class="tg-crit-name">
			<span>{c.criterion}</span>
			<span class="tg-crit-score">{value ?? '–'} / {c.levels?.[0]?.points ?? c.points}</span>
		</p>
		{@render levels(c, value, pick, c.criterion)}
		<details class="tg-desc">
			<summary>What each level means</summary>
			<ul>
				{#each c.levels ?? [] as level, li (li)}
					<li><strong>{level.points}</strong> {level.descriptor}</li>
				{/each}
			</ul>
		</details>
	</div>
{/snippet}

<section class="tg" data-testid="team-grader" aria-label={`Grade ${grading.team.name}`}>
	<header class="card tg-head">
		<p class="tg-where">{grading.team.sectionLabel} · each student out of {grading.outOf}</p>
		<h2 class="tg-team">{grading.team.name}</h2>
		<ul class="tg-members" data-testid="team-grader-members">
			{#each grading.members as m (m.email)}
				{@const preview = teamMemberPreview(grading, draft, m.email)}
				<li class="tg-member">
					<span class="tg-name">{m.name}</span>
					<span class="tg-roles">
						{#each m.roles as r (r)}<span class="chip">{roleTitle(r)}</span>{/each}
						{#if m.roles.length > 1}<span class="tg-mean">mean of {m.roles.length}</span>{/if}
					</span>
					<span class="tg-total" data-testid="team-grader-total">{preview ?? '–'} / {grading.outOf}</span>
				</li>
			{/each}
		</ul>
		{#if documentHref}<a class="tg-doc" href={documentHref}>Read this team's document</a>{/if}
	</header>

	{#if groups.team.length}
		<section class="card tg-group" aria-label="Team criteria">
			<h3 class="section-label">Team, scored once for everyone</h3>
			{#each groups.team as c (c.id)}
				{@render criterion(c, draft.shared[c.id], (p) => pickShared(c, p))}
			{/each}
		</section>
	{/if}

	{#each groups.roles as g (g.role.id)}
		<section class="card tg-group" aria-label={g.role.title}>
			<h3 class="section-label">{g.role.title}, {g.role.ownerName ?? 'no owner yet'}</h3>
			{#each g.criteria as c (c.id)}
				{@render criterion(c, draft.shared[c.id], (p) => pickShared(c, p))}
			{/each}
		</section>
	{/each}

	{#if groups.individual.length}
		<section class="card tg-group" aria-label="Each student">
			<h3 class="section-label">Each student</h3>
			{#each groups.individual as c (c.id)}
				<div class="tg-crit">
					<p class="tg-crit-name"><span>{c.criterion}</span></p>
					{#each grading.members as m (m.email)}
						<div class="tg-person">
							<span class="tg-person-name">{m.name}</span>
							{@render levels(c, draft.member[m.email]?.[c.id], (p) => pickMember(m.email, c, p), `${c.criterion}, ${m.name}`)}
						</div>
					{/each}
				</div>
			{/each}
		</section>
	{/if}

	<label class="card tg-comment">
		<span class="section-label">Comment, the same for every member</span>
		<textarea rows="3" bind:value={draft.comment}></textarea>
	</label>

	<div class="tg-act">
		{#if unowned.length}
			<p class="tg-said warn">{unowned.map((r) => r.title).join(', ')} has no owner on this team. Set it on the team plan first.</p>
		{:else if said}
			<p class="tg-said" class:warn={!said.ok} role="status">{said.text}</p>
		{/if}
		<button type="button" class="btn secondary" data-testid="team-grader-save" disabled={busy || unowned.length > 0} onclick={() => save(false)}>Save</button>
		<button type="button" class="btn" data-testid="team-grader-return" disabled={busy || !complete || unowned.length > 0} onclick={() => save(true)}>Save and return</button>
	</div>
	{#if next}<a class="btn ghost tg-next" href={next.href}>Next: {next.name}</a>{/if}
</section>

<style>
	.tg {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		padding-bottom: var(--feedback-clear-block, 0px);
	}
	.tg-head {
		display: grid;
		gap: 0.4rem;
		padding: 0.9rem;
	}
	.tg-head p,
	.tg-team {
		margin: 0;
	}
	.tg-where {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.tg-team {
		font-family: var(--font-display);
		font-size: 1.45rem;
		color: var(--text-1, var(--white));
	}
	.tg-members {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.tg-member {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.1rem 0.6rem;
		align-items: center;
	}
	.tg-name {
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1, var(--white));
	}
	.tg-roles {
		grid-column: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
	}
	.tg-mean {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2, var(--dim));
	}
	.tg-total {
		grid-column: 2;
		grid-row: 1 / span 2;
		font-family: var(--font-mono);
		font-size: 0.95rem;
		color: var(--text-1, var(--white));
	}
	.tg-doc {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--cyan);
	}
	.tg-group {
		display: grid;
		gap: 0.7rem;
		padding: 0.9rem;
		min-width: 0;
	}
	.tg-group h3 {
		margin: 0;
	}
	.tg-crit {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}
	.tg-crit-name {
		margin: 0;
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1, var(--white));
	}
	.tg-crit-score {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
		white-space: nowrap;
	}
	.tg-crit.scored .tg-crit-score {
		color: var(--text-1, var(--white));
	}
	.tg-levels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}
	@media (min-width: 640px) {
		.tg-levels {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	.tg-level {
		min-height: 48px;
		display: grid;
		gap: 0.1rem;
		justify-items: center;
		padding: 0.3rem 0.35rem;
		text-transform: none;
		letter-spacing: 0;
	}
	.tg-level[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--green);
		background: color-mix(in srgb, var(--green) 14%, transparent);
	}
	.tg-short {
		font-family: var(--font-display);
		font-size: 0.88rem;
		line-height: 1.1;
		text-align: center;
	}
	.tg-pts {
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.tg-desc summary {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
		cursor: pointer;
		min-height: 32px;
		display: flex;
		align-items: center;
	}
	.tg-desc ul {
		margin: 0.3rem 0 0;
		padding-left: 1rem;
		font-family: var(--font-display);
		font-size: 0.92rem;
		color: var(--text-2, var(--dim));
	}
	.tg-person {
		display: grid;
		gap: 0.3rem;
	}
	.tg-person-name {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}
	.tg-comment {
		display: grid;
		gap: 0.4rem;
		padding: 0.9rem;
	}
	.tg-comment textarea {
		width: 100%;
		box-sizing: border-box;
		font-family: var(--font-display);
		font-size: 1rem;
	}
	.tg-act {
		position: sticky;
		/* Rests above the site's floating feedback key, never under it. */
		bottom: var(--feedback-clear-block, 0px);
		z-index: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		padding: 0.6rem 0;
		background: var(--bg1, #1b2026);
	}
	.tg-act .btn {
		min-height: 52px;
	}
	.tg-said {
		grid-column: 1 / -1;
		margin: 0;
		font-family: var(--font-display);
		color: var(--green);
	}
	.tg-said.warn {
		color: var(--amber);
	}
	.tg-next {
		min-height: 48px;
	}
</style>
