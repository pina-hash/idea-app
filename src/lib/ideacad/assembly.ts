import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

/**
 * The IdeaCAD ASSEMBLY layer: a document holds ordered PARTS, each carrying its
 * own feature tree, and a part is held by at most one person at a time.
 *
 * Mr. Pina's design, 2026-09-12: an assembly has several parts, ONE PERSON
 * HOLDS A PART AT A TIME -- industry checkout, not concurrent editing of one
 * part -- switching who holds what must be extremely easy, and the assembly
 * owner has full control over who is editing what and can reassign teammates to
 * parts live. `supabase/migrations/0207_ideacad_assembly_parts.sql` is that, and
 * this module is the client's side of it.
 *
 * NO UI LIVES HERE, deliberately: types, the RPC boundary, the realtime channel
 * name and the pure predicates a surface needs in order to NOTICE a
 * reassignment. Nothing in this file renders and nothing imports Svelte.
 *
 * IT IS SELF-CONTAINED RATHER THAN FOLDED INTO `transports.ts`, because that
 * file belongs to another lane in flight (ledger 0179's sharing region). Wiring
 * `IdeacadAssemblyTransports` into `IdeacadTransports` is one line for whoever
 * owns that file next; two copies of the RPC names is what this shape avoids in
 * the meantime, since the names live here only.
 *
 * THE STALENESS WINDOW IS NOT WRITTEN DOWN IN THIS FILE, AND THAT IS THE WHOLE
 * POINT. `_ideacad_hold_window()` is the one statement of it, and
 * `ideacad_assembly` returns it as `holdWindowSeconds`; every predicate below
 * takes the number as a PARAMETER. A constant here would be a second copy of a
 * rule the database owns, and the two would stop agreeing the first time
 * somebody changed one of them.
 */

/** One row of `public.ideacad_parts`, as a direct select returns it. */
export interface IdeacadPartRow {
	id: string;
	document_id: string;
	position: number;
	name: string;
	active_concept_id: string | null;
	/** The email of the person who holds this part, or null when it is free. */
	held_by: string | null;
	held_at: string | null;
	hold_beat_at: string | null;
	/**
	 * A generation counter that increments every time the HOLDER CHANGES and
	 * never when the same person merely extends their hold. It is not a
	 * credential: every RPC that acts on a hold re-checks the caller's identity
	 * independently of it.
	 */
	hold_revision: number;
	created_at: string;
	updated_at: string;
}

/** One part as `ideacad_assembly` projects it, with the hold state resolved. */
export interface IdeacadAssemblyPart {
	id: string;
	position: number;
	name: string;
	activeConceptId: string | null;
	heldBy: string | null;
	heldAt: string | null;
	holdBeatAt: string | null;
	holdRevision: number;
	/** Whether the hold is still inside the window, computed by the database. */
	holdLive: boolean;
	/** Whether `heldBy` is the calling viewer, computed by the database. */
	holdIsMine: boolean;
	conceptCount: number;
}

/** Exact payload of `ideacad_assembly`. */
export interface IdeacadAssembly {
	documentId: string;
	viewer: string;
	isOwner: boolean;
	canWrite: boolean;
	/** The staleness window, in seconds. The database is its only author. */
	holdWindowSeconds: number;
	/**
	 * The sum of every part's `holdRevision`. Monotonically non-decreasing, so
	 * one integer comparison answers "has any holder on this assembly moved".
	 */
	holdRevisionTotal: number;
	parts: IdeacadAssemblyPart[];
}

/** Why a claim, release, heartbeat or reassignment answered as it did. */
export type IdeacadHoldReason =
	| 'claimed'
	| 'takeover'
	| 'resumed'
	| 'held'
	| 'released'
	| 'already_free'
	| 'not_yours'
	| 'beating'
	| 'lost'
	| 'lapsed'
	| 'assigned'
	| 'cleared'
	| 'unchanged';

/**
 * The structured answer every hold RPC returns. A refusal a student has to read
 * comes back `ok: false` with a reason rather than raising -- genuine misuse
 * (an unknown part, a caller who is not on the assembly) still raises.
 */
export interface IdeacadHoldResult {
	ok: boolean;
	reason: IdeacadHoldReason;
	partId: string;
	heldBy?: string | null;
	heldAt?: string | null;
	holdBeatAt?: string | null;
	previousHolder?: string | null;
	holdRevision: number;
}

