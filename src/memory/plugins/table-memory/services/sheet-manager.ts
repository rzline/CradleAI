/**
 * 表格记忆增强插件 - 表格管理服务
 * 
 * 该服务负责管理表格实例，包括表格的创建、查询、更新和删除等操作，
 * 同时提供与LLM交互处理表格数据的功能。
 */

import { StorageService } from './storage-service';
import { TemplateManager } from './template-manager';
import { 
  Sheet,
  CreateSheetOptions,
  createSheet,
  getRowCount,
  getColumnCount,
  getRow,
  toText
} from '../models/sheet';
import { 
  Cell,
  createCell,
  updateCellValue,
  markCellDeleted
} from '../models/cell';
import { SheetTemplate } from '../models/template';

// 尝试从MobileMemory导入LLM工厂
let LLMFactory: any;
try {
  const { LLMFactory: Factory } = require('../../../utils/factory');
  LLMFactory = Factory;
} catch (error) {
  console.warn('[TableMemory] 无法加载LLMFactory，将创建备用LLM实例');
}

/**
 * 表格管理服务
 */
export class SheetManager {
  private static initialized = false;
  private static llmInstance: any = null;
  private static operationInProgress: boolean = false;
  private static operationQueue: Array<{
    operation: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  
  // 添加处理过的表格集合，防止重复处理
  private static processedSheets: Set<string> = new Set();
  
  /**
   * 初始化表格管理器
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      console.log('[TableMemory] 初始化表格管理器...');
      
      this.initialized = true;
      console.log('[TableMemory] 表格管理器初始化完成');
    } catch (error) {
      console.error('[TableMemory] 初始化表格管理器失败:', error);
      throw error;
    }
  }
  
  /**
   * 安全执行操作，防止并发冲突
   */
  private static async safelyExecute<T>(operation: () => Promise<T>): Promise<T> {
    // 创建Promise并立即返回，将实际执行放入队列
    return new Promise<T>((resolve, reject) => {
      // 将操作和解析/拒绝函数添加到队列
      this.operationQueue.push({
        operation,
        resolve,
        reject
      });
      
      // 如果没有操作正在进行，启动队列处理
      if (!this.operationInProgress) {
        this.processOperationQueue();
      }
    });
  }
  
  /**
   * 处理操作队列
   */
  private static async processOperationQueue(): Promise<void> {
    // 如果没有队列项或已有操作正在进行，直接返回
    if (this.operationQueue.length === 0 || this.operationInProgress) {
      return;
    }
    
    // 标记正在处理
    this.operationInProgress = true;
    
    // 获取队列中的第一项
    const item = this.operationQueue.shift()!;
    
    try {
      // 执行操作
      const result = await item.operation();
      
      // 操作成功，解析Promise
      item.resolve(result);
    } catch (error) {
      console.error('[TableMemory] 表格管理操作失败:', error);
      // 操作失败，拒绝Promise
      item.reject(error);
    } finally {
      // 标记操作已完成
      this.operationInProgress = false;
      
      // 处理队列中的下一项
      if (this.operationQueue.length > 0) {
        setTimeout(() => this.processOperationQueue(), 0);
      }
    }
  }
  
  /**
   * 获取或创建LLM实例
   * @returns LLM实例
   */
  private static async getLLM(): Promise<any> {
    if (this.llmInstance) {
      return this.llmInstance;
    }
    
    try {
      // 尝试从Mem0Service获取LLM实例
      let Mem0Service: any;
      try {
        Mem0Service = require('../../../services/Mem0Service').default.getInstance();
        if (Mem0Service && Mem0Service.memoryRef && Mem0Service.memoryRef.llm) {
          console.log('[TableMemory] 从Mem0Service获取LLM实例');
          this.llmInstance = Mem0Service.memoryRef.llm;
          return this.llmInstance;
        }
      } catch (error) {
        console.log('[TableMemory] 无法从Mem0Service获取LLM实例，将创建新实例');
      }
      
      // 如果无法从Mem0Service获取，创建备用实例
      if (LLMFactory) {
        console.log('[TableMemory] 使用LLMFactory创建新的LLM实例');
        this.llmInstance = LLMFactory.create('mobile_llm', {
          apiProvider: 'gemini',
          model: 'gemini-1.5-pro-latest'
        });
      } else {
        throw new Error('无法创建LLM实例，LLMFactory不可用');
      }
      
      return this.llmInstance;
    } catch (error) {
      console.error('[TableMemory] 获取LLM实例失败:', error);
      throw error;
    }
  }
  
  /**
   * 创建新表格
   * @param options 创建选项
   * @returns 创建的表格
   */
  static async createSheet(options: CreateSheetOptions): Promise<Sheet> {
    return this.safelyExecute(async () => {
      try {
        // Ensure IDs are properly formatted
        const safeCharacterId = String(options.characterId || '').trim();
        const safeConversationId = options.conversationId ? String(options.conversationId).trim() : safeCharacterId;
        
        console.log(`[TableMemory] 创建新表格: ${options.name}, 模板ID: ${options.templateId}`);
        console.log(`[TableMemory] Using IDs - characterId: "${safeCharacterId}", conversationId: "${safeConversationId}"`);
        
        // 获取模板
        const template = await TemplateManager.getTemplate(options.templateId);
        if (!template) {
          throw new Error(`未找到模板 ${options.templateId}`);
        }
        
        // 创建表格 - use safe IDs
        const sheet = createSheet({
          ...options,
          characterId: safeCharacterId,
          conversationId: safeConversationId
        });
        
        // Log created sheet details
        console.log(`[TableMemory] Created new sheet object: ${sheet.name} (${sheet.uid})`);
        console.log(`[TableMemory] Sheet IDs - characterId: "${sheet.characterId}", conversationId: "${sheet.conversationId}"`);
        
        // 创建标题行单元格
        const headerCells: Cell[] = [];
        template.columns.forEach((column, index) => {
          headerCells.push(
            createCell({
              sheetId: sheet.uid,
              rowIndex: 0,
              colIndex: index,
              value: column.value
            })
          );
        });
        
        // 添加标题行单元格到表格
        sheet.cells = headerCells;
        
        // 保存表格
        await StorageService.saveSheet(sheet);
        console.log(`[TableMemory] 成功创建表格 "${sheet.name}", ID: ${sheet.uid}`);
        
        // Verify the sheet was saved correctly by retrieving it
        const savedSheet = await StorageService.getSheet(sheet.uid);
        if (savedSheet) {
          console.log(`[TableMemory] Verification - Sheet saved successfully: ${savedSheet.name} (${savedSheet.uid})`);
          console.log(`[TableMemory] Saved sheet IDs - characterId: "${savedSheet.characterId}", conversationId: "${savedSheet.conversationId}"`);
        } else {
          console.warn(`[TableMemory] ⚠️ Warning: Could not verify sheet was saved!`);
        }
        
        return sheet;
      } catch (error) {
        console.error('[TableMemory] 创建表格失败:', error);
        throw error;
      }
    });
  }
  
  /**
   * 获取表格
   * @param sheetId 表格ID
   * @returns 表格对象或null
   */
  static async getSheet(sheetId: string): Promise<Sheet | null> {
    try {
      return await StorageService.getSheet(sheetId);
    } catch (error) {
      console.error(`[TableMemory] 获取表格 ${sheetId} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 获取角色的所有表格
   * @param characterId 角色ID
   * @param conversationId 可选的对话ID
   * @returns 表格列表
   */
  static async getSheetsByCharacter(characterId: string, conversationId?: string): Promise<Sheet[]> {
    try {
      return await StorageService.getSheetsByCharacter(characterId, conversationId);
    } catch (error) {
      console.error(`[TableMemory] 获取角色 ${characterId} 的表格失败:`, error);
      throw error;
    }
  }
  
  /**
   * 更新表格
   * @param sheet 表格对象
   * @returns 更新后的表格对象
   */
  static async updateSheet(sheet: Sheet): Promise<Sheet> {
    try {
      // 更新时间戳
      sheet.updatedAt = new Date().toISOString();
      
      await StorageService.saveSheet(sheet);
      console.log(`[TableMemory] 成功更新表格 "${sheet.name}"`);
      return sheet;
    } catch (error) {
      console.error(`[TableMemory] 更新表格 ${sheet.uid} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 删除表格
   * @param sheetId 表格ID
   * @returns 是否成功
   */
  static async deleteSheet(sheetId: string): Promise<boolean> {
    try {
      const sheet = await this.getSheet(sheetId);
      if (!sheet) {
        console.log(`[TableMemory] 未找到要删除的表格 ${sheetId}`);
        return false;
      }
      
      await StorageService.deleteSheet(sheetId);
      console.log(`[TableMemory] 成功删除表格 "${sheet.name}"`);
      return true;
    } catch (error) {
      console.error(`[TableMemory] 删除表格 ${sheetId} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 向表格中插入行
   * @param sheetId 表格ID
   * @param rowData 行数据 (键是列索引，值是单元格内容)
   * @returns 新行的行索引
   */
  static async insertRow(sheetId: string, rowData: Record<number, string>): Promise<number> {
    return this.safelyExecute(async () => {
      try {
        // Validate that we're using a proper sheetId, not a name
        if (typeof sheetId !== 'string' || 
            !sheetId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          console.error(`[TableMemory] 无效的表格ID格式: ${sheetId}`);
          throw new Error(`无效的表格ID格式: ${sheetId}`);
        }
        
        const sheet = await this.getSheet(sheetId);
        if (!sheet) {
          // Provide more information about the error
          console.error(`[TableMemory] 未找到表格 ${sheetId}`);
          throw new Error(`未找到表格 ${sheetId}`);
        }
        
        // Get table information for better logging
        console.log(`[TableMemory] 向表格 "${sheet.name}" (ID: ${sheet.uid}) 插入行`);
        
        // 获取表格的列数
        const columnCount = getColumnCount(sheet);
        
        // 获取当前最大行索引
        const maxRowIndex = await StorageService.getMaxRowIndex(sheetId);
        
        // FIXED: Ensure we're adding after the last row, never overwriting row 0 (header)
        let newRowIndex = Math.max(maxRowIndex + 1, 1);
        
        // 记录实际行索引，用于日志
        console.log(`[TableMemory] 当前表格最大行索引: ${maxRowIndex}, 新行将插入在索引: ${newRowIndex}`);
        
        // 创建新行的单元格
        const newCells: Cell[] = [];
        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
          const value = rowData[colIndex] || '';
          newCells.push(
            createCell({
              sheetId,
              rowIndex: newRowIndex,
              colIndex,
              value
            })
          );
        }
        
        // 将新单元格添加到表格中
        sheet.cells = [...sheet.cells, ...newCells];
        
        // 更新表格
        await this.updateSheet(sheet);
        console.log(`[TableMemory] 向表格 "${sheet.name}" 插入行，行索引: ${newRowIndex}`);
        
        return newRowIndex;
      } catch (error) {
        console.error(`[TableMemory] 向表格 ${sheetId} 插入行失败:`, error);
        throw error;
      }
    });
  }
  
  /**
   * 更新表格中的行
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   * @param rowData 行数据 (键是列索引，值是单元格内容)
   * @returns 是否成功
   */
  static async updateRow(sheetId: string, rowIndex: number, rowData: Record<number, string>): Promise<boolean> {
    return this.safelyExecute(async () => {
      try {
        // Validate that we're using a proper sheetId, not a name
        if (typeof sheetId !== 'string' || 
            !sheetId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          console.error(`[TableMemory] 无效的表格ID格式: ${sheetId}`);
          throw new Error(`无效的表格ID格式: ${sheetId}`);
        }
        
        const sheet = await this.getSheet(sheetId);
        if (!sheet) {
          // Provide more information about the error
          console.error(`[TableMemory] 未找到表格 ${sheetId}`);
          throw new Error(`未找到表格 ${sheetId}`);
        }
        
        // Get table information for better logging
        console.log(`[TableMemory] 更新表格 "${sheet.name}" (ID: ${sheet.uid}) 的行 ${rowIndex}`);
        
        // 检查行索引是否有效
        if (rowIndex < 0 || rowIndex >= getRowCount(sheet)) {
          throw new Error(`无效的行索引 ${rowIndex}`);
        }
        
        // 更新行中的单元格
        const rowCells = sheet.cells.filter(cell => cell.rowIndex === rowIndex);
        
        // 更新每个单元格
        let updated = false;
        for (const cell of rowCells) {
          if (rowData[cell.colIndex] !== undefined && rowData[cell.colIndex] !== cell.value) {
            const updatedCell = updateCellValue(cell, rowData[cell.colIndex]);
            
            // 更新sheet.cells中的单元格
            const cellIndex = sheet.cells.findIndex(c => c.uid === cell.uid);
            if (cellIndex !== -1) {
              sheet.cells[cellIndex] = updatedCell;
              updated = true;
            }
          }
        }
        
        // 如果有更新，保存表格
        if (updated) {
          await this.updateSheet(sheet);
          console.log(`[TableMemory] 更新表格 "${sheet.name}" 中的行 ${rowIndex}`);
        } else {
          console.log(`[TableMemory] 表格 "${sheet.name}" 中的行 ${rowIndex} 无需更新`);
        }
        
        return true;
      } catch (error) {
        console.error(`[TableMemory] 更新表格 ${sheetId} 中的行 ${rowIndex} 失败:`, error);
        throw error;
      }
    });
  }
  
  /**
   * 删除表格中的行
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   * @returns 是否成功
   */
  static async deleteRow(sheetId: string, rowIndex: number): Promise<boolean> {
    try {
      const sheet = await this.getSheet(sheetId);
      if (!sheet) {
        throw new Error(`未找到表格 ${sheetId}`);
      }
      
      // 检查行索引是否有效
      if (rowIndex <= 0 || rowIndex >= getRowCount(sheet)) { // 注意：不能删除标题行(rowIndex=0)
        throw new Error(`无效的行索引或尝试删除标题行 ${rowIndex}`);
      }
      
      // 标记行中的单元格为删除状态
      const rowCells = sheet.cells.filter(cell => cell.rowIndex === rowIndex);
      for (const cell of rowCells) {
        const deletedCell = markCellDeleted(cell);
        
        // 更新sheet.cells中的单元格
        const cellIndex = sheet.cells.findIndex(c => c.uid === cell.uid);
        if (cellIndex !== -1) {
          sheet.cells[cellIndex] = deletedCell;
        }
      }
      
      // 从表格中移除该行的单元格
      sheet.cells = sheet.cells.filter(cell => cell.rowIndex !== rowIndex);
      
      // 更新行索引大于删除行的单元格
      for (let i = 0; i < sheet.cells.length; i++) {
        if (sheet.cells[i].rowIndex > rowIndex) {
          sheet.cells[i].rowIndex--;
        }
      }
      
      // 保存表格
      await this.updateSheet(sheet);
      console.log(`[TableMemory] 删除表格 ${sheet.name} 中的行 ${rowIndex}`);
      
      return true;
    } catch (error) {
      console.error(`[TableMemory] 删除表格 ${sheetId} 中的行 ${rowIndex} 失败:`, error);
      throw error;
    }
  }

  /**
   * 批量处理多个表格
   * @param sheets 表格列表
   * @param chatContent 对话内容
   * @param options 处理选项
   * @returns 已更新的表格ID列表
   */
  static async processSheetsInBatch(
    sheets: Sheet[],
    chatContent: string,
    options: {
      userName?: string;
      aiName?: string;
      isMultiRound?: boolean;
      alreadyUpdatedSheets?: string[]; // 新增: 已通过其他方式更新的表格ID列表
    } = {}
  ): Promise<string[]> {
    return this.safelyExecute(async () => {
      try {
        if (sheets.length === 0) {
          console.log('[TableMemory] 没有表格需要批量处理');
          return [];
        }

        // 过滤掉已经更新过的表格
        if (options.alreadyUpdatedSheets && options.alreadyUpdatedSheets.length > 0) {
          const sheetsToProcess = sheets.filter(sheet => !options.alreadyUpdatedSheets?.includes(sheet.uid));
          if (sheetsToProcess.length === 0) {
            console.log('[TableMemory] 所有表格已通过其他方式更新，跳过批处理');
            return [];
          }
          sheets = sheetsToProcess;
        }

        console.log(`[TableMemory] 批量处理 ${sheets.length} 个表格`);
        
        // 准备所有表格的文本表示，用于统一批处理
        const sheetTexts: Record<string, string> = {};
        const sheetIdToNameMap: Record<string, string> = {};
        sheets.forEach(sheet => {
          const tableText = `表格名称: ${sheet.name}\n${toText(sheet)}`;
          sheetTexts[sheet.uid] = tableText;
          sheetIdToNameMap[sheet.uid] = sheet.name;
        });
        
        // 构建批处理请求
        const batchPrompt = `我需要你同时更新多个相关表格。请根据对话内容，同时关注所有表格之间的关系，确保信息在各表格间保持一致。

以下是所有需要更新的表格:
${Object.entries(sheetTexts).map(([id, text], index) => `
---- 表格 ${index + 1} ----
${text}
`).join('\n')}

对话内容:
${chatContent || '对话内容为空，请基于当前表格内容进行更新或优化。'}

请使用JSON格式返回对这些表格的更新操作。格式如下:
{
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "表格ID",
      "sheetName": "表格名称", 
      "rowData": {"0": "第一列的值", "1": "第二列的值"}
    },
    {
      "action": "update",
      "sheetId": "表格ID",
      "sheetName": "表格名称",
      "rowIndex": 1,
      "rowData": {"0": "更新的值", "1": "更新的值"}
    }
  ]
}

可以使用的表格ID和名称对应关系:
${Object.entries(sheetIdToNameMap).map(([id, name]) => `"${name}": "${id}"`).join('\n')}

请确保只使用这些有效的表格ID或名称，操作类型为"insert"/"update"/"delete"。`;

        // 获取LLM实例
        console.log('[TableMemory] 执行批量表格处理');
        
        const llm = await this.getLLM();
        if (!llm) {
          throw new Error('LLM实例不可用');
        }
        
        // 调用LLM获取批处理响应
        const response = await llm.generateResponse([
          { role: 'user', content: '你是一个专业的表格管理助手，能够精确分析对话并更新多个表格。' },
          { role: 'user', content: batchPrompt }
        ]);
        
        // 解析响应
        const llmResponse = typeof response === 'string' ? response : response.content;
        console.log(`[TableMemory] 批处理 LLM 响应(前200字符): ${llmResponse.substring(0, 200)}...`);
        
        const updatedSheets: string[] = [];
        
        // 解析JSON操作
        try {
          // 尝试提取JSON部分
          const jsonMatches = llmResponse.match(/\{[\s\S]*?\}/g);
          if (jsonMatches) {
            let parsedJson = null;
            // 尝试解析每个匹配项
            for (const match of jsonMatches) {
              try {
                const json = JSON.parse(match);
                if (json.tableActions && Array.isArray(json.tableActions)) {
                  parsedJson = json;
                  break;
                }
              } catch (e) {
                // 继续尝试下一个
              }
            }
            
            if (parsedJson && parsedJson.tableActions) {
              console.log(`[TableMemory] 成功解析批处理响应，包含 ${parsedJson.tableActions.length} 个操作`);
              
              // 处理每个表格操作
              for (const action of parsedJson.tableActions) {
                // 确保 action 有有效的 sheetId
                let targetSheetId = action.sheetId;
                
                // 如果提供了表格名称但没有 ID，尝试查找
                if (!targetSheetId && action.sheetName) {
                  // 通过名称查找表格 ID
                  const matchingSheetEntry = Object.entries(sheetIdToNameMap).find(
                    ([_, name]) => name === action.sheetName
                  );
                  
                  if (matchingSheetEntry) {
                    targetSheetId = matchingSheetEntry[0];
                  }
                }
                
                if (!targetSheetId) {
                  console.warn(`[TableMemory] 操作缺少有效的表格ID或名称，跳过`);
                  continue;
                }
                
                try {
                  // 执行操作
                  let operationSuccess = false;
                  
                  switch (action.action) {
                    case 'insert':
                      if (action.rowData) {
                        await this.insertRow(targetSheetId, action.rowData);
                        operationSuccess = true;
                      }
                      break;
                      
                    case 'update':
                      if (action.rowIndex !== undefined && action.rowData) {
                        if (action.rowIndex === 0) {
                          console.warn(`[TableMemory] 尝试更新标题行（行索引0），已阻止此操作`);
                        } else {
                          await this.updateRow(targetSheetId, action.rowIndex, action.rowData);
                          operationSuccess = true;
                        }
                      }
                      break;
                      
                    case 'delete':
                      if (action.rowIndex !== undefined) {
                        if (action.rowIndex === 0) {
                          console.warn(`[TableMemory] 尝试删除标题行（行索引0），已阻止此操作`);
                        } else {
                          await this.deleteRow(targetSheetId, action.rowIndex);
                          operationSuccess = true;
                        }
                      }
                      break;
                      
                    default:
                      console.warn(`[TableMemory] 未知的表格操作: ${action.action}`);
                  }
                  
                  // 如果操作成功且表格ID不在已更新列表中，则添加
                  if (operationSuccess && !updatedSheets.includes(targetSheetId)) {
                    updatedSheets.push(targetSheetId);
                    
                    // 添加到处理过的表格集合
                    this.processedSheets.add(targetSheetId);
                  }
                } catch (err) {
                  console.error(`[TableMemory] 执行表格操作失败:`, err);
                }
              }
            }
          }
        } catch (jsonError) {
          console.error(`[TableMemory] 解析批处理响应为JSON失败:`, jsonError);
          throw jsonError;
        }
        
        return updatedSheets;
      } catch (error) {
        console.error(`[TableMemory] 批量处理表格失败:`, error);
        throw error;
      }
    });
  }
  
  /**
   * 处理对话内容更新表格 - 优化版，避免重复调用LLM
   * @param sheets 要处理的表格列表
   * @param chatContent 对话内容
   * @param options 处理选项
   * @returns 成功更新的表格ID列表
   */
  static async processSheets(
    sheets: Sheet[], 
    chatContent: string,
    options: {
      isMultiRound?: boolean;
      userName?: string;
      aiName?: string;
      firstTryBatch?: boolean; // 是否首先尝试批处理
      initialTableActions?: any[]; // 已经从LLM响应中提取的表格操作
    } = {}
  ): Promise<string[]> {
    return this.safelyExecute(async () => {
      try {
        // 每次新的处理开始时，清空处理过的表格集合
        this.processedSheets.clear();
        
        // 记录已成功更新的表格ID
        const updatedSheets: string[] = [];
        
        // 1. 首先处理已有的表格操作指令（如果有的话）
        if (options.initialTableActions && options.initialTableActions.length > 0) {
          console.log(`[TableMemory] 处理${options.initialTableActions.length}条已提取的表格操作指令`);
          
          for (const action of options.initialTableActions) {
            try {
              // 确保 action 有有效的 sheetId 或 sheetName
              let targetSheetId = action.sheetId;
              
              // 如果提供了表格名称但没有 ID，尝试查找
              if (!targetSheetId && action.sheetName) {
                const matchingSheet = sheets.find(sheet => sheet.name === action.sheetName);
                if (matchingSheet) {
                  targetSheetId = matchingSheet.uid;
                }
              }
              
              if (!targetSheetId) {
                console.warn(`[TableMemory] 操作缺少有效的表格ID或名称，跳过`);
                continue;
              }
              
              // 执行表格操作
              let operationSuccess = false;
              
              switch (action.action) {
                case 'insert':
                  if (action.rowData) {
                    await this.insertRow(targetSheetId, action.rowData);
                    operationSuccess = true;
                  }
                  break;
                  
                case 'update':
                  if (action.rowIndex !== undefined && action.rowData) {
                    if (action.rowIndex === 0) {
                      console.warn(`[TableMemory] 尝试更新标题行（行索引0），已阻止此操作`);
                    } else {
                      await this.updateRow(targetSheetId, action.rowIndex, action.rowData);
                      operationSuccess = true;
                    }
                  }
                  break;
                  
                case 'delete':
                  if (action.rowIndex !== undefined) {
                    if (action.rowIndex === 0) {
                      console.warn(`[TableMemory] 尝试删除标题行（行索引0），已阻止此操作`);
                    } else {
                      await this.deleteRow(targetSheetId, action.rowIndex);
                      operationSuccess = true;
                    }
                  }
                  break;
                  
                default:
                  console.warn(`[TableMemory] 未知的表格操作: ${action.action}`);
              }
              
              // 如果操作成功且表格ID不在已更新列表中，则添加
              if (operationSuccess && !updatedSheets.includes(targetSheetId)) {
                updatedSheets.push(targetSheetId);
                
                // 添加到处理过的表格集合，避免重复处理
                this.processedSheets.add(targetSheetId);
              }
            } catch (err) {
              console.error(`[TableMemory] 执行表格操作失败:`, err);
            }
          }
          
          // 如果所有表格都已更新，直接返回
          if (updatedSheets.length === sheets.length) {
            console.log(`[TableMemory] 所有表格已通过初始操作更新，跳过进一步处理`);
            return updatedSheets;
          }
        }
        
        // 2. 如果指定首先尝试批处理，且有多个表格需要处理
        const remainingSheets = sheets.filter(sheet => !this.processedSheets.has(sheet.uid));
        
        if (options.firstTryBatch && remainingSheets.length > 1) {
          try {
            console.log(`[TableMemory] 尝试批量处理剩余的 ${remainingSheets.length} 个表格`);
            
            // 使用批处理方法处理剩余表格
            const batchUpdatedSheets = await this.processSheetsInBatch(
              remainingSheets,
              chatContent,
              {
                isMultiRound: options.isMultiRound,
                userName: options.userName,
                aiName: options.aiName,
                alreadyUpdatedSheets: updatedSheets // 传递已更新表格列表
              }
            );
            
            // 将批处理成功的表格添加到结果中
            if (batchUpdatedSheets && batchUpdatedSheets.length > 0) {
              batchUpdatedSheets.forEach(sheetId => {
                if (!updatedSheets.includes(sheetId)) {
                  updatedSheets.push(sheetId);
                }
              });
              
              console.log(`[TableMemory] 批处理成功更新了 ${batchUpdatedSheets.length} 个表格`);
            } else {
              console.log('[TableMemory] 批处理未更新任何表格，尝试顺序处理');
            }
          } catch (batchError) {
            console.error(`[TableMemory] 批处理失败:`, batchError);
            console.log('[TableMemory] 批处理失败，回退到顺序处理模式');
          }
        }
        
        // 3. 顺序处理尚未更新的表格
        const notYetUpdated = sheets.filter(sheet => !this.processedSheets.has(sheet.uid));
        
        if (notYetUpdated.length > 0) {
          console.log(`[TableMemory] 使用顺序处理模式处理剩余的 ${notYetUpdated.length} 个表格`);
          
          // 首先将所有表格的文本表示收集到一个映射中
          const allSheetTexts: Record<string, string> = {};
          sheets.forEach(sheet => {
            allSheetTexts[sheet.uid] = `表格名称: ${sheet.name}\n${toText(sheet)}`;
          });
          
          // 顺序处理每个表格
          for (const sheet of notYetUpdated) {
            // 检查是否已经处理过该表格，防止重复处理
            if (this.processedSheets.has(sheet.uid)) {
              console.log(`[TableMemory] 表格 "${sheet.name}" (ID: ${sheet.uid}) 已被处理，跳过`);
              continue;
            }
            
            try {
              console.log(`[TableMemory] 处理表格 "${sheet.name}" (ID: ${sheet.uid})`);
              
              // 使用表格管理器处理对话内容，传入所有表格的上下文
              const updated = await this.processSheetWithChat(
                sheet.uid, 
                chatContent,
                {
                  isMultiRound: options.isMultiRound,
                  userName: options.userName,
                  aiName: options.aiName,
                  allSheetTexts // 传入所有表格的文本表示
                }
              );
              
              // 标记为已处理，防止重复处理
              this.processedSheets.add(sheet.uid);
              
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
        }
        
        return updatedSheets;
      } catch (error) {
        console.error(`[TableMemory] 处理表格失败:`, error);
        return [];
      }
    });
  }
  
  /**
   * 处理对话内容更新表格
   * @param sheetId 表格ID
   * @param chatContent 对话内容
   * @param options 选项
   * @returns 是否有更新
   */
  static async processSheetWithChat(
    sheetId: string, 
    chatContent: string,
    options: {
      isMultiRound?: boolean;
      userName?: string;
      aiName?: string;
      allSheetTexts?: Record<string, string>; // Add: context of all sheets for multi-table editing
    } = {}
  ): Promise<boolean> {
    // 使用safelyExecute包装整个操作，确保它在队列中同步执行
    return this.safelyExecute(async () => {
      try {
        // 如果表格已经被处理过，直接返回
        if (this.processedSheets.has(sheetId)) {
          console.log(`[TableMemory] 表格 ${sheetId} 已被处理，跳过重复处理`);
          return false;
        }
        
        const sheet = await this.getSheet(sheetId);
        if (!sheet) {
          throw new Error(`未找到表格 ${sheetId}`);
        }
        
        // 获取表格对应的模板
        const template = await TemplateManager.getTemplate(sheet.templateId);
        if (!template) {
          throw new Error(`未找到表格 ${sheetId} 对应的模板`);
        }
        
        console.log(`[TableMemory] 使用对话内容处理表格 ${sheet.name}`);
        // 记录传入的对话内容长度
        console.log(`[TableMemory] 收到的对话内容长度: ${chatContent?.length || 0} 字符`);
        if (chatContent && chatContent.length > 0) {
          console.log(`[TableMemory] 对话内容片段(前100字符): ${chatContent.substring(0, 100)}...`);
        } else {
          console.warn(`[TableMemory] 警告: 对话内容为空，表格可能无法正确更新`);
        }
        // 获取LLM实例
        const llm = await this.getLLM();
        if (!llm) {
          throw new Error('LLM实例不可用');
        }
        
        // 构建当前表格的文本表示
        const tableText = toText(sheet);
        
        // 构建提示词
        const systemPrompt = `你是一名专业的表格管理助手。请仔细分析对话内容，并根据提供的规则更新表格。
你需要返回完整的表格内容，并且确保数据遵循指定格式。返回的格式应为markdown表格，或者是JSON格式的表格操作指令。`;
        
        // 基于模板类型和配置构建用户提示词
        let userPrompt: string;
        
        // 如果表格只有标题行，则进行初始化
        if (getRowCount(sheet) <= 1) {
          // 修改初始化提示词，确保包含对话内容和明确的输出格式要求
          const initPromptBase = template.initPrompt || `请根据以下对话内容，初始化表格。表格标题行已经提供，你需要添加内容行。`;
          userPrompt = `${initPromptBase}

当前表格模板:
${tableText}
`;

          // 如果存在多表格上下文，添加相关信息
          if (options.allSheetTexts && Object.keys(options.allSheetTexts).length > 0) {
            userPrompt += `
其他相关表格:
${Object.entries(options.allSheetTexts)
  .filter(([id, _]) => id !== sheetId) // 排除当前表格
  .map(([_, text]) => text)
  .join('\n\n')}

请注意，你需要更新的是"${sheet.name}"表格，其他表格仅作为参考信息。
`;
          }

          userPrompt += `
对话内容:
${chatContent || '对话内容为空，请基于表格结构创建合适的初始行。'}

请提供更新后的完整表格，保持格式不变，只添加新行不修改标题行。
你必须以markdown表格形式返回完整表格，从标题行开始，确保格式正确。
你也可以选择返回JSON格式的表格操作指令，例如:
{
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "${sheet.uid}",
      "rowData": {"0": "第一列的值", "1": "第二列的值"}
    }
  ]
}`;
        } else {
          // 根据模板类型选择更新策略
          switch(template.type) {
            case 'dynamic':
              userPrompt = template.updatePrompt || `请根据以下对话内容，更新表格。你可以添加新行、更新现有行或删除不再相关的行。

当前表格:
${tableText}
`;
              
              // 如果存在多表格上下文，添加相关信息
              if (options.allSheetTexts && Object.keys(options.allSheetTexts).length > 0) {
                userPrompt += `
其他相关表格:
${Object.entries(options.allSheetTexts)
  .filter(([id, _]) => id !== sheetId) // 排除当前表格
  .map(([_, text]) => text)
  .join('\n\n')}

请注意，你需要更新的是"${sheet.name}"表格，其他表格仅作为参考信息。
`;
              }

              userPrompt += `
对话内容:
${chatContent || '对话内容为空，请基于当前表格内容进行更新或优化。'}

请提供更新后的完整表格，保持格式不变。
你也可以选择返回JSON格式的表格操作指令，例如:
{
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "${sheet.uid}",
      "rowData": {"0": "第一列的值", "1": "第二列的值"}
    },
    {
      "action": "update",
      "sheetId": "${sheet.uid}",
      "rowIndex": 1,
      "rowData": {"0": "更新的值", "1": "更新的值"}
    }
  ]
}

请注意：第0行是标题行，不要修改标题行。如果要插入数据，请使用insert操作且不要指定rowIndex，系统会自动将行添加到表格末尾。`;
              break;
            
            case 'static':
              userPrompt = `请根据以下对话内容，更新表格中的现有行。注意不要添加或删除行，只更新单元格内容。

当前表格:
${tableText}
`;

              // 如果存在多表格上下文，添加相关信息
              if (options.allSheetTexts && Object.keys(options.allSheetTexts).length > 0) {
                userPrompt += `
其他相关表格:
${Object.entries(options.allSheetTexts)
  .filter(([id, _]) => id !== sheetId) // 排除当前表格
  .map(([_, text]) => text)
  .join('\n\n')}

请注意，你需要更新的是"${sheet.name}"表格，其他表格仅作为参考信息。
`;
              }

              userPrompt += `
对话内容:
${chatContent}

请提供更新后的完整表格，保持格式和行数不变。
你也可以选择返回JSON格式的表格操作指令，例如:
{
  "tableActions": [
    {
      "action": "update",
      "sheetId": "${sheet.uid}",
      "rowIndex": 1,  // 注意：0行是标题行，请只更新1及更高索引的数据行
      "rowData": {"0": "更新的值", "1": "更新的值"}
    }
  ]
}`;
              break;
            
            default:
              userPrompt = `请根据以下对话内容，更新表格。根据需要添加新行或更新现有行。

当前表格:
${tableText}
`;

              // 如果存在多表格上下文，添加相关信息
              if (options.allSheetTexts && Object.keys(options.allSheetTexts).length > 0) {
                userPrompt += `
其他相关表格:
${Object.entries(options.allSheetTexts)
  .filter(([id, _]) => id !== sheetId) // 排除当前表格
  .map(([_, text]) => text)
  .join('\n\n')}

请注意，你需要更新的是"${sheet.name}"表格，其他表格仅作为参考信息。
`;
              }

              userPrompt += `
对话内容:
${chatContent}

请提供更新后的完整表格，保持格式不变。请注意：第0行是标题行，不要修改标题行。
你也可以选择返回JSON格式的表格操作指令，例如:
{
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "${sheet.uid}",
      "rowData": {"0": "第一列的值", "1": "第二列的值"}
    }
  ]
}

