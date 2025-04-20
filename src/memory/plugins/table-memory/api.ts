/**
 * 表格记忆增强插件 - 公共API接口
 * 
 * 该文件定义了与Mem0系统交互的公共API接口，
 * 提供简单统一的方法调用表格记忆增强插件的功能。
 */

import { SheetManager } from './services/sheet-manager';
import { TemplateManager } from './services/template-manager';
import { Sheet } from './models/sheet';
import { SheetTemplate } from './models/template';
import { isEnabled, initialize, setEnabled } from './index';

/**
 * 处理聊天消息，更新相关表格
 * @param messages 消息列表或消息文本
 * @param options 处理选项
 * @returns 处理结果，包括已更新的表格ID列表
 */
export async function processChat(
  messages: any[] | string,
  options: {
    characterId: string;
    conversationId: string;
    userName?: string;
    aiName?: string;
    isMultiRound?: boolean;
  }
): Promise<{ updatedSheets: string[] }> {
  try {
    // 检查插件是否启用和初始化
    if (!isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过处理聊天消息');
      return { updatedSheets: [] };
    }
    
    // Enhanced logging to help debug ID issues
    console.log(`[TableMemory] processChat - Original IDs - characterId: "${options.characterId}" (${typeof options.characterId}), conversationId: "${options.conversationId}" (${typeof options.conversationId})`);
    
    // Ensure consistent ID handling
    const safeCharacterId = String(options.characterId || '').trim();
    const safeConversationId = options.conversationId ? String(options.conversationId).trim() : safeCharacterId;
    
    console.log(`[TableMemory] processChat - Normalized IDs - safeCharacterId: "${safeCharacterId}", safeConversationId: "${safeConversationId}"`);
    
    // 获取此角色的现有表格
    console.log(`[TableMemory] Calling SheetManager.getSheetsByCharacter with IDs: "${safeCharacterId}", "${safeConversationId}"`);
    const existingSheets = await SheetManager.getSheetsByCharacter(
      safeCharacterId,
      safeConversationId
    );
    
    console.log(`[TableMemory] 找到 ${existingSheets.length} 个现有表格`);
    
    // List all found tables for debugging
    if (existingSheets.length > 0) {
      console.log('[TableMemory] Found existing tables:');
      existingSheets.forEach((sheet, index) => {
        console.log(`[TableMemory] ${index + 1}. ID: ${sheet.uid}, name: ${sheet.name}, characterId: "${sheet.characterId}", conversationId: "${sheet.conversationId}"`);
      });
      
      // Important: Check if the IDs in the sheet records match our safe IDs
      existingSheets.forEach((sheet, index) => {
        if (sheet.characterId !== safeCharacterId) {
          console.warn(`[TableMemory] ⚠️ Sheet ${index + 1} has mismatched characterId: "${sheet.characterId}" vs expected "${safeCharacterId}"`);
        }
        if (sheet.conversationId !== safeConversationId) {
          console.warn(`[TableMemory] ⚠️ Sheet ${index + 1} has mismatched conversationId: "${sheet.conversationId}" vs expected "${safeConversationId}"`);
        }
      });
    }
    
    // 如果没有表格，且有已选择的模板，则创建表格
    if (existingSheets.length === 0) {
      console.log('[TableMemory] No existing tables found, checking for templates to create new tables');
      const selectedTemplates = await getSelectedTemplates();
      console.log(`[TableMemory] Found ${selectedTemplates.length} selected templates`);
      
      if (selectedTemplates.length > 0) {
        console.log('[TableMemory] 没有找到表格，从模板创建新表格');
        console.log(`[TableMemory] Creating tables with IDs: "${safeCharacterId}", "${safeConversationId}"`);
        
        const createdTableIds = await createSheetsFromTemplates(
          selectedTemplates,
          safeCharacterId,
          safeConversationId
        );
        
        console.log(`[TableMemory] Created ${createdTableIds.length} new tables with IDs: ${createdTableIds.join(', ')}`);
      } else {
        console.log('[TableMemory] 没有选择模板，跳过表格创建');
      }
    } else {
      console.log(`[TableMemory] 使用现有表格，跳过创建新表格`);
      console.log(`[TableMemory] Existing sheet IDs: ${existingSheets.map(s => s.uid).join(', ')}`);
    }
    
    // 重新获取表格（包括可能刚创建的）
    console.log(`[TableMemory] Refreshing sheets with IDs: "${safeCharacterId}", "${safeConversationId}"`);
    const sheets = await SheetManager.getSheetsByCharacter(
      safeCharacterId,
      safeConversationId
    );
    
    if (sheets.length === 0) {
      console.log('[TableMemory] 没有找到可用表格，跳过处理');
      return { updatedSheets: [] };
    }
    
    // Debug: List all available tables
    console.log('[TableMemory] 当前可用的表格:');
    sheets.forEach(sheet => {
      console.log(`- "${sheet.name}" (ID: ${sheet.uid}), CharID: ${sheet.characterId}, ConversationId: ${sheet.conversationId}`);
    });
    
    // 准备消息内容
    const messageContent = typeof messages === 'string'
      ? messages
      : messages.map(m => {
          const role = m.role === 'assistant' ? (options.aiName || 'AI') : (options.userName || '用户');
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `${role}: ${content}`;
        }).join('\n\n');
    
    // 处理每个表格
    const updatedSheets: string[] = [];
    for (const sheet of sheets) {
      try {
        console.log(`[TableMemory] 处理表格 "${sheet.name}" (ID: ${sheet.uid})`);
        
        // 使用表格管理器处理对话内容
        const updated = await SheetManager.processSheetWithChat(
          sheet.uid, 
          messageContent,
          {
            isMultiRound: options.isMultiRound,
            userName: options.userName,
            aiName: options.aiName
          }
        );
        
        if (updated) {
          updatedSheets.push(sheet.uid);
          console.log(`[TableMemory] 表格 "${sheet.name}" (ID: ${sheet.uid}) 已更新`);
        } else {
          console.log(`[TableMemory] 表格 "${sheet.name}" (ID: ${sheet.uid}) 无需更新`);
        }
      } catch (error) {
        console.error(`[TableMemory] 处理表格 "${sheet.name}" (ID: ${sheet.uid}) 时出错:`, error);
      }
    }
    
    return { updatedSheets };
  } catch (error) {
    console.error('[TableMemory] 处理聊天消息失败:', error);
    return { updatedSheets: [] };
  }
}

