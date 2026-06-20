<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();
	let { profile, email } = $derived(data);
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

	<p class="lead">
		This is the start of your IDEA portal. Saved work and IDEA features will appear here as they
		are built.
	</p>

	<form method="POST" action="?/signout" use:enhance>
		<button class="btn secondary" type="submit">Sign out</button>
	</form>
</main>
