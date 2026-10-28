<script lang="ts">
	/**
	 * COPY THIS CLASS'S POSTS INTO ANOTHER (ledger 0455, report 3a549386).
	 * Choose the new class and its first class day, read the preview (every
	 * post, what happens to it, its old and new due date in school days), then
	 * one Copy. Posts arrive as drafts unless "schedule" is ticked, which opens
	 * each published post on its new day; a draft stays a draft. No student
	 * answer, grade or team draw is copied, and the panel says so.
	 *
	 * Presentation plus injected transports (`copy-forward.ts`), so the dev
	 * harness mounts this identical component. Every call re-checks the caller
	 * in the database; this panel is not a boundary.
	 */
	import {
		actionWords,
		dayWords,
		dueWords,
		planSummary,
		type CopyForwardTransports,
		type CopyPlan
	} from './copy-forward';
	import type { ClassroomSection } from './classroom';
	import { sectionTitle } from './classroom';

	let {
		section,
		sections,
		transports,
		onclose = null,
		oncopied = null
	}: {
		/** The class being copied FROM. */
		section: ClassroomSection;
		/** Every class the caller manages; this one is left out of the choice. */
		sections: ClassroomSection[];
		transports: CopyForwardTransports;
		onclose?: (() => void) | null;
		oncopied?: ((to: ClassroomSection) => void | Promise<void>) | null;
	} = $props();

	const uid = $props.id();
	const targets = $derived(
		sections
			.filter((s) => s.id !== section.id && s.active !== false)
			.sort((a, b) => sectionTitle(a).localeCompare(sectionTitle(b)))
	);

	let toId = $state('');
	let firstDay = $state('');
	let fromFirstDay = $state('');
	let publish = $state(false);
	let plan = $state<CopyPlan | null>(null);
	let busy = $state(false);
	let problem = $state('');
	let done = $state('');

	const target = $derived(targets.find((s) => s.id === toId) ?? null);
	const ready = $derived(!!toId && /^\d{4}-\d{2}-\d{2}$/.test(firstDay));

	function changed() {
		plan = null;
		problem = '';
		done = '';
	}

	async function preview() {
		if (!ready || busy) return;
		busy = true;
		problem = '';
		done = '';
		try {
			const answer = await transports.preview(toId, firstDay, fromFirstDay || null);
			if (!answer.ok) {
				plan = null;
				problem = answer.message;
				return;
			}
			plan = answer;
		} finally {
			busy = false;
		}
	}

	async function copy() {
		if (!plan || busy) return;
		busy = true;
		problem = '';
		try {
			const answer = await transports.copy(toId, firstDay, fromFirstDay || null, null, publish);
			if (!answer.ok) {
				problem = answer.message;
				return;
			}
			const to = target;
			done = `Copied ${answer.copied} ${answer.copied === 1 ? 'post' : 'posts'}${
				answer.shared ? ` and shared ${answer.shared}` : ''
			} into ${to ? sectionTitle(to) : 'the new class'}${publish ? '' : ' as drafts'}.`;
			plan = null;
			if (to) await oncopied?.(to);
		} finally {
			busy = false;
		}
	}
</script>

