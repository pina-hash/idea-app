<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';

	/**
	 * /fsp — the FSP (Freshman Summer Program) hub. Public, no auth gate. FSP is
	 * an IDEA pathway activity, so this page follows the standard IDEA-green /
	 * Rajdhani / Share Tech Mono app-shell design system (tokens + classes in
	 * app.css), NOT the neutral Bosco Tech theme used by /fsp-tech-selection
	 * (that tool is deliberately schoolwide-branded, per its own header comment;
	 * this hub is not, so it does not import fsp-theme.css). Two sections: the
	 * Pawn Build Wizard SolidWorks plugin download (first, per spec) and a link
	 * through to the live /fsp-tech-selection ranking tool.
	 *
	 * Install steps mirror tools/fsp-pawn-addin/README-install.md exactly:
	 * SOLIDWORKS discovers COM add-ins through the Windows registry, not a
	 * browsable manifest file, so registration is register.bat (self-elevating
	 * RegAsm /codebase), not a "Tools > Add-ins > Browse" flow.
	 */

	const installSteps = [
		'Extract the zip to a folder you keep (not a temp folder), e.g. C:\\SolidWorks Addins\\IDEA\\FspPawnAddin\\',
		'Right-click register.bat in that folder and choose Run as administrator (a plain double-click also works: it requests elevation itself)',
		'Open SolidWorks 2025',
		'Go to Tools > Add-ins and check the box next to IDEA FSP Pawn Build (both columns, to load now and at startup)',
		'The PAWN BUILD panel appears in the task pane strip on the right'
	];
</script>

<svelte:head>
	<title>FSP // IDEA</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<section class="hero">
		<span class="eyebrow">Freshman Summer Program</span>
		<a class="wordmark" href="/">IDEA</a>
		<p class="lead">Tools for incoming freshmen during FSP.</p>
	</section>

	<section class="card plugin-card" aria-labelledby="plugin-title">
		<div class="plugin-head">
			<div>
				<h2 id="plugin-title">PAWN BUILD PLUGIN</h2>
				<p class="plugin-subtitle">SolidWorks 2025 Add-in</p>
			</div>
			<a class="btn" href="/downloads/fsp-pawn-addin.zip" download>Download</a>
		</div>

		<p class="lead">
			Guided wizard for the Day 1 chess pawn build. Automates file setup, sketch entry, and STEP
			export.
		</p>

		<p class="requires">
			<span class="requires-key">Requires</span>
			<span class="mono requires-val">SolidWorks 2025, Windows 10 or later</span>
		</p>

		<div class="plugin-grid">
			<div>
				<h3 class="sub-heading">Installation</h3>
				<ol class="setup-steps">
					{#each installSteps as step (step)}
						<li>{step}</li>
					{/each}
				</ol>
			</div>

			<div>
				<h3 class="sub-heading">Classroom setup</h3>
				<div class="note">
					<p>
						No template setup needed. The plugin creates each student's starting part (in
						inches) and saves their work to an <strong>IDEA_FSP</strong> folder it makes on the
						Desktop.
					</p>
				</div>
			</div>
		</div>
	</section>

	<a class="card link-card" href="/fsp-tech-selection">
		<div>
			<h2>Tech Selection</h2>
			<p class="lead">Rank your top four Bosco Tech pathways during FSP.</p>
		</div>
		<span class="btn secondary" aria-hidden="true">Open &rarr;</span>
	</a>

	<p class="page-version"><VersionBadge app="portal" /></p>
</main>

<style>
	main {
		max-width: 760px;
	}
	.hero {
		text-align: left;
		padding: 1rem 0 2rem;
	}
	.hero .wordmark {
		display: block;
		font-size: clamp(2.4rem, 8vw, 3.4rem);
		margin: 0.3rem 0 0.6rem;
	}

	.plugin-card {
		padding: 1.75rem 1.75rem 2rem;
	}
	.plugin-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.plugin-head h2 {
		margin: 0;
	}
	.plugin-subtitle {
		margin: 0.3rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		color: var(--cyan);
	}

	.requires {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 1rem 0 1.5rem;
		padding: 0.6rem 0.9rem;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 3px;
	}
	.requires-key {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green);
	}
	.requires-val {
		font-size: 0.85rem;
		color: var(--cyan);
	}

	.plugin-grid {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1.75rem;
	}
	@media (max-width: 620px) {
		.plugin-grid {
			grid-template-columns: 1fr;
		}
	}

	.sub-heading {
		color: var(--green);
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 0.6rem;
	}

	.setup-steps {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.6rem;
	}
	.setup-steps li {
		color: var(--white);
		font-size: 0.88rem;
		line-height: 1.6;
	}
	.setup-steps li::marker {
		color: var(--green);
		font-family: var(--font-mono);
	}

	.note {
		background: var(--bg2);
		border: 1px solid var(--line-strong);
		border-left-width: 3px;
		border-radius: 3px;
		padding: 0.85rem 1rem;
	}
	.note p {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--white);
	}
	.note strong {
		color: var(--green);
	}

	.link-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.25rem;
		flex-wrap: wrap;
		text-decoration: none;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.link-card:hover {
		border-color: var(--line-strong);
		box-shadow: 0 0 0 1px rgba(0, 255, 65, 0.15);
	}
	.link-card h2 {
		margin: 0 0 0.3rem;
	}
	.link-card .lead {
		margin: 0;
		font-size: 0.9rem;
	}
</style>
