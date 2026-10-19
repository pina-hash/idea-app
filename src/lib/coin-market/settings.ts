/**
 * THE SETTINGS LEDGER 0402 ADDS (0276's `_coin_setting_ok_0402`), as data the
 * settings page renders, in the shape the session-two groups use so the same
 * field helpers read and check them. The ranges mirror the database's rule;
 * the database is the rule.
 */

import type { SettingGroup } from '$lib/coin-desk/settings-session-two';

export const LATER_GROUPS: SettingGroup[] = [
	{
		id: 'market',
		title: 'IDEA Market',
		intro: 'Every trade goes through escrow. The fee is a sink taken from the seller when a sale is paid out.',
		fields: [
			{ key: 'market_sale_fee_percent', label: 'Sale fee (%)', help: 'From 0 to 50. Zero takes no fee.', kind: 'number', min: 0, max: 50 },
			{ key: 'market_open_listings_max', label: 'Open listings a student may have', help: 'A whole number from 1 to 50.', kind: 'int', min: 1, max: 50 },
			{ key: 'market_listing_days', label: 'Days a listing stays open', help: 'A whole number from 1 to 120. A student can renew.', kind: 'int', min: 1, max: 120 },
			{ key: 'market_auto_release_school_days', label: 'Class days before an unconfirmed sale pays out', help: 'A whole number from 1 to 30, counted from when the seller marks it done.', kind: 'int', min: 1, max: 30 },
			{ key: 'market_review_min_chars', label: 'Shortest review (characters)', help: 'A whole number from 1 to 500.', kind: 'int', min: 1, max: 500 },
			{ key: 'market_review_edit_hours', label: 'Hours a review can be changed', help: 'From 0 to 720.', kind: 'number', min: 0, max: 720 }
		]
	},
	{
		id: 'transfers',
		title: 'Student transfers',
		intro: 'A student sends coins with a PIN. Public transfers show on the Ledger; a private one costs a fee.',
		fields: [
			{ key: 'transfer_daily_cap', label: 'Most coins sent a day', help: 'From 0 to 100000.', kind: 'number', min: 0, max: 100000 },
			{ key: 'transfer_private_fee_percent', label: 'Private fee (%)', help: 'From 0 to 100. To be tuned from how students use it.', kind: 'number', min: 0, max: 100 },
			{ key: 'transfer_private_fee_min', label: 'Smallest private fee (coins)', help: 'From 0 to 1000.', kind: 'number', min: 0, max: 1000 },
			{ key: 'transfer_pin_tries', label: 'Wrong PIN tries before a lock', help: 'A whole number from 1 to 20.', kind: 'int', min: 1, max: 20 },
			{ key: 'transfer_lock_minutes', label: 'Lock length (minutes)', help: 'A whole number from 1 to 1440.', kind: 'int', min: 1, max: 1440 }
		]
	},
	{
		id: 'hall_pass_time',
		title: 'Hall pass time',
		intro: 'Students buy extra pass time for today. The price per block is the Extra Hall Pass Time category on Economy.',
		fields: [
			{ key: 'hall_pass_block_minutes', label: 'Minutes in a block', help: 'A whole number from 1 to 60.', kind: 'int', min: 1, max: 60 },
			{ key: 'hall_pass_extra_cap_minutes', label: 'Most extra minutes a day', help: 'A whole number from 0 to 240. Zero stops sales.', kind: 'int', min: 0, max: 240 }
		]
	},
	{
		id: 'stocks',
		title: 'Stocks',
		intro: 'Each price is the base times the signal over its median, moved at most the daily limit, between the floor and the ceiling.',
		fields: [
			{ key: 'stock_fee_percent', label: 'Trading fee (%)', help: 'From 0 to 50, each way.', kind: 'number', min: 0, max: 50 },
			{ key: 'stock_position_cap', label: 'Most coins in one stock', help: 'Cost basis, from 0 to 100000.', kind: 'number', min: 0, max: 100000 },
			{ key: 'stock_base', label: 'Base price', help: 'From 0.01 to 1000.', kind: 'number', min: 0.01, max: 1000 },
			{ key: 'stock_clamp_percent', label: 'Most a price moves in a day (%)', help: 'From 1 to 100.', kind: 'number', min: 1, max: 100 },
			{ key: 'stock_floor', label: 'Floor', help: 'From 0.01 to 1000.', kind: 'number', min: 0.01, max: 1000 },
			{ key: 'stock_ceiling', label: 'Ceiling', help: 'From 1 to 100000.', kind: 'number', min: 1, max: 100000 },
			{ key: 'stock_median_weeks', label: 'Median window (weeks)', help: 'A whole number from 1 to 52.', kind: 'int', min: 1, max: 52 },
			{ key: 'stock_class_window_weeks', label: 'Class stock window (weeks)', help: 'A whole number from 1 to 20.', kind: 'int', min: 1, max: 20 },
			{ key: 'stock_min_class_students', label: 'Fewest students for a class price', help: 'A whole number from 1 to 50.', kind: 'int', min: 1, max: 50 }
		]
	}
];
