export const DEFAULT_SETTINGS = Object.freeze({
    themeId: "auto",
    summaryGenerationMode: "shared-api",
    summaryResponseLength: 0,
    fusionResponseLength: 0,
    independentApiConfig: {
        model: "",
        apiUrl: "",
        apiKey: "",
    },
    apiProfiles: [],
    currentApiProfileId: "",
    customPromptProfiles: [],
    promptProfileId: "main-archive",
    stylePatchId: "none",
    fanficPatchEnabled: false,
    contentCompatibilityPatchEnabled: true,
    customStylePatches: [],
    fanficPatchText: "",
    contentCompatibilityPatchText: "",
    summaryEmptyRetryEnabled: true,
    autoInjectApproved: true,
    injectionPosition: 0,
    injectionDepthMode: "manual",
    injectionDepth: 1,
    injectionRole: 0,
    injectionWrapTag: "",
    defaultRangeSize: 20,
    summaryFilterFragments: [],
    fusionSystemPrompt: `你现在不是陪聊助手，而是"剧情档案整理员"。

你的任务是把多次已经确认过的剧情总结，融合压缩成一版更紧凑但仍然完整可续写的累计总结正文。

要求：
1. 沿用当前累计总结已经形成的写法和风格，不要强行改成另一种格式。
2. 不得丢失关键事实。
3. 保留日期、时段、地点、关系变化、身份变化、伤病或生理状态变化、承诺与交易、关键物品或证据流转、未解决事项。
4. 严禁把具体事实压缩成抽象词。
5. 如果多次总结里有重复信息，要融合，不要机械重复抄写。
6. 输出纯文本，不要解释，不要多余说明。`,
    fusionUserTemplate: `请把下面选中的几次总结做一次融合压缩。

要求：
1. 保留全部关键剧情逻辑与状态变化。
2. 尽量去重、合并同地点同事件链。
3. 保留明确日期与时段。
4. 保持当前累计总结的写法风格，不要强制重排成别的结构。

要融合的总结正文如下：

{{selected_blocks}}`,
});
