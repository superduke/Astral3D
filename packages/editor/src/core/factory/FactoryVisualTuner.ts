import * as THREE from "three";
import type { FactoryManifest } from "./FactoryManifest";

type ColorMaterial = THREE.Material & {
  color?: THREE.Color;
  roughness?: number;
  metalness?: number;
};

interface MaterialTuning {
  color?: number;
  roughness?: number;
  metalness?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
}

const SURFACE_RENDER_ORDER = {
  site: 0,
  green: 10,
  parking: 20,
  road: 30,
  marking: 40,
} as const;

/**
 * Small, deterministic visual-audit pass for generated L2/L2.5 factories.
 *
 * This is intentionally separate from semantic generation and GLB replacement:
 * it only improves overview readability of procedural geometry. It must not
 * encode real process-system meaning through color.
 *
 * Ground overlays deliberately use explicit render layers. Large factory sites
 * are commonly viewed from hundreds of metres away, where centimetre-scale
 * GREEN / PARKING / ROAD separations are too small for a conventional depth
 * buffer to resolve reliably. Let SITE own the ground depth, keep the planar
 * overlays depth-tested but non-depth-writing, then resolve their intentional
 * stacking with renderOrder. This removes camera-motion z-fighting without
 * disabling occlusion against buildings, pipe racks or other real 3D objects.
 */
export class FactoryVisualTuner {
  constructor(private readonly groundOffset = 0) {}

  apply(root: THREE.Group, manifest: FactoryManifest): THREE.Group {
    this.ensureSiteSurface(root, manifest);
    this.tuneSite(root);
    this.tuneBuildings(root);
    this.tuneRoadsAndParking(root);
    this.tuneCampusMarkings(root);
    this.tunePipeRacks(root);

    root.userData.visualAuditStage = "overview-readability-0.3";
    root.userData.surfaceRenderPolicy = {
      site: "depth-write",
      green: "depth-test/no-write/order-10",
      parking: "depth-test/no-write/order-20",
      road: "depth-test/no-write/order-30",
      marking: "depth-test/no-write/order-40/polygon-offset",
    };
    return root;
  }

