/**
 * Shared steps for the certification harnesses (the loader skips `_` files).
 *
 * HYDRATED, TWICE. A tab, a card and a checklist's Open key are real links,
 * so a click that lands before hydration follows the link off the harness;
 * and a cold Vite reloads the page once while it optimizes the route's
 * dependencies. Wait for the marker, let that reload happen, wait again
 * (CLAUDE.md, "A SPEC THAT CLICKS A REAL LINK WAITS FOR A HYDRATION MARKER").
 */
export const certHydrated = (name) => [
	{ waitFor: `() => !!document.querySelector('[data-cert-${name}-hydrated="yes"]')`, timeoutMs: 20000, waitMs: 2000 },
	{ waitFor: `() => !!document.querySelector('[data-cert-${name}-hydrated="yes"]')`, timeoutMs: 20000 }
];

export const SPACE_WHITE_ON = { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 };

/** The shell's own rows, measured on every certification harness: the tabs and the keys are 44px, the words clear 4.5. */
export const SHELL_TAP_TARGETS = [
	{ selector: '[data-testid="cert-tabs"] .cert-tab', label: 'the four student tabs', min: 44 },
	{ selector: '[data-testid="cert-notifications-key"]', label: 'the notifications key', min: 44 }
];
export const SHELL_CONTRAST = [
	{ selector: '[data-testid="cert-tabs"] .cert-tab', label: 'the tab words', min: 4.5 },
	{ selector: '.cert-title', label: 'the page title', min: 4.5 },
	{ selector: '.cert-lead', label: 'the lead', min: 4.5 },
	{ selector: '.cert-eyebrow', label: 'the eyebrow', min: 4.5 }
];
export const SHELL_PRESENCE = [
	{ selector: '[data-testid="cert-header"]', label: 'the portal header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
	{ selector: '[data-testid="cert-tabs"] .cert-tab', label: 'four student tabs', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
	{ selector: '.sfb-shell .sfb-trigger, [data-testid="cert-header"] .sfb-trigger', label: 'a report control somewhere on the page (the shell mounts it once)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
];
