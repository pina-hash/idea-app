// tests/foundry-submit-acknowledgement.test.ts
//
// A TRUSTED PUBLISHER'S SUBMIT IS A PUBLISH, AND THE STUDENT IS TOLD SO
// (prompt 0098, item C). 0173's `foundry_submit_version` answers
// `auto_published: true` when it published in the same transaction; before
// this bundle both student surfaces discarded the answer and said "in the
// review queue" about a build already on the gallery. Pinned:
//
//   1. the one sentence for each outcome, and that the waiting sentence is
//      byte-identical to what the surface said before (nothing regresses for
//      the ordinary student);
//   2. both routes read `auto_published` off the RPC answer (the mine route
//      cannot use `callRpc`, which discards the row) and both surfaces render
//      through the helper -- a source sweep, because the press that reaches
//      the sentence needs an upload behind it that no render can stage.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { foundrySubmitAcknowledgement } from '../src/lib/foundry/surface';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the sentence', () => {
	it('says live for an auto-published build, naming the tier and the after-the-fact review', () => {
		const ack = foundrySubmitAcknowledgement({ autoPublished: true }, 3);
		expect(ack.tone).toBe('live');
		expect(ack.word).toBe('Live');
		expect(ack.sentence).toBe(
			'v3 is on the gallery now. You are a trusted publisher, so it went live without waiting for review; a reviewer can still take it down afterwards.'
		);
	});

	it('says queued for everyone else, in the words the surface already used', () => {
		expect(foundrySubmitAcknowledgement({}, 2).sentence).toBe(
			'v2 is in the review queue. You can withdraw it from My apps while it waits.'
		);
		expect(foundrySubmitAcknowledgement({ autoPublished: false }, null).sentence).toBe(
			'This version is in the review queue. You can withdraw it from My apps while it waits.'
		);
		expect(foundrySubmitAcknowledgement({}, null).tone).toBe('waiting');
	});
});

describe('both surfaces read the answer and render through the helper', () => {
	it('the two routes read auto_published off the RPC answer', () => {
		for (const route of ['../src/routes/foundry/submit/+page.svelte', '../src/routes/foundry/mine/+page.svelte']) {
			const src = read(route);
			expect(src, route).toMatch(/foundry_submit_version[\s\S]{0,400}auto_published === true/);
		}
		expect(read('../src/routes/foundry/mine/+page.svelte')).not.toMatch(
			/submitVersion: \(versionId\) => callRpc\('foundry_submit_version'/
		);
	});

	it('the two student surfaces render the helper, and the old hard-coded sentence is gone', () => {
		for (const file of ['../src/lib/foundry/FoundrySubmit.svelte', '../src/lib/foundry/FoundryMine.svelte']) {
			const src = read(file);
			expect(src, file).toMatch(/foundrySubmitAcknowledgement\(/);
			expect(src, file).toMatch(/data-testid="fdy-submit-ack"/);
			expect(src, file).not.toMatch(/is in the review queue\./);
		}
	});

	it('the transport type carries the flag on both interfaces', () => {
		const src = read('../src/lib/foundry/transports.ts');
		expect(
			src.match(/submitVersion\?: \(versionId: string\) => Promise<FoundryOutcome<\{ autoPublished\?: boolean \}>>;/g)
		).toHaveLength(2);
	});
});
