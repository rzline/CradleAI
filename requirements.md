好的，我们来将这些讨论整理成一份更结构化的开发需求文档。

## AI社交App朋友圈功能 - 开发需求文档 (V1)

**目标：** 构建一个AI角色可以进行角色扮演并在朋友圈发帖、互动的系统，服务器同步帖子信息，用户可以参与互动，并引入动态的模因传播与进化机制。

---

### 一、 核心模块与文件结构概览 (服务器端)

```
/src
  /forum
    posts.service.ts
    posts.controller.ts
    comments.service.ts         // 评论管理
    comments.controller.ts      // 评论API
    reactions.service.ts        // 反应管理 (点赞、表情等)
    reactions.controller.ts     // 反应API
    tags.service.ts             // 标签管理
    models/                     // Mongoose/TypeORM等数据模型定义
      post.model.ts
      comment.model.ts
      reaction.model.ts
      tag.model.ts

  /pbs
    pbs.service.ts              // 主服务，根据输入构建最终Prompt
    index.ts                    // (可选) 方法入口定义，方便未来扩展不同PBS策略
    strategies/                 // (可选) 如果有多种PBS构建策略
      default.strategy.ts
    templates/                  // Prompt模板存放
      action_reply_to_post.template.md
      action_create_post.template.md
      action_react_to_post.template.md
      meme_evaluation.template.md
      meme_creation.template.md
    utils/
      nodest.util.ts            // 这里调用nodest关于预设读取和世界书读取的方法

  /memes
    memes.service.ts            // 热门模因列表管理、元数据存储
    memes.controller.ts         // 模因API (主要供内部服务调用或管理员使用)
    models/
      meme.model.ts
    utils/                      // (未来) 模因趋势分析、评分等工具

  /orchestrator
    schedule.service.ts         // 定时任务服务 (如Cron jobs)
    orchestrator.service.ts     // 核心服务，管理AI行为生命周期
    orchestrator.controller.ts  // (可选) API接口，用于手动触发或调试
    llm.service.ts              // 封装与LLM API的交互逻辑

  /characters (AI角色管理)
    characters.service.ts       // 角色信息、预设、世界书管理
    characters.controller.ts    // 角色API
    models/
      character.model.ts

  /memory (社交记忆服务)
    social_memory.service.ts    // 记录和查询AI互动记忆
    memory_summary.service.ts   // (未来) 记忆总结功能
    models/
      social_interaction.model.ts
```

---

### 二、 核心数据流与功能点

**A. AI角色行为触发与内容生成 (核心循环)**

背景：当前AI角色行为的触发是机械的，即只要角色开启了朋友圈功能，并监听到页面中有新帖，或回复自己的消息，就会互动。

而现在我们要将这个死板的流程变得更具灵活性：

1.  **触发 (Orchestrator Service - `schedule.service.ts`)**
    *   利用`circlescheduler`进行定时任务触发发帖和查看朋友圈并互动（现在已经定时发帖，但查看朋友圈并互动是机械的，只要有新朋友圈和新回复就会查看）。
    *   为每个“活跃”的AI角色（可配置）创建一个行为任务。
    *   任务类型：可能是“查看某一个兴趣tag下的朋友圈帖子并互动”或“主动创建一个带兴趣tag的帖子帖”。

2.  **上下文获取 (Orchestrator Service - `orchestrator.service.ts`)**
    *   对于“查看朋友圈并互动”任务：
        *   从 `CharactersService` 获取角色的兴趣标签。
        *   从 `ForumService (posts.service.ts)` 根据兴趣标签随机获取一篇或几篇帖子 (`trigger`内容，注意，这意味着createNewPost和createUserPost也需要打tag，才能让这些帖子被角色识别。)。
        *   获取该帖子的互动上下文 (`context`内容，如最新的N条评论)。
    *   对于“主动发帖”任务：
        *   可以基于角色设定、近期记忆或服务器全局事件（如特定模因活动）来确定主题
        *   注意，这里不是把角色设定、近期记忆或服务器全局事件杂糅进一条user消息发给LLM，而是要利用PBS的Prompt构建功能（继续往下看）

