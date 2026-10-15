<script lang="ts">
	/**
	 * A project spec editor, used for BOTH the guided and the autonomous
	 * project: objective, spec markdown, acceptance lines, references, the
	 * guided project's steps with their fade level, the self-inspection lines
	 * and the evidence items with kind, label and required. `guided` is the
	 * one difference: steps exist only on the guided project
	 * (PACKAGE_FORMAT.md "Projects").
	 */
	import { EVIDENCE_KINDS, FADE_LEVELS, type ProjectSpec } from '$lib/certifications/types';
	import LinesField from './LinesField.svelte';

	let {
		spec = $bindable(),
		guided = false,
		onedit = () => {}
	}: {
		spec: ProjectSpec;
		guided?: boolean;
		/** Told after a change no input event carries (an added or removed row). */
		onedit?: () => void;
	} = $props();

	const FADE_WORDS: Record<(typeof FADE_LEVELS)[number], string> = {
		full: 'Full: everything shown',
		goal: 'Goal: the goal, with the hint behind a click',
		hint: 'Hint: only a hint behind a click'
	};
	const EVIDENCE_WORDS: Record<(typeof EVIDENCE_KINDS)[number], string> = {
		photo: 'Photo',
		file: 'File',
		text: 'Text',
		link: 'Link',
		youtube: 'YouTube link'
	};

	function addStep() {
		spec.steps = [...(spec.steps ?? []), { title: '', body: '', fade: 'full' }];
		onedit();
	}
	function removeStep(i: number) {
		spec.steps = (spec.steps ?? []).filter((_, j) => j !== i);
		onedit();
	}
	function moveStep(i: number, by: number) {
		const steps = [...(spec.steps ?? [])];
		const j = i + by;
		if (j < 0 || j >= steps.length) return;
		[steps[i], steps[j]] = [steps[j], steps[i]];
		spec.steps = steps;
		onedit();
	}
	function addReference() {
		spec.references = [...spec.references, { label: '', href: '' }];
		onedit();
	}
	function removeReference(i: number) {
		spec.references = spec.references.filter((_, j) => j !== i);
		onedit();
	}
	function addEvidence() {
		spec.evidence = [...spec.evidence, { kind: 'photo', label: '', required: true }];
		onedit();
	}
	function removeEvidence(i: number) {
		spec.evidence = spec.evidence.filter((_, j) => j !== i);
		onedit();
	}
</script>

<div class="dk-project" data-testid="cert-project-editor" data-guided={guided ? 'yes' : 'no'}>
	<div class="dk-fields">
		<label class="cert-field dk-wide"><span>Objective (one sentence)</span><input type="text" bind:value={spec.objective} /></label>
		<label class="cert-field dk-wide"><span>Spec (markdown: the full specification and acceptance criteria)</span><textarea rows="10" bind:value={spec.spec}></textarea></label>
		<LinesField label="Acceptance criteria (one a line)" value={spec.acceptance} onchange={(v) => { spec.acceptance = v; onedit(); }} />
		<LinesField label="Self-inspection checklist (one a line)" value={spec.self_inspection} onchange={(v) => { spec.self_inspection = v; onedit(); }} />
	</div>

	<h4 class="cert-section-h">References</h4>
	<ul class="dk-items">
		{#each spec.references as ref, i (i)}
			<li class="dk-item">
				<div class="dk-fields">
					<label class="cert-field"><span>Label</span><input type="text" bind:value={ref.label} /></label>
					<label class="cert-field"><span>Link (https)</span><input type="url" bind:value={ref.href} /></label>
				</div>
				<button type="button" class="btn cert-btn secondary" onclick={() => removeReference(i)}>Remove reference</button>
			</li>
		{/each}
	</ul>
	<button type="button" class="btn cert-btn secondary" onclick={addReference} data-testid="cert-project-add-reference">Add a reference</button>

	{#if guided}
		<h4 class="cert-section-h">Steps (help fades toward the end)</h4>
		<ul class="dk-items" data-testid="cert-project-steps">
			{#each spec.steps ?? [] as step, i (i)}
				<li class="dk-item">
					<div class="dk-item-head">
						<span class="dk-item-title">Step {i + 1}</span>
						<div class="cert-actions">
							<button type="button" class="btn cert-btn secondary" aria-disabled={i === 0 ? 'true' : undefined} onclick={() => moveStep(i, -1)}>Move up</button>
							<button type="button" class="btn cert-btn secondary" aria-disabled={i === (spec.steps?.length ?? 0) - 1 ? 'true' : undefined} onclick={() => moveStep(i, 1)}>Move down</button>
							<button type="button" class="btn cert-btn secondary" onclick={() => removeStep(i)}>Remove step</button>
						</div>
					</div>
					<div class="dk-fields">
						<label class="cert-field"><span>Title</span><input type="text" bind:value={step.title} /></label>
						<label class="cert-field"><span>Fade</span>
							<select bind:value={step.fade}>
								{#each FADE_LEVELS as f (f)}<option value={f}>{FADE_WORDS[f]}</option>{/each}
							</select>
						</label>
						<label class="cert-field dk-wide"><span>Body (markdown)</span><textarea rows="5" bind:value={step.body}></textarea></label>
						<label class="cert-field dk-wide"><span>Hint (shown behind a click on a goal or hint step)</span><input type="text" bind:value={step.hint} /></label>
					</div>
				</li>
			{/each}
		</ul>
		<button type="button" class="btn cert-btn secondary" onclick={addStep} data-testid="cert-project-add-step">Add a step</button>
	{/if}

	<h4 class="cert-section-h">Evidence the student must hand in</h4>
	<ul class="dk-items" data-testid="cert-project-evidence">
		{#each spec.evidence as ev, i (i)}
			<li class="dk-item">
				<div class="dk-fields">
					<label class="cert-field"><span>Kind</span>
						<select bind:value={ev.kind}>
							{#each EVIDENCE_KINDS as k (k)}<option value={k}>{EVIDENCE_WORDS[k]}</option>{/each}
						</select>
					</label>
					<label class="cert-field"><span>Label</span><input type="text" bind:value={ev.label} /></label>
				</div>
				<div class="cert-actions">
					<label class="dk-switch"><input type="checkbox" bind:checked={ev.required} /> Required</label>
					<button type="button" class="btn cert-btn secondary" onclick={() => removeEvidence(i)}>Remove item</button>
				</div>
			</li>
		{/each}
	</ul>
	<button type="button" class="btn cert-btn secondary" onclick={addEvidence} data-testid="cert-project-add-evidence">Add an evidence item</button>
</div>
