import { Character } from '@/shared/types';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { CloudServiceProvider } from '@/services/cloud-service-provider';
import CloudServiceProviderClass from '@/services/cloud-service-provider';
import { DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS } from '@/constants/defaultPrompts';
import NovelAIService from '@/components/NovelAIService';
import ImageManager from '@/utils/ImageManager';

export interface NovelAIGenerationConfig {
  seed?: number;
  positiveTags: string[];
  negativeTags: string[];
  sizePreset?: { width: number; height: number };
  model: string;
  steps: number;
  scale: number;
  sampler: string;
  noiseSchedule: string;
  characterPrompts: { prompt: string; positions: { x: number; y: number }[] }[];
  useCoords: boolean;
  useOrder: boolean;
}

export interface GenerationResult {
  success: boolean;
  imageId?: string; // Changed from imageUrl to imageId
  error?: string;
}

export class InputImagen {
  /**
   * Get NovelAI generation configuration from character
   */
  static getNovelAIConfig(character: Character): NovelAIGenerationConfig {
    // Default config
    const defaultConfig: NovelAIGenerationConfig = {
      positiveTags: [...DEFAULT_POSITIVE_PROMPTS],
      negativeTags: [...DEFAULT_NEGATIVE_PROMPTS],
      sizePreset: { width: 832, height: 1216 },
      model: 'NAI Diffusion V4 Curated',
      steps: 28,
      scale: 5,
      sampler: 'k_euler_ancestral',
      noiseSchedule: 'karras',
      characterPrompts: [],
      useCoords: false,
      useOrder: true
    };

    if (!character || !character.backgroundImageConfig) {
      return defaultConfig;
    }

    // Get NovelAI settings from character
    const novelaiConfig = character.backgroundImageConfig?.novelaiSettings || {};
    
    // Handle seed value
    let seed: number | undefined;
    if (
      character.backgroundImageConfig?.seed !== undefined &&
      character.backgroundImageConfig?.seed !== null &&
      character.backgroundImageConfig?.seed !== ''
    ) {
      seed = Number(character.backgroundImageConfig.seed);
    } else if (
      novelaiConfig.seed !== undefined &&
      novelaiConfig.seed !== null &&
      novelaiConfig.seed !== ''
    ) {
      seed = Number(novelaiConfig.seed);
    } else {
      seed = Math.floor(Math.random() * 2 ** 32);
    }

    // Merge tags
    const positiveTags = [
      ...(character.backgroundImageConfig?.genderTags || []),
      ...(character.backgroundImageConfig?.characterTags || []),
      ...(character.backgroundImageConfig?.qualityTags || []),
      ...(character.backgroundImageConfig?.positiveTags || []),
      ...DEFAULT_POSITIVE_PROMPTS
    ].filter(Boolean);

    const negativeTags = [
      ...DEFAULT_NEGATIVE_PROMPTS,
      ...(character.backgroundImageConfig?.negativeTags || [])
    ].filter(Boolean);

    // Add character prompts
    let characterPrompts: { prompt: string; positions: { x: number; y: number }[] }[] = [];
    if (character.backgroundImageConfig?.characterTags && character.backgroundImageConfig.characterTags.length > 0) {
      characterPrompts = [
        {
          prompt: character.backgroundImageConfig.characterTags.join(', '),
          positions: [{ x: 0, y: 0 }]
        }
      ];
    }

    // Size settings
    const sizePreset = character.backgroundImageConfig?.sizePreset || { width: 832, height: 1216 };

    return {
      seed,
      positiveTags,
      negativeTags,
      characterPrompts,
      model: novelaiConfig.model || 'NAI Diffusion V4 Curated',
      steps: novelaiConfig.steps || 28,
      scale: novelaiConfig.scale || 5,
      sampler: novelaiConfig.sampler || 'k_euler_ancestral',
      noiseSchedule: novelaiConfig.noiseSchedule || 'karras',
      sizePreset,
      useCoords: typeof novelaiConfig.useCoords === 'boolean' ? novelaiConfig.useCoords : false,
      useOrder: typeof novelaiConfig.useOrder === 'boolean' ? novelaiConfig.useOrder : true
    };
  }

