import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '@/constants/UserContext';
import { useRouter } from 'expo-router';
import { NodeSTCleanupButton } from '@/components/settings/NodeSTCleanupButton';
import ListItem from '@/components/ListItem';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingIndicator from '@/components/LoadingIndicator';
import { theme } from '@/constants/theme';

const Profile: React.FC = () => {
  const { user, updateAvatar } = useUser();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  const pickImage = useCallback(async () => {
    try {
      setIsLoading(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setShowPermissionDialog(true);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await updateAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [updateAvatar]);

  const handleCleanupComplete = () => {
    // 可以在清理完成后执行一些操作
    console.log("NodeST 数据清理完成");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      {/* Header Image */}
      <Image 
        source={require('@/assets/images/default-background.jpeg')}
        style={styles.headerImage}
        resizeMode="cover"
      />

      {/* User Profile */}
      <View style={styles.header}>
        <TouchableOpacity onPress={pickImage}>
          <Image
            source={user?.avatar ? { uri: user.avatar } : require('@/assets/images/default-avatar.png')}
            style={styles.avatar}
          />
          <View style={styles.editAvatarButton}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Menu Items */}
      <ScrollView style={styles.content}>
        <ListItem
          title="API 设置"
          leftIcon="cloud-outline"
          chevron={true}
          onPress={() => router.push('/pages/api-settings')}
        />
        
        <ListItem
          title="模型费用计算器"
          leftIcon="calculator-outline"
          chevron={true}
          onPress={() => router.push('../pages/token-planner')}
        />

        {/* Add new option for custom user settings manager */}
        <ListItem
          title="自设管理"
          leftIcon="person-outline"
          chevron={true}
          onPress={() => router.push('../pages/custom-settings-manager')}
          subtitle="全部自设列表"
        />
        
        {/* <ListItem
          title="存储管理器"
          leftIcon="folder-open-outline" 
          chevron={true}
          onPress={() => router.push('../pages/storage-manager')}
          subtitle="查看和清理应用存储"
        /> */}

        <ListItem
          title="加入社区"
          leftIcon="people-outline"
          onPress={() => {
            // Add community links handling
          }}
          subtitle="Discord | QQ群"
        />
        
        <ListItem
          title="关于"
          leftIcon="information-circle-outline"
          chevron={true}
          subtitle="版本 1.0.0"
        />
      </ScrollView>

      {/* 图片权限确认对话框 */}
      <ConfirmDialog
        visible={showPermissionDialog}
        title="需要权限"
        message="请允许访问相册以便选择头像图片"
        confirmText="确定"
        cancelText="取消"
        confirmAction={() => setShowPermissionDialog(false)}
        cancelAction={() => setShowPermissionDialog(false)}
        destructive={false}
        icon="alert-circle"
      />

      {/* 使用新的LoadingIndicator组件 */}
      <LoadingIndicator 
        visible={isLoading} 
        text="处理中..."
        overlay={true}
        useModal={true}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerImage: {
    width: '100%',
    height: 200,
  },
  header: {
    marginTop: -60, // Overlap with header image
    padding: 16,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 16,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
});

export default Profile;