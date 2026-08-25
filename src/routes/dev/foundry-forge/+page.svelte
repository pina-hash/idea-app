<script lang="ts">
	/**
	 * The forge identity, all of it on one screen: the shell in both roles, the
	 * molten seam in both variants, the six status tones, and the REAL
	 * FoundryMine over fixture apps that hold every lifecycle state at once.
	 * Harnesses mount the real component, never a copy of its markup.
	 *
	 * The fixture apps cover states a real account cannot show on demand:
	 * `hidden_at` is set on one row even though the live policies do not return
	 * a hidden app to its owner -- the payload SHAPE allows it, and the surface
	 * has to render it honestly if it ever arrives.
	 */
	import '$lib/foundry/forge.css';
	import ForgeStatus from '$lib/foundry/ForgeStatus.svelte';
	import FoundryMine from '$lib/foundry/FoundryMine.svelte';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import MoltenSeam from '$lib/foundry/MoltenSeam.svelte';
	import type { FoundryApp, FoundryAppSummary, FoundryVersion } from '$lib/foundry/transports';

	const now = new Date('2026-08-24T12:00:00Z');

	function version(
		id: string,
		ordinal: number,
		status: FoundryVersion['status'],
		extra: Partial<FoundryVersion> = {}
	): FoundryVersion {
		return {
			id,
			ordinal,
			status,
			byte_size: 48_000 + ordinal * 1000,
			file_count: 3,
			created_at: `2026-08-${10 + ordinal}T09:00:00Z`,
			reviewed_at: null,
			review_note: null,
			reject_reason: null,
			manifest: {},
			...extra
		};
	}

	const author = {
		owner_display_name: null,
		owner_full_name: 'Ana Reyes',
		owner_class: 'Engineering I Honors'
	};

	/** Every state at once: live + approved + submitted + rejected + draft. */
	const emberClock: FoundryApp = {
		id: 'app-ember',
		slug: 'ember-clock',
		title: 'Ember Clock',
		tagline: 'A clock that burns down the hour.',
		description: 'A countdown clock drawn as cooling metal.',
		cover_path: null,
		build_notes: 'Claude wrote the first pass; I rebuilt the easing by hand.',
		owner: '00000000-0000-4000-8000-00000000dev0',
		published_version_id: 'v-ember-3',
		metadata_flagged_at: null,
		hidden_at: null,
		created_at: '2026-08-01T09:00:00Z',
		updated_at: '2026-08-20T09:00:00Z',
		versions: [
			version('v-ember-5', 5, 'submitted'),
			version('v-ember-4', 4, 'draft'),
			version('v-ember-3', 3, 'approved'),
			version('v-ember-2', 2, 'rejected', {
				reviewed_at: '2026-08-14T09:00:00Z',
				review_note: 'The timer drifts. Fix the interval and resubmit.',
				reject_reason: 'Does not run'
			}),
			version('v-ember-1', 1, 'approved')
		],
		...author
	};

	function summary(app: FoundryApp): FoundryAppSummary {
		const submitted = app.versions.find((v) => v.status === 'submitted');
		const published = app.versions.find((v) => v.id === app.published_version_id);
		return {
			id: app.id,
			slug: app.slug,
			title: app.title,
			tagline: app.tagline,
			cover_path: app.cover_path,
			published_version_id: app.published_version_id,
			published_ordinal: published?.ordinal ?? null,
			version_count: app.versions.length,
			submitted_version_id: submitted?.id ?? null,
			metadata_flagged_at: app.metadata_flagged_at,
			hidden_at: app.hidden_at,
			updated_at: app.updated_at,
			owner_display_name: app.owner_display_name,
			owner_full_name: app.owner_full_name,
			owner_class: app.owner_class
		};
	}

	const coldStart: FoundryApp = {
		...emberClock,
		id: 'app-cold',
		slug: 'cold-start',
		title: 'Cold Start',
		tagline: 'Nothing published yet.',
		published_version_id: null,
		versions: [version('v-cold-1', 1, 'draft')]
	};

	const shelved: FoundryApp = {
		...emberClock,
		id: 'app-shelved',
		slug: 'shelved',
		title: 'Shelved',
		tagline: 'Hidden by staff.',
		hidden_at: '2026-08-19T09:00:00Z',
		published_version_id: 'v-shelf-1',
		versions: [version('v-shelf-1', 1, 'approved')]
	};

	const apps = [emberClock, coldStart, shelved];
	const summaries = apps.map(summary);

	let selectedSlug = $state<string | null>('ember-clock');
	const selected = $derived(apps.find((a) => a.slug === selectedSlug) ?? null);

	let log = $state<string[]>([]);
	const note = (line: string) => (log = [...log, line]);
