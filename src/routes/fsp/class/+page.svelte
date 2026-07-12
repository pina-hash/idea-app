<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';

	/**
	 * /fsp/class — the FSP (Freshman Summer Program) class materials hub. Public,
	 * no auth gate. This is the former /fsp landing page: /fsp is now the
	 * auth-gated FSP navigation hub (presentation / live feed / ask), and these
	 * class materials moved here, still reached from the hub ("Class materials")
	 * and from the curriculum section link.
	 *
	 * Built as a sibling of the other class pages (IDEA-113/208/403 style):
	 * wrapped in `.legacy-index` and built from the SAME header/hero/course-card
	 * classes those pages use (app.css), so it reads as one of the portal's
	 * class pages rather than a one-off design.
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

	const days = [
		{ id: 'Day 1', title: 'Intro deck, print lab tour, pawn or dogtag build.' },
		{ id: 'Day 2', title: 'FRC and facilities deck, shop tour, Blade build.' },
		{ id: 'Day 3', title: 'Curriculum overview, Blade tournament, exit card.' }
	];
</script>

<svelte:head>
	<title>FSP // IDEA</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="legacy-index fsp-page">
	<header>
		<a class="logo" href="/">IDEA</a>
		<div class="header-right">
			<a class="auth-link" href="/fsp">&lsaquo; FSP hub</a>
			<ProfileMenu />
		</div>
	</header>

	<section class="hero">
		<div class="hero-eyebrow">Incoming Freshman &middot; Summer</div>
		<h1>IDEA <span class="accent">FSP</span></h1>
		<p class="hero-sub">Freshman Summer Program. Runs before the regular school year.</p>
	</section>

	<div class="courses">
		<div class="course-card visible">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">PAWN BUILD + DOGTAG PLUGIN</div>
					<div class="course-updated">SolidWorks 2025 Add-in</div>
				</div>
				<div class="course-meta">
					<a class="course-badge badge-grade download-btn" href="/downloads/fsp-pawn-addin.zip" download
						>Download</a
					>
				</div>
			</div>
			<div class="card-body">
				<p class="lead">
					One add-in, two projects. Students choose at launch: chess pawn (3D printed overnight)
					or dogtag (laser cut overnight). Guides the full workflow from file creation to export.
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
			</div>
		</div>

		<div class="divider">
			<div class="divider-line"></div>
			<div class="divider-label">Projects</div>
			<div class="divider-line"></div>
		</div>

		<div class="project-grid">
			<div class="course-card visible">
				<div class="course-header">
					<div class="course-header-left">
						<div class="course-id">CHESS PAWN</div>
					</div>
					<div class="course-meta">
						<span class="course-badge badge-block">Day 1</span>
					</div>
				</div>
				<div class="card-body">
					<p class="lead">SolidWorks 3D modeling. Printed on the Bambu overnight.</p>
				</div>
			</div>

			<div class="course-card visible">
				<div class="course-header">
					<div class="course-header-left">
						<div class="course-id">DOGTAG</div>
					</div>
					<div class="course-meta">
						<span class="course-badge badge-block">Day 1 - Bonus</span>
					</div>
				</div>
				<div class="card-body">
					<p class="lead">Laser-cut on the xTool MetalFab. Students design the layout in the plugin.</p>
				</div>
			</div>
		</div>

		<div class="divider">
			<div class="divider-line"></div>
			<div class="divider-label">Program Overview</div>
			<div class="divider-line"></div>
		</div>

		<div class="day-grid">
			{#each days as day (day.id)}
				<div class="course-card visible day-card">
					<div class="course-header">
						<div class="course-header-left">
							<div class="course-id">{day.id}</div>
						</div>
					</div>
					<div class="card-body">
						<p class="lead">{day.title}</p>
					</div>
				</div>
			{/each}
		</div>

		<div class="divider">
			<div class="divider-line"></div>
			<div class="divider-label">Pulse Check</div>
			<div class="divider-line"></div>
		</div>

		<a class="course-card visible link-card" href="/fsp-pulse">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">Pathway Pulse</div>
					<div class="course-updated">View or manage incoming student interest snapshot.</div>
				</div>
				<div class="course-meta">
					<span class="course-badge badge-instructor">Open &rarr;</span>
				</div>
			</div>
			<div class="card-body">
				<p class="instructor-note">
					Instructor-only: restricted to @boscotech.edu and @boscotech.net sign-in.
				</p>
			</div>
		</a>
	</div>

	<footer>
		<div class="footer-logo">IDEA - Integrated Design, Engineering &amp; Art</div>
		<a class="footer-archive" href="/">&lsaquo; Back to home</a>
		<div class="footer-version"><VersionBadge app="portal" /></div>
	</footer>
</div>

<style>
	/* Card body: the class-page classes (app.css) style header/badges/footer,
	   but leave inner card content to the page, same division of labor as the
	   `.plugin-*` block on the original standalone FSP page. */
	.card-body {
		padding: 1.25rem 1.5rem 1.5rem;
	}
	.lead {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.6;
		color: var(--white);
	}

	.download-btn {
		text-decoration: none;
		cursor: pointer;
	}

	.requires {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 1rem 0 1.5rem;
		padding: 0.6rem 0.9rem;
		background: var(--bg2);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.12));
		border-radius: 3px;
	}
	.requires-key {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
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
		font-family: var(--font-display, 'Rajdhani', sans-serif);
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
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
	}

	.note {
		background: var(--bg2);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.2));
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

	.project-grid,
	.day-grid {
		display: grid;
		gap: 1.25rem;
	}
	.project-grid {
		grid-template-columns: 1fr 1fr;
	}
	.day-grid {
		grid-template-columns: repeat(3, 1fr);
	}
	@media (max-width: 700px) {
		.project-grid,
		.day-grid {
			grid-template-columns: 1fr;
		}
	}

	.link-card {
		display: block;
		text-decoration: none;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.link-card:hover {
		border-color: rgba(0, 255, 65, 0.35);
		box-shadow: 0 0 0 1px rgba(0, 255, 65, 0.15);
	}
	.instructor-note {
		margin: 0;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		color: var(--dim);
	}
</style>
