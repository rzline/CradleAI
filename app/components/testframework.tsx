import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { CharacterImporter } from '@/utils/CharacterImporter';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';

const ADAPTERS = [
  { label: 'Gemini', value: 'gemini' },
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'OpenAI Compatible', value: 'openai-compatible' }
];

export default function TestFramework() {
  const [inputText, setInputText] = useState('');
  const [presetJson, setPresetJson] = useState<string>('');
  const [worldBookJson, setWorldBookJson] = useState<string>('');
  const [adapterType, setAdapterType] = useState<'gemini' | 'openrouter' | 'openai-compatible'>('gemini');
  const [result, setResult] = useState<any[]>([]);
  const [error, setError] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);

  // 导入preset（使用CharacterImporter.importPresetForCharacter）
  const handleImportPreset = async () => {
    setError('');
    try {
      const file = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (file.canceled || !file.assets?.[0]?.uri) return;
      // 这里characterId仅用于日志，可随便填
      const preset = await CharacterImporter.importPresetForCharacter(file.assets[0].uri, 'test');
      setPresetJson(JSON.stringify(preset, null, 2));
    } catch (e: any) {
      setError('导入preset失败: ' + (e?.message || e));
    }
  };

  // 导入worldbook
  const handleImportWorldBook = async () => {
    setError('');
    try {
      const file = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (file.canceled || !file.assets?.[0]?.uri) return;
      const worldBook = await CharacterImporter.importWorldBookOnlyFromJson(file.assets[0].uri);
      setWorldBookJson(JSON.stringify(worldBook, null, 2));
    } catch (e: any) {
      setError('导入worldbook失败: ' + (e?.message || e));
    }
  };

  // 运行测试
  const handleRun = async () => {
    setError('');
    setResult([]);
    try {
      if (!presetJson) {
        setError('请先导入preset');
        return;
      }
      const arr = await NodeSTCore.buildRFrameworkWithChatHistory(
        inputText,
        presetJson,
        adapterType,
        worldBookJson || undefined
      );
      setResult(arr);
    } catch (e: any) {
      setError('生成消息数组失败: ' + (e?.message || e));
    }
  };

  // 点击结果区域，弹出全屏modal
  const handleResultPress = () => {
    if (result && result.length > 0) setModalVisible(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Test buildRFrameworkWithChatHistory</Text>
      <Text style={styles.label}>输入 inputText：</Text>
      <TextInput
        style={styles.input}
        value={inputText}
        onChangeText={setInputText}
        placeholder="请输入对话内容"
        multiline
      />
      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={handleImportPreset}>
          <Text style={styles.buttonText}>导入Preset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleImportWorldBook}>
          <Text style={styles.buttonText}>导入WorldBook</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.label}>适配器类型：</Text>
      <View style={styles.row}>
        {ADAPTERS.map(a => (
          <TouchableOpacity
            key={a.value}
            style={[
              styles.adapterBtn,
              adapterType === a.value && styles.adapterBtnActive
            ]}
            onPress={() => setAdapterType(a.value as any)}
          >
            <Text style={{ color: adapterType === a.value ? '#fff' : '#333' }}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.runBtn} onPress={handleRun}>
        <Text style={styles.runBtnText}>生成消息数组</Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>结果：</Text>
      <TouchableOpacity activeOpacity={0.7} onPress={handleResultPress}>
        <ScrollView style={styles.resultBox}>
          <Text selectable style={{ fontSize: 12 }}>
            {JSON.stringify(result, null, 2)}
          </Text>
          {result && result.length > 0 ? (
            <Text style={styles.fullscreenHint}>（点击可全屏查看）</Text>
          ) : null}
        </ScrollView>
      </TouchableOpacity>
      {/* 全屏Modal显示结果 */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>消息数组全屏查看</Text>
            <Pressable onPress={() => setModalVisible(false)}>
              <Text style={styles.modalClose}>关闭</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalContent}>
            <Text selectable style={{ fontSize: 14 }}>
              {JSON.stringify(result, null, 2)}
            </Text>
          </ScrollView>
        </View>
      </Modal>
      <Text style={styles.label}>当前Preset：</Text>
      <ScrollView style={styles.resultBox}>
        <Text selectable style={{ fontSize: 12 }}>{presetJson}</Text>
      </ScrollView>
      <Text style={styles.label}>当前WorldBook：</Text>
      <ScrollView style={styles.resultBox}>
        <Text selectable style={{ fontSize: 12 }}>{worldBookJson}</Text>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafbfc' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  label: { marginTop: 12, fontWeight: 'bold' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, minHeight: 60, backgroundColor: '#fff'
  },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  button: {
    backgroundColor: '#4a90e2', padding: 8, borderRadius: 6, marginRight: 10
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  adapterBtn: {
    borderWidth: 1, borderColor: '#4a90e2', borderRadius: 6, padding: 8, marginRight: 10, backgroundColor: '#fff'
  },
  adapterBtnActive: { backgroundColor: '#4a90e2' },
  runBtn: {
    marginTop: 16, backgroundColor: '#27ae60', padding: 12, borderRadius: 6, alignItems: 'center'
  },
  runBtnText: { color: '#fff', fontWeight: 'bold' },
  error: { color: 'red', marginTop: 8 },
  resultBox: {
    backgroundColor: '#f5f5f5', borderRadius: 6, padding: 8, marginTop: 6, maxHeight: 180
  },
  fullscreenHint: {
    color: '#888', fontSize: 11, marginTop: 6, textAlign: 'center'
  },
  modalContainer: {
    flex: 1, backgroundColor: '#fff'
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 40, paddingBottom: 12, backgroundColor: '#4a90e2'
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalClose: { color: '#fff', fontSize: 16, padding: 4 },
  modalContent: { flex: 1, padding: 16 }
});
