import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Modal,
  Alert,
  FlatList,
  Keyboard,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { Message, ChatDialogProps, User } from '@/shared/types';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { parseHtmlText, containsComplexHtml, optimizeHtmlForRendering } from '@/utils/textParser';
import { ratingService } from '@/services/ratingService';
import RichTextRenderer from '@/components/RichTextRenderer';
import ImageManager from '@/utils/ImageManager';
import { ttsService, AudioState } from '@/services/ttsService'; // Import the TTS service
import { useDialogMode } from '@/constants/DialogModeContext';

// Update ChatDialogProps interface in the file or in shared/types.ts to include messageMemoryState
interface ExtendedChatDialogProps extends ChatDialogProps {
  messageMemoryState?: Record<string, string>;
  regeneratingMessageId?: string | null; // Add this new prop
  user?: User | null; // Add user prop
}

const { width } = Dimensions.get('window');
// Adjust the maximum width to ensure proper margins
const MAX_WIDTH = width * 0.88; // Decreased from 0.9 to 0.88 to add more margin
const MAX_IMAGE_HEIGHT = 300; // Maximum height for images in chat

// Constants for virtualization
const INITIAL_LOAD_COUNT = 50; // Initial messages to show
const BATCH_SIZE = 5; // How many messages to load per batch when scrolling up

