<script setup lang="ts">
import { ref } from "vue";
import { App, AddObjectCommand } from "@astral3d/engine";
import type { FactoryManifest } from "@/core/factory/FactoryManifest";
import { FactorySceneBuilder } from "@/core/factory/FactorySceneBuilder";

const fileName = ref("");
const status = ref("请选择 Factory Manifest JSON。也可以直接加载内置示例。");
const busy = ref(false);

async function generate(manifest: FactoryManifest) {
  const builder = new FactorySceneBuilder(manifest, {
    rootName: manifest.meta?.name ?? "FACTORY_GENERATED",
  });
  const root = builder.build();
  App.execute(new AddObjectCommand(root));

  const instanceCount = (manifest.assets ?? []).reduce((sum, batch) => {
    const explicit = batch.positions?.length ?? 0;
    const grid = batch.grid ? batch.grid.rows * batch.grid.columns : 0;
    const line = batch.line?.count ?? 0;
    return sum + explicit + grid + line;
  }, 0);

  status.value =
    `生成完成：${manifest.buildings?.length ?? 0} 栋建筑，` +
    `${manifest.roads?.length ?? 0} 组道路，` +
    `${manifest.assets?.length ?? 0} 个资产批次 / ${instanceCount} 个园区实例。`;
}

async function handleInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  fileName.value = file.name;
  busy.value = true;
  status.value = "正在生成园区场景…";
  try {
    const manifest = JSON.parse(await file.text()) as FactoryManifest;
    await generate(manifest);
  } catch (error) {
    console.error(error);
    status.value = "生成失败：" + (error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
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
      <h3>Factory Manifest → Astral3D Scene</h3>
      <p>
        从结构化总平数据生成可编辑的半导体园区场景。当前版本支持 CAD/DXF 风格多边形建筑轮廓和 InstancedMesh 重复资产。
      </p>
    </div>

    <div class="actions">
      <button :disabled="busy" @click="loadDemo">加载内置北京厂区示例</button>
      <label class="file-box">
        <span>选择 Manifest JSON</span>
        <input type="file" accept=".json,application/json" :disabled="busy" @change="handleInput" />
      </label>
    </div>

    <div v-if="fileName" class="file-name">{{ fileName }}</div>
    <div class="status">{{ status }}</div>

    <div class="tips">
      <strong>当前生成能力：</strong>
      SITE / BUILDINGS / ROADS / PARKING / GREEN / ASSETS；建筑支持 rectangle 与 polygon footprint；
      FAB/Utility 屋顶可实例化生成 HVAC、排气筒和 scrubber；园区支持 cooling tower、transformer、street light、tree 批量实例。
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
.file-name, .status, .tips { margin-top: 14px; }
.status { font-weight: 600; }
.tips { padding: 12px; border-radius: 6px; background: rgba(128,128,128,.08); line-height: 1.6; }
</style>
