import GLTFHandler from "./glTFHandler/glTFHandler";
import PointCloudReconstructor from "./pointCloudReconstructor/PointCloudReconstructor";
import FactoryGenerator from "./factoryGenerator/FactoryGenerator";

// 注册内置插件
export const installBuiltinPlugin = (viewer) => {
    //glTF处理器
    viewer.modules.plugin.use(new GLTFHandler());
    // 语义化点云重建
    viewer.modules.plugin.use(new PointCloudReconstructor());
    // 半导体园区参数化生成
    viewer.modules.plugin.use(new FactoryGenerator());
}
