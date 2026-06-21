<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();
	let { profile, email, isTeacher, courses } = $derived(data);
</script>

<header class="app-header">
	<a class="wordmark" href="/">IDEA<span>.</span></a>
	<div class="header-right">
		<div class="user-block">
			<div class="user-name">{profile?.full_name ?? email ?? 'Signed in'}</div>
			<div class="user-role">{profile?.role ?? 'visitor'}</div>
		</div>
		<form method="POST" action="?/signout" use:enhance>
			<button class="btn secondary" type="submit">Sign out</button>
		</form>
	</div>
</header>

<main>
	<span class="eyebrow">Dashboard</span>
	<h1>Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}.</h1>

	<div class="card">
		<div class="field">
			<span class="key">Name</span>
			<span class="val">{profile?.full_name ?? 'Not set'}</span>
		</div>
		<div class="field">
			<span class="key">Email</span>
			<span class="val">{email ?? 'Not set'}</span>
		</div>
		<div class="field">
			<span class="key">Role</span>
			<span class="val meta">{profile?.role ?? 'visitor'}</span>
		</div>
	</div>

	<h2>Assignments</h2>
	{#each courses as course (course.id)}
		<div class="card">
			<div class="field">
				<span class="course-id">{course.id}</span>
				<span class="course-title">{course.title}</span>
			</div>
			{#if course.assignments.length > 0}
				<ul class="assignment-list">
					{#each course.assignments as a (a.slug)}
						<li><a href="/assignments/{a.slug}">{a.title}</a></li>
					{/each}
				</ul>
			{:else}
				<p class="course-empty">{course.note ?? 'No assignments yet.'}</p>
			{/if}
		</div>
	{/each}

	{#if isTeacher}
		<h2>Teacher tools</h2>
		<div class="card">
			<p>Award coins to students.</p>
			<div class="btn-row">
				<a class="btn" href="/coin-entry">Open coin entry</a>
			</div>
		</div>
	{/if}

	<p class="lead" style="margin-top: 2rem;">
		This is the start of your IDEA portal. Saved work and IDEA features will appear here as they
		are built.
	</p>
</main>
