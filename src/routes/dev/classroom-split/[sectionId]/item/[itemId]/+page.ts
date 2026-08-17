import { error } from '@sveltejs/kit';
import { itemById, loads } from '../../../fixture';
import type { PageLoad } from './$types';

/**
 * The item load, mirroring the real one: it returns the ITEM and nothing else.
 * `section` comes from the layout, which is the point of the restructure.
 *
 * `loads.item` is what makes "opening an item re-runs only this" measurable
 * beside `loads.layout`.
 */
export const load: PageLoad = async ({ params }) => {
	const item = itemById(params.itemId);
	if (!item) error(404, 'Not found');
	loads.item += 1;
	return { item, itemLoads: loads.item };
};
