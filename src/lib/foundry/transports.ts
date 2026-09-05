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
import type { FoundryPlayStats } from './telemetry.ts';

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
	/**
	 * `foundry_app_play_stats` for the student's OWN app. Aggregates only: how
	 * many plays, how many people, how long, and when last. Never which people
	 * and never when a named person played -- the function has no shape in
	 * which it could say.
	 */
	playStats?: FoundryPlayStatsTransport;
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
	/**
	 * 0173. The app's own published version when a trusted author's submit put
	 * it live and nobody has reviewed it yet; null on everything that went
	 * through the queue. OPTIONAL, because a deployment between 0172 and 0173
	 * is a real state and the column is genuinely absent on it -- the surfaces
	 * read it through `wentLiveUnreviewed`, which treats undefined as null, so
	 * the chip and the list are simply empty there rather than the page
	 * failing.
	 */
	live_unreviewed_version_id?: string | null;
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
 * THE FRAME POINTS AT A SVELTEKIT ROUTE ON THE APPS ORIGIN, and this paragraph
 * used to say something else entirely: "`foundry-bundles` is a PUBLIC bucket
 * now (0135) and the frame points at the Storage object URL". Every part of
 * that was wrong. The bucket is PRIVATE and carries no storage policy at all,
 * which is the mechanism -- `storage.objects` has RLS on, so a bucket no policy
 * names denies `anon` and `authenticated` by default and only `service_role`
 * reaches it. 0135 is the classroom's instructor-attachment migration and has
 * nothing to do with Foundry. And a Storage object URL could never have been
 * the frame src anyway: storage-api rewrites any `text/html` content type to
 * `text/plain`, unconditionally, so a framed bundle would render its own source
 * as text.
 *
 * What is actually there: `foundryBundleUrl` builds
 * `<apps origin>/b/<app>/<version>/` from the two ids and nothing else, and
 * `src/routes/b/[appId]/[versionId]/[...path]/+server.ts` reads the bytes with
 * the service-role key and re-checks every rule RLS would have enforced. The
 * URL carries no token and the licence comes from the version's own status.
 *
 * SO THERE IS STILL NO DECISION FOR A TRANSPORT TO CARRY, no secret to reach
 * and no round trip to make -- which is the part of the old paragraph that was
 * true and is the reason there is no `launch` here. An injection point with
 * nothing injected is worse than an absence: an interface member nobody can
 * implement wrongly beats one three surfaces have to implement identically.
 *
 * `AppStage` builds the URL itself and renders no launch control when it
 * cannot. Absence is still the mechanism; what is absent is now a URL rather
 * than a transport.
 */
export interface FoundryGalleryTransports {
	/**
	 * `foundry_play_start`. THE PORTAL RECORDS BECAUSE THE APP CANNOT.
	 *
	 * A published bundle runs in a sandboxed cross-origin frame with no session
	 * and no way to reach us, so it is never asked to report anything -- and it
	 * must not be, or every figure would be written by the party being
	 * measured. `AppStage` owns the lifecycle, so `AppStage` is what calls this.
	 *
	 * ABSENCE IS THE MECHANISM, AND IT IS LOAD-BEARING HERE RATHER THAN TIDY.
	 * The REVIEW QUEUE deliberately supplies neither of these: a reviewer
	 * running a submitted build to decide about it is not a play, and the way
	 * that is guaranteed is that the surface has nothing to call. The database
	 * refuses the same case a second time (`foundry_play_start` accepts only the
	 * app's PUBLISHED version), so opening one layer leaves the other closed.
	 *
	 * IT NEVER THROWS AND ITS REFUSAL IS NEVER SHOWN. Telemetry must not be able
	 * to affect the thing it measures, so every outcome here is a value, a
	 * refusal is silent, and nothing on this path can reach the student's screen.
	 */
	recordPlay?: (
		appId: string,
		versionId: string
	) => Promise<{ ok: true; playId: string } | { ok: false }>;

