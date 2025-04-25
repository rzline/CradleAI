import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatHistoryEntity, ChatMessage,} from '../../../shared/types';
import{ CircleMemory  } from '../../../shared/types/circle-types';
/**
 * StorageAdapter provides a clean interface for managing chat-related storage operations,
 * focusing on actual user-AI conversation without exposing framework details.
 */
export class StorageAdapter {
  /**
   * Generates a standardized storage key for a given conversation
   * @param conversationId The conversation identifier
   * @param suffix Optional suffix to specialize the key
   * @returns Formatted storage key
   */
  static getStorageKey(conversationId: string, suffix: string = ''): string {
    return `nodest_${conversationId}${suffix}`;
  }

  /**
   * Save JSON data to AsyncStorage
   * @param key Storage key
   * @param data Data to store
   */
  static async saveJson<T>(key: string, data: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`[StorageAdapter] Error saving data for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Load JSON data from AsyncStorage
   * @param key Storage key
   * @returns Parsed JSON data or null if not found
   */
  static async loadJson<T>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`[StorageAdapter] Error loading data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Retrieve only the user-AI conversation exchanges from chat history
   * @param conversationId The conversation identifier
   * @returns Array of cleaned chat messages (only user-AI exchanges)
   */
  static async getCleanChatHistory(conversationId: string): Promise<ChatMessage[]> {
    try {
      console.log('[StorageAdapter] Retrieving clean chat history for conversation:', conversationId);
      
      // Load raw chat history
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );

      if (!chatHistory || !chatHistory.parts) {
        return [];
      }
      
      // Filter to include only real user/AI messages (no D-entries, no framework)
      const cleanedMessages = chatHistory.parts.filter(message => {
        // Only include actual conversation messages (exclude D entries and system messages)
        return (!message.is_d_entry && 
                (message.role === "user" || message.role === "model" || message.role === "assistant") &&
                message.parts?.[0]?.text);
      });

      console.log(`[StorageAdapter] Retrieved ${cleanedMessages.length} clean messages`);
      
      return cleanedMessages;
    } catch (error) {
      console.error('[StorageAdapter] Error getting clean chat history:', error);
      return [];
    }
  }

  /**
   * Retrieve a specified number of recent messages
   * @param conversationId The conversation identifier
   * @param count Maximum number of messages to retrieve (default: 20)
   * @returns Array of recent chat messages
   */
  static async getRecentMessages(conversationId: string, count: number = 10): Promise<ChatMessage[]> {
    const cleanMessages = await this.getCleanChatHistory(conversationId);
    return cleanMessages.slice(Math.max(0, cleanMessages.length - count));
  }

  /**
   * Check if a conversation has any history
   * @param conversationId The conversation identifier
   * @returns True if the conversation has history, false otherwise
   */
  static async hasConversationHistory(conversationId: string): Promise<boolean> {
    const messages = await this.getCleanChatHistory(conversationId);
    return messages.length > 0;
  }

