/**
 * Notebook camera + image-preparation helpers: the browser-side plumbing
 * between "the student produced an image" and "the image is safe to hand to
 * the corrector and the upload route".
 *
 * Split out of PhotoCorrector/NotebookView because all three of the camera
 * fixes need the same two primitives -- decode an arbitrary picked file
 * without ever hanging, and shrink an image until the server will actually
 * accept it -- and because the in-app capture view needs the stream helpers
 * without dragging the whole corrector in.
 *
 * Everything here is BEST-EFFORT BY CONTRACT: no function throws, and every
 * failure degrades to "carry on with what we already had". A photo of a
 * notebook page is a student's real work; losing it to a decode error is
 * strictly worse than uploading it untouched.
 */

/**
 * The client-side ceiling for an upload, deliberately UNDER the server's own
 * 4 MB cap (MAX_PHOTO_BYTES in $lib/server/notebook-upload).
 *
 * The margin is not decoration. Vercel rejects a request BODY past ~4.5 MB
 * at the platform edge, before the route runs, and a multipart body is the
 * file plus its part headers plus the other fields -- so a file that is
 * exactly at the server's limit can still lose the whole request to a
 * platform 413 whose body is HTML, which the client can only report as a
 * bare status code. Staying under both numbers is what keeps a failure
 * legible.
 *
 * A REAL 12 MP phone capture measures ~4-6 MB, i.e. routinely over the cap,
 * which is why fitForUpload() exists at all rather than being a safety net.
 */
export const MAX_UPLOAD_BYTES = 3.6 * 1024 * 1024;

/**
 * Longest edge kept when an image has to be re-encoded to fit. 2400 px is
 * comfortably above the corrector's own 2000 px output cap, so shrinking to
 * fit never becomes the limiting factor on how much page detail survives.
 */
export const FIT_MAX_DIM = 2400;

/**
 * How long decoding a picked file may take IN TOTAL before it is abandoned.
 *
 * A deadline is not paranoia here: an oversized capture on a memory-pressured
 * phone can leave an <img> that fires NEITHER load nor error, and
 * createImageBitmap can sit on a decode that never settles. Without one the
 * caller waits forever, which is exactly what a stuck "Opening photo..."
 * looks like to a student.
 *
 * TOTAL, not per attempt, and the distinction is the whole reason this is
 * spelled out: decoding tries two strategies in sequence, so a per-attempt
 * budget silently doubles to a wait no one on a phone will sit through. It is
 * also generous rather than tight -- a genuinely slow decode of a 12 MP
 * image on an old device has to be allowed to finish, because succeeding
 * slowly is much better than failing fast.
 */
export const DECODE_TIMEOUT_MS = 10_000;

export type DecodedImage = ImageBitmap | HTMLImageElement;

/** Width/height that works for either decoded representation. */
export function imageSize(img: DecodedImage): { width: number; height: number } {
	if (img instanceof HTMLImageElement) {
		return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
	}
	return { width: img.width, height: img.height };
}

/** ImageBitmap holds real memory; release it as soon as it is drawn. */
export function releaseImage(img: DecodedImage | null): void {
	if (img && 'close' in img) {
		try {
			img.close();
		} catch {
			// Already closed, or a browser without it. Nothing to do.
		}
	}
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
	return new Promise<T | null>((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			resolve(null);
		}, ms);
		work.then(
			(v) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(v);
			},
			() => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(null);
			}
		);
	});
}

/**
 * Decode a picked file, honouring EXIF orientation, with a hard deadline.
 * Returns null when the image cannot be decoded here at all (HEIC on a
 * desktop browser is the common case) OR when the decode overran.
 *
 * Two paths on purpose: createImageBitmap is the fast one and is the only
 * one that can be told explicitly to apply EXIF orientation, but it is also
 * the one that rejects on formats the browser can nonetheless render, so an
 * <img> decode is the fallback. A phone camera capture is almost always
 * EXIF-rotated (the sensor is landscape, the phone is held upright), so
 * getting orientation right is not an edge case here -- it is the norm.
 */
