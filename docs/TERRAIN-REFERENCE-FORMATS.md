# Terrain reference sidecar formats

The standalone server currently supports **explicit, user-supplied JSON reference data**. It does not claim to decode proprietary DCS terrain databases or to know the terrain installed on the user's PC automatically.

## Terrain elevation grid

`sample_terrain_height` and `validate_terrain_placement` read a JSON object with:

```json
{
  "coordinateSystem": "DCS_METRES",
  "origin": { "x": 0, "y": 0 },
  "spacing": { "x": 100, "y": 100 },
  "width": 3,
  "height": 3,
  "elevations": [
    [10, 11, 12],
    [10, 12, 14],
    [11, 13, 15]
  ]
}
```

Rows are indexed along increasing y; columns are indexed along increasing x. Elevations are metres above the source's chosen vertical datum. Bilinear interpolation estimates elevation, and local finite differences estimate slope. Queries outside the grid fail rather than extrapolating.

## Road polylines

`find_road_near` reads a JSON object with:

```json
{
  "coordinateSystem": "DCS_METRES",
  "roads": [
    {
      "id": "road-001",
      "name": "Example road",
      "points": [
        { "x": 1000, "y": 2000 },
        { "x": 1200, "y": 2100 }
      ]
    }
  ]
}
```

The tool finds the nearest point on each line segment and reports its distance. Coordinates must already be in the same DCS map-metre system as the query.

## Safety and limits

- Files are parsed as JSON only; no Lua or executable data is evaluated.
- Input files are read-only and limited to 50 MiB.
- These checks do not detect buildings, trees, ground surface type, unit footprint, or collision clearance.
- Source provenance, map identity, horizontal/vertical datum, and grid resolution must be recorded by the data producer.
- Native DCS terrain/road extraction is a separate future adapter and must be validated against known Mission Editor locations before it is enabled.
