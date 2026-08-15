<script lang="ts" setup>
	import { nextTick } from "vue";
	import { Save } from "@vicons/carbon";
	import { t } from "@/language";
	import { App } from "@astral3d/engine";
	import { useGlobalConfigStore } from "@/store/modules/globalConfig";
	import { fetchUpload } from "@/http/api/sys";
	import { filterSize } from "@/utils/common/file";
	import { fetchUpdateScene } from "@/http/api/scenes";
	import { isStandaloneMode, standaloneEditorStore } from "@/http/standalone";
	import { Service } from "~/network";
	import { DefaultScreenshot } from "@/utils/common/constant";

	const globalConfigStore = useGlobalConfigStore();

	async function saveStandalone(sceneInfo: ISceneFetchData) {
		globalConfigStore.loadingText = window.$t("scene['Generate scene data, please wait']");
		globalConfigStore.loading = true;

		try {
			App.project.setKey("sceneInfo.sceneVersion", sceneInfo.sceneVersion + 1);
			const currentSceneInfo = App.project.getKey("sceneInfo") as ISceneFetchData;

			if (!currentSceneInfo.coverPicture || currentSceneInfo.coverPicture === DefaultScreenshot) {
				const image = (await window.viewer.getViewportImage()) as HTMLImageElement;
				currentSceneInfo.coverPicture = image.src;
				App.project.setKey("sceneInfo.coverPicture", image.src);
			}

			globalConfigStore.loadingText = window.$t("scene['Scene is being compressed...']");
			const sceneJson = App.toJSON() as unknown as ISceneJson;
			const updated = await standaloneEditorStore.saveScene(
				currentSceneInfo.id,
				currentSceneInfo,
				sceneJson,
			);

			App.project.setKey("sceneInfo", updated);
			globalConfigStore.loadingText = window.$t("prompt.Saved successfully!");
			window.$message?.success(window.$t("prompt.Saved successfully!"));
		} catch (error) {
			console.error("[Standalone] Failed to save scene", error);
			window.$message?.error(window.$t("scene['Failed to save project!']"));
		} finally {
			setTimeout(() => {
				globalConfigStore.loading = false;
			}, 300);
		}
	}

	function save() {
		const sceneInfo = App.project.getKey("sceneInfo");

		// 检查对应sceneId的工程是否存在
		if (!sceneInfo.id) {
			window.$message?.error(window.$t("scene['The project does not exist!']"));
			return;
		}

		window.$dialog.warning({
			title: window.$t("other.warning"),
			content: window.$t("prompt['Are you sure to update the scene?']"),
			positiveText: window.$t("other.Ok"),
			negativeText: window.$t("other.Cancel"),
			onPositiveClick: async () => {
				if (isStandaloneMode) {
					await saveStandalone(sceneInfo as ISceneFetchData);
					return;
				}

				globalConfigStore.loadingText = window.$t("scene['Generate scene data, please wait']");
				globalConfigStore.loading = true;

				// 版本自动 +1
				App.project.setKey("sceneInfo.sceneVersion", sceneInfo.sceneVersion + 1);

				const biz = `${sceneInfo.id}-V${sceneInfo.sceneVersion}`;

				// 如果没有封面，则先自动生成封面
				if (!sceneInfo.coverPicture || sceneInfo.coverPicture === DefaultScreenshot) {
					const image = (await window.viewer.getViewportImage()) as HTMLImageElement;
					sceneInfo.coverPicture = image.src;
					App.project.setKey(`sceneInfo.coverPicture`, image.src);
				}

				// 上传封面
				const f = await fetch(sceneInfo.coverPicture.startsWith("blob") ? sceneInfo.coverPicture : `file/static/${sceneInfo.coverPicture}`);
				const blob = await f.blob();
				const res = await fetchUpload({
					file: new File([blob], `${sceneInfo.sceneName}-${Date.now()}.png`, { type: blob.type }),
					biz: `upload/3DEditor/screenshot/${biz}`,
				});
				if (res.error === null) {
					App.project.setKey("sceneInfo.coverPicture", res.data);
				} else {
					window.$message?.error(window.$t("prompt['Failed to save the cover image']"));
				}

				await nextTick();

				globalConfigStore.loadingText = window.$t("scene['Scene is being compressed...']");

				window.viewer.package.pack({
					name: `${sceneInfo.sceneName}`,
					layer: 2,
					zipUploadFun: async (zipFile: File) => {
						const res = await fetchUpload({
							file: zipFile,
							biz: `upload/3DEditor/scene/${biz}`,
						});
						if (res.error !== null) {
							window.$message?.error(window.$t("scene['Failed to save project!']"));
							return "";
						}
						return res.data;
					},
					onProgress: (progress: number) => {
						globalConfigStore.loadingText = progress + "%";
					},
					onComplete: (data: { firstUploadResult: any; totalSize: number; totalZipNumber: number }) => {
						const params = Object.assign(sceneInfo, {
							zip: data.firstUploadResult,
							zipSize: filterSize(data.totalSize),
						});
						fetchUpdateScene(sceneInfo.id, params).then((res: Service.SuccessResult<ISceneFetchData>) => {
							globalConfigStore.loadingText = window.$t("prompt.Saved successfully!");

							if (res.data) {
								App.project.setKey("sceneInfo", res.data);
							}

							setTimeout(() => {
								globalConfigStore.loading = false;
							}, 500);
						});
					},
				});
			},
		});
	}
</script>

<template>
	<n-button type="primary" @click="save">
		<template #icon>
			<n-icon>
				<Save />
			</n-icon>
		</template>
		{{ t("layout.header.Save") }}
	</n-button>
</template>

<style lang="less" scoped></style>