export async function decodeImageFile(
	file: Blob,
	timeoutMs = DECODE_TIMEOUT_MS
): Promise<DecodedImage | null> {
	// One deadline for the whole thing, shared across both attempts, so a
	// fallback cannot extend the wait past what the caller budgeted.
	const deadline = Date.now() + timeoutMs;
	const remaining = () => Math.max(0, deadline - Date.now());
	if (typeof createImageBitmap === 'function') {
		const bitmap = await withTimeout(
			createImageBitmap(file, { imageOrientation: 'from-image' }),
			remaining()
		);
		if (bitmap) return bitmap;
	}
	const left = remaining();
	// The first attempt burned the budget; a second one cannot beat it.
	if (left <= 0) return null;
	return withTimeout(decodeViaImgElement(file), left);
}

function decodeViaImgElement(file: Blob): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		let url: string;
		try {
			url = URL.createObjectURL(file);
		} catch {
			resolve(null);
			return;
		}
		const img = new Image();
		// Browsers apply EXIF orientation to <img> by default (image-orientation
		// is `from-image` in the initial value), which matches the explicit
		// request made of createImageBitmap above.
		const done = (value: HTMLImageElement | null) => {
			URL.revokeObjectURL(url);
			resolve(value);
		};
		img.onload = () => done(img);
		img.onerror = () => done(null);
		img.src = url;
	});
}

/**
 * Draw a decoded image into a fresh canvas at a bounded size.
 * Returns null rather than throwing when the canvas cannot be allocated --
 * a real outcome on phones, where a canvas past the platform's area limit
 * fails silently or the 2d context refuses outright.
 */
export function drawToCanvas(
	img: DecodedImage,
	maxDim: number
): { canvas: HTMLCanvasElement; width: number; height: number } | null {
	const { width: sw, height: sh } = imageSize(img);
	if (!sw || !sh) return null;
	const scale = Math.min(1, maxDim / Math.max(sw, sh));
	const width = Math.max(1, Math.round(sw * scale));
	const height = Math.max(1, Math.round(sh * scale));
	try {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(img, 0, 0, width, height);
		// A canvas past the platform limit does not throw; it comes back blank.
		// One probe is cheap next to uploading a black rectangle of a student's
		// homework, so check that something actually landed.
		if (!canvasHasContent(ctx, width, height)) return null;
		return { canvas, width, height };
	} catch {
		return null;
	}
}

/** Cheap sanity probe: a handful of pixels that are not all fully transparent. */
function canvasHasContent(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
	try {
		const xs = [0.5, 0.25, 0.75];
		const ys = [0.5, 0.25, 0.75];
		for (const fx of xs) {
			for (const fy of ys) {
				const x = Math.min(width - 1, Math.floor(width * fx));
				const y = Math.min(height - 1, Math.floor(height * fy));
				if (ctx.getImageData(x, y, 1, 1).data[3] !== 0) return true;
			}
		}
		return false;
	} catch {
		// Tainted or unreadable: assume the draw worked rather than discarding it.
		return true;
	}
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => {
		try {
			canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
		} catch {
			resolve(null);
		}
	});
}

function jpegName(original: string | null | undefined): string {
	const trimmed = original?.trim();
	if (!trimmed) return 'photo.jpg';
	return /\.jpe?g$/i.test(trimmed) ? trimmed : `${trimmed.replace(/\.[^./\\]+$/, '')}.jpg`;
}

/**
 * Shrink an image until the upload route will accept it, and otherwise leave
 * it completely alone.
 *
 * The size cap is the second half of the camera problem: the corrector
 * uploads the picked file UNTOUCHED as the 'original' variant, and a
 * full-resolution phone capture is regularly over the limit -- so the entry
 * would be refused at the route with a size error the student can do nothing
 * about, while the smaller images a gallery pick tends to produce sail
 * through. Re-encoding is what makes the camera path work at all.
 *
 * Deliberately conservative: a file already under the cap is returned as the
 * SAME object (byte-identical, original format and metadata preserved), and
 * any failure anywhere -- undecodable format, canvas refusal, an encode that
 * somehow comes out bigger -- returns the original too. This can leave the
 * file over the cap, which is a legible server error, rather than replacing
 * it with something worse.
 */
