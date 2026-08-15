/**
 * Presentation decks on classroom items (0101): the client-safe half.
 *
 * A deck is a Claude Design "Project HTML" export -- an entry page plus its
 * whole sibling tree -- stored file by file and served back under one per-deck
 * prefix so its own relative references resolve untouched. Nothing here builds
 * a path INTO a deck other than the entry and the thumbnail: every other file
 * is asked for by the deck's own HTML, relative to the entry, which is the
 * point of serving the tree as a unit.
 */

/**
 * A deck zip has to fit inside ONE serverless request body: the upload now
 * goes through OUR server (which then does the Drive write on the caller's
 * behalf), and Vercel caps a request body at roughly 4.5 MB. This mirrors
 * the exact same figure classroom attachments already use for the exact
 * same reason (src/lib/server/classroom-attachments.ts, MAX_ATTACHMENT_BYTES)
 * -- "roughly" is not a number to cut close to, so this stays comfortably
 * under it with room for the multipart envelope.
 *
 * Mirrored server-side by $lib/server/classroom-decks.ts, which imports this
 * exact constant rather than a second copy of the number: the client refuses
 * an oversize file before it ever leaves the browser, and the server refuses
 * it again if that check is ever bypassed.
 */
export const DECK_UPLOAD_MAX_ZIP_BYTES = 4 * 1024 * 1024;

/**
 * The message shown to a student choosing an oversize deck, and the ONE
 * place it is written -- so the client's up-front refusal and the server's
 * defense-in-depth refusal say the same thing. Returns null when the file
 * fits.
 */
export function deckUploadSizeIssue(bytes: number): string | null {
	if (bytes <= DECK_UPLOAD_MAX_ZIP_BYTES) return null;
	const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
	return (
		`This deck zip is ${mb(bytes)} MB, over the ${mb(DECK_UPLOAD_MAX_ZIP_BYTES)} MB limit for a ` +
		'single upload. Remove large media (gifs, video) from the deck and attach it to the item ' +
		'separately instead, then upload the deck zip again.'
	);
}

export interface DeckSlide {
	index: number;
	label: string;
}

export interface ClassroomDeck {
	id: string;
	item_id: string;
	title: string;
	/** The page the viewer opens, relative to the deck root. */
	entry_path: string;
	/** The export's own `.thumbnail`, when it shipped one. */
	thumbnail_path: string | null;
	file_count: number;
	total_bytes: number;
	/**
	 * Whether `.image-slots.state.json` came with the upload. FALSE means every
	 * image the author cropped or panned by hand renders uncropped -- a failure
	 * that looks plausible rather than broken, which is exactly why it is
	 * surfaced rather than left to be noticed.
	 */
	has_state_file: boolean;
	/** Slide LABELS only. Speaker notes are never extracted or stored. */
	slides: DeckSlide[];
	created_at?: string;
}

/**
 * The ONE place a URL into a deck is built. Always this app's own proxy, never
 * a drive.google.com link -- the files live in a restricted school shared
 * drive, so a direct link renders only for someone who personally has access
 * to that folder.
 *
 * The path is emitted SEGMENT-ENCODED: a deck path legitimately contains
 * slashes (they are the tree), so encodeURIComponent on the whole thing would
 * turn `_ds/x/styles.css` into one impossible filename.
 */
export function deckFileSrc(deckId: string, path: string): string {
	const local = localDeckUrls.get(`${deckId}/${path}`);
	if (local) return local;
	const encoded = path.split('/').map(encodeURIComponent).join('/');
	return `/api/classroom/deck/${deckId}/${encoded}`;
}

export function deckEntrySrc(deck: ClassroomDeck): string {
	return deckFileSrc(deck.id, deck.entry_path);
}

export function deckThumbnailSrc(deck: ClassroomDeck): string | null {
	return deck.thumbnail_path ? deckFileSrc(deck.id, deck.thumbnail_path) : null;
}

/** The viewer, under whichever base path the caller is rendering in. */
export function deckViewerHref(basePath: string, sectionId: string, itemId: string): string {
	return `${basePath}/${sectionId}/item/${itemId}/deck`;
}

/**
 * DEV-HARNESS ONLY (the registerLocalAttachmentUrl convention). /dev/classroom
 * has no Drive and no session, so an "upload" there registers object URLs for
 * the files it just unpacked and the viewer shows a real deck. The map is empty
 * on every real deployment -- nothing outside the harness ever calls this -- so
 * deckFileSrc's production answer is unchanged.
 */
const localDeckUrls = new Map<string, string>();

export function registerLocalDeckUrl(deckId: string, path: string, url: string): void {
	localDeckUrls.set(`${deckId}/${path}`, url);
}

