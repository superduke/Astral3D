import * as THREE from "three";
import { App } from "@astral3d/engine";
import type {
  FactoryAssetBatch,
  FactoryAssetRegistryEntry,
  FactoryManifest,
  FactoryScale,
} from "./FactoryManifest";
import { AssetPlacer } from "./AssetPlacer";
import { FactoryAssetRegistry } from "./FactoryAssetRegistry";
import { GlbAssetLoader } from "./GlbAssetLoader";

export interface FactoryAssetUpgradeSummary {
  requested: number;
  upgraded: number;
  skipped: number;
  failed: Array<{ batchId: string; assetId?: string; reason: string }>;
}

export class FactoryAssetUpgradeService {
  private readonly registry: FactoryAssetRegistry;
  private readonly loader = new GlbAssetLoader();
  private readonly placer: AssetPlacer;

  constructor(
    private readonly manifest: FactoryManifest,
    private readonly groundOffset = 0,
  ) {
    this.registry = new FactoryAssetRegistry(manifest);
    this.placer = new AssetPlacer(groundOffset, this.registry);
  }

  async upgrade(root: THREE.Group): Promise<FactoryAssetUpgradeSummary> {
    const summary: FactoryAssetUpgradeSummary = {
      requested: 0,
      upgraded: 0,
      skipped: 0,
      failed: [],
    };

    const assetsRoot = root.getObjectByName("ASSETS");
    if (!assetsRoot) return summary;

    for (const batch of this.manifest.assets ?? []) {
      const entry = this.registry.get(batch.asset);
      if (!entry?.source || entry.source.type !== "glb") {
        summary.skipped++;
        continue;
      }

      summary.requested++;
      try {
        const realGroup = await this.createGlbBatch(batch, entry);
        const fallback = assetsRoot.getObjectByName(batch.id);
        if (!fallback?.parent) {
          throw new Error(`Procedural fallback batch not found: ${batch.id}`);
        }

        const parent = fallback.parent;
        const index = parent.children.indexOf(fallback);

        // The root is already part of Astral3D by the time upgrades run.
        // Use App add/remove helpers so geometry/material bookkeeping stays valid.
        App.removeObject(fallback);
        App.addObject(realGroup, parent, index);
        summary.upgraded++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        summary.failed.push({
          batchId: batch.id,
          assetId: batch.asset,
          reason,
        });
        console.warn(
          `[FactoryAssetUpgradeService] Keeping fallback for ${batch.id}: ${reason}`,
        );
      }
    }

    root.userData.assetUpgrade = {
      requested: summary.requested,
      upgraded: summary.upgraded,
      skipped: summary.skipped,
      failed: summary.failed.length,
    };

    return summary;
  }

  private async createGlbBatch(
    batch: FactoryAssetBatch,
    entry: FactoryAssetRegistryEntry,
  ): Promise<THREE.Group> {
    if (!entry.source?.url) {
      throw new Error(`Registry asset has no GLB URL: ${entry.id}`);
    }

    const source = await this.loader.load(entry.source.url);
    const prepared = this.prepareSource(source, entry);
    const transforms = this.placer.createTransforms(batch);

    const group = new THREE.Group();
    group.name = batch.id;
    group.userData = {
      assetId: batch.id,
      assetType: entry.id,
      registryAssetId: entry.id,
      renderSource: "glb",
      sourceUrl: entry.source.url,
      instanceCount: transforms.length,
      label: batch.label ?? entry.label ?? batch.id,
      ...(entry.userData ?? {}),
      ...(batch.userData ?? {}),
    };

    transforms.forEach((transform, index) => {
      const clone = App.cloneObject(prepared);
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
        renderSource: "glb",
        instanceIndex: index,
      };
      group.add(clone);
    });

    return group;
  }

  private prepareSource(
    source: THREE.Object3D,
    entry: FactoryAssetRegistryEntry,
  ): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.name = `${entry.id}_SOURCE`;

    const model = App.cloneObject(source);
    model.scale.multiply(this.toScale(entry.defaultScale));
    model.rotation.y += THREE.MathUtils.degToRad(entry.rotationOffsetDeg ?? 0);
    wrapper.add(model);
    wrapper.updateMatrixWorld(true);

    if ((entry.anchor ?? "center-base") === "center-base") {
      const box = new THREE.Box3().setFromObject(wrapper);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
        wrapper.updateMatrixWorld(true);
      }
    }

    wrapper.userData = {
      registryAssetId: entry.id,
      sourceUrl: entry.source?.url,
      preparedAssetSource: true,
    };

    return wrapper;
  }

  private toScale(scale?: FactoryScale): THREE.Vector3 {
    if (Array.isArray(scale)) {
      return new THREE.Vector3(scale[0], scale[1], scale[2]);
    }
    const value = scale ?? 1;
    return new THREE.Vector3(value, value, value);
  }
}
