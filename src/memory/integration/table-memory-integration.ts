/**
 * 表格记忆插件集成
 * 
 * 该模块负责将表格记忆插件集成到Mem0记忆系统中，实现向量记忆和表格记忆的协同工作。
 */

import * as TableMemory from '../plugins/table-memory';
import { getFactRetrievalMessages } from '../prompts';
import { Message, SearchFilters } from '../types';
import Mem0Service from '../services/Mem0Service';

// 表格记忆插件是否被启用
let tableMemoryEnabled = false;

/**
 * 初始化表格记忆插件
 * @param options 初始化选项
 * @returns 初始化是否成功
 */
export async function initializeTableMemory(options: { 
  dbPath?: string; 
  defaultTemplates?: boolean;
  enabled?: boolean;
} = {}): Promise<boolean> {
  try {
    console.log('[TableMemoryIntegration] 初始化表格记忆插件...');
    
    const success = await TableMemory.API.init(options);
    
    if (success) {
      console.log('[TableMemoryIntegration] 表格记忆插件初始化成功');
      tableMemoryEnabled = options.enabled ?? true;
    } else {
      console.error('[TableMemoryIntegration] 表格记忆插件初始化失败');
      tableMemoryEnabled = false;
    }
    
    return success;
  } catch (error) {
    console.error('[TableMemoryIntegration] 初始化表格记忆插件时出错:', error);
    tableMemoryEnabled = false;
    return false;
  }
}

/**
 * 设置表格记忆插件启用状态
 * @param enabled 是否启用
 */
export function setTableMemoryEnabled(enabled: boolean): void {
  tableMemoryEnabled = enabled;
  TableMemory.setEnabled(enabled);
  console.log(`[TableMemoryIntegration] 表格记忆插件${enabled ? '已启用' : '已禁用'}`);
}

/**
 * 获取表格记忆插件启用状态
 * @returns 是否启用
 */
export function isTableMemoryEnabled(): boolean {
  return tableMemoryEnabled && TableMemory.isEnabled();
}

/**
 * 增强提示词，添加表格记忆相关内容
 * @param systemPrompt 原系统提示词
 * @param userPrompt 原用户提示词
 * @param tableData 表格数据
 * @param options 选项
 * @returns 增强后的提示词对
 */
export function enhancePromptsWithTableMemory(
  systemPrompt: string,
  userPrompt: string,
  tableData: any,
  options: { userName?: string; aiName?: string } = {}
): [string, string] {
  if (!tableMemoryEnabled || !tableData) {
    return [systemPrompt, userPrompt];
  }
  
  // 提取表格文本表示，便于在提示词中显示
  let tableText = '';
  if (Array.isArray(tableData)) {
    // 如果是表格数组，拼接每个表格的文本表示
    tableText = tableData.map(sheet => {
      return `表格名称: ${sheet.name}\n${sheet.tableText || '空表格'}`;
    }).join('\n\n');
  } else if (typeof tableData === 'string') {
    tableText = tableData;
  } else {
    tableText = JSON.stringify(tableData, null, 2);
  }

  // 增强系统提示词
  const enhancedSystemPrompt = `${systemPrompt}

此外，你需要同时维护用户的表格记忆。表格记忆是以表格形式组织的结构化信息，它与向量记忆共同构成完整的记忆系统。

${tableData ? `当前表格数据:
${tableText}` : '目前没有表格数据，需要根据对话创建新表格。'}

请按照以下规则处理表格:
1. 保持表格结构不变，不要添加或删除列
2. 基于对话内容添加新行或更新现有行
3. 将相关信息分类到正确的列中
4. 如果信息不确定，使用空值而非猜测
5. 返回的JSON必须包含facts和tableActions两个部分
6. 对话中的信息可能需要同时更新多个表格，请确保所有相关表格都得到更新`;

  // 增强用户提示词
  const enhancedUserPrompt = `${userPrompt}

请分析对话内容，同时提取事实信息和表格更新操作，然后以JSON格式返回两部分内容:
1. "facts": 从对话中提取的事实数组
2. "tableActions": 表格更新操作数组，每个操作包含:
   - "action": "insert"/"update"/"delete" 之一
   - "sheetId": 表格ID
   - "sheetName": 表格名称 (可选，如果提供sheetId则不需要)
   - "rowData"(对于insert/update): 包含列索引和值的对象，例如 {"0": "值1", "1": "值2"}
   - "rowIndex"(对于update/delete): 要更新或删除的行索引

示例响应格式(多表格更新示例):
{
  "facts": ["用户喜欢民族歌手", "用户的名字是李明"],
  "tableActions": [
    {
      "action": "insert",
      "sheetName": "角色特征表格",
      "rowData": {"0": "李明", "1": "用户", "2": "喜欢民族歌手"}
    },
    {
      "action": "update",
      "sheetName": "社交关系表格",
      "rowIndex": 1,
      "rowData": {"0": "李明", "1": "朋友", "2": "友好"}
    }
  ]
}

可用的表格名称有: ${Array.isArray(tableData) ? tableData.map(t => `"${t.name}"`).join(", ") : "请根据表格数据使用对应的表格名称"}
请确保返回有效的JSON格式。`;

  return [enhancedSystemPrompt, enhancedUserPrompt];
}

