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
  TextInput,
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
import { ttsService, AudioState } from '@/services/ttsService';
import { useDialogMode } from '@/constants/DialogModeContext';
import { GestureResponderEvent } from 'react-native';
import Markdown from 'react-native-markdown-display';
import TextEditorModal from './common/TextEditorModal';
import Slider from '@react-native-community/slider';

interface ExtendedChatDialogProps extends ChatDialogProps {
  messageMemoryState?: Record<string, string>;
  regeneratingMessageId?: string | null;
  user?: User | null;
  isHistoryModalVisible?: boolean;
  setHistoryModalVisible?: (visible: boolean) => void;
  onShowFullHistory?: () => void;
  onEditMessage?: (messageId: string, aiIndex: number, oldContent: string) => void;
  onDeleteMessage?: (messageId: string, aiIndex: number) => void;
}

const { width, height } = Dimensions.get('window');
const MAX_WIDTH = Math.min(width * 0.88, 500);
const MIN_PADDING = 8;
const RESPONSIVE_PADDING = Math.max(MIN_PADDING, width * 0.02);
const MAX_IMAGE_HEIGHT = Math.min(300, height * 0.4);
const DEFAULT_IMAGE_WIDTH = Math.min(240, width * 0.6);
const DEFAULT_IMAGE_HEIGHT = Math.min(360, height * 0.5);
const AVATAR_SIZE = Math.max(Math.min(width * 0.075, 30), 24);
const BUTTON_SIZE = width < 360 ? 28 : 32;
const BUTTON_ICON_SIZE = width < 360 ? 16 : 18;
const BUTTON_MARGIN = width < 360 ? 3 : 6;

const getImageDisplayStyle = (imageInfo?: any) => {
  let width = DEFAULT_IMAGE_WIDTH;
  let height = DEFAULT_IMAGE_HEIGHT;
  if (imageInfo && imageInfo.originalPath) {
    if (imageInfo.width && imageInfo.height) {
      const maxW = 260;
      const maxH = MAX_IMAGE_HEIGHT;
      const ratio = imageInfo.width / imageInfo.height;
      if (ratio > 1) {
        width = maxW;
        height = Math.round(maxW / ratio);
      } else {
        height = maxH;
        width = Math.round(maxH * ratio);
      }
    } else {
      width = 208;
      height = 304;
    }
  }
  return {
    width,
    height,
    maxWidth: Math.min(320, width * 0.8),
    maxHeight: MAX_IMAGE_HEIGHT,
    borderRadius: 8,
    backgroundColor: 'rgba(42, 42, 42, 0.5)',
    alignSelf: 'center' as const,
  };
};

// 已知标签白名单
const KNOWN_TAGS = [
  'img', 'thinking', 'think', 'mem', 'status', 'StatusBlock', 'statusblock', 'websearch', 'char-think', 'font',
  'summary', 'details',
  'p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li',
  'table', 'tr', 'td', 'th', 'thead', 'tbody', 'blockquote',
  'pre', 'code', 'mark', 'figure', 'figcaption', 'video', 'audio',
  'source', 'section', 'article', 'aside', 'nav', 'header', 'footer'
];

// 移除未知标签，仅保留内容
function stripUnknownTags(html: string): string {
  if (!html) return '';
  // 匹配所有标签
  return html.replace(/<([a-zA-Z0-9\-]+)(\s[^>]*)?>([\s\S]*?)<\/\1>/g, (match, tag, attrs, content) => {
    if (KNOWN_TAGS.includes(tag)) {
      // 已知标签，保留
      return match;
    }
    // 未知标签，递归处理内容
    return stripUnknownTags(content);
  });
}

