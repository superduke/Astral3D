<template>
    <n-modal :show="show" @update:show="(b) => emits('update:show', b)" class="!w-500px" preset="card"
        :title="t('cad[\'CAD upload and parse\']')">
        <n-alert v-if="isStandaloneMode" type="info" :bordered="false" class="mb-15px">
            Standalone 模式不启用服务端 CAD 资源库。工厂总平 DXF 请使用 AI Factory Generator 的“导入 DXF”；DWG 转 DXF 需要启动 astral-service。
        </n-alert>

        <n-form label-placement="left" :model="CADModel" :rules="CADRules" label-width="100px" label-align="right"
            ref="formRef" require-mark-placement="right-hanging">
            <n-form-item :label="t('cad[\'CAD file\']')" path="cadFile">
                <n-upload ref="uploadCADRef" :default-upload="false" directory-dnd :max="1"
                    :accept="'.' + DRAWING_SUPPORT_TYPE.join(',.')" @change="cadChange">
                    <n-upload-dragger>
                        <div>
                            <n-icon size="48" :depth="3">
                                <ArchiveOutline />
                            </n-icon>
                        </div>
                        <n-text style="font-size: 14px">
                            {{
                                t("bim['Click or drag the file to this area.Supported formats are:']") + ` ${DRAWING_SUPPORT_TYPE.join("、")}`
                            }}
                        </n-text>
                    </n-upload-dragger>
                </n-upload>
            </n-form-item>
        </n-form>

        <div class="flex justify-end">
            <n-button round type="primary" :disabled="isStandaloneMode" @click="submit">{{ t("cad['Upload and parse']") }}</n-button>
        </div>
    </n-modal>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { NotificationReactive } from "naive-ui";
import { t } from "@/language";
import { ArchiveOutline } from "@vicons/ionicons5";
import { DRAWING_SUPPORT_TYPE, NEED_CONVERT_DRAWING } from "@/utils/common/constant";
import { fetchAddDwg2dxf } from "@/http/api/cad";
import { isStandaloneMode } from "@/http/standalone";

withDefaults(defineProps<{
    show: boolean
}>(), {
    show: false
})

const emits = defineEmits(["update:show", "refreshList"]);

const formRef = ref();
const uploadCADRef = ref();

/* bim文件上传转换 */
const CADModel = reactive<{
    fileName: string,
    cadFile: File | null,

}>({
    fileName: "",
    cadFile: null,
})
const CADRules = {
    cadFile: {
        required: true,
        trigger: 'change',
        validator: (_, value) => {
            return new Promise<void>((resolve, reject) => {
                // 判断value是否是File类型
                if (value === '' || !(value instanceof File)) {
                    reject(Error(t("drawing['Please upload the drawing file']")))
                } else {
                    resolve()
                }
            })
        }
    }
}

// cad文件选择变化
function cadChange({ file }) {
    if (file.status === "removed") {
        CADModel.cadFile = null;
        formRef.value?.validate();
        return;
    }

    if (!DRAWING_SUPPORT_TYPE.includes(file.name.split(".").at(-1).toLowerCase())) {
        window.$message?.error(t("drawing['This format is not supported, please upload again! Supported formats are:']") + ` ${DRAWING_SUPPORT_TYPE.join("、")}`);
        uploadCADRef.value.clear();
        return false
    }

    CADModel.cadFile = file.file as File;
    CADModel.fileName = CADModel.cadFile.name;
    formRef.value?.validate();
}

// ws 监听使用的notice
let notice: null | NotificationReactive = null;
const getNotice = () => notice;
// 提交
function submit(e) {
    e.preventDefault();

    if (isStandaloneMode) {
        window.$message?.info("Standalone 模式请在 AI Factory Generator 中直接导入 DXF；DWG 转换需要 astral-service。");
        return;
    }

    formRef.value?.validate(async (errors) => {
        if (!errors) {
            emits("update:show", false);

            notice = window.$notification.info({
                title: t("cad['CAD parse']"),
                content: t("prompt.Uploading") + "...",
                closable: false,
            })

            // 1. 上传cad文件并解析
            if (NEED_CONVERT_DRAWING.includes((CADModel.fileName.split(".").at(-1) || "not include").toLowerCase())) {
                notice.content = t("cad['CAD parse is in progress']") + "...";
            }
            fetchAddDwg2dxf({
                file: CADModel.cadFile,
                fileName: CADModel.fileName,
                conversionStatus: 0,
            }).then((res) => {
                if (res.data === null || res.data.conversionStatus === 2) {
                    fail();
                    return;
                }

                if (res.data.conversionStatus === 1 && notice) {
                    notice.content = t("cad['CAD parse completed']");
                    setTimeout(() => {
                        notice?.destroy();
                    }, 1000)
                }

                emits("refreshList");
            }).catch(() => {
                fail();
            })

            const fail = () => {
                window.$message?.error(t("cad['Failed to upload CAD file']"));
                if (notice) {
                    notice.content = `${t("cad['Failed to upload CAD file']")},${t("prompt['Please try again later!']")}`;
                    setTimeout(() => {
                        notice?.destroy();
                    }, 1000)
                }
            }

            // reset
            CADModel.fileName = "";
            CADModel.cadFile = null;
        }
    })
}

defineExpose({ getNotice })
</script>

<style scoped lang="less">
.n-form-item {
    margin-bottom: 10px;
}
</style>