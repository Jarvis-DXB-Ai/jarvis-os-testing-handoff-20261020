# Office environment and source notes

## Active setting: spatial Dubai city

The Office is the occupied cutaway floor of a modelled tower, surrounded by world-space buildings at several distances. The city includes a curved canal and quays, streets, palms, ambient vehicles and a boat, facade glazing, setbacks and a procedural daylight atmosphere. Orbiting, zooming or focusing a department changes perspective, overlap and parallax. No photograph is loaded as the active skyline.

The city is an authored, staged Dubai interpretation, not a current survey, exact location, real traffic feed or measured building model. Landmark proportions and locations are composed for this Office view.

Architectural references (no third-party 3D assets copied):

- [Burj Khalifa architecture](https://www.burjkhalifa.ae/the-tower/architecture-design/): Y-plan wings, successive setbacks and a telescoping spire inform the interpreted landmark.
- [SOM — Cayan Tower](https://www.som.com/projects/cayan-tower/): a rotating hexagonal floor plate and 90-degree twist inform the helical tower.
- The daylight atmosphere uses Three.js’s included Sky object under the existing Three.js MIT licence. Facade textures and city meshes are procedurally authored in the project.

City traffic and watercraft are ambient staging. They pause with Office motion/reduced-motion settings and never indicate agent work. Agent activity continues to require saved, fresh runtime evidence.

## Dubai solar clock and lighting

The default **Live Dubai** setting uses the actual current date and Dubai city-centre coordinates (25.2048°N,55.2708°E), independent of device timezone or the Demo office’s accelerated task clock. It computes solar elevation/azimuth and approximate daily sunrise, solar noon and sunset locally with [NOAA’s general solar-position equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF). The apparent horizon is −0.833°; civil twilight blends into night. Seasonal dates and leap years are accounted for. These are astronomical estimates, not a weather feed or predictions of building/cloud occlusion.

Sun direction, shadows, atmosphere and haze transition continuously. Evening brings warmer light; at night window emission masks, boulevard lamps, practical Office lights and sparse stars become visible while the Office remains readable. Ambient-animation pause does not stop the real solar clock. Sunrise, midday, sunset and night **preview** settings alter visuals only; return to Live Dubai to restore actual time. Previews are not saved as client settings.

The Burj silhouette is enlarged and moved closer in the authored composition; additional near/middle-distance towers, podiums, road details and lamp heads make the surrounding district denser. Office materials include fine-grained polished stone, textured keyboards, task lamps, acoustic slats, storage units, chair armrests and suspended light tracks. The connected floor, source client marks and interactive work/shared-space controls are retained.

## Retained historical artwork

The previous flat panorama below is retained for provenance and recovery; it is no longer loaded by the active scene.

### Dubai skyline photograph (inactive)

- File: `dubai-skyline.webp`
- Work: **A view of Dubai's skyline**
- Photographer: **Chatax902**
- Source: https://commons.wikimedia.org/wiki/File:A_view_of_Dubai%27s_skyline.jpg
- Original: https://upload.wikimedia.org/wikipedia/commons/5/53/A_view_of_Dubai%27s_skyline.jpg
- License: **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/
- Changes: resized to4096px wide and converted toWebP. Displayed with an atmospheric gradient in the scene background. No authorship or endorsement is implied.
- Original photograph date:27April2021; it is a visual setting, not a current city survey.

The Office, its furniture and its people remain real interactive WebGL geometry. This historical asset is not used by the current spatial city. The Office footer links to these active scene/source notes.
