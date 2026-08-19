import * as THREE from "three";
import type { FactoryAssetBatch, FactoryManifest } from "./FactoryManifest";
import { AssetPlacer } from "./AssetPlacer";
import { FactoryMaterialLibrary } from "./FactoryMaterialLibrary";

const YARD_TEMPLATES = new Set(["transformer", "cooling_tower", "gas_cabinet"]);

interface YardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Adds contextual yards around equipment batches so high-fidelity GLB assets do
 * not read as isolated props. Yards are derived from the exact batch placements,
 * therefore procedural and GLB-upgraded assets remain aligned.
 */
export class EquipmentYardGenerator {
  private readonly materials = new FactoryMaterialLibrary();
  private readonly placer: AssetPlacer;

  constructor(
    private readonly manifest: FactoryManifest,
    private readonly groundOffset = 0,
  ) {
    this.placer = new AssetPlacer(groundOffset);
  }

  create(): THREE.Group {
    const root = new THREE.Group();
    root.name = "EQUIPMENT_YARDS";
    root.userData = {
      assetType: "equipment_yard_collection",
      generatedBy: "EquipmentYardGenerator",
    };

    if (this.manifest.campus?.equipmentYards === false) return root;

    for (const batch of this.manifest.assets ?? []) {
      const template = this.resolveTemplate(batch);
      if (!template || !YARD_TEMPLATES.has(template)) continue;
      const transforms = this.placer.createTransforms(batch);
      if (!transforms.length) continue;
      root.add(this.createYard(batch, template, transforms.map((item) => item.position)));
    }
    return root;
  }

  private createYard(
    batch: FactoryAssetBatch,
    template: string,
    positions: THREE.Vector3[],
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `${batch.id}_YARD`;
    group.userData = {
      assetId: `${batch.id}_YARD`,
      assetType: "equipment_yard",
      parentAssetId: batch.id,
      equipmentTemplate: template,
    };

    const margin = template === "cooling_tower" ? 7 : template === "transformer" ? 5.5 : 3.5;
    const bounds = this.bounds(positions, margin);
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.16, depth),
      this.materials.get("equipmentPad"),
    );
    pad.name = `${batch.id}_YARD_PAD`;
    pad.position.set(centerX, this.groundOffset + 0.08, centerZ);
    pad.receiveShadow = true;
    pad.userData = { assetType: "equipment_pad", parentAssetId: batch.id };
    group.add(pad);

    this.addFence(group, batch.id, bounds, template === "gas_cabinet" ? 1.8 : 2.4);
    this.addAccessApron(group, batch.id, bounds, template);

    if (template === "transformer") {
      this.addTransformerBund(group, batch.id, bounds);
    }

    return group;
  }

  private addFence(
    target: THREE.Group,
    id: string,
    bounds: YardBounds,
    height: number,
  ): void {
    const spacing = 4;
    const posts: THREE.Vector3[] = [];
    const edges = [
      [new THREE.Vector2(bounds.minX, bounds.minZ), new THREE.Vector2(bounds.maxX, bounds.minZ)],
      [new THREE.Vector2(bounds.maxX, bounds.minZ), new THREE.Vector2(bounds.maxX, bounds.maxZ)],
      [new THREE.Vector2(bounds.maxX, bounds.maxZ), new THREE.Vector2(bounds.minX, bounds.maxZ)],
      [new THREE.Vector2(bounds.minX, bounds.maxZ), new THREE.Vector2(bounds.minX, bounds.minZ)],
    ] as const;

    for (const [a, b] of edges) {
      const length = a.distanceTo(b);
      const count = Math.max(2, Math.ceil(length / spacing));
      for (let index = 0; index < count; index++) {
        const t = index / count;
        const point = a.clone().lerp(b, t);
        posts.push(new THREE.Vector3(point.x, this.groundOffset + height / 2, point.y));
      }
    }

    if (posts.length) {
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.09, height, 0.09),
        this.materials.get("galvanizedSteel"),
        posts.length,
      );
      mesh.name = `${id}_YARD_FENCE_POSTS`;
      mesh.userData = { assetType: "yard_fence_post", parentAssetId: id };
      const scale = new THREE.Vector3(1, 1, 1);
      const quaternion = new THREE.Quaternion();
      posts.forEach((position, index) => {
        mesh.setMatrixAt(index, new THREE.Matrix4().compose(position, quaternion, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      target.add(mesh);
    }

    edges.forEach(([a, b], index) => {
      const dx = b.x - a.x;
      const dz = b.y - a.y;
      const length = Math.hypot(dx, dz);
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(length, height * 0.72, 0.045),
        new THREE.MeshStandardMaterial({
          color: 0x728087,
          roughness: 0.54,
          metalness: 0.45,
          transparent: true,
          opacity: 0.7,
        }),
      );
      rail.name = `${id}_YARD_FENCE_PANEL_${index + 1}`;
      rail.position.set(
        (a.x + b.x) / 2,
        this.groundOffset + height * 0.52,
        (a.y + b.y) / 2,
      );
      rail.rotation.y = -Math.atan2(dz, dx);
      rail.userData = { assetType: "yard_fence_panel", parentAssetId: id };
      target.add(rail);
    });
  }

  private addAccessApron(
    target: THREE.Group,
    id: string,
    bounds: YardBounds,
    template: string,
  ): void {
    const width = Math.min(8, Math.max(4, (bounds.maxX - bounds.minX) * 0.22));
    const depth = template === "cooling_tower" ? 6 : 4.5;
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.1, depth),
      this.materials.get("architecturalConcrete"),
    );
    apron.name = `${id}_YARD_ACCESS_APRON`;
    apron.position.set(
      (bounds.minX + bounds.maxX) / 2,
      this.groundOffset + 0.06,
      bounds.maxZ + depth / 2,
    );
    apron.receiveShadow = true;
    apron.userData = { assetType: "yard_access_apron", parentAssetId: id };
    target.add(apron);
  }

  private addTransformerBund(
    target: THREE.Group,
    id: string,
    bounds: YardBounds,
  ): void {
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const curbHeight = 0.35;
    const thickness = 0.28;
    const material = this.materials.get("darkConcretePlinth");

    const configs = [
      { w: width, d: thickness, x: 0, z: -depth / 2 },
      { w: width, d: thickness, x: 0, z: depth / 2 },
      { w: thickness, d: depth, x: -width / 2, z: 0 },
      { w: thickness, d: depth, x: width / 2, z: 0 },
    ];
    configs.forEach((config, index) => {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(config.w, curbHeight, config.d),
        material,
      );
      curb.name = `${id}_BUND_${index + 1}`;
      curb.position.set(
        (bounds.minX + bounds.maxX) / 2 + config.x,
        this.groundOffset + curbHeight / 2,
        (bounds.minZ + bounds.maxZ) / 2 + config.z,
      );
      curb.userData = { assetType: "transformer_bund", parentAssetId: id };
      target.add(curb);
    });
  }

  private bounds(positions: THREE.Vector3[], margin: number): YardBounds {
    const xs = positions.map((point) => point.x);
    const zs = positions.map((point) => point.z);
    return {
      minX: Math.min(...xs) - margin,
      maxX: Math.max(...xs) + margin,
      minZ: Math.min(...zs) - margin,
      maxZ: Math.max(...zs) + margin,
    };
  }

  private resolveTemplate(batch: FactoryAssetBatch): string | undefined {
    if (batch.template) return batch.template.toLowerCase();
    const entry = (this.manifest.assetRegistry ?? []).find((item) => item.id === batch.asset);
    return entry?.fallbackTemplate?.toLowerCase();
  }
}
