<script lang="ts">
	/**
	 * THE SUBMIT AND MY-APPS HARNESS.
	 *
	 * It mounts the REAL `FoundrySubmit` and `FoundryMine` -- not a copy of
	 * their markup -- with the transports answered in memory, so the whole
	 * create -> cover -> upload -> version -> ingest orchestration can be driven
	 * with no network, no Supabase project and no signed-in session.
	 *
	 * THE IN-MEMORY INGEST IS THE REAL PREFLIGHT, and that is what makes this a
	 * harness rather than a mock. It runs `preflightZipInBrowser` over the SAME
	 * normalized zip the surface would have uploaded, so the file list, the
	 * warnings and the notes it hands back are produced by the code the server
	 * runs, from the same module, with the same wording. What it does NOT do is
	 * the two things only a server can: the incremental uncompressed cap and the
	 * storage write. A harness missing a guard the real page has makes a passing
	 * drive prove nothing, so both omissions are stated on the page itself.
	 *
	 * THE FIXTURES ARE BUILT HERE, in the browser, as real `File` objects, so
	 * each of the three input shapes can be driven without a file picker: a zip,
	 * a folder with noise in it, and a single HTML file that is not called
	 * index.html.
	 */
	import AppFrame from '$lib/foundry/AppFrame.svelte';
	import FoundryContract from '$lib/foundry/FoundryContract.svelte';
	import { inflateEntry, readCentralDirectory } from '$lib/foundry/zip';
	import { extensionOf, isTextExtension } from '$lib/foundry/preflight';
	import FoundryMine from '$lib/foundry/FoundryMine.svelte';
	import '$lib/foundry/forge.css';
	import FoundrySubmit from '$lib/foundry/FoundrySubmit.svelte';
	import { normalizeFoundryInput } from '$lib/foundry/normalize';
	import { PLATFORM_FONTS_URL, foundryBuildContract } from '$lib/foundry/preflight';
	import { preflightZipInBrowser } from '$lib/foundry/preflight-browser';
	import { buildZip } from '$lib/foundry/zip-write';
	import type {
		FoundryApp,
		FoundryAppSummary,
		FoundryMineTransports,
		FoundrySubmitTransports,
		IngestOutcome
	} from '$lib/foundry/transports';

	let { data } = $props();

	const enc = new TextEncoder();

	/* ------------------------------------------------------------ fixtures */

	/*
	 * THE FONT LINK IS THE CONSTANT, NOT A TYPED PATH, AND THAT IS A REPAIR.
	 *
	 * Both fixtures wrote the root-relative `/_platform/fonts.css`, which is
	 * exactly what `classifyReference` refuses -- so "Zip (passes)" DID NOT
	 * PASS. Driving it produced a leading-slash refusal, the surface stayed on
	 * `blocked`, and the done panel this harness exists to reach was
	 * unreachable. It failed in the reassuring direction: the button said
	 * passes, the refusal that came back was a real and correct one, and
	 * nothing on screen said the fixture was the thing that was wrong.
	 *
	 * Interpolating `PLATFORM_FONTS_URL` is what stops it happening again: the
	 * fixture now says whatever the rule says, in the same commit.
	 */
	const GOOD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tide Clock</title>
