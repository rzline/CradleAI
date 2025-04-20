# TableMemory 记忆增强插件

TableMemory 是一个为 Mem0 记忆系统设计的表格记忆增强插件，它通过结构化表格来存储和组织角色相关信息，增强了聊天机器人的记忆能力。

## 功能概述

- **结构化记忆存储**：通过表格形式组织角色信息、事件历史等
- **表格模板系统**：预设多种表格模板，如角色特征表、时空表格、事件历史表等
- **自动表格维护**：基于对话内容自动更新表格信息
- **Mem0系统集成**：与Mem0向量记忆系统无缝协作，共同提升AI记忆体验

## 安装与初始化

TableMemory 插件已集成到 Mem0 系统中，初始化方式如下：

```typescript
// 从 MobileMemory 或 Mem0Service 初始化
import { initializeTableMemory } from './memory/integration/table-memory-integration';

// 初始化表格记忆插件
await initializeTableMemory({
  dbPath: 'path/to/table_memory.db',  // 数据库路径
  defaultTemplates: true,             // 是否创建默认模板
  enabled: true                       // 是否启用插件
});
```

## Mem0 与 TableMemory 集成方案

TableMemory 插件通过两种方式与 Mem0 系统集成：

### 1. 扩展 addToVectorStore 方法

通过 `extendAddToVectorStore` 函数包装原始的 `addToVectorStore` 方法，在处理向量记忆后自动调用表格记忆处理。

```typescript
// mobile-memory.ts 中的集成示例
private addToVectorStore = extendAddToVectorStore(async function(
  // 原始方法实现
) {...});
```

### 2. 提示词增强

表格记忆插件通过 `enhancePromptsWithTableMemory` 函数增强 Mem0 系统的提示词，添加表格相关的指令：

```typescript
// 增强提示词示例
const [enhancedSystemPrompt, enhancedUserPrompt] = enhancePromptsWithTableMemory(
  systemPrompt,
  userPrompt,
  tableData,
  { userName, aiName }
);
```

### 3. 表格操作处理

当 LLM 返回包含表格操作指令的 JSON 时，通过 `processLLMResponseForTableMemory` 函数处理这些操作：

```typescript
// 处理表格操作
await processLLMResponseForTableMemory(
  llmResponse,
  characterId,
  conversationId
);
```

## 默认表格模板

插件提供以下默认表格模板：

1. **角色特征表格**：记录角色的基本特征、外貌、性格等信息
2. **角色与用户社交表格**：记录角色与用户的关系、态度等信息
3. **时空表格**：记录当前场景的时间、地点等信息
4. **重要事件历史表格**：记录对话中发生的重要事件
5. **重要物品表格**：记录对话中提到的重要物品信息
6. **任务、命令或约定表格**：记录对话中提到的任务、命令或约定

## API 参考

插件主要 API：

- `initialize(options)`: 初始化插件
- `setEnabled(value)`: 设置插件启用状态
- `isEnabled()`: 获取插件启用状态
- `processChat(messages, options)`: 处理聊天消息，更新表格
- `getSelectedTemplates()`: 获取已选择的表格模板
- `createSheetsFromTemplates(templates, characterId, conversationId)`: 从模板创建表格

## 典型使用流程

1. **初始化阶段**：
   - 系统启动时初始化 TableMemory 插件
   - 选择需要使用的表格模板

2. **对话处理阶段**：
   - 用户发送消息后，同时调用向量记忆和表格记忆处理
   - LLM 分析对话内容，返回提取的事实和表格操作指令
   - 系统执行表格操作，更新对应表格

3. **记忆检索阶段**：
   - 在生成回复前，系统将表格数据添加到提示词中
   - AI 助手基于向量记忆和表格记忆生成回复

## 故障排查

如果表格记忆功能不正常工作：

1. 检查插件是否正确初始化：`TableMemory.isEnabled()` 应返回 `true`
2. 确认提示词是否包含表格指令：查看发送给 LLM 的系统提示词中是否包含表格相关内容
3. 检查 LLM 是否返回了正确格式的表格操作指令
4. 查看控制台日志中是否有与 `[TableMemory]` 相关的错误信息

## 注意事项

- 表格记忆功能与向量记忆功能结合使用效果最佳
- 默认表格模板可根据实际需求进行调整或扩展
- 表格数据存储在独立的 SQLite 数据库中，与向量记忆分开管理
