import { Message, Character } from '@/shared/types';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import { getApiSettings } from '@/utils/settings-helper';


/**
 * Service for managing chat messages with direct integration to StorageAdapter
 */
class MessageService {
  /**
   * Handle regenerating a message by messageId and messageIndex
   */
  async handleRegenerateMessage(
    messageId: string,
    messageIndex: number,
    conversationId: string,
    messages: Message[],
    character: Character | undefined | null,
    user: any
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId || !character) {
        throw new Error("Missing required information for regeneration");
      }

      // Get API key and settings
      const apiKey = user?.settings?.chat?.characterApiKey || '';
      const apiSettings = getApiSettings();
      
      // Use StorageAdapter to regenerate the message
      const newContent = await StorageAdapter.regenerateAiMessageByIndex(
        conversationId,
        messageIndex,
        apiKey,
        character.id,
        user?.displayName || 'User',
        apiSettings
      );
      
      if (!newContent) {
        throw new Error("Failed to regenerate message");
      }
      
      // Get fresh messages after regeneration
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleRegenerateMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle editing an AI message
   */
  async handleEditAIMessage(
    messageId: string,
    aiIndex: number,
    newContent: string,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for editing");
      }
      
      // Get API key for editing
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        throw new Error("API key not found");
      }

      // Use StorageAdapter to edit the AI message
      const success = await StorageAdapter.editAiMessageByIndex(
        conversationId,
        aiIndex,
        newContent,
        apiKey
      );
      
      if (!success) {
        throw new Error("Failed to edit AI message");
      }
      
      // Get fresh messages after editing
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleEditAIMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle deleting an AI message
   */
  async handleDeleteAIMessage(
    messageId: string,
    aiIndex: number,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for deletion");
      }
      
      // Get API key for deleting
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        throw new Error("API key not found");
      }

      // Use StorageAdapter to delete the AI message
      const success = await StorageAdapter.deleteAiMessageByIndex(
        conversationId,
        aiIndex,
        apiKey
      );
      
      if (!success) {
        throw new Error("Failed to delete AI message");
      }
      
      // Get fresh messages after deletion
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleDeleteAIMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle editing a user message
   */
  async handleEditUserMessage(
    messageId: string,
    userIndex: number,
    newContent: string,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for editing");
      }
      
      // Get API key for editing
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        throw new Error("API key not found");
      }

      // Use StorageAdapter to edit the user message
      const success = await StorageAdapter.editUserMessageByIndex(
        conversationId,
        userIndex,
        newContent,
        apiKey
      );
      
      if (!success) {
        throw new Error("Failed to edit user message");
      }
      
      // Get fresh messages after editing
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleEditUserMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle deleting a user message
   */
  async handleDeleteUserMessage(
    messageId: string,
    userIndex: number,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for deletion");
      }
      
      // Get API key for deleting
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        throw new Error("API key not found");
      }

      // Use StorageAdapter to delete the user message
      const success = await StorageAdapter.deleteUserMessageByIndex(
        conversationId,
        userIndex,
        apiKey
      );
      
      if (!success) {
        throw new Error("Failed to delete user message");
      }
      
      // Get fresh messages after deletion
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleDeleteUserMessage:', error);
      return { success: false };
    }
  }



  /**
   * Helper method to retrieve fresh messages after an operation
   */
  private async getMessagesAfterOperation(conversationId: string): Promise<Message[]> {
    try {
      // Get clean chat history from StorageAdapter
      const cleanHistory = await StorageAdapter.getCleanChatHistory(conversationId);
      
      // Convert to Message format
      return cleanHistory.map(msg => ({
        id: `${msg.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        text: msg.parts?.[0]?.text || '',
        sender: msg.role === 'user' ? 'user' : 'bot',
        isLoading: false,
        timestamp: msg.timestamp || Date.now(),
        metadata: {
          messageIndex: msg.messageIndex,
        }
      }));
    } catch (error) {
      console.error('Error getting messages after operation:', error);
      return [];
    }
  }

  /**
   * Helper method to retrieve API key from AsyncStorage
   */
  private async getApiKeyFromStorage(): Promise<string | null> {
    try {
      // In a real implementation, this would retrieve the API key from storage
      // For now, using a placeholder approach
      return 'placeholder-api-key'; // This should be replaced with actual retrieval logic
    } catch (error) {
      console.error('Error getting API key:', error);
      return null;
    }
  }
}

export default new MessageService();
