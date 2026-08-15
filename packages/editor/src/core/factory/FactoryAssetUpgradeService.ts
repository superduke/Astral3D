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
import {
  restoreAssetInstanceTransforms,
  type AssetInstanceTransform,
} from "./ProceduralAssetFactory";

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
    if (assetsRoot) {
      for (const batch of this.manifest.assets ?? []) {
        const entry = this.registry.get(batch.asset);
        if (!entry?.source || entry.source.type !== "glb") {
          summary.skipped++;
          continue;
        }

        summary.requested++;
        try {
          const transforms = this.placer.createTransforms(batch);
          const realGroup = await this.createGlbBatch(batch, entry, transforms);
          const fallback = assetsRoot.getObjectByName(batch.id);
          if (!fallback?.parent) {
            throw new Error(`Procedural fallback batch not found: ${batch.id}`);
          }
          this.replaceFallback(fallback, realGroup);
          summary.upgraded++;
        } catch (error) {
          this.recordFailure(summary, batch.id, batch.asset, error);
        }
      }
    }

    await this.upgradeEmbeddedRoofAssets(root, summary);

    root.userData.assetUpgrade = {
      requested: summary.requested,
      upgraded: summary.upgraded,
      skipped: summary.skipped,
      failed: summary.failed.length,
    };

    return summary;
  }

  private async upgradeEmbeddedRoofAssets(
    root: THREE.Group,
    summary: FactoryAssetUpgradeSummary,
  ): Promise<void> {
    const candidates: THREE.Group[] = [];
    root.traverse((object) => {
      if (
        object.type === "Group" &&
        object.userData?.placement === "roof" &&
        Array.isArray(object.userData?.factoryInstanceTransforms)
      ) {
        candidates.push(object as THREE.Group);
      }
    });

    for (const fallback of candidates) {
      const template = fallback.userData?.assetType;
      if (typeof template !== "string") continue;
      const entry = this.registry.findByFallbackTemplate(template);
      if (!entry?.source || entry.source.type !== "glb") continue;

      const transforms = restoreAssetInstanceTransforms(
        fallback.userData.factoryInstanceTransforms,
      );
      if (!transforms.length) continue;

      summary.requested++;
      try {
        const batch: FactoryAssetBatch = {
          id: fallback.name,
          label:
            typeof fallback.userData?.label === "string"
              ? fallback.userData.label
              : fallback.name,
          asset: entry.id,
          template,
          userData: {
            parentAssetId: fallback.userData?.parentAssetId,
            placement: "roof",
          },
        };
        const realGroup = await this.createGlbBatch(batch, entry, transforms);
        if (!fallback.parent) {
          throw new Error(`Roof fallback has no parent: ${fallback.name}`);
        }
        this.replaceFallback(fallback, realGroup);
        summary.upgraded++;
      } catch (error) {
        this.recordFailure(summary, fallback.name, entry.id, error);
      }
    }
  }

  private async createGlbBatch(
    batch: FactoryAssetBatch,
    entry: FactoryAssetRegistryEntry,
    transforms: AssetInstanceTransform[],
  ): Promise<THREE.Group> {
    if (!transforms.length) {
      throw new Error(`Asset batch has no placements: ${batch.id}`);
    }
    const template = await this.templates.get(entry);
    return this.batchFactory.create(batch, entry, template, transforms);
  }

  private replaceFallback(
    fallback: THREE.Object3D,
    replacement: THREE.Group,
  ): void {
    if (!fallback.parent) {
      throw new Error(`Procedural fallback has no parent: ${fallback.name}`);
    }
    const parent = fallback.parent;
    const index = parent.children.indexOf(fallback);

    // Bridge editor-created Three objects before App.addObject so subtype
    // prototypes such as Mesh/InstancedMesh remain intact.
    prepareFactoryObjectForAstral(replacement);
    App.removeObject(fallback);
    App.addObject(replacement, parent, index);
  }

  private recordFailure(
    summary: FactoryAssetUpgradeSummary,
    batchId: string,
    assetId: string | undefined,
    error: unknown,
  ): void {
    const reason = error instanceof Error ? error.message : String(error);
    summary.failed.push({ batchId, assetId, reason });
    console.warn(
      `[FactoryAssetUpgradeService] Keeping fallback for ${batchId}: ${reason}`,
    );
  }
}
