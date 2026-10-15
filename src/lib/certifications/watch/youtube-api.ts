/**
 * THE YOUTUBE IFRAME PLAYER API, LOADED ONCE (ledger 0391).
 *
 * The training player needs the API's clock (`getCurrentTime`, `getPlaybackRate`)
 * to credit played seconds; a plain embed answers nothing. The API is one
 * script, `https://www.youtube.com/iframe_api`, which calls a GLOBAL
 * `onYouTubeIframeAPIReady` when it is ready. This module is the one place that
 * script is inserted and that callback is owned, on the shape the VANGUARD
 * co-op bootstrap uses for its realtime client (`src/routes/vanguard/+server.ts`):
 * a memoized promise, an already-present short-circuit, `createElement('script')`
 * with `async`, and an `onerror` that RESETS the memo so a Reload key can try
 * again.
 *
 * THE TYPINGS ARE HAND-WRITTEN AND MINIMAL, deliberately: `@types/youtube` is a
 * dependency this build adds nothing to the lockfile for, and the player uses
 * eleven methods and five state constants. Anything the component does not
 * call is not declared, so a new call is a new line here rather than a silent
 * `any`.
 *
 * NOTHING HERE RUNS ON THE SERVER. `loadYouTubeIframeApi` rejects at once
 * with no `window`; the component calls it from `onMount` only.
 */

export const YT_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

/** The privacy-enhanced host every embedded player in this repository uses. */
export const YOUTUBE_NOCOOKIE_HOST = 'https://www.youtube-nocookie.com';

/** `YT.PlayerState`, as numbers, so a test needs no namespace. */
export const YT_STATE = {
	UNSTARTED: -1,
	ENDED: 0,
	PLAYING: 1,
	PAUSED: 2,
	BUFFERING: 3,
	CUED: 5
} as const;
export type YTPlayerState = (typeof YT_STATE)[keyof typeof YT_STATE];

export interface YTPlayerEvent {
	target: YTPlayer;
}
export interface YTStateChangeEvent extends YTPlayerEvent {
	data: number;
}
export interface YTRateChangeEvent extends YTPlayerEvent {
	data: number;
}
export interface YTErrorEvent extends YTPlayerEvent {
	/** 2 bad id, 5 HTML5 error, 100 not found, 101 and 150 embedding refused, 153 no referrer. */
	data: number;
}

export interface YTPlayerVars {
	enablejsapi?: 0 | 1;
	origin?: string;
	rel?: 0 | 1;
	playsinline?: 0 | 1;
	modestbranding?: 0 | 1;
	start?: number;
	autoplay?: 0 | 1;
	controls?: 0 | 1;
	[key: string]: string | number | undefined;
}

export interface YTPlayerEvents {
	onReady?: (e: YTPlayerEvent) => void;
	onStateChange?: (e: YTStateChangeEvent) => void;
	onPlaybackRateChange?: (e: YTRateChangeEvent) => void;
	onError?: (e: YTErrorEvent) => void;
}

export interface YTPlayerOptions {
	host?: string;
	videoId: string;
	width?: number | string;
	height?: number | string;
	playerVars?: YTPlayerVars;
	events?: YTPlayerEvents;
}

/** The methods the tracker and the component call. */
export interface YTPlayer {
	getCurrentTime(): number;
	getDuration(): number;
	getPlayerState(): number;
	getPlaybackRate(): number;
	setPlaybackRate(rate: number): void;
	getAvailablePlaybackRates(): number[];
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	getIframe(): HTMLIFrameElement;
	destroy(): void;
}

export interface YTNamespace {
	Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
	PlayerState?: Record<string, number>;
	/** 1 once the API has finished loading. */
	loaded?: number;
}

declare global {
	interface Window {
		YT?: YTNamespace;
		onYouTubeIframeAPIReady?: () => void;
	}
}

let memo: Promise<YTNamespace> | null = null;

/** The error the loader rejects with when the script never arrives. */
export const YT_API_FAILED_MESSAGE = 'The YouTube player script did not load.';

/** What the player shows for that, with its Reload key beside it. */
export const PLAYER_FAILED_SENTENCE = 'The player did not load. Check your connection and reload.';
/** What the player shows when YouTube refused the video itself (its `onError`). */
export const PLAYER_ERROR_SENTENCE = 'This video could not be played here.';

/**
 * The API namespace, once. Resolves from `onYouTubeIframeAPIReady` (chaining
 * any handler somebody else installed first) or at once when `window.YT` is
 * already loaded; rejects on a script error and forgets the attempt so the
 * next call inserts a fresh script.
 */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
	if (memo) return memo;
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return Promise.reject(new Error('The YouTube player loads only in a browser.'));
	}
	memo = new Promise<YTNamespace>((resolve, reject) => {
		const w = window;
		if (w.YT && w.YT.loaded === 1 && typeof w.YT.Player === 'function') {
			resolve(w.YT);
			return;
		}
		const prior = w.onYouTubeIframeAPIReady;
		w.onYouTubeIframeAPIReady = () => {
			try {
				prior?.();
			} catch {
				// Somebody else's handler failing is not a reason ours should.
			}
			if (w.YT && typeof w.YT.Player === 'function') resolve(w.YT);
			else {
				memo = null;
				reject(new Error(YT_API_FAILED_MESSAGE));
			}
		};
		// Already inserted (by an earlier, failed-then-reset attempt, or by
		// another copy of this page): the ready callback above will fire.
		if (document.querySelector(`script[src="${YT_IFRAME_API_SRC}"]`)) return;
		const s = document.createElement('script');
		s.src = YT_IFRAME_API_SRC;
		s.async = true;
		s.onerror = () => {
			memo = null;
			s.remove();
			reject(new Error(YT_API_FAILED_MESSAGE));
		};
		document.head.appendChild(s);
	});
	return memo;
}

/** Forget a finished or failed load, so a test or a Reload can start over. */
export function resetYouTubeIframeApi(): void {
	memo = null;
}
