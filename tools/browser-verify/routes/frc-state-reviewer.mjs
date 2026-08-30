export default {
	path: '/dev/frc?state=reviewer',
	label: 'FRC shell, allowlisted-reviewer state: the 0167 controls present',
	aliasOf: '/dev/frc',
	/*
		THE PRESENCE HALF OF THE 0167 REVIEWER-TIER GATE MATRIX (the absence
		half, an ordinary student, is frc-state-student.mjs). The harness
		defaults to "Simulate reviewer" ON, which drives FrcShell's
		`reviewerOverride` -- standing in for `frcCanReview` (frc_can_review(),
		the explicit allowlist with admin folded in) on the real /frc layout.
		No prepare step: this IS the route's rest state.

		What a reviewer must SEE, each of which calls a gate 0167 re-gated:
		the "View as student" toggle, the "Gate review" nav tab (the /frc/review
		console), and DomainLanding's own-account completion-override strip
		(frc_mark_complete / frc_unmark_complete).
	*/
	presence: [
		{ selector: '.frc-nav .frc-view-toggle', label: '"View as student" toggle', expectPresent: 1, maxPresent: 1 },
		{ selector: '.frc-nav a[href="/frc/review"]', label: '"Gate review" tab', expectPresent: 1, maxPresent: 1 },
		{ selector: '.frc-main .teacher-override', label: 'completion-override strip', expectPresent: 1, maxPresent: 1 },
		/* The ungated chrome beside them, so this spec and the student one
		   read the same page through the same vocabulary. */
		{ selector: '.frc-nav a[href="/frc"]', label: 'Track home tab (ungated)', expectPresent: 1 },
		{ selector: '.frc-nav a[href="/frc/references"]', label: 'References tab (ungated)', expectPresent: 1 }
	],
	tapTargets: [
		{ selector: '.frc-nav .frc-view-toggle', label: 'view-as toggle', min: 24 },
		{ selector: '.frc-nav a[href="/frc/review"]', label: 'Gate review tab', min: 24 }
	],
	contrast: [
		{ selector: '.frc-nav a[href="/frc/review"]', label: 'Gate review tab label', min: 4.5 }
	],
	/*
		"View as student" must hide the reviewer tools it promises to hide --
		including the Gate review tab -- and show the banner saying so; toggling
		back restores them. This is also the POSITIVE CONTROL for the student
		spec's `.frc-preview-banner` absence row: without it, that selector
		renaming would leave the absence row green forever.
	*/
	orderResult: [
		{
			evaluate: `async () => {
				const btn = document.querySelector('.frc-nav .frc-view-toggle');
				if (!btn) return ['no-toggle'];
				btn.click();
				await new Promise((r) => setTimeout(r, 150));
				const bannerOn = document.querySelectorAll('.frc-preview-banner').length;
				const tabHidden = !document.querySelector('.frc-nav a[href="/frc/review"]');
				const stripHidden = !document.querySelector('.frc-main .teacher-override');
				btn.click();
				await new Promise((r) => setTimeout(r, 150));
				const bannerOff = document.querySelectorAll('.frc-preview-banner').length;
				const tabBack = !!document.querySelector('.frc-nav a[href="/frc/review"]');
				return [bannerOn, tabHidden, stripHidden, bannerOff, tabBack];
			}`,
			expected: [1, true, true, 0, true],
			label: 'view-as-student hides the tab and strip, shows the banner, and toggles back clean'
		}
	]
};
