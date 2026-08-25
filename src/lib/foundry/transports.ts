/**
 * THE SERVER CALLS THE FOUNDRY SURFACES MAKE, AS AN INJECTED OBJECT.
 *
 * The route points these at the real RPCs, the storage buckets and the ingest
 * function; the dev harness answers them in memory. That split is what makes
 * a five-step create-upload-ingest orchestration something you can drive and
 * verify with no network and no Supabase project.
 *
 * ABSENCE IS THE MECHANISM. An omitted optional transport removes the control
 * it drives, down through the child components, so a read-only mounting of
 * these surfaces is structural -- there is no write to execute -- rather than a
 * discipline someone has to remember. `rollback`, `withdraw` and `saveField`
 * are optional for exactly that reason.
 *
 * EVERY METHOD ANSWERS, AND NONE OF THEM THROW. A refusal a student has to act
 * on is a value with a sentence in it, not an exception: the surface renders it
 * in the same problem list as everything else, and a thrown error would land in
 * a console nobody is reading.
 */

import type { FoundryIssue } from './preflight.ts';

/** The shape every transport answers with. */
export type FoundryOutcome<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/** What `foundry-ingest` hands back. Mirrors the function's response body. */
export interface IngestOutcome {
	ok: boolean;
	/** Present on a refusal, in the shared module's own wording. */
	failures: FoundryIssue[];
	warnings: FoundryIssue[];
	notes: string[];
	fileCount: number;
	totalBytes: number;
	strippedWrapper: string | null;
	/** The files that will be served from the bundle bucket for this version. */
	files: { path: string; size: number }[];
	/** A transport-level problem, as opposed to a preflight refusal. */
	message: string | null;
}

export interface FoundrySubmitTransports {
	/** The signed-in account, used to build storage paths under its own prefix. */
	uid: string;

	/** `foundry_create_app`. Build notes are required by the RPC, not just here. */
	createApp(input: {
		slug: string;
		title: string;
		tagline: string;
		description: string;
		buildNotes: string;
	}): Promise<FoundryOutcome<{ appId: string; slug: string }>>;

	/**
	 * Put the normalized zip in `foundry-uploads` under the caller's own
	 * prefix, which is the only thing that bucket's policies permit.
	 */
	uploadZip(zip: Blob, path: string): Promise<FoundryOutcome>;

	/** `foundry_create_version`. The version is born a draft. */
	createVersion(input: {
		appId: string;
		zipPath: string;
		byteSize: number;
		fileCount: number;
	}): Promise<FoundryOutcome<{ versionId: string; ordinal: number }>>;

	/** Invoke `foundry-ingest` with the draft version id. */
	ingest(versionId: string): Promise<IngestOutcome>;

	/**
	 * `foundry_submit_version`, the same RPC /foundry/mine calls -- offered on
	 * the submit surface too, so the deliberate act of queueing a build for
	 * review happens on the page it was made on. PREFLIGHT PASSING IS STILL
	 * NOT SUBMISSION: this only ever runs from its own second press, after
	 * ingest has succeeded, and absent it removes that control (the harness's
	 * read-only mounting stays structural).
	 */
	submitVersion?: (versionId: string) => Promise<FoundryOutcome>;

	/** Cover image into `foundry-covers`, returning the stored path. */
	uploadCover(file: File): Promise<FoundryOutcome<{ path: string }>>;

	/** `foundry_update_app_metadata`, one named field per call. */
	saveField(appId: string, field: string, value: string): Promise<FoundryOutcome>;

	/** The apps this student already has, for the add-a-version path. */
	existingApps: { id: string; slug: string; title: string }[];
}

