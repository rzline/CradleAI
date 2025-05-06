import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeminiAdapter } from '../utils/gemini-adapter';
import { OpenRouterAdapter } from '../utils/openrouter-adapter';
import { OpenAIAdapter } from '../utils/openai-adapter';
import { CharacterUtils } from '../utils/character-utils';
import { 
    RoleCardJson,
    WorldBookJson,
    PresetJson,
    AuthorNoteJson,
    ChatMessage,
    ChatHistoryEntity,
    GeminiMessage,
    RegexScript,
    GlobalSettings
} from '../../../shared/types';
import { MessagePart } from '@/shared/types';
import { memoryService } from '@/services/memory-service';

export class NodeSTCore {
        // 角色数据文件存储目录
        private static characterDataDir = FileSystem.documentDirectory + 'nodest_characters/';
            // 辅助方法：获取角色数据文件路径
    private getCharacterDataFilePath(key: string): string {
        // key 形如 nodest_{conversationId}_{suffix}
        return NodeSTCore.characterDataDir + key + '.json';
    }
    private geminiAdapter: GeminiAdapter | null = null;
    private openRouterAdapter: OpenRouterAdapter | null = null;
    private openAICompatibleAdapter: OpenAIAdapter | null = null;
    private currentContents: ChatMessage[] | null = null;
    private apiKey: string;
    private apiSettings: Partial<GlobalSettings['chat']> = {
        apiProvider: 'gemini'
    };
    private geminiPrimaryModel?: string;
    private geminiBackupModel?: string;
    private retryDelay?: number;

        // 新增：立即总结记忆方法
        async summarizeMemoryNow(
            conversationId: string,
            characterId: string,
            apiKey: string,
            apiSettings?: Partial<GlobalSettings['chat']>
): Promise<boolean> {
            try {
                // 加载当前聊天历史
                const chatHistory = await this.loadJson<ChatHistoryEntity>(
                    this.getStorageKey(conversationId, '_history')
                );
                if (!chatHistory) throw new Error('未找到聊天历史');
                // 强制调用memoryService的generateSummary（无视阈值）
                const settings = await memoryService.loadSettings(characterId);
                // 直接调用generateSummary
                const summarized = await (memoryService as any).generateSummary(
                    conversationId,
                    chatHistory,
                    settings,
                    apiKey,
                    apiSettings
                );
                // 保存新历史
                await this.saveJson(this.getStorageKey(conversationId, '_history'), summarized);
                return true;
            } catch (e) {
                console.error('[NodeSTCore] summarizeMemoryNow error:', e);
                return false;
            }
        }
    constructor(
        apiKey: string,
        apiSettings?: Partial<GlobalSettings['chat']>,
        // 新增参数
        geminiOptions?: {
            geminiPrimaryModel?: string;
            geminiBackupModel?: string;
            retryDelay?: number;
        }
    ) {       
        this.apiKey = apiKey;
        this.apiSettings = apiSettings || { apiProvider: 'gemini' };
        // 新增：保存gemini模型和retryDelay
        if (geminiOptions) {
            this.geminiPrimaryModel = geminiOptions.geminiPrimaryModel;
            this.geminiBackupModel = geminiOptions.geminiBackupModel;
            this.retryDelay = geminiOptions.retryDelay;
        }
        this.initAdapters(apiKey, apiSettings, geminiOptions);
    }

    updateApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        
        // Initialize Gemini adapter with load balancing settings if available
        this.geminiAdapter = new GeminiAdapter(
            apiKey, 
            {
                useModelLoadBalancing: this.apiSettings?.useGeminiModelLoadBalancing || false,
                useKeyRotation: this.apiSettings?.useGeminiKeyRotation || false,
                additionalKeys: this.apiSettings?.additionalGeminiKeys || []
            }
        );

