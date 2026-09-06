<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import GreenlineDashboardCard from '$lib/greenline/GreenlineDashboardCard.svelte';
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		locateClassroom,
		sectionTabs,
		type SectionTab
	} from '$lib/classroom/nav';
	import type { GreenlinePending } from '$lib/greenline/moderation';

	/**
	 * See +page.ts for why this harness exists beside /dev/classroom rather than
	 * inside it. Everything below the fixtures is the SHIPPING component.
	 */

	const SECTIONS: ClassroomSection[] = [
		{
			id: 's-1',
			course_id: 'c-1',
			label: 'Period 1',
			block: 'P1',
			teacher_email: 'teacher@boscotech.edu',
			active: true,
			course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
		}
	];

	// The path the shell believes it is on. `/classroom/s-1/people` is a
	// manager-only route, so the bar renders with every manage-only tab in it.
	const SHELL_PATH = '/classroom/s-1/people';
	const loc = locateClassroom(SHELL_PATH);
	const tab = activeTab(loc);
	const crumbs = classroomCrumbs(loc, { section: 'IDEA209H · Period 1' });

	/** The tabs that SHIP today, from the real function. */
	const shipped = sectionTabs('s-1');

	/**
	 * THE DAY THE DUPLICATES PAGE LANDS, as a local fixture rather than as an
	 * entry in `sectionTabs()`. `/classroom/s-1/duplicates` does not exist on
	 * this base -- it is on the unmerged `claude/duplicate-drafts-count-wzworl`
	 * behind an unapplied migration -- so shipping the tab would offer every
	 * manager a 404. What can honestly be measured now is whether the BAR
	 * survives the tab, which is what the wrapping rule promises, and that is
	 * measurable with a fixture that never leaves this file.
	 *
	 * It is the exact object nav.ts's header says the patch would add.
	 */
	const withDuplicates: SectionTab[] = [
		...shipped.slice(0, 3),
		{
			// The cast stands in for the union member the patch adds. Widening
			// `SectionTabId` for a fixture would put the id in the shipping type
			// with no tab behind it, which is the half-landed state this lane
			// exists to stop producing.
			id: 'duplicates' as SectionTab['id'],
			label: 'Duplicates',
			href: '/classroom/s-1/duplicates',
			manageOnly: true
		},
		...shipped.slice(3)
	];

	const WAITING: GreenlinePending = { ready: true, tracks: 2, decals: 1, total: 3 };
	const EMPTY: GreenlinePending = { ready: true, tracks: 0, decals: 0, total: 0 };
	const UNREADY: GreenlinePending = { ready: false, tracks: 0, decals: 0, total: 0 };

	// ?tabs=5 measures the bar the day duplicates lands; ?manage=0 is a
	// student's own view of the same URL, which must have no bar at all.
	const params = $derived(page.url.searchParams);
	const manages = $derived(params.get('manage') !== '0');
	const five = $derived(params.get('tabs') === '5');
	const tabs = $derived(five ? withDuplicates : shipped);
</script>

<div class="cr-root" style="--cr-measure-route: var(--measure-page)">
	<ClassroomShell
		sections={SECTIONS}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		{tab}
		canManage={manages}
		isStaff={manages}
		isAdmin={manages}
	>
		<main class="dv-page">
			<section class="dv-hero">
				<div class="dv-eyebrow">DEV</div>
				<h1>The doors</h1>
				<p class="dv-lead">
					Above: the real section tab bar, fed by the real <code>sectionTabs()</code>. Check-ins is
					a departure, so it carries a guillemet and never takes the active underline.
					<code>?tabs=5</code> adds the duplicates tab as a local fixture, which is the count the
					bar holds the day that page lands. <code>?manage=0</code> is a student, who gets no bar
					at all because only one tab survives the manage filter.
				</p>
			</section>

			<section class="dv-card" data-testid="greenline-cards">
				<h2>GREENLINE moderation card, three states</h2>
				<div class="legacy-index">
					<div class="courses">
						<div data-testid="gl-case-waiting">
							<GreenlineDashboardCard pending={WAITING} />
						</div>
						<div data-testid="gl-case-empty">
							<GreenlineDashboardCard pending={EMPTY} />
						</div>
						<div data-testid="gl-case-unready">
							<GreenlineDashboardCard pending={UNREADY} />
						</div>
					</div>
				</div>
			</section>
		</main>
	</ClassroomShell>
</div>

<style>
	.dv-page {
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) var(--space-6);
	}
	.dv-hero {
		margin-bottom: var(--space-5);
	}
	.dv-eyebrow {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--cyan);
	}
	.dv-card {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: var(--space-4);
	}
	.dv-lead {
		color: var(--text-2);
	}
</style>
