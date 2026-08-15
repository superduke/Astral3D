import type {
  FactoryAssetBatch,
  FactoryAssetRegistryEntry,
  FactoryAssetTemplate,
  FactoryManifest,
} from "./FactoryManifest";

export class FactoryAssetRegistry {
  private readonly entries = new Map<string, FactoryAssetRegistryEntry>();

  constructor(manifest: FactoryManifest) {
    for (const entry of manifest.assetRegistry ?? []) {
      if (!entry.id?.trim()) continue;
      if (this.entries.has(entry.id)) {
        console.warn(`[FactoryAssetRegistry] Duplicate asset id: ${entry.id}`);
      }
      this.entries.set(entry.id, entry);
    }
  }

  get(id?: string): FactoryAssetRegistryEntry | undefined {
    return id ? this.entries.get(id) : undefined;
  }

  resolveFallbackTemplate(batch: FactoryAssetBatch): FactoryAssetTemplate {
    return (
      batch.template ??
      this.get(batch.asset)?.fallbackTemplate ??
      "placeholder"
    );
  }

  hasGlb(batch: FactoryAssetBatch): boolean {
    return this.get(batch.asset)?.source?.type === "glb";
  }

  glbEntries(): FactoryAssetRegistryEntry[] {
    return [...this.entries.values()].filter(
      (entry) => entry.source?.type === "glb",
    );
  }
}
