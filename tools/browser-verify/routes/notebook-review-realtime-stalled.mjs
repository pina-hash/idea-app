export default {
	path: '/dev/notebook-review?realtime=stalled',
	label: 'Notebook review console, live channel STALLED (the pill that used to lie)',
	/*
		THE PILL THAT WAS TRUE OF THE TRANSPORT AND NOT OF THE CHANNEL.

		`ReviewConsole` set `live = true` the moment its `subscribe` transport
		RETURNED, and the route called `.subscribe()` with no status callback --
		so a realtime publication that does not carry the notebook tables, a
		join that fails, and a socket a school proxy eats all produced a GREEN
		LIVE PILL over a console that would then silently never update again.
		Nothing else on that screen says otherwise, which is exactly why an eye
		cannot catch it and why this route exists.

		FOUR MODES, AND THIS DRIVES THE ONE A STATUS CALLBACK CAN ANSWER. The
		harness's `?realtime=` lands the page in a mode rather than making a
		pass drive a <select> to reach one:
		  on       joins and delivers      -> Live
		  silent   joins, delivers nothing -> Live (the RESIDUAL GAP: a status
		           callback reports what the SOCKET did, so this still shows
		           Live and still never updates. Closing it needs a heartbeat,
		           which is a different bundle. Named here rather than left
		           for somebody to rediscover.)
		  stalled  the join FAILS           -> the "Not live" pill, measured here
		  off      no transport at all      -> no pill of any kind

		WHAT IT MUST NOT DO IS ALARM. A dropped socket is common and usually
		rejoins on its own, so the words carry the one fact the reader cannot
		see -- new work will not appear by itself -- in the same muted ink as
		"Loading...", never in a warning colour. The grid is not wrong, it is
		only not moving; that is why `--text-2` and not the room's amber.

		`connecting` DELIBERATELY RENDERS NOTHING and so has no row here: it is
		the ordinary sub-second state after every subscribe AND what a
		transport reporting no status gets. A pill that flickers on every
		section change is noise, and a console about to be live is not a fault.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".cell").length > 0', timeoutMs: 20000 },
		/* The status arrives on a microtask after subscribe, like the real one. */
		{ waitFor: '() => !!document.querySelector(\'[data-testid="stalled-pill"]\')', timeoutMs: 10000 },
		{
			evaluate: `() => {
				// The words themselves, returned so they are in the report, and
				// gated: a pill that renders empty passes a presence row.
				const el = document.querySelector('[data-testid="stalled-pill"]');
				const said = el.textContent.replace(/\\s+/g, ' ').trim();
				if (!said) throw new Error('the stalled pill rendered with no words in it');
				if (/error|fail|lost|disconnect/i.test(said)) {
					throw new Error('alarming words for a condition that is usually fine: ' + said);
				}
				return said;
			}`
		}
	],
	presence: [
		{ selector: '[data-testid="grid-scroll"]', label: 'compliance grid (still loaded, still readable)', expectPresent: 1 },
		{ selector: '[data-testid="stalled-pill"]', label: 'the "not live" pill', expectPresent: 1, maxPresent: 1 },
		/*
			THE ABSENCE THIS WHOLE BUNDLE IS ABOUT, and its positive control is
			the sibling spec on the same route with no `?realtime=`, which
			asserts nothing about the pill only because the default mode joins.
			Measured here directly instead: with the join failing, the green pill
			must be gone.
		*/
		{ selector: '[data-testid="live-pill"]', label: 'green Live pill (must NOT render when the join failed)', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '[data-testid="stalled-pill"]', label: 'the "not live" pill (new copy)', min: 4.5 }
	]
};