/**
 * 获取已选择的表格模板
 * @returns 已选择的模板列表
 */
export async function getSelectedTemplates(): Promise<SheetTemplate[]> {
  try {
    // 从存储中获取设置
    const settings = await TemplateManager.getSettings();
    const selectedIds = settings.selectedTemplates || [];
    
    if (selectedIds.length === 0) {
      return [];
    }
    
    // 获取所有模板
    const allTemplates = await TemplateManager.getAllTemplates();
    
    // 过滤出已选择的模板
    return allTemplates.filter(template => selectedIds.includes(template.uid));
  } catch (error) {
    console.error('[TableMemory] 获取已选择的模板失败:', error);
    return [];
  }
}

/**
 * 根据模板创建表格
 * @param templates 模板列表
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 创建的表格ID列表
 */
export async function createSheetsFromTemplates(
  templates: SheetTemplate[] | string[],
  characterId: string,
  conversationId: string
): Promise<string[]> {
  try {
    // Enhanced logging for debugging
    console.log(`[TableMemory] createSheetsFromTemplates - characterId: "${characterId}", conversationId: "${conversationId}"`);
    
    const createdSheetIds: string[] = [];
    
    // 如果输入是模板ID数组，先获取完整模板
    let templateObjects = Array.isArray(templates) && typeof templates[0] === 'string'
      ? await Promise.all((templates as string[]).map(id => TemplateManager.getTemplate(id)))
      : templates as SheetTemplate[];
    
    // 过滤掉无效模板
    templateObjects = templateObjects.filter(Boolean);
    
    if (templateObjects.length === 0) {
      console.log('[TableMemory] No valid templates to create sheets from');
      return [];
    }
    
    console.log(`[TableMemory] Creating sheets from ${templateObjects.length} templates`);
    
    // Ensure IDs are properly formatted strings
    const safeCharacterId = String(characterId || '').trim();
    const safeConversationId = conversationId ? String(conversationId).trim() : safeCharacterId;
    
    console.log(`[TableMemory] Using normalized IDs - characterId: "${safeCharacterId}", conversationId: "${safeConversationId}"`);
    
    // 为每个模板创建表格
    for (const template of templateObjects) {
      try {
        if (!template) continue;
        console.log(`[TableMemory] Creating sheet from template: ${template.name} (${template.uid})`);
        
        const sheet = await SheetManager.createSheet({
          templateId: template.uid,
          name: template.name,
          characterId: safeCharacterId,
          conversationId: safeConversationId
        });
        
        console.log(`[TableMemory] Successfully created sheet: ${sheet.name} (${sheet.uid}) with characterId: "${sheet.characterId}", conversationId: "${sheet.conversationId}"`);
        createdSheetIds.push(sheet.uid);
      } catch (error) {
        console.error(`[TableMemory] 从模板 ${template!.name} 创建表格失败:`, error);
      }
    }
    
    if (createdSheetIds.length > 0) {
      // Verify that the created tables can be retrieved
      console.log(`[TableMemory] Verifying created sheets can be retrieved...`);
      const verificationCheck = await SheetManager.getSheetsByCharacter(
        safeCharacterId,
        safeConversationId
      );
      
      console.log(`[TableMemory] Verification found ${verificationCheck.length} sheets`);
      verificationCheck.forEach((sheet, index) => {
        console.log(`[TableMemory] Verification ${index + 1}: ${sheet.name} (${sheet.uid}), characterId: "${sheet.characterId}", conversationId: "${sheet.conversationId}"`);
      });
    }
    
    return createdSheetIds;
  } catch (error) {
    console.error('[TableMemory] 从模板创建表格失败:', error);
    return [];
  }
}

