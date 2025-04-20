# TableMemory 调试指南

本文档提供了调试 TableMemory 插件的指导，特别是针对确保对话内容正确地从 Mem0 系统传递到 TableMemory 插件。

## 关键调试点

### 1. 检查对话内容流转

对话内容应当按照以下路径流转：

```
MobileMemory.addToVectorStore 
→ table-memory-integration.extendAddToVectorStore 
→ table-memory-integration.processChat 
→ TableMemory.API.processChat 
→ SheetManager.processSheetWithChat
```

### 2. 重要日志记录点

在运行时检查以下日志来确认对话内容正确流转：

1. **MobileMemory**:
   - "[MobileMemory] 准备了原始对话内容供表格记忆使用，长度: {length} 字符"
   
2. **TableMemoryIntegration**:
   - "[TableMemoryIntegration] 提取的对话内容长度: {length} 字符"
   - "[TableMemoryIntegration] 准备处理消息内容(前50字符): {content}..."
   
3. **SheetManager**:
   - "[TableMemory] 收到的对话内容长度: {length} 字符"
   - "[TableMemory] 对话内容片段(前100字符): {content}..."
   - "[TableMemory] 发送给LLM的请求体: {requestBody}"

### 3. 常见问题与解决方法

1. **对话内容为空**
   - 检查 `extendAddToVectorStore` 是否正确提取了对话内容
   - 确认 `_rawChatContent` 是否正确添加到元数据中
   - 验证 `processChat` 方法是否正确处理了传入的对话内容

2. **LLM 不返回表格操作指令**
   - 检查发送给 LLM 的完整请求体，确认提示词中包含了完整的表格和对话内容
   - 确认对话内容与表格的相关性（LLM 只会在对话中包含相关信息时更新表格）
   - 尝试调整提示词，让 LLM 更明确地知道需要返回表格操作指令

3. **日志中数据不一致**
   - 确保在各个转发步骤中都保留了完整的原始对话内容
   - 检查是否有编码/解码问题导致内容截断

### 4. 手动触发表格处理

在调试过程中，可以直接调用以下方法手动触发表格处理：

```typescript
// 获取原始对话内容
const chatContent = "用户: 我今天和团队讨论了 Project Phoenix 的预算问题。我们需要削减 10% 的开支。我也见了供应商 AlphaCorp 的代表，他们同意给我们一个月的付款延期。";

// 直接调用处理方法
const result = await TableMemory.API.processChat(chatContent, {
  characterId: "character-123",
  conversationId: "conversation-456"
});
```

### 5. 验证 Project Phoenix 场景

对于 Project Phoenix 预算场景，成功的处理应该包括：

1. 正确识别关键信息：
   - 预算需要削减 10%
   - AlphaCorp 提供了一个月付款延期

2. 正确的表格操作：
   - 如果是首次提到 Project Phoenix，应创建新行
   - 如果已有 Project Phoenix 记录，应更新现有行
   - 相关信息应被分类到正确的列中（项目名称、预算状态、供应商、备注等）

## 日志解读

完整的日志流程应该是：

1. 用户消息进入 addToVectorStore
2. 提取原始对话内容，保存到 metadata._rawChatContent
3. 调用 LLM 提取事实和表格操作
4. 如果 LLM 返回了表格操作，调用 processLLMResponseForTableMemory 处理
5. 不管 LLM 是否返回表格操作，都使用原始对话内容调用 processChat
6. processChat 将原始对话内容传给 TableMemory.API.processChat
7. SheetManager.processSheetWithChat 接收对话内容并构建 LLM 请求
8. SheetManager 记录完整的 LLM 请求体并调用 LLM
9. LLM 返回表格操作或更新后的表格内容
10. SheetManager 处理 LLM 响应并更新表格
