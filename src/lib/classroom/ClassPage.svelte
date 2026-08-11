<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		authorLabel,
		classworkGroups,
		emailLocal,
		formatDue,
		sectionTitle,
		shortWhen,
		streamItems,
		type ClassroomAssignment,
		type ClassroomPost,
		type ClassroomSection
	} from '$lib/classroom/classroom';

	/**
	 * One class: the Stream view (announcements + assignment posts, newest
	 * first) and the Classwork view (assignments by due date). Presentation
	 * only -- RLS already decided what is in `posts`/`assignments` (a student
	 * load simply never receives drafts), and `canManage` only adds chrome
	 * (draft badges, the manage link), never data.
	 */
	let {
		section,
		posts,
		assignments,
		canManage = false
	}: {
		section: ClassroomSection;
		posts: ClassroomPost[];
		assignments: ClassroomAssignment[];
		canManage?: boolean;
	} = $props();

	let tab: 'stream' | 'classwork' = $state('stream');

	const stream = $derived(streamItems(posts, assignments));
	const groups = $derived(classworkGroups(assignments));
</script>

<svelte:head>
	<title>{sectionTitle(section)} // IDEA Classroom</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/classroom">&lsaquo; My Classes</a>
		<ProfileMenu />
	</div>
</div>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA // Classroom'}</div>
		<h1>{section.course?.title ?? section.label}</h1>
		<p class="section-line">
			{section.label}{#if section.block}&nbsp;&middot; {section.block}{/if}
			&nbsp;&middot; {emailLocal(section.teacher_email)}
			{#if canManage}
				&nbsp;&middot; <a class="manage-link" href="/classroom/manage">Manage</a>
			{/if}
		</p>
	</section>

	<div class="tabs" role="tablist" aria-label="Class views">
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={tab === 'stream'}
			aria-selected={tab === 'stream'}
			onclick={() => (tab = 'stream')}
		>
			Stream
		</button>
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={tab === 'classwork'}
			aria-selected={tab === 'classwork'}
			onclick={() => (tab = 'classwork')}
		>
			Classwork
		</button>
	</div>

	{#if tab === 'stream'}
		{#if stream.length === 0}
			<section class="card">
				<p class="note empty-state">
					Nothing posted yet. Announcements and assignments from your teacher will show up here.
				</p>
			</section>
		{:else}
			{#each stream as item (item.kind === 'post' ? `p-${item.post.id}` : `a-${item.assignment.id}`)}
				{#if item.kind === 'post'}
					<article class="card stream-card">
						<div class="stream-head">
							<span class="stream-author">{authorLabel(item.post.author_name, item.post.author_email)}</span>
							<span class="stream-when">{shortWhen(item.post.created_at)}</span>
							{#if canManage && !item.post.published}<span class="draft-chip">Draft</span>{/if}
						</div>
						{#if item.post.title}<h2 class="stream-title">{item.post.title}</h2>{/if}
						<p class="stream-body">{item.post.body}</p>
					</article>
				{:else}
					<a
						class="card stream-card stream-assignment"
						href={`/classroom/${section.id}/assignment/${item.assignment.id}`}
					>
						<div class="stream-head">
							<span class="asg-flag">Assignment</span>
							<span class="stream-when">{shortWhen(item.assignment.created_at)}</span>
							{#if canManage && !item.assignment.published}<span class="draft-chip">Draft</span>{/if}
						</div>
						<h2 class="stream-title">{item.assignment.title}</h2>
						<p class="asg-meta">
							Due {formatDue(item.assignment.due_at)}
							{#if item.assignment.points != null}&nbsp;&middot; {item.assignment.points} pts{/if}
							{#if item.assignment.category}&nbsp;&middot; {item.assignment.category}{/if}
						</p>
					</a>
				{/if}
			{/each}
		{/if}
	{:else if groups.length === 0}
		<section class="card">
			<p class="note empty-state">
				No assignments yet. When your teacher posts classwork, it will be listed here by due date.
			</p>
		</section>
	{:else}
		{#each groups as group (group.id)}
			<section class="card work-group">
				<h2 class="group-label">{group.label}</h2>
				<div class="work-rows">
					{#each group.assignments as a (a.id)}
						<a class="work-row" href={`/classroom/${section.id}/assignment/${a.id}`}>
							<span class="work-main">
								<span class="work-title">
									{a.title}
									{#if canManage && !a.published}<span class="draft-chip">Draft</span>{/if}
								</span>
								<span class="work-due" class:overdue={group.id === 'past'}>
									Due {formatDue(a.due_at)}
								</span>
							</span>
							<span class="work-chips">
								{#if a.points != null}<span class="chip">{a.points} pts</span>{/if}
								{#if a.category}<span class="chip">{a.category}</span>{/if}
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	{/if}

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
	.section-line {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim);
	}
	.manage-link {
		color: var(--gold);
	}
	.tabs {
		display: flex;
		gap: 0.4rem;
		margin: 0 0 1rem;
		border-bottom: 1px solid var(--line);
	}
	.tab {
		appearance: none;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.5rem 0.9rem;
		cursor: pointer;
	}
	.tab.active {
		color: var(--green);
		border-bottom-color: var(--green);
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.empty-state {
		padding: 0.6rem 0;
	}
	.stream-card {
		display: block;
		margin-bottom: 0.9rem;
		text-decoration: none;
		color: var(--white);
	}
	.stream-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.35rem;
	}
	.stream-author {
		font-weight: 700;
		font-size: 0.9rem;
	}
	.stream-when {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	.draft-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
	}
	.stream-title {
		margin: 0.1rem 0 0.3rem;
		font-size: 1.05rem;
	}
	.stream-body {
		margin: 0;
		white-space: pre-wrap;
		line-height: 1.55;
		font-size: 0.95rem;
	}
	.stream-assignment:hover {
		border-color: var(--gold);
	}
	.asg-flag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		color: var(--gold);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.08rem 0.4rem;
	}
	.asg-meta {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.work-group {
		margin-bottom: 1rem;
	}
	.group-label {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.work-rows {
		display: flex;
		flex-direction: column;
	}
	.work-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		padding: 0.55rem 0.2rem;
		border-bottom: 1px solid var(--line);
		text-decoration: none;
		color: var(--white);
	}
	.work-row:last-child {
		border-bottom: none;
	}
	.work-row:hover .work-title {
		color: var(--gold);
	}
	.work-main {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.work-title {
		font-weight: 700;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.work-due {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	.work-due.overdue {
		color: var(--amber);
	}
	.work-chips {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--cyan);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		white-space: nowrap;
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
