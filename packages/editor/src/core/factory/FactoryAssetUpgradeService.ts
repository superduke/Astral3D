import * as THREE from "three";
import { App } from "@astral3d/engine";
import type {
  FactoryAssetBatch,
  FactoryAssetRegistryEntry,
  FactoryManifest,
} from "./FactoryManifest";
import { AssetPlacer } from "./AssetPlacer";
import { FactoryAssetRegistry } from "./FactoryAssetRegistry";
import { FactoryGlbBatchFactory } from "./FactoryGlbBatchFactory";
import { FactoryGlbTemplateCache } from "./FactoryGlbTemplateCache";
import { prepareFactoryObjectForAstral } from "./FactoryAstralCompat";

export interface FactoryAssetUpgradeSummary {
  requested: number;
  upgraded: number;
  skipped: number;
  failed: Array<{ batchId: string; assetId?: string; reason: string }>;
}

export class FactoryAssetUpgradeService {
  private readonly registry: FactoryAssetRegistry;
  private readonly templates = new FactoryGlbTemplateCache();
  private readonly batchFactory = new FactoryGlbBatchFactory();
  private readonly placer: AssetPlacer;

  constructor(
    private readonly manifest: FactoryManifest,
    groundOffset = 0,
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
        // Bridge editor-created Three objects before App.addObject so subtype
        // prototypes such as Mesh/InstancedMesh remain intact.
        prepareFactoryObjectForAstral(realGroup);
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
    const template = await this.templates.get(entry);
    const transforms = this.placer.createTransforms(batch);
    if (!transforms.length) {
      throw new Error(`Asset batch has no placements: ${batch.id}`);
    }
    return this.batchFactory.create(batch, entry, template, transforms);
  }
}
