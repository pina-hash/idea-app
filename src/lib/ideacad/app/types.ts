/**
 * THE CHOOSER'S PLAIN-DATA AND ARITHMETIC LAYER.
 *
 * `/ideacad` opens on a chooser rather than on a canvas, so this is the first
 * screen anybody sees. Everything a card SAYS, everything the list is ORDERED
 * and NARROWED by, and every sentence a refusal reads is decided here rather
 * than inline in `IdeaCadApp.svelte`, for the reason every other pure layer in
 * this subsystem exists (`sharing.ts`, `shared-open.ts`, `archive.ts` all say
 * it in their own headers): NO SVELTE, NO TRANSPORT, NO CLIENT, so every rule
 * below is assertable without a browser and without a database.
 *
 * IT IS NOT AN AUTHORIZATION BOUNDARY. A control this module hides is a
 * convenience; what a caller may actually open, archive or restore is decided
 * by `0205`'s and `0214`'s SECURITY DEFINER functions and by RLS. Do not add a
 * rule here the database does not also enforce.
 *
 * THREE THINGS THE CHOOSER CANNOT DO, AND THEY ARE STRUCTURAL RATHER THAN
 * MISSING. Ledger 0264 was asked for rename, duplicate and delete; the schema
 * as it stands (no migration was permitted, and none of these is a rendering
 * decision) answers:
 *
 *   * RENAME. `ideacad_documents` HAS NO NAME COLUMN. A document's title is
 *     `classroom_items.title` -- the teacher's assignment title, shared by every
 *     student in the class -- so "renaming a document" here would rename the
 *     assignment for everyone. `ideacad_concepts.name` is the thing a student
 *     names, and `ideacad_update_concept_meta` renames it from inside the
 *     editor, which is where it belongs.
 *   * DUPLICATE. `unique(item_id, student_email)` on `ideacad_documents` (0201)
 *     makes a second document on one assignment IMPOSSIBLE BY CONSTRUCTION. A
 *     duplicate would need a second assignment. Duplicating a CONCEPT is the
 *     available shape and is `ideacad_new_concept`, again inside the editor.
 *   * DELETE. There is no delete path of any kind, deliberately: Mr. Pina's
 *     decision 29 of 2026-09-13 is A DOCUMENT IS ARCHIVED, NEVER DELETED, and
 *     `0213`'s census refuses to remove a student who has IdeaCAD work at all.
 *     `ideacad_set_document_archived` is the whole of it, it is an INSTRUCTOR'S
 *     deliberate act (`_classroom_manages_item` inside the function), and it is
 *     what this chooser offers -- with a confirmation that says the work is
 *     kept rather than destroyed. See `IDEACAD_CHOOSER_ARCHIVE_CONFIRM`.
 *
 * Anyone adding one of the three starts with a migration, not with this file.
 */

import { profilePolyline } from '../ui/feature-model';
import { ideacadNormalizeEmail } from '../sharing';
import type { Station } from '../blade/tree';

/**
 * THE PICTURE A CARD DRAWS, read off the active concept's stored tree.
 *
 * A thumbnail of the PROFILE and not a render of the model: the profile is the
 * shape a student actually authored, it is two numbers per station, and it
 * needs no WebGL context per card in a grid of thirty.
 */
export interface IdeaCadProfileSketch {
	/** The revolve's stations, exactly as stored. */
	stations: Station[];
	/** How many blades the circular pattern makes, or 0 when there is none. */
	bladeCount: number;
}

/** One document the caller can open, as the chooser renders it. */
export interface IdeaCadDocumentSummary {
	id: string;
	itemId: string;
	/** The assignment's title. Shared by every document on that assignment. */
	title: string;
	updatedAt: string;
	/** Whose work this is. Projected so a manager's list is not N identical cards. */
	ownerEmail: string;
	/** True when the caller owns it. Decided server side against `claims.email`. */
	isOwn: boolean;
	/** `0214`'s stamp, or null. An archived document opens READ ONLY. */
	archivedAt: string | null;
	/** Live concepts in the document. Zero is a real answer for a fresh row. */
	conceptCount: number;
	/** The thumbnail source, or null when the tree could not be read. */
	profile: IdeaCadProfileSketch | null;
	/**
	 * Whether THIS CALLER may archive or restore this document.
	 *
	 * It mirrors `_classroom_manages_item`, which is not a question a browser
	 * can ask, so the load answers it by probing `ideacad_archive` for the item
	 * and this field carries the answer down. FALSE IS THE FAIL-CLOSED VALUE:
	 * a deployment without `0214`, a caller who is not a manager, and a probe
	 * that errored all land here, and the control is then ABSENT rather than
	 * present-and-refusing.
	 */
	canArchive: boolean;
}