/**
 * 自定义多模式提示词构建器
 * @param content 内容
 * @param tableData 表格数据
 * @param isMultiRound 是否多轮对话
 * @param options 选项
 * @returns 提示词对
 */
export function getFactRetrievalAndTableUpdateMessages(
  content: string,
  tableData: any,
  isMultiRound: boolean = false,
  options: { userName?: string; aiName?: string } = {}
): [string, string] {
  // 获取基础事实提取提示词
  const [baseSystemPrompt, baseUserPrompt] = getFactRetrievalMessages(content, isMultiRound, options);
  
  // 如果表格记忆未启用或没有提供表格数据，直接返回基础提示词
  if (!tableMemoryEnabled || !tableData) {
    return [baseSystemPrompt, baseUserPrompt];
  }
  
  // 使用增强函数添加表格记忆相关内容
  return enhancePromptsWithTableMemory(baseSystemPrompt, baseUserPrompt, tableData, options);
}

/**
 * 处理LLM响应，执行表格操作
 * @param llmResponse LLM响应内容
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 处理结果
 */
export async function processLLMResponseForTableMemory(
  llmResponse: string,
  characterId: string,
  conversationId: string
): Promise<{ success: boolean; updatedSheets: string[] }> {
  if (!tableMemoryEnabled) {
    return { success: false, updatedSheets: [] };
  }
  
  try {
    // 确保使用有效的ID
    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;

    // 尝试解析JSON响应
    let parsedResponse: any = null;
    let tableActions: any[] = [];
    
    // 试着寻找JSON格式的响应
    const jsonMatches = llmResponse.match(/\{[\s\S]*?\}/g);
    if (jsonMatches) {
      // 尝试每个匹配项
      for (const jsonText of jsonMatches) {
        try {
          const possibleJson = JSON.parse(jsonText);
          // 检查是否包含tableActions数组
          if (possibleJson.tableActions && Array.isArray(possibleJson.tableActions)) {
            parsedResponse = possibleJson;
            tableActions = possibleJson.tableActions;
            console.log('[TableMemoryIntegration] 成功解析JSON格式的表格操作');
            break;
          }
        } catch (e) {
          // 继续尝试下一个匹配项
          continue;
        }
      }
    }
    
    // 如果没有找到有效的JSON，尝试直接解析完整响应
    if (!parsedResponse) {
      try {
        parsedResponse = JSON.parse(llmResponse);
        if (parsedResponse.tableActions && Array.isArray(parsedResponse.tableActions)) {
          tableActions = parsedResponse.tableActions;
        }
      } catch (e) {
        // 解析失败，检查是否为markdown表格格式
        if (llmResponse.includes('|') && llmResponse.includes('\n')) {
          // 可能是markdown表格，让我们处理为插入操作
          console.log('[TableMemoryIntegration] 检测到可能是markdown表格格式，但需要表格ID才能处理');
          
          // 获取角色的所有表格
          try {
            const sheets = await TableMemory.API.getCharacterSheets(safeCharacterId, safeConversationId);
            if (sheets && sheets.length > 0) {
              // 找到第一个合适的表格
              const targetSheet = sheets[0];
              console.log(`[TableMemoryIntegration] 将尝试更新表格: ${targetSheet.name} (${targetSheet.uid})`);
              
              // 直接尝试使用processChat更新表格
              const result = await TableMemory.API.processChat(llmResponse, {
                characterId: safeCharacterId,
                conversationId: safeConversationId
              });
              
              return {
                success: result.updatedSheets.length > 0,
                updatedSheets: result.updatedSheets
              };
            }
          } catch (sheetError) {
            console.error('[TableMemoryIntegration] 尝试获取表格失败:', sheetError);
          }
        }
        
        console.log('[TableMemoryIntegration] LLM响应不包含有效的JSON结构');
        return { success: false, updatedSheets: [] };
      }
    }
    
    // 如果还是没有找到有效的表格操作
    if (!tableActions || !Array.isArray(tableActions) || tableActions.length === 0) {
      console.log('[TableMemoryIntegration] LLM响应中没有表格操作指令');
      return { success: false, updatedSheets: [] };
    }
    
    console.log(`[TableMemoryIntegration] 发现 ${tableActions.length} 个表格操作指令`);
    
    // 获取当前角色所有的表格，用于ID查找或表名匹配
    const availableSheets = await TableMemory.API.getCharacterSheets(safeCharacterId, safeConversationId);
    console.log(`[TableMemoryIntegration] 为角色 ${safeCharacterId} 找到 ${availableSheets.length} 个表格`);
    
    // 为了跟踪表格ID和名称的映射关系
    const sheetNameToIdMap = new Map<string, string>();
    availableSheets.forEach(sheet => {
      sheetNameToIdMap.set(sheet.name, sheet.uid);
      console.log(`[TableMemoryIntegration] 表格映射: "${sheet.name}" -> ${sheet.uid}`);
    });
    
    // 处理表格名称到ID的转换
    const resolvedActions = await Promise.all(tableActions.map(async (action) => {
      // 如果操作中指定了表格名称但没有ID，尝试查找ID
      if (!action.sheetId && action.sheetName) {
        console.log(`[TableMemoryIntegration] 尝试为表格名称 "${action.sheetName}" 查找ID`);
        
        // 首先检查本地映射
        if (sheetNameToIdMap.has(action.sheetName)) {
          action.sheetId = sheetNameToIdMap.get(action.sheetName);
          console.log(`[TableMemoryIntegration] 从映射中找到表格ID: ${action.sheetId}`);
        } else {
          // 如果没有在本地映射中找到，尝试使用API查找
          const sheet = await TableMemory.API.getSheetByName(
            action.sheetName,
            safeCharacterId,
            safeConversationId
          );
          
          if (sheet) {
            action.sheetId = sheet.uid;
            sheetNameToIdMap.set(action.sheetName, sheet.uid); // 更新映射
            console.log(`[TableMemoryIntegration] 通过API找到表格ID: ${action.sheetId}`);
          } else {
            console.log(`[TableMemoryIntegration] 未找到表格 "${action.sheetName}"，跳过操作`);
          }
        }
      }
      
      // 如果是字符串形式的表格ID，检查是否实际上是表格名称
      if (action.sheetId && typeof action.sheetId === 'string' && 
          !action.sheetId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.log(`[TableMemoryIntegration] sheetId "${action.sheetId}" 不像是有效UUID，可能是表格名称`);
        
        // 检查是否是表格名称
        const tableName = action.sheetId;
        
        // 首先检查本地映射
        if (sheetNameToIdMap.has(tableName)) {
          action.sheetId = sheetNameToIdMap.get(tableName);
          action.originalName = tableName; // 保留原始名称以便记录
          console.log(`[TableMemoryIntegration] 从映射中找到表格ID: ${action.sheetId}`);
        } else {
          // 如果没有在本地映射中找到，尝试使用API查找
          const sheet = await TableMemory.API.getSheetByName(
            tableName,
            safeCharacterId,
            safeConversationId
          );
          
          if (sheet) {
            action.originalName = tableName; // 保留原始名称以便记录
            action.sheetId = sheet.uid;
            sheetNameToIdMap.set(tableName, sheet.uid); // 更新映射
            console.log(`[TableMemoryIntegration] 通过API找到表格ID: ${action.sheetId} (原名称: "${tableName}")`);
          } else {
            console.log(`[TableMemoryIntegration] 未找到表格 "${tableName}"，跳过操作`);
          }
        }
      }
      
      return action;
    }));
    
    // 过滤掉没有有效sheetId的操作
    const validActions = resolvedActions.filter(action => action.sheetId);
    console.log(`[TableMemoryIntegration] 解析后有 ${validActions.length} 个有效表格操作`);
    
    if (validActions.length === 0) {
      console.log('[TableMemoryIntegration] 没有有效的表格操作，跳过处理');
      return { success: false, updatedSheets: [] };
    }
    
    // 执行表格操作
    const updatedSheets: string[] = [];
    const sheetOperations = new Map<string, { insert: any[], update: any[], delete: any[] }>();
    
    // 按表格ID分组操作，减少数据库访问次数
    for (const action of validActions) {
      const sheetId = action.sheetId;
      
      if (!sheetOperations.has(sheetId)) {
        sheetOperations.set(sheetId, { insert: [], update: [], delete: [] });
      }
      
      const sheetOps = sheetOperations.get(sheetId)!;
      
      // 将操作分类放入对应的数组
      switch (action.action) {
        case 'insert':
          if (action.rowData) {
            sheetOps.insert.push(action);
          }
          break;
          
        case 'update':
          if (action.rowIndex !== undefined && action.rowData) {
            sheetOps.update.push(action);
          }
          break;
          
        case 'delete':
          if (action.rowIndex !== undefined) {
            sheetOps.delete.push(action);
          }
          break;
          
        default:
          console.warn(`[TableMemoryIntegration] 未知的表格操作: ${action.action}`);
      }
    }
    
    // 顺序执行每个表格的操作
    for (const [sheetId, ops] of sheetOperations.entries()) {
      try {
        // 验证表格是否存在
        const sheetExists = await TableMemory.API.getSheet(sheetId);
        if (!sheetExists) {
          console.log(`[TableMemoryIntegration] 跳过对不存在表格 ${sheetId} 的操作`);
          continue;
        }
        
        console.log(`[TableMemoryIntegration] 处理表格 ${sheetId} (${sheetExists.name}) 的操作`);
        let sheetUpdated = false;
        
        // 先执行删除操作（从后往前执行，避免索引变化）
        if (ops.delete.length > 0) {
          // 按行号降序排序，先删除靠后的行
          ops.delete.sort((a, b) => b.rowIndex - a.rowIndex);
          
          for (const action of ops.delete) {
            try {
              await TableMemory.API.deleteRow(sheetId, action.rowIndex);
              sheetUpdated = true;
              console.log(`[TableMemoryIntegration] 成功删除表格 ${sheetExists.name} 的行 ${action.rowIndex}`);
            } catch (error) {
              console.error(`[TableMemoryIntegration] 删除行失败:`, error);
            }
          }
        }
        
        // 执行更新操作
        for (const action of ops.update) {
          try {
            await TableMemory.API.updateRow(sheetId, action.rowIndex, action.rowData);
            sheetUpdated = true;
            console.log(`[TableMemoryIntegration] 成功更新表格 ${sheetExists.name} 的行 ${action.rowIndex}`);
          } catch (error) {
            console.error(`[TableMemoryIntegration] 更新行失败:`, error);
          }
        }
        
        // 最后执行插入操作
        for (const action of ops.insert) {
          try {
            await TableMemory.API.insertRow(sheetId, action.rowData);
            sheetUpdated = true;
            console.log(`[TableMemoryIntegration] 成功插入行到表格 ${sheetExists.name}`);
          } catch (error) {
            console.error(`[TableMemoryIntegration] 插入行失败:`, error);
          }
        }
        
        if (sheetUpdated && !updatedSheets.includes(sheetId)) {
          updatedSheets.push(sheetId);
        }
      } catch (error) {
        console.error(`[TableMemoryIntegration] 处理表格 ${sheetId} 操作失败:`, error);
      }
    }
    
    return {
      success: updatedSheets.length > 0,
      updatedSheets
    };
  } catch (error) {
    console.error('[TableMemoryIntegration] 处理LLM响应时出错:', error);
    return { success: false, updatedSheets: [] };
  }
}

