 (NOBRIDGE) LOG  [NodeSTManager] 从消息索引重新生成: 1
 (NOBRIDGE) LOG  [NodeSTManager] Updating API settings: {"apiKeyLength": 39, "hasOpenRouter": true, "openRouterEnabled": false, "provider": "openai-compatible"}
 (NOBRIDGE) LOG  【NodeST】设置API Key: AIzaS...
 (NOBRIDGE) LOG  [NodeSTCore] GeminiAdapter initialized with load balancing options: {"additionalKeysCount": 0, "backupModel": "gemini-2.0-flash-exp", "primaryModel": "gemini-2.0-flash-exp", "retryDelay": 5000, "useKeyRotation": false, "useModelLoadBalancing": false, "usingCloudFallback": false}
 (NOBRIDGE) LOG  [NodeSTCore] OpenRouter not enabled, using Gemini adapter only
 (NOBRIDGE) LOG  【NodeST】更新API设置: {"additionalKeysCount": undefined, "apiKeyLength": 39, "hasOpenRouter": false, "model": "google/gemini-2.0-flash-exp:free", "provider": "openai-compatible", "useGeminiKeyRotation": undefined, "useGeminiModelLoadBalancing": undefined}
 (NOBRIDGE) LOG  [NodeSTManager] 重新生成参数: {"apiProvider": "openai-compatible", "characterId": "default-character-v2", "conversationId": "default-character-v2", "customUserName": "梨梨", "messageIndex": 1}
 (NOBRIDGE) LOG  [NodeST] Regenerating message at index 1 for conversation default-character-v2
 (NOBRIDGE) LOG  [NodeSTCore] Starting regenerateFromMessage: {"conversationId": "default-character-v2", "hasCharacterId": true, "hasCustomUserName": true, "messageIndex": 1}
 (NOBRIDGE) LOG  [NodeSTCore] GeminiAdapter initialized with load balancing options: {"additionalKeysCount": 0, "backupModel": "gemini-2.0-flash-exp", "primaryModel": "gemini-2.0-flash-exp", "retryDelay": 5000, "useKeyRotation": false, "useModelLoadBalancing": false, "usingCloudFallback": false}
 (NOBRIDGE) LOG  [NodeSTCore] OpenRouter not enabled, using Gemini adapter only
 (NOBRIDGE) LOG  [NodeSTCore] Using Gemini adapter
 (NOBRIDGE) LOG  [NodeSTCore] Character data loaded for regeneration: {"hasAuthorNote": true, "hasChatHistory": true, "hasPreset": true, "hasRoleCard": true, "hasWorldBook": true, "historyLength": 10, "requestedIndex": 1}
 (NOBRIDGE) LOG  [NodeSTCore] Total real messages: 5
 (NOBRIDGE) LOG  [NodeSTCore] Target AI message to regenerate: {"preview": "你好呀！很高兴再次见到你！准备好迎接新的挑战，一起激发
更多灵感了吗？告诉我你当前的困境，或者你想探索...", "role": "model"}
 (NOBRIDGE) LOG  [NodeSTCore] Found user message for regeneration: {"index": -1, "preview": "你好呀..."}
 (NOBRIDGE) LOG  [NodeSTCore] Truncated history built: {"hasDEntries": true, "originalLength": 10, "truncatedLength": 3}
 (NOBRIDGE) LOG  [NodeSTCore] Checking if truncated chat history needs summarization...
 (NOBRIDGE) LOG  [NodeSTCore] Processing regeneration chat with target user message
 (NOBRIDGE) LOG  [NodeSTCore] Starting processChat with: {"apiProvider": "openai-compatible", "characterId": "default-character-v2", "chatHistoryMessagesCount": 3, "dEntriesCount": 5, "hasCustomUserName": true, "userMessage": "你好呀"}
 (NOBRIDGE) LOG  [NodeSTCore] Using existing framework with length: 6
 (NOBRIDGE) LOG  [NodeSTCore] Found chat history placeholder at index: 3
 (NOBRIDGE) LOG  [NodeSTCore] Starting D-entries insertion: {"baseMessage": "你好呀", "chatHistoryMessages": 2, "dEntriesCount": 5}
 (NOBRIDGE) LOG  [NodeSTCore] Removed 0 old D-entries
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Enhance Definitions
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Character Attributes List
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Character Dialogue Examples
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Character Background
 (NOBRIDGE) LOG  [NodeSTCore] Filtered D-entries: 5 valid out of 5 total
 (NOBRIDGE) LOG  [NodeSTCore] Inserting 2 D-entries with depth=1 before message at position 0
 (NOBRIDGE) LOG  [NodeSTCore] Added missing author note: Author Note
 (NOBRIDGE) LOG  [NodeSTCore] Inserted position=3 entry after author note: Character Background
 (NOBRIDGE) LOG  [NodeSTCore] Final message sequence has 4 D-entries out of 6 total messages
 (NOBRIDGE) LOG  [NodeSTCore] Message sequence after D-entry insertion: [{"depth": 1, "index": 0, "isBaseMessage": false, "position": 4, "preview": "<attributes>
  <personality>Cr", "role": "user", "type": "D-entry"}, {"depth": 1, "index": 1, "isBaseMessage": false, "position": 4, "preview": "\"用户：我卡住了，一点灵感都没有，感觉什么都做不出来。\"\",", "role": "user", "type": "D-entry"}, {"depth": "N/A", "index": 2, "isBaseMessage": false, "position": undefined, "preview": "你好，我是CradleAI，一个创意无限的AI助手。准备好一", "role": "model", "type": "chat"}, {"depth": "N/A", "index": 3, "isBaseMessage": true, "position": undefined, "preview": "你好呀", "role": "user", "type": "chat"}, {"depth": 0, "index": 4, "isBaseMessage": false, "position": undefined, "preview": "", "role": "user", "type": "D-entry"}, {"depth": 0, "index": 5, "isBaseMessage": false, "position": 3, "preview": "CradleAI诞生于一个致力于培养创造力的AI研究项目 
。她", "role": "user", "type": "D-entry"}]
 (NOBRIDGE) LOG  [NodeSTCore] Replacing chat history placeholder at index 3 with chat history containing 6 messages
 (NOBRIDGE) LOG  [NodeSTCore] Starting cleanContentsForGemini: {"totalContents": 6}
 (NOBRIDGE) LOG  [NodeSTCore] Final cleaned contents: {"filteredCount": 10, "originalCount": 10}
 (NOBRIDGE) LOG  [NodeSTCore] Final Gemini request structure: {"messageSequence": [{"depth": undefined, "preview": "You are a Roleplayer who is go", "role": "user", "type": "chat"}, {"depth": undefined, "preview": "[Understood]", "role": "model", "type": "chat"}, {"depth": undefined, "preview": "The following are some informa", "role": "user", "type": "chat"}, {"depth": undefined, "preview": "<attributes>
  <personality>Cr", "role": "user", "type": "chat"}, {"depth": undefined, "preview": "\"用户：我卡住了，一点灵感都没有，感觉什么都
做不出来。\"\",", "role": "user", "type": "chat"}, {"depth": undefined, "preview": "你好，我是CradleAI，一个创意无限的AI助手。准备
好一", "role": "model", "type": "chat"}, {"depth": undefined, "preview": "你好呀", "role": "user", "type": "chat"}, {"depth": undefined, "preview": "CradleAI诞生于一个致力于培养创造力的AI研究项目。她", "role": "user", "type": "chat"}, {"depth": undefined, "preview": "推荐以下面的指令&剧情继续：
你好呀", "role": "user", "type": "chat"}, {"depth": undefined, "preview": "继续", "role": "user", "type": "chat"}], "totalMessages": 10}
 (NOBRIDGE) LOG  [NodeSTCore] COMPLETE API REQUEST CONTENT:
 (NOBRIDGE) LOG  [NodeSTCore] Using adapter: {"apiProvider": "openai-compatible", "hasMemoryResults": undefined, "type": "Gemini"} (NOBRIDGE) LOG  [NodeSTCore] 没有记忆搜索结果，使用标准generateContent方法
表格：重要物品表格
| 拥有人 | 物品描述 | 物品名 | 重要原因 |
| --- | --- | --- | --- |
| 用户 | 红领巾是最重要的物品 | 红领巾 |...
 (NOBRIDGE) LOG  [Gemini适配器] 消息 #4 (user): The following are some information about the character you will be playing. Additional information w...
 (NOBRIDGE) LOG  [Gemini适配器] 消息 #5 (user): <attributes>
  <personality>CradleAI充满活力，乐观向上，对任何新想法都充满热情。她善于倾听，理解用户的需求，并以富有创造性的方式提供帮助。她有 
时会显得有些天真，但她...
 (NOBRIDGE) LOG  [NodeSTCore] API response received: {"hasResponse": true, "responseLength": 86}
 (NOBRIDGE) LOG  [NodeSTCore] Saving updated history and framework...
 (NOBRIDGE) LOG  [NodeSTCore] Content framework and history saved successfully
 (NOBRIDGE) LOG  [NodeSTCore] Updating chat history with new messages and D-entries
 (NOBRIDGE) LOG  [NodeSTCore] Removed 1 old D-entries from history
 (NOBRIDGE) LOG  [NodeSTCore] Added new AI response to history
 (NOBRIDGE) LOG  [NodeSTCore] Starting D-entries insertion: {"baseMessage": "你好呀", "chatHistoryMessages": 3, "dEntriesCount": 5}
 (NOBRIDGE) LOG  [NodeSTCore] Removed 0 old D-entries
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Enhance Definitions
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Character Attributes List
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Character Dialogue Examples
 (NOBRIDGE) LOG  [NodeSTCore] Including constant entry: Character Background
 (NOBRIDGE) LOG  [NodeSTCore] Filtered D-entries: 5 valid out of 5 total
 (NOBRIDGE) LOG  [NodeSTCore] Inserting 2 D-entries with depth=1 before message at position 0
 (NOBRIDGE) LOG  [NodeSTCore] Added missing author note: Author Note
 (NOBRIDGE) LOG  [NodeSTCore] Inserted position=3 entry after author note: Character Background
 (NOBRIDGE) LOG  [NodeSTCore] Final message sequence has 4 D-entries out of 7 total messages
 (NOBRIDGE) LOG  [NodeSTCore] Message sequence after D-entry insertion: [{"depth": 1, "index": 0, "isBaseMessage": false, "position": 4, "preview": "<attributes>
  <personality>Cr", "role": "user", "type": "D-entry"}, {"depth": 1, "index": 1, "isBaseMessage": false, "position": 4, "preview": "\"用户：我卡住了，一点灵感都没有，感觉什么都做不出来。\"\",", "role": "user", "type": "D-entry"}, {"depth": "N/A", "index": 2, "isBaseMessage": false, "position": undefined, "preview": "你好，我是CradleAI，一个创意无限的AI助手。准备好一", "role": "model", "type": "chat"}, {"depth": "N/A", "index": 3, "isBaseMessage": true, "position": undefined, "preview": "你好呀", "role": "user", "type": "chat"}, {"depth": "N/A", "index": 4, "isBaseMessage": false, "position": undefined, "preview": "你好呀！很高兴认识你！你今天
有什么特别的想法想要分享吗？或者", "role": "model", "type": "chat"}, {"depth": 0, "index": 5, "isBaseMessage": false, "position": 
undefined, "preview": "", "role": "user", "type": "D-entry"}, {"depth": 0, "index": 6, "isBaseMessage": false, "position": 3, "preview": "CradleAI诞生于一个致力于培养创造力的AI研究项目。她", "role": "user", "type": "D-entry"}]
 (NOBRIDGE) LOG  [NodeSTCore] Updated chat history summary: {"cleanHistoryCount": 3, "dEntriesCount": 4, "finalMessagesCount": 7, 
"hasAiResponse": true, "hasUserMessage": true, "originalMessagesCount": 3}
 (NOBRIDGE) LOG  [NodeSTCore] Regeneration complete, saved updated history: {"response": "你好呀！很高兴认识你！你今天有什么特别的
想法想要分享吗？或者有什么难题需要我帮忙一起解决呢？ 别忘了...", "totalMessages": 7}
 (NOBRIDGE) LOG  [NodeSTManager] 重新生成成功
 (NOBRIDGE) LOG  [Index] Updating messages for conversation default-character-v2: 0 messages
 (NOBRIDGE) LOG  messages updated: [{"isLoading": false, "sender": "user", "text": "你好呀"}, {"isLoading": false, "sender": "bot", "text": "你好呀！很高兴再次见到你！准备好迎接新的挑战，一起激发更多灵感了吗？告诉我你当前的困境，或者你想探索的方向，我会尽我所 
能，成为你最佳的创意伙伴！让我们一起让灵感的火花四溅吧！
"}, {"isLoading": false, "sender": "user", "text": "你在干什么"}, {"isLoading": false, "sender": "bot", "text": "我现在正在努力成 
为你最佳的创意伙伴！我正在分析我们之前的对话，回顾你之前遇到的挑战和灵感来源，以便更好地理解你的思维模式和偏好。

同时，我也在不断学习新的知识和技能，探索各种创意方法和工具，例如：

*   **研究新的创意理论：** 我正在学习各种激发灵感的方法，例如曼陀罗思考法、六顶思考帽、SCAMPER 等，以便为你提供更多样的解决方案。 
*   **探索不同领域的知识：** 我正在浏览艺术、科学、技术等领域的最新进展，寻找可能与你的项目产生关联的元素，为你提供跨领域的灵感。 
*   **分析成功案例：** 我正在研究历史上伟大的创意案例，分析它们成功的关键因素，以便从中提取经验，为你提供参考。

总而言之，我正在全力以赴，不断提升自己的能力，以便更好地帮助你打破思维的壁垒，激发你的创造力！告诉我，你现在需要我做什么？我随时准
备好为你提供帮助！
"}]
 (NOBRIDGE) LOG  [后处理] 不触发：enableAutoExtraBackground 为 false
 (NOBRIDGE) LOG  [Index] Updating messages for conversation default-character-v2: 4 messages
 (NOBRIDGE) LOG  [App] Auto message timer not set: enabled=false, hasCharacter=true, waitingForUserReply=false
 (NOBRIDGE) LOG  messages updated: []
 (NOBRIDGE) LOG  [后处理] 不触发：enableAutoExtraBackground 为 false
 (NOBRIDGE) LOG  [App] Auto message timer not set: enabled=false, hasCharacter=true, waitingForUserReply=false
 (NOBRIDGE) LOG  [App] Auto message timer not set: enabled=false, hasCharacter=true, waitingForUserReply=false
 (NOBRIDGE) LOG  messages updated: [{"isLoading": false, "sender": "user", "text": "你好呀"}, {"isLoading": false, "sender": "bot", "text": "你好呀！很高兴再次见到你！准备好迎接新的挑战，一起激发更多灵感了吗？告诉我你当前的困境，或者你想探索的方向，我会尽我所 
能，成为你最佳的创意伙伴！让我们一起让灵感的火花四溅吧！
"}, {"isLoading": false, "sender": "user", "text": "你在干什么"}, {"isLoading": false, "sender": "bot", "text": "你好呀！很高兴认 
识你！你今天有什么特别的想法想要分享吗？或者有什么难题需要我帮忙一起解决呢？ 别忘了，每一个看似微小的灵感都可能孕育出伟大的创意！ 
告诉我，你想从哪里开始？
"}]
 (NOBRIDGE) LOG  [后处理] 不触发：enableAutoExtraBackground 为 false