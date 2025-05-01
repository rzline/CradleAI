import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  Platform,
  Keyboard,
  ImageBackground,
  StatusBar,
  TouchableOpacity,
  Text,
  Alert,
  KeyboardAvoidingView,
  AppState,
  ActivityIndicator,
  Animated,
  Easing
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'; // Import Video component
import ChatDialog from '@/components/ChatDialog';
import ChatInput from '@/components/ChatInput';
import Sidebar from '@/components/Sidebar';
import SettingsSidebar from '@/components/SettingsSidebar';
import MemoOverlay from '@/components/MemoOverlay';  // Import for memory enhancement plugin UI
import SaveManager from '@/components/SaveManager'; // Import the SaveManager component
import TTSEnhancerModal from '@/components/TTSEnhancerModal'; // Import the new modal component
import GroupDialog from '@/components/GroupDialog';
import GroupInput from '@/components/GroupInput';
import GroupManagementModal from '@/components/GroupManagementModal';
import GroupSettingsSidebar from '@/components/GroupSettingsSidebar'; // 新增导入
import { Group, GroupMessage, getUserGroups, getGroupMessages, sendGroupMessage } from '@/src/group';
import { Message, Character, ChatSave } from '@/shared/types';
import { useCharacters, } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext'; // 添加 useUser 导入
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TopBarWithBackground from '@/components/TopBarWithBackground';
import { NodeSTManager } from '@/utils/NodeSTManager';  // 导入 NodeSTManager
import { EventRegister } from 'react-native-event-listeners';
import { MemoryProvider } from '@/src/memory/providers/MemoryProvider';
import Mem0Initializer from '@/src/memory/components/Mem0Initializer';
import '@/src/memory/utils/polyfills';
import Mem0Service from '@/src/memory/services/Mem0Service'; // 新增导入
import { ttsService } from '@/services/ttsService';
import { useDialogMode } from '@/constants/DialogModeContext';
import { CharacterLoader } from '@/src/utils/character-loader'; // Import CharacterLoader
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter'; // 新增
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter'; // 新增
import { DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS } from '@/constants/defaultPrompts'; // 新增
import NovelAIService from '@/components/NovelAIService'; // 新增
import { CloudServiceProvider } from '@/services/cloud-service-provider';
import type  CloudServiceProviderClass  from '@/services/cloud-service-provider';
import * as FileSystem from 'expo-file-system'; // 新增导入
import { importDefaultCharactersIfNeeded, resetDefaultCharacterImported } from '@/components/DefaultCharacterImporter';
import TestMarkdown from '@/components/testmarkdown';
import { getApiSettings } from '@/utils/settings-helper'; 
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';
// Create a stable memory configuration outside the component
type MemoryConfig = {
  embedder: {
    provider: string;
    config: {
      apiKey: string;
      model: string;
      dimensions: number;
      url: string;
    };
  };
  vectorStore: {
    provider: string;
    config: {
      collectionName: string;
      dimension: number;
      dbName: string;
    };
  };
  llm: {
    provider: string;
    config: {
      apiKey: string;
      model: string;
      apiProvider: string;
      openrouter?: {
        apiKey?: string;
        model?: string;
      };
    };
  };
};

interface CreateConfigFunction {
  (user: any): MemoryConfig;
  config?: MemoryConfig;
}

const createStableMemoryConfig: CreateConfigFunction = (user: any): MemoryConfig => {
  // Create config only once and memoize it
  if (!createStableMemoryConfig.config) {
    createStableMemoryConfig.config = {
      embedder: {
        provider: 'zhipu',
        config: {
          apiKey: user?.settings?.chat?.zhipuApiKey || '',
          model: 'embedding-3',
          dimensions: 1024,
          url: 'https://open.bigmodel.cn/api/paas/v4/embeddings'
        }
      },
      vectorStore: {
        provider: 'mobile_sqlite',
        config: {
          collectionName: 'character_memories',
          dimension: 1024,
          dbName: 'vector_store.db',
        },
      },
      llm: {
        provider: 'mobile_llm',
        config: {
          apiKey: user?.settings?.chat?.apiProvider === 'openrouter' 
            ? user?.settings?.chat?.openrouter?.apiKey || ''
            : user?.settings?.chat?.characterApiKey || '',
          model: user?.settings?.chat?.apiProvider === 'openrouter'
            ? user?.settings?.chat?.openrouter?.model || 'gpt-3.5-turbo'
            : 'gpt-3.5-turbo',
          apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
          openrouter: user?.settings?.chat?.openrouter,
        },
      },
    };
  }
  return createStableMemoryConfig.config;
};

