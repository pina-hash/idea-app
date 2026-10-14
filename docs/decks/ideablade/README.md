# IDEA-Blade Designs deck

The backgrounds of the Google Slides deck "IDEA-Blade Designs" (IDEA100 Rotation 2), drawn
from the site's own plate (`src/lib/classroom/plate.css`, the dark IDEA tokens) so the deck
looks like ideabosco.com. Slides fetches them by their raw GitHub URL; every word a student
types is a Slides text box on top, never baked into these.

- `title.png`, `tpl.png`: 1920x1080 slide backgrounds (title, and the per-Blade template).
- `tag.png`: the "Template" lamp chip, a separate image students delete from their copy.
- `hero.png`: the spin-top render on the title slide, an illustration, not a real Blade.

To redraw: symlink `node_modules` to a folder holding `three` (0.170) and `fonts` to
`node_modules/@fontsource`, then `python3 shoot_hero.py` and `python3 shoot_slides.py`
(Playwright with its Chromium). `slides.html` also reads `gear.png` and `logo.png`: copy
`static/IDEA/idea-gear-240.png` and `static/IDEA/idea-logo-text-1024.png` beside it under those names.
