<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { START_MACRO_PATH, SUBMIT_MACRO_PATH, AUTHOR_MACRO_PATH } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, isTeacher } = $derived(data);
</script>

<svelte:head>
	<title>Tools // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Tools' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">GAUNTLET Tools</span>
		<h1>SolidWorks capture macros</h1>
		<p class="lead">
			A Speedrun run is two steps: the start macro begins your run on a blank part, and the submit
			macro posts your finished part. Your time is measured on the server from start to submit. The
			author macro reads a finished part's numbers for building a challenge.
		</p>
	</section>

	<a class="card author-callout" href={START_MACRO_PATH} download>
		<div>
			<div class="author-title">Start Macro</div>
			<div class="author-sub">
				idea-gauntlet-start.bas. Begins your run on a blank part and starts the clock. Already
				configured for this project.
			</div>
		</div>
		<span class="btn">Download &darr;</span>
	</a>

	<a class="card author-callout" href={SUBMIT_MACRO_PATH} download>
		<div>
			<div class="author-title">Student Submit Macro</div>
			<div class="author-sub">
				idea-gauntlet-submit.bas. Posts your finished part and ends the run. Already configured for
				this project.
			</div>
		</div>
		<span class="btn">Download &darr;</span>
	</a>

	<!-- SECTION 1: students -->
	<section class="tool-section">
		<h2>Submit your Speedrun</h2>
		<p class="section-intro">
			On the class computers this is already set up. You start a run on a blank part, build it, then
			submit. Your time is measured from when you start to when you submit.
		</p>
		<ol class="setup-steps">
			<li>
				Open SolidWorks and start a new part. Do not model anything yet. Your run must begin on a
				blank part.
			</li>
			<li>
				Go to the GAUNTLET Speedrun screen in your browser and find your 8-character code. It looks
				like ABCD1234. Keep that tab open.
			</li>
			<li>
				Click once on your SolidWorks window so it is in front. Press Ctrl + Shift + B to start your
				run. Type your code and click OK. A box confirms the run started and the clock is now running.
			</li>
			<li>Build your part. Do not close it while you work. Closing it ends your run.</li>
			<li>
				Apply the challenge's material to your part (right-click Material in the tree). A submit
				with no material, or the wrong one, is rejected until you fix it.
			</li>
			<li>
				When your part is finished, press Ctrl + Shift + G to submit. Type your code again and click
				OK.
			</li>
			<li>
				Wait a moment. A result box shows PASS with your time and rank, or OUTSIDE TOLERANCE. Click
				OK.
			</li>
		</ol>
		<p class="section-note">
			If you got OUTSIDE TOLERANCE, fix your model and press Ctrl + Shift + G to submit again with the
			same code. Your time keeps counting while you fix it. To start over completely, reveal the
			challenge again in GAUNTLET for a new code, then start a new blank run.
		</p>
		<div class="callout">
			<h4 class="callout-title">If something goes wrong</h4>
			<ul class="callout-list">
				<li>
					The box says "Could not connect to SolidWorks" -&gt; SolidWorks is not open. Open it first.
				</li>
				<li>
					The box says "No document is open" -&gt; you do not have a part open. Open your part.
				</li>
				<li>
					The box says "not a part" -&gt; you are looking at a drawing or an assembly. Switch to your
					part.
				</li>
				<li>
					The box says "This part is not blank" -&gt; you already modeled something. Start a brand new
					empty part and press Ctrl + Shift + B again.
				</li>
				<li>
					The box says "No run has been started" when you submit -&gt; you skipped the start step or
					closed the part. Start a new blank part, press Ctrl + Shift + B, build, then submit.
				</li>
				<li>The box says "not configured" -&gt; tell Mr. Pina. This computer needs setup.</li>
				<li>
					Nothing happens when you press the keys -&gt; click on your part first, then press the keys
					again. If still nothing, tell Mr. Pina, the shortcut is not set on this computer.
				</li>
			</ul>
		</div>
	</section>

	{#if isTeacher}
		<!-- SECTION 2: one-time setup (teacher) -->
		<section class="tool-section">
			<h2>One-time setup on a new computer</h2>
			<p class="section-intro">
				Do this once on each computer. Students do not do this. Every lab machine needs two macros
				installed and bound: Start and Submit. Install each one the same way below, then give it its
				shortcut. Bind Start to Ctrl + Shift + B and Submit to Ctrl + Shift + G. The Author Capture
				macro is for teacher machines only, not lab machines (see the author section below).
			</p>

			<h3 class="sub-heading">Install a macro (do this for both Start and Submit)</h3>
			<ol class="setup-steps">
				<li>Download both the Start and Submit macros above. They save to your Downloads folder.</li>
				<li>Open SolidWorks.</li>
				<li>In the top menu, click Tools, then Macro, then New.</li>
				<li>
					A Save window opens. Give it a clear name, GAUNTLET Start or GAUNTLET Submit, pick a folder
					you will remember, and click Save. This creates a .swp file and opens the macro code editor.
				</li>
				<li>
					In the code editor's top menu, click File, then Import File. Pick the matching .bas file you
					downloaded and click Open.
				</li>
				<li>
					In the left-hand panel you will see an empty item named Module1. Right click it, choose
					Remove Module1, and click No when it asks to export.
				</li>
				<li>
					In the top menu click File, then Save. Close the code editor window. Now repeat steps 3 to 7
					for the other macro, so both Start and Submit are installed.
				</li>
			</ol>

			<h3 class="sub-heading">Assign each keyboard shortcut</h3>
			<ol class="setup-steps" start="8">
				<li>Back in SolidWorks, click Tools, then Customize.</li>
				<li>
					Click the Macros tab. Click Browse and pick a .swp file. Set the method to main. Name it
					GAUNTLET Start or GAUNTLET Submit to match the file. Add it. Do this for both .swp files.
				</li>
				<li>Click the Keyboard tab. Set Category to Macros so both macros show.</li>
				<li>
					Click in the Shortcut column next to GAUNTLET Start and press Ctrl + Shift + B. Click in the
					Shortcut column next to GAUNTLET Submit and press Ctrl + Shift + G. Click OK.
				</li>
				<li>
					Test both: open a new blank part, press Ctrl + Shift + B and confirm the start box appears,
					then press Ctrl + Shift + G and confirm the submit box appears.
				</li>
			</ol>

			<h3 class="sub-heading">Copy the setup to every other computer</h3>
			<ol class="setup-steps" start="13">
				<li>
					On the computer you just set up, open the SolidWorks Copy Settings Wizard from the Windows
					Start menu. Choose Save Settings and save the settings file to the G: drive with the other
					GAUNTLET files.
				</li>
				<li>
					On each other computer, run the Copy Settings Wizard, choose Restore Settings, and pick that
					saved file. This copies both macro shortcuts over without redoing steps 1 through 12.
				</li>
			</ol>
		</section>

		<a class="card author-callout" href={AUTHOR_MACRO_PATH} download>
			<div>
				<div class="author-title">Author Capture Macro</div>
				<div class="author-sub">
					idea-gauntlet-author.bas. Reads a finished part's numbers for building a challenge. Teacher
					machines only.
				</div>
			</div>
			<span class="btn">Download &darr;</span>
		</a>

		<!-- SECTION 3: author capture (teacher) -->
		<section class="tool-section">
			<h2>Capture a part to build a challenge</h2>
			<p class="section-intro">
				The Author Capture macro reads a finished part and gives you the numbers that become a
				challenge's answer key. It only runs on your own machine, never on student computers. It does
				not talk to the server and needs no setup beyond installing it.
			</p>

			<h3 class="sub-heading">Install it</h3>
			<p class="section-body">
				Install idea-gauntlet-author.bas exactly like the Start and Submit macros. Follow the same
				install steps in the setup section above, using idea-gauntlet-author.bas. When you assign its
				keyboard shortcut, use Ctrl + Shift + A so it does not collide with the start or submit
				shortcuts. You can skip the shortcut and run it from the menu instead if you prefer.
			</p>

			<h3 class="sub-heading">Use it</h3>
			<ol class="setup-steps">
				<li>
					Open your finished reference part in SolidWorks. This is the correct, final version of the
					part, the one that defines the right answer.
				</li>
				<li>Make sure you are looking at the part, not a drawing and not an assembly.</li>
				<li>
					Run the Author Capture macro. Press Ctrl + Shift + A, or click Tools, then Macro, then Run,
					and pick idea-gauntlet-author.swp.
				</li>
				<li>
					A box asks for the material density in g/cm3. Type the density of the material you want
					students to model in, for example 2.70 for Aluminum 6061. Click OK.
				</li>
				<li>
					A box appears with the captured values: target_volume_mm3, surface_area_mm2, feature_count,
					density, and target_mass. The same values are copied to your clipboard automatically.
				</li>
				<li>
					Open the GAUNTLET challenge you are authoring and use these values to fill in the challenge
					answer. The target mass is what students see as their goal. The volume is the real check
					behind it.
				</li>
				<li>
					Save the challenge as a draft. Before you publish, run the Submit macro against this same
					part with a test code to confirm it passes, then publish.
				</li>
			</ol>

			<div class="callout">
				<h4 class="callout-title">If something goes wrong</h4>
				<ul class="callout-list">
					<li>
						The box says "Could not connect to SolidWorks" -&gt; SolidWorks is not open. Open it
						first.
					</li>
					<li>
						The box says "No document is open" -&gt; you do not have a part open. Open your reference
						part.
					</li>
					<li>
						The box says "not a part" -&gt; you are looking at a drawing or an assembly. Switch to the
						part.
					</li>
					<li>
						The target mass looks wrong -&gt; check the density you typed. Mass is volume times
						density, so a wrong density gives a wrong mass.
					</li>
				</ul>
			</div>
		</section>
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet/speedrun">&lsaquo; Speedrun</a>
		<a class="btn secondary" href="/gauntlet">All modes</a>
	</div>
</main>

<style>
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
	.section-body {
		color: var(--white);
		font-size: 0.9rem;
		line-height: 1.65;
		margin: 0.4rem 0 0.8rem;
	}
	.section-note {
		color: var(--cyan);
		font-size: 0.88rem;
		line-height: 1.6;
		margin: 0.9rem 0;
		padding-left: 0.8rem;
		border-left: 2px solid var(--line-strong);
	}
	.sub-heading {
		color: var(--green);
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 1.3rem 0 0.2rem;
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
