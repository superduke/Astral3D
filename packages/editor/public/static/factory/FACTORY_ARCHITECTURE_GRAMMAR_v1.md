# Factory Architecture Grammar v1

The Factory Generator keeps DXF/Manifest footprints as the semantic source of
truth, then applies deterministic L2.5 industrial architecture in
`FactorySceneEnhancer`.

## Pipeline

```text
FactorySceneBuilder
  -> stable footprint shell / roads / semantic assets

FactorySceneEnhancer
  -> BuildingArchitectureGenerator
     -> BuildingProfileRegistry
     -> split massing
     -> facade bay grammar
     -> nearest-road front facade
     -> entrance node
     -> clustered roofscape
  -> PipeRackGenerator
  -> EquipmentYardGenerator
  -> CampusDetailGenerator
  -> FactoryVisualTuner
```

## Nine implemented upgrades

1. **Building Style Profile Registry**  
   Building types select deterministic architectural profiles rather than
   individual mesh parameters.

2. **Split FAB / industrial massing**  
   The legacy monolithic body is hidden and replaced by main volume, plinth,
   inset mechanical volume, roof penthouse and optional service annex.

3. **Facade Bay System**  
   Panel joints, corner trim, glazing modules, louvers and loading-bay modules
   are generated from facade edges.

4. **Automatic front facade + entrance**  
   The generator picks the footprint edge nearest a road and creates a human
   scale entrance vestibule, canopy and landing. The manifest can override the
   edge and entrance dimensions.

5. **Service-aware roofscape**  
   HVAC, exhaust stacks and scrubbers are clustered with edge setbacks and a
   central maintenance corridor instead of one uniform grid. The generated
   groups keep `placement: "roof"` and `factoryInstanceTransforms`, therefore the
   existing GLB upgrade service still replaces procedural assets in place.

6. **Independent building grammars**  
   FAB, Utility, Office/R&D, Warehouse and Support use visibly different
   profiles.

7. **Equipment Yard Generator**  
   Transformer, cooling-tower and gas-cabinet batches automatically receive
   concrete pads, perimeter fencing, access aprons and transformer containment
   curbs where applicable.

8. **Instanced architectural details**  
   Repeating panel joints, windows, louvers, corner trims, loading doors,
   canopies, roof screens and fence posts use `THREE.InstancedMesh`.

9. **PBR material vocabulary / KTX2 hook**  
   Generated architecture uses semantic PBR material keys rather than scattered
   colors. Material specs expose texture-set metadata, including KTX2, without
   coupling synchronous scene generation to renderer/transcoder initialization.
   Production KTX2 payloads can be wired into these keys as texture assets are
   added.

## Built-in style profiles

- `semiconductor-fab-modern-v1`
- `semiconductor-utility-industrial-v1`
- `semiconductor-office-modern-v1`
- `semiconductor-warehouse-logistics-v1`
- `semiconductor-support-service-v1`
- `industrial-generic-v1`

Profiles are selected automatically from `building.type`. A manifest can
explicitly choose one:

```json
{
  "id": "FAB_A",
  "type": "fab",
  "z": 28,
  "facade": {
    "template": "semiconductor-fab-modern-v1",
    "entrance": {
      "enabled": true
    }
  },
  "roof": {
    "hvacCount": 12,
    "exhaustCount": 8,
    "scrubberCount": 2,
    "screen": true
  }
}
```

The manifest intentionally exposes only useful overrides. It does not require AI
or CAD importers to emit hundreds of low-level geometry parameters.
