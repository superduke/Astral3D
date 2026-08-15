<script setup lang="ts">
	import { nextTick, onMounted, provide, ref } from "vue";
	import { useRoute } from "vue-router";
	import { t } from "@/language";
	import { fetchGetOneScene } from "@/http/api/scenes";
	import { isStandaloneMode, standaloneEditorStore } from "@/http/standalone";
	import { App, Viewer, Hooks, defaultProjectInfo } from "@astral3d/engine";
	import { usePreviewOperationStore } from "@/store/modules/previewOperation";
	import EsCubeLoading from "@/components/es/EsCubeLoading.vue";
	import PreviewSceneTree from "@/views/preview/components/PreviewSceneTree.vue";
	import PreviewOperations from "@/views/preview/components/Operations.vue";
	import Drawing from "@/components/drawing/Drawing.vue";
	import { useGlobalConfigStore } from "@/store/modules/globalConfig";
	import { MenuOperation } from "@/utils/preview/menuOperation";

	const route = useRoute();
	const globalStore = useGlobalConfigStore();
	const operationStore = usePreviewOperationStore();
	const defaultInfo = defaultProjectInfo();
	const sceneInfo = ref(defaultInfo.sceneInfo);
	const drawingInfo = ref(defaultInfo.drawing);
	provide("sceneInfo", sceneInfo);
	provide("drawingInfo", drawingInfo);
	const viewportRef = ref();
	const initLoading = ref(true);

	onMounted(async () => {
		App.setConfig({
			theme: globalStore.theme.replace("Theme", ""),
			mainColor: globalStore.mainColor.hexHover,
		});

		window.viewer = new Viewer({
			container: viewportRef.value,
			edit: { enabled: false },
			grid: { enabled: false },
			request: { baseUrl: "/file/static/" },
		});

		await nextTick();
		await init();
	});

	async function init() {
		const id = route.params.id as string;
		if (!id) {
			window.$message?.error(t("prompt['Parameter error!']"));
			return;
		}

		const res = await fetchGetOneScene(id);
		if (res.error !== null) {
			window.$message?.error(t("scene.Failed to get scene data"));
			return;
		}

		App.project.setKey("sceneInfo", res.data);
		sceneInfo.value = res.data;
		initLoading.value = false;
		await nextTick();

		if (isStandaloneMode) {
			const sceneJson = await standaloneEditorStore.getSceneJson(id);
			if (sceneJson) {
				await App.fromJSON(sceneJson as ISceneJson);
				Hooks.useDispatchSignal("sceneResize");
				Hooks.useDispatchSignal("sceneLoadComplete");
				window.$message?.success(t("scene['Loading completed!']"));
				return;
			}
		}

		getScene(res.data);
	}

	function getScene(sceneInfo) {
		if (!sceneInfo.zip) {
			window.viewer.options.hdr = "/static/resource/hdr/cloudy.hdr";
			window.viewer.loadEnv(true);
			return;
		}

		window.viewer.options.hdr = "";
		let notice = window.$notification.info({
			title: window.$t("scene['Get the scene data']") + "...",
			content: window.$t("other.Loading") + "...",
			closable: false,
		});

		window.viewer.package.unpack({
			url: sceneInfo.zip,
			onSceneLoad: (sceneJson: ISceneJson) => {
				if (sceneJson.controls?.state) {
					MenuOperation.InitControlsState = sceneJson.controls.state;
				}
				Hooks.useDispatchSignal("sceneResize");
			},
			onComplete: () => {
				MenuOperation.Roaming.generateColliderEnvironment()
					.then(() => {
						const checkPlayer = () => {
							if (MenuOperation.Roaming.person !== undefined) {
								operationStore.menuList.roaming.loading = false;
							} else {
								setTimeout(checkPlayer, 200);
							}
						};
						checkPlayer();
					})
					.catch(error => window.$message?.error(`[Roaming]: ${error}`));

				window.$message?.success(t("scene['Loading completed!']"));
				Hooks.useDispatchSignal("sceneLoadComplete");
				notice.destroy();
			},
		});
	}
</script>

<template>
	<EsCubeLoading v-model:visible="initLoading" />
	<div id="preview" class="w-full h-full">
		<n-split
			direction="horizontal"
			:max="0.85"
			:min="0.15"
			:pane1-style="{ display: drawingInfo.isUploaded ? 'flex' : 'none' }"
			:resize-trigger-size="drawingInfo.isUploaded ? 3 : 0"
		>
			<template #1 v-if="drawingInfo.isUploaded"><Drawing /></template>
			<template #2>
				<div ref="viewportRef" class="relative w-full h-full"></div>
				<PreviewSceneTree />
				<PreviewOperations />
			</template>
		</n-split>
	</div>
</template>

<style scoped lang="less">
	.n-split {
		&-pane-1,
		&-pane-2 {
			display: flex;
			justify-content: center;
			align-items: center;
			position: relative;
		}
	}
</style>
