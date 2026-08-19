<script lang="ts" setup>
	import { ref, onMounted, nextTick, provide } from "vue";
	import { Hooks, App, defaultProjectInfo } from "@astral3d/engine";
	import * as Layout from "./layouts";
	import { connectWebSocket } from "@/hooks/useWebSocket";
	import { useRoute } from "vue-router";
	import { fetchGetOneScene } from "@/http/api/scenes";
	import { isStandaloneMode, standaloneEditorStore } from "@/http/standalone";
	import { t } from "@/language";
	import { initializeConfig } from "@/utils/storage/config";
	import EsCubeLoading from "@/components/es/EsCubeLoading.vue";
	import EsPlugin from "@/components/es/EsPlugin.vue";
	import ObjectScript from "@/components/code/Script.vue";

	initializeConfig(App.storage);

	const initLoading = ref(true);
	const siderWidth = ref(300);

	const defaultInfo = defaultProjectInfo();
	const sceneInfo = ref(defaultInfo.sceneInfo);
	const drawingInfo = ref(defaultInfo.drawing);
	provide("sceneInfo", sceneInfo);
	provide("drawingInfo", drawingInfo);

	onMounted(() => {
		// Standalone 模式不依赖 astral-service WebSocket。
		if (!isStandaloneMode) {
			connectWebSocket(import.meta.env.VITE_GLOB_SOCKET_URL);
		}

		init();
	});

	async function init() {
		const id = useRoute().params.id as string;
		if (id) {
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
					Hooks.useDispatchSignal("sceneLoadComplete");
					return;
				}
			}

			getScene(res.data);
		} else {
			window.$message?.error(t("prompt['Parameter error!']"));
		}
	}

	//拉取场景
	function getScene(sceneInfo) {
		// 如果创建的是空场景则无场景包
		if (!sceneInfo.zip) {
			window.viewer.options.hdr = "/static/resource/hdr/cloudy.hdr";
			window.viewer.loadEnv(true);

			return;
		}

		window.viewer.options.hdr = "";

		let notice = window.$notification.info({
			title: t("scene['Get the scene data']") + "...",
			content: t("other.Loading") + "...",
			closable: false,
		});

		window.viewer.package.unpack({
			url: sceneInfo.zip,
			onSceneLoad: () => {
				drawingInfo.value = App.project.getKey("drawing");
			},
			onComplete: () => {
				window.$message?.success(t("scene['Loading completed!']"));

				Hooks.useDispatchSignal("sceneLoadComplete");

				notice.destroy();
			},
		});
		return;
	}
</script>

<template>
	<EsCubeLoading v-model:visible="initLoading" />

	<div id="layout" v-if="!initLoading">
		<n-layout position="absolute">
			<n-layout-header bordered>
				<Layout.Header />
			</n-layout-header>

			<n-layout class="n-layout-center-layout" has-sider sider-placement="right" position="absolute">
				<n-layout-sider
					collapse-mode="width"
					:collapsed-width="0"
					:width="siderWidth"
					:native-scrollbar="false"
					show-trigger="bar"
					trigger-style="right:0;left:auto;transform: translateX(28px);"
					collapsed-trigger-style="left:0;right:auto;transform: rotate(0deg);"
				>
					<Layout.Assets />
				</n-layout-sider>

				<n-layout-content>
					<Layout.Scene />
				</n-layout-content>

				<n-layout-sider collapse-mode="transform" :collapsed-width="0" :width="siderWidth" :native-scrollbar="false" show-trigger="bar" bordered>
					<Layout.Sidebar />
				</n-layout-sider>
			</n-layout>
		</n-layout>

		<EsPlugin />

		<ObjectScript />
	</div>
</template>

<style lang="less" scoped>
	#layout {
		width: 100%;
		height: 100%;
		position: relative;

		.n-layout {
			&-header {
				height: var(--header-height);
				line-height: var(--header-height);
				padding: 0 0.5rem;
				display: flex;
				justify-content: space-between;
				align-items: center;
			}

			&-sider {
				z-index: 15;
				height: 100%;
			}

			&-center-layout {
				top: var(--header-height);
				bottom: var(--footer-height);
				width: 100%;
				height: calc(100vh - var(--header-height));
				overflow: hidden;
			}

			&-footer {
				height: var(--footer-height);
				padding: 0 1rem;
				display: flex;
				align-items: center;
				justify-content: space-between;
			}
		}
	}
</style>
