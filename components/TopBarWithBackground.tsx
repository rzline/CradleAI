import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  StatusBar,
  Animated,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import RegexToolModal from '@/components/RegexToolModal';
import { useRouter } from 'expo-router';

import { Group } from '@/src/group/group-types';
import { GroupAvatar } from './GroupAvatar';
import { CharacterLoader } from '@/src/utils/character-loader';
import { GroupScheduler } from '@/src/group/group-scheduler';

interface GroupChatSettings {
  dailyMessageLimit: number;
  replyIntervalMinutes: number;
  referenceMessageLimit: number;
  timedMessagesEnabled: boolean;
}

interface TopBarWithBackgroundProps {
  selectedCharacter: Character | undefined | null;
  selectedGroup?: Group | null;
  onAvatarPress: () => void;
  onMemoPress: () => void;
  onSettingsPress: () => void;
  onMenuPress: () => void;
  onSaveManagerPress?: () => void;
  showBackground?: boolean;
  isGroupMode?: boolean;
  onGroupSettingsChange?: (settings: GroupChatSettings) => void;
  currentUser?: any;
  onGroupDisbanded?: (groupId: string) => void;
  isEmpty?: boolean; // Add new prop to indicate empty state
  onGroupSettingsPress?: () => void; // Add this for group settings sidebar
}

const HEADER_HEIGHT = 90;
const { width } = Dimensions.get('window');
const BUTTON_SIZE = Math.max(Math.min(width * 0.07, 28), 24); // Between 24-28dp depending on screen size
const AVATAR_SIZE = Math.max(Math.min(width * 0.1, 40), 34); // Between 34-40dp depending on screen size
const ACTION_BUTTON_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 }; // Larger touch area