const ChatDialog: React.FC<ExtendedChatDialogProps> = ({
  messages,
  style,
  selectedCharacter,
  onRateMessage,
  onRegenerateMessage,
  savedScrollPosition,
  onScrollPositionChange,
  messageMemoryState = {}, // Default to empty object
  regeneratingMessageId = null, // Default to null
  user = null, // Add user prop with default
}) => {
  // Replace ScrollView ref with FlatList ref for virtualization
  const flatListRef = useRef<FlatList<Message>>(null);
  const fadeAnim = useSharedValue(0);
  const translateAnim = useSharedValue(0);
  const dot1Scale = useSharedValue(1);
  const dot2Scale = useSharedValue(1);
  const dot3Scale = useSharedValue(1);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenImageId, setFullscreenImageId] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [ratedMessages, setRatedMessages] = useState<Record<string, boolean>>({});
  
  // Add state to track scroll position for different conversations
  const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const isInitialScrollRestored = useRef(false);
  
  // Add state for TTS functionality
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  
  // Add state for TTS enhancer settings
  const [ttsEnhancerEnabled, setTtsEnhancerEnabled] = useState(false);
  
  // Get dialog mode from context
  const { mode, visualNovelSettings, isHistoryModalVisible, setHistoryModalVisible } = useDialogMode();
  
  // State to track last AI message for visual novel mode
  const [lastAiMessage, setLastAiMessage] = useState<Message | null>(null);
  
  // Add states for virtualized list
  const [virtualizedMessages, setVirtualizedMessages] = useState<Message[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessagesToLoad, setHasMoreMessagesToLoad] = useState(false);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleEndIndex, setVisibleEndIndex] = useState(0);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  // Add state to track user scroll behavior
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Add a ref to track if we're programmatically scrolling
  const isAutoScrollingRef = useRef(false);
  
  // Check TTS enhancer status when component mounts
  useEffect(() => {
    const checkTtsEnhancerStatus = () => {
      const settings = ttsService.getEnhancerSettings();
      setTtsEnhancerEnabled(settings.enabled);
    };
    
    checkTtsEnhancerStatus();
    
    // Set up interval to periodically check enhancer status
    const intervalId = setInterval(checkTtsEnhancerStatus, 5000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Update current conversation ID when it changes
  useEffect(() => {
    if (selectedCharacter?.id && selectedCharacter.id !== currentConversationId) {
      setCurrentConversationId(selectedCharacter.id);
      isInitialScrollRestored.current = false;
      setInitialScrollDone(false); // Reset initial scroll when conversation changes
    }
  }, [selectedCharacter?.id, currentConversationId]);

  // Optimize Messages dependency listening to ensure real-time updates
  useEffect(() => {
    if (messages.length === 0) {
      setVirtualizedMessages([]);
      setHasMoreMessagesToLoad(false);
      return;
    }

    // Ensure all messages have unique IDs before processing
    const processedMessages = messages.map(msg => {
      // If the message already has an ID, preserve it
      if (msg.id) return msg;
      
      // Generate a unique, stable ID for messages without one
      // Use content hash if possible to maintain stability across renders
      const contentHash = msg.text ? 
        msg.text.substring(0, 20).replace(/[^a-z0-9]/gi, '') : 
        'empty';
        
      return {
        ...msg,
        id: `gen-${msg.sender}-${msg.timestamp || Date.now()}-${contentHash}-${Math.random().toString(36).substring(2, 7)}`
      };
    });

    // Check if we're adding new messages or just getting an updated message array
    // This helps distinguish between actual new messages vs. settings changes
    const existingMessageIds = new Set(virtualizedMessages.map(m => m.id));
    const hasNewMessages = processedMessages.some(msg => !existingMessageIds.has(msg.id));
    const messageCountChanged = processedMessages.length !== virtualizedMessages.length;

    // Key fix: Only treat as "adding" if we have new messages that aren't in our current list
    const isAddingNewMessages = hasNewMessages && messageCountChanged && 
      processedMessages.length > virtualizedMessages.length;

    // Small message set - show all
    if (processedMessages.length <= INITIAL_LOAD_COUNT) {
      console.log(`[ChatDialog] Small message set (${processedMessages.length}), showing all messages`);
      setVirtualizedMessages(processedMessages);
      setHasMoreMessagesToLoad(false);
      return;
    }

    // Truly adding new messages - keep existing and append new ones
    if (isAddingNewMessages) {
      console.log(`[ChatDialog] New messages detected (${processedMessages.length - virtualizedMessages.length}), appending`);
      
      // Find messages that aren't in our current virtualized list
      const newMessages = processedMessages.filter(msg => !existingMessageIds.has(msg.id));
      
      // Append only the new messages to avoid duplicates
      setVirtualizedMessages(prev => [...prev, ...newMessages]);
      return;
    }
    
    // User has scrolled and viewed history - preserve their position and context
    if (userHasScrolled && virtualizedMessages.length > INITIAL_LOAD_COUNT) {
      // For non-additive changes (like settings change), verify we don't duplicate messages
      // by comparing the entire arrays instead of just length
      
      // Create ID sets for quick comparison
      const currentIds = new Set(virtualizedMessages.map(msg => msg.id));
      const processedIds = new Set(processedMessages.map(msg => msg.id));
      
      // If we have the same IDs in both arrays (regardless of order), keep the current view
      const hasSameMessages = 
        currentIds.size === processedIds.size && 
        [...currentIds].every(id => processedIds.has(id));
        
      if (hasSameMessages) {
        console.log(`[ChatDialog] Settings changed but messages are the same, preserving state`);
        return; // Don't update state if the messages are the same
      }
      
      console.log(`[ChatDialog] Messages changed significantly, updating view`);
    }

    // Standard initialization for large conversations
    const totalCount = processedMessages.length;
    const endIdx = totalCount;
    const startIdx = Math.max(0, totalCount - INITIAL_LOAD_COUNT);
    
    console.log(`[ChatDialog] Standard initialization with ${endIdx - startIdx} messages`);
    
    setVirtualizedMessages(processedMessages.slice(startIdx, endIdx));
    setHasMoreMessagesToLoad(startIdx > 0);
    
    // Reset scroll position when messages change significantly
    setInitialScrollDone(false);
  }, [messages, userHasScrolled]);

  // Improved logic for loading more messages
  const loadMoreMessages = useCallback(() => {
    if (isLoadingMore || !hasMoreMessagesToLoad || messages.length === 0) return;
    
    setIsLoadingMore(true);
    console.log(`[ChatDialog] Starting to load more messages. Current count: ${virtualizedMessages.length}`);
    
    // Get the first message ID from current virtualized list to find its position in the full list
    const firstVisibleMessageId = virtualizedMessages.length > 0 ? virtualizedMessages[0].id : null;
    
    if (!firstVisibleMessageId) {
      setIsLoadingMore(false);
      return;
    }
    
    // Find the index of the first visible message in the full message array
    const firstVisibleIndex = messages.findIndex(msg => msg.id === firstVisibleMessageId);
    
    if (firstVisibleIndex <= 0) {
      console.log(`[ChatDialog] Could not find first visible message in full list, or it's already at position 0`);
      setIsLoadingMore(false);
      setHasMoreMessagesToLoad(false);
      return;
    }
    
    // Calculate the range of additional messages to load
    const newStartIndex = Math.max(0, firstVisibleIndex - BATCH_SIZE);
    const additionalMessages = messages.slice(newStartIndex, firstVisibleIndex);
    
    console.log(`[ChatDialog] Loading ${additionalMessages.length} more messages (${newStartIndex}-${firstVisibleIndex} of ${messages.length})`);
    
    // If no additional messages to load, exit early
    if (additionalMessages.length === 0) {
      setIsLoadingMore(false);
      setHasMoreMessagesToLoad(false);
      return;
    }
    
    // Remember the current first message for maintaining scroll position later
    const firstItem = virtualizedMessages[0];
    
    // Ensure each message has a unique ID to prevent key duplication errors
    const processedAdditionalMessages = additionalMessages.map(msg => {
      // If the message already has an ID, use it directly
      if (msg.id) return msg;
      
      // Otherwise, generate a new unique ID
      return {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      };
    });
    
    // Add the additional messages to the beginning of the virtualized list
    setTimeout(() => {
      setVirtualizedMessages(prev => {
        // Create a Set to store existing message IDs for duplicate checking
        const existingIds = new Set(prev.map(msg => msg.id));
        
        // Filter out messages with duplicate IDs
        const uniqueNewMessages = processedAdditionalMessages.filter(msg => !existingIds.has(msg.id));
        
        // Merge new messages and existing messages
        return [...uniqueNewMessages, ...prev];
      });
      
      setHasMoreMessagesToLoad(newStartIndex > 0);
      
      // Stop loading state and maintain position after a short delay
      setTimeout(() => {
        setIsLoadingMore(false);
        
        // If there were previous messages, scroll to maintain relative position
        if (firstItem && flatListRef.current && processedAdditionalMessages.length > 0) {
          // Find the index of the previous first message in the new list
          const maintainIndex = processedAdditionalMessages.length;
          
          console.log(`[ChatDialog] Scrolling to maintain position at index ${maintainIndex}`);
          
          try {
            flatListRef.current.scrollToIndex({
              index: maintainIndex,
              animated: false,
              viewPosition: 0, // 0 is top, 0.5 is middle, 1 is bottom
            });
          } catch (error) {
            console.error('[ChatDialog] Error scrolling to index:', error);
            
            // Fallback solution: use scrollToItem
            try {
              if (firstItem) {
                flatListRef.current.scrollToItem({
                  item: firstItem,
                  animated: false,
                  viewPosition: 0
                });
              }
            } catch (fallbackError) {
              console.error('[ChatDialog] Fallback scroll also failed:', fallbackError);
            }
          }
        }
      }, 100);
    }, 300);
  }, [isLoadingMore, hasMoreMessagesToLoad, messages, virtualizedMessages]);

  // Handle visible items change for FlatList
  const handleViewableItemsChanged = useCallback(({viewableItems}: {viewableItems: any[]}) => {
    if (viewableItems.length > 0) {
      setVisibleStartIndex(viewableItems[0].index);
      setVisibleEndIndex(viewableItems[viewableItems.length - 1].index);
    }
  }, []);

  // 添加新的滚动至顶部检测，更可靠地触发加载更多
  const handleUserScroll = (event: any) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    
    // Only register as user scroll if it's not from our programmatic scrolling
    if (!isAutoScrollingRef.current) {
      setUserHasScrolled(true);
    }
    
    // 检测是否滚动到了顶部附近
    if (yOffset < 50 && !isLoadingMore && hasMoreMessagesToLoad) {
      console.log('[ChatDialog] Near top, loading more messages');
      loadMoreMessages();
    }
    
    // Improved bottom detection - consider more area as "bottom"
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;
    
    // Consider user at bottom if they're within 150px of the bottom
    const isCloseToBottom = contentHeight - yOffset - scrollViewHeight < 150;
    
    if (isNearBottom !== isCloseToBottom) {
      setIsNearBottom(isCloseToBottom);
      console.log(`[ChatDialog] Near bottom status changed to: ${isCloseToBottom}`);
    }
    
    // 原有的滚动位置跟踪逻辑
    if (currentConversationId) {
      setScrollPositions(prev => ({
        ...prev,
        [currentConversationId]: yOffset
      }));
      
      // Report scroll position to parent if callback provided
      if (onScrollPositionChange) {
        onScrollPositionChange(currentConversationId, yOffset);
      }
    }
  };

  const handleScroll = handleUserScroll;

  // Animate new messages
  useEffect(() => {
    fadeAnim.value = withTiming(1, { duration: 300 });
    translateAnim.value = withTiming(0, { duration: 300 });
  }, [virtualizedMessages, fadeAnim, translateAnim]);

  const messagesAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: fadeAnim.value,
      transform: [{ translateY: translateAnim.value }]
    };
  });

  const animateDots = () => {
    const setupDotAnimation = (dotScale: Animated.SharedValue<number>, delay: number) => {
      dotScale.value = withDelay(
        delay,
        withSequence(
          withTiming(1.5, { duration: 300 }),
          withTiming(1, { duration: 300 })
        )
      );
    };
    
    setupDotAnimation(dot1Scale, 0);
    setupDotAnimation(dot2Scale, 200);
    setupDotAnimation(dot3Scale, 400);
    
    const interval = setInterval(() => {
      setupDotAnimation(dot1Scale, 0);
      setupDotAnimation(dot2Scale, 200);
      setupDotAnimation(dot3Scale, 400);
    }, 1200);
    
    return () => clearInterval(interval);
  };
  
  useEffect(() => {
    const cleanup = animateDots();
    return cleanup;
  }, []);
  
  const dot1Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot1Scale.value }]
  }));
  
  const dot2Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot2Scale.value }]
  }));
  
  const dot3Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot3Scale.value }]
  }));

  // Completely replace the auto-scroll logic with a much simpler version
  useEffect(() => {
    // Only scroll to bottom on initial load or when a new message arrives
    // and the user hasn't scrolled up yet
    if (virtualizedMessages.length > 0 && !isLoadingMore && !userHasScrolled) {
      console.log('[ChatDialog] Initial load or new message while at bottom - scrolling to bottom');
      
      // Set the auto-scrolling flag to avoid interference with user scrolling
      isAutoScrollingRef.current = true;
      
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: false });
        }
        
        // Reset the flag after scrolling
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 100);
      }, 50);
    }
  }, [virtualizedMessages.length, isLoadingMore, userHasScrolled]);

  // Update audio states when they change in the service
  const updateAudioState = (messageId: string) => {
    const state = ttsService.getAudioState(messageId);
    setAudioStates(prev => ({
      ...prev,
      [messageId]: state
    }));
  };
  
  // Handle TTS button press
  const handleTTSButtonPress = async (messageId: string, text: string) => {
    try {
      // Get the template ID from the selected character, falling back to a default if not set
      const templateId = selectedCharacter?.voiceType || 'template1';
      
      console.log(`[ChatDialog] Using voice template: ${templateId} for character: ${selectedCharacter?.name}`);
      
      // Update UI immediately to show loading state
      setAudioStates(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          isLoading: true,
          error: null
        }
      }));
      
      // Generate TTS for this message with the character's voice template
      const result = await ttsService.generateTTS(messageId, text, templateId);
      
      // Update the audio state based on the result
      updateAudioState(messageId);
      
      // Auto-play the audio if generation was successful
      if (result.hasAudio && !result.error) {
        await handlePlayAudio(messageId);
      } else if (result.error) {
        // Only show an error alert if there was a definite error (not just still processing)
        if (result.error !== 'Audio generation timed out after 30 seconds') {
          Alert.alert('语音生成失败', '无法生成语音，请稍后再试。');
        }
      }
    } catch (error) {
      console.error('Failed to generate TTS:', error);
      // Update local state to show error
      setAudioStates(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          isLoading: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }));
    }
  };
  
  // Handle play audio button press
  const handlePlayAudio = async (messageId: string) => {
    try {
      const state = ttsService.getAudioState(messageId);
      
      if (state.isPlaying) {
        // If already playing, stop it
        await ttsService.stopAudio(messageId);
      } else {
        // Otherwise start playback
        await ttsService.playAudio(messageId);
      }
      
      // Update state after action
      updateAudioState(messageId);
    } catch (error) {
      console.error('Failed to play audio:', error);
      Alert.alert('播放失败', '无法播放语音，请稍后再试。');
    }
  };
  
  // Clean up audio resources when component unmounts
  useEffect(() => {
    return () => {
      ttsService.cleanup();
    };
  }, []);

  const renderEmptyState = () => {
    return (
      <View style={styles.emptyStateContainer}>
        <Image
          source={
            selectedCharacter?.avatar
              ? { uri: String(selectedCharacter.avatar) }
              : require('@/assets/images/default-avatar.png')
          }
          style={styles.emptyStateAvatar}
        />
        <Text style={styles.emptyStateTitle}>
          {selectedCharacter
            ? `开始与 ${selectedCharacter.name} 的对话`
            : '选择一个角色开始对话'}
        </Text>
        <Text style={styles.emptyStateSubtitle}>
          {selectedCharacter
            ? '发送一条消息，开始聊天吧！'
            : '点击左上角菜单选择角色'}
        </Text>
      </View>
    );
  };

  const renderTimeGroup = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return (
      <View style={styles.timeGroup}>
        <Text style={styles.timeText}>{`${hours}:${minutes}`}</Text>
      </View>
    );
  };

  // Add function to detect custom tags in messages
  const containsCustomTags = (text: string): boolean => {
      return /(<\s*(thinking|think|status|mem|websearch|char-think|StatusBlock|statusblock|font)[^>]*>[\s\S]*?<\/\s*(thinking|think|status|mem|websearch|char-think|StatusBlock|statusblock|font)\s*>)/i.test(text);
   };

  // 检测并处理消息中的图片链接
  const processMessageContent = (text: string, isUser: boolean) => {
    // If text is empty, return a placeholder
    if (!text || text.trim() === '') {
      return (
        <Text style={isUser ? styles.userMessageText : styles.botMessageText}>
          (Empty message)
        </Text>
      );
    }

    // Check if text contains custom tags like <mem>, <websearch>, etc.
    if (containsCustomTags(text)) {
      return (
        <RichTextRenderer
          html={optimizeHtmlForRendering(text)}
          baseStyle={isUser ? styles.userMessageText : styles.botMessageText}
          onImagePress={(url) => setFullscreenImage(url)}
          maxImageHeight={MAX_IMAGE_HEIGHT}
        />
      );
    }

    // Check if text is raw markdown for an image with our special image:id format
    const rawImageMarkdownRegex = /^!\[(.*?)\]\(image:([a-f0-9]+)\)$/;
    const rawImageMatch = text.trim().match(rawImageMarkdownRegex);
    
    if (rawImageMatch) {
      // This is a raw image markdown string, extract the parts and render directly
      const alt = rawImageMatch[1] || "图片";
      const imageId = rawImageMatch[2];
      
      const imageInfo = ImageManager.getImageInfo(imageId);
      if (imageInfo) {
        return (
          <View style={styles.imageWrapper}>
            <TouchableOpacity
              style={styles.imageContainer}
              onPress={() => handleOpenFullscreenImage(imageId)}
            >
              <Image
                source={{ uri: imageInfo.thumbnailPath }}
                style={styles.messageImage}
                resizeMode="contain"
                onError={(e) => console.error(`Error loading image: ${e.nativeEvent.error}`, imageInfo.thumbnailPath)}
              />
            </TouchableOpacity>
            <Text style={styles.imageCaption}>{alt}</Text>
          </View>
        );
      } else {
        console.error(`No image info found for ID: ${imageId}`);
        return (
          <View style={styles.imageError}>
            <Ionicons name="alert-circle" size={36} color="#e74c3c" />
            <Text style={styles.imageErrorText}>图片无法加载 (ID: {imageId.substring(0, 8)}...)</Text>
          </View>
        );
      }
    }

    // More comprehensive check for custom tags with various formats and spaces
    const hasCustomTags = (
      /<\s*(thinking|think|status|mem|websearch)[^>]*>([\s\S]*?)<\/\s*(thinking|think|status|mem|websearch)\s*>/i.test(text) || 
      /<\s*char\s+think\s*>([\s\S]*?)<\/\s*char\s+think\s*>/i.test(text)
    );
    
    const hasMarkdown = /```[\w]*\s*([\s\S]*?)```/.test(text) || 
                       /!\[[\s\S]*?\]\([\s\S]*?\)/.test(text) ||
                       /\*\*([\s\S]*?)\*\*/.test(text) ||
                       /\*([\s\S]*?)\*/.test(text);

    // Check for HTML content or interactive elements
    const hasHtml = /<\/?[a-z][^>]*>/i.test(text);
    


    // First, check for image markdown with our special format
    const imageIdRegex = /!\[(.*?)\]\(image:([^\s)]+)\)/g;
    let match: RegExpExecArray | null;
    const matches: { alt: string, id: string }[] = [];
    
    while ((match = imageIdRegex.exec(text)) !== null) {
      matches.push({
        alt: match[1] || "图片",
        id: match[2]
      });
    }
    
    // If we found image:id format, render them directly
    if (matches.length > 0) {
      // Debug image paths
      console.log(`Found ${matches.length} images with IDs in message`);

      return (
        <View>
          {matches.map((img, idx) => {
            const imageInfo = ImageManager.getImageInfo(img.id);
            console.log(`Image ${idx} ID: ${img.id}, info:`, imageInfo);

            if (imageInfo) {
              return (
                <TouchableOpacity 
                  key={idx}
                  style={styles.imageWrapper}
                  onPress={() => handleOpenFullscreenImage(img.id)}
                >
                  <Image
                    source={{ uri: imageInfo.thumbnailPath }}
                    style={styles.messageImage}
                    resizeMode="contain"
                    onError={(e) => console.error(`Error loading image: ${e.nativeEvent.error}`, imageInfo.thumbnailPath)}
                  />
                  <Text style={styles.imageCaption}>{img.alt}</Text>
                </TouchableOpacity>
              );
            } else {
              console.error(`No image info found for ID: ${img.id}`);
              return (
                <View key={idx} style={styles.imageError}>
                  <Ionicons name="alert-circle" size={36} color="#e74c3c" />
                  <Text style={styles.imageErrorText}>图片无法加载 (ID: {img.id.substring(0, 8)}...)</Text>
                </View>
              );
            }
          })}
        </View>
      );
    }

    // Handle image markdown with our custom image:id syntax
    const imageMarkdownRegex = /!\[(.*?)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
    let urlMatches: { alt: string, url: string }[] = [];
    
    // Reset lastIndex for regex since we're reusing it
    imageMarkdownRegex.lastIndex = 0;
    
    while ((match = imageMarkdownRegex.exec(text)) !== null) {
      urlMatches.push({
        alt: match[1] || "图片",
        url: match[2]
      });
    }
    
    // 如果找到图片链接
    if (urlMatches.length > 0) {
      console.log(`Found ${urlMatches.length} images with URLs in message`);
      
      return (
        <View>
          {urlMatches.map((img, idx) => {
            // 检查是否为数据 URL 或 HTTP URL
            const isDataUrl = img.url.startsWith('data:');
            const isLargeDataUrl = isDataUrl && img.url.length > 100000;
            
            console.log(`Image ${idx} URL type: ${isDataUrl ? 'data URL' : 'HTTP URL'}, large: ${isLargeDataUrl}`);
            
            // 处理大型数据 URL
            if (isLargeDataUrl) {
              return (
                <View key={idx} style={styles.imageWrapper}>
                  <TouchableOpacity
                    style={styles.imageDataUrlWarning}
                    onPress={() => setFullscreenImage(img.url)}
                  >
                    <Ionicons name="image" size={36} color="#999" />
                    <Text style={styles.imageDataUrlWarningText}>
                      {img.alt} (点击查看)
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }
            
            // 正常显示图片，包括 HTTP URL 和小型数据 URL
            return (
              <TouchableOpacity 
                key={idx}
                style={styles.imageWrapper}
                onPress={() => setFullscreenImage(img.url)}
              >
                <Image
                  source={{ uri: img.url }}
                  style={styles.messageImage}
                  resizeMode="contain"
                  onError={(e) => console.error(`Error loading image URL: ${e.nativeEvent.error}`)}
                />
                <Text style={styles.imageCaption}>{img.alt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }
    
    // 检查是否是普通的链接说明
    const linkRegex = /\[(.*?)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
    let linkMatches: { text: string, url: string }[] = [];
    
    while ((match = linkRegex.exec(text)) !== null) {
      linkMatches.push({
        text: match[1],
        url: match[2]
      });
    }
    
    // 如果找到链接
    if (linkMatches.length > 0) {
      return (
        <View>
          {linkMatches.map((link, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.linkButton}
              onPress={() => {
                if (typeof window !== 'undefined') {
                  window.open(link.url, '_blank');
                } else {
                  setFullscreenImage(link.url);
                }
              }}
            >
              <Ionicons name="link" size={16} color="#3498db" style={styles.linkIcon} />
              <Text style={styles.linkText}>{link.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    
    // 处理普通文本
    return renderMessageText(text, isUser);
  };

  const renderMessageText = (text: string, isUser: boolean) => {
    const segments = parseHtmlText(text);
    return (
      <Text style={isUser ? styles.userMessageText : styles.botMessageText}>
        {segments.map((segment, index) => (
          <Text key={index} style={segment.style}>
            {segment.text}
          </Text>
        ))}
      </Text>
    );
  };

  // Count the number of AI messages up to a specific index and assign proper aiIndex values
  const getAiMessageIndex = (index: number): number => {
    // First check if the message at this index has a stored aiIndex in metadata
    const message = virtualizedMessages[index];
    if (message?.metadata?.aiIndex !== undefined) {
      console.log(`[ChatDialog] Using stored aiIndex: ${message.metadata.aiIndex}`);
      return message.metadata.aiIndex;
    }
    
    // If no stored index, calculate it by counting previous AI messages
    let aiMessageCount = 0;
    for (let i = 0; i <= index; i++) {
      if (virtualizedMessages[i].sender === 'bot' && !virtualizedMessages[i].isLoading) {
        aiMessageCount++;
      }
    }
    
    const calculatedIndex = aiMessageCount - 1; // 0-based index
    console.log(`[ChatDialog] Calculated aiIndex: ${calculatedIndex}`);
    return calculatedIndex;
  };

  // Check if a message has been rated
  const getMessageRating = (messageId: string): boolean | null => {
    if (messageId in ratedMessages) {
      return ratedMessages[messageId];
    }
    return null; // Not rated
  };

  // Render TTS buttons for a message
  const renderTTSButtons = (message: Message) => {
    // Only show TTS buttons for bot messages
    if (message.sender !== 'bot' || message.isLoading) return null;

    const audioState = audioStates[message.id] || ttsService.getAudioState(message.id);
    const isVisualNovel = mode === 'visual-novel';

    // Use 米黄色 for TTS button background
    const ttsButtonBg = { backgroundColor: '#FFE0C3' };
    const ttsButtonEnhancedBg = { backgroundColor: '#FFD580' };

    return (
      <View style={isVisualNovel ? styles.visualNovelTTSContainer : styles.ttsButtonContainer}>
        {audioState.isLoading ? (
          <View style={isVisualNovel ? styles.visualNovelTTSButtonWithLabel : styles.ttsButtonWithLabel}>
            <View style={[
              isVisualNovel ? styles.visualNovelTTSButton : styles.ttsButton,
              ttsButtonBg
            ]}>
              <ActivityIndicator size="small" color="black" />
            </View>
            {!isVisualNovel && <Text style={styles.ttsLoadingText}>生成中...</Text>}
          </View>
        ) : audioState.hasAudio ? (
          <TouchableOpacity
            style={[
              isVisualNovel ? styles.visualNovelTTSButton : styles.ttsButton,
              audioState.isPlaying && (isVisualNovel ? styles.visualNovelTTSButtonActive : styles.ttsButtonActive),
              ttsButtonBg,
              ttsEnhancerEnabled && ttsButtonEnhancedBg
            ]}
            onPress={() => handlePlayAudio(message.id)}
          >
            {audioState.isPlaying ? (
              <Ionicons name="pause" size={isVisualNovel ? 22 : 18} color="black" />
            ) : audioState.isComplete ? (
              <Ionicons name="refresh" size={isVisualNovel ? 22 : 18} color="black" />
            ) : (
              <Ionicons name="play" size={isVisualNovel ? 22 : 18} color="black" />
            )}
            {ttsEnhancerEnabled && (
              <View style={isVisualNovel ? styles.visualNovelTTSEnhancerIndicator : styles.ttsEnhancerIndicator}>
                <Ionicons name="sparkles-outline" size={isVisualNovel ? 12 : 10} color="black" />
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              isVisualNovel ? styles.visualNovelTTSButton : styles.ttsButton,
              ttsButtonBg,
              ttsEnhancerEnabled && ttsButtonEnhancedBg
            ]}
            onPress={() => handleTTSButtonPress(message.id, message.text)}
          >
            <Ionicons name="volume-high" size={isVisualNovel ? 22 : 18} color="black" />
            {ttsEnhancerEnabled && (
              <View style={isVisualNovel ? styles.visualNovelTTSEnhancerIndicator : styles.ttsEnhancerIndicator}>
                <Ionicons name="sparkles-outline" size={isVisualNovel ? 12 : 10} color="black" />
              </View>
            )}
          </TouchableOpacity>
        )}
        {audioState.error && !audioState.isLoading && !audioState.hasAudio && !isVisualNovel && (
          <TouchableOpacity 
            style={styles.ttsRetryButton}
            onPress={() => handleTTSButtonPress(message.id, message.text)}
          >
            <Ionicons name="refresh" size={16} color="#ff6666" />
            <Text style={styles.ttsErrorText}>重试</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Add state for memory tooltips
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);




  const renderMessageContent = (message: Message, isUser: boolean, index: number) => {
    return (
      <View style={[
        styles.messageContent,
        isUser ? styles.userMessageContent : styles.botMessageContent,
        message.isLoading && styles.loadingMessage
      ]}>
        {/* AI avatar on left */}
        {!isUser && (
          <Image
            source={
              selectedCharacter?.avatar
                ? { uri: String(selectedCharacter.avatar) }
                : require('@/assets/images/default-avatar.png')
            }
            style={styles.messageAvatar}
          />
        )}
        {isUser ? (
          <View style={styles.userMessageWrapper}>
            {/* User message bubble */}
            <LinearGradient
              colors={['rgba(255, 224, 195, 0.95)', 'rgba(255, 200, 170, 0.95)']}
              style={styles.userGradient}
            >
              {processMessageContent(message.text, true)}

            </LinearGradient>
            {/* User avatar on right-top */}
            {user?.avatar && (
              <Image
                source={{ uri: String(user.avatar) }}
                style={styles.userMessageAvatar}
              />
            )}
          </View>
        ) : (
          <View style={styles.botMessageTextContainer}>
            {message.isLoading ? (
              <View style={styles.loadingContainer}>
                <Animated.View style={[styles.loadingDot, dot1Style]} />
                <Animated.View style={[styles.loadingDot, dot2Style]} />
                <Animated.View style={[styles.loadingDot, dot3Style]} />
              </View>
            ) : (
              processMessageContent(message.text, false)
            )
            }
            {!message.isLoading && !isUser && renderMessageActions(message, index)}
          </View>
        )}
      </View>
    );
  };

  // Render message actions (rating buttons and regenerate button)
  const renderMessageActions = (message: Message, index: number) => {
    if (message.isLoading) return null;
    
    // Check if this is the most recent AI message
    const isLastAIMessage = isMessageLastAIMessage(message, index);
    
    const messageRating = getMessageRating(message.id);
    const isRegenerating = regeneratingMessageId === message.id;
    
    return (
      <View style={styles.messageActions}>
        {/* Add TTS buttons */}
        {message.sender === 'bot' && renderTTSButtons(message)}
        
        {/* Only show regenerate button for the last AI message
        {onRegenerateMessage && isLastAIMessage && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              isRegenerating && styles.regeneratingButton // Add special style for regenerating state
            ]}
            onPress={() => {
              if (!isRegenerating) { // Only allow clicking if not already regenerating
                // Get the stored or calculated AI message index
                const aiIndex = getAiMessageIndex(index);
                onRegenerateMessage(message.id, aiIndex);
              }
            }}
            disabled={isRegenerating} // Disable the button when regenerating
          >
            {isRegenerating ? (
              // Show activity indicator when regenerating
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="refresh-circle-outline" size={22} color="#ddd" />
            )}
          </TouchableOpacity>
        )} */}
        
        {/* Rating buttons */}
        {onRateMessage && (
          <>
            <TouchableOpacity
              style={[
                styles.rateButton, 
                messageRating === true && styles.rateButtonActive
              ]}
              onPress={() => onRateMessage(message.id, true)}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={messageRating === true ? "thumbs-up" : "thumbs-up-outline"} 
                size={20} 
                color={messageRating === true ? theme.colors.primary : "#ddd"} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.rateButton, 
                messageRating === false && styles.rateButtonActive
              ]}
              onPress={() => onRateMessage(message.id, false)}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={messageRating === false ? "thumbs-down" : "thumbs-down-outline"}
                size={20} 
                color={messageRating === false ? "#e74c3c" : "#ddd"} 
              />
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  // Add a new helper function to check if a message is the last AI message
  const isMessageLastAIMessage = (message: Message, index: number): boolean => {
    // Only AI messages can be regenerated
    if (message.sender !== 'bot' || message.isLoading) return false;
    
    // Check if there are any non-loading AI messages after this one
    for (let i = index + 1; i < virtualizedMessages.length; i++) {
      const laterMessage = virtualizedMessages[i];
      if (laterMessage.sender === 'bot' && !laterMessage.isLoading) {
        // Found a later AI message, so current message is not the last one
        return false;
      }
    }
    
    // No later AI messages found, this is the last one
    return true;
  };

  // New function to handle opening a fullscreen image by ID
  const handleOpenFullscreenImage = (imageId: string | null) => {
    if (imageId) {
      setFullscreenImageId(imageId);
      const imageInfo = ImageManager.getImageInfo(imageId);
      
      if (imageInfo) {
        console.log(`Opening fullscreen image: ${imageId}`);
        console.log(`Thumbnail path: ${imageInfo.thumbnailPath}`);
        console.log(`Original path: ${imageInfo.originalPath}`);
        
        // First set the thumbnail to show immediately while the full one loads
        setFullscreenImage(imageInfo.thumbnailPath);
        setImageLoading(true);
        
        // Then after a short delay, load the high-res original image
        setTimeout(() => {
          setFullscreenImage(imageInfo.originalPath);
          setImageLoading(false);
        }, 100);
      } else {
        console.error(`No image info found for ID: ${imageId}`);
        setFullscreenImage(null);
        Alert.alert('错误', '无法加载图片');
      }
    }
  };

  // Function to save image to gallery
  const handleSaveImage = async () => {
    try {
      if (fullscreenImageId) {
        // Save using the image ID
        const result = await ImageManager.saveToGallery(fullscreenImageId);
        Alert.alert(result.success ? '成功' : '错误', result.message);
      } else if (fullscreenImage) {
        // Save using the direct image URI
        const result = await ImageManager.saveToGallery(fullscreenImage);
        Alert.alert(result.success ? '成功' : '错误', result.message);
      }
    } catch (error) {
      console.error('Error saving image:', error);
      Alert.alert('错误', '保存图片失败');
    }
  };

  // Function to share image
  const handleShareImage = async () => {
    try {
      let success = false;
      
      if (fullscreenImageId) {
        // Share using image ID
        success = await ImageManager.shareImage(fullscreenImageId);
      } else if (fullscreenImage) {
        // Share using direct URI
        success = await ImageManager.shareImage(fullscreenImage);
      }
      
      if (!success) {
        Alert.alert('错误', '分享功能不可用');
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      Alert.alert('错误', '分享图片失败');
    }
  };

  // Render visual novel dialog box
  const renderVisualNovelDialog = () => {
    if (!lastAiMessage || !selectedCharacter) return null;
    
    // For visual novel mode, find the index of the last AI message
    const lastAiMessageIndex = virtualizedMessages.findIndex(msg => msg.id === lastAiMessage.id);
    const isLastAIMessage = true;
    const isRegenerating = regeneratingMessageId === lastAiMessage.id;
    
    return (
      <View style={[
        styles.visualNovelContainer,
        { backgroundColor: visualNovelSettings.backgroundColor }
      ]}>
        <View style={styles.visualNovelHeader}>
          <Image
            source={
              selectedCharacter?.avatar
                ? { uri: String(selectedCharacter.avatar) }
                : require('@/assets/images/default-avatar.png')
            }
            style={styles.visualNovelAvatar}
          />
          <Text style={[
            styles.visualNovelCharacterName,
            { color: visualNovelSettings.textColor }
          ]}>
            {selectedCharacter.name}
          </Text>
          
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => setHistoryModalVisible(true)}
          >
            <Ionicons name="time-outline" size={20} color="#fff" />
            <Text style={styles.historyButtonText}>查看历史</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.visualNovelTextContainer}>
          {/* Replace the plain text with processed content */}
          <View style={styles.visualNovelTextWrapper}>
            {containsComplexHtml(lastAiMessage.text) || /<\/?[a-z][^>]*>/i.test(lastAiMessage.text) ? (
              <RichTextRenderer 
                html={optimizeHtmlForRendering(lastAiMessage.text)}
                baseStyle={{ 
                  color: visualNovelSettings.textColor,
                  fontFamily: visualNovelSettings.fontFamily,
                  fontSize: 16,
                  lineHeight: 22
                }}
                onImagePress={(url) => setFullscreenImage(url)}
                maxImageHeight={MAX_IMAGE_HEIGHT}
              />
            ) : (
              <Text style={[
                styles.visualNovelText,
                { 
                  fontFamily: visualNovelSettings.fontFamily, 
                  color: visualNovelSettings.textColor 
                }
              ]}>
                {lastAiMessage.text}
              </Text>
            )}
          </View>
        </ScrollView>
        
        {/* Add message action buttons in visual novel style */}
        <View style={styles.visualNovelActions}>
          {/* TTS buttons */}
          {renderTTSButtons(lastAiMessage)}
          
          {/* Regenerate button - only show if it's the last AI message */}
          {onRegenerateMessage && isLastAIMessage && (
            <TouchableOpacity
              style={[
                styles.visualNovelActionButton,
                isRegenerating && styles.visualNovelRegeneratingButton // Add special style for regenerating state
              ]}
              onPress={() => {
                if (!isRegenerating) { // Only allow clicking if not already regenerating
                  // Get the stored or calculated AI message index
                  const aiIndex = lastAiMessage.metadata?.aiIndex !== undefined 
                    ? lastAiMessage.metadata.aiIndex
                    : virtualizedMessages.filter(m => m.sender === 'bot' && !m.isLoading).length - 1;
                  
                  onRegenerateMessage(lastAiMessage.id, aiIndex);
                }
              }}
              disabled={isRegenerating} // Disable the button when regenerating
            >
              {isRegenerating ? (
                // Show activity indicator when regenerating
                <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
              ) : (
                <Ionicons name="refresh-circle" size={26} color="rgba(255,255,255,0.9)" />
              )}
            </TouchableOpacity>
          )}
          
          {/* Rating buttons */}
          {onRateMessage && (
            <View style={styles.visualNovelRateButtons}>
              <TouchableOpacity
                style={[
                  styles.visualNovelRateButton, 
                  getMessageRating(lastAiMessage.id) === true && styles.visualNovelRateButtonActive
                ]}
                onPress={() => onRateMessage(lastAiMessage.id, true)}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={getMessageRating(lastAiMessage.id) === true ? "thumbs-up" : "thumbs-up-outline"} 
                  size={22} 
                  color={getMessageRating(lastAiMessage.id) === true ? "rgb(255, 224, 195)" : "rgba(255,255,255,0.9)"} 
                />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.visualNovelRateButton, 
                  getMessageRating(lastAiMessage.id) === false && styles.visualNovelRateButtonActive
                ]}
                onPress={() => onRateMessage(lastAiMessage.id, false)}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={getMessageRating(lastAiMessage.id) === false ? "thumbs-down" : "thumbs-down-outline"}
                  size={22} 
                  color={getMessageRating(lastAiMessage.id) === false ? "#e74c3c" : "rgba(255,255,255,0.9)"} 
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };
  
  // Render history modal for visual novel mode
  const renderHistoryModal = () => {
    return (
      <Modal
        visible={isHistoryModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.historyModalContainer}>
          <View style={styles.historyModalHeader}>
            <Text style={styles.historyModalTitle}>对话历史</Text>
            <TouchableOpacity
              style={styles.historyModalCloseButton}
              onPress={() => setHistoryModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.historyModalContent}>
            {messages.map((message, index) => {
              const isUser = message.sender === 'user';
              const showTime = index === 0 || 
                              (index > 0 && new Date(message.timestamp || 0).getMinutes() !== 
                                new Date(messages[index-1].timestamp || 0).getMinutes());
              
              return (
                <View key={message.id} style={styles.historyMessageContainer}>
                  {showTime && message.timestamp && (
                    <Text style={styles.historyTimeText}>
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </Text>
                  )}
                  
                  <View style={[
                    styles.historyMessage,
                    isUser ? styles.historyUserMessage : styles.historyBotMessage
                  ]}>
                    <Text style={[
                      styles.historyMessageText,
                      isUser ? styles.historyUserMessageText : styles.historyBotMessageText
                    ]}>
                      {message.text}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // 改进renderListHeader确保正确显示加载状态
  const renderListHeader = () => {
    if (!hasMoreMessagesToLoad && !isLoadingMore) return null;
    
    return (
      <View style={styles.loadMoreContainer}>
        {isLoadingMore ? (
          <View style={styles.loadingMoreRow}>
            <ActivityIndicator size="small" color="#aaa" />
            <Text style={styles.loadMoreText}>加载更早的消息...</Text>
          </View>
        ) : (
          <TouchableOpacity 
            onPress={loadMoreMessages}
            style={styles.loadMoreButton}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color="#ddd" />
            <Text style={styles.loadMoreText}>加载更早的消息</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Handle scroll to index failures (for FlatList)
  const handleScrollToIndexFailed = (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    console.warn('[ChatDialog] Failed to scroll to index:', info);
    
    // Fallback solution - scroll to offset based on average item height
    const offset = info.averageItemLength * info.index;
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ 
        offset,
        animated: false
      });
    }, 100);
  };

  // Render message item for FlatList
  const renderItem = useCallback(({ item, index }: { item: Message, index: number }) => {
    const isUser = item.sender === 'user';
    const showTime = index === 0 || index % 5 === 0 || 
                    (index > 0 && new Date(item.timestamp || 0).getHours() !== 
                      new Date(virtualizedMessages[index-1].timestamp || 0).getHours());

    return (
      <View key={item.id} style={styles.messageWrapper}>
        {showTime && item.timestamp && renderTimeGroup(item.timestamp)}
        <View
          style={[
            styles.messageContainer,
            isUser ? styles.userMessageContainer : styles.botMessageContainer,
          ]}
        >
          {renderMessageContent(item, isUser, index)}
        </View>
      </View>
    );
  }, [virtualizedMessages, selectedCharacter, ratedMessages, audioStates, user]);

  // Improve the keyExtractor function to guarantee uniqueness
  const keyExtractor = useCallback((item: Message) => {
    // First check if the message already has an ID
    if (!item.id) {
      console.warn('[ChatDialog] Message missing ID, generating stable one');
      // Create a stable ID based on content and timestamp
      return `missing-id-${item.sender}-${item.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
    
    // For auto messages, ensure we use the uniquely generated ID without any modification
    if (item.metadata?.isAutoMessageResponse) {
      return item.id; // Use the original ID which should already be unique
    }
    
    // For normal messages with IDs, create a compound key that guarantees uniqueness
    // This avoids the "two children with the same key" warning
    return `${item.id}-${item.sender}${item.metadata?.regenerated ? '-regen' : ''}`;
  }, []);

  return (
    <>
      {/* If in visual novel mode, render novel dialog */}
      {mode === 'visual-novel' ? (
        <>
          {/* Empty space for background display */}
          <View style={[styles.container, style, styles.backgroundFocusContainer]} />
          {/* Fixed position dialog at bottom */}
          {renderVisualNovelDialog()}
          {/* History modal */}
          {renderHistoryModal()}
        </>
      ) : (
        <>
          {messages.length === 0 ? (
            <ScrollView
              style={[
                styles.container, 
                style,
                // Apply position settings for background focus mode instead of height limit
                mode === 'background-focus' && styles.backgroundFocusContainer
              ]}
              contentContainerStyle={[
                styles.emptyContent,
                // Add padding to content when in background focus mode
                mode === 'background-focus' && styles.backgroundFocusPadding
              ]}
            >
              {renderEmptyState()}
            </ScrollView>
          ) : (
            <FlatList
              ref={flatListRef}
              data={virtualizedMessages}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              style={[
                styles.container, 
                style,
                // Apply position settings for background focus mode
                mode === 'background-focus' && styles.backgroundFocusContainer
              ]}
              contentContainerStyle={[
                styles.content,
                // Add padding when in background focus mode
                mode === 'background-focus' && styles.backgroundFocusPadding
              ]}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={true}
              ListHeaderComponent={renderListHeader}
              ListFooterComponent={() => <View style={styles.endSpacer} />}
              onEndReachedThreshold={0.1}
              initialNumToRender={20}
              maxToRenderPerBatch={10}
              windowSize={21} // Buffer size (visible + rendered ahead/behind)
              onScrollToIndexFailed={handleScrollToIndexFailed}
              onViewableItemsChanged={handleViewableItemsChanged}
              onStartReached={hasMoreMessagesToLoad ? loadMoreMessages : undefined}
              onStartReachedThreshold={0.1}
              removeClippedSubviews={Platform.OS !== 'web'} // Disable on web to fix issues
              automaticallyAdjustContentInsets={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </>
      )}
      
      {/* Fullscreen image modal and other modals remain unchanged */}
      <Modal
        visible={!!fullscreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setFullscreenImage(null);
          setFullscreenImageId(null);
        }}
      >
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity 
            style={styles.fullscreenCloseButton}
            onPress={() => {
              setFullscreenImage(null);
              setFullscreenImageId(null);
            }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          
          {imageLoading && (
            <View style={styles.imageLoadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.imageLoadingText}>加载原始图片...</Text>
            </View>
          )}
          
          {fullscreenImage && (
            <Image
              source={{ uri: fullscreenImage }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          
          <View style={styles.imageActionButtons}>
            <TouchableOpacity
              style={styles.imageActionButton}
              onPress={handleSaveImage}
            >
              <Ionicons name="download" size={24} color="#fff" />
              <Text style={styles.imageActionButtonText}>保存</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.imageActionButton}
              onPress={handleShareImage}
            >
              <Ionicons name="share" size={24} color="#fff" />
              <Text style={styles.imageActionButtonText}>分享</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingVertical: 16,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  messagesContainer: {
    paddingHorizontal: 12,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  botMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#444',
  },
  messageContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    maxWidth: '100%',
    minHeight: 40,
    marginHorizontal: 8,
    alignSelf: 'center',
    position: 'relative',
  },
  userMessageContent: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  botMessageContent: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
  },
  // User message wrapper for bubble + avatar
  userMessageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    maxWidth: '100%',
    position: 'relative',
    minHeight: 40,
  },
  // User message bubble
  userGradient: {
    borderRadius: 18,
    borderTopRightRadius: 4,
    padding: 12,
    paddingHorizontal: 16,
    },
  userMessageText: {
    color: '#333',
    fontSize: 16,
  },
  botMessageTextContainer: {
    backgroundColor: 'rgba(68, 68, 68, 0.85)', // Semi-transparent background
    borderRadius: 18,
    borderTopLeftRadius: 4,
    padding: 12,
    paddingHorizontal: 16,
    width: '100%', // Ensure content takes full width available
    paddingTop: 20, // Extra padding at top to accommodate avatar
    maxWidth: '98%', // Ensure it doesn't exceed parent width
    marginTop: 15, // Space for the avatar
  },
  botMessageText: {
    color: '#fff',
    fontSize: 16,
  },
  loadingMessage: {
    minWidth: 80,
  },
  loadingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 24,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#bbb',
    marginHorizontal: 2,
    opacity: 0.7,
  },
  messageActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    alignItems: 'center',
  },
  rateButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  rateButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  timeGroup: {
    alignItems: 'center',
    marginVertical: 8,
  },
  timeText: {
    color: '#ddd',
    fontSize: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: '#bbb',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  endSpacer: {
    height: 40,
  },
  imageWrapper: {
    marginVertical: 8,
    alignItems: 'center',
  },
  messageImage: {
    width: '100%',
    height: 200,
    maxHeight: MAX_IMAGE_HEIGHT,
    borderRadius: 8,
    backgroundColor: 'rgba(42, 42, 42, 0.5)', // Semi-transparent background
  },
  imageCaption: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 4,
    textAlign: 'center',
  },
  imageDataUrlWarning: {
    backgroundColor: 'rgba(51, 51, 51, 0.8)', // Semi-transparent background
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  imageDataUrlWarningText: {
    color: '#ddd',
    fontSize: 14,
    marginTop: 8,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  fullscreenCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkIcon: {
    marginRight: 8,
  },
  linkText: {
    color: '#3498db',
    textDecorationLine: 'underline',
    fontSize: 16,
  },
  actionButton: {
    padding: 8,
    marginRight: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 18,
  },
  // Add a new style for rich content
  richContentWrapper: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 4,
    marginBottom: 5, // Add some margin at the bottom
  },
  // Add new styles for memory indicators
  memoryIndicatorContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
  },
  memoryIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memoryTooltip: {
    position: 'absolute',
    top: 25,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 4,
    width: 150,
    zIndex: 100,
  },
  memoryTooltipText: {
    color: 'white',
    fontSize: 12,
  },
  imageError: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    padding: 20,
    borderRadius: 8,
    marginVertical: 8,
  },
  imageErrorText: {
    color: '#e74c3c',
    marginTop: 8,
    textAlign: 'center',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10,
  },
  imageLoadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  imageActionButtons: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  imageActionButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageActionButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 16,
  },
  // Add styles for TTS buttons
  ttsButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  ttsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  ttsButtonActive: {
    backgroundColor: 'black', // 米黄色加深
  },
  ttsButtonEnhanced: {
    backgroundColor: 'black', // 米黄色加深
  },
  ttsButtonWithLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ttsLoadingText: {
    color: '#ddd',
    fontSize: 12,
    marginLeft: 4,
  },
  ttsRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 102, 102, 0.1)',
    borderRadius: 12,
    marginLeft: 4,
  },
  ttsErrorText: {
    color: '#ff6666',
    fontSize: 12,
    marginLeft: 4,
  },
  // Add new styles for TTS enhancer
  ttsEnhancerIndicator: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(255, 193, 7, 0.9)', // More golden color for enhanced mode
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Update background focus mode styles to show top half of image
  backgroundFocusContainer: {
    position: 'absolute',
    top: '50%', // Position the scroll view halfway down the screen
    left: 0,
    right: 0,
    bottom: 0,  // Extend to bottom of screen
    maxHeight: '50%', // Take up bottom 50% of screen
  },
  backgroundFocusPadding: {
    paddingTop: 20, // Add some padding to the top for better appearance
  },
  
  // Add styles for visual novel mode
  visualNovelContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    minHeight: 200,
    maxHeight: 320,
    borderRadius: 16,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  visualNovelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  visualNovelAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  visualNovelCharacterName: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  visualNovelTextContainer: {
    maxHeight: 220,
  },
  visualNovelTextWrapper: {
    marginBottom: 8, // Add space for buttons
  },
  visualNovelText: {
    fontSize: 16,
    lineHeight: 22,
  },
  
  // Add styles for visual novel action buttons
  visualNovelActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  visualNovelActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  visualNovelRateButtons: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  visualNovelRateButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  visualNovelRateButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  
  // Visual novel TTS button styles
  visualNovelTTSContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 'auto', // Push to the start/left
  },
  visualNovelTTSButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  visualNovelTTSButtonWithLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  visualNovelTTSButtonActive: {
    backgroundColor: '#FFD580', // 米黄色加深
  },
  visualNovelTTSButtonEnhanced: {
    backgroundColor: '#FFD580', // 米黄色加深
  },
  visualNovelTTSEnhancerIndicator: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(255, 193, 7, 0.9)', // More golden color for enhanced mode
    borderRadius: 8,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // History modal styles
  historyModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  historyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 40,
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
  },
  historyModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  historyModalCloseButton: {
    padding: 8,
  },
  historyModalContent: {
    flex: 1,
    padding: 16,
  },
  historyMessageContainer: {
    marginBottom: 16,
  },
  historyTimeText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  historyMessage: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '85%',
    fontSize: 16,
  },
  historyUserMessage: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 224, 195, 0.85)',
  },
  historyBotMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(68, 68, 68, 0.85)',
  },
  historyUserMessageText: {
    color: '#333',
  },
  historyMessageText: {
    fontSize: 16,
  },
  historyBotMessageText: {
    color: '#fff',
  },
  
  // Add the missing styles for history button
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  historyButtonText: {
    color: '#fff',
    marginLeft: 4,
    fontSize: 14,
  },
  imageContainer: {
    width: '100%',
  },
  
  // Add new styles for virtual scrolling
  loadMoreContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 10,
  },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  loadMoreText: {
    color: '#ddd',
    fontSize: 14,
    marginLeft: 8,
  },
  // Add new styles for regeneration state
  regeneratingButton: {
    backgroundColor: 'rgba(52, 152, 219, 0.6)',
    width: 36, // Make a bit wider to accommodate the spinner
    height: 36, // Make a bit taller to accommodate the spinner
  },
  visualNovelRegeneratingButton: {
    backgroundColor: 'rgba(52, 152, 219, 0.6)',
  },
  // AI avatar at top-left of bubble
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    position: 'absolute',
    left: 10,
    top: -15,
    zIndex: 2,
    backgroundColor: '#444',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  // User avatar at top-right of bubble
  userMessageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    position: 'absolute',
    right: -38,
    top: -15,
    zIndex: 2,
    backgroundColor: '#444',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

export default ChatDialog;