  /**
   * Get the first message (typically the AI greeting) from a conversation
   * @param conversationId The conversation identifier
   * @returns The first message or null if not found
   */
  static async getFirstMessage(conversationId: string): Promise<ChatMessage | null> {
    try {
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );
      
      if (!chatHistory || !chatHistory.parts || chatHistory.parts.length === 0) {
        return null;
      }
      
      // Find the first_mes or the first model/assistant message
      const firstMessage = chatHistory.parts.find(
        msg => msg.is_first_mes || 
              ((msg.role === "model" || msg.role === "assistant") && 
               !msg.is_d_entry && msg.parts?.[0]?.text)
      );
      
      return firstMessage || null;
    } catch (error) {
      console.error('[StorageAdapter] Error getting first message:', error);
      return null;
    }
  }

  /**
   * Export the conversation as a simple array of alternating user and AI messages
   * Useful for sharing or displaying conversation summaries
   * @param conversationId The conversation identifier
   * @returns Array of {role, content} objects
   */
  static async exportConversation(conversationId: string): Promise<Array<{role: string, content: string}>> {
    const cleanMessages = await this.getCleanChatHistory(conversationId);
    return cleanMessages.map(msg => ({
      role: msg.role === "model" || msg.role === "assistant" ? "assistant" : "user",
      content: msg.parts?.[0]?.text || ""
    }));
  }

  /**
   * Store a simple user-AI message exchange
   * Note: This doesn't handle D-entries or framework - it's for simple storage needs
   * @param conversationId The conversation identifier 
   * @param userMessage The user message
   * @param aiResponse The AI response
   * @returns True if successful, false otherwise
   */
  static async storeMessageExchange(
    conversationId: string, 
    userMessage: string,
    aiResponse: string
  ): Promise<boolean> {
    try {
      // Get existing history
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );
      
      if (!chatHistory) {
        console.error('[StorageAdapter] Cannot store message - no chat history found');
        return false;
      }
      
      // Add messages only if they don't exist already
      let updated = false;
      const userMessageExists = chatHistory.parts.some(
        msg => msg.role === "user" && msg.parts?.[0]?.text === userMessage
      );
      
      if (!userMessageExists) {
        chatHistory.parts.push({
          role: "user",
          parts: [{ text: userMessage }]
        });
        updated = true;
      }
      
      const aiResponseExists = chatHistory.parts.some(
        msg => (msg.role === "model" || msg.role === "assistant") && 
              msg.parts?.[0]?.text === aiResponse
      );
      
      if (!aiResponseExists && aiResponse) {
        chatHistory.parts.push({
          role: "model",
          parts: [{ text: aiResponse }]
        });
        updated = true;
      }
      
      if (updated) {
        // Save updated history
        await this.saveJson(
          this.getStorageKey(conversationId, '_history'),
          chatHistory
        );
        console.log('[StorageAdapter] Message exchange stored successfully');
      } else {
        console.log('[StorageAdapter] No new messages to store (existing messages)');
      }
      
      return true;
    } catch (error) {
      console.error('[StorageAdapter] Error storing message exchange:', error);
      return false;
    }
  }
  
  /**
   * Delete all data for a conversation
   * @param conversationId The conversation identifier
   * @returns True if successful, false otherwise
   */
  static async deleteConversationData(conversationId: string): Promise<boolean> {
    try {
      console.log('[StorageAdapter] Deleting all data for conversation:', conversationId);
      
      // Define all the keys we need to delete
      const keys = [
        this.getStorageKey(conversationId, '_role'),
        this.getStorageKey(conversationId, '_world'),
        this.getStorageKey(conversationId, '_preset'),
        this.getStorageKey(conversationId, '_note'),
        this.getStorageKey(conversationId, '_history'),
        this.getStorageKey(conversationId, '_contents')
      ];
      
      // Delete all keys in parallel
      await Promise.all(keys.map(async (key) => {
        try {
          await AsyncStorage.removeItem(key);
        } catch (error) {
          console.error(`[StorageAdapter] Error deleting key ${key}:`, error);
        }
      }));
      
      return true;
    } catch (error) {
      console.error('[StorageAdapter] Error deleting conversation data:', error);
      return false;
    }
  }

  /**
   * List all conversation IDs in storage
   * @returns Array of conversation IDs
   */
  static async getAllConversationIds(): Promise<string[]> {
    try {
      // Get all keys in AsyncStorage
      const keys = await AsyncStorage.getAllKeys();
      
      // Filter for nodest conversation keys
      const conversationKeys = keys.filter(key => 
        key.startsWith('nodest_') && key.endsWith('_history')
      );
      
      // Extract conversation IDs from keys
      const conversationIds = conversationKeys.map(key => 
        key.replace('nodest_', '').replace('_history', '')
      );
      
      return conversationIds;
    } catch (error) {
      console.error('[StorageAdapter] Error getting all conversation IDs:', error);
      return [];
    }
  }

  /**
   * Retrieve messages from a specific day
   * @param conversationId The conversation identifier
   * @param date The date to retrieve messages from (default: current day)
   * @returns Array of messages from the specified day
   */
  static async getMessagesFromDate(conversationId: string, date: Date = new Date()): Promise<ChatMessage[]> {
    try {
      console.log('[StorageAdapter] Retrieving messages from date for conversation:', conversationId);
      
      // Set time to start of day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      // Set time to end of day
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Load raw chat history
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );

      if (!chatHistory || !chatHistory.parts) {
        return [];
      }
      
      // Filter to include only real user/AI messages from the specified day
      const messagesFromDay = chatHistory.parts.filter(message => {
        // Only include actual conversation messages with timestamp within the day
        return (!message.is_d_entry && 
                (message.role === "user" || message.role === "model" || message.role === "assistant") &&
                message.parts?.[0]?.text &&
                message.timestamp && 
                message.timestamp >= startOfDay.getTime() &&
                message.timestamp <= endOfDay.getTime());
      });

      console.log(`[StorageAdapter] Retrieved ${messagesFromDay.length} messages from ${date.toDateString()}`);
      
      return messagesFromDay;
    } catch (error) {
      console.error('[StorageAdapter] Error getting messages from date:', error);
      return [];
    }
  }

  /**
   * Get circle memories for a character
   * @param characterId The character identifier
   * @param limit Maximum number of memories to retrieve (defaults to all)
   * @returns Array of circle memories sorted by timestamp (newest first)
   */
  static async getCircleMemories(characterId: string, limit?: number): Promise<CircleMemory[]> {
    try {
      console.log(`[StorageAdapter] Retrieving circle memories for character: ${characterId}, limit: ${limit || 'none'}`);
      
      const storageKey = `nodest_${characterId}_circle_memory`;
      const memoryData = await AsyncStorage.getItem(storageKey);
      
      if (!memoryData) {
        console.log(`[StorageAdapter] No circle memories found for character: ${characterId}`);
        return [];
      }
      
      const memories: CircleMemory[] = JSON.parse(memoryData);
      
      // Sort by timestamp (newest first)
      const sortedMemories = memories.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply limit if specified
      const limitedMemories = limit ? sortedMemories.slice(0, limit) : sortedMemories;
      
      console.log(`[StorageAdapter] Retrieved ${limitedMemories.length} circle memories for character: ${characterId}`);
      
      return limitedMemories;
    } catch (error) {
      console.error(`[StorageAdapter] Error retrieving circle memories for character: ${characterId}`, error);
      return [];
    }
  }

  /**
   * Save circle memories for a character
   * @param characterId The character identifier
   * @param memories The circle memories to save
   */
  static async saveCircleMemories(characterId: string, memories: CircleMemory[]): Promise<void> {
    try {
      console.log(`[StorageAdapter] Saving ${memories.length} circle memories for character: ${characterId}`);
      
      const storageKey = `nodest_${characterId}_circle_memory`;
      await AsyncStorage.setItem(storageKey, JSON.stringify(memories));
      
      console.log(`[StorageAdapter] Successfully saved circle memories for character: ${characterId}`);
    } catch (error) {
      console.error(`[StorageAdapter] Error saving circle memories for character: ${characterId}`, error);
      throw error;
    }
  }

  /**
   * 导出角色全部数据（可用于角色迁移/备份/分享）
   * 返回格式与 CharacterImporter.ts 兼容
   */
  static async exportCharacterData(conversationId: string): Promise<{
    roleCard: any;
    worldBook: any;
    preset: any;
    authorNote?: any;
    chatHistory?: any;
    contents?: any;
  }> {
    try {
      const [roleCard, worldBook, preset, authorNote, chatHistory, contents] = await Promise.all([
        this.loadJson<any>(this.getStorageKey(conversationId, '_role')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_world')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_preset')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_note')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_history')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_contents')),
      ]);
      if (!roleCard) throw new Error('角色卡数据不存在');
      // worldBook/preset 可为空对象
      return {
        roleCard,
        worldBook: worldBook || { entries: {} },
        preset: preset || { prompts: [], prompt_order: [{ order: [] }] },
        authorNote: authorNote || undefined,
        chatHistory: chatHistory || undefined,
        contents: contents || undefined,
      };
    } catch (error) {
      console.error('[StorageAdapter] exportCharacterData error:', error);
      throw error;
    }
  }
}
