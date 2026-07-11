<script lang="ts">
	import '$lib/fsp/fsp-theme.css';

	/**
	 * /fsp — the FSP (Freshman Summer Program) hub. Public, no auth gate (like
	 * every other FSP surface). Neutral Bosco Tech theme, scoped under
	 * `.fsp-root` (see src/lib/fsp/fsp-theme.css). Currently two entries: the
	 * Pawn Build Wizard SolidWorks plugin download (first section, per spec)
	 * and a link through to the live /fsp-tech-selection ranking tool.
	 */

	const installSteps = [
		'Extract the zip to C:\\SolidWorks Addins\\IDEA\\FspPawnAddin\\',
		'Open SolidWorks 2025',
		'Go to Tools > Add-ins',
		'Click Browse and open FspPawnAddin.addin from that folder',
		'Check the box next to IDEA FSP Pawn Build and click OK',
		'The Pawn Build panel will appear in the SolidWorks task pane'
	];
</script>

<svelte:head>
	<title>Bosco Tech — FSP</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="fsp-root">
	<div class="hub">
		<header class="hub-header">
			<p class="eyebrow">Freshman Summer Program</p>
			<h1>FSP Tools</h1>
		</header>

		<section class="plugin-card" aria-labelledby="plugin-title">
			<div class="plugin-head">
				<div>
					<h2 id="plugin-title">PAWN BUILD PLUGIN</h2>
					<p class="plugin-subtitle">SolidWorks 2025 Add-in</p>
				</div>
				<a class="btn-download" href="/downloads/fsp-pawn-addin.zip">DOWNLOAD</a>
			</div>

			<p class="plugin-desc">
				Guides incoming students through the Day 1 chess pawn build. Automates file setup, sketch
				entry, and STEP export. Replaces the paper guide.
			</p>

			<dl class="requirements">
				<dt>Requires</dt>
				<dd>SolidWorks 2025, Windows 10 or later</dd>
			</dl>

			<div class="plugin-grid">
				<div class="plugin-col">
					<h3>Installation</h3>
					<ol class="steps">
						{#each installSteps as step (step)}
							<li>{step}</li>
						{/each}
					</ol>
				</div>

				<div class="plugin-col">
					<h3>Classroom setup</h3>
					<div class="callout">
						<p>
							Before FSP: place <strong>COPY ME - CHESS PAWN TEMPLATE.sldprt</strong> inside a folder
							named <strong>IDEA_FSP</strong> on each classroom computer's Desktop. The plugin reads
							from this location at startup.
						</p>
					</div>
				</div>
			</div>
		</section>

		<section class="link-card">
			<div>
				<h2>Tech Selection</h2>
				<p>Rank your top four Bosco Tech pathways during FSP.</p>
			</div>
			<a class="btn-secondary" href="/fsp-tech-selection">Open Tech Selection &rarr;</a>
		</section>
	</div>
</div>

<style>
	.hub {
		max-width: 760px;
		margin: 0 auto;
		padding: 2.25rem 1.25rem 4rem;
	}
	.hub-header {
		margin-bottom: 1.75rem;
	}
	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fsp-gold);
	}
	.hub-header h1 {
		margin: 0;
		font-size: 2rem;
		font-weight: 800;
		color: var(--fsp-navy);
	}

	.plugin-card,
	.link-card {
		background: var(--fsp-surface);
		border: 1px solid var(--fsp-line);
		border-radius: 14px;
		box-shadow: 0 8px 30px rgba(10, 37, 64, 0.08);
	}

	.plugin-card {
		padding: 1.75rem 1.75rem 2rem;
		margin-bottom: 1.5rem;
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
		font-size: 1.35rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		color: var(--fsp-navy);
	}
	.plugin-subtitle {
		margin: 0.15rem 0 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--fsp-muted);
	}

	.btn-download {
		flex: 0 0 auto;
		display: inline-block;
		font: inherit;
		font-weight: 800;
		font-size: 0.88rem;
		letter-spacing: 0.03em;
		padding: 0.7rem 1.4rem;
		border-radius: 9px;
		background: var(--fsp-gold);
		color: var(--fsp-navy-deep);
		text-decoration: none;
		white-space: nowrap;
	}
	.btn-download:hover {
		background: var(--fsp-gold-soft);
	}

	.plugin-desc {
		margin: 1.1rem 0 1.4rem;
		color: var(--fsp-ink);
		line-height: 1.55;
	}

	.requirements {
		margin: 0 0 1.5rem;
		padding: 0.65rem 0.9rem;
		background: var(--fsp-surface-2);
		border: 1px solid var(--fsp-line);
		border-radius: 8px;
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.requirements dt {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--fsp-muted);
	}
	.requirements dd {
		margin: 0;
		font-size: 0.88rem;
		color: var(--fsp-ink);
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

	.plugin-col h3 {
		margin: 0 0 0.6rem;
		font-size: 0.95rem;
		font-weight: 800;
		color: var(--fsp-navy);
	}

	.steps {
		margin: 0;
		padding-left: 1.25rem;
		color: var(--fsp-ink);
		font-size: 0.9rem;
		line-height: 1.65;
	}
	.steps li {
		margin-bottom: 0.25rem;
	}

	.callout {
		background: color-mix(in srgb, var(--fsp-gold) 12%, #fff);
		border: 1px solid color-mix(in srgb, var(--fsp-gold) 50%, transparent);
		border-radius: 8px;
		padding: 0.85rem 1rem;
	}
	.callout p {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--fsp-navy);
	}

	.link-card {
		padding: 1.4rem 1.75rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.link-card h2 {
		margin: 0 0 0.2rem;
		font-size: 1.15rem;
		font-weight: 800;
		color: var(--fsp-navy);
	}
	.link-card p {
		margin: 0;
		font-size: 0.88rem;
		color: var(--fsp-muted);
	}
	.btn-secondary {
		flex: 0 0 auto;
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--fsp-navy-2);
		text-decoration: none;
		border-bottom: 1px dotted currentColor;
		white-space: nowrap;
	}
</style>
