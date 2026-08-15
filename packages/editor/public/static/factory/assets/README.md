# Factory GLB Asset Library

This directory is the default place for higher-fidelity factory equipment models used by `Factory Generator`.

## Recommended files

```text
assets/
├─ cooling-tower-a.glb
├─ transformer-a.glb
├─ street-light-a.glb
├─ tree-a.glb
├─ scrubber-a.glb
├─ gas-cabinet-a.glb
└─ emergency-shower-a.glb
```

## Registry example

Add a `source` to an existing `assetRegistry` entry:

```json
{
  "id": "semiconductor.coolingTower.A",
  "label": "Cooling Tower A",
  "source": {
    "type": "glb",
    "url": "/static/factory/assets/cooling-tower-a.glb"
  },
  "fallbackTemplate": "cooling_tower",
  "defaultScale": 1,
  "rotationOffsetDeg": 0,
  "elevationOffset": 0,
  "anchor": "center-base"
}
```

The layout batch stays unchanged:

```json
{
  "id": "COOLING_TOWER_YARD",
  "asset": "semiconductor.coolingTower.A",
  "template": "cooling_tower",
  "grid": {
    "origin": { "x": 105, "y": 460 },
    "rows": 2,
    "columns": 3,
    "spacingX": 18,
    "spacingY": 18
  }
}
```

## Runtime behavior

1. `FactorySceneBuilder` creates the procedural fallback immediately.
2. The scene is added to Astral3D and is usable at once.
3. `FactoryAssetUpgradeService` loads configured GLBs through Astral3D's own GLTF loader stack.
4. A successfully loaded GLB replaces the matching fallback batch in place.
5. If loading fails because of 404, CORS, decoder, or malformed asset data, the fallback remains visible.

## Model preparation guidance

Prefer GLB models with:

- Y-up orientation.
- realistic meter-based scale when possible.
- one logical equipment asset per GLB.
- origin near the equipment base; `anchor: center-base` can normalize imperfect origins.
- Meshopt/Draco geometry compression where appropriate.
- KTX2 textures for larger production assets.
- limited material count and texture resolution suitable for web rendering.

The asset registry intentionally separates semantic identity from the physical model file, so a model can be replaced without changing the site-layout manifest.
