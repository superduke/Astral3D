<script setup lang="ts">
import { ref } from "vue";
import { App, AddObjectCommand } from "@astral3d/engine";
import type { FactoryManifest } from "@/core/factory/FactoryManifest";
import { FactorySceneBuilder } from "@/core/factory/FactorySceneBuilder";
import { FactorySceneEnhancer } from "@/core/factory/FactorySceneEnhancer";
import { DxfFactoryManifestParser } from "@/core/factory/DxfFactoryManifestParser";
import { FactoryAssetRegistry } from "@/core/factory/FactoryAssetRegistry";
import { FactoryAssetUpgradeService } from "@/core/factory/FactoryAssetUpgradeService";

const fileName = ref("");
const status = ref("请选择 Factory Manifest JSON / DXF。也可以直接加载内置示例。");
const busy = ref(false);
const dxfBuildingHeight = ref(18);
const dxfRoadWidth = ref(12);
const dxfPipeRackWidth = ref(6);
const dxfPipeRackHeight = ref(6.5);

async function generate(manifest: FactoryManifest) {
  new FactoryAssetRegistry(manifest).applyFallbackTemplates();

  const builder = new FactorySceneBuilder(manifest, {
    rootName: manifest.meta?.name ?? "FACTORY_GENERATED",
  });
  const root = builder.build();
  new FactorySceneEnhancer(manifest).apply(root);
  App.execute(new AddObjectCommand(root));

  const instanceCount = (manifest.assets ?? []).reduce((sum, batch) => {
    const explicit = batch.positions?.length ?? 0;
    const grid = batch.grid ? batch.grid.rows * batch.grid.columns : 0;
    const line = batch.line?.count ?? 0;
    return sum + explicit + grid + line;
  }, 0);

  const glbRegistryCount = (manifest.assetRegistry ?? []).filter(
    (entry) => entry.source?.type === "glb",
  ).length;

  if (glbRegistryCount) {
    status.value =
      `基础场景已生成，正在加载 ${glbRegistryCount} 个 GLB 资产定义；加载失败时将保留 procedural fallback…`;
  }

  const upgrade = await new FactoryAssetUpgradeService(manifest).upgrade(root);
  const upgradeText = upgrade.requested
    ? `GLB 升级 ${upgrade.upgraded}/${upgrade.requested}` +
      (upgrade.failed.length ? `，${upgrade.failed.length} 个加载失败已保留 fallback` : "")
    : "当前使用 procedural / registry fallback";

  status.value =
    `生成完成：${manifest.buildings?.length ?? 0} 栋建筑，` +
    `${manifest.roads?.length ?? 0} 组道路，` +
    `${manifest.pipeRacks?.length ?? 0} 组 Pipe Rack，` +
    `${manifest.assets?.length ?? 0} 个资产批次 / ${instanceCount} 个园区实例；` +
    upgradeText + "。";
}

async function manifestFromFile(file: File): Promise<FactoryManifest> {
  const source = await file.text();
  if (file.name.toLowerCase().endsWith(".dxf")) {
    const parser = new DxfFactoryManifestParser({
      name: file.name.replace(/\.dxf$/i, ""),
      defaultBuildingHeight: dxfBuildingHeight.value,
      defaultRoadWidth: dxfRoadWidth.value,
      defaultPipeRackWidth: dxfPipeRackWidth.value,
      defaultPipeRackHeight: dxfPipeRackHeight.value,
    });
    return parser.parse(source);
  }

  return JSON.parse(source) as FactoryManifest;
}

async function handleInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  fileName.value = file.name;
  busy.value = true;
  status.value = file.name.toLowerCase().endsWith(".dxf")
    ? "正在解析 DXF 图层并生成园区场景…"
    : "正在生成园区场景…";

  try {
    const manifest = await manifestFromFile(file);
    await generate(manifest);
  } catch (error) {
    console.error(error);
    status.value = "生成失败：" + (error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
    input.value = "";
  }
}

async function loadDemo() {
  busy.value = true;
  status.value = "正在读取内置半导体园区示例…";
  try {
    const response = await fetch("/static/factory/smic-beijing-concept.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = (await response.json()) as FactoryManifest;
    fileName.value = "smic-beijing-concept.json";
    await generate(manifest);
  } catch (error) {
    console.error(error);
    status.value = "加载示例失败：" + (error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

function handleClose() {}
defineExpose({ handleClose });
</script>

<template>
  <div class="factory-generator">
    <div class="intro">
      <h3>DXF / Factory Manifest → Astral3D Scene</h3>
      <p>
        从 CAD 总平图或结构化 Manifest 生成可编辑的半导体园区场景。支持 L2.5 工业生成、Pipe Rack、重复资产和 Asset Registry → GLB 自动升级。
      </p>
    </div>

    <div class="actions">
      <button :disabled="busy" @click="loadDemo">加载内置北京厂区示例</button>
      <label class="file-box">
        <span>选择 Manifest JSON / DXF</span>
        <input type="file" accept=".json,.dxf,application/json" :disabled="busy" @change="handleInput" />
      </label>
    </div>

    <div class="dxf-options">
      <label>建筑高度<input v-model.number="dxfBuildingHeight" type="number" min="1" step="1" /><span>m</span></label>
      <label>道路宽度<input v-model.number="dxfRoadWidth" type="number" min="1" step="1" /><span>m</span></label>
      <label>管廊宽度<input v-model.number="dxfPipeRackWidth" type="number" min="1" step="0.5" /><span>m</span></label>
      <label>管廊高度<input v-model.number="dxfPipeRackHeight" type="number" min="1" step="0.5" /><span>m</span></label>
    </div>

    <div v-if="fileName" class="file-name">{{ fileName }}</div>
    <div class="status">{{ status }}</div>

    <div class="tips">
      <strong>DXF 图层约定：</strong>
      SITE_BOUNDARY / BUILDING_FOOTPRINT / ROAD_CENTERLINE / PIPE_RACK_CENTERLINE / PARKING / GREEN。
      <br />
      <strong>资产策略：</strong>
      ASSETS 先同步生成 procedural fallback；Manifest 的 assetRegistry 若为资产配置 GLB URL，则场景加入后异步原位升级。GLB 加载失败不会阻断园区生成。
      <br />
      <strong>生成能力：</strong>
      FAB 立面分板、Utility 百叶、Warehouse/Support 装卸口与雨棚、屋顶 HVAC/排气筒/scrubber、Pipe Rack、道路/停车标线、围栏、门区及批量园区资产。
    </div>
  </div>
</template>

<style scoped>
.factory-generator { padding: 18px; }
.intro h3 { margin: 0 0 8px; font-size: 18px; }
.intro p { opacity: 0.76; line-height: 1.6; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
.actions button, .file-box { min-height: 72px; border: 1px dashed rgba(128,128,128,.55); border-radius: 8px; background: rgba(128,128,128,.06); cursor: pointer; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; box-sizing: border-box; }
.actions button { font: inherit; }
.file-box input { display: none; }
.dxf-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; margin-top: 14px; font-size: 13px; }
.dxf-options label { display: grid; grid-template-columns: 1fr 76px 20px; gap: 6px; align-items: center; }
.dxf-options input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid rgba(128,128,128,.35); border-radius: 5px; background: transparent; color: inherit; }
.file-name, .status, .tips { margin-top: 14px; }
.status { font-weight: 600; }
.tips { padding: 12px; border-radius: 6px; background: rgba(128,128,128,.08); line-height: 1.6; }
</style>
