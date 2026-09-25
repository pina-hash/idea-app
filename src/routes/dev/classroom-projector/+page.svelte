<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import ProjectorView from '$lib/classroom/live-class/ProjectorView.svelte';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { describeBuild } from '$lib/feedback/context';
	import { buildProjectorFrame, projectorStorageKey } from '$lib/classroom/live-class/projector';
	import { CLASS_LABEL, SECTION_ID, VIEWER, demoTimer, hallPass, today } from '../classroom-live/fixture';

	/*
	 * THE REAL PROJECTOR VIEW. With no `?demo`, it starts empty and waits for the
	 * control view on this browser's channel, which is the two-page drive. With
	 * `?demo`, a frame is written to this device's slot BEFORE the view mounts
	 * and reads it -- through the one projection the control view uses
	 * (`buildProjectorFrame`), handed the MANAGER hall-pass state that names who
	 * is out, so the wall painting "Taken" here is the reduction working.
	 *
	 * `?demo=final|paused|done|stopwatch` seeds that timer instead of the
	 * running ten minutes (the kinds are `demoTimer`'s, in the fixture), with no
	 * hall pass and no pick; `?clock=pinned` stops this page's clock at load,
	 * which is what lets a spec read the last seconds and the finish exactly.
	 */
	const demo = page.url.searchParams.get('demo');
	const themeParam = page.url.searchParams.get('theme');
	const pinned = page.url.searchParams.get('clock') === 'pinned';
	const PIN = Date.now();
	const clock = pinned ? () => PIN : () => Date.now();
	const TIMER_KINDS = ['final', 'paused', 'done', 'stopwatch'];
	const timerOnly = demo === 'timer' || TIMER_KINDS.includes(demo ?? '');

	if (browser) {
		const key = projectorStorageKey(VIEWER, SECTION_ID);
		try {
			if (demo) {
				const now = PIN;
				const frame = buildProjectorFrame({
					day: today(now),
					at: now,
					agenda: [
						'Notebook check-in: Gearbox teardown',
						'Slides: levers and linkages',
						'Truss sketch · Due 11:58 PM',
						'Clean your bench before the bell'
					],
					timer: demoTimer(timerOnly && demo !== 'timer' ? demo : 'running', now),
					hallPass: timerOnly ? null : hallPass(now),
					pick: timerOnly ? null : { name: 'Cruz Delgado', seed: 'K7Q2' }
				});
				localStorage.setItem(key, JSON.stringify(frame));
			}
		} catch {
			/* Storage blocked: the view simply starts empty. */
		}
	}

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
