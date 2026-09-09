<script lang="ts">
	import { page } from '$app/state';
	import BracketView from '$lib/tournaments/BracketView.svelte';
	import PoolsView from '$lib/tournaments/PoolsView.svelte';
	import RewardRulesEditor from '$lib/tournaments/RewardRulesEditor.svelte';
	import RewardsPanel from '$lib/tournaments/RewardsPanel.svelte';
	import TournamentQr from '$lib/tournaments/TournamentQr.svelte';
	import EntryBanner from '$lib/tournaments/EntryBanner.svelte';
	import EntryStyleEditor from '$lib/tournaments/EntryStyleEditor.svelte';
	import EventRail from '$lib/tournaments/EventRail.svelte';
	import HostMatchControl from '$lib/tournaments/HostMatchControl.svelte';
	import TvStage from '$lib/tournaments/TvStage.svelte';
	import TournamentStats from '$lib/tournaments/TournamentStats.svelte';
	import MatchDetail from '$lib/tournaments/MatchDetail.svelte';
	import EntryDetail from '$lib/tournaments/EntryDetail.svelte';
	import ForfeitForm from '$lib/tournaments/ForfeitForm.svelte';
	import DeleteTournament from '$lib/tournaments/DeleteTournament.svelte';
	import TournamentBoard from '$lib/tournaments/TournamentBoard.svelte';
	import RegisterEntry from '$lib/tournaments/RegisterEntry.svelte';
	import EntryTeamPanel from '$lib/tournaments/EntryTeamPanel.svelte';
	import '$lib/tournaments/tournaments-theme.css';
	import {
		entryMap,
		entryBracketRecord,
		isByeMatch,
		isForfeitMatch,
		matchTimeline,
		memberMap,
		memberNames,
		tournamentStats,
		type BracketMatch,
		type Tournament,
		type TournamentEntry,
		type TournamentInvite,
		type TournamentStatus
	} from '$lib/tournaments/tournaments';
	import { fullscreenActive, toggleFullscreen } from '$lib/tournaments/fullscreen';
	import { hasStyle, type EntryStyle, type EntryStyleDraft } from '$lib/tournaments/entry-styles';
	import { COIN_SYMBOL } from '$lib/coin-format';
	import {
		addMember,
		buildSim,
		buildQualSample,
		correctLast,
		eventsFor,
		forfeitMatch,
		forfeitNext,
		joinEntry,
		membersOf,
		playNext,
		removeMember,
		renameEntry,
		renameMember,
		setSimRewardRules,
		SIM_VIEWER_ID,
		startMatch,
		startNext,
		submitResult,
		type Sim,
		type SimResult
	} from './sim';

	/**
	 * QUERY-DRIVEN VIEWS (prompt 0077), so the browser harness can measure one
	 * surface in its real room at its real size:
	 *
	 *   ?view=tv&status=live&field=8     TvStage pinned to the viewport, the
	 *                                    way the /tv route mounts it -- drive
	 *                                    the run at 1920x1080 for a projector
	 *                                    figure rather than a framed one.
	 *   ?view=host&field=8&state=live    the REAL HostMatchControl, alone,
	 *                                    inside the room, mid-match.
	 *   ?view=page&field=16&state=live   the public page's composition pieces
	 *                                    (event rail, bracket in its
	 *                                    fullscreen stage, entries with
	 *                                    their registrants) in the room at
	 *                                    the CONSOLE measure the real event
	 *                                    page takes.
	 *
	 * PROMPT 0110 added four more, spelled exactly as the browser specs
	 * address them (tools/browser-verify/routes/tournaments-view-*.mjs):
	 *
	 *   ?view=list&signedin=1&admin=1&hosted=1
	 *                                    the REAL TournamentBoard inside
	 *                                    `.tnm-root .tnm-shell` at the
	 *                                    `tnm-page wide` measure, over a
	 *                                    fixture of FIVE tournaments built
	 *                                    from the sim: the main sim live with
	 *                                    a match started, one open for entry
	 *                                    (teams of up to 3), one seeding, and
	 *                                    two complete with champions (one of
	 *                                    them with a paid ledger, so the
	 *                                    delete control's acknowledgement
	 *                                    path is reachable). `signedin=1`
	 *                                    turns "Sign in to enter" into
	 *                                    Register and adds a pending invite;
	 *                                    `hosted=1` makes the viewer host of
	 *                                    the live and the open one; `admin=1`
	 *                                    puts Manage on every card. The
	 *                                    respond and delete transports log
	 *                                    to a trail under the board and
	 *                                    mirror 0192's delete refusals.
	 *   ?view=register&team=2            the REAL RegisterEntry in the room,
	 *                                    `team` = registrants per entry
	 *                                    (1..6, default 1); `invite=1` for
	 *                                    the invite shape. The draft it
	 *                                    emits is logged verbatim.
	 *   ?view=team&state=live|open       the REAL EntryTeamPanel for entry 1
	 *                                    (a team of two: Azad, the captain,
	 *                                    and Diego, unlinked) with the sim's
	 *                                    0192 transports; `state` is the
	 *                                    tournament status (open, seeding,
	 *                                    live, complete, draft), `viewer=host`
	 *                                    mounts it the way the host console
	 *                                    does (a viewer who is nobody's row),
	 *                                    `team=3` lifts the sim's team_size
	 *                                    so the entry has room and the
	 *                                    add-teammate row shows.
	 *   ?view=tv&status=registration_open&field=22
	 *                                    the projector's roster paging: 22
	 *                                    entries is three pages of eight.
	 *   (no view)                        the full harness, every component,
	 *                                    with a Members card at the top.
	 *
	 * `state=live` starts the first callable match; `state=played` plays
	 * three first; `state=done` plays the whole bracket. Every initial value
	 * below is built from PLAIN values before any rune exists -- a `$state`
	 * read at the top level is a `state_referenced_locally` warning apiece
	 * (0077 carried six of them for an afternoon).
	 */
	const params = page.url.searchParams;
	const view = params.get('view') ?? '';
	const fieldParam = Number(params.get('field'));
	const stateParam = params.get('state') ?? '';

	const initialField = Number.isInteger(fieldParam) && fieldParam >= 2 ? fieldParam : 6;
	/** Built from the query BEFORE any state exists, so the initial drive
	 * reads plain values and no rune is captured at its initial value. */
	function initialSim(n: number, state: string, teamSize: number | null = null): Sim {
		const s = buildSim(n);
		// `?team=N` on the team view lifts the sim's team_size (2) so entry 1
		// has ROOM and the add-teammate row is reachable; without it the
		// team of two is full by construction and the panel says so.
		if (teamSize !== null) s.teamSize = teamSize;
		if (state === 'played') {
			playNext(s);
			playNext(s);
			playNext(s);
		}
		if (state === 'played' || state === 'live') startNext(s);
		if (state === 'done') {
			let guard = 0;
			while (guard++ < 300 && playNext(s)) {
				/* run to champion */
			}
		}
		return s;
	}
	/** The board's tournament status for `?view=team` / `?view=list`. */
	function statusFromParam(raw: string | null, fallback: TournamentStatus): TournamentStatus {
		const map: Record<string, TournamentStatus> = {
			open: 'registration_open',
			registration_open: 'registration_open',
			seeding: 'seeding',
			live: 'live',
			complete: 'complete',
			done: 'complete',
			draft: 'draft'
		};
		return (raw && map[raw]) || fallback;
	}
	const initialTeamStatus = statusFromParam(params.get('state'), 'registration_open');
	/** `?team=N` (1..6): registrants per entry for the register form, and
	 * the sim's team_size on the team view. */
	const teamParam = Number(params.get('team'));
	const registerTeamSize = Number.isInteger(teamParam) && teamParam >= 1 && teamParam <= 6 ? teamParam : 1;

	// --- 0110: the board fixture (?view=list). Built from the sim BEFORE the
	// main sim, because `buildSim` resets the shared id counter: the LAST
	// sim built owns the counter afterwards, and that has to be the one the
	// controls keep writing to. Entries are re-keyed under their tournament
	// so `entryMap` over the whole board never collides.
	interface BoardFixture {
		tournaments: Tournament[];
		entries: TournamentEntry[];
		rewardCountById: Record<string, number>;
		rewardCoinsById: Record<string, number>;
		rewardEntriesById: Record<string, number>;
	}
	function boardFixture(): BoardFixture {
		const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
		const retag = (s: Sim, id: string): TournamentEntry[] =>
			s.entries.map((e) => ({ ...e, id: `${id}-${e.id}`, tournament_id: id }));
		const finish = (s: Sim) => {
			let guard = 0;
			while (guard++ < 300 && playNext(s)) {
				/* run to champion */
			}
			return s;
		};
		const open = buildSim(5);
		const seed = buildSim(6);
		const doneA = buildSim(8);
		setSimRewardRules(doneA, [
			{ trigger_type: 'win', trigger_value: null, amount: 10 },
			{ trigger_type: 'placement', trigger_value: 1, amount: 50 }
		]);
		finish(doneA);
		const doneB = finish(buildSim(4));
		const tournaments: Tournament[] = [
			{
				id: 'sim',
				name: 'Harness Invitational',
				description: 'The main sim: every control on the harness writes to it.',
				config: { team_size: 2 },
				status: 'live',
				champion_entry_id: null,
				created_by: null,
				created_at: ago(240),
				updated_at: ago(3)
			},
			{
				id: 'open',
				name: 'IDEA100 Hook Design Open',
				description: 'Bring a hook, bring a team. Registration closes Friday.',
				config: { team_size: 3 },
				status: 'registration_open',
				champion_entry_id: null,
				created_by: null,
				created_at: ago(60 * 24),
				updated_at: ago(60 * 24)
			},
			{
				id: 'seed',
				name: 'Spring Sawtooth Cup',
				description: '',
				config: {},
				status: 'seeding',
				champion_entry_id: null,
				created_by: null,
				created_at: ago(60 * 48),
				updated_at: ago(60 * 20)
			},
			{
				id: 'done-a',
				name: 'Fall Redline Classic',
				description: '',
				config: { team_size: 2 },
				status: 'complete',
				champion_entry_id: `done-a-${doneA.championId}`,
				created_by: null,
				created_at: ago(60 * 24 * 30),
				updated_at: ago(60 * 24 * 21)
			},
			{
				id: 'done-b',
				name: 'Winter Gearbox Series',
				description: '',
				config: {},
				status: 'complete',
				champion_entry_id: `done-b-${doneB.championId}`,
				created_by: null,
				created_at: ago(60 * 24 * 90),
				updated_at: ago(60 * 24 * 80)
			}
		];
		return {
			tournaments,
			entries: [
				...retag(open, 'open'),
				...retag(seed, 'seed'),
				...retag(doneA, 'done-a'),
				...retag(doneB, 'done-b')
			],
			rewardCountById: { 'done-a': doneA.ledger.length },
			rewardCoinsById: { 'done-a': doneA.ledger.reduce((t, r) => t + r.amount, 0) },
			rewardEntriesById: { 'done-a': new Set(doneA.ledger.map((r) => r.entry_id)).size }
		};
	}
	const initialBoard = view === 'list' ? boardFixture() : null;
	const boardSignedIn = params.get('signedin') === '1';
	const boardAdmin = params.get('admin') === '1';
	const boardHostedIds = params.get('hosted') === '1' ? ['sim', 'open'] : [];
	const initialInvites: TournamentInvite[] = boardSignedIn
		? [
				{
					id: 'inv-1',
					tournament_id: 'open',
					invited_user_id: SIM_VIEWER_ID,
					invited_by: null,
					status: 'pending',
					created_at: new Date().toISOString(),
					responded_at: null
				}
			]
		: [];

	// The board is about a RUNNING event and its marquee needs a match on the
	// floor, so the list view defaults to `live`; `?view=team&state=live`
	// starts one through the same branch of initialSim.
	const initialState = view === 'list' && !stateParam ? 'live' : stateParam;

	let fieldSize = $state(initialField);
	let sim = $state<Sim>(
		initialSim(initialField, initialState, view === 'team' && params.get('team') ? registerTeamSize : null)
	);
	let linkMatches = $state(false);
	const qual = buildQualSample();

	const entries = $derived(entryMap(sim.entries));
	/** Registrants by entry (0192), the shape every banner-bearing component takes. */
	const simMembers = $derived(memberMap(sim.members));
	const qualEntries = entryMap(qual.entries);

	function rebuild(n: number) {
		fieldSize = n;
		const rules = sim.rewardRules;
		sim = buildSim(n);
		// Keep the configured reward rules across a rebuild so play-all can be
		// repeated against the same configuration.
		sim.rewardRules = rules;
	}

	// --- 2b: banner styles + TV mode ---
	/** In-memory mirror of tournament_set_entry_style's full-replacement +
	 * clear-when-empty behavior, so the REAL editor drives the REAL renderers
	 * with no Supabase. */
	function saveStyle(entryId: string, draft: EntryStyleDraft) {
		const empty =
			!draft.background_type &&
			!draft.accent_color &&
			!draft.badge &&
			!draft.flourish &&
			!draft.tagline;
		const next = { ...sim.styles };
		if (empty) delete next[entryId];
		else
			next[entryId] = {
				entry_id: entryId,
				tournament_id: 'sim',
				...draft
			} as EntryStyle;
		sim.styles = next;
	}

	let editId = $state<string | null>(null);
	const editEntry = $derived(sim.entries.find((e) => e.id === editId) ?? sim.entries[0]);

	const statusParam = params.get('status') as Tournament['status'] | null;
	let tvStatus = $state<Tournament['status']>(
		statusParam && ['registration_open', 'seeding', 'live', 'complete'].includes(statusParam)
			? statusParam
			: 'live'
	);
	const tvTournament = $derived<Tournament>({
		id: 'sim',
		name: 'Harness Invitational',
		description: '',
		config: {},
		status: tvStatus,
		champion_entry_id: tvStatus === 'complete' ? (sim.championId ?? sim.entries[0].id) : null,
		created_by: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	});
	function playAll() {
		let guard = 0;
		while (guard++ < 300 && playNext(sim)) {
			/* run to champion */
		}
	}

	// --- 0077: the host's match control, driven end to end against the sim.
	// The same callback shapes the route hands the component; each answers
	// whether the write landed, exactly as the route's run() does.
	let hostLog = $state<string[]>([]);
	let hostBusy = $state(false);
	const hostScoreEntry = params.get('scores') === '1';
	const hostTransports = {
		onstart: (id: string) => {
			const ok = startMatch(sim, id);
			hostLog = [...hostLog, `start ${id} -> ${ok}`];
			return ok;
		},
		onsubmit: (id: string, result: unknown) => {
			const ok = submitResult(sim, id, result);
			hostLog = [...hostLog, `submit ${id} ${JSON.stringify(result)} -> ${ok}`];
			return ok;
		},
		onforfeit: (id: string, result: unknown) => {
			const r = result as { winner_id: string; reason: string };
			const ok = forfeitMatch(sim, id, r.winner_id, r.reason);
			hostLog = [...hostLog, `forfeit ${id} ${JSON.stringify(result)} -> ${ok}`];
			return ok;
		},
		oncorrect: (id: string, result: unknown, reason: string) => {
			// The sim corrects the LAST unwindable match rather than by id; the
			// route's correction goes through the RPC. Logged so the payload
			// shape can still be read off the harness.
			const corrected = correctLast(sim, reason);
			hostLog = [...hostLog, `correct ${id} ${JSON.stringify(result)} "${reason}" -> ${corrected}`];
			return corrected !== null;
		}
	};

	// The event clock, threaded in the way the public page threads it, and
	// ticking so the rail's clock and the marquee's move. The callback runs
	// outside the effect's tracking context, so writing `now` from it does
	// not re-run the effect.
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	// --- 0110: the board (?view=list). The four fixture tournaments are
	// state so a delete removes one; the live one is DERIVED from the sim so
	// playing it to a champion moves it to the finished lane.
	let boardRows = $state<Tournament[]>(initialBoard?.tournaments ?? []);
	let boardInvites = $state<TournamentInvite[]>(initialInvites);
	let boardLog = $state<string[]>([]);
	let boardDeleteBusy = $state<string | null>(null);
	let boardDeleteErrors = $state<Record<string, string>>({});
	let boardInviteBusy = $state<string | null>(null);
	const boardTournaments = $derived(
		boardRows.map((t) =>
			t.id === 'sim'
				? {
						...t,
						status: sim.status,
						champion_entry_id: sim.championId,
						updated_at: new Date(now).toISOString()
					}
				: t
		)
	);
	const boardEntries = $derived([...sim.entries, ...(initialBoard?.entries ?? [])]);
	const boardRewardCount = $derived<Record<string, number>>({
		...(initialBoard?.rewardCountById ?? {}),
		sim: sim.ledger.length
	});
	const boardRewardCoins = $derived<Record<string, number>>({
		...(initialBoard?.rewardCoinsById ?? {}),
		sim: sim.ledger.reduce((t, r) => t + r.amount, 0)
	});
	const boardRewardEntries = $derived<Record<string, number>>({
		...(initialBoard?.rewardEntriesById ?? {}),
		sim: new Set(sim.ledger.map((r) => r.entry_id)).size
	});
	function boardRespond(inviteId: string, accept: boolean, displayName: string | null) {
		boardInviteBusy = inviteId;
		setTimeout(() => {
			boardInviteBusy = null;
			boardInvites = boardInvites.filter((i) => i.id !== inviteId);
			boardLog = [
				...boardLog,
				`respond ${inviteId} ${accept ? 'accept' : 'decline'} name=${JSON.stringify(displayName)}`
			];
		}, 120);
	}
	/** Mirrors tournament_delete as 0192 leaves it: a host of this one or a
	 * site admin; the payout acknowledgement is checked before the name. */
	function boardDelete(tournamentId: string, confirmName: string, ack: boolean) {
		const t = boardTournaments.find((x) => x.id === tournamentId);
		if (!t) return;
		boardDeleteBusy = tournamentId;
		const next = { ...boardDeleteErrors };
		delete next[tournamentId];
		boardDeleteErrors = next;
		setTimeout(() => {
			boardDeleteBusy = null;
			const entryCount = boardEntries.filter((e) => e.tournament_id === tournamentId).length;
			const rewards = boardRewardCount[tournamentId] ?? 0;
			const fail = (msg: string, why: string) => {
				boardDeleteErrors = { ...boardDeleteErrors, [tournamentId]: msg };
				boardLog = [...boardLog, `delete ${tournamentId} REFUSED (${why})`];
			};
			if (!boardAdmin && !boardHostedIds.includes(tournamentId))
				return fail('Only a host of this tournament, or a site admin, can delete it.', 'not a host, not an admin');
			if (rewards > 0 && !ack)
				return fail(
					`This tournament has paid out ${boardRewardCoins[tournamentId] ?? 0} IDEA Coins to ${boardRewardEntries[tournamentId] ?? 0} entries as reward payouts. Acknowledge the payout loss to continue.`,
					'payout loss not acknowledged'
				);
			if (entryCount > 0 && confirmName.trim().toLowerCase() !== t.name.trim().toLowerCase())
				return fail(`Type the tournament name exactly to confirm deletion: "${t.name}".`, `name "${confirmName}"`);
			boardRows = boardRows.filter((x) => x.id !== tournamentId);
			boardLog = [
				...boardLog,
				`delete ${tournamentId} DELETED · confirm="${confirmName}" · ack=${ack} · ${entryCount} entries · ${rewards} reward rows`
			];
		}, 120);
	}

	// --- 0110: the team panel (?view=team and the Members card). The status
	// is the harness's fiction handed to every sim transport; the trail
	// records each call and the refusal sentence the sim answered with.
	let teamStatus = $state<TournamentStatus>(initialTeamStatus);
	let teamError = $state('');
	let teamLog = $state<string[]>([]);
	const teamViewerId = params.get('viewer') === 'host' ? 'u-host' : SIM_VIEWER_ID;
	/** The Members card's "as host" toggle: flips the panel's `manager` prop
	 * (the account-email add) without changing whose row the viewer holds. */
	let membersAsHost = $state(false);
	/** `?view=team&viewer=host` mounts the panel as a manager; the default
	 * harness reads the toggle. Handed to the sim's addMember as well, so
	 * the mirror refuses an email exactly where the RPC does. */
	const teamManager = $derived(view === 'team' ? teamViewerId === 'u-host' : membersAsHost);
	const teamEntry = $derived(sim.entries[0]);
	const teamMembers = $derived(teamEntry ? membersOf(sim, teamEntry.id) : []);
	function teamCall(label: string, r: SimResult) {
		teamError = r.ok ? '' : r.error;
		teamLog = [...teamLog, `${label} -> ${r.ok ? `ok ${r.id ?? ''}`.trim() : `REFUSED: ${r.error}`}`];
	}
	const teamTransports = {
		onrename: (name: string) => teamCall(`rename entry "${name}"`, renameEntry(sim, teamStatus, teamEntry.id, name)),
		onaddmember: (name: string, email: string | null) =>
			teamCall(
				`add "${name}" email=${JSON.stringify(email)} manager=${teamManager}`,
				addMember(sim, teamStatus, teamEntry.id, name, email, teamManager)
			),
		onremovemember: (id: string) => teamCall(`remove ${id}`, removeMember(sim, teamStatus, id)),
		onrenamemember: (id: string, name: string) =>
			teamCall(`rename member ${id} "${name}"`, renameMember(sim, teamStatus, id, name))
	};
	/** A second account joining entry 3 (Redline, a solo with room at team_size 2). */
	function joinDemo() {
		const target = sim.entries[2] ?? sim.entries[0];
		teamCall(`join ${target.id} as sam`, joinEntry(sim, teamStatus, target.id, 'Sam', 'u-sam'));
	}

	// --- 0110: the registration form (?view=register). It emits a draft and
	// nothing else; the route is what uploads and calls the RPC.
	const registerInvite = params.get('invite') === '1';
	let registerLog = $state<string[]>([]);
	function onregister(draft: {
		display_name: string;
		description: string;
		member_name: string;
		teammates: string[];
		file: File | null;
	}) {
		registerLog = [
			...registerLog,
			JSON.stringify({ ...draft, file: draft.file ? `${draft.file.name} (${draft.file.size} bytes)` : null })
		];
	}

	// --- 0110: the bracket's fullscreen stage (?view=page). The second caller
	// of fullscreen.ts; `isFull` follows `fullscreenchange` the way TvStage's
	// does, because the API, Escape and the control are three ways out and
	// only the event knows which one fired.
	let stageEl = $state<HTMLElement | null>(null);
	let stageFull = $state(false);
	$effect(() => {
		const sync = () => (stageFull = fullscreenActive(document));
		document.addEventListener('fullscreenchange', sync);
		document.addEventListener('webkitfullscreenchange', sync);
		return () => {
			document.removeEventListener('fullscreenchange', sync);
			document.removeEventListener('webkitfullscreenchange', sync);
		};
	});

	// --- 3a: detail pages, stats, forfeits ---
	const simTournament = $derived<Tournament>({
		id: 'sim',
		name: 'Harness Invitational',
		description: '',
		config: {},
		status: sim.status,
		champion_entry_id: sim.championId,
		created_by: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	});

	/** Every match worth opening a detail page on, newest activity first. */
	const inspectable = $derived(
		sim.matches.filter((m) => m.status !== 'pending' || m.entry_a_id || m.entry_b_id)
	);
	let detailId = $state<string | null>(null);
	const detailMatch = $derived(
		sim.matches.find((m) => m.id === detailId) ??
			sim.matches.find((m) => m.status === 'complete' && !isByeMatch(m)) ??
			sim.matches[0]
	);

	let qualDetail = $state(false);
	const qualDetailMatch = qual.matches[0];

	let entryDetailId = $state<string | null>(null);
	const entryDetailEntry = $derived(
		sim.entries.find((e) => e.id === entryDetailId) ?? sim.entries[0]
	);

	/** Cross-checks the record and reward total against the raw rows. */
	const entryAudit = $derived.by(() => {
		const e = entryDetailEntry;
		if (!e) return null;
		const rec = entryBracketRecord(e.id, sim.matches);
		const rows = sim.ledger.filter((r) => r.entry_id === e.id);
		return {
			rec,
			ledgerRows: rows.length,
			ledgerTotal: rows.reduce((s, r) => s + r.amount, 0),
			forfeitLedgerRows: sim.matches
				.filter((m) => isForfeitMatch(m))
				.reduce((s, m) => s + sim.ledger.filter((r) => r.match_id === m.id).length, 0)
		};
	});

	const stats = $derived(tournamentStats(sim.matches));
	const forfeited = $derived(sim.matches.filter((m) => isForfeitMatch(m)));

	/** Drives the REAL ForfeitForm against the sim's forfeit path: it always
	 * targets the next startable match, which is what forfeitNext picks too. */
	const readyMatch = $derived(
		sim.matches.find(
			(m) =>
				(m.status === 'pending' || m.status === 'in_progress') &&
				m.entry_a_id !== null &&
				m.entry_b_id !== null
		) ?? null
	);
	let lastForfeitPayload = $state<string>('');

	// --- 0066: delete, 0068: payout-loss ack, 0192: admin. In-memory mirror
	// of tournament_delete's rules, so the REAL control is driven end to end:
	// the name is required exactly when the tournament has entries,
	// acknowledgment is required exactly when the tournament has reward
	// ledger rows (checked BEFORE the name, matching the RPC's order), the
	// caller must be a host or a SITE ADMIN (0192 re-gated it off
	// `is_teacher()`), and a success wipes every tournament-scoped row.
	let deleteAsRole = $state<'host' | 'admin' | 'student'>('host');
	let deleteEntries = $state(true);
	let deleteBusy = $state(false);
	let deleteError = $state('');
	let deleteLog = $state<string[]>([]);
	const deletable = $derived<Tournament>({ ...simTournament, name: 'Harness Invitational' });
	const deleteRewardCount = $derived(sim.ledger.length);
	const deleteRewardCoins = $derived(sim.ledger.reduce((s, r) => s + r.amount, 0));
	const deleteRewardEntries = $derived(new Set(sim.ledger.map((r) => r.entry_id)).size);

	function fakeDelete(confirmName: string, acknowledgePayoutLoss: boolean) {
		deleteError = '';
		deleteBusy = true;
		const entries = deleteEntries ? sim.entries.length : 0;
		const rewards = deleteRewardCount;
		setTimeout(() => {
			deleteBusy = false;
			if (deleteAsRole === 'student') {
				deleteError = 'Only a host of this tournament, or a site admin, can delete it.';
				deleteLog = [...deleteLog, 'REFUSED (not a host, not an admin)'];
				return;
			}
			if (rewards > 0 && !acknowledgePayoutLoss) {
				deleteError = `This tournament has paid out ${deleteRewardCoins} IDEA Coins to ${deleteRewardEntries} entries as reward payouts. Acknowledge the payout loss to continue.`;
				deleteLog = [...deleteLog, 'REFUSED (payout loss not acknowledged)'];
				return;
			}
			if (
				entries > 0 &&
				confirmName.trim().toLowerCase() !== deletable.name.trim().toLowerCase()
			) {
				deleteError = `Type the tournament name exactly to confirm deletion: "${deletable.name}".`;
				deleteLog = [...deleteLog, `REFUSED (name "${confirmName}")`];
				return;
			}
			deleteLog = [
				...deleteLog,
				`DELETED as ${deleteAsRole} · confirm="${confirmName}" · ack=${acknowledgePayoutLoss} · ${entries} entries · ${rewards} reward rows`
			];
		}, 120);
	}
	function forceReset() {
		// Play everything up to the grand final, then hand game one to the LB side.
		let guard = 0;
		while (guard++ < 300) {
			const gf = sim.matches.find((m) => m.bracket === 'grand_final');
			if (gf && gf.status !== 'complete' && gf.entry_a_id && gf.entry_b_id) break;
			if (!playNext(sim)) break;
		}
		playNext(sim, 'b');
	}
