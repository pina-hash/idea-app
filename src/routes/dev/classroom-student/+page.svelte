<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import StudentOverview from '$lib/classroom/StudentOverview.svelte';
	import { sectionTitle } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		locateClassroom,
		sectionTabs,
		studentNotebookHref
	} from '$lib/classroom/nav';
	import { EMAIL, SECTION, TODAY, fixtureManyPictures, fixturePage, fixtureState } from './fixture';
	import { createMemoryAvatarModeration } from '$lib/avatar-moderation';
	import { CLASSROOM_PREFERENCES_NAMESPACE, createClassroomPreferences } from '$lib/preferences/classroom';
	import { provideClassroomPreferences } from '$lib/preferences/context';
	import {
		mergeNamespace,
		namespaceOf,
		profileNamespaceWriter,
		type ProfilePreferenceIo
	} from '$lib/preferences/profile-io';
	import { readStudentPageHidden } from '$lib/classroom/student-sections';

	/**
	 * ONE STUDENT'S PAGE, AS A TEACHER OPENS IT FROM PEOPLE (the 2026-10-07
	 * round): the real shell on the People tab under the real route's measure,
	 * and the real StudentOverview over the page `buildStudentPage` makes from
	 * the fixture's reads. `?state=` picks the case:
	 *   full         every section with something in it (the default)
	 *   no-account   a student on the roster who has never signed in
	 *   unavailable  a database without 0233: the new read answers PGRST202
	 *   inactive     a student who left the class (no full-notebook link)
	 * `&moderate=1` hands in the admin's profile picture control over an
	 * in-memory stand-in (`&held=1` starts with the picture already off), as the
	 * route does for a site admin; without it there is no control, as for a
	 * teacher who is not one.
	 * `&pictures=N` swaps the gallery for N numbered pictures, so the thumbnail
	 * strip overflows at every width (report 169b931d).
	 * `&attention=N` keeps only the N oldest missing or late assignments (the
	 * rest of the fixture's are left off), so Needs attention is short enough to
	 * sit beside Scores rather than above it (the polish round's pair rule).
	 * `&checkins=N` likewise keeps only the N oldest flagged or missing notebook
	 * check-ins (the others on the grid stay), for the same reason.
	 *
	 * THE SECTIONS KEY (report bd38fa25) gets the REAL classroom preference
	 * store, with its account half written through the REAL read-first writer
	 * (`profileNamespaceWriter`) into a stand-in for the profile row's
	 * `preferences` column kept in this browser's localStorage, so a hidden
	 * section survives a reload here exactly as it follows a teacher there.
	 * `&hide=notebook,coins` starts with those hidden; `&prefs=0` mounts the page
	 * with no store at all, which takes the key away.
	 */
	const BASE = '/dev/classroom-student';
	const fixture = fixtureState(page.url.searchParams.get('state'));
	const moderating = page.url.searchParams.get('moderate') === '1';
	/* Under `moderate=1` Ana has chosen a preset picture, so turning it off visibly changes something. */
	const pictures = Number(page.url.searchParams.get('pictures') ?? '');
	const built = fixturePage(fixture);
	const base = Number.isFinite(pictures) && pictures > 0 ? { ...built, gallery: fixtureManyPictures(pictures) } : built;
	const attentionParam = page.url.searchParams.get('attention');
	const attentionKeep = attentionParam === null ? Infinity : Math.max(0, Math.floor(Number(attentionParam)) || 0);
	const owed = (r: (typeof base.assignments)[number]) => r.chip.missing || r.late;
	const keepOwed = new Set(
		base.assignments
			.filter(owed)
			.sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))
			.slice(0, attentionKeep)
			.map((r) => r.itemId)
	);
	const trimmedWork = Number.isFinite(attentionKeep)
		? { ...base, assignments: base.assignments.filter((r) => !owed(r) || keepOwed.has(r.itemId)) }
		: base;
	const checkinsParam = page.url.searchParams.get('checkins');
	const checkinsKeep = checkinsParam === null ? Infinity : Math.max(0, Math.floor(Number(checkinsParam)) || 0);
	const trimmed = (() => {
		const nb = trimmedWork.notebook;
		if (!nb || !Number.isFinite(checkinsKeep)) return trimmedWork;
		const asking = (c: (typeof nb.checkIns)[number]) => c.display === 'flagged' || c.display === 'missing';
		const keep = new Set(
			nb.checkIns
				.filter(asking)
				.sort((a, b) => a.date.localeCompare(b.date))
				.slice(0, checkinsKeep)
				.map((c) => c.sessionId)
		);
		return { ...trimmedWork, notebook: { ...nb, checkIns: nb.checkIns.filter((c) => !asking(c) || keep.has(c.sessionId)) } };
	})();
	const data = moderating ? { ...trimmed, student: { ...trimmed.student, avatar: 'preset:gear' } } : trimmed;

	const loc = locateClassroom(`/classroom/s-1/people/${encodeURIComponent(EMAIL)}`);
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(
		loc,
		{ section: sectionTitle(SECTION), student: data.student.display_name },
		BASE
	);
	const tabs = sectionTabs('s-1', BASE);
	const notebookHref = data.student.active ? studentNotebookHref(EMAIL, 's-1', BASE) : null;
	const avatarModeration =
		moderating
			? createMemoryAvatarModeration({
					accounts: [EMAIL],
					held:
						page.url.searchParams.get('held') === '1'
							? [{ email: EMAIL, name: data.student.display_name, hiddenAt: '2026-10-16T15:12:00Z', hiddenBy: 'apina@boscotech.edu', reason: 'Not school appropriate.', hadPicture: true }]
							: []
				})
			: null;

	/* The stand-in for `profiles.preferences`, with an unrelated namespace in
	   it so a spec can prove a write keeps its siblings. */
	const PROFILE_KEY = 'dev-classroom-student:profile-preferences';
	const io: ProfilePreferenceIo = {
		key: 'dev-classroom-student',
		async read() {
			try {
				return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}');
			} catch {
				return {};
			}
		},
		async write(preferences) {
			localStorage.setItem(PROFILE_KEY, JSON.stringify(preferences));
		}
	};
	function storedBlob(): unknown {
		try {
			const text = localStorage.getItem(PROFILE_KEY);
			return text ? JSON.parse(text) : { homepage: { pinned: ['coins'] } };
		} catch {
			return {};
		}
	}
	const hideParam = page.url.searchParams.get('hide');
	let blob = storedBlob();
	if (hideParam !== null) {
		const classroom = (namespaceOf(blob, CLASSROOM_PREFERENCES_NAMESPACE) ?? {}) as Record<string, unknown>;
		blob = mergeNamespace(blob, CLASSROOM_PREFERENCES_NAMESPACE, {
			...classroom,
			studentPage: { hidden: readStudentPageHidden(hideParam.split(',')) }
		});
	}
	try {
		localStorage.setItem(PROFILE_KEY, JSON.stringify(blob));
	} catch {
		/* blocked storage: the store still works for the session */
	}
	provideClassroomPreferences(
		page.url.searchParams.get('prefs') === '0'
			? null
			: createClassroomPreferences({
					viewer: 'harness-student',
					account: {
						initial: namespaceOf(blob, CLASSROOM_PREFERENCES_NAMESPACE),
						writer: profileNamespaceWriter(io, CLASSROOM_PREFERENCES_NAMESPACE)
					}
				})
	);

	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

<svelte:head><title>dev // one student's page</title></svelte:head>

<div
	class="cr-root {CLASSROOM_PLATE}"
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	data-ready={ready ? 'true' : undefined}
	data-state={fixture}
>
	<ClassroomShell basePath={BASE} sections={[SECTION]} currentSectionId="s-1" {crumbs} {tabs} tab={activeTab(loc)} canManage={true}>
		<StudentOverview
			section={SECTION}
			{data}
			today={TODAY}
			peopleHref={`${BASE}?view=people`}
			itemHref={(id) => `${BASE}?item=${id}`}
			gradeHref={(id) => `${BASE}?grade=${id}`}
			workHref={(id) => `${BASE}?work=${id}`}
			{notebookHref}
			{avatarModeration}
		/>
	</ClassroomShell>
</div>
