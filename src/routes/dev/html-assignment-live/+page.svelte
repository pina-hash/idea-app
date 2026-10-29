<script lang="ts">
	/**
	 * THE LIVE-WORKSHEET HARNESS (ledger 0431). Three features, each on the REAL
	 * component over the REAL `/hx/` worksheet fixture:
	 *
	 *   - CLOSE AND REOPEN move the `lock` prop, which is exactly what the item
	 *     page does when its heartbeat or the class's live notice reports the
	 *     student's own row moving. The document is told read only through the
	 *     ordinary `idea:state`, and the sentence appears above it.
	 *   - FULL PAGE is the frame's own key; nothing here drives it but a click.
	 *   - ANSWERS LEFT is the real rail with `onjump` handed in, a tall spacer
	 *     between it and the frame (`?spacer=0` removes it), so a jump has to
	 *     scroll the page to be seen working.
	 *
	 * `window.__hxLive` is a plain snapshot of what is rendered, for the browser
	 * pass; it holds no idea of the state of its own.
	 */
	import { browser } from '$app/environment';
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import Progress from '$lib/classroom/html-assignment/Progress.svelte';
	import AnswersLeft from '$lib/classroom/html-assignment/AnswersLeft.svelte';
	import { hxAnswersLeft, type HxJumpResult } from '$lib/classroom/html-assignment/answers-left';
	import { hxProgress } from '$lib/classroom/html-assignment/progress';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type { AssignmentLockState } from '$lib/classroom/html-assignment/lock';
	import type { HxSteps } from '$lib/classroom/html-assignment/bridge';

	let { data } = $props();

	// A run starts in the ordinary view: full page is remembered per browser,
	// and a harness must not inherit the last run's choice.
	if (browser) {
		try {
			localStorage.removeItem('idea.hx.fullpage');
		} catch {
			/* no storage is the ordinary view too */
		}
	}

	// svelte-ignore state_referenced_locally
	const manifest = data.manifest as HtmlAssignmentManifest;
	let values = $state<Record<string, string | boolean>>({ teamName: 'Seeded from the parent' });
	// svelte-ignore state_referenced_locally
	let lock = $state<AssignmentLockState>(data.lock);
	let ready = $state(false);
	let expanded = $state(false);
	let jumps = $state<{ field: string; result: HxJumpResult }[]>([]);
	let frame = $state<ReturnType<typeof HtmlAssignmentFrame> | null>(null);
	/** The document's steps (ledger 0458), drawn in the rail as the item page does. */
	let steps = $state<HxSteps | null>(null);

	const src = $derived(`${data.sandboxOrigin}/hx/${data.docId}`);
	const groups = $derived(hxAnswersLeft(manifest, hxProgress(manifest, values, {})));

	async function jump(field: string): Promise<HxJumpResult> {
		const result = (await frame?.focusField(field)) ?? 'none';
		jumps = [...jumps, { field, result }];
		return result;
	}

	$effect(() => {
		(window as unknown as { __hxLive: unknown }).__hxLive = {
			ready,
			lock,
			expanded,
			values: { ...values },
			left: groups.flatMap((g) => g.items.map((i) => i.field)),
			jumps: jumps.map((j) => `${j.field}=${j.result}`),
			steps: steps ? { n: steps.steps.length, current: steps.current } : null
		};
	});
</script>

<svelte:head><title>Live worksheet harness</title></svelte:head>

<main class="live" class:edit-layer-open={expanded}>
	<header class="live-head">
		<h1>Live worksheet</h1>
		<p class="note">
			The real frame, rail and Answers left over <code>/hx/{data.docId}</code>. Close and Reopen move the
			lock as the item page's heartbeat does.
		</p>
		<div class="keys">
			<button type="button" class="btn tap-44" data-drive="close" onclick={() => (lock = 'closed')}>Close</button>
			<button type="button" class="btn tap-44" data-drive="reopen" onclick={() => (lock = 'open')}>Reopen</button>
		</div>
		<p class="note" data-testid="live-lock">lock: {lock}</p>
	</header>

	{#if data.showTitle}
		<h2 class="live-title" data-testid="live-post-title">{manifest.title}</h2>
	{/if}

	<Progress {manifest} {values} onjump={jump} {steps} ongostep={(i) => frame?.goStep(i)} />

	{#if data.spacer}
		<div class="spacer" aria-hidden="true" data-testid="live-spacer"></div>
	{/if}

	<HtmlAssignmentFrame
		bind:this={frame}
		{src}
		title="Bridge fixture worksheet"
		fieldToBlockId={data.fieldToBlockId}
		{values}
		{lock}
		expandable
		onexpand={(on) => (expanded = on)}
		chrome={leftChrome}
		minHeight={240}
		onready={() => (ready = true)}
		onchange={(c) => (values = { ...values, [c.field]: c.value })}
		onsteps={(s) => (steps = s)}
		hostSteps={data.hostSteps && !expanded}
		hostTitle={data.showTitle && !expanded}
	/>
</main>

{#snippet leftChrome()}
	<AnswersLeft {groups} onjump={jump} compact />
{/snippet}

<style>
	.live {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		padding: var(--space-4, 1rem);
		max-width: 72rem;
		margin: 0 auto;
	}
	.live.edit-layer-open {
		z-index: auto;
	}
	.live-head h1 {
		margin: 0 0 0.25rem;
	}
	.note {
		margin: 0 0 var(--space-2, 0.5rem);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
	}
	.keys {
		display: flex;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
	}
	.live-title {
		margin: 0;
		font-family: var(--font-display);
	}
	.spacer {
		height: 1400px;
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-md, 8px);
	}
</style>