  /**
   * Generate a scene description from the last bot message
   */
  static async generateSceneDescription(characterId: string): Promise<string> {
    try {
      // Get recent conversation context (last 10 messages)
      const contextMessages = await StorageAdapter.exportConversation(characterId);
      const recentMessages = contextMessages.slice(-10);
      
      if (recentMessages.length === 0) {
        return '';
      }

      console.log('[InputImagen] Generating scene description from last messages:', 
        recentMessages.length);

      // Try using Gemini first
      try {
        const prompt = `请根据以下对话内容，用一句不超过15个英文单词的连贯语句，描述角色当前的表情、动作、场景（时间、地点、画面），不要描述外观、服饰。输出英文短句。对话内容：\n${recentMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}`;
        console.log('[InputImagen] Sending GeminiAdapter prompt for scene description');
        const aiSceneDesc = await GeminiAdapter.executeDirectGenerateContent(prompt);
        const cleanDescription = (aiSceneDesc || '').replace(/[\r\n]+/g, ' ').trim();
        console.log('[InputImagen] Gemini generated scene description:', cleanDescription);
        
        if (cleanDescription) {
          return cleanDescription;
        }
      } catch (e) {
        console.warn('[InputImagen] Gemini scene description generation failed:', e);
      }

      // Fallback to CloudServiceProvider if Gemini fails
      try {
        console.log('[InputImagen] Falling back to CloudServiceProvider for scene description');
        const cloudResp = await (CloudServiceProvider.constructor as typeof CloudServiceProviderClass).generateChatCompletionStatic(
          [
            { role: 'user', content: `Based on the dialogue, describe the character's current expression, action, and setting (time, place, visuals) in one coherent sentence of no more than 20 words. Exclude appearance, clothing, and names. Use "he/she" to refer to the character. Output the sentence enclosed in curly braces: { }. Dialogue:\n${recentMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}` }
          ],
          { max_tokens: 32, temperature: 0.7 }
        );
        
        if (cloudResp && cloudResp.ok) {
          const data = await cloudResp.json();
          if (data && data.choices && data.choices[0]?.message?.content) {
            const response = data.choices[0].message.content.replace(/[\r\n]+/g, ' ').trim();
            // Extract content from curly braces if present
            const braceMatch = response.match(/\{([^}]+)\}/);
            const cleanDescription = braceMatch ? braceMatch[1].trim() : response;
            console.log('[InputImagen] CloudServiceProvider generated scene description:', cleanDescription);
            return cleanDescription;
          }
        }
      } catch (cloudErr) {
        console.warn('[InputImagen] CloudServiceProvider scene description generation failed:', cloudErr);
      }

      return ''; // Return empty string if all methods fail
    } catch (error) {
      console.error('[InputImagen] Error generating scene description:', error);
      return '';
    }
  }

  /**
   * Generate an image using NovelAI with the provided parameters
   */
  static async generateImage(
    token: string,
    config: NovelAIGenerationConfig,
    customPrompt: string = '',
    customSeed?: number
  ): Promise<GenerationResult> {
    try {
      console.log('[InputImagen] Starting image generation with config:', {
        model: config.model,
        width: config.sizePreset?.width ?? 832, 
        height: config.sizePreset?.height ?? 1216,
        steps: config.steps, 
        scale: config.scale,
        sampler: config.sampler,
        seed: customSeed || config.seed,
        noiseSchedule: config.noiseSchedule,
        hasCharacterPrompts: config.characterPrompts?.length > 0,
        useCoords: config.useCoords,
        useOrder: config.useOrder
      });

      // Create the positive prompt combining all tags
      let positivePromptText = config.positiveTags.join(', ');
      if (customPrompt && customPrompt.trim()) {
        positivePromptText = positivePromptText + ', ' + customPrompt.trim();
      }

      // Create negative prompt
      const negativePromptText = config.negativeTags.join(', ');
      
      // Generate the image using NovelAIService
      const result = await NovelAIService.generateImage({
        token,
        prompt: positivePromptText,
        characterPrompts: config.characterPrompts?.length ? config.characterPrompts : undefined,
        negativePrompt: negativePromptText,
        model: config.model,
        width: config.sizePreset?.width ?? 832, 
        height: config.sizePreset?.height ?? 1216,
        steps: config.steps,
        scale: config.scale,
        sampler: config.sampler,
        seed: customSeed || config.seed,
        noiseSchedule: config.noiseSchedule,
        useCoords: config.useCoords,
        useOrder: config.useOrder
      });

      // NovelAIService returns raw PNG data, we need to cache it using ImageManager
      if (result && result.imageUrls) {
        console.log('[InputImagen] NovelAI returned image data, caching image...');
        
        // Cache the image using ImageManager
        const cacheResult = await ImageManager.cacheImage(
          result.imageUrls[0],
          'image/png'
        );
        
        return {
          success: true,
          imageId: cacheResult.id
        };
      } else {
        return {
          success: false,
          error: 'No image data returned from NovelAI'
        };
      }
    } catch (error: any) {
      console.error('[InputImagen] Error generating image:', error);
      
      // Check for 429 error and provide specific message
      if (error.message && typeof error.message === 'string' && error.message.includes('429')) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait before generating another image (Error 429)'
        };
      }
      
      return {
        success: false,
        error: error?.message || 'Unknown error generating image'
      };
    }
  }
}

export default InputImagen;