/** Exact payload of `ideacad_add_part`. */
export interface IdeacadAddPartResult {
	ok: true;
	partId: string;
	position: number;
	name: string;
	activeConceptId: string;
}

/** The assembly RPC boundary. Absent transports remove the controls they drive. */
export interface IdeacadAssemblyTransports {
	assembly(documentId: string): Promise<IdeacadAssembly>;
	claimPart(partId: string): Promise<IdeacadHoldResult>;
	releasePart(partId: string): Promise<IdeacadHoldResult>;
	beatPart(partId: string, holdRevision: number): Promise<IdeacadHoldResult>;
	/** OWNER ONLY. `email` null takes the part off whoever holds it. */
	assignPart(partId: string, email: string | null): Promise<IdeacadHoldResult>;
	/** OWNER ONLY. */
	addPart?: (
		documentId: string,
		name: string,
		features: unknown
	) => Promise<IdeacadAddPartResult>;
	/** OWNER ONLY. */
	updatePartMeta?: (
		partId: string,
		name: string,
		position: number
	) => Promise<{ ok: true; partId: string; name: string; position: number }>;
	newPartConcept?: (partId: string, name: string, features: unknown) => Promise<unknown>;
	setPartActive?: (
		partId: string,
		conceptId: string
	) => Promise<{ ok: true; partId: string; activeConceptId: string }>;
}

/** Build the typed assembly RPC boundary around the signed-in Supabase client. */
export function createIdeacadAssemblyTransports(
	supabase: SupabaseClient
): IdeacadAssemblyTransports {
	const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
		const { data, error } = await supabase.rpc(name, args);
		if (error) throw new Error(error.message);
		return data as T;
	};
	return {
		assembly: (documentId) => rpc('ideacad_assembly', { p_document_id: documentId }),
		claimPart: (partId) => rpc('ideacad_claim_part', { p_part_id: partId }),
		releasePart: (partId) => rpc('ideacad_release_part', { p_part_id: partId }),
		beatPart: (partId, holdRevision) =>
			rpc('ideacad_beat_part', { p_part_id: partId, p_hold_revision: holdRevision }),
		assignPart: (partId, email) =>
			rpc('ideacad_assign_part', { p_part_id: partId, p_email: email }),
		addPart: (documentId, name, features) =>
			rpc('ideacad_add_part', {
				p_document_id: documentId,
				p_name: name,
				p_features: features
			}),
		updatePartMeta: (partId, name, position) =>
			rpc('ideacad_update_part_meta', {
				p_part_id: partId,
				p_name: name,
				p_position: position
			}),
		newPartConcept: (partId, name, features) =>
			rpc('ideacad_new_part_concept', {
				p_part_id: partId,
				p_name: name,
				p_features: features
			}),
		setPartActive: (partId, conceptId) =>
			rpc('ideacad_set_part_active', { p_part_id: partId, p_concept_id: conceptId })
	};
}

/**
 * How often a holder should heartbeat. The same ten seconds `live.ts` already
 * beats at, restated as its own name because it is answering a different
 * question (keeping a CLAIM alive, not keeping a roster row warm) and because
 * the window it has to stay inside is the database's, not this file's.
 */
export const IDEACAD_HOLD_BEAT_MS = 10_000;

/**
 * How often a client without realtime should re-read the assembly. The floor,
 * exactly as `IDEACAD_ROSTER_POLL_MS` is the floor for the live roster: a
 * reassignment must reach the displaced holder whether or not a broadcast
 * frame does.
 */
export const IDEACAD_ASSEMBLY_POLL_MS = 15_000;

/** The broadcast channel for one assembly's hold changes. */
export function ideacadAssemblyChannelName(documentId: string): string {
	return `ideacad-asm:${documentId}`;
}

/**
 * A hold-change hint. LIKE EVERY OTHER IDEACAD FRAME, IT IS A HINT AND NEVER A
 * WRITE: any anon-key holder can forge one, so a client may use it only to
 * decide to re-read `ideacad_assembly` sooner than the poll would have. Never
 * render a holder straight off a frame.
 */
export interface IdeacadHoldFrame {
	documentId: string;
	partId: string;
	holdRevision: number;
}

/**
 * Whether a frame is worth acting on: it has to be about a part this client is
 * actually showing, and it has to be NEWER than what we already have. The same
 * roster-and-revision filter `frameAllowed` applies in `live.ts`, for the same
 * reason -- a forged or stale frame must not be able to move anything.
 */
