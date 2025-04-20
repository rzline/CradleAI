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
import NovelAITestModal from '@/components/NovelAITestModal'; // 导入 NovelAI 测试组件
import VNDBTestModal from '@/src/components/VNDBTestModal'; // 导入 VNDB 测试组件
import TTSEnhancerModal from '@/components/TTSEnhancerModal'; // Import the new modal component
import GroupDialog from '@/components/GroupDialog';
import GroupInput from '@/components/GroupInput';
import GroupManagementModal from '@/components/GroupManagementModal';
import { Group, GroupMessage, getUserGroups, getGroupMessages, sendGroupMessage } from '@/src/group';
import { Message, Character, ChatSave } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext'; // 添加 useUser 导入
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TopBarWithBackground from '@/components/TopBarWithBackground';
import { NodeSTManager } from '@/utils/NodeSTManager';  // 导入 NodeSTManager
import { EventRegister } from 'react-native-event-listeners';
import { MemoryProvider } from '@/src/memory/providers/MemoryProvider';
import Mem0Initializer from '@/src/memory/components/Mem0Initializer';
import '@/src/memory/utils/polyfills';
import Mem0Service from '@/src/memory/services/Mem0Service';
import { ttsService } from '@/services/ttsService';
import { useDialogMode } from '@/constants/DialogModeContext';
import { CharacterLoader } from '@/src/utils/character-loader'; // Import CharacterLoader

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
  const router = useRouter();
  const params = useLocalSearchParams();
  const characterId = params.characterId as string;
  const { user } = useUser(); // 获取用户设置

  // Create animation value for sidebar content shift
  const contentSlideAnim = useRef(new Animated.Value(0)).current;
  // Add a new animation value for settings sidebar
  const settingsSlideAnim = useRef(new Animated.Value(0)).current;
  const SIDEBAR_WIDTH = 280; // Match the sidebar width

  // Create a stable memory configuration that won't change on every render
  const memoryConfig = useMemo(() => createStableMemoryConfig(user), []);

  // 简化状态管理，只保留必要的状态
  const {
    conversations,
    characters,
    getMessages,
    addMessage,
    clearMessages,
  } = useCharacters();
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Group-related state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const [isGroupManageModalVisible, setIsGroupManageModalVisible] = useState(false);
  const [disbandedGroups, setDisbandedGroups] = useState<string[]>([]);

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
  const { mode } = useDialogMode();

  // Add new ref for video component
  const videoRef = useRef<Video | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Add new state to track regenerating message
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);

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

  const handleSendMessage = async (newMessage: string, sender: 'user' | 'bot', isLoading = false) => {
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
    } else {
      // Don't capture scroll position before sending a message
      // This avoids interfering with natural message flow
      
      const messageId = await sendMessageInternal(newMessage, sender, isLoading);
      
      // When message is sent, update messages state but don't manipulate scroll
      if (selectedConversationId) {
        const updatedMessages = getMessages(selectedConversationId);
        // Create new array reference to ensure state update
        setMessages([...updatedMessages]); 
      }
      
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
        character: selectedCharacter || undefined
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

  // 监听 messagesMap 的变化, 移除多余的本地状态更新
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

  // 修改处理图像的函数
  const handleImageGenerated = async (imageUrl: string, taskId?: string) => {
    // If in preview mode, exit first
    exitPreviewMode();

    if (!selectedConversationId) {
      console.warn('未选择对话，无法添加图片消息');
      return;
    }

    console.log('接收到生成的图片URL:', imageUrl.substring(0, 50) + '...');
    
    // 如果提供了任务ID，检查是否正在处理该任务
    if (taskId && processingTaskIds.current.has(taskId)) {
      console.log(`任务 ${taskId} 正在处理中，跳过重复处理`);
      return;
    }
    
    // 如果已经处理过这个URL，避免重复添加
    if (processedImageUrls.has(imageUrl)) {
      console.log('图片URL已经被处理过，跳过:', imageUrl.substring(0, 50) + '...');
      return;
    }
    
    try {
      // 如果提供了任务ID，标记为正在处理
      if (taskId) {
        processingTaskIds.current.add(taskId);
      }
      
      // 创建图像消息
      let imageMessage: string;
      
      // 直接使用图像URL
      if (imageUrl.startsWith('http')) {
        // 如果是HTTP URL，使用基本的markdown图片语法
        imageMessage = `![NovelAI生成的图像](${imageUrl})`;
      } else if (imageUrl.length > 200000) {
        // 如果是非常大的data URL，提供警告
        imageMessage = `[NovelAI生成了一张图像，但数据量太大无法直接显示。点击查看](${imageUrl})`;
      } else {
        // 普通data URL
        imageMessage = `![NovelAI生成的图像](${imageUrl})`;
      }
      
      // 添加消息
      console.log('添加NovelAI图片到对话', selectedConversationId);
      await handleSendMessage(imageMessage, 'bot');
      
      // 将URL添加到已处理集合中
      setProcessedImageUrls(prev => new Set([...prev, imageUrl]));
      
      // 如果任务处理完成，从处理中集合移除
      if (taskId) {
        processingTaskIds.current.delete(taskId);
      }
    } catch (error) {
      console.error('添加图片消息失败:', error);
      // 确保即使出错也从处理中集合移除任务
      if (taskId) {
        processingTaskIds.current.delete(taskId);
      }
    }
  };

  const selectedCharacter: Character | undefined | null = selectedConversationId ? characters.find((char: Character) => char.id === selectedConversationId) : null;

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
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

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
        
        // If conversation has messages, mark first message as sent
        // This prevents duplicate first messages when switching characters
        if (characterMessages.length > 0) {
          firstMessageSentRef.current[characterId] = true;
          console.log(`[Index] Marking first message as sent for conversation ${characterId} with existing messages`);
        }
      } else {
        console.warn('[Index] Character not found in characters array:', characterId);
      }
      
      setIsSidebarVisible(false); // Ensure sidebar is closed
    }
  }, [characterId, characters, getMessages]);

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
    if (selectedCharacter?.backgroundImage) {
      return { uri: selectedCharacter.backgroundImage };
    } else if (selectedCharacter?.backgroundImage) {
      // 如果没有专门的聊天背景图，则使用普通背景图
      return { uri: selectedCharacter.backgroundImage };
    }
    return require('@/assets/images/default-background.jpg');
  };

  // Update handleResetConversation to send first_mes after reset
  const handleResetConversation = async () => {
    if (selectedConversationId) {
      // Reset the conversation
      await clearMessages(selectedConversationId);
      
      // Clear the "first message sent" flag for this conversation
      if (firstMessageSentRef.current[selectedConversationId]) {
        delete firstMessageSentRef.current[selectedConversationId];
      }
      
      // After a short delay, trigger the first message effect
      setTimeout(() => {
        if (selectedCharacter?.jsonData) {
          try {
            const characterData = JSON.parse(selectedCharacter.jsonData);
            if (characterData.roleCard?.first_mes) {
              addMessage(selectedConversationId, {
                id: `first-reset-${Date.now()}`,
                text: characterData.roleCard.first_mes,
                sender: 'bot',
                timestamp: Date.now()
              });
              firstMessageSentRef.current[selectedConversationId] = true;
              
              // Reset auto-message timer
              lastMessageTimeRef.current = Date.now();
              setupAutoMessageTimer();
            }
          } catch (e) {
            console.error('Error adding first message after reset:', e);
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
    if (!autoMessageEnabled || !selectedCharacter?.id || waitingForUserReplyRef.current) {
      console.log(`[App] Auto message timer not set: enabled=${autoMessageEnabled}, hasCharacter=${!!selectedCharacter}, waitingForUserReply=${waitingForUserReplyRef.current}`);
      return;
    }

    // Check character-specific settings:
    // 1. autoMessage must be explicitly enabled
    if (selectedCharacter.autoMessage !== true) {
      console.log('[App] Auto message disabled for this character in settings');
      return;
    }

    // Use character-specific interval or default to 5 minutes
    const interval = selectedCharacter.autoMessageInterval || 5;
    autoMessageIntervalRef.current = interval;

    // Set up new timer
    const intervalMs = autoMessageIntervalRef.current * 60 * 1000; // Convert minutes to ms
    
    console.log(`[App] Auto message timer set for ${autoMessageIntervalRef.current} minutes`);
    
    autoMessageTimerRef.current = setTimeout(async () => {
      console.log('[App] Auto message timer triggered');
      
      // Only send auto message if we have a selected character and conversation
      if (selectedCharacter && selectedConversationId) {
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
            character: selectedCharacter
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
            if (selectedCharacter.notificationEnabled === true) {
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
  }, [selectedCharacter, selectedConversationId, autoMessageEnabled, user?.settings, messages]);

  // Update handleAutoMessageSettings function to properly handle state changes
  useEffect(() => {
    // Initialize auto message interval from character settings if available
    if (selectedCharacter) {
      const newAutoMessageEnabled = selectedCharacter.autoMessage === true;
      
      // Only log and update if the setting has actually changed
      if (autoMessageEnabled !== newAutoMessageEnabled) {
        console.log(`[App] Auto message setting changed to: ${newAutoMessageEnabled}`);
        setAutoMessageEnabled(newAutoMessageEnabled);
      }
      
      // Get the interval directly from the character settings
      autoMessageIntervalRef.current = selectedCharacter.autoMessageInterval || 5;
      
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
  }, [selectedCharacter, setupAutoMessageTimer]);

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
    if (selectedCharacter) {
      // Use explicit boolean check for autoMessage setting
      setAutoMessageEnabled(selectedCharacter.autoMessage === true);
      
      // Get the interval directly from the character settings
      autoMessageIntervalRef.current = selectedCharacter.autoMessageInterval || 5;
      
      setupAutoMessageTimer();
    }
    
    // Clean up timer on unmount or character change
    return () => {
      if (autoMessageTimerRef.current) {
        clearTimeout(autoMessageTimerRef.current);
        autoMessageTimerRef.current = null;
      }
    };
  }, [selectedCharacter, setupAutoMessageTimer]);

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
    
    // Add app state change listener
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        saveScrollPositions();
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
      console.log(`[App] Scroll position updated for ${characterId}: ${position}`);
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
        selectedCharacter?.id || "",
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
    if (!conversationId || !selectedCharacter?.id) return;
    
    try {
      const mem0Service = Mem0Service.getInstance();
      
      // Process memory through the Mem0Service
      await mem0Service.addChatMemory(
        text,
        'user',
        selectedCharacter.id,
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
  }, [selectedCharacter?.id]);

  // Add a new function to handle scrolling and loading more messages when needed
  const handleMessagePagination = useCallback((conversationId: string, page: number, pageSize: number) => {
    // This function would normally query a database or API for paginated messages
    // In our case, we're just working with local messages array
    
    // For now we're handling pagination in the ChatDialog component directly,
    // but this is where you'd add server-side pagination if needed in the future
    
    console.log(`[App] Message pagination requested: conversation=${conversationId}, page=${page}, pageSize=${pageSize}`);
    
    // Return all messages for now - the ChatDialog will handle the virtualization
    return Promise.resolve({
      messages: getMessages(conversationId),
      totalCount: getMessages(conversationId).length,
      hasMore: false
    });
  }, [getMessages]);

  const handleToggleGroupManage = () => {
    setIsGroupManageModalVisible(!isGroupManageModalVisible);
  };

  const selectedGroup = selectedGroupId ? groups.find(g => g.groupId === selectedGroupId) : null;

  const toggleMemoOverlay = () => {
    setIsMemoSheetVisible(!isMemoSheetVisible);
  };

  const characterIdForMemo = selectedConversationId || '';
  const conversationIdForMemo = selectedConversationId ? `conversation-${selectedConversationId}` : '';

  return (
    <View style={styles.outerContainer}>
      <StatusBar translucent backgroundColor="transparent" />

      <MemoryProvider config={memoryConfig}>
        <Mem0Initializer />
        
        {/* Background container remains static */}
        <View style={styles.backgroundContainer}>
          {!isGroupMode && selectedCharacter?.dynamicPortraitEnabled && selectedCharacter?.dynamicPortraitVideo ? (
            // Render video background if enabled and video exists
            <>
              <Video
                ref={videoRef}
                source={{ uri: selectedCharacter.dynamicPortraitVideo }}
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
                    source={selectedCharacter.backgroundImage 
                      ? { uri: selectedCharacter.backgroundImage } 
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
            // Render static background image if dynamic portrait is disabled or no video
            <ImageBackground
              source={isGroupMode 
                ? require('@/assets/images/group-chat-background.jpg') 
                : (selectedCharacter ? getBackgroundImage() : require('@/assets/images/default-background.jpg'))}
              style={styles.backgroundImage}
              resizeMode="cover"
            >
              {/* This empty View ensures the ImageBackground fills the container */}
              <View style={{flex: 1}} />
            </ImageBackground>
          )}
        </View>
        
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
        
        {/* SettingsSidebar moved outside the content container, positioned at the root level */}
        {selectedCharacter && (
          <SettingsSidebar
            isVisible={isSettingsSidebarVisible}
            onClose={toggleSettingsSidebar}
            selectedCharacter={selectedCharacter}
            animationValue={settingsSlideAnim}
          />
        )}
        
        {/* Everything else (content + topbar) gets animated together */}
        <Animated.View 
          style={[
            styles.contentMainContainer,
            {
              transform: [{ 
                translateX: Animated.add(
                  contentSlideAnim,
                  Animated.multiply(settingsSlideAnim, -1) // Negative value to move left
                ) 
              }],
              width: '100%',  // Ensure full width
            }
          ]}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidView}
          >
            <View style={[
              styles.container,
              (selectedCharacter || isGroupMode) ? styles.transparentBackground : styles.darkBackground
            ]}>
              <TopBarWithBackground
                selectedCharacter={!isGroupMode ? selectedCharacter : null}
                selectedGroup={isGroupMode ? selectedGroup : null}
                onAvatarPress={isGroupMode ? handleToggleGroupManage : handleAvatarPress}
                onMemoPress={() => setIsMemoSheetVisible(true)}
                onSettingsPress={toggleSettingsSidebar}
                onMenuPress={toggleSidebar}
                onSaveManagerPress={isGroupMode ? undefined : toggleSaveManager}
                showBackground={false}
                isGroupMode={isGroupMode}
                currentUser={user} // Pass current user for permission checks
                onGroupDisbanded={handleGroupDisbanded} // Pass the disband callback
                isEmpty={!isGroupMode && (!selectedCharacter || messages.length === 0)} // Pass empty state
              />

              <SafeAreaView style={[
                styles.safeArea,
                (selectedCharacter || isGroupMode) && styles.transparentBackground,
                mode === 'background-focus' && styles.backgroundFocusSafeArea
              ]}>
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
                  (selectedCharacter || isGroupMode) && styles.transparentBackground,
                  // Adjust container to accommodate different modes
                  mode === 'visual-novel' && !isGroupMode && styles.visualNovelContentContainer,
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
                      selectedCharacter={selectedCharacter}
                      onRateMessage={handleRateMessage}
                      onRegenerateMessage={handleRegenerateMessage}
                      savedScrollPosition={selectedCharacter?.id ? chatScrollPositions[selectedCharacter.id] : undefined}
                      onScrollPositionChange={handleScrollPositionChange}
                      messageMemoryState={messageMemoryState}
                      regeneratingMessageId={regeneratingMessageId}
                    />
                  )}
                </View>

                {/* Adjust input bar position for different modes */}
                <View style={[
                  styles.inputBar,
                  (selectedCharacter || isGroupMode) && styles.transparentBackground,
                  // Add specific styles for different modes (only in character chat mode)
                  mode === 'visual-novel' && !isGroupMode && styles.visualNovelInputBar,
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
                    selectedCharacter && (
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        selectedConversationId={selectedConversationId}
                        conversationId={selectedConversationId ? getCharacterConversationId(selectedConversationId) ?? '' : ''}
                        onResetConversation={handleResetConversation}
                        selectedCharacter={selectedCharacter}
                        // Pass search and TTS functionality to ChatInput
                        braveSearchEnabled={braveSearchEnabled}
                        toggleBraveSearch={toggleBraveSearch}
                        isTtsEnhancerEnabled={isTtsEnhancerEnabled}
                        onTtsEnhancerToggle={handleTtsEnhancerToggle}
                        onShowNovelAI={() => setIsNovelAITestVisible(true)}
                        onShowVNDB={() => setIsVNDBTestVisible(true)}
                        onShowMemoryPanel={toggleMemoryPanel}
                      />
                    )
                  )}
                </View>

                {/* Sidebars and overlays */}
                {isSettingsSidebarVisible && <View style={styles.modalOverlay} />}
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
              />
              
              {/* VNDB测试模态框 */}
              <VNDBTestModal
                visible={isVNDBTestVisible}
                onClose={() => setIsVNDBTestVisible(false)}
              />

              {/* NovelAI测试模态框 */}
              <NovelAITestModal
                visible={isNovelAITestVisible}
                onClose={() => setIsNovelAITestVisible(false)}
                onImageGenerated={handleImageGenerated}
              />
              
              {/* Save Manager */}
              {selectedCharacter && (
                <SaveManager
                  visible={isSaveManagerVisible}
                  onClose={() => setIsSaveManagerVisible(false)}
                  conversationId={selectedConversationId || ''}
                  characterId={selectedCharacter.id}
                  characterName={selectedCharacter.name}
                  characterAvatar={selectedCharacter.avatar || undefined}
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
      </MemoryProvider>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  // New styles for fixed background
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
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
});

export default App;