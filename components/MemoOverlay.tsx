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
  ActivityIndicator
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

  // State for templates
  const [templates, setTemplates] = useState<TableMemory.SheetTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);

  // State for tables
  const [tables, setTables] = useState<TableMemory.Sheet[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[][]>([]);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number; value: string } | null>(null);

  // State for plugin settings
  const [pluginEnabled, setPluginEnabled] = useState<boolean>(false);
  
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
      // Load all available templates (including default templates)
      const allTemplates = await TableMemory.getSelectedTemplates();
      console.log(`[MemoOverlay] Loaded ${allTemplates.length} templates`);
      
      if (isMountedRef.current) {
        setTemplates(allTemplates);
      }
      
      // Load selected template IDs
      const selectedIds = await TableMemory.getSelectedTemplateIds();
      console.log(`[MemoOverlay] Loaded ${selectedIds.length} selected template IDs`);
      
      if (isMountedRef.current) {
        setSelectedTemplateIds(selectedIds);
      }
      
      // Load character tables with proper error handling
      try {
        console.log(`[MemoOverlay] Loading tables for character ${characterId}, conversation ${conversationId || characterId}`);
        
        // Use the characterId as the conversationId fallback
        // This is important for synchronization with TableMemory
        const effectiveConversationId = conversationId || characterId;
        
        // FIXED: Ensure consistent ID handling to match the way the API works
        const safeCharacterId = String(characterId);
        const safeConversationId = String(effectiveConversationId);
        
        console.log(`[MemoOverlay] Getting tables with safeCharacterId: "${safeCharacterId}", safeConversationId: "${safeConversationId}"`);
        
        // Direct call to prevent caching issues
        const characterTables = await TableMemory.API.getCharacterSheets(
          safeCharacterId, 
          safeConversationId
        );
        
        console.log(`[MemoOverlay] Loaded ${characterTables.length} character tables for character ${characterId}`);
        
        // Log the table IDs for debugging
        characterTables.forEach(table => {
          console.log(`[MemoOverlay] Table: "${table.name}", ID: ${table.uid}, ConvID: ${table.conversationId}`);
        });
        
        if (isMountedRef.current) {
          setTables(characterTables);
          
          // If there are tables but none selected, select the first one
          if (characterTables.length > 0 && !selectedTableId) {
            setSelectedTableId(characterTables[0].uid);
            setTableData(tableToMatrix(characterTables[0]));
          } else if (selectedTableId) {
            // If a table was previously selected, try to find it in the new table list
            const selectedTable = characterTables.find(table => table.uid === selectedTableId);
            if (selectedTable) {
              setTableData(tableToMatrix(selectedTable));
            } else if (characterTables.length > 0) {
              // If selected table no longer exists, select the first one
              setSelectedTableId(characterTables[0].uid);
              setTableData(tableToMatrix(characterTables[0]));
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

  // Convert table to 2D array for easier display/editing
  const tableToMatrix = useCallback((table: TableMemory.Sheet): string[][] => {
    if (!table || !table.cells || table.cells.length === 0) return [];
    
    // Find max row and column indices
    const maxRowIndex = Math.max(...table.cells.map(cell => cell.rowIndex));
    const maxColIndex = Math.max(...table.cells.map(cell => cell.colIndex));
    
    // Create empty matrix
    const matrix: string[][] = Array(maxRowIndex + 1)
      .fill(null)
      .map(() => Array(maxColIndex + 1).fill(''));
    
    // Fill with cell values
    table.cells.forEach(cell => {
      matrix[cell.rowIndex][cell.colIndex] = cell.value;
    });
    
    return matrix;
  }, []);

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
          
          // Load data for the selected table
          const newTable = await TableMemory.API.getSheet(createdTableIds[0]);
          if (newTable) {
            setTableData(tableToMatrix(newTable));
          }
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

  // Select a table to view/edit with improved error handling
  const handleSelectTable = (tableId: string) => {
    console.log(`[MemoOverlay] Selecting table with ID: ${tableId}`);
    
    // First try to find the table in our current list
    const selectedTable = tables.find(table => table.uid === tableId);
    
    if (selectedTable) {
      console.log(`[MemoOverlay] Found table in current list: ${selectedTable.name}`);
      setSelectedTableId(tableId);
      setTableData(tableToMatrix(selectedTable));
    } else {
      console.log(`[MemoOverlay] Table with ID ${tableId} not found in current tables list, fetching directly`);
      
      // Directly fetch the table by ID
      setLoading(true);
      
      TableMemory.API.getSheet(tableId)
        .then(freshTable => {
          if (freshTable) {
            console.log(`[MemoOverlay] Successfully fetched table: ${freshTable.name}`);
            setSelectedTableId(tableId);
            setTableData(tableToMatrix(freshTable));
            
            // Also add this table to our tables list if it's not already there
            setTables(prevTables => {
              const exists = prevTables.some(t => t.uid === tableId);
              return exists ? prevTables : [...prevTables, freshTable];
            });
          } else {
            console.log(`[MemoOverlay] Could not find table with ID ${tableId}`);
            Alert.alert('Error', `Table with ID ${tableId} not found`);
          }
        })
        .catch(err => {
          console.error(`[MemoOverlay] Error fetching table ${tableId}:`, err);
          Alert.alert('Error', 'Failed to load the selected table');
        })
        .finally(() => {
          if (isMountedRef.current) {
            setLoading(false);
          }
        });
    }
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
      
      // Update local data
      const newTableData = [...tableData];
      newTableData[rowIndex][colIndex] = value;
      
      if (isMountedRef.current) {
        setTableData(newTableData);
        setEditingCell(null);
      }
      
      console.log(`[MemoOverlay] Updated cell at row ${rowIndex}, col ${colIndex}`);
      
      // Refresh the data after updating to ensure consistency
      setTimeout(() => loadData(), 500);
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
      
      // Create an empty row data object
      const rowData: Record<number, string> = {};
      
      // Add empty values for each column
      if (tableData[0]) {
        tableData[0].forEach((_, colIndex) => {
          rowData[colIndex] = '';
        });
      }
      
      // Insert the row
      const newRowIndex = await TableMemory.API.insertRow(selectedTableId, rowData);
      
      console.log(`[MemoOverlay] Added row at index ${newRowIndex}`);
      
      // Reload the table data to ensure consistency
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
    // Don't allow deleting the header row
    if (rowIndex === 0 || !selectedTableId) return;
    
    try {
      setLoading(true);
      
      await TableMemory.API.deleteRow(selectedTableId, rowIndex);
      
      console.log(`[MemoOverlay] Deleted row at index ${rowIndex}`);
      
      // Reload the table data to ensure consistency
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
              // Use exported deleteSheet method to delete table
              const success = await TableMemory.deleteSheet(tableId);
              if (success) {
                console.log(`[MemoOverlay] Successfully deleted table ${tableId}`);
                
                // Remove from tables list
                setTables(prevTables => prevTables.filter(table => table.uid !== tableId));
                
                // Clear selection if it was selected
                if (selectedTableId === tableId) {
                  setSelectedTableId(null);
                  setTableData([]);
                }
                
                // Refresh the data
                setTimeout(() => loadData(), 500);
              } else {
                console.log(`[MemoOverlay] Failed to delete table ${tableId}`);
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
      const chatContent = "User: Hello, my name is Alex and I like playing basketball.\nAI: Nice to meet you Alex! I'm glad you enjoy basketball. Do you play on a team?";
      
      // Rebuild the table
      const success = await TableMemory.API.rebuildSheet(
        tableId,
        chatContent,
        promptType as any
      );
      
      if (success) {
        // Reload tables with fresh data
        await loadData(true);
        
        Alert.alert('Success', 'Table rebuilt successfully');
      } else {
        Alert.alert('Error', 'Failed to rebuild table');
      }
    } catch (error) {
      console.error('[MemoOverlay] Failed to rebuild table:', error);
      Alert.alert('Error', 'Failed to rebuild table');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Render the template list
  const renderTemplateTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Available Templates ({templates.length})</Text>
      <FlatList
        data={templates}
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
              <Text style={styles.templateMetaText}>Type: <Text style={styles.metaValue}>{item.type}</Text></Text>
              <Text style={styles.templateMetaText}>Columns: <Text style={styles.metaValue}>{item.columns.length}</Text></Text>
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No templates found</Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                // Initialize default templates
                initializePluginAsync();
              }}
            >
              <Text style={styles.actionButtonText}>Initialize Default Templates</Text>
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
          <Text style={styles.actionButtonText}>
            Create Tables From Selected Templates ({selectedTemplateIds.length})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render the tables tab with refresh button
  const renderTablesTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.tablesContainer}>
        <View style={styles.tablesList}>
          <View style={styles.tablesHeader}>
            <Text style={styles.tabTitle}>Tables</Text>
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
          
          <ScrollView>
            {tables.length > 0 ? (
              tables.map((table) => (
                <TouchableOpacity
                  key={table.uid}
                  style={[
                    styles.tableListItem,
                    selectedTableId === table.uid && styles.tableListItemSelected
                  ]}
                  onPress={() => handleSelectTable(table.uid)}
                >
                  <Text style={styles.tableListItemName}>{table.name}</Text>
                  <Text style={styles.tableIdText}>{table.uid}</Text>
                  <View style={styles.tableListItemActions}>
                    <TouchableOpacity
                      style={styles.tableActionButton}
                      onPress={() => handleRebuildTable(table.uid, 'rebuild_base')}
                    >
                      <Ionicons name="refresh" size={18} color="#ccc" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tableActionButton}
                      onPress={() => handleDeleteTable(table.uid)}
                    >
                      <Ionicons name="trash" size={18} color="#ff6b6b" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No tables found</Text>
                <Text style={styles.emptySubtext}>Go to Templates tab to create tables</Text>
              </View>
            )}
          </ScrollView>
        </View>
        
        <View style={styles.tableDataContainer}>
          <View style={styles.tablesHeader}>
            <Text style={styles.tabTitle}>
              {selectedTableId ? tables.find(t => t.uid === selectedTableId)?.name || 'Table Data' : 'Select a table to view data'}
            </Text>
            {selectedTableId && (
              <Text style={styles.tableIdText}>{selectedTableId}</Text>
            )}
          </View>
          
          {selectedTableId && tableData.length > 0 ? (
            <>
              <ScrollView horizontal>
                <ScrollView>
                  <View style={styles.tableGrid}>
                    {tableData.map((row, rowIndex) => (
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
                <Text style={styles.actionButtonText}>Add Row</Text>
              </TouchableOpacity>
            </>
          ) : selectedTableId ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No data in this table</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Select a table from the left</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  // Render the settings tab
  const renderSettingsTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Memory Enhancement Settings</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingLabel}>
          <Text style={styles.settingTitle}>Enable Table Memory</Text>
          <Text style={styles.settingDescription}>
            Turn on table memory enhancement for structured data storage
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
          <Text style={styles.sectionTitle}>Table Maintenance</Text>
          
          <TouchableOpacity
            style={styles.maintenanceButton}
            onPress={() => handleRebuildTable(selectedTableId, 'rebuild_base')}
          >
            <MaterialIcons name="build" size={20} color="#ccc" />
            <Text style={styles.maintenanceButtonText}>Rebuild Table</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.maintenanceButton}
            onPress={() => handleRebuildTable(selectedTableId, 'rebuild_fix_all')}
          >
            <MaterialIcons name="healing" size={20} color="#ccc" />
            <Text style={styles.maintenanceButtonText}>Fix Table Data</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.maintenanceButton}
            onPress={() => handleRebuildTable(selectedTableId, 'rebuild_simplify_history')}
          >
            <MaterialIcons name="compress" size={20} color="#ccc" />
            <Text style={styles.maintenanceButtonText}>Simplify History</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  // Modal for editing cell value
  const renderCellEditModal = () => (
    <Modal
      visible={!!editingCell}
      transparent
      animationType="fade"
      onRequestClose={handleCancelCellEdit}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.cellEditContainer}>
          <Text style={styles.cellEditTitle}>Edit Cell</Text>
          
          <TextInput
            style={styles.cellEditInput}
            value={editingCell?.value || ''}
            onChangeText={(text) => setEditingCell(prev => prev ? {...prev, value: text} : null)}
            multiline
            autoFocus
            placeholder="Enter cell value..."
            placeholderTextColor="#999"
          />
          
          <View style={styles.cellEditActions}>
            <TouchableOpacity
              style={[styles.cellEditButton, styles.cellEditCancelButton]}
              onPress={handleCancelCellEdit}
            >
              <Text style={styles.cellEditButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cellEditButton, styles.cellEditSaveButton]}
              onPress={handleSaveCellEdit}
            >
              <Text style={styles.cellEditButtonText}>Save</Text>
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
    >
      <View style={styles.container}>
        <BlurView intensity={30} tint="dark" style={styles.blurView}>
          <View style={styles.header}>
            <Text style={styles.title}>Memory Enhancement</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#ff9f1c" />
              <Text style={styles.loadingText}>Loading...</Text>
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
                Templates
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
                Tables
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
                Settings
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
    padding: 16,
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
});

export default MemoOverlay;
