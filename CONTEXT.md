# Factory Generator Domain Glossary

## Golden Asset

可用于商业客户 Demo 的正式 3D 设备资产。它必须风格统一、Web 性能受控、来源与生成过程可追溯，并通过 Astral3D 数字孪生 Runtime 验收；尚未满足全部条件的模型不是 Golden Asset。

## Unified Visual Baseline

全部 Golden Asset 共用的专业工业数字孪生写实风：结构可信、比例准确、中等细节、干净的哑光 PBR、统一工业灰白色板、少量安全色和轻度受控旧化。优先保障鸟瞰及中距离识别度，不追求影视级超写实，也不采用明显卡通或 LowPoly 风格。

## Golden Asset Pilot

首个用于验证完整 Golden Asset 生产与验收流程的样板资产。当前 Golden Asset Pilot 是 Street Light；它需要验证视觉一致性、资产预算、静态实例化、语义映射以及 FlyTo/Alarm Runtime 链路。

## Reference Set

驱动 Golden Asset 生成的一组受控多视图参考图。各视图必须来自同一设计，保持结构、比例、材料与视觉风格一致，并具备上传和生成所需的合法权利。默认以 Reference Set 驱动混元 3D 3.1 Normal + PBR 生成；纯文本只补充约束，不作为主要造型来源。

## Candidate Asset

已经生成并及时归档、但尚未通过全部 Golden Asset 门禁的 3D 模型。生成成功不代表资产获准进入正式库。默认采用渐进式双候选策略：先验证一个完整配置候选，仅在结构合格后再生成一个挑战候选，最多保留两个候选参加视觉评选，并且只清理最终胜出者。

## Asset Storage Boundary

Candidate Asset 保存在仓库外的 staging 区，不进入 Git。通过晋级门禁的 Golden Asset 使用 Git LFS 版本化保存 GLB；Asset Card、内容哈希、验收结果与 Factory Manifest 使用普通 Git 保存。未来资产规模显著扩大时，才重新评估对象存储与校验和同步方案。

## Golden Asset Promotion

Candidate Asset 依次通过离线资产硬门禁、Astral3D Runtime 硬门禁和统一视角视觉对比后，仍必须由项目负责人明确批准，才能进入正式 Factory Manifest 和 Git LFS。自动化或 Agent 可以淘汰失败候选，但不能自行授予 Golden Asset 身份。

## Reference Provenance

只有自有、明确授权或专门为本项目生成的图像才能上传为 Reference Set。权利不明确的网络图片和第三方模型只可用于人工研究，不得上传或要求高度相似复刻。Reference Set 默认由生成式图像模型为本项目创建，并记录生成工具、提示词、生成时间、来源状态和文件哈希。未公开厂区、客户资料或其他敏感图片每次上传前都需要项目负责人单独授权。

## Master Design Board

用于构建 Reference Set 的单张同源设计板，在一次设计中展示资产的正面、左面、右面、背面和顶面，并共用相同结构、比例、材料与风格。各视图经过一致性检查后才可分割并提交给 3D 生成模型。复杂设备应优先以 procedural 或 CAD blockout 的确定性视图约束轮廓，再使用生成式图像模型统一材质和细节。

## Motion Policy

Golden Asset 默认是静态、无骨骼、无 morph、无无关动画并兼容 InstancedMesh 的模型。需要简单运动的风扇等部件应保留为独立命名 Mesh，由 Runtime 实现轻量运动。只有确实依赖骨骼或复杂动画的资产经过单独批准后才能使用 shared-clone；自动生成结果意外包含 skin 或 animation 时，必须先清理才能晋级。

## Promotion Budget

Asset Brief 为 Golden Asset 定义的面数、材质数、贴图分辨率、贴图显存和文件体积上限。Promotion Budget 是晋级硬门禁，超标资产默认淘汰或返工；只有项目负责人明确批准并记录原因的单项预算例外可以晋级。Runtime Validator 可以对开发资产保留 warning，但晋级门禁必须硬失败。

## Asset Card

Candidate Asset 和 Golden Asset 的机器可读追溯记录。Asset Card 至少包含资产身份与状态、Reference Set 来源及哈希、生成工具与参数、原始及规范化文件哈希、结构和性能指标、权利声明、全部验收结果、预算例外以及最终批准记录。没有完整 Asset Card 的模型不得晋级为 Golden Asset。

## Street Light Archetype

Street Light Golden Asset Pilot 采用现代工业园区单臂一体式 LED 路灯：直立锥形金属杆、短水平悬臂、扁平矩形 LED 灯头和独立加固底座。不带太阳能板，不采用双臂、装饰性古典造型或智慧屏。
