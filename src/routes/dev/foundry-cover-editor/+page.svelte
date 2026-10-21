<script lang="ts">
	/**
	 * /dev/foundry-cover-editor (ledger 0422): the REAL cover editor beside
	 * three REAL gallery cards, one with an HTML cover, one with a picture, one
	 * with the generated cover. The transports move this page's own state, so a
	 * save changes what the card and the preview show. The HTML cover is served
	 * by `./sample` under the REAL cover policy.
	 */
	import { page } from '$app/state';
	import '$lib/foundry/forge.css';
	import FoundryCard from '$lib/foundry/FoundryCard.svelte';
	import FoundryCoverEditor, { type FoundryCoverTransports } from '$lib/foundry/FoundryCoverEditor.svelte';

	const start = page.url.searchParams.get('start') ?? 'html';
	const PICTURE = `data:image/svg+xml;utf8,${encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c3c2c"/><stop offset="1" stop-color="#121a12"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><circle cx="430" cy="140" r="70" fill="#78b870" opacity=".85"/><text x="40" y="350" font-family="sans-serif" font-size="56" font-weight="700" fill="#eae6d8">Cookie Press</text></svg>'
	)}`;

	let rev = $state(start === 'html' ? 1 : 0);
	let image = $state<string | null>(start === 'image' ? PICTURE : null);
	let calls = $state<string[]>([]);
	const htmlUrl = $derived(rev ? `/dev/foundry-cover-editor/sample?v=${rev}` : null);

	const transports: FoundryCoverTransports = {
		async uploadImage() {
			return { ok: true, path: 'harness/picture.png' };
		},
		async setCover(_id, kind, value) {
			calls = [...calls, kind];
			if (kind === 'html') {
				if (!value) return { ok: false, message: 'The HTML cover is empty.' };
				rev += 1;
			} else if (kind === 'image') {
				rev = 0;
				image = PICTURE;
			} else {
				rev = 0;
				image = null;
			}
			return { ok: true };
		}
	};
	const app = (id: string, slug: string, title: string, cover: string | null) => ({ id, slug, title, cover_path: cover, owner_display_name: 'Ana Reyes', owner_full_name: 'Ana Reyes', owner_class: 'IDEA100 Block 2' });
	const blade = app('0b7f5d1e-3c2a-4e7b-9a10-5d6e7f8a9b0c', 'blade-run', 'Blade Run', null);
</script>

<main class="fce-harness fg-root" data-testid="foundry-cover-harness">
	<h1>Cover</h1>
	<ul class="fce-cards">
		<li><FoundryCard app={{ ...blade, cover_path: image ? 'x/y.png' : null }} href="#blade" coverUrl={() => image} htmlCover={htmlUrl} /></li>
		<li><FoundryCard app={app('1b7f5d1e-3c2a-4e7b-9a10-5d6e7f8a9b0c', 'cookie', 'Cookie Press', 'x/y.png')} href="#cookie" coverUrl={() => PICTURE} /></li>
		<li><FoundryCard app={app('2b7f5d1e-3c2a-4e7b-9a10-5d6e7f8a9b0c', 'orbit', 'Orbit Drift', null)} href="#orbit" /></li>
	</ul>
	<FoundryCoverEditor
		app={blade}
		imageUrl={image}
		{htmlUrl}
		overridden={!!(rev || image)}
		{transports}
	/>
	<p class="fce-calls" data-testid="fce-calls">{calls.join(', ') || '(none yet)'}</p>
</main>

<style>
	.fce-harness {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1rem;
		min-height: 100vh;
	}
	.fce-cards {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.8rem;
	}
	.fce-calls {
		color: var(--text-2, var(--dim));
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
</style>
