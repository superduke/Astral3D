# Factory GLB Asset Specification v0.1

This contract defines how high-fidelity equipment GLBs enter the Factory Generator without changing layout or digital-twin semantics.

## Canonical runtime space

- Right-handed Three.js coordinates.
- `+Y` is Up.
- `-Z` is Forward / Manifest North.
- `1 runtime unit = 1 meter`.
- Placement from the Factory Manifest is applied only after GLB normalization.

The source GLB may use another supported unit or orthogonal axis convention, but it must declare those values in the registry contract.

## Registry example

```json
{
  "id": "semiconductor.coolingTower.A",
  "source": {
    "type": "glb",
    "url": "/static/factory/assets/cooling-tower-a.glb"
  },
  "fallbackTemplate": "cooling_tower",
  "glb": {
    "specVersion": "0.1",
    "unit": "meter",
    "coordinate": {
      "upAxis": "+Y",
      "forwardAxis": "-Z"
    },
    "anchor": "center-base",
    "defaultScale": 1,
    "defaultRotationDeg": [0, 0, 0],
    "instancing": { "mode": "auto" },
    "validation": {
      "maxTriangles": 80000,
      "maxDimensionMeters": 40
    },
    "materialPolicy": {
      "maxMaterials": 8,
      "allowTransparent": false
    }
  }
}
```

## Units

Supported source units:

- `meter`
- `centimeter`
- `millimeter`
- `inch`
- `foot`

Do not use `defaultScale` to hide an incorrect source-unit declaration. Unit normalization happens first; `defaultScale` is an asset-specific correction after unit/axis normalization.

## Axes

Supported axis values are `+X`, `-X`, `+Y`, `-Y`, `+Z`, `-Z`.

`upAxis` and `forwardAxis` must be perpendicular. The normalization layer rotates the source basis into canonical `+Y Up / -Z Forward` before applying asset-specific correction.

## Anchor / pivot

Preferred production convention is `center-base`:

- X/Z: center of equipment footprint/bounds.
- Y: lowest geometry point.

Supported values:

- `center-base`: automatic bounds normalization; preferred default.
- `origin`: trust the GLB origin exactly.
- `custom`: use `customAnchor: [x,y,z]`, expressed in canonical meter coordinates after unit/axis normalization and before default rotation/scale correction.

## Instancing

`instancing.mode`:

- `auto` (recommended): static compatible hierarchies become GLB-backed `InstancedMesh` parts when repeated; incompatible assets use clone mode.
- `instanced`: require static instancing; validation failure keeps the procedural fallback.
- `shared-clone`: preserve hierarchy and share geometry/material resources where safe.

Automatic static instancing is disabled for assets with:

- animation clips,
- `SkinnedMesh`,
- morph targets,
- source `InstancedMesh` hierarchies that cannot be flattened safely by v0.1.

Every generated `InstancedMesh` preserves `instanceAssetIds[]`, so `intersection.instanceId` continues resolving to the original digital-twin `assetId`.

## Validation

Hard validation failures keep the procedural fallback visible. v0.1 treats the following as hard failures:

- no renderable Mesh,
- invalid/empty bounds,
- invalid axis contract,
- invalid custom anchor,
- normalized asset dimension exceeding `maxDimensionMeters`.

The following are soft warnings:

- triangle budget exceeded,
- material budget exceeded,
- transparent material usage when discouraged,
- animation/skinning/morph targets preventing static instancing.

## Recommended first-pass budgets

These are digital-twin defaults, not universal limits:

| Asset | LOD0 / validation target | Notes |
| --- | ---: | --- |
| Cooling tower | <= 80k triangles | large, visually important, repeated moderately |
| Transformer | <= 50k | repeated equipment; keep material count low |
| Rooftop HVAC | <= 30k | often repeated many times; instancing strongly preferred |
| Street light | <= 15k | high repetition; use strict geometry/material budget |

For production texture delivery, prefer 1K/2K textures and KTX2 where practical. Avoid unnecessary 4K PNG textures and transparent materials on dense repeated assets.

## Runtime replacement rule

The semantic/layout contract remains authoritative:

```text
Manifest / procedural fallback
        ↓
registryAssetId
        ↓
GLB normalize + validate + cache
        ↓
instanced or shared-clone batch
        ↓
replace fallback in the same parent/index
```

The replacement must preserve:

- placement,
- rotation,
- per-instance scale,
- `assetId`,
- `parentAssetId`,
- `registryAssetId`,
- `instanceAssetIds`,
- IoT/EHS/alarm bindings,
- semantic selection / FlyTo behavior.

If the GLB is missing, malformed, over the hard validation limit, or fails to load, the procedural fallback remains in the scene.

## First-batch file slots

The first intended production files are:

```text
cooling-tower-a.glb
transformer-a.glb
hvac-a.glb
street-light-a.glb
```

Do not add a `source.url` to the active manifest until the corresponding GLB actually exists in this directory. This avoids deliberate 404s while preserving the procedural fallback during asset production.