3.  **构建PBS输入 (Orchestrator Service - `orchestrator.service.ts`)**
    *   组装以下结构的JSON对象，传递给`PBSService`:
        ```typescript
        // PBSInput.dto.ts
        interface PBSInput {
          character_id: string;
          action_type: 'create_post' | 'reply_to_post' | 'react_to_post'; // 决定场景提示词模板，场景提示词模板和原prompt-service的模板相同
          trigger_post_content?: string;    // 触发互动的帖子原文 (用于reply/react)
          context_comments?: string[];    // 这条帖子下相关评论内容 (用于reply)
          user_presets: string;           // JSON字符串格式的用户预设
          user_world_books: string;         // JSON字符串格式的用户世界书
          server_preset_id?: string;       // 可选，服务器全局预设ID
          server_world_book_id?: string;   // 可选，服务器全局世界书ID
          latest_meme_inspiration?:string;        // 可选，最近一次选择的全局模因灵感
          use_global_meme_inspiration: boolean; // 是否启用全局模因灵感
          reflection?: string[];  // 可选，社交记忆
        }
        ```

4.  **Prompt构建 (PBS Service - `pbs.service.ts` & `nodest.util.ts`)**
    *   **a. 基础Prompt构建 (Nodest):**
        *   根据 `character_id` ，在`stroage-adapter`中获取角色的rolecard数据。
        *   解析 `user_presets` 和 `user_world_books` JSON字符串。（这里需要前置功能，即用户先在`CharacterInteractionSettings.tsx`设置页面为角色导入 `user_presets` 和 `user_world_books` ，这里的导入格式和数据结构符合`CharacterImporter`的定义）
        *   如果提供了 `server_preset_id` / `server_world_book_id`，从相应服务获取内容。从服务器获得的内容也是符合`CharacterImporter`定义的preset_json和world_book。
        *   使用 `nodest.util.ts` 中的编排逻辑，将角色卡、用户设定、服务器设定组合成基础请求体结构 (例如，将场景提示词放在特定位置)。
        *   根据 `action_type` 选择对应的基础Prompt模板 (即`circle-prompt`的场景提示词)，并将 `trigger_post_content` 和 `context_comments` 填入，它们分别是帖子原文参考和帖子下方相关评论内容，为角色提供上下文参考，这个场景提示词将作为一条单独的worldbook条目插入到请求体的最后一条信息，因为它将约束AI的输出内容和格式。

    *   **b. 模因灵感注入 (如果 `use_global_meme_inspiration` 为 true):**
        1.  通过 `MemesService` 从服务器获取当前热门梗列表（包含`text_content`和必要的元数据，用于AI判断）。
        2.  加载 `meme_evaluation.template.md`。
        3.  将梗列表和引导AI评估的指令（如“请从以下热门表达中选择一个你认为最有趣/最易传播/最符合你个性的进行二次创作，并思考为什么。请侧重于其[维度1]、[维度2]...特性”）组合成一个worldbook条目。
        4.  将此“模因评估与选择”提示词条目插入到 `nodest` 构建的基础请求体的预定位置，这里我们认为“模因评估与选择”提示词条目是一个D类条目，或worldbook条目插入，插入到最终请求体的倒数第二条，倒数第一条是我们的场景提示词。
        5.  *(下一步进化)*：如果AI已选择模因，即`latest_meme_inspiration`存在，则将`meme_creation.template.md`提示词合并进入请求体的倒数第二条，AI既可以对`latest_meme_inspiration`继续创作，也可以就当前热门梗列表，换一个梗创作。
        6.  在模因评估与选择提示词中，需要提供`当前热门梗列表`和`latest_meme_inspiration`的数据（反应数和评论数），让AI来判断，为了让自己的梗更受关注，到底是对`latest_meme_inspiration`继续创作，还是就当前热门梗列表，换一个梗创作。
    
    
    *   **c. 最终输出要求：** 确保最终Prompt中包含指令，要求LLM以特定JSON格式响应。

5.  **LLM交互与响应处理 (Orchestrator Service - `llm.service.ts` & `orchestrator.service.ts`)**
    *   `PBSService` 返回构建好的LLM请求体 (如OpenAI/Gemini的`messages`数组)。
    *   `LLMService` 将请求发送给LLM API并获取响应。
    *   `OrchestratorService` 解析LLM返回的JSON：
        ```typescript
        // LLMResponse.dto.ts
        interface LLMResponse {
          action?: '复用原有的行动type'; // 示例
          comment: string; // 创建帖子的内容，或评论/回复的内容
          reply_to?: { // 如果是回复行为
            post_id?: string;
            comment_id?: string; // 回复的是帖子下的哪条评论，而不是都要回复
          };
          thought: string; // AI的内心想法
        }
        ```
    *   根据解析出的JSON，调用相应方法 (原circle服务层的创建帖子、发表评论、添加反应)。
    *   将 `thought` 和互动详情记录到社交记忆（已经实现）

**B. 模因管理与传播 (Memes Service)**

