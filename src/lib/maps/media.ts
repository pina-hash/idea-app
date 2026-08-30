/**
 * IDEA MAPS PHOTOS -- the client-side half of 0163, which is a set of rules
 * that migration WROTE DOWN AS THIS BUNDLE'S OBLIGATIONS rather than as
 * suggestions. Its header says so in as many words: "Enforcement is at upload
 * time against the request's declared content type, so the P1 editor's upload
 * path must set a concrete image/* type from the file's extension -- File.type
 * is legitimately EMPTY for HEIC off an iPhone, and an empty type defaults to
 * application/octet-stream, which this bucket refuses. That obligation is the
 * editor bundle's and is stated here so it is not discovered as a field bug."
 *
 * This module is that obligation, plus the one 0163 does not state and this
 * bundle adds: a refusal happens BEFORE the transfer starts. A 19 MB photo
 * pushed up school wifi and refused on arrival is a minute of somebody's time
 * standing at a toolbox; the same refusal taken from `File.size` is instant
 * and says the size AND the limit, which "too large" alone never does.
 *
 * Pure and client-safe: no Svelte, no Supabase, no `$app`. The numbers here
 * MIRROR 0163's own and the mirror is stated in `tests/maps-shelf.test.ts`
 * against the migration file itself, so a bucket setting that moves without
 * this module moving reddens rather than shipping.
 */

/** 0163 section 1, verbatim: the bucket these bytes go to. */
export const MAPS_MEDIA_BUCKET = 'maps-media';

/** 0163's `file_size_limit`: 20971520 bytes, 20 MiB. */
export const MAPS_MEDIA_MAX_BYTES = 20971520;

/**
 * WHAT `image/*` ADMITS AND WHAT THIS REFUSES ANYWAY, which is a narrowing and
 * is deliberate.
 *
 * The bucket's `allowed_mime_types` is the single wildcard `image/*`, so
 * Storage itself would accept `image/svg+xml`. An SVG is a DOCUMENT, not a
 * picture -- it carries script, external references and event handlers -- and
 * `maps-media` is a PUBLIC bucket, so an accepted one is a scriptable document
 * served from the project's own Storage origin on a URL anybody can open
 * directly. The classroom's own rule already says this ("Everything else is
 * refused by name, including SVG from ANY source (it is a document, not a
 * picture)") and refuses it by extension AND by declared type, because either
 * can be the only spelling present.
 *
 * This list cannot close the hole -- a caller that skips this module reaches
 * the same bucket -- and closing it properly is a migration replacing the
 * wildcard with a concrete raster list. That is reported rather than written
 * here (this bundle writes no migration). What this list buys is that the one
 * shipped upload path never produces one.
 */
const REFUSED_TYPES = new Set(['image/svg+xml']);
const REFUSED_EXTENSIONS = new Set(['svg', 'svgz']);

/**
 * Extension -> concrete media type, for the case the File API requires: a
 * platform that cannot determine a file's media type MUST report the empty
 * string, and iPhone HEIC is exactly that case in practice.
 *
 * DELIBERATELY WIDER THAN THE NOTEBOOK'S FIVE-TYPE ALLOWLIST, and that is why
 * this is not a second copy of `resolveMime` in `$lib/server/notebook-upload`.
 * That one answers "which five types may make a Drive round trip under a 4 MB
 * cap"; this one answers "what concrete `image/*` type will Storage accept for
 * these bytes", against a bucket whose own rule is the wildcard. The two lists
 * differ because the two questions do. (It could not be shared regardless:
 * that module is `$lib/server/*`, which SvelteKit refuses to bundle for a
 * browser, and this check has to run before the bytes leave the phone.)
 */
const EXT_MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	heic: 'image/heic',
	heif: 'image/heif',
	avif: 'image/avif',
	bmp: 'image/bmp',
	tif: 'image/tiff',
	tiff: 'image/tiff'
};

/** The reverse, for naming the stored object. Unknown image types keep `img`. */
const MIME_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/avif': 'avif',
	'image/bmp': 'bmp',
	'image/tiff': 'tiff'
};

export type MapsMediaCheck =
	| { ok: true; mimeType: string; ext: string }
	| { ok: false; problem: string };