/** An assignment with an IdeaCAD editor the caller has not started yet. */
export interface IdeaCadDocumentSource {
	itemId: string;
	title: string;
}

export interface IdeaCadPaneLayout {
	left: number;
	right: number;
	leftOpen: boolean;
	rightOpen: boolean;
}

/* -------------------------------------------------------------------------
   THE THUMBNAIL
   ------------------------------------------------------------------------- */

/**
 * Read a stored tree far enough to draw a picture of it, and NO FURTHER.
 *
 * IT JUDGES NOTHING, which is the same separation `normalize.ts` keeps from
 * Foundry's preflight: whether a tree is legal is `validateBladeTree`'s
 * question, asked by the editor when the document opens. A thumbnail that
 * refused an odd tree would put a broken card in front of a student instead of
 * letting them open the document and read the editor's real problem list. So
 * anything this cannot read answers NULL and the card draws no picture.
 *
 * THE INPUT IS `unknown` BECAUSE IT COMES OUT OF `jsonb`. Every field is
 * checked before it is read; nothing is cast through.
 */
export function ideaCadProfileSketch(features: unknown): IdeaCadProfileSketch | null {
	if (!features || typeof features !== 'object') return null;
	const list = (features as { features?: unknown }).features;
	if (!Array.isArray(list)) return null;
	const revolve = list.find(
		(f) => f && typeof f === 'object' && (f as { type?: unknown }).type === 'revolve'
	) as { stations?: unknown } | undefined;
	if (!revolve || !Array.isArray(revolve.stations)) return null;
	const stations: Station[] = [];
	for (const raw of revolve.stations) {
		if (!raw || typeof raw !== 'object') return null;
		const { r, z } = raw as { r?: unknown; z?: unknown };
		if (typeof r !== 'number' || typeof z !== 'number') return null;
		if (!Number.isFinite(r) || !Number.isFinite(z)) return null;
		stations.push({ r, z });
	}
	/* A polyline needs two points. One station is a dot, which says nothing
	   about the shape and reads as a rendering fault rather than as a part. */
	if (stations.length < 2) return null;
	const pattern = list.find(
		(f) => f && typeof f === 'object' && (f as { type?: unknown }).type === 'circularPattern'
	) as { count?: unknown } | undefined;
	const count = typeof pattern?.count === 'number' && Number.isFinite(pattern.count)
		? Math.max(0, Math.trunc(pattern.count))
		: 0;
	return { stations, bladeCount: count };
}

/**
 * The thumbnail's polyline, in the card's own box.
 *
 * IT DELEGATES TO `profilePolyline`, which is `ProfilePreview`'s projection and
 * the one implementation of "where does a station land on screen". A second
 * copy here would be a thumbnail that stopped agreeing with the preview inside
 * the editor -- the same part drawn two ways on two screens, with nothing able
 * to compare them.
 */
export function ideaCadThumbnailPoints(
	sketch: IdeaCadProfileSketch,
	width: number,
	height: number
): string {
	return profilePolyline(sketch.stations, width, height, 4).points;
}

/* -------------------------------------------------------------------------
   WHAT A CARD SAYS
   ------------------------------------------------------------------------- */

/**
 * WHEN THIS WAS LAST EDITED, in the words a reader uses.
 *
 * `now` IS A PARAMETER AND MUST STAY ONE. A component that reads its own clock
 * silently disagrees with the ordering it is rendering, and a label that cannot
 * be given an instant cannot be asserted at one either.
 *
 * It degrades to the calendar date rather than to nothing: past a week "14 Sep"
 * is more use than "8 days ago", and an unparseable stamp answers the empty
 * string so the caller renders no line at all rather than "Invalid Date".
 */
