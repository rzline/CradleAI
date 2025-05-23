 LOG  [TableMemoryService] [1] 开始获取聊天内容，参数: {"characterId": "1747995866408", "conversationId": "1747995866408", "messages": [{"content": "Hello!", "role": "assistant"}, {"content": "我一个重要的镜子", "role": "user"}, {"content": "你好！请问你说的重要的包裹现在在你手上
吗？
", "role": "assistant"}, {"content": "这个包裹就是我的镜子", "role": "user"}, {"content": "哦，原来如此！这个镜子对你很重要，对吧？是发生了 
什么特别的事情吗？
", "role": "assistant"}]}
 LOG  [TableMemoryService] [1.3] messages为数组，拼接后内容:
AI: Hello!

用户: 我一个重要的镜子

AI: 你好！请问你说的重要的包裹现在在你手上吗？


用户: 这个包裹就是我的镜子

AI: 哦，原来如此！这个镜子对你很重要，对吧？是发生了什么特别的事情吗？
 LOG  [TableMemoryService] [2] 获取表格数据，characterId=1747995866408, conversationId=1747995866408
 LOG  [TableMemory] getCharacterTablesData - 获取角色 ID: "1747995866408" 的表格数据
 LOG  [TableMemory] 会话过滤 ID: "1747995866408"
 LOG  [TableMemory] 找到 1 个表格数据
 LOG  [TableMemoryService] [2.1] 表格数据获取完成: {"success": true, "tables": [{"headers": [Array], "id": "3f10e770-f3fa-4d66-b2d9-3858be6fceb0", "name": "重要物品表格", "rows": [Array], "text": "| 拥有人   | 物品描述  | 物品名   | 重要原因  |
|-------|-------|-------|-------|
| 用户    | 重要的包裹 |       |       |
"}]}
 LOG  [TableMemoryService] [3] 构建表格专用提示词
 LOG  [TableMemoryService] [3.1] systemPrompt:
你是专业的表格记忆助手，只负责结构化表格信息的提取与维护。请严格按照表格结构和规则处理。
 LOG  [TableMemoryService] [3.2] userPrompt:
当前表格数据:
表格名称: 重要物品表格
| 拥有人   | 物品描述  | 物品名   | 重要原因  |
|-------|-------|-------|-------|
| 用户    | 重要的包裹 |       |       |


对话内容:
AI: Hello!

用户: 我一个重要的镜子

AI: 你好！请问你说的重要的包裹现在在你手上吗？


用户: 这个包裹就是我的镜子

AI: 哦，原来如此！这个镜子对你很重要，对吧？是发生了什么特别的事情吗？


请分析对话内容，生成表格操作指令（JSON格式），例如:
{
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "xxx",
      "rowData": {"0": "值1", "1": "值2"}
    }
  ]
}
只返回JSON对象。
 LOG  [TableMemoryService] [4] 调用LLM生成表格操作指令...
 LOG  [TableMemory] 从Mem0Service获取LLM实例
 LOG  [MobileLLM] 开始生成内容，提供商: gemini，模型: gemini-2.0-flash-exp，消息数: 2
 LOG  [Gemini适配器] 使用模型: gemini-2.0-flash-exp 生成内容
 LOG  [Gemini适配器][表格记忆] characterId参数值: undefined
 LOG  [Gemini适配器][表格记忆] 未提供有效的characterId，跳过表格记忆注入
 LOG  [Gemini适配器] 未获取到表格记忆数据，使用原始消息内容
 LOG  [Gemini适配器] 直接API调用完成，耗时: 955ms
 LOG  [Gemini适配器] API响应状态: 200
 LOG  [Gemini适配器] 成功接收到API响应，开始解析JSON
 LOG  [Gemini适配器] 成功接收响应，长度: 169
 LOG  [Gemini适配器] 响应前100个字符: ```json
{
  "tableActions": [
    {
      "action": "update",
      "sheetId": "重要物品表格",
      "rowI...
 LOG  [MobileLLM] 成功生成内容，响应长度: 169
 LOG  [TableMemoryService] [4.2] LLM响应内容:
```json
{
  "tableActions": [
    {
      "action": "update",
      "sheetId": "重要物品表格",
      "rowIndex": 0,
      "colIndex": 2,
      "newValue": "镜子"
    }
  ]
}
```
 LOG  [TableMemoryService] [5] 解析LLM响应，提取表格操作指令...
 LOG  [TableMemoryService] [5.1] 成功解析到tableActions: [{"action": "update", "colIndex": 2, "newValue": "镜子", "rowIndex": 0, "sheetId": 
"重要物品表格"}]
 LOG  [TableMemoryService] [6] 开始执行表格操作，共1条
 LOG  [TableMemoryService] [6.7] 表格操作执行完成，更新的表格ID: []
 LOG  [TableMemoryService] [9] ====== 表格记忆全流程结束，最终更新表格ID: []
 LOG  [ChatInput] 表格记忆服务已异步处理完成