export function holdFrameAllowed(
	frame: IdeacadHoldFrame,
	knownPartIds: ReadonlySet<string>,
	lastRevision: number
): boolean {
	return knownPartIds.has(frame.partId) && frame.holdRevision > lastRevision;
}

/** Subscribe to an assembly's hold hints. Returns an unsubscribe. */
export function subscribeAssemblyHolds(
	supabase: SupabaseClient,
	documentId: string,
	fn: (frame: IdeacadHoldFrame) => void
): () => void {
	const channel: RealtimeChannel = supabase.channel(ideacadAssemblyChannelName(documentId), {
		config: { broadcast: { self: false, ack: false } }
	});
	channel.on('broadcast', { event: 'hold' }, ({ payload }) => fn(payload as IdeacadHoldFrame));
	channel.subscribe();
	return () => {
		void supabase.removeChannel(channel);
	};
}

/** Announce a hold change so other clients re-read sooner than the poll. */
export function sendHoldFrame(
	supabase: SupabaseClient,
	frame: IdeacadHoldFrame
): void {
	void supabase
		.channel(ideacadAssemblyChannelName(frame.documentId), {
			config: { broadcast: { self: false, ack: false } }
		})
		.send({ type: 'broadcast', event: 'hold', payload: frame });
}

/**
 * Whether a hold is still inside the window. `windowSeconds` comes from the
 * payload (`IdeacadAssembly.holdWindowSeconds`) and is never assumed here.
 *
 * A client normally reads `part.holdLive`, which the database computed against
 * its own clock. This exists for the case where the client has to re-answer the
 * question between two reads -- and it is the reason `now` is a parameter: a
 * component that reads its own clock silently disagrees with the payload it is
 * rendering.
 */
export function holdIsLive(
	part: Pick<IdeacadAssemblyPart, 'holdBeatAt'>,
	windowSeconds: number,
	now: number
): boolean {
	if (!part.holdBeatAt) return false;
	const beat = Date.parse(part.holdBeatAt);
	if (Number.isNaN(beat)) return false;
	return now - beat < windowSeconds * 1000;
}

/** Whether this viewer is the holder. Case-folded, because an email is. */
export function holdIsMine(
	part: Pick<IdeacadAssemblyPart, 'heldBy'>,
	viewer: string
): boolean {
	if (!part.heldBy || !viewer) return false;
	return part.heldBy.trim().toLowerCase() === viewer.trim().toLowerCase();
}

/**
 * Whether the hold this client believed it had is gone -- the primitive a
 * surface needs in order to notice a live reassignment WITHOUT waiting for its
 * next heartbeat to come back `lost`.
 *
 * True when the part is no longer ours, or when the generation has moved past
 * the one our claim returned. A revision BEHIND ours is a stale read and is not
 * a loss: answering true for it would tear down a live editor over a slow poll.
 */
export function holdLostAgainst(
	part: Pick<IdeacadAssemblyPart, 'heldBy' | 'holdRevision'>,
	viewer: string,
	myHoldRevision: number
): boolean {
	if (part.holdRevision < myHoldRevision) return false;
	if (part.holdRevision > myHoldRevision) return true;
	return !holdIsMine(part, viewer);
}

/**
 * Whether anything about who holds what has changed between two reads. One
 * integer, so a poll can decide whether to re-render at all.
 */
export function assemblyHoldsChanged(
	previous: Pick<IdeacadAssembly, 'holdRevisionTotal'> | null,
	next: Pick<IdeacadAssembly, 'holdRevisionTotal'>
): boolean {
	return previous === null || previous.holdRevisionTotal !== next.holdRevisionTotal;
}

/** The parts in the order the owner put them in. Position, then id as a tiebreak. */
export function partsInOrder(parts: readonly IdeacadAssemblyPart[]): IdeacadAssemblyPart[] {
	return [...parts].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/**
 * Whether this viewer may take this part right now -- what a "Take this part"
 * control is enabled by. It is a CONVENIENCE and never the boundary: the
 * database decides, on the row, under a lock. A control offered on a stale read
 * still gets a structured `held` back.
 */
export function partIsClaimable(
	part: Pick<IdeacadAssemblyPart, 'heldBy' | 'holdLive'>,
	assembly: Pick<IdeacadAssembly, 'canWrite' | 'viewer'>
): boolean {
	if (!assembly.canWrite) return false;
	if (!part.heldBy) return true;
	if (holdIsMine(part, assembly.viewer)) return true;
	return !part.holdLive;
}
