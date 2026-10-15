<script lang="ts">
	/**
	 * A project's specification (ledger 0391): the objective, the spec
	 * markdown, the acceptance list and the references as links; and, on the
	 * GUIDED project only, the steps with their fade: `full` shows the body,
	 * `goal` shows the title and the goal with a hint behind a Disclosure,
	 * `hint` shows only the title with the hint behind the Disclosure. Help
	 * falls away so the student is working alone by the end. The autonomous
	 * project has no steps; the page says outside help voids the attempt.
	 *
	 * Markdown renders through `MarkdownText` (typed nodes, no `{@html}`), and
	 * a reference link is rendered only when `safeHref` admits it.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import { safeHref } from '$lib/rich-text';
	import type { ProjectSpec } from '$lib/certifications/types';

	let {
		project,
		kind,
		code
	}: { project: ProjectSpec; kind: 'guided' | 'autonomous'; code: string } = $props();

	const steps = $derived(kind === 'guided' ? (project.steps ?? []) : []);
	const references = $derived(project.references.map((r) => ({ label: r.label, href: safeHref(r.href) })));
</script>

<div class="cert-project" data-testid="cert-project" data-kind={kind}>
	<p class="cert-project-objective"><span class="cert-readout">Objective</span> {project.objective}</p>

	{#if project.spec.trim()}
		<div class="cert-prose cert-project-spec">
			<MarkdownText body={project.spec} />
		</div>
	{/if}

	{#if project.acceptance.length > 0}
		<h4 class="cert-section-h">Accepted when</h4>
		<ul class="cert-well cert-project-list" data-testid="cert-project-acceptance">
			{#each project.acceptance as line, i (i)}
				<li class="cert-project-line"><span class="cert-tone-ok" aria-hidden="true">✓</span> {line}</li>
			{/each}
		</ul>
	{/if}

	{#if references.length > 0}
		<h4 class="cert-section-h">References</h4>
		<ul class="cert-well cert-project-list" data-testid="cert-project-references">
			{#each references as ref, i (i)}
				<li class="cert-project-line">
					{#if ref.href}
						<a href={ref.href} rel="noopener noreferrer" target="_blank" class="cert-project-ref">{ref.label} <span class="cert-help">(opens in a new tab)</span></a>
					{:else}
						<span>{ref.label}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if steps.length > 0}
		<h4 class="cert-section-h">Steps</h4>
		<ol class="cert-steps" data-testid="cert-project-steps">
			{#each steps as step, i (i)}
				<li class="cert-step" data-fade={step.fade} data-testid="cert-step">
					<div class="cert-step-head">
						<span class="cert-step-n" aria-hidden="true">{i + 1}</span>
						<span class="cert-step-title">{step.title}</span>
						<span class="cert-readout cert-step-fade">{step.fade === 'full' ? 'Shown in full' : step.fade === 'goal' ? 'Goal only' : 'Hint only'}</span>
					</div>
					{#if step.fade !== 'hint' && step.body.trim()}
						<div class="cert-prose cert-step-body">
							<MarkdownText body={step.body} />
						</div>
					{/if}
					{#if step.fade !== 'full' && step.hint}
						<Disclosure label="Hint" collapseWhen={true} scope={`cert:${code}:guided:step:${i}`} showWord="Show hint" hideWord="Hide hint" testId="cert-step-hint">
							<p class="cert-step-hint">{step.hint}</p>
						</Disclosure>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.cert-project-objective {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
		align-items: baseline;
		margin: 0 0 0.9rem;
		font-size: 1.05rem;
		line-height: 1.45;
	}
	.cert-project-spec {
		margin: 0 0 1rem;
	}
	.cert-project-list {
		margin-bottom: 1rem;
	}
	.cert-project-line {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		min-height: 44px;
		padding: 0.5rem 0;
		line-height: 1.4;
	}
	.cert-project-ref {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
	}
	.cert-steps {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cert-step {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.7rem 0.9rem;
		margin: 0 0 0.6rem;
	}
	.cert-step-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.7rem;
		font-weight: 700;
	}
	.cert-step-n {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 999px;
		border: 1px solid var(--green);
		color: var(--green);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		flex: none;
	}
	.cert-step-title {
		flex: 1 1 auto;
		min-width: 0;
	}
	.cert-step-body {
		margin-top: 0.5rem;
	}
	.cert-step-hint {
		margin: 0;
		line-height: 1.45;
	}
</style>
