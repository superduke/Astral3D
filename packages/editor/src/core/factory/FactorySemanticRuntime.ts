import * as THREE from "three";
import { App } from "@astral3d/engine";

export interface FactorySemanticHit {
  assetId?: string;
  assetType?: string;
  object: THREE.Object3D;
  instanceId?: number;
  userData: Record<string, unknown>;
}

export interface FactoryAssetAnchor {
  object: THREE.Object3D;
  position: THREE.Vector3;
  instanceId?: number;
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

  getAssetAnchor(assetId: string): FactoryAssetAnchor | undefined {
    let anchor: FactoryAssetAnchor | undefined;

    this.root.updateMatrixWorld(true);
    this.root.traverse((object) => {
      if (anchor) return;

      const instanceIds = object.userData?.instanceAssetIds;
      if (object.isInstancedMesh && Array.isArray(instanceIds)) {
        const instanceId = instanceIds.indexOf(assetId);
        if (instanceId >= 0) {
          const matrix = new THREE.Matrix4();
          (object as THREE.InstancedMesh).getMatrixAt(instanceId, matrix);
          matrix.premultiply(object.matrixWorld);
          const position = new THREE.Vector3().setFromMatrixPosition(matrix);
          anchor = { object, position, instanceId };
          return;
        }
      }

      if (object.userData?.assetId === assetId) {
        const box = new THREE.Box3().setFromObject(object);
        const position = box.isEmpty()
          ? object.getWorldPosition(new THREE.Vector3())
          : box.getCenter(new THREE.Vector3()).setY(box.max.y);
        anchor = { object, position };
      }
    });

    return anchor;
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