</script>

<svelte:head><title>Forge identity harness</title></svelte:head>

<div class="fg-root harness">
	<!-- The shell as an ADMIN sees it: Review tab present, count hot. -->
	<FoundryShell active="mine" isAdmin={true} reviewPending={3}>
		<div class="h-body">
			<section>
				<h2 class="h-label">Shell, student view (no review tab) and cold admin view</h2>
				<div class="h-shells">
					<div class="h-shell" data-testid="shell-student">
						<FoundryShell active="gallery" isAdmin={false}>
							<div class="h-shell-body">student</div>
						</FoundryShell>
					</div>
					<div class="h-shell" data-testid="shell-cold">
						<FoundryShell active="review" isAdmin={true} reviewPending={0}>
							<div class="h-shell-body">admin, empty queue</div>
						</FoundryShell>
					</div>
				</div>
			</section>

			<section>
				<h2 class="h-label">The heat language, all six tones</h2>
				<div class="h-chips" data-testid="chips">
					<ForgeStatus tone="quiet" word="Draft" />
					<ForgeStatus tone="waiting" word="Waiting for review" />
					<ForgeStatus tone="ok" word="Approved" />
					<ForgeStatus tone="live" word="Live" />
					<ForgeStatus tone="refused" word="Sent back" />
					<ForgeStatus tone="shelved" word="Hidden by staff" />
				</div>
			</section>

			<section>
				<h2 class="h-label">The molten seam, channel variant</h2>
				<div data-testid="channel"><MoltenSeam variant="channel" /></div>
			</section>

			<section>
				<h2 class="h-label">My apps, every lifecycle state at once</h2>
				<FoundryMine
					apps={summaries}
					{selected}
					transports={{
						submitVersion: async (id) => (note(`submit ${id}`), { ok: true }),
						withdrawVersion: async (id) => (note(`withdraw ${id}`), { ok: true }),
						rollback: async (_a, id) => (note(`publish ${id}`), { ok: true }),
						saveField: async (_a, f) => (note(`set ${f}`), { ok: true })
					}}
					onSelect={(slug) => (selectedSlug = slug)}
					{now}
				/>
			</section>

			<p class="h-log" data-testid="log">{log.join(' | ') || '(no writes yet)'}</p>

			<!-- Tall spacer so the header seam can be scrolled fully offscreen for
			     the pause measurement. -->
			<div class="h-spacer" aria-hidden="true"></div>
			<p class="h-label">end of page</p>
		</div>
	</FoundryShell>
</div>

<style>
	.harness {
		min-height: 100vh;
	}

	.h-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.5rem);
		max-width: var(--measure-split, 92rem);
		margin: 0 auto;
		padding: var(--space-4, 1rem) var(--cr-gutter, 1rem);
		min-width: 0;
	}

	.h-label {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0 0 var(--space-2, 0.5rem);
	}

	.h-shells {
		display: grid;
		gap: var(--space-3, 0.75rem);
	}

	.h-shell {
		border: 1px dashed var(--hairline);
	}

	.h-shell-body {
		padding: var(--space-2, 0.5rem) var(--cr-gutter, 1rem);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.h-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
	}

	.h-log {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.h-spacer {
		height: 160vh;
	}
</style>
