import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for VOICE NAVIGATION. Mounts the REAL `VoiceNav` component,
 * driven through the REAL `Dictation` driver, against a STUBBED recogniser --
 * no microphone, no permission prompt, no network, and nothing that could ask
 * for one. 404s in production.
 *
 * WHY A ROUTE OF ITS OWN. The shipping mount is in the root layout, so
 * `VoiceNav` is technically on every `/dev/*` page already -- but on every one
 * of them it renders NOTHING, because the harness Chromium has no
 * `SpeechRecognition` constructor and absence is the mechanism. A surface that
 * can never be in its listening state cannot be measured in it, and the
 * listening state is the one carrying the contrast, the tap targets and the
 * state readout worth checking.
 *
 * `?recognizer=off` IS THE NEGATIVE CONTROL and the whole point of the second
 * width in the spec: it mounts the identical component with the constructor
 * withheld, which is what a Firefox visitor gets. Nothing renders, and a spec
 * that only ever saw the control present could not tell that from a control
 * that is always drawn.
 *
 * `?say=<phrase>` drives one utterance through the stub on load, so a spec can
 * reach the "heard that, going there" state and the "not a command" state
 * without a microphone and without a click sequence.
 *
 * `?admin=0` narrows the vocabulary to a student's, which is the state where
 * the printed list must NOT name an admin surface.
 */
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	return {
		harness: {
			recognizer: url.searchParams.get('recognizer') !== 'off',
			admin: url.searchParams.get('admin') !== '0',
			signedIn: url.searchParams.get('signedin') !== '0',
			say: url.searchParams.get('say') ?? ''
		}
	};
};

