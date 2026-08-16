<template>
  <div class="absolute top-0 left-0 w-full h-0 z-10 flex justify-between pt-1">
    <div class="pl-2">
      <ViewportCamera/>

      <ViewportShading/>
    </div>

    <div class="pr-2">
      <n-button-group size="small">
        <n-button :type="transform === 'translate' ? 'success' : 'default'"
                  title="移动对象 / 平移视图"
                  @click.stop="handlerRadioChange('translate')" round>
          <template #icon>
            <n-icon :size="16">
              <Move/>
            </n-icon>
          </template>
        </n-button>
        <n-button :type="transform === 'rotate' ? 'success' : 'default'"
                  title="旋转对象 / 旋转视图"
                  @click.stop="handlerRadioChange('rotate')">
          <template #icon>
            <n-icon :size="16">
              <Renew/>
            </n-icon>
          </template>
        </n-button>
        <n-button :type="transform === 'scale' ? 'success' : 'default'"
                  title="缩放对象"
                  @click.stop="handlerRadioChange('scale')" round>
          <template #icon>
            <n-icon :size="16">
              <Minimize/>
            </n-icon>
          </template>
        </n-button>
      </n-button-group>

      <n-tooltip placement="bottom" trigger="hover">
        <template #trigger>
          <n-button circle size="small" class="ml-10px" @click.stop="handlerLocalChange">
            <template #icon>
              <n-icon>
                <Chart3D v-if="localValue"/>
                <Wikis v-else/>
              </n-icon>
            </template>
          </n-button>
        </template>
        <span> {{ localValue ? t("layout.scene.toolbar.local") : t("layout.scene.toolbar.world") }} </span>
      </n-tooltip>

      <n-popover :show-arrow="false" placement="bottom-end" :style="{ padding: 0 }">
        <template #trigger>
          <n-button circle size="small" class="ml-10px">
            <template #icon>
              <n-icon>
                <Tools />
              </n-icon>
            </template>
          </n-button>
        </template>

        <n-space item-style="display: flex;" vertical>
          <n-checkbox class="px-2 py-1" size="small"
              v-for="tool in toolOptions" :key="tool.key"
              v-model:checked="tool.checked" :label="tool.label"
              @update:checked="(checked:boolean) => handleToolCheckedChange(tool,checked)"
          />
        </n-space>
      </n-popover>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {onMounted,onBeforeUnmount,ref} from "vue";
import {Move, Renew, Minimize, Wikis, Chart3D,Tools} from '@vicons/carbon';
import {Hooks,Utils} from '@astral3d/engine';
import {t} from "@/language";
import ViewportCamera from './ViewportCamera.vue';
import ViewportShading from './ViewportShading.vue';

const transform = ref("translate");

/**
 * Keep background drag semantics aligned with the first two transform buttons.
 * Dragging a TransformControls gizmo still edits the selected object; dragging
 * empty viewport space pans in translate mode and orbits in rotate/scale mode.
 * Resolve ACTION from the live controls constructor so we do not import a
 * second camera-controls runtime into the editor bundle.
 */
function syncViewportNavigation(value: string) {
  const controls = window.viewer?.modules?.controls;
  if(!controls) return;

  const actions = (controls.constructor as any)?.ACTION;
  if(!actions) return;

  controls.mouseButtons.left = value === 'translate'
    ? actions.TRUCK
    : actions.ROTATE;
}

function handlerRadioChange(value: string) {
  syncViewportNavigation(value);
  if(value === transform.value) return;

  transform.value = value;
  Hooks.useDispatchSignal("transformModeChanged", value);
}

const localValue = ref(false);
function handlerLocalChange() {
  localValue.value = !localValue.value;
  Hooks.useDispatchSignal("spaceChanged", localValue.value ? 'local' : 'world');
}

interface ITool{
  label:string,
  key:string,
  checked:boolean
}
const toolOptions = ref<ITool[]>([
  {
    label: t("layout.scene.toolbar.Status monitoring"),
    key: 'stats',
    checked:false
  },
]);

let stats;
function handleToolCheckedChange(tool:ITool,checked:boolean){
  switch (tool.key) {
    case 'stats':
      if(!stats){
        stats = new Utils.Stats(window.viewer);
        stats.domElement.style.position = 'absolute';
        stats.domElement.style.top = 'unset';
        stats.domElement.style.bottom = '40px';
        stats.domElement.style.left = '10px';
        window.viewer.container.appendChild(stats.domElement);
      }

      if(stats.visible === checked) break;

      stats.visible = checked;
      break;
  }
}

onMounted(() => {
  Hooks.useAddSignal("transformModeChanged",handlerRadioChange);
  syncViewportNavigation(transform.value);
})
onBeforeUnmount(() => {
  Hooks.useRemoveSignal("transformModeChanged",handlerRadioChange);
})
</script>

<style lang="less" scoped>
.n-button-group {
  .n-button {
    width: 32px;
  }
}
</style>