(NOBRIDGE) LOG  [NodeSTCore] COMPLETE API REQUEST CONTENT:
 (NOBRIDGE) LOG  [Message 1] Role: user
 (NOBRIDGE) LOG  [Message 1][Part 1] Content length: 24 chars
 (NOBRIDGE) LOG  [Message 2] Role: user
 (NOBRIDGE) LOG  [Message 2][Part 1] Content length: 8 chars
 (NOBRIDGE) LOG  [Message 3] Role: model
 (NOBRIDGE) LOG  [Message 3][Part 1] Content length: 6 chars
 (NOBRIDGE) LOG  [Message 4] Role: user
 (NOBRIDGE) LOG  [Message 4][Part 1] Content length: 2 chars
 (NOBRIDGE) LOG  [NodeSTCore] Using adapter: {"apiProvider": "gemini", "hasMemoryResults": false, "type": "Gemini"}
 (NOBRIDGE) LOG  [NodeSTCore] Sending to API... {"characterId_passed_to_adapter": "1745581684495"}
 (NOBRIDGE) LOG  [NodeSTCore] 没有记忆搜索结果，使用标准generateContent方法
 (NOBRIDGE) LOG  [NodeSTCore] 调用generateContent，传递characterId: 1745581684495
 (NOBRIDGE) LOG  [Gemini适配器] 初始化云服务状态: 启用
 (NOBRIDGE) LOG  [Gemini适配器] 未配置API密钥，自动切换到云服务
 (NOBRIDGE) LOG  [Gemini适配器] 使用云服务生成内容
 (NOBRIDGE) LOG  [Gemini适配器][表格记忆/云服务] characterId参数值: 1745581684495
 (NOBRIDGE) LOG  [Gemini适配器][表格记忆/云服务] 调用 getCharacterTablesData 前参数: {"characterId": "1745581684495"}
 (NOBRIDGE) LOG  [TableMemory] getCharacterTablesData - 获取角色 ID: "1745581684495" 的表格数据
 (NOBRIDGE) LOG  [TableMemory] 找到 0 个表格数据
 (NOBRIDGE) LOG  [Gemini适配器][表格记忆/云服务] getCharacterTablesData 返回: {"success": true, "tables": []}
 (NOBRIDGE) LOG  [Gemini适配器][表格记忆/云服务] 未获取到有效表格数据，success: true tables.length: 0
 (NOBRIDGE) LOG  [Gemini适配器] 转换后的消息格式: []
 (NOBRIDGE) LOG  [CloudService] 开始发送聊天请求到 CradleAI
 (NOBRIDGE) LOG  [CloudService] 原始消息: []
 (NOBRIDGE) LOG  [CloudService] 标准化消息: []
 (NOBRIDGE) LOG  [CloudService] 完整请求体: {
  "license_key": "AeP8Ww67kHlb8sOAxjl4rjzk4g5f-VWT",
  "device_id": "native-57b3f116",
  "model": "gemini-2.0-flash-exp",
  "messages": [],
  "max_tokens": 8192,
  "temperature": 0.7
}
 (NOBRIDGE) LOG  [CloudService] 请求模型: gemini-2.0-flash-exp
 (NOBRIDGE) LOG  [CloudService] 消息数量: 0
 (NOBRIDGE) LOG  [CloudService] 参数设置: temperature=0.7, max_tokens=8192
 (NOBRIDGE) LOG  [CloudService] 许可证密钥: AeP8****
 (NOBRIDGE) LOG  [CloudService] 设备ID: nati****
 (NOBRIDGE) LOG  [CloudService] 发送请求到: https://chat.cradleintro.top/api/huggingface/completion
 (NOBRIDGE) LOG  [CloudService] 请求完成，耗时: 1481ms, 状态码: 400
 (NOBRIDGE) ERROR  [CloudService] 请求失败 (400): {"error":{"message":"Messages field must be a non-empty array","status":400}}
 (NOBRIDGE) ERROR  [CloudService] 请求失败: [Error: CradleAI 请求失败: 400 ]
 (NOBRIDGE) ERROR  [Gemini适配器] 云服务请求失败: [Error: CradleAI 请求失败: 400 ]
 (NOBRIDGE) ERROR  [NodeSTCore] Error in processChat: [Error: 云服务请求失败: CradleAI 请求失败: 400 ]
 (NOBRIDGE) ERROR  [NodeSTManager] Error from NodeST: Failed to generate response
 (NOBRIDGE) ERROR  NodeST error: Failed to generate response