export interface FoundryMineTransports {
	/** `foundry_submit_version`. Draft to submitted, a separate deliberate act. */
	submitVersion?: (versionId: string) => Promise<FoundryOutcome>;
	/** `foundry_withdraw_version`. Submitted back to draft. */
	withdrawVersion?: (versionId: string) => Promise<FoundryOutcome>;
	/**
	 * `foundry_set_published_version`. A POINTER MOVE, which is why it needs no
	 * re-review: the target has already been approved once and its files are
	 * already extracted and sitting in the bundle bucket.
	 */
	rollback?: (appId: string, versionId: string) => Promise<FoundryOutcome>;
	/** `foundry_update_app_metadata`, one field at a time. */
	saveField?: (appId: string, field: string, value: string) => Promise<FoundryOutcome>;
	/** Cover replacement, same bucket and same own-folder rule as creation. */
	uploadCover?: (file: File) => Promise<FoundryOutcome<{ path: string }>>;
	/**
	 * `foundry_delete_app`, through `/api/foundry/delete`. REAL DELETION -- the
	 * app, every version, every file row and every stored object -- and there
	 * is no undo, which is why the surface confirms in two steps and names the
	 * app before it calls this.
	 *
	 * A ROUTE RATHER THAN AN RPC, unlike every other write on this surface,
	 * because a delete is two systems: the rows come out of Postgres and the
	 * bytes come out of Storage, and `foundry-bundles` carries no storage
	 * policy at all, so no browser client can remove a single bundle byte. The
	 * route calls the RPC as the CALLER (so the database is still the
	 * boundary) and sweeps the objects with the service key afterwards.
	 */
	deleteApp?: (appId: string) => Promise<FoundryOutcome<FoundryDeleteReport>>;
	/**
	 * `foundry_delete_version`, same route. Refused for the version the app
	 * currently PUBLISHES -- that one is the app as far as every visitor is
	 * concerned, and the way to remove it is to make another approved version
	 * live first, or to delete the whole app.
	 */
	deleteVersion?: (versionId: string) => Promise<FoundryOutcome<FoundryDeleteReport>>;
	/** Re-read one app after a write, so the surface never renders a stale row. */
	refresh?: (slug: string) => Promise<FoundryApp | null>;
}

/**
 * WHAT A COMPLETED DELETE HANDS BACK, and the one field that is not a count.
 *
 * `storageProblem` is NULL on a clean sweep and a sentence when the rows went
 * and some bytes did not. It is never a failure: `ok` is already true, because
 * the app IS deleted -- the rows are the app. What is left behind is an
 * ORPHANED OBJECT, which nothing serves (the serving route's allowlist is
 * `student_app_files`, and that row is gone) and no client can list. The
 * surface says so in one line rather than either lying about it or presenting
 * a completed delete as an error.
 */
export interface FoundryDeleteReport {
	storageProblem?: string | null;
}

/* -------------------------------------------------------------------------
 * The payload shapes, mirroring what the RPCs return.
 * ---------------------------------------------------------------------- */

export type FoundryVersionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface FoundryVersion {
	id: string;
	ordinal: number;
	status: FoundryVersionStatus;
	byte_size: number;
	file_count: number;
	created_at: string;
	reviewed_at: string | null;
	review_note: string | null;
	reject_reason: string | null;
	manifest: Record<string, unknown>;
}

/**
 * WHO MADE IT, as the two definers project it (0132).
 *
 * `owner_class` is the TITLE of the author's IDEA course and is legitimately
 * NULL: an app outlives an enrollment, a roster import lags a term, a student
 * transfers, an alumnus keeps a published app. Every one of those renders as
 * nothing at all -- no placeholder, no label, no colon -- which is why the
 * surfaces go through `foundryAuthorLine` rather than interpolating it.
 *
 * There is no owner EMAIL here and there must never be one. Neither definer
 * projects one; the uuid/email bridge they use internally is private.
 */
export interface FoundryAuthor {
	owner_display_name: string | null;
	owner_full_name: string | null;
	owner_class: string | null;
}

export interface FoundryApp extends FoundryAuthor {
	id: string;
	slug: string;
	title: string;
	tagline: string | null;
	description: string | null;
	cover_path: string | null;
	build_notes: string;
	owner: string;
	published_version_id: string | null;
	metadata_flagged_at: string | null;
	hidden_at: string | null;
	created_at: string;
	updated_at: string;
	versions: FoundryVersion[];
}

