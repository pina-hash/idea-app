<script lang="ts">
	/**
	 * THE HARNESS PAGE. It mounts the REAL components with in-memory transports.
	 *
	 * Selection is local state here rather than the URL, because the point is to
	 * drive both surfaces on one screen without a router round trip between
	 * clicks. Everything else -- the components, the frame, the source reads --
	 * is the shipping path.
	 *
	 * IT CAN SHOW A RUNNING BUNDLE, WHICH IT COULD NOT WHILE THE BYTES CAME OFF
	 * SUPABASE. `AppStage` derives its frame src from
	 * `PUBLIC_FOUNDRY_APPS_ORIGIN` and the two ids, and the fixture bundles are
	 * served by the REAL `/b/` route from the in-memory fixture -- so setting
	 * that variable to this dev server's own address (127.0.0.1 while the portal
	 * is browsed at localhost, so the frame is genuinely cross-origin) runs them
	 * for real, with the real headers and the real sandbox. Leave it unset and
	 * there is no launch control at all, which is the shipping behaviour.
	 */
	import '$lib/foundry/forge.css';
	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import ReviewQueue from '$lib/foundry/ReviewQueue.svelte';
	import { queueOrder } from '$lib/foundry/review';
	import type { FoundryPlayCounts, FoundryPlayStats } from '$lib/foundry/telemetry';
	import type {
		FoundryGalleryTransports,
		FoundryReviewTransports
	} from '$lib/foundry/transports';

	let { data } = $props();

	const now = new Date('2026-08-24T12:00:00Z');

	let gallerySlug = $state<string | null>('hostile-probe');
	let reviewSlug = $state<string | null>('hostile-probe');
	/** What the decision transport was last handed, rendered so a drive can read it. */
	let lastDecision = $state<string>('(none yet)');

	/**
	 * DELETION AND SHELVING, DRIVEN FOR REAL. The transports move this page's
	 * own state, so the review surface has to clear the selection, drop the
	 * queue row and re-render the shelved list -- not merely log a call.
	 */
	let removed = $state<string[]>([]);
	let hidden = $state<Record<string, string | null>>({});
	/**
	 * THE ADMIN METADATA EDIT, DRIVEN FOR REAL, the same way hiding and deletion
	 * are: a save from `FoundryInspector` has to change what `FoundryDetail`
	 * shows beside it, or the harness would be proving the form submits without
	 * proving the panel reflects a write.
	 */
	let metaEdits = $state<Record<string, Partial<Record<string, string>>>>({});

	/**
	 * TELEMETRY FIXTURES FOR THE THREE MOUNTED APPS, keyed off the load's own
	 * ids rather than re-typed uuids, so the mapping cannot drift from which app
	 * is actually app A/B/playfield. One app carries zero plays deliberately --
	 * `playCountLabel` renders NO chip for zero, and that absence is only
	 * provable with a real zero sitting beside two real counts.
	 */
	const playCounts: FoundryPlayCounts = $derived({
		[data.apps[0].id]: { plays: 42, plays7d: 5 },
		[data.apps[1].id]: { plays: 3, plays7d: 3 },
		[data.apps[2].id]: { plays: 0, plays7d: 0 }
	});

	const playStatsFixture: Record<string, FoundryPlayStats> = $derived({
		[data.apps[0].id]: {
			plays: 42,
			players: 11,
			seconds_played: 5400,
			last_played_at: '2026-08-26T15:30:00Z'
		},
		[data.apps[1].id]: {
			plays: 3,
			players: 2,
			seconds_played: 210,
			last_played_at: '2026-08-20T10:00:00Z'
		},
		[data.apps[2].id]: { plays: 0, players: 0, seconds_played: 0, last_played_at: null }
	});

	const liveApps = $derived(
		data.apps
			.filter((a) => !removed.includes(a.id))
			.map((a) => (a.id in hidden ? { ...a, hidden_at: hidden[a.id] } : a))
	);

	/** The shell's Review tab count, from the same arithmetic the queue uses. */
	const pending = $derived(queueOrder(liveApps).length);

	const gallerySelected = $derived(gallerySlug ? (data.details[gallerySlug] ?? null) : null);
	const reviewSelected = $derived.by(() => {
		if (!reviewSlug) return null;
		const detail = data.details[reviewSlug] ?? null;
		if (!detail || removed.includes(detail.id)) return null;
		const withHidden =
			detail.id in hidden ? { ...detail, hidden_at: hidden[detail.id] } : detail;
		const edits = metaEdits[detail.id];
		return edits ? { ...withHidden, ...edits } : withHidden;
	});

	const galleryTransports: FoundryGalleryTransports = {};

	/**
	 * THE STAFF DOOR, DRIVEN FROM BOTH SIDES.
	 *
	 * `staffHref` is what closes the gap where a published, unhidden app with
	 * nothing pending appeared on neither of /foundry/review's two lists while the
	 * route would happily serve it from a slug in the URL. Absence is the
	 * mechanism -- the route hands a string only when `isAdmin` and something is
	 * open -- so the ONLY way to know the absence is real is to be able to produce
	 * both states here. A harness that could only render the admin case would
	 * prove the control exists and nothing at all about the student who must not
	 * see it.
	 *
	 * The expression is the route's own, character for character, so what is
	 * driven here is what ships.
	 */
	let galleryIsAdmin = $state(true);
	const galleryStaffHref = $derived(
		galleryIsAdmin && gallerySelected
			? `/foundry/review?app=${encodeURIComponent(gallerySelected.slug)}`
			: null
	);

	const reviewTransports: FoundryReviewTransports = {
		async listFiles(versionId) {
			const files = data.files[versionId] ?? [];
			return { ok: true, files };
		},
		async readFile(versionId, path) {
			const text = data.sources[versionId]?.[path];
			if (text === undefined) return { ok: false, message: 'That file could not be read.' };
			return { ok: true, text, path, byteSize: new TextEncoder().encode(text).byteLength };
		},
		async decide({ versionId, decision, note, reasonId }) {
			lastDecision = JSON.stringify({ versionId, decision, note, reasonId });
			return { ok: true };
		},
		async clearMetadataFlag(appId) {
			lastDecision = JSON.stringify({ clearedFlagFor: appId });
			return { ok: true };
		},
		async setHidden(appId, hide, reason) {
			lastDecision = JSON.stringify({ setHidden: appId, hidden: hide, reason });
			hidden = { ...hidden, [appId]: hide ? '2026-08-24T12:00:00Z' : null };
			return { ok: true };
		},
		async deleteApp(appId) {
			lastDecision = JSON.stringify({ deleted: appId });
			removed = [...removed, appId];
			// One of the two answers the partial-sweep case, so the sentence that
			// rides a SUCCESS is reachable in this harness.
			return {
				ok: true,
				storageProblem:
					appId === data.appBId ? '3 stored files could not be removed.' : null
			};
		},
		/**
		 * `foundry_app_play_stats`, the four scalars and nothing else. Every app
		 * in the fixture answers; there is no id here that would exercise the
		 * null "not available" branch, because every app the queue can select is
		 * one this admin transport is allowed to answer for.
		 */
		async playStats(appId) {
			return playStatsFixture[appId] ?? null;
		},
		/**
		 * `foundry_update_app_metadata`. Driven for real, same as hiding and
		 * deletion: the write lands in `metaEdits` and both `FoundryDetail` and
		 * `FoundryInspector` re-render from it, so a save is provably reflected
		 * rather than merely accepted.
		 */
		async saveField(appId, field, value) {
			lastDecision = JSON.stringify({ savedField: appId, field, value });
			metaEdits = { ...metaEdits, [appId]: { ...metaEdits[appId], [field]: value } };
			return { ok: true };
		}
	};
