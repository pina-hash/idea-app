# 0421 One stock per area of the site, and market-style charts

- Issued: 2026-10-21
- By: Mr. Pina, reports 616b93c3 and f2aa1311, task 6 of the 2026-10-21 list
- Owns: migration 0287, the area stocks, the stocks page strip, movers, candles and volume, this entry and its history section
- Migration permitted: yes, one file, applied by hand by Mr. Pina. Claims: 0287. Highest on origin/main at issue: 0286.
- Status: pushed
- Branch: `claude/relaxed-sagan-ddun8h`
- Notes: Builds on the stocks relaunch (0283). Ten area stocks, each priced from three or four real counts for its area through `_coin_stock_area_signal`, each launched at the base price with its own launch ramp and circuit breakers. The client reads the new volume and trade count on each day and degrades to zeros before the migration is applied.
