import * as THREE from "three";
import type { FactoryAssetRegistryEntry } from "./FactoryManifest";
import { computeFactoryObjectBounds } from "./FactorySafeBounds";

export interface FactoryGlbAssetStats {
  meshes: number;
  triangles: number;
  materials: number;
  transparentMaterials: number;
  hasAnimations: boolean;
  hasSkinning: boolean;
  hasMorphTargets: boolean;
  dimensions: { x: number; y: number; z: number };
}

export interface FactoryGlbValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: FactoryGlbAssetStats;
  instancingCompatible: boolean;
}

/**
 * Structural and budget validation for normalized factory GLB templates.
 * Budget overruns are warnings except maxDimensionMeters, which protects the
 * scene from obviously bad unit declarations.
 */
export class FactoryGlbAssetValidator {
  validate(
    object: THREE.Object3D,
    entry: FactoryAssetRegistryEntry,
  ): FactoryGlbValidationResult {
    object.updateMatrixWorld(true);

    const errors: string[] = [];
    const warnings: string[] = [];
    let meshes = 0;
    let triangles = 0;
    let transparentMaterials = 0;
    let hasSkinning = false;
    let hasMorphTargets = false;
    const materials = new Set<THREE.Material>();

    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;

      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) hasSkinning = true;
      if (mesh.morphTargetInfluences?.length) hasMorphTargets = true;

      const geometry = mesh.geometry;
      const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
      triangles += Math.floor(count / 3);

      const meshMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of meshMaterials) {
        if (!material) continue;
        materials.add(material);
        if (material.transparent || material.opacity < 1) {
          transparentMaterials++;
        }
      }
    });

    const bounds = computeFactoryObjectBounds(object);
    const size = bounds.isEmpty()
      ? new THREE.Vector3()
      : bounds.getSize(new THREE.Vector3());
    const hasAnimations = object.animations.length > 0;
    const policy = entry.glb?.validation;
    const materialPolicy = entry.glb?.materialPolicy;

    if (!meshes) errors.push("GLB contains no renderable Mesh.");
    if (bounds.isEmpty()) errors.push("GLB has no valid geometry bounds.");

    const maxDimension = Math.max(size.x, size.y, size.z);
    if (
      policy?.maxDimensionMeters !== undefined &&
      maxDimension > policy.maxDimensionMeters
    ) {
      errors.push(
        `GLB dimension ${maxDimension.toFixed(2)}m exceeds hard limit ${policy.maxDimensionMeters}m; check unit/scale.`,
      );
    }

    if (policy?.maxTriangles !== undefined && triangles > policy.maxTriangles) {
      warnings.push(
        `Triangle budget exceeded: ${triangles} > ${policy.maxTriangles}.`,
      );
    }

    if (
      materialPolicy?.maxMaterials !== undefined &&
      materials.size > materialPolicy.maxMaterials
    ) {
      warnings.push(
        `Material budget exceeded: ${materials.size} > ${materialPolicy.maxMaterials}.`,
      );
    }

    if (materialPolicy?.allowTransparent === false && transparentMaterials > 0) {
      warnings.push(
        `Asset uses ${transparentMaterials} transparent material reference(s); dense repeated transparent assets are discouraged.`,
      );
    }

    if (hasAnimations) warnings.push("Animated GLB cannot use static mesh instancing.");
    if (hasSkinning) warnings.push("SkinnedMesh requires shared-clone mode.");
    if (hasMorphTargets) warnings.push("Morph-target Mesh requires shared-clone mode.");

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        meshes,
        triangles,
        materials: materials.size,
        transparentMaterials,
        hasAnimations,
        hasSkinning,
        hasMorphTargets,
        dimensions: { x: size.x, y: size.y, z: size.z },
      },
      instancingCompatible: !hasAnimations && !hasSkinning && !hasMorphTargets,
    };
  }
}
