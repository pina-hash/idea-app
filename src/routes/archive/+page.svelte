<script lang="ts">
	import { ARCHIVE_COURSES } from '$lib/curriculum';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
</script>

<svelte:head>
	<title>Course Archive (2025-26) // IDEA</title>
</svelte:head>

<div class="legacy-index">
	<header>
		<a class="logo" href="/">IDEA</a>
		<div class="header-right">
			<a class="auth-link" href="/">&lsaquo; Home</a>
			<ProfileMenu />
		</div>
	</header>

	<section class="hero">
		<div class="hero-eyebrow">Archive &middot; 2025-26</div>
		<h1>Course Archive</h1>
		<p class="hero-sub">
			Discontinued 2025-26 courses (IDEA-113 / 208 / 303 / 403). Kept for reference; the assignments
			remain open.
		</p>
	</section>

	<div class="courses">
		{#each ARCHIVE_COURSES as course (course.id)}
			<div class="course-card visible">
				<div class="course-header">
					<div class="course-header-left">
						<div class="course-id">{course.id}</div>
						<div class="course-updated">{course.title}</div>
					</div>
					<div class="course-meta">
						<span class="course-badge badge-grade">{course.gradeLabel}</span>
						<span class="course-badge badge-block">{course.blockLabel}</span>
						{#if course.classroomUrl}
							<a class="gc-link" href={course.classroomUrl} target="_blank" rel="noopener">
								Classroom ↗
							</a>
						{/if}
					</div>
				</div>
				<div class="assignment-list">
					{#if course.assignments.length}
						{#each course.assignments as a (a.slug)}
							<a class="assignment-item linked" href="/assignments/{a.slug}">
								<div class="assignment-left">
									<div class="assignment-dot dot-archived"></div>
									<div class="assignment-name">{a.title}</div>
								</div>
								<div class="assignment-right">
									<span class="assignment-status status-archived">Archived</span>
								</div>
							</a>
						{/each}
					{:else}
						<div class="empty-state">
							<div class="empty-icon">[ ]</div>
							<div class="empty-text">No assignments were posted for this course.</div>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<footer>
		<div class="footer-logo">IDEA - Integrated Design, Engineering &amp; Art</div>
		<a class="footer-archive" href="/">&lsaquo; Back to home</a>
		<div class="footer-version"><VersionBadge app="archive" /></div>
	</footer>
</div>
