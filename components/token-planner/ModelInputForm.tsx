import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput,
  TouchableOpacity,
  Switch,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface InputValues {
  userInputWords: number;
  expectedOutputWords: number;
  roleCardWords: number;
  imageCount: number;
  includeImages: boolean;
  conversationTurns: number;
  monthlyBudget: number;
  dailyChats: number;
  tokenPerWordRatio: number;
  includeVoiceGeneration: boolean;
  dailyVoiceMessages: number;
  voiceDurationPerMessage: number;
  includeImageGeneration: boolean;
  monthlyGeneratedImages: number;
}

interface ModelInputFormProps {
  defaultValues: InputValues;
  onSubmit: (values: InputValues) => void;
  onRefreshModels: () => void;
}

const ModelInputForm: React.FC<ModelInputFormProps> = ({ 
  defaultValues, 
  onSubmit,
  onRefreshModels
}) => {
  const [values, setValues] = useState<InputValues>(defaultValues);
  const [expanded, setExpanded] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const handleInputChange = (field: keyof InputValues, value: string | boolean) => {
    if (typeof value === 'boolean') {
      setValues(prev => ({
        ...prev,
        [field]: value
      }));
    } else {
      const numValue = value === '' ? 0 : parseFloat(value);
      setValues(prev => ({
        ...prev,
        [field]: isNaN(numValue) ? 0 : numValue
      }));
    }
  };

  const handleSubmit = () => {
    onSubmit(values);
  };

  const handleReset = () => {
    setValues(defaultValues);
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const toggleAdvancedOptions = () => {
    setShowAdvancedOptions(!showAdvancedOptions);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.sectionTitle}>使用习惯</Text>
        <TouchableOpacity onPress={toggleExpanded} style={styles.expandButton}>
          <Ionicons 
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} 
            size={20} 
            color={theme.colors.text} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.inputRow}>
        <Text style={styles.label}>每日聊天条数</Text>
        <TextInput
          style={styles.input}
          value={values.dailyChats.toString()}
          onChangeText={(value) => handleInputChange('dailyChats', value)}
          keyboardType="numeric"
          placeholder="300"
        />
      </View>

      <View style={styles.inputRow}>
        <Text style={styles.label}>每月预算 (元)</Text>
        <TextInput
          style={styles.input}
          value={values.monthlyBudget.toString()}
          onChangeText={(value) => handleInputChange('monthlyBudget', value)}
          keyboardType="numeric"
          placeholder="30"
        />
      </View>

      {expanded && (
        <>
          <View style={styles.inputRow}>
            <Text style={styles.label}>用户输入字数</Text>
            <TextInput
              style={styles.input}
              value={values.userInputWords.toString()}
              onChangeText={(value) => handleInputChange('userInputWords', value)}
              keyboardType="numeric"
              placeholder="100"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>期望角色输出字数</Text>
            <TextInput
              style={styles.input}
              value={values.expectedOutputWords.toString()}
              onChangeText={(value) => handleInputChange('expectedOutputWords', value)}
              keyboardType="numeric"
              placeholder="200"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>角色卡字数</Text>
            <TextInput
              style={styles.input}
              value={values.roleCardWords.toString()}
              onChangeText={(value) => handleInputChange('roleCardWords', value)}
              keyboardType="numeric"
              placeholder="500"
            />
          </View>
          
          <View style={styles.inputRow}>
            <Text style={styles.label}>对话轮数记忆窗口</Text>
            <TextInput
              style={styles.input}
              value={values.conversationTurns.toString()}
              onChangeText={(value) => handleInputChange('conversationTurns', value)}
              keyboardType="numeric"
              placeholder="5"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>文字和token转换比率</Text>
            <TextInput
              style={styles.input}
              value={values.tokenPerWordRatio.toString()}
              onChangeText={(value) => handleInputChange('tokenPerWordRatio', value)}
              keyboardType="numeric"
              placeholder="0.75"
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>包含图片输入</Text>
            <Switch
              value={values.includeImages}
              onValueChange={(value) => handleInputChange('includeImages', value)}
              trackColor={{ false: '#767577', true: theme.colors.primary }}
              thumbColor={values.includeImages ? '#fff' : '#f4f3f4'}
              ios_backgroundColor="#3e3e3e"
            />
          </View>

          {values.includeImages && (
            <View style={styles.inputRow}>
              <Text style={styles.label}>每月图片数量</Text>
              <TextInput
                style={styles.input}
                value={values.imageCount.toString()}
                onChangeText={(value) => handleInputChange('imageCount', value)}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          )}
          
          <TouchableOpacity style={styles.advancedOptionsButton} onPress={toggleAdvancedOptions}>
            <Text style={styles.advancedOptionsButtonText}>
              {showAdvancedOptions ? "收起高级选项" : "展开高级选项"}
            </Text>
            <Ionicons 
              name={showAdvancedOptions ? "chevron-up-outline" : "chevron-down-outline"}
              size={16}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
          
          {showAdvancedOptions && (
            <>
              <View style={styles.featureSection}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>包含语音生成</Text>
                  <Switch
                    value={values.includeVoiceGeneration}
                    onValueChange={(value) => handleInputChange('includeVoiceGeneration', value)}
                    trackColor={{ false: '#767577', true: theme.colors.primary }}
                    thumbColor={values.includeVoiceGeneration ? '#fff' : '#f4f3f4'}
                    ios_backgroundColor="#3e3e3e"
                  />
                </View>
                
                {values.includeVoiceGeneration && (
                  <>
                    <View style={styles.inputRow}>
                      <Text style={styles.label}>每日语音条数</Text>
                      <TextInput
                        style={styles.input}
                        value={values.dailyVoiceMessages.toString()}
                        onChangeText={(value) => handleInputChange('dailyVoiceMessages', value)}
                        keyboardType="numeric"
                        placeholder="5"
                      />
                    </View>
                    
                    <View style={styles.inputRow}>
                      <Text style={styles.label}>每条语音时长 (秒)</Text>
                      <TextInput
                        style={styles.input}
                        value={values.voiceDurationPerMessage.toString()}
                        onChangeText={(value) => {
                          const duration = parseFloat(value);
                          if (isNaN(duration) || duration <= 15) {
                            handleInputChange('voiceDurationPerMessage', value);
                          } else {
                            handleInputChange('voiceDurationPerMessage', '15');
                          }
                        }}
                        keyboardType="numeric"
                        placeholder="5"
                      />
                    </View>
                    
                    {parseFloat(values.voiceDurationPerMessage.toString()) > 15 && (
                      <Text style={styles.warningText}>
                        语音时长最大为15秒
                      </Text>
                    )}
                  </>
                )}
              </View>
              
              <View style={styles.featureSection}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>包含图片生成</Text>
                  <Switch
                    value={values.includeImageGeneration}
                    onValueChange={(value) => handleInputChange('includeImageGeneration', value)}
                    trackColor={{ false: '#767577', true: theme.colors.primary }}
                    thumbColor={values.includeImageGeneration ? '#fff' : '#f4f3f4'}
                    ios_backgroundColor="#3e3e3e"
                  />
                </View>
                
                {values.includeImageGeneration && (
                  <View style={styles.inputRow}>
                    <Text style={styles.label}>每月生成图片数量</Text>
                    <TextInput
                      style={styles.input}
                      value={values.monthlyGeneratedImages.toString()}
                      onChangeText={(value) => handleInputChange('monthlyGeneratedImages', value)}
                      keyboardType="numeric"
                      placeholder="10"
                    />
                  </View>
                )}
              </View>
              
              <View style={styles.pricingInfoContainer}>
                <Text style={styles.pricingInfoTitle}>价格参考：</Text>
                <Text style={styles.pricingInfoText}>• 语音生成：0.01元/秒（生成1秒音频≈运行1秒）</Text>
                <Text style={styles.pricingInfoText}>• 图片生成：0.01元/秒（生成1张图片≈运行5秒）</Text>
              </View>
            </>
          )}
        </>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefreshModels}>
          <Ionicons name="refresh-outline" size={18} color="#fff" />
          <Text style={styles.refreshButtonText}>刷新模型</Text>
        </TouchableOpacity>
        
        <View style={styles.rightButtons}>
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>重置</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>计算费用</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  expandButton: {
    padding: 4,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: Platform.OS === 'ios' ? 10 : 8,
    color: theme.colors.text,
    flex: 1,
    marginLeft: 16,
    maxWidth: 120,
    textAlign: 'right',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    alignItems: 'center',
  },
  rightButtons: {
    flexDirection: 'row',
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  submitButtonText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 14,
  },
  resetButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  resetButtonText: {
    color: theme.colors.text,
    fontSize: 14,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    marginLeft: 6,
  },
  advancedOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(100, 100, 255, 0.1)',
  },
  advancedOptionsButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginRight: 4,
  },
  featureSection: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(100, 100, 255, 0.3)',
    paddingLeft: 12,
    marginVertical: 8,
  },
  pricingInfoContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  pricingInfoTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 6,
  },
  pricingInfoText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    lineHeight: 18,
  },
  warningText: {
    fontSize: 12,
    color: theme.colors.warning,
    marginBottom: 8,
    marginTop: -6,
  }
});

export default ModelInputForm;
