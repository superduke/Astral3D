import {request} from "@/http/request";
import {
    isStandaloneMode,
    standaloneFailure,
    standaloneSuccess,
} from "@/http/standalone";

function emptyAssetPage(params: Service.ListPageQueryParams): Service.ListPageResult<IAssets.Item> {
    const limit = Math.max(1, Number(params.limit) || 10);
    const offset = Math.max(0, Number(params.offset) || 0);

    return {
        current: Math.floor(offset / limit) + 1,
        items: [],
        pageSize: limit,
        pages: 0,
        total: 0,
    };
}

/**
 * 获取资产列表
 */
export function fetchGetAssetsList(params:Service.ListPageQueryParams){
    if (isStandaloneMode) {
        return standaloneSuccess(emptyAssetPage(params));
    }
    return request.get<Service.ListPageResult<IAssets.Item>>(`/assets/assetsInfo/getAll`,{params});
}

/**
 * 新增资产
 */
export function fetchAddAsset(data:IAssets.Item){
    if (isStandaloneMode) {
        return standaloneFailure<IAssets.Item>(
            "Standalone mode does not provide the server asset library. Use Factory Generator local/static assets or enable astral-service.",
        );
    }
    return request.post<IAssets.Item>(`/assets/assetsInfo`,data);
}

/**
 * 更新资产
 */
export function fetchUpdateAsset(data:IAssets.Item){
    if (isStandaloneMode) {
        return standaloneFailure<IAssets.Item>(
            "Standalone mode does not provide the server asset library. Enable astral-service to update cloud assets.",
        );
    }
    return request.put<IAssets.Item>(`/assets/assetsInfo`,data);
}

/**
 * 移除资产
 */
export function fetchRemoveAsset(id:IAssets.Item['id']){
    if (isStandaloneMode) {
        return standaloneFailure<boolean>(
            "Standalone mode does not provide the server asset library. Enable astral-service to remove cloud assets.",
        );
    }
    return request.delete(`/assets/assetsInfo/${id}`,{});
}


/**
 * 获取分类下的资产tags
 */
export function fetchGetAssetCategoryTags(type:IAssets.SupportType, category: string){
    if (isStandaloneMode) {
        return standaloneSuccess<string[]>([]);
    }
    return request.get<string[]>(`/assets/assetsInfo/selectTags`, {
        params:{
            type,
            category
        }
    });
}