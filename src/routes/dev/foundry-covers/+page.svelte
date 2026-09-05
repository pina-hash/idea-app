<script lang="ts">
	import FoundryMine from '$lib/foundry/FoundryMine.svelte';
	import { foundryCoverUrl } from '$lib/foundry/covers';
	import type { FoundryAppSummary } from '$lib/foundry/transports';
	import '$lib/foundry/forge.css';

	/**
	 * A 4x3 PNG, inline. `PRESENT` has to be a picture that really decodes, and
	 * it must not be a network request: the harness blocks every non-loopback
	 * request and a route on this origin would need a session and a bucket.
	 */
	const REAL_PNG =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAHElEQVQI12P8z8Dwn4EIwESMolGFowpHFRJSCACgvgQCVpJFTgAAAABJRU5ErkJggg==';

	/** The clock, threaded in, exactly as the real route threads it. */
	const now = new Date('2026-09-05T12:00:00Z');

	const OWNER = '99999999-9999-4999-8999-999999999999';

	/**
	 * FOUR ROWS, ONE PER STATE. `cover_path` is the only field that differs
	 * between them, so anything else that moves on screen is the rendering and
	 * not the fixture.
	 */
	function row(slug: string, title: string, cover: string | null): FoundryAppSummary {
		return {
			id: `${slug}-0000-4000-8000-000000000000`.slice(0, 36),
			slug,
			title,
			tagline: null,
			cover_path: cover,
			published_version_id: null,
			published_ordinal: null,
			version_count: 1,
			submitted_version_id: null,
			live_unreviewed_version_id: null,
			metadata_flagged_at: null,
			hidden_at: null,
			owner: OWNER,
			owner_name: null,
			owner_display_name: null,
			owner_class: null,
			created_at: '2026-09-01T00:00:00Z',
			updated_at: '2026-09-01T00:00:00Z'
		} as unknown as FoundryAppSummary;
	}

	const apps: FoundryAppSummary[] = [
		// PRESENT: a real key, and `coverUrl` below hands back bytes that decode.
		row('present', 'Present', `${OWNER}/6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png`),
		// ABSENT: no cover at all. The normal case.
		row('absent', 'Absent', null),
		// REFUSED: a value the COLUMN accepts and no upload produces.
		// `foundryCoverUrl` answers null locally, with no request made.
		row('refused', 'Refused', 'assets/img/cover.png'),
		// FAILED: a real key whose bytes do not decode, so the request is made
		// and the img errors -- which is also exactly what a server refusal
		// looks like from here, deliberately.
		row('failed', 'Failed', `${OWNER}/aa11bb22-cc33-dd44-ee55-ff6677889900.png`)
	];

	/**
	 * THE REAL BUILDER, with the transport substituted at the LAST step only.
	 * `foundryCoverUrl` still makes every accept/refuse decision -- so the
	 * REFUSED row is refused by the shipping predicate and not by this harness
	 * -- and what is swapped is only which bytes a permitted URL resolves to,
	 * because `/api/foundry-cover` needs a session and a bucket that a dev
	 * harness does not have.
	 */
	function coverUrl(path: string): string | null {
		const url = foundryCoverUrl(path);
		if (!url) return null;
		return path.includes('aa11bb22') ? BROKEN_BYTES : REAL_PNG;
	}

	/** Not an image. The `<img>` requests it, fails to decode, and errors. */
	const BROKEN_BYTES = 'data:image/png;base64,bm90LWFuLWltYWdl';
</script>

<svelte:head><title>Foundry cover states // dev</title></svelte:head>

<div class="fg-root harness" data-harness="foundry-covers">
	<h1>Foundry cover states</h1>
	<p class="lede">
		The four ways a cover can render once <code>foundry-covers</code> is private. Each row differs
		from the others in <code>cover_path</code> and in nothing else.
	</p>

	<ul class="legend">
		<li><b>Present</b> a key, and the bytes arrive.</li>
		<li><b>Absent</b> no <code>cover_path</code>. A normal state.</li>
		<li>
			<b>Refused</b> the stored value is not a key. Judged in the browser, no request made.
		</li>
		<li>
			<b>Failed</b> the request was made and produced no picture. A server refusal and broken
			bytes are ONE rendering on purpose.
		</li>
	</ul>

	<FoundryMine {apps} {coverUrl} {now} onSelect={() => {}} />
</div>

<style>
	.harness {
		padding: 1.5rem;
		min-height: 100vh;
		background: var(--fg-bg, #0e0c0a);
	}

	h1 {
		font-family: var(--font-display);
		color: var(--fg-ink);
	}

	.lede,
	.legend {
		max-width: 60ch;
		color: var(--fg-ink-2);
		font-family: var(--font-display);
	}

	.legend {
		padding-left: 1.1rem;
	}

	.legend li {
		margin-bottom: 0.25rem;
	}

	.legend b {
		color: var(--fg-ink);
	}
</style>