export async function fitForUpload(
	file: File,
	maxBytes = MAX_UPLOAD_BYTES,
	maxDim = FIT_MAX_DIM
): Promise<File> {
	if (file.size <= maxBytes) return file;
	let img: DecodedImage | null = null;
	try {
		img = await decodeImageFile(file);
		if (!img) return file;
		// Step the long edge down alongside quality: quality alone cannot rescue
		// a very large frame without visibly mushing the handwriting, which is
		// the one thing this photo exists to preserve.
		for (const dim of [maxDim, Math.round(maxDim * 0.75), Math.round(maxDim * 0.55)]) {
			const drawn = drawToCanvas(img, dim);
			if (!drawn) return file;
			for (const quality of [0.85, 0.72, 0.6]) {
				const blob = await toBlob(drawn.canvas, quality);
				if (!blob) return file;
				if (blob.size <= maxBytes && blob.size < file.size) {
					return new File([blob], jpegName(file.name), {
						type: 'image/jpeg',
						lastModified: file.lastModified
					});
				}
			}
		}
		return file;
	} catch {
		return file;
	} finally {
		releaseImage(img);
	}
}

// ---- which capture path to lead with -------------------------------------

/**
 * Plain user-agent sniffing, on purpose.
 *
 * There is no feature test for "does this browser honour the capture
 * attribute's VALUE" -- the attribute is reflected and reported as supported
 * either way, and the difference only shows up as which physical lens the OS
 * camera app happens to open. So the platform is the only thing that can be
 * asked, and the string is stable enough for the one decision it drives:
 * which button to lead with. Getting it wrong costs a student a tap, not a
 * capability, since BOTH paths stay on screen on every platform.
 */
export function isAndroid(ua = navigator.userAgent): boolean {
	return /android/i.test(ua);
}

export type CapturePath = 'in-app' | 'native';

/**
 * Which capture path leads, per platform, from real device testing.
 *
 * ANDROID -> the in-app camera. The native `capture` input is CONFIRMED
 * broken there on a real device (it opens the front camera, and the photo
 * never lands), and separately the attribute's value is documented as
 * ignored by Android browsers. It stays reachable, because the OS camera
 * takes a better photo when it works and a second device may not share the
 * fault, but it is not presented as the normal thing to tap.
 *
 * EVERYTHING ELSE -- which is to say iOS, and desktop -- keeps the native
 * input. Only Android is singled out, so only Android has to be detected.
 * iOS honours the facing hint correctly, and getUserMedia's ~720p ceiling on
 * iOS Safari makes the in-app camera the strictly worse option for
 * photographing a page there; on desktop the input is just a file picker.
 *
 * A platform with no working in-app camera falls back to the native input
 * regardless: one capture path that might work beats none.
 */
export function preferredCapturePath(
	ua = navigator.userAgent,
	inAppAvailable = cameraCaptureSupported()
): CapturePath {
	if (isAndroid(ua) && inAppAvailable) return 'in-app';
	return 'native';
}

// ---- in-app capture ------------------------------------------------------

export type CameraFacing = 'environment' | 'user';

/**
 * Whether an in-app camera view is even worth offering.
 *
 * getUserMedia is gated on a secure context, so http://<lan-ip> during a
 * classroom test legitimately has no camera and must fall back to the file
 * input rather than showing a control that cannot work. localhost counts as
 * secure, which is what makes the dev harness usable.
 */
export function cameraCaptureSupported(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		typeof window !== 'undefined' &&
		window.isSecureContext === true &&
		typeof navigator.mediaDevices?.getUserMedia === 'function'
	);
}

