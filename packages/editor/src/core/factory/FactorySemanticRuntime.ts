import * as THREE from "three";
import { App } from "@astral3d/engine";
import {
  computeFactoryInstanceBounds,
  computeFactoryObjectBounds,
} from "./FactorySafeBounds";

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

interface FactoryResolvedAssetBounds {
  object: THREE.Object3D;
  box: THREE.Box3;
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
    const target = this.resolveAssetBounds(assetId);
    if (!target) return undefined;

    if (target.instanceId !== undefined) {
      // Astral3D's normal App.focus(object) computes Box3 from the whole
      // InstancedMesh, which would frame every cooling tower/street light in
      // the batch. A semantic assetId represents one physical device, so fit
      // the camera to the aggregate bounds of that exact instance instead.
      if (select) App.deselect();
      const controls = App.viewer?.modules?.controls;
      if (controls && typeof controls.fitToBox === "function" && !target.box.isEmpty()) {
        controls.fitToBox(target.box, true);
      } else {
        // Preserve a usable fallback for hosts without editor CameraControls.
        App.focus(target.object);
      }
      return target.object;
    }

    if (select) App.select(target.object);
    App.focus(target.object);
    return target.object;
  }

  getAssetAnchor(assetId: string): FactoryAssetAnchor | undefined {
    const target = this.resolveAssetBounds(assetId);
    if (!target) return undefined;

    const position = target.box.isEmpty()
      ? target.object.getWorldPosition(new THREE.Vector3())
      : target.box.getCenter(new THREE.Vector3()).setY(target.box.max.y);

    return {
      object: target.object,
      position,
      instanceId: target.instanceId,
    };
  }

  /**
   * Converts a Three.js raycast hit into digital-twin semantics. For
   * InstancedMesh batches the intersection.instanceId is resolved through the
   * instanceAssetIds[] array written by ProceduralAssetFactory/GLB batch code.
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

  /**
   * Resolve one semantic assetId to its exact world bounds.
   *
   * For repeated assets the same instanceAssetIds[] is written on every source
   * mesh part. We union the matching instance from all parts, giving a full
   * single-device box rather than the bounds of only the first GLB mesh part.
   */
  private resolveAssetBounds(assetId: string): FactoryResolvedAssetBounds | undefined {
    this.root.updateMatrixWorld(true);

    const instanceBox = new THREE.Box3();
    let instanceObject: THREE.InstancedMesh | undefined;
    let representativeInstanceId: number | undefined;

    this.root.traverse((object) => {
      const instanceIds = object.userData?.instanceAssetIds;
      if (!object.isInstancedMesh || !Array.isArray(instanceIds)) return;

      const instanceId = instanceIds.indexOf(assetId);
      if (instanceId < 0) return;

      const mesh = object as THREE.InstancedMesh;
      if (typeof mesh.getMatrixAt !== "function") {
        console.warn(
          `[FactorySemanticRuntime] InstancedMesh prototype is incomplete: ${object.name}`,
        );
        return;
      }

      const partBox = computeFactoryInstanceBounds(mesh, instanceId);
      if (partBox.isEmpty()) return;
      instanceBox.union(partBox);
      if (!instanceObject) {
        instanceObject = mesh;
        representativeInstanceId = instanceId;
      }
    });

    if (instanceObject && !instanceBox.isEmpty()) {
      return {
        object: instanceObject,
        box: instanceBox,
        instanceId: representativeInstanceId,
      };
    }

    const object = this.findDirectAsset(assetId);
    if (!object) return undefined;
    return {
      object,
      box: computeFactoryObjectBounds(object),
    };
  }

  private findDirectAsset(assetId: string): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    this.root.traverse((object) => {
      if (!found && object.userData?.assetId === assetId) found = object;
    });
    return found;
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
