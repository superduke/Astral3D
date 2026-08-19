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
    const target = this.resolveAssetBounds(assetId);
    if (!target) return undefined;

    if (target.instanceId !== undefined) {
      // A semantic instance is not an independently transformable Object3D.
      // Attaching Astral's TransformControls to the backing InstancedMesh would
      // expose the batch mesh-part origin and could accidentally move every
      // physical device represented by that part. Keep semantic selection safe
      // by clearing the editor Object3D selection instead.
      App.deselect();
      return target.object;
    }

    App.select(target.object);
    return target.object;
  }

  focusAsset(assetId: string, select = true): THREE.Object3D | undefined {
    const target = this.resolveAssetBounds(assetId);
    if (!target) return undefined;

    if (target.instanceId !== undefined) {
      if (select) App.deselect();

      // Do not pass an editor-side THREE.Box3 into the CameraControls instance
      // bundled inside @astral3d/engine. Astral3D and Factory Generator can run
      // with distinct Three.js runtimes; fitToBox() crossing that boundary is
      // unnecessary and has produced invalid/black FlyTo views in practice.
      // Convert bounds to plain numeric camera parameters and use setLookAt().
      if (!this.focusBoundsSafely(target.box)) {
        console.warn(
          `[FactorySemanticRuntime] Cannot safely FlyTo instance ${assetId}; keeping current camera.`,
        );
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

  /**
   * Frames world bounds using numeric camera data only.
   *
   * The direction follows the current camera orientation while the distance is
   * derived from the bounding sphere and the limiting horizontal/vertical FOV.
   * A minimum radius/distance prevents degenerate or very thin assets from
   * placing the camera on/inside geometry or below the near plane.
   */
  private focusBoundsSafely(box: THREE.Box3, enableTransition = true): boolean {
    if (box.isEmpty()) return false;

    const controls = App.viewer?.modules?.controls;
    const camera = App.camera;
    if (!controls || typeof controls.setLookAt !== "function" || !camera?.isPerspectiveCamera) {
      return false;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const finite = [center.x, center.y, center.z, size.x, size.y, size.z].every(
      Number.isFinite,
    );
    if (!finite) return false;

    const verticalFov = THREE.MathUtils.degToRad(Math.max(camera.fov, 1));
    const aspect = Math.max(camera.aspect || 1, 0.1);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const limitingHalfFov = Math.max(
      Math.min(verticalFov, horizontalFov) / 2,
      THREE.MathUtils.degToRad(5),
    );

    const radius = Math.max(size.length() * 0.5, 0.75);
    const fittedDistance = radius / Math.max(Math.sin(limitingHalfFov), 0.05);
    const distance = Math.max(
      fittedDistance * 1.18,
      Math.max(size.y * 1.5, 4),
      Math.max(camera.near * 100, 1),
    );

    // Camera local +Z points backwards, i.e. from the target toward the camera.
    // Rebuild the direction from quaternion numeric components so no Vector3 or
    // Quaternion object crosses the editor/engine Three.js runtime boundary.
    const cameraQuaternion = camera.quaternion;
    const direction = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(
        new THREE.Quaternion(
          cameraQuaternion.x,
          cameraQuaternion.y,
          cameraQuaternion.z,
          cameraQuaternion.w,
        ),
      )
      .normalize();

    if (
      ![direction.x, direction.y, direction.z].every(Number.isFinite) ||
      direction.lengthSq() < 1e-6
    ) {
      direction.set(0.72, 0.58, 0.38).normalize();
    }

    // Avoid a near-horizontal/underground semantic FlyTo even if the user has
    // previously rotated the camera to an extreme angle. Preserve azimuth, but
    // keep a readable digital-twin elevation.
    if (direction.y < 0.18) {
      direction.y = 0.35;
      direction.normalize();
    }

    const position = center.clone().addScaledVector(direction, distance);
    controls.setLookAt(
      position.x,
      position.y,
      position.z,
      center.x,
      center.y,
      center.z,
      enableTransition,
    );

    return true;
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
