/**
 * @author MaHaiBing
 * @email  mlt131220@163.com
 * @date   2024/7/28 14:54
 * @description 示例场景
 */
import {request} from "@/http/request";
import {Service} from "~/network";
import {isStandaloneMode, standaloneFailure, standaloneSuccess} from "@/http/standalone";

/**
 * 获取所有示例场景
 */
export function fetchSceneExampleList(params) {
    if (isStandaloneMode) {
        return standaloneSuccess<Service.ListPageResult<ISceneFetchData>>({
            current: 1,
            items: [],
            pageSize: Number(params?.limit) || 1000,
            pages: 0,
            total: 0,
        });
    }
    return request.get<Service.ListPageResult<ISceneFetchData>>("/editor3d/sceneExample",{params});
}

/**
 * 获取示例场景
 */
export function fetchSceneExample(id) {
    if (isStandaloneMode) return standaloneFailure(`Standalone mode has no remote example scene: ${id}`);
    return request.get(`/editor3d/sceneExample/${id}`);
}

/**
 * 新增示例场景
 */
export function fetchAddSceneExample(data) {
    if (isStandaloneMode) return standaloneFailure("Standalone mode does not persist shared example scenes.");
    return request.post(`/editor3d/sceneExample`,data);
}

/**
 * 删除示例场景
 * @param {number} id
 */
export function fetchDeleteSceneExample(id: number) {
    if (isStandaloneMode) return standaloneFailure("Standalone mode does not persist shared example scenes.");
    return request.delete(`/editor3d/sceneExample/${id}`,{});
}