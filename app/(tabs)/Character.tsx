import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  SafeAreaView,
  Animated,
  StatusBar,
  Platform,
  ViewStyle,
  TextStyle,
  Modal,
  ImageStyle,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router'; // Add useFocusEffect import
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useCharacters } from '@/constants/CharactersContext';
import { Character } from '@/shared/types';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { CharacterImporter } from '@/utils/CharacterImporter';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CreateChar from '@/app/pages/create_char';
import CradleCreateForm from '@/components/CradleCreateForm';
import { theme } from '@/constants/theme';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'; // Import Video component from expo-av
import DiaryBook from '@/components/diary/DiaryBook'; // Import the DiaryBook component
import { LinearGradient } from 'expo-linear-gradient';
import CharacterEditDialog from '@/components/CharacterEditDialog';
import CharacterImageGallerySidebar from '@/components/CharacterImageGallerySidebar';
import ImageRegenerationModal from '@/components/ImageRegenerationModal';
// 新增：导入表格插件API
import * as TableMemoryAPI from '@/src/memory/plugins/table-memory/api';
import Mem0Service from '@/src/memory/services/Mem0Service'; // 新增：导入Mem0Service
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter'; // 新增：导入StorageAdapter
import * as Sharing from 'expo-sharing'; // 新增：用于分享导出文件

const VIEW_MODE_SMALL = 'small';
const VIEW_MODE_LARGE = 'large';
const VIEW_MODE_VERTICAL = 'vertical'; // New view mode

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const CARD_HEIGHT = CARD_WIDTH * (16 / 9);
const LARGE_CARD_WIDTH = width - 32;
const LARGE_CARD_HEIGHT = LARGE_CARD_WIDTH * (16 / 9);
const VERTICAL_CARD_WIDTH = (width - 48) / 2;
const VERTICAL_CARD_HEIGHT = VERTICAL_CARD_WIDTH * (9 / 16);

const COLOR_BACKGROUND = '#282828';
const COLOR_CARD_BG = '#333333';
const COLOR_BUTTON = 'rgb(255, 224, 195)';
const COLOR_TEXT = '#FFFFFF';

const HEADER_HEIGHT = 90;

