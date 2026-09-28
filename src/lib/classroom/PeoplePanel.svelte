<script lang="ts">
	import InfoTip from '$lib/classroom/InfoTip.svelte';
	import Avatar from '$lib/Avatar.svelte';
	import { rosterSubject } from '$lib/avatars';
	import { tick, untrack } from 'svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { dropTarget, matchesAccept } from '$lib/file-drop';
	import {
		enrollmentWorkSummary,
		importReasonLabel,
		parseSectionRosterCsv,
		sectionTitle,
		splitRoster,
		type ClassroomEnrollment,
		type ClassroomPeopleTransports,
		type ClassroomSection,
		type ImportSummary
	} from '$lib/classroom/classroom';
	import {
		CELL_STATES,
		completionLabel,
		gridSummary,
		type GridSummary,
		type ReviewTransports
	} from '$lib/notebook-review';
	import { formatSectionLabel } from '$lib/section-label';
	import { classNotebookHref, classSettingsHref } from '$lib/classroom/nav';
	import Pending from '$lib/Pending.svelte';
	import {
		classEmailList,
		classEmailRecipients,
		mailtoPlan,
		mailtoPlanNote,
		rosterCsv,
		rosterCsvFilename,
		teamsCsv,
		teamsCsvFilename
	} from '$lib/classroom/roster-export';
	import {
		pickerDrawNote,
		pickerOne,
		pickerPool,
		pickerSeedFrom,
		pickerShuffle,
		pickerTeamsBy,
		type PickerCandidate,
		type PickerTeamMode
	} from '$lib/classroom/picker';
	import {
		TEAM_WINDOW_WORDS,
		canStyleTeam,
		hasStyle,
		teamDriftNote,
		teamLabel,
		teamSetEditedWords,
		TEAM_EDITED_NOTE,
		teamStyle,
		teamStyleVars,
		teamWindowEnd,
		teamWindowState,
		type Team,
		type TeamSet,
		type TeamTransports
	} from '$lib/classroom/teams';
	import { sortDrag } from '$lib/classroom/sort-drag';

	/**
	 * ONE class's people: the roster (add, correct, deactivate, CSV import), the
	 * class tools and the saved teams.
	 *
	 * THIS IS WHERE THE MANAGE CONSOLE WENT. The roster used to live on a
	 * separate page listing every class a teacher runs, behind an accordion --
	 * so changing one class's roster meant leaving that class, finding it in a
	 * list, and opening a panel. Managing a class is now done standing in it.
	 *
	 * WHAT THE CLASS ITSELF IS (label, block, teacher of record, archive,
	 * delete) LEFT THIS PANEL for the class's own Settings tab
	 * (`ClassSettingsPanel`, report R06, 2026-09-28): it sat at the bottom of
	 * People, which is not where anybody looked for it.
	 *
	 * Presentation + injected transports (the ReviewConsole convention). Nothing
	 * here is a boundary: the route 404s a non-manager, and every RPC behind these
	 * controls re-checks teacher-of-record itself.
	 */
	let {
		section,
		roster = [],
		removalReady = false,
		transports,
		loadNotebookGrid = null,
		teams: teamTransports = null,
		onchanged = null
	}: {
		section: ClassroomSection;
		roster?: ClassroomEnrollment[];
		/**
		 * Did the roster come back off the 0138 rung, so `manages` is real and
		 * `classroom_remove_enrollment` exists to be called?
		 *
		 * DEFAULTS FALSE, which is the fail-closed direction: a caller that has
		 * not asked gets the panel exactly as it was before this bundle, rather
		 * than a Remove control that would answer PGRST202 and a status chip
		 * asserting nobody manages the class.
		 */
		removalReady?: boolean;
		transports: ClassroomPeopleTransports;
		/**
		 * THE TEAMS SUBSTRATE (0223), AND ITS ABSENCE REMOVES THE WHOLE AREA.
		 *
		 * Null is the fail-closed default and is a REAL deployment state, not a
		 * defensive one: migrations here are applied by hand, one file at a
		 * time, so a client can ship before 0223 lands. A caller that has not
		 * wired it gets the panel exactly as it was before this bundle -- no
		 * Teams tool, no save control -- rather than controls that would answer
		 * PGRST202.
		 *
		 * Each transport inside it is optional for the same reason one level
		 * down: no `style` transport means no style controls anywhere beneath,
		 * so read-only is structural rather than a flag.
		 */
		teams?: TeamTransports | null;
		/**
		 * The notebook's own grid read, for the compliance element below (0099).
		 *
		 * It CAME WITH THE ROSTER out of the retired console: "how is this class
		 * doing on its notebook" is a question about these students, so it belongs
		 * on the page that lists them. Deliberately the SAME signature the review
		 * console's `ReviewTransports['loadGrid']` has, wired to the same
		 * `notebook_get_section_grid` -- there is no second grid query and no
		 * second copy of who may run one (that RPC asks
		 * `classroom_manages_section` itself). Null omits the element, which is the
		 * fail-soft state where the notebook migrations are not applied.
		 */
		loadNotebookGrid?: ReviewTransports['loadGrid'] | null;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	type Msg = { ok: boolean; text: string } | null;

	let busy = $state(false);
	let msg = $state<Msg>(null);

	// --- Roster -----------------------------------------------------------
	let addEmail = $state('');
	let addName = $state('');
	let editEmail = $state<string | null>(null);
	let newEmail = $state('');
	let newName = $state('');

	const active = $derived(roster.filter((e) => e.active));
	const inactive = $derived(roster.filter((e) => !e.active));
	/**
	 * The hero's count, THROUGH THE REAL SPLIT.
	 *
	 * It used to be `active.length`, which on a roster carrying the teacher's
	 * own enrollment reads 25 while the Grades tab beside it reads 24 -- two
	 * numbers for one class, with nothing on either page to say why. This page
	 * still LISTS every row, because the manager row is the one somebody came
	 * here to remove; it just stops calling them all students.
	 */
	const activeSplit = $derived(splitRoster(active));

	/**
	 * REMOVAL: the first path this schema has ever had for taking an enrollment
	 * OFF a class rather than archiving it (0138).
	 *
	 * IT IS OFFERED ONLY WHEN BOTH HALVES ARE THERE. The transport is optional,
	 * so its absence removes the control down through this panel the way every
	 * other write here works; `removalReady` is the other half, and says the
	 * database has the RPC at all. One derived predicate, read by the control
	 * AND by the handler, because two spellings of "can this be pressed" is
	 * what produces a click that does nothing.
	 */
	const canRemove = $derived(removalReady && typeof transports.removeEnrollment === 'function');

	// -----------------------------------------------------------------------
	// CLASS TOOLS: the roster out of the page, the class into a mail draft, and
	// a draw. All three read the rows this panel already holds -- there is no
	// second load, no new transport and no new gate, because there is nothing
	// here the instructor is not already looking at.
	//
	// ONE CARD AND ONE OPEN PANEL AT A TIME. This page is read standing up with
	// a class in front of you, so three stacked disclosures would push the
	// roster off the screen for the sake of tools used once a lesson. The three
	// controls are one row; opening one closes the others.
	// -----------------------------------------------------------------------

	type Tool = 'export' | 'email' | 'picker' | 'teams';
	let tool = $state<Tool | null>(null);
	function toggleTool(next: Tool) {
		tool = tool === next ? null : next;
	}

	/**
	 * The download. `<a download>` on a blob URL, revoked after the click -- the
	 * `FeedbackConsole` shape, and for the same reason: a server round trip
	 * would only re-derive rows this page already has.
	 */
	function downloadCsv() {
		if (typeof document === 'undefined') return;
		const text = rosterCsv(section, roster);
		const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = rosterCsvFilename(section, Date.now());
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		msg = { ok: true, text: `Exported ${roster.length} row${roster.length === 1 ? '' : 's'}.` };
	}

	// --- Email the class ---------------------------------------------------
	let mailSubject = $state('');
	let copiedList = $state(false);
	const recipients = $derived(classEmailRecipients(roster));
	const mailPlan = $derived(mailtoPlan(recipients, mailSubject));

	async function copyAddresses() {
		const text = classEmailList(recipients);
		try {
			await navigator.clipboard.writeText(text);
			copiedList = true;
		} catch {
			// A refused clipboard is not a failure worth a red message: the list
			// is rendered as selectable text right beside the control, which is
			// the fallback anybody reaches for anyway.
			copiedList = false;
			msg = { ok: false, text: 'Could not copy. Select the list below instead.' };
		}
	}

	// --- The picker --------------------------------------------------------
	//
	// THE SEED IS HELD HERE AND NOWHERE ELSE. Every draw is a pure function of
	// (names, seed), so a re-render -- a save landing, a resize, a navigation
	// back -- cannot change an answer the teacher has already read out. A new
	// draw is a new seed, deliberately pressed.
	let seed = $state(0);
	let teamSize = $state(3);
	/**
	 * HOW MANY TEAMS, ASKED THE OTHER WAY ROUND, and it is a second control
	 * rather than a replacement.
	 *
	 * The report that produced this asked to "specify a number of teams". The
	 * only input here was Team size, so getting seven teams out of it meant
	 * solving `ceil(n / size) = 7` in your head with a class watching. Both
	 * questions are legitimate -- "teams of about three" and "seven benches" --
	 * so both are offered and the dealer underneath is the same one.
	 */
	let teamMode = $state<PickerTeamMode>('size');
	let teamCount = $state(4);
	const teamValue = $derived(teamMode === 'count' ? teamCount : teamSize);
	let absent = $state(new Set<string>());
	let drawn = $state(false);

	const candidates = $derived<PickerCandidate[]>(
		activeSplit.students.map((e) => ({
			email: e.student_email,
			name: e.display_name || e.student_email.split('@')[0]
		}))
	);
	const pool = $derived(pickerPool(candidates, absent));
	const drawNote = $derived(pickerDrawNote(seed, pool));
	const order = $derived(drawn ? pickerShuffle(pool.included, seed) : []);
	const teams = $derived(drawn ? pickerTeamsBy(pool.included, teamMode, teamValue, seed) : []);
	const chosen = $derived(drawn ? pickerOne(pool.included, seed) : null);

	function draw() {
		// `Math.random` is read HERE, once, and never inside the draw itself --
		// which is what keeps every figure on screen reproducible from the seed
		// printed beside it.
		seed = pickerSeedFrom(Math.random());
		drawn = true;
		/* THE RESULT IS ON SCREEN WHEN DRAW IS PRESSED (ledger 0297). It renders
		   directly under the Draw row now (the Here today list is ordered after
		   it), and on a short window it is scrolled into view rather than left
		   below the fold for a teacher standing at the front of the room. */
		void tick().then(() =>
			document
				.querySelector('[data-testid="picker-note"]')
				?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
		);
	}

	function toggleAbsent(email: string) {
		const next = new Set(absent);
		if (next.has(email)) next.delete(email);
		else next.add(email);
		absent = next;
	}

	// --- Saved teams (0223) -------------------------------------------------
	//
	// THE DRAW ABOVE IS EPHEMERAL AND THIS IS WHAT MAKES ONE LAST. Everything
	// below is behind `teamTransports`: with no transport the area does not
	// render at all, which is the same absence-is-the-mechanism rule the rest of
	// this module uses, and it is what keeps the panel correct on a deployment
	// that does not have 0223 yet.

	let teamLabelDraft = $state('');
	let savedSets = $state<TeamSet[]>([]);
	let teamsManages = $state(false);
	let teamsLoading = $state(false);
	/** null = not asked yet; false = this deployment has no 0223. */
	let teamsReady = $state<boolean | null>(null);
	let teamsError = $state<string | null>(null);
	let teamsBusy = $state(false);
	/** Which saved set has its Retire armed. Only ever one. */
	let armedRetire = $state<string | null>(null);
	/** Days to post for, per set. null is the "no end" option. */
	let postDays = $state<Record<string, number | null>>({});

	/**
	 * THE CLOCK IS READ ONCE, HERE, and threaded down. A component that reads
	 * its own clock silently disagrees with the payload it is rendering, and the
	 * window state is exactly the kind of thing two readings would disagree
	 * about across a midnight or a poll.
	 */
	let nowMs = $state(Date.now());

	/**
	 * `quiet` re-reads the board WITHOUT the loading state, for the follow-up
	 * to a move or a rename: flipping `teamsLoading` swaps the whole panel for
	 * a pending line, which unmounts the very card somebody just dropped a
	 * student on and reads as the page resetting.
	 */
	async function loadTeams({ quiet = false }: { quiet?: boolean } = {}) {
		const t = teamTransports;
		if (!t) return;
		if (!quiet) teamsLoading = true;
		teamsError = null;
		try {
			const res = await t.board(section.id);
			nowMs = Date.now();
			if (res.ok) {
				savedSets = res.sets;
				teamsManages = res.manages;
				teamsReady = true;
				// Only ever turned OFF by the board: a set without 0225's key says
				// the move RPC is not there. No sets says nothing either way.
				if (res.sets.length > 0 && res.editsReady === false) moveReady = false;
			} else if (res.reason === 'unavailable') {
				// A REAL STATE, NOT AN ERROR. 0223 is applied by hand, so a
				// client can genuinely be ahead of its migration. The area says
				// so and offers nothing, rather than showing controls that
				// would answer PGRST202.
				teamsReady = false;
			} else {
				teamsReady = true;
				teamsError = res.message;
			}
		} finally {
			teamsLoading = false;
		}
	}

	/**
	 * WRAPPED IN `untrack` BECAUSE IT CALLS AN INJECTED TRANSPORT.
	 *
	 * `teamTransports` is written by whoever mounts this component, who cannot
	 * see this effect. Everything it touches reactively before its first
	 * `await` would otherwise join this effect's dependency set, and anything it
	 * then writes re-triggers the effect -- which is `effect_update_depth_exceeded`
	 * on mount, naming nothing about the transport that caused it. The dev
	 * harness's logging transports are exactly that shape.
	 *
	 * TRACK THE INPUTS, UNTRACK THE CALL: the tool and the section are read
	 * tracked, so opening the panel and changing class both refetch; only the
	 * invocation is untracked.
	 */
	$effect(() => {
		const open = tool === 'teams';
		const id = section.id;
		if (!open || !id) return;
		untrack(() => {
			if (teamsReady === null && !teamsLoading) void loadTeams();
		});
	});

	/** Save the draw currently on screen. Manager only; the RPC re-checks. */
	async function saveTeams() {
		const t = teamTransports;
		if (!t?.save || teams.length === 0) return;
		teamsBusy = true;
		try {
			const res = await t.save({
				sectionId: section.id,
				label: teamLabelDraft.trim() || 'Teams',
				seed,
				mode: teamMode,
				modeValue: teamValue,
				teams: teams.map((team) => team.map((p) => p.email))
			});
			if (res.ok) {
				teamLabelDraft = '';
				msg = { ok: true, text: 'Teams saved. They will still be here after a reload.' };
				teamsReady = null;
				await loadTeams();
			} else {
				msg = { ok: false, text: res.message ?? 'Could not save these teams.' };
			}
		} finally {
			teamsBusy = false;
		}
	}

	async function runTeamAction(
		fn: (() => Promise<{ ok: boolean; message?: string }>) | undefined,
		okText: string
	) {
		if (!fn) return;
		teamsBusy = true;
		try {
			const res = await fn();
			msg = res.ok ? { ok: true, text: okText } : { ok: false, text: res.message ?? 'That did not work.' };
			if (res.ok) {
				await loadTeams();
				// Post, take down and retire change what the CLASS PAGE shows, and
				// the section layout's load never re-runs on the way from here to
				// the Class tab, so without this the teacher read the class page as
				// it was before the post (ledger 0298, R23). The roster edits above
				// already refresh the page this way.
				await onchanged?.();
			}
		} finally {
			teamsBusy = false;
			armedRetire = null;
		}
	}

	/**
	 * The team CSV. Same `<a download>` shape as the roster export above and for
	 * the same reason: a server round trip would only re-derive rows this page
	 * is already holding.
	 */
	function downloadTeamsCsv(set: TeamSet) {
		if (typeof document === 'undefined') return;
		const text = teamsCsv(section, set);
		const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = teamsCsvFilename(section, set, Date.now());
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		const people = set.teams.reduce((n, team) => n + team.members.length, 0);
		msg = {
			ok: true,
			text: `Exported ${set.teams.length} team${set.teams.length === 1 ? '' : 's'} and ${people} student${people === 1 ? '' : 's'}.`
		};
	}

	/**
	 * A team's own colours, as inline custom properties: `teamStyleVars`, the
	 * one projection the class page's posted-teams board reads too (ledger
	 * 0297), so the two boards cannot paint one team two ways.
	 */
	function teamCardStyle(team: Team): string {
		return teamStyleVars(team);
	}

	// --- Changing a saved draw by hand (0225, decision 44) -----------------
	//
	// A MOVE AND A RENAME ARE BOTH EDITS IN PLACE: the draw keeps its seed and
	// the database stamps it `edited_at`, which is what "Edited by hand" reads.
	// Two paths reach one move -- a drag onto another team card and a Move to
	// control on every member -- and both call `moveMember`, so there is one
	// place a move is written.

	/**
	 * FALSE ONCE THE MOVE TRANSPORT ANSWERED `unavailable` (PGRST202: this
	 * deployment has no 0225 yet). The controls go and one sentence says why,
	 * rather than a drag whose only outcome is a refusal.
	 */
	let moveReady = $state(true);
	/**
	 * ONE PREDICATE FOR "can a student be moved here", read by every control
	 * AND by the handler: a manager, a transport, and a database that has it.
	 */
	const canMove = $derived(teamsManages && moveReady && typeof teamTransports?.move === 'function');
	const canRename = $derived(teamsManages && typeof teamTransports?.style === 'function');
	/** A refusal, in the database's own sentence, held beside the draw it is about. */
	let teamEditRefusal = $state<{ setId: string; text: string } | null>(null);
	/** What the last move did, in words, for the live region beside the draw. */
	let teamEditNote = $state<{ setId: string; text: string } | null>(null);
	/** The team whose Rename is open. Only ever one. */
	let renamingTeam = $state<string | null>(null);
	/**
	 * THE MEMBER WHOSE MOVE TO IS OPEN, as `<draw id>:<email>`. Only ever one.
	 * It is a button that opens a row of team buttons rather than a `<select>`
	 * acting on `change` (fresh-eyes review, ledger 0347): a keyboard user
	 * arrowing through a select's options fires `change` on every step in
	 * Chrome, so the first arrow press moved the student to the next team and
	 * re-rendered the row out from under the focus.
	 */
	let movingMember = $state<string | null>(null);
	let renameDraft = $state('');

	/**
	 * THE STUDENTS ON NO TEAM OF THIS DRAW: active, on the roster, not a
	 * manager (`splitRoster`, the one implementation of that), and absent from
	 * every team. Compared lowercased, because the roster and the board are two
	 * reads of an email-keyed schema and `A@x` and `a@x` are one person.
	 */
	function unteamed(set: TeamSet): ClassroomEnrollment[] {
		const onATeam = new Set(
			set.teams.flatMap((t) => t.members.map((m) => m.student_email.toLowerCase()))
		);
		return activeSplit.students.filter((e) => !onATeam.has(e.student_email.toLowerCase()));
	}

	async function moveMember(set: TeamSet, email: string, name: string, toTeamId: string) {
		const t = teamTransports;
		if (!t?.move || !canMove || teamsBusy) return;
		const to = set.teams.find((team) => team.id === toTeamId);
		if (!to) return;
		teamsBusy = true;
		teamEditRefusal = null;
		teamEditNote = null;
		try {
			const res = await t.move(set.id, email, toTeamId);
			if (res.ok) {
				const who = name.trim() || email;
				teamEditNote = {
					setId: set.id,
					text: res.added
						? `Added ${who} to ${teamLabel(to)}.`
						: res.moved
							? `Moved ${who} to ${teamLabel(to)}.`
							: `${who} is already on ${teamLabel(to)}.`
				};
				await loadTeams({ quiet: true });
				// A posted draw is on the class page, whose layout load does not
				// re-run on the way there (the same reason `runTeamAction` calls it).
				await onchanged?.();
			} else if (res.reason === 'unavailable') {
				moveReady = false;
			} else {
				teamEditRefusal = { setId: set.id, text: res.message };
			}
		} finally {
			teamsBusy = false;
		}
	}

	const moveKey = (set: TeamSet, email: string) => `${set.id}:${email.toLowerCase()}`;
	const moveListId = (key: string) => `team-move-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`;

	function toggleMove(key: string) {
		movingMember = movingMember === key ? null : key;
	}

	/** The worded control for one student, found again after the list re-renders. */
	function moveTrigger(set: TeamSet, email: string): HTMLElement | null {
		if (typeof document === 'undefined') return null;
		return document.querySelector<HTMLElement>(
			`[data-move-trigger="${moveKey(set, email).replace(/["\\]/g, '')}"]`
		);
	}

	/**
	 * A CHOICE CLOSES THE ROW, WRITES, AND PUTS THE FOCUS BACK ON THE STUDENT,
	 * who is now in another card: the list re-renders, the element that was
	 * pressed is gone, and a focus left on nothing sends a keyboard user back to
	 * the top of the page. A student who landed on the only team has no Move to
	 * of their own, and then the focus stays where the browser put it.
	 */
	async function chooseMove(set: TeamSet, email: string, name: string, toTeamId: string) {
		movingMember = null;
		await moveMember(set, email, name, toTeamId);
		await tick();
		moveTrigger(set, email)?.focus();
	}

	function closeMoveOnEscape(e: KeyboardEvent, set: TeamSet, email: string) {
		if (e.key !== 'Escape' || movingMember !== moveKey(set, email)) return;
		e.preventDefault();
		e.stopPropagation();
		movingMember = null;
		moveTrigger(set, email)?.focus();
	}

	function toggleRename(team: Team) {
		if (renamingTeam === team.id) {
			renamingTeam = null;
			return;
		}
		renamingTeam = team.id;
		renameDraft = team.name ?? '';
		teamEditRefusal = null;
	}

	/**
	 * A RENAME GOES THROUGH THE EXISTING STYLE WRITE WITH EVERY OTHER FIELD
	 * CARRIED OVER from `teamStyle(team)`. That write replaces all six style
	 * columns at once, so a rename built from the name alone would wipe a
	 * banner the students made. An empty name is null, which renders "Team n".
	 */
	async function saveRename(set: TeamSet, team: Team) {
		const t = teamTransports;
		if (!t?.style || !canRename || teamsBusy) return;
		const style = teamStyle(team);
		const name = renameDraft.trim() || null;
		teamsBusy = true;
		teamEditRefusal = null;
		teamEditNote = null;
		try {
			const res = await t.style({
				teamId: team.id,
				name,
				accentColor: style.accent_color,
				backgroundType: style.background_type,
				backgroundValue: style.background_value,
				badge: style.badge,
				flourish: style.flourish,
				tagline: style.tagline
			});
			if (res.ok) {
				renamingTeam = null;
				teamEditNote = {
					setId: set.id,
					text: name ? `Renamed ${teamLabel(team)} to ${name}.` : `${teamLabel(team)} is Team ${team.team_number} again.`
				};
				await loadTeams({ quiet: true });
				await onchanged?.();
			} else {
				teamEditRefusal = { setId: set.id, text: res.message ?? 'Could not rename this team.' };
			}
		} finally {
			teamsBusy = false;
		}
	}

	/** The drag options for one member list: every other team card of the same draw is a place to drop. */
	function memberDrag(set: TeamSet, members: readonly { email: string; name: string }[]) {
		return {
			items: '[data-team-member]',
			disabled: !canMove || teamsBusy,
			// Reordering inside a team means nothing, so the keys belong to the
			// Move to control and a release over the home card does nothing.
			keyboard: false,
			zones: `[data-team-zone="${set.id}"]`,
			ondrop: () => {},
			ondropzone: (from: number, zone: HTMLElement) => {
				const who = members[from];
				const toTeamId = zone.dataset.teamId;
				if (who && toTeamId) void moveMember(set, who.email, who.name, toTeamId);
			}
		};
	}

	/** The row whose Remove is armed. Only ever one, and never across a reload. */
	let armedRemoval = $state<string | null>(null);
	/**
	 * A refusal, held against the row it belongs to. IN PLACE rather than in
	 * `msg` at the top of the page: the counts are about ONE person, and the
	 * alternative action they point at is that person's own Deactivate.
	 */
	let removalRefusal = $state<{ email: string; text: string } | null>(null);

	function armRemoval(e: ClassroomEnrollment) {
		armedRemoval = armedRemoval === e.student_email ? null : e.student_email;
		removalRefusal = null;
		msg = null;
	}

	async function confirmRemoval(e: ClassroomEnrollment) {
		const remove = transports.removeEnrollment;
		if (busy || !canRemove || !remove) return;
		busy = true;
		msg = null;
		removalRefusal = null;
		const res = await remove(section.id, e.student_email);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		if (res.data.ok === false) {
			armedRemoval = null;
			removalRefusal = {
				email: e.student_email,
				text:
					res.data.reason === 'work_attached'
						? `Not removed. ${enrollmentWorkSummary(res.data.counts)} in this class ${
								res.data.total === 1 ? 'is' : 'are'
							} attached to this enrollment, and deleting it would strand ${
								res.data.total === 1 ? 'that' : 'those'
							}.${
								// Only when an entry is actually in the count. Explaining the bin
								// beside a refusal that has nothing to do with it reads as a
								// non sequitur, and the reader goes looking for a deleted entry
								// that is not there.
								res.data.counts.notebook_entries > 0
									? ' A notebook entry in the bin still counts, because it can be restored.'
									: ''
							}`
						: 'Not removed. That enrollment is already gone from this class.'
			};
			await onchanged?.();
			return;
		}
		armedRemoval = null;
		msg = { ok: true, text: `${e.student_email} removed from this class.` };
		await onchanged?.();
	}

	/**
	 * The row's own status, in words. Colour is never the only signal here, so
	 * the chip carries the sentence and the class only tints it.
	 *
	 * MANAGING OUTRANKS ENROLLED, because it is the fact that explains why this
	 * row does not appear on the check-in grid, in the grading roster or in the
	 * FACTS export. Somebody reading this page after looking for that name
	 * somewhere else is asking exactly this question.
	 */
	function rosterStatus(e: ClassroomEnrollment): { label: string; tone: 'manager' | 'on' | 'off' } {
		if (e.manages === true) return { label: 'Manages this class', tone: 'manager' };
		if (e.active) return { label: 'Enrolled', tone: 'on' };
		return { label: 'Not on the live roster', tone: 'off' };
	}

	async function addStudent() {
		if (busy) return;
		busy = true;
		msg = null;
		const res = await transports.setEnrollment(section.id, addEmail, addName.trim() || null, true);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		msg = { ok: true, text: `${addEmail.trim().toLowerCase()} added.` };
		addEmail = '';
		addName = '';
		await onchanged?.();
	}

	function startEdit(e: ClassroomEnrollment) {
		editEmail = editEmail === e.student_email ? null : e.student_email;
		newEmail = e.student_email;
		newName = e.display_name;
		msg = null;
	}

	async function saveEnrollment(e: ClassroomEnrollment) {
		if (busy) return;
		busy = true;
		const res = await transports.updateEnrollment(
			section.id,
			e.student_email,
			newEmail.trim().toLowerCase() || null,
			newName.trim() || null
		);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		if (res.data.ok === false) {
			msg = {
				ok: false,
				text:
					res.data.reason === 'already_enrolled'
						? `${newEmail.trim().toLowerCase()} is already on this roster.`
						: 'That correction was refused.'
			};
			return;
		}
		editEmail = null;
		msg = { ok: true, text: 'Enrollment updated.' };
		await onchanged?.();
	}

	async function toggleEnrollment(e: ClassroomEnrollment) {
		if (busy) return;
		busy = true;
		const res = await transports.setEnrollment(section.id, e.student_email, null, !e.active);
		busy = false;
		if (!res.ok) msg = { ok: false, text: res.message };
		await onchanged?.();
	}

	// --- Notebook compliance (a summary; the console is one click away) ----
	let notebook = $state<GridSummary | null>(null);
	let notebookError = $state<string | null>(null);
	let notebookLoading = $state(false);

	/**
	 * A failure is reported IN PLACE rather than through `msg`: the notebook is a
	 * neighbouring feature and its absence must never read as a problem with the
	 * roster above it.
	 */
	$effect(() => {
		// TRACKED, deliberately: the transport's presence and which class this is
		// are exactly what should re-run this.
		const load = loadNotebookGrid;
		const sectionId = section.id;
		if (!load) return;
		let alive = true;
		notebookLoading = true;
		// null = every unit, which is what "how is this class doing" means. The
		// CALL is UNTRACKED, and that is the load-bearing half: `load` is
		// INJECTED, so whatever it touches before its first `await` would
		// otherwise join this effect's dependencies. See the injected-callback
		// rule in CLAUDE.md.
		void untrack(() => load(sectionId, null)).then((res) => {
			if (!alive) return;
			notebookLoading = false;
			if (res.ok) {
				notebook = gridSummary(res.value);
				notebookError = null;
			} else {
				notebook = null;
				notebookError = res.error;
			}
		});
		return () => {
			alive = false;
		};
	});

	// --- CSV import, scoped to THIS class ---------------------------------
	let csvText = $state('');
	let importBusy = $state(false);
	let importResult = $state<ImportSummary | null>(null);

	/**
	 * The class comes from the page you are standing on, so the file only has to
	 * say WHO. It maps onto the same RosterRow the same classroom_import_roster
	 * RPC has always taken -- no new write path, and a row naming a class the
	 * caller does not teach is still refused server-side.
	 */
	const parsed = $derived(
		csvText.trim()
			? parseSectionRosterCsv(csvText, section.course?.code ?? '', section.label)
			: null
	);

	/**
	 * WHAT THIS IMPORT ACCEPTS, WRITTEN ONCE.
	 *
	 * The same string is the `<input accept>` and the drop rule, so the picker
	 * and the drop cannot come to disagree about what a roster file is -- which
	 * is the whole reason `matchesAccept` takes the attribute's own spelling
	 * rather than a predicate typed out twice.
	 */
	const ROSTER_ACCEPT = '.csv,text/csv';
	/** Said out loud when a drop was refused, so nothing appears to do nothing. */
	let dropNote = $state<string | null>(null);
	let dropActive = $state(false);

	/**
	 * ONE FILE, READ AS TEXT INTO THE BOX BESIDE IT, whichever way it arrived.
	 * The picker and the drop both land here, so the checked count, the error
	 * list and the Import button behave identically for a dragged file and a
	 * chosen one -- and the text stays editable, which is the point of the
	 * textarea being the thing that gets filled rather than a hidden buffer.
	 */
	async function takeCsv(file: File) {
		csvText = await file.text();
		importResult = null;
		dropNote = null;
	}

	async function readCsvFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		await takeCsv(file);
		input.value = '';
	}

	/**
	 * A DROP OF A ROSTER FILE. First file only: this panel has one box and a
	 * second file would silently replace the first.
	 *
	 * THERE IS NO PASTE PATH HERE AND THAT IS THE POINT, not an omission.
	 * `filesFromClipboard` extracts `image/*` clipboard items only, and an
	 * image is not a roster -- so `accept` refuses every file a paste on this
	 * surface could ever produce, and `createDropController` therefore never
	 * calls `claimPaste` for one. That matters because this panel renders
	 * inside surfaces that DO want a pasted screenshot: claiming an event and
	 * then refusing it is how a screenshot on its way to an upload panel gets
	 * silently eaten. Pasting roster TEXT into the textarea below is untouched
	 * and is the ordinary way to use this box.
	 */
	function droppedCsv(files: File[]) {
		if (files.length > 0) void takeCsv(files[0]);
		if (files.length > 1) {
			dropNote = `Read ${files[0].name}. Drop one file at a time; the others were ignored.`;
		}
	}

	function refusedCsv(files: File[]) {
		const names = files.map((f) => f.name).filter(Boolean);
		dropNote =
			names.length === 1
				? `${names[0]} is not a CSV. Drop a .csv file, or paste the list into the box below.`
				: `Those ${files.length} files are not CSVs. Drop a .csv file, or paste the list into the box below.`;
	}

	async function runImport() {
		if (!parsed || parsed.rows.length === 0 || importBusy) return;
		importBusy = true;
		importResult = null;
		const res = await transports.importRoster(parsed.rows);
		importBusy = false;
		if (res.ok) {
			importResult = res.data;
			await onchanged?.();
		} else {
			importResult = {
				total: 0,
				succeeded: 0,
				refused: 0,
				results: [{ row: 0, email: '', ok: false, reason: 'error', message: res.message }]
			};
		}
	}
