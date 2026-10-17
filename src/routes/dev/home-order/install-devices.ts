/**
 * The devices `/dev/home-order?ua=<id>` can stand in for, for the Install app
 * key (ledger 0396). Real user agent strings of each family, so
 * `installPlatform` in `$lib/install-app` is asked exactly what a real phone
 * would ask it, and `maxTouchPoints` because that is how iPadOS, which reports
 * itself as a Mac, is told apart from one.
 */
export const INSTALL_HARNESS_DEVICES = {
	iphone: {
		userAgent:
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
		maxTouchPoints: 5
	},
	ipad: {
		userAgent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
		maxTouchPoints: 5
	},
	android: {
		userAgent:
			'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
		maxTouchPoints: 5
	},
	'mac-safari': {
		userAgent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
		maxTouchPoints: 0
	},
	firefox: {
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
		maxTouchPoints: 0
	}
} as const;

export type InstallHarnessDevice = keyof typeof INSTALL_HARNESS_DEVICES;
