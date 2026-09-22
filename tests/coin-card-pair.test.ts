// tests/coin-card-pair.test.ts
//
// THE TWO COIN CARDS, AND WHY THERE ARE STILL TWO.
//
// Mr. Pina asked (report 16, 2026-09-11) for the IDEA Coin Ledger and Coin
// Desk to become ONE banner split into two buttons, to minimize confusion. The
// confusion is real; the merged tile was refused, and the answer shipped is the
// copy pinned below. Both halves of that decision have silent failure modes,
// which is why this file exists:
//
//  1. MERGING THE TWO CARDS LOOKS HARMLESS AND IS NOT. `visibleApps` partitions
//     `adminOnly` to the end of the grid, so a merged tile is either admin-only
//     -- which DELETES the public Ledger card every student and every
//     signed-out visitor uses -- or it is a public card carrying an admin-only
//     button. And a merged tile keeps one id, while pins, custom order and
//     usage counts are all keyed on the id: retiring `coin-desk` silently drops
//     every admin's record for the tool they use most, which is precisely what
//     the `dashboard` entry refused to do when `admin` merged into it.
//
//  2. THE COPY IS THE WHOLE FIX, SO LOSING IT LOSES THE FIX. A sub rewritten
//     back to a description of features, or a CTA reverted to the generic
//     "Open" five other cards share, restores the exact ambiguity this bundle
//     was asked to remove, and nothing on screen reports it.
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

describe('both cards survive, with both ids', () => {
	it('is two entries, not one', () => {
		const coins = byId('coins');
		const desk = byId('coin-desk');
		expect(coins.href).toBe('/coins/index.html');
		expect(desk.href).toBe('/coin-desk');
	});

	/**
	 * THE PUBLIC CARD IS PUBLIC. This is the half a merged admin-only tile
	 * would have deleted, and the outcome would have been invisible to the one
	 * person able to notice: an admin sees a card either way.
	 */
	it('the Ledger is reachable by a student and by a signed-out visitor', () => {
		const coins = byId('coins');
		expect(coins.adminOnly).toBeUndefined();
		expect(coins.requiresAuth).toBeUndefined();
		const forStudent = visibleApps(false).map((a) => a.id);
		expect(forStudent).toContain('coins');
		expect(forStudent).not.toContain('coin-desk');
		// Positive control for the absence above: the student grid is not empty.
		expect(forStudent.length).toBeGreaterThan(8);
	});

	it('the Desk stays admin-only and stays its own id', () => {
		const desk = byId('coin-desk');
		expect(desk.adminOnly).toBe(true);
		const forAdmin = visibleApps(true).map((a) => a.id);
		expect(forAdmin).toContain('coin-desk');
		expect(forAdmin).toContain('coins');
	});

	/**
	 * THE REASON THE IDS MATTER, stated as the thing a merge would break: a
	 * stored `HomepagePrefs` is keyed on these strings, so an id that stops
	 * existing is a pin, a dragged position and a launch history that stop
	 * being matched. Asserted through the real arrangement helpers rather than
	 * by reading the registry twice.
	 */
	it('a stored pin and usage record still resolve for both cards', async () => {
		const { arrangeApps, recordUsage, readHomepagePrefs } = await import('$lib/portal-apps');
		const stored = readHomepagePrefs({
			homepage: {
				pinned: ['coin-desk'],
				order: ['coin-desk', 'coins'],
				sort: 'custom',
				usage: { 'coin-desk': { count: 12, last: '2026-09-01T10:00:00Z' } }
			}
		});
		expect(stored.pinned).toEqual(['coin-desk']);
		expect(stored.usage?.['coin-desk']?.count).toBe(12);

		const arranged = arrangeApps(visibleApps(true), stored, 'custom');
		// The pinned card is first, which is only true if its id still matches
		// an app in the registry.
		expect(arranged[0].id).toBe('coin-desk');
		expect(arranged.map((a) => a.id)).toContain('coins');

		const bumped = recordUsage(stored, 'coin-desk', new Date('2026-09-02T10:00:00Z'));
		expect(bumped.usage?.['coin-desk']?.count).toBe(13);
	});
});

describe('the copy that answers the confusion', () => {
	const coins = byId('coins');
	const desk = byId('coin-desk');

	/**
	 * PARALLEL GRAMMAR IS THE MECHANISM, not a style preference: the two cards
	 * do not sit next to each other in the grid (the admin block sorts last),
	 * so each one has to answer "which of these two is this" on its own.
	 */
	it('each card says which side of the ledger it is, in the same grammar', () => {
		expect(coins.sub).toMatch(/where everyone reads/i);
		expect(desk.sub).toMatch(/where staff write/i);
	});

	it('each card names the boundary a person is actually asking about', () => {
		expect(coins.sub).toMatch(/nothing here changes a balance/i);
		expect(desk.sub).toMatch(/only tool that changes a balance/i);
	});

	it('the Desk names the Ledger, so the pair is discoverable from the admin card', () => {
		expect(desk.sub).toContain('IDEA Coin Ledger');
	});

	/**
	 * THE VERBS DIFFER, which is the cheapest disambiguator on the card and the
	 * one a person reads last, on the control they are about to press. "Open"
	 * is what five other cards say and says nothing.
	 */
	it('the two CTAs are different verbs, and neither is the generic one', () => {
		expect(coins.cta).not.toBe(desk.cta);
		expect(desk.cta).toBe('Log');
		expect(coins.cta).not.toBe('Open');
		expect(desk.cta).not.toBe('Open');
		// Positive control: "Open" IS the generic label, and other cards use it.
		expect(PORTAL_APPS.filter((a) => a.cta === 'Open').length).toBeGreaterThan(2);
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