/**
 * Open a stream from the requested camera.
 *
 * The ladder is the whole point. `facingMode: { exact }` is the only form
 * that GUARANTEES the rear camera -- a plain string is an "ideal" hint the
 * browser is free to ignore, which is precisely how a page ends up looking
 * at the student's face. But `exact` legitimately fails on hardware that has
 * no such camera (a laptop, a tablet with one front sensor), so it cannot be
 * the only attempt. Try exact, then the hint, then anything at all.
 *
 * The resolution ideal asks for something well past what the corrector needs
 * (it caps output at 2000 px); browsers clamp an unreachable ideal to the
 * nearest supported mode rather than failing, so asking high costs nothing
 * and stops a phone handing back a 640x480 preview stream.
 */
export async function openCameraStream(facing: CameraFacing): Promise<MediaStream> {
	const attempts: MediaStreamConstraints[] = [
		{ video: { facingMode: { exact: facing }, width: { ideal: 3840 }, height: { ideal: 2160 } } },
		{ video: { facingMode: facing, width: { ideal: 3840 }, height: { ideal: 2160 } } },
		{ video: true }
	];
	let lastError: unknown = null;
	for (const constraints of attempts) {
		try {
			return await navigator.mediaDevices.getUserMedia(constraints);
		} catch (err) {
			lastError = err;
			// NotAllowedError is the student declining the permission prompt.
			// Retrying with looser constraints just re-prompts and annoys them,
			// and the answer will not change, so stop here.
			if ((err as DOMException)?.name === 'NotAllowedError') break;
		}
	}
	throw lastError instanceof Error ? lastError : new Error('No camera available.');
}

export function stopStream(stream: MediaStream | null): void {
	stream?.getTracks().forEach((t) => {
		try {
			t.stop();
		} catch {
			// Already stopped.
		}
	});
}

/**
 * Whether this device has more than one camera, i.e. whether offering a
 * front/back switch makes sense.
 *
 * enumerateDevices only reports real devices once permission has been
 * granted (before that the list is anonymised or empty), so this is called
 * AFTER a stream is open. A failure reports false: hiding a switch is a much
 * smaller harm than showing one that does nothing.
 */
export async function hasMultipleCameras(): Promise<boolean> {
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices.filter((d) => d.kind === 'videoinput').length > 1;
	} catch {
		return false;
	}
}

/** A human-readable reason a camera could not be opened. */
export function cameraErrorMessage(err: unknown): string {
	const name = (err as DOMException)?.name;
	if (name === 'NotAllowedError' || name === 'SecurityError') {
		return 'Camera access was blocked. Allow the camera for this site, or choose a photo instead.';
	}
	if (name === 'NotFoundError' || name === 'OverconstrainedError') {
		return 'No camera was found on this device. Choose a photo instead.';
	}
	if (name === 'NotReadableError' || name === 'AbortError') {
		return 'The camera is already in use by another app. Close it and try again, or choose a photo instead.';
	}
	return 'The camera could not be opened. Choose a photo instead.';
}

/**
 * Grab the current video frame as an upload-ready JPEG.
 *
 * Sized from the TRACK, not the on-screen <video> box, so the capture is the
 * camera's own resolution rather than whatever the preview happened to be
 * scaled to. Returns null on any failure so the caller can say so instead of
 * staging an empty file.
 */
export async function captureFrame(
	video: HTMLVideoElement,
	filename: string,
	maxDim = FIT_MAX_DIM
): Promise<File | null> {
	const sw = video.videoWidth;
	const sh = video.videoHeight;
	if (!sw || !sh) return null;
	try {
		const scale = Math.min(1, maxDim / Math.max(sw, sh));
		const width = Math.max(1, Math.round(sw * scale));
		const height = Math.max(1, Math.round(sh * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(video, 0, 0, width, height);
		const blob = await toBlob(canvas, 0.92);
		if (!blob) return null;
		return new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() });
	} catch {
		return null;
	}
}

// ---- surviving the OS camera app -----------------------------------------