</script>

{#snippet rosterRow(e: ClassroomEnrollment)}
	{@const status = rosterStatus(e)}
	<div class="roster-row" class:inactive={!e.active} data-testid="roster-row">
		<!-- THE FACE SITS BESIDE THE NAME AND IS DISCLOSED TO EXACTLY THE SAME
		     AUDIENCE. This panel is reachable only by the teacher of record or
		     an admin: the route 404s a student (people/+page.server.ts) and
		     `classroom_section_roster` gates every row on
		     `classroom_manages_section` inside its own definer, so the reader
		     is already looking at this student's name AND address. 0179 adds
		     `avatar`/`avatar_url` to that same read and widens nothing else.
		     Before 0179 is applied the columns are absent and every row is an
		     initials tile, which is also what most rows are afterwards. -->
		<Avatar subject={rosterSubject(e)} tintKey={e.student_email} size={28} />
		<span class="roster-name person-name" title={e.display_name || e.student_email.split('@')[0]}>{e.display_name || e.student_email.split('@')[0]}</span>
		<span class="roster-email">{e.student_email}</span>
		<span class="roster-status" data-tone={status.tone} data-testid="roster-status">
			{status.label}
		</span>
		<span class="roster-actions">
			<!-- `.on` while this row's correction form is open (report R15), so
			     the Close that puts it away reads as the way back. -->
			<button
				type="button"
				class="btn secondary tiny"
				class:on={editEmail === e.student_email}
				aria-expanded={editEmail === e.student_email}
				disabled={busy}
				onclick={() => startEdit(e)}
			>
				{editEmail === e.student_email ? 'Close' : 'Edit'}
			</button>
			<button
				type="button"
				class="btn secondary tiny"
				disabled={busy}
				data-testid="roster-toggle"
				onclick={() => toggleEnrollment(e)}
			>
				{e.active ? 'Deactivate' : 'Reactivate'}
			</button>
			{#if canRemove}
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy}
					data-testid="roster-remove"
					onclick={() => armRemoval(e)}
				>
					{armedRemoval === e.student_email ? 'Keep' : 'Remove'}
				</button>
			{/if}
		</span>
	</div>
	{#if armedRemoval === e.student_email}
		<div class="roster-confirm" data-testid="roster-remove-confirm">
			<p class="note">
				Delete this enrollment outright? {e.student_email} comes off this class list for good, and
				this cannot be undone. It only goes through if no saved answers, hand-ins, module approvals
				or notebook entries are attached to it. To take somebody off the live roster and keep
				everything, use Deactivate.
			</p>
			<span class="roster-confirm-actions">
				<button
					type="button"
					class="btn tiny danger tap-44"
					disabled={busy}
					data-testid="roster-remove-confirm-go"
					onclick={() => confirmRemoval(e)}
				>
					Remove permanently
				</button>
				<button
					type="button"
					class="btn secondary tiny tap-44"
					disabled={busy}
					onclick={() => (armedRemoval = null)}
				>
					Cancel
				</button>
			</span>
		</div>
	{/if}
	{#if removalRefusal?.email === e.student_email}
		<div class="roster-refusal" data-testid="roster-remove-refusal">
			<p class="note">{removalRefusal.text}</p>
			{#if e.active}
				<button
					type="button"
					class="btn secondary tiny tap-44"
					disabled={busy}
					data-testid="roster-refusal-deactivate"
					onclick={() => toggleEnrollment(e)}
				>
					Deactivate instead
				</button>
			{/if}
		</div>
	{/if}
	{#if editEmail === e.student_email}
		<form
			class="inline-form"
			onsubmit={(ev) => {
				ev.preventDefault();
				saveEnrollment(e);
			}}
		>
			<label>
				<span>Email (fix a typo)</span>
				<input type="email" bind:value={newEmail} required />
			</label>
			<label>
				<span>Display name</span>
				<input type="text" bind:value={newName} />
			</label>
			<button class="btn tiny" type="submit" disabled={busy}>Save correction</button>
		</form>
	{/if}
{/snippet}

<svelte:head>
	<title>People &middot; {sectionTitle(section)} // IDEA Classroom</title>
</svelte:head>

<main class="classroom-page cr-instructor-surface">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA // Classroom'}</div>
		<h1>People</h1>
		<p class="section-line">
			{formatSectionLabel(section.label, section.block)}
			&nbsp;&middot; {activeSplit.students.length} enrolled
			{#if activeSplit.managers.length}&nbsp;&middot; {activeSplit.managers.length}
				{activeSplit.managers.length === 1 ? 'manages' : 'manage'} this class{/if}
			{#if inactive.length}&nbsp;&middot; {inactive.length} inactive{/if}
			{#if section.active === false}&nbsp;&middot; <span class="draft-chip">Archived</span>{/if}
		</p>
	</section>

	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
	{/if}

	<!--
		THE ROSTER BESIDE ITS TOOLS (ledger 0297). People was one 60rem column: the
		roster first, then the class tools, then compliance and settings, so on a
		41-student class the random picker and the team draw sat at y=3962. From
		1100px the page is two columns, the roster on the left and everything that
		acts on it on the right, at the top; below that it is one column with the
		class tools FIRST (`order`), because a teacher opening People in front of a
		class is there to draw a name, not to scroll past forty of them.
	-->
	<div class="people-grid">
	<div class="people-roster">
	<section class="card">
		<h2>Roster</h2>
		{#if roster.length === 0}
			<p class="note empty-state">No students enrolled yet. Add one below or import a list.</p>
		{:else}
			<div class="roster-rows">
				{#each active as e (e.student_email)}{@render rosterRow(e)}{/each}
			</div>
			{#if inactive.length}
				<h3>Inactive</h3>
				<p class="note">
					Removed from the class, never deleted -- their work and their record stay exactly as they
					were, and reactivating puts them back.
				</p>
				<div class="roster-rows">
					{#each inactive as e (e.student_email)}{@render rosterRow(e)}{/each}
				</div>
			{/if}
		{/if}

		<form
			class="add-row"
			onsubmit={(e) => {
				e.preventDefault();
				addStudent();
			}}
		>
			<input type="email" placeholder="student@boscotech.net" bind:value={addEmail} required />
			<input type="text" placeholder="Display name" bind:value={addName} />
			<button class="btn tiny" type="submit" disabled={busy} data-testid="roster-add">Add</button>
		</form>

		<details
			class="csv-import"
			class:csv-dragging={dropActive}
			use:dropTarget={{
				onfiles: droppedCsv,
				onrejected: refusedCsv,
				onactive: (active) => (dropActive = active),
				accept: (f) => matchesAccept(f, ROSTER_ACCEPT)
			}}
		>
			<summary>Import a list</summary>
			<p class="note">
				One student per line: <code>email, name</code>. A header row is fine, and extra columns are
				ignored. Everyone lands in <strong>this class</strong> &mdash; re-running the same file
				never duplicates anyone.
			</p>
			<input type="file" accept={ROSTER_ACCEPT} onchange={readCsvFile} />
			{#if dropNote}
				<p class="feedback error" data-testid="roster-drop-note">{dropNote}</p>
			{/if}
			<textarea
				rows="4"
				placeholder={'alice@boscotech.net,Alice Alvarez'}
				bind:value={csvText}
				data-testid="csv-text"
			></textarea>
			{#if parsed}
				<p class="note">{parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} ready.</p>
				{#each parsed.errors as err (err)}
					<p class="feedback error">{err}</p>
				{/each}
			{/if}
			<button
				class="btn tiny"
				type="button"
				disabled={importBusy || !parsed || parsed.rows.length === 0}
				data-testid="csv-import"
				onclick={runImport}
			>
				Import {parsed?.rows.length ?? 0} rows
			</button>
			{#if importResult}
				<p
					class="feedback"
					class:ok={importResult.refused === 0}
					class:error={importResult.refused > 0}
				>
					{importResult.succeeded} imported, {importResult.refused} refused.
				</p>
				{#each importResult.results.filter((r) => !r.ok) as r (r.row)}
					<p class="feedback error">
						Row {r.row} ({r.email}): {r.message ?? importReasonLabel(r.reason)}
					</p>
				{/each}
			{/if}
		</details>
	</section>

	</div>
	<div class="people-side">
	<!--
		CLASS TOOLS. Placed BELOW the roster and ABOVE notebook compliance: the
		roster is what the page is for and keeps the top, and all three of these
		act on the list directly above them, so nothing has to be scrolled back
		to. One row of controls, one panel open at a time.
	-->
	<section class="card" data-testid="class-tools">
		<h2>Class tools</h2>
		<div class="tools-row">
			<button
				type="button"
				class="btn secondary tiny tap-44"
				data-testid="tool-export"
				onclick={downloadCsv}
			>
				Export roster (CSV)
			</button>
			<button
				type="button"
				class="btn secondary tiny tap-44"
				data-testid="tool-email"
				class:on={tool === 'email'}
				aria-expanded={tool === 'email'}
				aria-controls="tool-panel-email"
				onclick={() => toggleTool('email')}
			>
				Email the class
			</button>
			<button
				type="button"
				class="btn secondary tiny tap-44"
				data-testid="tool-picker"
				class:on={tool === 'picker'}
				aria-expanded={tool === 'picker'}
				aria-controls="tool-panel-picker"
				onclick={() => toggleTool('picker')}
			>
				Random picker
			</button>
			{#if teamTransports}
				<button
					type="button"
					class="btn tiny tap-44"
					data-testid="tool-teams"
					class:on={tool === 'teams'}
					aria-expanded={tool === 'teams'}
					aria-controls="tool-panel-teams"
					onclick={() => toggleTool('teams')}
				>
					Saved teams
				</button>
			{/if}
		</div>

		{#if tool === 'email'}
			<div class="tool-panel" id="tool-panel-email" data-testid="email-panel">
				<!--
					A DRAFT, NOT A SEND. Nothing in this app can send mail, and a
					control that looked like it could would be the worst of the
					three possible answers. This hands the addresses to whatever
					mail client the machine already has, BCC, with the teacher as
					the only visible recipient.
				-->
				<p class="note">
					This opens your own mail app with the class in BCC. Nothing is sent from here, and
					nobody sees anybody else's address.
				</p>
				<label class="tool-field">
					<span>Subject (optional)</span>
					<input type="text" bind:value={mailSubject} data-testid="email-subject" />
				</label>
				<p class="note" data-testid="email-plan">{mailtoPlanNote(mailPlan)}</p>
				{#if mailPlan.drafts.length > 0}
					<div class="tools-row">
						{#each mailPlan.drafts as draft, i (draft.href)}
							<!--
								ONE LINK PER DRAFT, EACH SAYING WHO IS ON IT. A single
								control that opened several windows would be
								indistinguishable from one that opened one and dropped
								the rest, which is exactly the failure this ceiling
								exists to avoid.
							-->
							<a
								class="btn tiny tap-44"
								href={draft.href}
								data-testid="email-draft"
								data-index={i}
							>
								{mailPlan.drafts.length === 1
									? `Open draft (${draft.recipients.length})`
									: `Draft ${i + 1} of ${mailPlan.drafts.length} (${draft.recipients.length})`}
							</a>
						{/each}
					</div>
				{/if}
				{#if recipients.length > 0}
					<button
						type="button"
						class="btn secondary tiny tap-44"
						data-testid="email-copy"
						onclick={copyAddresses}
					>
						{copiedList ? 'Copied' : 'Copy all addresses'}
					</button>
					<!--
						SELECTABLE TEXT BESIDE THE COPY CONTROL, so a refused
						clipboard costs nothing and a webmail tab has somewhere to
						paste from.
					-->
					<p class="tool-addresses" data-testid="email-addresses">{classEmailList(recipients)}</p>
				{/if}
			</div>
		{/if}

		{#if tool === 'picker'}
			<div class="tool-panel" id="tool-panel-picker" data-testid="picker-panel">
				<p class="note">
					Teams, an order, or one student, drawn at random from whoever is here. The seed is shown
					so the same draw can be shown again, and so a student can check it.
				</p>
				<div class="tools-row">
					<!--
						TWO WAYS TO ASK FOR THE SAME DRAW, and the radio pair is what
						makes the second one reachable. A teacher with seven benches
						wants seven teams; before this the only control was Team size,
						so they had to solve ceil(n / size) = 7 in their head.
					-->
					<fieldset class="team-mode">
						<legend>How to divide the class</legend>
						<label class="team-mode-opt tap-44">
							<input
								type="radio"
								name="team-mode"
								value="size"
								checked={teamMode === 'size'}
								data-testid="picker-mode-size"
								onchange={() => (teamMode = 'size')}
							/>
							<span>Team size</span>
						</label>
						<label class="team-mode-opt tap-44">
							<input
								type="radio"
								name="team-mode"
								value="count"
								checked={teamMode === 'count'}
								data-testid="picker-mode-count"
								onchange={() => (teamMode = 'count')}
							/>
							<span>Number of teams</span>
						</label>
					</fieldset>
					{#if teamMode === 'size'}
						<label class="tool-field narrow">
							<span>Students per team</span>
							<input
								type="number"
								min="1"
								max="20"
								bind:value={teamSize}
								data-testid="picker-team-size"
							/>
						</label>
					{:else}
						<label class="tool-field narrow">
							<span>How many teams</span>
							<input
								type="number"
								min="1"
								max="20"
								bind:value={teamCount}
								data-testid="picker-team-count"
							/>
						</label>
					{/if}
					<button type="button" class="btn tiny tap-44" data-testid="picker-draw" onclick={draw}>
						{drawn ? 'Draw again' : 'Draw'}
					</button>
				</div>
				{#if teamMode === 'count' && pool.included.length > 0 && teamCount > pool.included.length}
					<!--
						SAID BEFORE THE DRAW, not discovered after it. Asking for more
						teams than there are students is clamped rather than padded with
						empty cards, and a clamp nobody was told about reads as the
						control being ignored.
					-->
					<p class="note" data-testid="picker-count-clamped">
						There are only {pool.included.length} students in the draw, so you will get
						{pool.included.length} teams of one rather than {teamCount}.
					</p>
				{/if}

				{#if candidates.length === 0}
					<p class="note empty-state">Nobody on the live roster to draw from yet.</p>
				{:else}
					<fieldset class="tool-absent">
						<legend>Here today</legend>
						<p class="note">Untick anybody who is absent. They stay off every draw below.</p>
						<div class="absent-grid">
							{#each candidates as person (person.email)}
								<label class="absent-item tap-44">
									<input
										type="checkbox"
										checked={!absent.has(person.email)}
										data-testid="picker-present"
										onchange={() => toggleAbsent(person.email)}
									/>
									<span class="person-name" title={person.name}>{person.name}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}

				{#if drawn}
					<p class="note" data-testid="picker-note">{drawNote}</p>
					{#if chosen}
						<p class="picker-one" data-testid="picker-one">
							<span class="picker-label">One student</span>
							{chosen.name}
						</p>
					{/if}
					{#if order.length > 0}
						<div data-testid="picker-order">
							<h3>Order</h3>
							<ol class="picker-order">
								{#each order as person (person.email)}
									<li>{person.name}</li>
								{/each}
							</ol>
						</div>
					{/if}
					{#if teams.length > 0}
						<div data-testid="picker-teams">
							<h3>Teams</h3>
							{#if teamTransports?.save}
								<!--
									SAVING IS A SEPARATE, DELIBERATE PRESS and never a side
									effect of drawing. A draw a teacher is still re-rolling in
									front of the class must not be writing rows on every press
									of Draw again, and a surface that said "saved" for
									something ephemeral is the failure this whole area exists
									to fix.
								-->
								<div class="tools-row team-save">
									<label class="tool-field">
										<span>Call this draw</span>
										<input
											type="text"
											maxlength="120"
											placeholder="Build teams"
											bind:value={teamLabelDraft}
											data-testid="teams-save-label"
										/>
									</label>
									<button
										type="button"
										class="btn tiny tap-44"
										data-testid="teams-save"
										disabled={teamsBusy}
										onclick={saveTeams}
									>
										{teamsBusy ? 'Saving' : 'Save these teams'}
									</button>
								</div>
								<p class="note">
									Saving keeps these teams after a reload and lets you export them or post
									them to the class. Drawing again does not save anything on its own.
								</p>
							{/if}
							<div class="picker-teams">
								{#each teams as team, i (i)}
									<div class="picker-team">
										<h4>Team {i + 1}</h4>
										<ul>
											{#each team as person (person.email)}
												<li>{person.name}</li>
											{/each}
										</ul>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		{#if tool === 'teams' && teamTransports}
			<div class="tool-panel" id="tool-panel-teams" data-testid="teams-panel">
				{#if teamsLoading}
					<Pending label="Loading saved teams" />
				{:else if teamsReady === false}
					<!--
						NOT AN ERROR. Migrations here are applied one file at a time by
						hand, so a deployment sitting between two of them is a real
						state and this says which capability is missing rather than
						blanking the page.
					-->
					<p class="note empty-state" data-testid="teams-unavailable">
						Saved teams are not available on this deployment yet. The random picker
						above still works; teams drawn with it cannot be kept or posted until
						this class's database has been updated.
					</p>
				{:else if teamsError}
					<p class="note" data-testid="teams-error">{teamsError}</p>
				{:else if savedSets.length === 0}
					<p class="note empty-state" data-testid="teams-empty">
						No saved teams yet. Draw some with the random picker and press Save these
						teams.
					</p>
				{:else}
					{#each savedSets as set (set.id)}
						{@const state = teamWindowState(set, nowMs)}
						{@const drift = teamDriftNote(set)}
						<article class="team-set" data-testid="team-set">
							<header class="team-set-head">
								<h3>{set.label}</h3>
								<!--
									The window state carries a WORD as well as a tone: colour
									is never the only signal on this site.
								-->
								<span class="team-state" data-state={state} data-testid="team-set-state">
									{TEAM_WINDOW_WORDS[state]}
								</span>
							</header>
							<p class="note team-seed">
								{set.teams.length} team{set.teams.length === 1 ? '' : 's'}, drawn by
								{set.mode === 'count' ? 'number of teams' : 'team size'} ({set.mode_value}),
								seed {set.seed}. The same seed over the same names always gives this same
								result.
							</p>

							{#if teamSetEditedWords(set)}
								<!--
									DECISION 44: A HAND EDIT IS MARKED, NOT HIDDEN. The seed line
									above stays exactly as it was; this says the seed no longer
									gives back these teams, with the reason one tap away.
								-->
								<p class="note team-edited" data-testid="team-edited">
									<InfoTip tip={TEAM_EDITED_NOTE}>{teamSetEditedWords(set)}</InfoTip>
								</p>
							{/if}

							{#if drift}
								<p class="note team-drift" data-testid="team-drift">{drift}</p>
							{/if}

							{#if teamsManages && typeof teamTransports.move === 'function' && !moveReady}
								<!--
									ABSENCE IS THE MECHANISM: the database has no move yet, so
									there is no grip and no Move to anywhere below, and this
									sentence says why instead of a control that can only refuse.
								-->
								<p class="note" data-testid="team-move-unavailable">
									Moving students between teams will work once this site's database
									update is applied.
								</p>
							{:else if canMove}
								<p class="note team-move-hint" data-testid="team-move-hint">
									Drag a student onto another team, or use Move to.
								</p>
							{/if}

							{#if teamEditRefusal?.setId === set.id}
								<p class="note team-refusal" role="alert" data-testid="team-edit-refusal">
									{teamEditRefusal.text}
								</p>
							{/if}
							<!-- ALWAYS MOUNTED, ONLY ITS TEXT MOVES: a live region a screen
							     reader was not already observing is often not announced. -->
							<p class="note team-edit-note" role="status" data-testid="team-edit-note">
								{teamEditNote?.setId === set.id ? teamEditNote.text : ''}
							</p>

							<div class="team-cards">
								{#each set.teams as team (team.id)}
									{@const members = team.members.map((m) => ({
										email: m.student_email,
										name: m.display_name
									}))}
									<div
										class="team-card"
										class:has-style={hasStyle(teamStyle(team))}
										style={teamCardStyle(team)}
										data-testid="team-card"
										data-team-zone={set.id}
										data-team-id={team.id}
									>
										<div class="team-card-head">
											<h4>{teamLabel(team)}</h4>
											{#if canRename}
												<button
													type="button"
													class="btn tiny tap-44 team-rename-toggle"
													class:on={renamingTeam === team.id}
													aria-expanded={renamingTeam === team.id}
													aria-controls="team-rename-{team.id}"
													data-testid="team-rename"
													onclick={() => toggleRename(team)}
												>
													{renamingTeam === team.id ? 'Close' : 'Rename'}
												</button>
											{/if}
										</div>
										{#if canRename && renamingTeam === team.id}
											<form
												class="team-rename-form"
												id="team-rename-{team.id}"
												data-testid="team-rename-form"
												onsubmit={(e) => {
													e.preventDefault();
													void saveRename(set, team);
												}}
											>
												<label class="tool-field">
													<span>Name for Team {team.team_number}</span>
													<input
														type="text"
														maxlength="40"
														placeholder="Team {team.team_number}"
														bind:value={renameDraft}
														data-testid="team-rename-input"
													/>
												</label>
												<button
													type="submit"
													class="btn tiny tap-44"
													disabled={teamsBusy}
													data-testid="team-rename-save"
												>
													Save name
												</button>
											</form>
										{/if}
										{#if team.tagline}
											<p class="team-tagline">{team.tagline}</p>
										{/if}
										<ul class="team-members" use:sortDrag={memberDrag(set, members)}>
											{#each team.members as member (member.student_email)}
												<li
													class="team-member"
													class:left-class={!member.still_enrolled}
													data-team-member
													data-testid="team-member"
												>
													{#if canMove}
														<button
															type="button"
															class="team-grip"
															data-sort-handle
															data-testid="team-grip"
															aria-disabled={teamsBusy}
															aria-label="Drag {member.display_name} to another team"
														>
															<span class="team-grip-glyph" aria-hidden="true">&#10495;</span>
															<span class="team-grip-word">Drag</span>
														</button>
													{/if}
													<span class="team-member-name person-name" title={member.display_name}
														>{member.display_name}</span
													>
													{#if !member.still_enrolled}
														<!--
															A WORD, not a colour and not a strikethrough
															alone. This student is still on the team that
															was drawn; what changed is the roster.
														-->
														<span class="team-left" data-testid="team-member-left">
															no longer on the roster
														</span>
													{/if}
													{#if canMove && set.teams.length > 1}
														{@render moveMenu(
															set,
															member.student_email,
															member.display_name,
															set.teams.filter((t) => t.id !== team.id),
															'Move to',
															'team-move'
														)}
													{/if}
												</li>
											{/each}
										</ul>
										{#if team.style_updated_by}
											<p class="team-by" data-testid="team-style-by">
												Decorated by {team.style_updated_by}
											</p>
										{/if}
										{#if canStyleTeam(team, teamsManages) && teamTransports.style}
											<p class="note team-style-hint">
												You can change this team's name and colours.
											</p>
										{/if}
									</div>
								{/each}
								{#if canMove && unteamed(set).length > 0}
									{@const waiting = unteamed(set).map((e) => ({
										email: e.student_email,
										name: e.display_name || e.student_email.split('@')[0]
									}))}
									<!--
										NOT A DROP ZONE: the move RPC files a student onto a team and
										has no "take off every team". Students land here by being on
										the roster and on no team of this draw, and leave by the same
										drag or Add to.
									-->
									<div class="team-card team-unteamed" data-testid="team-unteamed">
										<h4>Not on a team yet</h4>
										<ul class="team-members" use:sortDrag={memberDrag(set, waiting)}>
											{#each waiting as person (person.email)}
												<li class="team-member" data-team-member data-testid="team-unteamed-member">
													<button
														type="button"
														class="team-grip"
														data-sort-handle
														data-testid="team-grip"
														aria-disabled={teamsBusy}
														aria-label="Drag {person.name} onto a team"
													>
														<span class="team-grip-glyph" aria-hidden="true">&#10495;</span>
														<span class="team-grip-word">Drag</span>
													</button>
													<span class="team-member-name person-name" title={person.name}
														>{person.name}</span
													>
													{@render moveMenu(set, person.email, person.name, set.teams, 'Add to', 'team-add')}
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>

							<div class="tools-row team-actions">
								<button
									type="button"
									class="btn tiny tap-44"
									data-testid="team-export"
									onclick={() => downloadTeamsCsv(set)}
								>
									Export CSV
								</button>

								{#if state === 'showing' || state === 'scheduled'}
									<button
										type="button"
										class="btn tiny tap-44"
										data-testid="team-unpost"
										disabled={teamsBusy}
										onclick={() =>
											runTeamAction(
												() => teamTransports.unpost!(set.id),
												'Taken down. The class can no longer see these teams.'
											)}
									>
										Take down
									</button>
								{:else}
									<label class="tool-field narrow">
										<span>Post for</span>
										<!--
											THE VALUE IS A STRING, NOT `null`. A select matches its
											options by VALUE, and the "no end" option's value is the
											empty string -- so binding `null` here matched nothing,
											left no option selected, and rendered an EMPTY control
											with no text in it. Measured in Chromium at 375 and 1440
											before the fix: a blank box where a choice should be.
										-->
										<select
											data-testid="team-post-days"
											value={postDays[set.id] == null ? '' : String(postDays[set.id])}
											onchange={(e) => {
												const v = (e.currentTarget as HTMLSelectElement).value;
												postDays = { ...postDays, [set.id]: v === '' ? null : Number(v) };
											}}
										>
											<option value="">until I take it down</option>
											<option value="1">today</option>
											<option value="5">5 days</option>
											<option value="14">2 weeks</option>
										</select>
									</label>
									<button
										type="button"
										class="btn tiny tap-44"
										data-testid="team-post"
										disabled={teamsBusy}
										onclick={() =>
											runTeamAction(
												() =>
													teamTransports.post!(
														set.id,
														teamWindowEnd(Date.now(), postDays[set.id] ?? null)
													),
												'Posted. The whole class can see these teams.'
											)}
									>
										Post to the class
									</button>
								{/if}

								{#if armedRetire === set.id}
									<!--
										A DESTRUCTIVE-LOOKING ACTION NAMES WHAT IT COSTS, and this
										one costs less than it looks: retiring keeps every row and
										only takes the draw off every surface.
									-->
									<span class="note team-retire-note" data-testid="team-retire-note">
										Retire "{set.label}"? It comes off this page and off the class's
										view. The record of who was on which team is kept.
									</span>
									<button
										type="button"
										class="btn tiny danger tap-44"
										data-testid="team-retire-confirm"
										disabled={teamsBusy}
										onclick={() =>
											runTeamAction(() => teamTransports.archive!(set.id), 'Teams retired.')}
									>
										Retire
									</button>
									<button
										type="button"
										class="btn tiny tap-44"
										data-testid="team-retire-cancel"
										onclick={() => (armedRetire = null)}
									>
										Keep
									</button>
								{:else}
									<button
										type="button"
										class="btn tiny tap-44"
										data-testid="team-retire"
										onclick={() => (armedRetire = set.id)}
									>
										Retire
									</button>
								{/if}
							</div>
						</article>
					{/each}
				{/if}
			</div>
		{/if}
	</section>

	{#if loadNotebookGrid}
		<section class="card">
			<h2>Notebook compliance</h2>
			{#if notebookLoading}
				<Pending label="Loading notebook compliance" />
			{:else if notebookError}
				<p class="note" data-testid="nb-compliance-error">{notebookError}</p>
			{:else if notebook}
				{#if notebook.sessions === 0}
					<p class="note empty-state" data-testid="nb-compliance-empty">
						No notebook check-ins are scheduled for this class yet.
						<a href={`${classNotebookHref(section.id)}?mode=checkins`}>Add one on the Notebook tab</a>.
					</p>
				{:else}
					<p class="nb-line" data-testid="nb-compliance-line">
						{notebook.students}
						{notebook.students === 1 ? 'student' : 'students'} &middot;
						{notebook.sessions}
						{notebook.sessions === 1 ? 'check-in' : 'check-ins'} &middot;
						<strong>{notebook.outstanding}</strong> outstanding
					</p>
					<!-- Glyph AND label on every tally, and both come from CELL_STATES --
					     the same registry the grid's own cells and legend read, so the two
					     can never diverge on what a state is called or looks like. -->
					<div class="nb-tallies">
						{#each CELL_STATES as state (state.key)}
							<!-- What a state MEANS is an InfoTip, not a `title` a phone cannot
							     hover (ledger 0297, LEARN). -->
							<span class="nb-tally nb-{state.key}" data-testid="nb-tally-{state.key}">
								<InfoTip tip={state.hint}
									><span class="nb-glyph" aria-hidden="true">{state.glyph}</span>
									{state.label}</InfoTip
								>
								<strong>{notebook.counts[state.key]}</strong>
							</span>
						{/each}
					</div>
					{#if notebook.attention.length}
						<details class="nb-attention">
							<summary>
								{notebook.attention.length}
								{notebook.attention.length === 1 ? 'student needs' : 'students need'} a look
							</summary>
							{#each notebook.attention as row (row.student.student_key)}
								<p class="nb-student" data-testid="nb-attention-row">
									<span class="nb-student-name person-name" title={row.student.name}>{row.student.name}</span>
									<span class="nb-student-meta">
										{completionLabel(row)}
										{#if row.flagged}&nbsp;&middot; {row.flagged} flagged{/if}
										{#if row.excused}&nbsp;&middot; {row.excused} excused{/if}
										{#if !row.student.enrolled}&nbsp;&middot; left{/if}
									</span>
								</p>
							{/each}
						</details>
					{:else}
						<p class="note" data-testid="nb-all-clear">Everyone is up to date on every check-in.</p>
					{/if}
					<p class="note">
						<a href={classNotebookHref(section.id)}>Notebook review and Documentation Check</a>
					</p>
				{/if}
			{/if}
		</section>
	{/if}

	<!-- THE CLASS'S OWN SETTINGS MOVED TO ITS SETTINGS TAB (report R06,
	     2026-09-28), and this line says so where the card used to be, because
	     a teacher who learned to scroll here for Archive should find the way
	     rather than a missing card. -->
	<p class="note settings-moved" data-testid="people-settings-moved">
		Class details, Archive class and Delete class are on this class's
		<a href={classSettingsHref(section.id)}>Settings tab</a>.
	</p>
	</div>
	</div>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>


{#snippet moveMenu(
	set: TeamSet,
	email: string,
	name: string,
	targets: Team[],
	word: string,
	testId: string
)}
	{@const key = moveKey(set, email)}
	{@const open = movingMember === key}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<span class="team-move-wrap" onkeydown={(e) => closeMoveOnEscape(e, set, email)}>
		<button
			type="button"
			class="btn tiny tap-44 team-move"
			class:on={open}
			aria-expanded={open}
			aria-controls={moveListId(key)}
			aria-label="{word} another team: {name}"
			aria-disabled={teamsBusy}
			data-testid={testId}
			data-move-trigger={key}
			onclick={() => toggleMove(key)}
		>
			{word}
		</button>
		{#if open}
			<span
				class="team-move-list"
				id={moveListId(key)}
				role="group"
				aria-label="{word}: {name}"
				data-testid="team-move-list"
			>
				{#each targets as other (other.id)}
					<button
						type="button"
						class="btn tiny tap-44 team-move-to"
						aria-disabled={teamsBusy}
						data-testid="team-move-to"
						data-team-target={other.id}
						onclick={() => void chooseMove(set, email, name, other.id)}
					>
						{teamLabel(other)}
					</button>
				{/each}
			</span>
		{/if}
	</span>
{/snippet}

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	/* The cards now sit inside the roster and side columns (ledger 0297). */
	.people-roster > .card,
	.people-side > .card {
		margin-bottom: 1.1rem;
	}
	.classroom-page h2 {
		margin-top: 0;
	}
	.classroom-page h3 {
		margin: 1rem 0 0.4rem;
		font-size: 0.85rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.section-line {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.feedback {
		margin: 0 0 0.8rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.empty-state {
		padding: 0.4rem 0;
	}
	.settings-moved {
		margin: 0 0 1.1rem;
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}

	/* Notebook compliance -- a summary, deliberately not the grid. The state
	   colours are the platform tokens the grid's own cells use, so the two
	   read the same; the layout is a chip row rather than a table because a
	   52rem panel is not where a wide scrolling grid belongs. */
	.nb-line {
		color: var(--text-2);
		font-size: 0.85rem;
		margin: 0 0 var(--space-2);
	}
	.nb-line strong {
		color: var(--text-1);
	}
	.nb-tallies {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.6rem;
	}
	.nb-tally {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.15rem 0.55rem;
		color: var(--text-2);
	}
	.nb-tally strong {
		color: var(--text-1);
	}
	.nb-glyph {
		font-size: 0.8rem;
	}
	.nb-on_time .nb-glyph {
		color: var(--green);
	}
	.nb-late .nb-glyph {
		color: var(--amber);
	}
	.nb-pending_review .nb-glyph {
		color: var(--cyan);
	}
	.nb-flagged .nb-glyph {
		color: var(--crimson);
	}
	/* EXCUSED IS A STATUS, NOT DECORATION. At --text-3 the glyph measured
	   3.13:1 on the card -- the one mark in the cell, below the bar. --ice is
	   both the semantic token for "disabled / not-yet-started" AND what the
	   notebook's own review grid gives excused on its dark plates, so the two
	   spellings of this hue now agree: 9.31:1. */
	.nb-excused .nb-glyph {
		color: var(--ice);
	}
	/* --dim is the notebook review grid's own "sage" ink for missing
	   (--nb-cell-missing resolves to it), so this is the same status colour
	   rather than a fresh one. */
	.nb-missing .nb-glyph {
		color: var(--dim);
	}
	.nb-attention {
		margin-bottom: 0.6rem;
	}
	.nb-attention summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--amber);
	}
	.nb-student {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: baseline;
		margin: 0.3rem 0 0;
		padding-left: 0.6rem;
	}
	.nb-student-name {
		font-size: 0.85rem;
	}
	.nb-student-meta {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}

	/* Forms + roster: moved here verbatim from the retired manage console, whose
	   roster panel this replaces. */
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	label > span {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	input,
	textarea {
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		outline: 1px solid var(--focus-ring);
	}
	.inline-form {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 0.7rem;
		margin: 0.3rem 0 0.6rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.inline-form .btn {
		align-self: flex-start;
	}
	.roster-rows {
		display: flex;
		flex-direction: column;
	}
	.roster-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--boundary);
	}
	.roster-row:last-child {
		border-bottom: none;
	}
	/* A REMOVED STUDENT IS STILL A NAME AND AN ADDRESS SOMEBODY HAS TO READ.
	   --text-3 is decorative tertiary in this room (CLAUDE.md says so in as many
	   words) and it measured 3.13:1 on the card -- so the row that tells you who
	   was removed was the least readable row on the page. --text-2 is this
	   register's own word for secondary copy: 7.27:1. The line-through is what
	   carries "removed", which is the point -- colour was never the only
	   signal here, so dropping the dimness costs nothing. */
	.roster-row.inactive .roster-name,
	.roster-row.inactive .roster-email {
		color: var(--text-2);
		text-decoration: line-through;
	}
	.roster-name {
		font-weight: 700;
		font-size: 0.9rem;
		/* A NAME TOO LONG FOR ITS ROW WRAPS RATHER THAN PUSHING THE PICTURE.
		   The row is `flex-wrap: wrap`, so without a min-width of 0 a long
		   unbroken name sets the flex item's automatic minimum to its
		   min-content and forces the row wider (CLAUDE.md's min-width rule).
		   The avatar carries `flex-shrink: 0` and an inline min-width, so it
		   is the NAME that gives, which is the right way round. */
		min-width: 0;
	}
	.roster-email {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.roster-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	/* The row's own status, in words. The tint is a second signal on top of the
	   sentence, never the only one -- read with the label removed, every chip
	   here still says nothing, which is the test that it is decoration. */
	.roster-status {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.1rem var(--space-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-chip);
		white-space: nowrap;
		color: var(--text-2);
	}
	.roster-status[data-tone='on'] {
		color: var(--text-2);
	}
	/* --gold, because a manager row is a SPECIAL CALLOUT and not a warning:
	   nothing is wrong with it, it is simply the row that explains why this
	   name is absent from every student surface. --amber would say something
	   needs fixing. */
	.roster-status[data-tone='manager'] {
		color: var(--gold);
		border-color: var(--gold);
	}
	.roster-status[data-tone='off'] {
		color: var(--text-3);
	}
	/* Both blocks sit UNDER the row they belong to and inside its own list, so
	   the counts and the alternative action are next to the person they are
	   about. A refusal rendered at the top of the page would be a sentence
	   about somebody whose row has scrolled away. */
	.roster-confirm,
	.roster-refusal {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-3);
		margin: var(--space-1) 0 var(--space-3);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.roster-confirm {
		border: 1px solid var(--crimson);
	}
	/* NOT --crimson. The confirm above is about to destroy something; a refusal
	   is the system declining to, which is the safe outcome and must not be
	   dressed as an error. */
	.roster-refusal {
		border: 1px solid var(--amber);
	}
	.roster-confirm-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.add-row {
		display: grid;
		grid-template-columns: minmax(10rem, 2fr) minmax(7rem, 1.5fr) auto;
		gap: 0.4rem;
		align-items: center;
		margin-top: var(--space-2);
	}
	/*
	 * The dragover feedback is an OUTLINE, never a border: a border takes
	 * layout space and would move every row in this panel by a pixel the moment
	 * a file crossed it. The element already carries a dashed border of its
	 * own, so the outline sits outside it and reads as the whole box lighting
	 * up rather than as a second frame.
	 */
	.csv-import.csv-dragging {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.csv-import {
		margin-top: 0.7rem;
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-card);
		padding: 0.5rem 0.7rem;
	}
	.csv-import summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--hover-ink);
	}
	.csv-import textarea {
		margin: 0.4rem 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.csv-import input[type='file'] {
		margin-top: 0.4rem;
		font-size: 0.75rem;
	}
	.csv-import code {
		color: var(--cyan);
	}
	@media (max-width: 560px) {
		.add-row {
			grid-template-columns: 1fr;
		}
		/* The row wraps to two lines below this width, so the actions stop
		   being pushed to a right edge that is no longer beside the name. */
		.roster-actions {
			margin-left: 0;
		}
		.roster-status {
			order: -1;
		}
	}

	/* --- Class tools ---------------------------------------------------- */
	.tools-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2, 0.5rem);
	}
	.tool-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		margin-top: var(--space-3, 0.8rem);
		padding-top: var(--space-3, 0.8rem);
		/* The only separator between the control row and the panel it opened,
		   so it is the load-bearing token rather than the decorative one. */
		border-top: 1px solid var(--boundary);
	}
	.tool-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.tool-field > span {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.tool-field input,
	.tool-field select {
		min-height: 44px;
	}
	.tool-field.narrow input {
		width: 6rem;
	}
	/*
	 * THE SELECT IS NAMED BESIDE THE INPUT because `.tool-field input` alone
	 * left a native white control sitting on this room's dark plate -- measured
	 * in Chromium at both widths. It takes the room's own surface and ink
	 * rather than a colour invented here, and `--boundary` rather than
	 * `--hairline` because the edge of an interactive control is load-bearing.
	 */
	.tool-field select {
		max-width: 100%;
		padding: 0 var(--space-2, 0.5rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: var(--surface-2, var(--bg2));
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.9rem;
	}
	.tool-addresses {
		margin: 0;
		/* Selectable, and it wraps: a class list is long and must not push the
		   page wider than the viewport. */
		overflow-wrap: anywhere;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		user-select: all;
	}
	.tool-absent {
		margin: 0;
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
	}
	.tool-absent legend {
		padding: 0 0.4rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.absent-grid {
		display: grid;
		/* auto-fit so a class of six gets six columns' worth of room rather than
		   a fixed grid with a void in it. */
		grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
		gap: 0.2rem;
		margin-top: 0.4rem;
	}
	.absent-item {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		/* The LABEL is what a finger hits, so the floor lives here and not on
		   the checkbox inside it. */
		min-height: 44px;
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.absent-item > span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.picker-one {
		margin: 0;
		color: var(--text-1);
		font-size: 1.1rem;
	}
	.picker-label {
		margin-right: 0.5rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.picker-order {
		margin: 0.3rem 0 0;
		padding-left: 1.4rem;
		color: var(--text-1);
	}
	.picker-teams {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
		gap: var(--space-2, 0.5rem);
		margin-top: 0.3rem;
	}
	.picker-team {
		min-width: 0;
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
	}
	.picker-team h4 {
		margin: 0 0 0.3rem;
		color: var(--cyan);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.picker-team ul {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-1);
	}

	/* --- Saved teams (0223) ------------------------------------------- */

	.team-mode {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
		padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
	}

	.team-mode legend {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		padding: 0 0.3rem;
	}

	.team-mode-opt {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		cursor: pointer;
	}

	.team-save {
		margin-top: var(--space-2, 0.5rem);
	}

	.team-set {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		padding: var(--space-3, 0.75rem);
		margin-top: var(--space-3, 0.75rem);
	}

	.team-set-head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: baseline;
		justify-content: space-between;
	}

	.team-set-head h3 {
		margin: 0;
		min-width: 0;
	}

	/*
	 * A WORD IS ALWAYS PRESENT -- the element's whole content is the sentence
	 * from TEAM_WINDOW_WORDS -- so the tone below is a second signal and never
	 * the only one.
	 */
	.team-state {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}

	.team-state[data-state='showing'] {
		color: var(--green);
	}

	.team-state[data-state='scheduled'] {
		color: var(--cyan);
	}

	.team-seed {
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.team-drift {
		color: var(--amber);
	}

	/*
	 * MULTI-COLUMN, NOT A GRID, AND IT IS THE REPO'S OWN RULE RATHER THAN A
	 * preference. A grid ROW is as tall as its tallest member, and these cards
	 * are deliberately unequal: one carries a tagline, a "decorated by" line and
	 * a style hint while its neighbour carries none of them. In a grid the short
	 * card's column dies for the whole height of the long one, and nothing on
	 * screen or in any type check reports it.
	 *
	 * `column-width` AND a count, because multicol has no `auto-fit`: with only
	 * a width it cuts every column the measure holds and leaves the spare one
	 * empty. With both, the used count is min(count, what fits), so two teams
	 * share the whole measure and a narrow pane still drops to one column.
	 *
	 * Reading order becomes column-major, which for teams numbered 1..n is the
	 * order they are numbered in.
	 */
	.team-cards {
		columns: 15rem 4;
		column-gap: var(--space-2, 0.5rem);
		margin-top: var(--space-2, 0.5rem);
	}

	.team-card {
		break-inside: avoid;
		/* multicol has no row gap, so the rhythm is a margin on the panel. */
		margin-bottom: var(--space-2, 0.5rem);
		min-width: 0;
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--boundary);
		border-left: 4px solid var(--team-accent, var(--boundary));
		border-radius: var(--radius-2, 6px);
	}

	.team-card.has-style {
		background: var(--team-bg, transparent);
		color: var(--team-ink, inherit);
	}

	.team-card h4 {
		margin: 0 0 0.2rem;
		color: inherit;
	}

	.team-tagline {
		margin: 0 0 0.3rem;
		font-style: italic;
		font-size: 0.85rem;
	}

	.team-card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
		margin-bottom: 0.2rem;
	}

	.team-card-head h4 {
		margin: 0;
		min-width: 0;
		overflow-wrap: break-word;
	}

	.team-rename-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2, 0.5rem);
		margin: 0 0 var(--space-2, 0.5rem);
	}

	.team-rename-form .tool-field {
		flex: 1 1 10rem;
		min-width: 0;
	}

	/* One row per student: a worded grip, the name, and Move to. The name
	   takes what is left and wraps between words (`.person-name`); the two
	   controls never shrink below their 44px floor. */
	.team-members {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.team-member {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.4rem;
		min-height: 44px;
		min-width: 0;
	}

	.team-member-name {
		flex: 1 1 6rem;
		min-width: 0;
	}

	.team-member.left-class .team-member-name {
		opacity: 0.75;
	}

	/* The same worded grip the unit list uses (UnitManager's `.unit-grip`):
	   a word beside the glyph, 44px, `min-height` never a height. */
	.team-grip {
		appearance: none;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.45rem;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-card, 6px);
		color: inherit;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		cursor: grab;
		user-select: none;
	}

	.team-grip:hover:not([aria-disabled='true']) {
		border-color: var(--boundary);
	}

	.team-grip:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}

	.team-grip[aria-disabled='true'] {
		opacity: 0.5;
		cursor: default;
	}

	:global(.is-dragging) .team-grip {
		cursor: grabbing;
	}

	.team-move-wrap {
		display: contents;
	}

	.team-move {
		flex: none;
	}

	/* THE CHOICES TAKE A LINE OF THEIR OWN under the name, so a phone shows
	   every team without the row overflowing. */
	.team-move-list {
		flex: 1 0 100%;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		min-width: 0;
		padding: 0.2rem 0 0.35rem;
	}

	.team-unteamed {
		border-style: dashed;
		border-left-width: 1px;
	}

	.team-edited,
	.team-move-hint {
		margin: 0.2rem 0 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}

	/* NOT --crimson, for the reason `.roster-refusal` gives: a refusal is the
	   database declining, the safe outcome, and is not dressed as an error. */
	.team-refusal {
		margin: 0.3rem 0 0;
		padding-left: 0.5rem;
		border-left: 3px solid var(--amber);
		color: var(--text-1);
	}

	.team-edit-note {
		margin: 0.2rem 0 0;
		color: var(--text-1);
	}

	.team-edit-note:empty {
		margin: 0;
	}

	/*
	 * A WORD, because a student who left the class is still on the team that
	 * was drawn and an opacity change alone says nothing about which of those
	 * two facts moved.
	 */
	.team-left {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--amber);
		white-space: nowrap;
	}

	.team-by,
	.team-style-hint {
		margin: 0.3rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}

	.team-actions {
		margin-top: var(--space-2, 0.5rem);
	}

	.team-retire-note {
		flex-basis: 100%;
	}

	/* --- The roster beside its tools (ledger 0297) ------------------------- */
	.people-grid {
		display: flex;
		flex-direction: column;
	}
	/* One column: the side's cards join the page's own flow so the class tools
	   can come FIRST; the roster follows, then compliance and settings. */
	.people-side {
		display: contents;
	}
	.people-side > [data-testid='class-tools'] {
		order: -1;
	}
	@media (min-width: 1100px) {
		.people-grid {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(22rem, 30rem);
			gap: 0 var(--space-5);
			align-items: start;
		}
		.people-side {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		.people-roster {
			min-width: 0;
		}
	}
	/* THE DRAW'S RESULT SITS DIRECTLY UNDER THE DRAW BUTTON. The Here today list
	   (a checkbox per student, 41 of them in a real class) used to sit between
	   the button and the names it drew, so pressing Draw changed nothing a
	   teacher could see. Ordered last in the panel; the DOM is unchanged, so the
	   list keeps its place for a screen reader and in print. */
	#tool-panel-picker {
		display: flex;
		flex-direction: column;
	}
	#tool-panel-picker > .tool-absent {
		order: 1;
	}
</style>
