<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';

	let { data } = $props();
	let { supabase, userName, userRole } = $derived(data);
</script>

<svelte:head>
	<title>Add-in quick-start // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[{ label: 'Speedrun', href: '/gauntlet/speedrun' }, { label: 'Quick-start' }]}
/>

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">SolidWorks Add-In</span>
		<h1>Using the SolidWorks Speedrun Add-In</h1>
	</section>

	<div class="card qs-card">
		<h2>Before you start</h2>
		<ul class="qs-list">
			<li>
				The add-in is "IDEA // GAUNTLET" in SolidWorks. If it isn't showing, enable it under Tools
				&gt; Add-Ins, then open its task pane.
			</li>
			<li>
				Model in IPS or MMGS, whatever you prefer. The add-in follows your part's unit system:
				lb-primary on IPS parts, g-primary on MMGS parts, with the other value shown next to it.
			</li>
		</ul>
	</div>

	<div class="card qs-card">
		<h2>Running a speedrun</h2>
		<ol class="qs-steps">
			<li>
				Start the speedrun here in GAUNTLET first. You get a target (material, density, target mass)
				and a single-use code.
			</li>
			<li>Review the drawing before you touch SolidWorks. The clock does not start yet.</li>
			<li>
				In SolidWorks, open a NEW blank part. It must be empty. The add-in and the server both check
				for zero volume before letting you start.
			</li>
			<li>In the add-in pane, enter your code and confirm the target mass and unit system.</li>
			<li>Click Start. Your timer begins now, so only click Start when you are ready to model.</li>
			<li>
				Model the part to hit the target mass. The pane shows your live mass and how far you are from
				the target.
			</li>
			<li>
				Apply the challenge's material to your part (right-click Material in the tree). A submit
				with no material, or the wrong one, is rejected.
			</li>
			<li>Click Submit. You get PASS or OUTSIDE TOLERANCE, plus your time and rank.</li>
		</ol>
	</div>

	<div class="card qs-card">
		<h2>If something goes wrong</h2>
		<ul class="qs-list">
			<li>
				Started too early? The clock has been running since Start. Finish the part and submit, then
				retry a fresh run with a new code.
			</li>
			<li>
				The macros still work and are interchangeable with the add-in, so a run started one way can
				be finished the other.
			</li>
		</ul>
	</div>

	<div class="btn-row">
		<a class="btn" href="/gauntlet/speedrun">&lsaquo; Back to Speedrun</a>
		<a class="btn secondary" href="/gauntlet/tools">Macro &amp; tools</a>
	</div>
</main>

<style>
	/* VIEWPORT-styled reference page. No motion introduced here; the layout's
	   entrance choreography (already gated behind prefers-reduced-motion) applies
	   to these top-level blocks, and nothing below animates. */
	.qs-card {
		margin-bottom: 1rem;
	}
	.qs-card h2 {
		margin: 0 0 0.7rem;
	}
	.qs-list,
	.qs-steps {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.qs-list li,
	.qs-steps li {
		position: relative;
		padding-left: 2rem;
		color: var(--white);
		font-size: 0.95rem;
		line-height: 1.55;
	}
	.qs-list li::before {
		content: '\25B8';
		position: absolute;
		left: 0.35rem;
		top: 0;
		color: var(--cyan);
	}
	.qs-steps {
		counter-reset: qs;
	}
	.qs-steps li {
		counter-increment: qs;
	}
	.qs-steps li::before {
		content: counter(qs);
		position: absolute;
		left: 0;
		top: 0.1rem;
		width: 1.4rem;
		height: 1.4rem;
		display: grid;
		place-items: center;
		font-family: var(--font-data);
		font-size: 0.72rem;
		color: var(--green);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
	}
</style>
