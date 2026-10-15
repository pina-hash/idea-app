/**
 * The role portal with NO camera (the harness hands no camera transport, as a
 * browser without one would): the fallback is a camera-only file input,
 * `capture="environment"` and never `multiple`, said in words, and there is no
 * Open the camera key and no second, camera-roll picker.
 */
export default {
	path: '/dev/coin-balance-role?camera=0',
	label: 'Role portal (V2): no camera, the camera-only file fallback',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-coin-role-hydrated]")' }],
	presence: [
		{ selector: '[data-testid="role-file"][capture="environment"]:not([multiple])', label: 'one camera-only input', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="role-portal"] input[type="file"]', label: 'no other picker', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="role-camera-open"]', label: 'no camera key', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="role-fallback-why"]', label: 'the fallback says why', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '[data-testid="role-file"]', label: 'the file input', min: 44 }],
	contrast: [{ selector: '[data-testid="role-fallback-why"]', label: 'the why', min: 4.5 }]
};
