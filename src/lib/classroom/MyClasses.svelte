<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ClassroomFeedback from '$lib/classroom/ClassroomFeedback.svelte';
	import { sectionTitle, sortSections, emailLocal, type ClassroomSection } from '$lib/classroom/classroom';
	import { recentUpdates, updateDateLabel } from '$lib/classroom/updates';
	import type { FeedbackEntry } from '$lib/feedback/feedback';

	/**
	 * The classroom home: one card per section the caller can see (their
	 * enrolled classes for a student, their own sections for a teacher --
	 * RLS already scoped the list, this only renders it). Presentation only,
	 * the CoinBalanceView split, so /dev/classroom mounts the same component.
	 *
	 * Cards carry the ONE shared gold accent (the homepage launcher's uniform
	 * --acc convention): differentiated by name and label, never by a
	 * per-card color.
	 */
	let {
		ready = true,
		isStaff = false,
		sections,
		basePath = '/classroom',
		homeHref = '/',
		submitFeedback = null
	}: {
		ready?: boolean;
		isStaff?: boolean;
		sections: ClassroomSection[];
		/** Link root -- rewritten under /classroom/view-as/<email>. */
		basePath?: string;
		homeHref?: string;
		submitFeedback?: ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null;
	} = $props();

	const ordered = $derived(sortSections(sections));
	const recent = recentUpdates(3);
</script>

<svelte:head>
	<title>Classroom // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href={homeHref}>&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Classroom</div>
		<h1>My Classes</h1>
		<p class="lead">
			Announcements and classwork for every class you are enrolled in, in one place.
		</p>
		{#if isStaff}
			<p class="staff-line">
				<a class="btn" href="/classroom/manage">Manage classes</a>
			</p>
		{/if}
	</section>

	{#if !ready}
		<section class="card">
			<p class="feedback error">
				Classroom is not available yet -- migration 0082 does not appear to be applied. Check back
				later.
			</p>
		</section>
	{:else if ordered.length === 0}
		<section class="card empty-card">
			{#if isStaff}
				<h2>No sections yet</h2>
				<p class="note">
					You have no sections yet. Head to <a href="/classroom/manage">Manage classes</a> to
					create your courses and sections, then import your roster.
				</p>
			{:else}
				<h2>No classes yet</h2>
				<p class="note">
					You are not enrolled in any classes yet. Your teacher adds the roster at the start of
					the year -- once that happens, your classes show up here automatically. Nothing for you
					to do.
				</p>
			{/if}
		</section>
	{:else}
		<div class="class-grid">
			{#each ordered as s (s.id)}
				<a class="class-card" href={`${basePath}/${s.id}`}>
					<span class="class-icon" aria-hidden="true">
						<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M16 6L3 12l13 6 13-6z" />
							<path d="M9 15v7c0 1.7 3.1 3.5 7 3.5s7-1.8 7-3.5v-7" />
							<path d="M29 12v8" />
						</svg>
					</span>
					<span class="class-text">
						<span class="class-code">{s.course?.code ?? 'CLASS'}</span>
						<span class="class-title">{s.course?.title ?? sectionTitle(s)}</span>
						<span class="class-meta">
							{s.label}{#if s.block}&nbsp;&middot; {s.block}{/if}
							&nbsp;&middot; {emailLocal(s.teacher_email)}
						</span>
					</span>
					<span class="class-cta">Open &#9656;</span>
				</a>
			{/each}
		</div>
	{/if}

	<!-- What changed lately, in plain language. The full log is its own page;
	     three entries here is a nudge, not a second changelog. -->
	<section class="card updates-card">
		<div class="updates-head">
			<h2>What's new</h2>
			<a class="updates-all" href={`${basePath}/updates`}>All updates &#9656;</a>
		</div>
		<ul class="updates-list">
			{#each recent as u (u.date + u.title)}
				<li>
					<span class="update-when">{updateDateLabel(u.date)}</span>
					<span class="update-title">{u.title}</span>
				</li>
			{/each}
		</ul>
	</section>

	<ClassroomFeedback context="home" submit={submitFeedback} />

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.updates-card {
		margin-top: 1.4rem;
	}
	.updates-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.updates-head h2 {
		margin: 0;
		font-size: 1rem;
	}
	.updates-all {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--gold);
		text-decoration: none;
	}
	.updates-list {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.updates-list li {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.update-when {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--cyan);
		white-space: nowrap;
	}
	.update-title {
		font-size: 0.9rem;
	}
	.classroom-page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.staff-line {
		margin: 0.8rem 0 0;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.empty-card h2 {
		margin-top: 0;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.note a {
		color: var(--gold);
	}
	.class-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 0.9rem;
	}
	/* Uniform gold accent (the launcher's shared --acc convention): every card
	   identical chrome, never a per-card color. */
	.class-card {
		--acc: var(--gold);
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 1rem 1.05rem 0.9rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 8px;
		text-decoration: none;
		color: var(--white);
		transition:
			border-color 0.15s ease,
			transform 0.1s ease;
	}
	.class-card:hover {
		border-color: var(--acc);
	}
	.class-card:active {
		transform: translateY(1px);
	}
	.class-icon {
		width: 2.2rem;
		height: 2.2rem;
		display: grid;
		place-items: center;
		color: var(--acc);
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg2);
	}
	.class-icon svg {
		width: 1.5rem;
		height: 1.5rem;
	}
	.class-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.class-code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		color: var(--acc);
	}
	.class-title {
		font-weight: 700;
		font-size: 1.05rem;
		line-height: 1.25;
	}
	.class-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	.class-cta {
		margin-top: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--acc);
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
