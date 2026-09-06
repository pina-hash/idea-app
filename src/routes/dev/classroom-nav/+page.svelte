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
		sectionTabs
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

	/**
	 * THE TABS THAT SHIP, FROM THE REAL FUNCTION -- five of them now.
	 *
	 * THIS USED TO BE FOUR PLUS A LOCAL `withDuplicates` FIXTURE, and the
	 * fixture is gone rather than kept beside the real thing. 0081 built it
	 * because `/classroom/[sectionId]/duplicates` was on an unmerged branch
	 * behind an unapplied migration, so the tab could not ship and the only
	 * honest thing left to measure was whether the BAR survives the count. The
	 * page landed with `0187` and the tab landed with it, so a hand-built fifth
	 * tab beside the real fifth tab would be a second answer to a question the
	 * shipping function now answers -- and the one that drifts.
	 */
	const shipped = sectionTabs('s-1');

	const WAITING: GreenlinePending = { ready: true, tracks: 2, decals: 1, total: 3 };
	const EMPTY: GreenlinePending = { ready: true, tracks: 0, decals: 0, total: 0 };
	const UNREADY: GreenlinePending = { ready: false, tracks: 0, decals: 0, total: 0 };

	// ?manage=0 is a student's own view of the same URL, which must have no bar
	// at all -- four of the five tabs are `manageOnly` and the fifth alone
	// renders no bar.
	const params = $derived(page.url.searchParams);
	const manages = $derived(params.get('manage') !== '0');
	const tabs = shipped;
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
					a departure, so it carries a guillemet and never takes the active underline;
					Duplicates is an in-classroom view and does take it, on its own page.
					<code>?manage=0</code> is a student, who gets no bar at all because only one tab
					survives the manage filter.
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
