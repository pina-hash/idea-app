/**
 * THE TWO FIXTURES EVERY FIGURE CLAIM IS MADE AGAINST.
 *
 * They live in their own module rather than inline in the test because BOTH
 * KINDS use them -- an assignment spec's `instructions` block and a reference
 * document's `instructions` / `callout` blocks are the identical
 * `{ type: 'instructions', content: string }` shape through the identical
 * renderer -- and a second copy typed out for the second kind would be a
 * fixture that could drift from the first, which is the failure mode where a
 * shape is only hostile in the copy nobody runs.
 */

/**
 * ONE CASE PER REFUSED SHAPE. Each entry is a whole authored line that IS a
 * figure by syntax and must NOT become an `img` by resolution -- so the count
 * of rendered `img` elements from all of them together is the security claim,
 * and the per-case `reason` is what stops that count passing for the wrong
 * reason (a parser that stopped recognising figures at all would also produce
 * zero, and would pass a test that only counted).
 */
export const HOSTILE_FIGURES: { case: string; line: string; reason: string }[] = [
	{
		case: 'external https',
		line: '![Tracking pixel](https://evil.example/beacon.png)',
		reason: 'scheme'
	},
	{
		case: 'external http',
		line: '![Insecure remote](http://evil.example/beacon.png)',
		reason: 'scheme'
	},
	{
		case: 'protocol-relative',
		line: '![Protocol relative](//evil.example/beacon.png)',
		reason: 'protocol-relative'
	},
	{
		case: 'data URI',
		line: '![Inline payload](data:image/png;base64,iVBORw0KGgo=)',
		reason: 'scheme'
	},
	{
		// NO PARENTHESES, and that is a finding rather than a convenience. The
		// src pattern is `[^)\s]+`, so `javascript:alert(1)` closes the figure at
		// the FIRST `)` and leaves a stray one on the line, which fails the
		// whole-line anchor and makes it an ordinary paragraph -- it never reaches
		// the resolver at all. Real, and a second layer, but it is not the layer
		// this case exists to exercise: written the paren-bearing way, this case
		// would pass while asserting nothing about the allow list. See the
		// 'javascript scheme that IS figure syntax' round-trip check.
		case: 'javascript scheme',
		line: '![Script](javascript:x)',
		reason: 'scheme'
	},
	{
		case: 'other scheme (file)',
		line: '![Local disk](file:///etc/passwd)',
		reason: 'scheme'
	},
	{
		case: 'absolute path outside the named prefixes',
		line: '![Off prefix](/api/classroom/attachment/00000000-0000-0000-0000-000000000000)',
		reason: 'off-prefix'
	},
	{
		case: 'traversal out of a named prefix',
		line: '![Traversal](/IDEA/../../secret.png)',
		reason: 'off-prefix'
	},
	{
		case: 'percent-encoded traversal',
		line: '![Encoded traversal](/IDEA/%2e%2e/secret.png)',
		reason: 'off-prefix'
	},
	{
		case: 'relative path',
		line: '![Relative](IDEA/idea-logo.png)',
		reason: 'not-absolute'
	},
	{
		case: 'SVG from a named static prefix',
		line: '![Static svg](/IDEA/idea-logo.svg)',
		reason: 'svg'
	},
	{
		case: 'SVG with an extension hidden behind a query',
		line: '![Query svg](/IDEA/idea-logo.svg?ext=.png)',
		reason: 'svg'
	},
	{
		case: 'SVG named as an attachment',
		line: '![Attached svg](attachment:diagram.svg)',
		reason: 'svg'
	},
	{
		case: 'SVG attachment whose MIME says so but whose name does not',
		line: '![Mime svg](attachment:diagram.png)',
		reason: 'svg'
	},
	{
		case: 'attachment that does not exist on this item',
		line: '![Missing](attachment:not-attached-to-anything.jpg)',
		reason: 'unresolved'
	},
	{
		case: 'empty attachment name',
		line: '![Nothing named](attachment:)',
		reason: 'empty'
	}
];

/**
 * THE POSITIVE CONTROL, and the reason this whole file is not a test that
 * passes by doing nothing. Two figures that MUST resolve and MUST render as
 * real `img` elements: one through an attachment alias, one through a named
 * static prefix.
 */
export const CONTROL_FIGURES: { case: string; line: string }[] = [
	{ case: 'attachment alias', line: '![Bearing teardown, step 3](attachment:teardown-03.jpg)' },
	{
		case: 'attachment alias, different case to the stored filename',
		line: '![Case-insensitive match](attachment:TEARDOWN-03.JPG)'
	},
	{ case: 'named static prefix', line: '![The IDEA gear](/IDEA/idea-gear.png)' }
];

/** The attachments `CONTROL_FIGURES` and the SVG-by-MIME hostile case resolve
 *  against. `diagram.png` is deliberately an SVG wearing a PNG filename: the
 *  stored MIME is what the proxy will serve and it is the half an author
 *  cannot see. */
export const FIXTURE_ATTACHMENTS = [
	{ id: 'att-1', filename: 'teardown-03.jpg', mime_type: 'image/jpeg', size_bytes: 2048 },
	{ id: 'att-2', filename: 'diagram.png', mime_type: 'image/svg+xml', size_bytes: 512 },
	{ id: 'att-3', filename: 'notes.pdf', mime_type: 'application/pdf', size_bytes: 4096 }
];

/**
 * ONE INSTANCE OF EVERY CONSTRUCT `parseMarkdown` CAN PRODUCE, for the
 * round-trip claim (IDEA_INTERFACE_STANDARDS 7: loss is proven absent by a round
 * trip, not by reading the allow lists).
 *
 * `EXPECTED_ROUND_TRIP` below names the node sequence this must parse into. The
 * pairing is the point: a fixture on its own proves nothing, and an expectation
 * derived from running the parser would agree with whatever the parser does.
 * This sequence was written from the node union in reference-spec.ts and is what
 * fails if a construct silently stops being recognised.
 */
export const ROUND_TRIP_PROSE = [
	'### A heading at level three',
	'',
	'#### A heading at level four',
	'',
	'An ordinary paragraph with **bold**, *italic*, `code` and a [link](https://example.com).',
	'',
	'- An unordered item',
	'  - A nested unordered item',
	'',
	'1. An ordered item',
	'',
	'> A blockquote line.',
	'',
	'```js',
	'const fenced = true;',
	'```',
	'',
	'    an indented code block',
	'',
	'| Column A | Column B |',
	'|---|---|',
	'| a1 | b1 |',
	'',
	'![A resolvable figure](attachment:teardown-03.jpg)',
	'',
	'![A refused figure](https://evil.example/beacon.png)',
	'',
	'Not a figure: ![inline](attachment:teardown-03.jpg) sits inside this sentence.',
	'',
	'![](attachment:teardown-03.jpg)',
	'',
	'![   ](attachment:teardown-03.jpg)'
].join('\n');

/** The node `type`s ROUND_TRIP_PROSE must produce, in order. */
export const EXPECTED_ROUND_TRIP = [
	'heading',
	'heading',
	'paragraph',
	'list',
	'list',
	'quote',
	'code',
	'code',
	'table',
	'figure',
	'figure',
	// The three below are NOT figures and must arrive as ordinary paragraphs:
	// an image inside a sentence, a blank alt, and a whitespace-only alt.
	'paragraph',
	'paragraph',
	'paragraph'
] as const;
