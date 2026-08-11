<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		authorLabel,
		formatDue,
		sectionTitle,
		shortWhen,
		type ClassroomAssignment,
		type ClassroomSection
	} from '$lib/classroom/classroom';

	/**
	 * One assignment: description, due date, points, category, and resource
	 * links. Presentation only. The clearly-marked ENGINE SLOT below is where
	 * the interactive assignment engine and the submission UI mount in a later
	 * bundle -- it renders a placeholder card today so the layout (and the
	 * mount point) is already settled.
	 */
	let {
		section,
		assignment,
		canManage = false
	}: {
		section: ClassroomSection;
		assignment: ClassroomAssignment;
		canManage?: boolean;
	} = $props();

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return '';
		}
	}
</script>

<svelte:head>
	<title>{assignment.title} // IDEA Classroom</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href={`/classroom/${section.id}`}>&lsaquo; {sectionTitle(section)}</a>
		<ProfileMenu />
	</div>
</div>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'Assignment'} &middot; {section.label}</div>
		<h1>
			{assignment.title}
			{#if canManage && !assignment.published}<span class="draft-chip">Draft</span>{/if}
		</h1>
		<p class="byline">
			{authorLabel(assignment.author_name, assignment.author_email)}
			&nbsp;&middot; posted {shortWhen(assignment.created_at)}
		</p>
		<div class="meta-chips">
			<span class="chip" class:due-chip={assignment.due_at}>Due {formatDue(assignment.due_at)}</span>
			{#if assignment.points != null}<span class="chip">{assignment.points} pts</span>{/if}
			{#if assignment.category}<span class="chip">{assignment.category}</span>{/if}
		</div>
	</section>

	{#if assignment.description.trim()}
		<section class="card">
			<h2>Instructions</h2>
			<p class="description">{assignment.description}</p>
		</section>
	{/if}

	{#if assignment.resources.length}
		<section class="card">
			<h2>Materials</h2>
			<ul class="resource-list">
				{#each assignment.resources as r (r.url + (r.id ?? ''))}
					<li>
						<a class="resource-link" href={r.url} target="_blank" rel="noopener noreferrer">
							<span class="resource-glyph" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<path d="M10 14a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07L11 6" />
									<path d="M14 10a5 5 0 00-7.07 0L4.1 12.83a5 5 0 007.07 7.07L13 18" />
								</svg>
							</span>
							<span class="resource-label">{r.label}</span>
							<span class="resource-host">{hostOf(r.url)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- ENGINE SLOT ---------------------------------------------------------
	     The interactive assignment engine and the file-submission UI mount
	     HERE in a later bundle. Nothing else on this page moves when that
	     lands: the slot owns the space below the instructions and materials.
	----------------------------------------------------------------------- -->
	<section class="card engine-slot" aria-label="Assignment workspace (coming later)">
		<h2>Your work</h2>
		<p class="note">
			Turning work in through the portal is coming soon. For now, follow the instructions above and
			submit the way your teacher asked.
		</p>
	</section>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.classroom-page {
		max-width: 46rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.classroom-page > .card {
		margin-bottom: 1rem;
	}
	.classroom-page h2 {
		margin-top: 0;
	}
	.draft-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		vertical-align: middle;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		margin-left: 0.5rem;
	}
	.byline {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.meta-chips {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
	}
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--cyan);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}
	.due-chip {
		color: var(--gold);
		border-color: var(--gold);
	}
	.description {
		margin: 0;
		white-space: pre-wrap;
		line-height: 1.6;
		font-size: 0.98rem;
	}
	.resource-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.resource-link {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.2rem;
		border-bottom: 1px solid var(--line);
		text-decoration: none;
		color: var(--white);
		min-width: 0;
	}
	.resource-list li:last-child .resource-link {
		border-bottom: none;
	}
	.resource-link:hover .resource-label {
		color: var(--gold);
	}
	.resource-glyph {
		flex: none;
		width: 1.8rem;
		height: 1.8rem;
		display: grid;
		place-items: center;
		color: var(--gold);
		border: 1px solid var(--line);
		border-radius: 5px;
	}
	.resource-glyph svg {
		width: 1rem;
		height: 1rem;
	}
	.resource-label {
		font-weight: 700;
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
	.resource-host {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
		white-space: nowrap;
	}
	.engine-slot {
		border-style: dashed;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
