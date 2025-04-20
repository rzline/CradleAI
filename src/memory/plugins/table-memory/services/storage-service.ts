/**
 * 表格记忆增强插件 - 存储服务
 * 
 * 该服务负责处理与数据库的交互，提供表格数据的持久化存储。
 */

import * as SQLite from 'expo-sqlite';
import { getDatabasePath } from '../../../utils/file-system';
import { SheetTemplate, TemplateSettings } from '../models/template';
import { Sheet } from '../models/sheet';
import { Cell } from '../models/cell';

// 数据库实例
let db: SQLite.SQLiteDatabase | null = null;

// 操作队列
type QueuedOperation = {
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retry: number;
};

/**
 * 存储服务
 */
export class StorageService {
  // 队列管理
  private static operationQueue: QueuedOperation[] = [];
  private static isProcessingQueue = false;
  private static maxRetries = 5;
  private static retryDelay = 200; // 基础重试延迟，毫秒
  
  /**
   * 初始化存储服务
   * @param dbPath 可选的数据库路径
   */
  static async initialize(dbPath?: string): Promise<void> {
    try {
      if (db) {
        console.log('[TableMemory] 存储服务已初始化，跳过');
        return;
      }
      
      // 确定数据库路径
      const path = dbPath || await getDatabasePath('table_memory.db');
      console.log(`[TableMemory] 初始化数据库: ${path}`);
      
      // 打开数据库
      db = SQLite.openDatabaseSync(path);
      
      // 创建表结构
      await this.createTables();
      
      console.log('[TableMemory] 存储服务初始化完成');
    } catch (error) {
      console.error('[TableMemory] 初始化存储服务失败:', error);
      throw error;
    }
  }
  