</script>

<svelte:head>
	<title>DEV · Tournaments harness</title>
</svelte:head>

{#if view === 'tv'}
	<!-- Pinned to the viewport exactly as /tournaments/[id]/tv mounts it. -->
	<TvStage
		tournament={tvTournament}
		entries={sim.entries}
		styles={sim.styles}
		matches={sim.matches}
		games={sim.games}
		members={simMembers}
		shareUrl="https://ideabosco.com/tournaments/sim-demo"
		showHint={false}
	/>
{:else if view === 'host'}
	<!-- The host console's measure (`tnm-page wide`, the real route's). -->
	<div class="tnm-root tnm-shell">
		<main class="tnm-page wide">
			<h1 class="room-h1">Host console · match control</h1>
			<p class="note">
				The real HostMatchControl in the room, {fieldSize} entries, {stateParam || 'fresh'}.
				{hostScoreEntry ? 'Score entry.' : 'Win/loss entry.'}
			</p>
			<section class="card matches">
				<h2>Match control</h2>
				<HostMatchControl
					matches={sim.matches}
					{entries}
					members={simMembers}
					scoreEntry={hostScoreEntry}
					busy={hostBusy}
					{...hostTransports}
				/>
			</section>
			{#if hostLog.length}
				<div class="audit" data-testid="host-log">
					<strong>Transport log</strong>
					{#each hostLog as line, i (i)}<div>{line}</div>{/each}
				</div>
			{/if}
		</main>
	</div>
{:else if view === 'page'}
	<!-- The event page's measure: the CONSOLE (the window, less the gutter),
	     so the bracket takes the width Mr. Pina's 2844px screen gives it. -->
	<div class="tnm-root tnm-shell">
		<main class="tnm-page console">
			<section class="hero">
				<div class="eyebrow">IDEA // Tournaments</div>
				<div class="title-row">
					<h1>Harness Invitational</h1>
					{#if sim.status === 'complete'}
						<span class="tnm-status done">Complete</span>
					{:else}
						<span class="tnm-live tnm-status live">Live</span>
					{/if}
				</div>
				<div class="rail-row"><EventRail matches={sim.matches} {now} /></div>
			</section>
			<!-- THE BRACKET STAGE: the second caller of fullscreen.ts. The
			     section itself is what goes full screen, so the control is
			     inside it and stays on screen either way; the theme's
			     `.bracket-stage:fullscreen` puts the plate back under it. -->
			<section class="block bracket-stage" bind:this={stageEl} data-testid="bracket-stage">
				<div class="stage-head">
					<h2>Bracket · {fieldSize} entries</h2>
					<button
						type="button"
						class="btn secondary"
						data-testid="bracket-fullscreen"
						aria-pressed={stageFull}
						onclick={() => toggleFullscreen(stageEl, document)}
					>
						{stageFull ? 'Exit full screen' : 'Full screen'}
					</button>
				</div>
				<BracketView
					matches={sim.matches}
					{entries}
					styles={sim.styles}
					games={sim.games}
					championId={sim.championId}
					tournamentId="sim"
				/>
			</section>
			<section class="block">
				<h2>Entries ({sim.entries.length})</h2>
				<p class="note tnm-prose">
					Every banner names its registrants (0192): a team of two shows both names under
					the entry name, a solo whose captain is named as the entry shows nothing extra.
				</p>
				<div class="entries-grid" data-testid="page-entries">
					{#each sim.entries as e (e.id)}
						<EntryBanner
							entry={e}
							style={sim.styles[e.id] ?? null}
							size="md"
							seed={e.seed}
							members={memberNames(simMembers[e.id])}
						/>
					{/each}
				</div>
			</section>
			<section class="card">
				<h2>Room copy</h2>
				<p>Plain paragraph copy inside a card, on the room's panel.</p>
				<p class="note">Secondary copy in the room's dim ink.</p>
				<a href="/dev/tournaments">A bare link in the room</a>
			</section>
		</main>
	</div>
{:else if view === 'list'}
	<!-- The list page: the REAL board inside the room at the board's measure,
	     the way /tournaments mounts it. The hero is the route's; the board is
	     the whole screen under it. -->
	<div class="tnm-root tnm-shell">
		<main class="tnm-page wide">
			<section class="hero">
				<div class="eyebrow">IDEA // Tournaments</div>
				<h1>Tournaments</h1>
				<p class="lead tnm-prose">
					Live double-elimination brackets, open to watch by anyone. Sign in to enter or to host.
				</p>
			</section>
			<TournamentBoard
				tournaments={boardTournaments}
				entries={boardEntries}
				matches={sim.matches}
				styles={sim.styles}
				hostedIds={boardHostedIds}
				isAdmin={boardAdmin}
				signedIn={boardSignedIn}
				{now}
				rewardCountById={boardRewardCount}
				rewardCoinsById={boardRewardCoins}
				rewardEntriesById={boardRewardEntries}
				myInvites={boardInvites}
				onrespond={boardSignedIn ? boardRespond : undefined}
				ondelete={boardSignedIn ? boardDelete : undefined}
				deleteBusyId={boardDeleteBusy}
				deleteErrors={boardDeleteErrors}
				inviteBusyId={boardInviteBusy}
			/>
			<div class="audit" data-testid="board-log">
				<strong>Transport trail</strong>
				<div>
					viewer: {boardSignedIn ? 'signed in' : 'signed out'}{boardAdmin ? ' · admin' : ''}{boardHostedIds.length
						? ` · hosts ${boardHostedIds.join(', ')}`
						: ''} · {boardTournaments.length} tournaments · {boardEntries.length} entries
				</div>
				{#each boardLog as line, i (i)}<div>{line}</div>{/each}
			</div>
		</main>
	</div>
{:else if view === 'register'}
	<div class="tnm-root tnm-shell">
		<main class="tnm-page">
			<h1 class="room-h1">Register · {registerTeamSize > 1 ? `teams of up to ${registerTeamSize}` : 'solo'}</h1>
			<p class="note">
				The real RegisterEntry in the room. It emits a draft and nothing else; the trail below is
				what the route would upload and send.
			</p>
			<RegisterEntry
				teamSize={registerTeamSize}
				invite={registerInvite}
				{onregister}
				ondecline={registerInvite ? () => (registerLog = [...registerLog, 'declined']) : undefined}
			/>
			<div class="audit" data-testid="register-log">
				<strong>Drafts emitted</strong>
				{#if !registerLog.length}<div>(none yet)</div>{/if}
				{#each registerLog as line, i (i)}<div>{line}</div>{/each}
			</div>
		</main>
	</div>
{:else if view === 'team'}
	<div class="tnm-root tnm-shell">
		<main class="tnm-page">
			<h1 class="room-h1">Your entry · {teamStatus}</h1>
			<p class="note">
				The real EntryTeamPanel for {teamEntry?.display_name ?? 'entry 1'} against the sim's 0192
				transports, viewed as {teamViewerId === SIM_VIEWER_ID ? 'the captain' : 'a host (nobody\'s row)'}.
				Teams of up to {sim.teamSize}.
			</p>
			{#if teamEntry}
				<div class="team-banner">
					<EntryBanner
						entry={teamEntry}
						style={sim.styles[teamEntry.id] ?? null}
						size="md"
						seed={teamEntry.seed}
						members={memberNames(simMembers[teamEntry.id])}
					/>
				</div>
				<EntryTeamPanel
					entry={teamEntry}
					members={teamMembers}
					teamSize={sim.teamSize}
					status={teamStatus}
					viewerId={teamViewerId}
					manager={teamManager}
					error={teamError}
					{...teamTransports}
				/>
			{/if}
			<div class="audit" data-testid="team-log">
				<strong>Transport trail</strong>
				{#if !teamLog.length}<div>(none yet)</div>{/if}
				{#each teamLog as line, i (i)}<div>{line}</div>{/each}
			</div>
		</main>
	</div>
{:else}
<main class="harness">
	<h1>Tournaments harness (dev)</h1>
	<p class="note">
		In-memory simulator mirroring the 0062 double-elimination rules, driving the real
		components. No auth, no Supabase.
	</p>

	<div class="controls">
		<span>Field:</span>
		{#each [2, 4, 5, 6, 8, 11, 16] as n (n)}
			<button class="ctl" class:on={fieldSize === n} onclick={() => rebuild(n)}>{n}</button>
		{/each}
		<span class="sep"></span>
		<button class="ctl" onclick={() => startNext(sim)}>start next (LIVE)</button>
		<button class="ctl" onclick={() => playNext(sim)}>play next</button>
		<button class="ctl" onclick={() => forfeitNext(sim)}>forfeit next</button>
		<button class="ctl" onclick={() => (detailId = correctLast(sim) ?? detailId)}>
			correct last
		</button>
		<button class="ctl" onclick={playAll}>play all</button>
		<button class="ctl" onclick={forceReset}>force GF reset</button>
		<button class="ctl" onclick={() => rebuild(fieldSize)}>rebuild</button>
		<span class="state">
			{sim.status === 'complete' ? 'COMPLETE' : 'LIVE'} ·
			{sim.matches.filter((m) => m.status === 'complete').length}/{sim.matches.length} matches
		</span>
	</div>

	<section>
		<h2>Members · EntryTeamPanel + RegisterEntry (0192)</h2>
		<p class="note">
			Entry 1 is a team of two (Azad, the captain with the harness's own account, and Diego,
			unlinked). The panel's controls follow the status picked here and every write goes
			through the sim's 0192 mirrors, which refuse what the RPCs refuse: teammates only in
			the window, names lock from live on, the last member and the captain's row stay.
			Adding a teammate by account email is a manager's act: the "as host" toggle mounts the
			panel with <code>manager</code> on, and off it the sim refuses an email the way the RPC does.
			<code>?view=team&amp;state=open</code> for the panel alone,
			<code>?view=register&amp;team=2</code> for the form alone.
		</p>
		<div class="controls">
			<span>Status:</span>
			{#each ['registration_open', 'seeding', 'live', 'complete'] as st (st)}
				<button class="ctl" class:on={teamStatus === st} onclick={() => (teamStatus = st as TournamentStatus)}>
					{st}
				</button>
			{/each}
			<span class="sep"></span>
			<button class="ctl" onclick={joinDemo}>join entry 3 as a second account</button>
			<button class="ctl" class:on={membersAsHost} onclick={() => (membersAsHost = !membersAsHost)}>
				as host
			</button>
			<span class="state">{sim.members.length} members over {sim.entries.length} entries · teams of up to {sim.teamSize}</span>
		</div>
		<div class="tnm-root room-box members-grid">
			<div>
				{#if teamEntry}
					<EntryTeamPanel
						entry={teamEntry}
						members={teamMembers}
						teamSize={sim.teamSize}
						status={teamStatus}
						viewerId={SIM_VIEWER_ID}
						manager={teamManager}
						error={teamError}
						{...teamTransports}
					/>
				{/if}
			</div>
			<div>
				<RegisterEntry teamSize={sim.teamSize} {onregister} />
			</div>
		</div>
		<div class="audit" data-testid="members-audit">
			<strong>Raw check</strong>
			{#each sim.entries as e (e.id)}
				<div>
					{e.display_name}: {membersOf(sim, e.id)
						.map((m) => `${m.name}${m.user_id ? ` (${m.user_id})` : ' (unlinked)'}`)
						.join(', ')}
				</div>
			{/each}
			{#each teamLog as line, i (i)}<div>{line}</div>{/each}
			{#each registerLog as line, i (i)}<div>draft {line}</div>{/each}
		</div>
	</section>

	<section>
		<h2>HostMatchControl · the host console's match card (0077)</h2>
		<p class="note">
			The real control the host runs a bracket from, in the room, against the sim: Start the
			next match, pick a winner, submit, forfeit with a preset reason. Add <code>?view=host</code>
			for it alone, <code>&amp;scores=1</code> for score entry.
		</p>
		<div class="tnm-root room-box">
			<section class="card matches">
				<h2>Match control</h2>
				<HostMatchControl
					matches={sim.matches}
					{entries}
					members={simMembers}
					scoreEntry={hostScoreEntry}
					busy={hostBusy}
					{...hostTransports}
				/>
			</section>
		</div>
		{#if hostLog.length}
			<div class="audit" data-testid="host-log">
				<strong>Transport log</strong>
				{#each hostLog as line, i (i)}<div>{line}</div>{/each}
			</div>
		{/if}
	</section>

	<section>
		<h2>EventRail · the bracket filling in (0077)</h2>
		<div class="tnm-root room-box">
			<EventRail matches={sim.matches} {now} />
		</div>
	</section>

	<section>
		<h2>BracketView · {fieldSize} entries</h2>
		<p class="note">
			Entries 1-5 carry sample 0064 styles (all three background types, four flourishes, accents
			across the wheel); the rest carry none, so the default treatment sits beside them. A
			forfeited match shows a dashed gold frame and an FF chip; a bye stays dimmed.
		</p>
		<div class="controls">
			<label class="chk">
				<input type="checkbox" bind:checked={linkMatches} /> link nodes to match detail
			</label>
			<span class="state">forfeited: {forfeited.length}</span>
		</div>
		<BracketView
			matches={sim.matches}
			{entries}
			styles={sim.styles}
			games={sim.games}
			championId={sim.championId}
			tournamentId={linkMatches ? 'sim' : null}
		/>
	</section>

	<section>
		<h2>TournamentStats · the secondary strip on the public page</h2>
		<p class="note">
			Play some matches, then check these against the raw stamps below. Byes and forfeits are
			excluded from every duration figure by design.
		</p>
		<TournamentStats tournamentId="sim" matches={sim.matches} {entries} />
		<div class="audit">
			<strong>Raw check</strong>
			<div>timed matches: {stats.timedCount}</div>
			<div>
				durations (s):
				{sim.matches
					.filter((m) => m.status === 'complete' && !isByeMatch(m) && !isForfeitMatch(m) && m.started_at && m.completed_at)
					.map((m) => Math.round((Date.parse(m.completed_at!) - Date.parse(m.started_at!)) / 1000))
					.join(', ') || '(none)'}
			</div>
			<div>average (s): {stats.averageDurationMs === null ? 'none' : Math.round(stats.averageDurationMs / 1000)}</div>
			<div>
				span (s):
				{stats.totalDurationMs === null ? 'none' : Math.round(stats.totalDurationMs / 1000)}
				({stats.firstStartedAt ?? 'none'} → {stats.lastCompletedAt ?? 'none'})
			</div>
		</div>
	</section>

	<section>
		<h2>MatchDetail · the real page body</h2>
		<div class="controls">
			<label class="chk">
				<input type="checkbox" bind:checked={qualDetail} /> qualifying match instead
			</label>
			{#if !qualDetail}
				<span>Match:</span>
				{#each inspectable.slice(0, 14) as m (m.id)}
					<button
						class="ctl"
						class:on={detailMatch?.id === m.id}
						onclick={() => (detailId = m.id)}
					>
						{m.bracket === 'winners'
							? 'W'
							: m.bracket === 'losers'
								? 'L'
								: m.bracket === 'grand_final'
									? 'GF'
									: 'GFR'}{m.bracket === 'winners' || m.bracket === 'losers'
							? `${m.round}-${m.slot}`
							: ''}{isForfeitMatch(m) ? ' ff' : isByeMatch(m) ? ' bye' : ''}
					</button>
				{/each}
			{/if}
		</div>
		{#if qualDetail}
			<MatchDetail
				tournament={simTournament}
				kind="qual"
				qualMatch={qualDetailMatch}
				qualPool={qual.pools.find((p) => p.id === qualDetailMatch.pool_id) ?? null}
				entries={qual.entries}
				events={qual.events.filter((e) => e.match_id === qualDetailMatch.id)}
			/>
		{:else if detailMatch}
			{@const tl = matchTimeline(eventsFor(sim, detailMatch.id), detailMatch)}
			<MatchDetail
				tournament={simTournament}
				kind="bracket"
				match={detailMatch}
				entries={sim.entries}
				styles={Object.values(sim.styles)}
				events={eventsFor(sim, detailMatch.id)}
				games={sim.games.filter((g) => g.bracket_match_id === detailMatch.id)}
				siblings={sim.matches}
				ledger={sim.ledger.filter((r) => r.match_id === detailMatch.id)}
				members={sim.members}
			/>
			<div class="audit">
				<strong>Raw check</strong>
				<div>created {tl.createdAt ?? 'none'}</div>
				<div>started {tl.startedAt ?? 'none'}</div>
				<div>completed {tl.completedAt ?? 'none'}</div>
				<div>
					wait {tl.waitMs === null ? 'none' : Math.round(tl.waitMs / 1000) + 's'} · duration
					{tl.durationMs === null ? 'none' : Math.round(tl.durationMs / 1000) + 's'}
				</div>
				<div>events {tl.events.length} · corrections {tl.corrections.length}</div>
				<div>ledger rows for this match: {sim.ledger.filter((r) => r.match_id === detailMatch.id).length}</div>
			</div>
		{/if}
	</section>

	<section>
		<h2>EntryDetail · the real page body</h2>
		<div class="controls">
			<span>Entry:</span>
			{#each sim.entries as e (e.id)}
				<button
					class="ctl"
					class:on={entryDetailEntry?.id === e.id}
					onclick={() => (entryDetailId = e.id)}
				>
					{e.display_name}
				</button>
			{/each}
		</div>
		{#if entryDetailEntry}
			<EntryDetail
				tournament={simTournament}
				entry={entryDetailEntry}
				entries={sim.entries}
				styles={Object.values(sim.styles)}
				bracketMatches={sim.matches}
				games={sim.games}
				ledger={sim.ledger}
				members={sim.members}
			/>
			{#if entryAudit}
				<div class="audit">
					<strong>Raw check</strong>
					<div>
						record from rows: {entryAudit.rec.wins}-{entryAudit.rec.losses} (byes
						{entryAudit.rec.byes}, by forfeit {entryAudit.rec.forfeitWins}-{entryAudit.rec
							.forfeitLosses})
					</div>
					<div>
						ledger rows {entryAudit.ledgerRows} (one per registrant per award, 0192) · summed
						+{entryAudit.ledgerTotal}
					</div>
					<div>ledger rows attached to ANY forfeited match: {entryAudit.forfeitLedgerRows}</div>
				</div>
			{/if}
		{/if}
	</section>

	<section>
		<h2>ForfeitForm · the host console action</h2>
		<p class="note">
			Pick a side and a reason, then confirm. The payload below is exactly what the host console
			sends to tournament_submit_match_result; applying it runs the sim's forfeit path (no games,
			no reward).
		</p>
		{#if readyMatch}
			<div class="card pad">
				<ForfeitForm
					match={readyMatch}
					{entries}
					onsubmit={(payload) => {
						lastForfeitPayload = JSON.stringify(payload);
						forfeitNext(sim, payload.reason);
					}}
				/>
			</div>
			{#if lastForfeitPayload}
				<div class="audit"><strong>Last payload</strong> <code>{lastForfeitPayload}</code></div>
			{/if}
		{:else}
			<p class="note">No startable match left. Rebuild the field.</p>
		{/if}
	</section>

	<section>
		<h2>DeleteTournament · host console + list control</h2>
		<p class="note">
			Mirrors 0066 + 0068: the typed name is required exactly when the tournament has entries, a
			distinct payout-loss acknowledgment is required first whenever the tournament has any reward
			ledger rows, and only a host or a site admin gets through. The RPC enforces all of it
			server-side; this form only keeps the button off input the server would reject. This sim's
			ledger currently totals {deleteRewardCoins}{COIN_SYMBOL} across {deleteRewardEntries} entries ({deleteRewardCount}
			rows) -- play a bracket forward (below) to grow it.
		</p>
		<div class="controls">
			<span>Caller:</span>
			{#each ['host', 'admin', 'student'] as r (r)}
				<button
					class="ctl"
					class:on={deleteAsRole === r}
					onclick={() => (deleteAsRole = r as typeof deleteAsRole)}
				>
					{r}
				</button>
			{/each}
			<span class="sep"></span>
			<label class="chk">
				<input type="checkbox" bind:checked={deleteEntries} /> has entries ({sim.entries.length})
			</label>
		</div>
		<div class="card pad">
			<DeleteTournament
				tournament={deletable}
				entryCount={deleteEntries ? sim.entries.length : 0}
				matchCount={sim.matches.length}
				rewardCount={deleteRewardCount}
				rewardCoins={deleteRewardCoins}
				rewardEntries={deleteRewardEntries}
				busy={deleteBusy}
				error={deleteError}
				ondelete={fakeDelete}
			/>
		</div>
		<div class="pad-top">
			<span class="cell-tag">compact variant (tournament list)</span>
			<DeleteTournament
				tournament={deletable}
				entryCount={deleteEntries ? sim.entries.length : 0}
				rewardCount={deleteRewardCount}
				rewardCoins={deleteRewardCoins}
				rewardEntries={deleteRewardEntries}
				compact
				busy={deleteBusy}
				error={deleteError}
				ondelete={fakeDelete}
			/>
		</div>
		{#if deleteLog.length}
			<div class="audit">
				<strong>Attempts</strong>
				{#each deleteLog as line, i (i)}<div>{line}</div>{/each}
			</div>
		{/if}
	</section>

	<section>
		<h2>EntryBanner · styled vs default</h2>
		<div class="banner-grid">
			{#each sim.entries.slice(0, 7) as e (e.id)}
				<div class="banner-cell">
					<span class="cell-tag">{hasStyle(sim.styles[e.id]) ? 'styled' : 'no style set'}</span>
					<EntryBanner
						entry={e}
						style={sim.styles[e.id] ?? null}
						size="md"
						seed={e.seed}
						members={memberNames(simMembers[e.id])}
					/>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>EntryStyleEditor · live save into the sim</h2>
		<div class="controls">
			<span>Entry:</span>
			{#each sim.entries.slice(0, 7) as e (e.id)}
				<button
					class="ctl"
					class:on={editEntry?.id === e.id}
					onclick={() => (editId = e.id)}
				>
					{e.display_name}
				</button>
			{/each}
		</div>
		{#if editEntry}
			<div class="card pad">
				<EntryStyleEditor
					entry={editEntry}
					style={sim.styles[editEntry.id] ?? null}
					note="Saves into the in-memory sim; the bracket and TV stage above/below update live."
					onsave={(draft) => saveStyle(editEntry.id, draft)}
				/>
			</div>
		{/if}
	</section>

	<section>
		<h2>TvStage · the real projector component</h2>
		<div class="controls">
			<span>Status:</span>
			{#each ['registration_open', 'seeding', 'live', 'complete'] as s (s)}
				<button
					class="ctl"
					class:on={tvStatus === s}
					onclick={() => (tvStatus = s as Tournament['status'])}
				>
					{s}
				</button>
			{/each}
			<span class="sep"></span>
			<span class="state">
				start a match for the live view · play one for the result beat (13s) · <code>?view=tv</code> for the full viewport
			</span>
		</div>
		<div class="tv-frame">
			<TvStage
				tournament={tvTournament}
				entries={sim.entries}
				styles={sim.styles}
				matches={sim.matches}
				games={sim.games}
				members={simMembers}
				shareUrl="https://ideabosco.com/tournaments/sim-demo"
				showHint={false}
				fullscreen={false}
			/>
		</div>
	</section>

	<section>
		<h2>PoolsView · sample quals (score mode)</h2>
		<PoolsView pools={qual.pools} matches={qual.matches} entries={qualEntries} scoreEntry />
	</section>

	<section>
		<h2>Rewards · RewardRulesEditor + RewardsPanel (0063 mirror)</h2>
		<p class="note">
			Save rules, rebuild, then play matches: win + winners-round bonuses pay per entered
			result (byes pay nothing) and 1st/2nd/3rd settle when the grand final decides.
		</p>
		<div class="card pad">
			<RewardRulesEditor
				rules={sim.rewardRules}
				onsave={(rules) => setSimRewardRules(sim, rules)}
			/>
		</div>
		<div class="pad-top">
			<RewardsPanel rules={sim.rewardRules} ledger={sim.ledger} {entries} />
		</div>
	</section>

	<section>
		<h2>TournamentQr · registration_open card</h2>
		<div class="card pad">
			<TournamentQr url="https://ideabosco.com/tournaments/sim-demo" name="Harness Invitational" />
		</div>
	</section>
</main>
{/if}

<style>
	.harness {
		max-width: 76rem;
		margin: 0 auto;
		padding: 1.5rem 1.2rem 4rem;
	}
	/* The room views take the theme's own measures (`tnm-page`, `.wide`,
	 * `.console`), exactly the classes the real routes wear. */
	.room-h1 {
		margin-top: 1.4rem;
	}
	/* The bracket stage's head: the heading and the fullscreen control on
	 * one row, the control at the 44px floor the room's .btn already sets. */
	.stage-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.stage-head h2 {
		margin: 0;
	}
	.entries-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		gap: 0.8rem;
		margin-top: 0.8rem;
	}
	.team-banner {
		max-width: 28rem;
		margin-bottom: 1rem;
	}
	.members-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		gap: 1rem;
		align-items: start;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.title-row h1 {
		margin: 0;
	}
	.rail-row {
		margin: 1rem 0 0.2rem;
		max-width: 44rem;
	}
	.block {
		margin-top: 1.6rem;
	}
	.room-box {
		padding: 1rem;
		border-radius: 10px;
	}
	.note {
		color: var(--dim, #7a8a7a);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		margin: 1rem 0 1.4rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim, #7a8a7a);
	}
	.ctl {
		background: var(--bg1, #0d120d);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.ctl.on {
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
	}
	.sep {
		width: 0.8rem;
	}
	.state {
		margin-left: auto;
	}
	section {
		margin-top: 2rem;
	}
	.harness h2 {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green, #00ff41);
	}
	.pad {
		padding: 1rem;
	}
	.chk {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
	.audit {
		margin-top: 0.8rem;
		padding: 0.6rem 0.8rem;
		border: 1px dashed var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 5px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim, #7a8a7a);
		line-height: 1.7;
		overflow-x: auto;
	}
	.audit strong {
		color: var(--white, #e8ffe8);
	}
	.pad-top {
		margin-top: 1rem;
	}
	.banner-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr));
		gap: 0.8rem;
	}
	.banner-cell {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.cell-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim, #7a8a7a);
	}
	/* TvStage pins itself to its nearest positioned ancestor when
	 * fullscreen={false}, so the harness gives it a real projector-shaped box. */
	.tv-frame {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		max-height: 78vh;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 8px;
		overflow: hidden;
	}
</style>
