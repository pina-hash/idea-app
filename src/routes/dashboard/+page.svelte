<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { displayName } from '$lib/profile';

	let { data } = $props();
	let { profile, email } = $derived(data);

	const teacherName = $derived(
		data.userProfile ? displayName(data.userProfile) : (profile?.full_name ?? email ?? 'Signed in')
	);
	const role = $derived(profile?.role ?? 'teacher');
</script>

<div class="legacy-index">
	<header>
		<a class="logo" href="/">IDEA</a>
		<div class="header-right">
			<div class="auth-block">
				<a class="auth-link" href="/">Home</a>
				<ProfileMenu />
			</div>
		</div>
	</header>

	<section class="hero">
		<div class="hero-eyebrow">Don Bosco Technical Institute - Teacher Dashboard</div>
		<h1>Welcome back<span class="accent">{profile?.full_name ? `, ${profile.full_name}` : ''}</span>.</h1>
		<p class="hero-sub">
			Teacher tools and portal controls. The public homepage carries the live 2026-27 curriculum for
			students.
		</p>
		<div class="hero-meta">
			<div class="hero-stat">
				<span class="value" style="color:var(--cyan); text-shadow:var(--glow-cyan)">{teacherName}</span>
				<span class="label">Signed in as</span>
			</div>
			<div class="hero-stat">
				<span class="value" style="color:var(--gold); text-shadow:var(--glow-gold); animation-delay:0.8s">{role}</span>
				<span class="label">Role</span>
			</div>
		</div>
	</section>

	<div class="divider">
		<div class="divider-line"></div>
		<div class="divider-label">Profile</div>
		<div class="divider-line"></div>
	</div>

	<div class="courses">
		<div class="course-card visible">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">Account</div>
					<div class="course-updated">Your portal profile</div>
				</div>
			</div>
			<div class="assignment-list">
				<div class="assignment-item">
					<div class="assignment-left">
						<div class="assignment-name">Name</div>
					</div>
					<div class="assignment-right">
						<span class="section-meta">{profile?.full_name ?? 'Not set'}</span>
					</div>
				</div>
				<div class="assignment-item">
					<div class="assignment-left">
						<div class="assignment-name">Email</div>
					</div>
					<div class="assignment-right">
						<span class="section-meta">{email ?? 'Not set'}</span>
					</div>
				</div>
				<div class="assignment-item">
					<div class="assignment-left">
						<div class="assignment-name">Role</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-status status-live">{role}</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="divider" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Teacher Tools</div>
		<div class="divider-line"></div>
	</div>

	<a class="promo-callout nextlive" href="/coin-entry">
		<div class="promo-left">
			<div class="promo-icon">&#9679;</div>
			<div>
				<div class="promo-title">Coin Entry</div>
				<div class="promo-sub">Award IDEA Coins to students.</div>
			</div>
		</div>
		<div class="promo-cta">Open &rsaquo;</div>
	</a>

	<div class="divider" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Content</div>
		<div class="divider-line"></div>
	</div>

	<a class="promo-callout" href="/">
		<div class="promo-left">
			<div class="promo-icon">&#9650;</div>
			<div>
				<div class="promo-title">Portal Homepage</div>
				<div class="promo-sub">The live 2026-27 curriculum, the student dashboard.</div>
			</div>
		</div>
		<div class="promo-cta">View &rsaquo;</div>
	</a>

	<a class="promo-callout" href="/archive">
		<div class="promo-left">
			<div class="promo-icon">&#9633;</div>
			<div>
				<div class="promo-title">Course Archive</div>
				<div class="promo-sub">Discontinued 2025-26 courses (IDEA-113/208/303/403).</div>
			</div>
		</div>
		<div class="promo-cta">View &rsaquo;</div>
	</a>

	<footer>
		<div class="footer-logo">IDEA - Integrated Design, Engineering &amp; Art</div>
		<div class="footer-sub">Don Bosco Technical Institute &bull; Rosemead, CA</div>
		<div class="footer-version"><VersionBadge app="dashboard" /></div>
	</footer>
</div>