const ChatDialog: React.FC<ExtendedChatDialogProps> = ({
  messages,
  style,
  selectedCharacter,
  onRateMessage,
  onRegenerateMessage,
  savedScrollPosition,
  onScrollPositionChange,
  messageMemoryState = {},
  regeneratingMessageId = null,
  user = null,
  isHistoryModalVisible = false,
  setHistoryModalVisible,
  onShowFullHistory,
  onEditMessage,
  onDeleteMessage,
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
  const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  const [ttsEnhancerEnabled, setTtsEnhancerEnabled] = useState(false);
  const { mode, visualNovelSettings, updateVisualNovelSettings, isHistoryModalVisible: contextHistoryModalVisible, setHistoryModalVisible: contextSetHistoryModalVisible } = useDialogMode();
  const isAutoScrollingRef = useRef(false);

  // 新增：视觉小说展开/收起状态和背景透明度
  const [vnExpanded, setVnExpanded] = useState(false);
  const [vnBgAlpha, setVnBgAlpha] = useState(() => {
    // 从 visualNovelSettings.backgroundColor 解析 alpha
    const match = visualNovelSettings.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([0-9\.]+)?\)/);
    if (match && match[4]) return parseFloat(match[4]);
    return 0.7;
  });
  const [showAlphaSlider, setShowAlphaSlider] = useState(false);

  // 修复类型错误：不要用 TouchableOpacity 作为类型
  const alphaBtnRef = useRef<any>(null);
  const [alphaBtnLayout, setAlphaBtnLayout] = useState<{x: number, y: number, width: number, height: number}>({x: 0, y: 0, width: 0, height: 0});

  // 视觉小说对话框头部高度和底部actions高度
  const VN_HEADER_HEIGHT = vnExpanded ? 0 : 58; // 展开时无header
  const VN_ACTIONS_HEIGHT = 62; // actions区高度
  const VN_VERTICAL_PADDING = 30; // 上下padding和margin

  // 计算文本区最大高度
  const getVNTextMaxHeight = () => {
    if (vnExpanded) {
      // 展开时，顶部紧贴topbar，底部10，减去header和actions高度
      return height - (VN_HEADER_HEIGHT + VN_ACTIONS_HEIGHT + VN_VERTICAL_PADDING + 10);
    }
    // 收起时，固定高度
    return 220;
  };

  // 同步 visualNovelSettings.backgroundColor 和 vnBgAlpha
  useEffect(() => {
    const match = visualNovelSettings.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?/);
    if (match && match[4]) setVnBgAlpha(parseFloat(match[4]));
  }, [visualNovelSettings.backgroundColor]);

  // 调整背景色
  const getVnBgColor = () => {
    // 取原色的rgb部分，替换alpha
    const match = visualNovelSettings.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?/);
    if (match) {
      const [_, r, g, b] = match;
      return `rgba(${r},${g},${b},${vnBgAlpha})`;
    }
    return `rgba(0,0,0,${vnBgAlpha})`;
  };

  const handleAlphaChange = (alpha: number) => {
    setVnBgAlpha(alpha);
    // 更新 visualNovelSettings
    const match = visualNovelSettings.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?/);
    let newColor = `rgba(0,0,0,${alpha})`;
    if (match) {
      const [_, r, g, b] = match;
      newColor = `rgba(${r},${g},${b},${alpha})`;
    }
    updateVisualNovelSettings({ backgroundColor: newColor });
  };

  const handleLongPressOutside = () => {
    if (flatListRef.current) {
      try {
        flatListRef.current.scrollToEnd({ animated: true });
      } catch (e) {}
    }
  };

  useEffect(() => {
    const checkTtsEnhancerStatus = () => {
      const settings = ttsService.getEnhancerSettings();
      setTtsEnhancerEnabled(settings.enabled);
    };

    checkTtsEnhancerStatus();
    const intervalId = setInterval(checkTtsEnhancerStatus, 5000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (selectedCharacter?.id && selectedCharacter.id !== currentConversationId) {
      setCurrentConversationId(selectedCharacter.id);
    }
  }, [selectedCharacter?.id, currentConversationId]);

  useEffect(() => {
    if (messages.length > 0 && mode !== 'visual-novel') {
      const timer = setTimeout(() => {
        if (flatListRef.current) {
          try {
            flatListRef.current.scrollToEnd({ animated: false });
          } catch (e) {}
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, mode]);

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

  const updateAudioState = (messageId: string) => {
    const state = ttsService.getAudioState(messageId);
    setAudioStates(prev => ({
      ...prev,
      [messageId]: state
    }));
  };

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

    if (containsCustomTags(text) || /<\/?[a-z][^>]*>/i.test(text)) {
      // 渲染前先移除未知标签
      const cleanedText = stripUnknownTags(text);
      return (
        <RichTextRenderer
          html={optimizeHtmlForRendering(cleanedText)}
          baseStyle={isUser ? styles.userMessageText : styles.botMessageText}
          onImagePress={(url) => setFullscreenImage(url)}
          maxImageHeight={MAX_IMAGE_HEIGHT}
        />
      );
    }

    const markdownPattern = /(^|\n)(\s{0,3}#|```|>\s|[*+-]\s|\d+\.\s|\|.*\|)/;
    if (markdownPattern.test(text)) {
      return (
        <View style={{ width: '100%' }}>
          <Markdown
            style={{
              body: isUser ? styles.userMessageText : styles.botMessageText,
              text: isUser ? styles.userMessageText : styles.botMessageText,
              code_block: { 
                backgroundColor: '#111', // 修改为黑色
                color: '#fff', 
                borderRadius: 6, 
                padding: 8, 
                fontSize: 14 
              },
              code_block_text: {
                backgroundColor: '#111', // 关键：同步设置
                color: '#fff',
                fontSize: 14,
              },
              code_inline: { 
                backgroundColor: '#111', // 修改为黑色
                color: '#fff', 
                borderRadius: 4, 
                padding: 2, 
                fontSize: 14 
              },
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
    return null;
  };

  const renderTTSButtons = (message: Message) => {
    if (message.sender !== 'bot' || message.isLoading) return null;
    const audioState = audioStates[message.id] || ttsService.getAudioState(message.id);
    const isVisualNovel = mode === 'visual-novel';

    if (audioState.isLoading) {
      return (
        <View style={[
          styles.actionCircleButton,
          { width: BUTTON_SIZE, height: BUTTON_SIZE, marginRight: BUTTON_MARGIN }
        ]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      );
    }
    if (audioState.hasAudio) {
      return (
        <TouchableOpacity
          style={[
            styles.actionCircleButton,
            audioState.isPlaying && styles.actionCircleButtonActive,
            { width: BUTTON_SIZE, height: BUTTON_SIZE, marginRight: BUTTON_MARGIN }
          ]}
          onPress={() => handlePlayAudio(message.id)}
        >
          <Ionicons
            name={audioState.isPlaying ? "pause" : audioState.isComplete ? "refresh" : "play"}
            size={BUTTON_ICON_SIZE}
            color="#fff"
          />
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={[
          styles.actionCircleButton,
          { width: BUTTON_SIZE, height: BUTTON_SIZE, marginRight: BUTTON_MARGIN }
        ]}
        onPress={() => handleTTSButtonPress(message.id, message.text)}
      >
        <Ionicons name="volume-high" size={BUTTON_ICON_SIZE} color="#fff" />
      </TouchableOpacity>
    );
  };

  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalText, setEditModalText] = useState('');
  const [editTargetMsgId, setEditTargetMsgId] = useState<string | null>(null);
  const [editTargetAiIndex, setEditTargetAiIndex] = useState<number>(-1);

  const handleEditButton = (message: Message, aiIndex: number) => {
    setEditModalText(message.text);
    setEditTargetMsgId(message.id);
    setEditTargetAiIndex(aiIndex);
    setEditModalVisible(true);
  };

  const handleDeleteButton = (message: Message, aiIndex: number) => {
    Alert.alert(
      '删除AI消息',
      '确定要删除该AI消息及其对应的用户消息吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            if (onDeleteMessage) onDeleteMessage(message.id, aiIndex);
          }
        }
      ]
    );
  };

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
            style={[styles.messageAvatar, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }]}
          />
        )}
        {isUser ? (
          <View style={[styles.userMessageWrapper, {maxWidth: MAX_WIDTH}]}>
            {user?.avatar && (
              <Image
                source={{ uri: String(user.avatar) }}
                style={[styles.userMessageAvatar, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }]}
              />
            )}
            <LinearGradient
              colors={['rgba(255, 224, 195, 0.95)', 'rgba(255, 200, 170, 0.95)']}
              style={[styles.userGradient, {borderRadius: 18, borderTopRightRadius: 4}]}
            >
              {processMessageContent(message.text, true)}
            </LinearGradient>
          </View>
        ) : (
          <View style={[styles.botMessageTextContainer, {maxWidth: MAX_WIDTH}]}>
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
    const isBot = message.sender === 'bot' && !message.isLoading;
    const isAutoMessage = !!message.metadata?.isAutoMessageResponse;
    const isRegenerating = regeneratingMessageId === message.id;
    const aiIndex = getAiMessageIndex(index);

    // --- 新增: 判断是否为first_mes ---
    let isFirstMes = false;
    if (message.metadata?.isFirstMes) {
      isFirstMes = true;
    } else if (
      selectedCharacter &&
      selectedCharacter.jsonData
    ) {
      try {
        const characterData = JSON.parse(selectedCharacter.jsonData);
        if (
          characterData.roleCard?.first_mes &&
          message.text === characterData.roleCard.first_mes
        ) {
          isFirstMes = true;
        }
      } catch (e) {
        // ignore
      }
    }

    return (
      <View style={styles.messageActionsRow}>
        <View style={styles.messageActionsLeft}>
          {isBot && !isAutoMessage && renderTTSButtons(message)}
        </View>
        <View style={styles.messageActionsRight}>
          {/* 只允许非first_mes的AI消息显示编辑/删除/再生按钮 */}
          {isBot && !isAutoMessage && !isFirstMes && (
            <>
              <TouchableOpacity
                style={[
                  styles.actionCircleButton,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, marginLeft: BUTTON_MARGIN }
                ]}
                onPress={() => handleEditButton(message, aiIndex)}
                disabled={!!regeneratingMessageId}
              >
                <Ionicons name="create-outline" size={BUTTON_ICON_SIZE} color={regeneratingMessageId ? "#999999" : "#f1c40f"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionCircleButton,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, marginLeft: BUTTON_MARGIN }
                ]}
                onPress={() => handleDeleteButton(message, aiIndex)}
                disabled={!!regeneratingMessageId}
              >
                <Ionicons name="trash-outline" size={BUTTON_ICON_SIZE} color={regeneratingMessageId ? "#999999" : "#e74c3c"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionCircleButton,
                  isRegenerating && styles.actionCircleButtonActive,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, marginLeft: BUTTON_MARGIN }
                ]}
                disabled={isRegenerating || !!regeneratingMessageId}
                onPress={() => onRegenerateMessage && onRegenerateMessage(message.id, aiIndex)}
              >
                {isRegenerating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name="refresh"
                    size={BUTTON_ICON_SIZE}
                    color={regeneratingMessageId ? "#999999" : "#3498db"}
                  />
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
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

    // 判断是否first_mes
    let isFirstMes = false;
    if (lastMessage.metadata?.isFirstMes) {
      isFirstMes = true;
    } else if (
      selectedCharacter &&
      selectedCharacter.jsonData
    ) {
      try {
        const characterData = JSON.parse(selectedCharacter.jsonData);
        if (
          characterData.roleCard?.first_mes &&
          lastMessage.text === characterData.roleCard.first_mes
        ) {
          isFirstMes = true;
        }
      } catch (e) {
        // ignore
      }
    }

    return (
      <>
        <View style={[
          styles.visualNovelContainer,
          {
            backgroundColor: getVnBgColor(),
            top: vnExpanded ? 0 : undefined, // 展开时紧贴topbar
            bottom: 10,
            left: 10,
            right: 10,
            maxHeight: vnExpanded ? height - 10 : 320,
            minHeight: 200,
          }
        ]}>
          <View style={styles.visualNovelHeaderRow}>
            {/* 右侧：历史按钮 */}
            <TouchableOpacity
              style={[
                styles.visualNovelHeaderButton,
                { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent' }
              ]}
              onPress={() => setHistoryModalVisible && setHistoryModalVisible(true)}
            >
              <Ionicons name="time-outline" size={BUTTON_ICON_SIZE} color="#fff" />
            </TouchableOpacity>
            {/* 左侧：展开/收起、透明度按钮 */}
            <View style={styles.visualNovelHeaderLeftButtons}>
              <TouchableOpacity
                style={[
                  styles.visualNovelHeaderButton,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginRight: 8 }
                ]}
                onPress={() => setVnExpanded(v => !v)}
              >
                <Ionicons name={vnExpanded ? "chevron-down" : "chevron-up"} size={BUTTON_ICON_SIZE} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                ref={ref => { alphaBtnRef.current = ref }}
                style={[
                  styles.visualNovelHeaderButton,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent' }
                ]}
                onLayout={e => setAlphaBtnLayout(e.nativeEvent.layout)}
                onPress={() => setShowAlphaSlider(v => !v)}
                activeOpacity={0.8}
              >
                <Ionicons name="color-filter-outline" size={BUTTON_ICON_SIZE} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          {/* 透明度调节pad，绝对定位到透明度按钮右侧 */}
          {showAlphaSlider && (
            <View
              style={[
                styles.visualNovelAlphaSliderContainer,
                {
                  top: alphaBtnLayout.y,
                  left: alphaBtnLayout.x + alphaBtnLayout.width + 8,
                  // 若超出屏幕右侧则自动向左偏移
                  right: undefined,
                  maxWidth: width - (alphaBtnLayout.x + alphaBtnLayout.width + 24),
                }
              ]}
            >
              <Text style={styles.visualNovelAlphaLabel}>背景透明度: {(vnBgAlpha * 100).toFixed(0)}%</Text>
              <Slider
                style={{ width: 140, height: 32 }}
                minimumValue={0.2}
                maximumValue={1}
                step={0.01}
                value={vnBgAlpha}
                minimumTrackTintColor="#FFD580"
                maximumTrackTintColor="#888"
                thumbTintColor="#FFD580"
                onValueChange={handleAlphaChange}
              />
            </View>
          )}
          {/* 展开时不显示头像和名称 */}
          {!vnExpanded && (
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
            </View>
          )}
          <ScrollView
            style={[
              styles.visualNovelTextContainer,
              {
                maxHeight: getVNTextMaxHeight(),
                marginBottom: 0,
                marginTop: vnExpanded ? 8 : 0,
              }
            ]}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <View style={styles.visualNovelTextWrapper}>
              {containsComplexHtml(displayText) || /<\/?[a-z][^>]*>/i.test(displayText) ? (
                <RichTextRenderer 
                  html={optimizeHtmlForRendering(stripUnknownTags(displayText))}
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
            {/* 音量按钮 */}
            {!isUser && !lastMessage.isLoading && (
              <>
                <TouchableOpacity
                  style={[
                    styles.actionCircleButton,
                    { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginRight: BUTTON_MARGIN }
                  ]}
                  onPress={() => renderTTSButtons(lastMessage)?.props?.onPress?.()}
                  disabled={renderTTSButtons(lastMessage)?.props?.disabled}
                >
                  <Ionicons
                    name="volume-high"
                    size={BUTTON_ICON_SIZE}
                    color="#fff"
                  />
                </TouchableOpacity>
              </>
            )}
            {/* 音量按钮左侧：再生、编辑、删除按钮（仅AI消息，非first_mes），无论展开或收起都显示 */}
            {!isUser && !lastMessage.isLoading && !isFirstMes && (
              <View style={styles.visualNovelActionRow}>
                <TouchableOpacity
                  style={[
                    styles.actionCircleButton,
                    { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
                  ]}
                  onPress={() => {
                    // 修复：弹出编辑框而不是直接调用onEditMessage
                    setEditModalText(lastMessage.text);
                    setEditTargetMsgId(lastMessage.id);
                    setEditTargetAiIndex(aiIndex);
                    setEditModalVisible(true);
                  }}
                  disabled={!!regeneratingMessageId}
                >
                  <Ionicons name="create-outline" size={BUTTON_ICON_SIZE} color={regeneratingMessageId ? "#999999" : "#f1c40f"} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionCircleButton,
                    { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
                  ]}
                  onPress={() => {
                    Alert.alert(
                      '删除AI消息',
                      '确定要删除该AI消息及其对应的用户消息吗？',
                      [
                        { text: '取消', style: 'cancel' },
                        {
                          text: '删除',
                          style: 'destructive',
                          onPress: () => {
                            if (onDeleteMessage) onDeleteMessage(lastMessage.id, aiIndex);
                          }
                        }
                      ]
                    );
                  }}
                  disabled={!!regeneratingMessageId}
                >
                  <Ionicons name="trash-outline" size={BUTTON_ICON_SIZE} color={regeneratingMessageId ? "#999999" : "#e74c3c"} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionCircleButton,
                    isRegenerating && styles.actionCircleButtonActive,
                    { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
                  ]}
                  disabled={isRegenerating || !!regeneratingMessageId}
                  onPress={() => onRegenerateMessage && onRegenerateMessage(lastMessage.id, aiIndex)}
                >
                  {isRegenerating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons
                      name="refresh"
                      size={BUTTON_ICON_SIZE}
                      color={regeneratingMessageId ? "#999999" : "#3498db"}
                    />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </>
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

      <TextEditorModal
        isVisible={editModalVisible}
        initialText={editModalText}
        title="编辑AI消息内容"
        placeholder="请输入新的AI消息内容"
        onClose={() => setEditModalVisible(false)}
        onSave={(newText) => {
          if (!newText.trim()) {
            Alert.alert('内容不能为空');
            return;
          }
          if (onEditMessage && editTargetMsgId && editTargetAiIndex >= 0) {
            onEditMessage(editTargetMsgId, editTargetAiIndex, newText);
            setEditModalVisible(false);
          }
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingVertical: RESPONSIVE_PADDING + 8,
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
    marginBottom: Math.max(12, height * 0.02),
    width: '100%',
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
    paddingRight: RESPONSIVE_PADDING,
  },
  botMessageContainer: {
    justifyContent: 'flex-start',
    paddingLeft: RESPONSIVE_PADDING,
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
    marginHorizontal: RESPONSIVE_PADDING,
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
    position: 'relative',
    minHeight: 40,
  },
  userGradient: {
    padding: RESPONSIVE_PADDING + 4,
    paddingHorizontal: RESPONSIVE_PADDING + 8,
  },
  userMessageText: {
    color: '#333',
    fontSize: Math.min(Math.max(14, width * 0.04), 16),
  },
  botMessageTextContainer: {
    backgroundColor: 'rgba(68, 68, 68, 0.85)',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    padding: RESPONSIVE_PADDING + 4,
    paddingHorizontal: RESPONSIVE_PADDING + 8,
    width: '100%',
    paddingTop: RESPONSIVE_PADDING + 12,
    maxWidth: '98%',
    marginTop: AVATAR_SIZE / 2,
  },
  botMessageText: {
    color: '#fff',
    fontSize: Math.min(Math.max(14, width * 0.04), 16),
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
  messageActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: BUTTON_MARGIN,
    width: '100%',
    minHeight: BUTTON_SIZE,
  },
  messageActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  messageActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  actionCircleButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 0,
    marginVertical: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  actionCircleButtonActive: {
    backgroundColor: 'rgba(255,224,195,0.85)',
  },
  timeGroup: {
    alignItems: 'center',
    marginVertical: RESPONSIVE_PADDING,
  },
  timeText: {
    color: '#ddd',
    fontSize: Math.min(Math.max(10, width * 0.03), 12),
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
    backgroundColor: 'rgba(42, 42, 42, 0.5)',
  },
  imageCaption: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 4,
    textAlign: 'center',
  },
  imageDataUrlWarning: {
    backgroundColor: 'rgba(51, 51, 51, 0.8)',
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
  richContentWrapper: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 4,
    marginBottom: 5,
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
  backgroundFocusContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '50%',
  },
  backgroundFocusPadding: {
    paddingTop: 20,
  },
  visualNovelContainer: {
    position: 'absolute',
    borderRadius: 16,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  visualNovelHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    zIndex: 20,
  },
  visualNovelHeaderLeftButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  visualNovelHeaderButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: BUTTON_SIZE / 2,
    padding: 0,
    margin: 0,
  },
  visualNovelExpandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  visualNovelExpandText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 4,
  },
  visualNovelAlphaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  visualNovelAlphaSliderContainer: {
    position: 'absolute',
    zIndex: 99,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: 180,
  },
  visualNovelAlphaLabel: {
    color: '#fff',
    fontSize: 13,
    marginBottom: 6,
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
    minHeight: 60,
    marginBottom: 8,
  },
  visualNovelTextWrapper: {
    marginBottom: 8,
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
  visualNovelActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
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
    marginRight: 'auto',
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
    backgroundColor: '#FFD580',
  },
  visualNovelTTSButtonEnhanced: {
    backgroundColor: '#FFD580',
  },
  visualNovelTTSEnhancerIndicator: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
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
  regeneratingButton: {
    backgroundColor: 'rgba(52, 152, 219, 0.6)',
    width: 36,
    height: 36,
  },
  visualNovelRegeneratingButton: {
    backgroundColor: 'rgba(52, 152, 219, 0.6)',
  },
  messageAvatar: {
    position: 'absolute',
    left: 10,
    top: -15,
    zIndex: 2,
    backgroundColor: '#444',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  userMessageAvatar: {
    position: 'absolute',
    right: -15,
    top: -15,
    zIndex: 2,
    backgroundColor: '#444',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  visualNovelTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'absolute',
    top: 10,
    right: 20,
    zIndex: 20,
    gap: 12,
  },
});

export default ChatDialog;