请注意：插入数据时不要指定rowIndex，系统会自动将新行添加到表格末尾。`;
          }
        }
        
        // 调用LLM获取更新后的表格
        const response = await llm.generateResponse(
          [
            { role: "user", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        );
        
        // 解析LLM的响应获取更新后的表格
        const llmResponse = typeof response === 'string' ? response : response.content;
        
        // 首先检查是否返回了JSON格式的表格操作指令
        try {
          // 尝试提取JSON部分
          const jsonMatch = llmResponse.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[0]);
            
            if (jsonData.tableActions && Array.isArray(jsonData.tableActions)) {
              console.log(`[TableMemory] 检测到JSON格式的表格操作指令: ${jsonData.tableActions.length}个操作`);
              
              let hasChanges = false;
              
              // 处理每个表格操作
              for (const action of jsonData.tableActions) {
                if (action.sheetId !== sheet.uid) {
                  console.warn(`[TableMemory] 操作指向的表格ID ${action.sheetId} 与当前表格ID ${sheet.uid} 不匹配，跳过`);
                  continue;
                }
                
                switch (action.action) {
                  case 'insert':
                    if (action.rowData) {
                      // FIXED: 确保插入操作总是添加到表格末尾，不使用rowIndex
                      await this.insertRow(sheet.uid, action.rowData);
                      hasChanges = true;
                    }
                    break;
                    
                  case 'update':
                    if (action.rowIndex !== undefined && action.rowData) {
                      // FIXED: 验证不是在更新第0行（标题行）
                      if (action.rowIndex === 0) {
                        console.warn(`[TableMemory] 尝试更新标题行（行索引0），已阻止此操作`);
                      } else {
                        await this.updateRow(sheet.uid, action.rowIndex, action.rowData);
                        hasChanges = true;
                      }
                    }
                    break;
                    
                  case 'delete':
                    if (action.rowIndex !== undefined) {
                      // FIXED: 验证不是在删除第0行（标题行）
                      if (action.rowIndex === 0) {
                        console.warn(`[TableMemory] 尝试删除标题行（行索引0），已阻止此操作`);
                      } else {
                        await this.deleteRow(sheet.uid, action.rowIndex);
                        hasChanges = true;
                      }
                    }
                    break;
                    
                  default:
                    console.warn(`[TableMemory] 未知的表格操作: ${action.action}`);
                }
              }
              
              // 成功处理后，将表格ID添加到处理过的集合中
              if (hasChanges) {
                this.processedSheets.add(sheetId);
              }
              
              return hasChanges;
            }
          }
        } catch (error) {
          // JSON解析失败，继续尝试解析为markdown表格
          console.log("[TableMemory] 未检测到有效的JSON操作指令，尝试解析为markdown表格:", error);
        }
        
    // ----------- 新增：尝试解析 profile_prompts 格式的 JSON 数组 -----------
    try {
      let jsonArray: any = null;
      if (llmResponse.trim().startsWith('[')) {
        jsonArray = JSON.parse(llmResponse.trim());
      }
      if (Array.isArray(jsonArray)) {
        // 查找当前表格
        const tableObj = jsonArray.find((t: any) =>
          t.tableName === sheet.name ||
          t.tableName === sheet.name.replace(/表格$/, '') ||
          sheet.name === (t.tableName + '表格')
        );
        if (tableObj && Array.isArray(tableObj.columns) && Array.isArray(tableObj.content)) {
          // 清除除标题行外的所有单元格
          sheet.cells = sheet.cells.filter(cell => cell.rowIndex === 0);
          // 更新标题行（可选：如需要同步columns）
          const headerRow = sheet.cells.filter(cell => cell.rowIndex === 0);
          for (let c = 0; c < tableObj.columns.length; c++) {
            if (headerRow[c] && headerRow[c].value !== tableObj.columns[c]) {
              headerRow[c].value = tableObj.columns[c];
            }
          }
          // 添加新数据行
          for (let r = 0; r < tableObj.content.length; r++) {
            const rowArr = tableObj.content[r];
            for (let c = 0; c < rowArr.length; c++) {
              sheet.cells.push(
                createCell({
                  sheetId: sheet.uid,
                  rowIndex: r + 1,
                  colIndex: c,
                  value: rowArr[c]
                })
              );
            }
          }
          await this.updateSheet(sheet);
          console.log(`[TableMemory] 成功用 profile_prompts 格式数据更新表格 ${sheet.name}`);
          return true;
        }
      }
    } catch (error) {
      // 不是 profile_prompts 格式，继续尝试markdown表格
    }
    // ----------- 新增结束 -----------

        // 如果不是JSON格式，则按照markdown表格处理
        const updatedTableText = llmResponse;
        
        // 解析表格文本为结构化表格数据
        const updatedSheetData = this.parseTableText(llmResponse, sheet);
        
        // 检查是否有变更
        if (!updatedSheetData || updatedSheetData.length === 0) {
          console.log(`[TableMemory] LLM未返回有效的表格数据`);
          return false;
        }
        
        // 处理变更：保持标题行不变，处理数据行
        let hasChanges = false;
        
        // 获取原表格的行数和列数
        const originalRowCount = getRowCount(sheet);
        const originalColumnCount = getColumnCount(sheet);
        
        // 获取解析后的表格行数和列数
        const newRowCount = updatedSheetData.length;
        const newColumnCount = updatedSheetData[0]?.length || originalColumnCount;
        
        if (newColumnCount !== originalColumnCount) {
          console.warn(`[TableMemory] LLM返回的表格列数 (${newColumnCount}) 与原表格列数 (${originalColumnCount}) 不一致，将保持原列数`);
        }
        
        // 检查标题行是否变更，如果变更则恢复
        const headerRow = getRow(sheet, 0);
        const newHeader = updatedSheetData[0] || [];
        
        for (let c = 0; c < originalColumnCount; c++) {
          const originalHeader = headerRow.find(cell => cell.colIndex === c)?.value || '';
          const newHeaderValue = newHeader[c] || '';
          
          if (originalHeader !== newHeaderValue) {
            console.warn(`[TableMemory] 检测到标题行变更，列${c}: "${originalHeader}" → "${newHeaderValue}"，将恢复原标题`);
            newHeader[c] = originalHeader;
          }
        }
        
        // 处理数据：删除所有现有数据行，然后添加新数据行
        // 先过滤出标题行以外的单元格
        const nonHeaderCells = sheet.cells.filter(cell => cell.rowIndex > 0);
        if (nonHeaderCells.length > 0) {
          // 从sheet中移除这些单元格
          sheet.cells = sheet.cells.filter(cell => cell.rowIndex === 0);
          hasChanges = true;
        }
        
        // 添加新数据行（跳过标题行，从索引1开始）
        for (let r = 1; r < newRowCount; r++) {
          const rowData = updatedSheetData[r];
          // 转换为键值对形式
          const rowValues: Record<number, string> = {};
          
          for (let c = 0; c < originalColumnCount && c < rowData.length; c++) {
            rowValues[c] = rowData[c] || '';
          }
          
          // 创建新行的单元格
          for (let c = 0; c < originalColumnCount; c++) {
            const cellValue = rowValues[c] || '';
            sheet.cells.push(
              createCell({
                sheetId: sheet.uid,
                rowIndex: r,
                colIndex: c,
                value: cellValue
              })
            );
          }
          
          hasChanges = true;
        }
        
        // 如果有变更，更新表格
        if (hasChanges) {
          await this.updateSheet(sheet);
          console.log(`[TableMemory] 成功使用对话内容更新表格 ${sheet.name}`);
          
          // 将表格ID添加到处理过的集合中
          this.processedSheets.add(sheetId);
        } else {
          console.log(`[TableMemory] 表格 ${sheet.name} 无需更新`);
        }
        
        return hasChanges;
      } catch (error) {
        console.error(`[TableMemory] 处理表格 ${sheetId} 的对话内容失败:`, error);
        return false;
      }
    });
  }

  /**
   * 使用自定义提示词处理表格
   * @param sheetId 表格ID
   * @param chatContent 对话内容
   * @param customPrompt 自定义提示词
   * @returns 是否有更新
   */
  static async processSheetWithCustomPrompt(
    sheetId: string, 
    chatContent: string,
    customPrompt: string
  ): Promise<boolean> {
    try {
      const sheet = await this.getSheet(sheetId);
      if (!sheet) {
        throw new Error(`未找到表格 ${sheetId}`);
      }
      
      // 获取表格对应的模板
      const template = await TemplateManager.getTemplate(sheet.templateId);
      if (!template) {
        throw new Error(`未找到表格 ${sheetId} 对应的模板`);
      }
      
      console.log(`[TableMemory] 使用自定义提示词处理表格 ${sheet.name}`);
      
      // 获取LLM实例
      const llm = await this.getLLM();
      if (!llm) {
        throw new Error('LLM实例不可用');
      }
      
      // 构建当前表格的文本表示
      const tableText = toText(sheet);
      
      // 构建系统提示词
      const systemPrompt = `你是一名专业的表格管理助手。请仔细分析对话内容，并根据提供的规则更新表格。