export function ideaCadEditedLabel(iso: string, now: number): string {
	const at = Date.parse(iso);
	if (!Number.isFinite(at)) return '';
	const seconds = Math.round((now - at) / 1000);
	/* A clock skew between the server that stamped the row and the browser
	   reading it can put `updated_at` slightly in the future. "in 4 seconds" is
	   nonsense about a save that already happened, so the future reads as now. */
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days} days ago`;
	return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The full stamp, for the `title` a reader can hover or read out. */
export function ideaCadEditedExact(iso: string): string {
	const at = Date.parse(iso);
	return Number.isFinite(at) ? new Date(at).toLocaleString() : '';
}

/**
 * WHOSE WORK THIS IS, or NULL for the caller's own.
 *
 * NULL RENDERS NOTHING -- no placeholder, no "you", no empty label -- which is
 * the rule every author line in this repository follows. Labelling your own
 * cards with your own address is thirty rows of noise in a list where the point
 * of the field is telling somebody ELSE's work apart.
 *
 * THE ADDRESS IS NOT REDACTED, and that is deliberate rather than an oversight.
 * `0214` projects the owner's address to everyone a class grant reaches and
 * `IDEACAD_ARCHIVE_SHARE_NOTE` says so in words; a redacted chooser beside an
 * unredacted open would read as a guarantee and not be one. This is a
 * signed-in surface throughout -- `/ideacad` redirects an anonymous caller.
 */
export function ideaCadOwnerLabel(
	document: Pick<IdeaCadDocumentSummary, 'ownerEmail' | 'isOwn'>
): string | null {
	if (document.isOwn) return null;
	const owner = ideacadNormalizeEmail(document.ownerEmail);
	return owner === '' ? null : owner;
}

/** Said on an archived card. It is a STATE, and the word is never only a hue. */
export const IDEACAD_CHOOSER_ARCHIVED_CHIP = 'Archived';

/** What that chip MEANS, in the reader's terms, beside the confirmation. */
export const IDEACAD_CHOOSER_ARCHIVED_NOTE =
	'Kept as reference work. You can open it and read every concept in it; nothing in it can be changed.';

/* -------------------------------------------------------------------------
   NARROWING THE LIST
   ------------------------------------------------------------------------- */

/**
 * THE FILTERS. A class produces thirty documents in a week, and on a teacher's
 * screen every one of them carries the same assignment title -- so the list has
 * to be narrowable by something other than reading it.
 *
 * `all` INCLUDES ARCHIVED ROWS, chipped, rather than hiding them. Hiding makes
 * the archived count unreachable from the default view and leaves a reader
 * unable to tell a document that is not there from one that is filtered out.
 */
export const IDEACAD_CHOOSER_FILTERS = ['all', 'mine', 'shared', 'archived'] as const;

export type IdeaCadChooserFilter = (typeof IDEACAD_CHOOSER_FILTERS)[number];

/** The words, once. Every renderer is exhaustive, so a fifth filter is a type error. */
export const IDEACAD_CHOOSER_FILTER_LABELS: Record<IdeaCadChooserFilter, string> = {
	all: 'All',
	mine: 'Mine',
	shared: 'Shared with me',
	archived: 'Archived'
};

/** THE SORTS, and each is a TOTAL order -- see `ideaCadChooserRows`. */
export const IDEACAD_CHOOSER_SORTS = ['recent', 'name', 'owner'] as const;

export type IdeaCadChooserSort = (typeof IDEACAD_CHOOSER_SORTS)[number];

export const IDEACAD_CHOOSER_SORT_LABELS: Record<IdeaCadChooserSort, string> = {
	recent: 'Last edited',
	name: 'Name',
	owner: 'Owner'
};

/**
 * Read a filter or a sort off stored or user-supplied input, DROPPING anything
 * the union does not name -- the rule a preference read follows everywhere in
 * this repository. A value no branch renders must not reach the UI.
 */
export function ideaCadChooserFilterFrom(value: unknown): IdeaCadChooserFilter {
	return typeof value === 'string' &&
		(IDEACAD_CHOOSER_FILTERS as readonly string[]).includes(value)
		? (value as IdeaCadChooserFilter)
		: 'all';
}

export function ideaCadChooserSortFrom(value: unknown): IdeaCadChooserSort {
	return typeof value === 'string' && (IDEACAD_CHOOSER_SORTS as readonly string[]).includes(value)
		? (value as IdeaCadChooserSort)
		: 'recent';
}

/**
 * ABOVE THIS MANY DOCUMENTS THE SEARCH AND THE CONTROLS ARE DRAWN.
 *
 * Below it they are clutter: a filter row over two cards costs a reader more
 * than it saves, and "Shared with me" beside a list with nothing shared in it
 * is a control whose only possible outcome is an empty list. The number is a
 * judgement rather than a measurement and is written down once so both the
 * component and its test read the same one.
 */
export const IDEACAD_CHOOSER_CONTROLS_AT = 6;

/** How many of each filter's rows there are, so a tab can carry its own count. */
export type IdeaCadChooserCounts = Record<IdeaCadChooserFilter, number>;

export interface IdeaCadChooserView {
	/** The rows to render, narrowed and ordered. */
	rows: IdeaCadDocumentSummary[];
	/** Every row the caller can open, before any narrowing. */
	total: number;
	/** How many the current narrowing removed. Zero is rendered, never hidden. */
	hidden: number;
	/** Per-filter totals, computed over the WHOLE list rather than the narrowed one. */
	counts: IdeaCadChooserCounts;
	/** Whether the search and filter controls are worth drawing at all. */
	showControls: boolean;
}

function matchesFilter(row: IdeaCadDocumentSummary, filter: IdeaCadChooserFilter): boolean {
	switch (filter) {
		case 'mine':
			return row.isOwn;
		case 'shared':
			return !row.isOwn;
		case 'archived':
			return row.archivedAt !== null;
		case 'all':
			return true;
	}
}

/**
 * Does this row match what was typed?
 *
 * It searches the TITLE and the OWNER, which are the two things a card shows
 * and therefore the two things somebody looking at the list would type. It does
 * NOT search the document id: a uuid is not something anybody types, and
 * matching one would make a stray paste silently narrow the list to one row.
 */
function matchesQuery(row: IdeaCadDocumentSummary, query: string): boolean {
	if (query === '') return true;
	return (
		row.title.toLowerCase().includes(query) ||
		ideacadNormalizeEmail(row.ownerEmail).includes(query)
	);
}

/**
 * NARROW AND ORDER THE LIST, purely, over a COPY.
 *
 * EVERY ORDER IS TOTAL. Thirty documents on one assignment share a title
 * exactly, and two saved in the same second share a stamp; a comparator with no
 * tie break leaves their order to the engine, and a list that reshuffles between
 * two renders is one a reader cannot point at. So every sort falls through to
 * the document id, which is unique.
 *
 * IT SORTS A COPY. Sorting the array the payload arrived in mutates the
 * caller's state in place, which on a Svelte 5 surface reorders a list under a
 * reader during an unrelated render.
 */
export function ideaCadChooserRows(
	documents: readonly IdeaCadDocumentSummary[],
	options: { query?: string; filter?: IdeaCadChooserFilter; sort?: IdeaCadChooserSort } = {}
): IdeaCadChooserView {
	const filter = options.filter ?? 'all';
	const sort = options.sort ?? 'recent';
	const query = (options.query ?? '').trim().toLowerCase();

	const counts: IdeaCadChooserCounts = { all: 0, mine: 0, shared: 0, archived: 0 };
	for (const row of documents) {
		for (const key of IDEACAD_CHOOSER_FILTERS) {
			if (matchesFilter(row, key)) counts[key] += 1;
		}
	}

	const rows = documents.filter((row) => matchesFilter(row, filter) && matchesQuery(row, query));
	const byId = (a: IdeaCadDocumentSummary, b: IdeaCadDocumentSummary) => a.id.localeCompare(b.id);
	const sorted = [...rows].sort((a, b) => {
		if (sort === 'name') {
			return a.title.localeCompare(b.title) || byId(a, b);
		}
		if (sort === 'owner') {
			return (
				ideacadNormalizeEmail(a.ownerEmail).localeCompare(ideacadNormalizeEmail(b.ownerEmail)) ||
				byId(a, b)
			);
		}
		/* Newest first. `Date.parse` of a stamp the database wrote is finite;
		   an unparseable one sorts as 0 and lands at the end rather than
		   throwing the whole comparator's ordering away. */
		const at = (row: IdeaCadDocumentSummary) => {
			const parsed = Date.parse(row.updatedAt);
			return Number.isFinite(parsed) ? parsed : 0;
		};
		return at(b) - at(a) || byId(a, b);
	});

	return {
		rows: sorted,
		total: documents.length,
		hidden: documents.length - sorted.length,
		counts,
		showControls: documents.length >= IDEACAD_CHOOSER_CONTROLS_AT
	};
}

/** Said where a narrowing removed everything, so an empty list is never blank. */
export function ideaCadChooserEmptyNote(view: IdeaCadChooserView): string {
	if (view.total === 0) return '';
	return view.rows.length === 0
		? 'Nothing here matches. Clear the search, or choose another filter.'
		: '';
}

/* -------------------------------------------------------------------------
   ARCHIVING FROM THE CHOOSER
   ------------------------------------------------------------------------- */

/**
 * THE CONFIRMATION, AND IT SAYS WHAT WILL HAPPEN RATHER THAN ASKING "ARE YOU
 * SURE".
 *
 * A destructive-looking action names what it costs, with the real facts, before
 * the confirm -- and the most important fact here is that IT COSTS NOTHING
 * PERMANENT. Decision 29 is archive-never-delete, so the honest sentence is
 * that the work is kept and stays readable, which is the opposite of what a
 * reader expects from a control in this position. Saying so is the whole point
 * of the sentence.
 *
 * IT NAMES THE OWNER, because a manager pressing this is acting on somebody
 * else's work and the row under the pointer is one of thirty identical titles.
 */
export function ideaCadChooserArchiveConfirm(
	document: Pick<IdeaCadDocumentSummary, 'ownerEmail' | 'title' | 'conceptCount'>
): string {
	const owner = ideacadNormalizeEmail(document.ownerEmail) || 'this student';
	const work =
		document.conceptCount === 1 ? '1 concept' : `${document.conceptCount} concepts`;
	return `Archive ${owner}'s "${document.title}" (${work})? Nothing is deleted. It stays here as reference work, you and they can still open and read it, and nobody can change it. You can restore it from this list afterwards.`;
}

