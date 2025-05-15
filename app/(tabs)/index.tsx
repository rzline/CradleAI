import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
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
  Easing,
  Dimensions
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import ChatDialog from '@/components/ChatDialog';
import ChatInput from '@/components/ChatInput';
import Sidebar from '@/components/Sidebar';
import SettingsSidebar from '@/components/SettingsSidebar';
import MemoOverlay from '@/components/MemoOverlay'; 
import SaveManager from '@/components/SaveManager';
import TTSEnhancerModal from '@/components/TTSEnhancerModal';
import GroupDialog from '@/components/GroupDialog';
import GroupInput from '@/components/GroupInput';
import GroupManagementModal from '@/components/GroupManagementModal';
import GroupSettingsSidebar from '@/components/GroupSettingsSidebar';
import { Group, GroupMessage, getUserGroups, getGroupMessages, sendGroupMessage } from '@/src/group';
import { Message, Character, ChatSave } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TopBarWithBackground from '@/components/TopBarWithBackground';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { EventRegister } from 'react-native-event-listeners';
import { MemoryProvider } from '@/src/memory/providers/MemoryProvider';
import Mem0Initializer from '@/src/memory/components/Mem0Initializer';
import '@/src/memory/utils/polyfills';
import Mem0Service from '@/src/memory/services/Mem0Service';
import { ttsService } from '@/services/ttsService';
import { useDialogMode } from '@/constants/DialogModeContext';
import { CharacterLoader } from '@/src/utils/character-loader';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS } from '@/constants/defaultPrompts';
import NovelAIService from '@/components/NovelAIService';
import { CloudServiceProvider } from '@/services/cloud-service-provider';
import type CloudServiceProviderClass from '@/services/cloud-service-provider';
import * as FileSystem from 'expo-file-system';
import { importDefaultCharactersIfNeeded, resetDefaultCharacterImported } from '@/components/DefaultCharacterImporter';
import { loadGlobalSettingsState } from '@/app/pages/global-settings';
import { getApiSettings } from '@/utils/settings-helper';
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';
import { isTableMemoryEnabled, setTableMemoryEnabled } from '@/src/memory/integration/table-memory-integration';
import { getWebViewExampleHtml } from '@/utils/webViewExample';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostChatService from '@/services/PostChat-service';
// Lazy load non-critical components to improve initial load time
const NovelAITestModal = lazy(() => import('@/components/NovelAITestModal'));

// Global cache objects
declare global {
  interface Window { __globalSettingsCache?: any }
}

if (typeof window !== 'undefined' && !window.__globalSettingsCache) {
  window.__globalSettingsCache = {};
}

// Character view mode cache
export let characterViewModeCache: string | null = null;

// Memory configuration type
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

// Create a stable memory configuration function
interface CreateConfigFunction {
  (user: any): MemoryConfig;
  config?: MemoryConfig;
}

