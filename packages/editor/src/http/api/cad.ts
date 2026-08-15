import {request} from "@/http/request";
import {useWebsocketStore} from "@/store/modules/websocket";
import {
    isStandaloneMode,
    standaloneFailure,
    standaloneSuccess,
} from "@/http/standalone";

const websocketStore = useWebsocketStore();

/**
 * 获取cad列表
 */
export function fetchGetCadList(params) {
    if (isStandaloneMode) {
        const limit = Math.max(1, Number(params?.limit) || 10);
        const offset = Math.max(0, Number(params?.offset) || 0);
        return standaloneSuccess<Service.ListPageResult<ICad.Data>>({
            current: Math.floor(offset / limit) + 1,
            items: [],
            pageSize: limit,
            pages: 0,
            total: 0,
        });
    }
    return request.get<Service.ListPageResult<ICad.Data>>('/editor3d/cad/getAll',{params});
}

/**
 * 添加数据并启动cad解析（需传入接收结果的websocket uname）
 *
 * Standalone 模式下 DXF 应直接使用前端 DXF 解析链路；DWG -> DXF 转换
 * 仍属于 astral-service 的服务端能力，因此这里返回明确错误而不是发起 404 请求。
 */
export function fetchAddDwg2dxf(data) {
    if (isStandaloneMode) {
        return standaloneFailure<ICad.Data>(
            "Standalone mode cannot convert DWG to DXF. Import a DXF file directly in Factory Generator, or enable astral-service for DWG conversion.",
        );
    }
    return request.post<ICad.Data>('/editor3d/cad/dwg2dxf',data,{params:{uname:websocketStore.uname},headers:{"Content-Type":"multipart/form-data"}});
}