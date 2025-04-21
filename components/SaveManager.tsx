import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Image,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatSaveService } from '@/services/ChatSaveService';
import { ChatSave, Message } from '@/shared/types';
import { BlurView } from 'expo-blur';
import { theme } from '@/constants/theme';
import { formatDate } from '@/utils/dateUtils';
import { NodeSTManager } from '@/utils/NodeSTManager';

interface SaveManagerProps {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  messages: Message[];
  onSaveCreated?: (save: ChatSave) => void;
  onLoadSave?: (save: ChatSave) => void;
  onPreviewSave?: (save: ChatSave) => void;
}

const SaveManager: React.FC<SaveManagerProps> = ({
  visible,
  onClose,
  conversationId,
  characterId,
  characterName,
  characterAvatar,
  messages,
  onSaveCreated,
  onLoadSave,
  onPreviewSave
}) => {
  const [tab, setTab] = useState<'load' | 'save'>('load');
  const [saveDescription, setSaveDescription] = useState('');
  const [saves, setSaves] = useState<ChatSave[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSave, setSelectedSave] = useState<ChatSave | null>(null);

  // Load saves for this conversation
  useEffect(() => {
    if (visible) {
      loadSaves();
    }
  }, [visible, conversationId]);

  const loadSaves = async () => {
    if (!conversationId) return;
    
    setLoading(true);
    try {
      const conversationSaves = await chatSaveService.getSavesForConversation(conversationId);
      setSaves(conversationSaves);
    } catch (error) {
      console.error('Error loading saves:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSave = async () => {
    if (!conversationId || messages.length === 0) {
      Alert.alert('Error', 'Cannot create save point - no messages.');
      return;
    }
    
    if (!saveDescription.trim()) {
      Alert.alert('Error', 'Please enter a description.');
      return;
    }
    
    setLoading(true);
    try {
      const newSave = await chatSaveService.saveChat(
        conversationId,
        characterId,
        characterName,
        messages,
        saveDescription,
        characterAvatar
      );
      
      setSaveDescription('');
      setSaves(prev => [newSave, ...prev]);
      
      if (onSaveCreated) {
        onSaveCreated(newSave);
      }
      
      Alert.alert('Success', 'Chat state saved successfully!');
    } catch (error) {
      console.error('Error creating save:', error);
      Alert.alert('Error', 'Failed to save chat state.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSave = async (save: ChatSave) => {
    Alert.alert(
      'Delete Save',
      `Are you sure you want to delete this save point: "${save.description}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await chatSaveService.deleteSave(save.id);
              setSaves(prev => prev.filter(s => s.id !== save.id));
            } catch (error) {
              console.error('Error deleting save:', error);
              Alert.alert('Error', 'Failed to delete save point.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleLoadSave = async (save: ChatSave) => {
    if (onLoadSave) {
      Alert.alert(
        'Load Save',
        `Are you sure you want to restore chat to: "${save.description}"?\n\nThis will replace your current chat state.`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Load',
            onPress: async () => {
              setLoading(true);
              try {
                // First restore the NodeST chat history directly with AsyncStorage
                if (save.nodestChatHistory) {
                  console.log('[SaveManager] Restoring NodeST chat history before UI update');
                  
                  // First use NodeSTManager to restore
                  const restored = await NodeSTManager.restoreChatHistory({
                    conversationId: conversationId,
                    chatHistory: save.nodestChatHistory
                  });
                  
                  // Fall back to ChatSaveService if needed
                  if (!restored) {
                    console.log('[SaveManager] Falling back to ChatSaveService for history restoration');
                    await chatSaveService.restoreNodeSTChatHistory(
                      conversationId,
                      save
                    );
                  }
                  
                  console.log('[SaveManager] NodeST chat history restoration complete');
                } else {
                  console.warn('[SaveManager] Save does not contain NodeST chat history');
                }
                
                // Now call the onLoadSave callback to update UI
                onLoadSave(save);
                
                setLoading(false);
              } catch (error) {
                console.error('[SaveManager] Error restoring chat state:', error);
                Alert.alert('Error', 'Failed to restore chat state.');
                setLoading(false);
              }
            }
          }
        ]
      );
    }
  };

  const handlePreviewSave = async (save: ChatSave) => {
    setSelectedSave(save);
    if (onPreviewSave) {
      onPreviewSave(save);
    }
  };

  const renderSaveItem = ({ item }: { item: ChatSave }) => (
    <View style={[
      styles.saveItem,
      selectedSave?.id === item.id && styles.selectedSaveItem
    ]}>
      <TouchableOpacity 
        style={styles.savePreviewButton}
        onPress={() => handlePreviewSave(item)}
      >
        <View style={styles.saveHeader}>
          <Image 
            source={characterAvatar ? { uri: characterAvatar } : require('@/assets/images/default-avatar.png')} 
            style={styles.saveAvatar}
          />
          <View style={styles.saveInfo}>
            <Text style={styles.saveDescription}>{item.description}</Text>
            <Text style={styles.saveTimestamp}>{formatDate(item.timestamp)}</Text>
            <Text style={styles.savePreviewText}>{item.previewText}</Text>
          </View>
        </View>
      </TouchableOpacity>
      
      <View style={styles.saveActions}>
        <TouchableOpacity 
          style={styles.saveActionButton}
          onPress={() => handleLoadSave(item)}
        >
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.saveActionButton, styles.deleteButton]}
          onPress={() => handleDeleteSave(item)}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={30} style={styles.container} tint="dark">
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>存档管理</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity 
              style={[styles.tab, tab === 'load' && styles.activeTab]} 
              onPress={() => setTab('load')}
            >
              <Text style={[styles.tabText, tab === 'load' && styles.activeTabText]}>读取存档</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tab, tab === 'save' && styles.activeTab]} 
              onPress={() => setTab('save')}
            >
              <Text style={[styles.tabText, tab === 'save' && styles.activeTabText]}>新建存档</Text>
            </TouchableOpacity>
          </View>

          {tab === 'load' ? (
            <>
              <Text style={styles.sectionTitle}>当前存档</Text>
              {saves.length > 0 ? (
                <FlatList
                  data={saves}
                  renderItem={renderSaveItem}
                  keyExtractor={item => item.id}
                  style={styles.savesList}
                  contentContainerStyle={styles.savesListContent}
                />
              ) : (
                <View style={styles.emptySaves}>
                  <Ionicons name="save-outline" size={40} color="#555" />
                  <Text style={styles.emptySavesText}>暂无存档</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.saveForm}>
              <Text style={styles.sectionTitle}>新存档</Text>
              <Text style={styles.label}>描述</Text>
              <TextInput
                style={styles.input}
                placeholder="输入描述..."
                placeholderTextColor="#999"
                value={saveDescription}
                onChangeText={setSaveDescription}
                maxLength={50}
              />
              <TouchableOpacity 
                style={[styles.saveButton, !saveDescription.trim() && styles.disabledButton]}
                onPress={handleCreateSave}
                disabled={!saveDescription.trim() || loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading ? '存档中...' : '保存当前对话进度'}
                </Text>
              </TouchableOpacity>
              
              <View style={styles.saveInfo}>
                <Text style={styles.saveInfoText}>
                  将保存当前对话进度，当前消息数量： {messages.length} .
                </Text>
              </View>
            </View>
          )}
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  },
  modal: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff'
  },
  closeButton: {
    padding: 4
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#444'
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center'
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary
  },
  tabText: {
    fontSize: 16,
    color: '#aaa'
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: 'bold'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12
  },
  savesList: {
    maxHeight: 400
  },
  savesListContent: {
    paddingBottom: 16
  },
  saveItem: {
    backgroundColor: '#333',
    borderRadius: 8,
    marginBottom: 12,
    padding: 12,
    flexDirection: 'column'
  },
  selectedSaveItem: {
    backgroundColor: '#3a4a5a',
    borderColor: theme.colors.primary,
    borderWidth: 1
  },
  saveHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  saveAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12
  },
  saveInfo: {
    flex: 1
  },
  saveDescription: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4
  },
  saveTimestamp: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4
  },
  savePreviewText: {
    fontSize: 14,
    color: '#ccc'
  },
  savePreviewButton: {
    flex: 1
  },
  saveActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12
  },
  saveActionButton: {
    backgroundColor: theme.colors.primary,
    padding: 8,
    borderRadius: 20,
    marginLeft: 8
  },
  deleteButton: {
    backgroundColor: '#e74c3c'
  },
  emptySaves: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40
  },
  emptySavesText: {
    fontSize: 16,
    color: '#aaa',
    marginVertical: 8
  },
  emptySavesSubtext: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center'
  },
  saveForm: {
    padding: 12
  },
  label: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 8
  },
  input: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 16,
    fontSize: 16
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  disabledButton: {
    opacity: 0.5
  },
  saveInfoText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16
  }
});

export default SaveManager;
