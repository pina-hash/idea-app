<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();
	let { profile, email, isTeacher, courses } = $derived(data);
</script>

<main>
	<h1>Dashboard</h1>
	<p class="lead">Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}.</p>

	<div class="card">
		<div class="field">
			<span>Name</span>
			<span>{profile?.full_name ?? 'Not set'}</span>
		</div>
		<div class="field">
			<span>Email</span>
			<span>{email ?? 'Not set'}</span>
		</div>
		<div class="field">
			<span>Role</span>
			<span>{profile?.role ?? 'visitor'}</span>
		</div>
	</div>

	<h2>Assignments</h2>
	{#each courses as course (course.id)}
		<div class="card">
			<div class="field">
				<span>{course.id}</span>
				<span>{course.title}</span>
			</div>
			{#if course.assignments.length > 0}
				<ul>
					{#each course.assignments as a (a.slug)}
						<li><a href="/assignments/{a.slug}">{a.title}</a></li>
					{/each}
				</ul>
			{:else}
				<p class="lead">{course.note ?? 'No assignments yet.'}</p>
			{/if}
		</div>
	{/each}

	{#if isTeacher}
		<h2>Teacher tools</h2>
		<div class="card">
			<p>Award coins to students.</p>
			<a class="btn secondary" href="/coin-entry">Open coin entry</a>
		</div>
	{/if}

	<p class="lead">
		This is the start of your IDEA portal. Saved work and IDEA features will appear here as they
		are built.
	</p>

	<form method="POST" action="?/signout" use:enhance>
		<button class="btn secondary" type="submit">Sign out</button>
	</form>
</main>
