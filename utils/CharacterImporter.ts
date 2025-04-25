import { PNGParser } from './PNGParser';
import { RoleCardJson, WorldBookJson, PresetJson,WorldBookEntry } from '@/shared/types';
import * as FileSystem from 'expo-file-system';

// Define interfaces for preset data types
interface PresetPrompt {
  name: string;
  content?: string;
  system_prompt?: boolean;
  enabled?: boolean;
  identifier: string;
  injection_position?: number;
  injection_depth?: number;
  role?: string;
  order?: number; // 添加 order 字段
  sortOrder?: number; 
  enable?: boolean; // 重命名 enabled 为 enable
}

export class CharacterImporter {
  static async importFromPNG(filePath: string): Promise<{
    roleCard: RoleCardJson;
    worldBook: WorldBookJson;
    extractedName: string;
    backgroundImage?: string; // Add backgroundImage field to return PNG data
  }> {
    const data = await PNGParser.readPNGChunks(filePath);
    
    // 检查 chara 数据
    if (!data.chara) {
      throw new Error('Invalid character data: missing chara data');
    }

    // 从多个可能的位置提取名字
    const extractedName = data.chara.name || data.chara.chara?.name || '';
    if (!extractedName) {
      throw new Error('Invalid character data: missing name in chara data');
    }

    console.log('Extracted name:', extractedName); // 添加调试日志

    const roleCard: RoleCardJson = {
      name: extractedName,
      first_mes: data.chara.first_mes || '',
      description: data.chara.description || '',
      personality: data.chara.personality || '',
      scenario: data.chara.scenario || '',
      mes_example: data.chara.mes_example || '',
      data: {
        extensions: {
          regex_scripts: []
        }
      }
    };

    const worldBook: WorldBookJson = {
      entries: {}
    };

    if (data.chara.data?.character_book?.entries) {
      console.log('[WorldBook 导入] PNG解析原始数据:');
      data.chara.data.character_book.entries.forEach((entry: any, index: number) => {
        const normalizedEntry = this.normalizeWorldBookEntry(entry, index);
        worldBook.entries[`entry_${index}`] = normalizedEntry;
        console.log(`条目 ${index}:`, {
          name: entry.name || `entry_${index}`,
          originalPosition: entry.position,
          normalizedPosition: normalizedEntry.position,
          constant: normalizedEntry.constant
        });
      });
    }

    // Convert the original PNG file to base64 for use as background image
    let backgroundImage: string | undefined;
    try {
      // Read the file as base64
      const base64Image = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Create a data URI for the image
      backgroundImage = `data:image/png;base64,${base64Image}`;
      console.log('[Character Import] Successfully extracted PNG as background image');
    } catch (error) {
      console.error('[Character Import] Failed to extract PNG as background image:', error);
      // Continue without background image if extraction fails
    }

    return { 
      roleCard, 
      worldBook, 
      extractedName,
      backgroundImage  // Return the background image data
    };
  }

  /**
   * 支持导入Json格式的角色卡（格式需包含roleCard/worldBook/preset）
   * @param filePath 本地json文件路径
   */
  static async importFromJson(filePath: string): Promise<{
    roleCard: RoleCardJson;
    worldBook: WorldBookJson;
    preset?: PresetJson;
    extractedName: string;
    backgroundImage?: string;
  }> {
    try {
      let content = await FileSystem.readAsStringAsync(filePath);
      content = content.replace(/^\uFEFF/, '').trim();
      const data = JSON.parse(content);
      if (!data.roleCard || !data.worldBook) {
        throw new Error('JSON文件缺少roleCard或worldBook字段');
      }
      const roleCard: RoleCardJson = data.roleCard;
      const worldBook: WorldBookJson = data.worldBook;
      const preset: PresetJson | undefined = data.preset;
      const extractedName = roleCard.name || '';
      let backgroundImage: string | undefined = data.backgroundImage;
      // 如果backgroundImage为本地文件路径，尝试转为base64
      if (backgroundImage && backgroundImage.startsWith('file://')) {
        try {
          const base64Image = await FileSystem.readAsStringAsync(backgroundImage, {
            encoding: FileSystem.EncodingType.Base64,
          });
          backgroundImage = `data:image/png;base64,${base64Image}`;
        } catch {}
      }
      return { roleCard, worldBook, preset, extractedName, backgroundImage };
    } catch (e) {
      throw new Error('导入JSON角色卡失败: ' + (e instanceof Error ? e.message : '未知错误'));
    }
  }

