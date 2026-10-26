// tests/dom/html-frame-reready-mount.test.ts
//
// A DOCUMENT THAT RELOADS IN PLACE HEARS EVERY TEAM MESSAGE AGAIN (ledger 0438,
// report 4fbab5ca). A second `idea:ready` means the document knows nothing:
// the frame re-sends the state, the tracker and who may type where, and since
// this bundle the team's progress too. Before, `toldTeam` was never reset and
// `ready` stayed true across the reload, so the progress line stayed blank
// until a teammate saved something.
//
// Structure and messages only, on the REAL component: the iframe's
// `contentWindow.postMessage` is recorded, and the document's `idea:ready` is
// a real MessageEvent from that window with the sandbox's `null` origin.

import { describe, expect, it } from 'vitest';
import HtmlAssignmentFrame from '../../src/lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
import {
	HX_SCHEMA_VERSION,
	HX_TEAM_PROGRESS_TYPE
} from '../../src/lib/classroom/html-assignment/bridge';
import { mountInto } from './mount';

const TEAM = {
	team: 'Torque',
	members: [{ name: 'Ana', me: true, handedIn: false, percent: 50, done: ['sketch'], modules: [] }]
};
const TRACKER_TYPE = 'idea:team-tracker';

function typesSent(sent: unknown[]): string[] {
	return sent.map((m) => (m && typeof m === 'object' ? String((m as { type?: unknown }).type) : '?'));
}

describe('a second idea:ready re-sends every team message', () => {
	it('progress goes down on the first ready and again on the second', async () => {
		const m = mountInto(HtmlAssignmentFrame as never, {
			src: 'about:blank',
			title: 'Team worksheet',
			fieldToBlockId: { sketch: 'b-sketch' },
			team: TEAM,
			teamTracker: null
		});
		const iframe = m.one<HTMLIFrameElement>('iframe');
		const win = iframe.contentWindow as Window;
		expect(win).toBeTruthy();
		const sent: unknown[] = [];
		(win as unknown as { postMessage: (msg: unknown) => void }).postMessage = (msg: unknown) => {
			sent.push(msg);
		};
		const ready = () =>
			window.dispatchEvent(
				new MessageEvent('message', {
					data: { type: 'idea:ready', schemaVersion: HX_SCHEMA_VERSION },
					origin: 'null',
					source: win as unknown as MessageEventSource
				})
			);

		ready();
		await m.settle();
		const first = typesSent(sent).filter((t) => t === HX_TEAM_PROGRESS_TYPE).length;
		expect(first).toBe(1);
		// The control: no tracker was handed in, so none goes down either time.
		expect(typesSent(sent)).not.toContain(TRACKER_TYPE);

		sent.length = 0;
		ready();
		await m.settle();
		expect(typesSent(sent).filter((t) => t === HX_TEAM_PROGRESS_TYPE).length).toBe(1);
		expect(typesSent(sent)).toContain('idea:state');
		await m.stop();
	});
});
