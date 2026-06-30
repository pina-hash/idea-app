<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { MACRO_PATH } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, isTeacher, endpoint } = $derived(data);
</script>

<svelte:head>
	<title>Tools // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Tools' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">GAUNTLET Tools</span>
		<h1>SolidWorks capture macro</h1>
		<p class="lead">
			The macro reads your part geometry and posts a machine-verified Speedrun run. It is the
			ranked path: the server times the run from the moment you hit Start, so there is no client
			timer to trust and no mass to type.
		</p>
	</section>

	<a class="card author-callout" href={MACRO_PATH} download>
		<div>
			<div class="author-title">Download the macro</div>
			<div class="author-sub">idea-gauntlet-speedrun.bas, a SolidWorks VBA module.</div>
		</div>
		<span class="btn">Download &darr;</span>
	</a>

	<h2>One-time setup</h2>
	<ol class="setup-steps">
		<li>
			Open the macro and set the two constants at the top. The endpoint for this project is:
			<code class="endpoint">{endpoint}</code>
			and the anon key is your project's <strong>public</strong> anon key (Supabase, Project
			Settings, API, anon public). Both are public values, not secrets.
		</li>
		<li>
			In SolidWorks: <strong>Tools, Macro, New</strong> (or Edit), paste the module, and save. Or
			use <strong>Tools, Macro, Run</strong> and pick the saved file.
		</li>
		<li>Open the original part you modeled (parts only, not assemblies or drawings).</li>
	</ol>

	<h2>Running it</h2>
	<div class="card">
		<div class="field">
			<span class="key">Student submit</span>
			<span class="val">
				Reads your part, asks for the 8-character submit code from the Speedrun screen, posts the
				run, and shows pass or fail, your time, and your rank.
			</span>
		</div>
		<div class="field">
			<span class="key">Author capture</span>
			<span class="val">
				Reads the same geometry, asks for a density, and prints canonical volume, surface area,
				feature count, and mass to a message box and the clipboard, for seeding real challenges. No
				server call.
			</span>
		</div>
	</div>

	{#if isTeacher}
		<div class="card">
			<p>
				As a teacher, use <strong>Author capture</strong> to turn a real SolidWorks part into a
				challenge: model the canonical part, run the macro in Author mode, and paste the captured
				values into the challenge answer. The full web authoring UI is a later prompt.
			</p>
		</div>
	{/if}

	<h2>Rules</h2>
	<p class="instructions">
		Original parts only. The submit code is single use and expires about 30 minutes after you hit
		Start. Re-reveal in GAUNTLET for a fresh run, the clock starts again from that reveal.
	</p>

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet/speedrun">&lsaquo; Speedrun</a>
		<a class="btn secondary" href="/gauntlet">All modes</a>
	</div>
</main>
