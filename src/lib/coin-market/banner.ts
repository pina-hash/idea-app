/**
 * THE CLASSROOM HEADER BANNER (ledger 0402, 0280): its pins, its three looks
 * and the per-day dismissal, as plain data and pure helpers. The looks are
 * candidates for Mr. Pina to choose between on /coin-desk/settings; the
 * stored setting picks one and `spotlight` is the default.
 */

export type BannerStyle = 'ticker' | 'spotlight' | 'cards';
export const BANNER_STYLES: { id: BannerStyle; label: string; blurb: string }[] = [
	{ id: 'spotlight', label: 'Spotlight', blurb: 'One pin at a time on a raised plate, crossfading every few seconds, with dots for where you are.' },
	{ id: 'ticker', label: 'Ticker', blurb: 'A slim strip that scrolls every pin past, like a stock ticker. Pauses under the pointer.' },
	{ id: 'cards', label: 'Cards', blurb: 'Up to three small cards side by side, turning to the next set every few seconds.' }
];
export const DEFAULT_BANNER_STYLE: BannerStyle = 'spotlight';

export function isBannerStyle(v: unknown): v is BannerStyle {
	return v === 'ticker' || v === 'spotlight' || v === 'cards';
}

export type BannerKind = 'listing' | 'official' | 'contract' | 'shop' | 'link';

export interface BannerPin {
	id: string;
	kind: BannerKind;
	listing_id: string | null;
	title: string;
	subtitle: string | null;
	href: string;
	starts_on: string | null;
	ends_on: string | null;
	section_id: string | null;
	section: string | null;
	sort_order: number;
	price: number | null;
}

export interface BannerPayload {
	style: BannerStyle;
	pins: BannerPin[];
}

const KINDS: BannerKind[] = ['listing', 'official', 'contract', 'shop', 'link'];

export function parseBanner(raw: unknown): BannerPayload | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	if (!Array.isArray(o.pins)) return null;
	const pins: BannerPin[] = [];
	for (const p of o.pins) {
		if (!p || typeof p !== 'object') continue;
		const x = p as Record<string, unknown>;
		if (typeof x.id !== 'string' || typeof x.title !== 'string' || typeof x.href !== 'string') continue;
		// Same-site only, re-checked where it meets an href (the database already refused anything else).
		if (!/^\/[^/\\]/.test(x.href)) continue;
		const price = x.price === null || x.price === undefined ? null : Number(x.price);
		pins.push({
			id: x.id,
			kind: KINDS.includes(x.kind as BannerKind) ? (x.kind as BannerKind) : 'link',
			listing_id: typeof x.listing_id === 'string' ? x.listing_id : null,
			title: x.title,
			subtitle: typeof x.subtitle === 'string' ? x.subtitle : null,
			href: x.href,
			starts_on: typeof x.starts_on === 'string' ? x.starts_on : null,
			ends_on: typeof x.ends_on === 'string' ? x.ends_on : null,
			section_id: typeof x.section_id === 'string' ? x.section_id : null,
			section: typeof x.section === 'string' ? x.section : null,
			sort_order: Number(x.sort_order ?? 0) || 0,
			price: price !== null && Number.isFinite(price) ? price : null
		});
	}
	return { style: isBannerStyle(o.style) ? o.style : DEFAULT_BANNER_STYLE, pins };
}

/** The per-viewer, per-day key a dismissal is remembered under. */
export function bannerDismissKey(day: string): string {
	return `idea.coinBanner.hidden:${day}`;
}

/** Read and write the dismissal, never throwing (blocked or full storage is "not dismissed"). */
export function bannerDismissed(day: string): boolean {
	try {
		return globalThis.localStorage?.getItem(bannerDismissKey(day)) === '1';
	} catch {
		return false;
	}
}
export function dismissBanner(day: string): void {
	try {
		globalThis.localStorage?.setItem(bannerDismissKey(day), '1');
	} catch {
		/* a dismissal that cannot be stored lasts until the page reloads */
	}
}

/** The window of pins the cards look shows at a step. */
export function cardsWindow<T>(pins: T[], step: number, size = 3): T[] {
	if (pins.length <= size) return pins;
	const out: T[] = [];
	for (let i = 0; i < size; i++) out.push(pins[(step * size + i) % pins.length]);
	return out;
}

/** How many steps a look has before it repeats. */
export function bannerSteps(style: BannerStyle, count: number, cardsPerStep = 3): number {
	if (count <= 1) return 1;
	if (style === 'cards') return Math.ceil(count / cardsPerStep);
	return count;
}

export const BANNER_ROTATE_MS = 6000;
