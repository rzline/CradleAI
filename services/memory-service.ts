import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import { ChatHistoryEntity, ChatMessage, GeminiMessage } from '@/shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';

interface MemorySummarySettings {
  enabled: boolean;
  summaryThreshold: number; // Number of characters to trigger summary
  summaryLength: number;    // Max length of the summary in characters
  lastSummarizedAt: number; // Timestamp of last summarization
}

interface SummaryData {
  summary: string;
  isMemorySummary: true;
  timestamp: number;
  originalMessagesRange: {
    start: number;
    end: number;
  };
}

export class MemoryService {
  private static instance: MemoryService;
  
  // Private constructor - singleton pattern
  private constructor() {}
  
  // Get singleton instance
  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
    }
    return MemoryService.instance;
  }
  
  // Get memory settings storage key
  private getSettingsKey(characterId: string): string {
    return `memory_settings_${characterId}`;
  }
  
  // Get memory summary storage key
  private getSummaryKey(conversationId: string): string {
    return `memory_summary_${conversationId}`;
  }
  
  // Save memory settings
  public async saveSettings(characterId: string, settings: MemorySummarySettings): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.getSettingsKey(characterId),
        JSON.stringify(settings)
      );
      console.log(`[MemoryService] Saved settings for character ${characterId}:`, settings);
    } catch (error) {
      console.error(`[MemoryService] Failed to save settings for character ${characterId}:`, error);
      throw error;
    }
  }
  
  // Load memory settings
  public async loadSettings(characterId: string): Promise<MemorySummarySettings> {
    try {
      const data = await AsyncStorage.getItem(this.getSettingsKey(characterId));
      
      if (data) {
        const settings = JSON.parse(data) as MemorySummarySettings;
        return settings;
      }
      
      // Return default settings if none found
      return {
        enabled: false,
        summaryThreshold: 6000, // Default: 6000 characters
        summaryLength: 1000,    // Default: 1000 characters
        lastSummarizedAt: 0
      };
    } catch (error) {
      console.error(`[MemoryService] Failed to load settings for character ${characterId}:`, error);
      
      // Return default settings on error
      return {
        enabled: false,
        summaryThreshold: 6000,
        summaryLength: 1000,
        lastSummarizedAt: 0
      };
    }
  }
  
  // Check if chat history needs summarization
  public async checkAndSummarize(
    conversationId: string,
    characterId: string,
    chatHistory: ChatHistoryEntity,
    apiKey: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter',
      openrouter?: {
        enabled?: boolean;
        apiKey?: string;
        model?: string;
      }
    }
  ): Promise<ChatHistoryEntity> {
    try {
      const settings = await this.loadSettings(characterId);
      
      // Return original history if memory summarization is disabled
      if (!settings.enabled) {
        return chatHistory;
      }

      // Count total text in chat history (excluding summaries)
      const totalTextLength = this.calculateChatHistoryLength(chatHistory);
      console.log(`[MemoryService] Chat history length: ${totalTextLength} characters`);
      
      // Check if we need to summarize based on threshold
      if (totalTextLength < settings.summaryThreshold) {
        console.log(`[MemoryService] Below summarization threshold (${settings.summaryThreshold}), skipping`);
        return chatHistory;
      }
      
      // Perform summarization
      console.log(`[MemoryService] Generating summary for conversation ${conversationId}`);
      return await this.generateSummary(
        conversationId,
        chatHistory,
        settings,
        apiKey,
        apiSettings
      );
    } catch (error) {
      console.error(`[MemoryService] Error in checkAndSummarize for ${conversationId}:`, error);
      // Return original history on error
      return chatHistory;
    }
  }
  
  // Calculate total length of chat history (excluding summaries)
  private calculateChatHistoryLength(chatHistory: ChatHistoryEntity): number {
    let totalLength = 0;
    
    for (const message of chatHistory.parts) {
      // Skip summary messages
      if (message.parts?.[0]?.text && !(message as any).isMemorySummary) {
        totalLength += message.parts[0].text.length;
      }
    }
    
    return totalLength;
  }
  
  // Generate summary of chat history middle section
  public async generateSummary(
    conversationId: string,
    chatHistory: ChatHistoryEntity, 
    settings: MemorySummarySettings,
    apiKey: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter',
      openrouter?: {
        enabled?: boolean;
        apiKey?: string;
        model?: string;
      }
    }
  ): Promise<ChatHistoryEntity> {
    try {
      const messages = chatHistory.parts;
      
      // Don't summarize if there are too few messages
      if (messages.length < 10) {
        console.log(`[MemoryService] Too few messages (${messages.length}) to summarize, skipping`);
        return chatHistory;
      }
      
      // Determine which messages to summarize (middle section)
      // Keep first 3 and last 3 messages intact
      const startIdx = 3;
      const endIdx = messages.length - 3;
      
      // Don't summarize if the section is too small
      if (endIdx - startIdx < 4) {
        console.log(`[MemoryService] Middle section too small (${endIdx - startIdx} messages), skipping`);
        return chatHistory;
      }
      
      // Extract messages to summarize
      const messagesToSummarize = messages.slice(startIdx, endIdx);
      
      // Format messages for summarization
      const formattedMessages = messagesToSummarize.map(msg => {
        const role = msg.role === 'user' ? 'User' : 'Character';
        return `${role}: ${msg.parts?.[0]?.text || ''}`;
      }).join('\n\n');
      
      // Create API adapter based on settings
      let adapter: GeminiAdapter | OpenRouterAdapter;
      if (apiSettings?.apiProvider === 'openrouter' && 
          apiSettings.openrouter?.enabled && 
          apiSettings.openrouter?.apiKey) {
        adapter = new OpenRouterAdapter(
          apiSettings.openrouter.apiKey, 
          apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
        );
        console.log('[MemoryService] Using OpenRouter API for summary generation');
      } else {
        adapter = new GeminiAdapter(apiKey);
        console.log('[MemoryService] Using Gemini API for summary generation');
      }

      // Prepare prompt for summarization
      const prompt: GeminiMessage[] = [
        {
          role: "user",
          parts: [{
            text: `Please create a concise summary of the following conversation. Your summary should:
1. Extract the key information, events, topics discussed, and important details
2. Maintain continuity of the narrative without using vague references
3. Preserve character intentions, emotions, and any important commitments or plans mentioned
4. Be no longer than approximately ${settings.summaryLength} characters
5. Focus on facts and content, rather than meta-descriptions of the conversation
6. Make the summary helpful for continuing the conversation

Here is the conversation to summarize:

${formattedMessages}`
          }]
        }
      ];

      // Generate summary
      console.log(`[MemoryService] Requesting summary from API for ${messagesToSummarize.length} messages`);
      const summaryText = await adapter.generateContent(prompt);
      
      // Create summary message
      const summaryMessage: ChatMessage & SummaryData = {
        role: "user",
        parts: [{ 
          text: `--- CONVERSATION SUMMARY (AI-GENERATED, NOT VISIBLE TO USER) ---\n${summaryText}\n--- END OF SUMMARY ---` 
        }],
        summary: summaryText,
        isMemorySummary: true,
        timestamp: Date.now(),
        originalMessagesRange: {
          start: startIdx,
          end: endIdx - 1
        }
      };
      
      // Create new chat history with summary
      const newMessages = [
        ...messages.slice(0, startIdx),
        summaryMessage,
        ...messages.slice(endIdx)
      ];
      
      // Update settings with last summarized timestamp
      settings.lastSummarizedAt = Date.now();
      await this.saveSettings(conversationId, settings);
      
      console.log(`[MemoryService] Successfully generated summary, reducing ${messagesToSummarize.length} messages to 1 summary`);
      
      return {
        ...chatHistory,
        parts: newMessages
      };
    } catch (error) {
      console.error(`[MemoryService] Error generating summary:`, error);
      // Return original history on error
      return chatHistory;
    }
  }
  
  // Check if a message is a memory summary
  public isMemorySummary(message: any): boolean {
    return message && message.isMemorySummary === true;
  }
}

// Export singleton instance
export const memoryService = MemoryService.getInstance();
