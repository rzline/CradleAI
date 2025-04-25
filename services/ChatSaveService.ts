import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatSave, Message, ChatHistoryEntity } from '@/shared/types';

/**
 * Service for managing chat saves (save points)
 */
class ChatSaveService {
  private STORAGE_KEY = 'chat_saves';
  
  /**
   * Get all saved chat states
   */
  async getAllSaves(): Promise<ChatSave[]> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as ChatSave[];
    } catch (error) {
      console.error('Error loading chat saves:', error);
      return [];
    }
  }
  
  /**
   * Get saves for a specific conversation
   */
  async getSavesForConversation(conversationId: string): Promise<ChatSave[]> {
    const saves = await this.getAllSaves();
    return saves.filter(save => save.conversationId === conversationId);
  }
  
  /**
   * Save the current chat state
   */
  async saveChat(
    conversationId: string, 
    characterId: string,
    characterName: string,
    messages: Message[],
    description: string, 
    thumbnail?: string
  ): Promise<ChatSave> {
    try {
      // Get existing saves
      const saves = await this.getAllSaves();
      
      // Get NodeST chat history for this conversation
      const nodestHistory = await this.getNodeSTChatHistory(conversationId);
      
      // Create new save point
      const newSave: ChatSave = {
        id: `save_${Date.now()}`,
        conversationId,
        characterId,
        characterName,
        timestamp: Date.now(),
        description,
        messageIds: messages.map(m => m.id),
        messages: [...messages], // Create a deep copy of messages
        previewText: this.generatePreviewText(messages),
        thumbnail: thumbnail,
        nodestChatHistory: nodestHistory ?? undefined // Save the NodeST chat history state
      };
      
      // Add to saves and store
      const updatedSaves = [newSave, ...saves];
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedSaves));
      
      return newSave;
    } catch (error) {
      console.error('Error saving chat:', error);
      throw error;
    }
  }
  
  /**
   * Delete a save point
   */
  async deleteSave(saveId: string): Promise<boolean> {
    try {
      const saves = await this.getAllSaves();
      const updatedSaves = saves.filter(save => save.id !== saveId);
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedSaves));
      return true;
    } catch (error) {
      console.error('Error deleting save:', error);
      return false;
    }
  }
  
  /**
   * Get NodeST chat history for a conversation
   * This retrieves the clean chat history without D-entries
   */
  async getNodeSTChatHistory(conversationId: string): Promise<ChatHistoryEntity | null> {
    try {
      const historyKey = `nodest_${conversationId}_history`;
      const data = await AsyncStorage.getItem(historyKey);
      
      if (!data) {
        console.log(`[ChatSaveService] No chat history found for conversation: ${conversationId}`);
        return null;
      }
      
      const chatHistory = JSON.parse(data) as ChatHistoryEntity;
      
      // Filter out D-entries, keeping only user messages and model responses
      // This is the clean chat history we want to restore later
      if (chatHistory && chatHistory.parts) {
        chatHistory.parts = chatHistory.parts.filter(message => 
          !message.is_d_entry && 
          (message.role === 'user' || message.role === 'model' || message.role === 'assistant')
        );
      }
      
      console.log(`[ChatSaveService] Retrieved NodeST chat history with ${chatHistory?.parts?.length || 0} messages`);
      return chatHistory;
    } catch (error) {
      console.error('[ChatSaveService] Error getting NodeST chat history:', error);
      return null;
    }
  }
  
  /**
   * Restore NodeST chat history from a save point
   */
  async restoreNodeSTChatHistory(conversationId: string, save: ChatSave): Promise<boolean> {
    try {
      if (!save.nodestChatHistory) {
        console.error('[ChatSaveService] Cannot restore - save has no NodeST chat history');
        return false;
      }
      
      // Direct approach: modify the chat history in AsyncStorage
      const currentHistoryKey = `nodest_${conversationId}_history`;
      
      try {
        // Try to get current history first
        const currentHistoryData = await AsyncStorage.getItem(currentHistoryKey);
        let currentHistory = null;
        
        if (currentHistoryData) {
          currentHistory = JSON.parse(currentHistoryData);
        }
        
        // Create restored history by combining structure from current with data from saved
        const restoredHistory = {
          // Keep metadata from current history if available, otherwise use saved
          name: currentHistory?.name || save.nodestChatHistory.name || "Chat History", 
          role: currentHistory?.role || save.nodestChatHistory.role || "system",
          identifier: currentHistory?.identifier || save.nodestChatHistory.identifier || "chatHistory",
          // Always use the saved message parts
          parts: save.nodestChatHistory.parts
        };
        
        // Save directly to AsyncStorage
        await AsyncStorage.setItem(currentHistoryKey, JSON.stringify(restoredHistory));
        
        console.log(`[ChatSaveService] Restored NodeST chat history with ${restoredHistory.parts.length} messages directly using AsyncStorage`);
        return true;
      } catch (error) {
        console.error('[ChatSaveService] Error directly restoring chat history:', error);
        return false;
      }
    } catch (error) {
      console.error('[ChatSaveService] Error restoring NodeST chat history:', error);
      return false;
    }
  }
  
  /**
   * Add an imported save to the list of saves
   */
  async addImportedSave(importedSave: ChatSave): Promise<ChatSave> {
    try {
      // Get existing saves
      const saves = await this.getAllSaves();
      
      // Ensure the save has a unique ID
      if (!importedSave.id.startsWith('imported_')) {
        importedSave.id = `imported_${Date.now()}_${importedSave.id}`;
      }
      
      // Add metadata for imports if not present
      if (!importedSave.importedAt) {
        importedSave.importedAt = Date.now();
      }
      
      // Add to saves and store
      const updatedSaves = [importedSave, ...saves];
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedSaves));
      
      return importedSave;
    } catch (error) {
      console.error('[ChatSaveService] Error adding imported save:', error);
      throw error;
    }
  }
  
  /**
   * Verify if a save belongs to a specific conversation
   */
  isValidSaveForConversation(save: ChatSave, conversationId: string): boolean {
    return save.conversationId === conversationId;
  }
  
  /**
   * Generate a short preview text from messages
   */
  private generatePreviewText(messages: Message[]): string {
    // Get last 2 messages
    const lastMessages = messages.slice(-2);
    
    // Create preview from last messages
    const preview = lastMessages
      .map(m => {
        const sender = m.sender === 'user' ? 'You' : 'Character';
        const text = m.text.length > 40 ? m.text.substring(0, 40) + '...' : m.text;
        return `${sender}: ${text}`;
      })
      .join(' | ');
      
    return preview || 'Empty conversation';
  }
}

export const chatSaveService = new ChatSaveService();