  private ensureSiteSurface(root: THREE.Group, manifest: FactoryManifest): void {
    const boundary = manifest.siteBoundary;
    const site = root.getObjectByName("SITE");
    if (!site || !boundary || boundary.length < 3) return;
    if (site.getObjectByName("SITE_SURFACE")) return;

    const shape = new THREE.Shape();
    shape.moveTo(boundary[0].x, boundary[0].y);
    for (let index = 1; index < boundary.length; index++) {
      shape.lineTo(boundary[index].x, boundary[index].y);
    }
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        // Keep the site visibly separate from Astral3D's viewport background,
        // while leaving enough luminance headroom for roads and buildings.
        color: 0x46545e,
        roughness: 0.98,
        metalness: 0,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true,
      }),
    );
    surface.name = "SITE_SURFACE";
    surface.position.y = this.groundOffset - 0.06;
    surface.renderOrder = SURFACE_RENDER_ORDER.site;
    surface.receiveShadow = true;
    surface.userData = {
      assetType: "site_surface",
      generatedBy: "FactoryVisualTuner",
      surfaceLayer: "site",
    };

    // Keep the floor behind the semantic boundary in the scene tree as well as
    // in depth, which makes the hierarchy easier to inspect in the editor.
    site.add(surface);
  }

  private tuneSite(root: THREE.Group): void {
    const boundary = root.getObjectByName("SITE_BOUNDARY") as THREE.Line | undefined;
    const material = boundary?.material as ColorMaterial | undefined;
    if (material?.color) {
      material.color.setHex(0x8ea2ae);
      material.needsUpdate = true;
    }

    const surface = root.getObjectByName("SITE_SURFACE");
    if ((surface as THREE.Mesh | undefined)?.isMesh) {
      surface!.renderOrder = SURFACE_RENDER_ORDER.site;
      this.tuneMaterial(surface!, {
        depthTest: true,
        depthWrite: true,
      });
    }
  }

  private tuneBuildings(root: THREE.Group): void {
    const buildings = root.getObjectByName("BUILDINGS");
    if (!buildings) return;

    // Low-saturation industrial palette. Differences are deliberately modest:
    // enough to distinguish building categories in Top/overview views without
    // competing with future EHS/alarm colors or GLB materials.
    const palette: Record<string, number> = {
      fab: 0xdfe6ea,
      utility: 0x98a7b2,
      warehouse: 0xb9b1a6,
      office: 0x8ca5b6,
      support: 0xa8b5bc,
      building: 0xc6ced3,
    };

    for (const building of buildings.children) {
      const type = String(building.userData?.assetType ?? "building").toLowerCase();
      const bodyColor = palette[type] ?? palette.building;

      building.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) return;
        if (object.name.endsWith("_BODY")) {
          this.tuneMaterial(object, {
            color: bodyColor,
            roughness: 0.72,
            metalness: 0.04,
          });
          return;
        }

        if (object.name.includes("WINDOW_BAND")) {
          this.tuneMaterial(object, {
            color: 0x43697f,
            roughness: 0.3,
            metalness: 0.12,
          });
          return;
        }

        if (object.name.includes("PARAPET")) {
          this.tuneMaterial(object, {
            color: 0xc5ced3,
            roughness: 0.78,
            metalness: 0.02,
          });
        }
      });
    }
  }

  private tuneRoadsAndParking(root: THREE.Group): void {
    const green = root.getObjectByName("GREEN");
    green?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, {
        color: 0x5e845f,
        roughness: 1,
        metalness: 0,
        depthTest: true,
        depthWrite: false,
      });
      object.renderOrder = SURFACE_RENDER_ORDER.green;
      object.userData.surfaceLayer = "green";
    });

    const parking = root.getObjectByName("PARKING");
    parking?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, {
        // Parking is intentionally between SITE and ROAD in luminance.
        color: 0x3e4952,
        roughness: 0.96,
        metalness: 0,
        depthTest: true,
        depthWrite: false,
      });
      object.renderOrder = SURFACE_RENDER_ORDER.parking;
      object.userData.surfaceLayer = "parking";
    });

    const roads = root.getObjectByName("ROADS");
    roads?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, {
        // Roads should be the darkest major plan element in overview mode.
        color: 0x282f36,
        roughness: 0.97,
        metalness: 0,
        depthTest: true,
        depthWrite: false,
      });
      object.renderOrder = SURFACE_RENDER_ORDER.road;
      object.userData.surfaceLayer = "road";
    });
  }

  private tuneCampusMarkings(root: THREE.Group): void {
    const details = root.getObjectByName("CAMPUS_DETAILS");
    if (!details) return;

    const roadMarkings = details.getObjectByName("ROAD_MARKINGS");
    roadMarkings?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      if (object.name.includes("CENTER_DASH")) {
        this.tuneMaterial(object, {
          color: 0xf2c55b,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });
        object.renderOrder = SURFACE_RENDER_ORDER.marking;
        object.userData.surfaceLayer = "road_marking";
      } else if (object.name.includes("EDGE_")) {
        this.tuneMaterial(object, {
          color: 0xf2f5f7,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });
        object.renderOrder = SURFACE_RENDER_ORDER.marking;
        object.userData.surfaceLayer = "road_marking";
      }
    });

    const parkingSlots = details.getObjectByName("PARKING_SLOTS");
    parkingSlots?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, {
        color: 0xf7f9fa,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      object.renderOrder = SURFACE_RENDER_ORDER.marking;
      object.userData.surfaceLayer = "parking_marking";
    });
  }

  private tunePipeRacks(root: THREE.Group): void {
    const racks = root.getObjectByName("PIPE_RACKS");
    racks?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const type = String(object.userData?.assetType ?? "");
      if (type === "utility_pipe") {
        this.tuneMaterial(object, {
          color: 0xb1c2ca,
          roughness: 0.38,
          metalness: 0.5,
        });
      } else if (type.startsWith("pipe_rack_")) {
        this.tuneMaterial(object, {
          color: 0x535f67,
          roughness: 0.52,
          metalness: 0.42,
        });
      }
    });
  }

  private tuneMaterial(object: THREE.Object3D, tuning: MaterialTuning): void {
    const material = (object as THREE.Mesh).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];

    for (const value of materials) {
      const target = value as ColorMaterial;
      if (tuning.color !== undefined && target.color) {
        target.color.setHex(tuning.color);
      }
      if (tuning.roughness !== undefined && "roughness" in target) {
        target.roughness = tuning.roughness;
      }
      if (tuning.metalness !== undefined && "metalness" in target) {
        target.metalness = tuning.metalness;
      }
      if (tuning.depthTest !== undefined) {
        target.depthTest = tuning.depthTest;
      }
      if (tuning.depthWrite !== undefined) {
        target.depthWrite = tuning.depthWrite;
      }
      if (tuning.polygonOffset !== undefined) {
        target.polygonOffset = tuning.polygonOffset;
      }
      if (tuning.polygonOffsetFactor !== undefined) {
        target.polygonOffsetFactor = tuning.polygonOffsetFactor;
      }
      if (tuning.polygonOffsetUnits !== undefined) {
        target.polygonOffsetUnits = tuning.polygonOffsetUnits;
      }
      target.needsUpdate = true;
    }
  }
}
