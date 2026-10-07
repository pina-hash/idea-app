<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import ProjectorView from '$lib/classroom/live-class/ProjectorView.svelte';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { describeBuild } from '$lib/feedback/context';
	import {
		buildProjectorFrame,
		projectorStorageKey,
		wallActivityCells,
		type WallActivityInput
	} from '$lib/classroom/live-class/projector';
	import { liveCells, type LiveCellState } from '$lib/classroom/live-class/grid';
	import { wallComingUp } from '$lib/classroom/live-class/agenda';
	import type { ClassroomItem } from '$lib/classroom/classroom';
	import {
		ASSIGNMENT_ID,
		CLASS_LABEL,
		ROSTER,
		SECTION_ID,
		VIEWER,
		demoTimer,
		grading,
		hallPass,
		items,
		presence,
		today
	} from '../classroom-live/fixture';

	/*
	 * THE REAL PROJECTOR VIEW. With no `?demo`, it starts empty and waits for the
	 * control view on this browser's channel, which is the two-page drive. With
	 * `?demo`, a frame is written to this device's slot BEFORE the view mounts
	 * and reads it -- through the one projection the control view uses
	 * (`buildProjectorFrame`), handed the MANAGER hall-pass state that names who
	 * is out, so the wall painting "Taken" here is the reduction working.
	 *
	 * THE DEMOS (reports R12, R13 added every kind after `1`):
	 *
	 *   1        agenda, a running ten-minute timer, the hall pass, a shown
	 *            pick, and Coming up (built by the real `wallComingUp`)
	 *   timer    a running timer and NOTHING else: no agenda, which is the
	 *            screenshot R12 filed (a 48px timer on a 1440 wall)
	 *   counts   demo 1 plus student activity as COUNTS, the cells built by the
	 *            real `liveCells` over the live harness's own fixture
	 *   names    the same with the second toggle on: names on the wall
	 *   full     the fit stress: twelve agenda lines, three Coming up, the hall
	 *            pass, a pick, and a class of thirty with names on
	 *   clock    no timer: the clock is the hero, with side cards
	 *   bare     no timer and nothing else: the clock alone, the side empty
	 *   stale    demo counts whose activity is older than the wall keeps
	 *   final|paused|done|stopwatch   that timer alone (the fixture's `demoTimer`)
	 *
	 * `?clock=pinned` stops this page's clock at load, which is what lets a spec
	 * read the last seconds and the finish exactly; `?theme=space-white` or
	 * `?theme=matrix` forces the theme attribute (no session here);
	 * `?face=dial` seeds the clock face; `?session=1` fakes a signed-in teacher
	 * so the page follows the site theme like the real projector (+page.ts).
	 */
	const demo = page.url.searchParams.get('demo');
	const face = page.url.searchParams.get('face') === 'dial' ? 'dial' : 'digits';
	const themeParam = page.url.searchParams.get('theme');
	const pinned = page.url.searchParams.get('clock') === 'pinned';
	const PIN = Date.now();
	const clock = pinned ? () => PIN : () => Date.now();
	const TIMER_KINDS = ['final', 'paused', 'done', 'stopwatch'];
	const timerOnly = demo === 'timer' || TIMER_KINDS.includes(demo ?? '');
	/** Nothing on the wall but the clock: the side is empty and the hero takes the whole width. */
	const bare = demo === 'bare';

	const AGENDA = [
		'Notebook check-in: Gearbox teardown',
		'Slides: levers and linkages',
		'Truss sketch · Due 11:58 PM',
		'Clean your bench before the bell'
	];
	const AGENDA_FULL = [
		...AGENDA,
		'Warm up: sketch the truss from memory, then compare it with your partner',
		'Gear ratios worksheet, problems 1 to 6',
		'Lab safety reminder: goggles on before the drill press',
		'Group check: who is presenting on Friday',
		'Exit ticket on the board',
		'Return the calipers to the drawer they came from',
		'Read pages 40 to 44 for tomorrow',
		'Photos of your notebook pages go in the check-in'
	];

	/** A class of thirty, every name made up, for the fit stress. */
	function fullClass(): { state: LiveCellState; name: string }[] {
		const first = ['Ari', 'Bea', 'Cal', 'Dana', 'Emil', 'Faye', 'Gabe', 'Hugo', 'Iris', 'Jace', 'Kira', 'Liam', 'Mila', 'Nico', 'Omar', 'Pia', 'Quin', 'Rosa', 'Sami', 'Tess', 'Uma', 'Vic', 'Wes', 'Xena', 'Yuri', 'Zoe', 'Abel', 'Bram', 'Cleo', 'Dax'];
		const last = ['Alder', 'Brook', 'Cedar', 'Dale', 'Ember', 'Frost', 'Grove', 'Heath', 'Isle', 'Jade', 'Knoll', 'Lark', 'Marsh', 'North', 'Oak', 'Pine', 'Quarry', 'Reed', 'Stone', 'Thorn', 'Vale', 'Wren', 'Yarrow', 'Zephyr', 'Ash', 'Birch', 'Clay', 'Dune', 'Elm', 'Fern'];
		const states: LiveCellState[] = [
			...Array(9).fill('working'),
			...Array(7).fill('idle'),
			...Array(5).fill('away'),
			...Array(6).fill('not-opened'),
			...Array(2).fill('needs-grading'),
			'submitted'
		];
		return states.map((state, i) => ({ state, name: `${last[i]}, ${first[i]}` }));
	}

	function activityFor(kind: string, now: number): WallActivityInput | null {
		if (kind === 'full') return { item: 'Truss sketch', at: now - 12_000, cells: fullClass(), names: true };
		if (kind !== 'counts' && kind !== 'names' && kind !== 'stale') return null;
		const cells = liveCells({
			item: items(now).find((i) => i.id === ASSIGNMENT_ID) ?? null,
			signal: true,
			grading: grading(ASSIGNMENT_ID, now),
			roster: ROSTER,
			presence: presence(ASSIGNMENT_ID, now),
			presenceStatus: 'ready',
			now
		});
		return {
			item: 'Truss sketch',
			at: kind === 'stale' ? now - 10 * 60_000 : now - 12_000,
			// The control view's own reduction: Ana is out on the hall pass, so she
			// is counted and never named.
			cells: wallActivityCells(cells, hallPass(now).open?.student_email ?? null),
			names: kind === 'names'
		};
	}

	if (browser) {
		const key = projectorStorageKey(VIEWER, SECTION_ID);
		try {
			if (demo) {
				const now = PIN;
				const full = demo === 'full';
				const withSide = !timerOnly && !bare;
				const frame = buildProjectorFrame({
					day: today(now),
					at: now,
					agenda: timerOnly || bare ? [] : full ? AGENDA_FULL : AGENDA,
					timer: demo === 'clock' || bare ? null : demoTimer(timerOnly && demo !== 'timer' ? demo : 'running', now),
					hallPass: withSide ? hallPass(now) : null,
					pick: withSide && demo !== 'clock' ? { name: 'Cruz Delgado', seed: 'K7Q2' } : null,
					next: withSide
						? full
							? wallComingUp(
									[
										...items(now),
										...['Gear train', 'Bridge report'].map(
											(title, i) =>
												({
													...items(now)[3],
													id: `i-extra-${i}`,
													title,
													due_at: new Date(now + (6 + i) * 86_400_000).toISOString()
												}) as ClassroomItem
										)
									],
									today(now),
									now
								)
							: wallComingUp(items(now), today(now), now)
						: [],
					activity: activityFor(demo, now),
					clockFace: face
				});
				localStorage.setItem(key, JSON.stringify(frame));
			}
		} catch {
			/* Storage blocked: the view simply starts empty. */
		}
	}

	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	/* HYDRATED, SAID ON THE BODY. The projector's clock digits are server-
	   rendered, so a spec waiting on them can act before ThemeRoot's storage
	   listener exists (measured: the follow spec's first write landed before
	   hydration at 1440 and was lost). Effects run in the hydration flush, so a
	   spec that sees this attribute sees every effect of the page attached. */
	$effect(() => {
		document.body.setAttribute('data-projector-hydrated', 'true');
		return () => document.body.removeAttribute('data-projector-hydrated');
	});

	const build = describeBuild({ sha: 'harness', complete: false }, null);
	const submit = async () => ({ error: null, retryable: false });
</script>

<ProjectorView classLabel={CLASS_LABEL} viewer={VIEWER} sectionId={SECTION_ID} {clock}>
	{#snippet controls()}
		<SiteFeedback
			place="relocated"
			routeId={page.route.id}
			pathname={page.url.pathname}
			role="teacher"
			sectionId={SECTION_ID}
			{build}
			{submit}
			anonymous={false}
			label="Report"
		/>
	{/snippet}
</ProjectorView>
