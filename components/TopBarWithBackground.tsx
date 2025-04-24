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
  Modal,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import RegexToolModal from '@/components/RegexToolModal';
import MemoryProcessingControl from '@/src/memory/components/MemoryProcessingControl';
import { Group } from '@/src/group/group-types';
import { GroupAvatar } from './GroupAvatar';
import { CharacterLoader } from '@/src/utils/character-loader';
import { disbandGroup as disbandGroupAction, clearGroupMessages as clearGroupMessagesAction } from '@/src/group';
import { GroupScheduler } from '@/src/group/group-scheduler';

const GroupSettingsModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSave: (settings: GroupChatSettings) => void;
  initialSettings?: GroupChatSettings;
  selectedGroup?: Group | null;
  currentUser?: any;
  onDisbandGroup?: () => void;
  onClearChatHistory?: () => void;
}> = ({ visible, onClose, onSave, initialSettings, selectedGroup, currentUser, onDisbandGroup, onClearChatHistory }) => {
  const [settings, setSettings] = useState<GroupChatSettings>({
    dailyMessageLimit: initialSettings?.dailyMessageLimit || 50,
    replyIntervalMinutes: initialSettings?.replyIntervalMinutes || 1,
    referenceMessageLimit: initialSettings?.referenceMessageLimit || 5,
    timedMessagesEnabled: initialSettings?.timedMessagesEnabled ?? false,
  });

  useEffect(() => {
    if (selectedGroup) {
      const loadGroupSettings = async () => {
        try {
          const storageKey = `group_settings_${selectedGroup.groupId}`;
          const savedSettings = await AsyncStorage.getItem(storageKey);
          
          if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            console.log(`[GroupSettingsModal] Loaded saved settings for group ${selectedGroup.groupId}:`, parsedSettings);
            setSettings(parsedSettings);
          } else {
            console.log(`[GroupSettingsModal] No saved settings found for group ${selectedGroup.groupId}, using defaults`);
            if (initialSettings) {
              setSettings(initialSettings);
            }
          }
        } catch (error) {
          console.error('[GroupSettingsModal] Error loading group settings from AsyncStorage:', error);
        }
      };
      
      loadGroupSettings();
    }
  }, [selectedGroup, initialSettings]);

  const isOwner = selectedGroup && currentUser && selectedGroup.groupOwnerId === currentUser.id;

  const handleDisbandGroup = () => {
    if (!selectedGroup) return;

    Alert.alert(
      "解散群聊",
      `确定要解散群聊"${selectedGroup.groupName}"吗？此操作不可撤销，所有群聊消息将被永久删除。`,
      [
        {
          text: "取消",
          style: "cancel"
        },
        {
          text: "确定解散",
          style: "destructive",
          onPress: () => {
            onClose();
            if (onDisbandGroup) {
              onDisbandGroup();
            }
          }
        }
      ]
    );
  };

  const handleClearChatHistory = () => {
    if (!selectedGroup) return;

    Alert.alert(
      "清空聊天记录",
      `确定要清空"${selectedGroup.groupName}"的所有聊天记录吗？此操作不可撤销，所有消息将被永久删除。`,
      [
        {
          text: "取消",
          style: "cancel"
        },
        {
          text: "确定清空",
          style: "destructive",
          onPress: () => {
            if (onClearChatHistory) {
              onClearChatHistory();
            }
          }
        }
      ]
    );
  };

  const handleSaveSettings = async () => {
    if (selectedGroup) {
      try {
        const storageKey = `group_settings_${selectedGroup.groupId}`;
        await AsyncStorage.setItem(storageKey, JSON.stringify(settings));
        console.log(`[GroupSettingsModal] Saved settings for group ${selectedGroup.groupId}:`, settings);
        
        onSave(settings);
        onClose();
      } catch (error) {
        console.error('[GroupSettingsModal] Error saving group settings to AsyncStorage:', error);
        Alert.alert('保存失败', '无法保存群聊设置，请重试');
      }
    } else {
      onSave(settings);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={groupSettingsStyles.modalOverlay}>
        <View style={groupSettingsStyles.modalContent}>
          <View style={groupSettingsStyles.modalHeader}>
            <Text style={groupSettingsStyles.modalTitle}>群聊设置</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={groupSettingsStyles.settingItem}>
            <View style={groupSettingsStyles.settingToggleRow}>
              <View style={groupSettingsStyles.settingLabelContainer}>
                <Text style={groupSettingsStyles.settingLabel}>启用定时消息</Text>
                <Text style={groupSettingsStyles.settingDescription}>
                  让角色在群聊无人发言时主动发言
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  groupSettingsStyles.toggleButton,
                  settings.timedMessagesEnabled ? groupSettingsStyles.toggleButtonActive : {}
                ]}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  timedMessagesEnabled: !prev.timedMessagesEnabled
                }))}
              >
                <View style={[
                  groupSettingsStyles.toggleKnob,
                  settings.timedMessagesEnabled ? groupSettingsStyles.toggleKnobActive : {}
                ]} />
              </TouchableOpacity>
            </View>
          </View>

          {settings.timedMessagesEnabled && (
            <View style={groupSettingsStyles.settingItem}>
              <Text style={groupSettingsStyles.settingLabel}>回复时间间隔 (分钟)</Text>
              <Text style={groupSettingsStyles.settingDescription}>
                设置角色两次回复之间的最小时间间隔
              </Text>
              <View style={groupSettingsStyles.settingControl}>
                <TouchableOpacity
                  style={groupSettingsStyles.adjustButton}
                  onPress={() => setSettings(prev => ({
                    ...prev,
                    replyIntervalMinutes: Math.max(0.5, prev.replyIntervalMinutes - 0.5)
                  }))}
                >
                  <Ionicons name="remove" size={18} color="#fff" />
                </TouchableOpacity>
                <Text style={groupSettingsStyles.settingValue}>
                  {settings.replyIntervalMinutes}
                </Text>
                <TouchableOpacity
                  style={groupSettingsStyles.adjustButton}
                  onPress={() => setSettings(prev => ({
                    ...prev,
                    replyIntervalMinutes: Math.min(10, prev.replyIntervalMinutes + 0.5)
                  }))}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={groupSettingsStyles.settingItem}>
            <Text style={groupSettingsStyles.settingLabel}>每日消息数量限制</Text>
            <Text style={groupSettingsStyles.settingDescription}>
              设置角色每天可以发送的最大消息数量
            </Text>
            <View style={groupSettingsStyles.settingControl}>
              <TouchableOpacity
                style={groupSettingsStyles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  dailyMessageLimit: Math.max(1, prev.dailyMessageLimit - 10)
                }))}
              >
                <Ionicons name="remove" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={groupSettingsStyles.settingValue}>
                {settings.dailyMessageLimit}
              </Text>
              <TouchableOpacity
                style={groupSettingsStyles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  dailyMessageLimit: Math.min(100, prev.dailyMessageLimit + 10)
                }))}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={groupSettingsStyles.settingItem}>
            <Text style={groupSettingsStyles.settingLabel}>参考消息数量限制</Text>
            <Text style={groupSettingsStyles.settingDescription}>
              设置角色回复时可以参考的历史消息数量
            </Text>
            <View style={groupSettingsStyles.settingControl}>
              <TouchableOpacity
                style={groupSettingsStyles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  referenceMessageLimit: Math.max(1, prev.referenceMessageLimit - 1)
                }))}
              >
                <Ionicons name="remove" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={groupSettingsStyles.settingValue}>
                {settings.referenceMessageLimit}
              </Text>
              <TouchableOpacity
                style={groupSettingsStyles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  referenceMessageLimit: Math.min(10, prev.referenceMessageLimit + 1)
                }))}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={groupSettingsStyles.dangerSection}>
            <TouchableOpacity
              style={groupSettingsStyles.disbandButton}
              onPress={handleDisbandGroup}
            >
              <Text style={groupSettingsStyles.disbandButtonText}>解散群聊</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={groupSettingsStyles.clearHistoryButton}
              onPress={handleClearChatHistory}
            >
              <Text style={groupSettingsStyles.clearHistoryButtonText}>清空聊天记录</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={groupSettingsStyles.saveButton}
            onPress={handleSaveSettings}
          >
            <Text style={groupSettingsStyles.saveButtonText}>保存设置</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

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
}