const PENDING_KEY = 'notebook_pending_capture';
/** Past this, a leftover marker is treated as stale rather than a lost capture. */
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Remember what the student had typed, immediately before handing control to
 * the OS camera app.
 *
 * This exists because of a documented and still-unfixed Android behaviour:
 * the camera app is memory-hungry and runs in the foreground while the page
 * is backgrounded, so on a low-memory device Android kills the browser
 * process -- and on return the tab is reloaded with the file input EMPTY and
 * no `change` event ever fired. Nothing can recover the photo itself. What
 * can be recovered is everything around it, so the student comes back to
 * their filled-in form and an explanation rather than a blank page and
 * silence.
 *
 * Deliberately sessionStorage: this is per-tab, throwaway, and must not
 * outlive the tab. A failure to write is ignored -- storage can be full or
 * blocked, and that must not stop anyone taking a photo.
 */
export function rememberPendingCapture(state: unknown): void {
	try {
		sessionStorage.setItem(PENDING_KEY, JSON.stringify({ at: Date.now(), state }));
	} catch {
		// Storage unavailable; the capture still works, only the recovery is lost.
	}
}

/**
 * Clear the marker: we are still running, so nothing was lost.
 *
 * Called both when the capture arrives and when the page merely becomes
 * visible again -- which covers the student simply backing out of the camera
 * app, since the page surviving at all is the proof there is nothing to
 * recover. It is precisely the case where this code never gets to run that
 * leaves the marker behind for the next load to find.
 */
export function clearPendingCapture(): void {
	try {
		sessionStorage.removeItem(PENDING_KEY);
	} catch {
		// Nothing to do.
	}
}

/**
 * Read and consume a marker left by a previous page load, i.e. one whose
 * capture never came back. Returns null when there is nothing pending, when
 * the entry is unreadable, or when it is old enough to be a leftover from an
 * abandoned tab rather than a capture that was just lost.
 */
export function takePendingCapture(): unknown | null {
	let raw: string | null = null;
	try {
		raw = sessionStorage.getItem(PENDING_KEY);
	} catch {
		return null;
	}
	clearPendingCapture();
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { at?: number; state?: unknown };
		if (typeof parsed?.at !== 'number' || Date.now() - parsed.at > PENDING_MAX_AGE_MS) return null;
		return parsed.state ?? null;
	} catch {
		return null;
	}
}

/**
 * Is this file usable as a photo at all, checked BEFORE it is staged?
 *
 * A camera intent can return successfully and still hand the browser
 * nothing: an empty file, or a truncated one that reports real dimensions
 * and then draws blank. Both used to be staged like any other photo and only
 * failed later at the upload route, whose complaint ("attach a photo as the
 * photo form field") reads as nonsense to someone looking at a photo they
 * just took and staged. Catching it here means the student is told to retake
 * it at the moment that is still the obvious thing to do.
 *
 * Returns null when the file is fine, or a sentence explaining what is
 * wrong. Deliberately does NOT reject merely-undecodable files: a HEIC this
 * browser cannot open is still a real photo the server accepts and the
 * corrector already knows to skip.
 */
export async function unusableReason(file: File): Promise<string | null> {
	if (file.size === 0) {
		return 'came back empty from the camera. Nothing was saved -- take it again.';
	}
	if (file.size < 512) {
		return 'came back too small to be a photo. Nothing was saved -- take it again.';
	}
	const img = await decodeImageFile(file);
	// Undecodable HERE is not the same as broken: HEIC is the ordinary case.
	if (!img) return null;
	try {
		const { width, height } = imageSize(img);
		if (!width || !height) return 'came back damaged from the camera -- take it again.';
		// A truncated JPEG reports its real dimensions from the header and then
		// draws blank, so the header alone cannot tell the two apart; the draw
		// probe inside drawToCanvas is what actually distinguishes them.
		if (!drawToCanvas(img, 320)) return 'came back damaged from the camera -- take it again.';
		return null;
	} finally {
		releaseImage(img);
	}
}

/** `notebook-2026-08-10-143002.jpg` -- sortable, and never a bare "image.jpg". */
export function captureFileName(now: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `notebook-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(
		now.getHours()
	)}${p(now.getMinutes())}${p(now.getSeconds())}.jpg`;
}
