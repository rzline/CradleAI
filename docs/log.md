 (NOBRIDGE) LOG  [MobileLLM] 成功生成内容，响应长度: 249
 (NOBRIDGE) LOG  [removeCodeBlocks] 从Markdown代码块中提取JSON: {
  "facts": [
    "用户有一个重要的显示器"
  ],
  "tableActi...
 (NOBRIDGE) LOG  [MobileMemory] 从用户消息中提取到 1 条事实:
 (NOBRIDGE) LOG    事实 #1: 用户有一个重要的显示器
 (NOBRIDGE) LOG  [MobileMemory] LLM 返回了 1 条表格操作指令
 (NOBRIDGE) LOG  [MobileMemory] 处理1条表格操作指令
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 调用ID: LLMResp-1745831962512_3007
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 调用堆栈:
    at ?anon_0_ (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:199798:39)
    at next (native)
    at asyncGeneratorStep (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5548:19)
    at _next (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5562:29)
    at anonymous (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5567:14)
 (NOBRIDGE) LOG  [TableMemoryIntegration] 发现 1 个表格操作指令
 (NOBRIDGE) LOG  [ZhipuEmbedder] 尝试嵌入文本: "用户有一个重要的显示器"
 (NOBRIDGE) LOG  [TableMemoryIntegration] 为角色 default-character-v2 找到 2 个表格
 (NOBRIDGE) LOG  [TableMemoryIntegration] 表格映射: "重要事件历史表格" -> 3b3145dc-34da-4abb-b894-451d4c63a9c9
 (NOBRIDGE) LOG  [TableMemoryIntegration] 表格映射: "重要物品表格" -> 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a
 (NOBRIDGE) LOG  [TableMemoryIntegration] 尝试为表格名称 "重要物品表格" 查找ID
 (NOBRIDGE) LOG  [TableMemoryIntegration] 从映射中找到表格ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a
 (NOBRIDGE) LOG  [TableMemoryIntegration] 解析后有 1 个有效表格操作
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 即将执行表格操作: {"action":"insert","sheetName":"重要物品表格","rowData":{"0":"用户","1":"重要的显示器","2":"显示器","3":null},"sheetId":"38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a"} 调用ID: LLMResp-1745831962512_3007
 (NOBRIDGE) LOG  [TableMemory] 获取表格详情: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a
 (NOBRIDGE) LOG  [TableMemoryIntegration] 执行表格 重要物品表格 的 insert 操作
 (NOBRIDGE) LOG  [TableMemory] 向表格 "重要物品表格" (ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a) 插
 (NOBRIDGE) LOG  [TableMemoryIntegration] 成功插入行到表格 重要物品表格
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 操作后数据库队列长度: 0，是否锁定: 否
 (NOBRIDGE) LOG  [ZhipuEmbedder] 成功获取嵌入向量，维度: 1024
 (NOBRIDGE) LOG  [MobileMemory] 为事实"用户有一个重要的显示器..."查找到 5 条相关记忆
 (NOBRIDGE) LOG    记忆ID: 6d0a0cc6-33dc-4a05-b49b-bf85212b54e8, 内容: 用户有一个重要的工具, 相似度: 0.8792009041436227
 (NOBRIDGE) LOG    记忆ID: 44ba530b-bcfb-419e-a095-b44315e14988, 内容: 用户有一个重要的鼠标, 相似度: 0.8769071935377815
 (NOBRIDGE) LOG    记忆ID: a7a55c63-621f-45c1-bd9e-ac25ee446e34, 内容: 用户有一个重要的键盘, 相似度: 0.8745008838049655
 (NOBRIDGE) LOG    记忆ID: 2dee82e9-73c9-4575-807d-9314fd2d3128, 内容: 用户还有一个重要的扳手, 相似度: 0.8326849120630742        
 (NOBRIDGE) LOG    记忆ID: 4f8aaf55-43b0-4926-bb8c-eb9fb244af6b, 内容: 用户有一个很重要的靴子, 相似度: 0.8285955904338045        
 (NOBRIDGE) LOG  [MobileMemory] 共有 5 条唯一记忆需要处理
 (NOBRIDGE) LOG  [MobileLLM] 开始生成内容，提供商: gemini，模型: gemini-2.0-flash-exp，消息数: 1
 (NOBRIDGE) LOG  [Gemini适配器] 初始化云服务状态: 启用
 (NOBRIDGE) LOG  [Gemini适配器] 使用模型: gemini-2.0-flash-exp 生成内容
 (NOBRIDGE) LOG  [Gemini适配器] 尝试使用API密钥 1/1 请求模型: gemini-2.0-flash-exp
 (NOBRIDGE) LOG  [Gemini适配器][表格记忆] characterId参数值: undefined
 (NOBRIDGE) LOG  [Gemini适配器][表格记忆] 未提供有效的characterId，跳过表格记忆注入
 (NOBRIDGE) LOG  [Gemini适配器] 未获取到表格记忆数据，使用原始消息内容
 (NOBRIDGE) LOG  [Gemini适配器] 发送请求到API: gemini-2.0-flash-exp
 (NOBRIDGE) LOG  [Gemini适配器] 请求包含 1 条消息
 (NOBRIDGE) LOG  [Gemini适配器] 当前云服务状态: 启用
 (NOBRIDGE) LOG  [Gemini适配器] 消息 #1 (user): 你是一个智能记忆管理器，负责控制系统的记忆。
你可以执行四种操作：(1) 添加到记忆, (2) 更新记忆, (3) 从记忆中删除, (4) 不做更改。

基于以上四种操作，记忆将会发生变化。

比较新...
 (NOBRIDGE) LOG  [Gemini适配器] 检测到云服务已启用，使用云服务转发请求
 (NOBRIDGE) LOG  [Gemini适配器] 原始请求URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=123
 (NOBRIDGE) LOG  [Gemini适配器] 调用CloudServiceProvider.generateChatCompletion...
 (NOBRIDGE) LOG  [Gemini适配器] 转换后的消息格式: [
  {
    "role": "user",
    "content": "你是一个智能记忆管理器，负责控制系统的记忆。\n你可以执行四种操作：(1) 添加到记忆, (2) 更新记忆, (3) 从记忆中删除, (4) 不做更改。\n\n基于以上四种操作，记忆将会发生变化。\n\n比较新提取的事实与现有记忆。对每个新事实，决定是否要：\n- ADD: 将其作 
为新元素添加到记忆中\n- UPDATE: 更新现有记忆元素\n- DELETE: 删除现有记忆元素\n- NONE: 不做任何更改（如果事实已经存在或不相关）\n\n以下是选择执行哪种操作的具体指导：\n\n1. **添加(ADD)**：如果提取的事实包含记忆中不存在的新信息，那么你需要添加它。\n    - **示例
**：\n        - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户是软件工程师\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n
  {\n                \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n      
                  \"id\" : \"1\",\n                        \"text\" : \"用户的名字是李明\",\n                        \"event\" : 
\"ADD\"\n                    }\n                ]\n            }\n\n2. **更新(UPDATE)**：如果提取的事实包含与记忆中已有信息相似但
有所不同的内容，则需要更新它。\n    如果提取的事实与记忆中的元素表达相同的内容，选择信息量更丰富的一项。\n    示例(a)：如果记忆包
含\"用户喜欢打板球\"，而提取的事实是\"用户喜欢和朋友一起打板球\"，则用提取的事实更新记忆。\n    示例(b)：如果记忆包含\"用户喜欢芝
士披萨\"，而提取的事实是\"用户爱芝士披萨\"，则不需要更新，因为它们表达相同的信息。\n    如果指令是更新记忆，则必须更新。\n    请 
注意在更新时保持相同的ID。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n    
        [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户真的喜欢芝士披萨\"\n     
           },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户是软件工程师\"\n     
           },\n                {\n                    \"id\" : \"2\",\n                    \"text\" : \"用户喜欢打板球\"\n       
         }\n            ]\n        - 提取的事实: [\"用户喜欢鸡肉披萨\", \"用户喜欢和朋友一起打板球\"]\n        - 新记忆:\n       
     {\n            \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户喜欢芝士和鸡肉披萨\",\n                        \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用
户真的喜欢芝士披萨\"\n                    },\n                    {\n                        \"id\" : \"1\",\n
     \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n
{\n                        \"id\" : \"2\",\n                        \"text\" : \"用户喜欢和朋友一起打板球\",\n
     \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用户喜欢打板球\"\n                    }\n
 ]\n            }\n\n3. **删除(DELETE)**：如果提取的事实包含与记忆中的信息相矛盾的内容，则必须删除它。或者如果指令是删除记忆，则 
必须删除它。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n            [\n   
             {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名字是李明\"\n                },\n   
             {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢芝士披萨\"\n                }\n    
        ]\n        - 提取的事实: [\"用户不喜欢芝士披萨\"]\n        - 新记忆:\n            {\n            \"memory\" : [\n        
            {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户的名字是李明\",\n
         \"event\" : \"NONE\"\n                    },\n                    {\n                        \"id\" : \"1\",\n
              \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"DELETE\"\n                    }\n
  ]\n            }\n\n4. **无变更(NONE)**：如果提取的事实包含的信息已存在于记忆中，则不需要进行任何更改。\n    - **示例**：\n    
    - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名字
是李明\"\n                },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢芝
士披萨\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n            {\n     
       \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户 
的名字是李明\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n
     \"id\" : \"1\",\n                        \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"NONE\"\n   
                 }\n                ]\n            }\n\n以下是我到目前为止所收集的记忆内容。你需要仅以下列格式更新它：\n\n[\n  {\n    \"id\": \"0\",\n    \"text\": \"用户有一个重要的工具\"\n  },\n  {\n    \"id\": \"1\",\n    \"text\": \"用户有一个重要的鼠标\"\n  },\n  {\n    \"id\": \"2\",\n    \"text\": \"用户有一个重要的键盘\"\n  },\n  {\n    \"id\": \"3\",\n    \"text\": \"用户还有
一个重要的扳手\"\n  },\n  {\n    \"id\": \"4\",\n    \"text\": \"用户有一个很重要的靴子\"\n  }\n]\n\n下面提到了新提取的事实。你需
要分析这些新提取的事实，并确定这些事实是否应该在记忆中添加、更新或删除。\n\n[\n  \"用户有一个重要的显示器\"\n]\n\n遵循以下指示：\n- 不要从上面提供的自定义少数示例提示返回任何内容。\n- 如果当前记忆为空，则需要将新提取的事实添加到记忆中。\n- 你应该只以下面所示
的JSON格式返回更新后的记忆。如果没有变更，记忆键应保持相同。\n- 如果有添加，生成一个新的键并添加相应的新记忆。\n- 如果有删除，则 
应从记忆中删除该记忆键值对。\n- 如果有更新，ID键应保持不变，只需更新值。\n- 不要返回JSON格式之外的任何内容。\n- 不要在JSON字段中 
添加任何额外的文本或代码块，使其无效，如\"```json\"或\"```\"。\n\n只返回JSON格式，不要返回其他任何内容。\n请以有效的JSON格式响应 
。"
  }
]
 (NOBRIDGE) LOG  [CloudService] 开始发送聊天请求到 CradleAI
 (NOBRIDGE) LOG  [CloudService] 原始消息: [
  {
    "role": "user",
    "content": "你是一个智能记忆管理器，负责控制系统的记忆。\n你可以执行四种操作：(1) 添加到记忆, (2) 更新记忆, (3) 从记忆中删除, (4) 不做更改。\n\n基于以上四种操作，记忆将会发生变化。\n\n比较新提取的事实与现有记忆。对每个新事实，决定是否要：\n- ADD: 将其作 
为新元素添加到记忆中\n- UPDATE: 更新现有记忆元素\n- DELETE: 删除现有记忆元素\n- NONE: 不做任何更改（如果事实已经存在或不相关）\n\n以下是选择执行哪种操作的具体指导：\n\n1. **添加(ADD)**：如果提取的事实包含记忆中不存在的新信息，那么你需要添加它。\n    - **示例
**：\n        - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户是软件工程师\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n
  {\n                \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n      
                  \"id\" : \"1\",\n                        \"text\" : \"用户的名字是李明\",\n                        \"event\" : 
\"ADD\"\n                    }\n                ]\n            }\n\n2. **更新(UPDATE)**：如果提取的事实包含与记忆中已有信息相似但
有所不同的内容，则需要更新它。\n    如果提取的事实与记忆中的元素表达相同的内容，选择信息量更丰富的一项。\n    示例(a)：如果记忆包
含\"用户喜欢打板球\"，而提取的事实是\"用户喜欢和朋友一起打板球\"，则用提取的事实更新记忆。\n    示例(b)：如果记忆包含\"用户喜欢芝
士披萨\"，而提取的事实是\"用户爱芝士披萨\"，则不需要更新，因为它们表达相同的信息。\n    如果指令是更新记忆，则必须更新。\n    请 
注意在更新时保持相同的ID。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n    
        [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户真的喜欢芝士披萨\"\n     
           },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户是软件工程师\"\n     
           },\n                {\n                    \"id\" : \"2\",\n                    \"text\" : \"用户喜欢打板球\"\n       
         }\n            ]\n        - 提取的事实: [\"用户喜欢鸡肉披萨\", \"用户喜欢和朋友一起打板球\"]\n        - 新记忆:\n       
     {\n            \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户喜欢芝士和鸡肉披萨\",\n                        \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用
户真的喜欢芝士披萨\"\n                    },\n                    {\n                        \"id\" : \"1\",\n
     \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n
{\n                        \"id\" : \"2\",\n                        \"text\" : \"用户喜欢和朋友一起打板球\",\n
     \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用户喜欢打板球\"\n                    }\n
 ]\n            }\n\n3. **删除(DELETE)**：如果提取的事实包含与记忆中的信息相矛盾的内容，则必须删除它。或者如果指令是删除记忆，则 
必须删除它。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n            [\n   
             {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名字是李明\"\n                },\n   
             {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢芝士披萨\"\n                }\n    
        ]\n        - 提取的事实: [\"用户不喜欢芝士披萨\"]\n        - 新记忆:\n            {\n            \"memory\" : [\n        
            {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户的名字是李明\",\n
         \"event\" : \"NONE\"\n                    },\n                    {\n                        \"id\" : \"1\",\n
              \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"DELETE\"\n                    }\n
  ]\n            }\n\n4. **无变更(NONE)**：如果提取的事实包含的信息已存在于记忆中，则不需要进行任何更改。\n    - **示例**：\n    
    - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名字
是李明\"\n                },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢芝
士披萨\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n            {\n     
       \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户 
的名字是李明\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n
     \"id\" : \"1\",\n                        \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"NONE\"\n   
                 }\n                ]\n            }\n\n以下是我到目前为止所收集的记忆内容。你需要仅以下列格式更新它：\n\n[\n  {\n    \"id\": \"0\",\n    \"text\": \"用户有一个重要的工具\"\n  },\n  {\n    \"id\": \"1\",\n    \"text\": \"用户有一个重要的鼠标\"\n  },\n  {\n    \"id\": \"2\",\n    \"text\": \"用户有一个重要的键盘\"\n  },\n  {\n    \"id\": \"3\",\n    \"text\": \"用户还有
一个重要的扳手\"\n  },\n  {\n    \"id\": \"4\",\n    \"text\": \"用户有一个很重要的靴子\"\n  }\n]\n\n下面提到了新提取的事实。你需
要分析这些新提取的事实，并确定这些事实是否应该在记忆中添加、更新或删除。\n\n[\n  \"用户有一个重要的显示器\"\n]\n\n遵循以下指示：\n- 不要从上面提供的自定义少数示例提示返回任何内容。\n- 如果当前记忆为空，则需要将新提取的事实添加到记忆中。\n- 你应该只以下面所示
的JSON格式返回更新后的记忆。如果没有变更，记忆键应保持相同。\n- 如果有添加，生成一个新的键并添加相应的新记忆。\n- 如果有删除，则 
应从记忆中删除该记忆键值对。\n- 如果有更新，ID键应保持不变，只需更新值。\n- 不要返回JSON格式之外的任何内容。\n- 不要在JSON字段中 
添加任何额外的文本或代码块，使其无效，如\"```json\"或\"```\"。\n\n只返回JSON格式，不要返回其他任何内容。\n请以有效的JSON格式响应 
。"
  }
]
 (NOBRIDGE) LOG  [CloudService] 标准化消息: [
  {
    "role": "user",
    "content": "你是一个智能记忆管理器，负责控制系统的记忆。\n你可以执行四种操作：(1) 添加到记忆, (2) 更新记忆, (3) 从记忆中删除, (4) 不做更改。\n\n基于以上四种操作，记忆将会发生变化。\n\n比较新提取的事实与现有记忆。对每个新事实，决定是否要：\n- ADD: 将其作 
为新元素添加到记忆中\n- UPDATE: 更新现有记忆元素\n- DELETE: 删除现有记忆元素\n- NONE: 不做任何更改（如果事实已经存在或不相关）\n\n以下是选择执行哪种操作的具体指导：\n\n1. **添加(ADD)**：如果提取的事实包含记忆中不存在的新信息，那么你需要添加它。\n    - **示例
**：\n        - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户是软件工程师\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n
  {\n                \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n      
                  \"id\" : \"1\",\n                        \"text\" : \"用户的名字是李明\",\n                        \"event\" : 
\"ADD\"\n                    }\n                ]\n            }\n\n2. **更新(UPDATE)**：如果提取的事实包含与记忆中已有信息相似但
有所不同的内容，则需要更新它。\n    如果提取的事实与记忆中的元素表达相同的内容，选择信息量更丰富的一项。\n    示例(a)：如果记忆包
含\"用户喜欢打板球\"，而提取的事实是\"用户喜欢和朋友一起打板球\"，则用提取的事实更新记忆。\n    示例(b)：如果记忆包含\"用户喜欢芝
士披萨\"，而提取的事实是\"用户爱芝士披萨\"，则不需要更新，因为它们表达相同的信息。\n    如果指令是更新记忆，则必须更新。\n    请 
注意在更新时保持相同的ID。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n    
        [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户真的喜欢芝士披萨\"\n     
           },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户是软件工程师\"\n     
           },\n                {\n                    \"id\" : \"2\",\n                    \"text\" : \"用户喜欢打板球\"\n       
         }\n            ]\n        - 提取的事实: [\"用户喜欢鸡肉披萨\", \"用户喜欢和朋友一起打板球\"]\n        - 新记忆:\n       
     {\n            \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户喜欢芝士和鸡肉披萨\",\n                        \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用
户真的喜欢芝士披萨\"\n                    },\n                    {\n                        \"id\" : \"1\",\n
     \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n
{\n                        \"id\" : \"2\",\n                        \"text\" : \"用户喜欢和朋友一起打板球\",\n
     \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用户喜欢打板球\"\n                    }\n
 ]\n            }\n\n3. **删除(DELETE)**：如果提取的事实包含与记忆中的信息相矛盾的内容，则必须删除它。或者如果指令是删除记忆，则 
必须删除它。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n            [\n   
             {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名字是李明\"\n                },\n   
             {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢芝士披萨\"\n                }\n    
        ]\n        - 提取的事实: [\"用户不喜欢芝士披萨\"]\n        - 新记忆:\n            {\n            \"memory\" : [\n        
            {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户的名字是李明\",\n
         \"event\" : \"NONE\"\n                    },\n                    {\n                        \"id\" : \"1\",\n
              \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"DELETE\"\n                    }\n
  ]\n            }\n\n4. **无变更(NONE)**：如果提取的事实包含的信息已存在于记忆中，则不需要进行任何更改。\n    - **示例**：\n    
    - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名字
是李明\"\n                },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢芝
士披萨\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n            {\n     
       \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户 
的名字是李明\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n
     \"id\" : \"1\",\n                        \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"NONE\"\n   
                 }\n                ]\n            }\n\n以下是我到目前为止所收集的记忆内容。你需要仅以下列格式更新它：\n\n[\n  {\n    \"id\": \"0\",\n    \"text\": \"用户有一个重要的工具\"\n  },\n  {\n    \"id\": \"1\",\n    \"text\": \"用户有一个重要的鼠标\"\n  },\n  {\n    \"id\": \"2\",\n    \"text\": \"用户有一个重要的键盘\"\n  },\n  {\n    \"id\": \"3\",\n    \"text\": \"用户还有
一个重要的扳手\"\n  },\n  {\n    \"id\": \"4\",\n    \"text\": \"用户有一个很重要的靴子\"\n  }\n]\n\n下面提到了新提取的事实。你需
要分析这些新提取的事实，并确定这些事实是否应该在记忆中添加、更新或删除。\n\n[\n  \"用户有一个重要的显示器\"\n]\n\n遵循以下指示：\n- 不要从上面提供的自定义少数示例提示返回任何内容。\n- 如果当前记忆为空，则需要将新提取的事实添加到记忆中。\n- 你应该只以下面所示
的JSON格式返回更新后的记忆。如果没有变更，记忆键应保持相同。\n- 如果有添加，生成一个新的键并添加相应的新记忆。\n- 如果有删除，则 
应从记忆中删除该记忆键值对。\n- 如果有更新，ID键应保持不变，只需更新值。\n- 不要返回JSON格式之外的任何内容。\n- 不要在JSON字段中 
添加任何额外的文本或代码块，使其无效，如\"```json\"或\"```\"。\n\n只返回JSON格式，不要返回其他任何内容。\n请以有效的JSON格式响应 
。"
  }
]
 (NOBRIDGE) LOG  [CloudService] 完整请求体: {
  "license_key": "clSt43rem2Z7L3-XzXaPl-_jeptwXsTP",
  "device_id": "native-57b3f116",
  "model": "gemini-2.0-flash-exp",
  "messages": [
    {
      "role": "user",
      "content": "你是一个智能记忆管理器，负责控制系统的记忆。\n你可以执行四种操作：(1) 添加到记忆, (2) 更新记忆, (3) 从记忆中删 
除, (4) 不做更改。\n\n基于以上四种操作，记忆将会发生变化。\n\n比较新提取的事实与现有记忆。对每个新事实，决定是否要：\n- ADD: 将其
作为新元素添加到记忆中\n- UPDATE: 更新现有记忆元素\n- DELETE: 删除现有记忆元素\n- NONE: 不做任何更改（如果事实已经存在或不相关）\n\n以下是选择执行哪种操作的具体指导：\n\n1. **添加(ADD)**：如果提取的事实包含记忆中不存在的新信息，那么你需要添加它。\n    - **示
例**：\n        - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : 
\"用户是软件工程师\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n        
    {\n                \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n    
                    \"id\" : \"1\",\n                        \"text\" : \"用户的名字是李明\",\n                        \"event\" 
: \"ADD\"\n                    }\n                ]\n            }\n\n2. **更新(UPDATE)**：如果提取的事实包含与记忆中已有信息相似
但有所不同的内容，则需要更新它。\n    如果提取的事实与记忆中的元素表达相同的内容，选择信息量更丰富的一项。\n    示例(a)：如果记忆
包含\"用户喜欢打板球\"，而提取的事实是\"用户喜欢和朋友一起打板球\"，则用提取的事实更新记忆。\n    示例(b)：如果记忆包含\"用户喜欢
芝士披萨\"，而提取的事实是\"用户爱芝士披萨\"，则不需要更新，因为它们表达相同的信息。\n    如果指令是更新记忆，则必须更新。\n     
请注意在更新时保持相同的ID。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n  
          [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户真的喜欢芝士披萨\"\n   
             },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户是软件工程师\"\n   
             },\n                {\n                    \"id\" : \"2\",\n                    \"text\" : \"用户喜欢打板球\"\n     
           }\n            ]\n        - 提取的事实: [\"用户喜欢鸡肉披萨\", \"用户喜欢和朋友一起打板球\"]\n        - 新记忆:\n     
       {\n            \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户喜欢芝士和鸡肉披萨\",\n                        \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用户真的喜欢芝士披萨\"\n                    },\n                    {\n                        \"id\" : \"1\",\n
       \"text\" : \"用户是软件工程师\",\n                        \"event\" : \"NONE\"\n                    },\n
  {\n                        \"id\" : \"2\",\n                        \"text\" : \"用户喜欢和朋友一起打板球\",\n
       \"event\" : \"UPDATE\",\n                        \"old_memory\" : \"用户喜欢打板球\"\n                    }\n
   ]\n            }\n\n3. **删除(DELETE)**：如果提取的事实包含与记忆中的信息相矛盾的内容，则必须删除它。或者如果指令是删除记忆， 
则必须删除它。\n    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。\n    - **示例**：\n        - 旧记忆:\n            [\n 
               {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名字是李明\"\n                },\n 
               {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢芝士披萨\"\n                }\n  
          ]\n        - 提取的事实: [\"用户不喜欢芝士披萨\"]\n        - 新记忆:\n            {\n            \"memory\" : [\n      
              {\n                        \"id\" : \"0\",\n                        \"text\" : \"用户的名字是李明\",\n
           \"event\" : \"NONE\"\n                    },\n                    {\n                        \"id\" : \"1\",\n        
                \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"DELETE\"\n                    }\n        
    ]\n            }\n\n4. **无变更(NONE)**：如果提取的事实包含的信息已存在于记忆中，则不需要进行任何更改。\n    - **示例**：\n  
      - 旧记忆:\n            [\n                {\n                    \"id\" : \"0\",\n                    \"text\" : \"用户的名
字是李明\"\n                },\n                {\n                    \"id\" : \"1\",\n                    \"text\" : \"用户喜欢
芝士披萨\"\n                }\n            ]\n        - 提取的事实: [\"用户的名字是李明\"]\n        - 新记忆:\n            {\n   
         \"memory\" : [\n                    {\n                        \"id\" : \"0\",\n                        \"text\" : \"用 
户的名字是李明\",\n                        \"event\" : \"NONE\"\n                    },\n                    {\n
       \"id\" : \"1\",\n                        \"text\" : \"用户喜欢芝士披萨\",\n                        \"event\" : \"NONE\"\n 
                   }\n                ]\n            }\n\n以下是我到目前为止所收集的记忆内容。你需要仅以下列格式更新它：\n\n[\n  
{\n    \"id\": \"0\",\n    \"text\": \"用户有一个重要的工具\"\n  },\n  {\n    \"id\": \"1\",\n    \"text\": \"用户有一个重要的鼠 
标\"\n  },\n  {\n    \"id\": \"2\",\n    \"text\": \"用户有一个重要的键盘\"\n  },\n  {\n    \"id\": \"3\",\n    \"text\": \"用户 
还有一个重要的扳手\"\n  },\n  {\n    \"id\": \"4\",\n    \"text\": \"用户有一个很重要的靴子\"\n  }\n]\n\n下面提到了新提取的事实。
你需要分析这些新提取的事实，并确定这些事实是否应该在记忆中添加、更新或删除。\n\n[\n  \"用户有一个重要的显示器\"\n]\n\n遵循以下指 
示：\n- 不要从上面提供的自定义少数示例提示返回任何内容。\n- 如果当前记忆为空，则需要将新提取的事实添加到记忆中。\n- 你应该只以下 
面所示的JSON格式返回更新后的记忆。如果没有变更，记忆键应保持相同。\n- 如果有添加，生成一个新的键并添加相应的新记忆。\n- 如果有删 
除，则应从记忆中删除该记忆键值对。\n- 如果有更新，ID键应保持不变，只需更新值。\n- 不要返回JSON格式之外的任何内容。\n- 不要在JSON 
字段中添加任何额外的文本或代码块，使其无效，如\"```json\"或\"```\"。\n\n只返回JSON格式，不要返回其他任何内容。\n请以有效的JSON格 
式响应。"
    }
  ],
  "max_tokens": 8192,
  "temperature": 0.7
}
 (NOBRIDGE) LOG  [CloudService] 请求模型: gemini-2.0-flash-exp
 (NOBRIDGE) LOG  [CloudService] 消息数量: 1
 (NOBRIDGE) LOG  [CloudService] 参数设置: temperature=0.7, max_tokens=8192
 (NOBRIDGE) LOG  [CloudService] 许可证密钥: clSt****
 (NOBRIDGE) LOG  [CloudService] 设备ID: nati****
 (NOBRIDGE) LOG  [CloudService] 发送请求到: https://chat.cradleintro.top/api/huggingface/completion
 (NOBRIDGE) LOG  [CloudService] 请求完成，耗时: 3011ms, 状态码: 200
 (NOBRIDGE) LOG  [Gemini适配器] 云服务请求完成，耗时: 3014ms
 (NOBRIDGE) LOG  [Gemini适配器] 云服务响应状态: 200
 (NOBRIDGE) LOG  [Gemini适配器] 成功接收到API响应，开始解析JSON
 (NOBRIDGE) LOG  [Gemini适配器] 成功接收CradleAI响应，长度: 674
 (NOBRIDGE) LOG  [Gemini适配器] 响应前100个字符: ```json
{
    "memory": [
        {
            "id": "0",
            "text": "用户有一个重要的工具",
       ...
 (NOBRIDGE) LOG  [MobileLLM] 成功生成内容，响应长度: 674
 (NOBRIDGE) LOG  [removeCodeBlocks] 从Markdown代码块中提取JSON: {
    "memory": [
        {
            "id": "0",...
 (NOBRIDGE) LOG  [MobileMemory] LLM决定执行 6 个记忆操作:
 (NOBRIDGE) LOG  [MobileMemory] 执行操作: NONE, 内容: 用户有一个重要的工具...
 (NOBRIDGE) LOG  [MobileMemory] 无需更改记忆, ID: 6d0a0cc6-33dc-4a05-b49b-bf85212b54e8, 内容: 用户有一个重要的工具...
 (NOBRIDGE) LOG  [MobileMemory] 执行操作: NONE, 内容: 用户有一个重要的鼠标...
 (NOBRIDGE) LOG  [MobileMemory] 无需更改记忆, ID: 44ba530b-bcfb-419e-a095-b44315e14988, 内容: 用户有一个重要的鼠标...
 (NOBRIDGE) LOG  [MobileMemory] 执行操作: NONE, 内容: 用户有一个重要的键盘...
 (NOBRIDGE) LOG  [MobileMemory] 无需更改记忆, ID: a7a55c63-621f-45c1-bd9e-ac25ee446e34, 内容: 用户有一个重要的键盘...
 (NOBRIDGE) LOG  [MobileMemory] 执行操作: NONE, 内容: 用户还有一个重要的扳手...
 (NOBRIDGE) LOG  [MobileMemory] 无需更改记忆, ID: 2dee82e9-73c9-4575-807d-9314fd2d3128, 内容: 用户还有一个重要的扳手...
 (NOBRIDGE) LOG  [MobileMemory] 执行操作: NONE, 内容: 用户有一个很重要的靴子...
 (NOBRIDGE) LOG  [MobileMemory] 无需更改记忆, ID: 4f8aaf55-43b0-4926-bb8c-eb9fb244af6b, 内容: 用户有一个很重要的靴子...
 (NOBRIDGE) LOG  [MobileMemory] 执行操作: ADD, 内容: 用户有一个重要的显示器...
 (NOBRIDGE) LOG  [MobileMemory] 添加新记忆成功, ID: 4c929eb1-867f-45ec-872e-5ac21fa8b8d5
 (NOBRIDGE) LOG  [MobileMemory] 记忆处理完成: 添加=1, 更新=0, 删除=0, 无变更=5
 (NOBRIDGE) LOG  [MobileMemory] 处理1条表格操作指令
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 调用ID: LLMResp-1745831966123_3188
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 调用堆栈:
    at ?anon_0_ (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:199798:39)
    at next (native)
    at asyncGeneratorStep (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5548:19)
    at _next (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5562:29)
    at anonymous (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5567:14)
 (NOBRIDGE) LOG  [TableMemoryIntegration] 发现 1 个表格操作指令
 (NOBRIDGE) LOG  [MobileMemory] 尝试使用原始对话内容处理表格...
 (NOBRIDGE) LOG  【表格插件】[processChat] 调用ID: Chat-1745831966127_1195
 (NOBRIDGE) LOG  【表格插件】[processChat] 调用堆栈:
    at ?anon_0_ (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:200074:39)
    at next (native)
    at asyncGeneratorStep (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5548:19)
    at _next (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5562:29)
    at anonymous (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5567:14)
 (NOBRIDGE) LOG  [TableMemoryIntegration] Processing chat with characterId: "default-character-v2", conversationId: "default-character-v2"
 (NOBRIDGE) LOG  [TableMemoryIntegration] 处理表格记忆，角色ID: default-character-v2, 会话ID: default-character-v2
 (NOBRIDGE) LOG  [TableMemoryIntegration] 提取的对话内容长度: 210 字符
 (NOBRIDGE) LOG  【表格插件】[processChat] 调用ID: Chat-1745831966127_8664
 (NOBRIDGE) LOG  【表格插件】[processChat] 调用堆栈:
    at ?anon_0_ (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:200074:39)
    at next (native)
    at asyncGeneratorStep (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5548:19)
    at _next (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5562:29)
    at anonymous (http://192.168.1.5:8081/node_modules/expo-router/entry.bundle//&platform=android&dev=true&hot=false&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable:5567:14)
 (NOBRIDGE) LOG  [TableMemoryIntegration] Processing chat with characterId: "default-character-v2", conversationId: "default-character-v2"
 (NOBRIDGE) LOG  [Mem0Service] 成功添加多轮对话记忆，生成了 6 条事实
 (NOBRIDGE) LOG  [Mem0Service] 提取的事实详情:
 (NOBRIDGE) LOG    事实 #1 (ID: 6d0a0cc6-33dc-4a05-b49b-bf85212b54e8): 用户有一个重要的工具
 (NOBRIDGE) LOG      操作类型: NONE
 (NOBRIDGE) LOG    事实 #2 (ID: 44ba530b-bcfb-419e-a095-b44315e14988): 用户有一个重要的鼠标
 (NOBRIDGE) LOG      操作类型: NONE
 (NOBRIDGE) LOG    事实 #3 (ID: a7a55c63-621f-45c1-bd9e-ac25ee446e34): 用户有一个重要的键盘
 (NOBRIDGE) LOG      操作类型: NONE
 (NOBRIDGE) LOG    事实 #4 (ID: 2dee82e9-73c9-4575-807d-9314fd2d3128): 用户还有一个重要的扳手
 (NOBRIDGE) LOG      操作类型: NONE
 (NOBRIDGE) LOG    事实 #5 (ID: 4f8aaf55-43b0-4926-bb8c-eb9fb244af6b): 用户有一个很重要的靴子
 (NOBRIDGE) LOG      操作类型: NONE
 (NOBRIDGE) LOG    事实 #6 (ID: 4c929eb1-867f-45ec-872e-5ac21fa8b8d5): 用户有一个重要的显示器
 (NOBRIDGE) LOG      操作类型: ADD
 (NOBRIDGE) LOG  [Mem0Service] 已记录 1 个待更新的记忆ID，等待AI回复后更新AI响应字段
 (NOBRIDGE) LOG  [Mem0Service] 已重置消息缓存和对话计数，准备下一轮收集，保留待处理用户消息状态: false
 (NOBRIDGE) LOG  [ChatInput] 成功将AI回复添加到记忆系统缓存
 (NOBRIDGE) LOG  [TableMemoryIntegration] 为角色 default-character-v2 找到 2 个表格
 (NOBRIDGE) LOG  [TableMemoryIntegration] 表格映射: "重要事件历史表格" -> 3b3145dc-34da-4abb-b894-451d4c63a9c9
 (NOBRIDGE) LOG  [TableMemoryIntegration] 表格映射: "重要物品表格" -> 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a
 (NOBRIDGE) LOG  [TableMemoryIntegration] 尝试为表格名称 "重要物品表格" 查找ID
 (NOBRIDGE) LOG  [TableMemoryIntegration] 从映射中找到表格ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a
 (NOBRIDGE) LOG  [TableMemoryIntegration] 解析后有 1 个有效表格操作
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 即将执行表格操作: {"action":"insert","sheetName":"重要物品表格","rowData":{"0":"用户","1":"重要的显示器","2":"显示器","3":null},"sheetId":"38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a"} 调用ID: LLMResp-1745831966123_3188
 (NOBRIDGE) LOG  [TableMemory] 获取表格详情: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a
 (NOBRIDGE) LOG  [TableMemoryIntegration] 执行表格 重要物品表格 的 insert 操作
 (NOBRIDGE) LOG  [TableMemoryIntegration] Found 2 existing tables
 (NOBRIDGE) LOG  [TableMemoryIntegration] 准备处理消息内容(前50字符): 用户: 用户: 我有一个重要的显示器哦

用户: 我有一个重要的显示器哦

CradleAI: 哇！...
 (NOBRIDGE) LOG  【表格插件】[processChat] 即将调用 TableMemory.API.processChat, 调用ID: Chat-1745831966127_1195
 (NOBRIDGE) LOG  [TableMemory] processChat - Original IDs - characterId: "default-character-v2" (string), conversationId: "default-character-v2" (string)
 (NOBRIDGE) LOG  [TableMemory] processChat - Normalized IDs - safeCharacterId: "default-character-v2", safeConversationId: "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] Calling SheetManager.getSheetsByCharacter with IDs: "default-character-v2", "default-character-v2" (NOBRIDGE) LOG  [TableMemoryIntegration] Found 2 existing tables
 (NOBRIDGE) LOG  [TableMemoryIntegration] 准备处理消息内容(前50字符): 用户: 用户: 我有一个重要的显示器哦

用户: 我有一个重要的显示器哦

CradleAI: 哇！...
 (NOBRIDGE) LOG  【表格插件】[processChat] 即将调用 TableMemory.API.processChat, 调用ID: Chat-1745831966127_8664
 (NOBRIDGE) LOG  [TableMemory] processChat - Original IDs - characterId: "default-character-v2" (string), conversationId: "default-character-v2" (string)
 (NOBRIDGE) LOG  [TableMemory] processChat - Normalized IDs - safeCharacterId: "default-character-v2", safeConversationId: "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] Calling SheetManager.getSheetsByCharacter with IDs: "default-character-v2", "default-character-v2" (NOBRIDGE) LOG  [TableMemory] 找到 2 个现有表格
 (NOBRIDGE) LOG  [TableMemory] Found existing tables:
 (NOBRIDGE) LOG  [TableMemory] 1. ID: 3b3145dc-34da-4abb-b894-451d4c63a9c9, name: 重要事件历史表格, characterId: "default-character-v2", conversationId: "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] 2. ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a, name: 重要物品表格, characterId: "default-character-v2", conversationId: "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] 使用现有表格，跳过创建新表格
 (NOBRIDGE) LOG  [TableMemory] Existing sheet IDs: 3b3145dc-34da-4abb-b894-451d4c63a9c9, 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a    
 (NOBRIDGE) LOG  [TableMemory] Refreshing sheets with IDs: "default-character-v2", "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] 找到 2 个现有表格
 (NOBRIDGE) LOG  [TableMemory] Found existing tables:
 (NOBRIDGE) LOG  [TableMemory] 1. ID: 3b3145dc-34da-4abb-b894-451d4c63a9c9, name: 重要事件历史表格, characterId: "default-character-v2", conversationId: "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] 2. ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a, name: 重要物品表格, characterId: "default-character-v2", conversationId: "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] 使用现有表格，跳过创建新表格
 (NOBRIDGE) LOG  [TableMemory] Existing sheet IDs: 3b3145dc-34da-4abb-b894-451d4c63a9c9, 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a    
 (NOBRIDGE) LOG  [TableMemory] Refreshing sheets with IDs: "default-character-v2", "default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] 向表格 "重要物品表格" (ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a) 插入行
 (NOBRIDGE) LOG  [TableMemory] 当前表格最大行索引: 1, 新行将插入在索引: 2
 (NOBRIDGE) LOG  [TableMemory] 当前可用的表格:
 (NOBRIDGE) LOG  - "重要事件历史表格" (ID: 3b3145dc-34da-4abb-b894-451d4c63a9c9), CharID: default-character-v2, ConversationId: default-character-v2
 (NOBRIDGE) LOG  - "重要物品表格" (ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a), CharID: default-character-v2, ConversationId: default-character-v2
 (NOBRIDGE) LOG  [TableMemory] 使用外部传入的 chatContent
 (NOBRIDGE) LOG  [TableMemory] 使用顺序处理模式处理 2 个表格
 (NOBRIDGE) LOG  [TableMemory] 当前可用的表格:
 (NOBRIDGE) LOG  - "重要事件历史表格" (ID: 3b3145dc-34da-4abb-b894-451d4c63a9c9), CharID: default-character-v2, ConversationId: default-character-v2
 (NOBRIDGE) LOG  - "重要物品表格" (ID: 38fcc9a6-eabe-4f68-9c6a-85f99fe7f06a), CharID: default-character-v2, ConversationId: default-character-v2
 (NOBRIDGE) LOG  [TableMemory] 使用外部传入的 chatContent
 (NOBRIDGE) LOG  [TableMemory] 使用顺序处理模式处理 2 个表格
 (NOBRIDGE) LOG  [TableMemory] 成功更新表格 "重要物品表格"
 (NOBRIDGE) LOG  [TableMemory] 向表格 "重要物品表格" 插入行，行索引: 2
 (NOBRIDGE) LOG  [TableMemoryIntegration] 成功插入行到表格 重要物品表格
 (NOBRIDGE) LOG  [TableMemory] 使用顺序处理模式处理 2 个表格
 (NOBRIDGE) LOG  [TableMemory] 处理表格 "重要事件历史表格" (ID: 3b3145dc-34da-4abb-b894-451d4c63a9c9)
 (NOBRIDGE) LOG  【表格插件】[processLLMResponseForTableMemory] 操作后数据库队列长度: 0，是否锁定: 否
 (NOBRIDGE) LOG  [TableMemory] 获取所有模板
 (NOBRIDGE) LOG  [TableMemory] 获取所有模板，共 6 个模板
 (NOBRIDGE) LOG  [MemoOverlay] Loaded 6 total templates
 (NOBRIDGE) LOG  [MemoOverlay] Loaded 2 selected template IDs
 (NOBRIDGE) LOG  [TableMemory] getCharacterTablesData - 获取角色 ID: "default-character-v2" 的表格数据
 (NOBRIDGE) LOG  [TableMemory] 会话过滤 ID: "conversation-default-character-v2"
 (NOBRIDGE) LOG  [TableMemory] 找到 2 个表格数据
 (NOBRIDGE) LOG  [App] Scroll position updated for default-character-v2: 2.545454502105713
 (NOBRIDGE) WARN  You seem to update props of the "TRenderEngineProvider" component in short periods of time, causing costly tree rerenders (last update was 58.41ms ago). See https://stackoverflow.com/q/68966120/2779871 [Component Stack]