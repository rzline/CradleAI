
**目标：** 实现角色聊天后处理功能，利用 AI 生成额外的背景图片，并增强提示词管理。

**一、 前置更新：**

*   **Fix 功能增强:**  `ImageRegenerationModal.tsx` 组件的更新，增加提示词锁定/解锁功能。
    *   新增锁定/解锁按钮，与每个提示词标签关联。
    *   启用后，点击标签即可锁定/解锁对应提示词。
    *   被锁定的提示词将无法删除，并被标记为 `fixedTags`。

**二、 类型更新:**

*   **`CharacterImage` 类型:**
    *   在 `generationConfig` 的 `positive tags` 中，为 `normalTags` 增加 `fixedTags` 标记。
    *   `fixedTags` 代表被锁定的提示词，视为角色必须保留的特征。
    *   `normalTags` 的范围包括：自定义提示词，以及 `TagSelector` 中选定的提示词。
*   **`Character` 类型:**
    *   新增 `extrabackgroundimage` 属性：
        *   可以动态切换的背景图片，由后处理功能生成。
        *   在侧边栏设置中启用。
        *   作为角色在 Index 页面拥有的额外背景，用于多样化角色形象展示。
        *   不影响原有的 `backgroundimage` 属性。

**三、 后处理功能:**

1.  **触发条件:**
    *   在聊天主界面收到 AI 的回复之后。
    *   SettingsSidebar开启了自动生成图片。
    *   角色的`backgroundimage` 必须是通过 NovelAI 生成。

2.  **向 NovelAI 服务传递参数:**
    *   **参数 1：NovelAI 设置 (Seed 值保留)**
        *   来自 `ImageRegenerationModal.tsx` 组件的“设置”标签页，所有 NovelAI 设置，**必须保留其 Seed 值**。
    *   **参数 2：处理后的提示词**

3.  **提示词处理流程:**
    *   **3.1 获取初始提示词:**
        *   获取角色 `backgroundimage` 已经携带的 NovelAI 提示词：
            ```
            positive tags:
                genderTags,
                characterTags,
                artistTag,
                normalTags (包含 fixedTags),
                qualityTags
            negative tags: DEFAULT_NEGATIVE_PROMPTS
            ```
    *   **3.2 AI 修改提示词 (生成上下文描述):**
        *   AI 通过 `storage-adapter` 提取 10 条上下文信息。
        *   AI 根据上下文，用不超过 15 个英文单词的自然语言生成：**角色的表情、动作、当前的场景（时间、地点、画面）**。 **不生成**角色的外观、样貌、服饰的信息。
        *   使用 `geminiadapter.generatecontent` 方法发送生成请求。
    *   **3.3  提示词替换:**
        *   AI 生成的内容替换 `normalTags` 中，除了 `fixedTags` 之外的内容。
        *   如果 `fixedTags` 之外没有内容，则直接将 AI 生成的内容添加到 `fixedTags` 后面。
        *   **重要：** `fixedTags` 始终位于 AI 生成内容的前面。
    *   **3.4 最终提示词:**
        *   将完整的 `positive tags` 和 `negative tags` 发送给 NovelAI 服务。

4.  **Index 页面背景切换:**
    *   将 Index 页面背景自动切换为 `extrabackgroundimage`。

**四、 注意事项:**

*   **异步与非阻塞:** AI 提示词生成、`extrabackgroundimage` 图片生成、`extrabackgroundimage` 图片切换和聊天界面的操作应 **异步** 进行，**互不阻塞**。
*   **生成中 Indicator:**  `extrabackgroudimage` 在生成过程中，应在 `index` 组件右上角增加一个图片生成中的 indicator (指示器)。
*   **覆盖生成:** 如果产生了新的聊天对话并需要后处理，但上一次的 `extrabackgroudimage` 还没有生成，则直接基于新的聊天对话进行新的一次 `extrabackgroudimage` 生成。
*   **缓存管理:** 历史生成的 `extrabackgroudimage` 应该作为缓存被动态地清空，因为它们始终需要被后续的图片替换。

**五、 补充说明:**

*  理解 `storage-adapter` 和 `NovelAIService` 的接口定义，以便更精确地理解数据交互。
*  明确 `ImageRegenerationModal.tsx` 组件和 `index`组件之间的关系。