/**
 * 处理聊天消息，更新表格记忆
 * @param messages 消息数组或文本
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @param options 选项
 * @returns 处理结果
 */
export async function processChat(
  messages: Message[] | string,
  characterId: string,
  conversationId: string,
  options: { 
    userName?: string; 
    aiName?: string; 
    isMultiRound?: boolean;
    chatContent?: string;
  } = {}
): Promise<{ success: boolean; updatedSheets: string[] }> {
  if (!tableMemoryEnabled) {
    console.log('[TableMemoryIntegration] 表格记忆插件未启用，跳过处理');
    return { success: false, updatedSheets: [] };
  }
  
  try {
    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;
    
    console.log(`[TableMemoryIntegration] Processing chat with characterId: "${safeCharacterId}", conversationId: "${safeConversationId}"`);
    
    // Check if tables exist for this character/conversation
    const existingTables = await TableMemory.API.getCharacterSheets(safeCharacterId, safeConversationId);
    console.log(`[TableMemoryIntegration] Found ${existingTables.length} existing tables`);
    
    // 优先使用 options.chatContent，如果没有则尝试自动获取最近的消息内容
    let messageContent: string | undefined = options.chatContent;
    if (!messageContent) {
      if (typeof messages === 'string') {
        messageContent = messages;
      } else if (messages && Array.isArray(messages) && messages.length > 0) {
        // 从消息数组提取内容
        messageContent = messages.map(m => {
          const role = m.role === 'assistant' ? (options.aiName || 'AI') : (options.userName || '用户');
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `${role}: ${content}`;
        }).join('\n\n');
      } else {
        // 自动调用 StorageAdapter 获取最近的消息
        try {
          const { StorageAdapter } = require('../../NodeST/nodest/utils/storage-adapter');
          const recentMessages = await StorageAdapter.getRecentMessages(safeConversationId, 20);
          if (recentMessages && recentMessages.length > 0) {
            interface MessagePart {
              text: string;
            }

            interface RecentMessage {
              role: string;
              parts?: MessagePart[];
              content?: string;
            }

            messageContent = recentMessages.map((msg: RecentMessage) => {
              const role: string = msg.role === 'model' || msg.role === 'assistant' ? (options.aiName || 'AI') : (options.userName || '用户');
              // 兼容 parts 数组
              const content: string = msg.parts?.[0]?.text || msg.content || '';
              return `${role}: ${content}`;
            }).join('\n\n');
            console.log('[TableMemoryIntegration] 自动从StorageAdapter获取最近对话内容');
          }
        } catch (err) {
          console.warn('[TableMemoryIntegration] 获取StorageAdapter最近消息失败:', err);
        }
      }
    }
    
    // 记录日志
    console.log(`[TableMemoryIntegration] 准备处理消息内容(前50字符): ${messageContent?.substring(0, 50) ?? '[无内容]'}...`);
    
    // 将消息传递给插件的processChat方法
    const result = await TableMemory.API.processChat(messages, {
      characterId: safeCharacterId,
      conversationId: safeConversationId,
      userName: options.userName,
      aiName: options.aiName,
      isMultiRound: options.isMultiRound,
      chatContent: messageContent // 显式传递 chatContent
    });
    
    return {
      success: result.updatedSheets.length > 0,
      updatedSheets: result.updatedSheets
    };
  } catch (error) {
    console.error('[TableMemoryIntegration] 处理聊天消息时出错:', error);
    return { success: false, updatedSheets: [] };
  }
}

