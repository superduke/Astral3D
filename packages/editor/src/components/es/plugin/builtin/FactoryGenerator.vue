<script setup lang="ts">
import { ref } from "vue";
import { App, AddObjectCommand, Hooks } from "@astral3d/engine";
import type { FactoryManifest } from "@/core/factory/FactoryManifest";
import { FactorySceneBuilder } from "@/core/factory/FactorySceneBuilder";
import { FactorySceneEnhancer } from "@/core/factory/FactorySceneEnhancer";
import { DxfFactoryManifestParser } from "@/core/factory/DxfFactoryManifestParser";
import { FactoryAssetRegistry } from "@/core/factory/FactoryAssetRegistry";
import { FactoryAssetUpgradeService } from "@/core/factory/FactoryAssetUpgradeService";
import { FactorySemanticRuntime } from "@/core/factory/FactorySemanticRuntime";
import { FactoryAlarmRuntime } from "@/core/factory/FactoryAlarmRuntime";
import { assertFactoryThreeSubtypes, prepareFactoryObjectForAstral } from "@/core/factory/FactoryAstralCompat";

const fileName = ref("");
const status = ref("请选择 Factory Manifest JSON / DXF。也可以直接加载内置示例。");
const busy = ref(false);
const dxfBuildingHeight = ref(18);
const dxfRoadWidth = ref(12);
const dxfPipeRackWidth = ref(6);
const dxfPipeRackHeight = ref(6.5);
const assetIdQuery = ref("FAB_A");
const semanticStatus = ref("生成场景后，可输入 assetId 聚焦，或直接点击园区对象查看语义。");
let semanticRuntime: FactorySemanticRuntime | null = null;
let alarmRuntime: FactoryAlarmRuntime | null = null;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runStage<T>(stage: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    console.error(`[FactoryGenerator:${stage}]`, error);
    throw new Error(`[${stage}] ${errorText(error)}`);
  }
}

async function runAsyncStage<T>(stage: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    console.error(`[FactoryGenerator:${stage}]`, error);
    throw new Error(`[${stage}] ${errorText(error)}`);
  }
}

function handleIntersectionsDetected(intersections: any[]) {
  if (!semanticRuntime || !intersections?.length) return;
  const hit = semanticRuntime.resolveIntersection(intersections[0]);
  if (!hit.assetId && !hit.assetType) return;
  if (hit.assetId) assetIdQuery.value = hit.assetId;
  semanticStatus.value = `点击语义：assetId=${hit.assetId ?? "-"} / assetType=${hit.assetType ?? "-"}` + (Number.isInteger(hit.instanceId) ? ` / instanceId=${hit.instanceId}` : "");
}

Hooks.useAddSignal("intersectionsDetected", handleIntersectionsDetected);

async function generate(manifest: FactoryManifest) {
  runStage("Asset Registry", () => new FactoryAssetRegistry(manifest).applyFallbackTemplates());

  const builder = new FactorySceneBuilder(manifest, { rootName: manifest.meta?.name ?? "FACTORY_GENERATED" });
  const root = runStage("Scene Builder", () => builder.build());
  runStage("L2.5 Enhancer", () => new FactorySceneEnhancer(manifest).apply(root));

  runStage("Astral3D Three Compatibility", () => {
    prepareFactoryObjectForAstral(root);
    assertFactoryThreeSubtypes(root);
  });

  runStage("Add To Astral3D Scene", () => App.execute(new AddObjectCommand(root)));

  alarmRuntime?.dispose();
  runStage("Semantic / EHS Runtime", () => {
    semanticRuntime = new FactorySemanticRuntime(root);
    alarmRuntime = new FactoryAlarmRuntime(root, semanticRuntime);
  });

  const instanceCount = (manifest.assets ?? []).reduce((sum, batch) => {
    const explicit = batch.positions?.length ?? 0;
    const grid = batch.grid ? batch.grid.rows * batch.grid.columns : 0;
    const line = batch.line?.count ?? 0;
    return sum + explicit + grid + line;
  }, 0);

  const glbRegistryCount = (manifest.assetRegistry ?? []).filter((entry) => entry.source?.type === "glb").length;
  if (glbRegistryCount) status.value = `基础场景已生成，正在加载 ${glbRegistryCount} 个 GLB 资产定义；加载失败时将保留 procedural fallback…`;

  const upgrade = await runAsyncStage("GLB Upgrade", () => new FactoryAssetUpgradeService(manifest).upgrade(root));
  const upgradeText = upgrade.requested
    ? `GLB 升级 ${upgrade.upgraded}/${upgrade.requested}` + (upgrade.failed.length ? `，${upgrade.failed.length} 个加载失败已保留 fallback` : "")
    : "当前使用 procedural / registry fallback";

  status.value = `生成完成：${manifest.buildings?.length ?? 0} 栋建筑，${manifest.roads?.length ?? 0} 组道路，${manifest.pipeRacks?.length ?? 0} 组 Pipe Rack，${manifest.assets?.length ?? 0} 个资产批次 / ${instanceCount} 个园区实例；${upgradeText}。`;
  semanticStatus.value = "语义与 EHS 运行时已就绪。可输入 FAB_A 等 assetId 聚焦、点击模型或模拟报警。";
}

function focusAsset() {
  const assetId = assetIdQuery.value.trim();
  if (!assetId || !semanticRuntime) { semanticStatus.value = "请先生成园区场景并输入 assetId。"; return; }
  const object = semanticRuntime.focusAsset(assetId, true);
  semanticStatus.value = object ? `已聚焦：${assetId} (${object.name || object.type})` : `未找到 assetId：${assetId}`;
}