export function extensionOf(name: string | null | undefined): string | null {
	return (name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? null;
}

/**
 * The media type these bytes will be UPLOADED under -- never `File.type`
 * alone. The declared type wins when it is a usable image type; otherwise the
 * filename's extension is what the browser can still tell us; otherwise this
 * refuses, in the person's terms, naming what it saw.
 */
export function mapsImageMime(file: { name?: string; type?: string }): MapsMediaCheck {
	const declared = (file.type ?? '').trim().toLowerCase();
	const ext = extensionOf(file.name);

	if (REFUSED_TYPES.has(declared) || (ext !== null && REFUSED_EXTENSIONS.has(ext))) {
		return {
			ok: false,
			problem:
				'An SVG is a document rather than a photograph, so it is not accepted here. Take a photo, or use a JPEG or PNG.'
		};
	}
	if (declared.startsWith('image/')) {
		return { ok: true, mimeType: declared, ext: MIME_EXT[declared] ?? ext ?? 'img' };
	}
	if (ext !== null && EXT_MIME[ext]) {
		// The File API REQUIRES an empty type where the platform cannot
		// determine one, so this is the CONFORMING path for an iPhone HEIC and
		// not a broken browser. 0163 names it as the case to get right.
		return { ok: true, mimeType: EXT_MIME[ext], ext: MIME_EXT[EXT_MIME[ext]] ?? ext };
	}
	return {
		ok: false,
		problem: declared
			? `That file is a ${declared}, and only photographs can go on the map.`
			: 'That file is not a photograph, and the browser did not say what it is. Choose an image, or take one with the camera.'
	};
}

/** Whole megabytes where the number is big, one decimal where it is not. */
export function describeBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	if (mb >= 10) return `${Math.round(mb)} MB`;
	if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * THE ONE GATE, run before a single byte is sent. Size first, because size is
 * the refusal that costs a minute of school wifi if it happens on the far end;
 * type second. A refusal states the size AND the limit -- "too large" with no
 * number is a guessing game (CLAUDE.md).
 */
export function mapsPhotoRefusal(file: { name?: string; type?: string; size: number }): string | null {
	if (file.size === 0) return 'That file is empty. Take the photo again.';
	if (file.size > MAPS_MEDIA_MAX_BYTES) {
		return `That photo is ${describeBytes(file.size)}, over the ${describeBytes(
			MAPS_MEDIA_MAX_BYTES
		)} limit for a map photo. Take it again at a smaller size, or pick a different one.`;
	}
	const mime = mapsImageMime(file);
	return mime.ok ? null : mime.problem;
}

/** Which owner a photo hangs off -- 0163's XOR, as the three names it allows. */
export type MapsPhotoOwner = 'node' | 'item_type' | 'item';

const OWNER_COLUMN: Record<MapsPhotoOwner, 'node_id' | 'item_type_id' | 'item_id'> = {
	node: 'node_id',
	item_type: 'item_type_id',
	item: 'item_id'
};

export function mapsPhotoOwnerColumn(owner: MapsPhotoOwner) {
	return OWNER_COLUMN[owner];
}

/**
 * The stored object's key. NOTHING A PERSON TYPED APPEARS IN IT -- the same
 * rule the classroom storage layout states, which takes filename sanitization
 * off the surface entirely rather than making it careful -- so it is a uuid
 * under a folder naming the owner kind, plus the resolved extension.
 *
 * 0163's own CHECK is `^[A-Za-z0-9][A-Za-z0-9._/-]*$` with no `..` and at most
 * 1024 characters; every key this produces satisfies it by construction (a
 * folder name from the closed set above, a uuid, a lowercased alphanumeric
 * extension), and `tests/maps-shelf.test.ts` puts the produced keys back
 * through that regex rather than trusting the sentence.
 */
export function mapsPhotoKey(owner: MapsPhotoOwner, uuid: string, ext: string): string {
	const safeExt = (ext || 'img').toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
	return `${owner === 'item_type' ? 'type' : owner}/${uuid}.${safeExt}`;
}

/** A `maps_photos` row, as 0163 projects it. */
export interface MapsPhoto {
	id: string;
	node_id: string | null;
	item_type_id: string | null;
	item_id: string | null;
	storage_key: string;
	caption: string | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
}

/**
 * The public URL of a stored object. Built rather than fetched: `maps-media`
 * is a PUBLIC bucket (0163, the spec's own 4.4 call), so the object's address
 * is a pure function of the project URL and the key and needs no round trip
 * and no signature. An empty base answers empty, so a surface with no
 * configured project renders no broken image rather than a wrong one.
 */
export function mapsPhotoUrl(supabaseUrl: string, storageKey: string): string {
	const base = supabaseUrl.replace(/\/+$/, '');
	if (!base || !storageKey) return '';
	return `${base}/storage/v1/object/public/${MAPS_MEDIA_BUCKET}/${storageKey}`;
}
