# Viewing Spots Summary

Research date: 2026-06-22

Scope: candidate viewing options for the actual Tour de France viewing stages only. The team presentation is excluded.

Important caveat: official Tour stage pages now support the race-route landmarks and time windows, but local 2026 road-closure, parking, pedestrian-crossing, shuttle, toilet, and fan-zone plans were not found for these exact points. Treat every option as a candidate pending municipal/prefecture/transport verification.

## Best Current Candidates

| Stage | Candidate | Planning value | Risk |
| --- | --- | --- | --- |
| Stage 1 | `stage-1-passeig-santa-madrona.json` | Late TTT chrono-point area with technical Montjuic viewing and potentially less finish-line crush. | Medium-high crowd and unknown barriers/crossings. |
| Stage 1 | `stage-1-avinguda-estadi-final-climb.json` | Uphill final-sector TTT viewing near the Olympic Stadium finish. | High finish-area perimeter risk. |
| Stage 2 | `stage-2-castell-montjuic-climb.json` | Strongest race-viewing value: three official passages on the 1.6 km, 9.3% Montjuic Castle climb. | High crowd/access risk. |
| Stage 2 | `stage-2-fontaines-montjuic-circuit-entry.json` | Lower-Montjuic alternative with better probable transit/escape profile than the castle. | Still final-circuit controlled; exact sightlines unknown. |
| Stage 3 | `stage-3-n260-puigcerda-junction.json` | Most directly supported Puigcerda option because the official schedule names N-260 Puigcerda. | Junction barriers and local closures unknown. |
| Stage 3 | `stage-3-puigcerda-station-side-approach.json` | Station-side fallback if lodging/transit makes it easier and route-side access checks out. | Low confidence until checked against official GIS and local barriers. |
| Stage 6 | `stage-6-col-du-tourmalet-summit.json` | Iconic HC summit and Souvenir Jacques Goddet point. | Very high logistics, weather, parking, and crowd risk. |
| Stage 6 | `stage-6-la-mongie-climb-sector.json` | Climb viewing before the summit with possible resort services. | High risk until La Mongie access/parking/facilities are confirmed. |
| Stage 7 | `stage-7-pont-simone-veil.json` | 4.5 km-to-go bridge/approach option before the finish crush. | Bridge public access may be restricted. |
| Stage 7 | `stage-7-bordeaux-finish-area.json` | Maximum finish atmosphere and podium/sprint energy. | Very high crowd and perimeter uncertainty. |

## Research Notes By Stage

Stage 1, Barcelona TTT:
The official page lists the TTT from Barcelona to Barcelona, first start at 17:05 and last arrival at 19:16, with Montjuic landmarks including Passeig de Santa Madrona, Avinguda de l'Estadi, and the Cote du Stade Olympique de Montjuic. The better planner choice is probably not the finish barrier unless ceremony is the priority; the late climb/chrono areas may give better rider visibility with slightly more escape flexibility.

Stage 2, Montjuic final circuit:
The official page lists three passages of Cote du Chateau de Montjuic, each 1.6 km at 9.3%, plus the Olympic Stadium finish. The castle climb is the best pure race-viewing candidate but should be treated as high-risk until Barcelona publishes crowd control and closure maps. Fontaines de Montjuic is the practical fallback.

Stage 3, Puigcerda:
The official schedule names N-260 Puigcerda at 15:52 / 16:02 / 16:14. Staying in town and walking to a verified route-side sidewalk should beat driving to a remote mountain point. The station-side candidate is only a fallback until the exact route geometry and barrier side are checked.

Stage 6, Tourmalet / Arreau access:
The Tourmalet summit is the dream option and the hardest logistics problem. The official page lists La Mongie at 16:19 / 16:32 / 16:46 and Col du Tourmalet at 16:30 / 16:43 / 16:58, with the Tourmalet as 17.1 km at 7.3% and HC. From Arreau, do not assume vehicle access, parking, shuttle, or bike-up permission until official Hautes-Pyrenees/prefecture notices are available.

Stage 7, Bordeaux:
The official schedule names Pont Simone Veil at 4.5 km to go, then Bordeaux finish at 17:13 / 17:24 / 17:35. Pont Simone-Veil may be a more comfortable viewing choice if public pedestrian space remains open. The finish area is the atmosphere choice, but it needs the exact finish-line/perimeter map before selection.

## Verification Still Needed

- Official road-closure and parking orders for Barcelona, Puigcerda/Cerdanya, Hautes-Pyrenees, and Bordeaux/Gironde.
- Public transport changes for TMB Barcelona, Puigcerda/Rodalies or local buses, any Tourmalet shuttles, and TBM Bordeaux.
- Exact public spectator sides, pedestrian crossings, and barrier maps for each coordinate.
- Toilets, water, food, shade/shelter, medical points, and fan zones.
- Whether the publicity caravan passes each candidate and at what sourced time.
- Post-race exit routes that do not require crossing the active course or entering closed roads.

## Key Sources Used

- Tour de France Stage 1 official page: https://www.letour.fr/en/stage-1 - official stage type, timing, route landmarks, and Montjuic final climb schedule.
- Tour de France Stage 2 official page: https://www.letour.fr/en/stage-2 - official final-circuit landmarks, three Chateau de Montjuic climb passages, timing, and climb profile.
- Tour de France Stage 3 official page: https://www.letour.fr/en/stage-3 - official Puigcerda N-260 schedule point and passage estimates.
- Tour de France Stage 6 official page: https://www.letour.fr/en/stage-6 - official La Mongie and Tourmalet schedule points, HC climb details, and Stage 6 timing.
- Tour de France Stage 7 official page: https://www.letour.fr/en/stage-7 - official Pont Simone Veil and Bordeaux finish schedule points.
- ASO ArcGIS route layers referenced in `trip-data/data.js` - route geometry context for app coordinates.
- Montjuic/Funicular/Estadi background pages - normal access context only, not race-day proof.
- Puigcerda station background page - station/R3 context only, not race-day proof.
- Col du Tourmalet and La Mongie background pages - pass/resort geography and access context only, not race-day proof.
- Pont Simone-Veil and Bordeaux tramway background pages - bridge/transit context only, not race-day proof.
