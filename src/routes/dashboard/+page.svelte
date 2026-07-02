<script lang="ts">
	import { enhance } from '$app/forms';
	import VersionBadge from '$lib/VersionBadge.svelte';

	let { data } = $props();
	let { profile, email } = $derived(data);
</script>

<header class="app-header">
	<a class="wordmark" href="/">IDEA</a>
	<div class="header-right">
		<div class="user-block">
			<div class="user-name">{profile?.full_name ?? email ?? 'Signed in'}</div>
			<div class="user-role">{profile?.role ?? 'teacher'}</div>
		</div>
		<form method="POST" action="?/signout" use:enhance>
			<button class="btn secondary" type="submit">Sign out</button>
		</form>
	</div>
</header>

<main>
	<span class="eyebrow">Teacher Dashboard</span>
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
			<span class="val meta">{profile?.role ?? 'teacher'}</span>
		</div>
	</div>

	<h2>Teacher tools</h2>
	<div class="card">
		<p>Award coins to students.</p>
		<div class="btn-row">
			<a class="btn" href="/coin-entry">Open coin entry</a>
		</div>
	</div>

	<h2>Content</h2>
	<div class="card">
		<p>The public homepage carries the live 2026-27 curriculum. Discontinued courses live in the archive.</p>
		<div class="btn-row">
			<a class="btn secondary" href="/">View homepage</a>
			<a class="btn secondary" href="/archive">Course archive</a>
		</div>
	</div>

	<p class="page-version"><VersionBadge app="dashboard" /></p>
</main>