export function clearLocalDeckUrls(deckId: string): void {
	for (const key of [...localDeckUrls.keys()]) {
		if (key.startsWith(`${deckId}/`)) localDeckUrls.delete(key);
	}
}

export function normalizeDeckRow(row: Record<string, unknown> | null | undefined): ClassroomDeck | null {
	if (!row || !row.id) return null;
	const slides = Array.isArray(row.slides) ? (row.slides as DeckSlide[]) : [];
	return {
		id: String(row.id),
		item_id: String(row.item_id ?? ''),
		title: String(row.title ?? 'Presentation'),
		entry_path: String(row.entry_path ?? ''),
		thumbnail_path: (row.thumbnail_path as string | null) ?? null,
		file_count: Number(row.file_count ?? 0),
		total_bytes: Number(row.total_bytes ?? 0),
		has_state_file: row.has_state_file === true,
		slides: slides
			.filter((s) => s && typeof s.label === 'string')
			.map((s, i) => ({ index: Number(s.index ?? i), label: String(s.label) })),
		created_at: (row.created_at as string | undefined) ?? undefined
	};
}

export interface DeckUploadResult {
	ok: boolean;
	message: string;
	/**
	 * WHICH failure this was, when it failed. A deck upload has several failure
	 * modes that all read as "something went wrong" -- an oversize zip refused
	 * before anything is sent, a connection that drops mid-upload, a step of
	 * the server's own unpacking that ran out of time -- and on a deployment
	 * whose server logs are not to hand, telling them apart is the whole
	 * diagnosis. Shown to the uploader alongside the message.
	 */
	code?: string;
	/** When the zip offered several plausible entry pages, they land here. */
	candidates?: string[];
	warnings?: string[];
	replaced?: boolean;
	fileCount?: number;
	/** The uploader stopped it on purpose; not a failure to report as one. */
	cancelled?: boolean;
}

/**
 * FOUR PHASES, because a deck upload is four genuinely different waits and a
 * bar that cannot tell them apart looks stuck three times.
 *
 * `preparing` is the (near-instant) client-side size check and form assembly;
 * `uploading` is the one POST to our own server, counted in bytes -- capped at
 * a few MB, so this is now the SHORT phase; `unpacking` is the server storing
 * the deck's files back out to Drive, counted in FILES because that is what
 * the staged ingest actually reports back (0105) -- a real export can carry
 * enough files that this is the phase that actually takes a while now;
 * `storing` is the last, short call that writes the manifest.
 */
export interface DeckUploadProgress {
	phase: 'preparing' | 'uploading' | 'unpacking' | 'storing';
	loaded: number;
	total: number;
}

export interface DeckUploadOptions {
	/** The answer to a previous ambiguous-entry refusal. */
	entryPath?: string | null;
	onProgress?: (progress: DeckUploadProgress) => void;
	/**
	 * Aborts the browser's own upload request. Since the whole authorize +
	 * write-to-Drive + plan sequence happens inside ONE server request that
	 * only runs once the request body has fully arrived, cancelling before
	 * that finishes means the server never starts any of it -- there is
	 * nothing left over to clean up on the Drive side, unlike the old
	 * direct-to-Drive session this replaced.
	 */
	signal?: AbortSignal;
}

export interface DeckTransports {
	uploadDeck(itemId: string, file: File, options?: DeckUploadOptions): Promise<DeckUploadResult>;
	deleteDeck(itemId: string): Promise<{ ok: boolean; message: string }>;
}

/** "12.4 MB of 23.5 MB" / "Unpacking 14 of 31 files", for the progress line. */
export function deckProgressLabel(progress: DeckUploadProgress): string {
	if (progress.phase === 'preparing') return 'Preparing upload...';
	if (progress.phase === 'storing') return 'Saving the deck...';
	if (progress.phase === 'unpacking') {
		return progress.total > 0
			? `Unpacking ${progress.loaded} of ${progress.total} files`
			: 'Unpacking the deck...';
	}
	const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
	return progress.total > 0
		? `Uploading ${mb(progress.loaded)} of ${mb(progress.total)}`
		: 'Uploading...';
}

/** 0-100, or null while a phase has nothing measurable to report. */
export function deckProgressPercent(progress: DeckUploadProgress): number | null {
	if (progress.phase !== 'uploading' && progress.phase !== 'unpacking') return null;
	if (progress.total <= 0) return null;
	return Math.max(0, Math.min(100, Math.round((progress.loaded / progress.total) * 100)));
}

/** "12 files · 3.4 MB", for the manage line under a deck's title. */
export function deckSizeLine(deck: ClassroomDeck): string {
	const files = `${deck.file_count} file${deck.file_count === 1 ? '' : 's'}`;
	const mb = deck.total_bytes / 1024 / 1024;
	const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(deck.total_bytes / 1024))} KB`;
	return `${files} · ${size}`;
}
