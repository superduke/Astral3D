import {request} from "@/http/request";
import {isStandaloneMode, standaloneSuccess} from "@/http/standalone";

/**
 * 获取资产分类树
 */
export function fetchAssetsCategoryTreeList(params = {type: ''}){
    if (isStandaloneMode) {
        return standaloneSuccess<IAssets.Category[]>([]);
    }
    return request.get<IAssets.Category[]>(`/assets/assetsCategory/treeList`,{params});
}