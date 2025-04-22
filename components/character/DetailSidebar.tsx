import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  Keyboard,
  Switch,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  BackHandler,
  ViewStyle,
  FlatList,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import TextEditorModal from '../common/TextEditorModal';

interface DetailSidebarProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  onContentChange?: (text: string) => void;
  editable?: boolean;
  entryType?: 'worldbook' | 'preset' | 'author_note';
  entryOptions?: any;
  onOptionsChange?: (options: any) => void;
  name?: string;
  onNameChange?: (text: string) => void;
  onDelete?: () => void;
}

const { width } = Dimensions.get('window');
const COLOR_BEIGE = 'rgb(255, 224, 195)';
const COLOR_DANGER = '#FF5252';

const DetailSidebar: React.FC<DetailSidebarProps> = ({
  isVisible,
  onClose,
  title,
  content,
  onContentChange,
  editable = true,
  entryType,
  entryOptions,
  onOptionsChange,
  name,
  onNameChange,
  onDelete,
}) => {
  const [localContent, setLocalContent] = useState(content);
  const [localName, setLocalName] = useState(name || '');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [localOptions, setLocalOptions] = useState(entryOptions || {});
  const [showTextEditor, setShowTextEditor] = useState(false);
  
  const translateYValue = useRef(new Animated.Value(0)).current;
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    setLocalContent(content);
    setLocalName(name || '');
    setLocalOptions(entryOptions || {});
  }, [content, name, entryOptions]);

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      (event) => {
        const keyboardHeight = event.endCoordinates.height;
        setKeyboardHeight(keyboardHeight);
        setKeyboardShown(true);
        
        Animated.timing(translateYValue, {
          toValue: -keyboardHeight / 2,
          duration: 250,
          useNativeDriver: true
        }).start();
      }
    );
    
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (event) => {
        const keyboardHeight = event.endCoordinates.height;
        setKeyboardHeight(keyboardHeight);
        setKeyboardShown(true);
      }
    );
    
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      () => {
        setKeyboardHeight(0);
        setKeyboardShown(false);
        
        Animated.timing(translateYValue, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true
        }).start();
      }
    );
    
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setKeyboardShown(false);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardDidShowListener.remove();
      keyboardWillHideListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [translateYValue]);

  useEffect(() => {
    if (isVisible) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isVisible) {
          onClose();
          return true;
        }
        return false;
      });
      
      return () => {
        backHandler.remove();
      };
    }
  }, [isVisible, onClose]);

  const handleOptionsChange = useCallback((updates: any) => {
    const newOptions = { ...localOptions, ...updates };
    setLocalOptions(newOptions);
    if (onOptionsChange) {
      onOptionsChange(newOptions);
    }
  }, [localOptions, onOptionsChange]);

  const handleUpdateSlider = useCallback((value: number) => {
    if (entryType === 'worldbook' && localOptions.position === 4) {
      handleOptionsChange({ depth: value });
    } 
    else if (entryType === 'preset' && localOptions.insertType === 'chat') {
      handleOptionsChange({ depth: value });
    } 
    else if (entryType === 'author_note') {
      handleOptionsChange({ injection_depth: value });
    }
  }, [entryType, localOptions, handleOptionsChange]);

  const handleSaveWithKeyboardDismiss = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      if (onContentChange) {
        onContentChange(localContent);
      }
      if (onNameChange && name !== undefined) {
        onNameChange(localName);
      }
      onClose();
    }, 100);
  }, [localContent, localName, onContentChange, onNameChange, name, onClose]);

  const handleCloseWithKeyboardDismiss = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      onClose();
    }, 100);
  }, [onClose]);

  const handleTextPress = useCallback(() => {
    setShowTextEditor(true);
  }, []);

  const handleTextSave = useCallback((newText: string) => {
    setLocalContent(newText);
    if (onContentChange) {
      onContentChange(newText);
    }
  }, [onContentChange]);

  const renderEntryOptions = () => {
    if (!entryType || !localOptions) return null;

    switch (entryType) {
      case 'worldbook':
        return (
          <View style={styles.optionsContainer}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>位置:</Text>
              <View style={styles.radioGroup}>
                {[0, 1, 2, 3, 4].map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      styles.radioButton,
                      localOptions.position === pos && styles.radioButtonSelected,
                    ]}
                    onPress={() => handleOptionsChange({ position: pos })}
                  >
                    <Text
                      style={[
                        styles.radioText,
                        localOptions.position === pos && styles.radioTextSelected,
                      ]}
                    >
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>禁用:</Text>
              <Switch
                trackColor={{ false: "#767577", true: COLOR_BEIGE }}
                thumbColor={localOptions.disable ? COLOR_BEIGE : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={(value) => handleOptionsChange({ disable: value })}
                value={localOptions.disable}
              />
            </View>
            
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>常驻:</Text>
              <Switch
                trackColor={{ false: "#767577", true: COLOR_BEIGE }}
                thumbColor={localOptions.constant ? COLOR_BEIGE : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={(value) => handleOptionsChange({ constant: value })}
                value={localOptions.constant}
              />
            </View>

            {localOptions.position === 4 && (
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>深度: {localOptions.depth}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={5}
                  step={1}
                  value={localOptions.depth || 0}
                  onValueChange={handleUpdateSlider}
                  minimumTrackTintColor={COLOR_BEIGE}
                  maximumTrackTintColor="#444"
                />
              </View>
            )}
          </View>
        );

      case 'preset':
        return (
          <View style={styles.optionsContainer}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>启用:</Text>
              <Switch
                trackColor={{ false: "#767577", true: COLOR_BEIGE }}
                thumbColor={localOptions.enable ? COLOR_BEIGE : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={(value) => handleOptionsChange({ enable: value })}
                value={localOptions.enable}
              />
            </View>
            
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>角色:</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.role === 'user' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ role: 'user' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.role === 'user' && styles.radioTextSelected,
                    ]}
                  >
                    用户
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.role === 'model' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ role: 'model' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.role === 'model' && styles.radioTextSelected,
                    ]}
                  >
                    AI
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>插入类型:</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.insertType === 'relative' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ insertType: 'relative' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.insertType === 'relative' && styles.radioTextSelected,
                    ]}
                  >
                    相对位置
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.insertType === 'chat' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ insertType: 'chat' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.insertType === 'chat' && styles.radioTextSelected,
                    ]}
                  >
                    对话式
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {localOptions.insertType === 'chat' && (
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>深度: {localOptions.depth}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={5}
                  step={1}
                  value={localOptions.depth || 0}
                  onValueChange={handleUpdateSlider}
                  minimumTrackTintColor={COLOR_BEIGE}
                  maximumTrackTintColor="#444"
                />
              </View>
            )}
          </View>
        );

      case 'author_note':
        return (
          <View style={styles.optionsContainer}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>深度: {localOptions.injection_depth}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={5}
                step={1}
                value={localOptions.injection_depth || 0}
                onValueChange={handleUpdateSlider}
                minimumTrackTintColor={COLOR_BEIGE}
                maximumTrackTintColor="#444"
              />
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCloseWithKeyboardDismiss}
      supportedOrientations={['portrait', 'landscape']}
    >
      <BlurView intensity={20} tint="dark" style={styles.container}>
        <Animated.View 
          style={[
            styles.modalWrapper,
            { transform: [{ translateY: translateYValue }] }
          ]}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.headerButtons}>


                <TouchableOpacity 
                  style={styles.headerButton} 
                  onPress={handleCloseWithKeyboardDismiss}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {name !== undefined && (
              <View style={styles.nameContainer}>
                <Text style={styles.nameLabel}>名称:</Text>
                <TextInput
                  style={styles.nameInput}
                  value={localName}
                  onChangeText={setLocalName}
                  editable={editable}
                  placeholder="输入名称..."
                  placeholderTextColor="#999"
                />
              </View>
            )}

            {renderEntryOptions()}

            <View style={styles.scrollContainer}>
              <TouchableOpacity 
                style={styles.textPreview} 
                onPress={handleTextPress}
                disabled={!editable}
              >
                <Text style={styles.textPreviewContent} numberOfLines={0}>
                  {localContent || '点击编辑文本...'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleCloseWithKeyboardDismiss}
              >
                <Text style={styles.buttonText}>取消</Text>
              </TouchableOpacity>
              {editable && (
                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleSaveWithKeyboardDismiss}
                >
                  <Text style={styles.buttonText}>保存</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextEditorModal
              isVisible={showTextEditor}
              onClose={() => setShowTextEditor(false)}
              onSave={handleTextSave}
              initialText={localContent}
            />
          </View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 0 : 20,
  },
  content: {
    width: width * 0.9,
    maxWidth: 500,
    height: '80%',
    maxHeight: 600,
    backgroundColor: '#333',
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  scrollContainer: {
    flex: 1,
    minHeight: 200,
  },
  textPreview: {
    flex: 1,
    padding: 16,
    backgroundColor: '#444',
    borderRadius: 8,
    margin: 16,
  },
  textPreviewContent: {
    color: '#fff',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 4,
    marginLeft: 8,
  },
  closeButton: {
    padding: 4,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  nameLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    width: 60,
  },
  nameInput: {
    flex: 1,
    color: '#fff',
    padding: 8,
    backgroundColor: '#444',
    borderRadius: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
    backgroundColor: '#333',
  },
  buttonContainerWithKeyboard: {
    borderTopWidth: 1,
    borderTopColor: '#444',
    backgroundColor: '#333',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  saveButton: {
    backgroundColor: COLOR_BEIGE,
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  optionsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 16,
    color: '#fff',
    width: 80,
  },
  radioGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  radioButton: {
    backgroundColor: '#444',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  radioButtonSelected: {
    backgroundColor: COLOR_BEIGE,
  },
  radioText: {
    color: '#ccc',
  },
  radioTextSelected: {
    color: '#000',
    fontWeight: 'bold',
  },
  slider: {
    flex: 1,
    height: 40,
  },
});

export default DetailSidebar;
