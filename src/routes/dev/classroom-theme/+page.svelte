<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ClassThemePanel from '$lib/classroom/ClassThemePanel.svelte';
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import ClassSettingsPanel from '$lib/classroom/ClassSettingsPanel.svelte';
	import {
		CLASS_THEME_FEATURES,
		classThemesBySection,
		resolveClassTheme,
		type ClassThemeChoice,
		type ClassThemeFeature,
		type ClassThemeTally,
		type ClassThemeTransports,
		type ClassThemeWinners
	} from '$lib/classroom/class-theme';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';

	/*
	 * CLASS THEMES, AS THE CLASSROOM MOUNTS THEM (decision 45, ledger 0347).
	 * The transports below answer as 0225's RPCs do: a tally of counts and the
	 * caller's own choices (never who voted), a winner per feature by most
	 * votes then the option whose latest vote is earliest, a manager refused a
	 * vote, a closed vote answering `closed`, a reset that stops older votes
	 * counting, and `unavailable` for every call under `?db=old`. Everything
	 * that DRAWS is the shipping component.
	 */
	const params = page.url.searchParams;
	const teacher = params.get('role') === 'teacher';
	const oldDb = params.get('db') === 'old';
	const noVotes = params.get('votes') === 'none';
	const themeParam = params.get('theme');

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

	const COURSE = 'c-eng';
	const course = { id: COURSE, code: 'IDEA209H', title: 'Engineering Design Honors', active: true };
	const SECTIONS: ClassroomSection[] = [
		{ id: 's-2', course_id: COURSE, label: 'Period 2', block: '2', teacher_email: 'pina@boscotech.edu', active: true, course },
		{ id: 's-4', course_id: COURSE, label: 'Period 4', block: '4', teacher_email: 'pina@boscotech.edu', active: true, course },
		{
			id: 's-frc',
			course_id: 'c-frc',
			label: 'Period 8',
			block: '8',
			teacher_email: 'pina@boscotech.edu',
			active: true,
			course: { id: 'c-frc', code: 'FRC', title: 'FRC Robotics', active: true }
		}
	];
	const CURRENT = SECTIONS[0];

	/* THE DATABASE, IN MEMORY. Votes carry a sequence number for the tie rule. */
	let seq = 0;
	type Vote = { email: string; feature: ClassThemeFeature; option: string; at: number };
	const ME = 'ana@boscotech.net';
	let votes = $state<Vote[]>(
		noVotes
			? []
			: [
					{ email: 'ben@boscotech.net', feature: 'palette', option: 'ocean', at: ++seq },
					{ email: 'cruz@boscotech.net', feature: 'palette', option: 'ocean', at: ++seq },
					{ email: 'dee@boscotech.net', feature: 'palette', option: 'ember', at: ++seq },
					{ email: 'ben@boscotech.net', feature: 'pattern', option: 'rings', at: ++seq },
					{ email: 'dee@boscotech.net', feature: 'badge', option: 'gear', at: ++seq },
					{ email: 'eli@boscotech.net', feature: 'badge', option: 'gear', at: ++seq }
				]
	);
	let votingOpen = $state(params.get('voting') !== 'closed');
	let accents = $state<Record<string, string | null>>(
		noVotes ? { 's-2': null, 's-4': null, 's-frc': null } : { 's-2': 'gold', 's-4': 'sky', 's-frc': null }
	);
	let log = $state<string[]>([]);

	function winners(): ClassThemeWinners {
		const out: ClassThemeWinners = {};
		for (const f of CLASS_THEME_FEATURES) {
			const tally = new Map<string, { n: number; last: number }>();
			for (const v of votes) {
				if (v.feature !== f) continue;
				const t = tally.get(v.option) ?? { n: 0, last: 0 };
				tally.set(v.option, { n: t.n + 1, last: Math.max(t.last, v.at) });
			}
			const best = [...tally.entries()].sort(
				(a, b) => b[1].n - a[1].n || a[1].last - b[1].last || a[0].localeCompare(b[0])
			)[0];
			if (best) out[f] = best[0];
		}
		return out;
	}

	function tally(): ClassThemeTally {
		const counts = new Map<string, number>();
		for (const v of votes) counts.set(`${v.feature}:${v.option}`, (counts.get(`${v.feature}:${v.option}`) ?? 0) + 1);
		const mine: ClassThemeWinners = {};
		for (const v of votes) if (v.email === ME) mine[v.feature] = v.option;
		return {
			course_id: COURSE,
			voting_open: votingOpen,
			reset_at: null,
			manages: teacher,
			can_vote: !teacher,
			voters: new Set(votes.map((v) => v.email)).size,
			counts: [...counts.entries()].map(([k, n]) => {
				const [feature, option] = k.split(':');
				return { feature: feature as ClassThemeFeature, option, votes: n };
			}),
			winners: winners(),
			mine
		};
	}

	const unavailable = { ok: false as const, reason: 'unavailable' as const };
	const transports: ClassThemeTransports = {
		async themes(ids) {
			if (oldDb) return unavailable;
			return {
				ok: true,
				themes: SECTIONS.filter((s) => ids.includes(s.id)).map((s) => ({
					section_id: s.id,
					course_id: s.course_id,
					accent: accents[s.id] ?? null,
					winners: s.course_id === COURSE ? winners() : {}
				}))
			};
		},
		async tally() {
			log = [...log, 'tally'];
			if (oldDb) return unavailable;
			return { ok: true, tally: tally() };
		},
		async vote(_courseId, feature, option) {
			log = [...log, `vote ${feature} ${option ?? '(withdraw)'}`];
			if (oldDb) return unavailable;
			if (teacher) return { ok: false, reason: 'error', message: 'A teacher of this class does not vote on its theme.' };
			if (!votingOpen) return { ok: false, reason: 'closed' };
			votes = votes.filter((v) => !(v.email === ME && v.feature === feature));
			if (option === null) return { ok: true, withdrawn: true, winners: null };
			votes = [...votes, { email: ME, feature, option, at: ++seq }];
			return { ok: true, withdrawn: false, option, winners: winners() };
		},
		async setVoting(_courseId, open) {
			log = [...log, `setVoting ${open}`];
			if (oldDb) return unavailable;
			votingOpen = open;
			return { ok: true, voting_open: open, reset_at: null };
		},
		async reset() {
			log = [...log, 'reset'];
			if (oldDb) return unavailable;
			votes = [];
			return { ok: true, voting_open: votingOpen, reset_at: new Date().toISOString() };
		},
		async setAccent(sectionId, accent) {
			log = [...log, `setAccent ${sectionId} ${accent ?? '(none)'}`];
			if (oldDb) return unavailable;
			accents = { ...accents, [sectionId]: accent };
			return { ok: true, accent };
		}
	};

	/* What the classroom layout's one read hands every surface. */
	function readThemes() {
		if (oldDb) return {};
		const choices: ClassThemeChoice[] = SECTIONS.map((s) => ({
			section_id: s.id,
			course_id: s.course_id,
			accent: accents[s.id] ?? null,
			winners: s.course_id === COURSE ? winners() : {}
		}));
		return classThemesBySection(choices);
	}
	let navThemes = $state(readThemes());
	let voted = $state<ClassThemeWinners | null>(null);
	const theme = $derived(
		voted ? resolveClassTheme({ winners: voted, accent: navThemes[CURRENT.id]?.accent?.id ?? null }) : (navThemes[CURRENT.id] ?? null)
	);

	const ITEMS: ClassroomItem[] = [
		{
			id: 'i-1',
			kind: 'assignment',
			title: 'Truss sketch',
			body: '',
			body_doc: null,
			points: 20,
			due_at: '2026-09-30T06:59:00.000Z',
			category: null,
			author_email: 'pina@boscotech.edu',
			author_name: 'Mr. Pina',
			published: true,
			pinned: false,
			unit_id: null,
			sort_order: 0,
			first_published_at: '2026-09-21T15:00:00.000Z',
			edited_at: null,
			created_at: '2026-09-21T15:00:00.000Z',
			updated_at: '2026-09-21T15:00:00.000Z',
			links: [],
			attachments: [],
			postings: [{ section_id: CURRENT.id }],
			viewed_at: null,
			instructorAttachments: [],
			instructorLinks: []
		}
	];
	const refuse = async () => ({ ok: false as const, message: 'Harness: not wired.' });
