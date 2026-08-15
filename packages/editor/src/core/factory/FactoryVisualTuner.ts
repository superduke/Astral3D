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
}

/**
 * Small, deterministic visual-audit pass for generated L2/L2.5 factories.
 *
 * This is intentionally separate from semantic generation and GLB replacement:
 * it only improves overview readability of procedural geometry. It must not
 * encode real process-system meaning through color.
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

    root.userData.visualAuditStage = "overview-readability-0.1";
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
        color: 0x3b454e,
        roughness: 0.98,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    surface.name = "SITE_SURFACE";
    surface.position.y = this.groundOffset - 0.06;
    surface.receiveShadow = true;
    surface.userData = {
      assetType: "site_surface",
      generatedBy: "FactoryVisualTuner",
    };

    // Keep the floor behind the semantic boundary in the scene tree as well as
    // in depth, which makes the hierarchy easier to inspect in the editor.
    site.add(surface);
  }

  private tuneSite(root: THREE.Group): void {
    const boundary = root.getObjectByName("SITE_BOUNDARY") as THREE.Line | undefined;
    const material = boundary?.material as ColorMaterial | undefined;
    if (material?.color) {
      material.color.setHex(0x8195a2);
      material.needsUpdate = true;
    }
  }

  private tuneBuildings(root: THREE.Group): void {
    const buildings = root.getObjectByName("BUILDINGS");
    if (!buildings) return;

    const palette: Record<string, number> = {
      fab: 0xd8e1e6,
      utility: 0x9daab3,
      warehouse: 0xb8b3aa,
      office: 0x8ea6b5,
      support: 0xaab6bc,
      building: 0xc4cdd2,
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
            color: 0x496c80,
            roughness: 0.3,
            metalness: 0.12,
          });
          return;
        }

        if (object.name.includes("PARAPET")) {
          this.tuneMaterial(object, {
            color: 0xc2cbd0,
            roughness: 0.78,
            metalness: 0.02,
          });
        }
      });
    }
  }

  private tuneRoadsAndParking(root: THREE.Group): void {
    const roads = root.getObjectByName("ROADS");
    roads?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, {
        color: 0x2f373f,
        roughness: 0.97,
        metalness: 0,
      });
    });

    const parking = root.getObjectByName("PARKING");
    parking?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, {
        color: 0x48535c,
        roughness: 0.96,
        metalness: 0,
      });
    });

    const green = root.getObjectByName("GREEN");
    green?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, {
        color: 0x55775a,
        roughness: 1,
        metalness: 0,
      });
    });
  }

  private tuneCampusMarkings(root: THREE.Group): void {
    const details = root.getObjectByName("CAMPUS_DETAILS");
    if (!details) return;

    const roadMarkings = details.getObjectByName("ROAD_MARKINGS");
    roadMarkings?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      if (object.name.includes("CENTER_DASH")) {
        this.tuneMaterial(object, { color: 0xf0c85c });
        object.renderOrder = 3;
      } else if (object.name.includes("EDGE_")) {
        this.tuneMaterial(object, { color: 0xf0f3f4 });
        object.renderOrder = 3;
      }
    });

    const parkingSlots = details.getObjectByName("PARKING_SLOTS");
    parkingSlots?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      this.tuneMaterial(object, { color: 0xf4f6f7 });
      object.renderOrder = 3;
    });
  }

  private tunePipeRacks(root: THREE.Group): void {
    const racks = root.getObjectByName("PIPE_RACKS");
    racks?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const type = String(object.userData?.assetType ?? "");
      if (type === "utility_pipe") {
        this.tuneMaterial(object, {
          color: 0xa9bbc3,
          roughness: 0.38,
          metalness: 0.5,
        });
      } else if (type.startsWith("pipe_rack_")) {
        this.tuneMaterial(object, {
          color: 0x59666e,
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
      target.needsUpdate = true;
    }
  }
}