        if (this.apiSettings?.apiProvider === 'openrouter' && 
            this.apiSettings.openrouter?.enabled &&
            this.apiSettings.openrouter?.apiKey) {
            this.openRouterAdapter = new OpenRouterAdapter(
                this.apiSettings.openrouter.apiKey,
                this.apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
            );
        }
    }

    // Update method to handle API settings
    updateApiSettings(
        apiKey: string,
        apiSettings?: Partial<GlobalSettings['chat']>,
        geminiOptions?: {
            geminiPrimaryModel?: string;
            geminiBackupModel?: string;
            retryDelay?: number;
        }
    ): void {
        this.apiKey = apiKey;
        if (apiSettings) {
            this.apiSettings = apiSettings;
        }
        // 新增：保存gemini模型和retryDelay
        if (geminiOptions) {
            this.geminiPrimaryModel = geminiOptions.geminiPrimaryModel;
            this.geminiBackupModel = geminiOptions.geminiBackupModel;
            this.retryDelay = geminiOptions.retryDelay;
        }
        this.initAdapters(apiKey, apiSettings, geminiOptions);
    }

    private initAdapters(
        apiKey: string | null = null,
        apiSettings?: Partial<GlobalSettings['chat']>,        
        geminiOptions?: {
            geminiPrimaryModel?: string;
            geminiBackupModel?: string;
            retryDelay?: number;
        }
    ) {
        // 不再为空 API 密钥抛出错误，而是记录一条消息
        if (!apiKey) {
            console.log('[NodeSTCore] No API key provided, will attempt to use cloud service if available');
        }
    
        // 初始化 Gemini，允许 apiKey 为 null 或 empty，便于回退到云服务
        this.geminiAdapter = new GeminiAdapter(
            apiKey || "", // Pass empty string if null
            {
                useModelLoadBalancing: apiSettings?.useGeminiModelLoadBalancing || false,
                useKeyRotation: apiSettings?.useGeminiKeyRotation || false,
                additionalKeys: apiSettings?.additionalGeminiKeys || [],
                primaryModel: geminiOptions?.geminiPrimaryModel || this.geminiPrimaryModel,
                backupModel: geminiOptions?.geminiBackupModel || this.geminiBackupModel,
                retryDelay: geminiOptions?.retryDelay || this.retryDelay
            }
        );
        
        console.log('[NodeSTCore] GeminiAdapter initialized with load balancing options:', {
            useModelLoadBalancing: apiSettings?.useGeminiModelLoadBalancing || false,
            useKeyRotation: apiSettings?.useGeminiKeyRotation || false,
            additionalKeysCount: apiSettings?.additionalGeminiKeys?.length || 0,
            usingCloudFallback: !apiKey,
            primaryModel: this.geminiPrimaryModel,
            backupModel: this.geminiBackupModel,
            retryDelay: this.retryDelay
        });
        
        // 初始化 OpenRouter 如果已启用且有 API 密钥
        if (apiSettings?.apiProvider === 'openrouter' && 
            apiSettings.openrouter?.enabled && 
            apiSettings.openrouter?.apiKey) {
            console.log('[NodeSTCore] Initializing OpenRouter adapter with:', {
                apiKeyLength: apiSettings.openrouter.apiKey.length,
                model: apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
            });
            this.openRouterAdapter = new OpenRouterAdapter(
                apiSettings.openrouter.apiKey,
                apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
            );
        } else {
            this.openRouterAdapter = null;
            console.log('[NodeSTCore] OpenRouter not enabled, using Gemini adapter only');
        }

        // 初始化 OpenAIAdapter（OpenAIcompatible）
        if (
            apiSettings?.apiProvider === 'openai-compatible' &&
            apiSettings.OpenAIcompatible?.enabled &&
            apiSettings.OpenAIcompatible?.apiKey &&
            apiSettings.OpenAIcompatible?.endpoint &&
            apiSettings.OpenAIcompatible?.model
        ) {
            this.openAICompatibleAdapter = new OpenAIAdapter({
                endpoint: apiSettings.OpenAIcompatible.endpoint,
                apiKey: apiSettings.OpenAIcompatible.apiKey,
                model: apiSettings.OpenAIcompatible.model
            });
            console.log('[NodeSTCore] OpenAIAdapter 初始化:', {
                endpoint: apiSettings.OpenAIcompatible.endpoint,
                model: apiSettings.OpenAIcompatible.model
            });
        } else {
            this.openAICompatibleAdapter = null;
        }

        if (apiSettings) {
            this.apiSettings = apiSettings;
        }
    }

    private getActiveAdapter() {
        // 检查是否使用 OpenRouter
        if (this.apiSettings?.apiProvider === 'openrouter' && 
            this.apiSettings.openrouter?.enabled && 
            this.openRouterAdapter) {
            console.log('[NodeSTCore] Using OpenRouter adapter with model:', 
                this.apiSettings.openrouter.model || 'default');
            return this.openRouterAdapter;
        }
        
        // 检查是否使用 OpenAIcompatible provider
        if (
            this.apiSettings?.apiProvider === 'openai-compatible' &&
            this.apiSettings.OpenAIcompatible?.enabled &&
            this.openAICompatibleAdapter
        ) {
            console.log('[NodeSTCore] Using OpenAIAdapter with endpoint:', this.apiSettings.OpenAIcompatible.endpoint);
            return this.openAICompatibleAdapter;
        }

        // 返回 Gemini adapter（可能为 null）
        // 这允许 generateContent 尝试使用云服务
        console.log('[NodeSTCore] Using Gemini adapter' + (!this.geminiAdapter ? ' (not initialized)' : ''));
        return this.geminiAdapter;
    }

    private getStorageKey(conversationId: string, suffix: string = ''): string {
        return `nodest_${conversationId}${suffix}`;
    }

    private async saveJson(key: string, data: any): Promise<void> {
        try {
            // 统一全部写入文件
            await FileSystem.makeDirectoryAsync(NodeSTCore.characterDataDir, { intermediates: true }).catch(() => {});
            const filePath = this.getCharacterDataFilePath(key);
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
        } catch (error) {
            console.error(`Error saving data for key ${key}:`, error);
            throw error;
        }
    }

    private async loadJson<T>(key: string): Promise<T | null> {
        try {
            // 统一全部从文件读取
            const filePath = this.getCharacterDataFilePath(key);
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) return null;
            const content = await FileSystem.readAsStringAsync(filePath);
            return content ? JSON.parse(content) : null;
        } catch (error) {
            console.error(`Error loading data for key ${key}:`, error);
            return null;
        }
    }

    private async saveContents(contents: ChatMessage[], sessionId: string): Promise<void> {
        try {
            const cleanedContents = contents.filter(item => item !== null);
            await this.saveJson(this.getStorageKey(sessionId, '_contents'), cleanedContents);
            this.currentContents = cleanedContents;
        } catch (error) {
            console.error('Error saving contents:', error);
            throw error;
        }
    }

    // Character Creation Methods
    async createNewCharacter(
        conversationId: string,
        roleCard: RoleCardJson,
        worldBook: WorldBookJson,
        preset: PresetJson,
        authorNote?: AuthorNoteJson,
        chatHistory?: ChatHistoryEntity,  // Add parameter for chatHistory
        options?: { isCradleGeneration?: boolean }
    ): Promise<boolean> {
        try {
            // Log the input parameters fully to verify what we're getting
            console.log('[NodeSTCore] createNewCharacter received parameters:', {
                conversationId,
                roleCardDefined: roleCard !== undefined && roleCard !== null,
                roleCardType: typeof roleCard,
                roleCardKeys: roleCard ? Object.keys(roleCard) : 'undefined roleCard',
                worldBookDefined: worldBook !== undefined && worldBook !== null,
                presetDefined: preset !== undefined && preset !== null,
                authorNoteDefined: !!authorNote,
                chatHistoryDefined: !!chatHistory
            });

            // CRITICAL: Create a defensive copy of roleCard to prevent modification issues
            const safeRoleCard: RoleCardJson = roleCard ? {
                name: roleCard.name || "Unnamed Character",
                first_mes: roleCard.first_mes || "Hello!",
                description: roleCard.description || "No description provided.",
                personality: roleCard.personality || "Friendly",
                scenario: roleCard.scenario || "",
                mes_example: roleCard.mes_example || "",
                background: roleCard.background,
                data: roleCard.data
            } : {
                name: "Unnamed Character",
                first_mes: "Hello! (Default message)",
                description: "This character was created with missing information.",
                personality: "Friendly",
                scenario: "",
                mes_example: ""
            };

            console.log('[NodeSTCore] Using safe roleCard:', {
                name: safeRoleCard.name,
                hasMesExample: !!safeRoleCard.mes_example,
                hasDescription: !!safeRoleCard.description
            });

            // Safety check for worldBook
            const safeWorldBook: WorldBookJson = worldBook || { entries: {} };
            
            // Safety check for preset
            const safePreset: PresetJson = preset || { 
                prompts: [],
                prompt_order: [{ order: [] }]
            };

            // 保存角色相关文件 - use safe versions
            await Promise.all([
                this.saveJson(this.getStorageKey(conversationId, '_role'), safeRoleCard),
                this.saveJson(this.getStorageKey(conversationId, '_world'), safeWorldBook),
                this.saveJson(this.getStorageKey(conversationId, '_preset'), safePreset)
            ]);

            if (authorNote) {
                await this.saveJson(this.getStorageKey(conversationId, '_note'), authorNote);
            }

            // 初始化聊天历史
            if (chatHistory) {
                try {
                    console.log('[NodeSTCore] 初始化聊天历史，使用传入的聊天历史');
                    
                    // Ensure chatHistory has all required fields
                    const historyEntity: ChatHistoryEntity = {
                        name: chatHistory.name || "Chat History",
                        role: chatHistory.role || "system",
                        parts: chatHistory.parts || [],
                        identifier: chatHistory.identifier || "chatHistory"
                    };
                    
                    // If no first_mes in chatHistory but roleCard has it, add it
                    if (safeRoleCard.first_mes && 
                        !historyEntity.parts.some(p => p.is_first_mes)) {
                        
                        console.log('[NodeSTCore] 添加缺失的first_mes到聊天历史');
                        historyEntity.parts.unshift({
                            role: "model",
                            parts: [{ text: safeRoleCard.first_mes }],
                            is_first_mes: true
                        });
                    }
                    
                    // Extract D-entries to ensure they're properly injected
                    const dEntries = CharacterUtils.extractDEntries(
                        safePreset,
                        safeWorldBook,
                        authorNote
                    );
                    
                    // Insert D-entries if there are any
                    if (dEntries.length > 0) {
                        console.log('[NodeSTCore] 向聊天历史注入D类条目，数量:', dEntries.length);
                        const updatedHistory = this.insertDEntriesToHistory(
                            historyEntity,
                            dEntries,
                            ""  // No user message for initial history
                        );
                        
                        // Save the updated history with D-entries
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_history'),
                            updatedHistory
                        );
                        
                        console.log('[NodeSTCore] 聊天历史（含D类条目）初始化成功');
                    } else {
                        // Save the history without D-entries
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_history'),
                            historyEntity
                        );
                        
                        console.log('[NodeSTCore] 聊天历史（无D类条目）初始化成功');
                    }
                } catch (historyError) {
                    console.error('[NodeSTCore] Error initializing chat history:', historyError);
                    // Create default chat history as a fallback
                    this.createDefaultChatHistory(conversationId, safeRoleCard, safePreset, safeWorldBook, authorNote);
                }
            } else {
                console.log('[NodeSTCore] 未提供聊天历史，创建默认聊天历史');
                // Create default chat history when none is provided
                this.createDefaultChatHistory(conversationId, safeRoleCard, safePreset, safeWorldBook, authorNote);
            }

            try {
                // 构建初始框架 - wrap in try/catch to isolate errors
                console.log('[NodeSTCore] Building initial framework...');
                const [rFramework, chatHistory] = CharacterUtils.buildRFramework(
                    safePreset,
                    safeRoleCard,
                    safeWorldBook,
                    { isCradleGeneration: options?.isCradleGeneration || false }
                );
                
                console.log('[NodeSTCore] Framework built successfully:', {
                    rFrameworkLength: rFramework?.length || 0,
                    hasChatHistory: !!chatHistory
                });

                // 确保保存完整的框架内容
                await this.saveJson(
                    this.getStorageKey(conversationId, '_contents'),
                    rFramework
                );

                // Safely extract D-entries
                const dEntries = CharacterUtils.extractDEntries(safePreset, safeWorldBook, authorNote);

                // 初始化聊天历史
                if (chatHistory) {
                    try {
                        // 添加开场白
                        let historyParts: ChatMessage[] = [];
                        
                        if (safeRoleCard.first_mes) {
                            historyParts.push({
                                role: "model",
                                parts: [{ text: safeRoleCard.first_mes }],
                                is_first_mes: true
                            });
                        }

                        const historyEntity: ChatHistoryEntity = {
                            name: chatHistory.name || "Chat History",
                            role: chatHistory.role || "system",
                            parts: historyParts,
                            identifier: chatHistory.identifier
                        };

                        // 插入D类条目
                        const updatedHistory = this.insertDEntriesToHistory(
                            historyEntity,
                            dEntries,
                            ""
                        );
                        
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_history'),
                            updatedHistory
                        );
                        
                        console.log('[NodeSTCore] Chat history initialized successfully');
                    } catch (historyError) {
                        console.error('[NodeSTCore] Error initializing chat history:', historyError);
                        // Continue even if history initialization fails
                    }
                }

                return true;
            } catch (frameworkError) {
                console.error('[NodeSTCore] Error in framework creation:', frameworkError);
                
                // Try a minimal framework as fallback
                try {
                    console.log('[NodeSTCore] Attempting to create minimal framework as fallback...');
                    
                    // Create very simple framework
                    const minimalFramework: ChatMessage[] = [
                        {
                            name: "Character Info",
                            role: "user",
                            parts: [{ text: `Name: ${safeRoleCard.name}\nPersonality: ${safeRoleCard.personality}\nDescription: ${safeRoleCard.description}` }]
                        },
                        {
                            name: "Chat History",
                            role: "system",
                            parts: [{
                                role: "model", 
                                parts: [{ text: safeRoleCard.first_mes || "Hello!" }],
                                is_first_mes: true
                            } as unknown as MessagePart]
                        }
                    ];
                    
                    await this.saveJson(
                        this.getStorageKey(conversationId, '_contents'),
                        minimalFramework
                    );
                    
                    const minimalHistoryEntity: ChatHistoryEntity = {
                        name: "Chat History",
                        role: "system",
                        parts: [{
                            role: "model",
                            parts: [{ text: safeRoleCard.first_mes || "Hello!" }],
                            is_first_mes: true
                        } as ChatMessage],
                        identifier: "chatHistory"
                    };
                    
                    await this.saveJson(
                        this.getStorageKey(conversationId, '_history'),
                        minimalHistoryEntity
                    );
                    
                    console.log('[NodeSTCore] Minimal framework created as fallback');
                    return true;
                } catch (fallbackError) {
                    console.error('[NodeSTCore] Even fallback framework creation failed:', fallbackError);
                    throw frameworkError; // Throw the original error
                }
            }
        } catch (error) {
            console.error('[NodeSTCore] Error creating new character:', error);
            return false;
        }
    }
    
    // Helper method to create a default chat history
    private async createDefaultChatHistory(
        conversationId: string, 
        roleCard: RoleCardJson,
        preset: PresetJson,
        worldBook: WorldBookJson,
        authorNote?: AuthorNoteJson
    ): Promise<void> {
        try {
            console.log('[NodeSTCore] 创建默认聊天历史...');
            
            // Find Chat History identifier from preset if available
            let chatHistoryIdentifier = "chatHistory";
            if (preset && preset.prompt_order && preset.prompt_order[0]) {
                const order = preset.prompt_order[0].order || [];
                const chatHistoryEntry = order.find(entry => 
                    entry.identifier.toLowerCase().includes('chathistory'));
                if (chatHistoryEntry) {
                    chatHistoryIdentifier = chatHistoryEntry.identifier;
                }
            }
            
            // Create messages array with first_mes if available
            const historyParts: ChatMessage[] = [];
            if (roleCard.first_mes) {
                historyParts.push({
                    role: "model",
                    parts: [{ text: roleCard.first_mes }],
                    is_first_mes: true
                });
                console.log('[NodeSTCore] 添加角色第一条消息到默认聊天历史');
            }
            
            const historyEntity: ChatHistoryEntity = {
                name: "Chat History",
                role: "system",
                parts: historyParts,
                identifier: chatHistoryIdentifier
            };
            
            // Extract and insert D-entries (worldbook entries)
            const dEntries = CharacterUtils.extractDEntries(preset, worldBook, authorNote);
            
            if (dEntries.length > 0) {
                console.log('[NodeSTCore] 向默认聊天历史注入D类条目，数量:', dEntries.length);
                const updatedHistory = this.insertDEntriesToHistory(
                    historyEntity,
                    dEntries,
                    ""  // No user message for initial history
                );
                
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );
            } else {
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    historyEntity
                );
            }
            
            console.log('[NodeSTCore] 默认聊天历史创建完成');
        } catch (error) {
            console.error('[NodeSTCore] Error creating default chat history:', error);
            throw error;
        }
    }

    async updateCharacter(
        conversationId: string,
        roleCard: RoleCardJson,
        worldBook: WorldBookJson,
        preset: PresetJson,
        authorNote?: AuthorNoteJson
    ): Promise<boolean> {
        try {
            // 1. 保存原有聊天历史
            const existingHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );

            // 2. 强制重建框架内容
            const [rFramework, _] = CharacterUtils.buildRFramework(
                preset,
                roleCard,  // 使用最新的角色卡数据
                worldBook  // 使用最新的世界书信息
            );

            // 3. 重新提取D类条目
            const dEntries = CharacterUtils.extractDEntries(
                preset,
                worldBook,
                authorNote
            );

            // 4. 立即保存更新的文件和框架内容
            await Promise.all([
                this.saveJson(this.getStorageKey(conversationId, '_role'), roleCard),
                this.saveJson(this.getStorageKey(conversationId, '_world'), worldBook),
                this.saveJson(this.getStorageKey(conversationId, '_preset'), preset),
                this.saveJson(this.getStorageKey(conversationId, '_contents'), rFramework), // 保存新的框架内容
                authorNote ? 
                    this.saveJson(this.getStorageKey(conversationId, '_note'), authorNote) : 
                    Promise.resolve()
            ]);

            // 5. 如果存在原有聊天历史，立即应用新的D类条目
            if (existingHistory) {
                // 清除旧的D类条目
                existingHistory.parts = existingHistory.parts.filter(
                    msg => !msg.is_d_entry
                );

                // 重新插入新的D类条目
                const updatedHistory = this.insertDEntriesToHistory(
                    existingHistory,
                    dEntries,
                    existingHistory.parts[existingHistory.parts.length - 1]?.parts[0]?.text || ''
                );

                // 保存更新后的历史
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );

                console.log('[NodeSTCore] Updated character data:', {
                    hasNewFramework: !!rFramework?.length,
                    frameworkSize: rFramework?.length,
                    dEntriesCount: dEntries.length,
                    historyMessagesCount: updatedHistory.parts.length
                });
            }

            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error updating character:', error);
            return false;
        }
    }

    async continueChat(
        conversationId: string,
        userMessage: string,
        apiKey: string | null = null, // 允许 API 密钥为 null
        characterId?: string,
        customUserName?: string,
        useToolCalls: boolean = false
    ): Promise<string | null> {
        try {
            console.log('[NodeSTCore] Starting continueChat:', {
                conversationId,
                messageLength: userMessage.length,
                apiProvider: this.apiSettings?.apiProvider,
                useGeminiLoadBalancing: this.apiSettings?.useGeminiModelLoadBalancing,
                useGeminiKeyRotation: this.apiSettings?.useGeminiKeyRotation,
                additionalKeysCount: this.apiSettings?.additionalGeminiKeys?.length || 0,
                hasCustomUserName: !!customUserName,
                useToolCalls: useToolCalls,
                apiKeyProvided: !!apiKey,
                characterId: characterId
            });
    
            // 确保 Adapter 已初始化 - 传递 apiKey 即使它是 null
            if (!this.geminiAdapter || !this.openRouterAdapter || !this.openAICompatibleAdapter) {
                this.initAdapters(apiKey, this.apiSettings);
            }
    
            // 获取正确的 adapter
            const adapter = this.getActiveAdapter();
            
            // 移除严格检查，允许接口回退到云服务
            if (!adapter) {
                console.warn("[NodeSTCore] API adapter not properly initialized - will attempt to use cloud service");
                // 不再抛出错误
            }

            // 确保加载最新的角色数据
            const roleCard = await this.loadJson<RoleCardJson>(
                this.getStorageKey(conversationId, '_role')
            );
            const worldBook = await this.loadJson<WorldBookJson>(
                this.getStorageKey(conversationId, '_world')
            );
            const preset = await this.loadJson<PresetJson>(
                this.getStorageKey(conversationId, '_preset')
            );
            const authorNote = await this.loadJson<AuthorNoteJson>(
                this.getStorageKey(conversationId, '_note')
            );
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );

            console.log('[NodeSTCore] Character data loaded:', {
                hasRoleCard: !!roleCard,
                hasWorldBook: !!worldBook,
                hasPreset: !!preset,
                hasAuthorNote: !!authorNote,
                hasChatHistory: !!chatHistory,
                historyLength: chatHistory?.parts?.length
            });

            // Validate required data
            if (!roleCard || !worldBook || !preset || !chatHistory) {
                const missingData = [];
                if (!roleCard) missingData.push('roleCard');
                if (!worldBook) missingData.push('worldBook');
                if (!preset) missingData.push('preset');
                if (!chatHistory) missingData.push('chatHistory');

                const errorMessage = `Missing required data: ${missingData.join(', ')}`;
                console.error('[NodeSTCore]', errorMessage);
                return null;
            }

            // 重要：强制重新提取D类条目，确保使用最新的worldBook
            const dEntries = CharacterUtils.extractDEntries(
                preset!,
                worldBook!,
                authorNote ?? undefined
            );
            
            // NEW CODE: Load character data to check for custom user settings
            if (characterId) {
                try {
                    // Try to dynamically import AsyncStorage if not available directly
                    let AsyncStorage = null;
                    try {
                        AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                    } catch (importError) {
                        console.log('[NodeSTCore] Unable to import AsyncStorage:', importError);
                    }
                    
                    if (AsyncStorage) {
                        // Check for global custom user settings first (they're usually smaller)
                        const globalSettingsKey = 'global_user_custom_setting';
                        let globalCustomSetting = null;
                        
                        try {
                            const globalSettingsData = await AsyncStorage.getItem(globalSettingsKey);
                            if (globalSettingsData) {
                                globalCustomSetting = JSON.parse(globalSettingsData);
                                if (globalCustomSetting && !globalCustomSetting.disable) {
                                    console.log('[NodeSTCore] Found global custom user setting:', globalCustomSetting.comment);
                                    const formattedContent = `The following are some information about the character {{user}} I will be playing.\n\n<{{user}}'s_info>${globalCustomSetting.content}</{{user}}'s_info>`;

                                    // Convert global custom setting to D-entry format
                                    const globalCustomDEntry: ChatMessage = {
                                        role: "user",
                                        parts: [{ text: formattedContent }],
                                        name: globalCustomSetting.comment || "自设",
                                        is_d_entry: true,
                                        position: globalCustomSetting.position || 4,
                                        injection_depth: globalCustomSetting.depth || 1,
                                        constant: true
                                    };
                                    
                                    // Add to D-entries array
                                    dEntries.push(globalCustomDEntry);
                                    console.log('[NodeSTCore] Added global custom user setting to D-entries');
                                }
                            }
                        } catch (globalSettingError) {
                            console.error('[NodeSTCore] Error parsing global custom settings:', globalSettingError);
                        }
                        
                        // Check for character-specific custom user setting with error handling for large data
                        const characterKey = `character_${characterId}`;
                        try {
                            // First try the standard approach
                            const characterData = await AsyncStorage.getItem(characterKey);
                            if (characterData) {
                                const character = JSON.parse(characterData);
                                this.processCharacterCustomSetting(character, dEntries);
                            }
                        } catch (error) {
                            // Type check the error before using it
                            const largeRowError = error as Error;
                            // If we hit the "Row too big" error, try with a more specific approach
                            console.warn('[NodeSTCore] Error with standard character loading, trying alternative approach:', largeRowError.message);
                            
                            if (largeRowError instanceof Error && largeRowError.message.includes('Row too big')) {
                                try {
                                    // Create smaller keys specifically for the custom setting
                                    const customSettingKey = `character_${characterId}_custom_setting`;
                                    const hasCustomSettingKey = `character_${characterId}_has_custom`;
                                    
                                    // Get the specific custom setting data
                                    const customSettingData = await AsyncStorage.getItem(customSettingKey);
                                    const hasCustomSetting = await AsyncStorage.getItem(hasCustomSettingKey);
                                    
                                    if (customSettingData && hasCustomSetting === 'true') {
                                        const customSetting = JSON.parse(customSettingData);
                                        
                                        if (customSetting && !customSetting.disable && !customSetting.global) {
                                            console.log('[NodeSTCore] Found character-specific custom setting via alternative method:', 
                                                customSetting.comment);
                                            
                                                            // Format the custom setting content with the wrapper
                                                            const formattedContent = `The following are some information about the character {{user}} I will be playing.\n\n<{{user}}'s_info>${customSetting.content}</{{user}}'s_info>`;

                                                            // Convert to D-entry
                                                            const characterCustomDEntry: ChatMessage = {
                                                                role: "user",
                                                                parts: [{ text: formattedContent }],
                                                                name: customSetting.comment || "自设",
                                                                is_d_entry: true,
                                                                position: customSetting.position || 4,
                                                                injection_depth: customSetting.depth || 1,
                                                                constant: true
                                                            };
                                            
                                            dEntries.push(characterCustomDEntry);
                                            console.log('[NodeSTCore] Added character-specific custom setting to D-entries (alternative method)');
                                        }
                                    }
                                } catch (alternativeError) {
                                    console.error('[NodeSTCore] Alternative method for loading custom settings failed:', alternativeError);
                                }
                            }
                        }
                    }
                } catch (customSettingError) {
                    console.warn('[NodeSTCore] Error loading custom user settings:', customSettingError);
                    // Continue without custom settings if there's an error
                }
            }

            console.log('[NodeSTCore] D-entries for chat:', {
                totalEntries: dEntries.length,
                entriesByType: {
                    position4: dEntries.filter(d => d.position === 4).length,
                    authorNote: dEntries.filter(d => d.is_author_note).length,
                    position2: dEntries.filter(d => d.position === 2).length,
                    position3: dEntries.filter(d => d.position === 3).length,
                    customSetting: dEntries.filter(d => d.name === "自设" || d.name?.includes("自设")).length
                }
            });

            // 记忆搜索功能，在消息发送前尝试检索相关记忆
            let memorySearchResults = null;
            if (characterId) {
                try {
                    console.log('[NodeSTCore] 开始搜索角色相关记忆:', {
                        characterId,
                        conversationId,
                        queryLength: userMessage.length
                    });
                    
                    // 尝试导入并使用Mem0Service
                    let Mem0Service = null;
                    try {
                        // 动态导入以避免循环依赖
                        Mem0Service = (await import('@/src/memory/services/Mem0Service')).default.getInstance();
                    } catch (importError) {
                        console.log('[NodeSTCore] 无法导入Mem0Service:', importError);
                    }
                    
                    if (Mem0Service) {
                        // 使用记忆服务搜索相关记忆
                        memorySearchResults = await Mem0Service.searchMemories(
                            userMessage,
                            characterId,
                            conversationId,
                            5 // 限制返回最相关的5条记忆
                        );
                        
                        console.log('[NodeSTCore] 记忆搜索完成:', {
                            resultsCount: memorySearchResults?.results?.length || 0,
                            success: !!memorySearchResults
                        });
                        
                        // 记录找到的记忆内容
                        if (memorySearchResults?.results?.length > 0) {
                            memorySearchResults.results.forEach((item: any, idx: number) => {
                                const memory = item.memory.substring(0, 100) + (item.memory.length > 100 ? '...' : '');
                                console.log(`[NodeSTCore] 记忆 #${idx+1}: ${memory} (相似度: ${item.score?.toFixed(4) || 'N/A'})`);
                            });
                        }
                    } else {
                        console.log('[NodeSTCore] 记忆服务不可用，跳过记忆搜索');
                    }
                } catch (memoryError) {
                    console.warn('[NodeSTCore] 记忆搜索失败，但不影响主要会话流程:', memoryError);
                    // 记忆搜索失败不应阻止对话继续
                }
            }

            // 修改：只在这里添加用户消息
            const updatedChatHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: [
                    ...(chatHistory.parts?.filter(msg => 
                        !msg.is_d_entry && 
                        msg.parts[0]?.text !== userMessage
                    ) || []),
                    {
                        role: "user",
                        parts: [{ text: userMessage }]
                    } as ChatMessage
                ]
            };

            // NEW: Check if we need to summarize the chat history
            if (characterId) {
                try {
                    console.log('[NodeSTCore] Checking if chat history needs summarization...');
                    // Only attempt summarization if we have an API key
                    const summarizedHistory = apiKey ? 
                        await memoryService.checkAndSummarize(
                            conversationId,
                            characterId,
                            updatedChatHistory,
                            apiKey,
                            {
                                apiProvider: this.apiSettings.apiProvider === 'openrouter' ? 'openrouter' : 'gemini',
                                openrouter: this.apiSettings.openrouter,
                            }
                        ) : updatedChatHistory;
                    
                    // Use the potentially summarized history
                    if (summarizedHistory !== updatedChatHistory) {
                        console.log('[NodeSTCore] Chat history was summarized');
                        updatedChatHistory.parts = summarizedHistory.parts;
                    }
                } catch (summaryError) {
                    console.error('[NodeSTCore] Error in chat summarization:', summaryError);
                    // Continue with unsummarized history
                }
            }

            // 处理对话
            console.log('[NodeSTCore] Processing chat...', {
                characterId_passed_to_processChat: characterId // <--- 记录传递给processChat的characterId
            });
            const response = useToolCalls 
                ? await this.processChatWithTools(
                    userMessage,
                    updatedChatHistory,
                    dEntries,
                    conversationId,
                    roleCard,
                    adapter || undefined,
                    customUserName,
                    memorySearchResults,
                    characterId // 新增
                )
                : await this.processChat(
                    userMessage,
                    updatedChatHistory,
                    dEntries,
                    conversationId,
                    roleCard,
                    adapter || undefined,
                    customUserName,
                    memorySearchResults,
                    characterId // 新增
                );

            // 如果收到响应，将AI回复也添加到历史记录
            if (response) {
                // 使用 updateChatHistory 方法
                const updatedHistory = this.updateChatHistory(
                    updatedChatHistory,
                    userMessage,
                    response,
                    dEntries
                );

                // 保存更新后的历史
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );

                console.log('[NodeSTCore] Chat history saved:', {
                    totalMessages: updatedHistory.parts.length,
                    lastMessage: response.substring(0, 50) + '...'
                });
            }

            return response;

        } catch (error) {
            console.error('[NodeSTCore] Error in continueChat:', error);
            return null;
        }
    }

    private processCharacterCustomSetting(character: any, dEntries: ChatMessage[]): void {
        // Check for character-specific custom user setting
        if (character.hasCustomUserSetting && 
            character.customUserSetting && 
            !character.customUserSetting.disable &&
            !character.customUserSetting.global) { // Only use character-specific if not global
            
            console.log('[NodeSTCore] Found character-specific custom user setting:', character.customUserSetting.comment);
            
            // Format the custom setting content with the wrapper
            const formattedContent = `The following are some information about the character {{user}} I will be playing.\n\n<{{user}}'s_info>${character.customUserSetting.content}</{{user}}'s_info>`;
            
            // Convert character custom setting to D-entry format
            const characterCustomDEntry: ChatMessage = {
                role: "user",
                parts: [{ text: formattedContent }],
                name: character.customUserSetting.comment || "自设",
                is_d_entry: true,
                position: character.customUserSetting.position || 4,
                injection_depth: character.customUserSetting.depth || 1,
                constant: true
            };
            
            // Add to D-entries array
            dEntries.push(characterCustomDEntry);
            console.log('[NodeSTCore] Added character-specific custom user setting to D-entries');
        }
    }

    // Helper methods for processing and history management
    private shouldIncludeDEntry(
        entry: ChatMessage,
        messages: ChatMessage[]
    ): boolean {
        // 作者注释始终包含
        if (entry.is_author_note || entry.name === "Author Note") {
            return true;
        }

        // constant = true 的条目始终包含
        if (entry.constant === true) {
            console.log('[NodeSTCore] Including constant entry:', entry.name);
            return true;
        }

        // constant = false 的条目必须通过 key 匹配
        if (entry.constant === false) {
            if (!entry.key || entry.key.length === 0) {
                console.log('[NodeSTCore] Excluding entry - no keys defined:', entry.name);
                return false;
            }

            // 检查是否包含任何关键词
            const allText = messages
                .map(msg => msg.parts?.[0]?.text || '')
                .join(' ')
                .toLowerCase();

            const hasMatchingKey = entry.key.some(key => 
                allText.includes(key.toLowerCase())
            );

            console.log('[NodeSTCore] Key match check for entry:', {
                name: entry.name,
                keys: entry.key,
                matched: hasMatchingKey
            });

            return hasMatchingKey;
        }

        // 如果既不是 constant = true，也不是通过 key 匹配的，则不包含
        return false;
    }

    insertDEntriesToHistory(
        chatHistory: ChatHistoryEntity,
        dEntries: ChatMessage[],
        userMessage: string
    ): ChatHistoryEntity {
        console.log('[NodeSTCore] Starting D-entries insertion:', {
            chatHistoryMessages: chatHistory.parts.length,
            dEntriesCount: dEntries.length,
            baseMessage: userMessage.substring(0, 30)
        });

        // 1. 先移除所有旧的D类条目，确保不会重复
        const chatMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
        
        console.log(`[NodeSTCore] Removed ${chatHistory.parts.length - chatMessages.length} old D-entries`);

        // 2. 找到基准消息（最新的用户消息）的索引
        const baseMessageIndex = chatMessages.findIndex(
            msg => msg.role === "user" && msg.parts[0]?.text === userMessage
        );

        if (baseMessageIndex === -1) {
            console.warn('[NodeSTCore] Base message not found in history');
            return {
                ...chatHistory,
                parts: chatMessages // 返回没有D类条目的干净历史
            };
        }

        // 3. 先过滤符合条件的 D 类条目
        const validDEntries = dEntries.filter(entry => 
            this.shouldIncludeDEntry(entry, chatMessages)
        );

        console.log(`[NodeSTCore] Filtered D-entries: ${validDEntries.length} valid out of ${dEntries.length} total`);

        // 对过滤后的条目按注入深度分组，确保只在正确的位置插入
        const position4EntriesByDepth = validDEntries
            .filter(entry => entry.position === 4)
            .reduce((acc, entry) => {
                // 确保注入深度是有效数字，默认为0
                const depth = typeof entry.injection_depth === 'number' ? entry.injection_depth : 0;
                if (!acc[depth]) acc[depth] = [];
                acc[depth].push({
                    ...entry,
                    // 确保明确标记为D类条目，以便下一次更新时可以清除
                    is_d_entry: true
                });
                return acc;
            }, {} as Record<number, ChatMessage[]>);

        // 4. 构建新的消息序列
        const finalMessages: ChatMessage[] = [];
        
        // 4.1 从第一条消息开始，往后遍历插入消息和D类条目
        for (let i = 0; i < chatMessages.length; i++) {
            const msg = chatMessages[i];

            // 只有非基准消息（不是最新用户消息）且在基准消息之前的消息可能有D类条目插入前面
            if (i < baseMessageIndex) {
                // 计算与基准消息的深度差
                const depthFromBase = baseMessageIndex - i;
                // 只有深度大于0时才在消息前插入D类条目（depth=0的条目只在基准消息后插入）
                if (depthFromBase > 0 && position4EntriesByDepth[depthFromBase]) {
                    console.log(`[NodeSTCore] Inserting ${position4EntriesByDepth[depthFromBase].length} D-entries with depth=${depthFromBase} before message at position ${i}`);
                    finalMessages.push(...position4EntriesByDepth[depthFromBase]);
                }
            }

            // 插入当前消息
            finalMessages.push(msg);

            // 如果是基准消息（最新用户消息），在其后插入depth=0的条目
            if (i === baseMessageIndex && position4EntriesByDepth[0]) {
                console.log(`[NodeSTCore] Inserting ${position4EntriesByDepth[0].length} D-entries with depth=0 after base message`);
                finalMessages.push(...position4EntriesByDepth[0]);
            }
        }

        // 5. 处理其他position的条目（从validDEntries中筛选）
        const otherDEntries = validDEntries.filter(entry => entry.position !== 4).map(entry => ({
            ...entry,
            is_d_entry: true // 确保明确标记为D类条目
        }));
        
        for (const entry of otherDEntries) {
            // 对于authorNote相关条目（position=2或3），如果存在作者注释，则在前后插入
            const authorNoteIndex = finalMessages.findIndex(msg => msg.is_author_note);
            if (authorNoteIndex !== -1) {
                if (entry.position === 2) {
                    finalMessages.splice(authorNoteIndex, 0, entry);
                    console.log(`[NodeSTCore] Inserted position=2 entry before author note: ${entry.name}`);
                } else if (entry.position === 3) {
                    finalMessages.splice(authorNoteIndex + 1, 0, entry);
                    console.log(`[NodeSTCore] Inserted position=3 entry after author note: ${entry.name}`);
                }
            } else if (entry.is_author_note) {
                // 如果条目本身是作者注释且历史中尚不存在，添加到末尾
                finalMessages.push(entry);
                console.log(`[NodeSTCore] Added missing author note: ${entry.name}`);
            }
        }

        // 6. 检查最终的消息序列中的D类条目数量，确保正确标记
        const dEntryCount = finalMessages.filter(msg => msg.is_d_entry).length;
        console.log(`[NodeSTCore] Final message sequence has ${dEntryCount} D-entries out of ${finalMessages.length} total messages`);

        // 7. 添加详细的调试日志，显示消息顺序和类型以及D类条目的注入深度
        console.log('[NodeSTCore] Message sequence after D-entry insertion:', 
            finalMessages.map((msg, idx) => ({
                index: idx,
                type: msg.is_d_entry ? 'D-entry' : 'chat',
                role: msg.role,
                depth: msg.is_d_entry ? msg.injection_depth || 0 : 'N/A',
                position: msg.position,
                isBaseMessage: msg.parts[0]?.text === userMessage,
                preview: msg.parts[0]?.text?.substring(0, 30)
            }))
        );

        return {
            ...chatHistory,
            parts: finalMessages
        };
    }

    private updateChatHistory(
        chatHistory: ChatHistoryEntity,
        userMessage: string,
        aiResponse: string,
        dEntries: ChatMessage[]
    ): ChatHistoryEntity {
        console.log('[NodeSTCore] Updating chat history with new messages and D-entries');
        
        // 1. 保留非D类条目的历史消息
        const cleanHistory = chatHistory.parts.filter(msg => !msg.is_d_entry);
        console.log(`[NodeSTCore] Removed ${chatHistory.parts.length - cleanHistory.length} old D-entries from history`);

        // 2. 添加新的用户消息（如果不存在）
        const userMessageExists = cleanHistory.some(msg => 
            msg.role === "user" && msg.parts[0]?.text === userMessage
        );

        if (!userMessageExists) {
            cleanHistory.push({
                role: "user",
                parts: [{ text: userMessage }]
            });
            console.log('[NodeSTCore] Added new user message to history');
        }

        // 3. 添加AI响应（如果有且不存在）
        if (aiResponse) {
            const aiResponseExists = cleanHistory.some(msg =>
                msg.role === "model" && msg.parts[0]?.text === aiResponse
            );

            if (!aiResponseExists) {
                cleanHistory.push({
                    role: "model",
                    parts: [{ text: aiResponse }]
                });
                console.log('[NodeSTCore] Added new AI response to history');
            }
        }

        // 4. 使用最新的消息作为基准，重新插入D类条目
        // 确保传递的是干净历史（没有D类条目的）
        const updatedHistory = this.insertDEntriesToHistory(
            {
                ...chatHistory,
                parts: cleanHistory
            },
            dEntries,
            userMessage
        );

        console.log('[NodeSTCore] Updated chat history summary:', {
            originalMessagesCount: chatHistory.parts.length,
            cleanHistoryCount: cleanHistory.length,
            finalMessagesCount: updatedHistory.parts.length,
            dEntriesCount: updatedHistory.parts.filter(msg => msg.is_d_entry).length,
            hasUserMessage: userMessageExists,
            hasAiResponse: aiResponse ? true : false
        });

        return updatedHistory;
    }

    async processChat(
        userMessage: string,
        chatHistory: ChatHistoryEntity,
        dEntries: ChatMessage[],
        sessionId: string,
        roleCard: RoleCardJson,
        adapter?: GeminiAdapter | OpenRouterAdapter | OpenAIAdapter | null,
        customUserName?: string, // Add optional customUserName parameter
        memorySearchResults?: any, // 添加记忆搜索结果参数
        characterId?: string // 新增参数
    ): Promise<string | null> {
        try {
            console.log('[NodeSTCore] Starting processChat with:', {
                userMessage: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
                chatHistoryMessagesCount: chatHistory?.parts?.length,
                dEntriesCount: dEntries.length,
                apiProvider: this.apiSettings?.apiProvider,
                hasCustomUserName: !!customUserName,
                characterId: characterId // <--- 记录characterId
            });

            // 1. 加载框架内容
            const preset = await this.loadJson<PresetJson>(`nodest_${sessionId}_preset`);
            const worldBook = await this.loadJson<WorldBookJson>(`nodest_${sessionId}_world`);
            if (!preset || !worldBook) {
                throw new Error('Required data not found');
            }

            // 2. Check if we need to rebuild the framework or reuse existing framework
            let contents: ChatMessage[] = [];
            
            // First try loading existing framework/contents
            const existingContents = await this.loadJson<ChatMessage[]>(
                this.getStorageKey(sessionId, '_contents')
            );
            
            // Only rebuild framework if absolutely necessary - if it doesn't exist
            if (!existingContents || existingContents.length === 0) {
                console.log('[NodeSTCore] No existing framework found, rebuilding...');
                // Rebuild framework
                const [rFramework, _] = CharacterUtils.buildRFramework(
                    preset,
                    roleCard,
                    worldBook
                );
                contents = [...rFramework];
            } else {
                console.log('[NodeSTCore] Using existing framework with length:', existingContents.length);
                contents = [...existingContents];
            }

            // 3. 查找聊天历史占位符的位置 
            const chatHistoryPlaceholderIndex = contents.findIndex(
                item => item.is_chat_history_placeholder || 
                       (item.identifier === chatHistory.identifier)
            );

            console.log('[NodeSTCore] Found chat history placeholder at index:', chatHistoryPlaceholderIndex);

            // 确保已经清除旧的D类条目并基于最新消息插入新的D类条目
            const historyWithDEntries = this.insertDEntriesToHistory(
                // 确保传入的历史不包含旧的D类条目
                {
                    ...chatHistory,
                    parts: chatHistory.parts.filter(msg => !msg.is_d_entry)
                },
                dEntries,
                userMessage
            );

            // 确保正确插入聊天历史
            if (chatHistoryPlaceholderIndex !== -1) {
                // 将处理后的历史插入到框架中，替换占位符
                const historyMessage: ChatMessage = {
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                };

                console.log(`[NodeSTCore] Replacing chat history placeholder at index ${chatHistoryPlaceholderIndex} with chat history containing ${historyWithDEntries.parts.length} messages`);
                contents[chatHistoryPlaceholderIndex] = historyMessage;
            } else {
                // 如果找不到占位符，追加到末尾（应该不会发生，但作为安全措施）
                console.warn("[NodeSTCore] Chat history placeholder not found, appending to end");
                contents.push({
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                });
            }
            
            // Make sure there's only one chat history entry in the contents
            // This fixes potential duplication issues after loading saved histories
            const chatHistoryEntries = contents.filter(
                item => item.name === "Chat History" || 
                       (item.identifier && item.identifier.toLowerCase().includes('chathistory'))
            );
            
            if (chatHistoryEntries.length > 1) {
                console.warn(`[NodeSTCore] Multiple chat history entries detected (${chatHistoryEntries.length}), removing duplicates`);
                // Remove duplicates by keeping only the entry at chatHistoryPlaceholderIndex
                contents = contents.filter((item, index) => {
                    // Skip entries that look like chat history but aren't at the correct index
                    if ((item.name === "Chat History" || 
                         (item.identifier && item.identifier.toLowerCase().includes('chathistory'))) && 
                        index !== chatHistoryPlaceholderIndex) {
                        return false;
                    }
                    return true;
                });
                console.log(`[NodeSTCore] Framework size after removing duplicates: ${contents.length}`);
            }

            // 清理内容用于Gemini
            const cleanedContents = this.cleanContentsForGemini(
                contents,
                userMessage,
                roleCard.name,
                customUserName || "", // Use customUserName if provided, otherwise empty string
                roleCard
            );

            // 添加最终请求内容的完整日志
            console.log('[NodeSTCore] Final Gemini request structure:', {
                totalMessages: cleanedContents.length,
                messageSequence: cleanedContents.map(msg => ({
                    role: msg.role,
                    type: msg.is_d_entry ? 'D-entry' : 'chat',
                    depth: msg.injection_depth,
                    preview: msg.parts[0]?.text?.substring(0, 30)
                }))
            });
            
            // 打印完整的请求内容以便检查
            console.log('[NodeSTCore] COMPLETE API REQUEST CONTENT:');
            cleanedContents.forEach((msg, i) => {
                console.log(`[Message ${i+1}] Role: ${msg.role}`);
                msg.parts.forEach((part, j) => {
                    console.log(`[Message ${i+1}][Part ${j+1}] Content length: ${part.text?.length || 0} chars`);
                });
            });

            // 验证是否还有消息要发送
            if (cleanedContents.length === 0) {
                throw new Error('No valid messages to send to Gemini API');
            }

            // 使用传入的适配器或获取活跃适配器
            const activeAdapter = adapter || this.getActiveAdapter();
            // 移除严格检查，允许接口回退到云服务
            if (!activeAdapter) {
                console.warn("[NodeSTCore] No API adapter available - will attempt to use cloud service");
                // 不再抛出错误
            }
            // 添加适配器类型日志
            console.log('[NodeSTCore] Using adapter:', {
                type:
                    activeAdapter instanceof OpenRouterAdapter
                        ? 'OpenRouter'
                        : activeAdapter instanceof OpenAIAdapter
                        ? 'OpenAICompatible'
                        : 'Gemini',
                apiProvider: this.apiSettings?.apiProvider,
                hasMemoryResults: memorySearchResults && memorySearchResults.results && memorySearchResults.results.length > 0
            });

            // 发送到API
            if (activeAdapter instanceof OpenAIAdapter) {
                // 转换为 OpenAI chat completion 格式
                const openaiMessages = cleanedContents.map(msg => ({
                    role: msg.role === 'model' ? 'assistant' : msg.role,
                    content: msg.parts[0]?.text || ''
                }));
                try {
                    const resp = await activeAdapter.chatCompletion(openaiMessages, {
                        temperature: this.apiSettings?.temperature ?? 0.7,
                        max_tokens: this.apiSettings?.maxTokens ?? 800
                    });
                    if (resp && resp.choices && resp.choices[0]?.message?.content) {
                        return resp.choices[0].message.content;
                    }
                    return null;
                } catch (err) {
                    console.error('[NodeSTCore] OpenAIAdapter chatCompletion error:', err);
                    return null;
                }
            }

            // 判断是否应该使用记忆增强
            const shouldUseMemoryResults = memorySearchResults && 
                                        memorySearchResults.results && 
                                        memorySearchResults.results.length > 0;
                                        
                                        if (shouldUseMemoryResults && activeAdapter) {
                                            console.log('[NodeSTCore] 调用generateContentWithTools，传递characterId:', characterId); // <--- 记录
                                            const response = await activeAdapter.generateContentWithTools(cleanedContents,characterId ,memorySearchResults, userMessage);
                                            console.log('[NodeSTCore] API response received:', {
                                                hasResponse: !!response,
                                                responseLength: response?.length || 0
                                            });
                // 保存更新后的历史和框架
                if (response) {
                    console.log('[NodeSTCore] Saving updated history and framework...');
                    // 保存更新后的框架内容
                    await this.saveContents(contents, sessionId);
                    console.log('[NodeSTCore] Content framework and history saved successfully');
                }

                return response;
            } else {
                console.log('[NodeSTCore] 没有记忆搜索结果，使用标准generateContent方法');
                // 没有记忆搜索结果，使用标准方法
                if (!activeAdapter) {
                    // <--- 记录
                    console.warn('[NodeSTCore] No API adapter available - will attempt to use cloud service');
                    // Try with cloud service directly
                    return null;
                }
                console.log('[NodeSTCore] 调用generateContent，传递characterId:', characterId); 
                const response = await activeAdapter.generateContent(cleanedContents, characterId);
                console.log('[NodeSTCore] API response received:', {
                    hasResponse: !!response,
                    responseLength: response?.length || 0
                });

                // 保存更新后的历史和框架
                if (response) {
                    console.log('[NodeSTCore] Saving updated history and framework...');
                    // 保存更新后的框架内容
                    await this.saveContents(contents, sessionId);
                    console.log('[NodeSTCore] Content framework and history saved successfully');
                }

                return response;
            }  
        } catch (error) {
            console.error('[NodeSTCore] Error in processChat:', error);
            return null;
        }
    }

    async processChatWithTools(
        userMessage: string,
        chatHistory: ChatHistoryEntity,
        dEntries: ChatMessage[],
        sessionId: string,
        roleCard: RoleCardJson,
        adapter?: GeminiAdapter | OpenRouterAdapter | OpenAIAdapter | null,
        customUserName?: string, // Add optional customUserName parameter
        memoryResults?: any, // This parameter already correctly receives memory search results
        characterId?: string // 新增参数
    ): Promise<string | null> {
        try {
            console.log('[NodeSTCore] Starting processChatWithTools with:', {
                userMessage: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
                chatHistoryMessagesCount: chatHistory?.parts?.length,
                dEntriesCount: dEntries.length,
                apiProvider: this.apiSettings?.apiProvider,
                hasCustomUserName: !!customUserName,
                hasMemoryResults: memoryResults?.results?.length > 0,
                characterId: characterId // <--- 记录characterId
            });

            // 新增：如果用工具调用，则自动为userMessage加前缀
            let toolUserMessage = userMessage;
            if (toolUserMessage && !toolUserMessage.startsWith('需要搜索：')) {
                toolUserMessage = '需要搜索：' + toolUserMessage;
            }

            // 1. 加载框架内容
            const preset = await this.loadJson<PresetJson>(`nodest_${sessionId}_preset`);
            const worldBook = await this.loadJson<WorldBookJson>(`nodest_${sessionId}_world`);
            if (!preset || !worldBook) {
                throw new Error('Required data not found');
            }

            // 2. Check if we need to rebuild the framework or reuse existing framework
            let contents: ChatMessage[] = [];
            
            // First try loading existing framework/contents
            const existingContents = await this.loadJson<ChatMessage[]>(
                this.getStorageKey(sessionId, '_contents')
            );
            
            // Only rebuild framework if absolutely necessary - if it doesn't exist
            if (!existingContents || existingContents.length === 0) {
                console.log('[NodeSTCore] No existing framework found, rebuilding...');
                // Rebuild framework
                const [rFramework, _] = CharacterUtils.buildRFramework(
                    preset,
                    roleCard,
                    worldBook
                );
                contents = [...rFramework];
            } else {
                console.log('[NodeSTCore] Using existing framework with length:', existingContents.length);
                contents = [...existingContents];
            }

            // 3. 查找聊天历史占位符的位置 
            const chatHistoryPlaceholderIndex = contents.findIndex(
                item => item.is_chat_history_placeholder || 
                       (item.identifier === chatHistory.identifier)
            );

            console.log('[NodeSTCore] Found chat history placeholder at index:', chatHistoryPlaceholderIndex);

            // 确保已经清除旧的D类条目并基于最新消息插入新的D类条目
            const historyWithDEntries = this.insertDEntriesToHistory(
                // 确保传入的历史不包含旧的D类条目
                {
                    ...chatHistory,
                    parts: chatHistory.parts.filter(msg => !msg.is_d_entry)
                },
                dEntries,
                toolUserMessage
            );

            // 确保正确插入聊天历史
            if (chatHistoryPlaceholderIndex !== -1) {
                // 将处理后的历史插入到框架中，替换占位符
                const historyMessage: ChatMessage = {
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                };

                console.log(`[NodeSTCore] Replacing chat history placeholder at index ${chatHistoryPlaceholderIndex} with chat history containing ${historyWithDEntries.parts.length} messages`);
                contents[chatHistoryPlaceholderIndex] = historyMessage;
            } else {
                // 如果找不到占位符，追加到末尾（应该不会发生，但作为安全措施）
                console.warn("[NodeSTCore] Chat history placeholder not found, appending to end");
                contents.push({
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                });
            }
            
            // Make sure there's only one chat history entry in the contents
            // This fixes potential duplication issues after loading saved histories
            const chatHistoryEntries = contents.filter(
                item => item.name === "Chat History" || 
                       (item.identifier && item.identifier.toLowerCase().includes('chathistory'))
            );
            
            if (chatHistoryEntries.length > 1) {
                console.warn(`[NodeSTCore] Multiple chat history entries detected (${chatHistoryEntries.length}), removing duplicates`);
                // Remove duplicates by keeping only the entry at chatHistoryPlaceholderIndex
                contents = contents.filter((item, index) => {
                    // Skip entries that look like chat history but aren't at the correct index
                    if ((item.name === "Chat History" || 
                         (item.identifier && item.identifier.toLowerCase().includes('chathistory'))) && 
                        index !== chatHistoryPlaceholderIndex) {
                        return false;
                    }
                    return true;
                });
                console.log(`[NodeSTCore] Framework size after removing duplicates: ${contents.length}`);
            }

            // 清理内容用于Gemini
            const cleanedContents = this.cleanContentsForGemini(
                contents,
                toolUserMessage,
                roleCard.name,
                customUserName || "", // Use customUserName if provided, otherwise empty string
                roleCard
            );

            // 添加最终请求内容的完整日志
            console.log('[NodeSTCore] Final Gemini request structure:', {
                totalMessages: cleanedContents.length,
                messageSequence: cleanedContents.map(msg => ({
                    role: msg.role,
                    type: msg.is_d_entry ? 'D-entry' : 'chat',
                    depth: msg.injection_depth,
                    preview: msg.parts[0]?.text?.substring(0, 30)
                }))
            });
            
            // 打印完整的请求内容以便检查
            console.log('[NodeSTCore] COMPLETE API REQUEST CONTENT:');
            cleanedContents.forEach((msg, i) => {
                console.log(`[Message ${i+1}] Role: ${msg.role}`);
                msg.parts.forEach((part, j) => {
                    console.log(`[Message ${i+1}][Part ${j+1}] Content length: ${part.text?.length || 0} chars`);
                });
            });

            // 验证是否还有消息要发送
            if (cleanedContents.length === 0) {
                throw new Error('No valid messages to send to Gemini API');
            }

            // 使用传入的适配器或获取活跃适配器
            const activeAdapter = adapter || this.getActiveAdapter();
            if (!activeAdapter) {
                console.warn("[NodeSTCore] No API adapter available - will attempt to use cloud service");
                // 不再抛出错误，让 generateContentWithTools 方法尝试云服务
            }

            // 添加适配器类型日志
            console.log('[NodeSTCore] Using adapter:', {
                type:
                    activeAdapter instanceof OpenRouterAdapter
                        ? 'OpenRouter'
                        : activeAdapter instanceof OpenAIAdapter
                        ? 'OpenAICompatible'
                        : 'Gemini',
                apiProvider: this.apiSettings?.apiProvider
            });

            // 发送到API，传递记忆搜索结果
            console.log('[NodeSTCore] Sending to API with tool calls...', {
                characterId_passed_to_adapter: characterId // <--- 记录传递给adapter的characterId
            });
            // 如果使用工具调用，则传递记忆搜索结果
            if (activeAdapter instanceof OpenAIAdapter) {
                const openaiMessages = cleanedContents.map(msg => ({
                    role: msg.role === 'model' ? 'assistant' : msg.role,
                    content: msg.parts[0]?.text || ''
                }));
                try {
                    const resp = await activeAdapter.chatCompletion(openaiMessages, {
                        temperature: this.apiSettings?.temperature ?? 0.7,
                        max_tokens: this.apiSettings?.maxTokens ?? 800
                    });
                    if (resp && resp.choices && resp.choices[0]?.message?.content) {
                        return resp.choices[0].message.content;
                    }
                    return null;
                } catch (err) {
                    console.error('[NodeSTCore] OpenAIAdapter chatCompletion error:', err);
                    return null;
                }
            }

            if (activeAdapter) {
                console.log('[NodeSTCore] 调用generateContentWithTools，传递characterId:', characterId); // <--- 记录
                const response = await activeAdapter.generateContentWithTools(
                    cleanedContents, characterId, memoryResults, toolUserMessage
                );;
                console.log('[NodeSTCore] API response received:', {
                    hasResponse: !!response,
                    responseLength: response?.length || 0
                });

                // 保存更新后的历史和框架
                if (response) {
                    console.log('[NodeSTCore] Saving updated history and framework...');
                    // 保存更新后的框架内容
                    await this.saveContents(contents, sessionId);
                    console.log('[NodeSTCore] Content framework and history saved successfully');
                }

                return response;
            } else {
                console.error('[NodeSTCore] No adapter available and cloud fallback failed');
                return null;
            }
        } catch (error) {
            console.error('[NodeSTCore] Error in processChatWithTools:', error);
            return null;
        }
    }

    // Text processing utilities
    private cleanContentsForGemini(
        contents: ChatMessage[],
        userMessage: string = "",
        charName: string = "",
        userName: string = "",
        roleCard?: RoleCardJson
    ): GeminiMessage[] {
        console.log('[NodeSTCore] Starting cleanContentsForGemini:', {
            totalContents: contents.length
        });

        const cleanedContents: GeminiMessage[] = [];

        for (const content of contents) {
            if (!content || !content.parts?.[0]) continue;

            // 如果是聊天历史实体
            if (content.name === "Chat History") {
                // 确保 parts 存在且为数组
                const historyParts = Array.isArray(content.parts) ? content.parts : [];
                
                // 遍历历史消息
                for (const historyMessage of historyParts) {
                    if (!historyMessage.parts?.[0]?.text) continue;
                    
                    // Skip processing memory summary messages for role conversion
                    // but still include them in the API request
                    if (memoryService.isMemorySummary(historyMessage)) {
                        cleanedContents.push({
                            role: "user", // Memory summaries always go as "user" role (system)
                            parts: [{
                                text: historyMessage.parts[0].text
                            }]
                        });
                        continue;
                    }

                    // 转换角色映射
                    const role = (() => {
                        switch (historyMessage.role) {
                            case "assistant":
                            case "model":
                                return "model";
                            case "system":
                            case "user":
                            default:
                                return "user";
                        }
                    })();

                    const geminiMessage: GeminiMessage = {
                        role,
                        parts: [{
                            text: this.replacePlaceholders(
                                historyMessage.parts[0].text,
                                userMessage,
                                charName,
                                userName, // Pass the userName parameter correctly
                                roleCard
                            )
                        }]
                    };

                    cleanedContents.push(geminiMessage);
                }
            } else {
                // 处理常规消息
                const geminiMessage: GeminiMessage = {
                    role: content.role === "assistant" ? "model" : 
                          content.role === "system" ? "user" : 
                          content.role as "user" | "model",
                    parts: content.parts.map(part => ({
                        text: this.replacePlaceholders(
                            part.text || "", 
                            userMessage, 
                            charName, 
                            userName, // Pass the userName parameter correctly 
                            roleCard
                        )
                    }))
                };

                cleanedContents.push(geminiMessage);
            }
        }

        // 过滤掉空消息
        const filteredContents = cleanedContents.filter(msg => {
            const text = msg.parts[0]?.text;
            return text && text.trim() !== '';
        });

        console.log('[NodeSTCore] Final cleaned contents:', {
            originalCount: cleanedContents.length,
            filteredCount: filteredContents.length
        });

        return filteredContents;
    }

    private replacePlaceholders(
        text: string,
        userMessage: string,
        charName: string,
        userName: string,
        roleCard?: RoleCardJson
    ): string {
        if (typeof text !== 'string') {
            return text;
        }

        try {
            // 基础变量替换
            text = text
                .replace(/{{lastMessage}}/g, userMessage)
                .replace(/{{char}}/g, charName)
                .replace(/{{user}}/g, userName);

            // 应用正则替换规则
            if (roleCard?.data?.extensions?.regex_scripts) {
                text = this.applyRegexScripts(
                    text,
                    roleCard.data.extensions.regex_scripts
                );
            }

            return text;
        } catch (e) {
            console.warn('Text processing warning:', e);
            return text;
        }
    }

    private applyRegexScripts(text: string, regexScripts: RegexScript[]): string {
        if (typeof text !== 'string') {
            return text;
        }

        try {
            for (const script of regexScripts) {
                try {
                    let findRegex = script.findRegex;
                    const replaceString = script.replaceString;

                    if (!findRegex || !replaceString) {
                        continue;
                    }

                    // 去除正则表达式字符串的首尾斜杠
                    if (findRegex.startsWith('/') && findRegex.endsWith('/')) {
                        findRegex = findRegex.slice(1, -1);
                    }

                    // 构建正则表达式标志
                    const flags = script.flags || '';
                    const regex = new RegExp(findRegex, flags);

                    // 执行替换
                    text = text.replace(regex, replaceString);

                } catch (e) {
                    console.warn(
                        `Regex script warning - Script ${script.scriptName}:`,
                        e
                    );
                    continue;
                }
            }
            return text;
        } catch (e) {
            console.error('Error in regex replacement:', e);
            return text;
        }
    }

    async regenerateFromMessage(
        conversationId: string,
        messageIndex: number,
        apiKey: string,
        characterId?: string,
        customUserName?: string // Add parameter for customUserName
    ): Promise<string | null> {
        try {
            console.log('[NodeSTCore] Starting regenerateFromMessage:', {
                conversationId,
                messageIndex,
                hasCharacterId: !!characterId,
                hasCustomUserName: !!customUserName
            });

            // 确保Adapter已初始化
            if ((!this.geminiAdapter || !this.openRouterAdapter || !this.openAICompatibleAdapter) && apiKey) {
                this.initAdapters(apiKey, this.apiSettings);
            }

            // 获取正确的 adapter
            const adapter = this.getActiveAdapter();
            
            if (!adapter) {
                throw new Error("API adapter not initialized - missing API key");
            }

            // 确保加载最新的角色数据
            const roleCard = await this.loadJson<RoleCardJson>(
                this.getStorageKey(conversationId, '_role')
            );
            const worldBook = await this.loadJson<WorldBookJson>(
                this.getStorageKey(conversationId, '_world')
            );
            const preset = await this.loadJson<PresetJson>(
                this.getStorageKey(conversationId, '_preset')
            );
            const authorNote = await this.loadJson<AuthorNoteJson>(
                this.getStorageKey(conversationId, '_note')
            );
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );

            console.log('[NodeSTCore] Character data loaded for regeneration:', {
                hasRoleCard: !!roleCard,
                hasWorldBook: !!worldBook,
                hasPreset: !!preset,
                hasAuthorNote: !!authorNote,
                hasChatHistory: !!chatHistory,
                historyLength: chatHistory?.parts?.length,
                requestedIndex: messageIndex
            });

            // Validate required data
            if (!roleCard || !worldBook || !preset || !chatHistory) {
                const missingData = [];
                if (!roleCard) missingData.push('roleCard');
                if (!worldBook) missingData.push('worldBook');
                if (!preset) missingData.push('preset');
                if (!chatHistory) missingData.push('chatHistory');

                const errorMessage = `Missing required data: ${missingData.join(', ')}`;
                console.error('[NodeSTCore]', errorMessage);
                return null;
            }

            // Get all real messages (not D-entries)
            const realMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
            console.log(`[NodeSTCore] Total real messages: ${realMessages.length}`);
            
            // Check if we're trying to regenerate the AI's first message (first_mes)
            const firstAiMessage = realMessages.find(msg => msg.is_first_mes && 
                (msg.role === "model" || msg.role === "assistant"));
            
            if (messageIndex === 0 && firstAiMessage) {
                console.log('[NodeSTCore] Detected request to regenerate first_mes');
                
                // For first_mes regeneration, just use the existing roleCard.first_mes
                if (roleCard.first_mes) {
                    console.log('[NodeSTCore] Reusing existing first_mes from roleCard');
                    
                    // Replace the first_mes in the history
                    const updatedHistory = {
                        ...chatHistory,
                        parts: chatHistory.parts.map(msg => {
                            if (msg.is_first_mes) {
                                return {
                                    ...msg,
                                    parts: [{ text: roleCard.first_mes }]
                                };
                            }
                            return msg;
                        })
                    };
                    
                    // Save the updated history
                    await this.saveJson(
                        this.getStorageKey(conversationId, '_history'),
                        updatedHistory
                    );
                    
                    console.log('[NodeSTCore] First message regenerated successfully using original first_mes');
                    return roleCard.first_mes;
                } else {
                    console.warn('[NodeSTCore] Cannot regenerate first_mes: roleCard.first_mes is missing');
                    return null;
                }
            }
                // === 修正：定义 aiMessages 变量 ===
        const aiMessages = realMessages.filter(msg => 
            (msg.role === "model" || msg.role === "assistant") && !msg.is_first_mes
        );

        // === 修正核心逻辑 ===
        if (messageIndex < 1 || messageIndex > aiMessages.length) {
            console.error(`[NodeSTCore] Invalid message index: ${messageIndex}. Available AI messages: ${aiMessages.length}`);
            return null;
        }
        // 找到目标AI消息
        const targetAiMessage = aiMessages[messageIndex - 1];
        if (!targetAiMessage) {
            console.error(`[NodeSTCore] Could not find AI message at index ${messageIndex}`);
            return null;
        }
        // 在realMessages中找到该AI消息的索引
        const aiIndexInReal = realMessages.findIndex(msg => msg === targetAiMessage);
        if (aiIndexInReal === -1) {
            console.error('[NodeSTCore] Could not locate target AI message in realMessages');
            return null;
        }
            
            console.log('[NodeSTCore] Target AI message to regenerate:', {
                role: targetAiMessage.role,
                preview: targetAiMessage.parts[0]?.text?.substring(0, 50) + '...',
            });
            
            // Now find the user message that came before this AI message
            // We need to search through the complete history to maintain the correct order
            let userMessageForRegeneration: ChatMessage | undefined;
            let userMessageIndex = -1;
            
            for (let j = aiIndexInReal - 1; j >= 0; j--) {
                if (realMessages[j].role === "user") {
                    userMessageForRegeneration = realMessages[j];
                    break;
                }
            }
            if (!userMessageForRegeneration) {
                console.error('[NodeSTCore] Could not find user message before target AI message');
                return null;
            }
            
            if (!userMessageForRegeneration) {
                console.error('[NodeSTCore] Could not find user message before target AI message');
                return null;
            }
            
            console.log('[NodeSTCore] Found user message for regeneration:', {
                index: userMessageIndex,
                preview: userMessageForRegeneration.parts[0]?.text?.substring(0, 50) + '...'
            });
            
            // Extract the user message text
            const userMessageText = userMessageForRegeneration.parts[0]?.text || "";
            
            if (!userMessageText) {
                console.error('[NodeSTCore] User message text is empty');
                return null;
            }
            
            // Create a truncated history that includes all messages up to and including our target user message
            const truncatedHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: []
            };
            
            // Find all messages up to and including the user message in the full history
            let foundUserMessage = false;
            
            // First add all messages including first_mes and D-entries up to the user message
            for (const msg of chatHistory.parts) {
                truncatedHistory.parts.push(msg);
                
                // If we've reached the user message we want to regenerate from, stop
                if (!msg.is_d_entry && msg === userMessageForRegeneration) {
                    foundUserMessage = true;
                    break;
                }
            }
            
            if (!foundUserMessage) {
                console.error('[NodeSTCore] Could not locate user message in full history');
                return null;
            }
            
            console.log('[NodeSTCore] Truncated history built:', {
                originalLength: chatHistory.parts.length,
                truncatedLength: truncatedHistory.parts.length,
                hasDEntries: truncatedHistory.parts.some(msg => msg.is_d_entry)
            });
            
            // Save the truncated history
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                truncatedHistory
            );
            
            // Re-extract D-entries to ensure we're using the latest world book data
            const dEntries = CharacterUtils.extractDEntries(
                preset!,
                worldBook!,
                authorNote ?? undefined
            );

            // New: Check if we need to summarize the chat history
            if (characterId) {
                try {
                    console.log('[NodeSTCore] Checking if truncated chat history needs summarization...');
                    const summarizedHistory = await memoryService.checkAndSummarize(
                        conversationId,
                        characterId,
                        truncatedHistory,
                        apiKey,
                        {
                            apiProvider: this.apiSettings.apiProvider === 'openrouter' ? 'openrouter' : 'gemini',
                            openrouter: this.apiSettings.openrouter,
                        }
                    );
                    
                    // Use the potentially summarized history
                    if (summarizedHistory !== truncatedHistory) {
                        console.log('[NodeSTCore] Truncated chat history was summarized');
                        truncatedHistory.parts = summarizedHistory.parts;
                    }
                } catch (summaryError) {
                    console.error('[NodeSTCore] Error in chat summarization:', summaryError);
                    // Continue with unsummarized history
                }
            }
            
            // Process the chat with the truncated history
            console.log('[NodeSTCore] Processing regeneration chat with target user message');
            const response = await this.processChat(
                userMessageText,
                truncatedHistory,
                dEntries,
                conversationId,
                roleCard,
                adapter,
                customUserName, // Pass customUserName to processChat
                undefined,
                characterId // Pass characterId to processChat
            );
            
            // If we got a response, add it to history
            if (response) {
                // Use updateChatHistory method to add the AI response
                const updatedHistory = this.updateChatHistory(
                    truncatedHistory,
                    userMessageText,
                    response,
                    dEntries
                );
                
                // Save the updated history
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );
                
                console.log('[NodeSTCore] Regeneration complete, saved updated history:', {
                    totalMessages: updatedHistory.parts.length,
                    response: response.substring(0, 50) + '...'
                });
            }
            
            return response;
        } catch (error) {
            console.error('[NodeSTCore] Error in regenerateFromMessage:', error);
            return null;
        }
    }

    async restoreChatHistory(
        conversationId: string,
        chatHistory: ChatHistoryEntity
    ): Promise<boolean> {
        try {
            console.log('[NodeSTCore] Restoring chat history from save point:', {
                conversationId,
                messagesCount: chatHistory.parts.length
            });
            
            // First, load the current history to preserve its identifier and structure
            const currentHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            
            if (!currentHistory) {
                console.error('[NodeSTCore] Cannot restore chat history - current history not found');
                return false;
            }
            
            // Create a new history entity that preserves the structure but uses saved messages
            const restoredHistory: ChatHistoryEntity = {
                ...currentHistory,
                parts: chatHistory.parts || []
            };
            
            console.log('[NodeSTCore] Saving restored chat history with', restoredHistory.parts.length, 'messages');
            
            // Save the restored history
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                restoredHistory
            );
            
            // Important: Also update the contents/framework to ensure proper integration
            try {
                // Load the current framework
                const currentContents = await this.loadJson<ChatMessage[]>(
                    this.getStorageKey(conversationId, '_contents')
                );
                
                if (currentContents) {
                    // Find the chat history placeholder in the framework
                    const chatHistoryIndex = currentContents.findIndex(
                        item => item.is_chat_history_placeholder || 
                               (item.identifier === restoredHistory.identifier)
                    );
                    
                    if (chatHistoryIndex !== -1) {
                        // Replace the chat history in the framework
                        console.log('[NodeSTCore] Updating chat history in framework at index', chatHistoryIndex);
                        currentContents[chatHistoryIndex] = {
                            name: "Chat History",
                            role: "system",
                            parts: restoredHistory.parts,
                            identifier: restoredHistory.identifier
                        };
                        
                        // Save the updated framework
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_contents'),
                            currentContents
                        );
                        
                        console.log('[NodeSTCore] Framework updated successfully');
                    } else {
                        console.warn('[NodeSTCore] Chat history placeholder not found in framework');
                    }
                }
            } catch (frameworkError) {
                console.error('[NodeSTCore] Error updating framework:', frameworkError);
                // Continue even if framework update fails - the chat history is still restored
            }
            
            console.log('[NodeSTCore] Chat history successfully restored');
            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error restoring chat history:', error);
            return false;
        }
    }

    async resetChatHistory(conversationId: string): Promise<boolean> {
        try {
            console.log('[NodeSTCore] Resetting chat history for conversation:', conversationId);
            
            // 1. Load the required data
            const roleCard = await this.loadJson<RoleCardJson>(
                this.getStorageKey(conversationId, '_role')
            );
            
            const worldBook = await this.loadJson<WorldBookJson>(
                this.getStorageKey(conversationId, '_world')
            );
            
            const preset = await this.loadJson<PresetJson>(
                this.getStorageKey(conversationId, '_preset')
            );
            
            const authorNote = await this.loadJson<AuthorNoteJson>(
                this.getStorageKey(conversationId, '_note')
            );
            
            const currentHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            
            // Check if we have necessary data
            if (!roleCard || !currentHistory) {
                console.error('[NodeSTCore] Cannot reset chat history - missing required data');
                return false;
            }
            
            // 2. Create a fresh history with only first_mes
            const resetHistory: ChatHistoryEntity = {
                ...currentHistory, // Preserve structure, name, identifier
                parts: [] // Start with empty parts array
            };
            
            // 3. Add first_mes if available
            if (roleCard.first_mes) {
                resetHistory.parts.push({
                    role: "model",
                    parts: [{ text: roleCard.first_mes }],
                    is_first_mes: true
                });
                console.log('[NodeSTCore] Added first_mes to reset history');
            }
            
            // 4. Process D-entries if needed
            if (preset && worldBook) {
                const dEntries = CharacterUtils.extractDEntries(
                    preset,
                    worldBook,
                    authorNote ?? undefined
                );
                
                if (dEntries.length > 0) {
                    // Insert D entries - we pass empty userMessage since we're resetting
                    const historyWithDEntries = this.insertDEntriesToHistory(
                        resetHistory,
                        dEntries,
                        ""  // No user message for reset history
                    );
                    
                    resetHistory.parts = historyWithDEntries.parts;
                    console.log(`[NodeSTCore] Added ${dEntries.length} D-entries to reset history`);
                }
            }
            
            // 5. Save the reset history
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                resetHistory
            );
            
            // 6. Also update the framework to maintain consistency
            try {
                const currentContents = await this.loadJson<ChatMessage[]>(
                    this.getStorageKey(conversationId, '_contents')
                );
                
                if (currentContents) {
                    // Find chat history in framework
                    const chatHistoryIndex = currentContents.findIndex(
                        item => item.is_chat_history_placeholder || 
                               (item.identifier === currentHistory.identifier)
                    );
                    
                    if (chatHistoryIndex !== -1) {
                        // Update the chat history in framework
                        currentContents[chatHistoryIndex] = {
                            name: "Chat History",
                            role: "system",
                            parts: resetHistory.parts,
                            identifier: currentHistory.identifier
                        };
                        
                        // Save updated framework
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_contents'),
                            currentContents
                        );
                        
                        console.log('[NodeSTCore] Updated framework with reset chat history');
                    }
                }
            } catch (frameworkError) {
                console.error('[NodeSTCore] Error updating framework after reset:', frameworkError);
                // Continue even if framework update fails
            }
            
            console.log('[NodeSTCore] Chat history successfully reset');
            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error resetting chat history:', error);
            return false;
        }
    }
    /**
     * Delete all data associated with a specific conversation ID
     * Does not require an API key since it's only performing deletion operations
     * 
     * @param conversationId The conversation ID to delete data for
     * @returns true if deletion was successful, false otherwise
     */

    async deleteCharacterData(conversationId: string): Promise<boolean> {
        try {
            console.log('[NodeSTCore] Deleting all data for conversation:', conversationId);
            // 角色数据文件key列表
            const keys = [
                this.getStorageKey(conversationId, '_role'),
                this.getStorageKey(conversationId, '_world'),
                this.getStorageKey(conversationId, '_preset'),
                this.getStorageKey(conversationId, '_note'),
                this.getStorageKey(conversationId, '_history'),
                this.getStorageKey(conversationId, '_contents')
            ];
            // 删除文件
            await Promise.all(keys.map(async (key) => {
                const filePath = this.getCharacterDataFilePath(key);
                try {
                    const fileInfo = await FileSystem.getInfoAsync(filePath);
                    if (fileInfo.exists) {
                        await FileSystem.deleteAsync(filePath, { idempotent: true });
                        console.log(`[NodeSTCore] Deleted file: ${filePath}`);
                    }
                } catch (error) {
                    console.error(`[NodeSTCore] Error deleting file ${filePath}:`, error);
                }
            }));
            console.log('[NodeSTCore] Successfully deleted all data for conversation:', conversationId);
            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error deleting character data:', error);
            return false;
        }
    }
}