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
import { GestureResponderEvent } from 'react-native';
import Markdown from 'react-native-markdown-display'; // Import Markdown renderer

// Update ChatDialogProps interface in the file or in shared/types.ts to include messageMemoryState
interface ExtendedChatDialogProps extends ChatDialogProps {
  messageMemoryState?: Record<string, string>;
  regeneratingMessageId?: string | null; // Add this new prop
  user?: User | null; // Add user prop
  isHistoryModalVisible?: boolean; // 新增
  setHistoryModalVisible?: (visible: boolean) => void; // 新增
  onShowFullHistory?: () => void; // 新增
}

const { width } = Dimensions.get('window');
// Adjust the maximum width to ensure proper margins
const MAX_WIDTH = width * 0.88; // Decreased from 0.9 to 0.88 to add more margin
const MAX_IMAGE_HEIGHT = 300; // Maximum height for images in chat
const DEFAULT_IMAGE_WIDTH = 240;
const DEFAULT_IMAGE_HEIGHT = 360;

const getImageDisplayStyle = (imageInfo?: any) => {
  // 默认比例 832x1216
  let width = DEFAULT_IMAGE_WIDTH;
  let height = DEFAULT_IMAGE_HEIGHT;
  if (imageInfo && imageInfo.originalPath) {
    // 尝试读取图片实际宽高
    // 如果 imageInfo 里有 width/height 字段，优先用
    if (imageInfo.width && imageInfo.height) {
      const maxW = 260;
      const maxH = MAX_IMAGE_HEIGHT;
      const ratio = imageInfo.width / imageInfo.height;
      if (ratio > 1) {
        // 横图
        width = maxW;
        height = Math.round(maxW / ratio);
      } else {
        // 竖图
        height = maxH;
        width = Math.round(maxH * ratio);
      }
    } else {
      // fallback: 832x1216
      width = 208;
      height = 304;
    }
  }
  return {
    width,
    height,
    maxWidth: 320,
    maxHeight: MAX_IMAGE_HEIGHT,
    borderRadius: 8,
    backgroundColor: 'rgba(42, 42, 42, 0.5)',
    alignSelf: 'center' as const,
  };
};

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
  isHistoryModalVisible = false, // 新增
  setHistoryModalVisible,        // 新增
  onShowFullHistory,             // 新增
}) => {
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
  
  // Add state for TTS functionality
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  
  // Add state for TTS enhancer settings
  const [ttsEnhancerEnabled, setTtsEnhancerEnabled] = useState(false);
  
  // Get dialog mode from context
  const { mode, visualNovelSettings, isHistoryModalVisible: contextHistoryModalVisible, setHistoryModalVisible: contextSetHistoryModalVisible } = useDialogMode();
  
  // Add a ref to track if we're programmatically scrolling
  const isAutoScrollingRef = useRef(false);

  // 新增：长按空白区域自动滑到底部
  const handleLongPressOutside = () => {
    if (flatListRef.current) {
      try {
        flatListRef.current.scrollToEnd({ animated: true });
      } catch (e) {
        // ignore
      }
    }
  };

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
    }
  }, [selectedCharacter?.id, currentConversationId]);

  // --- 自动滚动到底部逻辑，恢复滚动时跳过，视觉小说模式下不自动滚动 ---
  useEffect(() => {
    if (messages.length > 0 && mode !== 'visual-novel') {
      const timer = setTimeout(() => {
        if (flatListRef.current) {
          try {
            flatListRef.current.scrollToEnd({ animated: false });
          } catch (e) { /* ignore */ }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, mode]);

  // Handle scroll
  const handleScroll = (event: any) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    if (currentConversationId) {
      setScrollPositions(prev => ({
        ...prev,
        [currentConversationId]: yOffset
      }));
      if (onScrollPositionChange) {
        onScrollPositionChange(currentConversationId, yOffset);
      }
    }
  };

  // Animate new messages
  useEffect(() => {
    fadeAnim.value = withTiming(1, { duration: 300 });
    translateAnim.value = withTiming(0, { duration: 300 });
  }, [messages, fadeAnim, translateAnim]);

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
      const templateId = selectedCharacter?.voiceType || 'template1';
      
      console.log(`[ChatDialog] Using voice template: ${templateId} for character: ${selectedCharacter?.name}`);
      
      setAudioStates(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          isLoading: true,
          error: null
        }
      }));
      
      const result = await ttsService.generateTTS(messageId, text, templateId);
      
      updateAudioState(messageId);
      
      if (result.hasAudio && !result.error) {
        await handlePlayAudio(messageId);
      } else if (result.error) {
        if (result.error !== 'Audio generation timed out after 30 seconds') {
          Alert.alert('语音生成失败', '无法生成语音，请稍后再试。');
        }
      }
    } catch (error) {
      console.error('Failed to generate TTS:', error);
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
        await ttsService.stopAudio(messageId);
      } else {
        await ttsService.playAudio(messageId);
      }
      
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

  const containsCustomTags = (text: string): boolean => {
      return /(<\s*(thinking|think|status|mem|websearch|char-think|StatusBlock|statusblock|font)[^>]*>[\s\S]*?<\/\s*(thinking|think|status|mem|websearch|char-think|StatusBlock|statusblock|font)\s*>)/i.test(text);
   };

  const processMessageContent = (text: string, isUser: boolean) => {
    if (!text || text.trim() === '') {
      return (
        <Text style={isUser ? styles.userMessageText : styles.botMessageText}>
          (Empty message)
        </Text>
      );
    }

    // 检测是否为自定义标签或 HTML
    if (containsCustomTags(text) || /<\/?[a-z][^>]*>/i.test(text)) {
      return (
        <RichTextRenderer
          html={optimizeHtmlForRendering(text)}
          baseStyle={isUser ? styles.userMessageText : styles.botMessageText}
          onImagePress={(url) => setFullscreenImage(url)}
          maxImageHeight={MAX_IMAGE_HEIGHT}
        />
      );
    }

    // 检测是否为 markdown（包含代码块、标题、表格、列表、引用等）
    const markdownPattern = /(^|\n)(\s{0,3}#|```|>\s|[*+-]\s|\d+\.\s|\|.*\|)/;
    if (markdownPattern.test(text)) {
      return (
        <View style={{ width: '100%' }}>
          <Markdown
            style={{
              body: isUser ? styles.userMessageText : styles.botMessageText,
              text: isUser ? styles.userMessageText : styles.botMessageText,
              code_block: { backgroundColor: '#111', color: '#fff', borderRadius: 6, padding: 8, fontSize: 14 }, // 修改为黑色背景
              code_inline: { backgroundColor: '#111', color: '#fff', borderRadius: 4, padding: 2, fontSize: 14 },
              heading1: { fontSize: 24, fontWeight: 'bold', marginVertical: 10 },
              heading2: { fontSize: 22, fontWeight: 'bold', marginVertical: 8 },
              heading3: { fontSize: 20, fontWeight: 'bold', marginVertical: 6 },
              heading4: { fontSize: 18, fontWeight: 'bold', marginVertical: 5 },
              heading5: { fontSize: 16, fontWeight: 'bold', marginVertical: 4 },
              heading6: { fontSize: 14, fontWeight: 'bold', marginVertical: 3 },
              bullet_list: { marginVertical: 6 },
              ordered_list: { marginVertical: 6 },
              list_item: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 2 },
              blockquote: { backgroundColor: '#111', borderLeftWidth: 4, borderLeftColor: '#aaa', padding: 8, marginVertical: 6 },
              table: { borderWidth: 1, borderColor: '#666', marginVertical: 8 },
              th: { backgroundColor: '#444', color: '#fff', fontWeight: 'bold', padding: 6 },
              tr: { borderBottomWidth: 1, borderColor: '#666' },
              td: { padding: 6, color: '#fff' },
              hr: { borderBottomWidth: 1, borderColor: '#aaa', marginVertical: 8 },
              link: { color: '#3498db', textDecorationLine: 'underline' },
              image: { width: 220, height: 160, borderRadius: 8, marginVertical: 8, alignSelf: 'center' },
              // 可根据需要继续自定义
            }}
            onLinkPress={(url: string) => {
              if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
                if (typeof window !== 'undefined') {
                  window.open(url, '_blank');
                } else {
                  setFullscreenImage(url);
                }
                return true;
              }
              return false;
            }}
          >
            {text}
          </Markdown>
        </View>
      );
    }

    // ...existing code for image markdown, links, fallback...
    const rawImageMarkdownRegex = /^!\[(.*?)\]\(image:([a-f0-9]+)\)$/;
    const rawImageMatch = text.trim().match(rawImageMarkdownRegex);
    
    if (rawImageMatch) {
      const alt = rawImageMatch[1] || "图片";
      const imageId = rawImageMatch[2];
      
      const imageInfo = ImageManager.getImageInfo(imageId);
      const imageStyle = getImageDisplayStyle(imageInfo);

      if (imageInfo) {
        return (
          <View style={styles.imageWrapper}>
            <TouchableOpacity
              style={styles.imageContainer}
              onPress={() => handleOpenFullscreenImage(imageId)}
            >
              <Image
                source={{ uri: imageInfo.originalPath }}
                style={imageStyle}
                resizeMode="contain"
                onError={(e) => console.error(`Error loading image: ${e.nativeEvent.error}`, imageInfo.originalPath)}
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

    const hasCustomTags = (
      /<\s*(thinking|think|status|mem|websearch)[^>]*>([\s\S]*?)<\/\s*(thinking|think|status|mem|websearch)\s*>/i.test(text) || 
      /<\s*char\s+think\s*>([\s\S]*?)<\/\s*char\s+think\s*>/i.test(text)
    );
    
    const hasMarkdown = /```[\w]*\s*([\s\S]*?)```/.test(text) || 
                       /!\[[\s\S]*?\]\([\s\S]*?\)/.test(text) ||
                       /\*\*([\s\S]*?)\*\*/.test(text) ||
                       /\*([\s\S]*?)\*/.test(text);

    const hasHtml = /<\/?[a-z][^>]*>/i.test(text);

    const imageIdRegex = /!\[(.*?)\]\(image:([^\s)]+)\)/g;
    let match: RegExpExecArray | null;
    const matches: { alt: string, id: string }[] = [];
    
    while ((match = imageIdRegex.exec(text)) !== null) {
      matches.push({
        alt: match[1] || "图片",
        id: match[2]
      });
    }
    
    if (matches.length > 0) {
      return (
        <View>
          {matches.map((img, idx) => {
            const imageInfo = ImageManager.getImageInfo(img.id);
            const imageStyle = getImageDisplayStyle(imageInfo);
            if (imageInfo) {
              // 确保 key 直接传递给 TouchableOpacity
              return (
                <TouchableOpacity 
                  key={img.id + '-' + idx}
                  style={styles.imageWrapper}
                  onPress={() => handleOpenFullscreenImage(img.id)}
                >
                  <Image
                    source={{ uri: imageInfo.originalPath }}
                    style={imageStyle}
                    resizeMode="contain"
                    onError={(e) => console.error(`Error loading image: ${e.nativeEvent.error}`, imageInfo.originalPath)}
                  />
                  <Text style={styles.imageCaption}>{img.alt}</Text>
                </TouchableOpacity>
              );
            } else {
              // key 直接传递给 View
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

    const imageMarkdownRegex = /!\[(.*?)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
    let urlMatches: { alt: string, url: string }[] = [];
    
    imageMarkdownRegex.lastIndex = 0;
    
    while ((match = imageMarkdownRegex.exec(text)) !== null) {
      urlMatches.push({
        alt: match[1] || "图片",
        url: match[2]
      });
    }
    
    if (urlMatches.length > 0) {
      return (
        <View>
          {urlMatches.map((img, idx) => {
            const isDataUrl = img.url.startsWith('data:');
            const isLargeDataUrl = isDataUrl && img.url.length > 100000;
            
            if (isLargeDataUrl) {
              // key 直接传递给 View
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
            
            // key 直接传递给 TouchableOpacity
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
    
    const linkRegex = /\[(.*?)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
    let linkMatches: { text: string, url: string }[] = [];
    
    while ((match = linkRegex.exec(text)) !== null) {
      linkMatches.push({
        text: match[1],
        url: match[2]
      });
    }
    
// ...existing code...
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

  const getAiMessageIndex = (index: number): number => {
    const message = messages[index];
    if (message?.metadata?.aiIndex !== undefined) {
      return message.metadata.aiIndex;
    }
    let aiMessageCount = 0;
    for (let i = 0; i <= index; i++) {
      if (messages[i].sender === 'bot' && !messages[i].isLoading) {
        aiMessageCount++;
      }
    }
    return aiMessageCount - 1;
  };

  const getMessageRating = (messageId: string): boolean | null => {
    if (messageId in ratedMessages) {
      return ratedMessages[messageId];
    }
    return null; // Not rated
  };

  const renderTTSButtons = (message: Message) => {
    if (message.sender !== 'bot' || message.isLoading) return null;

    const audioState = audioStates[message.id] || ttsService.getAudioState(message.id);
    const isVisualNovel = mode === 'visual-novel';

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

  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);

  const renderMessageContent = (message: Message, isUser: boolean, index: number) => {
    return (
      <View style={[
        styles.messageContent,
        isUser ? styles.userMessageContent : styles.botMessageContent,
        message.isLoading && styles.loadingMessage
      ]}>
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
            <LinearGradient
              colors={['rgba(255, 224, 195, 0.95)', 'rgba(255, 200, 170, 0.95)']}
              style={styles.userGradient}
            >
              {processMessageContent(message.text, true)}

            </LinearGradient>
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

  const renderMessageActions = (message: Message, index: number) => {
    if (message.isLoading) return null;
    
    const isLastAIMessage = isMessageLastAIMessage(message, index);
    
    const messageRating = getMessageRating(message.id);
    const isRegenerating = regeneratingMessageId === message.id;
    
    return (
      <View style={styles.messageActions}>
        {message.sender === 'bot' && renderTTSButtons(message)}
      </View>
    );
  };

  const isMessageLastAIMessage = (message: Message, index: number): boolean => {
    if (message.sender !== 'bot' || message.isLoading) return false;
    
    for (let i = index + 1; i < messages.length; i++) {
      const laterMessage = messages[i];
      if (laterMessage.sender === 'bot' && !laterMessage.isLoading) {
        return false;
      }
    }
    
    return true;
  };

  const handleOpenFullscreenImage = (imageId: string | null) => {
    if (imageId) {
      setFullscreenImageId(imageId);
      const imageInfo = ImageManager.getImageInfo(imageId);
      
      if (imageInfo) {
        setFullscreenImage(imageInfo.originalPath);
        setImageLoading(false);
      } else {
        setFullscreenImage(null);
        Alert.alert('错误', '无法加载图片');
      }
    }
  };

  const handleSaveImage = async () => {
    try {
      if (fullscreenImageId) {
        const result = await ImageManager.saveToGallery(fullscreenImageId);
        Alert.alert(result.success ? '成功' : '错误', result.message);
      } else if (fullscreenImage) {
        const result = await ImageManager.saveToGallery(fullscreenImage);
        Alert.alert(result.success ? '成功' : '错误', result.message);
      }
    } catch (error) {
      Alert.alert('错误', '保存图片失败');
    }
  };

  const handleShareImage = async () => {
    try {
      let success = false;
      
      if (fullscreenImageId) {
        success = await ImageManager.shareImage(fullscreenImageId);
      } else if (fullscreenImage) {
        success = await ImageManager.shareImage(fullscreenImage);
      }
      
      if (!success) {
        Alert.alert('错误', '分享功能不可用');
      }
    } catch (error) {
      Alert.alert('错误', '分享图片失败');
    }
  };

  const renderVisualNovelDialog = () => {
    const lastMessage = messages.length > 0
      ? messages[messages.length - 1]
      : null;
    if (!lastMessage || !selectedCharacter) return null;
  
    const showUserMessage =
      lastMessage.sender === 'user' ||
      (lastMessage.sender === 'bot' && lastMessage.isLoading && messages.length >= 2 && messages[messages.length - 2].sender === 'user');
  
    let displayName, displayAvatar, displayText;
    if (showUserMessage) {
      const userMsg = lastMessage.sender === 'user'
        ? lastMessage
        : messages[messages.length - 2];
      displayName = selectedCharacter?.customUserName;
      displayAvatar = user?.avatar ? { uri: String(user.avatar) } : require('@/assets/images/default-avatar.png');
      displayText = userMsg?.text || '';
    } else {
      displayName = selectedCharacter.name;
      displayAvatar = selectedCharacter.avatar ? { uri: String(selectedCharacter.avatar) } : require('@/assets/images/default-avatar.png');
      displayText = lastMessage.text;
    }
  
    const aiIndex = lastMessage.metadata?.aiIndex !== undefined
      ? lastMessage.metadata.aiIndex
      : messages.filter(m => m.sender === 'bot' && !m.isLoading).length - 1;
  
    const isUser = showUserMessage;
    const isRegenerating = regeneratingMessageId === lastMessage.id;
    const messageRating = getMessageRating(lastMessage.id);
  
    return (
      <View style={[
        styles.visualNovelContainer,
        { backgroundColor: visualNovelSettings.backgroundColor }
      ]}>
        <View style={styles.visualNovelHeader}>
          <Image
            source={displayAvatar}
            style={styles.visualNovelAvatar}
          />
          <Text style={[
            styles.visualNovelCharacterName,
            { color: visualNovelSettings.textColor }
          ]}>
            {displayName}
          </Text>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => setHistoryModalVisible && setHistoryModalVisible(true)}
          >
            <Ionicons name="time-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.visualNovelTextContainer}>
          <View style={styles.visualNovelTextWrapper}>
            {containsComplexHtml(displayText) || /<\/?[a-z][^>]*>/i.test(displayText) ? (
              <RichTextRenderer 
                html={optimizeHtmlForRendering(displayText)}
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
                {displayText}
              </Text>
            )}
          </View>
        </ScrollView>
        <View style={styles.visualNovelActions}>
          {!isUser && !lastMessage.isLoading && (
            <>
              {renderTTSButtons(lastMessage)}
            </>
          )}
        </View>
      </View>
    );
  };

  const renderHistoryModal = () => {
    if (!isHistoryModalVisible) return null;
    return (
      <Modal
        visible={isHistoryModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setHistoryModalVisible && setHistoryModalVisible(false)}
      >
        <View style={styles.historyModalContainer}>
          <ScrollView style={styles.historyModalContent}>
            {messages.map((message, index) => {
              const isUser = message.sender === 'user';
              const showTime = index === 0 ||
                (index > 0 && new Date(message.timestamp || 0).getMinutes() !==
                  new Date(messages[index - 1].timestamp || 0).getMinutes());
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

  const getVisibleMessages = () => {
    if (mode === 'visual-novel') return messages;
    if (isHistoryModalVisible) return messages;
    return messages.slice(-30);
  };

  const renderItem = useCallback(({ item, index }: { item: Message, index: number }) => {
    const isUser = item.sender === 'user';
    const showTime = index === 0 || index % 5 === 0 || 
                    (index > 0 && new Date(item.timestamp || 0).getHours() !== 
                      new Date(messages[index-1].timestamp || 0).getHours());

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
  }, [messages, selectedCharacter, ratedMessages, audioStates, user]);

  const keyExtractor = useCallback((item: Message, index: number) => {
    // 保证 key 唯一性：id + sender + timestamp + index
    return `${item.id}-${item.sender}-${item.timestamp || ''}-${index}`;
  }, []);

  return (
    <>
      {mode === 'visual-novel' ? (
        <>
          <View style={[styles.container, style, styles.backgroundFocusContainer]} />
          {renderVisualNovelDialog()}
          {renderHistoryModal()}
        </>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {getVisibleMessages().length === 0 ? (
              <ScrollView
                style={[
                  styles.container, 
                  style,
                  mode === 'background-focus' && styles.backgroundFocusContainer
                ]}
                contentContainerStyle={[
                  styles.emptyContent,
                  mode === 'background-focus' && styles.backgroundFocusPadding
                ]}
              >
                {renderEmptyState()}
              </ScrollView>
            ) : (
              <FlatList
                ref={flatListRef}
                data={getVisibleMessages()}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                style={[
                  styles.container, 
                  style,
                  mode === 'background-focus' && styles.backgroundFocusContainer
                ]}
                contentContainerStyle={[
                  styles.content,
                  mode === 'background-focus' && styles.backgroundFocusPadding
                ]}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={true}
                ListFooterComponent={() => <View style={styles.endSpacer} />}
                initialNumToRender={20}
                maxToRenderPerBatch={10}
                windowSize={21}
                removeClippedSubviews={Platform.OS !== 'web'}
                automaticallyAdjustContentInsets={false}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>
          {renderHistoryModal()}
        </>
      )}
      
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
  userMessageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    maxWidth: '100%',
    position: 'relative',
    minHeight: 40,
  },
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
  richContentWrapper: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 4,
    marginBottom: 5, // Add some margin at the bottom
  },
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
  historyModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  imageContainer: {
    width: '100%',
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