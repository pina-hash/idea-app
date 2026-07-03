<script lang="ts">
	import ToolsPage from '../../gauntlet/tools/+page.svelte';
	import '$lib/gauntlet/viewport/viewport.css';
	import type { ToolsManifest } from '$lib/gauntlet';

	/**
	 * Dev-only visual harness for the unified Tools page (which lives under the
	 * auth-gated /gauntlet tier and cannot be viewed signed-out). Mounts the real
	 * page component inside the .gt-root VIEWPORT wrapper with mock data + a
	 * manifest, so the two-column layout, version chips, and changelog render
	 * exactly as on the live page. Toggle the teacher view to check both branches.
	 */
	let teacher = $state(true);

	const manifest: ToolsManifest = {
		generated: '2026-07-02',
		macros: {
			version: '1.1',
			updated: '2026-07-02',
			changelog: [
				'Submit verifies the applied material by density, not name.',
				'Reports the challenge unit system (IPS / MMGS) with the run.',
				'Now served straight from the site, no storage dependency.'
			]
		},
		addin: {
			version: '1.3',
			updated: '2026-07-02',
			path: '/tools/idea-gauntlet-addin.zip',
			changelog: [
				'Download is now static-hosted on the site (fixes the 404).',
				'Non-blocking startup check for a newer add-in version.',
				'Live mass in the part own unit system with a target delta.'
			]
		}
	};

	// Loosely typed: this harness only needs the fields the Tools page reads, not
	// the full layout PageData (supabase/claims/userProfile).
	const data = $derived({
		supabase: undefined,
		claims: null,
		userProfile: null,
		userName: 'Alex Rivera',
		userRole: teacher ? 'teacher' : 'student',
		isTeacher: teacher,
		manifest
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
</script>

<svelte:head><title>Tools page harness</title></svelte:head>

<div class="dev-bar">
	<strong>Tools page harness</strong> (dev-only)
	<button type="button" onclick={() => (teacher = !teacher)}>
		View as: {teacher ? 'teacher' : 'student'} (toggle)
	</button>
</div>

<div class="gt-root">
	<ToolsPage {data} />
</div>

<style>
	.dev-bar {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: #04070a;
		border-bottom: 1px solid #16242c;
		color: #9fe6c0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
	}
	.dev-bar button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: #00f0ff;
		background: #0e161b;
		border: 1px solid #16242c;
		border-radius: 5px;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}
</style>