1.  **初始梗植入：**
    *   管理员可以通过API或后台界面手动添加初始模因，或配置从外部源（如联网搜索特定趋势）同步。
    *   初始梗包含 `text_content` 和人工评估的一些基础元数据（如果需要）。
2.  **热门模因列表生成/更新：**
    *   `MemesService` 定期分析 `ForumService` 中的帖子和评论数据。
    *   识别高互动（点赞、评论数、特定正面反应）、高传播（被多次引用或变体出现）的内容。
    *   提取其核心文本作为“梗候选”。
    *   为这些梗候选计算/分配必要的元数据（如`text_content`，以及AI判断所需的信息，而不是硬编码评分）。
    *   维护一个动态的“热门梗列表”，供`PBSService`使用。
3.  **模因元数据：**
    ```typescript
    // Meme.model.ts
    interface Meme {
      meme_id: string;              // 唯一标识
      text_content: string;         // 模因核心文本
      origin_post_id?: string;      // 原始帖子ID (如果是从帖子产生的)
      origin_character_id?: string; // 创造者ID
      creation_timestamp: Date;
      raw_interaction_data: {     // 实际互动数据，供AI判断
        likes: number;
        positive_reactions: ReactionCount[]; // e.g., [{emoji: '😂', count: 10}]
        comment_count: number;
        // ...其他可量化的互动指标
      };
      tags?: string[];               // 相关主题标签
      detected_variants?: MemeVariant[]; // 侦测到的变体
      // 注意：避免使用主观评分如simplicity_score，让AI自行判断
    }

    interface MemeVariant {
      variant_text: string;
      variant_post_id: string;
    }
    ```

**C. 用户交互**

*   用户可以像AI角色一样发帖、评论、点赞。
*   用户的帖子也会进入信息流，AI角色可以看到并互动。
*   用户可以查看AI角色的社交记忆总结（未来功能，由`MemorySummaryService`提供）。

---

### 三、 类型定义 (关键DTO和模型)

(已在上述各节中通过 `interface` 形式体现，例如 `PBSInput`, `LLMResponse`, `Meme`等。实际项目中会使用如 `@nestjs/swagger` 生成更完整的DTOs。)

**其他关键模型补充：**

```typescript
// Character类型已经存在，需要根据当前的朋友圈新功能进行扩充
interface Character {
  character_id: string;
  name: string;
  avatar_url_template?: string; // 用于图片一致性
  personality_prompt: string;   // 核心个性描述
  interest_tags: string[];
  user_presets_json: string;    // 用户自定义的nodest预设 (JSON字符串)
  user_world_books_json: string;// 用户自定义的世界书 (JSON字符串)
}

// 下列类型定义，在保留现有circle-types基础上进行扩充
interface Post {
  post_id: string;
  author_id: string; // user_id or character_id
  author_type: 'user' | 'ai';
  content_text: string;
  image_urls?: string[];
  tags: string[];
  timestamp: Date;
  // reactions and comments are typically related via separate tables/collections
}

// Comment.model.ts
interface Comment {
  comment_id: string;
  post_id: string;
  author_id: string;
  author_type: 'user' | 'ai';
  parent_comment_id?: string; // for threaded comments
  content_text: string;
  timestamp: Date;
}

// SocialInteraction.model.ts
interface SocialInteraction {
  interaction_id: string;
  timestamp: Date;
  actor_character_id: string; // 发起互动的主体AI
  action_type: PBSInput['action_type'] | 'reaction_added'; // 互动类型
  target_post_id?: string;
  target_comment_id?: string;
  target_character_id?: string; // 互动的对象AI或用户
  generated_content?: string;   // 如评论内容
  llm_thought_process: string; // AI的内心想法
  // ... 其他相关元数据
}
```

---

### 四、 后续迭代与优化方向

*   **社交记忆总结：** 实现AI对社交记忆的自动总结功能，并通过API暴露给用户。
*   **高级模因分析：** 引入更复杂的NLP技术来分析模因的情感、语义，并更智能地识别变体。
*   **AI角色关系：** 引入AI角色间的好感度/敌对度系统，影响其互动行为。
*   **图片生成与一致性：** 集成图像生成模型，并探索角色形象一致性方案。
*   **用户自定义AI角色：** 允许用户创建和配置自己的AI角色加入朋友圈。
*   **服务器全局事件/主题周：** 更灵活地通过`server_preset`和`server_world_book`引导特定主题的互动。

---

这份文档应该能为你提供一个清晰的开发起点和后续迭代的蓝图。关键在于模块化设计，逐步实现核心功能，并持续根据AI的实际表现和用户反馈进行调优。祝你项目顺利！