// tests/coin-card-pair.test.ts
//
// THE COIN CARDS ON THE HOME LAUNCHER, AND WHY THERE IS ONE NOW.
//
// Mr. Pina asked twice to stop having two coin cards (report 16, 2026-09-11,
// for one banner; and 2026-10-23, ledger 0432: "remove the Coin Desk page and
// fold anything left into the coin home", "Confirmed"). The Coin Desk card is
// gone: its areas live under the coin home at /coin/<area>, reached from the
// coin home's Staff tools card and the IDEA Coin bar's tab, and every old
// /coin-desk address answers a redirect. What still has a silent failure
// mode, and is pinned below: the PUBLIC Ledger card must stay public (a
// student and a signed-out visitor use it), and an admin's stored pin on the
// retired id must not break the arrangement of the rest.
//
// It also sweeps the WHOLE registry for two copy rules, because a launcher card
// is user-facing copy and both failures have shipped here before.

import { describe, expect, it } from 'vitest';
import { PORTAL_APPS, visibleApps, type PortalApp } from '$lib/portal-apps';

const byId = (id: string): PortalApp => {
	const app = PORTAL_APPS.find((a) => a.id === id);
	if (!app) throw new Error(`no app ${id}`);
	return app;
};

describe('one coin card, and it is public', () => {
	it('the Coin Desk card is gone; the Ledger card stays (both directions)', () => {
		expect(PORTAL_APPS.some((a) => a.id === 'coin-desk')).toBe(false);
		expect(byId('coins').href).toBe('/coins/index.html');
		expect(visibleApps(true).map((a) => a.id)).not.toContain('coin-desk');
		expect(visibleApps(true).map((a) => a.id)).toContain('coins');
	});

	it('the Ledger is reachable by a student and by a signed-out visitor', () => {
		const coins = byId('coins');
		expect(coins.adminOnly).toBeUndefined();
		expect(coins.requiresAuth).toBeUndefined();
		const forStudent = visibleApps(false).map((a) => a.id);
		expect(forStudent).toContain('coins');
		// Positive control: the student grid is not empty.
		expect(forStudent.length).toBeGreaterThan(8);
	});

	it('a stored pin and usage record on the retired card arrange the rest unharmed', async () => {
		const { arrangeApps, readHomepagePrefs } = await import('$lib/portal-apps');
		const stored = readHomepagePrefs({
			homepage: {
				pinned: ['coin-desk'],
				order: ['coin-desk', 'coins'],
				sort: 'custom',
				usage: { 'coin-desk': { count: 12, last: '2026-09-01T10:00:00Z' } }
			}
		});
		const arranged = arrangeApps(visibleApps(true), stored, 'custom');
		expect(arranged.map((a) => a.id)).not.toContain('coin-desk');
		expect(arranged.map((a) => a.id)).toContain('coins');
		expect(arranged.length).toBe(visibleApps(true).length);
	});

	it('the Ledger card says it reads and never writes, with a verb of its own', () => {
		const coins = byId('coins');
		expect(coins.sub).toMatch(/where everyone reads/i);
		expect(coins.sub).toMatch(/nothing here changes a balance/i);
		expect(coins.cta).not.toBe('Open');
	});
});

describe('registry-wide copy rules', () => {
	const userFacing = PORTAL_APPS.flatMap((a) => [a.title, a.sub, a.cta]);

	it('sweeps something', () => {
		expect(userFacing.length).toBe(PORTAL_APPS.length * 3);
		expect(PORTAL_APPS.length).toBeGreaterThan(10);
	});

	/** CLAUDE.md: no em dashes in user-facing copy. */
	it('carries no em dash', () => {
		for (const s of userFacing) expect(s, s).not.toMatch(/—/);
	});

	/**
	 * NO MIGRATION NUMBERS IN A LAUNCHER CARD. The Coin Desk sub read "against
	 * the real coin ledger (0070)" until this bundle: a commit message that
	 * wandered into the interface. Four digits in parentheses is the exact
	 * shape, so the sweep is narrow enough not to catch a year or a count.
	 */
	it('names no migration number', () => {
		for (const s of userFacing) expect(s, s).not.toMatch(/\(\s*\d{4}\s*\)/);
	});
});
