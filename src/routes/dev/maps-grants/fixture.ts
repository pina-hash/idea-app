/**
 * Fixture scope and in-memory grant transports for the granted-editor harness.
 *
 * IT MIRRORS THE MECHANISMS, NOT ONLY THE HAPPY PATH -- a harness missing a
 * guard the real page has makes a passing drive prove nothing (CLAUDE.md). So
 * the roster refuses the same domains `maps_editor_grant` refuses, in the same
 * words, and a revoke really removes the row rather than reporting success
 * over an unchanged list.
 *
 * Lives beside the dev route rather than in `$lib` because it is fixture, not
 * shipping code; the render tests import it from here so what they assert is
 * what the harness drives.
 */

import {
	mapsGrantEmailProblem,
	mapsNormalizeGrantEmail,
	type MapsEditorScope,
	type MapsRosterRow
} from '$lib/maps/grants';
import type { MapsGrantTransports, MapsResult } from '$lib/maps/transports';
import { FIX } from '../maps-edit/fixture';

/**
 * A granted editor holding MACHINE SHOP, which in the shared fixture contains
 * Tool Chest A (with Drawer 1 published and Drawer 2 draft) and Workbench B --
 * so the harness has, under one grant, a published container, a draft
 * container and two depths. Mill Room and Prototype Lab sit outside it, which
 * is the other half of every measurement.
 */
export function mapsGranteeScope(): MapsEditorScope {
	return {
		admin: false,
		grants: [
			{
				node_id: FIX.machineShop,
				granted_at: '2026-09-02T09:00:00Z',
				note: 'Cataloguing the tool chests'
			}
		]
	};
}

export function memoryGrantTransports(): MapsGrantTransports {
	let rows: MapsRosterRow[] = [
		{
			email: 'student@boscotech.net',
			node_id: FIX.machineShop,
			granted_by: 'apina@boscotech.edu',
			granted_at: '2026-09-02T09:00:00Z',
			note: 'Cataloguing the tool chests'
		}
	];
	const ok = <T>(data: T): MapsResult<T> => ({ ok: true, data });
	const refuse = (message: string): MapsResult<never> => ({
		ok: false,
		retryable: false,
		message
	});
	return {
		async roster(nodeId = null) {
			return ok(rows.filter((r) => nodeId === null || r.node_id === nodeId));
		},
		async grant(email, nodeId, note) {
			// The SAME domain rule the RPC raises, so a drive that trips it
			// here reads what a drive that trips it in production reads.
			const problem = mapsGrantEmailProblem(email);
			if (problem) return refuse(problem);
			const address = mapsNormalizeGrantEmail(email);
			rows = [
				...rows.filter((r) => !(r.email === address && r.node_id === nodeId)),
				{
					email: address,
					node_id: nodeId,
					granted_by: 'apina@boscotech.edu',
					granted_at: new Date().toISOString(),
					note
				}
			];
			return ok(null);
		},
		async revoke(email, nodeId) {
			rows = rows.filter((r) => !(r.email === email && r.node_id === nodeId));
			return ok(null);
		}
	};
}
