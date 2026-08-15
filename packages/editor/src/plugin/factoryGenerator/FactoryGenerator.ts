import { h, ref } from "vue";
import type { ModalReactive } from "naive-ui";
import type { Plugin } from "@astral3d/engine";
import FactoryGeneratorComponent from "@/components/es/plugin/builtin/FactoryGenerator.vue";

export default class FactoryGenerator implements Plugin {
  icon = "";
  name = "AI Factory Generator";
  version = 0.2;

  modalInstance: ModalReactive | undefined;
  componentRef = ref();

  async install() {}

  async run() {
    this.componentRef = ref();
    this.modalInstance = window.$modal.create({
      title: this.name,
      preset: "card",
      maskClosable: false,
      style: { width: "90%", maxWidth: "760px" },
      onAfterLeave: () => {
        this.componentRef.value?.handleClose?.();
        this.finish();
      },
      content: () => h(FactoryGeneratorComponent, { ref: this.componentRef }, ""),
    });
  }

  finish() {
    this.modalInstance?.destroy();
    this.componentRef = ref();
  }

  uninstall(): void {}
}