<link rel="stylesheet" href="${PLATFORM_FONTS_URL}">
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1>Tide Clock</h1>
<img src="art/wave.png" alt="A wave">
<script src="app.js"><\/script>
</body>
</html>`;

	const BAD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Broken</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
</head>
<body>
<img src="/art/logo.png" alt="Logo">
<script>
fetch('https://api.example.com/data').then((r) => r.json());
<\/script>
</body>
</html>`;

	const GOOD_CSS = `body { font-family: 'Rajdhani', sans-serif; background: #0b0f0c; }`;
	const GOOD_JS = `document.querySelector('h1').addEventListener('click', () => {
	localStorage.setItem('taps', String(Number(localStorage.getItem('taps') ?? 0) + 1));
});`;

	function png(): Uint8Array {
		// A real 1x1 PNG, so the extension allowlist and the mime table are
		// exercised on actual bytes rather than on a renamed text file.
		const b64 =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
		const bin = atob(b64);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}

	function file(path: string, bytes: Uint8Array | string, type = ''): File {
		const data = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
		const name = path.slice(path.lastIndexOf('/') + 1);
		const f = new File([data as BlobPart], name, { type });
		Object.defineProperty(f, 'webkitRelativePath', { value: path, configurable: true });
		return f;
	}

	/** Shape 1: a real zip, uploaded as-is. */
	async function fixtureZip(html: string, name = 'tide-clock.zip'): Promise<File[]> {
		const bytes = await buildZip([
			{ path: 'index.html', bytes: enc.encode(html) },
			{ path: 'style.css', bytes: enc.encode(GOOD_CSS) },
			{ path: 'app.js', bytes: enc.encode(GOOD_JS) },
			{ path: 'art/wave.png', bytes: png() }
		]);
		const f = new File([bytes as BlobPart], name, { type: 'application/zip' });
		return [f];
	}

	/** Shape 2: a folder, with the noise a real one carries. */
	function fixtureFolder(): File[] {
		return [
			file('tide-clock/index.html', GOOD_HTML),
			file('tide-clock/style.css', GOOD_CSS),
			file('tide-clock/app.js', GOOD_JS),
			file('tide-clock/art/wave.png', png(), 'image/png'),
			file('tide-clock/.DS_Store', 'noise'),
			file('tide-clock/art/.DS_Store', 'noise'),
			file('tide-clock/Thumbs.db', 'noise'),
			file('tide-clock/__MACOSX/._index.html', 'noise'),
			file('tide-clock/.git/config', '[core]'),
			file('tide-clock/.git/HEAD', 'ref: refs/heads/main'),
			file('tide-clock/node_modules/left-pad/index.js', 'module.exports = 1;'),
			file('tide-clock/node_modules/left-pad/package.json', '{}')
		];
	}

	/**
	 * Shape 3: one HTML file, deliberately not called index.html, and carrying
	 * its JavaScript INLINE -- which is what this shape always looks like.
	 *
	 * The `fetch` is the point. Until inline scripts were scanned, every JS rule
	 * was switched off for exactly this upload, so a single page could call the
	 * network and pass every check. The warning it now earns is the proof that
	 * it does not.
	 */
	const SINGLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tide Clock</title>
<link rel="stylesheet" href="${PLATFORM_FONTS_URL}">
</head>
<body>
<h1>Tide Clock</h1>
<script>
  const el = document.querySelector('h1');
  fetch('https://api.example.com/tides').then((r) => r.json());
