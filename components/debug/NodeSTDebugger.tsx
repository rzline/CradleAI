import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import LoadingIndicator from '../LoadingIndicator';
import { theme } from '@/constants/theme';

type CharacterData = {
  id: string;
  name?: string;
  type: string;
  data?: any;
};

const NodeSTDebugger: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [matchingKeys, setMatchingKeys] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characterData, setCharacterData] = useState<CharacterData[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const keys = await AsyncStorage.getAllKeys();
      const nodestKeys = keys.filter(key => key.startsWith('nodest_'));
      setAllKeys(nodestKeys);
      
      await loadCharacterData(nodestKeys);
      
      setIsLoading(false);
    } catch (e) {
      setError('Failed to load data from storage: ' + (e instanceof Error ? e.message : String(e)));
      setIsLoading(false);
    }
  };

  const loadCharacterData = async (keys: string[]) => {
    try {
      const characterIds = new Set<string>();
      keys.forEach(key => {
        const parts = key.replace('nodest_', '').split('_');
        if (parts.length >= 1) {
          characterIds.add(parts[0]);
        }
      });
      
      const characterDataPromises = Array.from(characterIds).map(async (id) => {
        const relatedKeys = keys.filter(key => key.includes(`nodest_${id}`));
        const characterEntries: CharacterData[] = [];
        
        for (const key of relatedKeys) {
          try {
            const rawData = await AsyncStorage.getItem(key);
            if (!rawData) continue;
            
            const data = JSON.parse(rawData);
            
            let type = 'unknown';
            if (key.endsWith('_role')) type = 'role';
            else if (key.endsWith('_world')) type = 'world';
            else if (key.endsWith('_preset')) type = 'preset';
            else if (key.endsWith('_history')) type = 'history';
            else if (key.endsWith('_note')) type = 'note';
            else if (key.endsWith('_contents')) type = 'contents';
            else if (key.endsWith('_circle_memory')) type = 'memory';
            
            let name = key.replace('nodest_', '');
            if (type === 'role' && data.name) {
              name = data.name;
            } else if (type === 'history' && data.role) {
              name = `${id} (History)`;
            }
            
            characterEntries.push({
              id: key,
              name,
              type,
              data
            });
          } catch (e) {
            characterEntries.push({
              id: key,
              name: key.replace('nodest_', ''),
              type: 'error',
              data: { error: e instanceof Error ? e.message : String(e) }
            });
          }
        }
        
        return characterEntries;
      });
      
      const allCharacterData = (await Promise.all(characterDataPromises)).flat();
      
      const groupedData = allCharacterData.reduce<Record<string, CharacterData[]>>((groups, item) => {
        const idParts = item.id.replace('nodest_', '').split('_');
        const charId = idParts[0];
        
        if (!groups[charId]) {
          groups[charId] = [];
        }
        groups[charId].push(item);
        return groups;
      }, {});
      
      const sortedData = Object.values(groupedData)
        .map(group => {
          return group.sort((a, b) => {
            if (a.type === 'role') return -1;
            if (b.type === 'role') return 1;
            return 0;
          });
        })
        .flat();
      
      setCharacterData(sortedData);
    } catch (e) {
      setError('Failed to load character data: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const searchCharacters = async () => {
    if (!searchQuery.trim()) {
      setIsFiltering(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsFiltering(true);
    
    try {
      const filteredData = characterData.filter(item => {
        const searchLower = searchQuery.toLowerCase();
        const nameLower = (item.name || '').toLowerCase();
        const idLower = item.id.toLowerCase();
        const typeLower = item.type.toLowerCase();
        
        return (
          nameLower.includes(searchLower) || 
          idLower.includes(searchLower) || 
          typeLower.includes(searchLower)
        );
      });
      
      if (filteredData.length === 0 && characterData.length > 0) {
        setError(`No characters found matching "${searchQuery}"`);
      }
      
      setCharacterData(filteredData);
    } catch (e) {
      setError('Search failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  const clearSearch = async () => {
    setSearchQuery('');
    setIsFiltering(false);
    loadAllData();
  };

  const viewKeyData = async (key: string) => {
    setIsLoading(true);
    setSelectedKey(key);
    
    try {
      const rawData = await AsyncStorage.getItem(key);
      if (rawData) {
        setSelectedData(JSON.parse(rawData));
      } else {
        setSelectedData(null);
        setError(`No data found for key: ${key}`);
      }
    } catch (e) {
      setError(`Failed to load data: ${e instanceof Error ? e.message : String(e)}`);
      setSelectedData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedByCharacter: Record<string, CharacterData[]> = characterData.reduce<Record<string, CharacterData[]>>((groups, item) => {
    const idParts = item.id.replace('nodest_', '').split('_');
    const charId = idParts[0];
    
    if (!groups[charId]) {
      groups[charId] = [];
    }
    groups[charId].push(item);
    return groups;
  }, {});

  const sortedCharacterGroups = Object.entries(groupedByCharacter).sort((a, b) => {
    const aRoleName = a[1].find(item => item.type === 'role')?.name || a[0];
    const bRoleName = b[1].find(item => item.type === 'role')?.name || b[0];
    return aRoleName.localeCompare(bRoleName);
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'role': return 'person';
      case 'world': return 'globe';
      case 'preset': return 'settings';
      case 'history': return 'chatbubbles';
      case 'note': return 'document-text';
      case 'contents': return 'list';
      case 'memory': return 'bookmark';
      case 'error': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const renderCharacterGroup = (charId: string, items: CharacterData[]) => {
    const roleItem = items.find(item => item.type === 'role');
    const displayName = roleItem?.name || charId;
    
    return (
      <View key={charId} style={styles.characterGroup}>
        <Text style={styles.characterGroupTitle}>
          {displayName}
        </Text>
        
        {items.map(item => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.characterItem}
            onPress={() => viewKeyData(item.id)}
          >
            <View style={styles.characterHeader}>
              <Ionicons name={getIcon(item.type)} size={18} color={theme.colors.primary} />
              <Text style={styles.characterName} numberOfLines={1}>
                {item.name || item.id.replace('nodest_', '')}
              </Text>
            </View>
            <Text style={styles.characterType}>{item.type}</Text>
            <Text style={styles.characterId} numberOfLines={1}>{item.id}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索角色名称..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#777"
        />
        <TouchableOpacity style={styles.searchButton} onPress={searchCharacters}>
          <Text style={styles.searchButtonText}>搜索</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.refreshButton} onPress={loadAllData}>
          <Ionicons name="refresh" size={20} color="white" />
        </TouchableOpacity>
      </View>
      
      {isFiltering && (
        <TouchableOpacity style={styles.clearSearchButton} onPress={clearSearch}>
          <Text style={styles.clearSearchText}>
            <Ionicons name="close-circle" size={16} /> 清除搜索，显示全部
          </Text>
        </TouchableOpacity>
      )}
      
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView style={styles.characterList}>
        {characterData.length > 0 ? (
          sortedCharacterGroups.map(([charId, items]) => 
            renderCharacterGroup(charId, items)
          )
        ) : !isLoading ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={60} color="#555" />
            <Text style={styles.emptyStateText}>
              {isFiltering 
                ? `未找到匹配"${searchQuery}"的数据` 
                : '未找到任何角色数据'}
            </Text>
            <Text style={styles.storageInfoText}>
              已加载 {allKeys.length} 个存储键
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {selectedData && (
        <View style={styles.dataViewContainer}>
          <View style={styles.dataViewHeader}>
            <Text style={styles.dataViewTitle}>
              {selectedKey?.replace('nodest_', '')}
            </Text>
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => {
                setSelectedData(null);
                setSelectedKey(null);
              }}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.dataViewContent}>
            <Text style={styles.jsonText}>
              {JSON.stringify(selectedData, null, 2)}
            </Text>
          </ScrollView>
        </View>
      )}

      <LoadingIndicator 
        visible={isLoading} 
        text="加载中..."
        overlay={true}
        useModal={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 8,
    padding: 12,
    color: theme.colors.text,
    marginRight: 8,
  },
  searchButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  searchButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  refreshButton: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 8,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  clearSearchText: {
    color: theme.colors.primary,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#ff5252',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: 'white',
    fontSize: 14,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: theme.colors.text,
  },
  keyList: {
    flex: 1,
  },
  keyItem: {
    backgroundColor: theme.colors.primaryDark,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  keyText: {
    color: theme.colors.text,
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyStateText: {
    color: '#777',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  storageInfoText: {
    color: '#555',
    fontSize: 14,
    marginTop: 8,
  },
  dataViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    zIndex: 10,
    padding: 16,
  },
  dataViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dataViewTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  dataViewContent: {
    flex: 1,
  },
  jsonText: {
    color: '#2ecc71',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  characterList: {
    flex: 1,
  },
  characterGroup: {
    marginBottom: 16,
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 8,
    padding: 12,
  },
  characterGroupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 8,
  },
  characterItem: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  characterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  characterName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  characterType: {
    color: theme.colors.primary,
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  characterId: {
    color: '#777',
    fontSize: 12,
  },
});

export default NodeSTDebugger;