你需要返回完整的表格内容，并且确保数据遵循指定格式。返回的格式应为markdown表格，或者是JSON格式的表格操作指令。`;
      
      // 构建用户提示词，添加标题行保护的说明
      const userPrompt = `${customPrompt}

当前表格:
${tableText}

对话内容:
${chatContent || '对话内容为空，请基于当前表格内容进行更新或优化。'}

请提供更新后的完整表格，保持格式不变。
请注意：第0行是标题行，应始终保持不变。如果需要插入新数据，应添加到表格末尾。
你也可以选择返回JSON格式的表格操作指令，例如:
{
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "${sheet.uid}",
      "rowData": {"0": "第一列的值", "1": "第二列的值"}
    },
    {
      "action": "update",
      "sheetId": "${sheet.uid}",
      "rowIndex": 1,  // 注意：1是第一条数据行，0是标题行，不要修改标题行
      "rowData": {"0": "更新的值", "1": "更新的值"}
    }
  ]
}`;
      
      // 调用LLM获取更新后的表格
      const response = await llm.generateResponse(
        [
          { role: "user", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      );
      
    // 解析LLM的响应
    let llmResponse = typeof response === 'string' ? response : response.content;
    // 新增：打印完整响应内容，便于调试
    // ----------- 新增：strip markdown code block -----------
    // 去除 ```json ... ``` 或 ``` ... ``` 包裹
    llmResponse = llmResponse
      .replace(/^\s*```json\s*/i, '')
      .replace(/^\s*```\s*/i, '')
      .replace(/\s*```[\s\n]*$/i, '')
      .trim();
      console.log('[TableMemory] LLM完整响应内容:', llmResponse);
      // 首先检查是否返回了JSON格式的表格操作指令
      try {
        // 尝试提取JSON部分
        const jsonMatch = llmResponse.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          
          if (jsonData.tableActions && Array.isArray(jsonData.tableActions)) {
            console.log(`[TableMemory] 检测到JSON格式的表格操作指令: ${jsonData.tableActions.length}个操作`);
            
            let hasChanges = false;
            
            // 处理每个表格操作
            for (const action of jsonData.tableActions) {
              if (action.sheetId !== sheet.uid) {
                console.warn(`[TableMemory] 操作指向的表格ID ${action.sheetId} 与当前表格ID ${sheet.uid} 不匹配，跳过`);
                continue;
              }
              
              switch (action.action) {
                case 'insert':
                  if (action.rowData) {
                    // FIXED: 确保插入操作总是添加到表格末尾，不使用rowIndex
                    await this.insertRow(sheet.uid, action.rowData);
                    hasChanges = true;
                  }
                  break;
                  
                case 'update':
                  if (action.rowIndex !== undefined && action.rowData) {
                    // FIXED: 验证不是在更新第0行（标题行）
                    if (action.rowIndex === 0) {
                      console.warn(`[TableMemory] 尝试更新标题行（行索引0），已阻止此操作`);
                    } else {
                      await this.updateRow(sheet.uid, action.rowIndex, action.rowData);
                      hasChanges = true;
                    }
                  }
                  break;
                  

                  case 'delete':
                                    if (action.rowIndex !== undefined) {
                                      // FIXED: 验证不是在删除第0行（标题行）
                                      if (action.rowIndex === 0) {
                                        console.warn(`[TableMemory] 尝试删除标题行（行索引0），已阻止此操作`);
                                      } else {
                                        await this.deleteRow(sheet.uid, action.rowIndex);
                                        hasChanges = true;
                                      }
                                    }
                                    break;
                                    
                                  default:
                                    console.warn(`[TableMemory] 未知的表格操作: ${action.action}`);
                                }
                              }
                              
                              return hasChanges;
                            }
                          }
                        } catch (error) {
                          // JSON解析失败，继续尝试解析为markdown表格
                          console.log("[TableMemory] 未检测到有效的JSON操作指令，尝试解析为markdown表格");
                        }
                        
                        // 解析表格文本为结构化表格数据
                        const updatedSheetData = this.parseTableText(llmResponse, sheet);
                        
                        // 检查是否有变更
                        if (!updatedSheetData || updatedSheetData.length === 0) {
                          console.log(`[TableMemory] LLM未返回有效的表格数据`);
                          return false;
                        }
                        
                        // 处理变更：保持标题行不变，处理数据行
                        let hasChanges = false;
                        
                        // 获取原表格的行数和列数
                        const originalRowCount = getRowCount(sheet);
                        const originalColumnCount = getColumnCount(sheet);
                        
                        // 获取解析后的表格行数和列数
                        const newRowCount = updatedSheetData.length;
                        const newColumnCount = updatedSheetData[0]?.length || originalColumnCount;
                        
                        if (newColumnCount !== originalColumnCount) {
                          console.warn(`[TableMemory] LLM返回的表格列数 (${newColumnCount}) 与原表格列数 (${originalColumnCount}) 不一致，将保持原列数`);
                        }
                        
                        // 检查标题行是否变更，如果变更则恢复
                        const headerRow = getRow(sheet, 0);
                        const newHeader = updatedSheetData[0] || [];
                        
                        for (let c = 0; c < originalColumnCount; c++) {
                          const originalHeader = headerRow.find(cell => cell.colIndex === c)?.value || '';
                          const newHeaderValue = newHeader[c] || '';
                          
                          if (originalHeader !== newHeaderValue) {
                            console.warn(`[TableMemory] 检测到标题行变更，列${c}: "${originalHeader}" → "${newHeaderValue}"，将恢复原标题`);
                            newHeader[c] = originalHeader;
                          }
                        }
                        
                        // 处理数据：删除所有现有数据行，然后添加新数据行
                        // 先过滤出标题行以外的单元格
                        const nonHeaderCells = sheet.cells.filter(cell => cell.rowIndex > 0);
                        if (nonHeaderCells.length > 0) {
                          // 从sheet中移除这些单元格
                          sheet.cells = sheet.cells.filter(cell => cell.rowIndex === 0);
                          hasChanges = true;
                        }
                        
                        // 添加新数据行（跳过标题行，从索引1开始）
                        for (let r = 1; r < newRowCount; r++) {
                          const rowData = updatedSheetData[r];
                          // 转换为键值对形式
                          const rowValues: Record<number, string> = {};
                          
                          for (let c = 0; c < originalColumnCount && c < rowData.length; c++) {
                            rowValues[c] = rowData[c] || '';
                          }
                          
                          // 创建新行的单元格
                          for (let c = 0; c < originalColumnCount; c++) {
                            const cellValue = rowValues[c] || '';
                            sheet.cells.push(
                              createCell({
                                sheetId: sheet.uid,
                                rowIndex: r,
                                colIndex: c,
                                value: cellValue
                              })
                            );
                          }
                          
                          hasChanges = true;
                        }
                        
                        // 如果有变更，更新表格
                        if (hasChanges) {
                          await this.updateSheet(sheet);
                          console.log(`[TableMemory] 成功使用自定义提示词更新表格 ${sheet.name}`);
                        } else {
                          console.log(`[TableMemory] 表格 ${sheet.name} 无需更新`);
                        }
                        
                        return hasChanges;
                      } catch (error) {
                        console.error(`[TableMemory] 使用自定义提示词处理表格 ${sheetId} 失败:`, error);
                        return false;
                      }
                    }
                  
                    /**
                     * 合并两个表格
                     * @param sourceSheetId 源表格ID
                     * @param targetSheetId 目标表格ID
                     * @returns 是否成功
                     */
                    static async mergeSheets(sourceSheetId: string, targetSheetId: string): Promise<boolean> {
                      try {
                        // 获取源表格和目标表格
                        const sourceSheet = await this.getSheet(sourceSheetId);
                        const targetSheet = await this.getSheet(targetSheetId);
                        
                        if (!sourceSheet || !targetSheet) {
                          throw new Error('源表格或目标表格不存在');
                        }
                        
                        // 检查两个表格的列数是否相同
                        const sourceColumnCount = getColumnCount(sourceSheet);
                        const targetColumnCount = getColumnCount(targetSheet);
                        
                        if (sourceColumnCount !== targetColumnCount) {
                          throw new Error('源表格和目标表格的列数不同，无法合并');
                        }
                        
                        // 获取目标表格的最大行索引
                        const targetRowCount = getRowCount(targetSheet);
                        
                        // 获取源表格的所有非标题行
                        const sourceDataRows = Array.from(
                          { length: getRowCount(sourceSheet) - 1 }, 
                          (_, i) => getRow(sourceSheet, i + 1)
                        );
                        
                        // 为每行源数据创建新的行索引
                        let rowsAdded = 0;
                        for (const sourceRow of sourceDataRows) {
                          if (sourceRow.length === 0) continue;
                          
                          // 检查目标表格中是否已有相同的行
                          const isDuplicate = Array.from({ length: targetRowCount - 1 }, (_, i) => i + 1)
                            .some(rowIndex => {
                              const targetRow = getRow(targetSheet, rowIndex);
                              // 检查每个单元格的值是否相同
                              return targetRow.every((cell, idx) => 
                                cell.value === (sourceRow.find(c => c.colIndex === idx)?.value || '')
                              );
                            });
                          
                          if (isDuplicate) {
                            console.log('[TableMemory] 跳过重复行');
                            continue;
                          }
                          
                          // 创建新行
                          const newRowIndex = targetRowCount + rowsAdded;
                          const rowData: Record<number, string> = {};
                          
                          // 填充行数据
                          sourceRow.forEach(cell => {
                            rowData[cell.colIndex] = cell.value;
                          });
                          
                          // 插入行
                          await this.insertRow(targetSheetId, rowData);
                          rowsAdded++;
                        }
                        
                        console.log(`[TableMemory] 成功合并表格，添加了 ${rowsAdded} 行`);
                        return true;
                      } catch (error) {
                        console.error('[TableMemory] 合并表格失败:', error);
                        return false;
                      }
                    }
                  
                    /**
                     * 导入表格数据
                     * @param data 表格JSON数据
                     * @param characterId 角色ID
                     * @param conversationId 会话ID
                     * @returns 创建的表格ID
                     */
                    static async importSheet(data: any, characterId: string, conversationId: string): Promise<string | null> {
                      try {
                        // 验证数据
                        if (!data || !data.templateId || !data.name) {
                          throw new Error('无效的表格数据');
                        }
                        
                        // 检查模板是否存在
                        const template = await TemplateManager.getTemplate(data.templateId);
                        if (!template) {
                          // 如果模板不存在，尝试创建新模板
                          if (data.template) {
                            const newTemplate = await TemplateManager.createTemplate({
                              name: data.template.name || data.name,
                              type: data.template.type || 'dynamic',
                              columns: data.template.columns || [],
                              rows: data.template.rows || 2,
                              note: data.template.note || '',
                              initPrompt: data.template.initPrompt || '',
                              insertPrompt: data.template.insertPrompt || '',
                              deletePrompt: data.template.deletePrompt || '',
                              updatePrompt: data.template.updatePrompt || ''
                            });
                            
                            data.templateId = newTemplate.uid;
                          } else {
                            throw new Error(`模板 ${data.templateId} 不存在`);
                          }
                        }
                        
                        // 创建新表格
                        const sheet = await this.createSheet({
                          templateId: data.templateId,
                          name: data.name,
                          characterId,
                          conversationId,
                          initialCells: data.cells || []
                        });
                        
                        console.log(`[TableMemory] 成功导入表格 "${sheet.name}"`);
                        return sheet.uid;
                      } catch (error) {
                        console.error('[TableMemory] 导入表格数据失败:', error);
                        return null;
                      }
                    }
                  
                    /**
                     * 清空表格数据（保留结构）
                     * @param sheetId 表格ID
                     * @returns 是否成功
                     */
                    static async clearSheet(sheetId: string): Promise<boolean> {
                      try {
                        const sheet = await this.getSheet(sheetId);
                        if (!sheet) {
                          throw new Error(`未找到表格 ${sheetId}`);
                        }
                        
                        // 保留标题行，删除所有其他行
                        sheet.cells = sheet.cells.filter(cell => cell.rowIndex === 0);
                        
                        // 更新表格
                        await this.updateSheet(sheet);
                        
                        console.log(`[TableMemory] 成功清空表格 "${sheet.name}"`);
                        return true;
                      } catch (error) {
                        console.error(`[TableMemory] 清空表格 ${sheetId} 失败:`, error);
                        return false;
                      }
                    }
                    
                    /**
                     * 解析表格文本为二维数组
                     * @param tableText 表格文本
                     * @param originalSheet 原始表格
                     * @returns 二维字符串数组
                     */
                    private static parseTableText(tableText: string, originalSheet: Sheet): string[][] {
                      try {
                            // 新增：优先尝试解析 profile_prompts 格式的 JSON 数组
    const trimmed = tableText.trim();
    if (trimmed.startsWith('[')) {
      try {
        const jsonArray = JSON.parse(trimmed);
        // 查找与当前表格名称匹配的对象
        const tableObj = jsonArray.find((t: any) =>
          t.tableName === originalSheet.name ||
          t.tableName === originalSheet.name.replace(/表格$/, '') ||
          originalSheet.name === (t.tableName + '表格')
        );
        if (tableObj && Array.isArray(tableObj.columns) && Array.isArray(tableObj.content)) {
          // 返回二维数组，第一行为 columns，后续为 content
          return [tableObj.columns, ...tableObj.content];
        }
      } catch (e) {
        // 不是合法的JSON数组，继续走markdown表格逻辑
      }
    }
                        // 只保留markdown表格部分
                        let markdownTable = tableText;
                        
                        // 如果文本包含多个表格，尝试获取第一个完整的表格
                        const tableRegex = /\|(.+\|)+\n\|([-:]+\|)+\n(\|.+\|(\n|$))+/g;
                        const tables = markdownTable.match(tableRegex);
                        
                        if (tables && tables.length > 0) {
                          markdownTable = tables[0];
                        }
                        
                        // 分割行
                        const lines = markdownTable.split('\n').filter(line => line.trim().startsWith('|') && line.trim().endsWith('|'));
                        
                        // 移除分隔行（通常是第二行，包含 ---|---|--- 等）
                        const contentLines = lines.filter(line => !line.match(/^\s*\|[-:\s|]+\|\s*$/));
                        
                        if (contentLines.length === 0) {
                          console.warn('[TableMemory] 未能从响应中提取有效的表格内容');
                          return [];
                        }
                        
                        // 解析每行
                        const result: string[][] = [];
                        
                        for (const line of contentLines) {
                          // 去除行开头和结尾的 |，然后按 | 分割
                          const cells = line.trim()
                            .replace(/^\||\|$/g, '')  // 移除开头和结尾的 |
                            .split('|')                // 按 | 分割
                            .map(cell => cell.trim()); // 修剪每个单元格内容
                          
                          result.push(cells);
                        }
                        
                        return result;
                      } catch (error) {
                        console.error('[TableMemory] 解析表格文本失败:', error);
                        return [];
                      }
                    }
                    
                    /**
                     * 创建模板实例的表格
                     * @param template 表格模板
                     * @param characterId 角色ID
                     * @param conversationId 会话ID
                     * @returns 创建的表格对象
                     */
                    static async createSheetFromTemplate(
                      template: SheetTemplate,
                      characterId: string,
                      conversationId: string
                    ): Promise<Sheet> {
                      try {
                        const sheet = await this.createSheet({
                          templateId: template.uid,
                          name: template.name,
                          characterId,
                          conversationId
                        });
                        
                        console.log(`[TableMemory] 从模板 ${template.name} 创建表格成功`);
                        return sheet;
                      } catch (error) {
                        console.error(`[TableMemory] 从模板 ${template.name} 创建表格失败:`, error);
                        throw error;
                      }
                    }
                  }