const createStableMemoryConfig: CreateConfigFunction = (user: any): MemoryConfig => {
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

// Helper functions for performance optimization

const App = () => {
  const insets = useSafeAreaInsets();
  // References to avoid re-creating functions on each render
  const asyncStorageOperations = useRef<Set<Promise<any>>>(new Set());
  
  // Router and params
  const router = useRouter();
  const params = useLocalSearchParams();
  const characterId = params.characterId as string;
  const { user } = useUser();
// 新增：用于标记是否已尝试恢复 lastConversationId，避免重复恢复
const [hasRestoredLastConversation, setHasRestoredLastConversation] = useState(false);
  // Animation refs (created once, persist between renders)
  const contentSlideAnim = useRef(new Animated.Value(0)).current;
  const settingsSlideAnim = useRef(new Animated.Value(0)).current;
  const contentScaleAnim = useRef(new Animated.Value(1)).current;
  const groupSettingsSidebarAnim = useRef(new Animated.Value(0)).current;
  
  // Constants used throughout the component
  const SIDEBAR_WIDTH = 280;
  const EXTRA_BG_IDS_KEY_PREFIX = 'extraBgProcessedIds-';

  // Create a stable memory configuration
  const memoryConfig = useMemo(() => createStableMemoryConfig(user), [user]);

  // Character context
  const {
    conversations,
    characters,
    getMessages,
    addMessage,
    clearMessages,
    updateCharacterExtraBackgroundImage,
    isLoading: charactersLoading,
    setCharacters,
    addCharacter,
    addConversation,
    removeMessage,
  } = useCharacters();

  // UI state - core functionality
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [fallbackCharacter, setFallbackCharacter] = useState<Character | null>(null);
  const [isWebViewTestVisible, setIsWebViewTestVisible] = useState(false);
  const [defaultCharacterNavigated, setDefaultCharacterNavigated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const { mode, setMode } = useDialogMode();

  // Group chat state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const [isGroupManageModalVisible, setIsGroupManageModalVisible] = useState(false);
  const [disbandedGroups, setDisbandedGroups] = useState<string[]>([]);
  const [groupBackgrounds, setGroupBackgrounds] = useState<Record<string, string | undefined>>({});

  // UI state - sidebar and modals
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSettingsSidebarVisible, setIsSettingsSidebarVisible] = useState(false);
  const [isMemoSheetVisible, setIsMemoSheetVisible] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [isNovelAITestVisible, setIsNovelAITestVisible] = useState(false);
  const [isVNDBTestVisible, setIsVNDBTestVisible] = useState(false);
  const [groupSettingsSidebarVisible, setGroupSettingsSidebarVisible] = useState(false);
  const [isHistoryModalVisible, setHistoryModalVisible] = useState(false);

  // Save/Load system states
  const [isSaveManagerVisible, setIsSaveManagerVisible] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<Message[] | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [currentPreviewSave, setCurrentPreviewSave] = useState<ChatSave | null>(null);
  const [previewBannerVisible, setPreviewBannerVisible] = useState(false);

  // Message processing state
  const [processedImageUrls, setProcessedImageUrls] = useState<Set<string>>(new Set());
  const processingTaskIds = useRef<Set<string>>(new Set());
  const firstMessageSentRef = useRef<Record<string, boolean>>({});
  const firstMesSentRef = useRef<Record<string, boolean>>({});
  
  // Auto-message feature state
  const [autoMessageEnabled, setAutoMessageEnabled] = useState(true);
  const autoMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoMessageIntervalRef = useRef<number>(5);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const waitingForUserReplyRef = useRef<boolean>(false);

  // Chat scroll positions with improved handling
  const [chatScrollPositions, setChatScrollPositions] = useState<Record<string, number>>({});
  const scrollPositionUpdateTimeoutRef = useRef<any>(null);

  // Memory management state
  const [memoryFacts, setMemoryFacts] = useState<any[]>([]);
  const [isMemoryPanelVisible, setIsMemoryPanelVisible] = useState(false);
  const [messageMemoryState, setMessageMemoryState] = useState<Record<string, string>>({});

  // Search and TTS state
  const [braveSearchEnabled, setBraveSearchEnabled] = useState<boolean>(false);
  const [isTtsEnhancerEnabled, setIsTtsEnhancerEnabled] = useState(false);
  const [isTtsEnhancerModalVisible, setIsTtsEnhancerModalVisible] = useState(false);

  // Video player state
  const videoRef = useRef<Video | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Message state
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);

  // Background image processing state
  const [extraBgStates, setExtraBgStates] = useState<Record<string, {
    isGenerating: boolean;
    taskId: string | null;
    error: string | null;
    image: string | null;
  }>>({});

  // UI visibility state
  const [isTopBarVisible, setIsTopBarVisible] = useState(true);
  const [isTestMarkdownVisible, setIsTestMarkdownVisible] = useState(false);

  // Calculate selected character information with memoization
  const selectedCharacter: Character | undefined | null = useMemo(() => 
    selectedConversationId ? characters.find((char: Character) => char.id === selectedConversationId) : null,
  [selectedConversationId, characters]);
  
  const characterToUse = useMemo(() => fallbackCharacter || selectedCharacter, 
    [fallbackCharacter, selectedCharacter]);

  // Selected group with memoization
  const selectedGroup: Group | null = useMemo(() => 
    selectedGroupId ? groups.find(g => g.groupId === selectedGroupId) || null : null,
  [selectedGroupId, groups]);

  // Filtered messages - remove "continue" user messages
  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (msg.sender === 'user' && msg.metadata && msg.metadata.isContinue === true) {
        return false;
      }
      return true;
    });
  }, [messages]);

  // Character ID for memo overlay
  const characterIdForMemo = useMemo(() => selectedConversationId || '', [selectedConversationId]);
  const conversationIdForMemo = useMemo(() => 
    selectedConversationId ? `conversation-${selectedConversationId}` : '',
  [selectedConversationId]);

  // Load user groups
  const loadUserGroups = useCallback(async () => {
    if (!user) return;
    
    try {
      const userGroups = await getUserGroups(user);
      const filteredGroups = userGroups.filter(group => !disbandedGroups.includes(group.groupId));
      setGroups(filteredGroups);
      console.log(`[Index] Loaded ${filteredGroups.length} groups (filtered from ${userGroups.length})`);
    } catch (error) {
      console.error('Failed to load user groups:', error);
    }
  }, [user, disbandedGroups]);

  // Load group messages
  const loadGroupMessages = useCallback(async (groupId: string) => {
    if (!groupId) return;

    try {
      const messages = await getGroupMessages(groupId);
      setGroupMessages(messages);
    } catch (error) {
      console.error('Failed to load group messages:', error);
    }
  }, []);

  // Handle group disbanded
  const handleGroupDisbanded = useCallback((groupId: string) => {
    console.log(`[Index] Group disbanded: ${groupId}`);
    
    setDisbandedGroups(prev => [...prev, groupId]);
    
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setGroupMessages([]);
      setIsGroupMode(false);
      
      if (selectedConversationId) {
        console.log(`[Index] Switching back to character conversation: ${selectedConversationId}`);
      } else if (conversations.length > 0) {
        setSelectedConversationId(conversations[0].id);
        console.log(`[Index] Switching to first available character: ${conversations[0].id}`);
      }    
    }
    
    loadUserGroups();
  }, [selectedGroupId, selectedConversationId, conversations, loadUserGroups]);

  // Handle group background changed
  const handleGroupBackgroundChanged = useCallback((groupId: string, newBackground: string | undefined) => {
    setGroupBackgrounds(prev => ({
      ...prev,
      [groupId]: newBackground,
    }));
    
    setGroups(prevGroups =>
      prevGroups.map(g =>
        g.groupId === groupId ? { ...g, backgroundImage: newBackground } : g
      )
    );
  }, []);

  // Toggle sidebars with optimized animations
  const toggleSettingsSidebar = useCallback(() => {
    const newIsVisible = !isSettingsSidebarVisible;
    setIsSettingsSidebarVisible(newIsVisible);
    
    Animated.timing(settingsSlideAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isSettingsSidebarVisible, settingsSlideAnim, SIDEBAR_WIDTH]);

  const toggleSidebar = useCallback(() => {
    const newIsVisible = !isSidebarVisible;
    setIsSidebarVisible(newIsVisible);
    
    Animated.timing(contentSlideAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isSidebarVisible, contentSlideAnim, SIDEBAR_WIDTH]);

  const toggleGroupSettingsSidebar = useCallback(() => {
    const newIsVisible = !groupSettingsSidebarVisible;
    setGroupSettingsSidebarVisible(newIsVisible);
    
    Animated.timing(groupSettingsSidebarAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [groupSettingsSidebarVisible, groupSettingsSidebarAnim, SIDEBAR_WIDTH]);

  // Toggle save manager with preview mode handling
  const toggleSaveManager = useCallback(() => {
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You are currently previewing a saved chat. Do you want to exit preview mode?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Exit Preview', 
            onPress: () => {
              // Using the function form to avoid stale closures
              (async () => {
                await exitPreviewMode();
                setIsSaveManagerVisible(prev => !prev);
              })();
            }
          }
        ]
      );
    } else {
      setIsSaveManagerVisible(prev => !prev);
    }
  }, [isPreviewMode]);

  // Preview save functionality
  const handlePreviewSave = useCallback((save: ChatSave) => {
    if (!isPreviewMode) {
      setPreviewMessages(messages);
    }
    
    setIsPreviewMode(true);
    setCurrentPreviewSave(save);
    setMessages(save.messages);
    setIsSaveManagerVisible(false);
    
    setPreviewBannerVisible(true);
    
    setTimeout(() => {
      setPreviewBannerVisible(false);
    }, 5000);
  }, [messages, isPreviewMode]);

  // Exit preview mode
  const exitPreviewMode = useCallback(async () => {
    if (isPreviewMode && previewMessages) {
      setMessages(previewMessages);
      setIsPreviewMode(false);
      setCurrentPreviewSave(null);
      setPreviewMessages(null);
      setPreviewBannerVisible(false);
    }
  }, [isPreviewMode, previewMessages]);

  // Load save
  const handleLoadSave = useCallback(async (save: ChatSave) => {
    if (!selectedConversationId) return;
    
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
    
    try {
      await clearMessages(selectedConversationId);
      
      // Batch adding messages for better performance
      const messagePromises = save.messages.map(msg => addMessage(selectedConversationId, msg));
      await Promise.all(messagePromises);
      
      setMessages(save.messages);
      setIsSaveManagerVisible(false);
      setIsPreviewMode(false);
      setPreviewMessages(null);
      setCurrentPreviewSave(null);
      
      Alert.alert('Success', 'Chat restored successfully to saved point!');
    } catch (error) {
      console.error('Error restoring chat:', error);
      Alert.alert('Error', 'Failed to restore chat state.');
      
      exitPreviewMode();
    }
  }, [selectedConversationId, clearMessages, addMessage, exitPreviewMode]);

  // Send message with optimized handling
  const sendMessageInternal = useCallback(async (newMessage: string, sender: 'user' | 'bot', isLoading = false) => {
    if (!selectedConversationId) {
      console.warn('No conversation selected.');
      return null;
    }

    const isErrorMessage = newMessage.includes("抱歉，处理消息时出现了错误") || 
                           newMessage.includes("抱歉，无法重新生成回复") ||
                           newMessage.includes("发生错误，无法重新生成") ||
                           newMessage.includes("处理图片时出现了错误") ||
                           newMessage.includes("生成图片时出现了错误") ||
                           newMessage.includes("编辑图片时出现了错误") ||
                           newMessage.includes("发送消息时出现了错误");

    if (isErrorMessage) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      // 移除最后一个AI loading消息和其对应的user消息（UI和context）
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          // 移除该AI消息
          msgs.splice(lastAiIdx.i, 1);
          // 移除其前面的最后一个user消息
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          // 移除context中的消息
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      return null;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    let metadata = undefined;
    if (sender === 'bot' && !isLoading) {
      const isErrorMessage = newMessage.includes("抱歉，处理消息时出现了错误") || 
                             newMessage.includes("抱歉，无法重新生成回复") ||
                             newMessage.includes("发生错误，无法重新生成") ||
                             newMessage.includes("处理图片时出现了错误") ||
                             newMessage.includes("生成图片时出现了错误") ||
                             newMessage.includes("编辑图片时出现了错误") ||
                             newMessage.includes("发送消息时出现了错误");

      if (!isErrorMessage) {
        const existingBotMessages = messages.filter(m => 
          m.sender === 'bot' && 
          !m.isLoading && 
          !m.metadata?.isErrorMessage && 
          !m.metadata?.error
        );
        const aiIndex = existingBotMessages.length;
        
        metadata = { aiIndex };
      } else {
        metadata = { isErrorMessage: true };
      }
    }

    const newMessageObj: Message = {
      id: messageId,
      text: newMessage,
      sender: sender,
      isLoading: isLoading,
      timestamp: Date.now(),
      metadata
    };

    try {
      await addMessage(selectedConversationId, newMessageObj);
    } catch (err) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          msgs.splice(lastAiIdx.i, 1);
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      return null;
    }
    return messageId;
  }, [selectedConversationId, messages, addMessage, removeMessage]);

  const handleSendMessage = useCallback(async (newMessage: string, sender: 'user' | 'bot', isLoading = false, metadata?: Record<string, any>) => {
    // Exit preview mode if active
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You\'re currently previewing a saved chat. Sending a new message will exit preview mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Send & Exit Preview', 
            onPress: async () => {
              await exitPreviewMode();
              await sendMessageInternal(newMessage, sender, isLoading);
            }
          }
        ]
      );
      return;
    }

    // Check for transient errors
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
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          msgs.splice(lastAiIdx.i, 1);
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      return;
    }

    // Send the message
    let messageId: string | null = null;
    try {
      messageId = await sendMessageInternal(newMessage, sender, isLoading);
    } catch (err) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          msgs.splice(lastAiIdx.i, 1);
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      return;
    }

    // Update local state
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
    
    // Process memory for user messages
    if (sender === 'user' && !isLoading && messageId) {
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'processing'
      }));
      
      setTimeout(() => {
        processMessageMemory(messageId, newMessage, selectedConversationId);
      }, 500);
    }

    // Update user reply state
    if (sender === 'user' && !isLoading) {
      waitingForUserReplyRef.current = false;
      updateUnreadMessagesCount(0);
    }

    // Reset auto message timer
    if (!isLoading) {
      lastMessageTimeRef.current = Date.now();
      setupAutoMessageTimer();
    }

    // Update search preference
    if (sender === 'user' && !isLoading) {
      try {
        await NodeSTManager.setSearchEnabled(braveSearchEnabled);
      } catch (error) {
        console.error('[App] Failed to set search preference:', error);
      }
    }
  }, [
    isPreviewMode, exitPreviewMode, selectedConversationId,
    sendMessageInternal, braveSearchEnabled, removeMessage
  ]);

  // Handle group messages
  const handleSendGroupMessage = useCallback(async (text: string) => {
    if (!selectedGroupId || !user) return;
    
    try {
      const newMessage = await sendGroupMessage(user, selectedGroupId, text);
      if (newMessage) {
        setGroupMessages(prev => [...prev, newMessage]);
      }
    } catch (error) {
      console.error('Failed to send group message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  }, [selectedGroupId, user]);

  // Message regeneration with optimized saving
  const handleRegenerateMessage = useCallback(async (messageId: string, _messageIndex: number) => {
    if (!selectedConversationId) {
      console.warn('No conversation selected for regeneration');
      return;
    }
  
    try {
      setRegeneratingMessageId(messageId);
  
      // Get first_mes content
      let firstMesText = '';
      try {
        const char = fallbackCharacter || selectedCharacter;
        if (char?.jsonData) {
          const characterData = JSON.parse(char.jsonData);
          firstMesText = characterData.roleCard?.first_mes || '';
        }
      } catch (e) {
        firstMesText = '';
      }
  
      // Find message position
      const targetMsgIndex = messages.findIndex(msg => msg.id === messageId);
      if (targetMsgIndex === -1) {
        console.warn('Target message not found:', messageId);
        setRegeneratingMessageId(null);
        return;
      }
  
      // Filter bot messages
      const botMessages = messages.filter(msg =>
        msg.sender === 'bot' &&
        !msg.isLoading &&
        !msg.metadata?.isErrorMessage &&
        !msg.metadata?.error &&
        (firstMesText ? msg.text !== firstMesText : true) &&
        !msg.metadata?.isFirstMes
      );

      // Find target AI index
      const targetMsg = messages[targetMsgIndex];
      let aiIndex = -1;
      if (targetMsg) {
        aiIndex = botMessages.findIndex(m => m.id === targetMsg.id);
      }

      if (aiIndex === -1) {
        if (firstMesText && targetMsg?.text === firstMesText) {
          aiIndex = 0;
        } else {
          console.warn('Target message not found in filtered botMessages:', messageId);
          setRegeneratingMessageId(null);
          return;
        }
      }
  
      // Create messages to keep
      let messagesToKeep = messages.slice(0, targetMsgIndex);
  
      // Ensure we keep user messages
      if (targetMsg.sender === 'bot' && targetMsgIndex > 0) {
        const prevMsg = messages[targetMsgIndex - 1];
        if (prevMsg && prevMsg.sender === 'user') {
          messagesToKeep = messages.slice(0, targetMsgIndex);
        }
      }
  
      // Display loading state
      const displayMessages = [
        ...messagesToKeep,
        {
          ...targetMsg,
          isLoading: true,
          text: '正在重新生成回复...',
          metadata: { ...targetMsg.metadata, isRegenerating: true }
        }
      ];
  
      setMessages(displayMessages);

      // Get API settings
      const apiSettings = getApiSettings();
      let apiKey = '';
      if (apiSettings.apiProvider === 'openai-compatible' && apiSettings.OpenAIcompatible?.enabled) {
        apiKey = apiSettings.OpenAIcompatible.apiKey || '';
      } else if (apiSettings.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled) {
        apiKey = apiSettings.openrouter.apiKey || '';
      } else {
        apiKey = user?.settings?.chat?.characterApiKey || '';
      }

      // Regenerate message
      const result = await NodeSTManager.regenerateFromMessage({
        messageIndex: aiIndex + 1,
        conversationId: selectedConversationId,
        apiKey,
        apiSettings,
        character: fallbackCharacter || selectedCharacter || undefined
      });
  
      // Process result
      let finalMessages = [...messagesToKeep];
  
      if (result.success && result.text) {
        finalMessages.push({
          id: `${messageId}-regenerated-${Date.now()}`,
          text: result.text,
          sender: 'bot',
          isLoading: false,
          timestamp: Date.now(),
          metadata: {
            ...(targetMsg.metadata || {}),
            aiIndex,
            regenerated: true,
            regenerationTime: Date.now()
          }
        });
      } else {
        setTransientError("处理消息时出现了错误");
        setTimeout(() => setTransientError(null), 5000);
        setRegeneratingMessageId(null);
        return;
      }
  
      // Save messages
      await clearMessages(selectedConversationId);
      const savePromises = finalMessages.map(msg => addMessage(selectedConversationId, msg));
      await Promise.all(savePromises);
  
      // Update UI
      setMessages(finalMessages);
      setRegeneratingMessageId(null);
    } catch (error) {
      console.error('Error regenerating message:', error);
      
      setRegeneratingMessageId(null);
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      return;
    }
  }, [
    selectedConversationId, messages, fallbackCharacter, 
    selectedCharacter, clearMessages, addMessage, user
  ]);

  // Edit AI message
  const handleEditAiMessage = useCallback(async (messageId: string, _aiIndex: number, newContent: string) => {
    if (!selectedConversationId) return;
    try {
      // === 修正：重新计算aiIndex，确保与NodeST一致 ===
      // 获取first_mes内容
      let firstMesText = '';
      try {
        const char = fallbackCharacter || selectedCharacter;
        if (char?.jsonData) {
          const characterData = JSON.parse(char.jsonData);
          firstMesText = characterData.roleCard?.first_mes || '';
        }
      } catch (e) {
        firstMesText = '';
      }
      // 过滤掉first_mes和错误消息，仅保留有效AI消息
      const botMessages = messages.filter(msg =>
        msg.sender === 'bot' &&
        !msg.isLoading &&
        !msg.metadata?.isErrorMessage &&
        !msg.metadata?.error &&
        (firstMesText ? msg.text !== firstMesText : true) &&
        !msg.metadata?.isFirstMes
      );
      // 找到目标消息在botMessages中的index
      const targetMsg = messages.find(msg => msg.id === messageId);
      let aiIndex = -1;
      if (targetMsg) {
        aiIndex = botMessages.findIndex(m => m.id === targetMsg.id);
      }
      if (aiIndex === -1) {
        // 如果是first_mes
        if (firstMesText && targetMsg?.text === firstMesText) {
          aiIndex = 0;
        } else {
          setTransientError("处理消息时出现了错误");
          setTimeout(() => setTransientError(null), 5000);
          return;
        }
      }
      // === 传递修正后的aiIndex ===
      const result = await NodeSTManager.editAiMessageByIndex({
        conversationId: selectedConversationId,
        messageIndex: aiIndex + 1,
        newContent
      });
      if (result.success) {
        // Clear local messages
        await clearMessages(selectedConversationId);

        // Read NodeST history
        let latestHistory: any = null;
        try {
          const historyKey = `nodest_${selectedConversationId}_history`;
          let historyStr = null;
          
          if (typeof FileSystem !== 'undefined' && FileSystem.documentDirectory) {
            const filePath = FileSystem.documentDirectory + 'nodest_characters/' + historyKey + '.json';
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (fileInfo.exists) {
              historyStr = await FileSystem.readAsStringAsync(filePath);
            }
          }
          
          if (!historyStr && typeof AsyncStorage !== 'undefined') {
            historyStr = await AsyncStorage.getItem(historyKey);
          }
          
          if (historyStr) {
            latestHistory = JSON.parse(historyStr);
          }
        } catch (e) {
          latestHistory = null;
        }

        // Convert NodeST history to messages
        if (latestHistory && Array.isArray(latestHistory.parts)) {
          const realMessages = latestHistory.parts.filter((msg: any) => !msg.is_d_entry);
          const newMessages: Message[] = [];
          let aiIndexCounter = 0;
          
          for (let i = 0; i < realMessages.length; i++) {
            const msg = realMessages[i];
            if (msg.role === 'user') {
              newMessages.push({
                id: `${selectedConversationId}-user-${i}-${Date.now()}`,
                text: msg.parts?.[0]?.text ?? '',
                sender: 'user',
                isLoading: false,
                timestamp: Date.now(),
                metadata: {}
              });
            } else if ((msg.role === 'model' || msg.role === 'assistant')) {
              const isFirstMes = !!msg.is_first_mes;
              newMessages.push({
                id: `${selectedConversationId}-bot-${i}-${Date.now()}`,
                text: msg.parts?.[0]?.text ?? '',
                sender: 'bot',
                isLoading: false,
                timestamp: Date.now(),
                metadata: {
                  aiIndex: isFirstMes ? 0 : aiIndexCounter
                }
              });
              if (!isFirstMes) aiIndexCounter++;
            }
          }
          
          // Save messages in batch
          const messagePromises = newMessages.map(m => addMessage(selectedConversationId, m));
          await Promise.all(messagePromises);
          
          // Update UI
          setMessages(newMessages);
        } else {
          setMessages([]);
        }
      } else {
        setTransientError("处理消息时出现了错误");
        setTimeout(() => setTransientError(null), 5000);
      }
    } catch (e) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
    }
  }, [selectedConversationId, clearMessages, addMessage, messages, fallbackCharacter, selectedCharacter]);

  // Delete AI message
  const handleDeleteAiMessage = useCallback(async (messageId: string, _aiIndex: number) => {
    if (!selectedConversationId) return;
    try {
      // === 修正：重新计算aiIndex，确保与NodeST一致 ===
      let firstMesText = '';
      try {
        const char = fallbackCharacter || selectedCharacter;
        if (char?.jsonData) {
          const characterData = JSON.parse(char.jsonData);
          firstMesText = characterData.roleCard?.first_mes || '';
        }
      } catch (e) {
        firstMesText = '';
      }
      const botMessages = messages.filter(msg =>
        msg.sender === 'bot' &&
        !msg.isLoading &&
        !msg.metadata?.isErrorMessage &&
        !msg.metadata?.error &&
        (firstMesText ? msg.text !== firstMesText : true) &&
        !msg.metadata?.isFirstMes
      );
      const targetMsg = messages.find(msg => msg.id === messageId);
      let aiIndex = -1;
      if (targetMsg) {
        aiIndex = botMessages.findIndex(m => m.id === targetMsg.id);
      }
      if (aiIndex === -1) {
        if (firstMesText && targetMsg?.text === firstMesText) {
          aiIndex = 0;
        } else {
          setTransientError("处理消息时出现了错误");
          setTimeout(() => setTransientError(null), 5000);
          return;
        }
      }
      // === 传递修正后的aiIndex ===
      const result = await NodeSTManager.deleteAiMessageByIndex({
        conversationId: selectedConversationId,
        messageIndex: aiIndex + 1
      });
      
      if (result.success) {
        // Clear local messages
        await clearMessages(selectedConversationId);

        // Read NodeST history
        let latestHistory: any = null;
        try {
          const historyKey = `nodest_${selectedConversationId}_history`;
          let historyStr = null;
          
          if (typeof FileSystem !== 'undefined' && FileSystem.documentDirectory) {
            const filePath = FileSystem.documentDirectory + 'nodest_characters/' + historyKey + '.json';
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (fileInfo.exists) {
              historyStr = await FileSystem.readAsStringAsync(filePath);
            }
          }
          
          if (!historyStr && typeof AsyncStorage !== 'undefined') {
            historyStr = await AsyncStorage.getItem(historyKey);
          }
          
          if (historyStr) {
            latestHistory = JSON.parse(historyStr);
          }
        } catch (e) {
          latestHistory = null;
        }

        // Convert NodeST history to messages
        if (latestHistory && Array.isArray(latestHistory.parts)) {
          const realMessages = latestHistory.parts.filter((msg: any) => !msg.is_d_entry);
          const newMessages: Message[] = [];
          let aiIndexCounter = 0;
          
          for (let i = 0; i < realMessages.length; i++) {
            const msg = realMessages[i];
            if (msg.role === 'user') {
              newMessages.push({
                id: `${selectedConversationId}-user-${i}-${Date.now()}`,
                text: msg.parts?.[0]?.text ?? '',
                sender: 'user',
                isLoading: false,
                timestamp: Date.now(),
                metadata: {}
              });
            } else if ((msg.role === 'model' || msg.role === 'assistant')) {
              const isFirstMes = !!msg.is_first_mes;
              newMessages.push({
                id: `${selectedConversationId}-bot-${i}-${Date.now()}`,
                text: msg.parts?.[0]?.text ?? '',
                sender: 'bot',
                isLoading: false,
                timestamp: Date.now(),
                metadata: {
                  aiIndex: isFirstMes ? 0 : aiIndexCounter
                }
              });
              if (!isFirstMes) aiIndexCounter++;
            }
          }
          
          // Save messages in batch
          const messagePromises = newMessages.map(m => addMessage(selectedConversationId, m));
          await Promise.all(messagePromises);
          
          // Update UI
          setMessages(newMessages);
        } else {
          setMessages([]);
        }
      } else {
        setTransientError("处理消息时出现了错误");
        setTimeout(() => setTransientError(null), 5000);
      }
    } catch (e) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
    }
  }, [selectedConversationId, clearMessages, addMessage, messages, fallbackCharacter, selectedCharacter]);

  // Handle WebView test
  const handleWebViewTest = useCallback(async () => {
    try {
      const webViewHtml = await getWebViewExampleHtml();
      
      if (!selectedConversationId) {
        Alert.alert('提示', '请先选择一个角色开始对话');
        return;
      }
      
      if (mode !== 'visual-novel') {
        Alert.alert(
          '切换到视觉小说模式',
          '需要在视觉小说模式下才能测试WebView功能，是否切换？',
          [
            { text: '取消', style: 'cancel' },
            { 
              text: '切换', 
              onPress: () => {
                setMode('visual-novel');
                setTimeout(() => {
                  handleSendMessage(webViewHtml, 'bot');
                }, 300);
              }
            }
          ]
        );
        return;
      }
      
      handleSendMessage(webViewHtml, 'bot');
    } catch (error) {
      console.error('Failed to load WebView example:', error);
      Alert.alert('错误', '加载WebView示例失败');
    }
  }, [selectedConversationId, mode, setMode, handleSendMessage]);

  // Reset default characters
  const handleResetDefaultCharacterInit = useCallback(async () => {
    await resetDefaultCharacterImported();
    Alert.alert('已重置', '下次启动将重新导入默认角色');
  }, []);

  // Get background image
  const getBackgroundImage = useCallback(() => {
    if (characterToUse?.id && extraBgStates[characterToUse.id]?.image) {
      return { uri: extraBgStates[characterToUse.id].image! };
    }
    if (
      characterToUse?.enableAutoExtraBackground &&
      characterToUse?.extrabackgroundimage
    ) {
      return { uri: characterToUse.extrabackgroundimage };
    }
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
  }, [characterToUse, extraBgStates]);

  // Get group background image
  const getGroupBackgroundImage = useCallback(() => {
    if (selectedGroup) {
      if (groupBackgrounds[selectedGroup.groupId]) {
        return { uri: groupBackgrounds[selectedGroup.groupId] };
      }
      if (selectedGroup.backgroundImage) {
        return { uri: selectedGroup.backgroundImage };
      }
    }
    return require('@/assets/images/group-chat-background.jpg');
  }, [selectedGroup, groupBackgrounds]);

  // Reset conversation
  const handleResetConversation = useCallback(async () => {
    if (selectedConversationId) {
      await clearMessages(selectedConversationId);
      
      if (firstMessageSentRef.current[selectedConversationId]) {
        delete firstMessageSentRef.current[selectedConversationId];
      }
      
      firstMesSentRef.current[selectedConversationId] = true;
      
      setTimeout(async () => {
        if (characterToUse?.jsonData) {
          if (messages.length > 0) {
            console.log(`[first_mes] [reset] 当前界面已有消息，不发送first_mes到${selectedConversationId}`);
          } else {
            try {
              const characterData = JSON.parse(characterToUse.jsonData);
              let firstMes = characterData.roleCard?.first_mes;

              // Apply regex scripts
              try {
                const globalSettings = typeof window !== 'undefined' && window.__globalSettingsCache
                  ? window.__globalSettingsCache
                  : await loadGlobalSettingsState();
                  
                if (
                  globalSettings &&
                  globalSettings.regexEnabled &&
                  Array.isArray(globalSettings.regexScriptGroups) &&
                  globalSettings.regexScriptGroups.length > 0
                ) {
                  const matchedGroups = globalSettings.regexScriptGroups.filter(
                    (g: any) =>
                      (g.bindType === 'all') ||
                      (g.bindType === 'character' && g.bindCharacterId === selectedConversationId)
                  );
                  
                  const enabledScripts: any[] = [];
                  matchedGroups.forEach((group: any) => {
                    if (Array.isArray(group.scripts)) {
                      group.scripts.forEach((s: any) => {
                        if (!s.disabled) enabledScripts.push(s);
                      });
                    }
                  });
                  
                  if (enabledScripts.length > 0) {
                    let NodeSTCoreClass = null;
                    try {
                      NodeSTCoreClass = (await import('@/NodeST/nodest/core/node-st-core')).NodeSTCore;
                    } catch (e) {}
                    
                    if (NodeSTCoreClass && typeof NodeSTCoreClass.applyGlobalRegexScripts === 'function') {
                      firstMes = NodeSTCoreClass.applyGlobalRegexScripts(
                        firstMes,
                        enabledScripts,
                        2
                      );
                    }
                  }
                }
              } catch (e) {
                // Ignore errors
              }
              
              if (firstMes) {
                console.log(`[first_mes] [reset] 发送first_mes到${selectedConversationId}:`, firstMes);
                addMessage(selectedConversationId, {
                  id: `first-reset-${Date.now()}`,
                  text: firstMes,
                  sender: 'bot',
                  timestamp: Date.now()
                });
                
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
  }, [selectedConversationId, characterToUse, messages.length, addMessage]);

  // Handle select conversation
  const handleSelectConversation = useCallback((id: string) => {
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
    
    Animated.timing(contentSlideAnim, {
      toValue: 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [contentSlideAnim]);

  // Handle avatar press
  const handleAvatarPress = useCallback(() => {
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
  }, [isPreviewMode, exitPreviewMode, router, selectedConversationId]);

  // Handle toggle group manage
  const handleToggleGroupManage = useCallback(() => {
    setIsGroupManageModalVisible(!isGroupManageModalVisible);
  }, [isGroupManageModalVisible]);

  // Toggle memo overlay
  const toggleMemoOverlay = useCallback(() => {
    setIsMemoSheetVisible(!isMemoSheetVisible);
  }, [isMemoSheetVisible]);

  // Handle save memo
  const handleSaveMemo = useCallback((content: string) => {
    console.log('Saving memo:', content);
  }, []);

  // Handle save created
  const handleSaveCreated = useCallback((save: ChatSave) => {
    console.log('Save created:', save.id);
  }, []);

  // Handle show full history
  const handleShowFullHistory = useCallback(() => {
    setHistoryModalVisible(true);
  }, []);

  // Handle restore top bar
  const handleRestoreTopBar = useCallback(() => {
    setIsTopBarVisible(true);
    DeviceEventEmitter.emit('topBarVisibilityChanged', true);
  }, []);

  // Get character conversation ID
  const getCharacterConversationId = useCallback((selectedConversationId: string): string | undefined => {
    return selectedConversationId || undefined;
  }, []);

  // Update unread messages count
  const updateUnreadMessagesCount = useCallback((count: number) => {
    AsyncStorage.setItem('unreadMessagesCount', String(count)).catch(err => 
      console.error('[App] Failed to save unread messages count:', err)
    );
    
    EventRegister.emit('unreadMessagesUpdated', count);
  }, []);

  // Toggle memory panel
  const toggleMemoryPanel = useCallback(() => {
    setIsMemoryPanelVisible(!isMemoryPanelVisible);
    if (!isMemoryPanelVisible) {
      fetchMemoryFacts();
    }
  }, [isMemoryPanelVisible]);

  // Fetch memory facts
  const fetchMemoryFacts = useCallback(async () => {
    if (!selectedConversationId) return;
    
    try {
      const userMessage = messages.length > 0 ? messages[messages.length - 1].text : "";
      
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
  }, [selectedConversationId, messages, characterToUse]);

  // Process message memory
  const processMessageMemory = useCallback(async (messageId: string, text: string, conversationId: string | null) => {
    if (!conversationId || !characterToUse?.id) return;
    
    try {
      const mem0Service = Mem0Service.getInstance();
      
      await mem0Service.addChatMemory(
        text,
        'user',
        characterToUse.id,
        conversationId
      );
      
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'saved'
      }));
      
      if (isMemoryPanelVisible) {
        fetchMemoryFacts();
      }
    } catch (error) {
      console.error('Error processing message memory:', error);
      
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'failed'
      }));
    }
  }, [characterToUse, isMemoryPanelVisible, fetchMemoryFacts]);

  // Handle TTS enhancer toggle
  const handleTtsEnhancerToggle = useCallback(() => {
    setIsTtsEnhancerModalVisible(true);
  }, []);

  // Handle playback status update
  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsVideoReady(true);
      if (videoError) setVideoError(null);
    } else {
      if (status.error) {
        console.error('Video playback error:', status.error);
        setVideoError(status.error);
      }
    }
  }, [videoError]);

  // Handle scroll position change with debounce
  const handleScrollPositionChange = useCallback((characterId: string, position: number) => {
    if (scrollPositionUpdateTimeoutRef.current) {
      clearTimeout(scrollPositionUpdateTimeoutRef.current);
    }
    
    scrollPositionUpdateTimeoutRef.current = setTimeout(() => {
      setChatScrollPositions(prev => {
        const previousPosition = prev[characterId];
        if (Math.abs((previousPosition || 0) - position) > 10) {
          return { ...prev, [characterId]: position };
        }
        return prev;
      });
    }, 200); // Debounce for better performance
  }, []);

  // Toggle brave search
  const toggleBraveSearch = useCallback(() => {
    setBraveSearchEnabled(prev => {
      const newState = !prev;
      AsyncStorage.setItem('braveSearchEnabled', JSON.stringify(newState))
        .catch(err => console.error('[App] Failed to save search preference:', err));
      
      // Alert.alert(
      //   newState ? '已启用搜索' : '已禁用搜索',
      //   newState 
      //     ? '现在AI可以使用Brave搜索来回答需要最新信息的问题' 
      //     : '已关闭网络搜索功能，AI将只使用已有知识回答问题',
      //   [{ text: '确定', style: 'default' }]
      // );
      
      return newState;
    });
  }, []);

  // Set up auto message timer
  const setupAutoMessageTimer = useCallback(() => {
    if (autoMessageTimerRef.current) {
      clearTimeout(autoMessageTimerRef.current);
      autoMessageTimerRef.current = null;
    }
    
    if (!autoMessageEnabled || !characterToUse?.id || waitingForUserReplyRef.current) {
      return;
    }

    if (characterToUse.autoMessage !== true) {
      return;
    }

    autoMessageIntervalRef.current = characterToUse.autoMessageInterval || 5;
    
    const intervalMs = autoMessageIntervalRef.current * 60 * 1000;
    
    autoMessageTimerRef.current = setTimeout(async () => {
      if (characterToUse && selectedConversationId) {
        autoMessageTimerRef.current = null;
        
        try {
          const uniqueAutoMsgId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          
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
          
          if (result.success && result.text) {
            const aiMessageCount = messages.filter(m => m.sender === 'bot' && !m.isLoading).length;
            
            await addMessage(selectedConversationId, {
              id: uniqueAutoMsgId,
              text: result.text,
              sender: 'bot',
              timestamp: Date.now(),
              metadata: {
                isAutoMessageResponse: true,
                aiIndex: aiMessageCount,
                autoMessageCreatedAt: Date.now()
              }
            });
            
            lastMessageTimeRef.current = Date.now();
            waitingForUserReplyRef.current = true;
            
            if (characterToUse.notificationEnabled === true) {
              updateUnreadMessagesCount(1);
            }
          }
        } catch (error) {
          console.error('[App] Error generating auto message:', error);
        }
      }
    }, intervalMs);
  }, [
    autoMessageEnabled, characterToUse, selectedConversationId,
    messages, user, addMessage, updateUnreadMessagesCount
  ]);

  // Initialize default characters and load preferences
  useEffect(() => {
    (async () => {
      try {
        console.log('[index] 调用 importDefaultCharactersIfNeeded ...');
        setIsInitializing(true);
        
        const result = await importDefaultCharactersIfNeeded(
          addCharacter,
          addConversation,
          (id: string, uri: string) => {
            console.log(`[index] 调用 updateCharacterExtraBackgroundImage: id=${id}, uri=${uri}`);
            return updateCharacterExtraBackgroundImage(id, uri);
          },
          (id: string, uri: string) => {
            console.log(`[index] 调用 setCharacterAvatar: id=${id}, uri=${uri}`);
            return Promise.resolve();
          }
        );
        
        console.log('[index] importDefaultCharactersIfNeeded 完成', result);
        
        if (result && result.characterId) {
          setSelectedConversationId(result.characterId);
          
          if (result.imported) {
            const characterMessages = getMessages(result.characterId);
            setMessages(characterMessages);
            console.log(`[index] 选择了新导入的默认角色：${result.characterId}`);
          }
          
          if (mode === 'visual-novel') {
            console.log('[index] 视觉小说模式已激活，设置 defaultCharacterNavigated 为 true');
            setDefaultCharacterNavigated(true);
          }
        }
        
        setTimeout(() => setIsInitializing(false), 500);
      } catch (e) {
        console.warn('[DefaultCharacterImporter] 初始化失败:', e);
        setIsInitializing(false);
      }
    })();

    // Load character view mode
    (async () => {
      try {
        const mode = await AsyncStorage.getItem('character_view_mode');
        if (
          mode === 'large' ||
          mode === 'small' ||
          mode === 'vertical'
        ) {
          characterViewModeCache = mode;
        } else {
          characterViewModeCache = null;
        }
      } catch (e) {
        characterViewModeCache = null;
      }
    })();

    // Load global settings
    (async () => {
      const globalSettings = await loadGlobalSettingsState();
      if (globalSettings && typeof window !== 'undefined') {
        window.__globalSettingsCache = globalSettings;
      }
    })();

    // Sync table memory plugin
    try {
      const enabled = isTableMemoryEnabled();
      setTableMemoryEnabled(enabled);
      console.log('[index] 同步表格记忆插件开关:', enabled);
    } catch (e) {
      console.warn('[index] 同步表格记忆插件开关失败:', e);
    }

    // Load search preference
    (async () => {
      try {
        const savedPref = await AsyncStorage.getItem('braveSearchEnabled');
        if (savedPref !== null) {
          setBraveSearchEnabled(JSON.parse(savedPref));
        }
      } catch (error) {
        console.error('[App] Failed to load search preference:', error);
      }
    })();

    // Load TTS enhancer settings
    (async () => {
      try {
        const settings = ttsService.getEnhancerSettings();
        setIsTtsEnhancerEnabled(settings.enabled);
      } catch (error) {
        console.error('[App] Error loading TTS enhancer settings:', error);
      }
    })();
  }, []);

  // Fall back to loading character from storage if not found in context
  useEffect(() => {
    if (
      selectedConversationId &&
      !selectedCharacter &&
      !charactersLoading
    ) {
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
  }, [selectedConversationId, selectedCharacter, charactersLoading, characters, setCharacters]);
// 初始化时尝试恢复上次的对话
useEffect(() => {
  // 只有在没有通过URL参数指定characterId时才自动恢复
  if (!characterId && !selectedConversationId && !hasRestoredLastConversation && characters.length > 0) {
    (async () => {
      try {
        const lastId = await AsyncStorage.getItem('lastConversationId');
        if (lastId && characters.some(char => char.id === lastId)) {
          setSelectedConversationId(lastId);
          const characterMessages = getMessages(lastId);
          setMessages(characterMessages);
        }
      } catch (e) {
        // ignore
      } finally {
        setHasRestoredLastConversation(true);
      }
    })();
  }
}, [characterId, selectedConversationId, hasRestoredLastConversation, characters, getMessages]);
  // Load groups when user changes
  useEffect(() => {
    if (user) {
      loadUserGroups();
    } else {
      setGroups([]);
      setSelectedGroupId(null);
      setGroupMessages([]);
      setGroupMembers([]);
    }
  }, [user, loadUserGroups]);

  // Load group messages and members
  useEffect(() => {
    if (selectedGroupId) {
      loadGroupMessages(selectedGroupId);

      const selectedGroup = groups.find(g => g.groupId === selectedGroupId);
      if (selectedGroup && characters) {
        const characterMemberIds = selectedGroup.groupMemberIds?.filter(
          id => id !== user?.id
        ) || [];
        
        let memberCharacters = characters.filter(
          char => characterMemberIds.includes(char.id)
        );
        
        if (memberCharacters.length < characterMemberIds.length) {
          console.log(`[Index] Found ${memberCharacters.length} of ${characterMemberIds.length} group members, loading missing ones...`);
          
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
  }, [selectedGroupId, groups, characters, user?.id, loadGroupMessages]);

  // Load saved chat scroll positions
  useEffect(() => {
    const saveScrollPositions = async () => {
      try {
        if (Object.keys(chatScrollPositions).length > 0) {
          const operation = AsyncStorage.setItem('chatScrollPositions', JSON.stringify(chatScrollPositions));
          asyncStorageOperations.current.add(operation);
          await operation;
          asyncStorageOperations.current.delete(operation);
        }
      } catch (error) {
        console.error('Failed to save scroll positions:', error);
      }
    };

    // Process memory cache when app goes to background
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
        handleAppBackground();
      }
    });
    
    // Load saved scroll positions
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

  // First message handling
  useEffect(() => {
    if (
      selectedConversationId &&
      !isGroupMode &&
      characterToUse &&
      messages.length === 0 &&
      !firstMesSentRef.current[selectedConversationId]
    ) {
      const actualMessages = getMessages(selectedConversationId);
      if (actualMessages && actualMessages.length > 0) {
        console.log(`[first_mes] [messages effect] getMessages(${selectedConversationId})已有${actualMessages.length}条消息，不发送first_mes`);
      } else {
        (async () => {
          let firstMes = '';
          try {
            if (characterToUse.jsonData) {
              const characterData = JSON.parse(characterToUse.jsonData);
              firstMes = characterData.roleCard?.first_mes || '';
              
              // Apply regex scripts
              try {
                const globalSettings = typeof window !== 'undefined' && window.__globalSettingsCache
                  ? window.__globalSettingsCache
                  : await loadGlobalSettingsState();
                  
                if (
                  globalSettings &&
                  globalSettings.regexEnabled &&
                  Array.isArray(globalSettings.regexScriptGroups) &&
                  globalSettings.regexScriptGroups.length > 0
                ) {
                  const matchedGroups = globalSettings.regexScriptGroups.filter(
                    (g: any) =>
                      (g.bindType === 'all') ||
                      (g.bindType === 'character' && g.bindCharacterId === selectedConversationId)
                  );
                  
                  const enabledScripts: any[] = [];
                  matchedGroups.forEach((group: any) => {
                    if (Array.isArray(group.scripts)) {
                      group.scripts.forEach((s: any) => {
                        if (!s.disabled) enabledScripts.push(s);
                      });
                    }
                  });
                  
                  if (enabledScripts.length > 0) {
                    let NodeSTCoreClass = null;
                    try {
                      NodeSTCoreClass = (await import('@/NodeST/nodest/core/node-st-core')).NodeSTCore;
                    } catch (e) {}
                    
                    if (NodeSTCoreClass && typeof NodeSTCoreClass.applyGlobalRegexScripts === 'function') {
                      firstMes = NodeSTCoreClass.applyGlobalRegexScripts(
                        firstMes,
                        enabledScripts,
                        2
                      );
                    }
                  }
                }
              } catch (e) {
                // Ignore errors
              }
            }
          } catch (e) {
            firstMes = '';
          }
          
          if (firstMes) {
            console.log(`[first_mes] [messages effect] 发送first_mes到${selectedConversationId}:`, firstMes);
            const result = await addMessage(selectedConversationId, {
              id: `first-auto-${Date.now()}`,
              text: firstMes,
              sender: 'bot',
              timestamp: Date.now()
            });
            firstMesSentRef.current[selectedConversationId] = true;
          }
        })();
      }
    }
    
    // If messages not empty, mark first message as sent
    if (selectedConversationId && messages.length > 0) {
      firstMesSentRef.current[selectedConversationId] = true;
    }
  }, [selectedConversationId, characterToUse, messages, isGroupMode, addMessage, getMessages]);

  // Save last selected conversation
  useEffect(() => {
    if (selectedConversationId) {
      console.log('[Index] Saving selectedConversationId to AsyncStorage:', selectedConversationId);
      const operation = AsyncStorage.setItem('lastConversationId', selectedConversationId);
      asyncStorageOperations.current.add(operation);
      operation.then(() => {
        asyncStorageOperations.current.delete(operation);
      }).catch(err => {
        asyncStorageOperations.current.delete(operation);
        console.error('[Index] Failed to save lastConversationId:', err);
      });
    }
  }, [selectedConversationId]);

  // Update messages when conversation changes
  useEffect(() => {
    if (selectedConversationId) {
      const currentMessages = getMessages(selectedConversationId);
      console.log(`[Index] Updating messages for conversation ${selectedConversationId}: ${currentMessages.length} messages`);
      setMessages([...currentMessages]);
    }
  }, [selectedConversationId, getMessages]);

  // Initial conversation handling from URL params
  useEffect(() => {
    if (characterId) {
      console.log('[Index] Character ID from params:', characterId);
      const characterExists = characters.some(char => char.id === characterId);
      console.log('[Index] Character exists in characters array:', characterExists);

      if (characterExists) {
        setSelectedConversationId(characterId);
        console.log('[Index] Selected conversation set to:', characterId);

        const characterMessages = getMessages(characterId);
        console.log('[Index] Loaded messages count:', characterMessages.length);
        setMessages(characterMessages);

        if (
          characterMessages.length === 0 &&
          !firstMessageSentRef.current[characterId]
        ) {
          if (messages.length > 0) {
            console.log(`[first_mes] [param effect] 当前界面已有消息，不发送first_mes到${characterId}`);
          } else {
            (async () => {
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
            })();
          }
        } else if (characterMessages.length > 0) {
          firstMessageSentRef.current[characterId] = true;
        }
      } else {
        console.warn('[Index] Character not found in characters array:', characterId);
      }

      setIsSidebarVisible(false);
    }
  }, [characterId, characters, getMessages, messages, addMessage]);

  // Auto message timer setup
  useEffect(() => {
    if (characterToUse) {
      const newAutoMessageEnabled = characterToUse.autoMessage === true;
      
      if (autoMessageEnabled !== newAutoMessageEnabled) {
        console.log(`[App] Auto message setting changed to: ${newAutoMessageEnabled}`);
        setAutoMessageEnabled(newAutoMessageEnabled);
      }
      
      autoMessageIntervalRef.current = characterToUse.autoMessageInterval || 5;
      
      if (newAutoMessageEnabled) {
        setTimeout(() => {
          setupAutoMessageTimer();
        }, 100);
      } else if (autoMessageTimerRef.current) {
        clearTimeout(autoMessageTimerRef.current);
        autoMessageTimerRef.current = null;
        console.log('[App] Auto message timer cleared due to setting change');
      }
    }

    return () => {
      if (autoMessageTimerRef.current) {
        clearTimeout(autoMessageTimerRef.current);
        autoMessageTimerRef.current = null;
      }
    };
  }, [characterToUse, setupAutoMessageTimer]);

  // TTS enhancer settings listener
  useEffect(() => {
    const enhancerSettingsListener = EventRegister.addEventListener(
      'ttsEnhancerSettingsChanged',
      (settings: any) => {
        if (settings && typeof settings.enabled === 'boolean') {
          setIsTtsEnhancerEnabled(settings.enabled);
        }
      }
    );

    return () => {
      if (typeof enhancerSettingsListener === 'string') {
         EventRegister.removeEventListener(enhancerSettingsListener);
      } else {
         console.warn('[App] Failed to remove TTS enhancer listener: Invalid listener ID type.');
      }
    };
  }, []);

  // Reset auto message timer when messages change
  useEffect(() => {
    if (messages.length > 0) {
      lastMessageTimeRef.current = Date.now();
      setupAutoMessageTimer();
    }
  }, [messages, setupAutoMessageTimer]);

  // Handle keyboard events
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      () => {
        setKeyboardVisible(true);
        Animated.timing(contentScaleAnim, {
          toValue: 0.96,
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

  // Update tab bar visibility based on keyboard
  useEffect(() => {
    if (Platform.OS === 'ios') {
      router.setParams({ hideTabBar: isKeyboardVisible ? 'true' : 'false' });
    }
  }, [isKeyboardVisible, router]);

  // Listen for top bar visibility changes
  useEffect(() => {
    const listener = EventRegister.addEventListener('toggleTopBarVisibility', (visible: boolean) => {
      setIsTopBarVisible(visible);
      DeviceEventEmitter.emit('topBarVisibilityChanged', visible);
    });
    return () => {
      EventRegister.removeEventListener(listener as string);
    };
  }, []);

  // Clear transient errors
  useEffect(() => {
    if (
      transientError &&
      transientError.includes('处理消息时出现了错误') &&
      selectedConversationId &&
      messages.length > 0
    ) {
      // Do nothing
    }
  }, [transientError, selectedConversationId, messages]);

  // 计算顶部栏内容高度（与TopBarWithBackground一致）
  const { width } = Dimensions.get('window');
  const AVATAR_SIZE = Math.max(Math.min(width * 0.09, 36), 32);
  const topBarContentHeight = Math.max(AVATAR_SIZE + 16, 48);
  const navbarHeight = Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0;
  const computedTopBarHeight = navbarHeight + topBarContentHeight;
  // === 新增：PostChatService 实例 ===
  const postChatService = useRef(PostChatService.getInstance()).current;

  // === 新增：同步每个会话的背景生成状态 ===
  useEffect(() => {
    if (!characterToUse?.id) return;
    const updateState = () => {
      const state = postChatService.getCurrentState(characterToUse.id);
      setExtraBgStates(prev => ({
        ...prev,
        [characterToUse.id]: {
          isGenerating: state.isGenerating,
          taskId: state.taskId,
          error: state.error,
          image: state.image
        }
      }));
    };
    updateState();
    const interval = setInterval(updateState, 800);
    return () => clearInterval(interval);
  }, [characterToUse?.id, postChatService]);

  // === 新增：每次切换characterId时加载已处理消息ID ===
  useEffect(() => {
    if (characterToUse?.id) {
      postChatService.loadProcessedMessageIds(characterToUse.id);
    }
  }, [characterToUse?.id, postChatService]);

  // === 新增：触发背景生成的 useEffect ===
  useEffect(() => {
    if (
      characterToUse &&
      characterToUse.enableAutoExtraBackground &&
      characterToUse.backgroundImageConfig?.isNovelAI &&
      characterToUse.backgroundImage &&
      messages &&
      messages.length > 0
    ) {
      const lastMsg = messages[messages.length - 1];
      if (
        lastMsg &&
        lastMsg.sender === 'bot' &&
        !lastMsg.isLoading &&
        !(lastMsg.metadata && lastMsg.metadata.isErrorMessage)
      ) {
        if (!postChatService.hasProcessedMessage(characterToUse.id, lastMsg.id)) {
          const state = postChatService.getCurrentState(characterToUse.id);
          if (!state.isGenerating) {
            postChatService.triggerBackgroundGeneration(
              characterToUse,
              lastMsg.text,
              messages,
              user,
              async (characterId: string, imageUrl: string) => {
                await updateCharacterExtraBackgroundImage(characterId, imageUrl);
              }
            );
          }
        }
      }
    }
  }, [
    characterToUse,
    characterToUse?.enableAutoExtraBackground,
    characterToUse?.backgroundImageConfig?.isNovelAI,
    characterToUse?.backgroundImage,
    messages,
    user,
    updateCharacterExtraBackgroundImage,
    postChatService
  ]);

  // === 清理状态：切换characterToUse时只保留当前会话的状态 ===
  useEffect(() => {
    if (!characterToUse?.id) return;
    setExtraBgStates(prev => {
      const newState: typeof prev = {};
      if (prev[characterToUse.id]) {
        newState[characterToUse.id] = prev[characterToUse.id];
      }
      return newState;
    });
  }, [characterToUse?.id]);

  // === 清理状态：关闭自动背景时清理当前会话的生成图片 ===
  useEffect(() => {
    if (characterToUse && !characterToUse.enableAutoExtraBackground && characterToUse.id) {
      setExtraBgStates(prev => ({
        ...prev,
        [characterToUse.id]: {
          isGenerating: false,
          taskId: null,
          error: null,
          image: null
        }
      }));
    }
  }, [characterToUse?.enableAutoExtraBackground, characterToUse?.id]);

  // === 清理状态：背景图片变更时清理 ===
  useEffect(() => {
    if (
      characterToUse &&
      characterToUse.id &&
      (!characterToUse.enableAutoExtraBackground ||
        (extraBgStates[characterToUse.id]?.image &&
          characterToUse.extrabackgroundimage !== extraBgStates[characterToUse.id]?.image))
    ) {
      setExtraBgStates(prev => ({
        ...prev,
        [characterToUse.id]: {
          isGenerating: false,
          taskId: null,
          error: null,
          image: null
        }
      }));
    }
  }, [characterToUse, characterToUse?.enableAutoExtraBackground, characterToUse?.extrabackgroundimage]);

  return (
    <View style={styles.outerContainer}>
      <StatusBar translucent backgroundColor="transparent" />
      
     {/* Restore top bar button */}
      {!isTopBarVisible && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            // 修改：使用安全区顶部高度
            top: (insets?.top ?? 0) + 10,
            left: 18,
            zIndex: 99999,
            backgroundColor: 'rgba(0,0,0,0.18)', 
            borderRadius: 16,
            paddingVertical: 2,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            elevation: 2,
            shadowColor: 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0,
            shadowRadius: 0,
          }}
          onPress={handleRestoreTopBar}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-down" size={18} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Loading overlay */}
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

      <MemoryProvider config={memoryConfig}>
        <Mem0Initializer />
        
        <View style={styles.backgroundContainer}>
          {!isGroupMode && characterToUse?.dynamicPortraitEnabled && characterToUse?.dynamicPortraitVideo ? (
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
              
              {!isVideoReady && !videoError && (
                <View style={styles.videoLoadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.videoLoadingText}>加载动态立绘中...</Text>
                </View>
              )}
              
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

        {/* Background generation indicator */}
        {characterToUse?.id && extraBgStates[characterToUse.id]?.isGenerating && (
          <View style={{
            position: 'absolute',
            top: 90,
            right: 30,
            zIndex: 999999,
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: 20,
            paddingVertical: 8,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            elevation: 8,
          }}>
            <ActivityIndicator size="small" color="rgb(255, 224, 195)" />
            <Text style={{ color: 'rgb(255, 224, 195)', marginLeft: 8 }}>生成新背景...</Text>
          </View>
        )}
        
        {/* Sidebar */}
        {user && (
          <Sidebar
            isVisible={isSidebarVisible}
            conversations={characters}
            selectedConversationId={isGroupMode ? selectedGroupId : selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onClose={toggleSidebar}
            animationValue={contentSlideAnim}
            currentUser={user}
            disbandedGroups={disbandedGroups}
          />
        )}

        {/* Group settings sidebar */}
        {isGroupMode && (
          <GroupSettingsSidebar
            isVisible={groupSettingsSidebarVisible}
            onClose={toggleGroupSettingsSidebar}
            animationValue={groupSettingsSidebarAnim}
            selectedGroup={selectedGroup}
            currentUser={user}
            onGroupBackgroundChanged={handleGroupBackgroundChanged}
          />
        )}

        {/* Main content area */}
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
                { translateX: Animated.multiply(groupSettingsSidebarAnim, -1) },
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
              
              {/* Top bar */}
              {isTopBarVisible && (
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
                  onGroupSettingsPress={toggleGroupSettingsSidebar}
                />
              )}

              <SafeAreaView style={[
                styles.safeArea,
                (characterToUse || isGroupMode) && styles.transparentBackground,
                mode === 'background-focus' && styles.backgroundFocusSafeArea,
                !isTopBarVisible && { marginTop: 10 }, // 顶部栏隐藏时顶部留10px间隙
                isTopBarVisible && { marginTop: computedTopBarHeight }
              ]}>
                {/* Transient error display */}
                {transientError && (
                  <View style={styles.transientErrorContainer}>
                    <View style={styles.transientErrorBox}>
                      <Text style={styles.transientErrorText}>{transientError}</Text>
                    </View>
                  </View>
                )}

                {/* Preview Mode Banner */}
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
                
                {/* Chat content */}
                <View style={[
                  styles.contentContainer,
                  (characterToUse || isGroupMode) && styles.transparentBackground,
                  mode === 'background-focus' && !isGroupMode && styles.backgroundFocusContentContainer,
                  !isTopBarVisible && { paddingTop: 0 }
                ]}>
                  {isGroupMode ? (
                    <GroupDialog
                      style={styles.chatDialog}
                      groupId={selectedGroupId || ''}
                      messages={groupMessages}
                      onScrollPositionChange={(groupId, position) => {
                        setChatScrollPositions(prev => ({
                          ...prev,
                          [`group-${groupId}`]: position
                        }));
                      }}
                      currentUser={user || { id: '', name: 'User' }}
                      groupMembers={groupMembers}
                      isGroupDisbanded={disbandedGroups.includes(selectedGroupId || '')}
                    />
                  ) : (
                    <ChatDialog
                      messages={filteredMessages}
                      style={StyleSheet.flatten([styles.chatDialog])}
                      selectedCharacter={characterToUse}
                      onRateMessage={() => {}} // Rating functionality removed
                      onRegenerateMessage={handleRegenerateMessage}
                      savedScrollPosition={characterToUse?.id ? chatScrollPositions[characterToUse.id] : undefined}
                      onScrollPositionChange={handleScrollPositionChange}
                      messageMemoryState={messageMemoryState}
                      regeneratingMessageId={regeneratingMessageId}
                      user={user}
                      isHistoryModalVisible={isHistoryModalVisible}
                      setHistoryModalVisible={setHistoryModalVisible}
                      onShowFullHistory={handleShowFullHistory}
                      onEditMessage={handleEditAiMessage}
                      onDeleteMessage={handleDeleteAiMessage}
                    />
                  )}
                </View>

                {/* Input bar */}
                <View style={[
                  styles.inputBar,
                  (characterToUse || isGroupMode) && styles.transparentBackground,
                  mode === 'background-focus' && !isGroupMode && styles.backgroundFocusInputBar
                ]}>
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
              </SafeAreaView>

              {/* Modals */}
              {isGroupManageModalVisible && selectedGroup && (
                <GroupManagementModal
                  visible={isGroupManageModalVisible}
                  onClose={() => setIsGroupManageModalVisible(false)}
                  group={selectedGroup}
                  groupMembers={groupMembers}
                  allCharacters={characters}
                  currentUser={user || { id: '', name: 'User' }}
                  onGroupUpdated={() => {
                    loadUserGroups();
                    if (selectedGroupId) {
                      loadGroupMessages(selectedGroupId);
                    }
                  }}
                />
              )}

              {/* Overlay Components */}
              <MemoOverlay
                isVisible={isMemoSheetVisible}
                onClose={toggleMemoOverlay}
                characterId={characterIdForMemo}
                conversationId={conversationIdForMemo}
                customUserName={characterToUse?.customUserName}
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
              
              {/* TTS Enhancer Modal */}
              <TTSEnhancerModal
                visible={isTtsEnhancerModalVisible}
                onClose={() => setIsTtsEnhancerModalVisible(false)}
              />

              {/* Lazy loaded modals */}
              <Suspense fallback={null}>
                {/* {isHistoryModalVisible && (
                  <HistoryModal
                    visible={isHistoryModalVisible}
                    onClose={() => setHistoryModalVisible(false)}
                    characterId={selectedConversationId || ''}
                  />
                )} */}
              </Suspense>

                            {/* 浮动WebView测试按钮 */}
              {/* <TouchableOpacity
                style={styles.floatingLogButton}
                onPress={handleWebViewTest}
                activeOpacity={0.85}
              >
                <Text style={styles.floatingLogButtonText}>Web</Text>
              </TouchableOpacity> */}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>

        {/* Settings Sidebar */}
        {characterToUse && (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 99999,
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
    backgroundColor: '#181818',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    backgroundColor: '#181818',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
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
    zIndex: 10,
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
  visualNovelContentContainer: {
    flex: 1,
    paddingBottom: 200,
  },
  visualNovelInputBar: {
    paddingBottom: 180,
  },
  backgroundFocusSafeArea: {
    // Keep default settings
  },
  backgroundFocusContentContainer: {
    flex: 1,
    padding: 10,
  },
  backgroundFocusInputBar: {
    padding: 10,
    backgroundColor: 'transparent',
  },
  initializingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
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
  floatingLogButton: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    zIndex: 99999,
    backgroundColor: '#4a6fa5',
    borderRadius: 28,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  floatingLogButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 28,
  },
  transientErrorContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
    pointerEvents: 'none'
  },
  transientErrorBox: {
    backgroundColor: 'rgba(220,53,69,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6, 
    
  },
  transientErrorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold'
  }
});

export default App;
