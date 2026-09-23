<script lang="ts">
	/**
	 * THE TUTORIAL PANEL. Non-modal: it sits beside the work, never over it,
	 * closes with one press, and picks up where it stopped the next time it is
	 * opened (the step is stored in the Hints preferences). Each step is one
	 * line and a ring on the REAL control it names, found by its registry
	 * command id (`data-command`); the step moves on when the student has done
	 * it in their own document (`tutorial.ts`). Where the control is not on
	 * screen (a tool folded under More), the panel offers the command itself.
	 */
	import { untrack } from 'svelte';
	import type { WorkspaceApi } from '../workspace-api';
	import { commandById } from '../command-registry';
	import { TUTORIAL, TUTORIAL_STEPS, advance, firstStepOf, tasksDone, tutorialFacts, tutorialPosition, tutorialProgress, type TutorialFacts } from './tutorial';
	let { api, onclose }: { api: WorkspaceApi; onclose: () => void } = $props();
	/* A fake workspace with no preferences still runs the tutorial, for this session only. */
	let local = $state<{ step: string | null; finished: boolean }>({ step: null, finished: false });
	const stored = $derived(api.prefs?.hints.tutorial ?? local);
	const position = $derived(tutorialPosition(stored));
	const current = $derived(position.index === null ? null : TUTORIAL_STEPS[position.index]);
	const command = $derived(current ? commandById(current.command) : undefined);
	const done = $derived(tasksDone(position));
	const facts = $derived(tutorialFacts(api.model, api.manifest?.features ?? [], api.tool));
	function save(p: { step: string | null; finished: boolean }) {
		if (api.prefs && api.setPreference) api.setPreference('hints', { ...api.prefs.hints, tutorial: p });
		else local = p;
	}
	/* Each step counts from where it began; a step resumed on another day begins now. */
	let start: TutorialFacts | null = null, startFor = -1;
	$effect(() => {
		const index = position.index, now = facts;
		if (index === null) { startFor = -1; return; }
		untrack(() => {
			if (startFor !== index || !start) { start = now; startFor = index; }
			const next = advance(index, start, now);
			if (next !== index) save(tutorialProgress(next));
		});
	});
	const skip = () => { if (position.index !== null) save(tutorialProgress(position.index + 1)); };
	const jump = (task: number) => save(tutorialProgress(firstStepOf(task)));
	/* The ring on the real control: re-measured on a short timer while a step is showing, because the palette, the context toolbar and the panels move. */
	let panel = $state<HTMLElement>();
	let ring = $state<{ left: number; top: number; width: number; height: number } | null>(null);
	/* A tool folded under More rings the More button instead (`data-more-tools`), so the student opens it and the ring moves onto the tool. */
	function target(id: string): HTMLElement | null {
		return visible(`[data-command="${CSS.escape(id)}"]`) ?? (commandById(id)?.tool ? visible('[data-more-tools]') : null);
	}
	function visible(selector: string): HTMLElement | null {
		for (const el of document.querySelectorAll<HTMLElement>(selector)) {
			if (panel?.contains(el)) continue;
			const r = el.getBoundingClientRect();
			if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) return el;
		}
		return null;
	}
	$effect(() => {
		const id = current?.command;
		if (!id) { ring = null; return; }
		const measure = () => { const el = target(id); if (!el) { ring = null; return; } const r = el.getBoundingClientRect(); ring = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; };
		measure();
		const timer = setInterval(measure, 300);
		return () => clearInterval(timer);
	});
