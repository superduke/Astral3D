import * as THREE from "three";
import { App } from "@astral3d/engine";
import type {
  FactoryAssetBatch,
  FactoryAssetRegistryEntry,
} from "./FactoryManifest";
import type { AssetInstanceTransform } from "./ProceduralAssetFactory";
import type { FactoryGlbTemplate } from "./FactoryGlbTemplateCache";

export class FactoryGlbBatchFactory {
  create(
    batch: FactoryAssetBatch,
    entry: FactoryAssetRegistryEntry,
    template: FactoryGlbTemplate,
    transforms: AssetInstanceTransform[],
  ): THREE.Group {
    const requestedMode = entry.glb?.instancing?.mode ?? "auto";
    const hasSourceInstancing = this.hasSourceInstancing(template.object);
    const canInstance =
      template.validation.instancingCompatible && !hasSourceInstancing;

    if (requestedMode === "instanced" && !canInstance) {
      throw new Error(
        `GLB ${entry.id} explicitly requires instancing but contains animation, skinning, morph targets, or source InstancedMesh.`,
      );
    }

    const useInstancing =
      requestedMode === "instanced" ||
      (requestedMode === "auto" && canInstance && transforms.length > 1);

    return useInstancing
      ? this.createInstancedBatch(batch, entry, template.object, transforms)
      : this.createSharedCloneBatch(batch, entry, template, transforms);
  }

  private createInstancedBatch(
    batch: FactoryAssetBatch,
    entry: FactoryAssetRegistryEntry,
    template: THREE.Group,
    transforms: AssetInstanceTransform[],
  ): THREE.Group {
    template.updateMatrixWorld(true);
    const group = this.createBatchRoot(batch, entry, transforms.length, "glb-instanced");
    const instanceAssetIds = transforms.map((item) => item.id);
    let partIndex = 0;

    template.traverse((node) => {
      const sourceMesh = node as THREE.Mesh;
      if (!sourceMesh.isMesh || !sourceMesh.geometry) return;

      partIndex++;
      const mesh = new THREE.InstancedMesh(
        sourceMesh.geometry,
        sourceMesh.material,
        transforms.length,
      );
      mesh.name = `${batch.id}_GLB_PART_${String(partIndex).padStart(3, "0")}_${sourceMesh.name || "MESH"}`;
      mesh.castShadow = sourceMesh.castShadow;
      mesh.receiveShadow = sourceMesh.receiveShadow;
      mesh.visible = sourceMesh.visible;
      mesh.renderOrder = sourceMesh.renderOrder;
      mesh.userData = {
        assetType: entry.id,
        batchAssetId: batch.id,
        parentAssetId: batch.id,
        registryAssetId: entry.id,
        sourcePartName: sourceMesh.name,
        instanceAssetIds,
        renderSource: "glb-instanced",
      };

      const partMatrix = sourceMesh.matrixWorld.clone();
      transforms.forEach((transform, index) => {
        const position = transform.position.clone();
        position.y += entry.elevationOffset ?? 0;
        const placement = new THREE.Matrix4().compose(
          position,
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            transform.rotationY ?? 0,
          ),
          transform.scale ?? new THREE.Vector3(1, 1, 1),
        );
        mesh.setMatrixAt(
          index,
          new THREE.Matrix4().multiplyMatrices(placement, partMatrix),
        );
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    });

    if (!partIndex) {
      throw new Error(`Normalized GLB has no Mesh parts: ${entry.id}`);
    }
    return group;
  }

  private createSharedCloneBatch(
    batch: FactoryAssetBatch,
    entry: FactoryAssetRegistryEntry,
    template: FactoryGlbTemplate,
    transforms: AssetInstanceTransform[],
  ): THREE.Group {
    const group = this.createBatchRoot(batch, entry, transforms.length, "glb-shared-clone");

    transforms.forEach((transform, index) => {
      // Object3D.clone(true) keeps geometry/material references shared. Skinned
      // hierarchies use Astral's clone path because skeleton cloning needs the
      // editor's established behavior rather than a shallow skeleton copy.
      const clone = template.validation.stats.hasSkinning
        ? App.cloneObject(template.object)
        : template.object.clone(true);
      clone.name = transform.id;
      clone.position.copy(transform.position);
      clone.position.y += entry.elevationOffset ?? 0;
      clone.rotation.y += transform.rotationY ?? 0;
      clone.scale.multiply(transform.scale ?? new THREE.Vector3(1, 1, 1));
      clone.userData = {
        ...clone.userData,
        assetId: transform.id,
        assetType: entry.id,
        registryAssetId: entry.id,
        parentAssetId: batch.id,
        renderSource: "glb-shared-clone",
        instanceIndex: index,
      };
      group.add(clone);
    });

    return group;
  }

  private createBatchRoot(
    batch: FactoryAssetBatch,
    entry: FactoryAssetRegistryEntry,
    instanceCount: number,
    renderSource: string,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = batch.id;
    group.userData = {
      assetId: batch.id,
      assetType: entry.id,
      registryAssetId: entry.id,
      renderSource,
      sourceUrl: entry.source?.url,
      instanceCount,
      label: batch.label ?? entry.label ?? batch.id,
      ...(entry.userData ?? {}),
      ...(batch.userData ?? {}),
    };
    return group;
  }

  private hasSourceInstancing(object: THREE.Object3D): boolean {
    let found = false;
    object.traverse((node) => {
      if ((node as THREE.InstancedMesh).isInstancedMesh) found = true;
    });
    return found;
  }
}