const TopBarWithBackground: React.FC<TopBarWithBackgroundProps> = ({
  selectedCharacter,
  selectedGroup,
  onAvatarPress,
  onMemoPress,
  onSettingsPress,
  onMenuPress,
  onSaveManagerPress,
  showBackground = true,
  isGroupMode = false,
  onGroupSettingsChange,
  currentUser,
  onGroupDisbanded,
  isEmpty = false, // Default to false for backward compatibility
  onGroupSettingsPress, // New prop for group settings sidebar
}) => {
  const [scrollY] = useState(new Animated.Value(0));
  const [navbarHeight, setNavbarHeight] = useState(
    Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0
  );
  const [isRegexModalVisible, setIsRegexModalVisible] = useState(false);
  const [isMemoryControlVisible, setIsMemoryControlVisible] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (isGroupMode && selectedGroup) {
      const loadGroupMembers = async () => {
        try {
          const characterIds = selectedGroup.groupMemberIds.filter(
            id => id !== selectedGroup.groupOwnerId
          );

          if (characterIds.length > 0) {
            const characters = await CharacterLoader.loadCharactersByIds(characterIds);
            setGroupMembers(characters);
            console.log(`【TopBar】已加载${characters.length}个群组成员`);
          } else {
            setGroupMembers([]);
          }
        } catch (error) {
          console.error('【TopBar】加载群组成员信息失败:', error);
          setGroupMembers([]);
        }
      };

      loadGroupMembers();
    }
  }, [isGroupMode, selectedGroup]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [0.85, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (Platform.OS === 'ios') {
      setNavbarHeight(44);
    }
  }, []);

  const handleMemoryControlPress = () => {
    setIsMemoryControlVisible(true);
    console.log('[TopBar] Opening memory control panel');
  };

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: headerOpacity,
            height: HEADER_HEIGHT,
            paddingTop: navbarHeight,
          },
        ]}
      >
        {showBackground && (!isGroupMode ? (selectedCharacter?.backgroundImage ? (
          <Image
            source={
              typeof selectedCharacter.backgroundImage === 'string'
                ? { uri: selectedCharacter.backgroundImage }
                : (selectedCharacter.backgroundImage as any) || require('@/assets/images/default-background.jpg')
            }
            style={styles.backgroundImage}
          />
        ) : (
          <LinearGradient
            colors={['#333', '#282828']}
            style={styles.backgroundGradient}
          />
        )) : (
          <LinearGradient
            colors={['#2c3e50', '#1a2533']}
            style={styles.backgroundGradient}
          />
        ))}

        {showBackground && <BlurView intensity={80} style={styles.blurView} tint="dark" />}

        {showBackground && <View style={styles.overlay} />}

        <View style={styles.content}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={onMenuPress}
            hitSlop={ACTION_BUTTON_HIT_SLOP}
          >
            <Ionicons name="menu" size={BUTTON_SIZE} color="#fff" />
          </TouchableOpacity>

          {/* Only show character info when not in empty state or in group mode */}
          {(!isEmpty || isGroupMode) && (
            <View style={styles.characterInfo}>
              <TouchableOpacity
                style={styles.avatarContainer}
                onPress={onAvatarPress}
              >
                {isGroupMode && selectedGroup ? (
                  <View style={styles.groupAvatarWrapper}>
                    <GroupAvatar
                      members={groupMembers}
                      size={AVATAR_SIZE}
                      maxDisplayed={4}
                    />
                  </View>
                ) : (
                  <Image
                    source={
                      selectedCharacter?.avatar
                        ? { uri: String(selectedCharacter.avatar) }
                        : require('@/assets/images/default-avatar.png')
                    }
                    style={[styles.avatar, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }]}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.nameContainer}
                onPress={onAvatarPress}
              >
                <Text style={styles.characterName} numberOfLines={1}>
                  {isGroupMode
                    ? (selectedGroup?.groupName || '群聊')
                    : (selectedCharacter?.name || '选择角色')}
                </Text>

                {isGroupMode && selectedGroup?.groupTopic && (
                  <Text style={styles.groupTopic} numberOfLines={1}>
                    {selectedGroup.groupTopic}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Empty placeholder div to maintain layout when character info is hidden */}
          {isEmpty && !isGroupMode && (
            <View style={styles.emptySpace} />
          )}

          <View style={styles.actions}>

            {/* Only show memo button if not in empty state and not in group mode */}
            {!isEmpty && !isGroupMode && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onMemoPress}
                hitSlop={ACTION_BUTTON_HIT_SLOP}
              >
                <MaterialCommunityIcons name="notebook-outline" size={BUTTON_SIZE} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Only show save manager button if not in empty state and not in group mode */}
            {!isEmpty && !isGroupMode && onSaveManagerPress && (
              <TouchableOpacity 
                onPress={onSaveManagerPress} 
                style={styles.actionButton}
                hitSlop={ACTION_BUTTON_HIT_SLOP}
              >
                <Ionicons name="bookmark-outline" size={BUTTON_SIZE} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Always show group manage button in group mode, even when empty */}
            {isGroupMode && (
              <TouchableOpacity
                onPress={onAvatarPress}
                style={[styles.actionButton, styles.groupManageButton]}
                hitSlop={ACTION_BUTTON_HIT_SLOP}
              >
                <Ionicons name="people" size={BUTTON_SIZE} color="#fff" />
              </TouchableOpacity>
            )}

            {/* 全局设置按钮，仅在非空状态下显示，可根据需要调整显示条件 */}
            {!isEmpty && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/pages/global-settings')}
                hitSlop={ACTION_BUTTON_HIT_SLOP}
              >
                <Ionicons name="earth-outline" size={BUTTON_SIZE} color="#fff" />
              </TouchableOpacity>
            )}

             {(isGroupMode || !isEmpty) && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={isGroupMode ? onGroupSettingsPress : onSettingsPress}
                hitSlop={ACTION_BUTTON_HIT_SLOP}
              >
                <Ionicons name="settings-outline" size={BUTTON_SIZE} color="#fff" />
              </TouchableOpacity>
            )}

          </View>
        </View>
      </Animated.View>

      <RegexToolModal
        visible={isRegexModalVisible}
        onClose={() => setIsRegexModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  groupAvatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTopic: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  backgroundGradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  blurView: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  menuButton: {
    padding: Math.max(6, width * 0.015), // Responsive padding
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: Math.max(6, width * 0.02), // Responsive horizontal padding
  },
  avatarContainer: {
    marginRight: Math.max(8, width * 0.03), // Responsive margin
  },
  avatar: {
    borderWidth: 2,
    borderColor: 'rgb(255, 224, 195)',
  },
  nameContainer: {
    flex: 1,
    paddingRight: Math.max(4, width * 0.01), // Add padding to prevent text from touching buttons
  },
  characterName: {
    color: '#fff',
    fontSize: Math.min(Math.max(16, width * 0.045), 18), // Responsive font size between 16-18
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Math.max(4, width * 0.01), // Add some right margin
  },
  actionButton: {
    padding: Math.max(6, width * 0.015), // Responsive padding
    marginLeft: Math.max(2, width * 0.01), // Responsive margin
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: BUTTON_SIZE + 12, // Ensure minimum touch target size
    minHeight: BUTTON_SIZE + 12, // Ensure minimum touch target size
  },
  groupManageButton: {
    borderRadius: 20,
    padding: Math.max(6, width * 0.015), // Responsive padding
    marginLeft: Math.max(6, width * 0.015), // Responsive margin
    zIndex: 5,
  },
  emptySpace: {
    flex: 1, // Take up the same space as characterInfo would
  },
});

export default TopBarWithBackground;