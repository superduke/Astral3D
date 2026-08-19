import * as THREE from "three";

function ensureGeometryBounds(
  geometry: THREE.BufferGeometry | undefined,
): THREE.Box3 | undefined {
  if (!geometry || typeof geometry.computeBoundingBox !== "function") return undefined;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return undefined;
  return geometry.boundingBox;
}

/**
 * Computes the world-space bounds for exactly one InstancedMesh instance.
 *
 * The instance matrix may already contain a source GLB part transform (the
 * FactoryGlbBatchFactory bakes each source mesh matrixWorld into setMatrixAt),
 * so the correct world transform is object.matrixWorld * instanceMatrix.
 */
export function computeFactoryInstanceBounds(
  mesh: THREE.InstancedMesh,
  instanceId: number,
): THREE.Box3 {
  const result = new THREE.Box3();
  const geometryBounds = ensureGeometryBounds(mesh.geometry);
  if (!geometryBounds) return result;
  if (!Number.isInteger(instanceId) || instanceId < 0 || instanceId >= mesh.count) {
    return result;
  }
  if (typeof mesh.getMatrixAt !== "function") return result;

  mesh.updateMatrixWorld(true);
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  mesh.getMatrixAt(instanceId, instanceMatrix);
  worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
  return result.copy(geometryBounds).applyMatrix4(worldMatrix);
}

/**
 * Computes world-space bounds without relying on Box3.setFromObject().
 *
 * This is intentionally defensive because Factory scenes can contain objects
 * originating from the editor Three.js runtime, the bundled Astral3D runtime,
 * and loaded GLB content. Only geometry objects that expose the expected
 * BufferGeometry bounding-box contract participate in the result.
 */
export function computeFactoryObjectBounds(root: THREE.Object3D): THREE.Box3 {
  const result = new THREE.Box3();
  root.updateMatrixWorld(true);

  root.traverse((object) => {
    const candidate = object as THREE.Object3D & {
      isInstancedMesh?: boolean;
      count?: number;
      getMatrixAt?: (index: number, matrix: THREE.Matrix4) => void;
      geometry?: THREE.BufferGeometry;
    };
    const geometry = candidate.geometry;
    const geometryBounds = ensureGeometryBounds(geometry);
    if (!geometry || !geometryBounds) return;

    if (
      candidate.isInstancedMesh &&
      typeof candidate.getMatrixAt === "function" &&
      Number.isFinite(candidate.count)
    ) {
      const instanceMatrix = new THREE.Matrix4();
      const worldMatrix = new THREE.Matrix4();
      const instanceBox = new THREE.Box3();
      const count = Math.max(0, Number(candidate.count) || 0);

      for (let index = 0; index < count; index++) {
        candidate.getMatrixAt(index, instanceMatrix);
        worldMatrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
        instanceBox.copy(geometryBounds).applyMatrix4(worldMatrix);
        result.union(instanceBox);
      }
      return;
    }

    const worldBox = geometryBounds.clone().applyMatrix4(object.matrixWorld);
    result.union(worldBox);
  });

  return result;
}