const CharactersScreen: React.FC = () => {
  const { characters, isLoading, setIsLoading, deleteCharacters } = useCharacters();
  const router = useRouter();
  const [isManaging, setIsManaging] = useState(false);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'small' | 'large' | 'vertical'>(VIEW_MODE_LARGE);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [creationType, setCreationType] = useState<'manual' | 'auto' | 'import'>('manual');
  const [refreshKey, setRefreshKey] = useState(0);
  // Add state for diary book
  const [showDiaryBook, setShowDiaryBook] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Add loading state for import process
  const [importLoading, setImportLoading] = useState(false);

  // New states for gallery sidebar, image generation, and character editing
  const [showGallerySidebar, setShowGallerySidebar] = useState(false);
  const [gallerySidebarCharacter, setGallerySidebarCharacter] = useState<Character | null>(null);

  const [showImageGenModal, setShowImageGenModal] = useState(false);
  const [imageGenCharacter, setImageGenCharacter] = useState<Character | null>(null);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editDialogCharacter, setEditDialogCharacter] = useState<Character | null>(null);

  // State for managing character images
  const [characterImages, setCharacterImages] = useState<Record<string, any[]>>({});

  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);

  // 新增：导入对话框相关状态
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [importWithPreset, setImportWithPreset] = useState(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Character] App came to foreground, refreshing data');
        setRefreshKey(prev => prev + 1);
      }

      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[Character] Screen focused, refreshing data');
      setRefreshKey(prev => prev + 1);
      return () => {
        console.log('[Character] Screen unfocused');
      };
    }, [])
  );

  useEffect(() => {
    return () => {
      setShowAddMenu(false);
      setShowCreationModal(false);
    };
  }, []);

  useEffect(() => {
    if (showCreationModal) {
      setShowAddMenu(false);
    }
  }, [showCreationModal]);

  useEffect(() => {
    if (!showCreationModal && importLoading) {
      setImportLoading(false);
    }
  }, [showCreationModal, importLoading]);

  const handleManage = () => {
    setIsManaging((prevIsManaging) => !prevIsManaging);
    setSelectedCharacters([]);
    if (showAddMenu) {
      setShowAddMenu(false);
    }
  };

  const handleAddPress = () => {
    if (showCreationModal) return;

    setShowAddMenu(!showAddMenu);
    if (isManaging) {
      setIsManaging(false);
    }
  };

  const handleCreateManual = () => {
    setShowAddMenu(false);
    setTimeout(() => {
      setCreationType('manual');
      setShowCreationModal(true);
    }, 100);
  };

  const handleCreateAuto = () => {
    setShowAddMenu(false);
    setTimeout(() => {
      setCreationType('auto');
      setShowCreationModal(true);
    }, 100);
  };

  // 新版导入逻辑
  const handleImport = () => {
    setShowAddMenu(false);
    setShowImportOptions(true);
  };

  // 实际执行导入
  const doImport = async () => {
    setShowImportOptions(false);
    try {
      // 选择文件（支持图片和json）
      const fileResult = await DocumentPicker.getDocumentAsync({
        type: [
          'image/png',
          'application/json',
          'application/octet-stream', // 某些安卓json为octet-stream
        ],
        copyToCacheDirectory: true,
      });
      if (!fileResult.assets || !fileResult.assets[0]) return;
      const file = fileResult.assets[0];
      const fileUri = file.uri;
      const fileName = file.name || '';
      const isPng = fileName.toLowerCase().endsWith('.png');
      const isJson = fileName.toLowerCase().endsWith('.json');

      setImportLoading(true);

      let importedData: any;
      if (isPng) {
        importedData = await CharacterImporter.importFromPNG(fileUri);
      } else if (isJson) {
        importedData = await CharacterImporter.importFromJson(fileUri);
      } else {
        throw new Error('仅支持PNG图片或JSON格式角色卡文件');
      }

      // 头像路径
      const avatarUri = isPng ? fileUri : undefined;

      // 是否导入预设
      if (importWithPreset && isPng) {
        // 仅PNG时才弹出预设选择
        Alert.alert(
          '导入预设提示词',
          '是否要导入预设提示词文件(JSON格式)？\n\n如不导入，将仅使用角色卡自带数据。',
          [
            {
              text: '跳过',
              onPress: async () => {
                const completeData = {
                  roleCard: importedData.roleCard,
                  worldBook: importedData.worldBook,
                  avatar: avatarUri,
                  backgroundImage: importedData.backgroundImage,
                  replaceDefaultPreset: false
                };
                await AsyncStorage.setItem('temp_import_data', JSON.stringify(completeData));
                setCreationType('import');
                setShowCreationModal(true);
                setImportLoading(false);
              }
            },
            {
              text: '导入预设',
              onPress: async () => {
                try {
                  const presetResult = await DocumentPicker.getDocumentAsync({
                    type: 'application/json',
                    copyToCacheDirectory: true,
                  });
                  if (!presetResult.assets || !presetResult.assets[0]) {
                    // 用户取消
                    const completeData = {
                      roleCard: importedData.roleCard,
                      worldBook: importedData.worldBook,
                      avatar: avatarUri,
                      backgroundImage: importedData.backgroundImage,
                      replaceDefaultPreset: false
                    };
                    await AsyncStorage.setItem('temp_import_data', JSON.stringify(completeData));
                    setCreationType('import');
                    setShowCreationModal(true);
                    setImportLoading(false);
                    return;
                  }
                  const presetFileUri = presetResult.assets[0].uri;
                  const cacheUri = `${FileSystem.cacheDirectory}${presetResult.assets[0].name}`;
                  await FileSystem.copyAsync({ from: presetFileUri, to: cacheUri });
                  const presetJson = await CharacterImporter.importPresetForCharacter(cacheUri, 'temp');
                  const completeData = {
                    roleCard: importedData.roleCard,
                    worldBook: importedData.worldBook,
                    preset: presetJson,
                    avatar: avatarUri,
                    backgroundImage: importedData.backgroundImage,
                    replaceDefaultPreset: true
                  };
                  await AsyncStorage.setItem('temp_import_data', JSON.stringify(completeData));
                  setCreationType('import');
                  setShowCreationModal(true);
                  setImportLoading(false);
                } catch (presetError) {
                  Alert.alert('预设导入失败', '预设文件导入失败，将仅使用角色卡数据。\n\n' +
                    (presetError instanceof Error ? presetError.message : '未知错误'));
                  const completeData = {
                    roleCard: importedData.roleCard,
                    worldBook: importedData.worldBook,
                    avatar: avatarUri,
                    backgroundImage: importedData.backgroundImage,
                    replaceDefaultPreset: false
                  };
                  await AsyncStorage.setItem('temp_import_data', JSON.stringify(completeData));
                  setCreationType('import');
                  setShowCreationModal(true);
                  setImportLoading(false);
                }
              }
            }
          ]
        );
      } else {
        // 不导入预设 或 直接导入JSON
        const completeData = {
          roleCard: importedData.roleCard,
          worldBook: importedData.worldBook,
          preset: importedData.preset,
          avatar: avatarUri,
          backgroundImage: importedData.backgroundImage,
          replaceDefaultPreset: !!importedData.preset
        };
        await AsyncStorage.setItem('temp_import_data', JSON.stringify(completeData));
        setCreationType('import');
        setShowCreationModal(true);
        setImportLoading(false);
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '未知错误');
      setImportLoading(false);
    }
  };

  const handleCreateCharImportReady = useCallback(() => {
    setImportLoading(false);
  }, []);

  const handleCharacterPress = useCallback((id: string) => {
    if (!isManaging) {
      console.log('[Character] Navigating to character detail:', id);
      router.push(`/pages/character-detail?id=${id}`);
    }
  }, [isManaging, router]);

  // Add new method to open diary book
  const handleOpenDiaryBook = (id: string) => {
    setSelectedCharacterId(id);
    setShowDiaryBook(true);
  };

  // Close diary book
  const handleCloseDiaryBook = () => {
    setShowDiaryBook(false);
    setSelectedCharacterId(null);
  };

  const toggleSelectCharacter = (id: string) => {
    setSelectedCharacters((prevSelected) =>
      prevSelected.includes(id)
        ? prevSelected.filter((charId) => charId !== id)
        : [...prevSelected, id]
    );
  };

  const handleDelete = async () => {
    if (selectedCharacters.length === 0) {
      Alert.alert('未选中', '请选择要删除的角色。');
      return;
    }

    Alert.alert('删除角色', `确定要删除选中的 ${selectedCharacters.length} 个角色吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);

          try {
            // --- 新增：批量删除角色的所有表格 ---
            for (const characterId of selectedCharacters) {
              try {
                // 获取该角色的所有表格
                const sheets = await TableMemoryAPI.getCharacterSheets(characterId);
                if (sheets && sheets.length > 0) {
                  // 批量删除所有表格
                  await Promise.all(sheets.map(sheet => TableMemoryAPI.deleteSheet(sheet.uid)));
                  console.log(`[Character] 已删除角色 ${characterId} 的所有表格`);
                }
              } catch (err) {
                console.warn(`[Character] 删除角色 ${characterId} 表格时出错:`, err);
              }
            }
            // --- 结束 ---

            // --- 新增：批量删除角色的所有向量记忆 ---
            for (const characterId of selectedCharacters) {
              try {
                const mem0 = Mem0Service.getInstance();
                const memories = await mem0.getCharacterMemories(characterId);
                if (memories && memories.length > 0) {
                  await Promise.all(memories.map(m => mem0.deleteMemory(m.id)));
                  console.log(`[Character] 已删除角色 ${characterId} 的所有向量记忆`);
                }
              } catch (err) {
                console.warn(`[Character] 删除角色 ${characterId} 向量记忆时出错:`, err);
              }
            }
            // --- 结束 ---

            const deletePromises = selectedCharacters.map(async (characterId) => {
              console.log(`删除角色数据: ${characterId}`);
              await NodeSTManager.deleteCharacterData(characterId);

              const character = characters.find(c => c.id === characterId);
              if (character?.conversationId && character.conversationId !== characterId) {
                await NodeSTManager.deleteCharacterData(character.conversationId);
              }
            });

            await Promise.all(deletePromises);
            await deleteCharacters(selectedCharacters);

            setSelectedCharacters([]);
            setIsManaging(false);
          } catch (error) {
            console.error("Error deleting characters:", error);
            Alert.alert("删除失败", "删除角色时出现错误");
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const handleExport = async () => {
    if (selectedCharacters.length !== 1) {
      Alert.alert('导出失败', '请仅选择一个角色进行导出。');
      return;
    }
    const characterId = selectedCharacters[0];
    const character = characters.find(c => c.id === characterId);
    if (!character) {
      Alert.alert('导出失败', '未找到角色数据。');
      return;
    }
    try {
      setIsLoading(true);
      // 1. 获取角色全部数据
      const exportData = await StorageAdapter.exportCharacterData(characterId);
      // 2. 生成导出文件名
      const fileName = `character_export_${character.name || characterId}.json`;
      // 3. 写入到本地临时文件
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportData, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      // 4. 分享或保存
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json' });
      } else {
        Alert.alert('导出成功', `文件已保存到: ${fileUri}`);
      }
    } catch (err) {
      console.error('[Character] 导出角色失败:', err);
      Alert.alert('导出失败', err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreationModalClose = () => {
    console.log('[Character] Closing creation modal');
    setShowCreationModal(false);
    setTimeout(() => {
      setRefreshKey(prev => prev + 1);
      setCreationType('manual');
    }, 300);
  };

  const handleViewModeToggle = () => {
    // Cycle through view modes: large -> small -> vertical -> large
    setViewMode(prevMode => {
      if (prevMode === VIEW_MODE_LARGE) return VIEW_MODE_SMALL;
      if (prevMode === VIEW_MODE_SMALL) return VIEW_MODE_VERTICAL;
      return VIEW_MODE_LARGE;
    });
  };

  const handleAddNewImage = (characterId: string, newImage: any) => {
    setCharacterImages(prev => ({
      ...prev,
      [characterId]: [...(prev[characterId] || []), newImage]
    }));
  };

  const handleOpenGallerySidebar = (character: Character) => {
    setGallerySidebarCharacter(character);
    setShowGallerySidebar(true);
  };

  const handleOpenImageGen = (character: Character) => {
    setImageGenCharacter(character);
    setShowImageGenModal(true);
  };

  const handleOpenEditDialog = (character: Character) => {
    setEditDialogCharacter(character);
    setShowEditDialog(true);
  };

  const handleImageGenSuccess = (image: any) => {
    if (imageGenCharacter) {
      handleAddNewImage(imageGenCharacter.id, image);
    }
  };

  const renderHeader = () => (
    <View style={[styles.topBarContainer, { height: HEADER_HEIGHT, paddingTop: Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 0) }]}>
      <LinearGradient
        colors={['#333', '#282828']}
        style={styles.topBarBackground}
      />
      <View style={styles.topBarOverlay} />
      <View style={styles.topBarContent}>
        <View style={styles.topBarTitleContainer}>
          <Text style={styles.topBarTitle}>角色管理</Text>
        </View>
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.topBarActionButton} onPress={handleViewModeToggle}>
            <Ionicons 
              name={
                viewMode === VIEW_MODE_LARGE 
                  ? "grid-outline" 
                  : viewMode === VIEW_MODE_SMALL 
                    ? "albums-outline"
                    : "apps-outline"
              } 
              size={22} 
              color={COLOR_BUTTON} 
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarActionButton} onPress={handleAddPress}>
            <Ionicons name="add" size={24} color={COLOR_BUTTON} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.topBarActionButton,
              isManaging && styles.topBarActiveActionButton
            ]}
            onPress={handleManage}
          >
            <FontAwesome name="wrench" size={20} color={isManaging ? '#282828' : COLOR_BUTTON} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderItem = useMemo(
    () => ({ item }: { item: any }) => (
      <CharacterCard
        item={item}
        isManaging={isManaging}
        isSelected={selectedCharacters.includes(item.id)}
        onSelect={toggleSelectCharacter}
        onPress={handleCharacterPress}
        onOpenDiary={handleOpenDiaryBook}
        viewMode={viewMode}
        // 新增：传递图库和图片生成入口
        onOpenGallerySidebar={handleOpenGallerySidebar}
        onOpenImageGen={handleOpenImageGen}
      />
    ),
    [isManaging, selectedCharacters, toggleSelectCharacter, handleCharacterPress, viewMode, handleOpenGallerySidebar, handleOpenImageGen]
  );

  const keyExtractor = useMemo(() => (item: any) => item.id, []);

  const renderAddMenu = () => {
    if (!showAddMenu) return null;

    return (
      <View style={styles.addMenuContainer}>
        <TouchableOpacity style={styles.addMenuItem} onPress={handleCreateManual}>
          <Ionicons name="create-outline" size={20} color="#282828" />
          <Text style={styles.addMenuItemText}>手动创建</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addMenuItem} onPress={handleCreateAuto}>
          <Ionicons name="color-wand-outline" size={20} color="#282828" />
          <Text style={styles.addMenuItemText}>自动创建</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addMenuItem} onPress={handleImport}>
          <Ionicons name="cloud-upload-outline" size={20} color="#282828" />
          <Text style={styles.addMenuItemText}>导入</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCreationModal = () => {
    if (!showCreationModal) return null;

    return (
      <Modal
        animationType="slide"
        transparent={false}
        visible={showCreationModal}
        onRequestClose={handleCreationModalClose}
      >
        <SafeAreaView style={styles.creationModalContainer}>
          <View style={styles.creationModalHeader}>
            <Text style={styles.creationModalTitle}>
              {creationType === 'manual'
                ? '手动创建角色'
                : creationType === 'auto'
                ? '自动创建角色'
                : '导入角色'}
            </Text>
            <TouchableOpacity onPress={handleCreationModalClose}>
              <Ionicons name="close" size={24} color={COLOR_TEXT} />
            </TouchableOpacity>
          </View>

          <View style={styles.creationModalContent}>
            {/* Update condition to include 'import' type */}
            {(creationType === 'manual' || creationType === 'import') && (
              <CreateChar
                activeTab={creationType === 'import' ? 'advanced' : 'basic'}
                creationMode={creationType}
                allowTagImageGeneration={true}
                onClose={handleCreationModalClose}
                // Pass importReady callback only for import mode
                {...(creationType === 'import' ? { onImportReady: handleCreateCharImportReady } : {})}
              />
            )}
            {creationType === 'auto' && (
              <CradleCreateForm 
                embedded={true} 
                onClose={handleCreationModalClose} 
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderDeleteButton = () => {
    if (!isManaging) return null;

    return (
      <TouchableOpacity style={[styles.floatingButton, styles.deleteButton]} onPress={handleDelete}>
        <Ionicons name="trash-outline" size={24} color="#282828" />
      </TouchableOpacity>
    );
  };

  const renderManageFloatingButtons = () => {
    if (!isManaging) return null;
    return (
      <>
        {/* 编辑按钮 */}
        <TouchableOpacity
          style={[
            styles.floatingButton,
            { bottom: 88, backgroundColor: theme.colors.primary }
          ]}
          onPress={() => {
            // 只允许单选编辑
            const char = characters.find(c => selectedCharacters[0] === c.id);
            if (char) handleOpenEditDialog(char);
          }}
          disabled={selectedCharacters.length !== 1}
        >
          <Ionicons name="construct-outline" size={24} color="black" />
        </TouchableOpacity>
        {/* 图库按钮 */}
        <TouchableOpacity
          style={[
            styles.floatingButton,
            { bottom: 154, backgroundColor: theme.colors.primary }
          ]}
          onPress={() => {
            const char = characters.find(c => selectedCharacters[0] === c.id);
            if (char) handleOpenGallerySidebar(char);
          }}
          disabled={selectedCharacters.length !== 1}
        >
          <Ionicons name="images-outline" size={24} color="black" />
        </TouchableOpacity>
        {/* 导出按钮 */}
        <TouchableOpacity
          style={[
            styles.floatingButton,
            { bottom: 220, backgroundColor: theme.colors.primary }
          ]}
          onPress={handleExport}
          disabled={selectedCharacters.length !== 1}
        >
          <Ionicons name="download-outline" size={24} color="black" />
        </TouchableOpacity>
      </>
    );
  };

  // 导入选项弹窗
  const renderImportOptionsModal = () => {
    if (!showImportOptions) return null;
    return (
      <Modal
        visible={showImportOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImportOptions(false)}
      >
        <View style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)'
        }}>
          <View style={{
            backgroundColor: '#222', borderRadius: 12, padding: 28, width: 320, alignItems: 'center'
          }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 18 }}>角色导入</Text>
            <Text style={{ color: '#fff', fontSize: 15, marginBottom: 18, textAlign: 'center' }}>
              请选择要导入的角色卡文件（PNG图片或JSON文件）。如为PNG格式，可选择是否导入额外预设。
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
              <TouchableOpacity
                onPress={() => setImportWithPreset(v => !v)}
                style={{
                  width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#fff',
                  backgroundColor: importWithPreset ? COLOR_BUTTON : 'transparent', marginRight: 10
                }}
              >
                {importWithPreset && (
                  <Ionicons name="checkmark" size={16} color="#282828" style={{ alignSelf: 'center', marginTop: 1 }} />
                )}
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 15 }}>导入PNG时同时导入预设（可选）</Text>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: COLOR_BUTTON, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginRight: 12
                }}
                onPress={doImport}
              >
                <Text style={{ color: '#282828', fontWeight: 'bold', fontSize: 16 }}>选择文件</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#444', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24
                }}
                onPress={() => setShowImportOptions(false)}
              >
                <Text style={{ color: '#fff', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={COLOR_BACKGROUND} />
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>角色管理</Text>
            <View style={styles.headerButtons}></View>
          </View>
        </View>
        <ActivityIndicator size="large" color="#fff" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR_BACKGROUND} />

      {renderHeader()}

      {renderAddMenu()}

      <FlatList
        data={characters}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={viewMode === VIEW_MODE_LARGE ? 1 : 2}
        contentContainerStyle={styles.listContainer}
        key={`${viewMode}-${refreshKey}`}
        extraData={[isManaging, selectedCharacters, refreshKey]}
      />

      {renderCreationModal()}

      {renderDeleteButton()}
      {renderManageFloatingButtons()}

      {/* Add Diary Book Modal */}
      {showDiaryBook && selectedCharacterId && (
        <Modal
          animationType="slide"
          transparent={false}
          visible={showDiaryBook}
          onRequestClose={handleCloseDiaryBook}
        >
          <DiaryBook 
            character={characters.find(c => c.id === selectedCharacterId)!} 
            onClose={handleCloseDiaryBook} 
          />
        </Modal>
      )}

      {/* 图库侧栏 */}
      {showGallerySidebar && gallerySidebarCharacter && (
        <CharacterImageGallerySidebar
          visible={showGallerySidebar}
          onClose={() => setShowGallerySidebar(false)}
          images={characterImages[gallerySidebarCharacter.id] || []}
          onToggleFavorite={imageId => {
            setCharacterImages(prev => ({
              ...prev,
              [gallerySidebarCharacter.id]: (prev[gallerySidebarCharacter.id] || []).map(img =>
                img.id === imageId ? { ...img, isFavorite: !img.isFavorite } : img
              )
            }));
          }}
          onDelete={imageId => {
            setCharacterImages(prev => ({
              ...prev,
              [gallerySidebarCharacter.id]: (prev[gallerySidebarCharacter.id] || []).filter(img => img.id !== imageId)
            }));
          }}
          onSetAsBackground={imageId => {
            // 可扩展：设置背景
          }}
          onSetAsAvatar={imageId => {
            // 可扩展：设置头像
          }}
          isLoading={false}
          character={{
            ...gallerySidebarCharacter,
            inCradleSystem: gallerySidebarCharacter.inCradleSystem || false
          }}
          onAddNewImage={img => setCharacterImages(prev => ({
            ...prev,
            [gallerySidebarCharacter.id]: [...(prev[gallerySidebarCharacter.id] || []), img]
          }))}
        />
      )}

      {/* 图片生成 */}
      {showImageGenModal && imageGenCharacter && (
        <ImageRegenerationModal
          visible={showImageGenModal}
          character={{
            ...imageGenCharacter,
          }}
          onClose={() => setShowImageGenModal(false)}
          onSuccess={img => {
            handleImageGenSuccess(img);
          }}
        />
      )}

      {/* 角色编辑 */}
      {showEditDialog && editDialogCharacter && (
        <CharacterEditDialog
          isVisible={showEditDialog}
          character={editDialogCharacter}
          onClose={() => setShowEditDialog(false)}
        />
      )}

      {/* Import Loading Modal */}
      {importLoading && (
        <Modal
          visible={importLoading}
          transparent
          animationType="fade"
        >
          <View style={styles.importLoadingOverlay}>
            <View style={styles.importLoadingBox}>
              <ActivityIndicator size="large" color={COLOR_BUTTON} />
              <Text style={styles.importLoadingText}>正在导入角色数据，请稍候…</Text>
            </View>
          </View>
        </Modal>
      )}

      {renderImportOptionsModal()}
    </SafeAreaView>
  );
};

const CharacterCard: React.FC<{
  item: Character;
  isManaging: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onPress: (id: string) => void;
  onOpenDiary: (id: string) => void;
  viewMode: 'small' | 'large' | 'vertical';
  // 新增props
  onOpenGallerySidebar: (character: Character) => void;
  onOpenImageGen: (character: Character) => void;
}> = React.memo(
  ({
    item,
    isManaging,
    isSelected,
    onSelect,
    onPress,
    onOpenDiary,
    viewMode,
    onOpenGallerySidebar,
    onOpenImageGen
  }) => {
    const isLargeView = viewMode === VIEW_MODE_LARGE;
    const isVerticalView = viewMode === VIEW_MODE_VERTICAL;
    const videoRef = useRef<Video | null>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    // Remove the view mode condition to allow videos in all view modes
    const shouldShowVideo = item.dynamicPortraitEnabled && item.dynamicPortraitVideo;

    const cardStyle = isLargeView
      ? {
          width: LARGE_CARD_WIDTH,
          height: LARGE_CARD_HEIGHT,
          marginBottom: 16,
        }
      : isVerticalView
      ? {
          width: VERTICAL_CARD_WIDTH,
          height: VERTICAL_CARD_HEIGHT,
          margin: 8,
        }
      : {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          margin: 8,
        };

    const handleCardPress = () => {
      if (isManaging) {
        onSelect(item.id);
      } else {
        onPress(item.id);
      }
    };

    // Handle video playback status updates
    const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
      if (status.isLoaded) {
        setIsVideoReady(true);
        if (videoError) setVideoError(null);
      } else if (status.error) {
        console.error('Video playback error:', status.error);
        setVideoError(status.error);
      }
    };

    // Reset video state when component unmounts or item/viewMode changes
    useEffect(() => {
      setIsVideoReady(false);
      setVideoError(null);
      
      return () => {
        if (videoRef.current) {
          videoRef.current.unloadAsync().catch(err => 
            console.error('Error unloading video:', err)
          );
        }
      };
    }, [item.id, viewMode]);

    return (
      <TouchableOpacity
        style={[styles.card, cardStyle, isManaging && styles.manageCard]}
        onPress={handleCardPress}
        onLongPress={() => onSelect(item.id)}
      >
        {shouldShowVideo ? (
          // Render video for all view modes
          <>
            <Video
              ref={videoRef}
              source={{ uri: item.dynamicPortraitVideo! }}
              style={styles.videoBackground}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay
              isMuted
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              onError={(error) => {
                console.error('Video error in character card:', error);
                setVideoError(error?.toString() || 'Failed to load video');
              }}
              useNativeControls={false}
            />
            
            {/* Show loading indicator while video is loading */}
            {!isVideoReady && !videoError && (
              <View style={styles.videoLoadingContainer}>
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            )}
            
            {/* Show fallback image if video failed to load */}
            {videoError && (
              <Image
                source={
                  item.backgroundImage
                    ? { uri: item.backgroundImage }
                    : require('@/assets/images/default-avatar.png')
                }
                style={styles.imageBackground}
                resizeMode="cover"
                defaultSource={require('@/assets/images/default-avatar.png')}
              />
            )}
          </>
        ) : (
          <Image
            source={
              item.backgroundImage
                ? { uri: item.backgroundImage }
                : require('@/assets/images/default-avatar.png')
            }
            style={styles.imageBackground}
            resizeMode="cover"
            defaultSource={require('@/assets/images/default-avatar.png')}
          />
        )}

        <View style={styles.cardOverlay}>
          {/* 修改：大视图保持原样，中/小视图分两行 */}
          {isLargeView ? (
            <>
              <Text style={styles.cardName}>{item.name}</Text>
              {!isManaging && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {/* ...按钮组... */}
                  <TouchableOpacity
                    style={styles.diaryButton}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenDiary(item.id);
                    }}
                  >
                    <Ionicons name="book-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.diaryButton}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenGallerySidebar(item);
                    }}
                  >
                    <Ionicons name="images-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.diaryButton}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenImageGen(item);
                    }}
                  >
                    <Ionicons name="color-wand-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            // 中/小视图：名字和按钮分两行
            <View style={{ flex: 1, width: '100%' }}>
              <Text
                style={[
                  styles.cardName,
                  { marginBottom: 6, width: '100%' }
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.name}
              </Text>
              {!isManaging && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.diaryButton}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenDiary(item.id);
                    }}
                  >
                    <Ionicons name="book-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.diaryButton}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenGallerySidebar(item);
                    }}
                  >
                    <Ionicons name="images-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.diaryButton}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenImageGen(item);
                    }}
                  >
                    <Ionicons name="color-wand-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {isManaging && (
          <View
            style={[styles.checkboxContainer, isSelected && styles.checkboxSelected]}
          >
            {isSelected && <Ionicons name="checkmark" size={16} color="black" />}
          </View>
        )}
      </TouchableOpacity>
    );
  }
);

interface Styles {
  safeArea: ViewStyle;
  header: ViewStyle;
  headerContent: ViewStyle;
  headerTitle: TextStyle;
  headerButtons: ViewStyle;
  headerButton: ViewStyle;
  activeHeaderButton: ViewStyle;
  listContainer: ViewStyle;
  card: ViewStyle;
  manageCard: ViewStyle;
  videoBackground: ViewStyle; // For Video component
  imageBackground: ImageStyle; // For Image component
  cardOverlay: ViewStyle;
  cardName: TextStyle;
  checkboxContainer: ViewStyle;
  checkboxSelected: ViewStyle;
  floatingButton: ViewStyle;
  deleteButton: ViewStyle;
  loader: ViewStyle;
  addMenuContainer: ViewStyle;
  addMenuItem: ViewStyle;
  addMenuItemText: TextStyle;
  creationModalContainer: ViewStyle;
  creationModalHeader: ViewStyle;
  creationModalTitle: TextStyle;
  creationModalContent: ViewStyle;
  videoLoadingContainer: ViewStyle;
  videoErrorText: TextStyle;
  diaryButton: ViewStyle;
  importLoadingOverlay: ViewStyle;
  importLoadingBox: ViewStyle;
  importLoadingText: TextStyle;
  topBarContainer: ViewStyle;
  topBarBackground: ViewStyle;
  topBarOverlay: ViewStyle;
  topBarContent: ViewStyle;
  topBarMenuButton: ViewStyle;
  topBarTitleContainer: ViewStyle;
  topBarTitle: TextStyle;
  topBarActions: ViewStyle;
  topBarActionButton: ViewStyle;
  topBarActiveActionButton: ViewStyle;
}

const styles = StyleSheet.create<Styles>({
  safeArea: {
    flex: 1,
    backgroundColor: COLOR_BACKGROUND,
  },
  header: {
    backgroundColor: '#333333',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 224, 195, 0.2)',
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeHeaderButton: {
    backgroundColor: COLOR_BUTTON,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
    alignItems: 'flex-start',
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  manageCard: {
    borderColor: 'rgb(255, 224, 195)',
    borderWidth: 2,
  },
  videoBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  imageBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
  },
  cardName: {
    color: COLOR_TEXT,
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  checkboxContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLOR_BUTTON,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10,
  },
  checkboxSelected: {
    backgroundColor: COLOR_BUTTON,
  },
  floatingButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deleteButton: {
    backgroundColor: theme.colors.danger,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMenuContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 62 : 102,
    right: 16,
    backgroundColor: COLOR_BUTTON,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 20,
    padding: 4,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  addMenuItemText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '500',
    color: '#282828',
  },
  creationModalContainer: {
    flex: 1,
    backgroundColor: COLOR_BACKGROUND,
  },
  creationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 224, 195, 0.2)',
  },
  creationModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLOR_BUTTON,
  },
  creationModalContent: {
    flex: 1,
  },
  videoLoadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  videoErrorText: {
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 6,
    borderRadius: 4,
    fontSize: 12,
  },
  diaryButton: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  importLoadingBox: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  importLoadingText: {
    color: COLOR_BUTTON,
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  topBarContainer: {
    position: 'relative',
    width: '100%',
    zIndex: 100,
  },
  topBarBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  topBarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: '100%',
  },
  topBarMenuButton: {
    padding: 8,
  },
  topBarTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarActionButton: {
    padding: 8,
    marginLeft: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  topBarActiveActionButton: {
    backgroundColor: COLOR_BUTTON,
  },
});

export default CharactersScreen;
