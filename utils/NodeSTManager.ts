import { NodeST } from '@/NodeST/nodest';
import { Character, GlobalSettings, ChatHistoryEntity } from '@/shared/types';
import { CirclePostOptions, CircleResponse } from '@/NodeST/nodest/managers/circle-manager';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core'; // Add missing import
import AsyncStorage from '@react-native-async-storage/async-storage'; 
/**
 * NodeST Manager
 * 管理与 NodeST 系统的通信
 */
class NodeSTManagerClass {
  private nodeST: NodeST;
  private apiKey: string = ''; // Add missing property
  private apiSettings: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'> = { // Add missing property
    apiProvider: 'gemini'
  };
  private searchEnabled: boolean = false;
    async setSearchEnabled(enabled: boolean): Promise<void> {
console.log(`[NodeSTManager] Setting search enabled to: ${enabled}`); // Add logging
      this.searchEnabled = enabled;
    }
    
  // Add static properties to fix the TypeScript errors
  private static instance: NodeSTManagerClass | null = null;
  private static apiKey: string = '';
  private static apiSettings: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'> = {
    apiProvider: 'gemini'
  };

  constructor() {
    this.nodeST = new NodeST();
    console.log('[NodeSTManager] NodeST Manager initialized');
  }

  static generateContent(
    messages: Array<{ role: string; parts: Array<{ text: string }> }>,
    apiKey: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter';
      openrouter?: {
        enabled: boolean;
        apiKey: string;
        model: string;
      }
    }
  ): Promise<string> {
    const instance = new NodeSTManagerClass();
    return instance.generateText(messages, apiKey, apiSettings);
  }

  // Update API settings with full apiSettings object support
  updateApiSettings(
    apiKey: string, 
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): void {
    console.log('[NodeSTManager] Updating API settings:', {
      apiKeyLength: apiKey?.length || 0,
      provider: apiSettings?.apiProvider || 'gemini',
      hasOpenRouter: !!apiSettings?.openrouter,
      openRouterEnabled: apiSettings?.openrouter?.enabled
    });
    
    // Store the settings in this class
    this.apiKey = apiKey;
    if (apiSettings) {
      this.apiSettings = apiSettings;
    }
    
    // Pass full apiSettings to NodeST
    this.nodeST.updateApiSettings(apiKey, apiSettings);
  }

  /**
   * 更新API设置
   */
  static updateApiSettings(
    apiKey: string,
    settings?: Partial<GlobalSettings['chat']>
  ): void {
    // Fix: Use static properties
    NodeSTManagerClass.apiKey = apiKey;
    
    if (settings) {
      // Create a properly typed object that satisfies the Pick requirements
      const apiSettings: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'> = {
        // Default to 'gemini' if apiProvider is undefined
        apiProvider: settings.apiProvider || 'gemini',
        // Only include openrouter if it exists in settings
        ...(settings.openrouter ? { openrouter: settings.openrouter } : {})
      };
      
      NodeSTManagerClass.apiSettings = apiSettings;
      
      // 日志API配置信息
      console.log('【NodeSTManager】更新API设置:', {
        provider: settings.apiProvider || 'gemini',
        hasOpenRouter: settings.apiProvider === 'openrouter' && settings.openrouter?.enabled,
        openRouterModel: settings.openrouter?.model
      });
      
      // 如果实例已存在，更新设置
      if (NodeSTManagerClass.instance) {
        NodeSTManagerClass.instance.updateApiSettings(apiKey, apiSettings);
      }
    }
  }

  /**
   * Process a chat message
   */
  async processChatMessage(params: {
    userMessage: string;
    status?: "更新人设" | "新建角色" | "同一角色继续对话";
    conversationId: string;
    apiKey?: string; // Make apiKey optional
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'useGeminiModelLoadBalancing' | 'useGeminiKeyRotation' | 'additionalGeminiKeys'>;
    character?: Character; // Character object with jsonData
    characterId?: string; // Optional character ID
    geminiOptions?: {
      geminiPrimaryModel?: string;
      geminiBackupModel?: string;
      retryDelay?: number;
    };
  }): Promise<{
    success: boolean;
    text?: string;
    error?: string;
  }> {
    try {
      const characterId = params.character?.id || params.conversationId;
      const jsonString = params.character?.jsonData;
      const apiKey = params.apiKey || this.apiKey || ''; // Use instance apiKey as fallback, empty string as last resort
      
      console.log('[NodeSTManager] Processing request:', {
        apiKeyProvided: !!apiKey,
        apiProvider: params.apiSettings?.apiProvider || 'gemini',
        openRouterEnabled: params.apiSettings?.apiProvider === 'openrouter' && params.apiSettings?.openrouter?.enabled,
        openRouterModel: params.apiSettings?.openrouter?.model,
        useGeminiModelLoadBalancing: params.apiSettings?.useGeminiModelLoadBalancing,
        useGeminiKeyRotation: params.apiSettings?.useGeminiKeyRotation,
        additionalKeysCount: params.apiSettings?.additionalGeminiKeys?.length,
        status: params.status || '同一角色继续对话',
        conversationId: params.conversationId,
        characterId: characterId,
        hasCharacter: !!params.character,
        hasJsonData: !!jsonString,
        customUserName: params.character?.customUserName || 'User',
        action: params.status === "更新人设" ? "更新人设" : (params.status === "新建角色" ? "新建角色" : "继续对话"),
        useToolCalls: this.searchEnabled,
        usingCloudFallback: !apiKey,
      });

      // Add detailed logging of character data when creating a new character
      if (params.status === "新建角色" && params.character) {
        console.log('[NodeSTManager] 新建角色详细信息:', {
          characterId: params.character.id,
          name: params.character.name,
          description: params.character?.description?.substring(0, 20) + '...'
        });
        
        // Parse and log the JSON data to diagnose issues
        if (jsonString) {
          try {
            const parsedJson = JSON.parse(jsonString);
            console.log('[NodeSTManager] 角色JSON数据解析结果:', {
              hasRoleCard: !!parsedJson.roleCard,
              roleCardName: parsedJson.roleCard?.name,
              roleCardKeys: parsedJson.roleCard ? Object.keys(parsedJson.roleCard) : [],
              worldBookEntries: parsedJson.worldBook?.entries ? Object.keys(parsedJson.worldBook.entries) : []
            });
          } catch (parseError) {
            console.error('[NodeSTManager] 角色JSON数据解析失败:', parseError);
          }
        }
      }

      // If OpenRouter is configured, ensure we're using the latest settings
      if (params.apiSettings?.apiProvider === 'openrouter' && params.apiSettings?.openrouter?.enabled) {
        // Update settings before processing to ensure correct adapter is used
        this.nodeST.updateApiSettings(apiKey, params.apiSettings);
      }

      console.log('[NodeSTManager] Calling NodeST.processChatMessage with conversationId:', params.conversationId);
      
      // For character updates, log that we're updating character data
      if (params.status === "更新人设" && jsonString) {
        console.log('[NodeSTManager] Updating character data for:', characterId);
      }
      
      // For new characters, ensure jsonString is actually passed correctly
      if (params.status === "新建角色") {
        if (!jsonString) {
          console.error('[NodeSTManager] 错误: 新建角色时缺少jsonData');
        } else {
          console.log('[NodeSTManager] 新建角色，jsonString长度:', jsonString.length);
        }
      }
      
      // Call NodeST with all params including apiSettings with load balancing params
      // apiKey could be empty string - this is now allowed
      const response = await this.nodeST.processChatMessage({
        userMessage: params.userMessage,
        conversationId: params.conversationId,
        status: params.status || "同一角色继续对话",
        apiKey: apiKey,
        apiSettings: params.apiSettings,
        jsonString: jsonString,
        characterId: characterId,  // Pass characterId for memory service
        customUserName: params.character?.customUserName, // Pass the customUserName to NodeST
        useToolCalls: this.searchEnabled, // Pass the search preference flag
        geminiOptions: params.geminiOptions, // Pass geminiOptions
      });

      if (response.success) {
        return {
          success: true,
          text: response.response
        };
      } else {
        console.error('[NodeSTManager] Error from NodeST:', response.error);
        return {
          success: false,
          error: response.error || "Unknown error"
        };
      }
    } catch (error) {
      console.error('[NodeSTManager] Error processing chat message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  static async processChatMessage(options: ProcessChatOptions): Promise<Message> {
    try {
        console.log(`[NodeSTManager] 处理聊天消息，状态: ${options.status}, conversationId: ${options.conversationId}`);
        
        // 创建NodeST实例来处理实际请求
        const nodeST = new NodeST();
        const apiKey = options.apiKey || ''; // Empty string as fallback
        
        // 更新API设置
        if (apiKey || options.apiSettings) {
            nodeST.updateApiSettings(apiKey, options.apiSettings);
        }
        
        // 针对"新建角色"情况进行特殊处理
        if (options.status === "新建角色") {
            console.log("[NodeSTManager] 检测到新建角色操作");
            
            // 检查character参数
            if (!options.character) {
                console.error("[NodeSTManager] 新建角色时缺少character参数");
                throw new Error("新建角色时需要提供character参数");
            }
            
            // 打印character数据以排查问题
            console.log(`[NodeSTManager] character.id: ${options.character.id}`);
            console.log(`[NodeSTManager] character.name: ${options.character.name}`);
            console.log(`[NodeSTManager] jsonData长度: ${options.character.jsonData?.length || 0}`);
            
            // 检查jsonData是否存在
            if (!options.character.jsonData) {
                console.error("[NodeSTManager] 新建角色时缺少jsonData");
                throw new Error("新建角色时character需要包含jsonData");
            }
            
            // 验证jsonData格式和内容
            try {
                const jsonData = JSON.parse(options.character.jsonData);
                console.log("[NodeSTManager] 成功解析jsonData, 检查关键字段...");
                
                // 深度检查和验证角色数据结构
                const hasRoleCard = !!jsonData.roleCard;
                const hasWorldBook = !!jsonData.worldBook;
                const hasPreset = !!jsonData.preset;
                const roleCardHasName = jsonData.roleCard?.name;
                
                console.log("[NodeSTManager] 角色数据校验结果:", {
                    hasRoleCard,
                    hasWorldBook,
                    hasPreset,
                    roleCardHasName
                });
                
                if (!hasRoleCard || !hasWorldBook || !hasPreset || !roleCardHasName) {
                    console.warn("[NodeSTManager] 角色数据缺少必要字段，尝试修复");
                    
                    // 尝试修复不完整的数据
                    jsonData.roleCard = jsonData.roleCard || {
                        name: options.character.name || "未命名角色",
                        first_mes: "你好，很高兴认识你！",
                        description: options.character.description || "这是一个角色",
                        personality: options.character.personality || "友好",
                        scenario: "",
                        mes_example: ""
                    };
                    
                    jsonData.worldBook = jsonData.worldBook || {
                        entries: {
                            "Alist": {
                                "comment": "Character Attributes List",
                                "content": `<attributes>\n  <personality>友好、随和</personality>\n  <appearance>未指定</appearance>\n  <likes>聊天</likes>\n  <dislikes>未指定</dislikes>\n</attributes>`,
                                "disable": false,
                                "position": 4,
                                "constant": true,
                                "key": [],
                                "order": 1,
                                "depth": 1,
                                "vectorized": false
                            },
                            "Plist": {
                                "comment": "Character Dialogue Examples",
                                "content": "用户: 你好\n角色: 你好，很高兴见到你！",
                                "disable": false,
                                "position": 4,
                                "constant": true,
                                "key": [],
                                "order": 2,
                                "depth": 1,
                                "vectorized": false
                            },
                            "背景": {
                                "comment": "Character Background",
                                "content": "这是一个AI生成的角色，背景故事待补充。",
                                "disable": false,
                                "position": 3,
                                "constant": true,
                                "key": [],
                                "order": 3,
                                "depth": 1,
                                "vectorized": false
                            }
                        }
                    };
                    
                    jsonData.preset = jsonData.preset || {
                        prompts: [
                            {
                                name: "Main",
                                content: "",
                                enable: true,
                                identifier: "main",
                                role: "user"
                            },
                            {
                                name: "Enhance Definitions",
                                content: "",
                                enable: true,
                                identifier: "enhanceDefinitions",
                                injection_position: 1,
                                injection_depth: 3,
                                role: "user"
                            }
                        ],
                        prompt_order: [{
                            order: [
                                { identifier: "main", enabled: true },
                                { identifier: "enhanceDefinitions", enabled: true },
                                { identifier: "worldInfoBefore", enabled: true },
                                { identifier: "charDescription", enabled: true },
                                { identifier: "charPersonality", enabled: true },
                                { identifier: "scenario", enabled: true },
                                { identifier: "worldInfoAfter", enabled: true },
                                { identifier: "dialogueExamples", enabled: true },
                                { identifier: "chatHistory", enabled: true }
                            ]
                        }]
                    };
                    
                    // 确保世界书条目中的关键字段存在
                    if (jsonData.worldBook && jsonData.worldBook.entries) {
                        for (const entryKey in jsonData.worldBook.entries) {
                            const entry = jsonData.worldBook.entries[entryKey];
                            if (!entry.position) entry.position = 4;
                            if (!entry.key) entry.key = [];
                            if (entry.constant === undefined) entry.constant = true;
                            if (!entry.order) entry.order = 0;
                            if (!entry.depth) entry.depth = 1;
                        }
                    }
                    
                    // 确保roleCard中的字段不为空
                    if (jsonData.roleCard) {
                        if (!jsonData.roleCard.first_mes) {
                            jsonData.roleCard.first_mes = "你好，很高兴认识你！";
                        }
                        if (!jsonData.roleCard.description) {
                            jsonData.roleCard.description = "这是一个角色";
                        }
                        if (!jsonData.roleCard.personality) {
                            jsonData.roleCard.personality = "友好";
                        }
                    }
                    
                    // 更新character的jsonData
                    options.character.jsonData = JSON.stringify(jsonData);
                    console.log("[NodeSTManager] 角色数据已修复");
                }
                
                // 确保character的基本字段与roleCard一致
                if (options.character && jsonData.roleCard) {
                    if (options.character.name !== jsonData.roleCard.name) {
                        console.log(`[NodeSTManager] 更新角色名称: ${options.character.name} -> ${jsonData.roleCard.name}`);
                        options.character.name = jsonData.roleCard.name;
                    }
                    
                    if (options.character.description !== jsonData.roleCard.description) {
                        options.character.description = jsonData.roleCard.description;
                    }
                    
                    if (options.character.personality !== jsonData.roleCard.personality) {
                        options.character.personality = jsonData.roleCard.personality;
                    }
                }
                
            } catch (parseError) {
                console.error("[NodeSTManager] 解析jsonData失败:", parseError);
                throw new Error(`解析角色jsonData失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
        }
        
        // 针对"更新人设"情况进行特殊处理
        if (options.status === "更新人设") {
            console.log("[NodeSTManager] 检测到更新人设请求");
            
            if (!options.character?.jsonData) {
                console.error("[NodeSTManager] 更新人设时缺少jsonData");
                throw new Error("更新人设时character需要包含jsonData");
            }
            
            // 验证jsonData结构
            try {
                const jsonData = JSON.parse(options.character.jsonData);
                console.log("[NodeSTManager] 成功解析jsonData，检查角色数据结构...");
                
                const hasRoleCard = !!jsonData.roleCard;
                const hasWorldBook = !!jsonData.worldBook;
                
                console.log("[NodeSTManager] 角色数据验证结果:", {
                    hasRoleCard,
                    hasWorldBook,
                    roleCardName: jsonData.roleCard?.name
                });
                
                if (!hasRoleCard || !hasWorldBook) {
                    console.warn("[NodeSTManager] 警告：角色数据结构不完整，可能会影响更新结果");
                }
            } catch (parseError) {
                console.error("[NodeSTManager] 解析jsonData失败:", parseError);
                throw new Error(`解析角色jsonData失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
        }
        
        // 调用nodeST的processChatMessage方法处理请求
        console.log("[NodeSTManager] 发送请求到NodeST处理...");
        
        const response = await nodeST.processChatMessage({
            userMessage: options.userMessage,
            conversationId: options.conversationId,
            status: options.status || "同一角色继续对话",
            apiKey: apiKey, // Could be empty string
            apiSettings: options.apiSettings,
            jsonString: options.character?.jsonData,
            characterId: options.character?.id,  // Pass character ID for memory service
            customUserName: options.character?.customUserName,  // Pass the customUserName to NodeST
            useToolCalls: NodeSTManagerClass.instance?.searchEnabled || false, // Pass search flag
            geminiOptions: options.geminiOptions, // Pass geminiOptions
        });
        
        if (response.success) {
            console.log(`[NodeSTManager] NodeST处理成功, 响应: ${response.response?.substring(0, 30)}...`);
            return {
                success: true,
                text: response.response
            };
        } else {
            console.error(`[NodeSTManager] NodeST处理失败: ${response.error}`);
            return {
                success: false,
                error: response.error || "未知错误"
            };
        }
    } catch (error) {
        console.error("[NodeSTManager] 处理聊天消息时出错:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误"
        };
    }
  }

  // Add circle interaction methods with proper API settings passing
  async initCharacterCircle(
    character: Character, 
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<boolean> {
    try {
      // If apiKey is provided, use it to update settings
      if (apiKey) {
        // When initializing for a circle, always make sure we have the latest API settings
        this.updateApiSettings(apiKey, apiSettings);
      }
      
      console.log('[NodeSTManager] Initializing circle for character:', character.name, {
        apiProvider: apiSettings?.apiProvider || this.apiSettings.apiProvider,
        hasOpenRouter: (apiSettings?.apiProvider === 'openrouter' && apiSettings?.openrouter?.enabled) || 
                       (this.apiSettings.apiProvider === 'openrouter' && this.apiSettings.openrouter?.enabled),
        openRouterModel: apiSettings?.openrouter?.model || this.apiSettings.openrouter?.model
      });
      
      return await this.nodeST.initCharacterCircle(character);
    } catch (error) {
      console.error('[NodeSTManager] Circle init error:', error);
      return false;
    }
  }

  async processCircleInteraction(
    options: CirclePostOptions, 
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<CircleResponse> {
    try {
      // If apiKey is provided, update settings before processing
      if (apiKey) {
        this.updateApiSettings(apiKey, apiSettings);
      }
      
      // Log more detailed information about which adapter will be used
      console.log('[NodeSTManager] Processing circle interaction:', {
        type: options.type,
        responderId: options.responderId,
        apiProvider: apiSettings?.apiProvider || this.apiSettings.apiProvider,
        hasImages: !!options.content.images?.length
      });
      
      return await this.nodeST.processCircleInteraction(options);
    } catch (error) {
      console.error('[NodeSTManager] Circle interaction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 从特定消息位置重新生成聊天
   * @param params 重新生成所需的参数
   */
  async regenerateFromMessage(params: {
    messageIndex: number;
    conversationId: string;
    apiKey: string;
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
    character?: Character;
    customUserName?: string;
  }): Promise<Message> {
    try {
        console.log('[NodeSTManager] 从消息索引重新生成:', params.messageIndex);

        if (!params.apiKey) {
            console.error('[NodeSTManager] 重新生成失败: 缺少API密钥');
            throw new Error('重新生成需要API密钥');
        }

        // 更新API设置
        this.updateApiSettings(params.apiKey, params.apiSettings);

        // 记录调用参数
        console.log('[NodeSTManager] 重新生成参数:', {
            conversationId: params.conversationId,
            messageIndex: params.messageIndex,
            apiProvider: params.apiSettings?.apiProvider || 'gemini',
            characterId: params.character?.id,
            customUserName: params.character?.customUserName || 'User'
        });

        // 确保NodeST实例存在
        if (!this.nodeST) {
            console.error('[NodeSTManager] NodeST实例未初始化');
            throw new Error('NodeST实例未初始化');
        }

        // 调用NodeST的regenerateFromMessage方法
        const response = await this.nodeST.regenerateFromMessage(
            params.conversationId,
            params.messageIndex,
            params.apiKey,
            params.character?.id, // 传递角色ID用于记忆服务
            params.character?.customUserName // 传递自定义用户名
        );

        console.log('[NodeSTManager] 重新生成成功');
        return {
            success: true,
            text: response || '抱歉，重新生成没有返回有效内容。'
        };
    } catch (error) {
        console.error('[NodeSTManager] 重新生成消息时出错:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
        };
    }
  }

  /**
   * 生成文本 - 用于角色创作助手对话
   * @param messages 消息数组，包含对话历史
   * @param apiKey API密钥
   * @param apiSettings API设置选项
   * @returns 生成的文本响应
   */
  async generateText(
    messages: Array<{ role: string; parts: Array<{ text: string }> }>,
    apiKey: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter';
      openrouter?: {
        enabled: boolean;
        apiKey: string;
        model: string;
      }
      useCloudService?: boolean;
      cloudModel?: string;
      useGeminiModelLoadBalancing?: boolean;
      useGeminiKeyRotation?: boolean;
      additionalGeminiKeys?: string[];
    }
  ): Promise<string> {
    try {
      console.log('[NodeSTManager] 生成文本请求:', {
        messagesCount: messages.length,
        apiProvider: apiSettings?.apiProvider || 'gemini'
      });
      
      // 处理OpenRouter API的情况
      if (apiSettings?.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled) {
        console.log('[NodeSTManager] 使用OpenRouter API');
        
        // OpenRouter使用不同的role名称，需要转换
        const convertedMessages = messages.map(msg => ({
          ...msg,
          role: msg.role === 'user' ? 'user' : 
                msg.role === 'model' ? 'assistant' : 
                msg.role === 'system' ? 'system' : 'assistant'
        }));
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiSettings.openrouter.apiKey}`,
            'HTTP-Referer': 'https://my-app.com',
            'X-Title': 'My App Character Editor'
          },
          body: JSON.stringify({
            model: apiSettings.openrouter.model || 'anthropic/claude-3-haiku',
            messages: convertedMessages.map(msg => ({
              role: msg.role,
              content: msg.parts[0].text
            })),
            temperature: 0.7,
            max_tokens: 2000
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(`OpenRouter API错误 (${response.status}): ${JSON.stringify(errorData) || response.statusText}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
      } 
      // 默认使用Gemini API
      else {
        console.log('[NodeSTManager] 使用Gemini API');
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + apiKey, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: messages,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2000,
              topP: 0.95,
              topK: 40,
            }
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(`Gemini API错误 (${response.status}): ${JSON.stringify(errorData) || response.statusText}`);
        }
        
        const data = await response.json();
        
        // 检查是否有candidateCount
        if (data.candidates && data.candidates.length > 0) {
          if (data.candidates[0].content && 
              data.candidates[0].content.parts && 
              data.candidates[0].content.parts.length > 0) {
            return data.candidates[0].content.parts[0].text;
          }
        } else if (data.promptFeedback) {
          // 处理被屏蔽的内容
          throw new Error('内容被过滤：可能包含敏感或不适当的内容');
        }
        
        throw new Error('无法从API响应中解析生成的文本');
      }
    } catch (error) {
      console.error('[NodeSTManager] 生成文本失败:', error);
      throw error;
    }
  }

  /**
   * Restore chat history from a saved state
   */
  async restoreChatHistory(params: {
    conversationId: string;
    chatHistory: ChatHistoryEntity;
  }): Promise<boolean> {
    try {
      console.log('[NodeSTManager] Restoring chat history for conversation:', params.conversationId);
      
      if (!this.nodeST) {
        console.error('[NodeSTManager] NodeST instance not initialized');
        throw new Error('NodeST instance not initialized');
      }
      
      // Direct approach: restore the chat history using AsyncStorage
      const historyKey = `nodest_${params.conversationId}_history`;
      
      try {
        // Get the current history structure first to preserve metadata
        const currentHistoryData = await AsyncStorage.getItem(historyKey);
        let currentHistory: ChatHistoryEntity | null = null;
        
        if (currentHistoryData) {
          currentHistory = JSON.parse(currentHistoryData);
        }
        
        // Create the restored history object
        const restoredHistory: ChatHistoryEntity = {
          // Use existing structure if available, otherwise use saved structure
          name: currentHistory?.name || params.chatHistory.name || "Chat History",
          role: currentHistory?.role || params.chatHistory.role || "system",
          identifier: currentHistory?.identifier || params.chatHistory.identifier || "chatHistory",
          // Always use the saved message parts
          parts: params.chatHistory.parts
        };
        
        // Save directly to AsyncStorage
        await AsyncStorage.setItem(historyKey, JSON.stringify(restoredHistory));
        
        console.log(`[NodeSTManager] Restored chat history with ${restoredHistory.parts.length} messages`);
        return true;
      } catch (storageError) {
        console.error('[NodeSTManager] AsyncStorage error restoring chat history:', storageError);
        
        // Fallback to using NodeSTCore only if we have an API key
        if (this.apiKey) {
          console.log('[NodeSTManager] Falling back to NodeSTCore for restoration');
          const core = new NodeSTCore(this.apiKey, this.apiSettings);
          return await core.restoreChatHistory(
            params.conversationId,
            params.chatHistory
          );
        }
        
        return false;
      }
    } catch (error) {
      console.error('[NodeSTManager] Error restoring chat history:', error);
      return false;
    }
  }

  // Add static method
  static async restoreChatHistory(params: {
    conversationId: string;
    chatHistory: ChatHistoryEntity;
  }): Promise<boolean> {
    const instance = new NodeSTManagerClass();
    return await instance.restoreChatHistory(params);
  }

  /**
   * 重置对话历史，只保留角色的开场白
   * @param conversationId 会话ID
   * @returns 是否成功重置
   */
  async resetChatHistory(conversationId: string): Promise<boolean> {
    try {
        console.log('[NodeSTManager] Resetting chat history for conversation:', conversationId);      

        // Call NodeST's reset method (no API key required)
        return await this.nodeST.resetChatHistory(conversationId);
    } catch (error) {
        console.error('[NodeSTManager] Error resetting chat history:', error);
        return false;
    }
  }
  // Update static method to ensure API key is passed
  static async resetChatHistory(conversationId: string): Promise<boolean> {
    const instance = new NodeSTManagerClass();
    // No API key required for reset
    return await instance.resetChatHistory(conversationId);
  }

  /**
   * Delete all data associated with a character
   * This method doesn't require API keys since it only performs deletion
   * 
   * @param conversationId Character ID or conversation ID
   * @returns Whether deletion was successful
   */
  async deleteCharacterData(conversationId: string): Promise<boolean> {
    try {
        console.log('[NodeSTManager] Deleting all character data for:', conversationId);

        if (!this.nodeST) {
            console.log('[NodeSTManager] NodeST instance not initialized, creating new instance');
            // No API key needed for deletion operations
            this.nodeST = new NodeST();
        }
        
        // Call the NodeST deleteCharacterData method
        return await this.nodeST.deleteCharacterData(conversationId);
    } catch (error) {
        console.error('[NodeSTManager] Error deleting character data:', error);
        return false;
    }
  }

  // Add static method for character deletion - also doesn't require API key
  static async deleteCharacterData(conversationId: string): Promise<boolean> {
    const instance = new NodeSTManagerClass();
    // We don't need to set API key for deletion operations
    return await instance.deleteCharacterData(conversationId);
  }

  // Add static method for setting search enabled
  static async setSearchEnabled(enabled: boolean): Promise<void> {
    if (NodeSTManagerClass.instance) {
      await NodeSTManagerClass.instance.setSearchEnabled(enabled);
    }
    return Promise.resolve();
  }

  // 新增：立即总结记忆方法
  async summarizeMemoryNow(params: {
    conversationId: string;
    characterId: string;
    apiKey: string;
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'useGeminiModelLoadBalancing' | 'useGeminiKeyRotation' | 'additionalGeminiKeys'>;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // 确保API设置已更新
      this.updateApiSettings(params.apiKey, params.apiSettings);
      // 调用NodeST的processMemorySummaryNow
      const result = await this.nodeST.processMemorySummaryNow({
        conversationId: params.conversationId,
        characterId: params.characterId,
        apiKey: params.apiKey,
        apiSettings: params.apiSettings,
      });
      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }
}

// Create and export a singleton instance
interface ProcessChatOptions {
  userMessage: string;
  status?: "更新人设" | "新建角色" | "同一角色继续对话";
  conversationId: string;
  apiKey: string;
  apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'useGeminiModelLoadBalancing' | 'useGeminiKeyRotation' | 'additionalGeminiKeys'>;
  character?: Character;
  geminiOptions?: {
    geminiPrimaryModel?: string;
    geminiBackupModel?: string;
    retryDelay?: number;
  };
}

interface Message {
  success: boolean;
  text?: string;
  error?: string;
}

export const NodeSTManager = new NodeSTManagerClass();

// 添加静态方法
NodeSTManager.generateText = async function(
  messages: Array<{ role: string; parts: Array<{ text: string }> }>,
  apiKey: string,
  apiSettings?: {
    apiProvider: 'gemini' | 'openrouter';
    openrouter?: {
      enabled: boolean;
      apiKey: string;
      model: string;
    useCloudService?: boolean;
    CloudModel?: string;
    useGeminiModelLoadBalancing?: boolean;
    useGeminiKeyRotation?: boolean;
    additionalGeminiKeys?: string[];
    }
  }
): Promise<string> {
  const instance = new NodeSTManagerClass();
  return await instance.generateText(messages, apiKey, apiSettings);
};

// 静态方法也暴露
NodeSTManager.summarizeMemoryNow = async function(params: {
  conversationId: string;
  characterId: string;
  apiKey: string;
  apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'useGeminiModelLoadBalancing' | 'useGeminiKeyRotation' | 'additionalGeminiKeys'>;
}): Promise<{ success: boolean; error?: string }> {
  const instance = new NodeSTManagerClass();
  return await instance.summarizeMemoryNow(params);
};