/**
 * THE RESTORE CONFIRMATION, and it carries the one consequence that is NOT
 * reversible: `ideacad_set_document_archived(false)` DELETES the document's
 * class grants in the same statement, and re-archiving does not bring them
 * back. `0214`'s own comment says so; a reader pressing Restore has no other
 * way to learn it.
 */
export function ideaCadChooserRestoreConfirm(
	document: Pick<IdeaCadDocumentSummary, 'ownerEmail' | 'title'>
): string {
	const owner = ideacadNormalizeEmail(document.ownerEmail) || 'this student';
	return `Restore ${owner}'s "${document.title}"? They can change it again. Any class you shared it with loses access, and re-archiving it does not bring that back.`;
}

/** The one spelling of why the archive control is not drawn for this caller. */
export const IDEACAD_CHOOSER_ARCHIVE_DENIED =
	'Only a teacher for this class can archive a document.';

/* -------------------------------------------------------------------------
   REFUSALS
   ------------------------------------------------------------------------- */

/**
 * THE REAL REASON A DOCUMENT DID NOT OPEN, VERBATIM, AND NEVER A GENERALISATION
 * OF IT.
 *
 * This function exists because of one measured failure: a chooser reported
 * "This document could not be opened" while the database had actually said
 * "Only a student enrolled in this class can work on this assignment." The two
 * sentences point at completely different next actions -- one sends a student
 * to their teacher about a broken tool, the other tells them their enrollment
 * is the problem -- and swallowing the second cost a lane hours.
 *
 * SO THERE IS NO FALLBACK SENTENCE THAT DESCRIBES THE FAILURE. Every rung
 * either hands back what the server said or says, in words, that the failure
 * ARRIVED WITH NO TEXT and shows whatever identifying scrap there was. A
 * refusal that cannot be explained must look different from one that can.
 *
 * DO NOT ADD A FRIENDLIER DEFAULT HERE. A friendlier default is exactly the
 * defect: it is indistinguishable on screen from a correctly reported refusal,
 * so nobody ever finds out the real message was available and dropped.
 */
