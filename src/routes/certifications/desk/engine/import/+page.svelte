<script lang="ts">
	import ImportPanel from '$lib/certifications/desk/ImportPanel.svelte';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import { CERT_PATHS } from '$lib/certifications/nav';
</script>

<svelte:head><title>Import a package, {PORTAL_NAME}</title></svelte:head>

<header class="cert-titlebar">
	<div>
		<p class="eyebrow cert-eyebrow">IDEA // Certifications</p>
		<h1 class="cert-title plate-title">Import a package</h1>
	</div>
	<a class="btn cert-btn secondary" href={CERT_PATHS.deskEngine}>Back to the engine</a>
</header>

<ImportPanel />
