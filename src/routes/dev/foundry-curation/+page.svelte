<script lang="ts">
	/**
	 * THE FOUNDRY'S CURATION SURFACES, ON THE REAL COMPONENTS (ledger 0380): the
	 * admin's gallery curation page body and the class schedule editor, each over
	 * in-memory transports that behave like the RPCs (a refusal is a value, a
	 * write changes what the next read answers). `?fixture=notready` hands every
	 * read as null, which is a database before 0237.
	 */
	import { page } from '$app/state';

	import '$lib/foundry/forge.css';
	import FoundryGalleryAdmin from '$lib/foundry/FoundryGalleryAdmin.svelte';
	import FoundrySchedule from '$lib/foundry/FoundrySchedule.svelte';
	import FoundryTrustRoster from '$lib/foundry/FoundryTrustRoster.svelte';
	import { foundryHouseReleases } from '$lib/foundry/major';
	import type { FoundryCollection, FoundryOverrideMap, FoundryGalleryAdminTransports } from '$lib/foundry/gallery-extras';
	import type { ScheduleState, ScheduleWindow } from '$lib/foundry/schedule';

	const notReady = page.url.searchParams.get('fixture') === 'notready';
	const houses = foundryHouseReleases();

	const apps = [
		{ id: 'a1', title: 'Maze Maker', tagline: 'Build a maze.', cover_path: null, major: true },
		{ id: 'a2', title: 'Tide Pool', tagline: 'Watch the tide.', cover_path: null, major: true },
		{ id: 'a3', title: 'Cookie Press', tagline: 'Click.', cover_path: null, major: false },
		{ id: 'a4', title: 'Frog Frenzy', tagline: 'Hop.', cover_path: null, major: false }
	];

	let overrides = $state<FoundryOverrideMap>({});
	let collections = $state<FoundryCollection[]>([
		{
			id: 'c1',
			title: 'Ported games',
			description: 'Brought in from elsewhere.',
			published: true,
			members: [{ subject: 'app:a3', live: true }, { subject: 'house:vanguard', live: true }]
		}
	]);
	let featured = $state<string[]>(['app:a1']);
	let log = $state<string[]>([]);
	let rev = $state(0);

	const transports: FoundryGalleryAdminTransports = {
		async saveOverride(subject, f) {
			log = [...log, `override ${subject} ${JSON.stringify(f)}`];
			if (!f.title && !f.description && !f.thumbnail_path) {
				const { [subject]: _gone, ...rest } = overrides;
				overrides = rest;
			} else overrides = { ...overrides, [subject]: { subject, ...f } };
			return { ok: true };
		},
		async saveCollection(id, title, description, members) {
			log = [...log, `collection ${id ?? 'new'} ${title} ${members.join(',')}`];
			if (!title.trim()) return { ok: false, message: 'A collection needs a name of 60 characters or fewer.' };
			const rows = members.map((subject) => ({ subject, live: true }));
			if (id) collections = collections.map((c) => (c.id === id ? { ...c, title, description, members: rows } : c));
			else collections = [...collections, { id: `c${collections.length + 1}`, title, description, published: false, members: rows }];
			return { ok: true };
		},
		async setCollectionPublished(id, published) {
			collections = collections.map((c) => (c.id === id ? { ...c, published } : c));
			return { ok: true };
		},
		async deleteCollection(id) {
			collections = collections.filter((c) => c.id !== id);
			return { ok: true };
		},
		async orderCollections(ids) {
			collections = ids.map((id) => collections.find((c) => c.id === id)!).filter(Boolean);
			return { ok: true };
		},
		async saveFeatured(subjects) {
			log = [...log, `featured ${subjects.join(',')}`];
			featured = subjects;
			return { ok: true };
		}
	};

	const sections = [
		{ section_id: 's1', label: 'Block 1', block: 'Period 1', course_title: 'Engineering I', course_code: 'IDEA100', foundry_closed_at: null, foundry_closed_note: null },
		{ section_id: 's2', label: 'Block 4', block: null, course_title: 'Engineering II', course_code: 'IDEA209H', foundry_closed_at: null, foundry_closed_note: null }
	];
	let weekly = $state<ScheduleWindow[]>([{ weekday: 1, starts: '10:00', ends: '10:55' }, { weekday: 3, starts: '13:00', ends: '13:55' }]);
	let enabled = $state(true);
	let days = $state<ScheduleState['days']>([{ on_date: '2026-10-21', kind: 'no_class', starts: null, ends: null, note: 'Assembly' }]);
	const sched = (): ScheduleState => ({ enabled, weekly, days, now: { closed: true, by: 'schedule', until: new Date(Date.now() + 25 * 60_000).toISOString() } });
	let people = ['Ana Reyes', 'Ben Ortiz', 'Ana Park'];
</script>

<svelte:head><title>dev: Foundry curation</title></svelte:head>

<div class="fg-root harness" data-testid="curation-harness" data-rev={rev}>
	<div class="wrap">
		<h1>Foundry curation and class schedule</h1>
		<p class="note" data-testid="curation-log">{log.length} writes: {log.slice(-2).join(' | ')}</p>

		<FoundryGalleryAdmin
			{apps}
			{houses}
			overrides={notReady ? null : overrides}
			collections={notReady ? null : collections}
			featured={notReady ? null : featured}
			coverUrl={(p) => p}
			{transports}
			onChanged={() => (rev += 1)}
		/>

		<FoundrySchedule
			{sections}
			load={async () => (notReady ? null : sched())}
			saveWeekly={async (_id, en, w) => {
				enabled = en;
				weekly = w;
				return { ok: true };
			}}
			saveDay={async (_id, date, kind, windows, note) => {
				days = [...days.filter((d) => d.on_date !== date), ...(kind === 'no_class' ? [{ on_date: date, kind, starts: null, ends: null, note }] : windows.map((w) => ({ on_date: date, kind, starts: w.starts, ends: w.ends, note })))];
				return { ok: true };
			}}
			clearDay={async (_id, date) => {
				days = days.filter((d) => d.on_date !== date);
				return { ok: true };
			}}
		/>

		<FoundryTrustRoster
			rows={[]}
			transports={{
				grantTrust: async () => ({ ok: true }),
				searchPeople: async (q) =>
					notReady ? null : people.filter((n) => n.toLowerCase().includes(q.toLowerCase())).map((name) => ({ name, email: `${name.split(' ')[0].toLowerCase()}@boscotech.net` }))
			}}
		/>
	</div>
</div>

<style>
	.harness {
		min-height: 100vh;
		padding: var(--space-5, 1.25rem) var(--space-4, 1rem);
	}
	.wrap {
		max-width: 60rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-6, 2rem);
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
</style>