</script>

<svelte:head><title>dev / classroom theme</title></svelte:head>

<div class="cr-root {CLASSROOM_PLATE}" data-testid="class-theme-harness" data-log={log.join('|')}>
	<ClassroomShell basePath="/dev/classroom-theme" sections={SECTIONS} themes={navThemes} currentSectionId={CURRENT.id} crumbs={[]} tabs={[]} tab={null}>
		<div class="harness-cols">
			<div class="harness-class" data-testid="harness-class">
				<ClassView section={CURRENT} items={ITEMS} canManage={teacher} basePath="/dev/classroom-theme" {theme} themePanel={panel} />
			</div>
			<div class="harness-home" data-testid="harness-home">
				<MyClasses sections={SECTIONS} themes={navThemes} isStaff={teacher} />
				{#if teacher}
					<ClassSettingsPanel
						section={CURRENT}
						transports={{ upsertSection: refuse, setSectionActive: refuse, deleteSection: refuse } as never}
						themeTransports={transports}
						onchanged={() => {
							navThemes = readThemes();
							voted = null;
						}}
					/>
				{/if}
			</div>
		</div>
	</ClassroomShell>
</div>

{#snippet panel()}
	<ClassThemePanel
		courseId={COURSE}
		{transports}
		manageHref={teacher ? '/dev/classroom-theme?role=teacher' : null}
		onwinners={(w) => (voted = w)}
	/>
{/snippet}

<style>
	/* ONE COLUMN AT EVERY WIDTH: the class page takes the whole measure when
	   nothing is open, as the real route does, so the banner is measured at the
	   width it actually has, and My Classes follows it. */
	.harness-cols {
		display: grid;
		gap: 2rem;
		padding: 1rem;
	}
	.harness-class,
	.harness-home {
		min-width: 0;
	}
</style>
