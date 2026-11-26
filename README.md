<p align="center"><img src="logo.svg" alt="Grand Tours logo" width="96"></p>

# Grand Tours — results site

Results site for the grand tours: the 2026 Tour de France, Giro d'Italia,
Tour de France Femmes and Vuelta a España (stages, profiles, route maps,
classifications, teams & riders, race-day weather), a rider search across all
four, the 2027 Giro d'Italia route (all 21 stages) and the first three stages
of the 2027 Tour de France. All 2026 races are finished, so the site is
static and nothing refreshes automatically.

Live: <https://juusimaa.github.io/grandTours/>

## Layout

```
index.html, riders.html     # landing page (year picker, SEASONS config) and rider search
<year>/<race>.html          # one page per race and season (2026/tdf.html, 2027/giro.html, …)
src/race-page.ts            # helpers shared by all race pages -> dist/ (gitignored build output)
src/tour-page.ts            # code shared by the Tour de France pages (2026 and 2027)
modernist.css, race-page.css, riders.css
data/<year>/<tour>-results.json   # classifications, stage winners, stage results
data/<year>/<tour>-riders.json    # start list with final GC position/gap
data/<year>/<tour>-routes.json    # simplified per-stage route tracks for the map
data/<year>/<tour>-weather.json   # actual race-day weather (tdf2026, vuelta2026)
scripts/                    # Python fetchers (results, riders, routes, weather) + tests
test/                       # Vitest suite
.github/workflows/          # ci.yml (PRs) and update-results.yml (main: fetch, test, deploy)
```

`<tour>` is the race id plus year, e.g. `data/2026/vuelta2026-results.json`.

## Development

```
npm install && npm run build   # needed after a fresh clone, or no page renders
npm run watch                  # rebuild on save
npm test                       # Vitest (build first)
npm run lint && npm run format # run before pushing; PR CI gates on both
pip install -r scripts/requirements.txt && python3 -m pytest scripts
```

Pull requests run lint, format check, build and tests. Pushes to `main` run
`update-results.yml`: fetch data, test, deploy to GitHub Pages. If fetched
data changed, it opens an auto-merging PR from `bot/data-update` (`main` is
protected).

## Data

| Data               | Script                               | Source                                                                                | Run by                                 |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------- |
| Results            | `fetch_results.py`                   | letour.fr, lavuelta.es (same template)                                                | workflow, tours in `TOURS` (empty now) |
| Riders             | `fetch_riders.py`                    | letour.fr, letourfemmes.fr, lavuelta.es, giroditalia.it                               | hand                                   |
| Routes             | `fetch_routes.py`                    | cyclingstage.com GPX (incl. giro2027), komoot (Vuelta), OSRM reconstruction (tdf2027) | hand                                   |
| Weather            | `fetch_weather.py`                   | Open-Meteo historical archive                                                         | workflow, finished stages only         |
| Giro stage results | `backfill_giro2026_stage_results.py` | official giroditalia.it classifications                                               | hand, one-off                          |

- **Adding a live race:** register it in `fetch_results.py`'s `TOURS`, add a
  `schedule:` to `update-results.yml` (odd minutes, not `*/30`), and remove
  both when the race ends. Organiser URLs carry no year, so a finished race
  left registered would be overwritten by next season.
- **Adding a finished race:** drop static files into `data/<year>/` and build
  a page that reads them.
- **Cancelled stages:** list them in `CANCELLED_STAGES` in `fetch_results.py`;
  the reason code must match the page's `cancelledReasons` strings.
- Riders are joined to classifications by bib (ASO/Unipublic) or athlete-page
  slug (Giro). Routes are simplified with Ramer–Douglas–Peucker; a stage
  without a route falls back to a straight start→finish line. The 2027 Tour
  routes are an OSRM approximation until GPX is published.
- procyclingstats.com is not used: its Cloudflare protection blocks GitHub
  Actions runners.

## License & disclaimer

The source code is [MIT](LICENSE). The race data is not: it comes from the
organisers' sites and belongs to them. This is an unofficial, non-commercial
fan project, not affiliated with A.S.O., RCS Sport, Unipublic or the races.
Race names and logos are trademarks of their owners, used here only to
identify the events. If you reuse the code, source your own data.
