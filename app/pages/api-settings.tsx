import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@/constants/UserContext';
import { ApiServiceProvider } from '@/services/api-service-provider';
import ModelSelector from '@/components/settings/ModelSelector';
import { GlobalSettings, CloudServiceConfig } from '@/shared/types';
import { theme } from '@/constants/theme';
import { licenseService, LicenseInfo } from '@/services/license-service';
import { DeviceUtils } from '@/utils/device-utils';
import { API_CONFIG } from '@/constants/api-config';
import { CloudServiceProvider } from '@/services/cloud-service-provider';
import { updateCloudServiceStatus } from '@/utils/settings-helper';
import { mcpAdapter } from '@/NodeST/nodest/utils/mcp-adapter';
import { NovelAIService } from '@/components/NovelAIService';

const ApiSettings = () => {
  const router = useRouter();
  const { user, updateSettings } = useUser();
  const [isTesting, setIsTesting] = useState(false);

  // Gemini settings
  const [geminiKey, setGeminiKey] = useState(
    user?.settings?.chat?.characterApiKey && user?.settings?.chat?.characterApiKey !== '123'
      ? user.settings.chat.characterApiKey
      : ''
  );
  const [additionalGeminiKeys, setAdditionalGeminiKeys] = useState<string[]>(
    user?.settings?.chat?.additionalGeminiKeys || ['', '']
  );
  const [useGeminiModelLoadBalancing, setUseGeminiModelLoadBalancing] = useState(
    user?.settings?.chat?.useGeminiModelLoadBalancing || false
  );
  const [useGeminiKeyRotation, setUseGeminiKeyRotation] = useState(
    user?.settings?.chat?.useGeminiKeyRotation || false
  );
  const [geminiPrimaryModel, setGeminiPrimaryModel] = useState(
    user?.settings?.chat?.geminiPrimaryModel || 'gemini-2.5-pro-exp-03-25'
  );
  const [geminiBackupModel, setGeminiBackupModel] = useState(
    user?.settings?.chat?.geminiBackupModel || 'gemini-2.0-flash-exp'
  );
  const [retryDelay, setRetryDelay] = useState(
    user?.settings?.chat?.retryDelay || 5000
  );
  const [isModelPickerVisible, setIsModelPickerVisible] = useState(false);
  const [modelPickerType, setModelPickerType] = useState<'primary' | 'backup'>('primary');

  const availableGeminiModels = [
    'gemini-2.5-pro-exp-03-25',
    'gemini-2.0-flash-exp',
    'gemini-2.0-pro-exp-02-05',
    'gemini-exp-1206',
    'gemini-2.0-flash-thinking-exp-1219',
    'gemini-exp-1121',
    'gemini-exp-1114',
    'gemini-1.5-pro-exp-0827',
    'gemini-1.5-pro-exp-0801',
    'gemini-1.5-flash-8b-exp-0924',
    'gemini-1.5-flash-8b-exp-0827'
  ];

  // OpenRouter settings
  const [openRouterEnabled, setOpenRouterEnabled] = useState(
    user?.settings?.chat?.apiProvider === 'openrouter' &&
    user?.settings?.chat?.openrouter?.enabled || false
  );
  const [openRouterKey, setOpenRouterKey] = useState(
    user?.settings?.chat?.openrouter?.apiKey || ''
  );
  const [selectedModel, setSelectedModel] = useState(
    user?.settings?.chat?.openrouter?.model || ''
  );
  const [useBackupModels, setUseBackupModels] = useState(
    user?.settings?.chat?.openrouter?.useBackupModels || false
  );

  // Zhipu embedding settings
  const [useZhipuEmbedding, setUseZhipuEmbedding] = useState(
    user?.settings?.chat?.useZhipuEmbedding || false
  );
  const [zhipuApiKey, setZhipuApiKey] = useState(
    user?.settings?.chat?.zhipuApiKey && user?.settings?.chat?.zhipuApiKey !== '123'
      ? user.settings.chat.zhipuApiKey
      : ''
  );

  // Brave Search API settings
  const [braveSearchApiKey, setBraveSearchApiKey] = useState(
    user?.settings?.search?.braveSearchApiKey || ''
  );
  const [isTestingBraveSearch, setIsTestingBraveSearch] = useState(false);

  // NovelAI settings
  const [novelAIEnabled, setNovelAIEnabled] = useState(
    user?.settings?.chat?.novelai?.enabled || false
  );
  const [novelAIToken, setNovelAIToken] = useState(
    user?.settings?.chat?.novelai?.token || ''
  );
  const [isTestingNovelAI, setIsTestingNovelAI] = useState(false);
  const [novelAITokenStatus, setNovelAITokenStatus] = useState<{
    isValid: boolean;
    message: string;
  } | null>(null);

  const [isModelSelectorVisible, setIsModelSelectorVisible] = useState(false);

  // Activation code settings with enhanced state
  const [useActivationCode, setUseActivationCode] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  // Cloud service state
  const [useCloudService, setUseCloudService] = useState(
    user?.settings?.chat?.useCloudService || false
  );
  const [cloudModel, setCloudModel] = useState(
    user?.settings?.chat?.cloudModel || 'gemini-2.0-flash-exp'
  );

  // Define the allowed cloud models list
  const allowedCloudModels = [
    'gemini-2.5-pro-exp-03-25',
    'gemini-2.0-flash-exp',
    'gemini-2.0-pro-exp-02-05',
    'gemini-exp-1206',
    'gemini-2.0-flash-thinking-exp-1219',
    'gemini-exp-1121',
    'gemini-exp-1114',
    'gemini-1.5-pro-exp-0827',
    'gemini-1.5-pro-exp-0801',
    'gemini-1.5-flash-8b-exp-0924',
    'gemini-1.5-flash-8b-exp-0827'
  ];

  // 修复：如果未填写geminiKey，则设为'123'以触发回退
  const effectiveGeminiKey = geminiKey && geminiKey.trim() !== '' ? geminiKey : '123';
  // 修复：如果未填写zhipuApiKey，则设为'123'以触发回退
  const effectiveZhipuApiKey = zhipuApiKey && zhipuApiKey.trim() !== '' ? zhipuApiKey : '123';

  // Load existing license information on component mount
  useEffect(() => {
    const loadLicenseInfo = async () => {
      try {
        const info = await licenseService.getLicenseInfo();
        if (info) {
          setLicenseInfo(info);
          setUseActivationCode(true);
          setActivationCode(info.licenseKey || ''); // Ensure we don't set undefined
          console.log('已加载验证信息:', {
            key: info.licenseKey ? info.licenseKey.substring(0, 4) + '****' : 'No key',
            isValid: info.isValid
          });

          // 自动启用云服务开关（只要已激活且有效）
          if (info.isValid) {
            setUseCloudService(true);
          } else {
            // 从设置读取云服务状态，确保UI显示正确
            const cloudServiceEnabled = user?.settings?.chat?.useCloudService || false;
            setUseCloudService(cloudServiceEnabled);
          }

          if (user?.settings?.chat?.useCloudService || info.isValid) {
            // 如果云服务已启用，尝试从CloudServiceProvider获取当前首选模型
            try {
              const currentModel = CloudServiceProvider.getPreferredModel();
              if (currentModel) {
                setCloudModel(currentModel);
              } else if (user?.settings?.chat?.cloudModel) {
                setCloudModel(user.settings.chat.cloudModel);
              }
              console.log('从CloudServiceProvider加载云服务模型:', currentModel || cloudModel);
            } catch (error) {
              console.error('获取首选模型失败:', error);
            }
            
            // 如果许可证有效但云服务未初始化，尝试初始化
            if (info.isValid && !CloudServiceProvider.isEnabled()) {
              try {
                console.log('检测到有效许可证但云服务未启用，尝试自动初始化');
                await CloudServiceProvider.initialize({
                  enabled: true,
                  licenseKey: info.licenseKey!,
                  deviceId: info.deviceId!,
                  preferredModel: user?.settings?.chat?.cloudModel || 'gemini-2.0-flash-exp'
                });
                console.log('云服务自动初始化成功');
                updateCloudServiceStatus(true);
              } catch (initError) {
                console.error('云服务自动初始化失败:', initError);
              }
            }
          }
        }
      } catch (error) {
        console.error('加载许可证信息失败:', error);
      }
    };

    loadLicenseInfo();
  }, []);

  // 加载NovelAI token状态
  useEffect(() => {
    const loadNovelAITokenStatus = async () => {
      try {
        const tokenCache = await NovelAIService.getTokenCache();
        if (tokenCache && tokenCache.token === novelAIToken.trim()) {
          const now = Date.now();
          if (tokenCache.expiry > now) {
            const daysRemaining = (tokenCache.expiry - now) / (24 * 3600 * 1000);
            setNovelAITokenStatus({
              isValid: true,
              message: `Token有效，剩余约 ${daysRemaining.toFixed(1)} 天`
            });
          } else {
            setNovelAITokenStatus({
              isValid: false,
              message: `Token已过期，需要重新验证`
            });
          }
        } else {
          setNovelAITokenStatus(null);
        }
      } catch (error) {
        console.error('加载NovelAI token状态失败:', error);
      }
    };

    if (novelAIToken.trim()) {
      loadNovelAITokenStatus();
    } else {
      setNovelAITokenStatus(null);
    }
  }, [novelAIToken]);

  // 在组件加载时，添加日志显示设备ID
  useEffect(() => {
    const logDeviceId = async () => {
      try {
        const deviceId = await DeviceUtils.getDeviceId();
        console.log('当前设备ID (用于测试):', deviceId);
      } catch (error) {
        console.error('获取设备ID失败:', error);
      }
    };
    
    logDeviceId();
  }, []);

  // Handle API provider toggle
  const handleProviderToggle = (value: boolean) => {
    setOpenRouterEnabled(value);
  };

  // Update additional Gemini API key
  const updateAdditionalGeminiKey = (index: number, value: string) => {
    const updatedKeys = [...additionalGeminiKeys];
    updatedKeys[index] = value;
    setAdditionalGeminiKeys(updatedKeys);
  };

  // Add a new empty key field
  const addGeminiKeyField = () => {
    if (additionalGeminiKeys.length < 5) { // Limit to 5 additional keys
      setAdditionalGeminiKeys([...additionalGeminiKeys, '']);
    } else {
      Alert.alert('提示', '最多可添加5个额外的API密钥');
    }
  };

  // Remove a key field
  const removeGeminiKeyField = (index: number) => {
    const updatedKeys = [...additionalGeminiKeys];
    updatedKeys.splice(index, 1);
    setAdditionalGeminiKeys(updatedKeys);
  };

  // Test connection with full rotation support
  const testConnection = async () => {
    try {
      setIsTesting(true);

      const apiKey = openRouterEnabled ? openRouterKey : (geminiKey && geminiKey.trim() !== '' ? geminiKey : '123');
      const apiProvider = openRouterEnabled ? 'openrouter' : 'gemini';

      if (!apiKey) {
        Alert.alert('错误', '请输入API密钥');
        return;
      }

      // Validate additional keys for Gemini
      const validAdditionalKeys = apiProvider === 'gemini' ? 
        additionalGeminiKeys.filter(key => key && key.trim() !== '') : [];
      
      // Test connection using ApiServiceProvider
      const testMessage = "This is a test message. Please respond with 'OK' if you receive this.";
      const messages = [{ role: 'user', parts: [{ text: testMessage }] }];

      let response;
      if (apiProvider === 'openrouter') {
        response = await ApiServiceProvider.generateContent(
          messages,
          apiKey,
          {
            apiProvider: 'openrouter',
            openrouter: {
              enabled: true,
              apiKey: openRouterKey,
              model: selectedModel,
              autoRoute: false,
              useBackupModels: useBackupModels,
              backupModels: [],
            }
          }
        );
      } else {
        // Test with the primary key and all additional valid keys
        response = await ApiServiceProvider.generateContent(
          messages, 
          apiKey,
          {
            apiProvider: 'gemini',
            additionalGeminiKeys: validAdditionalKeys,
            useGeminiModelLoadBalancing,
            useGeminiKeyRotation,
            geminiPrimaryModel,
            geminiBackupModel,
            retryDelay
          }
        );
      }

      if (response) {
        if (apiProvider === 'gemini' && validAdditionalKeys.length > 0) {
          Alert.alert('连接成功', `成功连接到Gemini API服务，已配置${1 + validAdditionalKeys.length}个API密钥`);
        } else {
          Alert.alert('连接成功', '成功连接到API服务');
        }
      } else {
        Alert.alert('连接失败', '未能获得有效响应');
      }
    } catch (error) {
      console.error('连接测试失败:', error);
      Alert.alert('连接失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsTesting(false);
    }
  };

  // Test NovelAI token
  const testNovelAIToken = async () => {
    try {
      setIsTestingNovelAI(true);
      
      if (!novelAIToken) {
        Alert.alert('错误', '请输入NovelAI Token');
        return;
      }

      const isValid = await NovelAIService.validateToken(novelAIToken);
      
      if (isValid) {
        setNovelAITokenStatus({
          isValid: true,
          message: `Token验证成功，有效期约30天`
        });
        Alert.alert('验证成功', 'NovelAI Token验证成功，已缓存Token');
      } else {
        setNovelAITokenStatus({
          isValid: false,
          message: `Token验证失败`
        });
        Alert.alert('验证失败', '无法验证NovelAI Token，请检查后重试');
      }
    } catch (error) {
      console.error('NovelAI Token测试失败:', error);
      Alert.alert('验证失败', error instanceof Error ? error.message : '未知错误');
      setNovelAITokenStatus({
        isValid: false,
        message: `验证出错：${error instanceof Error ? error.message : '未知错误'}`
      });
    } finally {
      setIsTestingNovelAI(false);
    }
  };

  // Test Zhipu embeddings
  const testZhipuEmbedding = async () => {
    try {
      setIsTesting(true);

      const apiKeyToUse = zhipuApiKey && zhipuApiKey.trim() !== '' ? zhipuApiKey : '123';

      if (!apiKeyToUse || apiKeyToUse === '') {
        Alert.alert('错误', '请输入智谱清言API密钥');
        return;
      }

      // 构建请求体，测试嵌入功能
      const testUrl = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
      const testInput = "这是一个测试智谱清言嵌入功能的文本。";

      const requestBody = {
        model: 'embedding-3',
        input: testInput
      };

      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyToUse}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`智谱清言API错误: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      if (data.data && data.data[0]?.embedding) {
        const embeddingLength = data.data[0].embedding.length;
        Alert.alert('嵌入测试成功', `成功获取嵌入向量，维度: ${embeddingLength}`);
      } else {
        Alert.alert('嵌入测试失败', '未能获得有效的嵌入向量');
      }
    } catch (error) {
      console.error('智谱嵌入测试失败:', error);
      Alert.alert('嵌入测试失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsTesting(false);
    }
  };

  // Test Brave Search API
  const testBraveSearch = async () => {
    try {
      setIsTestingBraveSearch(true);

      if (!braveSearchApiKey) {
        Alert.alert('错误', '请输入Brave Search API密钥');
        return;
      }

      // 设置API密钥并测试连接
      await mcpAdapter.setApiKey(braveSearchApiKey);
      
      // 执行一个简单的测试搜索
      const testQuery = "test query";
      const searchResult = await mcpAdapter.search({
        query: testQuery,
        count: 1
      });

      if (searchResult && searchResult.web?.results) {
        Alert.alert('连接成功', `成功连接到Brave Search API，获取到 ${searchResult.web.results.length} 个搜索结果`);
      } else {
        Alert.alert('连接失败', '未能获得有效的搜索结果');
      }
    } catch (error) {
      console.error('Brave Search测试失败:', error);
      Alert.alert('连接失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsTestingBraveSearch(false);
    }
  };

  // Activate license function
  const activateLicense = async () => {
    if (!activationCode.trim()) {
      Alert.alert('错误', '请输入激活码');
      return;
    }

    try {
      setIsActivating(true);

      console.log('开始激活许可证，激活码:', activationCode.trim().substring(0, 4) + '****');
      console.log('许可证服务器域名:', API_CONFIG.LICENSE_SERVER_DOMAIN);
      console.log('许可证API端点:', API_CONFIG.LICENSE_API_URL);
      console.log('备用API端点:', API_CONFIG.LICENSE_API_FALLBACKS ? API_CONFIG.LICENSE_API_FALLBACKS[0] : 'None');

      const deviceId = await DeviceUtils.getDeviceId();
      console.log('当前设备ID:', deviceId.substring(0, 4) + '****');

      // 确保验证过程中记录请求信息
      const licenseInfo = await licenseService.verifyLicense(activationCode.trim());
      console.log('许可证验证响应:', JSON.stringify(licenseInfo));

      setLicenseInfo(licenseInfo);

      if (licenseInfo) {
        console.log('许可证激活成功，现在可以启用云服务功能');
      }

      Alert.alert(
        '激活成功',
        `许可证已成功激活\n计划: ${licenseInfo.planId}\n有效期至: ${licenseInfo.expiryDate}`,
        [{ text: '确定' }]
      );
    } catch (error) {
      console.error('许可证激活错误:', error);
      let errorMessage = '未知错误，请检查激活码是否正确';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      }

      Alert.alert(
        '激活失败',
        errorMessage
      );
    } finally {
      setIsActivating(false);
    }
  };

  // Save settings
  const saveSettings = async () => {
    try {
      // Filter out empty additional API keys
      const validAdditionalKeys = additionalGeminiKeys.filter(key => key && key.trim() !== '');

      if (useActivationCode && licenseInfo) {
        const apiSettings: Partial<GlobalSettings> = {
          chat: {
            ...user?.settings?.chat,
            serverUrl: user?.settings?.chat?.serverUrl || '',
            characterApiKey: effectiveGeminiKey,
            additionalGeminiKeys: validAdditionalKeys,
            useGeminiModelLoadBalancing,
            useGeminiKeyRotation,
            geminiPrimaryModel,
            geminiBackupModel,
            retryDelay,
            xApiKey: user?.settings?.chat?.xApiKey || '',
            apiProvider: openRouterEnabled ? 'openrouter' : 'gemini',
            typingDelay: user?.settings?.chat?.typingDelay || 50,
            temperature: user?.settings?.chat?.temperature || 0.7,
            maxtokens: user?.settings?.chat?.maxtokens || 2000,
            maxTokens: user?.settings?.chat?.maxTokens || 2000,
            useZhipuEmbedding: useZhipuEmbedding,
            zhipuApiKey: effectiveZhipuApiKey,
            useCloudService: useCloudService,
            cloudModel: useCloudService ? cloudModel : undefined,
            openrouter: {
              enabled: openRouterEnabled,
              apiKey: openRouterKey,
              model: selectedModel,
              useBackupModels: useBackupModels,
              backupModels: user?.settings?.chat?.openrouter?.backupModels || []
            },
            novelai: {
              enabled: novelAIEnabled,
              token: novelAIToken,
              model: 'NAI Diffusion V4',
              sampler: 'k_euler_ancestral',
              steps: 28,
              scale: 11,
              noiseSchedule: 'karras'
            }
          },
          search: {
            ...user?.settings?.search,
            braveSearchApiKey: braveSearchApiKey
          },
          license: {
            enabled: true,
            licenseKey: licenseInfo.licenseKey,
            deviceId: licenseInfo.deviceId,
            planId: licenseInfo.planId,
            expiryDate: licenseInfo.expiryDate,
            isValid: licenseInfo.isValid // Explicitly store validity state
          }
        };

        // First update settings
        await updateSettings(apiSettings);

        // Update the Brave Search API key
        if (braveSearchApiKey) {
          try {
            await mcpAdapter.setApiKey(braveSearchApiKey);
            console.log('Updated Brave Search API Key');
          } catch (braveSearchError) {
            console.error('Failed to update Brave Search API Key:', braveSearchError);
          }
        }

        // Update zhipuApiKey in Mem0Service directly if embedding is enabled
        if (useZhipuEmbedding && effectiveZhipuApiKey) {
          try {
            const Mem0Service = require('@/src/memory/services/Mem0Service').default;
            const mem0Service = Mem0Service.getInstance();
            mem0Service.updateEmbedderApiKey(effectiveZhipuApiKey);
            console.log('Updated zhipuApiKey in Mem0Service');
            
            // Reset embedding availability flag to true since we have a key now
            mem0Service.isEmbeddingAvailable = true;
          } catch (memError) {
            console.error('Failed to update zhipuApiKey in Mem0Service:', memError);
          }
        }

        // Then initialize CloudServiceProvider
        try {
          if (useCloudService) {
            const cloudConfig: CloudServiceConfig = {
              enabled: true,
              licenseKey: licenseInfo.licenseKey,
              deviceId: licenseInfo.deviceId,
              preferredModel: cloudModel
            };

            await CloudServiceProvider.initialize(cloudConfig);
            console.log('Cloud service provider initialized with license information and model', cloudModel);
            
            // Update cloud service status in the tracker
            updateCloudServiceStatus(true);
          } else {
            CloudServiceProvider.disable();
            console.log('Cloud service provider disabled');
            
            // Update cloud service status in the tracker
            updateCloudServiceStatus(false);
          }
        } catch (cloudError) {
          console.warn('Failed to initialize cloud service:', cloudError);
          // Make sure tracker status matches actual state
          updateCloudServiceStatus(false);
        }

        Alert.alert('成功', '设置已保存', [
          { text: '确定', onPress: () => router.back() }
        ]);
      } else if (!useActivationCode) {
        await licenseService.clearLicense();
        CloudServiceProvider.disable();
        setUseCloudService(false);
        
        // Update cloud service status in the tracker
        updateCloudServiceStatus(false);

        const apiSettings: Partial<GlobalSettings> = {
          chat: {
            ...user?.settings?.chat,
            serverUrl: user?.settings?.chat?.serverUrl || '',
            characterApiKey: effectiveGeminiKey,
            additionalGeminiKeys: validAdditionalKeys,
            useGeminiModelLoadBalancing,
            useGeminiKeyRotation,
            geminiPrimaryModel,
            geminiBackupModel,
            retryDelay,
            xApiKey: user?.settings?.chat?.xApiKey || '',
            apiProvider: openRouterEnabled ? 'openrouter' : 'gemini',
            typingDelay: user?.settings?.chat?.typingDelay || 50,
            temperature: user?.settings?.chat?.temperature || 0.7,
            maxtokens: user?.settings?.chat?.maxtokens || 2000,
            maxTokens: user?.settings?.chat?.maxTokens || 2000,
            useZhipuEmbedding: useZhipuEmbedding,
            zhipuApiKey: effectiveZhipuApiKey,
            useCloudService: false,
            openrouter: {
              enabled: openRouterEnabled,
              apiKey: openRouterKey,
              model: selectedModel,
              useBackupModels: useBackupModels,
              backupModels: user?.settings?.chat?.openrouter?.backupModels || []
            },
            novelai: {
              enabled: novelAIEnabled,
              token: novelAIToken,
              model: 'NAI Diffusion V4',
              sampler: 'k_euler_ancestral',
              steps: 28,
              scale: 11,
              noiseSchedule: 'karras'
            }
          },
          search: {
            ...user?.settings?.search,
            braveSearchApiKey: braveSearchApiKey
          },
          license: {
            enabled: false
          }
        };

        await updateSettings(apiSettings);

        // Update the Brave Search API key
        if (braveSearchApiKey) {
          try {
            await mcpAdapter.setApiKey(braveSearchApiKey);
            console.log('Updated Brave Search API Key');
          } catch (braveSearchError) {
            console.error('Failed to update Brave Search API Key:', braveSearchError);
          }
        }

        // Update zhipuApiKey in Mem0Service directly if embedding is enabled
        if (useZhipuEmbedding && effectiveZhipuApiKey) {
          try {
            const Mem0Service = require('@/src/memory/services/Mem0Service').default;
            const mem0Service = Mem0Service.getInstance();
            mem0Service.updateEmbedderApiKey(effectiveZhipuApiKey);
            console.log('Updated zhipuApiKey in Mem0Service');
            
            // Reset embedding availability flag to true since we have a key now
            mem0Service.isEmbeddingAvailable = true;
          } catch (memError) {
            console.error('Failed to update zhipuApiKey in Mem0Service:', memError);
          }
        }

        Alert.alert('成功', '设置已保存', [
          { text: '确定', onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error('保存设置失败:', error);
      Alert.alert('错误', '保存设置失败');
    }
  };

  // Also update tracker when the switch is toggled
  const handleCloudServiceToggle = (enabled: boolean) => {
    setUseCloudService(enabled);
    console.log(`Cloud service switch toggled to: ${enabled ? 'enabled' : 'disabled'}`);
  };

  // Add a method to test if model selector can be displayed
  const canShowModelSelector = () => {
    return true; // Always allow showing model selector
  };

  // Render NovelAI token status
  const renderNovelAITokenStatus = () => {
    if (!novelAITokenStatus) return null;

    return (
      <View style={styles.tokenStatusContainer}>
        {novelAITokenStatus.isValid ? (
          <View style={styles.tokenStatusContent}>
            <Text style={styles.tokenStatusText}>
              令牌状态: <Text style={styles.tokenValid}>有效</Text>
            </Text>
            {novelAITokenStatus.message && (
              <Text style={styles.tokenDetailText}>{novelAITokenStatus.message}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.tokenStatusText}>
            令牌状态: <Text style={styles.tokenInvalid}>无效</Text>
            {novelAITokenStatus.message && ` - ${novelAITokenStatus.message}`}
          </Text>
        )}
      </View>
    );
  };

  // Function to select a Gemini model
  const openModelPicker = (type: 'primary' | 'backup') => {
    setModelPickerType(type);
    setIsModelPickerVisible(true);
  };

  // Function to handle model selection
  const handleModelSelection = (modelId: string) => {
    if (useCloudService) {
      // For cloud service, validate that the model is allowed
      if (allowedCloudModels.includes(modelId)) {
        setCloudModel(modelId);
      } else {
        // If not an allowed model, use the first allowed model
        setCloudModel(allowedCloudModels[0]);
        Alert.alert('模型不可用', '云服务目前仅支持Gemini系列模型，已自动选择推荐模型。');
      }
    } else {
      setSelectedModel(modelId);
    }
    setIsModelSelectorVisible(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>API 设置</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>测试入口</Text>
              <Switch
                value={useActivationCode}
                onValueChange={setUseActivationCode}
                trackColor={{ false: '#767577', true: 'rgba(255, 158, 205, 0.4)' }}
                thumbColor={useActivationCode ? theme.colors.primary : '#f4f3f4'}
              />
            </View>

            {useActivationCode && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabel}>License</Text>
                <TextInput
                  style={styles.input}
                  value={activationCode}
                  onChangeText={(text) => {
                    // 当用户修改激活码时，清除以前的license信息
                    if (licenseInfo && text !== licenseInfo.licenseKey) {
                      console.log('已修改，清除现有信息');
                      setLicenseInfo(null);
                    }
                    setActivationCode(text);
                  }}
                  placeholder="..."
                  placeholderTextColor="#999"
                  secureTextEntry={false}
                />

                {licenseInfo ? (
                  <View style={styles.licenseInfoContainer}>
                    <Text style={styles.licenseStatusText}>
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color="#4CAF50"
                      /> 已激活
                    </Text>
{/* <Text style={styles.licenseInfoText}>
                      计划: {licenseInfo.planId || '标准版'}
                    </Text>
                    <Text style={styles.licenseInfoText}>
                      有效期至: {licenseInfo.expiryDate || '永久'}
                    </Text>
                    {licenseInfo.email && (
                      <Text style={styles.licenseInfoText}>
                        邮箱: {licenseInfo.email}
                      </Text>
                    )}
                    <Text style={styles.licenseInfoText}>
                      已绑定设备数: {licenseInfo.deviceCount || 1}/3
                    </Text>

                    <Text style={styles.licenseInfoText}>
                      设备ID: {licenseInfo.deviceId ? `${licenseInfo.deviceId.substring(0, 8)}...` : '未知'}
                    </Text> */}

                    <View style={styles.cloudServiceContainer}>
                      <Text style={styles.cloudServiceLabel}>启用</Text>
                      <Switch
                        value={useCloudService}
                        onValueChange={handleCloudServiceToggle}
                        trackColor={{ false: '#767577', true: 'rgba(100, 210, 255, 0.4)' }}
                        thumbColor={useCloudService ? '#2196F3' : '#f4f3f4'}
                        disabled={!licenseInfo}
                      />
                    </View>
                    {useCloudService && (
                      <>
                        <View style={styles.modelSection}>
                          <Text style={styles.inputLabel}>模型选择</Text>
                          <TouchableOpacity
                            style={styles.modelButton}
                            onPress={() => setIsModelSelectorVisible(true)}
                          >
                            <Text style={styles.modelButtonText}>{cloudModel}</Text>
                            <Ionicons name="chevron-down" size={16} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.activateButton, isActivating && styles.disabledButton]}
                    onPress={activateLicense}
                    disabled={isActivating || !activationCode.trim()}
                  >
                    {isActivating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>验证激活</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>NovelAI</Text>
              <Switch
                value={novelAIEnabled}
                onValueChange={setNovelAIEnabled}
                trackColor={{ false: '#767577', true: 'rgba(138, 43, 226, 0.4)' }}
                thumbColor={novelAIEnabled ? '#8a2be2' : '#f4f3f4'}
              />
            </View>

            {novelAIEnabled && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabel}>NovelAI Token</Text>
                <TextInput
                  style={styles.input}
                  value={novelAIToken}
                  onChangeText={setNovelAIToken}
                  placeholder="输入 NovelAI Token"
                  placeholderTextColor="#999"
                  secureTextEntry={true}
                />
                <Text style={styles.helperText}>
                  需要登录 <Text style={styles.link}>novelai.net</Text> 获取 Token，用于生成高质量动漫图片
                </Text>

                {renderNovelAITokenStatus()}

                <TouchableOpacity
                  style={[styles.testButton, styles.novelAITestButton, { marginTop: 16 }]}
                  onPress={testNovelAIToken}
                  disabled={isTestingNovelAI || !novelAIToken}
                >
                  {isTestingNovelAI ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>验证 NovelAI Token</Text>
                  )}
                </TouchableOpacity>
                
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Brave Search API</Text>
            </View>
            <View style={styles.contentSection}>
              <Text style={styles.inputLabel}>Brave Search API Key</Text>
              <TextInput
                style={styles.input}
                value={braveSearchApiKey}
                onChangeText={setBraveSearchApiKey}
                placeholder="输入 Brave Search API Key"
                placeholderTextColor="#999"
                secureTextEntry={true}
              />
              <Text style={styles.helperText}>
                可从 <Text style={styles.link}>https://brave.com/search/api/</Text> 获取免费 API Key
              </Text>
              


              <TouchableOpacity
                style={[styles.testButton, styles.braveTestButton, { marginTop: 16 }]}
                onPress={testBraveSearch}
                disabled={isTestingBraveSearch || !braveSearchApiKey}
              >
                {isTestingBraveSearch ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>测试 Brave Search</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Gemini API</Text>
              <Switch
                value={!openRouterEnabled}
                onValueChange={(value) => setOpenRouterEnabled(!value)}
                trackColor={{ false: '#767577', true: 'rgba(255, 158, 205, 0.4)' }}
                thumbColor={!openRouterEnabled ? theme.colors.primary : '#f4f3f4'}
              />
            </View>

            {!openRouterEnabled && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabel}>Gemini API Key (主密钥)</Text>
                <TextInput
                  style={styles.input}
                  value={geminiKey}
                  onChangeText={setGeminiKey}
                  placeholder="输入 Gemini API Key"
                  placeholderTextColor="#999"
                  secureTextEntry={true}
                />
                <Text style={styles.helperText}>
                  可从 <Text style={styles.link}>Google AI Studio</Text> 获取免费 API Key
                </Text>
                
                {/* 额外的API密钥 */}
                <View style={styles.additionalKeysContainer}>
                  <View style={styles.additionalKeysHeader}>
                    <Text style={styles.additionalKeysTitle}>额外的API密钥 (可选)</Text>
                    <TouchableOpacity 
                      style={styles.addKeyButton}
                      onPress={addGeminiKeyField}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
                      <Text style={styles.addKeyText}>添加</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {additionalGeminiKeys.map((key, index) => (
                    <View key={`key-${index}`} style={styles.additionalKeyRow}>
                      <TextInput
                        style={[styles.input, styles.additionalKeyInput]}
                        value={key}
                        onChangeText={(value) => updateAdditionalGeminiKey(index, value)}
                        placeholder={`额外API密钥 #${index + 1}`}
                        placeholderTextColor="#999"
                        secureTextEntry={true}
                      />
                      <TouchableOpacity 
                        style={styles.removeKeyButton}
                        onPress={() => removeGeminiKeyField(index)}
                      >
                        <Ionicons name="close-circle" size={22} color="#f44336" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  
                </View>
                
                {/* 模型负载均衡设置 */}
                <View style={styles.loadBalancingSection}>
                  <Text style={styles.loadBalancingTitle}>高级设置</Text>
                  
                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>
                      模型选择
                    </Text>
                    <Switch
                      value={useGeminiModelLoadBalancing}
                      onValueChange={setUseGeminiModelLoadBalancing}
                      trackColor={{ false: '#767577', true: 'rgba(100, 210, 255, 0.4)' }}
                      thumbColor={useGeminiModelLoadBalancing ? '#2196F3' : '#f4f3f4'}
                    />
                  </View>
                  {useGeminiModelLoadBalancing && (
                    <>
                      
                      {/* 主模型选择 */}
                      <View style={styles.modelSelectorContainer}>
                        <Text style={styles.inputLabel}>主模型</Text>
                        <TouchableOpacity
                          style={styles.modelButton}
                          onPress={() => openModelPicker('primary')}
                        >
                          <Text style={styles.modelButtonText}>{geminiPrimaryModel}</Text>
                          <Ionicons name="chevron-down" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      
                      {/* 备用模型选择 */}
                      <View style={styles.modelSelectorContainer}>
                        <Text style={styles.inputLabel}>备用模型</Text>
                        <TouchableOpacity
                          style={styles.modelButton}
                          onPress={() => openModelPicker('backup')}
                        >
                          <Text style={styles.modelButtonText}>{geminiBackupModel}</Text>
                          <Ionicons name="chevron-down" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      
                      {/* 重试延迟设置 */}
                      <View style={styles.modelSelectorContainer}>
                        <Text style={styles.inputLabel}>备用模型重试延迟 (毫秒)</Text>
                        <TextInput
                          style={styles.input}
                          value={String(retryDelay)}
                          onChangeText={(text) => {
                            const value = parseInt(text.replace(/[^0-9]/g, ''));
                            setRetryDelay(isNaN(value) ? 5000 : value);
                          }}
                          keyboardType="numeric"
                          placeholder="输入延迟时间 (毫秒)"
                          placeholderTextColor="#999"
                        />
                        <Text style={styles.helperText}>
                          推荐值: 5000 (5秒)。主模型失败后等待多久再尝试备用模型
                        </Text>
                      </View>
                    </>
                  )}
                  
                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>
                      密钥轮换
                    </Text>
                    <Switch
                      value={useGeminiKeyRotation}
                      onValueChange={setUseGeminiKeyRotation}
                      trackColor={{ false: '#767577', true: 'rgba(100, 210, 255, 0.4)' }}
                      thumbColor={useGeminiKeyRotation ? '#2196F3' : '#f4f3f4'}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>OpenRouter API</Text>
              <Switch
                value={openRouterEnabled}
                onValueChange={setOpenRouterEnabled}
                trackColor={{ false: '#767577', true: 'rgba(255, 158, 205, 0.4)' }}
                thumbColor={openRouterEnabled ? theme.colors.primary : '#f4f3f4'}
              />
            </View>

            {openRouterEnabled && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabel}>OpenRouter API Key</Text>
                <TextInput
                  style={styles.input}
                  value={openRouterKey}
                  onChangeText={setOpenRouterKey}
                  placeholder="输入 OpenRouter API Key"
                  placeholderTextColor="#999"
                  secureTextEntry={true}
                />
                <Text style={styles.helperText}>
                  可从 <Text style={styles.link}>OpenRouter</Text> 获取 API Key
                </Text>

                <View style={styles.modelSection}>
                  <Text style={styles.inputLabel}>当前选定模型</Text>
                  <TouchableOpacity
                    style={styles.modelButton}
                    onPress={() => setIsModelSelectorVisible(true)}
                  >
                    <Text style={styles.modelButtonText}>{selectedModel}</Text>
                    <Ionicons name="chevron-down" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.switchContainer}>
                  <Text style={styles.switchLabel}>使用备用模型</Text>
                  <Switch
                    value={useBackupModels}
                    onValueChange={setUseBackupModels}
                    trackColor={{ false: '#767577', true: 'rgba(255, 158, 205, 0.4)' }}
                    thumbColor={useBackupModels ? theme.colors.primary : '#f4f3f4'}
                  />
                </View>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>智谱清言嵌入</Text>
              <Switch
                value={useZhipuEmbedding}
                onValueChange={setUseZhipuEmbedding}
                trackColor={{ false: '#767577', true: 'rgba(255, 158, 205, 0.4)' }}
                thumbColor={useZhipuEmbedding ? theme.colors.primary : '#f4f3f4'}
              />
            </View>

            {useZhipuEmbedding && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabel}>智谱清言 API Key</Text>
                <TextInput
                  style={styles.input}
                  value={zhipuApiKey}
                  onChangeText={setZhipuApiKey}
                  placeholder="输入智谱清言 API Key"
                  placeholderTextColor="#999"
                  secureTextEntry={true}
                />
                <Text style={styles.helperText}>
                  可从 <Text style={styles.link}>智谱清言开放平台</Text> 获取 API Key
                </Text>

                <TouchableOpacity
                  style={[styles.testButton, styles.zhipuTestButton, { marginTop: 16 }]}
                  onPress={testZhipuEmbedding}
                  disabled={isTesting || !zhipuApiKey}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>测试智谱嵌入</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.testButton}
              onPress={testConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={18} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>测试连接</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveSettings}
            >
              <Ionicons name="save-outline" size={18} color="black" style={styles.buttonIcon} />
              <Text style={styles.savebuttonText}>保存设置</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isModelSelectorVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setIsModelSelectorVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setIsModelSelectorVisible(false)}
              style={styles.modalBackButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>选择模型</Text>
            <View style={styles.modalHeaderRight} />
          </View>
          <ModelSelector
            apiKey={openRouterKey || ''}
            selectedModelId={useCloudService ? cloudModel : selectedModel}
            onSelectModel={handleModelSelection}
            useCloudService={useCloudService}
            allowedCloudModels={allowedCloudModels}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={isModelPickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsModelPickerVisible(false)}
      >
        <View style={styles.modelPickerOverlay}>
          <View style={styles.modelPickerContent}>
            <View style={styles.modelPickerHeader}>
              <Text style={styles.modelPickerTitle}>
                选择{modelPickerType === 'primary' ? '主' : '备用'}模型
              </Text>
              <TouchableOpacity
                onPress={() => setIsModelPickerVisible(false)}
                style={styles.modelPickerCloseButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modelPickerList}>
              {availableGeminiModels.map((model) => (
                <TouchableOpacity
                  key={model}
                  style={[
                    styles.modelPickerItem,
                    ((modelPickerType === 'primary' && model === geminiPrimaryModel) ||
                      (modelPickerType === 'backup' && model === geminiBackupModel)) &&
                      styles.modelPickerItemSelected
                  ]}
                  onPress={() => handleModelSelection(model)}
                >
                  <Text style={styles.modelPickerItemText}>
                    {model}
                  </Text>
                  {((modelPickerType === 'primary' && model === geminiPrimaryModel) ||
                    (modelPickerType === 'backup' && model === geminiBackupModel)) && (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  backButton: {
    padding: 8,
  },
  headerRight: {
    width: 40,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    backgroundColor: 'rgba(60, 60, 60, 0.5)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  contentSection: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#ddd',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
  link: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  modelSection: {
    marginTop: 16,
  },
  modelButton: {
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  switchLabel: {
    fontSize: 14,
    color: '#ddd',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  testButton: {
    flex: 1,
    backgroundColor: '#666',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  saveButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  savebuttonText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 16,
  },
  notesContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.5)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  noteIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#ddd',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#333',
    width: '90%',
    height: '70%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: '#444',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#555',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalCloseButton: {
    padding: 4,
  },
  zhipuTestButton: {
    backgroundColor: '#8e44ad',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  licenseInfoContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  licenseStatusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  licenseInfoText: {
    fontSize: 14,
    color: '#ddd',
    marginBottom: 4,
  },
  activateButton: {
    backgroundColor: '#4CAF50',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  cloudServiceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  cloudServiceLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  cloudServiceInfo: {
    marginTop: 8,
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalBackButton: {
    padding: 8,
  },
  modalHeaderRight: {
    width: 40,
  },
  braveTestButton: {
    backgroundColor: '#FB542B',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  additionalKeysContainer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  additionalKeysHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  additionalKeysTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ddd',
  },
  addKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  addKeyText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginLeft: 4,
  },
  additionalKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  additionalKeyInput: {
    flex: 1,
    marginRight: 8,
  },
  removeKeyButton: {
    padding: 4,
  },
  loadBalancingSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  loadBalancingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ddd',
    marginBottom: 16,
  },
  featureTag: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'normal',
  },
  featureDescription: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 16,
    marginTop: 4,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(33, 150, 243, 0.6)',
  },
  novelAITestButton: {
    backgroundColor: '#8a2be2',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  novelAIInfoContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#8a2be2',
  },
  novelAIInfoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  novelAIInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  novelAIInfoIcon: {
    marginRight: 6,
  },
  novelAIInfoText: {
    fontSize: 13,
    color: '#ddd',
  },
  tokenStatusContainer: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#8a2be2',
  },
  tokenStatusContent: {
    flexDirection: 'column',
  },
  tokenStatusText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  tokenDetailText: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  tokenValid: {
    color: '#27ae60',
    fontWeight: 'bold',
  },
  tokenInvalid: {
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  modelSelectorContainer: {
    marginTop: 16,
  },
  modelPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelPickerContent: {
    backgroundColor: '#333',
    width: '90%',
    maxHeight: '70%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modelPickerHeader: {
    backgroundColor: '#444',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#555',
  },
  modelPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modelPickerCloseButton: {
    padding: 4,
  },
  modelPickerList: {
    padding: 8,
  },
  modelPickerItem: {
    padding: 16,
    borderRadius: 8,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelPickerItemSelected: {
    backgroundColor: 'rgba(100, 210, 255, 0.2)',
  },
  modelPickerItemText: {
    fontSize: 16,
    color: '#fff',
  },
});

export default ApiSettings;

