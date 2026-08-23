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
	/** The files the proxy will serve, once the version is published. */
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
	/** Re-read one app after a write, so the surface never renders a stale row. */
	refresh?: (slug: string) => Promise<FoundryApp | null>;
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

export interface FoundryApp {
	id: string;
	slug: string;
	title: string;
	tagline: string | null;
	description: string | null;
	cover_path: string | null;
	build_notes: string;
	published_version_id: string | null;
	metadata_flagged_at: string | null;
	hidden_at: string | null;
	created_at: string;
	updated_at: string;
	versions: FoundryVersion[];
}

/** The list row, which carries no versions array. */
export interface FoundryAppSummary {
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
