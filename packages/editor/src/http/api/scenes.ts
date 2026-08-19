import {request} from "@/http/request";
import {
    isStandaloneMode,
    standaloneEditorStore,
    standaloneFailure,
    standaloneSuccess,
} from "@/http/standalone";

/**
 * 获取所有工程信息
 */
export function fetchGetAllScenes(params:Service.ListPageQueryParams) {
    if (isStandaloneMode) {
        return standaloneEditorStore
            .list(params)
            .then(standaloneSuccess)
            .catch(error => standaloneFailure<Service.ListPageResult<ISceneFetchData>>(String(error)));
    }
    return request.get<Service.ListPageResult<ISceneFetchData>>("/editor3d/scenes/getAll",{params});
}

/**
 * 获取工程
 */
export function fetchGetOneScene(id:string) {
    if (isStandaloneMode) {
        return standaloneEditorStore
            .get(id)
            .then(data => data ? standaloneSuccess(data) : standaloneFailure<ISceneFetchData>(`Project not found: ${id}`))
            .catch(error => standaloneFailure<ISceneFetchData>(String(error)));
    }
    return request.get<ISceneFetchData>(`/editor3d/scenes/get/${id}`);
}

/**
 * 保存工程
 */
export function fetchAddScene(data) {
    if (isStandaloneMode) {
        return standaloneEditorStore
            .add(data)
            .then(standaloneSuccess)
            .catch(error => standaloneFailure<ISceneFetchData>(String(error)));
    }
    return request.post<ISceneFetchData>(`/editor3d/scenes/add`,data);
}

/**
 * 更新工程
 */
export function fetchUpdateScene(id:string,data:ISceneFetchData) {
    if (isStandaloneMode) {
        return standaloneEditorStore
            .update(id, data)
            .then(standaloneSuccess)
            .catch(error => standaloneFailure<ISceneFetchData>(String(error)));
    }
    return request.put<ISceneFetchData>(`/editor3d/scenes/update/${id}`,data);
}

/**
 * 删除工程
 * @param {number} id
 */
export function fetchDeleteScenes(id: string) {
    if (isStandaloneMode) {
        return standaloneEditorStore
            .remove(id)
            .then(() => standaloneSuccess(true))
            .catch(error => standaloneFailure<boolean>(String(error)));
    }
    return request.delete(`/editor3d/scenes/del/${id}`,{});
}