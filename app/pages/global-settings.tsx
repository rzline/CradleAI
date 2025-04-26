import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@/constants/UserContext';
import { theme } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GlobalSettings = () => {
  const router = useRouter();
  const { user, updateSettings } = useUser();
  
  const [useActivationCode, setUseActivationCode] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  
  const clearAllData = async () => {
    Alert.alert(
      '清空所有数据',
      '此操作将删除所有角色、对话记录和设置。此操作不可撤销。确定要继续吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空数据',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              Alert.alert('成功', '所有数据已清空，应用将重启');
              router.replace('/');
            } catch (error) {
              console.error('清空数据失败:', error);
              Alert.alert('错误', '清空数据失败');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>设置</Text>
        <View style={styles.placeholderButton} />
      </View>

      <ScrollView style={styles.scrollView}>
        <Image 
          source={require('@/assets/images/default-background.jpg')}
          style={styles.headerImage}
          resizeMode="cover"
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API设置</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/pages/api-settings')}
          >
            <Text style={styles.settingLabel}>API配置</Text>
            <Ionicons name="chevron-forward" size={24} color={theme.colors.text} />
          </TouchableOpacity>

          <View style={styles.activationSection}>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>使用激活码</Text>
              <Switch
                value={useActivationCode}
                onValueChange={setUseActivationCode}
                trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.4)' }}
                thumbColor={useActivationCode ? 'rgb(255, 224, 195)' : '#f4f3f4'}
              />
            </View>
            {useActivationCode && (
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  value={activationCode}
                  onChangeText={setActivationCode}
                  placeholder="输入激活码"
                  placeholderTextColor="#999"
                />
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>加入社区</Text>
          <TouchableOpacity style={styles.communityItem}>
            <Ionicons name="logo-discord" size={24} color={theme.colors.text} />
            <Text style={styles.communityText}>加入 Discord</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.communityItem}>
            <Image 
              source={require('@/assets/icons/qq.png')}
              style={styles.qqIcon}
            />
            <Text style={styles.communityText}>加入QQ群</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <Text style={styles.aboutText}>
            这是一款由AI驱动的角色扮演应用，致力于为用户提供独特的对话体验。
            通过先进的语言模型，我们为每个角色注入独特的个性，创造真实自然的互动环境。
          </Text>
          <Text style={styles.versionText}>版本: 1.0.0</Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearAllData}
          >
            <Text style={styles.clearButtonText}>清空所有数据</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholderButton: {
    width: 40,
  },
  headerImage: {
    width: '100%',
    height: 200,
    marginBottom: 16,
  },
  // ...existing code for header styles...
  
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: theme.colors.text,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: theme.colors.text,
  },
  activationSection: {
    marginTop: 8,
  },
  inputContainer: {
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  communityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  communityText: {
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 12,
  },
  qqIcon: {
    width: 24,
    height: 24,
  },
  aboutText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  versionText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  clearButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: theme.colors.danger,
  },
});

export default GlobalSettings;