const App = () => {
  const [isTestMarkdownVisible, setIsTestMarkdownVisible] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();
  const characterId = params.characterId as string;
  const { user } = useUser(); // 获取用户设置

  // Create animation value for sidebar content shift
  const contentSlideAnim = useRef(new Animated.Value(0)).current;
  // Add a new animation value for settings sidebar
  const settingsSlideAnim = useRef(new Animated.Value(0)).current;
  const SIDEBAR_WIDTH = 280; // Match the sidebar width

  // --- Add: Animated value for scaling content on keyboard show/hide ---
  const contentScaleAnim = useRef(new Animated.Value(1)).current;

  // 新增：群聊设置侧边栏动画与显示状态
  const groupSettingsSidebarAnim = useRef(new Animated.Value(0)).current;
  const [groupSettingsSidebarVisible, setGroupSettingsSidebarVisible] = useState(false);

  // Create a stable memory configuration that won't change on every render
  const memoryConfig = useMemo(() => createStableMemoryConfig(user), []);

  // 简化状态管理，只保留必要的状态
  const {
    conversations,
    characters,
    getMessages,
    addMessage,
    clearMessages,
    updateCharacterExtraBackgroundImage,
    isLoading: charactersLoading, // 新增：获取加载状态
    setCharacters ,// 新增：用于兜底时补充context
    addCharacter, // <-- 修复：确保解构
    addConversation, // <-- 修复：确保解构
  } = useCharacters();
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // 新增：selectedCharacter 兜底机制
  const [fallbackCharacter, setFallbackCharacter] = useState<Character | null>(null);

  const selectedCharacter: Character | undefined | null =
    selectedConversationId
      ? characters.find((char: Character) => char.id === selectedConversationId)
      : null;

    // 新增：重置初始化状态按钮
    const handleResetDefaultCharacterInit = async () => {
      await resetDefaultCharacterImported();
      Alert.alert('已重置', '下次启动将重新导入默认角色');
    };
    const [defaultCharacterNavigated, setDefaultCharacterNavigated] = useState(false);
    const characterToUse = fallbackCharacter || selectedCharacter;
    const { mode, setMode } = useDialogMode();
  // Add state for default character import loading
  const [isInitializing, setIsInitializing] = useState(true);
  // 自动初始化默认角色（仅首次）
  // 修改：自动初始化默认角色（仅首次）
  useEffect(() => {
    // 只在应用启动时调用一次
    (async () => {
      try {
        console.log('[index] 调用 importDefaultCharactersIfNeeded ...');
        setIsInitializing(true); // 开始初始化
        
        const result = await importDefaultCharactersIfNeeded(
          addCharacter,
          addConversation,
          // 下面两个方法在 context 中已定义
          (id: string, uri: string) => {
            console.log(`[index] 调用 updateCharacterExtraBackgroundImage: id=${id}, uri=${uri}`);
            return updateCharacterExtraBackgroundImage(id, uri);
          },
          (id: string, uri: string) => {
            console.log(`[index] 调用 setCharacterAvatar: id=${id}, uri=${uri}`);
            // 兼容 context 的 setCharacterAvatar
            if (typeof id === 'string' && typeof uri === 'string') {
              return characters.find(c => c.id === id)
                ? Promise.resolve()
                : Promise.resolve();
            }
            return Promise.resolve();
          }
        );
        
        console.log('[index] importDefaultCharactersIfNeeded 完成', result);
        
        // 如果有角色ID，自动选择该角色（不进行路由跳转）
        if (result && result.characterId) {
          setSelectedConversationId(result.characterId);
          
          // 如果是新导入的角色，更新消息列表
          if (result.imported) {
            const characterMessages = getMessages(result.characterId);
            setMessages(characterMessages);
            console.log(`[index] 选择了新导入的默认角色：${result.characterId}`);
          }
          // 新增：如果视觉小说模式已激活，设置 defaultCharacterNavigated 为 true
          if (mode === 'visual-novel') {
            console.log('[index] 视觉小说模式已激活，设置 defaultCharacterNavigated 为 true');
            setDefaultCharacterNavigated(true);// <--- 必须加上这一行
            if (defaultCharacterNavigated) {
              console.log('[index] defaultCharacterNavigated 已为 true，直接调用 handleResetConversation');
            } else {
              console.log('[index] 设置 defaultCharacterNavigated = true，reset');
              setDefaultCharacterNavigated(true);

            }
          }
        }
        // 延迟一些时间再关闭加载状态，以确保UI正确渲染
        setTimeout(() => setIsInitializing(false), 500);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[DefaultCharacterImporter] 初始化失败:', e);
        setIsInitializing(false); // 即使失败也关闭加载状态
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  // 兜底逻辑：如果 context 里查不到角色，尝试直接从 characters.json 读取
  useEffect(() => {
    if (
      selectedConversationId &&
      !selectedCharacter &&
      !charactersLoading // 避免加载中时误判
    ) {
      // eslint-disable-next-line no-console
      console.warn('[App] selectedCharacter not found in context, try fallback from storage:', selectedConversationId);
      (async () => {
        try {
          const filePath = FileSystem.documentDirectory + 'characters.json';
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(filePath);
            const arr = JSON.parse(content);
            if (Array.isArray(arr)) {
              const found = arr.find((c: any) => c.id === selectedConversationId);
              if (found) {
                setFallbackCharacter(found);
                // 可选：自动补充到 context，保证后续 context 可用
              // 修正：直接传递新数组
              if (!characters.some(c => c.id === found.id)) {
                setCharacters([...characters, found]);
              }
              return;
            }
          }
        }
          setFallbackCharacter(null);
        } catch (e) {
          setFallbackCharacter(null);
        }
      })();
    } else {
      setFallbackCharacter(null);
    }
  }, [selectedConversationId, selectedCharacter, charactersLoading, setCharacters]);

  // Group-related state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const [isGroupManageModalVisible, setIsGroupManageModalVisible] = useState(false);
  const [disbandedGroups, setDisbandedGroups] = useState<string[]>([]);
  const [groupBackgrounds, setGroupBackgrounds] = useState<Record<string, string | undefined>>({}); // 新增

  // UI state
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSettingsSidebarVisible, setIsSettingsSidebarVisible] = useState(false);
  const [isMemoSheetVisible, setIsMemoSheetVisible] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [isNovelAITestVisible, setIsNovelAITestVisible] = useState(false);
  const [isVNDBTestVisible, setIsVNDBTestVisible] = useState(false);

  // Save/Load system states
  const [isSaveManagerVisible, setIsSaveManagerVisible] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<Message[] | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [currentPreviewSave, setCurrentPreviewSave] = useState<ChatSave | null>(null);
  const [previewBannerVisible, setPreviewBannerVisible] = useState(false);

  // 添加一个跟踪处理过的图片URL的集合
  const [processedImageUrls, setProcessedImageUrls] = useState<Set<string>>(new Set());
  // 添加一个引用来跟踪处理中的任务ID
  const processingTaskIds = useRef<Set<string>>(new Set());

  // Add ref to track if first message needs to be sent
  const firstMessageSentRef = useRef<Record<string, boolean>>({});

  // Add ref to track if first_mes has been sent for each character
  const firstMesSentRef = useRef<Record<string, boolean>>({});

  // Add auto-message feature variables
  const [autoMessageEnabled, setAutoMessageEnabled] = useState(true);
  const autoMessageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoMessageIntervalRef = useRef<number>(5); // Default 5 minutes
  const lastMessageTimeRef = useRef<number>(Date.now());
  const waitingForUserReplyRef = useRef<boolean>(false); // Track if bot is waiting for user reply

  // Add state to preserve chat scroll positions
  const [chatScrollPositions, setChatScrollPositions] = useState<Record<string, number>>({});
  
  // Add new state for memory management
  const [memoryFacts, setMemoryFacts] = useState<any[]>([]);
  const [isMemoryPanelVisible, setIsMemoryPanelVisible] = useState(false);
  const [messageMemoryState, setMessageMemoryState] = useState<Record<string, string>>({});

  // Add state to toggle search functionality
  const [braveSearchEnabled, setBraveSearchEnabled] = useState<boolean>(false);
  
  // Add TTS enhancer state
  const [isTtsEnhancerEnabled, setIsTtsEnhancerEnabled] = useState(false);
  const [isTtsEnhancerModalVisible, setIsTtsEnhancerModalVisible] = useState(false);

  // Get dialog mode
  

  // Add new ref for video component
  const videoRef = useRef<Video | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Add new state to track regenerating message
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);

  // Add transient error state for temporary error messages
  const [transientError, setTransientError] = useState<string | null>(null);

  // 新增：后处理相关状态
  const [isExtraBgGenerating, setIsExtraBgGenerating] = useState(false);
  const [extraBgTaskId, setExtraBgTaskId] = useState<string | null>(null);
  const [extraBgError, setExtraBgError] = useState<string | null>(null);
  const [extraBgImage, setExtraBgImage] = useState<string | null>(null);
  const extraBgGenAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const extraBgGenCounter = useRef<number>(0); // 用于覆盖生成

  // 新增：用于记录已生成图片的AI消息ID集合
  const processedExtraBgMessageIds = useRef<Set<string>>(new Set());

  // 新增：持久化已处理AI消息ID集合
  const EXTRA_BG_IDS_KEY_PREFIX = 'extraBgProcessedIds-';

  // 加载已处理集合
  const loadProcessedExtraBgMessageIds = useCallback(async (characterId: string) => {
    try {
      const key = `${EXTRA_BG_IDS_KEY_PREFIX}${characterId}`;
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          processedExtraBgMessageIds.current = new Set(arr);
          return;
        }
      }
      processedExtraBgMessageIds.current = new Set();
    } catch (e) {
      processedExtraBgMessageIds.current = new Set();
    }
  }, []);

  // 保存已处理集合
  const saveProcessedExtraBgMessageIds = useCallback(async (characterId: string) => {
    try {
      const key = `${EXTRA_BG_IDS_KEY_PREFIX}${characterId}`;
      await AsyncStorage.setItem(key, JSON.stringify(Array.from(processedExtraBgMessageIds.current)));
    } catch (e) {
      // ignore
    }
  }, []);

  // Toggle brave search function
  const toggleBraveSearch = () => {
    const newState = !braveSearchEnabled;
    setBraveSearchEnabled(newState);
    // Store preference
    AsyncStorage.setItem('braveSearchEnabled', JSON.stringify(newState))
      .catch(err => console.error('[App] Failed to save search preference:', err));
    
    // Show feedback toast
    Alert.alert(
      newState ? '已启用搜索' : '已禁用搜索',
      newState 
        ? '现在AI可以使用Brave搜索来回答需要最新信息的问题' 
        : '已关闭网络搜索功能，AI将只使用已有知识回答问题',
      [{ text: '确定', style: 'default' }]
    );
  };
  
  // Load saved search preference
useEffect(() => {
    if (user) {
      loadUserGroups();
    }
  }, [user]);

  const loadUserGroups = async () => {
    if (!user) return;
    
    try {
      const userGroups = await getUserGroups(user);
      // Filter out disbanded groups
      const filteredGroups = userGroups.filter(group => !disbandedGroups.includes(group.groupId));
      setGroups(filteredGroups);
      console.log(`[Index] Loaded ${filteredGroups.length} groups (filtered from ${userGroups.length})`);
    } catch (error) {
      console.error('Failed to load user groups:', error);
    }
  };

   // Load saved search preference (来自源1)
   useEffect(() => {
    const loadSearchPreference = async () => {
      try {
        const savedPref = await AsyncStorage.getItem('braveSearchEnabled');
        if (savedPref !== null) {
          setBraveSearchEnabled(JSON.parse(savedPref));
        }
      } catch (error) {
        console.error('[App] Failed to load search preference:', error);
      }
    };

    loadSearchPreference();
  }, []); // 空依赖数组，仅在挂载时运行

  // Load TTS enhancer settings when component mounts (来自源2)
  useEffect(() => {
    const loadTtsEnhancerSettings = async () => {
      try {
        // 注意：确保 ttsService 在此作用域内可用
        const settings = ttsService.getEnhancerSettings();
        setIsTtsEnhancerEnabled(settings.enabled);
      } catch (error) {
        console.error('[App] Error loading TTS enhancer settings:', error);
      }
    };

    loadTtsEnhancerSettings();
  }, []); // 空依赖数组，仅在挂载时运行

  // Listen for changes to enhancer settings (来自源3)
  useEffect(() => {
    const enhancerSettingsListener = EventRegister.addEventListener(
      'ttsEnhancerSettingsChanged',
      (settings: any) => {
        // 确保 settings 存在且 enabled 是布尔值
        if (settings && typeof settings.enabled === 'boolean') {
          setIsTtsEnhancerEnabled(settings.enabled);
        }
      }
    );

    // 清理函数：在组件卸载时移除监听器
    return () => {
      // 确保 EventRegister.removeEventListener 接受正确的参数类型
      if (typeof enhancerSettingsListener === 'string') {
         EventRegister.removeEventListener(enhancerSettingsListener);
      } else {
         console.warn('[App] Failed to remove TTS enhancer listener: Invalid listener ID type.');
         // 根据 EventRegister 的实际实现可能需要不同的处理
      }
    };
  }, []); // 空依赖数组，监听器设置/清理仅在挂载/卸载时运行

  // Load user groups when user changes (来自目标1)
  useEffect(() => {
    if (user) {
      loadUserGroups();
    } else {
      // 可选：如果用户注销，清空组信息
      setGroups([]);
      setSelectedGroupId(null); // 如果有选择组ID的状态
      setGroupMessages([]);
      setGroupMembers([]);
    }
  }, [user]); // 依赖于 user

  // Load group messages and members when a group is selected or groups list changes
  useEffect(() => {
    if (selectedGroupId) {
      loadGroupMessages(selectedGroupId);

      // Find the group to get member IDs
      const selectedGroup = groups.find(g => g.groupId === selectedGroupId);
      if (selectedGroup && characters) {
        // Only load character members (exclude the current user)
        const characterMemberIds = selectedGroup.groupMemberIds?.filter(
          id => id !== user?.id
        ) || [];
        
        // First try to find characters in the loaded characters array
        let memberCharacters = characters.filter(
          char => characterMemberIds.includes(char.id)
        );
        
        // If we didn't find all members, try to load the missing ones
        if (memberCharacters.length < characterMemberIds.length) {
          console.log(`[Index] Found ${memberCharacters.length} of ${characterMemberIds.length} group members, loading missing ones...`);
          
          // Load missing members in the background
          CharacterLoader.loadCharactersByIds(characterMemberIds)
            .then(loadedMembers => {
              if (loadedMembers && loadedMembers.length > 0) {
                console.log(`[Index] Successfully loaded ${loadedMembers.length} group members`);
                setGroupMembers(loadedMembers);
              }
            })
            .catch(error => {
              console.error('[Index] Error loading missing group members:', error);
            });
        } else {
          setGroupMembers(memberCharacters);
        }
      } else {
        setGroupMembers([]);
      }
    } else {
      setGroupMessages([]);
      setGroupMembers([]);
    }
  }, [selectedGroupId, groups, characters, user?.id]);

  // --- Helper Functions ---

  // (来自目标代码)
  const loadGroupMessages = async (groupId: string) => {
    if (!groupId) return; // 添加检查

    try {
       // 确保 getGroupMessages 在此作用域内可用
      const messages = await getGroupMessages(groupId);
      setGroupMessages(messages);
    } catch (error) {
      console.error('Failed to load group messages:', error);
       // 可以考虑设置错误状态或通知用户
    }
  };

  // Add function to handle group disbanded
  const handleGroupDisbanded = useCallback((groupId: string) => {
    console.log(`[Index] Group disbanded: ${groupId}`);
    
    // Add to disbanded groups list
    setDisbandedGroups(prev => [...prev, groupId]);
    
    // If the current group is the one disbanded, clear it
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setGroupMessages([]);
      setIsGroupMode(false);
      
      // If there's a character selected previously, switch back to it
      if (selectedConversationId) {
        console.log(`[Index] Switching back to character conversation: ${selectedConversationId}`);
      } else if (conversations.length > 0) {
        // If no previous character conversation, select the first available one
        setSelectedConversationId(conversations[0].id);
        console.log(`[Index] Switching to first available character: ${conversations[0].id}`);
      }    
    }
    
    // Reload groups to refresh the list
    loadUserGroups();
  }, [selectedGroupId, selectedConversationId, conversations]);

  // 新增：群聊背景变更回调
  const handleGroupBackgroundChanged = useCallback((groupId: string, newBackground: string | undefined) => {
    setGroupBackgrounds(prev => ({
      ...prev,
      [groupId]: newBackground,
    }));
    // 同步更新groups中的backgroundImage字段
    setGroups(prevGroups =>
      prevGroups.map(g =>
        g.groupId === groupId ? { ...g, backgroundImage: newBackground } : g
      )
    );
  }, []);

  // --- Component Render ---

  // Modify toggleSettingsSidebar to animate settingsSlideAnim
  const toggleSettingsSidebar = () => {
    const newIsVisible = !isSettingsSidebarVisible;
    setIsSettingsSidebarVisible(newIsVisible);
    
    // Animate the content area and settings sidebar
    Animated.timing(settingsSlideAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300, // Use consistent duration of 300ms for all sidebar animations
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  // Modify toggleSidebar to also animate contentSlideAnim
  const toggleSidebar = () => {
    const newIsVisible = !isSidebarVisible;
    setIsSidebarVisible(newIsVisible);
    
    // Animate the content area
    Animated.timing(contentSlideAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300, // Update to match the settings sidebar animation duration (300ms)
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true, // Use native driver for better performance
    }).start();
  };

  // 新增：群聊设置侧边栏动画控制
  const toggleGroupSettingsSidebar = () => {
    const newIsVisible = !groupSettingsSidebarVisible;
    setGroupSettingsSidebarVisible(newIsVisible);
    Animated.timing(groupSettingsSidebarAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const toggleSaveManager = () => {
    // If in preview mode, ask user if they want to exit
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You are currently previewing a saved chat. Do you want to exit preview mode?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Exit Preview', 
            onPress: () => {
              exitPreviewMode();
              setIsSaveManagerVisible(!isSaveManagerVisible);
            }
          }
        ]
      );
    } else {
      setIsSaveManagerVisible(!isSaveManagerVisible);
    }
  };

  const handleSaveMemo = (content: string) => {
    // 这里可以添加保存备忘录的逻辑
    console.log('Saving memo:', content);
    // TODO: 将备忘录保存到本地存储或发送到服务器
  };

  // Preview a save
  const handlePreviewSave = (save: ChatSave) => {
    if (!isPreviewMode) {
      // Store current messages for later
      setPreviewMessages(messages);
    }
    
    // Enter preview mode and show the saved messages
    setIsPreviewMode(true);
    setCurrentPreviewSave(save);
    setMessages(save.messages);
    setIsSaveManagerVisible(false);
    
    // Show preview banner
    setPreviewBannerVisible(true);
    
    // Hide banner after 5 seconds
    setTimeout(() => {
      setPreviewBannerVisible(false);
    }, 5000);
  };

  // Exit preview mode and restore original messages
  const exitPreviewMode = () => {
    if (isPreviewMode && previewMessages) {
      setMessages(previewMessages);
      setIsPreviewMode(false);
      setCurrentPreviewSave(null);
      setPreviewMessages(null);
      setPreviewBannerVisible(false);
    }
  };

  // Update handleLoadSave function to properly restore NodeST chat history
  const handleLoadSave = async (save: ChatSave) => {
    if (!selectedConversationId) return;
    
    // First ensure NodeST chat history is restored (this should already happen in SaveManager)
    if (save.nodestChatHistory) {
      console.log('[App] Verifying NodeST chat history restoration');
      try {
        await NodeSTManager.restoreChatHistory({
          conversationId: selectedConversationId,
          chatHistory: save.nodestChatHistory
        });
      } catch (error) {
        console.error('[App] Error restoring NodeST chat history:', error);
      }
    } else {
      console.warn('[App] Save does not contain NodeST chat history');
    }
    
    // Now clear all messages
    clearMessages(selectedConversationId)
      .then(async () => {
        // Add each message from the save
        for (const msg of save.messages) {
          await addMessage(selectedConversationId, msg);
        }
        
        // Update local state
        setMessages(save.messages);
        setIsSaveManagerVisible(false);
        setIsPreviewMode(false);
        setPreviewMessages(null);
        setCurrentPreviewSave(null);
        
        Alert.alert('Success', 'Chat restored successfully to saved point!');
      })
      .catch(error => {
        console.error('Error restoring chat:', error);
        Alert.alert('Error', 'Failed to restore chat state.');
        
        // Exit preview mode on error
        exitPreviewMode();
      });
  };

  // Handle chat save creation
  const handleSaveCreated = (save: ChatSave) => {
    console.log('Save created:', save.id);
  };

  useEffect(() => {
    setSelectedConversationId(conversations.length > 0 ? conversations[0].id : null);
  }, [conversations]);

  // 确保每次消息更新时重新获取消息
  const currentMessages = selectedConversationId ? getMessages(selectedConversationId) : [];

  const handleSendMessage = async (newMessage: string, sender: 'user' | 'bot', isLoading = false, metadata?: Record<string, any>) => {
    // If in preview mode, exit it first
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You\'re currently previewing a saved chat. Sending a new message will exit preview mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Send & Exit Preview', 
            onPress: () => {
              exitPreviewMode();
              sendMessageInternal(newMessage, sender, isLoading);
            }
          }
        ]
      );
      return;
    }

    // 检查是否为错误提示消息（仅用于临时提示，不加入消息流）
    const isTransientError = metadata?.isErrorMessage === true ||
      newMessage.includes("抱歉，处理消息时出现了错误") ||
      newMessage.includes("抱歉，无法重新生成回复") ||
      newMessage.includes("发生错误，无法重新生成") ||
      newMessage.includes("处理图片时出现了错误") ||
      newMessage.includes("生成图片时出现了错误") ||
      newMessage.includes("编辑图片时出现了错误") ||
      newMessage.includes("发送消息时出现了错误") ||
      newMessage.includes("抱歉，未收到有效回复。");

    if (isTransientError) {
      setTransientError(newMessage);
      setTimeout(() => setTransientError(null), 2500); // 2.5秒后自动消失
      return;
    }

    const messageId = await sendMessageInternal(newMessage, sender, isLoading);
    
    // === 新实现：直接追加消息到本地状态 ===
    setMessages(prev => [
      ...prev,
      {
        id: messageId || `temp-${Date.now()}`,
        text: newMessage,
        sender,
        isLoading,
        timestamp: Date.now(),
        metadata
      }
    ]);
    
    // If it's a user message, update memory state to "processing"
    if (sender === 'user' && !isLoading && messageId) {
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'processing'
      }));
      
      // Process memory after a short delay to allow UI to update
      setTimeout(() => {
        processMessageMemory(messageId, newMessage, selectedConversationId);
      }, 500);
    }

    // If user is sending a message, clear the "waiting for reply" flag
    if (sender === 'user' && !isLoading) {
      waitingForUserReplyRef.current = false;
      console.log('[App] User sent a message, no longer waiting for reply');
      
      // Clear unread messages count when user sends a message
      updateUnreadMessagesCount(0);
    }

    // Reset the auto message timer after any message is sent
    if (!isLoading) {
      lastMessageTimeRef.current = Date.now();
      setupAutoMessageTimer();
    }

    // Pass search preference to NodeST manager when applicable
    if (sender === 'user' && !isLoading) {
      // Inform NodeST about search preference
      try {
        await NodeSTManager.setSearchEnabled(braveSearchEnabled);
        console.log(`[App] Search functionality ${braveSearchEnabled ? 'enabled' : 'disabled'}`);
      } catch (error) {
        console.error('[App] Failed to set search preference:', error);
      }
    }
  };

  // Internal helper function to actually send the message
  const sendMessageInternal = async (newMessage: string, sender: 'user' | 'bot', isLoading = false) => {
    if (!selectedConversationId) {
      console.warn('No conversation selected.');
      return null;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    // Calculate aiIndex for bot messages
    let metadata = undefined;
    if (sender === 'bot' && !isLoading) {
      // Check if this is an error message by content
      const isErrorMessage = newMessage.includes("抱歉，处理消息时出现了错误") || 
                             newMessage.includes("抱歉，无法重新生成回复") ||
                             newMessage.includes("发生错误，无法重新生成") ||
                             newMessage.includes("处理图片时出现了错误") ||
                             newMessage.includes("生成图片时出现了错误") ||
                             newMessage.includes("编辑图片时出现了错误") ||
                             newMessage.includes("发送消息时出现了错误");

      // Only count non-error bot messages for aiIndex calculation
      if (!isErrorMessage) {
        const existingBotMessages = messages.filter(m => 
          m.sender === 'bot' && 
          !m.isLoading && 
          !m.metadata?.isErrorMessage && 
          !m.metadata?.error
        );
        const aiIndex = existingBotMessages.length;
        
        metadata = { aiIndex };
        console.log(`[App] Assigning aiIndex ${aiIndex} to new bot message`);
      } else {
        // For error messages, add error flag but don't include in aiIndex calculation
        metadata = { isErrorMessage: true };
        console.log(`[App] Message identified as error message, not assigning aiIndex`);
      }
    }

    const newMessageObj: Message = {
      id: messageId,
      text: newMessage,
      sender: sender,
      isLoading: isLoading,
      timestamp: Date.now(),
      metadata // Add metadata with aiIndex for bot messages or error flag for error messages
    };

    // 只在Context中更新消息，本地状态通过useEffect自动更新
    await addMessage(selectedConversationId, newMessageObj);
    return messageId;
  };

  const handleSendGroupMessage = async (text: string) => {
    if (!selectedGroupId || !user) return;
    
    try {
      const newMessage = await sendGroupMessage(user, selectedGroupId, text);
      if (newMessage) {
        // Update local state with the new message
        setGroupMessages(prev => [...prev, newMessage]);
      }
    } catch (error) {
      console.error('Failed to send group message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  const handleRegenerateMessage = async (messageId: string, messageIndex: number) => {
    if (!selectedConversationId) {
      console.warn('No conversation selected for regeneration');
      return;
    }
    
    try {
      // Set regenerating state to show loading indicator
      setRegeneratingMessageId(messageId);
      
      // Record current scroll position
      const currentScrollPosition = selectedConversationId ? 
        chatScrollPositions[selectedConversationId] : undefined;
      
      console.log('Regenerating message with aiIndex:', messageIndex);
      
      // Find all AI messages and their corresponding user messages
      const currentMessages = [...messages];
      
      // First, count the number of actual bot messages (excluding loading messages and error messages)
      const botMessages = currentMessages.filter(msg => 
        msg.sender === 'bot' && 
        !msg.isLoading && 
        !msg.metadata?.isErrorMessage && 
        !msg.metadata?.error
      );
      
      console.log(`Found ${botMessages.length} bot messages for regeneration`);
      
      // Check if the message with the given ID exists and is a bot message
      const targetMessageIndex = currentMessages.findIndex(msg => msg.id === messageId);
      if (targetMessageIndex === -1) {
        console.warn('Target message not found by ID:', messageId);
        setRegeneratingMessageId(null); // Reset regenerating state
        return;
      }
      
      const targetMessage = currentMessages[targetMessageIndex];
      
      // Verify this is a bot message we can regenerate (not an error message)
      if (targetMessage.sender !== 'bot' || 
          targetMessage.isLoading || 
          targetMessage.metadata?.isErrorMessage === true ||
          targetMessage.metadata?.error !== undefined) {
        console.warn('Cannot regenerate message - invalid message type:', {
          sender: targetMessage.sender,
          isLoading: targetMessage.isLoading,
          isErrorMessage: targetMessage.metadata?.isErrorMessage,
          hasError: targetMessage.metadata?.error !== undefined
        });
        setRegeneratingMessageId(null); // Reset regenerating state
        return;
      }

      // Create a loading message
      const loadingMessageId = `loading-${Date.now()}`;
      await addMessage(selectedConversationId, {
        id: loadingMessageId,
        text: '', 
        sender: 'bot',
        isLoading: true,
        timestamp: Date.now(),
      });
      
      // Update local state to show loading indicator
      setMessages(getMessages(selectedConversationId));
      
      // Call NodeSTManager to handle the regeneration with the provided aiIndex
      const result = await NodeSTManager.regenerateFromMessage({
        messageIndex: messageIndex, // Use the aiIndex explicitly
        conversationId: selectedConversationId,
        apiKey: user?.settings?.chat?.characterApiKey || '',
        apiSettings: {
          apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
          openrouter: user?.settings?.chat?.openrouter
        },
        character: fallbackCharacter || selectedCharacter || undefined
      });
      
      // Clear regenerating state after completion
      setRegeneratingMessageId(null);
      
      // Handle the regeneration result
      if (result.success) {
        // Get current messages without the loading message
        const updatedMessages = getMessages(selectedConversationId).filter(
          msg => msg.id !== loadingMessageId
        );
        
        // Find the message to replace
        const insertIndex = updatedMessages.findIndex(msg => msg.id === messageId);
        
        if (insertIndex !== -1) {
          // Replace the old message with the regenerated one, maintaining the aiIndex
          updatedMessages[insertIndex] = {
            ...updatedMessages[insertIndex],
            text: result.text || 'No response generated',
            isLoading: false,
            // Store metadata including aiIndex for future regenerations
            metadata: {
              ...(updatedMessages[insertIndex].metadata || {}),
              aiIndex: messageIndex,
              regenerated: true,
              regenerationTime: Date.now()
            }
          };
        } else {
          // If we couldn't find the original message (unlikely), append the regenerated message
          updatedMessages.push({
            id: `regenerated-${Date.now()}`,
            text: result.text || 'No response generated',
            sender: 'bot',
            isLoading: false,
            timestamp: Date.now(),
            // Include metadata for future reference
            metadata: {
              aiIndex: messageIndex,
              regenerated: true,
              regenerationTime: Date.now()
            }
          });
        }
        
        // Clear messages and rebuild with updated ones
        await clearMessages(selectedConversationId);
        
        // Add the updated messages one by one
        for (const msg of updatedMessages) {
          await addMessage(selectedConversationId, msg);
        }
        
        // Update local state to reflect changes
        setMessages([...getMessages(selectedConversationId)]);
      } else {
        // In case of error, remove the loading indicator and add error message
        const currentMessagesAfterLoading = getMessages(selectedConversationId).filter(
          msg => msg.id !== loadingMessageId
        );
        
        // Add error message
        await addMessage(selectedConversationId, {
          id: `error-${Date.now()}`,
          text: '抱歉，无法重新生成回复。请稍后再试。',
          sender: 'bot',
          isLoading: false,
          timestamp: Date.now(),
          metadata: {
            error: result.error || 'Unknown error during regeneration',
            regenerationAttempt: true,
            isErrorMessage: true // Add explicit flag to identify error messages
          }
        });
        
        // Update local state
        setMessages([...getMessages(selectedConversationId)]);
      }
    } catch (error) {
      console.error('Error regenerating message:', error);
      
      // Clear regenerating state on error
      setRegeneratingMessageId(null);
      
      // Clean up loading indicator in case of error
      const updatedMessages = messages.filter(msg => !msg.isLoading);
      setMessages([...updatedMessages, {
        id: `error-${Date.now()}`,
        text: '发生错误，无法重新生成消息。',
        sender: 'bot',
        isLoading: false,
        timestamp: Date.now(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          regenerationAttempt: true,
          isErrorMessage: true // Add explicit flag to identify error messages
        }
      }]);
    }
  };

  // 监听 messagesMap 的变化, 只在切换会话时同步
  useEffect(() => {
    if (selectedConversationId) {
      // 添加一个调试日志，确认确实在更新消息
      const currentMessages = getMessages(selectedConversationId);
      console.log(`[Index] Updating messages for conversation ${selectedConversationId}: ${currentMessages.length} messages`);
      
      // 确保总是创建新的数组引用，强制触发依赖项变化
      setMessages([...currentMessages]);
    }
  }, [selectedConversationId, getMessages]);

  const handleSelectConversation = (id: string) => {
    // Check if this is a group ID
    if (id.startsWith('group-')) {
      setSelectedGroupId(id);
      setSelectedConversationId(null);
      setIsGroupMode(true);
    } else {
      setSelectedConversationId(id);
      setSelectedGroupId(null);
      setIsGroupMode(false);
    }
    
    setIsSidebarVisible(false);
    
    // Reset animated value when closing sidebar with the consistent animation timing
    Animated.timing(contentSlideAnim, {
      toValue: 0,
      duration: 300, // Updated to 300ms for consistency
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };


  const handleAvatarPress = () => {
    // If in preview mode, ask user if they want to exit before navigating
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You\'re currently previewing a saved chat. Navigating to character details will exit preview mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Continue', 
            onPress: () => {
              exitPreviewMode();
              router.push(`/pages/character-detail?id=${selectedConversationId}`);
            }
          }
        ]
      );
    } else {
      router.push(`/pages/character-detail?id=${selectedConversationId}`);
    }
  };

  const handleRateMessage = async (messageId: string, isUpvote: boolean) => {
    // Rating functionality removed as it's not implemented in the current version
    console.log('Message rating not implemented:', { messageId, isUpvote });
  };

  // Add keyboard listeners
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      () => {
        setKeyboardVisible(true);
        // Animate scale down smoothly
        Animated.timing(contentScaleAnim, {
          toValue: 0.96, // Slightly scale down
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      () => {
        setKeyboardVisible(false);
        // Animate scale back up smoothly
        Animated.timing(contentScaleAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, [contentScaleAnim]);

  // Pass keyboard state to tab layout
  useEffect(() => {
    if (Platform.OS === 'ios') {
      router.setParams({ hideTabBar: isKeyboardVisible ? 'true' : 'false' });
    }
  }, [isKeyboardVisible]);

  // 添加持久化状态
  useEffect(() => {
    const loadLastConversation = async () => {
      try {
        const lastId = await AsyncStorage.getItem('lastConversationId');
        if (lastId) {
          // 确保角色存在
          const characterExists = characters.some(char => char.id === lastId);
          if (characterExists) {
            setSelectedConversationId(lastId);
            // 更新消息列表
            const messagesForConversation = getMessages(lastId);
            setMessages(messagesForConversation);
          } else if (conversations.length > 0) {
            // 如果找不到上次的会话，使用第一个可用的会话
            setSelectedConversationId(conversations[0].id);
            const messagesForConversation = getMessages(conversations[0].id);
            setMessages(messagesForConversation);
          }
        }
      } catch (error) {
        console.error('Failed to load last conversation:', error);
      }
    };

    loadLastConversation();
  }, [conversations, characters]); // 添加 characters 作为依赖

  // 当选中的会话改变时更新消息
  useEffect(() => {
    if (selectedConversationId) {
      const currentMessages = getMessages(selectedConversationId);
      setMessages(currentMessages);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (characterId) {
      console.log('[Index] Character ID from params:', characterId);
      // Validate the character exists
      const characterExists = characters.some(char => char.id === characterId);
      console.log('[Index] Character exists in characters array:', characterExists);

      if (characterExists) {
        // Set the selected conversation ID
        setSelectedConversationId(characterId);
        console.log('[Index] Selected conversation set to:', characterId);

        // Load messages for this character
        const characterMessages = getMessages(characterId);
        console.log('[Index] Loaded messages count:', characterMessages.length);
        setMessages(characterMessages);

        // --- 新增：首次进入该角色会话且消息为空时，自动发送first_mes ---
        if (
          characterMessages.length === 0 &&
          !firstMessageSentRef.current[characterId]
        ) {
          // 新增：发送前再次检查界面messages是否为空
          if (messages.length > 0) {
            console.log(`[first_mes] [param effect] 当前界面已有消息，不发送first_mes到${characterId}`);
          } else {
            const char = characters.find(c => c.id === characterId);
            let firstMes = '';
            try {
              if (char?.jsonData) {
                const characterData = JSON.parse(char.jsonData);
                firstMes = characterData.roleCard?.first_mes || '';
              }
            } catch (e) {
              firstMes = '';
            }
            if (firstMes) {
              console.log(`[first_mes] [param effect] 发送first_mes到${characterId}:`, firstMes);
              addMessage(characterId, {
                id: `first-create-${Date.now()}`,
                text: firstMes,
                sender: 'bot',
                timestamp: Date.now()
              });
              firstMessageSentRef.current[characterId] = true;
            }
          }
        } else if (characterMessages.length > 0) {
          firstMessageSentRef.current[characterId] = true;
        }
      } else {
        console.warn('[Index] Character not found in characters array:', characterId);
      }

      setIsSidebarVisible(false); // Ensure sidebar is closed
    }
  }, [characterId, characters, getMessages]);

  // 监听 messages 变化，自动发送 first_mes（仅角色会话，且消息为空时）
  useEffect(() => {
    // 避免 handleResetConversation 后重复触发
    if (
      selectedConversationId &&
      !isGroupMode &&
      characterToUse &&
      messages.length === 0 &&
      !firstMesSentRef.current[selectedConversationId]
    ) {
      // 修正：此处messages.length === 0，但实际上setMessages是异步的，可能出现messages为空但实际getMessages(selectedConversationId)已有消息
      const actualMessages = getMessages(selectedConversationId);
      if (actualMessages && actualMessages.length > 0) {
        console.log(`[first_mes] [messages effect] getMessages(${selectedConversationId})已有${actualMessages.length}条消息，不发送first_mes`);
      } else {
        let firstMes = '';
        try {
          if (characterToUse.jsonData) {
            const characterData = JSON.parse(characterToUse.jsonData);
            firstMes = characterData.roleCard?.first_mes || '';
          }
        } catch (e) {
          firstMes = '';
        }
        if (firstMes) {
          console.log(`[first_mes] [messages effect] 发送first_mes到${selectedConversationId}:`, firstMes);
          addMessage(selectedConversationId, {
            id: `first-auto-${Date.now()}`,
            text: firstMes,
            sender: 'bot',
            timestamp: Date.now()
          });
          firstMesSentRef.current[selectedConversationId] = true;
        }
      }
    }
    // 如果消息不为空，标记已发送
    if (selectedConversationId && messages.length > 0) {
      firstMesSentRef.current[selectedConversationId] = true;
    }
    // 如果切换到新角色或清空消息，重置标记
    if (selectedConversationId && messages.length === 0) {
      // 只在未通过 reset 主动设置时重置
      // 若 reset 后已设置为 true，则不重置
      // 这里不需要特殊处理，reset 会主动设置为 true
    }
  }, [selectedConversationId, characterToUse, messages, isGroupMode, addMessage]);

  useEffect(() => {
    if (selectedConversationId) {
      console.log('[Index] Saving selectedConversationId to AsyncStorage:', selectedConversationId);
      AsyncStorage.setItem('lastConversationId', selectedConversationId)
        .catch(err => console.error('[Index] Failed to save lastConversationId:', err));
    }
  }, [selectedConversationId]);

  function getCharacterConversationId(selectedConversationId: string): string | undefined {
    // Since we're already using the character ID as the conversation ID throughout the app,
    // we can simply return the selectedConversationId if it exists
    return selectedConversationId || undefined;
  }

 // 获取角色的背景图片
const getBackgroundImage = () => {
  if (extraBgImage) {
    return { uri: extraBgImage };
  }
  if (
    characterToUse?.enableAutoExtraBackground &&
    characterToUse?.extrabackgroundimage
  ) {
    return { uri: characterToUse.extrabackgroundimage };
  }
  // 修正：兼容 localAsset 格式
  if (characterToUse?.backgroundImage) {
    if (
      typeof characterToUse.backgroundImage === 'object' &&
      characterToUse.backgroundImage.localAsset
    ) {
      return characterToUse.backgroundImage.localAsset;
    }
    if (typeof characterToUse.backgroundImage === 'string') {
      return { uri: characterToUse.backgroundImage };
    }
  }
  return require('@/assets/images/default-background.jpg');
};

  // 获取群聊背景图片（优先群聊自定义背景）
  const getGroupBackgroundImage = () => {
    if (selectedGroup) {
      // 优先使用本地state中的最新背景
      if (groupBackgrounds[selectedGroup.groupId]) {
        return { uri: groupBackgrounds[selectedGroup.groupId] };
      }
      if (selectedGroup.backgroundImage) {
        return { uri: selectedGroup.backgroundImage };
      }
    }
    return require('@/assets/images/group-chat-background.jpg');
  };

  // Update handleResetConversation to send first_mes after reset
  const handleResetConversation = async () => {
    if (selectedConversationId) {
      await clearMessages(selectedConversationId);
      // 清除 first_mes 已发送标记
      if (firstMessageSentRef.current[selectedConversationId]) {
        delete firstMessageSentRef.current[selectedConversationId];
      }
      // 立即设置 firstMesSentRef，防止 useEffect 再次自动触发
      firstMesSentRef.current[selectedConversationId] = true;
      setTimeout(() => {
        if (characterToUse?.jsonData) {
          // 新增：发送前再次检查界面messages是否为空
          if (messages.length > 0) {
            console.log(`[first_mes] [reset] 当前界面已有消息，不发送first_mes到${selectedConversationId}`);
          } else {
            try {
              const characterData = JSON.parse(characterToUse.jsonData);
              if (characterData.roleCard?.first_mes) {
                console.log(`[first_mes] [reset] 发送first_mes到${selectedConversationId}:`, characterData.roleCard.first_mes);
                addMessage(selectedConversationId, {
                  id: `first-reset-${Date.now()}`,
                  text: characterData.roleCard.first_mes,
                  sender: 'bot',
                  timestamp: Date.now()
                });
                // 已经设置为 true，无需再次设置
                lastMessageTimeRef.current = Date.now();
                setupAutoMessageTimer();
              }
            } catch (e) {
              console.error('Error adding first message after reset:', e);
            }
          }
        }
      }, 300);
    }
  };

  // Function to set up auto message timer with proper safeguards
  const setupAutoMessageTimer = useCallback(() => {
    // Clear any existing timer
    if (autoMessageTimerRef.current) {
      clearTimeout(autoMessageTimerRef.current);
      autoMessageTimerRef.current = null;
    }
    
    // If auto messaging is disabled, no character selected, or waiting for user reply, don't set up timer
    if (!autoMessageEnabled || !characterToUse?.id || waitingForUserReplyRef.current) {
      console.log(`[App] Auto message timer not set: enabled=${autoMessageEnabled}, hasCharacter=${!!characterToUse}, waitingForUserReply=${waitingForUserReplyRef.current}`);
      return;
    }

    // Check character-specific settings:
    // 1. autoMessage must be explicitly enabled
    if (characterToUse.autoMessage !== true) {
      console.log('[App] Auto message disabled for this character in settings');
      return;
    }

    // Use character-specific interval or default to 5 minutes
    const interval = characterToUse.autoMessageInterval || 5;
    autoMessageIntervalRef.current = interval;

    // Set up new timer
    const intervalMs = autoMessageIntervalRef.current * 60 * 1000; // Convert minutes to ms
    
    console.log(`[App] Auto message timer set for ${autoMessageIntervalRef.current} minutes`);
    
    autoMessageTimerRef.current = setTimeout(async () => {
      console.log('[App] Auto message timer triggered');
      
      // Only send auto message if we have a selected character and conversation
      if (characterToUse && selectedConversationId) {
        // Reset timer reference since it's been triggered
        autoMessageTimerRef.current = null;
        
        try {
          // Generate a truly unique message ID for this auto message
          // Using both timestamp and UUID components to ensure uniqueness
          const uniqueAutoMsgId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          console.log(`[App] Generating auto message with ID: ${uniqueAutoMsgId}`);
          
          // Call NodeST with special auto-message instruction - note we don't add a loading state message
          const result = await NodeSTManager.processChatMessage({
            userMessage: "[AUTO_MESSAGE] 用户已经一段时间没有回复了。请基于上下文和你的角色设定，主动发起一条合适的消息。这条消息应该自然，不要直接提及用户长时间未回复的事实。",
            status: "同一角色继续对话",
            conversationId: selectedConversationId,
            apiKey: user?.settings?.chat?.characterApiKey || '',
            apiSettings: {
              apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
              openrouter: user?.settings?.chat?.openrouter,
              useGeminiModelLoadBalancing: user?.settings?.chat.useGeminiModelLoadBalancing,
              useGeminiKeyRotation: user?.settings?.chat.useGeminiKeyRotation,
              additionalGeminiKeys: user?.settings?.chat.additionalGeminiKeys
            },
            character: characterToUse
          });
          
          // If successful, add the auto message response directly (no loading state)
          if (result.success && result.text) {
            // Calculate aiIndex before adding the message
            const aiMessageCount = messages.filter(m => m.sender === 'bot' && !m.isLoading).length;
            
            // Add the auto message as a bot message with a guaranteed unique ID
            await addMessage(selectedConversationId, {
              id: uniqueAutoMsgId,
              text: result.text,
              sender: 'bot',
              timestamp: Date.now(),
              // Add metadata to mark this as an auto message response with the correct aiIndex
              metadata: {
                isAutoMessageResponse: true,
                aiIndex: aiMessageCount,
                autoMessageCreatedAt: Date.now()
              }
            });
            
            // Update last message time
            lastMessageTimeRef.current = Date.now();
            
            // Set waitingForUserReply to true to prevent further auto-messages until user responds
            waitingForUserReplyRef.current = true;
            console.log('[App] Auto message sent, now waiting for user reply');
            
            // IMPORTANT: Only update notification badge if notificationEnabled is true
            if (characterToUse.notificationEnabled === true) {
              console.log('[App] Notifications enabled for this character, updating unread count');
              updateUnreadMessagesCount(1);
            } else {
              console.log('[App] Notifications disabled for this character, not showing badge');
            }
          } else {
            console.error('[App] Failed to generate auto message:', result.error);
          }
        } catch (error) {
          console.error('[App] Error generating auto message:', error);
        }
      }
    }, intervalMs);
    
    console.log(`[App] Auto message timer set for ${autoMessageIntervalRef.current} minutes`);
  }, [characterToUse, selectedConversationId, autoMessageEnabled, user?.settings, messages]);

  // Update handleAutoMessageSettings function to properly handle state changes
  useEffect(() => {
    // Initialize auto message interval from character settings if available
    if (characterToUse) {
      const newAutoMessageEnabled = characterToUse.autoMessage === true;
      
      // Only log and update if the setting has actually changed
      if (autoMessageEnabled !== newAutoMessageEnabled) {
        console.log(`[App] Auto message setting changed to: ${newAutoMessageEnabled}`);
        setAutoMessageEnabled(newAutoMessageEnabled);
      }
      
      // Get the interval directly from the character settings
      autoMessageIntervalRef.current = characterToUse.autoMessageInterval || 5;
      
      // Only reset the timer if auto messages are enabled
      if (newAutoMessageEnabled) {
        // Set up timer with a small delay to allow state updates to complete
        setTimeout(() => {
          setupAutoMessageTimer();
        }, 100);
      } else if (autoMessageTimerRef.current) {
        // Clean up existing timer if auto messages are now disabled
        clearTimeout(autoMessageTimerRef.current);
        autoMessageTimerRef.current = null;
        console.log('[App] Auto message timer cleared due to setting change');
      }
    }
    
    // Clean up timer on unmount or character change
    return () => {
      if (autoMessageTimerRef.current) {
        clearTimeout(autoMessageTimerRef.current);
        autoMessageTimerRef.current = null;
      }
    };
  }, [characterToUse, setupAutoMessageTimer]);

  // Add unread messages counter function
  const updateUnreadMessagesCount = (count: number) => {
    // Use AsyncStorage to persist unread message count
    AsyncStorage.setItem('unreadMessagesCount', String(count)).catch(err => 
      console.error('[App] Failed to save unread messages count:', err)
    );
    
    // Use EventRegister instead of window.dispatchEvent for React Native
    EventRegister.emit('unreadMessagesUpdated', count);
  };

  // Reset timer whenever a new message is sent
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // Update last message time
      lastMessageTimeRef.current = Date.now();
      
      // Set up new timer
      setupAutoMessageTimer();
    }
  }, [messages, setupAutoMessageTimer]);
  
  // Set up timer when character changes
  useEffect(() => {
    // Initialize auto message interval from character settings if available
    if (characterToUse) {
      // Use explicit boolean check for autoMessage setting
      setAutoMessageEnabled(characterToUse.autoMessage === true);
      
      // Get the interval directly from the character settings
      autoMessageIntervalRef.current = characterToUse.autoMessageInterval || 5;
      
      setupAutoMessageTimer();
    }
    
    // Clean up timer on unmount or character change
    return () => {
      if (autoMessageTimerRef.current) {
        clearTimeout(autoMessageTimerRef.current);
        autoMessageTimerRef.current = null;
      }
    };
  }, [characterToUse, setupAutoMessageTimer]);

  // Save scroll positions on app pause/background
  useEffect(() => {
    const saveScrollPositions = async () => {
      try {
        if (Object.keys(chatScrollPositions).length > 0) {
          await AsyncStorage.setItem('chatScrollPositions', JSON.stringify(chatScrollPositions));
        }
      } catch (error) {
        console.error('Failed to save scroll positions:', error);
      }
    };

    // 新增：App 进入后台时，强制处理所有记忆缓存，确保写入数据库
    const handleAppBackground = async () => {
      try {
        console.log('[App] AppState: 进入后台，开始处理所有记忆缓存...');
        await Mem0Service.getInstance().processAllCharacterMemories();
        console.log('[App] 所有记忆缓存已处理并写入数据库');
      } catch (error) {
        console.error('[App] 处理记忆缓存时出错:', error);
      }
    };

    // Add app state change listener
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        saveScrollPositions();
        // 新增：后台时处理记忆缓存
        handleAppBackground();
      }
    });
    
    // Load saved scroll positions on mount
    const loadScrollPositions = async () => {
      try {
        const savedPositions = await AsyncStorage.getItem('chatScrollPositions');
        if (savedPositions) {
          setChatScrollPositions(JSON.parse(savedPositions));
        }
      } catch (error) {
        console.error('Failed to load scroll positions:', error);
      }
    };
    
    loadScrollPositions();
    
    return () => {
      subscription.remove();
      saveScrollPositions();
    };
  }, [chatScrollPositions]);

  // Update ChatDialog props to include scroll position handling
  const handleScrollPositionChange = (characterId: string, position: number) => {
    // 记录之前的位置
    const previousPosition = chatScrollPositions[characterId];
    
    // 更新位置（只在变化超过一定阈值时更新，避免频繁更新）
    if (Math.abs((previousPosition || 0) - position) > 10) {
      setChatScrollPositions(prev => ({
        ...prev,
        [characterId]: position
      }));
      ;
    }
  };

  // Add function to toggle memory panel visibility
  const toggleMemoryPanel = () => {
    setIsMemoryPanelVisible(!isMemoryPanelVisible);
    if (!isMemoryPanelVisible) {
      // Fetch memory facts when opening the panel
      fetchMemoryFacts();
    }
  };

  // Add function to fetch memory facts
  const fetchMemoryFacts = async () => {
    if (!selectedConversationId) return;
    
    try {
      const userMessage = messages.length > 0 ? messages[messages.length - 1].text : "";
      
      // Use Mem0Service to search for relevant memories
      const mem0Service = Mem0Service.getInstance();
      const searchResults = await mem0Service.searchMemories(
        userMessage,
        characterToUse?.id || "",
        selectedConversationId,
        10
      );
      
      if (searchResults && searchResults.results) {
        setMemoryFacts(searchResults.results);
      }
    } catch (error) {
      console.error('Error fetching memory facts:', error);
    }
  };

  // Add function to process message memory
  const processMessageMemory = async (messageId: string, text: string, conversationId: string | null) => {
    if (!conversationId || !characterToUse?.id) return;
    
    try {
      const mem0Service = Mem0Service.getInstance();
      
      // Process memory through the Mem0Service
      await mem0Service.addChatMemory(
        text,
        'user',
        characterToUse.id,
        conversationId
      );
      
      // Update memory state to "saved"
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'saved'
      }));
      
      // Refresh memory facts if panel is open
      if (isMemoryPanelVisible) {
        fetchMemoryFacts();
      }
    } catch (error) {
      console.error('Error processing message memory:', error);
      
      // Update memory state to "failed"
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'failed'
      }));
    }
  };

  // Handler for TTS enhancer button click 
  const handleTtsEnhancerToggle = () => {
    setIsTtsEnhancerModalVisible(true);
  };

  // Add function to handle video playback status updates
  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsVideoReady(true);
      // Reset error state when video loads successfully
      if (videoError) setVideoError(null);
    } else {
      // Handle video loading error
      if (status.error) {
        console.error('Video playback error:', status.error);
        setVideoError(status.error);
      }
    }
  };

  // Reset video state when character changes
  useEffect(() => {
    setIsVideoReady(false);
    setVideoError(null);
  }, [characterToUse?.id]);

  const handleToggleGroupManage = () => {
    setIsGroupManageModalVisible(!isGroupManageModalVisible);
  };

  const selectedGroup: Group | null = selectedGroupId ? groups.find(g => g.groupId === selectedGroupId) || null : null;

  const toggleMemoOverlay = () => {
    setIsMemoSheetVisible(!isMemoSheetVisible);
  };

  const characterIdForMemo = selectedConversationId || '';
  const conversationIdForMemo = selectedConversationId ? `conversation-${selectedConversationId}` : '';

  // 新增：历史模态框状态
  const [isHistoryModalVisible, setHistoryModalVisible] = useState(false);

  // 新增：显示全部聊天历史
  const handleShowFullHistory = useCallback(() => {
    setHistoryModalVisible(true);
  }, []);

  // 新增：后处理触发函数
  const triggerExtraBackgroundGeneration = useCallback(async (character: Character, lastBotMessage: string) => {
    // 1. 检查开关和条件
    if (!character || !character.backgroundImage) {
      console.log('[后处理] 不触发：character/backgroundImage 不存在');
      return;
    }
    if (!character.enableAutoExtraBackground) {
      console.log('[后处理] 不触发：enableAutoExtraBackground 为 false');
      return;
    }
    // 只判断 backgroundImageConfig.isNovelAI
    if (!character.backgroundImageConfig?.isNovelAI) {
      console.log('[后处理] 不触发：backgroundImageConfig.isNovelAI 为 false');
      return;
    }

    // 2. 获取NovelAI参数（seed等）和提示词
    let novelaiConfig = character.backgroundImageConfig?.novelaiSettings || {};
    // --- 修正 seed 取值逻辑 ---
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

    // --- 合并默认正负面提示词 ---
    let positiveTags: string[] = [
      ...DEFAULT_POSITIVE_PROMPTS,
      ...(character.backgroundImageConfig?.positiveTags || [])
    ];
    let negativeTags: string[] = [
      ...DEFAULT_NEGATIVE_PROMPTS,
      ...(character.backgroundImageConfig?.negativeTags || [])
    ];

    let fixedTags: string[] = character.backgroundImageConfig?.fixedTags || [];
    let allPositiveTags = [
      ...(character.backgroundImageConfig?.genderTags || []),
      ...(character.backgroundImageConfig?.characterTags || []),
      ...(character.backgroundImageConfig?.qualityTags || []),
      ...(positiveTags || [])
    ];
    let artistTag = character.backgroundImageConfig?.artistPrompt || '';
    console.log('[后处理] 参数准备:', {
      seed, positiveTags, negativeTags, fixedTags, allPositiveTags, artistTag, novelaiConfig
    });

    // 3. 获取上下文（10条）
    let contextMessages: {role: string, content: string}[] = [];
    try {
      contextMessages = await StorageAdapter.exportConversation(character.id);
      contextMessages = contextMessages.slice(-10);
      console.log('[后处理] 获取到上下文:', contextMessages);
    } catch (e) {
      contextMessages = [];
      console.warn('[后处理] 获取上下文失败:', e);
    }

    // 4. AI生成场景描述
    let aiSceneDesc = '';
    try {
      
      // 检查 openai_compatible 是否启用
      const apiSettings = getApiSettings();    
      
      if (
        apiSettings.openrouter?.enabled &&
        apiSettings.openrouter.apiKey &&
        apiSettings.openrouter.model
      ) {
        // 使用 OpenRouterAdapter
        const openrouterAdapter = new OpenRouterAdapter(
          apiSettings.openrouter.apiKey,
          apiSettings.openrouter.model
        );
        const prompt = `请根据以下对话内容，用一句不超过15个英文单词的连贯语句，描述角色当前的表情、动作、场景（时间、地点、画面），不要描述外观、服饰。输出英文短句。对话内容：\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}`;
        aiSceneDesc = await openrouterAdapter.generateContent([
          { role: 'user', parts: [{ text: prompt }] }
        ]);
        aiSceneDesc = (aiSceneDesc || '').replace(/[\r\n]+/g, ' ').trim();
        console.log('[后处理] OpenRouterAdapter生成场景描述:', aiSceneDesc);
      } else if (apiSettings.OpenAIcompatible?.enabled && apiSettings.OpenAIcompatible.apiKey && apiSettings.OpenAIcompatible.endpoint && apiSettings.OpenAIcompatible.model) {
        // 动态导入 OpenAIAdapter
        const { OpenAIAdapter } = await import('@/NodeST/nodest/utils/openai-adapter');
        const openaiAdapter = new OpenAIAdapter({
          endpoint: apiSettings.OpenAIcompatible.endpoint,
          apiKey: apiSettings.OpenAIcompatible.apiKey,
          model: apiSettings.OpenAIcompatible.model,
        });
        const prompt = `请根据以下对话内容，用一句不超过15个英文单词的连贯语句，描述角色当前的表情、动作、场景（时间、地点、画面），不要描述外观、服饰。输出英文短句。对话内容：\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}`;
        aiSceneDesc = await openaiAdapter.generateContent([
          { role: 'user', parts: [{ text: prompt }] }
        ]);
        aiSceneDesc = (aiSceneDesc || '').replace(/[\r\n]+/g, ' ').trim();
        console.log('[后处理] OpenAICompatible生成场景描述:', aiSceneDesc);
      } else {
        // 原有GeminiAdapter逻辑
        const prompt = `请根据以下对话内容，用一句不超过15个英文单词的连贯语句，描述角色当前的表情、动作、场景（时间、地点、画面），不要描述外观、服饰。输出英文短句。对话内容：\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}`;
        console.log('[后处理] 发送GeminiAdapter prompt:', prompt);
        aiSceneDesc = await GeminiAdapter.executeDirectGenerateContent(prompt);
        aiSceneDesc = (aiSceneDesc || '').replace(/[\r\n]+/g, ' ').trim();
        console.log('[后处理] Gemini生成场景描述:', aiSceneDesc);
      }
    } catch (e) {
      aiSceneDesc = '';
      console.warn('[后处理] 场景描述生成失败:', e);
      // 新增：兜底，尝试用CloudServiceProvider
      try {
        const cloudResp = await (CloudServiceProvider.constructor as typeof CloudServiceProviderClass).generateChatCompletionStatic(
          [
            { role: 'user', content: `Based on the dialogue, describe the character's current expression, action, and setting (time, place, visuals) in one coherent sentence of no more than 20 words. Exclude appearance, clothing, and names. Use "he/she" to refer to the character. Output the sentence enclosed in curly braces: { }. Dialogue:\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}` }
          ],
          { max_tokens: 32, temperature: 0.7 }
        );
        if (cloudResp && cloudResp.ok) {
          const data = await cloudResp.json();
          if (data && data.choices && data.choices[0]?.message?.content) {
            aiSceneDesc = data.choices[0].message.content.replace(/[\r\n]+/g, ' ').trim();
            console.log('[后处理] CloudServiceProvider生成场景描述:', aiSceneDesc);
          }
        }
      } catch (cloudErr) {
        aiSceneDesc = '';
        console.warn('[后处理] CloudServiceProvider生成场景描述失败:', cloudErr);
      }
    }

    // 5. 替换normalTags
    let newNormalTags: string[] = [];
    if (fixedTags && fixedTags.length > 0) {
      newNormalTags = [...fixedTags];
      if (aiSceneDesc) newNormalTags.push(aiSceneDesc);
    } else if (aiSceneDesc) {
      newNormalTags = [aiSceneDesc];
    }
    console.log('[后处理] 处理后normalTags:', newNormalTags);

    // 6. 组装最终positiveTags
    let finalPositiveTags = [
      ...(character.backgroundImageConfig?.genderTags || []),
      ...(character.backgroundImageConfig?.characterTags || []),
      ...(character.backgroundImageConfig?.qualityTags || []),
      ...(artistTag ? [artistTag] : []),
      ...DEFAULT_POSITIVE_PROMPTS,
      ...newNormalTags
    ].filter(Boolean);

    // --- 负面提示词确保不为空 ---
    let finalNegativePrompt = [
      ...DEFAULT_NEGATIVE_PROMPTS,
      ...(character.backgroundImageConfig?.negativeTags || [])
    ].filter(Boolean).join(', ');

    // 7. NovelAI参数
    const novelaiToken = user?.settings?.chat?.novelai?.token || '';
    const sizePreset = character.backgroundImageConfig?.sizePreset || { width: 832, height: 1216 };
    const model = novelaiConfig.model || 'NAI Diffusion V4 Curated';
    const steps = novelaiConfig.steps || 28;
    const scale = novelaiConfig.scale || 5;
    const sampler = novelaiConfig.sampler || 'k_euler_ancestral';
    const noiseSchedule = novelaiConfig.noiseSchedule || 'karras';

    // 新增：构造 characterPrompts 参数（与 ImageRegenerationModal.tsx 保持一致）
    let characterPrompts: { prompt: string; positions: { x: number; y: number }[] }[] = [];
    if (character.backgroundImageConfig?.characterTags && character.backgroundImageConfig.characterTags.length > 0) {
      characterPrompts = [
        {
          prompt: character.backgroundImageConfig.characterTags.join(', '),
          positions: [{ x: 0, y: 0 }]
        }
      ];
    }

    // 新增：useCoords/useOrder 参数（与 ImageRegenerationModal.tsx 保持一致）
    const useCoords = typeof novelaiConfig.useCoords === 'boolean' ? novelaiConfig.useCoords : false;
    const useOrder = typeof novelaiConfig.useOrder === 'boolean' ? novelaiConfig.useOrder : true;

    console.log('[后处理] NovelAI请求参数:', {
      token: novelaiToken,
      prompt: finalPositiveTags.join(', '),
      negativePrompt: finalNegativePrompt,
      model, width: sizePreset.width, height: sizePreset.height,
      steps, scale, sampler, seed, noiseSchedule, characterPrompts, useCoords, useOrder
    });

    setIsExtraBgGenerating(true);
    setExtraBgError(null);
    setExtraBgImage(null);
    const myGenId = ++extraBgGenCounter.current;
    extraBgGenAbortRef.current.aborted = false;

    // 封装生成图片的逻辑，支持重试
    const generateNovelAIImage = async (): Promise<{ url?: string; error?: any }> => {
      try {
        const result = await NovelAIService.generateImage({
          token: novelaiToken,
          prompt: finalPositiveTags.join(', '),
          characterPrompts: characterPrompts.length > 0 ? characterPrompts : undefined,
          negativePrompt: finalNegativePrompt,
          model,
          width: sizePreset.width,
          height: sizePreset.height,
          steps,
          scale,
          sampler,
          seed,
          noiseSchedule,
          useCoords,
          useOrder
        });
        const url = result?.imageUrls?.[0];
        return { url };
      } catch (e: any) {
        return { error: e };
      }
    };

    // 支持429重试一次
    let retryCount = 0;
    let maxRetry = 1;
    let retryDelayMs = 8000;
    let lastError: any = null;
    let url: string | undefined = undefined;

    while (retryCount <= maxRetry) {
      const { url: genUrl, error } = await generateNovelAIImage();
      if (extraBgGenAbortRef.current.aborted || myGenId !== extraBgGenCounter.current) {
        console.log('[后处理] 生成被覆盖或中断，终止流程');
        return;
      }
      if (genUrl) {
        url = genUrl;
        break;
      }
      // 检查是否429错误
      if (error && error.message && typeof error.message === 'string' && error.message.includes('429')) {
        lastError = error;
        if (retryCount < maxRetry) {
          console.warn(`[后处理] NovelAI 429错误，${retryDelayMs / 1000}秒后自动重试...`);
          await new Promise(res => setTimeout(res, retryDelayMs));
          retryCount++;
          continue;
        } else {
          // 已重试一次，仍然失败
          break;
        }
      } else {
        // 其他错误，立即中止
        lastError = error;
        break;
      }
    }

    if (url) {
      setExtraBgImage(url);
      console.log('[后处理] setExtraBgImage:', url);
      // 更新角色的extrabackgroundimage属性
      await updateCharacterExtraBackgroundImage(character.id, url);
      console.log('[后处理] updateCharacterExtraBackgroundImage已调用:', character.id, url);
      // 自动切换背景
      if (characterToUse?.id === character.id) {
        setExtraBgImage(url);
        console.log('[后处理] 当前角色，触发setExtraBgImage:', url);
      }
      // 新增：将本次AI消息ID加入已处理集合，防止重复生成（持久化）
      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.sender === 'bot') {
          processedExtraBgMessageIds.current.add(lastMsg.id);
          // 持久化
          saveProcessedExtraBgMessageIds(character.id);
        }
      }
      setIsExtraBgGenerating(false);
      console.log('[后处理] 图片生成流程结束');
    } else {
      // 失败，显示错误
      setExtraBgError(lastError?.message || '生成失败');
      setIsExtraBgGenerating(false);
      console.error('[后处理] 图片生成异常:', lastError);
    }
  }, [user, characterToUse, updateCharacterExtraBackgroundImage, messages, saveProcessedExtraBgMessageIds]);
  
  // 聊天后处理主入口：监听messages变化
  useEffect(() => {
    console.log('messages updated:', messages.map(m => ({sender: m.sender, isLoading: m.isLoading, text: m.text})));
    if (!characterToUse) {
      console.log('[后处理] 不触发：characterToUse 不存在');
      return;
    }
    if (!characterToUse.enableAutoExtraBackground) {
      console.log('[后处理] 不触发：enableAutoExtraBackground 为 false');
      return;
    }
    // 新增：判断backgroundImageConfig?.isNovelAI 或 backgroundImage对象的isNovelAI
    const isNovelAI =
      characterToUse.backgroundImageConfig?.isNovelAI === true ||
      (typeof characterToUse.backgroundImage === 'object' &&
        characterToUse.backgroundImage !== null &&
        (characterToUse.backgroundImage as any).isNovelAI === true);
    if (!isNovelAI) {
      console.log('[后处理] 不触发：backgroundImageConfig.isNovelAI 为 false');
      return;
    }
    if (!characterToUse.backgroundImage) {
      console.log('[后处理] 不触发：backgroundImage 为空');
      return;
    }
    if (!messages || messages.length === 0) {
      console.log('[后处理] 不触发：messages 为空');
      return;
    }
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) {
      console.log('[后处理] 不触发：lastMsg 不存在');
      return;
    }
    if (lastMsg.sender !== 'bot') {
      console.log('[后处理] 不触发：最后一条消息 sender 不是 bot');
      return;
    }
    if (lastMsg.isLoading) {
      console.log('[后处理] 不触发：最后一条消息 isLoading 为 true');
      return;
    }
    if (lastMsg.metadata && lastMsg.metadata.isErrorMessage) {
      console.log('[后处理] 不触发：最后一条消息为 error message');
      return;
    }

    // 新增：检测该AI消息是否已生成过图片（持久化），若已生成则不再触发
    if (processedExtraBgMessageIds.current.has(lastMsg.id)) {
      // 已为该AI消息生成过图片，停止后处理
      return;
    }

    {
      console.log('触发后处理，最后一条AI消息:', lastMsg.text);
      triggerExtraBackgroundGeneration(characterToUse, lastMsg.text);
      // 覆盖生成
      extraBgGenAbortRef.current.aborted = true;
    }
  }, [messages, characterToUse, characterToUse?.enableAutoExtraBackground, triggerExtraBackgroundGeneration]);

  // --- 清理机制：当对话被重置或消息被清空时，清空已处理集合 ---
  useEffect(() => {
    if ((!messages || messages.length === 0) && characterToUse?.id) {
      processedExtraBgMessageIds.current.clear();
      saveProcessedExtraBgMessageIds(characterToUse.id);
    }
  }, [messages, characterToUse?.id, saveProcessedExtraBgMessageIds]);

  // 切换角色时加载集合
  useEffect(() => {
    if (characterToUse?.id) {
      loadProcessedExtraBgMessageIds(characterToUse.id);
    }
  }, [characterToUse?.id, loadProcessedExtraBgMessageIds]);

  // 4. 取消自动生成背景后，背景还原为backgroundImage，并清理extraBgImage缓存
  useEffect(() => {
    if (characterToUse && !characterToUse.enableAutoExtraBackground) {
      setExtraBgImage(null);
    }
  }, [characterToUse?.enableAutoExtraBackground]);

  // 5. 检查extraBgImage的缓存是否及时清理
  useEffect(() => {
    // 当切换角色、关闭自动生成、或extraBgImage对应的角色ID变化时清理
    if (
      !characterToUse ||
      !characterToUse.enableAutoExtraBackground ||
      (extraBgImage && characterToUse?.extrabackgroundimage !== extraBgImage)
    ) {
      setExtraBgImage(null);
    }
  }, [characterToUse, characterToUse?.enableAutoExtraBackground, characterToUse?.extrabackgroundimage]);

  // 新增：开启自动生成背景时自动触发后处理
  useEffect(() => {
    if (
      characterToUse &&
      characterToUse.enableAutoExtraBackground &&
      // 没有本地extraBgImage（防止重复生成）
      !extraBgImage
    ) {
      // 只在没有extrabackgroundimage或本地extraBgImage时触发
      // 但如果extrabackgroundimage为空，也应触发
      // 只要AI消息存在，触发一次
      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (
          lastMsg &&
          lastMsg.sender === 'bot' &&
          !lastMsg.isLoading &&
          !(lastMsg.metadata && lastMsg.metadata.isErrorMessage)
        ) {
          // 触发后处理
          triggerExtraBackgroundGeneration(characterToUse, lastMsg.text);
        }
      }
    }
    // eslint-disable-next-line
  }, [characterToUse?.enableAutoExtraBackground]);



  return (
    <View style={styles.outerContainer}>
      
      <StatusBar translucent backgroundColor="transparent" />
            {/* 新增：初始化加载蒙层 */}
            {isInitializing && (
        <View style={styles.initializingOverlay}>
          <ImageBackground 
            source={require('@/assets/images/default-background.jpg')}
            style={styles.initializingBackground}
            resizeMode="cover"
          >
            <View style={styles.initializingIndicatorContainer}>
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          </ImageBackground>
        </View>
      )}
             
      {/* <TouchableOpacity  //新增：测试按钮，重置初始化状态
        style={{
          position: 'absolute',
          top: 40,
          right: 20,
          zIndex: 999999,
          backgroundColor: '#fff',
          borderRadius: 8,
          paddingVertical: 6,
          paddingHorizontal: 14,
          elevation: 8,
        }}
        onPress={handleResetDefaultCharacterInit}
      >
        <Text style={{ color: '#333', fontWeight: 'bold' }}>重置默认角色初始化</Text>
      </TouchableOpacity> */}
            {/* <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: 32,
          right: 24,
          zIndex: 99999,
          backgroundColor: '#3498db',
          borderRadius: 28,
          width: 56,
          height: 56,
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 10,
        }}
        onPress={() => setIsTestMarkdownVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 22 }}>M↓</Text>
      </TouchableOpacity> */}
                {/* Markdown 测试按钮（右下角悬浮） */}
      {/* <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: 32,
          right: 24,
          zIndex: 99999,
          backgroundColor: '#3498db',
          borderRadius: 28,
          width: 56,
          height: 56,
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 10,
        }}
        onPress={() => setIsTestMarkdownVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 22 }}>M↓</Text>
      </TouchableOpacity>


      {isTestMarkdownVisible && (
        <View style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 99999,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 40,
        }}>
          <TestMarkdown
            onSendMessage={(text, sender) => {
              handleSendMessage(text, sender);
              setIsTestMarkdownVisible(false);
            }}
          />
          <TouchableOpacity
            style={{
              marginTop: 10,
              alignSelf: 'center',
              padding: 10,
              backgroundColor: '#444',
              borderRadius: 20,
            }}
            onPress={() => setIsTestMarkdownVisible(false)}
          >
            <Text style={{ color: '#fff', fontSize: 15 }}>关闭</Text>
          </TouchableOpacity>
          </View>
      )} */}

      
      <MemoryProvider config={memoryConfig}>
        <Mem0Initializer />
        

        <View style={styles.backgroundContainer}>
          {!isGroupMode && characterToUse?.dynamicPortraitEnabled && characterToUse?.dynamicPortraitVideo ? (
            // Render video background if enabled and video exists
            <>
              <Video
                ref={videoRef}
                source={{ uri: characterToUse.dynamicPortraitVideo }}
                style={styles.backgroundVideo}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay
                isMuted
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                onError={(error) => {
                  console.error('Video error:', error);
                  setVideoError(error?.toString() || 'Failed to load video');
                }}
                useNativeControls={false}
              />
              
              {/* Show loading indicator while video is loading */}
              {!isVideoReady && !videoError && (
                <View style={styles.videoLoadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.videoLoadingText}>加载动态立绘中...</Text>
                </View>
              )}
              
              {/* Show error message if video failed to load */}
              {videoError && (
                <View style={styles.videoErrorContainer}>
                  <ImageBackground
                    source={characterToUse.backgroundImage 
                      ? { uri: characterToUse.backgroundImage } 
                      : require('@/assets/images/default-background.jpg')}
                    style={styles.backgroundImage}
                    resizeMode="cover"
                  />
                  <View style={styles.videoErrorOverlay}>
                    <Text style={styles.videoErrorText}>
                      无法加载动态立绘视频，已显示静态背景
                    </Text>
                  </View>
                </View>
              )}
            </>
          ) : (
          // 修正：群聊模式下优先显示群聊自定义背景
          <ImageBackground
            source={isGroupMode 
              ? getGroupBackgroundImage()
              : (characterToUse ? getBackgroundImage() : require('@/assets/images/default-background.jpg'))}
            style={styles.backgroundImage}
            resizeMode="cover"
          >
            <View style={{flex: 1}} />
          </ImageBackground>
          )}
        </View>

        {/* 新增：右上角图片生成中indicator */}
        {isExtraBgGenerating && (
          <View style={{
            position: 'absolute',
            top: 90, // 与TopBarWithBackground下沿对齐（原top: 40）
            right: 30,
            zIndex: 999999,
            borderRadius: 20,
            paddingVertical: 8,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            elevation: 8,
          }}>
            <ActivityIndicator size="small" color="rgb(255, 224, 195)" />
          </View>
        )}
        
        {/* Sidebar is positioned absolutely at the root level */}
        {user && (
          <Sidebar
            isVisible={isSidebarVisible}
            conversations={characters}
            selectedConversationId={isGroupMode ? selectedGroupId : selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onClose={toggleSidebar}
            animationValue={contentSlideAnim}
            currentUser={user}
            disbandedGroups={disbandedGroups} // Pass disbanded groups to Sidebar
          />
        )}

      {/* 新增：群聊设置侧边栏 */}
      {isGroupMode && (
        <GroupSettingsSidebar
          isVisible={groupSettingsSidebarVisible}
          onClose={toggleGroupSettingsSidebar}
          animationValue={groupSettingsSidebarAnim}
          selectedGroup={selectedGroup}
          currentUser={user}
          onGroupBackgroundChanged={handleGroupBackgroundChanged} // 新增
        />
      )}

        {/* Everything else (content + topbar) gets animated together */}
        <Animated.View 
          style={[
            styles.contentMainContainer,
            {
              transform: [
                { 
                  translateX: Animated.add(
                    contentSlideAnim,
                    Animated.multiply(settingsSlideAnim, -1),
                  ),
                },
                // 新增：群聊设置侧边栏动画（左移）
                { 
                  translateX: Animated.multiply(groupSettingsSidebarAnim, -1)
                },
                { scale: contentScaleAnim }
              ],
              width: '100%',
            }
          ]}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidView}
          >
            <View style={[
              styles.container,
              (characterToUse || isGroupMode) ? styles.transparentBackground : styles.darkBackground
            ]}>
              <TopBarWithBackground
                selectedCharacter={!isGroupMode ? characterToUse : null}
                selectedGroup={isGroupMode ? selectedGroup : null}
                onAvatarPress={isGroupMode ? handleToggleGroupManage : handleAvatarPress}
                onMemoPress={() => setIsMemoSheetVisible(true)}
                onSettingsPress={toggleSettingsSidebar}
                onMenuPress={toggleSidebar}
                onSaveManagerPress={isGroupMode ? undefined : toggleSaveManager}
                showBackground={false}
                isGroupMode={isGroupMode}
                currentUser={user}
                onGroupDisbanded={handleGroupDisbanded}
                isEmpty={!isGroupMode && (!characterToUse || messages.length === 0)}
                // 新增：群聊设置按钮事件
                onGroupSettingsPress={toggleGroupSettingsSidebar}
              />

              <SafeAreaView style={[
                styles.safeArea,
                (characterToUse || isGroupMode) && styles.transparentBackground,
                mode === 'background-focus' && styles.backgroundFocusSafeArea
              ]}>
                {/* 错误提示条，仅临时显示，不进入消息流 */}
                {transientError && (
                  <View style={{
                    position: 'absolute',
                    top: 10,
                    left: 0,
                    right: 0,
                    zIndex: 999,
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }}>
                    <View style={{
                      backgroundColor: 'rgba(220,53,69,0.95)',
                      paddingVertical: 8,
                      paddingHorizontal: 24,
                      borderRadius: 20,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: 6,
                    }}>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>{transientError}</Text>
                    </View>
                  </View>
                )}

                {/* Preview Mode Banner (only show in character chat mode) */}
                {isPreviewMode && previewBannerVisible && !isGroupMode && (
                  <View style={styles.previewBanner}>
                    <Text style={styles.previewBannerText}>
                      You are previewing a saved chat state
                    </Text>
                    <View style={styles.previewBannerButtons}>
                      <TouchableOpacity 
                        style={styles.previewBannerButton}
                        onPress={exitPreviewMode}
                      >
                        <Text style={styles.previewBannerButtonText}>Exit Preview</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[styles.previewBannerButton, styles.restoreButton]}
                        onPress={() => currentPreviewSave && handleLoadSave(currentPreviewSave)}
                      >
                        <Text style={styles.previewBannerButtonText}>Restore This State</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                
                <View style={[
                  styles.contentContainer,
                  (characterToUse || isGroupMode) && styles.transparentBackground,
                  mode === 'background-focus' && !isGroupMode && styles.backgroundFocusContentContainer
                ]}>
                  {/* Conditionally render either GroupDialog or ChatDialog */}
                  {isGroupMode ? (
                    <GroupDialog
                      style={styles.chatDialog}
                      groupId={selectedGroupId || ''}
                      messages={groupMessages}
                      onScrollPositionChange={(groupId, position) => {
                        // Handle group chat scroll position
                        setChatScrollPositions(prev => ({
                          ...prev,
                          [`group-${groupId}`]: position
                        }));
                      }}
                      currentUser={user || { id: '', name: 'User' }}
                      groupMembers={groupMembers}
                      isGroupDisbanded={disbandedGroups.includes(selectedGroupId || '')} // Pass disbanded status
                    />
                  ) : (
                    <ChatDialog
                      messages={messages}
                      style={StyleSheet.flatten([styles.chatDialog])}
                      selectedCharacter={characterToUse}
                      onRateMessage={handleRateMessage}
                      onRegenerateMessage={handleRegenerateMessage}
                      savedScrollPosition={characterToUse?.id ? chatScrollPositions[characterToUse.id] : undefined}
                      onScrollPositionChange={handleScrollPositionChange}
                      messageMemoryState={messageMemoryState}
                      regeneratingMessageId={regeneratingMessageId}
                      user={user}
                      isHistoryModalVisible={isHistoryModalVisible}
                      setHistoryModalVisible={setHistoryModalVisible}
                      onShowFullHistory={handleShowFullHistory}
                    />
                  )}
                </View>

                {/* Adjust input bar position for different modes */}
                <View style={[
                  styles.inputBar,
                  (characterToUse || isGroupMode) && styles.transparentBackground,
                  mode === 'background-focus' && !isGroupMode && styles.backgroundFocusInputBar
                ]}>
                  {/* Conditionally render either ChatInput or GroupInput */}
                  {isGroupMode ? (
                    <GroupInput
                      onSendMessage={handleSendGroupMessage}
                      groupId={selectedGroupId || ''}
                      currentUser={user || { id: '', name: 'User' }}
                      groupMembers={groupMembers}
                    />
                  ) : (
                    characterToUse && (
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        selectedConversationId={selectedConversationId}
                        conversationId={selectedConversationId ? getCharacterConversationId(selectedConversationId) ?? '' : ''}
                        onResetConversation={handleResetConversation}
                        selectedCharacter={characterToUse}
                        // Pass search and TTS functionality to ChatInput
                        braveSearchEnabled={braveSearchEnabled}
                        toggleBraveSearch={toggleBraveSearch}
                        isTtsEnhancerEnabled={isTtsEnhancerEnabled}
                        onTtsEnhancerToggle={handleTtsEnhancerToggle}
                        onShowNovelAI={() => setIsNovelAITestVisible(true)}
                        onShowVNDB={() => setIsVNDBTestVisible(true)}
                        onShowMemoryPanel={toggleMemoryPanel}
                        onShowFullHistory={handleShowFullHistory}
                      />
                    )
                  )}
                </View>

                {/* Sidebars and overlays */}
              </SafeAreaView>

              {/* Group Management Modal */}
              {isGroupManageModalVisible && selectedGroup && (
                <GroupManagementModal
                  visible={isGroupManageModalVisible}
                  onClose={() => setIsGroupManageModalVisible(false)}
                  group={selectedGroup}
                  groupMembers={groupMembers}
                  allCharacters={characters}
                  currentUser={user || { id: '', name: 'User' }}
                  onGroupUpdated={() => {
                    // Reload groups after update
                    loadUserGroups();
                    // Reload current group messages
                    if (selectedGroupId) {
                      loadGroupMessages(selectedGroupId);
                    }
                  }}
                />
              )}

              {/* 直接在主视图中渲染 MemoOverlay */}
              <MemoOverlay
                isVisible={isMemoSheetVisible}
                onClose={toggleMemoOverlay}
                characterId={characterIdForMemo}
                conversationId={conversationIdForMemo}
                customUserName={characterToUse?.customUserName} // 新增传递
              />            
              
              {/* Save Manager */}
              {characterToUse && (
                <SaveManager
                  visible={isSaveManagerVisible}
                  onClose={() => setIsSaveManagerVisible(false)}
                  conversationId={selectedConversationId || ''}
                  characterId={characterToUse.id}
                  characterName={characterToUse.name}
                  characterAvatar={characterToUse.avatar || undefined}
                  messages={messages}
                  onSaveCreated={handleSaveCreated}
                  onLoadSave={handleLoadSave}
                  onPreviewSave={handlePreviewSave}
                />
              )}
              
              {/* TTS Enhancer Modal - same level as other modals */}
              <TTSEnhancerModal
                visible={isTtsEnhancerModalVisible}
                onClose={() => setIsTtsEnhancerModalVisible(false)}
              />
            </View>
          </KeyboardAvoidingView>
        </Animated.View>

        {/* SettingsSidebar 绝对定位并放在所有内容之后，确保在最顶层 */}
        {characterToUse && (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 99999, // 确保在最顶层
            }}
          >
            <SettingsSidebar
              isVisible={isSettingsSidebarVisible}
              onClose={toggleSettingsSidebar}
              selectedCharacter={characterToUse}
              animationValue={settingsSlideAnim}
            />
          </View>
        )}
      </MemoryProvider>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#181818', // Add a dark background to prevent white flash
  },
  // New styles for fixed background
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    backgroundColor: '#181818', // Add a dark background here as well
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  // Add new styles for video background
  backgroundVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoLoadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoLoadingText: {
    color: '#ffffff',
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  videoErrorContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  videoErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 50,
  },
  videoErrorText: {
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 5,
    fontSize: 14,
  },
  contentMainContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10, // Lower than sidebar's z-index
  },
  container: {
    flex: 1,
    position: 'relative',
  },
  darkBackground: {
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
  },
  safeArea: {
    flex: 1,
    marginTop: 90,
    color: 'rgba(26, 26, 26, 0.8)',
  },
  contentContainer: {
    flex: 1,
    padding: 10,
    position: 'relative',
  },
  chatDialog: {
    flex: 1,
  },
  inputBar: {
    padding: 10,
    backgroundColor: 'transparent',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 900,
  },
  transparentBackground: {
    backgroundColor: 'transparent',
  },
  previewBanner: {
    backgroundColor: 'rgba(52, 152, 219, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  previewBannerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  previewBannerButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  previewBannerButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    marginHorizontal: 8,
  },
  previewBannerButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  restoreButton: {
    backgroundColor: 'rgba(46, 204, 113, 0.4)',
  },
  keyboardAvoidView: {
    flex: 1,
  },
  inputBarContainer: {
    width: '100%',
  },
  // Add styles for visual novel mode
  visualNovelContentContainer: {
    flex: 1,

    paddingBottom: 200, // Add extra space for visual novel dialog
  },
  visualNovelInputBar: {
    paddingBottom: 180, // Add extra padding to position above visual novel dialog
  },
  // Adjust styles for background focus mode to show top half
  backgroundFocusSafeArea: {
    // Keep the normal safeArea settings, no special adjustments needed
  },
  backgroundFocusContentContainer: {
    flex: 1, // Take only the top half of the screen
    padding: 10,
  },
  backgroundFocusInputBar: {
    padding: 10,
    backgroundColor: `transparent`,
  },
  initializingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000, // 确保在最上层
  },
  initializingBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initializingIndicatorContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    padding: 24,
  },
  
});

export default App;