/**
 * 获取角色的所有表格
 * @param characterId 角色ID
 * @param conversationId 可选的会话ID
 * @returns 表格列表
 */
export async function getCharacterSheets(
  characterId: string,
  conversationId?: string
): Promise<Sheet[]> {
  return SheetManager.getSheetsByCharacter(characterId, conversationId);
}

/**
 * 获取单个表格详情
 * @param sheetId 表格ID
 * @returns 表格对象或null
 */
export async function getSheet(sheetId: string): Promise<Sheet | null> {
  try {
    if (!isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过获取表格');
      return null;
    }
    
    console.log(`[TableMemory] 获取表格详情: ${sheetId}`);
    return await SheetManager.getSheet(sheetId);
  } catch (error) {
    console.error(`[TableMemory] 获取表格 ${sheetId} 详情失败:`, error);
    return null;
  }
}

/**
 * 通过名称获取表格
 * @param tableName 表格名称
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 表格对象或null
 */
export async function getSheetByName(
  tableName: string,
  characterId: string,
  conversationId?: string
): Promise<Sheet | null> {
  try {
    if (!isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过获取表格');
      return null;
    }
    
    // Ensure consistent type handling for IDs
    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;
    
    console.log(`[TableMemory] 通过名称获取表格: "${tableName}" for character ${safeCharacterId}, conversation ${safeConversationId}`);
    
    // 首先获取角色的所有表格
    const sheets = await SheetManager.getSheetsByCharacter(
      safeCharacterId,
      safeConversationId
    );
    
    console.log(`[TableMemory] 找到 ${sheets.length} 个表格，开始寻找名为 "${tableName}" 的表格`);
    
    // Debug: List all available tables
    if (sheets.length > 0) {
      console.log('[TableMemory] 当前可用的表格:');
      sheets.forEach(sheet => {
        console.log(`- "${sheet.name}" (ID: ${sheet.uid})`);
      });
    }
    
    // 先进行精确匹配
    const exactMatch = sheets.find(sheet => sheet.name === tableName);
    
    if (exactMatch) {
      console.log(`[TableMemory] 找到精确匹配表格: "${tableName}", ID: ${exactMatch.uid}`);
      return exactMatch;
    }
    
    // 进行不区分大小写的匹配
    const caseInsensitiveMatch = sheets.find(sheet => 
      sheet.name.toLowerCase() === tableName.toLowerCase()
    );
    
    if (caseInsensitiveMatch) {
      console.log(`[TableMemory] 找到不区分大小写匹配的表格: "${caseInsensitiveMatch.name}", ID: ${caseInsensitiveMatch.uid}`);
      return caseInsensitiveMatch;
    }
    
    // 尝试模糊匹配 (检查表格名是否包含搜索名或搜索名包含表格名)
    const fuzzyMatches = sheets.filter(sheet => 
      sheet.name.includes(tableName) || 
      tableName.includes(sheet.name)
    );
    
    if (fuzzyMatches.length > 0) {
      // 选择最相似的匹配项 (优先选择较短的名称以避免过度匹配)
      const bestMatch = fuzzyMatches.sort((a, b) => a.name.length - b.name.length)[0];
      console.log(`[TableMemory] 找到部分匹配表格: "${bestMatch.name}", ID: ${bestMatch.uid}`);
      return bestMatch;
    }
    
    // 如果前面都没有找到匹配项，尝试特殊情况处理
    // 对于常见的表格类型进行名称变体检查
    if (tableName.includes('表格')) {
      // 尝试不包含"表格"的搜索
      const nameWithoutType = tableName.replace(/表格/, '').trim();
      
      const withoutTypeMatch = sheets.find(sheet => 
        sheet.name.includes(nameWithoutType) && nameWithoutType.length > 0
      );
      
      if (withoutTypeMatch) {
        console.log(`[TableMemory] 找到名称变体匹配的表格: "${withoutTypeMatch.name}", ID: ${withoutTypeMatch.uid}`);
        return withoutTypeMatch;
      }
    }
    
    console.log(`[TableMemory] 未找到名为 "${tableName}" 的表格`);
    return null;
  } catch (error) {
    console.error(`[TableMemory] 通过名称获取表格失败:`, error);
    return null;
  }
}

