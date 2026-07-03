<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import {
		START_MACRO_PATH,
		SUBMIT_MACRO_PATH,
		AUTHOR_MACRO_PATH,
		ADDIN_DOWNLOAD_PATH,
		type ToolTrack
	} from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, isTeacher, manifest } = $derived(data);

	const addin = $derived(manifest?.addin ?? null);
	const macros = $derived(manifest?.macros ?? null);

	const fmtVer = (t: ToolTrack | null) =>
		t ? `v${t.version} · updated ${t.updated}` : 'version unknown';
</script>

<svelte:head>
	<title>Tools // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Tools' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">GAUNTLET Tools</span>
		<h1>SolidWorks run tools</h1>
		<p class="lead">
			Everything for a ranked Speedrun in one place. Pick <strong>one</strong> tool: the
			<strong>add-in</strong> (a docked task pane, recommended) or the <strong>VBA macros</strong>.
			Both do the same job. They start your run on a blank part and post your finished part; your time
			is measured on the server from Start to Submit.
		</p>
	</section>

	<!-- Which should I use? -->
	<section class="which-tool card">
		<h2 class="which-title">Which should I use?</h2>
		<div class="which-grid">
			<div class="which-col">
				<span class="which-pick recommended">Add-in &middot; recommended</span>
				<ul class="which-list">
					<li>Docked task pane with live mass and Start / Submit buttons.</li>
					<li>No keyboard shortcuts to configure.</li>
					<li>One-time install per computer (unzip, run register.bat).</li>
					<li>Best for the class computers and anyone new.</li>
				</ul>
			</div>
			<div class="which-col">
				<span class="which-pick">VBA macros</span>
				<ul class="which-list">
					<li>Two importable .bas files, no install package.</li>
					<li>Run from a keyboard shortcut you bind once.</li>
					<li>Good if you cannot register a COM add-in.</li>
					<li>Same server contract, same result.</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- The two tool tracks, side by side. -->
	<div class="tools-two-col">
		<!-- SolidWorks add-in -->
		<section class="tool-col recommended">
			<div class="tool-col-head">
				<div>
					<span class="tool-col-tag">Recommended</span>
					<h2>SolidWorks add-in</h2>
				</div>
				<span class="ver-chip">{fmtVer(addin)}</span>
			</div>
			<div class="tool-actions">
				<a class="btn" href={ADDIN_DOWNLOAD_PATH} download>Download add-in (.zip)</a>
			</div>

			<h3 class="sub-heading">Install (once per computer)</h3>
			<ol class="setup-steps">
				<li>Download the zip above and unzip it to a folder you keep (not a temp folder).</li>
				<li>Right-click <span class="mono">register.bat</span> and choose Run as administrator.</li>
				<li>Open SolidWorks, then Tools &rarr; Add-Ins, and check IDEA // GAUNTLET (both columns).</li>
				<li>The task pane appears on the right tab strip. Full notes are in the README inside the zip.</li>
			</ol>

			<h3 class="sub-heading">Use it</h3>
			<ol class="setup-steps">
				<li>On the GAUNTLET Speedrun screen, press Start to reveal the drawing and your 8-character code.</li>
				<li>On a new blank part, type the code into the pane and press START RUN.</li>
				<li>Model the part and apply the challenge's material.</li>
				<li>Press SUBMIT RUN. The pane shows PASS with your time and rank, or OUTSIDE TOLERANCE.</li>
			</ol>

			{#if addin?.changelog?.length}
				<details class="changelog">
					<summary>What's new in v{addin.version}</summary>
					<ul class="changelog-list">
						{#each addin.changelog as line (line)}<li>{line}</li>{/each}
					</ul>
				</details>
			{/if}
		</section>

		<!-- VBA macros -->
		<section class="tool-col">
			<div class="tool-col-head">
				<div><h2>VBA macros</h2></div>
				<span class="ver-chip">{fmtVer(macros)}</span>
			</div>
			<div class="tool-actions">
				<a class="btn secondary" href={START_MACRO_PATH} download>Start macro</a>
				<a class="btn secondary" href={SUBMIT_MACRO_PATH} download>Submit macro</a>
			</div>

			<h3 class="sub-heading">Install (once per computer)</h3>
			<ol class="setup-steps">
				<li>In SolidWorks, Tools &rarr; Macro &rarr; New. Save a .swp for each macro (Start, Submit).</li>
				<li>In the macro editor, File &rarr; Import File and pick the matching .bas you downloaded.</li>
				<li>Remove the empty Module1 (choose No when it offers to export), then File &rarr; Save.</li>
				<li>
					Tools &rarr; Customize &rarr; Keyboard: bind Start to <span class="mono">Ctrl+Shift+S</span>
					and Submit to <span class="mono">Ctrl+Shift+D</span>.
				</li>
			</ol>

			<h3 class="sub-heading">Use it</h3>
			<ol class="setup-steps">
				<li>Reveal the challenge on the Speedrun screen to get your 8-character code.</li>
				<li>On a new blank part, press <span class="mono">Ctrl+Shift+S</span>, enter the code to start.</li>
				<li>Model the part and apply the challenge's material.</li>
				<li>Press <span class="mono">Ctrl+Shift+D</span> to submit and see PASS or OUTSIDE TOLERANCE.</li>
			</ol>

			{#if macros?.changelog?.length}
				<details class="changelog">
					<summary>What's new in v{macros.version}</summary>
					<ul class="changelog-list">
						{#each macros.changelog as line (line)}<li>{line}</li>{/each}
					</ul>
				</details>
			{/if}
		</section>
	</div>

	<!-- Shared run notes + troubleshooting (applies to both tools). -->
	<section class="tool-section">
		<h2>During a run</h2>
		<p class="section-intro">
			Your run must begin on a blank part; the clock starts at Start, not when the drawing is
			revealed, so study the drawing first. Do not close the part while you work. If you get OUTSIDE
			TOLERANCE, fix your model and submit again with the same code, your time keeps counting. To
			start over completely, reveal the challenge again for a fresh code and start a new blank run.
		</p>
		<div class="callout">
			<h4 class="callout-title">If something goes wrong</h4>
			<ul class="callout-list">
				<li>"Could not connect to SolidWorks" &rarr; SolidWorks is not open. Open it first.</li>
				<li>"No document is open" / "not a part" &rarr; open your part (not a drawing or assembly).</li>
				<li>"This part is not blank" &rarr; start a brand new empty part, then Start again.</li>
				<li>
					"No run has been started" on submit &rarr; you skipped Start or closed the part. Start a new
					blank part, Start, build, then submit.
				</li>
				<li>Wrong material &rarr; apply the challenge's material (checked by density), then submit again.</li>
				<li>"not configured" or nothing happens &rarr; tell Mr. Pina; this computer needs setup.</li>
			</ul>
		</div>
	</section>

	{#if isTeacher}
		<!-- Teacher-only: author capture macro. -->
		<section class="tool-section">
			<div class="tool-col-head">
				<div><h2>Author capture macro (teachers)</h2></div>
				{#if macros}<span class="ver-chip">{fmtVer(macros)}</span>{/if}
			</div>
			<p class="section-intro">
				The Author Capture macro reads a finished reference part and gives you the numbers that become
				a challenge's answer key. It runs on your machine only, never on student computers, and never
				talks to the server.
			</p>
			<div class="tool-actions">
				<a class="btn secondary" href={AUTHOR_MACRO_PATH} download>Author capture macro</a>
			</div>

			<h3 class="sub-heading">Install and use</h3>
			<ol class="setup-steps">
				<li>
					Install <span class="mono">idea-gauntlet-author.bas</span> the same way as the Start / Submit
					macros. Bind it to <span class="mono">Ctrl+Shift+A</span>, or run it from the menu.
				</li>
				<li>Open your finished reference part (the correct final version that defines the answer).</li>
				<li>Run the macro and type the material density in g/cm3 (for example 2.70 for Aluminum 6061).</li>
				<li>
					It prints target_volume_mm3, surface_area_mm2, feature_count, density, and target_mass, and
					copies them to your clipboard.
				</li>
				<li>
					Fill the challenge answer with these values, save it as a draft, run Submit against the same
					part with a test code to confirm a pass, then publish.
				</li>
			</ol>
		</section>

		<!-- Teacher-only: rolling the macro shortcuts out to every machine. -->
		<section class="tool-section">
			<h2>Copy the macro setup to every computer</h2>
			<p class="section-intro">
				After binding the Start and Submit shortcuts on one machine, use the SolidWorks Copy Settings
				Wizard (Windows Start menu) to Save Settings to the G: drive, then Restore Settings on each
				other computer. That copies both shortcuts without redoing the install. The add-in has its own
				per-computer install (run register.bat), so lab machines can use either tool.
			</p>
		</section>
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet/speedrun">&lsaquo; Speedrun</a>
		<a class="btn secondary" href="/gauntlet/speedrun/quickstart">Add-in quick-start</a>
		<a class="btn secondary" href="/gauntlet">All modes</a>
	</div>
</main>

<style>
	.which-tool {
		margin: 1rem 0 0.4rem;
	}
	.which-title {
		margin: 0 0 0.8rem;
		font-size: 1.05rem;
	}
	.which-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
	}
	.which-pick {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan);
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		padding: 0.2rem 0.6rem;
		margin-bottom: 0.5rem;
	}
	.which-pick.recommended {
		color: var(--green);
		border-color: var(--green);
	}
	.which-list {
		margin: 0;
		padding-left: 1.05rem;
		display: grid;
		gap: 0.35rem;
	}
	.which-list li {
		color: var(--white);
		font-size: 0.88rem;
		line-height: 1.5;
	}

	.tools-two-col {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
		margin: 1rem 0 0.5rem;
	}
	@media (min-width: 820px) {
		.tools-two-col {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
	.tool-col {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 1.1rem 1.2rem 1.3rem;
	}
	.tool-col.recommended {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px rgba(0, 255, 65, 0.08);
	}
	.tool-col-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.tool-col-head h2 {
		margin: 0.15rem 0 0;
		font-size: 1.05rem;
	}
	.tool-col-tag {
		font-family: var(--font-mono);
		font-size: 0.56rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--green);
	}
	.ver-chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		color: var(--cyan);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.2rem 0.5rem;
		white-space: nowrap;
	}
	.tool-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin: 0.8rem 0 0.4rem;
	}
	.changelog {
		margin-top: 0.9rem;
	}
	.changelog summary {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
		cursor: pointer;
	}
	.changelog-list {
		margin: 0.5rem 0 0;
		padding-left: 1.05rem;
		display: grid;
		gap: 0.3rem;
	}
	.changelog-list li {
		color: var(--white);
		font-size: 0.85rem;
		line-height: 1.45;
	}

	.tool-section {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
	}
	.section-intro {
		color: var(--white);
		font-size: 0.95rem;
		line-height: 1.6;
		margin: 0.4rem 0 0.8rem;
	}
	.sub-heading {
		color: var(--green);
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 1.2rem 0 0.2rem;
	}
	.callout {
		margin: 1.1rem 0 0.5rem;
		padding: 0.9rem 1.1rem;
		background: var(--bg2);
		border: 1px solid var(--amber);
		border-left-width: 3px;
		border-radius: 4px;
	}
	.callout-title {
		color: var(--amber);
		font-family: var(--font-display);
		font-size: 0.95rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 0.6rem;
	}
	.callout-list {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.55rem;
	}
	.callout-list li {
		color: var(--white);
		font-size: 0.88rem;
		line-height: 1.55;
	}
	.callout-list li::marker {
		color: var(--amber);
	}
</style>
