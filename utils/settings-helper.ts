/**
 * Settings Helper
 * 
 * Provides utilities to make user settings accessible globally
 */

import { GlobalSettings } from '@/shared/types';

let cloudServiceEnabled = false;
const cloudServiceListeners: Array<(enabled: boolean) => void> = [];

/**
 * Update the cloud service status and notify listeners.
 */
export function updateCloudServiceStatus(enabled: boolean): void {
  cloudServiceEnabled = enabled;
  console.log(`[CloudServiceTracker] 云服务状态更新为: ${enabled ? '启用' : '禁用'}`);
  cloudServiceListeners.forEach(listener => listener(enabled));
}

/**
 * Get the current cloud service status.
 */
export function getCloudServiceStatus(): boolean {
  return cloudServiceEnabled;
}

/**
 * Add a listener for cloud service status changes.
 */
export function addCloudServiceStatusListener(listener: (enabled: boolean) => void): () => void {
  cloudServiceListeners.push(listener);
  return () => {
    const index = cloudServiceListeners.indexOf(listener);
    if (index !== -1) {
      cloudServiceListeners.splice(index, 1);
    }
  };
}

/**
 * Store user settings in a global variable for easy access
 * across the application, especially for services
 */
export function storeUserSettingsGlobally(settings: GlobalSettings): void {
  try {
    // Store in global object for React Native environment
    if (typeof global !== 'undefined') {
      (global as any).__USER_SETTINGS = settings;
      if (settings.chat?.OpenAIcompatible?.endpoint) {
        (global as any).__OPENAI_COMPATIBLE_ENDPOINT = settings.chat.OpenAIcompatible.endpoint;
      }
    }
    
    // Store in localStorage for web environment
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('user_settings', JSON.stringify(settings));
      if (settings.chat?.OpenAIcompatible?.endpoint) {
        localStorage.setItem('openai_compatible_endpoint', settings.chat.OpenAIcompatible.endpoint);
      }
    }

    // 新增：同步Brave Search API Key到AsyncStorage（React Native环境）
    if (settings.search?.braveSearchApiKey) {
      // 动态导入AsyncStorage，避免web端报错
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('brave_search_api_key', settings.search.braveSearchApiKey);
      } catch (e) {
        // 忽略web端或require失败
      }
    }
    
    // 新增：同步zhipuApiKey到AsyncStorage和localStorage
    if (settings.chat?.zhipuApiKey) {
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('zhipu_api_key', settings.chat.zhipuApiKey);
      } catch (e) {
        // 忽略web端或require失败
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zhipu_api_key', settings.chat.zhipuApiKey);
      }
    }

    console.log('[SettingsHelper] User settings stored globally');
    
    // Update cloud service status when settings are updated
    if (settings.chat && settings.chat.useCloudService !== undefined) {
      updateCloudServiceStatus(settings.chat.useCloudService);
    }
  } catch (error) {
    console.error('[SettingsHelper] Failed to store settings globally:', error);
  }
}

/**
 * Get user settings from global storage
 */
export function getUserSettingsGlobally(): GlobalSettings | null {
  try {
    // Try to get from global object first (React Native)
    if (typeof global !== 'undefined' && (global as any).__USER_SETTINGS) {
      const settings = (global as any).__USER_SETTINGS;
      if (settings.chat?.OpenAIcompatible?.endpoint === undefined && (global as any).__OPENAI_COMPATIBLE_ENDPOINT) {
        settings.chat.OpenAIcompatible = settings.chat.OpenAIcompatible || {};
        settings.chat.OpenAIcompatible.endpoint = (global as any).__OPENAI_COMPATIBLE_ENDPOINT;
      }
      return settings;
    }
    
    // Try to get from localStorage (web)
    if (typeof localStorage !== 'undefined') {
      const settingsStr = localStorage.getItem('user_settings');
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.chat?.OpenAIcompatible?.endpoint === undefined) {
          const endpoint = localStorage.getItem('openai_compatible_endpoint');
          if (endpoint) {
            settings.chat.OpenAIcompatible = settings.chat.OpenAIcompatible || {};
            settings.chat.OpenAIcompatible.endpoint = endpoint;
          }
        }
        return settings;
      }
    }
    
    console.warn('[SettingsHelper] No user settings found in global storage');
    return null;
  } catch (error) {
    console.error('[SettingsHelper] Failed to get global settings:', error);
    return null;
  }
}

/**
 * Get API settings for Circle Service
 */
export function getApiSettings(): {
  apiKey: string | undefined;
  apiProvider: string;
  openrouter?: {
    enabled: boolean;
    apiKey?: string;
    model?: string;
  };
  OpenAIcompatible?: {
    enabled: boolean;
    apiKey?: string;
    model?: string;
    endpoint?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  };
  useCloudService: boolean;
  useGeminiKeyRotation?: boolean;
  useGeminiModelLoadBalancing?: boolean;
  additionalGeminiKeys?: string[];
  cloudModel?: string;
  geminiPrimaryModel?: string;
  geminiBackupModel?: string;
  retryDelay?: number;
  geminiTemperature?: number; // 新增
  geminiMaxTokens?: number;   // 新增
  useZhipuEmbedding?: boolean;
  zhipuApiKey?: string;
} {
  const settings = getUserSettingsGlobally();
  if (!settings || !settings.chat) {
    // Return default settings if none found
    return {
      apiKey: undefined,
      apiProvider: 'gemini',
      useCloudService: false,
      openrouter: {
        enabled: false
      },
      OpenAIcompatible: {
        enabled: false
      }
    };
  }

  // 互斥逻辑：只返回当前 provider 的参数
  const { apiProvider, characterApiKey, openrouter, OpenAIcompatible, useCloudService = false, additionalGeminiKeys, useGeminiKeyRotation, useGeminiModelLoadBalancing, cloudModel, geminiPrimaryModel, geminiBackupModel, retryDelay, geminiTemperature, geminiMaxTokens, useZhipuEmbedding, zhipuApiKey } = settings.chat;

  // --- 修正：同步OpenAIcompatible的流式参数等 ---
  let openAICompatibleConfig: any = { enabled: false };
  if (apiProvider === 'openai-compatible' && OpenAIcompatible?.enabled) {
    let provider = OpenAIcompatible;
    // 如果有多渠道，优先取selectedProviderId
    if (OpenAIcompatible.providers && Array.isArray(OpenAIcompatible.providers) && OpenAIcompatible.selectedProviderId) {
      const selected = OpenAIcompatible.providers.find((p: any) => p.id === OpenAIcompatible.selectedProviderId);
      if (selected) {
        provider = { ...selected, enabled: true };
      }
    }
    openAICompatibleConfig = {
      enabled: true,
      apiKey: provider.apiKey,
      model: provider.model,
      endpoint: provider.endpoint,
      stream: provider.stream,
      temperature: provider.temperature,
      max_tokens: provider.max_tokens
    };
  }

  return {
    apiKey: characterApiKey,
    apiProvider: apiProvider || 'gemini',
    openrouter: apiProvider === 'openrouter'
      ? {
          enabled: true,
          apiKey: openrouter?.apiKey,
          model: openrouter?.model || 'openai/gpt-3.5-turbo'
        }
      : { enabled: false },
    OpenAIcompatible: openAICompatibleConfig,
    useCloudService,
    additionalGeminiKeys,
    useGeminiKeyRotation,
    useGeminiModelLoadBalancing,
    cloudModel,
    geminiPrimaryModel,
    geminiBackupModel,
    retryDelay,
    geminiTemperature, // 新增
    geminiMaxTokens,   // 新增
    useZhipuEmbedding,
    zhipuApiKey
  };
}
