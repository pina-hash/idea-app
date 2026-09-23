/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { FLIP, HYDRATED, LOGGED, PRESS, READ_BETWEEN, DOCUMENTS_AT_LEAST } from './_deploy-safety.mjs';

/**
 * A PHOTO IS UPLOADING WHEN A NEW VERSION GOES LIVE AND THE STUDENT PRESSES A
 * LINK: no full page load (it would kill the upload), the link still arrives
 * in-app, the photo LANDS in the background, and the NEXT link after it
 * finishes is the one that takes the new version.
 *
 * The upload is the REAL one: the engine's photo zone hands the file to the
 * production `uploadSubmissionFile`, which runs the real `uploadClassroomFile`
 * -- the choke point that holds off a reload -- and its PUT is a real request
 * the harness keeps open for six seconds ("Slow uploads"). Only the sign and
 * record endpoints are answered in memory.
 */
const PICK = `() => {
	const inputs = [...document.querySelectorAll('[data-testid="engine-here"] .fup-zone input[type="file"]')]
		.filter((i) => !i.hasAttribute('capture'));
	if (inputs.length === 0) throw new Error('no photo picker in the engine');
	const bytes = new Uint8Array(64 * 1024);
	const dt = new DataTransfer();
	dt.items.add(new File([bytes], 'joint.png', { type: 'image/png' }));
	inputs[0].files = dt.files;
	inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
	return 'picked joint.png (' + bytes.length + ' bytes) into 1 of ' + inputs.length + ' plain picker(s)';
}`;

export default {
	path: '/dev/deploy-safety?case=upload',
	label: 'Deploy safety: a photo uploading, then a link, with a new version live',
	prepare: [
		{ waitFor: HYDRATED, timeoutMs: 45_000 },
		{
			click: '[data-testid="ds-slow-uploads"]',
			until: `() => document.querySelector('[data-testid="ds-slow-uploads"]').checked === true`
		},
		{ evaluate: FLIP },
		{ evaluate: PICK },
		{
			waitFor: `() => /holds 1/.test(document.querySelector('[data-testid="ds-holds"]').textContent)`,
			timeoutMs: 10_000
		},
		{ evaluate: PRESS('[data-testid="link-next"]', 'click-held'), waitMs: 100 },
		{ waitFor: `() => location.pathname === '/dev/deploy-safety/next'`, timeoutMs: 15_000 },
		{ waitFor: LOGGED('upload-recorded'), timeoutMs: 20_000 },
		{ evaluate: PRESS('[data-testid="link-back"]', 'click-after'), waitMs: 100 },
		{ waitFor: DOCUMENTS_AT_LEAST(2), timeoutMs: 15_000 }
	],
	orderResult: [
		{
			evaluate: READ_BETWEEN('click-held', 'click-after'),
			expected: ['documents 0', 'to (none)', 'verdicts held/link', 'acknowledged first no-ack'],
			label: 'with the photo in flight: no full page load, and the verdict names the hold'
		},
		{
			evaluate: `() => {
				const log = window.__dsLog();
				const held = log.find((e) => e.label === 'click-held').at;
				const after = log.find((e) => e.label === 'click-after').at;
				const recorded = log.filter((e) => e.kind === 'upload-recorded');
				return [
					'recorded ' + recorded.length,
					'recorded after the held click ' + recorded.every((r) => r.at > held),
					'recorded before the next click ' + recorded.every((r) => r.at < after)
				];
			}`,
			expected: [
				'recorded 1',
				'recorded after the held click true',
				'recorded before the next click true'
			],
			label: 'the photo landed, after the navigation it outlived'
		},
		{
			evaluate: READ_BETWEEN('click-after', null),
			expected: ['documents 1', 'to /dev/deploy-safety', 'verdicts reload/link', 'acknowledged first no-ack'],
			label: 'the next link after the upload finished takes the new version: exactly one full page load'
		}
	]
};