const HEADER_HEIGHT = 90;
const { width } = Dimensions.get('window');

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
}) => {
  const [scrollY] = useState(new Animated.Value(0));
  const [navbarHeight, setNavbarHeight] = useState(
    Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0
  );
  const [isRegexModalVisible, setIsRegexModalVisible] = useState(false);
  const [isMemoryControlVisible, setIsMemoryControlVisible] = useState(false);
  const [isGroupSettingsVisible, setGroupSettingsVisible] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const [groupSettings, setGroupSettings] = useState<GroupChatSettings>({
    dailyMessageLimit: 50,
    replyIntervalMinutes: 1,
    referenceMessageLimit: 5,
    timedMessagesEnabled: false,
  });

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

      const loadGroupSettings = async () => {
        try {
          const storageKey = `group_settings_${selectedGroup.groupId}`;
          const savedSettings = await AsyncStorage.getItem(storageKey);
          
          if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            console.log(`[TopBar] Loaded persisted settings for group ${selectedGroup.groupId}:`, parsedSettings);
            setGroupSettings(parsedSettings);
          } else {
            const scheduler = GroupScheduler.getInstance();
            const schedulerSettings = scheduler.getGroupSettings(selectedGroup.groupId);
            console.log(`[TopBar] Loaded scheduler settings for group ${selectedGroup.groupId}:`, schedulerSettings);
            setGroupSettings(schedulerSettings);
          }
        } catch (error) {
          console.error('[TopBar] Error loading group settings:', error);
        }
      };
      
      loadGroupSettings();
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

  const handleGroupSettingsPress = () => {
    setGroupSettingsVisible(true);
    console.log('[TopBar] Opening group settings panel');
  };

  const handleSaveGroupSettings = async (newSettings: GroupChatSettings) => {
    setGroupSettings(newSettings);
    
    if (selectedGroup) {
      try {
        const scheduler = GroupScheduler.getInstance();
        
        scheduler.setGroupSettings(selectedGroup.groupId, {
          dailyMessageLimit: newSettings.dailyMessageLimit,
          replyIntervalMinutes: newSettings.replyIntervalMinutes,
          referenceMessageLimit: newSettings.referenceMessageLimit,
          timedMessagesEnabled: newSettings.timedMessagesEnabled,
        });
        
        const storageKey = `group_settings_${selectedGroup.groupId}`;
        await AsyncStorage.setItem(storageKey, JSON.stringify(newSettings));
        
        console.log('[TopBar] Group settings saved to scheduler and AsyncStorage:', {
          groupId: selectedGroup.groupId,
          settings: newSettings
        });
      } catch (error) {
        console.error('[TopBar] Error saving group settings:', error);
        Alert.alert('设置保存失败', '无法保存群聊设置，请重试');
      }
    }
    
    if (onGroupSettingsChange) {
      onGroupSettingsChange(newSettings);
    }
  };

  const handleDisbandGroup = async () => {
    if (!selectedGroup || !currentUser) return;

    try {
      console.log('[TopBar] 正在解散群聊:', selectedGroup.groupId);
      const success = await disbandGroupAction(currentUser, selectedGroup.groupId);

      if (success) {
        console.log('[TopBar] 群聊已成功解散');
        if (onGroupDisbanded) {
          onGroupDisbanded(selectedGroup.groupId);
        }
      } else {
        console.error('[TopBar] 解散群聊失败');
        Alert.alert('操作失败', '解散群聊失败，请重试。');
      }
    } catch (error) {
      console.error('[TopBar] 解散群聊出错:', error);
      Alert.alert('操作失败', '解散群聊时发生错误，请重试。');
    }
  };

  const handleClearChatHistory = async () => {
    if (!selectedGroup || !currentUser) return;

    try {
      console.log('[TopBar] 正在清空群聊历史:', selectedGroup.groupId);
      const success = await clearGroupMessagesAction(currentUser, selectedGroup.groupId);

      if (success) {
        console.log('[TopBar] 群聊历史已成功清空');
        Alert.alert('操作成功', '聊天记录已清空');
        setGroupSettingsVisible(false);
      } else {
        console.error('[TopBar] 清空群聊历史失败');
        Alert.alert('操作失败', '清空聊天记录失败，请重试。');
      }
    } catch (error) {
      console.error('[TopBar] 清空群聊历史出错:', error);
      Alert.alert('操作失败', '清空聊天记录时发生错误，请重试。');
    }
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
                : (selectedCharacter.backgroundImage as any) || require('@/assets/images/default-background.jpeg')
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
          >
            <Ionicons name="menu" size={26} color="#fff" />
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
                      size={40}
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
                    style={styles.avatar}
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
            {/* Only show memory control button if not in empty state and not in group mode */}
            {!isEmpty && !isGroupMode && selectedCharacter && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleMemoryControlPress}
                accessibilityLabel="Memory Control"
              >
                <MaterialCommunityIcons
                  name="memory"
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>
            )}

            {/* Only show memo button if not in empty state and not in group mode */}
            {!isEmpty && !isGroupMode && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onMemoPress}
              >
                <MaterialCommunityIcons name="notebook-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Show settings button in group mode or if not empty in character mode */}
            {(isGroupMode || !isEmpty) && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={isGroupMode ? handleGroupSettingsPress : onSettingsPress}
              >
                <Ionicons name="settings-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Only show save manager button if not in empty state and not in group mode */}
            {!isEmpty && !isGroupMode && onSaveManagerPress && (
              <TouchableOpacity onPress={onSaveManagerPress} style={styles.actionButton}>
                <Ionicons name="bookmark-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Always show group manage button in group mode, even when empty */}
            {isGroupMode && (
              <TouchableOpacity
                onPress={onAvatarPress}
                style={[styles.actionButton, styles.groupManageButton]}
              >
                <Ionicons name="people" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>

      {!isGroupMode && (
        <MemoryProcessingControl
          visible={isMemoryControlVisible}
          onClose={() => setIsMemoryControlVisible(false)}
          characterId={selectedCharacter?.id}
          conversationId={selectedCharacter ? `conversation-${selectedCharacter.id}` : undefined}
        />
      )}

      {isGroupMode && (
        <GroupSettingsModal
          visible={isGroupSettingsVisible}
          onClose={() => setGroupSettingsVisible(false)}
          onSave={handleSaveGroupSettings}
          initialSettings={groupSettings}
          selectedGroup={selectedGroup}
          currentUser={currentUser}
          onDisbandGroup={handleDisbandGroup}
          onClearChatHistory={handleClearChatHistory}
        />
      )}

      <RegexToolModal
        visible={isRegexModalVisible}
        onClose={() => setIsRegexModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  groupAvatarWrapper: {
    width: 40,
    height: 40,
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
    padding: 8,
  },
  characterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgb(255, 224, 195)',
  },
  nameContainer: {
    flex: 1,
  },
  characterName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
    position: 'relative',
  },
  groupManageButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    borderRadius: 20,
    padding: 8,
    marginLeft: 8,
    zIndex: 5,
  },
  emptySpace: {
    flex: 1, // Take up the same space as characterInfo would
  },
});

const groupSettingsStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxHeight: '100%',
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  settingsContainer: {
    flex: 1,
    maxHeight: 300,
  },
  settingItem: {
    marginVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 15,
  },
  settingLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 5,
  },
  settingDescription: {
    fontSize: 12,
    color: '#bbb',
    marginBottom: 10,
  },
  settingControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 18,
    color: 'rgb(255, 224, 195)',
    marginHorizontal: 15,
    width: 40,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: 'rgb(255, 224, 195)',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  dangerSection: {
    marginTop: 10,
  },
  dangerSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'rgba(255,59,48,0.9)',
    marginBottom: 10,
  },
  disbandButton: {
    backgroundColor: 'rgba(255,59,48,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  disbandButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  clearHistoryButton: {
    backgroundColor: 'rgba(255, 127, 0, 0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  clearHistoryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dangerDescription: {
    fontSize: 12,
    color: 'rgba(255,59,48,0.9)',
    fontStyle: 'italic',
  },
  settingToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  settingLabelContainer: {
    flex: 1,
  },
  toggleButton: {
    width: 50,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(255, 224, 195, 0.5)',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgb(255, 224, 195)',
  },
});

export default TopBarWithBackground;