<div class="cf" data-testid="copy-forward">
	<div class="cf-head">
		<h3 class="cf-title">Copy posts to another class</h3>
		{#if onclose}
			<button type="button" class="btn secondary tiny" onclick={() => onclose?.()} data-testid="copy-forward-close">
				Close
			</button>
		{/if}
	</div>
	<p class="cf-note">
		Every post in {sectionTitle(section)}, with its due dates, pacing days and sign-off dates moved by school days to
		the new class's first day. Student answers, grades and team draws stay here.
	</p>

	{#if targets.length === 0}
		<p class="cf-note" data-testid="copy-forward-none">You teach no other class to copy into. Make the new class first.</p>
	{:else}
		<div class="cf-fields">
			<label class="cf-field" for="cf-to-{uid}">
				<span>New class</span>
				<select id="cf-to-{uid}" bind:value={toId} onchange={changed} data-field="to">
					<option value="" disabled>Choose a class</option>
					{#each targets as s (s.id)}<option value={s.id}>{sectionTitle(s)}</option>{/each}
				</select>
			</label>
			<label class="cf-field" for="cf-day-{uid}">
				<span>Its first class day</span>
				<input id="cf-day-{uid}" type="date" bind:value={firstDay} onchange={changed} data-field="first-day" />
			</label>
			<label class="cf-field" for="cf-from-{uid}">
				<span>This class's first day <em>(optional)</em></span>
				<input id="cf-from-{uid}" type="date" bind:value={fromFirstDay} onchange={changed} data-field="from-first-day" />
			</label>
		</div>
		<div class="cf-actions">
			<button type="button" class="btn secondary" disabled={!ready || busy} onclick={preview} data-testid="copy-forward-preview">
				{busy && !plan ? 'Reading' : plan ? 'Preview again' : 'Preview'}
			</button>
		</div>
	{/if}

	{#if problem}
		<p class="feedback error" role="alert" data-testid="copy-forward-problem">{problem}</p>
	{/if}
	{#if done}
		<p class="feedback ok" role="status" data-testid="copy-forward-done">{done}</p>
	{/if}

	{#if plan}
		<p class="cf-span" data-testid="copy-forward-span">
			{dayWords(plan.from.firstDay)} in {plan.from.label} becomes {dayWords(plan.to.firstDay)} in {plan.to.label}.
		</p>
		<div class="cf-table-wrap">
			<table class="cf-table" data-testid="copy-forward-plan">
				<thead>
					<tr>
						<th scope="col">Post</th>
						<th scope="col">What happens</th>
						<th scope="col">Due now</th>
						<th scope="col">Due in the new class</th>
					</tr>
				</thead>
				<tbody>
					{#each plan.posts as p (p.id)}
						<tr class:skip={p.action === 'already_there' || p.action === 'already_copied'} data-action={p.action}>
							<th scope="row">
								<span class="cf-post">{p.title}</span>
								{#if p.pacingSteps || p.checkpoints}
									<span class="cf-meta">
										{[p.pacingSteps ? `${p.pacingSteps} pacing ${p.pacingSteps === 1 ? 'day' : 'days'}` : '', p.checkpoints ? `${p.checkpoints} sign-off ${p.checkpoints === 1 ? 'date' : 'dates'}` : '']
											.filter(Boolean)
											.join(', ')}
									</span>
								{/if}
							</th>
							<td><span class="cf-action">{actionWords(p)}</span></td>
							<td class="cf-date">{p.oldDue ? dueWords(p.oldDue) : '-'}</td>
							<td class="cf-date cf-new">
								{#if p.action === 'copy'}{p.newDue ? dueWords(p.newDue) : '-'}{:else}{p.oldDue ? dueWords(p.oldDue) : '-'}{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<label class="cf-toggle">
			<input type="checkbox" bind:checked={publish} data-field="publish" />
			<span>Schedule each published post to open on its new day (otherwise every copy is a draft)</span>
		</label>
		<div class="cf-confirm">
			<p class="cf-summary" data-testid="copy-forward-summary">{planSummary(plan, publish)}</p>
			<button
				type="button"
				class="btn"
				disabled={busy || plan.counts.copy + plan.counts.share === 0}
				onclick={copy}
				data-testid="copy-forward-confirm"
			>
				{busy ? 'Copying' : `Copy into ${plan.to.label}`}
			</button>
		</div>
	{/if}
</div>

<style>
	.cf {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.cf-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.cf-title {
		margin: 0;
		font-size: 1rem;
	}
	.cf-note,
	.cf-span {
		margin: 0;
		color: var(--text-2);
		font-size: 0.85rem;
		line-height: 1.5;
		max-width: 60ch;
	}
	.cf-span {
		color: var(--white);
	}
	.cf-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: var(--space-3);
	}
	.cf-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.cf-field em {
		font-style: normal;
		opacity: 0.8;
	}
	.cf-field select,
	.cf-field input {
		min-height: 44px;
		font-family: var(--font-display);
		font-size: 1rem;
	}
	.cf-actions,
	.cf-confirm {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.cf-confirm {
		justify-content: space-between;
		border-top: 1px solid var(--boundary);
		padding-top: var(--space-3);
	}
	.cf-summary {
		margin: 0;
		font-size: 0.9rem;
	}
	.cf-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.cf-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.cf-table th,
	.cf-table td {
		text-align: left;
		vertical-align: top;
		padding: 0.5rem 0.65rem;
		border-bottom: 1px solid var(--boundary);
	}
	.cf-table tbody tr:last-child th,
	.cf-table tbody tr:last-child td {
		border-bottom: none;
	}
	.cf-table thead th {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 400;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cf-post {
		display: block;
		font-weight: 600;
	}
	.cf-meta,
	.cf-action {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.cf-date {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		white-space: nowrap;
		color: var(--text-2);
	}
	.cf-new {
		color: var(--white);
	}
	tr.skip th,
	tr.skip td {
		opacity: 0.6;
	}
	.cf-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		font-size: 0.9rem;
	}
	.cf-toggle input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--green);
	}
	/* A PHONE READS THE TABLE AS CARDS: one post per block, its two dates on
	   their own lines with their labels, so nothing scrolls sideways. */
	@media (max-width: 40rem) {
		.cf-table thead {
			display: none;
		}
		.cf-table,
		.cf-table tbody,
		.cf-table tr,
		.cf-table th,
		.cf-table td {
			display: block;
			width: 100%;
			box-sizing: border-box;
		}
		.cf-table tr {
			border-bottom: 1px solid var(--boundary);
			padding: 0.35rem 0;
		}
		.cf-table th,
		.cf-table td {
			border-bottom: none;
			padding: 0.2rem 0.65rem;
		}
		.cf-table td.cf-date::before {
			display: inline-block;
			min-width: 7.5rem;
			color: var(--text-2);
		}
		.cf-table td.cf-date:not(.cf-new)::before {
			content: 'Due now';
		}
		.cf-table td.cf-new::before {
			content: 'New class';
		}
		.cf-confirm .btn {
			width: 100%;
		}
	}
</style>