export function ideaCadOpenRefusal(error: unknown): string {
	const parts: string[] = [];
	const message =
		error instanceof Error
			? error.message
			: typeof error === 'string'
				? error
				: typeof (error as { message?: unknown })?.message === 'string'
					? ((error as { message: string }).message)
					: '';
	if (message.trim() !== '') parts.push(message.trim());

	/* A PostgrestError carries `details` and `hint` beside `message`, and on a
	   permission failure those are routinely where the useful half is. An
	   `Error` thrown by a transport has already dropped them, so this reads
	   them only when a raw error object reaches here -- which it does from
	   every path that does not go through that wrapper. */
	for (const key of ['details', 'hint'] as const) {
		const extra = (error as Record<string, unknown> | null | undefined)?.[key];
		if (typeof extra === 'string' && extra.trim() !== '' && !parts.includes(extra.trim())) {
			parts.push(extra.trim());
		}
	}
	if (parts.length > 0) return parts.join(' ');

	const code = (error as { code?: unknown } | null | undefined)?.code;
	return typeof code === 'string' && code.trim() !== ''
		? `Opening this document failed and the server sent no message, only the code ${code.trim()}. Tell your teacher that code.`
		: 'Opening this document failed and the server sent no reason at all. Tell your teacher what you pressed.';
}
