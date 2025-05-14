import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  Text,
  TextInput,
  FlatList,
  ViewStyle
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

interface ColorPickerProps {
  color: string;
  onColorChange: (color: string) => void;
  style?: ViewStyle;
}

// Palette of predefined colors
const PRESET_COLORS = [
  // Dark colors
  '#000000', '#333333', '#444444', '#555555', '#666666',
  // Light colors
  '#ffffff', '#f5f5f5', '#eeeeee', '#dddddd', '#cccccc',
  // Chat colors
  'rgb(68, 68, 68)', 'rgb(51, 51, 51)', 'rgb(34, 34, 34)',
  'rgb(255, 224, 195)', 'rgb(255, 200, 170)', 'rgb(255, 180, 150)',
  // Vibrant colors
  '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
  '#1abc9c', '#d35400', '#c0392b', '#16a085', '#27ae60',
];

const ColorPicker: React.FC<ColorPickerProps> = ({ color, onColorChange, style }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState(color);
  const [hexInput, setHexInput] = useState('');

  useEffect(() => {
    setSelectedColor(color);
    // Convert color format to hex
    if (color.startsWith('rgb')) {
      try {
        const rgbValues = color.match(/\d+/g);
        if (rgbValues && rgbValues.length >= 3) {
          const r = parseInt(rgbValues[0]);
          const g = parseInt(rgbValues[1]);
          const b = parseInt(rgbValues[2]);
          const hex = rgbToHex(r, g, b);
          setHexInput(hex);
        }
      } catch (e) {
        setHexInput(color);
      }
    } else {
      setHexInput(color);
    }
  }, [color]);

  const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  const hexToRgb = (hex: string) => {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgb(${r}, ${g}, ${b})`;
  };

  const handleColorSelect = (color: string) => {
    let formattedColor = color;
    
    // Ensure consistent format (rgb for now)
    if (color.startsWith('#')) {
      formattedColor = hexToRgb(color);
    }
    
    setSelectedColor(formattedColor);
    setHexInput(color.startsWith('#') ? color : rgbToHex(
      parseInt(color.match(/\d+/g)![0]),
      parseInt(color.match(/\d+/g)![1]),
      parseInt(color.match(/\d+/g)![2])
    ));
  };

  const handleConfirm = () => {
    let finalColor = selectedColor;
    
    // If user entered a hex value, convert it
    if (hexInput.startsWith('#')) {
      try {
        finalColor = hexToRgb(hexInput);
      } catch (e) {
        // Invalid hex, use the selected color
      }
    }
    
    onColorChange(finalColor);
    setModalVisible(false);
  };

  const validateHexInput = (text: string) => {
    // Allow # at start, then only hex characters
    const validHex = /^#?[0-9A-Fa-f]{0,6}$/;
    
    if (validHex.test(text)) {
      let formattedHex = text;
      if (formattedHex.length > 0 && !formattedHex.startsWith('#')) {
        formattedHex = '#' + formattedHex;
      }
      setHexInput(formattedHex);
      
      // If we have a valid 6-digit hex, update the selected color
      if (/^#[0-9A-Fa-f]{6}$/.test(formattedHex)) {
        try {
          const rgb = hexToRgb(formattedHex);
          setSelectedColor(rgb);
        } catch (e) {
          // Invalid conversion
        }
      }
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.colorButton, { backgroundColor: color }, style]}
        onPress={() => setModalVisible(true)}
      >
        <View style={styles.colorPreview} />
      </TouchableOpacity>
      
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <BlurView intensity={30} style={styles.modalContainer} tint="dark">
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择颜色</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.colorPreviewLarge}>
              <View style={[styles.selectedColor, { backgroundColor: selectedColor }]} />
              <TextInput
                style={styles.hexInput}
                value={hexInput}
                onChangeText={validateHexInput}
                placeholder="#RRGGBB"
                placeholderTextColor="#999"
                maxLength={7}
                autoCapitalize="characters"
              />
            </View>
            
            <Text style={styles.presetTitle}>预设颜色</Text>
            <FlatList
              data={PRESET_COLORS}
              numColumns={5}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.presetColor,
                    { backgroundColor: item },
                    selectedColor === item && styles.selectedPresetColor
                  ]}
                  onPress={() => handleColorSelect(item)}
                />
              )}
              contentContainerStyle={styles.presetContainer}
            />
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.buttonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.confirmButton} 
                onPress={handleConfirm}
              >
                <Text style={styles.buttonText}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  colorButton: {
    width: 80,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorPreview: {
    width: '100%',
    height: '100%',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  },
  modalContent: {
    width: '80%',
    maxWidth: 400,
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff'
  },
  closeButton: {
    padding: 4
  },
  colorPreviewLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  selectedColor: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fff',
    marginRight: 16,
  },
  hexInput: {
    backgroundColor: '#444',
    padding: 10,
    borderRadius: 6,
    color: '#fff',
    width: 100,
    fontSize: 16,
  },
  presetTitle: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
  },
  presetContainer: {
    paddingVertical: 10,
  },
  presetColor: {
    width: 40,
    height: 40,
    margin: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  selectedPresetColor: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: '#666',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginRight: 10,
  },
  confirmButton: {
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  }
});

export default ColorPicker;