/**
 * 向表格插入行
 * @param sheetId 表格ID
 * @param rowData 行数据 (键是列索引，值是单元格内容)
 * @returns 是否成功
 */
export async function insertRow(
  sheetId: string,
  rowData: Record<number, string>
): Promise<boolean> {
  try {
    await SheetManager.insertRow(sheetId, rowData);
    return true;
  } catch (error) {
    console.error(`[TableMemory] 向表格 ${sheetId} 插入行失败:`, error);
    return false;
  }
}

/**
 * 更新表格中的行
 * @param sheetId 表格ID
 * @param rowIndex 行索引 (从0开始)
 * @param rowData 行数据 (键是列索引，值是单元格内容)
 * @returns 是否成功
 */
export async function updateRow(
  sheetId: string,
  rowIndex: number,
  rowData: Record<number, string>
): Promise<boolean> {
  try {
    await SheetManager.updateRow(sheetId, rowIndex, rowData);
    return true;
  } catch (error) {
    console.error(`[TableMemory] 更新表格 ${sheetId} 的行 ${rowIndex} 失败:`, error);
    return false;
  }
}

/**
 * 删除表格中的行
 * @param sheetId 表格ID
 * @param rowIndex 行索引 (从0开始)
 * @returns 是否成功
 */
export async function deleteRow(
  sheetId: string,
  rowIndex: number
): Promise<boolean> {
  try {
    await SheetManager.deleteRow(sheetId, rowIndex);
    return true;
  } catch (error) {
    console.error(`[TableMemory] 删除表格 ${sheetId} 的行 ${rowIndex} 失败:`, error);
    return false;
  }
}

/**
 * 删除表格
 * @param sheetId 表格ID
 * @returns 是否成功删除
 */
