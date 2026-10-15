/**
 * A FAKE PLAYER FOR THE HARNESS AND THE TESTS (ledger 0391).
 *
 * `/dev/cert-watch` cannot load the real IFrame API (the browser-verify harness
 * blocks every non-loopback request, and a test has no network at all), and a
 * check-in band or a coverage bar has to be measured anyway. So the component
 * takes a `createPlayer` factory as a prop, and this is the one the harness and
 * `tests/dom` hand it: the same eleven methods `YTPlayer` declares, a clock that
 * advances at the playback rate while PLAYING, and the state-change events the
 * component listens for. Its clock is `now()` (injected), so a test drives it
 * with fake timers and a harness with the real one.
 *
 * It is NOT a stand-in anything in production reaches: the real route passes
 * no factory and the component loads the API. It lives beside the component
 * rather than under `src/routes/dev` so a test can import it without reaching
 * into a route.
 */
import { YT_STATE, type YTPlayer, type YTPlayerEvents } from './youtube-api';

export interface FakePlayerOptions {
	duration?: number;
	start?: number;
	rate?: number;
	availableRates?: number[];
	now?: () => number;
	events?: YTPlayerEvents;
}

export class FakePlayer implements YTPlayer {
	private duration: number;
	private base: number;
	private rate: number;
	private state: number = YT_STATE.CUED;
	private playingSince: number | null = null;
	private readonly rates: number[];
	private readonly now: () => number;
	private readonly events: YTPlayerEvents;
	private readonly frame: HTMLIFrameElement | null;
	destroyed = false;
	/** Every `setPlaybackRate` the component asked for, for a test to read. */
	readonly rateRequests: number[] = [];
	/** Every `seekTo` the component asked for. */
	readonly seeks: number[] = [];

	constructor(options: FakePlayerOptions = {}) {
		this.duration = options.duration ?? 600;
		this.base = options.start ?? 0;
		this.rate = options.rate ?? 1;
		this.rates = options.availableRates ?? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
		this.now = options.now ?? (() => Date.now());
		this.events = options.events ?? {};
		this.frame = typeof document !== 'undefined' ? document.createElement('iframe') : null;
	}

	/** Mount the frame into the host the way the real API replaces it. */
	attach(host: HTMLElement): void {
		if (!this.frame) return;
		this.frame.setAttribute('title', 'Fake training video');
		this.frame.setAttribute('data-fake-player', 'yes');
		host.replaceWith(this.frame);
		// `onReady` comes a beat later, as the real API's does.
		Promise.resolve().then(() => this.events.onReady?.({ target: this }));
	}

	private settle(): void {
		if (this.playingSince !== null) {
			this.base += ((this.now() - this.playingSince) / 1000) * this.rate;
			this.playingSince = this.now();
			if (this.base >= this.duration) {
				this.base = this.duration;
				this.playingSince = null;
				this.setState(YT_STATE.ENDED);
			}
		}
	}

	private setState(next: number): void {
		if (this.state === next) return;
		this.state = next;
		this.events.onStateChange?.({ target: this, data: next });
	}

	getCurrentTime(): number {
		this.settle();
		return Math.min(this.base, this.duration);
	}
	getDuration(): number {
		return this.duration;
	}
	getPlayerState(): number {
		this.settle();
		return this.state;
	}
	getPlaybackRate(): number {
		return this.rate;
	}
	setPlaybackRate(rate: number): void {
		this.rateRequests.push(rate);
		this.settle();
		this.rate = rate;
		this.events.onPlaybackRateChange?.({ target: this, data: rate });
	}
	getAvailablePlaybackRates(): number[] {
		return [...this.rates];
	}
	playVideo(): void {
		if (this.destroyed) return;
		this.settle();
		if (this.state === YT_STATE.PLAYING) return;
		if (this.base >= this.duration) this.base = 0;
		this.playingSince = this.now();
		this.setState(YT_STATE.PLAYING);
	}
	pauseVideo(): void {
		this.settle();
		if (this.state !== YT_STATE.PLAYING) return;
		this.playingSince = null;
		this.setState(YT_STATE.PAUSED);
	}
	seekTo(seconds: number, _allowSeekAhead?: boolean): void {
		this.seeks.push(seconds);
		this.settle();
		this.base = Math.max(0, Math.min(this.duration, seconds));
	}
	getIframe(): HTMLIFrameElement {
		if (!this.frame) throw new Error('no document');
		return this.frame;
	}
	destroy(): void {
		this.destroyed = true;
		this.playingSince = null;
		this.frame?.remove();
	}

	/** A harness control: pick a rate the way YouTube's own menu would, even one past the cap. */
	chooseRate(rate: number): void {
		this.settle();
		this.rate = rate;
		this.events.onPlaybackRateChange?.({ target: this, data: rate });
	}
}