  static async importPresetForCharacter(filePath: string, characterId: string): Promise<PresetJson> {
    try {
      console.log('[预设导入] 开始导入:', filePath);
      
      // 1. 检查并标准化文件路径
      if (!filePath.startsWith('file://')) {
        filePath = `file://${filePath}`;
      }

      // 2. 检查文件是否存在
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error('文件不存在');
      }
      console.log('[预设导入] 文件信息:', fileInfo);

      // 3. 尝试多种方式读取文件内容
      let content: string | null = null;
      let error: Error | null = null;

      // 方法1: 直接读取
      try {
        content = await FileSystem.readAsStringAsync(filePath);
        if (content && !content.includes('�')) {
          console.log('[预设导入] 方法1成功: 直接读取');
        } else {
          content = null;
        }
      } catch (e) {
        console.log('[预设导入] 方法1失败:', e);
      }

      // 方法2: Base64读取
      if (!content) {
        try {
          const base64Content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64
          });
          content = Buffer.from(base64Content, 'base64').toString('utf8');
          if (content && !content.includes('�')) {
            console.log('[预设导入] 方法2成功: Base64读取');
          } else {
            content = null;
          }
        } catch (e) {
          console.log('[预设导入] 方法2失败:', e);
        }
      }

      // 方法3: 二进制读取
      if (!content) {
        try {
          const binary = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8
          });
          content = binary;
          if (content && !content.includes('�')) {
            console.log('[预设导入] 方法3成功: UTF8读取');
          } else {
            content = null;
          }
        } catch (e) {
          console.log('[预设导入] 方法3失败:', e);
        }
      }

      // 如果所有方法都失败了
      if (!content) {
        throw new Error('无法读取文件内容: 所有读取方法都失败了');
      }

      // 4. 验证和解析JSON
      let data;
      try {
        // 尝试清理内容中的BOM和其他特殊字符
        content = content.replace(/^\uFEFF/, ''); // 移除BOM
        content = content.trim(); // 移除首尾空白
        
        data = JSON.parse(content);
        console.log('[预设导入] JSON解析成功, 数据结构:', {
          hasPrompts: !!data.prompts,
          promptCount: data.prompts?.length,
          firstPrompt: data.prompts?.[0] ? {
            name: data.prompts[0].name,
            identifier: data.prompts[0].identifier
          } : null
        });
      } catch (parseError) {
        console.error('[预设导入] JSON解析失败:', parseError);
        console.log('[预设导入] 内容预览:', content.substring(0, 200));
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
        throw new Error(`预设文件格式无效: ${errorMessage}`);
      }

      // 基本数据结构验证
      if (!data || typeof data !== 'object') {
        console.error('[预设导入] 无效的数据结构:', data);
        throw new Error('预设数据格式错误');
      }

      // 在处理prompts数组前记录原始数据
      console.log('[预设导入] 原始prompt数据:', data.prompts);

      // 转换和过滤prompts
      let prompts = [];
      if (Array.isArray(data.prompts)) {
        interface PromptDebugInfo {
          name: string | undefined;
          injection_position: number | undefined;
          injection_depth: number | undefined;
        }

        // 添加更详细的数据追踪
        console.log('[预设导入] 开始处理prompts, 数量:', data.prompts.length);
        data.prompts.forEach((p: PresetPrompt, idx: number) => {
          console.log(`[预设导入] Prompt ${idx}:`, {
            name: p.name,
            injection_position: p.injection_position,
            injection_depth: p.injection_depth,
            role: p.role
          });
        });

        // 先根据 prompt_order 中的顺序创建一个映射表
        const orderMap = new Map<string, number>();
        const enabledMap = new Map<string, boolean>();
        
        if (data.prompt_order?.[0]?.order) {
          data.prompt_order[0].order.forEach((item: any, index: number) => {
            orderMap.set(item.identifier, index);
            enabledMap.set(item.identifier, item.enabled ?? true);
          });
        }

        // 处理 prompts，使用 prompt_order 中的顺序
        prompts = data.prompts
          .filter((prompt: PresetPrompt): boolean => {
            const isValid = !!(prompt && prompt.identifier && prompt.name);
            if (!isValid) {
              console.log('[预设导入] 过滤无效prompt:', prompt);
            }
            return isValid;
          })
          .map((prompt: PresetPrompt): PresetPrompt & { sortOrder: number } => {
            const normalizedRole = this.normalizeRole(prompt.role);
            const injection_position = prompt.injection_position ?? 
              (normalizedRole === 'model' ? 1 : 0);

            // 获取排序顺序，如果在 order 中找不到，则放到最后
            const sortOrder = orderMap.has(prompt.identifier) 
              ? orderMap.get(prompt.identifier)! 
              : Number.MAX_SAFE_INTEGER;

            // 获取启用状态 - use the correct field name enable instead of enabled
            const enable = enabledMap.has(prompt.identifier)
              ? enabledMap.get(prompt.identifier)
              : (prompt.system_prompt ?? prompt.enabled ?? true);

            return {
              name: String(prompt.name || ''),
              content: String(prompt.content || ''),
              enable: enable, // Use 'enable' instead of 'enabled' to match our interface
              identifier: String(prompt.identifier),
              role: normalizedRole,
              injection_position,
              injection_depth: prompt.injection_depth,
              sortOrder // 临时字段，用于排序
            };
          })
          .sort((a: PresetPrompt & { sortOrder: number }, b: PresetPrompt & { sortOrder: number }) => 
            a.sortOrder - b.sortOrder
          )
          .map(({ sortOrder, ...prompt }: PresetPrompt & { sortOrder: number }): PresetPrompt => prompt);

        console.log('[预设导入] 最终排序结果:', prompts.map((p: PresetPrompt, idx: number) => ({
          name: p.name,
          identifier: p.identifier,
          finalOrder: idx,
          injection_position: p.injection_position,
          injection_depth: p.injection_depth,
          enable: p.enable // Updated to use the correct field name
        })));

      } else {
        console.error('[预设导入] prompts不是数组:', data.prompts);
        throw new Error('预设文件中prompts格式错误');
      }

      // 确保至少有一个有效的prompt
      if (prompts.length === 0) {
        console.error('[预设导入] 没有有效的prompts');
        throw new Error('预设文件中没有有效的提示词');
      }

      // 在处理 prompt_order 前，记录原始顺序
      console.log('[预设导入] 原始顺序:', data.prompts.map((p: PresetPrompt) => ({
        name: p.name,
        identifier: p.identifier,
        position: p.injection_position
      })));

      // 构建最终的order数组
      const order = prompts.map((p: PresetPrompt): { identifier: string; enabled: boolean } => ({
        identifier: p.identifier,
        enabled: p.enable ?? false // Updated to use the correct field name
      }));

      const presetJson: PresetJson = {
        prompts,
        prompt_order: [{
          order
        }]
      };

      // 在返回前记录最终数据
      console.log('[预设导入] 最终数据:', {
        promptCount: presetJson.prompts.length,
        samplePrompts: presetJson.prompts.slice(0, 2).map(p => ({
          name: p.name,
          injection_position: p.injection_position,
          injection_depth: p.injection_depth
        }))
      });

      console.log('[预设导入] 生成的预设:', {
        promptsCount: presetJson.prompts.length,
        orderCount: presetJson.prompt_order[0].order.length,
        samplePrompt: presetJson.prompts[0]
      });

      return presetJson;

    } catch (error) {
      console.error('[预设导入] 失败:', {
        error,
        message: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private static normalizeWorldBookEntry(entry: any, index: number): WorldBookEntry {
    // 从 extensions.position 直接获取位置值，如果不存在则默认为 4 (按深度插入)
    const rawPosition = entry.extensions.position;
    let position: 0 | 1 | 2 | 3 | 4 = 4;
    
    // 确保 position 是有效的枚举值
    if (typeof rawPosition === 'number' && rawPosition >= 0 && rawPosition <= 4) {
      position = rawPosition as 0 | 1 | 2 | 3 | 4;
    }

    console.log('[WorldBook 导入] 规范化条目:', {
      name: entry.name || `entry_${index}`,
      rawPosition,
      normalizedPosition: position
    });

    return {
      comment: entry.comment || '',
      content: entry.content || '',
      disable: !entry.enabled, // 将 enabled 转换为 disable，注意是取反
      position,
      constant: !!entry.constant,
      order: entry.insertion_order || index,
      vectorized: !!entry.extensions?.vectorized,
      key: Array.isArray(entry.keys) ? entry.keys : [],
      // 只在 position === 4 时设置 depth
      depth: position === 4 ? (entry.extensions?.depth || 0) : 0
    };
  }

  private static normalizeRole(role?: string): 'user' | 'model' {
    switch (role?.toLowerCase()) {
      case 'assistant':
      case 'model':
      case 'ai':
        return 'model';
      default:
        return 'user';
    }
  }
}