  /**
   * 创建数据库表
   */
  private static async createTables(): Promise<void> {
    if (!db) {
      throw new Error('数据库未初始化');
    }
    
    // 创建模板表
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS templates (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        columns TEXT NOT NULL,
        rows INTEGER NOT NULL,
        note TEXT,
        init_prompt TEXT,
        insert_prompt TEXT,
        delete_prompt TEXT,
        update_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // 创建表格表
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sheets (
        uid TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        character_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (template_id) REFERENCES templates (uid)
      )
    `);
    
    // 创建单元格表
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS cells (
        uid TEXT PRIMARY KEY,
        sheet_id TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        col_index INTEGER NOT NULL,
        value TEXT NOT NULL,
        history TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (sheet_id) REFERENCES sheets (uid)
      )
    `);
    
    // 创建设置表
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    // 创建索引
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sheets_character ON sheets (character_id)`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cells_sheet ON cells (sheet_id)`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cells_position ON cells (sheet_id, row_index, col_index)`);
  }
  
  /**
   * 将操作添加到队列
   * @param operation 数据库操作函数
   * @returns 操作结果Promise
   */
  private static enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // 创建队列项
      const queueItem: QueuedOperation = {
        operation,
        resolve,
        reject,
        retry: 0
      };
      
      // 添加到队列
      this.operationQueue.push(queueItem);
      
      // 如果队列未在处理，启动处理
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }
  
  /**
   * 处理操作队列
   */
  private static async processQueue(): Promise<void> {
    // 如果已在处理队列或队列为空，直接返回
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }
    
    // 标记为正在处理
    this.isProcessingQueue = true;
    
    try {
      while (this.operationQueue.length > 0) {
        // 获取队列中的第一个操作
        const item = this.operationQueue[0];
        
        try {
          // 执行操作
          const result = await item.operation();
          
          // 操作成功，移除队列并解析Promise
          this.operationQueue.shift();
          item.resolve(result);
        } catch (error) {
          // 检查是否是数据库锁定错误
          const isLockError = error instanceof Error && 
            (error.message.includes('database is locked') || 
             error.message.includes('busy') ||
             error.message.includes('cannot start a transaction'));
          
          if (isLockError && item.retry < this.maxRetries) {
            // 增加重试次数
            item.retry++;
            
            // 使用指数退避算法计算延迟
            const delay = this.retryDelay * Math.pow(1.5, item.retry - 1);
            console.log(`[TableMemory] 数据库忙，延迟 ${delay}ms 后重试 (${item.retry}/${this.maxRetries})`);
            
            // 从队列中移除，延迟后重新添加到队尾
            this.operationQueue.shift();
            
            await new Promise(resolve => setTimeout(resolve, delay));
            this.operationQueue.push(item);
          } else {
            // 达到最大重试次数或非锁定错误，从队列中移除并拒绝Promise
            this.operationQueue.shift();
            console.error('[TableMemory] 数据库操作失败，无法重试:', error);
            item.reject(error);
          }
        }
      }
    } finally {
      // 处理完成，重置标记
      this.isProcessingQueue = false;
      
      // 如果处理过程中有新操作入队，继续处理
      if (this.operationQueue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * 安全执行数据库操作
   * @param operation 数据库操作函数
   * @returns 操作结果
   */
  private static async safeExecute<T>(operation: () => Promise<T>): Promise<T> {
    if (!db) {
      throw new Error('数据库未初始化');
    }
    
    // 将操作添加到队列
    return this.enqueueOperation(operation);
  }
  
  /**
   * 保存模板
   * @param template 模板对象
   */
  static async saveTemplate(template: SheetTemplate): Promise<void> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      await db.runAsync(
        `INSERT OR REPLACE INTO templates 
        (uid, name, type, columns, rows, note, init_prompt, insert_prompt, delete_prompt, update_prompt, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          template.uid,
          template.name,
          template.type,
          JSON.stringify(template.columns),
          template.rows,
          template.note || '',
          template.initPrompt || '',
          template.insertPrompt || '',
          template.deletePrompt || '',
          template.updatePrompt || '',
          template.createdAt || new Date().toISOString(),
          template.updatedAt || new Date().toISOString()
        ]
      );
    });
  }
  
  /**
   * 获取所有模板
   * @returns 模板列表
   */
  static async getAllTemplates(): Promise<SheetTemplate[]> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const results = await db.getAllAsync<{
        uid: string;
        name: string;
        type: string;
        columns: string;
        rows: number;
        note: string;
        init_prompt: string;
        insert_prompt: string;
        delete_prompt: string;
        update_prompt: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM templates ORDER BY name`);
      
      return results.map(row => ({
        uid: row.uid,
        name: row.name,
        type: row.type as any,
        columns: JSON.parse(row.columns),
        rows: row.rows,
        note: row.note,
        initPrompt: row.init_prompt,
        insertPrompt: row.insert_prompt,
        deletePrompt: row.delete_prompt,
        updatePrompt: row.update_prompt,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    });
  }
  
  /**
   * 获取模板
   * @param uid 模板ID
   * @returns 模板对象或null
   */
  static async getTemplate(uid: string): Promise<SheetTemplate | null> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const result = await db.getFirstAsync<{
        uid: string;
        name: string;
        type: string;
        columns: string;
        rows: number;
        note: string;
        init_prompt: string;
        insert_prompt: string;
        delete_prompt: string;
        update_prompt: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM templates WHERE uid = ?`, [uid]);
      
      if (!result) return null;
      
      return {
        uid: result.uid,
        name: result.name,
        type: result.type as any,
        columns: JSON.parse(result.columns),
        rows: result.rows,
        note: result.note,
        initPrompt: result.init_prompt,
        insertPrompt: result.insert_prompt,
        deletePrompt: result.delete_prompt,
        updatePrompt: result.update_prompt,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    });
  }
  
  /**
   * 删除模板
   * @param uid 模板ID
   */
  static async deleteTemplate(uid: string): Promise<void> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      await db.runAsync(`DELETE FROM templates WHERE uid = ?`, [uid]);
    });
  }
  
  /**
   * 保存表格
   * @param sheet 表格对象
   */
  static async saveSheet(sheet: Sheet): Promise<void> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      // 使用事务确保原子操作
      await db.withExclusiveTransactionAsync(async (tx) => {
        // 保存表格基本信息
        await tx.runAsync(
          `INSERT OR REPLACE INTO sheets 
          (uid, template_id, name, character_id, conversation_id, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            sheet.uid,
            sheet.templateId,
            sheet.name,
            sheet.characterId,
            sheet.conversationId,
            sheet.createdAt,
            sheet.updatedAt
          ]
        );
        
        // 保存单元格数据
        for (const cell of sheet.cells) {
          await tx.runAsync(
            `INSERT OR REPLACE INTO cells 
            (uid, sheet_id, row_index, col_index, value, history, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              cell.uid,
              sheet.uid,
              cell.rowIndex,
              cell.colIndex,
              cell.value,
              JSON.stringify(cell.history),
              cell.createdAt,
              cell.updatedAt
            ]
          );
        }
      });
    });
  }
  
  /**
   * 获取表格
   * @param uid 表格ID
   * @returns 表格对象或null
   */
  static async getSheet(uid: string): Promise<Sheet | null> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      // 获取表格基本信息
      const sheetResult = await db.getFirstAsync<{
        uid: string;
        template_id: string;
        name: string;
        character_id: string;
        conversation_id: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM sheets WHERE uid = ?`, [uid]);
      
      if (!sheetResult) return null;
      
      // 获取表格的单元格
      const cellResults = await db.getAllAsync<{
        uid: string;
        sheet_id: string;
        row_index: number;
        col_index: number;
        value: string;
        history: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM cells WHERE sheet_id = ?`, [uid]);
      
      return {
        uid: sheetResult.uid,
        templateId: sheetResult.template_id,
        name: sheetResult.name,
        characterId: sheetResult.character_id,
        conversationId: sheetResult.conversation_id,
        createdAt: sheetResult.created_at,
        updatedAt: sheetResult.updated_at,
        cells: cellResults.map(cell => ({
          uid: cell.uid,
          sheetId: cell.sheet_id,
          rowIndex: cell.row_index,
          colIndex: cell.col_index,
          value: cell.value,
          history: JSON.parse(cell.history),
          createdAt: cell.created_at,
          updatedAt: cell.updated_at
        }))
      };
    });
  }
  
  /**
   * 删除表格
   * @param uid 表格ID
   */
  static async deleteSheet(uid: string): Promise<void> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      await db.withExclusiveTransactionAsync(async (tx) => {
        // 先删除单元格
        await tx.runAsync(`DELETE FROM cells WHERE sheet_id = ?`, [uid]);
        
        // 再删除表格
        await tx.runAsync(`DELETE FROM sheets WHERE uid = ?`, [uid]);
      });
    });
  }
  
  /**
   * 获取所有表格
   * @returns 表格列表
   */
  static async getAllSheets(): Promise<Sheet[]> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const sheetResults = await db.getAllAsync<{
        uid: string;
        template_id: string;
        name: string;
        character_id: string;
        conversation_id: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM sheets`);
      
      const sheets: Sheet[] = [];
      
      for (const sheetResult of sheetResults) {
        // 获取表格的单元格
        const cellResults = await db.getAllAsync<{
          uid: string;
          sheet_id: string;
          row_index: number;
          col_index: number;
          value: string;
          history: string;
          created_at: string;
          updated_at: string;
        }>(`SELECT * FROM cells WHERE sheet_id = ?`, [sheetResult.uid]);
        
        sheets.push({
          uid: sheetResult.uid,
          templateId: sheetResult.template_id,
          name: sheetResult.name,
          characterId: sheetResult.character_id,
          conversationId: sheetResult.conversation_id,
          createdAt: sheetResult.created_at,
          updatedAt: sheetResult.updated_at,
          cells: cellResults.map(cell => ({
            uid: cell.uid,
            sheetId: cell.sheet_id,
            rowIndex: cell.row_index,
            colIndex: cell.col_index,
            value: cell.value,
            history: JSON.parse(cell.history),
            createdAt: cell.created_at,
            updatedAt: cell.updated_at
          }))
        });
      }
      
      return sheets;
    });
  }

  /**
   * 获取角色的所有表格
   * @param characterId 角色ID
   * @param conversationId 可选的对话ID
   * @returns 表格列表
   */
  static async getSheetsByCharacter(characterId: string, conversationId?: string): Promise<Sheet[]> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      // Enhanced logging to help debug the issue
      console.log(`[StorageService] Running getSheetsByCharacter - characterId: "${characterId}" (${typeof characterId}), conversationId: "${conversationId}" (${typeof conversationId})`);
      
      // Ensure consistent ID handling by converting to string
      const safeCharacterId = String(characterId || '').trim();
      const safeConversationId = conversationId ? String(conversationId).trim() : safeCharacterId;
      
      console.log(`[StorageService] Normalized IDs - safeCharacterId: "${safeCharacterId}", safeConversationId: "${safeConversationId}"`);
      
      // First try a direct query without any string manipulation - just use parameters
      // Log all database operations for debugging
      console.log(`[StorageService] Database query: SELECT * FROM sheets WHERE character_id = ? AND conversation_id = ?`);
      console.log(`[StorageService] Query parameters: [${safeCharacterId}, ${safeConversationId}]`);
      
      // Query with both characterId and conversationId
      const exactResults = await db.getAllAsync<{
        uid: string;
        template_id: string;
        name: string;
        character_id: string;
        conversation_id: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT * FROM sheets WHERE character_id = ? AND conversation_id = ?`,
        [safeCharacterId, safeConversationId]
      );
      
      console.log(`[StorageService] Direct match query found ${exactResults.length} sheets`);
      
      // Dump the first few results for inspection
      if (exactResults.length > 0) {
        console.log(`[StorageService] First match details - ID: ${exactResults[0].uid}, name: ${exactResults[0].name}`);
        console.log(`[StorageService] Match character_id: "${exactResults[0].character_id}", conversation_id: "${exactResults[0].conversation_id}"`);
      }
      
      // If we found exact matches, process them
      if (exactResults.length > 0) {
        // Fetch cells for each sheet
        const sheets: Sheet[] = [];
        
        for (const sheetResult of exactResults) {
          // Get the cells for this sheet
          const cellResults = await db.getAllAsync<{
            uid: string;
            sheet_id: string;
            row_index: number;
            col_index: number;
            value: string;
            history: string;
            created_at: string;
            updated_at: string;
          }>(`SELECT * FROM cells WHERE sheet_id = ?`, [sheetResult.uid]);
          
          console.log(`[StorageService] Found ${cellResults.length} cells for sheet ${sheetResult.uid}`);
          
          sheets.push({
            uid: sheetResult.uid,
            templateId: sheetResult.template_id,
            name: sheetResult.name,
            characterId: sheetResult.character_id,
            conversationId: sheetResult.conversation_id,
            createdAt: sheetResult.created_at,
            updatedAt: sheetResult.updated_at,
            cells: cellResults.map(cell => ({
              uid: cell.uid,
              sheetId: cell.sheet_id,
              rowIndex: cell.row_index,
              colIndex: cell.col_index,
              value: cell.value,
              history: JSON.parse(cell.history),
              createdAt: cell.created_at,
              updatedAt: cell.updated_at
            }))
          });
        }
        
        console.log(`[StorageService] Returning ${sheets.length} sheets from exact match`);
        return sheets;
      }
      
      // Try a broader search by character ID only
      console.log(`[StorageService] No exact match found, trying character-only search`);
      console.log(`[StorageService] Query: SELECT * FROM sheets WHERE character_id = ?`);
      console.log(`[StorageService] Parameters: [${safeCharacterId}]`);
      
      const characterResults = await db.getAllAsync<{
        uid: string;
        template_id: string;
        name: string;
        character_id: string;
        conversation_id: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT * FROM sheets WHERE character_id = ?`, 
        [safeCharacterId]
      );
      
      console.log(`[StorageService] Character-only query found ${characterResults.length} sheets`);
      
      // List what we found to help debugging
      if (characterResults.length > 0) {
        console.log(`[StorageService] Found tables by character ID:`);
        characterResults.forEach((sheet, index) => {
          console.log(`[StorageService] ${index + 1}. ID: ${sheet.uid}, name: ${sheet.name}, conversation_id: "${sheet.conversation_id}"`);
        });
      }
      
      // If we found sheets with the character ID, update their conversation ID
      if (characterResults.length > 0) {
        console.log(`[StorageService] Found ${characterResults.length} tables with characterId`);
        
        // Update the conversation IDs for all matching sheets
        for (const sheetResult of characterResults) {
          if (sheetResult.conversation_id !== safeConversationId) {
            console.log(`[StorageService] Updating sheet ${sheetResult.uid} conversation_id from "${sheetResult.conversation_id}" to "${safeConversationId}"`);
            
            // Update the conversation ID in the database
            await db.runAsync(
              `UPDATE sheets SET conversation_id = ?, updated_at = ? WHERE uid = ?`,
              [safeConversationId, new Date().toISOString(), sheetResult.uid]
            );
            
            // Update the in-memory object too
            sheetResult.conversation_id = safeConversationId;
          }
        }
        
        // Process the results
        const sheets: Sheet[] = [];
        
        for (const sheetResult of characterResults) {
          // Get the cells for this sheet
          const cellResults = await db.getAllAsync<{
            uid: string;
            sheet_id: string;
            row_index: number;
            col_index: number;
            value: string;
            history: string;
            created_at: string;
            updated_at: string;
          }>(`SELECT * FROM cells WHERE sheet_id = ?`, [sheetResult.uid]);
          
          sheets.push({
            uid: sheetResult.uid,
            templateId: sheetResult.template_id,
            name: sheetResult.name,
            characterId: sheetResult.character_id,
            conversationId: sheetResult.conversation_id, // This now has the updated value
            createdAt: sheetResult.created_at,
            updatedAt: sheetResult.updated_at,
            cells: cellResults.map(cell => ({
              uid: cell.uid,
              sheetId: cell.sheet_id,
              rowIndex: cell.row_index,
              colIndex: cell.col_index,
              value: cell.value,
              history: JSON.parse(cell.history),
              createdAt: cell.created_at,
              updatedAt: cell.updated_at
            }))
          });
        }
        
        console.log(`[StorageService] Returning ${sheets.length} sheets from character-only match`);
        return sheets;
      }
      
      // If we get here, we didn't find any sheets
      console.log(`[StorageService] No sheets found for characterId: "${safeCharacterId}"`);
      
      // One more attempt - check for any similar character IDs
      console.log(`[StorageService] Checking for any similar character IDs...`);
      const allCharacterIds = await db.getAllAsync<{ character_id: string }>(
        `SELECT DISTINCT character_id FROM sheets`
      );
      
      console.log(`[StorageService] Found ${allCharacterIds.length} distinct character IDs in the database:`);
      allCharacterIds.forEach((row, index) => {
        console.log(`[StorageService]   ${index + 1}. "${row.character_id}"`);
      });
      
      return [];
    });
  }
  
  /**
   * 获取单元格
   * @param uid 单元格ID
   * @returns 单元格对象或null
   */
  static async getCell(uid: string): Promise<Cell | null> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const result = await db.getFirstAsync<{
        uid: string;
        sheet_id: string;
        row_index: number;
        col_index: number;
        value: string;
        history: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM cells WHERE uid = ?`, [uid]);
      
      if (!result) return null;
      
      return {
        uid: result.uid,
        sheetId: result.sheet_id,
        rowIndex: result.row_index,
        colIndex: result.col_index,
        value: result.value,
        history: JSON.parse(result.history),
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    });
  }
  
  /**
   * 获取表格中的单元格
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   * @param colIndex 列索引
   * @returns 单元格对象或null
   */
  static async getCellByPosition(sheetId: string, rowIndex: number, colIndex: number): Promise<Cell | null> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const result = await db.getFirstAsync<{
        uid: string;
        sheet_id: string;
        row_index: number;
        col_index: number;
        value: string;
        history: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM cells WHERE sheet_id = ? AND row_index = ? AND col_index = ?`, 
          [sheetId, rowIndex, colIndex]);
      
      if (!result) return null;
      
      return {
        uid: result.uid,
        sheetId: result.sheet_id,
        rowIndex: result.row_index,
        colIndex: result.col_index,
        value: result.value,
        history: JSON.parse(result.history),
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    });
  }
  
  /**
   * 保存单元格
   * @param cell 单元格对象
   */
  static async saveCell(cell: Cell): Promise<void> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      await db.runAsync(
        `INSERT OR REPLACE INTO cells 
        (uid, sheet_id, row_index, col_index, value, history, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cell.uid,
          cell.sheetId,
          cell.rowIndex,
          cell.colIndex,
          cell.value,
          JSON.stringify(cell.history),
          cell.createdAt,
          cell.updatedAt
        ]
      );
    });
  }
  
  /**
   * 获取表格中指定行的单元格
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   * @returns 单元格列表
   */
  static async getCellsByRow(sheetId: string, rowIndex: number): Promise<Cell[]> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const results = await db.getAllAsync<{
        uid: string;
        sheet_id: string;
        row_index: number;
        col_index: number;
        value: string;
        history: string;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM cells WHERE sheet_id = ? AND row_index = ? ORDER BY col_index`, 
          [sheetId, rowIndex]);
      
      return results.map(result => ({
        uid: result.uid,
        sheetId: result.sheet_id,
        rowIndex: result.row_index,
        colIndex: result.col_index,
        value: result.value,
        history: JSON.parse(result.history),
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }));
    });
  }
  
  /**
   * 删除表格中指定行的单元格
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   */
  static async deleteCellsByRow(sheetId: string, rowIndex: number): Promise<void> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      await db.runAsync(
        `DELETE FROM cells WHERE sheet_id = ? AND row_index = ?`,
        [sheetId, rowIndex]
      );
    });
  }
  
  /**
   * 获取表格最大行索引
   * @param sheetId 表格ID
   * @returns 最大行索引，如果表格为空则返回-1
   */
  static async getMaxRowIndex(sheetId: string): Promise<number> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const result = await db.getFirstAsync<{ max_row: number }>(
        `SELECT MAX(row_index) as max_row FROM cells WHERE sheet_id = ?`,
        [sheetId]
      );
      
      return result?.max_row ?? -1;
    });
  }
  
  /**
   * 获取设置
   * @param key 设置键
   * @returns 设置值或null
   */
  static async getSetting(key: string): Promise<any | null> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const result = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM settings WHERE id = ?`,
        [key]
      );
      
      if (!result) return null;
      
      try {
        return JSON.parse(result.value);
      } catch (error) {
        console.error(`[TableMemory] 解析设置值失败, key=${key}:`, error);
        return null;
      }
    });
  }
  
  /**
   * 保存设置
   * @param key 设置键
   * @param value 设置值
   */
  static async saveSetting(key: string, value: any): Promise<void> {
    return this.safeExecute(async () => {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      
      const jsonValue = JSON.stringify(value);
      
      await db.runAsync(
        `INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)`,
        [key, jsonValue]
      );
    });
  }
  
  /**
   * 获取模板设置
   * @returns 模板设置
   */
  static async getTemplateSettings(): Promise<TemplateSettings> {
    const settings = await this.getSetting('template_settings');
    return settings || { selectedTemplates: [] };
  }
  
  /**
   * 保存模板设置
   * @param settings 模板设置
   */
  static async saveTemplateSettings(settings: TemplateSettings): Promise<void> {
    await this.saveSetting('template_settings', settings);
  }
  
  /**
   * 关闭数据库连接
   */
  static async close(): Promise<void> {
    if (db) {
      // 确保所有队列操作都处理完
      if (this.operationQueue.length > 0) {
        console.log(`[TableMemory] 等待 ${this.operationQueue.length} 个队列操作完成后关闭数据库`);
        await new Promise<void>(resolve => {
          // 创建一个检查函数，每100ms检查一次队列是否清空
          const checkQueue = () => {
            if (this.operationQueue.length === 0 && !this.isProcessingQueue) {
              resolve();
            } else {
              setTimeout(checkQueue, 100);
            }
          };
          
          checkQueue();
        });
      }
      
      await db.closeAsync();
      db = null;
      console.log('[TableMemory] 数据库已关闭');
    }
  }
}
