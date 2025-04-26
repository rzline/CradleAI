import React, { createContext, useContext, useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import { User, GlobalSettings } from '@/shared/types';
import { storeUserSettingsGlobally, updateCloudServiceStatus } from '@/utils/settings-helper';

interface UserContextProps {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  updateSettings: (settings: Partial<GlobalSettings>) => Promise<void>;
  loading: boolean;
  updateAvatar: (uri: string) => Promise<void>;
}

const UserContext = createContext<UserContextProps | undefined>(undefined);

const USER_FILE_PATH = FileSystem.documentDirectory + 'user.json';

async function readUserFromFile(): Promise<User | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(USER_FILE_PATH);
    if (!fileInfo.exists) return null;
    const content = await FileSystem.readAsStringAsync(USER_FILE_PATH);
    return JSON.parse(content);
  } catch (e) {
    console.error('[UserContext] Failed to read user file:', e);
    return null;
  }
}

async function writeUserToFile(user: User): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(USER_FILE_PATH, JSON.stringify(user));
  } catch (e) {
    console.error('[UserContext] Failed to write user file:', e);
  }
}

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const parsedUser = await readUserFromFile();
        if (parsedUser) {
          setUser(parsedUser);

          if (parsedUser.settings) {
            storeUserSettingsGlobally(parsedUser.settings);
            if (parsedUser.settings.chat && parsedUser.settings.chat.useCloudService !== undefined) {
              updateCloudServiceStatus(parsedUser.settings.chat.useCloudService);
            }
          }
        } else {
          const defaultUser: User = {
            id: 'user-1',
            name: 'User',
            avatar: null as any,
            settings: {
              license: {
                enabled: false,
                licenseKey: undefined,
                deviceId: undefined,
                planId: undefined,
                expiryDate: undefined
              },
              app: {
                darkMode: true,
                autoSave: true,
                notifications: {
                  enabled: false
                }
              },
              chat: {
                typingDelay: 300,
                serverUrl: '',
                characterApiKey: '',
                xApiKey: '',
                apiProvider: 'gemini',
                temperature: 0.7,
                maxTokens: 800,
                maxtokens: 800,
                useZhipuEmbedding: false,
                useCloudService: false,
                zhipuApiKey: '',
                openrouter: {
                  enabled: false,
                  apiKey: '',
                  model: 'openai/gpt-3.5-turbo',
                  useBackupModels: false,
                  backupModels: [],
                  autoRoute: false,
                  sortingStrategy: 'price',
                  dataCollection: true,
                  ignoredProviders: []
                }
              },
              self: {
                nickname: '我',
                gender: 'other',
                description: ''
              }
            }
          };
          setUser(defaultUser);
          await writeUserToFile(defaultUser);

          if (defaultUser.settings) {
            storeUserSettingsGlobally(defaultUser.settings);
            if (defaultUser.settings.chat) {
              updateCloudServiceStatus(defaultUser.settings.chat.useCloudService || false);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const updateAvatar = async (uri: string): Promise<void> => {
    if (!user) return;

    const updatedUser = {
      ...user,
      avatar: uri
    };
    setUser(updatedUser);
    await writeUserToFile(updatedUser);
  };

  const updateSettings = async (settings: Partial<GlobalSettings>) => {
    if (!user) return;

    try {
      if (!user.settings) throw new Error('User settings not initialized');

      const updatedUser = {
        ...user,
        settings: {
          ...user.settings,
          app: {
            ...user.settings.app,
            ...settings.app
          },
          chat: {
            ...user.settings.chat,
            ...settings.chat
          },
          self: {
            ...user.settings.self,
            ...settings.self
          }
        }
      };

      setUser(updatedUser);
      await writeUserToFile(updatedUser);

      storeUserSettingsGlobally(updatedUser.settings);

      if (settings.chat && settings.chat.useCloudService !== undefined) {
        updateCloudServiceStatus(settings.chat.useCloudService);
      }

      console.log('[UserContext] Settings updated successfully, apiProvider:',
        updatedUser.settings.chat.apiProvider,
        'useCloudService:', updatedUser.settings.chat.useCloudService);
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw new Error('Failed to update settings');
    }
  };

  return (
    <UserContext.Provider value={{ 
      user, 
      setUser, 
      updateSettings, 
      loading,
      updateAvatar 
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};