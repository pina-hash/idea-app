/**
 * IDEA // GAUNTLET pdf.js glue. One lazy, browser-only loader for `pdfjs-dist`
 * (SSR-safe: nothing imports the library at module scope) plus the reference
 * sniffing the viewer and authoring share to decide "is this drawing a PDF?".
 *
 * The worker is bundled by Vite via the `?url` suffix so the app stays fully
 * self-hosted (no CDN fetch, works on Vercel and in the dev harness alike).
 */

let lib: Promise<typeof import('pdfjs-dist')> | null = null;

/** Load pdf.js once (browser only) with its worker wired up. */
export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
	if (!lib) {
		lib = Promise.all([
			import('pdfjs-dist'),
			import('pdfjs-dist/build/pdf.worker.min.mjs?url')
		]).then(([m, worker]) => {
			m.GlobalWorkerOptions.workerSrc = worker.default;
			return m;
		});
	}
	return lib;
}

/**
 * True when a drawing reference points at a PDF: a path or URL whose filename
 * ends in .pdf (query strings ignored, so signed Storage URLs match), or a
 * data URL with the PDF media type.
 */
export function isPdfRef(ref: string | null | undefined): boolean {
	const s = (ref ?? '').trim();
	if (!s) return false;
	if (/^data:application\/pdf/i.test(s)) return true;
	const path = s.split(/[?#]/, 1)[0];
	return /\.pdf$/i.test(path);
}
