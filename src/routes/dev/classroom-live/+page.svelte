<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import LiveControl from '$lib/classroom/live-class/LiveControl.svelte';
	import { classroomCrumbs, classroomMeasure, locateClassroom, sectionTabs } from '$lib/classroom/nav';
	import { createClassroomPreferences } from '$lib/preferences/classroom';
	import type { PaletteSources } from '$lib/shell/palette';
	import { browser } from '$app/environment';
	import { buildProjectorFrame, projectorStorageKey } from '$lib/classroom/live-class/projector';
	import type { ClassroomLive } from '$lib/classroom/live';
	import type {
		HallPassClosed,
		HallPassManagerState,
		HallPassOpened,
		HallPassOpenedFor,
		HallPassResult,
		HallPassTransports
	} from '$lib/classroom/hall-pass';
	import {
		BASE,
		PROJECTOR_HREF,
		ROSTER,
		SECTION,
		VIEWER,
		checkIns,
		demoTimer,
		grading,
		hallPass,
		items,
		presence,
		today
	} from './fixture';

	/*
	 * THE REAL LIVE CONTROL VIEW, in the REAL shell, mounted the way
	 * src/routes/classroom/[sectionId]/live/+page.svelte mounts it. The measure
	 * is the one `classroomMeasure` gives the real route (`split`), written on
	 * `.cr-root` exactly as src/routes/classroom/+layout.svelte writes it --
	 * a harness without it measures a width the real page never has.
	 */
	const loc = locateClassroom(`/classroom/${SECTION.id}/live`);
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(loc, { section: 'Period 3' }, '/dev/classroom');
	const tabs = sectionTabs(SECTION.id, '/dev/classroom').map((t) =>
		t.id === 'live' ? { ...t, href: BASE } : t
	);
	const preferences = createClassroomPreferences({ viewer: 'harness-live', account: null });
	const palette: PaletteSources = { section: SECTION, items: items(), units: [], sections: [SECTION], checkIns: [] };

	const presenceOff = page.url.searchParams.get('presence') === 'off';
	const themeParam = page.url.searchParams.get('theme');

	/* A TIMER ALREADY ON THE WALL (ledger 0298). `?timer=<kind>` writes a frame
	   holding the fixture's `demoTimer` to this device's projector slot BEFORE
	   the control view mounts, which is exactly what a reload mid-period finds:
	   LiveControl adopts a stored frame's timer on mount. `?clock=pinned` stops
	   the control view's clock at load, so the last seconds and the finish hold
	   still for a spec to read. */
	const timerKind = page.url.searchParams.get('timer');
	const pinned = page.url.searchParams.get('clock') === 'pinned';
	const PIN = Date.now();
	if (browser && timerKind) {
		try {
			const frame = buildProjectorFrame({
				day: today(PIN),
				at: PIN,
				agenda: [],
				timer: demoTimer(timerKind, PIN),
				hallPass: null,
				pick: null
			});
			localStorage.setItem(projectorStorageKey(VIEWER, SECTION.id), JSON.stringify(frame));
		} catch {
			/* Storage blocked: the control view starts with no timer. */
		}
	}

	/* FORCED THEME ATTRIBUTE. A harness holds no session, so ThemeRoot's own
	   decision is always "none" here (F1a's note); the attribute is written the
	   way the notebook harness writes Matrix, and re-written once after
	   ThemeRoot's first effect. `/dev/classroom` is in the Space White scope. */
	$effect(() => {
		if (themeParam !== 'space-white') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', 'space-white');
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	/* THE HALL PASS, IN MEMORY: a manager state that the real transports would
	   return, changed by the same four calls. Every call is logged. */
	let hall = $state<HallPassManagerState>(hallPass());
	let log = $state<string[]>([]);
	const note = (line: string) => (log = [...log, line]);
	const hallPassTransports: HallPassTransports = {
		async load() {
			return hall;
		},
		async open(): Promise<HallPassResult<HallPassOpened>> {
			return { ok: false, message: 'A teacher sends a named student from here.' };
		},
		async closeMine(): Promise<HallPassResult<HallPassClosed>> {
			return { ok: false, message: 'Not a student.' };
		},
		async closeById(passId: string): Promise<HallPassResult<HallPassClosed>> {
			note(`hall: closeById(${passId})`);
			const opened = hall.open;
			hall = { ...hall, taken: false, open: null };
			return {
				ok: true,
				data: {
					pass_id: passId,
					opened_at: opened?.opened_at ?? new Date().toISOString(),
					closed_at: new Date().toISOString(),
					closed_by_manager: true,
					student_name: opened?.student_name ?? null
				}
			};
		},
		async openFor(_sectionId: string, email: string): Promise<HallPassResult<HallPassOpenedFor>> {
			note(`hall: openFor(${email})`);
			const who = ROSTER.find((r) => r.student_email === email);
			const opened_at = new Date().toISOString();
			hall = {
				...hall,
				taken: true,
				open: { pass_id: `pass-${email}`, student_email: email, student_name: who?.display_name ?? email, opened_at }
			};
			return {
				ok: true,
				data: {
					pass_id: `pass-${email}`,
					opened_at,
					student_email: email,
					student_name: who?.display_name ?? email,
					opened_by: 'pina@boscotech.edu'
				}
			};
		}
	};

	const live: ClassroomLive = {
		subscribe: () => () => {},
		announce: (_s, topic) => note(`live: announce(${topic})`)
	};
	const presenceTransports = presenceOff
		? null
		: { loadPresence: async (itemId: string) => presence(itemId) };
	const loadGrading = async (itemId: string) => ({ ok: true as const, data: grading(itemId) });

	/* A pinned entropy source, so a pick is the same pick on every run. */
	let r = 0.137;
	const random = () => {
		r = (r * 9301 + 0.49297) % 1;
		return r;
	};
</script>

<svelte:head><title>dev / classroom live</title></svelte:head>

<div
	class="cr-root"
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	data-testid="live-harness"
>
	<ClassroomShell
		basePath="/dev/classroom"
		sections={[SECTION]}
		currentSectionId={SECTION.id}
		{crumbs}
		{tabs}
		tab="live"
		canManage={true}
		isStaff={true}
		{palette}
		{preferences}
	>
		<LiveControl
			section={SECTION}
			viewer={VIEWER}
			today={today()}
			items={items()}
			checkIns={checkIns()}
			roster={ROSTER}
			hallPass={hallPass()}
			{hallPassTransports}
			{live}
			presence={presenceTransports}
			{loadGrading}
			projectorHref={PROJECTOR_HREF}
			peopleHref="/dev/classroom-tools"
			gradeHrefFor={(id) => `/dev/grading-bulk?item=${id}`}
			initialItemId={page.url.searchParams.get('item')}
			clock={pinned ? () => PIN : undefined}
			{random}
		/>
	</ClassroomShell>
	<details class="harness-log" data-testid="live-harness-log">
		<summary>Harness log ({log.length})</summary>
		<ol>
			{#each log as line, i (i)}
				<li>{line}</li>
			{/each}
		</ol>
	</details>
</div>

<style>
	.harness-log {
		margin: var(--space-4) var(--cr-gutter, 1rem);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
</style>
