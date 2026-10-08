/**
 * ONE IMPLEMENTATION OF THE DOWNLOAD CLICK, for every feedback console.
 *
 * `<a download>` on a blob URL, revoked after the click: a server round trip
 * would only re-derive rows the console already holds. It lived inside
 * FeedbackConsole until the Armory app's two consoles needed the same click;
 * two copies of this is two places a revoke can be forgotten, and the second
 * one is always the one that is.
 *
 * ONE FILE PER PRESS. Chrome blocks a page that starts several downloads from
 * one click, which is why a console that has several files to hand over hands
 * them over as one zip (`buildZip`) rather than calling this in a loop.
 */
export function saveBlob(name: string, blob: Blob): void {
	if (typeof document === 'undefined') return;
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** Text, with its media type and a charset, through the same click. */
export function saveText(name: string, text: string, mime: string): void {
	saveBlob(name, new Blob([text], { type: `${mime};charset=utf-8` }));
}

/** Bytes (a zip), through the same click. */
export function saveBytes(name: string, bytes: Uint8Array, mime = 'application/zip'): void {
	saveBlob(name, new Blob([bytes as BlobPart], { type: mime }));
}
