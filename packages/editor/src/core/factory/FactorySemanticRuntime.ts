import * as THREE from "three";
import { App } from "@astral3d/engine";

export interface FactorySemanticHit {
  assetId?: string;
  assetType?: string;
  object: THREE.Object3D;
  instanceId?: number;
  userData: Record<string, unknown>;
}

export class FactorySemanticRuntime {
  constructor(private readonly root: THREE.Object3D) {}

  findAsset(assetId: string): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    this.root.traverse((object) => {
      if (found) return;
      if (object.userData?.assetId === assetId) {
        found = object;
        return;
      }

      const instanceIds = object.userData?.instanceAssetIds;
      if (Array.isArray(instanceIds) && instanceIds.includes(assetId)) {
        found = object;
      }
    });
    return found;
  }

  selectAsset(assetId: string): THREE.Object3D | undefined {
    const object = this.findAsset(assetId);
    if (object) App.select(object);
    return object;
  }

  focusAsset(assetId: string, select = true): THREE.Object3D | undefined {
    const object = this.findAsset(assetId);
    if (!object) return undefined;
    if (select) App.select(object);
    App.focus(object);
    return object;
  }

  /**
   * Converts a Three.js raycast hit into digital-twin semantics. For
   * InstancedMesh batches the intersection.instanceId is resolved through the
   * instanceAssetIds[] array written by ProceduralAssetFactory.
   */
  resolveIntersection(
    intersection: THREE.Intersection<THREE.Object3D>,
  ): FactorySemanticHit {
    const object = intersection.object;
    const instanceId = intersection.instanceId;
    const instanceAssetIds = object.userData?.instanceAssetIds;

    if (
      Number.isInteger(instanceId) &&
      Array.isArray(instanceAssetIds) &&
      instanceId! >= 0 &&
      instanceId! < instanceAssetIds.length
    ) {
      return {
        assetId: instanceAssetIds[instanceId!],
        assetType: object.userData?.assetType,
        object,
        instanceId,
        userData: object.userData ?? {},
      };
    }

    const semanticOwner = this.findSemanticOwner(object);
    return {
      assetId: semanticOwner.userData?.assetId,
      assetType: semanticOwner.userData?.assetType,
      object: semanticOwner,
      instanceId,
      userData: semanticOwner.userData ?? {},
    };
  }

  private findSemanticOwner(object: THREE.Object3D): THREE.Object3D {
    let current: THREE.Object3D | null = object;
    while (current && current !== this.root.parent) {
      if (current.userData?.assetId) return current;
      if (current === this.root) break;
      current = current.parent;
    }
    return object;
  }
}