/**
 * 获取表格数据，用于构建提示词
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 表格数据对象
 */
export async function getTableDataForPrompt(
  characterId: string,
  conversationId: string
): Promise<any | null> {
  if (!tableMemoryEnabled) {
    return null;
  }

  try {
    // FIXED: Ensure consistent ID handling
    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;

    console.log(`[TableMemoryIntegration] Getting table data for characterId: "${safeCharacterId}", conversationId: "${safeConversationId}"`);

    // 使用 getCharacterTablesData 替代 getCharacterSheets
    const tablesData = await TableMemory.API.getCharacterTablesData(safeCharacterId, safeConversationId);

    if (!tablesData.success || !tablesData.tables || tablesData.tables.length === 0) {
      console.log(`[TableMemoryIntegration] 未找到角色 ${safeCharacterId} 的表格`);
      return null;
    }

    console.log(`[TableMemoryIntegration] Found ${tablesData.tables.length} tables for character ${safeCharacterId}`);

    // 直接返回tablesData.tables，结构为 { id, name, headers, rows, text }
    return tablesData.tables;
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取表格数据时出错:', error);
    return null;
  }
}

/**
 * 将表格转换为文本形式
 * @param sheet 表格对象
 * @returns 表格的文本表示
 */
function toText(sheet: TableMemory.Sheet): string {
  return TableMemory.toText(sheet);
}

