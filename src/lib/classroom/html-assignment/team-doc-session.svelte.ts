/**
 * ONE STUDENT'S LIVE TEAM DOCUMENT ON ONE PAGE (ledger 0436, 0302).
 *
 * The reactive half of `./team-doc`, in the shape `HxAnswersStore` takes for
 * the answers: `$state` and plain methods, NO `$effect` (the lifecycle belongs
 * to whoever mounts it, through `start()`'s teardown).
 *
 * WHAT IT DOES:
 *   - reads the student's team document (`classroom_team_document`) on start,
 *     on the team's `team-doc` notice, on the section's `teams` notice (a draw
 *     posted, unposted or edited: the switch) and when the tab comes back;
 *   - lays the team's saved answers over the student's copy through
 *     `adoptRemote`, which never overwrites unsaved typing;
 *   - takes a box's lock on focus and releases it on blur, after the box's
 *     own write has landed, so a teammate is never handed a box with a save
 *     still in flight;
 *   - tells the page what to draw: the waiting sentence before teams are
 *     posted, and per field who may type (`teamStatePayload`).
 *
 * THE NOTICE IS THE SPEED, THE TAB RETURN IS THE FLOOR, AND NO INTERVAL RUNS:
 * the item page's call budget is spent (tests/classroom-poll.test.ts). A lock
 * running out needs no network at all: the page redraws at the moment the
 * lock's two minutes end (`teamNextLockChange`).
 */

import type { HtmlAssignmentManifest } from './manifest';
import {
	hxTeamBlocks,
	parseTeamDocument,
	teamFieldStates,
	teamFieldWritable,
	teamLiveKey,
	teamNextLockChange,
	teamStatePayload,
	teamValuesFor,
	teamWaitingWords,
	type HxTeamFieldState,
	type HxTeamStatePayload,
	type TeamDocument
} from './team-doc';
import { TEAM_NOTICE_JITTER_MS, type ClassroomLive } from '$lib/classroom/live';

export interface TeamDocTransports {
	/** `classroom_team_document(item)`'s raw answer, or null on a failed read. */
	read(itemId: string): Promise<unknown>;
	/** `classroom_team_box_lock(item, block, take)`'s raw answer, or null on a failed call. */
	lock(itemId: string, blockId: string, take: boolean): Promise<unknown>;
}

/** What the session needs of the answers controller, and nothing else. */
export interface TeamDocAnswers {
	adoptRemote(values: Record<string, string | boolean>, readSince?: number): string[];
	flush(): Promise<void>;
}

export interface TeamDocSessionOptions {
	itemId: string;
	/** The section the page is in, whose channel hears a draw being posted. */
	sectionId: string;
	manifest: HtmlAssignmentManifest;
	transports: TeamDocTransports;
	answers: TeamDocAnswers;
	live: ClassroomLive | null;
	now?: () => number;
}

export class TeamDocSession {
	readonly #opts: TeamDocSessionOptions;
	readonly #blocks: ReturnType<typeof hxTeamBlocks>;
	readonly #now: () => number;
	#doc = $state<TeamDocument | null>(null);
	/** Bumped when a lock runs out on the clock, so states re-derive with no read. */
	#tick = $state(0);
	/** Server minus client, from the last read. */
	#skew = 0;
	#loaded = $state(false);
	#reading = false;
	#again = false;
	#wait: ReturnType<typeof setTimeout> | null = null;
	#expiry: ReturnType<typeof setTimeout> | null = null;
	#teamOff: (() => void) | null = null;
	#teamKey: string | null = null;
	#stopped = false;
	/** Fields this page holds the lock on, so a blur releases only its own. */
	readonly #held = new Set<string>();

	constructor(opts: TeamDocSessionOptions) {
		this.#opts = opts;
		this.#blocks = hxTeamBlocks(opts.manifest);
		this.#now = opts.now ?? (() => Date.now());
	}

	/** The last read, or null before one has answered. */
	get doc(): TeamDocument | null {
		return this.#doc;
	}

	/** True once the first read has answered (either way). */
	get loaded(): boolean {
		return this.#loaded;
	}

	/** The sentence to show INSTEAD of the document, or null when there is a team. */
	get waiting(): string | null {
		return this.#loaded ? teamWaitingWords(this.#doc) : null;
	}