function selectAsset() {
  const assetId = assetIdQuery.value.trim();
  if (!assetId || !semanticRuntime) { semanticStatus.value = "请先生成园区场景并输入 assetId。"; return; }
  const object = semanticRuntime.selectAsset(assetId);
  semanticStatus.value = object ? `已选中：${assetId} (${object.name || object.type})` : `未找到 assetId：${assetId}`;
}

function simulateAlarm() {
  const assetId = assetIdQuery.value.trim();
  if (!assetId || !alarmRuntime) { semanticStatus.value = "请先生成园区场景并输入 assetId。"; return; }
  const ok = alarmRuntime.raise(assetId, { severity: "critical", message: "Factory Generator demo EHS alarm", focus: true });
  semanticStatus.value = ok ? `已触发 EHS 模拟报警：${assetId}` : `无法触发报警，未找到 assetId：${assetId}`;
}

function clearAlarm() {
  const assetId = assetIdQuery.value.trim();
  if (!assetId || !alarmRuntime) return;
  alarmRuntime.clear(assetId);
  semanticStatus.value = `已解除 EHS 模拟报警：${assetId}`;
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
    return runStage("DXF Parse", () => parser.parse(source));
  }
  return runStage("Manifest JSON Parse", () => JSON.parse(source) as FactoryManifest);
}

async function handleInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  fileName.value = file.name;
  busy.value = true;
  status.value = file.name.toLowerCase().endsWith(".dxf") ? "正在解析 DXF 图层并生成园区场景…" : "正在生成园区场景…";
  try {
    const manifest = await manifestFromFile(file);
    await generate(manifest);
  } catch (error) {
    console.error(error);
    status.value = "生成失败：" + errorText(error);
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
    status.value = "加载示例失败：" + errorText(error);
  } finally {
    busy.value = false;
  }
}

function handleClose() {
  Hooks.useRemoveSignal("intersectionsDetected", handleIntersectionsDetected);
  alarmRuntime?.dispose();
  alarmRuntime = null;
  semanticRuntime = null;
}
defineExpose({ handleClose });
</script>

<template>
  <div class="factory-generator">
    <div class="intro"><h3>DXF / Factory Manifest → Astral3D Scene</h3><p>从 CAD 总平图或结构化 Manifest 生成可编辑的半导体园区场景。支持 L2.5 工业生成、GLB 自动升级、assetId 语义导航和 EHS 报警运行时。</p></div>
    <div class="actions"><button :disabled="busy" @click="loadDemo">加载内置北京厂区示例</button><label class="file-box"><span>选择 Manifest JSON / DXF</span><input type="file" accept=".json,.dxf,application/json" :disabled="busy" @change="handleInput" /></label></div>
    <div class="dxf-options">
      <label>建筑高度<input v-model.number="dxfBuildingHeight" type="number" min="1" step="1" /><span>m</span></label>
      <label>道路宽度<input v-model.number="dxfRoadWidth" type="number" min="1" step="1" /><span>m</span></label>
      <label>管廊宽度<input v-model.number="dxfPipeRackWidth" type="number" min="1" step="0.5" /><span>m</span></label>
      <label>管廊高度<input v-model.number="dxfPipeRackHeight" type="number" min="1" step="0.5" /><span>m</span></label>
    </div>
    <div v-if="fileName" class="file-name">{{ fileName }}</div><div class="status">{{ status }}</div>
    <div class="semantic-box"><strong>数字孪生语义 / EHS 测试</strong><div class="semantic-controls"><input v-model="assetIdQuery" placeholder="assetId，例如 FAB_A" @keyup.enter="focusAsset" /><button @click="selectAsset">选中</button><button @click="focusAsset">FlyTo</button></div><div class="alarm-controls"><button class="alarm-button" @click="simulateAlarm">模拟报警</button><button @click="clearAlarm">解除报警</button></div><div class="semantic-status">{{ semanticStatus }}</div></div>
    <div class="tips"><strong>DXF 图层约定：</strong> SITE_BOUNDARY / BUILDING_FOOTPRINT / ROAD_CENTERLINE / PIPE_RACK_CENTERLINE / PARKING / GREEN。<br /><strong>资产策略：</strong> ASSETS 先同步生成 procedural fallback；assetRegistry 配置 GLB URL 后异步原位升级，加载失败不会阻断场景。<br /><strong>EHS 运行时：</strong> FactoryTwinStateStore 以 assetId 保存报警/状态/遥测；FactoryAlarmRuntime 将 alarm 状态映射为 FlyTo + 3D 报警标记。后续 WebSocket 只需向状态 Store 喂数据。</div>
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
.dxf-options input, .semantic-controls input { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid rgba(128,128,128,.35); border-radius: 5px; background: transparent; color: inherit; }
.file-name, .status, .tips, .semantic-box { margin-top: 14px; }
.status { font-weight: 600; }
.semantic-box { padding: 12px; border: 1px solid rgba(128,128,128,.2); border-radius: 7px; }
.semantic-controls { display: grid; grid-template-columns: 1fr 70px 70px; gap: 8px; margin-top: 9px; }
.alarm-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.semantic-controls button, .alarm-controls button { min-height: 32px; border: 1px solid rgba(128,128,128,.35); border-radius: 5px; background: rgba(128,128,128,.08); color: inherit; cursor: pointer; }
.alarm-controls .alarm-button { border-color: rgba(220,60,60,.55); background: rgba(220,60,60,.12); }
.semantic-status { margin-top: 8px; font-size: 12px; opacity: .78; line-height: 1.5; }
.tips { padding: 12px; border-radius: 6px; background: rgba(128,128,128,.08); line-height: 1.6; }
</style>