/** The list row, which carries no versions array. */
export interface FoundryAppSummary extends FoundryAuthor {
	id: string;
	slug: string;
	title: string;
	tagline: string | null;
	cover_path: string | null;
	published_version_id: string | null;
	published_ordinal: number | null;
	version_count: number;
	submitted_version_id: string | null;
	metadata_flagged_at: string | null;
	hidden_at: string | null;
	updated_at: string;
}

/* -------------------------------------------------------------------------
 * THE READING SURFACES: the gallery, the detail view and the review queue.
 * ---------------------------------------------------------------------- */

/**
 * THE READING SURFACES NEED NO LAUNCH TRANSPORT, AND THAT IS THE WHOLE SHAPE
 * OF THIS CHANGE.
 *
 * There used to be a `launch` here: it called an API route, which read the
 * session, re-read the version row, decided whether this person could open
 * this app and signed that decision into a thirty-minute token. The frame src
 * was the token URL.
 *
 * `foundry-bundles` is a PUBLIC bucket now (0135) and the frame points at the
 * Storage object URL, which `foundryBundleUrl` builds from the two ids and
 * nothing else. There is no decision left to carry, no secret to reach and no
 * round trip to make, so a transport for it would be an injection point with
 * nothing injected -- and an interface member nobody can implement wrongly is
 * better than one three surfaces have to implement identically.
 *
 * `AppStage` builds the URL itself and renders no launch control when it
 * cannot. Absence is still the mechanism; what is absent is now a URL rather
 * than a transport.
 */
export interface FoundryGalleryTransports {
	/**
	 * Deliberately empty. The gallery and the detail view make no server calls
	 * of their own -- the route loads their data and the frame src is derived.
	 * The interface stays so `FoundryReviewTransports` still has something to
	 * extend and so a future read-side call has a home.
	 */
	readonly _?: never;
}

/** One file of a stored bundle, as the review inspector lists it. */
export interface FoundryBundleFileRow {
	path: string;
	contentType: string;
	byteSize: number;
}

export interface FoundryReviewTransports extends FoundryGalleryTransports {
	/**
	 * The files ACTUALLY IN `foundry-bundles` for this version, from the rows
	 * that are the proxy's own allowlist -- never a re-listing of the zip the
	 * student uploaded, which is not what anyone will run.
	 */
	listFiles?: (versionId: string) => Promise<FoundryOutcome<{ files: FoundryBundleFileRow[] }>>;
	/** One file's stored bytes, decoded. Refuses binary and oversized files. */
	readFile?: (
		versionId: string,
		path: string
	) => Promise<FoundryOutcome<{ text: string; path: string; byteSize: number }>>;
	/** `foundry_review_version`. Absent removes the decision form entirely. */
	decide?: (input: {
		versionId: string;
		decision: 'approve' | 'reject';
		note: string;
		reasonId: string | null;
	}) => Promise<FoundryOutcome>;
	/** `foundry_clear_metadata_flag`. Absent removes only that one control. */
	clearMetadataFlag?: (appId: string) => Promise<FoundryOutcome>;
	/**
	 * `foundry_set_app_hidden`. SHELVED BUT KEPT: off the gallery, off the
	 * serving route, files intact, and this same call with `hidden = false`
	 * puts it back. Admin only in the RPC's own body.
	 */
	setHidden?: (appId: string, hidden: boolean, reason: string) => Promise<FoundryOutcome>;
	/**
	 * `foundry_delete_app`, through `/api/foundry/delete`. GONE: the app, every
	 * version, every file row and every stored object, with no undo and nothing
	 * to restore from. It is deliberately a DIFFERENT transport from
	 * `setHidden` rather than a flag on it, because they are different
	 * decisions and the surface has to be able to state the difference.
	 */
	deleteApp?: (appId: string) => Promise<FoundryOutcome<FoundryDeleteReport>>;
	/** Re-read one app after a decision, so the queue never renders a stale row. */
	refresh?: (slug: string) => Promise<FoundryApp | null>;
}