	/** Per shared field, who may type. Empty before a team is known. */
	get fieldStates(): Record<string, HxTeamFieldState> {
		void this.#tick;
		const doc = this.#doc;
		if (!doc?.team) return {};
		return teamFieldStates(this.#opts.manifest, doc, this.#now(), this.#skew);
	}

	/** The whole `idea:team-state` payload, or null with no team. */
	get statePayload(): HxTeamStatePayload | null {
		void this.#tick;
		const doc = this.#doc;
		if (!doc?.team) return null;
		return teamStatePayload(this.#opts.manifest, doc, this.#now(), this.#skew);
	}

	/** May this field be typed into now? A non-shared field always may. */
	mayWrite(field: string): boolean {
		return teamFieldWritable(this.fieldStates[field]);
	}

	/** Whether a block is a team or role block of this manifest. */
	shares(blockId: string): boolean {
		return this.#blocks.has(blockId);
	}

	/**
	 * Read now (coalescing: a read already running is followed by exactly one
	 * more). Never throws: a failed read keeps what the page holds.
	 */
	async refresh(): Promise<void> {
		if (this.#stopped) return;
		if (this.#reading) {
			this.#again = true;
			return;
		}
		this.#reading = true;
		const since = this.#now();
		try {
			const raw = await this.#opts.transports.read(this.#opts.itemId);
			if (this.#stopped) return;
			const doc = parseTeamDocument(raw);
			if (doc) this.#adopt(doc, since);
		} catch {
			/* the floor reads again */
		} finally {
			this.#reading = false;
			this.#loaded = true;
		}
		if (this.#again && !this.#stopped) {
			this.#again = false;
			await this.refresh();
		}
	}

	/** A notice arrived: read after a short wait that coalesces a burst. */
	noticed = (): void => {
		if (this.#wait || this.#stopped) return;
		this.#wait = setTimeout(() => {
			this.#wait = null;
			void this.refresh();
		}, Math.random() * TEAM_NOTICE_JITTER_MS);
	};

	/**
	 * Take a read (or a local change to the last one). `values` false is a lock
	 * moving on this page: the answers it carries are the LAST read's, possibly
	 * older than this page's own latest write, so they are not laid down again.
	 */
	#adopt(doc: TeamDocument, readSince?: number, values = true): void {
		const server = doc.serverNow ? Date.parse(doc.serverNow) : NaN;
		this.#skew = Number.isFinite(server) ? server - this.#now() : 0;
		const teamChanged = (this.#doc?.team?.id ?? null) !== (doc.team?.id ?? null);
		this.#doc = doc;
		if (doc.team && values) this.#opts.answers.adoptRemote(teamValuesFor(this.#opts.manifest, doc), readSince);
		if (teamChanged) {
			this.#held.clear();
			this.#listenToTeam(doc.team ? teamLiveKey(doc.team.id) : null);
		}
		this.#armExpiry();
	}

	#armExpiry(): void {
		if (this.#expiry) clearTimeout(this.#expiry);
		this.#expiry = null;
		const doc = this.#doc;
		if (!doc) return;
		const at = teamNextLockChange(doc, this.#now(), this.#skew);
		if (at === null) return;
		this.#expiry = setTimeout(() => {
			this.#expiry = null;
			this.#tick += 1;
			this.#armExpiry();
		}, Math.max(0, at - this.#now()) + 50);
	}

	#listenToTeam(key: string | null): void {
		if (key === this.#teamKey) return;
		this.#teamOff?.();
		this.#teamOff = null;
		this.#teamKey = key;
		const live = this.#opts.live;
		if (!key || !live) return;
		this.#teamOff = live.subscribe(key, (topic) => {
			if (topic === 'team-doc') this.noticed();
		});
	}

	/**
	 * A field gained focus: take its lock. A refusal (a teammate got there
	 * first) re-reads, so the field draws read only with their name on it.
	 */
	async focus(blockId: string, field: string): Promise<void> {
		if (!this.#blocks.has(blockId) || !this.#doc?.team || !this.mayWrite(field)) return;
		const raw = (await this.#opts.transports.lock(this.#opts.itemId, blockId, true).catch(() => null)) as
			| { ok?: boolean; value?: unknown; until?: string }
			| null;
		if (raw?.ok) {
			this.#held.add(blockId);
			const doc = this.#doc;
			if (doc?.team) {
				const locks = { ...doc.locks, [blockId]: { by: '', mine: true, until: String(raw.until ?? '') } };
				const next = { ...doc, locks };
				if (raw.value !== undefined && raw.value !== null) {
					next.values = { ...doc.values, [blockId]: { value: raw.value, by: doc.values[blockId]?.by ?? null, at: null } };
					// The box's latest stored answer, laid down for this one field
					// only (and never over typing already under way).
					const one = teamValuesFor(this.#opts.manifest, next)[field];
					if (one !== undefined) this.#opts.answers.adoptRemote({ [field]: one });
				}
				this.#adopt(next, undefined, false);
			}
			this.#opts.live?.announce(teamLiveKey(this.#doc!.team!.id), 'team-doc');
			return;
		}
		await this.refresh();
	}

	/** A field lost focus: let its write land, then release the lock. */
	async blur(blockId: string): Promise<void> {
		if (!this.#held.has(blockId)) return;
		this.#held.delete(blockId);
		await this.#opts.answers.flush().catch(() => {});
		await this.#opts.transports.lock(this.#opts.itemId, blockId, false).catch(() => null);
		const doc = this.#doc;
		if (doc?.team) {
			const { [blockId]: _gone, ...locks } = doc.locks;
			this.#adopt({ ...doc, locks }, undefined, false);
			this.#opts.live?.announce(teamLiveKey(doc.team.id), 'team-doc');
		}
	}

	/**
	 * A shared field changed on this page: its save takes the lock on the
	 * server (0302), so this page now holds it and a blur must release it.
	 */
	changed(blockId: string): void {
		if (this.#blocks.has(blockId) && this.#doc?.team) this.#held.add(blockId);
	}

	/** This page's write landed: tell the teammates (the database tells them too where it can). */
	announceSaved(): void {
		const team = this.#doc?.team;
		if (team) this.#opts.live?.announce(teamLiveKey(team.id), 'team-doc');
	}

	/** Listen, read once, and hand back the teardown. */
	start(): () => void {
		this.#stopped = false;
		const live = this.#opts.live;
		const off = live?.subscribe(this.#opts.sectionId, (topic) => {
			if (topic === 'teams') this.noticed();
		});
		const back = () => {
			if (typeof document !== 'undefined' && document.visibilityState === 'visible') void this.refresh();
		};
		if (typeof document !== 'undefined') document.addEventListener('visibilitychange', back);
		void this.refresh();
		return () => {
			this.#stopped = true;
			off?.();
			this.#teamOff?.();
			this.#teamOff = null;
			this.#teamKey = null;
			if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', back);
			if (this.#wait) clearTimeout(this.#wait);
			if (this.#expiry) clearTimeout(this.#expiry);
			this.#wait = null;
			this.#expiry = null;
			for (const blockId of this.#held) void this.#opts.transports.lock(this.#opts.itemId, blockId, false).catch(() => null);
			this.#held.clear();
		};
	}
}