</script>

<svelte:head><title>Foundry gallery harness</title></svelte:head>

<!-- THE ROOM AND THE SHELL, exactly as /foundry mounts them: `.fg-root` is
     the forge wrapper the layout provides in production, and the shell is
     mounted with the admin view on so the Review tab and its heat can be
     driven here. The shell renders ONCE, above both surfaces, as it does on
     any real route. -->
<div class="fg-root harness">
	<FoundryShell active="gallery" isAdmin={true} reviewPending={pending}>
	<header>
		<h1>Foundry gallery / review harness</h1>
		<p class="warn">
			Launching mounts a real frame at the apps origin below. Point
			PUBLIC_FOUNDRY_APPS_ORIGIN at this dev server (use 127.0.0.1 while
			browsing localhost, so the frame is genuinely cross-origin) and the
			fixture bundles run for real through the real route. Unset, there is no
			launch control and no share link, which is the shipping behaviour.
		</p>
		<p class="note">
			Bundle origin the stage will build from: <code data-testid="bundle-origin"
				>{data.bundleOrigin}</code
			>
		</p>
		<p class="note">
			Last decision handed to the transport: <code data-testid="last-decision">{lastDecision}</code>
		</p>
	</header>

	<!--
		EACH SURFACE SITS IN THE SAME PAGE SHELL ITS ROUTE GIVES IT, and that is
		not decoration: a geometry measured in a harness whose container differs
		from the route's is not the shipping geometry. Measured the hard way --
		this page's own `.harness` wrapper let the split run to 1313px at a 1440px
		viewport, where the real route caps it, so the numbers it produced were
		about a page nobody will ever load. `.fdy-shell` restates the routes' two
		rules (`--measure-split` and the room's gutter) and nothing else.
	-->
	<section class="fdy-shell">
		<h2>
			/foundry &mdash; the gallery
			<!--
				NOTHING OPEN IS A FIRST-CLASS ARRANGEMENT, not a placeholder state:
				the split renders NO detail pane and the card grid takes the whole
				measure. The routes reach it by navigating to the path with no
				`?app`; the harness needs a control for it, and it drives the same
				`onSelect(null)` the routes call.
			-->
			<button
				type="button"
				class="hbtn"
				data-testid="gallery-deselect"
				onclick={() => (gallerySlug = null)}
			>
				deselect
			</button>
			<button
				type="button"
				class="hbtn"
				data-testid="gallery-admin"
				aria-pressed={galleryIsAdmin}
				onclick={() => (galleryIsAdmin = !galleryIsAdmin)}
			>
				{galleryIsAdmin ? 'viewing as admin' : 'viewing as student'}
			</button>
		</h2>
		<!-- The harness has no PUBLIC_FOUNDRY_APPS_ORIGIN to read, and an unset one
		     correctly removes the frame AND the share link -- which would leave
		     neither to drive. A literal here is what makes both real. -->
		<FoundryGallery
			apps={data.apps}
			selected={gallerySelected}
			transports={galleryTransports}
			onSelect={(slug) => (gallerySlug = slug)}
			appsOrigin="https://apps.ideabosco.com"
			staffHref={galleryStaffHref}
			{playCounts}
		/>
	</section>

	<section class="fdy-shell">
		<h2>
			/foundry/review &mdash; the queue
			<button
				type="button"
				class="hbtn"
				data-testid="review-deselect"
				onclick={() => (reviewSlug = null)}
			>
				deselect
			</button>
		</h2>
		<ReviewQueue
			apps={liveApps}
			selected={reviewSelected}
			transports={reviewTransports}
			onSelect={(slug) => (reviewSlug = slug)}
			onDeleted={() => (reviewSlug = null)}
			{now}
		/>
	</section>
	</FoundryShell>
</div>

<style>
	/* The harness's own chrome only. The surfaces below carry the routes' shell. */
	.harness {
		display: flex;
		flex-direction: column;
		gap: var(--space-6, 1.5rem);
		padding: var(--space-5, 1.25rem) 0;
		min-width: 0;
	}

	.harness > header {
		padding: 0 var(--cr-gutter, 1rem);
	}

	.fdy-shell {
		max-width: var(--measure-split);
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1rem);
		min-width: 0;
		width: 100%;
	}

	h2 {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}

	.hbtn {
		margin-left: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: none;
		color: var(--cyan);
		background: none;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		padding: 0.15rem 0.4rem;
		cursor: pointer;
	}

	.note {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	.warn {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--amber);
	}
</style>
