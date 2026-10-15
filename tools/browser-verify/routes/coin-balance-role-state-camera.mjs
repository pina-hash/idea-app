/**
 * The role portal with the camera OPEN: Open the camera is pressed, the
 * harness's fake stream (an animated canvas through `captureStream`) plays in
 * the live view, and Capture and Close the camera are on screen.
 */
export default {
	path: '/dev/coin-balance-role?state=camera',
	aliasOf: '/dev/coin-balance-role',
	label: 'Role portal (V2): the camera open on the fake stream',
	prepare: [
		{ waitFor: '() => !!document.querySelector("[data-coin-role-hydrated]")' },
		{ click: '[data-testid="role-camera-open"]', until: '() => !!document.querySelector("[data-testid=\\"role-video\\"]")' }
	],
	presence: [
		{ selector: '[data-testid="role-video"]', label: 'the live view', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="role-capture"]', label: 'Capture', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="role-camera-stop"]', label: 'Close the camera', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '[data-testid="role-camera"] button', label: 'the camera keys', min: 44 }]
};