</script>
<section class="tutorial panel" aria-label="Tutorial" data-testid="ideacad-tutorial" bind:this={panel}>
	<div class="head">
		<h2>Learn</h2>
		<span class="count" data-testid="ideacad-tutorial-count">{done} of {TUTORIAL.length}</span>
		<button type="button" class="close" onclick={onclose} data-testid="ideacad-tutorial-close">Close</button>
	</div>
	{#if current}
		<p class="task">{current.task.title}<span class="of">{current.task.steps.findIndex((s) => s.id === current.id) + 1} of {current.task.steps.length}</span></p>
		<p class="line" role="status" data-testid="ideacad-tutorial-step" data-step={current.id}>{current.line}</p>
		<div class="actions">
			{#if !ring && command}<button type="button" class="run" data-testid="ideacad-tutorial-run" onclick={() => api.runCommand?.(command.id)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={command.icon} /></svg>{command.name}</button>{/if}
			<button type="button" onclick={skip} data-testid="ideacad-tutorial-skip">Skip</button>
		</div>
	{:else if position.finished}
		<p class="line" role="status" data-testid="ideacad-tutorial-step">All {TUTORIAL.length} done</p>
		<div class="actions"><button type="button" onclick={() => jump(0)} data-testid="ideacad-tutorial-restart">Start over</button></div>
	{:else}
		<div class="actions"><button type="button" class="start" onclick={() => jump(0)} data-testid="ideacad-tutorial-start">Start</button></div>
	{/if}
	<ol class="tasks">
		{#each TUTORIAL as task, i (task.id)}
			{@const rowState = i < done ? 'done' : current?.taskIndex === i ? 'now' : ''}
			<li><button type="button" class="task-row" class:now={rowState === 'now'} aria-current={rowState === 'now' ? 'step' : undefined} data-task={task.id} onclick={() => jump(i)}><span class="mark" aria-hidden="true">{rowState === 'done' ? '✓' : rowState === 'now' ? '▸' : i + 1}</span><span class="title">{task.title}</span><span class="meta">{rowState}</span></button></li>
		{/each}
	</ol>
	<!-- Inside the panel, not beside it: a panel column that turns pointer events back on for its children must never make the ring catch the press meant for the control it rings. Fixed, so it is drawn over the control wherever the panel sits. -->
	{#if ring}<span class="ring" aria-hidden="true" data-testid="ideacad-tutorial-ring" style:left={`${ring.left - 4}px`} style:top={`${ring.top - 4}px`} style:width={`${ring.width + 8}px`} style:height={`${ring.height + 8}px`}><span class="badge">{(current?.taskIndex ?? 0) + 1}</span></span>{/if}
</section>
<style>
	.tutorial{display:grid;gap:6px}
	.head{display:flex;align-items:center;gap:8px}
	h2{margin:0;font-size:18px;flex:1}
	.count,.of,.meta{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	.task{margin:0;display:flex;justify-content:space-between;align-items:baseline;gap:8px;font:600 16px Rajdhani,sans-serif;color:var(--text-1)}
	.line{margin:0;padding:8px 10px;border:1px solid var(--green);border-radius:4px;background:color-mix(in srgb,var(--green) 10%,var(--surface-1));color:var(--text-1);font:17px/1.3 Rajdhani,sans-serif}
	.actions{display:flex;flex-wrap:wrap;gap:6px}
	.tutorial button{min-height:44px;box-sizing:border-box;padding:4px 12px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;cursor:pointer}
	.tutorial .close{padding:4px 10px}
	.tutorial .start,.tutorial .run{border-color:var(--green);color:var(--green);display:inline-flex;align-items:center;gap:6px}
	.tasks{list-style:none;margin:0;padding:0;display:grid;gap:2px}
	.tutorial .task-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border-color:transparent;background:transparent;padding:4px 8px}
	.tutorial .task-row.now{border-color:var(--green)}
	.mark{width:1.2em;text-align:center;color:var(--text-2)}.now .mark{color:var(--green)}
	.task-row .title{flex:1;min-width:0}
	.ring{position:fixed;z-index:70;box-sizing:border-box;border:2px solid var(--cyan);border-radius:8px;pointer-events:none}
	.badge{position:absolute;right:-10px;top:-10px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:10px;background:var(--cyan);color:var(--bg0,#0b140b);font:700 13px/20px Rajdhani,sans-serif;text-align:center}
	@media (prefers-reduced-motion: no-preference){.ring{animation:ic-ring 1.6s ease-in-out infinite}}
	@keyframes ic-ring{0%,100%{outline:0 solid transparent}50%{outline:4px solid color-mix(in srgb,var(--cyan) 35%,transparent)}}
</style>
