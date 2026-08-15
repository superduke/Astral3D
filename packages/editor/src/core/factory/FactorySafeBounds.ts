import * as THREE from "three";

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
    if (!geometry || typeof geometry.computeBoundingBox !== "function") return;

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;

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
        instanceBox.copy(geometry.boundingBox).applyMatrix4(worldMatrix);
        result.union(instanceBox);
      }
      return;
    }

    const worldBox = geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
    result.union(worldBox);
  });

  return result;
}
