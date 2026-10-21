/**
 * VIEW AS AND ACT AS, the client-safe half (ledger 0422). What the root layout
 * hands every page while an admin is looking at the site as someone else, and
 * the pure helpers the floating panel uses. No server import, no Svelte.
 */

export type ViewAsMode = 'view' | 'act';

export interface ViewAsState {
	mode: ViewAsMode;
	target_email: string;
	target_name: string;
	admin_email: string;
	admin_name: string | null;
	started_at: string;
	expires_at: string;
	expired: boolean;
	test_account: boolean;
	changes: number;
}

/** The database's answer from `view_as_current()`, or null for anything else. */
export function parseViewAs(raw: unknown): ViewAsState | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (r.mode !== 'view' && r.mode !== 'act') return null;
	if (typeof r.target_email !== 'string' || typeof r.expires_at !== 'string') return null;
	return {
		mode: r.mode,
		target_email: r.target_email,
		target_name: typeof r.target_name === 'string' && r.target_name ? r.target_name : r.target_email,
		admin_email: typeof r.admin_email === 'string' ? r.admin_email : '',
		admin_name: typeof r.admin_name === 'string' ? r.admin_name : null,
		started_at: typeof r.started_at === 'string' ? r.started_at : '',
		expires_at: r.expires_at,
		expired: r.expired === true,
		test_account: r.test_account === true,
		changes: typeof r.changes === 'number' ? r.changes : Number(r.changes) || 0
	};
}

/** "2h 14m left", "9m left", "ending". */
export function timeLeft(expiresAt: string, now = Date.now()): string {
	const ms = Date.parse(expiresAt) - now;
	if (!Number.isFinite(ms) || ms <= 0) return 'ending';
	const m = Math.ceil(ms / 60000);
	if (m < 60) return `${m}m left`;
	return `${Math.floor(m / 60)}h ${m % 60}m left`;
}

/** Where the panel sits, as fractions of the viewport so a resize keeps it on screen. */
export interface PanelPosition {
	x: number;
	y: number;
}

export const PANEL_POSITION_KEY = 'idea_view_as_panel';
// Bottom centre: clear of the feedback key, which sits bottom right on every page.
export const DEFAULT_PANEL_POSITION: PanelPosition = { x: 0.5, y: 0.98 };

export function clampPosition(p: Partial<PanelPosition> | null | undefined): PanelPosition {
	const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
	return { x: n(p?.x, DEFAULT_PANEL_POSITION.x), y: n(p?.y, DEFAULT_PANEL_POSITION.y) };
}

/**
 * The top-left pixel for a panel of `w` by `h` at position `p` in a `vw` by `vh`
 * viewport, kept `margin` px inside every edge. x=0 is flush left, x=1 flush right.
 */
export function placePanel(p: PanelPosition, w: number, h: number, vw: number, vh: number, margin = 8) {
	const maxX = Math.max(margin, vw - w - margin);
	const maxY = Math.max(margin, vh - h - margin);
	return {
		left: Math.round(margin + (maxX - margin) * p.x),
		top: Math.round(margin + (maxY - margin) * p.y)
	};
}

/** The inverse of placePanel: a dragged top-left back to fractions. */
export function positionFrom(left: number, top: number, w: number, h: number, vw: number, vh: number, margin = 8): PanelPosition {
	const spanX = Math.max(1, vw - w - 2 * margin);
	const spanY = Math.max(1, vh - h - 2 * margin);
	return clampPosition({ x: (left - margin) / spanX, y: (top - margin) / spanY });
}

/** Routes the site serves with the service role that a read-only session must not reach. */
export const VIEW_AS_REFUSED_WRITE_PREFIXES = ['/api/greenline-track-publish', '/api/armory', '/armory'];

export function viewAsRefusesRequest(state: ViewAsState | null, method: string, pathname: string): boolean {
	if (!state || (state.mode === 'act' && !state.expired)) return false;
	if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
	return VIEW_AS_REFUSED_WRITE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
