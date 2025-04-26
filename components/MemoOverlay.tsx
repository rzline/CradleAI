import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Platform,
  StatusBar
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as TableMemory from '@/src/memory/plugins/table-memory';
import { initializeTableMemory, isTableMemoryEnabled, setTableMemoryEnabled } from '@/src/memory/integration/table-memory-integration';

interface MemoOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  characterId?: string;
  conversationId?: string;
}
interface SimpleSheet {
  uid: string;
  name: string;
  cells: any[];
  characterId: string;
  conversationId: string;
  templateId: string; // Add the missing properties
  createdAt: string;
  updatedAt: string;
}
// Define tabs for the UI
enum TabType {
  TEMPLATES = 'templates',
  TABLES = 'tables',
  SETTINGS = 'settings'
}

// Main component
const MemoOverlay: React.FC<MemoOverlayProps> = ({ isVisible, onClose, characterId, conversationId }) => {
  // State for tabs and loading
  const [activeTab, setActiveTab] = useState<TabType>(TabType.TABLES);
  const [loading, setLoading] = useState<boolean>(false);
  const [initialized, setInitialized] = useState<boolean>(false);

  // State for templates - update to have allTemplates separate from selectedTemplates
  
  const [allTemplates, setAllTemplates] = useState<TableMemory.SheetTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);

  // State for tables - using SimpleSheet type to fix TS error
  const [tables, setTables] = useState<SimpleSheet[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number; value: string } | null>(null);

  // State for plugin settings
  const [pluginEnabled, setPluginEnabled] = useState<boolean>(false);

  // 新增：角色表格数据
  const [characterTablesData, setCharacterTablesData] = useState<Awaited<ReturnType<typeof TableMemory.getCharacterTablesData>> | null>(null);

  // Reference to track if component is mounted
  const isMountedRef = useRef<boolean>(false);

  // Initialize the plugin when the component mounts
  useEffect(() => {
    isMountedRef.current = true;
    if (isVisible && !initialized) {
      initializePluginAsync();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [isVisible, initialized]);

  // Load data when character/conversation changes or when visibility changes
  useEffect(() => {
    if (isVisible && initialized && characterId) {
      loadData(true); // Force refresh when becoming visible
    }
  }, [isVisible, initialized, characterId, conversationId]);

  // Initialize plugin
  const initializePluginAsync = async () => {
    try {
      setLoading(true);
      // Initialize table memory plugin and set default templates
      const success = await initializeTableMemory({
        defaultTemplates: true,
        enabled: true
      });

      setPluginEnabled(isTableMemoryEnabled());
      setInitialized(success);

      if (success) {
        console.log('[MemoOverlay] Table memory plugin initialized successfully');
        if (characterId) {
          await loadData(true);
        }
      }
    } catch (error) {
      console.error('[MemoOverlay] Failed to initialize table memory plugin:', error);
      Alert.alert('Error', 'Failed to initialize table memory plugin');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Load all data (templates & tables) with option to force refresh
  const loadData = async (forceRefresh = false) => {
    if (!characterId) return;

    if (forceRefresh || tables.length === 0) {
      setLoading(true);
    }

    try {
      // Load ALL available templates from the API, not just selected ones
      const templateManager = TableMemory.API;

      // Use getAllTemplates from the API instead of getSelectedTemplates
      try {
        const availableTemplates = await templateManager.getAllTemplates();
        console.log(`[MemoOverlay] Loaded ${availableTemplates.length} total templates`);

        if (isMountedRef.current) {
          setAllTemplates(availableTemplates);
        }
      } catch (templateError) {
        console.error('[MemoOverlay] Failed to load all templates:', templateError);
      }

      // Load selected template IDs (separate from all templates)
      const selectedIds = await TableMemory.getSelectedTemplateIds();
      console.log(`[MemoOverlay] Loaded ${selectedIds.length} selected template IDs`);

      if (isMountedRef.current) {
        setSelectedTemplateIds(selectedIds);
      }

      // 加载角色表格数据（通过getCharacterTablesData）
      try {
        const effectiveConversationId = conversationId || characterId;
        const safeCharacterId = String(characterId);
        const safeConversationId = String(effectiveConversationId);

        // 用新API获取角色所有表格及内容
        const tablesData = await TableMemory.getCharacterTablesData(
          safeCharacterId,
          safeConversationId          
        );
        if (isMountedRef.current) {
          setCharacterTablesData(tablesData);
          // 兼容旧逻辑：生成tables和默认选中表格
          if (tablesData.success) {
            setTables(
              tablesData.tables.map(t => ({
                uid: t.id,
                name: t.name,
                cells: [], // cells不再直接用，内容用tablesData.tables
                characterId: safeCharacterId,
                conversationId: safeConversationId,
                templateId: '', // Add empty string for templateId (required by type)
                createdAt: new Date().toISOString(), // Add a timestamp for createdAt
                updatedAt: new Date().toISOString(), // Add a timestamp for updatedAt

              }))
            );
            if (tablesData.tables.length > 0 && !selectedTableId) {
              setSelectedTableId(tablesData.tables[0].id);
            }
          }
        }
      } catch (tableError) {
        console.error('[MemoOverlay] Failed to load character tables:', tableError);
        Alert.alert('Error', 'Failed to load tables for this character');
      }
    } catch (error) {
      console.error('[MemoOverlay] Failed to load data:', error);
      Alert.alert('Error', 'Failed to load templates and tables');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Handle template selection
  const handleTemplateSelection = async (templateId: string, selected: boolean) => {
    try {
      let newSelectedIds: string[];

      if (selected) {
        newSelectedIds = [...selectedTemplateIds, templateId];
      } else {
        newSelectedIds = selectedTemplateIds.filter(id => id !== templateId);
      }

      // Update selected templates
      await TableMemory.API.selectTemplates(newSelectedIds);
      setSelectedTemplateIds(newSelectedIds);

      console.log(`[MemoOverlay] Template ${templateId} ${selected ? 'selected' : 'unselected'}`);
    } catch (error) {
      console.error('[MemoOverlay] Failed to update template selection:', error);
      Alert.alert('Error', 'Failed to update template selection');
    }
  };

  // Create tables from selected templates
  const handleCreateTablesFromTemplates = async () => {
    if (!characterId) {
      Alert.alert('Error', 'Character ID is missing');
      return;
    }

    try {
      setLoading(true);

      // Use the characterId as the conversationId fallback
      const effectiveConversationId = conversationId || characterId;

      console.log(`[MemoOverlay] Creating tables from templates for character ${characterId}, conversation ${effectiveConversationId}`);
      console.log(`[MemoOverlay] Selected template IDs: ${selectedTemplateIds.join(', ')}`);

      // Get the selected templates first to ensure they exist
      const selectedTemplates = await TableMemory.getSelectedTemplates();
      const validTemplates = selectedTemplates.filter(template =>
        selectedTemplateIds.includes(template.uid)
      );

      if (validTemplates.length === 0) {
        Alert.alert('No Templates Selected', 'Please select valid templates first.');
        setLoading(false);
        return;
      }

      // Create tables using exported createSheetsFromTemplates method
      const createdTableIds = await TableMemory.createSheetsFromTemplates(
        validTemplates, // Pass the actual template objects instead of just IDs
        characterId,
        effectiveConversationId
      );

      if (createdTableIds.length > 0) {
        console.log(`[MemoOverlay] Created ${createdTableIds.length} tables with IDs: ${createdTableIds.join(', ')}`);

        // Reload data to display newly created tables
        await loadData(true);

        // Set the first created table as selected
        if (createdTableIds[0]) {
          setSelectedTableId(createdTableIds[0]);
        }

        setActiveTab(TabType.TABLES);
      } else {
        Alert.alert('No Tables Created', 'No tables were created. Please select templates first.');
      }
    } catch (error) {
      console.error('[MemoOverlay] Failed to create tables:', error);
      Alert.alert('Error', 'Failed to create tables from templates');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // 选中表格时，只需切换selectedTableId
  const handleSelectTable = (tableId: string) => {
    setSelectedTableId(tableId);
  };

  // Handle cell edit start
  const handleEditCell = (rowIndex: number, colIndex: number, value: string) => {
    // Don't allow editing the header row
    if (rowIndex === 0) return;

    setEditingCell({ rowIndex, colIndex, value });
  };

  // Save cell edit
  const handleSaveCellEdit = async () => {
    if (!editingCell || !selectedTableId) return;

    const { rowIndex, colIndex, value } = editingCell;

    try {
      setLoading(true);

      // Create row data object with just this cell's data
      const rowData: Record<number, string> = { [colIndex]: value };

      // Update the row in the table
      await TableMemory.API.updateRow(selectedTableId, rowIndex, rowData);

      // 不再直接setTableData，直接刷新
      setTimeout(() => loadData(), 500);
      setEditingCell(null);
    } catch (error) {
      console.error('[MemoOverlay] Failed to update cell:', error);
      Alert.alert('Error', 'Failed to update table cell');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Cancel cell edit
  const handleCancelCellEdit = () => {
    setEditingCell(null);
  };

  // Add a new row to the table
  const handleAddRow = async () => {
    if (!selectedTableId) return;

    try {
      setLoading(true);

      // 获取当前表格的列数
      const table = characterTablesData?.tables.find(t => t.id === selectedTableId);
      if (!table) throw new Error('Table not found');
      const colCount = table.headers.length;

      // 构造空行
      const rowData: Record<number, string> = {};
      for (let i = 0; i < colCount; i++) {
        rowData[i] = '';
      }

      // 插入行
      await TableMemory.insertRow(selectedTableId, rowData);

      // 刷新
      await loadData(true);
    } catch (error) {
      console.error('[MemoOverlay] Failed to add row:', error);
      Alert.alert('Error', 'Failed to add new row to table');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Delete a row from the table
  const handleDeleteRow = async (rowIndex: number) => {
    // 不允许删除表头
    if (rowIndex === 0 || !selectedTableId) return;

    try {
      setLoading(true);
      await TableMemory.deleteRow(selectedTableId, rowIndex);
      await loadData(true);
    } catch (error) {
      console.error('[MemoOverlay] Failed to delete row:', error);
      Alert.alert('Error', 'Failed to delete row from table');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Delete an entire table
  const handleDeleteTable = async (tableId: string) => {
    if (!tableId) return;
    Alert.alert(
      'Delete Table',
      'Are you sure you want to delete this table? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const success = await TableMemory.deleteSheet(tableId);
              if (success) {
                setTables(prevTables => prevTables.filter(table => table.uid !== tableId));
                if (selectedTableId === tableId) {
                  setSelectedTableId(null);
                }
                setTimeout(() => loadData(), 500);
              } else {
                Alert.alert('Error', 'Failed to delete table');
              }
            } catch (error) {
              console.error('[MemoOverlay] Failed to delete table:', error);
              Alert.alert('Error', 'Failed to delete table');
            } finally {
              if (isMountedRef.current) {
                setLoading(false);
              }
            }
          }
        }
      ]
    );
  };

  // Toggle plugin enabled state
  const handleTogglePluginEnabled = async (enabled: boolean) => {
    try {
      setPluginEnabled(enabled);
      setTableMemoryEnabled(enabled);
      console.log(`[MemoOverlay] Table memory plugin ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('[MemoOverlay] Failed to toggle plugin:', error);
      Alert.alert('Error', 'Failed to update plugin state');
    }
  };

  // Manual refresh button handler
  const handleRefreshTables = async () => {
    console.log('[MemoOverlay] Manual refresh requested');
    await loadData(true);
  };

  // Rebuild or repair table data
  const handleRebuildTable = async (tableId: string, promptType: string) => {
    if (!characterId || !tableId) return;

    try {
      setLoading(true);

      // Get all chat messages for this character
      // Note: This is placeholder code - you'll need to integrate with your chat history
      const chatContent = "";

      // Rebuild the table
      const success = await TableMemory.API.rebuildSheet(
        tableId,
        chatContent,
        promptType as any
      );

      // Show appropriate message based on the operation result
      if (success) {
        Alert.alert('成功', '表格更新完成');
      } else {
        // This isn't an error, it just means no changes were needed
        Alert.alert('信息', '表格无需更新或已是最新状态');
      }
    } catch (error) {
      console.error('[MemoOverlay] Failed to rebuild table:', error);
      Alert.alert('错误', '更新表格时发生错误，请重试');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Render the template list with enhanced multi-selection UI
  const renderTemplateTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>
        可用模板 ({allTemplates.length})
        {selectedTemplateIds.length > 0 && (
          <Text style={styles.selectedCount}> • {selectedTemplateIds.length} 已选</Text>
        )}
      </Text>

      {/* Multi-select helper text */}
      <View style={styles.helperTextContainer}>
        <Ionicons name="information-circle-outline" size={16} color="#ff9f1c" />
        <Text style={styles.helperText}>
          您可以选择多个模板以一次创建多个表格. 这些表格会由AI自动填充,作为长期记忆.
        </Text>
      </View>

      <FlatList
        data={allTemplates}
        keyExtractor={item => item.uid}
        renderItem={({ item }) => (
          <View style={styles.templateItem}>
            <View style={styles.templateHeader}>
              <TouchableOpacity
                style={[
                  styles.templateCheckbox,
                  selectedTemplateIds.includes(item.uid) && styles.templateCheckboxSelected
                ]}
                onPress={() => handleTemplateSelection(item.uid, !selectedTemplateIds.includes(item.uid))}
              >
                {selectedTemplateIds.includes(item.uid) && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </TouchableOpacity>
              <Text style={styles.templateName}>{item.name}</Text>
            </View>
            <Text style={styles.templateDesc}>{item.note}</Text>

            <View style={styles.templateMetadata}>
              <Text style={styles.templateMetaText}>类型: <Text style={styles.metaValue}>{item.type}</Text></Text>
              <Text style={styles.templateMetaText}>列数: <Text style={styles.metaValue}>{item.columns.length}</Text></Text>
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>未找到模板</Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                // Initialize default templates
                initializePluginAsync();
              }}
            >
              <Text style={styles.actionButtonText}>初始化默认模板</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.tabActions}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.primaryButton,
            selectedTemplateIds.length === 0 && styles.disabledButton
          ]}
          onPress={handleCreateTablesFromTemplates}
          disabled={selectedTemplateIds.length === 0}
        >
          <MaterialIcons name="add-chart" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>
            创建 {selectedTemplateIds.length} 个表格
          </Text>
        </TouchableOpacity>

        {selectedTemplateIds.length > 0 && (
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton, styles.clearButton]}
            onPress={() => {
              TableMemory.API.selectTemplates([]);
              setSelectedTemplateIds([]);
            }}
          >
            <Text style={styles.clearButtonText}>清除选择</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // Render the tables tab with tag-based table selection and full-width table
  const renderTablesTab = () => (
    <View style={styles.tabContent}>
      {/* 表格选择Tag */}
      <View style={styles.tableTagsContainer}>
        {characterTablesData?.success && characterTablesData.tables.length > 0 ? (
          characterTablesData.tables.map((table) => (
            <TouchableOpacity
              key={table.id}
              style={[
                styles.tableTag,
                selectedTableId === table.id && styles.tableTagSelected
              ]}
              onPress={() => handleSelectTable(table.id)}
            >
              <Text style={[
                styles.tableTagText,
                selectedTableId === table.id && styles.tableTagTextSelected
              ]}>
                {table.name}
              </Text>
              <TouchableOpacity
                style={styles.tableTagDelete}
                onPress={() => handleDeleteTable(table.id)}
              >
                <Ionicons name="close-circle" size={16} color="#ff6b6b" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>暂无表格，请先在模板页创建</Text>
        )}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefreshTables}
          disabled={loading}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={loading ? "#666" : "#ff9f1c"}
          />
        </TouchableOpacity>
      </View>
      {/* 表格内容 */}
      <View style={styles.tableDataContainerFull}>
        <View style={styles.tablesHeader}>
          <Text style={styles.tabTitle}>
            {selectedTableId
              ? characterTablesData?.tables.find(t => t.id === selectedTableId)?.name || '表格数据'
              : '请选择表格'}
          </Text>
          {selectedTableId && (
            <Text style={styles.tableIdText}>{selectedTableId}</Text>
          )}
        </View>
        {selectedTableId && characterTablesData?.success ? (() => {
          const table = characterTablesData.tables.find(t => t.id === selectedTableId);
          if (!table) {
            return (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>该表格暂无数据</Text>
              </View>
            );
          }
          const matrix = [table.headers, ...table.rows];
          return (
            <>
              <ScrollView horizontal>
                <ScrollView>
                  <View style={styles.tableGrid}>
                    {matrix.map((row, rowIndex) => (
                      <View key={`row-${rowIndex}`} style={styles.tableRow}>
                        {row.map((cell, colIndex) => (
                          <TouchableOpacity
                            key={`cell-${rowIndex}-${colIndex}`}
                            style={[
                              styles.tableCell,
                              rowIndex === 0 && styles.tableHeaderCell,
                              editingCell?.rowIndex === rowIndex && editingCell?.colIndex === colIndex && styles.tableCellEditing
                            ]}
                            onPress={() => rowIndex > 0 && handleEditCell(rowIndex, colIndex, cell)}
                            disabled={rowIndex === 0}
                          >
                            <Text
                              style={[
                                styles.tableCellText,
                                rowIndex === 0 && styles.tableHeaderCellText
                              ]}
                              numberOfLines={2}
                            >
                              {cell}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {rowIndex > 0 && (
                          <TouchableOpacity
                            style={styles.rowDeleteButton}
                            onPress={() => handleDeleteRow(rowIndex)}
                          >
                            <Ionicons name="close-circle" size={18} color="#ff6b6b" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </ScrollView>
              <TouchableOpacity
                style={[styles.actionButton, styles.addRowButton]}
                onPress={handleAddRow}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>添加行</Text>
              </TouchableOpacity>
            </>
          );
        })() : selectedTableId ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>该表格暂无数据</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>请先选择左上方的表格标签</Text>
          </View>
        )}
      </View>
    </View>
  );

  // Render the settings tab
  const renderSettingsTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>记忆增强设置</Text>

      <View style={styles.settingItem}>
        <View style={styles.settingLabel}>
          <Text style={styles.settingTitle}>启用表格记忆</Text>
          <Text style={styles.settingDescription}>
            启用表格记忆增强以存储结构化数据
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.toggle,
            pluginEnabled ? styles.toggleActive : styles.toggleInactive
          ]}
          onPress={() => handleTogglePluginEnabled(!pluginEnabled)}
        >
          <View
            style={[
              styles.toggleThumb,
              pluginEnabled ? styles.toggleThumbActive : styles.toggleThumbInactive
            ]}
          />
        </TouchableOpacity>
      </View>

      {selectedTableId && (
        <>
          <Text style={styles.sectionTitle}>表格维护</Text>

          <TouchableOpacity
            style={styles.maintenanceButton}
            onPress={() => handleRebuildTable(selectedTableId, 'rebuild_base')}
          >
            <MaterialIcons name="build" size={20} color="#ccc" />
            <Text style={styles.maintenanceButtonText}>重建表格</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.maintenanceButton}
            onPress={() => handleRebuildTable(selectedTableId, 'rebuild_fix_all')}
          >
            <MaterialIcons name="healing" size={20} color="#ccc" />
            <Text style={styles.maintenanceButtonText}>修复表格数据</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.maintenanceButton}
            onPress={() => handleRebuildTable(selectedTableId, 'rebuild_simplify_history')}
          >
            <MaterialIcons name="compress" size={20} color="#ccc" />
            <Text style={styles.maintenanceButtonText}>简化历史记录</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  // Modal for editing cell value (中文化)
  const renderCellEditModal = () => (
    <Modal
      visible={!!editingCell}
      transparent
      animationType="fade"
      onRequestClose={handleCancelCellEdit}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.cellEditContainer}>
          <Text style={styles.cellEditTitle}>编辑单元格</Text>
          <TextInput
            style={styles.cellEditInput}
            value={editingCell?.value || ''}
            onChangeText={(text) => setEditingCell(prev => prev ? { ...prev, value: text } : null)}
            multiline
            autoFocus
            placeholder="输入内容..."
            placeholderTextColor="#999"
          />
          <View style={styles.cellEditActions}>
            <TouchableOpacity
              style={[styles.cellEditButton, styles.cellEditCancelButton]}
              onPress={handleCancelCellEdit}
            >
              <Text style={styles.cellEditButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cellEditButton, styles.cellEditSaveButton]}
              onPress={handleSaveCellEdit}
            >
              <Text style={styles.cellEditButtonText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <Modal
      transparent
      visible={isVisible}
      onRequestClose={onClose}
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.fullScreenContainer}>
        <BlurView intensity={30} tint="dark" style={styles.fullScreenBlurView}>
          <View style={styles.header}>
            <Text style={styles.title}>表格记忆</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#ff9f1c" />
              <Text style={styles.loadingText}>加载中...</Text>
            </View>
          )}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.TEMPLATES && styles.activeTab]}
              onPress={() => setActiveTab(TabType.TEMPLATES)}
            >
              <Ionicons
                name="list"
                size={20}
                color={activeTab === TabType.TEMPLATES ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.TEMPLATES && styles.activeTabText]}>
                模板
                {selectedTemplateIds.length > 0 && (
                  <Text style={styles.tabBadge}> ({selectedTemplateIds.length})</Text>
                )}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.TABLES && styles.activeTab]}
              onPress={() => setActiveTab(TabType.TABLES)}
            >
              <Ionicons
                name="grid"
                size={20}
                color={activeTab === TabType.TABLES ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.TABLES && styles.activeTabText]}>
                表格
                {tables.length > 0 && (
                  <Text style={styles.tabBadge}> ({tables.length})</Text>
                )}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.SETTINGS && styles.activeTab]}
              onPress={() => setActiveTab(TabType.SETTINGS)}
            >
              <Ionicons
                name="settings"
                size={20}
                color={activeTab === TabType.SETTINGS ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.SETTINGS && styles.activeTabText]}>
                设置
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            {activeTab === TabType.TEMPLATES && renderTemplateTab()}
            {activeTab === TabType.TABLES && renderTablesTab()}
            {activeTab === TabType.SETTINGS && renderSettingsTab()}
          </View>
          {renderCellEditModal()}
        </BlurView>
      </View>
    </Modal>
  );
};

const { height, width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  blurView: {
    width: '90%',
    height: height * 0.8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // 顶部安全距离
    paddingTop: Platform.select({
      ios: 44,
      android: StatusBar.currentHeight || 24,
      default: 24,
    }),
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#ff9f1c',
  },
  tabText: {
    color: '#ccc',
    marginLeft: 8,
    fontSize: 14,
  },
  activeTabText: {
    color: '#ff9f1c',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  tabTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ccc',
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 6,
  },

  // Template styles
  templateItem: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  templateCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateCheckboxSelected: {
    backgroundColor: '#ff9f1c',
    borderColor: '#ff9f1c',
  },
  templateName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  templateDesc: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 8,
  },
  templateMetadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  templateMetaText: {
    color: '#ccc',
    fontSize: 12,
  },
  metaValue: {
    color: '#ff9f1c',
    fontWeight: 'bold',
  },

  // Tables styles
  tablesContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  tablesList: {
    width: '30%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    paddingRight: 10,
  },
  tableDataContainer: {
    flex: 1,
    paddingLeft: 10,
  },
  tableListItem: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  tableListItemSelected: {
    backgroundColor: 'rgba(255, 159, 28, 0.3)',
    borderLeftWidth: 3,
    borderLeftColor: '#ff9f1c',
  },
  tableListItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  tableIdText: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
    marginBottom: 4,
  },
  tableListItemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  tableActionButton: {
    padding: 4,
    marginLeft: 8,
  },
  tableGrid: {
    padding: 5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  tableCell: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 4,
    padding: 8,
    minWidth: 110,
    marginRight: 2,
    height: 50,
    justifyContent: 'center',
  },
  tableHeaderCell: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
  },
  tableCellEditing: {
    backgroundColor: 'rgba(255, 159, 28, 0.3)',
  },
  tableCellText: {
    color: '#fff',
    fontSize: 13,
  },
  tableHeaderCellText: {
    fontWeight: 'bold',
    color: '#ff9f1c',
  },
  rowDeleteButton: {
    padding: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Cell edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellEditContainer: {
    backgroundColor: '#333',
    borderRadius: 10,
    padding: 16,
    width: '80%',
    maxWidth: 400,
  },
  cellEditTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  cellEditInput: {
    backgroundColor: '#444',
    borderRadius: 6,
    padding: 12,
    color: '#fff',
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  cellEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cellEditButton: {
    padding: 10,
    borderRadius: 6,
    marginLeft: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  cellEditCancelButton: {
    backgroundColor: '#555',
  },
  cellEditSaveButton: {
    backgroundColor: '#ff9f1c',
  },
  cellEditButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },

  // Actions
  tabActions: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  actionButton: {
    backgroundColor: '#ff9f1c',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryButton: {
    backgroundColor: '#ff9f1c',
  },
  addRowButton: {
    marginTop: 16,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },

  // Settings
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    marginBottom: 10,
  },
  settingLabel: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#ccc',
  },
  toggle: {
    width: 46,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: 'rgba(255, 159, 28, 0.5)',
  },
  toggleInactive: {
    backgroundColor: '#555',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  toggleThumbActive: {
    backgroundColor: '#ff9f1c',
    alignSelf: 'flex-end',
  },
  toggleThumbInactive: {
    backgroundColor: '#ccc',
    alignSelf: 'flex-start',
  },

  // Maintenance
  maintenanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  maintenanceButtonText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 10,
  },

  // Empty states
  emptyState: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  dangerButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  dangerButtonText: {
    color: '#ff6b6b',
    marginLeft: 10,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  maintenanceContainer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  tablesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshButton: {
    padding: 8,
  },
  selectedCount: {
    color: '#ff9f1c',
    fontWeight: 'normal',
  },
  helperTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 159, 28, 0.1)',
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
  },
  helperText: {
    color: '#ccc',
    fontSize: 13,
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: '#444',
    marginTop: 8,
  },
  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  clearButtonText: {
    color: '#ccc',
  },
  tabBadge: {
    color: '#ff9f1c',
    fontSize: 12,
  },
  batchOperationsContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 10,
  },
  batchOperationsTitle: {
    fontSize: 13,
    color: '#ccc',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  batchOperationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 159, 28, 0.1)',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  batchOperationText: {
    color: '#ccc',
    marginLeft: 8,
    fontSize: 13,
  },
  // 全屏化
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  fullScreenBlurView: {
    flex: 1,
    borderRadius: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  // Tag样式
  tableTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  tableTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 6,
  },
  tableTagSelected: {
    backgroundColor: '#ff9f1c',
  },
  tableTagText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 4,
  },
  tableTagTextSelected: {
    color: '#fff',
  },
  tableTagDelete: {
    marginLeft: 4,
  },
  // 表格内容全宽
  tableDataContainerFull: {
    flex: 1,
    paddingLeft: 0,
    width: '100%',
  },
});

export default MemoOverlay;