/**
 * 扩展MobileMemory的addToVectorStore方法，集成表格记忆功能
 * @param originalMethod 原始方法
 * @returns 扩展后的方法
 */
export function extendAddToVectorStore(
  originalMethod: (messages: Message[], metadata: Record<string, any>, filters: SearchFilters, isMultiRound?: boolean) => Promise<any>
): (messages: Message[], metadata: Record<string, any>, filters: SearchFilters, isMultiRound?: boolean) => Promise<any> {
  // 返回一个新函数，保持原有参数和返回类型
  return async function(
    this: any,
    messages: Message[],
    metadata: Record<string, any>,
    filters: SearchFilters,
    isMultiRound: boolean = false
  ): Promise<any> {
    // 首先调用原始方法
    const results = await originalMethod.call(this, messages, metadata, filters, isMultiRound);
    
    // 如果表格记忆功能启用，处理表格记忆
    if (isTableMemoryEnabled()) {
      try {
        // FIXED: Ensure consistent ID handling and prevent type mismatches
        const characterId = filters.agentId ? String(filters.agentId) : null;
        const conversationId = filters.runId ? String(filters.runId) : characterId;
        
        if (characterId && conversationId) {
          console.log(`[TableMemoryIntegration] 处理表格记忆，角色ID: ${characterId}, 会话ID: ${conversationId}`);
          
          // 获取Mem0Service实例，以获取自定义称呼
          const mem0Service = Mem0Service.getInstance();
          const userName = metadata.userName || 
                          (mem0Service ? mem0Service.getUserName(characterId) : '用户');
          const aiName = metadata.aiName || 
                        (mem0Service ? mem0Service.getAIName(characterId) : 'AI');
          
          // 从messages中提取出对话内容
          const chatContent = messages.map(m => {
            const role = m.role === 'assistant' ? aiName : (m.role === 'user' ? userName : m.role);
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `${role}: ${content}`;
          }).join('\n\n');
          
          console.log(`[TableMemoryIntegration] 提取的对话内容长度: ${chatContent.length} 字符`);
          
          // 异步处理表格记忆，不阻塞主流程
          // 直接传递原始messages和提取的chatContent
          processChat(messages, characterId, conversationId, {
            userName,
            aiName,
            isMultiRound,
            chatContent  // 显式传递提取的对话内容
          }).catch(error => {
            console.error("[TableMemoryIntegration] 处理表格记忆时出错:", error);
          });
        } else {
          console.log('[TableMemoryIntegration] 缺少角色ID或会话ID，跳过表格记忆处理');
        }
      } catch (error) {
        console.error("[TableMemoryIntegration] 处理表格记忆时出错:", error);
      }
    }
    
    // 返回原始方法的结果
    return results;
  };
}