<\/script>
</body>
</html>`;

	function fixtureSingle(): File[] {
		return [file('my-page.html', SINGLE_HTML)];
	}

	/* ---------------------------------------------------------- transports */

	let uploads = $state<{ path: string; size: number }[]>([]);
	let created = $state<string[]>([]);
	let lastZip = $state<Blob | null>(null);

	const submitTransports: FoundrySubmitTransports = {
		uid: '00000000-0000-4000-8000-00000000dev0',
		existingApps: [{ id: 'app-1', slug: 'tide-clock', title: 'Tide Clock' }],

		async createApp(input) {
			created = [...created, `app ${input.slug}`];
			return { ok: true, appId: 'app-new', slug: input.slug };
		},

		async uploadZip(zip, path) {
			lastZip = zip;
			uploads = [...uploads, { path, size: zip.size }];
			return { ok: true };
		},

		async createVersion() {
			created = [...created, 'version'];
			return { ok: true, versionId: 'version-new', ordinal: 2 };
		},

		/** The on-page submit press, recorded like every other write here. */
		async submitVersion(versionId) {
			created = [...created, `submitted ${versionId}`];
			return { ok: true };
		},

		/**
		 * THE REAL PREFLIGHT, over the zip the surface actually produced. Not a
		 * canned response: a fixture that fails here fails for the reason the
		 * server would give, in the server's words.
		 */
		async ingest(): Promise<IngestOutcome> {
			const empty: IngestOutcome = {
				ok: false,
				failures: [],
				warnings: [],
				notes: [],
				fileCount: 0,
				totalBytes: 0,
				strippedWrapper: null,
				files: [],
				message: null
			};
			if (!lastZip) return { ...empty, message: 'Nothing was uploaded.' };
			const verdict = await preflightZipInBrowser(lastZip);
			return {
				ok: verdict.ok,
				failures: verdict.failures,
				warnings: verdict.warnings,
				notes: verdict.notes,
				fileCount: verdict.files.length,
				totalBytes: lastZip.size,
				strippedWrapper: verdict.strippedWrapper,
				files: verdict.files.map((path) => ({ path, size: 0 })),
				message: null
			};
		},

		async uploadCover(f) {
			uploads = [...uploads, { path: `covers/${f.name}`, size: f.size }];
			return { ok: true, path: `dev/${f.name}` };
		},

		async saveField(_appId, field) {
			created = [...created, `field ${field}`];
			return { ok: true };
		}
	};

	/* ------------------------------------------------- my-apps fixture data */

	let mineApps = $state<FoundryAppSummary[]>([
		{
			id: 'app-1',
			slug: 'tide-clock',
			title: 'Tide Clock',
			tagline: 'A clock that reads the tide table.',
			cover_path: null,
			// A student who HAS chosen a display name: the rung that wins.
			owner_display_name: 'Ana R.',
			owner_full_name: 'Ana Reyes',
			owner_class: 'Engineering I Honors',
			published_version_id: 'v-2',
			published_ordinal: 2,
			version_count: 6,
			submitted_version_id: 'v-4',
			metadata_flagged_at: '2026-08-20T10:00:00Z',
			hidden_at: null,
			updated_at: '2026-08-22T09:00:00Z'
		},
		{
			id: 'app-2',
			slug: 'gear-ratio',
			title: 'Gear Ratio Calculator',
			tagline: null,
			cover_path: null,
			// The normal shape, measured against production: no display name, and
			// no class -- which must render as nothing at all.
			owner_display_name: null,
			owner_full_name: 'Sam Cruz',
			owner_class: null,
			published_version_id: null,
			published_ordinal: null,
			version_count: 1,
			submitted_version_id: null,
			metadata_flagged_at: null,
			hidden_at: null,
			updated_at: '2026-08-18T09:00:00Z'
		}
	]);

	const fullApp: FoundryApp = {
		id: 'app-1',
		owner: '00000000-0000-4000-8000-000000000001',
		owner_display_name: 'Ana R.',
		owner_full_name: 'Ana Reyes',
		owner_class: 'Engineering I Honors',
		slug: 'tide-clock',
		title: 'Tide Clock',
		tagline: 'A clock that reads the tide table.',
		description: 'Shows the next high and low tide for Long Beach.',
		cover_path: null,
		build_notes:
			'Generated with Claude, then I rewrote the tide maths by hand because the first version had the moon phase wrong. The CSS is mine.',
		published_version_id: 'v-2',
		metadata_flagged_at: '2026-08-20T10:00:00Z',
		hidden_at: null,
		created_at: '2026-07-01T09:00:00Z',
		updated_at: '2026-08-22T09:00:00Z',
		versions: [
			/*
			 * TWO DRAFTS ON PURPOSE. One has files and can be submitted; the
			 * other has file_count 0, which is what a version whose ingest never
			 * finished looks like, and `draftIsSubmittable` has to refuse it --
			 * submitting an empty bundle puts a reviewer in front of nothing.
			 */
			{
				id: 'v-6',
				ordinal: 6,
				status: 'draft',
				byte_size: 0,
				file_count: 0,
				created_at: '2026-08-23T08:00:00Z',
				reviewed_at: null,
				review_note: null,
				reject_reason: null,
				manifest: {}
			},
			{
				id: 'v-5',
				ordinal: 5,
				status: 'draft',
				byte_size: 44000,
				file_count: 7,
				created_at: '2026-08-23T07:00:00Z',
				reviewed_at: null,
				review_note: null,
				reject_reason: null,
				manifest: {}
			},
			{
				id: 'v-4',
				ordinal: 4,
				status: 'submitted',
				byte_size: 41000,
				file_count: 6,
				created_at: '2026-08-22T09:00:00Z',
				reviewed_at: null,
				review_note: null,
				reject_reason: null,
				manifest: {}
			},
			{
				id: 'v-3',
				ordinal: 3,
				status: 'rejected',
				byte_size: 39000,
				file_count: 6,
				created_at: '2026-08-15T09:00:00Z',
				reviewed_at: '2026-08-16T09:00:00Z',
				review_note:
					'The tide table only covers July. Extend it or say on the page which month it is for.',
				reject_reason: 'incomplete',
				manifest: {}
			},
			{
				id: 'v-2',
				ordinal: 2,
				status: 'approved',
				byte_size: 38000,
				file_count: 5,
				created_at: '2026-08-01T09:00:00Z',
				reviewed_at: '2026-08-02T09:00:00Z',
				review_note: null,
				reject_reason: null,
				manifest: {}
			},
			{
				id: 'v-1',
				ordinal: 1,
				status: 'approved',
				byte_size: 21000,
				file_count: 3,
				created_at: '2026-07-01T09:00:00Z',
				reviewed_at: '2026-07-02T09:00:00Z',
				review_note: null,
				reject_reason: null,
				manifest: {}
			}
		]
	};

	let selectedApp = $state<FoundryApp | null>(null);
	let mineLog = $state<string[]>([]);

	const mineTransports: FoundryMineTransports = {
		submitVersion: async (id) => {
			mineLog = [...mineLog, `submit ${id}`];
			return { ok: true };
		},
		withdrawVersion: async (id) => {
			mineLog = [...mineLog, `withdraw ${id}`];
			return { ok: true };
		},
		rollback: async (appId, id) => {
			mineLog = [...mineLog, `publish ${id} on ${appId}`];
			return { ok: true };
		},
		saveField: async (_appId, field, value) => {
			mineLog = [...mineLog, `set ${field} = ${value.slice(0, 40)}`];
			return { ok: true };
		},
		uploadCover: async (f) => {
			mineLog = [...mineLog, `cover ${f.name}`];
			return { ok: true, path: `dev/${f.name}` };
		}
	};

	/* ------------------------------------------------------------ driving */

	let surface = $state<'submit' | 'mine' | 'contract'>('submit');
	let submitKey = $state(0);
	let driveNote = $state('');

	async function drive(kind: 'zip' | 'zip-bad' | 'folder' | 'single') {
		const files =
			kind === 'zip'
				? await fixtureZip(GOOD_HTML)
				: kind === 'zip-bad'
					? await fixtureZip(BAD_HTML, 'broken.zip')
					: kind === 'folder'
						? fixtureFolder()
						: fixtureSingle();

		// Hand them to the surface the same way a drop would: through the
		// component's own input. `DataTransfer` is constructible in a browser,
		// so this exercises the real change handler rather than a shortcut.
		const dt = new DataTransfer();
		for (const f of files) dt.items.add(f);
		const input = document.querySelector<HTMLInputElement>('[data-fdy-input]');
		if (!input) {
			driveNote = 'No file input on screen. Is the surface showing its drop zone?';
			return;
		}
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		driveNote = `Handed ${files.length} file${files.length === 1 ? '' : 's'} to the surface (${kind}).`;
	}

	/**
	 * A direct run of normalize + preflight, printed as raw strings. This is
	 * what the parity check reads: the message text, with nothing rendered
	 * around it that could be doing the formatting.
	 */
	/**
	 * A DRIVING HOOK FOR THE BROWSER/SERVER PARITY COMPARISON.
	 *
	 * It takes the SAME `{ path: text }` fixture map the server-side script
	 * feeds to `foundry-ingest`, builds a zip from it, and runs the browser
	 * preflight -- so the two sides are compared on identical input rather than
	 * on two hand-made versions of the same idea. Dev-only, because the route it
	 * lives on is dev-only.
	 *
	 * The specific question it exists to answer is whether deno-dom and the
	 * browser's own DOMParser find the same references in the same HTML, which
	 * is the one part of the preflight the two runtimes genuinely do differently.
	 */
	$effect(() => {
		(window as unknown as Record<string, unknown>).__foundryParity = async (
			fixtures: Record<string, Record<string, string>>
		) => {
			const enc2 = new TextEncoder();
			const out: Record<string, unknown> = {};
			for (const [name, files] of Object.entries(fixtures)) {
				const zipBytes = await buildZip(
					Object.entries(files).map(([path, text]) => ({ path, bytes: enc2.encode(text) }))
				);
				const v = await preflightZipInBrowser(new Blob([zipBytes as BlobPart]));
				out[name] = {
					ok: v.ok,
					failures: v.failures.map((f) => f.message),
					warnings: v.warnings.map((w) => w.message),
					notes: v.notes
				};
			}
			return out;
		};
	});

	/* ------------------------------------------------- the acceptance drive */

	/**
	 * THE WHOLE PIPELINE OVER THE FILE THAT STARTED THIS, AND THEN THE FRAME.
	 *
	 * Normalize the picked file, preflight the zip it produced, take the
	 * REWRITTEN html the preflight handed back, and serve it from the apps host
	 * through the real proxy so the real `AppFrame` can run it. Every step is
	 * the shipping code: `normalizeFoundryInput`, `preflightZipInBrowser` (and
	 * therefore `scanHtml`, and therefore the vendor rewrite), the real token
	 * mint, the real `/r/{token}/` route, the real CSP and the real sandbox.
	 *
	 * WHAT IS NOT REAL, and it is one thing: the bytes go into the in-memory
	 * dev fixture rather than into `foundry-bundles` through `foundry-ingest`,
	 * because the local project is a placeholder. The ROUTE that reads them, and
	 * everything it enforces on the way out, is untouched.
	 *
	 * TEXT FILES ONLY. The drive posts JSON, so a bundle carrying a PNG would
	 * lose it. The fixture is a single HTML file, which is the shape this drive
	 * is about; a binary asset would need a different transport and is said here
	 * rather than left to be discovered.
	 */
	let runNote = $state('');
	let runNotes = $state<string[]>([]);
	let runFiles = $state<string[]>([]);
	let runBusy = $state(false);

	async function runFixture() {
		runBusy = true;
		runNotes = [];
		runFiles = [];
		try {
			// The real file, unmodified, handed over the way a picked file is.
			const picked = file('approved-react-app.html', data.reactAppFixture);

			const norm = await normalizeFoundryInput([picked]);
			if (!norm.ok || !norm.zip) {
				runNote = `NORMALIZE REFUSED: ${norm.problem}`;
				return;
			}

			const verdict = await preflightZipInBrowser(norm.zip);
			runNotes = [...norm.notes, ...verdict.notes];
			runFiles = verdict.files;
			if (!verdict.ok) {
				runNote = `PREFLIGHT REFUSED:\n${verdict.failures.map((f) => f.message).join('\n\n')}`;
				return;
			}

			/*
			 * THE FRAME USED TO GO HERE, AND IT CANNOT ANY MORE.
			 *
			 * This harness ran the bundle it had just preflighted by POSTing the
			 * file set to `/dev/foundry-run`, which wrote it into the in-memory dev
			 * fixture and minted a real token for the proxy to serve it through.
			 * There is no proxy and no token: a bundle is served by the
			 * `foundry-serve` Edge Function, which reads rows and objects that only
			 * exist once something has actually been ingested. A file set that has
			 * only been PREFLIGHTED has neither, so there is nothing to point a
			 * frame at.
			 *
			 * `/dev/foundry-run?app=&version=` runs a bundle that HAS been
			 * published, against a project that holds it. This half of the drive is
			 * the preflight verdict, which is what this harness is for.
			 */
			runNote =
				`Preflight passed: ${verdict.files.length} file(s). Publish it to run it -- see /dev/foundry-run.`;
		} catch (e) {
			runNote = `DRIVE FAILED: ${(e as Error).message}`;
		} finally {
			runBusy = false;
		}
	}

	let rawOut = $state('');

	async function rawRun(kind: 'zip-bad' | 'folder' | 'single') {
		const files =
			kind === 'zip-bad'
				? await fixtureZip(BAD_HTML, 'broken.zip')
				: kind === 'folder'
					? fixtureFolder()
					: fixtureSingle();
		const norm = await normalizeFoundryInput(files);
		if (!norm.ok || !norm.zip) {
			rawOut = `NORMALIZE REFUSED: ${norm.problem}`;
			return;
		}
		const v = await preflightZipInBrowser(norm.zip);
		rawOut = JSON.stringify(
			{
				shape: norm.shape,
				zipBytes: norm.zip.size,
				normalizeNotes: norm.notes,
				ok: v.ok,
				strippedWrapper: v.strippedWrapper,
				files: v.files,
				notes: v.notes,
				failures: v.failures,
				warnings: v.warnings
			},
			null,
			2
		);
	}
</script>

<svelte:head><title>dev // foundry submit</title></svelte:head>

<div class="fg-root h-root">
	<header class="h-head">
		<h1>Foundry submit harness</h1>
		<p>
			The real components with in-memory transports. Ingest is the REAL browser preflight over
			the zip the surface produced, so refusals are the shared module's own sentences. It does
			NOT do the incremental uncompressed cap or any storage write; both are server-only and
			the real surface gets them from <code>foundry-ingest</code>.
		</p>
	</header>

	<nav class="h-tabs">
		<button class="btn" class:on={surface === 'submit'} onclick={() => (surface = 'submit')}>
			Submit
		</button>
		<button class="btn" class:on={surface === 'mine'} onclick={() => (surface = 'mine')}>
			My apps
		</button>
		<button class="btn" class:on={surface === 'contract'} onclick={() => (surface = 'contract')}>
			Contract
		</button>
	</nav>

	{#if surface === 'submit'}
		<section class="h-drive">
			<h2>Drive an input shape</h2>
			<div class="h-buttons">
				<button class="btn" onclick={() => drive('zip')} data-drive="zip">Zip (passes)</button>
				<button class="btn" onclick={() => drive('zip-bad')} data-drive="zip-bad">
					Zip (fails preflight)
				</button>
				<button class="btn" onclick={() => drive('folder')} data-drive="folder">
					Folder (with noise)
				</button>
				<button class="btn" onclick={() => drive('single')} data-drive="single">
					Single HTML (not index.html)
				</button>
				<button
					class="btn"
					onclick={() => {
						submitKey += 1;
						uploads = [];
						created = [];
						lastZip = null;
						driveNote = '';
					}}
				>
					Reset surface
				</button>
			</div>
			{#if driveNote}<p class="h-note" data-testid="drive-note">{driveNote}</p>{/if}

			<h2>Raw normalize + preflight output</h2>
			<div class="h-buttons">
				<button class="btn" onclick={() => rawRun('zip-bad')} data-raw="zip-bad">
					Raw: failing zip
				</button>
				<button class="btn" onclick={() => rawRun('folder')} data-raw="folder">Raw: folder</button>
				<button class="btn" onclick={() => rawRun('single')} data-raw="single">
					Raw: single HTML
				</button>
			</div>
			{#if rawOut}<pre class="h-raw" data-testid="raw-out">{rawOut}</pre>{/if}
		</section>

		<section class="h-panel">
			<h2>Acceptance drive: the approved React app, end to end</h2>
			<p class="h-note">
				<code>tests/fixtures/foundry/approved-react-app.html</code> -- the real file that was
				approved and rendered blank -- unmodified, through normalize, the real preflight, the
				real token mint and the real bundle proxy, into the real
				<code>AppFrame</code>. What renders below is the rewrite working or not working;
				nothing else on this page can tell you that.
			</p>
			<div class="h-buttons">
				<button class="btn" onclick={runFixture} disabled={runBusy} data-drive="react-fixture">
					{runBusy ? 'Running...' : 'Run the React fixture'}
				</button>
			</div>

			{#if runNote}<p class="h-note" data-testid="run-note">{runNote}</p>{/if}

			{#if runNotes.length > 0}
				<p class="h-note">What the student is told:</p>
				<ul class="h-run-notes" data-testid="run-notes">
					{#each runNotes as note, i (i)}<li>{note}</li>{/each}
				</ul>
			{/if}

			{#if runFiles.length > 0}
				<p class="h-note" data-testid="run-files">
					Extracted: {runFiles.join(', ')}
				</p>
			{/if}

			{#if uploads.length > 0 || created.length > 0}
				<p class="h-note">
					Uploaded: {uploads.map((u) => `${u.path} (${u.size}B)`).join(', ') || 'nothing'}
					&middot; Wrote: {created.join(', ') || 'nothing'}
				</p>
			{/if}
		</section>

		{#key submitKey}
			<FoundrySubmit transports={submitTransports} />
		{/key}
	{:else if surface === 'contract'}
		<FoundryContract contract={foundryBuildContract()} />
	{:else}
		<section class="h-drive">
			<h2>My apps</h2>
			<p class="h-note">
				Selection is driven here rather than by the URL, so the harness needs no router. The
				component is the same one the route mounts.
			</p>
			{#if mineLog.length > 0}
				<p class="h-note" data-testid="mine-log">{mineLog.join(' | ')}</p>
			{/if}
		</section>

		<FoundryMine
			apps={mineApps}
			selected={selectedApp}
			transports={mineTransports}
			now={new Date('2026-08-23T12:00:00Z')}
			onSelect={(slug) => {
				selectedApp = slug === 'tide-clock' ? fullApp : null;
			}}
		/>
	{/if}
</div>

<style>
	.h-root {
		padding: 1rem;
	}

	.h-head h1 {
		font-family: var(--font-display);
		margin: 0 0 0.35rem;
	}

	.h-head p {
		color: var(--text-2);
		max-width: 68ch;
		line-height: 1.5;
		margin: 0 0 1rem;
	}

	.h-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.h-tabs .on {
		border-color: var(--green);
		color: var(--green);
	}

	.h-drive {
		border: 1px solid var(--hairline);
		border-radius: 8px;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.h-drive h2 {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-2);
		margin: 0 0 0.5rem;
	}

	.h-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}

	.h-note {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--cyan);
		margin: 0.35rem 0;
	}

	.h-run-notes {
		margin: 0 0 var(--space-3, 0.75rem);
		padding-left: 1.2rem;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-2, #b9c4ba);
	}
	.h-run-notes li {
		margin: 0.35rem 0;
	}

	.h-raw {
		background: var(--bg2);
		border: 1px solid var(--hairline);
		border-radius: 6px;
		padding: 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		max-height: 24rem;
		overflow: auto;
		white-space: pre-wrap;
	}
</style>