	/**
	 * `foundry_play_ping`. The heartbeat, which is also the clean end: the last
	 * ping before teardown is what makes a stopped session's duration exact.
	 *
	 * `stale` IS THE ONE OUTCOME THE CALLER ACTS ON. It means the row has fallen
	 * outside the database's resume window -- a tab hidden for an hour and then
	 * brought back -- and the correct response is to open a NEW session rather
	 * than to book the gap. Every other refusal is silent.
	 */
	pingPlay?: (playId: string) => Promise<{ ok: true } | { ok: false; stale: boolean }>;
}

/**
 * `foundry_app_play_stats`, the author-and-admin aggregate.
 *
 * FOUR SCALARS AND NEVER A ROW. There is no per-player detail in the answer and
 * no parameter through which one could be asked for, on this transport or in
 * the function behind it. `null` is the ordinary answer for an app whose stats
 * this caller may not read, and it is the SAME answer a nonexistent app gives,
 * so nothing here can be used to probe an id.
 *
 * It is optional on both surfaces that take it, so a mounting without it simply
 * renders no figures.
 */
export type FoundryPlayStatsTransport = (appId: string) => Promise<FoundryPlayStats | null>;

/**
 * 0173, decision 06. The trusted publisher roster: read it, add an address,
 * take one off.
 *
 * IT IS KEYED BY EMAIL AND NOT BY APP, AND THAT IS FORCED RATHER THAN
 * CONVENIENT. The obvious control is "trust this author", on the app an admin
 * is already reading. These surfaces deliberately never carry an author's
 * ADDRESS -- `foundry_get_app` projects a display name and a class and nothing
 * else -- so a per-app control would need a uuid-to-email lookup reachable
 * from a client, and "a granted email-to-uuid view is a school directory" is
 * a rule this repository states outright. `foundry_trusted_publishers` is an
 * ALLOWLIST in the `app_admins` and `gauntlet_authors` shape, so it is
 * managed the way those are: by address, deliberately, from a roster.
 *
 * THE COST IS STATED RATHER THAN HIDDEN: an admin has to know the student's
 * Bosco Tech address. That is one look at a roster they already run, and it
 * is far cheaper than a granted path from a name to an address.
 *
 * Omitting `grantTrust` removes every write control; omitting `readTrusted`
 * removes the panel. Absence is the mechanism, as everywhere else here.
 */
export interface FoundryTrustTransports {
	readTrusted?: () => Promise<FoundryTrustedRow[] | null>;
	grantTrust?: (
		email: string,
		note: string | null
	) => Promise<{ ok: boolean; message?: string }>;
	revokeTrust?: (email: string) => Promise<{ ok: boolean; message?: string }>;
}

/** One row of `foundry_trusted_roster()`. */
export interface FoundryTrustedRow {
	email: string;
	granted_by: string | null;
	granted_at: string;
	note: string | null;
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
	/**
	 * `foundry_app_play_stats` for ANY app, which is what `is_admin()` inside
	 * that function admits. THE SAME FOUR SCALARS the author sees and not one
	 * field more: staff get every app's aggregates and nobody's play history,
	 * because there is no per-player read for any caller at all.
	 */
	playStats?: FoundryPlayStatsTransport;
	/**
	 * `foundry_update_app_metadata`, one named field per call -- the SAME
	 * transport shape `/foundry/mine` hands the owner, pointed at the same RPC,
	 * which has admitted `is_admin()` in its own body since 0130.
	 *
	 * THIS IS THE ADMIN'S ONLY PLACE TO EDIT THESE FIELDS. The owner edits them
	 * on `/foundry/mine`; a second admin-flavoured editor somewhere else would
	 * be a second set of field names, a second set of limits and a second thing
	 * to keep in step with the whitelist inside the RPC.
	 *
	 * A HIDDEN APP IS REFUSED BY THE RPC, for an admin as well as for the owner,
	 * so the surface must not offer the control for one. That refusal is
	 * unconditional in 0130 and is not an oversight: a hidden app is under
	 * discussion, and editing the text of one is how the discussion loses its
	 * subject.
	 */
	saveField?: (appId: string, field: string, value: string) => Promise<FoundryOutcome>;
	/** Cover replacement. Same bucket as the owner's, written under the CALLER's prefix. */
	uploadCover?: (file: File) => Promise<FoundryOutcome<{ path: string }>>;
}
