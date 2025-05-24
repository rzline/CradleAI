import { NodeSTManager } from '@/utils/NodeSTManager';
import { Character, Message } from '@/shared/types';

export interface AutoMessageConfig {
  enabled: boolean;
  intervalMinutes: number;
  characterId: string;
  conversationId: string;
  character: Character;
  user: any;
  messages: Message[];
  onMessageAdded: (conversationId: string, message: Message) => Promise<void>;
  onUnreadCountUpdate: (count: number) => void;
}

class AutoMessageService {
  private static instance: AutoMessageService;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastMessageTimes: Map<string, number> = new Map();
  private waitingForUserReply: Map<string, boolean> = new Map();
  private configs: Map<string, AutoMessageConfig> = new Map();

  private constructor() {}

  static getInstance(): AutoMessageService {
    if (!AutoMessageService.instance) {
      AutoMessageService.instance = new AutoMessageService();
    }
    return AutoMessageService.instance;
  }

  /**
   * Setup auto message for a character
   */
  setupAutoMessage(config: AutoMessageConfig): void {
    const { characterId, enabled, character } = config;
    
    // Clear existing timer
    this.clearAutoMessage(characterId);
    
    if (!enabled || !character.autoMessage) {
      return;
    }

    // Store config
    this.configs.set(characterId, config);
    
    // Initialize state
    this.lastMessageTimes.set(characterId, Date.now());
    this.waitingForUserReply.set(characterId, false);
    
    // Start timer
    this.startTimer(characterId);
  }

  /**
   * Clear auto message for a character
   */
  clearAutoMessage(characterId: string): void {
    const timer = this.timers.get(characterId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(characterId);
    }
    
    this.configs.delete(characterId);
    this.lastMessageTimes.delete(characterId);
    this.waitingForUserReply.delete(characterId);
  }

  /**
   * Update when user sends a message
   */
  onUserMessage(characterId: string): void {
    this.waitingForUserReply.set(characterId, false);
    this.lastMessageTimes.set(characterId, Date.now());
    this.restartTimer(characterId);
  }

  /**
   * Update when any message is sent (reset timer)
   */
  onAnyMessage(characterId: string): void {
    this.lastMessageTimes.set(characterId, Date.now());
    this.restartTimer(characterId);
  }

  /**
   * Check if waiting for user reply
   */
  isWaitingForUserReply(characterId: string): boolean {
    return this.waitingForUserReply.get(characterId) || false;
  }

  /**
   * Start timer for character
   */
  private startTimer(characterId: string): void {
    const config = this.configs.get(characterId);
    if (!config || !config.enabled || !config.character.autoMessage) {
      return;
    }

    if (this.waitingForUserReply.get(characterId)) {
      return;
    }

    const intervalMs = (config.character.autoMessageInterval || config.intervalMinutes) * 60 * 1000;
    
    const timer = setTimeout(async () => {
      await this.sendAutoMessage(characterId);
    }, intervalMs);
    
    this.timers.set(characterId, timer);
  }

  /**
   * Restart timer for character
   */
  private restartTimer(characterId: string): void {
    const timer = this.timers.get(characterId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(characterId);
    }
    
    this.startTimer(characterId);
  }

  /**
   * Send auto message
   */
  private async sendAutoMessage(characterId: string): Promise<void> {
    const config = this.configs.get(characterId);
    if (!config) {
      return;
    }

    const { character, conversationId, user, messages, onMessageAdded, onUnreadCountUpdate } = config;

    try {
      const uniqueAutoMsgId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      const result = await NodeSTManager.processChatMessage({
        userMessage: "[AUTO_MESSAGE] 用户已经一段时间没有回复了。请基于上下文和你的角色设定，主动发起一条合适的消息。这条消息应该自然，不要直接提及用户长时间未回复的事实。",
        status: "同一角色继续对话",
        conversationId: conversationId,
        apiKey: user?.settings?.chat?.characterApiKey || '',
        apiSettings: {
          apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
          openrouter: user?.settings?.chat?.openrouter,
          useGeminiModelLoadBalancing: user?.settings?.chat.useGeminiModelLoadBalancing,
          useGeminiKeyRotation: user?.settings?.chat.useGeminiKeyRotation,
          additionalGeminiKeys: user?.settings?.chat.additionalGeminiKeys
        },
        character: character
      });
      
      if (result.success && result.text) {
        const aiMessageCount = messages.filter(m => m.sender === 'bot' && !m.isLoading).length;
        
        const autoMessage: Message = {
          id: uniqueAutoMsgId,
          text: result.text,
          sender: 'bot',
          timestamp: Date.now(),
          metadata: {
            isAutoMessageResponse: true,
            aiIndex: aiMessageCount,
            autoMessageCreatedAt: Date.now()
          }
        };
        
        await onMessageAdded(conversationId, autoMessage);
        
        this.lastMessageTimes.set(characterId, Date.now());
        this.waitingForUserReply.set(characterId, true);
        
        if (character.notificationEnabled === true) {
          onUnreadCountUpdate(1);
        }
      }
    } catch (error) {
      console.error('[AutoMessageService] Error generating auto message:', error);
    } finally {
      // Remove timer reference
      this.timers.delete(characterId);
    }
  }

  /**
   * Clear all timers (cleanup)
   */
  clearAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.configs.clear();
    this.lastMessageTimes.clear();
    this.waitingForUserReply.clear();
  }
}

export default AutoMessageService;

// 代码结构良好，自动消息逻辑已完全抽离到服务层，无需调整。