/**
 * 获取表格记忆提示词
 * 根据profile_prompts.js中的提示词模板生成优化的提示词
 * @param type 提示词类型
 * @param options 选项
 * @returns 提示词对象
 */
export function getTableMemoryPrompt(
  type: string = 'rebuild_base',
  options: { 
    userName?: string; 
    aiName?: string;
    includeHistory?: boolean;
    includeLastTable?: boolean; 
  } = {}
): { systemPrompt: string; userPrompt: string } {
  try {
    // 尝试从profile_prompts中获取对应的提示词
    const profilePrompts = require('@/src/memory/ref_prompt/profile_prompts').profile_prompts;
    const selectedPrompt = profilePrompts[type];
    
    if (!selectedPrompt) {
      console.warn(`[TableMemoryIntegration] 未找到提示词类型 ${type}，使用默认提示词`);
      return {
        systemPrompt: `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        userPrompt: `请根据聊天内容，更新表格。可以添加新行、更新现有行或删除不再相关的行。`
      };
    }
    
    // 获取系统提示词
    const systemPrompt = selectedPrompt.system_prompt || 
      `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`;
    
    // 构建用户提示词
    let userPrompt = selectedPrompt.user_prompt_begin || 
      `请根据聊天内容，更新表格。可以添加新行、更新现有行或删除不再相关的行。`;
    
    // 添加核心规则
    if (selectedPrompt.core_rules) {
      userPrompt += `\n\n${selectedPrompt.core_rules}`;
    }
    
    // 替换提示词中的变量
    const userName = options.userName || '用户';
    const aiName = options.aiName || 'AI';
    
    const finalUserPrompt = userPrompt
      .replace(/<user>/g, userName)
      .replace(/<ai>/g, aiName);
    
    return { systemPrompt, userPrompt: finalUserPrompt };
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取表格记忆提示词失败:', error);
    return {
      systemPrompt: `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
      userPrompt: `请根据聊天内容，更新表格。可以添加新行、更新现有行或删除不再相关的行。`
    };
  }
}

/**
 * 简化表格记忆历史
 * 使用rebuild_simplify_history提示词简化表格记忆
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 是否成功
 */
export async function simplifyTableMemoryHistory(
  characterId: string,
  conversationId: string
): Promise<boolean> {
  try {
    if (!isTableMemoryEnabled()) {
      console.log('[TableMemoryIntegration] 表格记忆功能未启用，跳过简化操作');
      return false;
    }
    
    console.log(`[TableMemoryIntegration] 简化角色 ${characterId} 的表格记忆历史`);
    
    // 获取所有表格
    const sheets = await TableMemory.API.getCharacterSheets(characterId, conversationId);
    if (!sheets || sheets.length === 0) {
      console.log('[TableMemoryIntegration] 未找到表格，跳过简化');
      return false;
    }
    
    // 获取简化提示词
    const { systemPrompt, userPrompt } = getTableMemoryPrompt('rebuild_simplify_history');
    
    // 对每个表格执行简化
    let success = false;
    for (const sheet of sheets) {
      try {
        // 找出名称包含"历史"或"事件"的表格
        if (sheet.name.includes('历史') || sheet.name.includes('事件')) {
          console.log(`[TableMemoryIntegration] 正在简化表格: ${sheet.name}`);
          
          // 获取LLM实例
          const llm = await getLLM();
          if (!llm) {
            console.error('[TableMemoryIntegration] LLM实例不可用，跳过简化');
            continue;
          }
          
          // 获取表格文本
          const tableText = TableMemory.toText(sheet);
          
          // 构建提示词
          const finalUserPrompt = userPrompt.replace('<当前表格>', tableText);
          
          // 调用LLM
          const response = await llm.generateResponse(
            [
              { role: "user", content: systemPrompt },
              { role: "user", content: finalUserPrompt }
            ]
          );
          
          // 解析LLM响应
          const updatedTableText = typeof response === 'string' ? response : response.content;
          
          // 更新表格
          // 这里需要解析表格文本并更新表格
          // 由于复杂性，我们将调用SheetManager的方法来处理
          await TableMemory.rebuildSheet(sheet.uid, '', 'rebuild_simplify_history');
          
          success = true;
          console.log(`[TableMemoryIntegration] 表格 ${sheet.name} 简化完成`);
        }
      } catch (error) {
        console.error(`[TableMemoryIntegration] 简化表格 ${sheet.name} 失败:`, error);
      }
    }
    
    return success;
  } catch (error) {
    console.error('[TableMemoryIntegration] 简化表格记忆历史失败:', error);
    return false;
  }
}

/**
 * 获取LLM实例
 * @returns LLM实例
 */
async function getLLM(): Promise<any> {
  try {
    // 尝试从Mem0Service获取LLM实例
    let Mem0Service: any;
    try {
      Mem0Service = require('../services/Mem0Service').default.getInstance();
      if (Mem0Service && Mem0Service.memoryRef && Mem0Service.memoryRef.llm) {
        return Mem0Service.memoryRef.llm;
      }
    } catch (error) {
      console.log('[TableMemoryIntegration] 无法从Mem0Service获取LLM实例，尝试其他方式');
    }
    
    // 如果无法从Mem0Service获取，尝试从MobileMemory获取
    try {
      const MobileMemory = require('../mobile-memory').MobileMemory;
      const memoryInstance = new MobileMemory();
      return memoryInstance.llm;
    } catch (error) {
      console.log('[TableMemoryIntegration] 无法从MobileMemory获取LLM实例');
    }
    
    return null;
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取LLM实例失败:', error);
    return null;
  }
}

/**
 * 获取角色名称和AI名称
 * @param characterId 角色ID
 * @returns 名称对象
 */
export function getCustomNames(characterId: string): { userName: string; aiName: string } {
  try {
    // 尝试从Mem0Service获取自定义名称
    let Mem0Service: any;
    try {
      Mem0Service = require('../services/Mem0Service').default.getInstance();
      if (Mem0Service) {
        return {
          userName: Mem0Service.getUserName(characterId) || '用户',
          aiName: Mem0Service.getAIName(characterId) || 'AI'
        };
      }
    } catch (error) {
      console.log('[TableMemoryIntegration] 无法从Mem0Service获取自定义名称');
    }
    
    return { userName: '用户', aiName: 'AI' };
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取自定义名称失败:', error);
    return { userName: '用户', aiName: 'AI' };
  }
}