export async function deleteSheet(sheetId: string): Promise<boolean> {
  try {
    if (!isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过删除表格');
      return false;
    }
    
    const success = await SheetManager.deleteSheet(sheetId);
    if (success) {
      console.log(`[TableMemory] 表格 ${sheetId} 删除成功`);
    } else {
      console.log(`[TableMemory] 表格 ${sheetId} 删除失败或不存在`);
    }
    return success;
  } catch (error) {
    console.error(`[TableMemory] 删除表格 ${sheetId} 失败:`, error);
    return false;
  }
}

/**
 * 初始化插件
 * @param options 初始化选项
 * @returns 是否成功
 */
export async function init(options: { 
  dbPath?: string; 
  defaultTemplates?: boolean;
  enabled?: boolean;
} = {}): Promise<boolean> {
  try {
    const success = await initialize(options);
    
    // 设置启用状态
    if (success && options.enabled !== undefined) {
      setEnabled(options.enabled);
    }
    
    return success;
  } catch (error) {
    console.error('[TableMemory] API初始化失败:', error);
    return false;
  }
}

/**
 * 设置选中的模板
 * @param templateIds 模板ID列表
 * @returns 是否成功
 */
export async function selectTemplates(templateIds: string[]): Promise<boolean> {
  try {
    const templates = await Promise.all(
      templateIds.map(id => TemplateManager.getTemplate(id))
    );
    
    // 过滤掉不存在的模板
    const validTemplateIds = templates
      .filter((template): template is NonNullable<typeof template> => Boolean(template))
      .map(template => template.uid);
    
    // 更新设置
    await TemplateManager.updateSettings({
      selectedTemplates: validTemplateIds
    });
    
    return true;
  } catch (error) {
    console.error('[TableMemory] 设置选中模板失败:', error);
    return false;
  }
}

/**
 * 获取已选模板ID列表
 * @returns 选中的模板ID列表
 */
export async function getSelectedTemplateIds(): Promise<string[]> {
  try {
    const settings = await TemplateManager.getSettings();
    return settings.selectedTemplates || [];
  } catch (error) {
    console.error('[TableMemory] 获取选中模板ID失败:', error);
    return [];
  }
}

/**
 * 通过特定提示词重建表格
 * @param sheetId 表格ID
 * @param chatContent 对话内容
 * @param promptType 提示词类型
 * @returns 是否成功
 */
export async function rebuildSheet(
  sheetId: string,
  chatContent: string,
  promptType: 'rebuild_base' | 'rebuild_compatible' | 'rebuild_summary' | 'rebuild_fix_all' | 'rebuild_fix_simplify_all' | 'rebuild_fix_simplify_without_history' | 'rebuild_simplify_history' = 'rebuild_base'
): Promise<boolean> {
  try {
    // 检查插件是否启用
    if (!isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过重建表格');
      return false;
    }
    
    // 获取表格
    const sheet = await SheetManager.getSheet(sheetId);
    if (!sheet) {
      throw new Error(`未找到表格 ${sheetId}`);
    }
    
    console.log(`[TableMemory] 重建表格 "${sheet.name}"，使用提示词类型: ${promptType}`);
    
    // 从profile_prompts中获取对应的提示词
    let prompt = '';
    try {
      const profilePrompts = require('../../../ref_prompt/profile_prompts').profile_prompts;
      const selectedPrompt = profilePrompts[promptType];
      
      if (selectedPrompt && selectedPrompt.core_rules) {
        prompt = selectedPrompt.core_rules;
      } else {
        throw new Error(`未找到提示词类型 ${promptType}`);
      }
    } catch (error) {
      console.error('[TableMemory] 获取提示词失败，使用默认提示词:', error);
      // 使用默认提示词
      prompt = `请分析对话内容，更新表格。你可以添加新行、更新现有行或删除不再相关的行。`;
    }
    
    // 使用自定义提示词处理表格
    const updated = await SheetManager.processSheetWithCustomPrompt(
      sheetId,
      chatContent,
      prompt
    );
    
    return updated;
  } catch (error) {
    console.error('[TableMemory] 重建表格失败:', error);
    return false;
  }
}
