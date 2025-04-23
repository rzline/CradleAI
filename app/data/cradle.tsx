// import React, { useState, useCallback, useEffect, useRef } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   TouchableOpacity,
//   ScrollView,
//   RefreshControl,
//   StatusBar,
//   Dimensions,
//   KeyboardAvoidingView,
//   Platform,
//   ActivityIndicator,
//   Image,
//   Animated,
//   Alert,
//   Modal
// } from 'react-native';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';
// import { useRouter } from 'expo-router';
// import { Ionicons } from '@expo/vector-icons';
// import { theme } from '@/constants/theme';
// import { CradleCharacter } from '@/shared/types';
// import { useCharacters } from '@/constants/CharactersContext';
// import ImportToCradleModal from '@/components/ImportToCradleModal';
// import CradleSettings from '@/components/CradleSettings';
// import CradleApiSettings from '@/components/CradleApiSettings';
// import { downloadAndSaveImage } from '@/utils/imageUtils';
// import { confirmDeleteCradleCharacter } from '@/utils/cradleUtils';
// import { LinearGradient } from 'expo-linear-gradient';
// import CradleCharacterDetail from '@/components/CradleCharacterDetail';
// import CharacterEditDialog from '@/components/CharacterEditDialog'; // 导入角色编辑对话框
// import { NodeSTManager } from '@/utils/NodeSTManager'; // 导入NodeSTManager
// const { width: SCREEN_WIDTH } = Dimensions.get('window');
// import { User, GlobalSettings } from '@/shared/types';
// import { useUser } from '@/constants/UserContext';
// import ImageRegenerationModal from '@/components/ImageRegenerationModal';
// import { CharacterImage } from '@/shared/types';
// import CharacterImageGallerySidebar from '@/components/CharacterImageGallerySidebar';

// interface UserContextProps {
//   user: User | null;
//   setUser: React.Dispatch<React.SetStateAction<User | null>>;
//   updateSettings: (settings: Partial<GlobalSettings>) => Promise<void>;
//   loading: boolean;
//   updateAvatar: (uri: string) => Promise<void>;
// }

// const HEADER_HEIGHT = 90;

// // Updated tabs - removed settings and import tabs
// const TABS = [
//   { id: 'main', title: '主页', icon: 'home-outline' },
// ];

// type ImageGenerationStatus = 'idle' | 'pending' | 'success' | 'error';

// export default function CradlePage() {
//   const router = useRouter();
//   const insets = useSafeAreaInsets();
//   const { user } = useUser(); // Access the user context properly
  
//   const { 
//     getCradleCharacters, 
//     getCradleSettings,
//     updateCradleSettings,
//     updateCradleCharacter,
//     deleteCradleCharacter,
//     generateCharacterFromCradle,
//     updateCharacter,
//     characters // Add characters to the destructured values from useCharacters
//   } = useCharacters();

//   // States for data with proper typing
//   const [cradleCharacters, setCradleCharacters] = useState<CradleCharacter[]>([]);
//   const [selectedCharacter, setSelectedCharacter] = useState<CradleCharacter | null>(null);
//   const [editingCharacter, setEditingCharacter] = useState<CradleCharacter | null>(null);
//   const [refreshing, setRefreshing] = useState(false);
//   const cradleSettings = getCradleSettings();
//   const characterCarouselRef = useRef(null);
  
//   // State for tabs
//   const [activeTab, setActiveTab] = useState('main');
//   const [showFeedModal, setShowFeedModal] = useState(false);
//   const [showImportModal, setShowImportModal] = useState(false);
  
//   // State for notifications
//   const [notificationVisible, setNotificationVisible] = useState(false);
//   const [notification, setNotification] = useState({ title: '', message: '' });

//   const [showEditDialog, setShowEditDialog] = useState(false); // 添加显示编辑对话框状态

//   // Add new state for image regeneration and gallery
//   const [showImageModal, setShowImageModal] = useState(false);
//   const [characterImages, setCharacterImages] = useState<CharacterImage[]>([]);
//   const [isLoadingImages, setIsLoadingImages] = useState(false);

//   // Add state for gallery sidebar
//   const [showGallerySidebar, setShowGallerySidebar] = useState(false);

//   // Add new state variables for full image view
//   const [showFullImage, setShowFullImage] = useState(false);
//   const [fullImageUri, setFullImageUri] = useState<string | null>(null);

//   // Add new state for tracking image refreshes
//   const [lastImageRefresh, setLastImageRefresh] = useState(Date.now());
//   const [autoRefreshTimer, setAutoRefreshTimer] = useState<NodeJS.Timeout | null>(null);

//   // Load characters when component mounts or refreshes
//   useEffect(() => {
//     loadCradleCharacters();
    
//     // Setup periodic image status check
//     const checkInterval = setInterval(() => {
//       checkCharacterImagesStatus();
//     }, 30000); // Check every 30 seconds
    
//     return () => clearInterval(checkInterval);
//   }, []);

//   // Add this effect to load character images when a character is selected
//   useEffect(() => {
//     if (selectedCharacter) {
//       loadCharacterImages(selectedCharacter.id);
//     }
//   }, [selectedCharacter]);

//   // Load cradle characters from context
//   const loadCradleCharacters = useCallback(() => {
//     const characters = getCradleCharacters();
//     console.log('[摇篮页面] 加载了', characters.length, '个摇篮角色');
    
//     // Log character statuses to help debug
//     if (characters.length > 0) {
//       characters.forEach(char => {
//         console.log(`[摇篮页面] 角色 "${char.name}" (${char.id}) - 状态: ${char.cradleStatus || '未知'}, 已生成: ${char.isCradleGenerated}`);
//       });
//     }
    
//     setCradleCharacters(characters);
    
//     // Keep selected character if exists, otherwise select the first one
//     if (selectedCharacter) {
//       const stillExists = characters.find(c => c.id === selectedCharacter.id);
//       if (!stillExists && characters.length > 0) {
//         setSelectedCharacter(characters[0]);
//       } else if (!stillExists) {
//         setSelectedCharacter(null);
//       } else {
//         // Update selected character with latest data
//         const updatedSelectedChar = characters.find(c => c.id === selectedCharacter.id);
//         setSelectedCharacter(updatedSelectedChar || null);
//       }
//     } else if (characters.length > 0) {
//       setSelectedCharacter(characters[0]);
//     }
//   }, [selectedCharacter, getCradleCharacters]);

//   // Handle refresh - check character generation status and image generation status
//   const handleRefresh = useCallback(async () => {
//     try {
//       if (refreshing) return; // Prevent multiple refreshes
      
//       setRefreshing(true);
      
//       // Load latest character data
//       loadCradleCharacters();
      
//       // Clear the checkedTaskIds to allow fresh checks after manual refresh
//       checkedTaskIds.current.clear();
      
//       // Only check images that are ACTUALLY pending (no URL yet) AND have a task ID
//       if (selectedCharacter?.imageHistory) {
//         const actuallyPendingImages = selectedCharacter.imageHistory.filter(
//           img => img.generationStatus === 'pending' && 
//                 img.generationTaskId && 
//                 !img.url
//         );
        
//         if (actuallyPendingImages.length > 0) {
//           console.log(`[摇篮页面] 刷新: 检查 ${actuallyPendingImages.length} 个真正待处理的图像`);
          
//           // Check each image individually
//           for (const pendingImage of actuallyPendingImages) {
//             await checkImageThumbnailGenerationStatus(selectedCharacter.id, pendingImage);
//           }
//         } else {
//           console.log(`[摇篮页面] 刷新: 没有待处理的图像需要检查`);
//         }
//       }
//     } catch (error) {
//       console.error('[摇篮页面] 刷新失败:', error);
//     } finally {
//       setRefreshing(false);
//     }
//   }, [selectedCharacter, cradleCharacters]);
  
//   // Enhanced function to check image generation status for all characters
//   const checkCharacterImagesStatus = async () => {
//     // Check for pending image generations in character history
//     let updatedAnyImages = false;
    
//     for (const character of cradleCharacters) {
//       if (character.imageHistory) {
//         const pendingImages = character.imageHistory.filter(
//           img => img.generationStatus === 'pending' && img.generationTaskId
//         );
        
//         // Only check status for images that have a valid task ID and are still pending
//         for (const image of pendingImages) {
//           const wasUpdated = await checkImageThumbnailGenerationStatus(character.id, image);
//           if (wasUpdated) updatedAnyImages = true;
//         }
//       }
      
//       // Also check for character background image generation
//       if (character.imageGenerationTaskId && 
//           character.imageGenerationStatus === 'pending') {
//         const wasUpdated = await checkImageGenerationStatus(character);
//         if (wasUpdated) updatedAnyImages = true;
//       }
//     }
    
//     // Only refresh UI if we actually updated something
//     if (updatedAnyImages) {
//       setLastImageRefresh(Date.now());
//     }
//   };

//   // Enhanced function to handle image regeneration success with immediate local saving
//   const handleImageRegenerationSuccess = async (newImage: CharacterImage) => {
//     if (!selectedCharacter) return;
    
//     try {
//       console.log('[摇篮页面] 处理新图像:', {
//         id: newImage.id,
//         status: newImage.generationStatus,
//         isTaskPending: !!newImage.generationTaskId,
//         url: newImage.url ? newImage.url.substring(0, 50) + '...' : 'none',
//         localUri: newImage.localUri ? newImage.localUri.substring(0, 50) + '...' : 'none',
//       });
      
//       // If this is a successful image with URL but no local URI, download it first (if it's not already a local file)
//       if (newImage.generationStatus === 'success' && newImage.url && 
//           (!newImage.localUri || newImage.localUri.startsWith('http'))) {
        
//         // Check if the URL is not a local file path
//         const isRemoteUrl = newImage.url.startsWith('http');
        
//         if (isRemoteUrl) {
//           try {
//             console.log('[摇篮页面] 下载图像到本地存储:', newImage.url);
//             const localUri = await downloadAndSaveImage(
//               newImage.url,
//               selectedCharacter.id,
//               'gallery'
//             );
            
//             if (localUri) {
//               console.log('[摇篮页面] 图像已保存到本地:', localUri);
//               newImage = {
//                 ...newImage,
//                 localUri
//               };
//             } else {
//               console.warn('[摇篮页面] 无法下载图像, 将使用远程URL');
//             }
//           } catch (downloadError) {
//             console.error('[摇篮页面] 下载图像失败:', downloadError);
//             // Continue with remote URL if download fails
//           }
//         } else {
//           // This is already a local file, use it directly
//           console.log('[摇篮页面] 图像已是本地文件，无需下载:', newImage.url);
//           newImage = {
//             ...newImage,
//             localUri: newImage.url
//           };
//         }
//       }
      
//       // If this was manually uploaded, handle it directly
//       if (newImage.url && !newImage.generationTaskId) {
//         // Add the new image to the character's image history
//         const updatedImageHistory = [
//           ...(selectedCharacter.imageHistory || []),
//           newImage
//         ] as CharacterImage[];
        
//         // Check if should set as avatar
//         const updatedCharacter: CradleCharacter = {
//           ...selectedCharacter,
//           imageHistory: updatedImageHistory,
//           // If setAsAvatar is true, update the character's avatar
//           ...(newImage.setAsAvatar && {
//             avatar: newImage.localUri || newImage.url
//           }),
//           // If setAsBackground is true, update the background image
//           ...(newImage.setAsBackground && {
//             backgroundImage: newImage.localUri || newImage.url,
//             localBackgroundImage: newImage.localUri
//           })
//         };
        
//         // Save the updated character
//         await updateCradleCharacter(updatedCharacter);
        
//         // Update the selected character in state
//         setSelectedCharacter(updatedCharacter);
        
//         // Update the gallery
//         setCharacterImages(updatedImageHistory);
        
//       } else {
//         // This is a pending generation image
        
//         // First, check if this image already exists in the history
//         const imageExists = selectedCharacter.imageHistory?.some(img => img.id === newImage.id);
        
//         // If it doesn't exist, add it to the history
//         if (!imageExists) {
//           console.log('[摇篮页面] 添加新的待处理图像到历史记录');
          
//           // Make sure we cast the status as proper enum type
//           const imageWithProperStatus: CharacterImage = {
//             ...newImage,
//             generationStatus: newImage.generationStatus as ImageGenerationStatus 
//           };
          
//           const updatedImageHistory = [
//             ...(selectedCharacter.imageHistory || []),
//             imageWithProperStatus
//           ] as CharacterImage[];
          
//           // Update the character with the new image
//           const updatedCharacter: CradleCharacter = {
//             ...selectedCharacter,
//             imageHistory: updatedImageHistory
//           };
          
//           // Save the updated character
//           await updateCradleCharacter(updatedCharacter);
          
//           // Update the selected character in state
//           setSelectedCharacter(updatedCharacter);
          
//           // Update the gallery
//           setCharacterImages(updatedImageHistory);
          
//           // Show notification that generation has started
//           showNotification('生成开始', '新图像生成任务已添加到队列');
          
//           // Run the check immediately to start polling
//           checkImageThumbnailGenerationStatus(selectedCharacter.id, imageWithProperStatus);
//         } 
//         // If the image exists but now has a URL (completed), update it
//         else if (imageExists && newImage.url && newImage.generationStatus === 'success') {
//           console.log('[摇篮页面] 更新已完成的图像:', newImage.id);
          
//           // Download image to local storage only if it's a remote URL and not already local
//           if (newImage.url && (!newImage.localUri || newImage.localUri.startsWith('http'))) {
//             // Check if URL is remote
//             const isRemoteUrl = newImage.url.startsWith('http');
            
//             if (isRemoteUrl) {
//               try {
//                 console.log('[摇篮页面] 下载已完成图像到本地存储');
//                 const localUri = await downloadAndSaveImage(
//                   newImage.url,
//                   selectedCharacter.id,
//                   'gallery'
//                 );
                
//                 if (localUri) {
//                   console.log('[摇篮页面] 图像已保存到本地:', localUri);
//                   newImage = {
//                     ...newImage,
//                     localUri
//                   };
//                 }
//               } catch (error) {
//                 console.error('[摇篮页面] 下载已完成图像失败:', error);
//                 // Continue with remote URL if download fails
//               }
//             } else {
//               // It's already a local file, use it directly as localUri
//               newImage = {
//                 ...newImage,
//                 localUri: newImage.url
//               };
//               console.log('[摇篮页面] 使用本地文件作为localUri:', newImage.localUri);
//             }
//           }
          
//           // Ensure we have a properly typed CharacterImage object
//           const typedNewImage: CharacterImage = {
//             ...newImage,
//             generationStatus: 'success' as ImageGenerationStatus
//           };
          
//           const updatedImageHistory = (selectedCharacter.imageHistory || []).map(img => 
//             img.id === newImage.id ? typedNewImage : img
//           ) as CharacterImage[];
          
//           // Update the character with the new image
//           const updatedCharacter: CradleCharacter = {
//             ...selectedCharacter,
//             imageHistory: updatedImageHistory,
//             // If this is meant to be the background, set it
//             ...(newImage.setAsBackground && {
//               backgroundImage: newImage.localUri || newImage.url,
//               localBackgroundImage: newImage.localUri
//             })
//           };
          
//           // Save the updated character
//           await updateCradleCharacter(updatedCharacter);
          
//           // Update the selected character in state
//           setSelectedCharacter(updatedCharacter);
          
//           // Update the gallery
//           setCharacterImages(updatedImageHistory);
          
//           // Show success notification
//           showNotification('图像已生成', '新图像已成功添加到角色图库');
//         }
//       }
      
//       // Trigger a refresh so the gallery updates
//       setLastImageRefresh(Date.now());
//     } catch (error) {
//       console.error('[摇篮页面] 保存新图像失败:', error);
//       showNotification('保存失败', '无法保存新生成的图像');
//     }
//   };

//   // Enhanced function to check image thumbnail generation status to download images immediately
//   const checkImageThumbnailGenerationStatus = async (characterId: string, image: CharacterImage): Promise<boolean> => {
//     if (!image.generationTaskId) return false;
    
//     const taskId = image.generationTaskId;
    
//     // IMPORTANT: Skip if we already have the image and it's marked as complete
//     if (image.url && image.localUri && image.generationStatus === 'success') {
//       console.log(`[摇篮页面] 图像已完成，跳过检查:`, image.id);
//       return false;
//     }
    
//     // Add taskId tracking to prevent infinite loops - if we've checked this task too many times, skip it
//     if (checkedTaskIds.current.has(taskId)) {
//       console.log(`[摇篮页面] 任务 ${taskId} 已检查过多次，跳过`);
      
//       // Since we're skipping, let's mark this image as complete to prevent future checks
//       try {
//         const character = characters.find(c => c.id === characterId);
//         if (character?.imageHistory) {
//           const updatedHistory = character.imageHistory.map(img => 
//             img.id === image.id && img.generationTaskId === taskId
//               ? { 
//                   ...img, 
//                   generationStatus: image.url ? 'success' : 'error' as ImageGenerationStatus,
//                   generationTaskId: undefined, // Clear task ID to prevent future checks
//                   generationError: !image.url ? '多次检查后未找到图像URL' : undefined
//                 } 
//               : img
//           );
          
//           // Only update if changes were made
//           if (JSON.stringify(updatedHistory) !== JSON.stringify(character.imageHistory)) {
//             const updatedCharacter = {
//               ...character,
//               imageHistory: updatedHistory,
//               inCradleSystem: character.inCradleSystem === undefined ? true : character.inCradleSystem
//             };
            
//             await updateCradleCharacter(updatedCharacter as CradleCharacter);
            
//             // Update UI if needed
//             if (selectedCharacter?.id === character.id) {
//               setSelectedCharacter(updatedCharacter as CradleCharacter);
//               setCharacterImages(updatedHistory);
//               setLastImageRefresh(Date.now());
//             }
            
//             return true; // We did perform an update
//           }
//         }
//       } catch (error) {
//         console.error('[摇篮页面] 更新循环检查图像状态失败:', error);
//       }
      
//       return false;
//     }
    
//     // Add to checked list after a certain number of attempts
//     // We'll still check a few times before giving up
//     const CHECK_THRESHOLD = 3;
//     const checkCount = Array.from(checkedTaskIds.current).filter(id => id === taskId).length;
//     if (checkCount >= CHECK_THRESHOLD) {
//       checkedTaskIds.current.add(taskId);
//     }
    
//     // Check if this image already has a URL but is still marked as pending
//     if (image.url) {
//       console.log(`[摇篮页面] 图像已有URL但状态仍为pending，修正状态:`, image.id);
      
//       // Update the character to mark this image as completed
//       try {
//         const character = characters.find(c => c.id === characterId);
//         if (character?.imageHistory) {
//           const updatedHistory = character.imageHistory.map(img => 
//             img.id === image.id
//               ? { 
//                   ...img, 
//                   url: image.url || '',
//                   generationStatus: 'success' as ImageGenerationStatus,
//                   generationTaskId: undefined // Clear task ID
//                 } 
//               : img
//           );
          
//           const updatedCharacter = {
//             ...character,
//             imageHistory: updatedHistory,
//             inCradleSystem: character.inCradleSystem === undefined ? true : character.inCradleSystem
//           };
          
//           await updateCradleCharacter(updatedCharacter as CradleCharacter);
          
//           if (selectedCharacter?.id === character.id) {
//             setSelectedCharacter(updatedCharacter as CradleCharacter);
//             setCharacterImages(updatedHistory);
//             setLastImageRefresh(Date.now());
//           }
          
//           return true;
//         }
//       } catch (error) {
//         console.error('[摇篮页面] 更新现有图像URL失败:', error);
//       }
      
//       return false;
//     }
    
//     console.log(`[摇篮页面] 检查图像生成任务状态: ${taskId}`);
    
//     try {
//       // Request status from server
//       const response = await fetch(`http://152.69.219.182:5000/task_status/${taskId}`);
      
//       if (!response.ok) {
//         console.warn(`[摇篮页面] 获取任务状态失败: HTTP ${response.status}`);
//         return false;
//       }
      
//       const data = await response.json();
      
//       // If task is done and successful
//       if (data.done && data.success && data.image_url) {
//         console.log(`[摇篮页面] 图像生成成功: ${data.image_url}`);
        
//         // First check if this image is already in our collection with this URL
//         const alreadyExists = characters.some(c => 
//           c.imageHistory?.some(img => 
//             img.url === data.image_url && img.generationStatus === 'success'
//           )
//         );
        
//         if (alreadyExists) {
//           console.log(`[摇篮页面] 图像已存在于集合中，跳过下载:`, data.image_url);
          
//           // Just update the status to success and clear task ID
//           try {
//             const character = characters.find(c => c.id === characterId);
//             if (character?.imageHistory) {
//               const updatedHistory = character.imageHistory.map(img => 
//                 img.id === image.id
//                   ? { 
//                       ...img, 
//                       url: data.image_url,
//                       generationStatus: 'success' as ImageGenerationStatus,
//                       generationTaskId: undefined
//                     } 
//                   : img
//               );
              
//               const updatedCharacter = {
//                 ...character,
//                 imageHistory: updatedHistory,
//                 inCradleSystem: character.inCradleSystem === undefined ? true : character.inCradleSystem
//               };
              
//               await updateCradleCharacter(updatedCharacter as CradleCharacter);
              
//               if (selectedCharacter?.id === character.id) {
//                 setSelectedCharacter(updatedCharacter as CradleCharacter);
//                 setCharacterImages(updatedHistory);
//                 setLastImageRefresh(Date.now());
//               }
              
//               return true;
//             }
//           } catch (error) {
//             console.error('[摇篮页面] 更新现有图像URL失败:', error);
//           }
          
//           return false;
//         }
        
//         // Check if we already have a local copy of this image
//         const existingCharacter = characters.find(c => c.id === characterId);
//         let existingImage = existingCharacter?.imageHistory?.find(
//           img => (img.generationTaskId === taskId || img.url === data.image_url) && img.localUri
//         );
        
//         let localImageUri = existingImage?.localUri;
        
//         // Only download if we don't have a local copy already
//         if (!localImageUri) {
//           try {
//             console.log(`[摇篮页面] 开始下载并保存图像到本地: ${data.image_url}`);
//             localImageUri = (await downloadAndSaveImage(
//               data.image_url,
//               characterId,
//               'gallery'
//             )) ?? undefined;
//             console.log(`[摇篮页面] 下载图像成功, 本地路径:`, localImageUri);
//           } catch (downloadError) {
//             console.error(`[摇篮页面] 下载图像失败:`, downloadError);
//             // Even if download fails, we can still update with the remote URL
//             localImageUri = undefined;
//           }
//         } else {
//           console.log(`[摇篮页面] 使用现有本地图像:`, localImageUri);
//         }
        
//         // Find the character to update
//         const character = characters.find(c => c.id === characterId);
//         if (!character || !character.imageHistory) {
//           console.error(`[摇篮页面] 无法找到角色 ${characterId} 或其图像历史`);
//           return false;
//         }
        
//         // Check if this image was already updated
//         const imageIndex = character.imageHistory.findIndex(img => img.id === image.id);
//         if (imageIndex === -1) {
//           console.log(`[摇篮页面] 无法找到要更新的图像，可能已被删除`);
//           return false;
//         }
        
//         const currentImage = character.imageHistory[imageIndex];
//         if (currentImage.generationStatus === 'success' && currentImage.url === data.image_url) {
//           console.log(`[摇篮页面] 图像已经更新过，跳过更新`);
//           return false;
//         }
        
//         // Create updated image object
//         const updatedImage: CharacterImage = {
//           ...image,
//           url: data.image_url,
//           localUri: localImageUri || data.image_url,
//           generationStatus: 'success' as ImageGenerationStatus,
//           generationTaskId: undefined // Clear task ID
//         };
        
//         // Update the image in storage
//         handleImageRegenerationSuccess(updatedImage);
        
//         // Mark task as fully processed to prevent future checks
//         checkedTaskIds.current.add(taskId);
        
//         return true;
//       } else if (data.done && !data.success) {
//         // Task failed
//         console.error(`[摇篮页面] 图像生成失败: ${data.error || '未知错误'}`);
        
//         // Find the character to update
//         const character = cradleCharacters.find(c => c.id === characterId);
//         if (!character || !character.imageHistory) {
//           console.error(`[摇篮页面] 无法找到角色 ${characterId} 或其图像历史`);
//           return false;
//         }
        
//         // Check if image already marked as error
//         const imageToUpdate = character.imageHistory.find(img => img.id === image.id);
//         if (!imageToUpdate || imageToUpdate.generationStatus === 'error') {
//           return false;
//         }
        
//         // Update the image in the character's imageHistory
//         const updatedImageHistory = character.imageHistory.map(img => 
//           img.id === image.id ? 
//           { 
//             ...img, 
//             generationStatus: 'error' as ImageGenerationStatus,
//             generationError: data.error || '未知错误',
//             generationTaskId: undefined // Clear task ID
//           } : img
//         );
        
//         // Update character with new image history
//         const updatedCharacter = { 
//           ...character, 
//           imageHistory: updatedImageHistory as CharacterImage[],
//           inCradleSystem: character.inCradleSystem === undefined ? true : character.inCradleSystem
//         };
        
//         await updateCradleCharacter(updatedCharacter as CradleCharacter);
        
//         // Update UI
//         if (selectedCharacter?.id === characterId) {
//           setSelectedCharacter(updatedCharacter as CradleCharacter);
//           setCharacterImages(updatedImageHistory as CharacterImage[]);
//           setLastImageRefresh(Date.now());
//         }
        
//         // Show failure notification
//         showNotification('图像生成失败', `"${character.name}"的图像生成失败：${data.error || '未知错误'}`);
        
//         // Mark task as fully processed to prevent future checks
//         checkedTaskIds.current.add(taskId);
        
//         return true;
//       }
      
//       // If task is still processing, we'll check again next interval
//       return false;
//     } catch (error) {
//       console.error(`[摇篮页面] 检查图像生成状态失败:`, error);
//       return false;
//     }
//   };

//   // Check the status of a single character's image generation task
//   const checkImageGenerationStatus = async (character: CradleCharacter): Promise<boolean> => {
//     if (!character.imageGenerationTaskId) return false;
    
//     const MAX_RETRIES = 3;
//     let retries = 0;
    
//     while (retries < MAX_RETRIES) {
//       try {
//         console.log(`[摇篮页面] 检查角色 "${character.name}" 的图像生成任务状态: ${character.imageGenerationTaskId}`);
        
//         // Request status from server
//         const response = await fetch(`http://152.69.219.182:5000/task_status/${character.imageGenerationTaskId}`);
//         if (!response.ok) {
//           console.warn(`[摇篮页面] 获取任务状态失败: HTTP ${response.status}`);
//           retries++;
          
//           // Add exponential backoff between retries
//           if (retries < MAX_RETRIES) {
//             const backoffTime = Math.pow(2, retries) * 1000;
//             console.log(`[摇篮页面] 将在 ${backoffTime/1000} 秒后重试...`);
//             await new Promise(resolve => setTimeout(resolve, backoffTime));
//             continue;
//           }
          
//           // If we've exhausted retries, return without updating
//           console.error(`[摇篮页面] 达到最大重试次数 (${MAX_RETRIES})，放弃检查任务状态`);
//           return false;
//         }
        
//         const data = await response.json();
        
//         // If task is done and successful
//         if (data.done && data.success && data.image_url) {
//           console.log(`[摇篮页面] 图像生成成功: ${data.image_url}`);
          
//           // Check if this character already has this image to prevent duplicate downloads
//           const hasImageAlready = character.backgroundImage === data.image_url || 
//                                  character.localBackgroundImage === data.image_url;
                                 
//           if (hasImageAlready) {
//             console.log(`[摇篮页面] 角色已拥有该图像，跳过下载`);
            
//             // Still update status to mark task as completed
//             let updatedCharacter = { ...character };
//             updatedCharacter.imageGenerationStatus = 'success';
//             updatedCharacter.imageGenerationTaskId = null;
            
//             await updateCradleCharacter(updatedCharacter);
//             return true;
//           }
          
//           // Download the image to local storage only if needed
//           console.log(`[摇篮页面] 正在下载背景图片到本地: ${data.image_url}`);
//           const localImageUri = await downloadAndSaveImage(
//             data.image_url,
//             character.id,
//             'background'
//           );
          
//           if (localImageUri) {
//             console.log(`[摇篮页面] 背景图片已保存到本地: ${localImageUri}`);
//           } else {
//             console.warn(`[摇篮页面] 无法保存背景图片到本地`);
//           }
          
//           // Update character with image information
//           let updatedCharacter = { ...character };
//           updatedCharacter.localBackgroundImage = localImageUri;
//           updatedCharacter.backgroundImage = localImageUri || data.image_url;
//           updatedCharacter.imageGenerationStatus = 'success';
          
//           // Remove the task ID to prevent further checking
//           updatedCharacter.imageGenerationTaskId = null;
          
//           // Check if the character has generation data (from create_char.tsx)
//           if (character.generationData?.appearanceTags) {
//             // If there's no imageHistory array, create one
//             if (!updatedCharacter.imageHistory) {
//               updatedCharacter.imageHistory = [];
//             }
            
//             // Check if this image is already in the history to prevent duplication
//             const imageExists = updatedCharacter.imageHistory.some(
//               img => img.url === data.image_url
//             );
            
//             if (!imageExists) {
//               // Add the generated image to the character's image history for gallery
//               const newImage: CharacterImage = {
//                 id: `img_${Date.now()}`,
//                 url: data.image_url,
//                 localUri: localImageUri ?? undefined,
//                 characterId: character.id,
//                 createdAt: Date.now(),
//                 isFavorite: false,
//                 isDefaultBackground: true,
//                 generationStatus: 'success',
//                 // Store generation config for potential regeneration
//                 generationConfig: {
//                   positiveTags: character.generationData.appearanceTags.positive || [],
//                   negativeTags: character.generationData.appearanceTags.negative || [],
//                   artistPrompt: character.generationData.appearanceTags.artistPrompt || null,
//                   customPrompt: '',
//                   useCustomPrompt: false,
//                   characterTags: character.generationData.appearanceTags.characterTags || [],
//                 }
//               };
              
//               updatedCharacter.imageHistory.push(newImage);
//             }
//           }
          
//           // Save updated character
//           await updateCradleCharacter(updatedCharacter);
//           showNotification('图像生成成功', `角色 ${character.name} 的图像已成功生成！`);
          
//           // If this is the currently selected character, update it
//           if (selectedCharacter?.id === character.id) {
//             setSelectedCharacter(updatedCharacter);
            
//             // Also update the image gallery if it exists
//             if (updatedCharacter.imageHistory) {
//               setCharacterImages(updatedCharacter.imageHistory);
//               setLastImageRefresh(Date.now());
//             }
//           }
          
//           // Force refresh character cards
//           refreshCharacterCards();
//           return true;
//         } 
//         // If task is done but failed
//         else if (data.done && !data.success) {
//           console.error(`[摇篮页面] 图像生成失败: ${data.error || '未知错误'}`);
          
//           // Prevent duplicate updates
//           if (character.imageGenerationStatus === 'error') {
//             console.log(`[摇篮页面] 错误状态已经设置，跳过更新`);
//             return false;
//           }
          
//           let updatedCharacter = { ...character };
//           updatedCharacter.imageGenerationStatus = 'error';
//           updatedCharacter.imageGenerationError = data.error || '未知错误';
//           // Clear the task ID to prevent further checks
//           updatedCharacter.imageGenerationTaskId = null;
          
//           // Save updated character
//           await updateCradleCharacter(updatedCharacter);
//           showNotification('图像生成失败', `角色 ${character.name} 的图像生成失败：${data.error || '未知错误'}`);
          
//           // If this is the currently selected character, update it
//           if (selectedCharacter?.id === character.id) {
//             setSelectedCharacter(updatedCharacter);
//           }
//           return true;
//         }
//         // If task is still in queue
//         else if (data.queue_info) {
//           // Update queue status information
//           const queuePosition = data.queue_info.position;
//           const estimatedWait = data.queue_info.estimated_wait || 0;
          
//           console.log(`[摇篮页面] 图像生成任务在队列中，位置: ${queuePosition}，预计等待时间: ${Math.round(estimatedWait / 60)} 分钟`);
//           return false; // No update needed
//         }
        
//         // If we get here, we've successfully processed the response
//         break;
        
//       } catch (error) {
//         console.error(`[摇篮页面] 检查图像生成状态失败:`, error);
//         retries++;
        
//         if (retries < MAX_RETRIES) {
//           const backoffTime = Math.pow(2, retries) * 1000;
//           console.log(`[摇篮页面] 将在 ${backoffTime/1000} 秒后重试...`);
//           await new Promise(resolve => setTimeout(resolve, backoffTime));
//         } else {
//           console.error(`[摇篮页面] 达到最大重试次数 (${MAX_RETRIES})，放弃检查任务状态`);
//         }
//       }
//     }
    
//     return false; // No update by default
//   };

//   // Function to force refresh the character cards when needed
//   const refreshCharacterCards = () => {
//     // Re-fetch characters to ensure we have the latest data
//     loadCradleCharacters();
//   };
  
//   // Show notification function
//   const showNotification = (title: string, message: string) => {
//     setNotification({ title, message });
//     setNotificationVisible(true);
//     // Auto-hide after 4 seconds
//     setTimeout(() => {
//       setNotificationVisible(false);
//     }, 4000);
//   };
  
//   // Handle character deletion with confirmation
//   const handleDeleteCharacter = useCallback((character: CradleCharacter) => {
//     confirmDeleteCradleCharacter(character, deleteCradleCharacter, () => {
//       // After successful deletion:
//       showNotification('删除成功', `角色 "${character.name}" 已成功删除`);
//       // Refresh the character list
//       loadCradleCharacters();
//     });
//   }, [deleteCradleCharacter]);

//   // Add this function to handle character generation
//   const handleGenerateCharacter = async (character: CradleCharacter) => {
//     try {
//       setRefreshing(true);
//       showNotification('开始生成', `正在从摇篮生成角色 "${character.name}"...`);
      
//       // Expand logging to help with debugging
//       console.log('[摇篮页面] 开始生成角色，详细信息:', {
//         id: character.id,
//         name: character.name,
//         inCradleSystem: character.inCradleSystem,
//         isCradleGenerated: character.isCradleGenerated,
//         createdAt: new Date(character.createdAt).toISOString(),
//         hasAvatar: !!character.avatar,
//         hasBackgroundImage: !!character.backgroundImage,
//         hasLocalBackgroundImage: !!character.localBackgroundImage,
//         feedCount: character.feedHistory?.length || 0
//       });
      
//       // Check if character is already generated
//       if (character.isCradleGenerated && character.generatedCharacterId) {
//         console.log('[摇篮页面] 角色已经生成过，刷新数据:', character.generatedCharacterId);
//         showNotification('角色已生成', `角色 "${character.name}" 已经生成过`);
        
//         // Refresh character list to show latest data
//         loadCradleCharacters();
//         return;
//       }
      
//       // Call generation function with full character object
//       const newCharacter = await generateCharacterFromCradle(character);
      
//       console.log('[摇篮页面] 角色生成成功，ID:', newCharacter.id);
//       console.log('[摇篮页面] 生成的角色信息:', {
//         name: newCharacter.name,
//         hasAvatar: !!newCharacter.avatar,
//         hasBackgroundImage: !!newCharacter.backgroundImage,
//         hasJsonData: !!newCharacter.jsonData,
//         jsonDataLength: newCharacter.jsonData?.length || 0
//       });
      
//       // Refresh character list
//       loadCradleCharacters();
//       showNotification('生成成功', `角色 "${newCharacter.name}" 已成功生成！`);
      
//     } catch (error) {
//       console.error('[摇篮页面] 生成角色失败:', error);
//       showNotification('生成失败', 
//         `角色 "${character.name}" 生成失败: ${error instanceof Error ? error.message : String(error)}`);
//     } finally {
//       setRefreshing(false);
//     }
//   };

//   // Improved function to load character images that checks pending images status
//   const loadCharacterImages = async (characterId: string) => {
//     setIsLoadingImages(true);
//     try {
//       console.log(`[摇篮页面] 加载角色 ${characterId} 的图像`);
      
//       // Check if the character has any images in its imageHistory array
//       if (selectedCharacter?.imageHistory && selectedCharacter.imageHistory.length > 0) {
//         console.log(`[摇篮页面] 找到 ${selectedCharacter.imageHistory.length} 张图像`);
        
//         // Clear checkedTaskIds when loading new images
//         checkedTaskIds.current.clear();
        
//         // Clean up: correct any images with URLs but still marked as pending
//         const needsCorrection = selectedCharacter.imageHistory.some(
//           img => img.generationStatus === 'pending' && (img.url || img.localUri)
//         );
        
//         if (needsCorrection) {
//           console.log(`[摇篮页面] 发现需要修正状态的图像`);
          
//           // Create corrected image history
//           const correctedHistory = selectedCharacter.imageHistory.map(img => 
//             (img.generationStatus === 'pending' && (img.url || img.localUri))
//               ? { ...img, generationStatus: 'success' as ImageGenerationStatus, generationTaskId: undefined }
//               : img
//           );
          
//           // Update the character with corrected history
//           const updatedCharacter = {
//             ...selectedCharacter,
//             imageHistory: correctedHistory,
//             inCradleSystem: selectedCharacter.inCradleSystem === undefined ? true : selectedCharacter.inCradleSystem
//           };
          
//           await updateCradleCharacter(updatedCharacter as CradleCharacter);
          
//           // Update local state
//           setSelectedCharacter(updatedCharacter as CradleCharacter);
//           setCharacterImages(correctedHistory);
//           setLastImageRefresh(Date.now());
//         } 
//         else {
//           // No correction needed, just set the images
//           setCharacterImages(selectedCharacter.imageHistory);
//         }
        
//         // Check for pending images - without the URL check to find truly pending images
//         const hasPendingImages = selectedCharacter.imageHistory.some(
//           img => img.generationStatus === 'pending' && img.generationTaskId && !img.url
//         );
        
//         // If we have pending images, set up automatic refresh
//         if (hasPendingImages && !autoRefreshTimer) {
//           console.log(`[摇篮页面] 检测到待处理的图像，启动自动刷新`);
//           const timer = setInterval(() => {
//             // Only check if component is still mounted
//             if (!autoRefreshTimer) return;
//             checkCharacterImagesStatus();
//           }, 10000); // Check every 10 seconds
          
//           setAutoRefreshTimer(timer as unknown as NodeJS.Timeout);
//         } else if (!hasPendingImages && autoRefreshTimer) {
//           // If no more pending images, clear the auto-refresh
//           console.log(`[摇篮页面] 没有待处理的图像，停止自动刷新`);
//           clearInterval(autoRefreshTimer);
//           setAutoRefreshTimer(null);
//         }
//       } else {
//         // No images found
//         console.log(`[摇篮页面] 未找到图像`);
//         setCharacterImages([]);
        
//         // Clear any existing timer
//         if (autoRefreshTimer) {
//           clearInterval(autoRefreshTimer);
//           setAutoRefreshTimer(null);
//         }
//       }
//     } catch (error) {
//       console.error('[摇篮页面] 加载角色图像失败:', error);
//       showNotification('加载失败', '无法加载角色图像');
//     } finally {
//       setIsLoadingImages(false);
//     }
//   };

//   // Function to handle toggling favorite status on an image
//   const handleToggleFavorite = async (imageId: string) => {
//     if (!selectedCharacter || !selectedCharacter.imageHistory) return;
    
//     try {
//       // Find and update the image
//       const updatedImageHistory = selectedCharacter.imageHistory.map(img => 
//         img.id === imageId ? { ...img, isFavorite: !img.isFavorite } : img
//       );
      
//       // Update the character with the updated image history
//       const updatedCharacter = {
//         ...selectedCharacter,
//         imageHistory: updatedImageHistory
//       };
      
//       // Save the updated character
//       await updateCradleCharacter(updatedCharacter);
      
//       // Update the selected character in state
//       setSelectedCharacter(updatedCharacter);
      
//       // Update the gallery
//       setCharacterImages(updatedImageHistory);
//     } catch (error) {
//       console.error('[摇篮页面] 更新图像喜爱状态失败:', error);
//       showNotification('更新失败', '无法更新图像状态');
//     }
//   };

//   // Function to handle setting an image as the background
//   const handleSetAsBackground = async (imageId: string) => {
//     if (!selectedCharacter || !selectedCharacter.imageHistory) return;
    
//     try {
//       // Find the image
//       const image = selectedCharacter.imageHistory.find(img => img.id === imageId);
      
//       if (!image) {
//         console.error('[摇篮页面] 找不到指定ID的图像:', imageId);
//         return;
//       }
      
//       // Update the character with the new background image
//       const updatedCharacter = {
//         ...selectedCharacter,
//         backgroundImage: image.localUri || image.url,
//         // Fix: Avoid setting null directly by using undefined instead when null
//         localBackgroundImage: image.localUri || undefined,
//         // Ensure inCradleSystem is always a boolean
//         inCradleSystem: selectedCharacter.inCradleSystem === undefined ? true : selectedCharacter.inCradleSystem
//       };
      
//       // Save the updated character
//       await updateCradleCharacter(updatedCharacter as CradleCharacter);
      
//       // Update the selected character in state
//       setSelectedCharacter(updatedCharacter as CradleCharacter);
      
//       // Show success notification
//       showNotification('背景已更新', '已将选择的图像设置为角色背景');
//     } catch (error) {
//       console.error('[摇篮页面] 设置背景图像失败:', error);
//       showNotification('设置失败', '无法设置选择的图像为背景');
//     }
//   };

//   // Function to handle deleting an image
//   const handleDeleteImage = async (imageId: string) => {
//     if (!selectedCharacter || !selectedCharacter.imageHistory) return;
    
//     try {
//       // Filter out the deleted image
//       const updatedImageHistory = selectedCharacter.imageHistory.filter(img => img.id !== imageId);
      
//       // Update the character with the new image history
//       const updatedCharacter = {
//         ...selectedCharacter,
//         imageHistory: updatedImageHistory
//       };
      
//       // Save the updated character
//       await updateCradleCharacter(updatedCharacter);
      
//       // Update the selected character in state
//       setSelectedCharacter(updatedCharacter);
      
//       // Update the gallery
//       setCharacterImages(updatedImageHistory);
      
//       // Show success notification
//       showNotification('已删除', '图像已成功删除');
//     } catch (error) {
//       console.error('[摇篮页面] 删除图像失败:', error);
//       showNotification('删除失败', '无法删除选择的图像');
//     }
//   };

//   // Update handleSetAsAvatar to handle cropped images
// const handleSetAsAvatar = async (imageId: string) => {
//   if (!selectedCharacter || !selectedCharacter.imageHistory) return;
  
//   try {
//     const image = selectedCharacter.imageHistory.find(img => img.id === imageId);
    
//     if (!image) {
//       console.error('[摇篮页面] 找不到指定ID的图像:', imageId);
//       return;
//     }
    
//     // Update the character with the new avatar image
//     const updatedCharacter = {
//       ...selectedCharacter,
//       avatar: image.localUri || image.url,
//       avatarCrop: image.crop, // Add crop data if available
//     };
    
//     // If this character has a generated normal character, update that too
//     if (updatedCharacter.generatedCharacterId && updatedCharacter.isCradleGenerated) {
//       const normalCharacter = characters.find(c => c.id === updatedCharacter.generatedCharacterId);
      
//       if (normalCharacter) {
//         // Update the normal character with the new avatar
//         const updatedNormalCharacter = {
//           ...normalCharacter,
//           avatar: image.localUri || image.url,
//           avatarCrop: image.crop, // Add crop data if available
//         };
        
//         // Save the normal character update
//         await updateCharacter(updatedNormalCharacter);
//         console.log('[摇篮页面] 已更新关联角色的头像');
//       }
//     }
    
//     // Save the updated cradle character
//     await updateCradleCharacter(updatedCharacter);
    
//     // Update the selected character in state
//     setSelectedCharacter(updatedCharacter);
    
//     // Show success notification
//     showNotification('头像已更新', '已将选择的图像设置为角色头像');
//   } catch (error) {
//     console.error('[摇篮页面] 设置头像失败:', error);
//     showNotification('设置失败', '无法设置选择的图像为头像');
//   }
// };

//   // Render the tabs at the top of the screen (simplified)
//   const renderTabs = () => null; // Remove tabs completely

//   // Render character detail section
//   const renderCharacterDetail = () => {
//     if (!selectedCharacter) return null;
    
//     // Check if character is either fully generated or has the dialog editable flag
//     // Convert to explicit boolean using !! to prevent the empty string issue
//     const isEditable = !!(selectedCharacter.isCradleGenerated === true || 
//                        selectedCharacter.isDialogEditable === true || 
//                        (selectedCharacter.jsonData && selectedCharacter.jsonData.length > 0));
    
//     return (
//       <View style={styles.characterDetailSection}>
//         <CradleCharacterDetail
//           character={selectedCharacter}

//           onDelete={() => handleDeleteCharacter(selectedCharacter)}
//           onEdit={() => {
//             if (isEditable) {
//               // Check for jsonData availability
//               if (selectedCharacter.jsonData && selectedCharacter.jsonData.length > 0) {
//                 console.log('[摇篮页面] 角色有直接的JSON数据，长度:', selectedCharacter.jsonData.length);
//                 try {
//                   // Basic validation of JSON structure
//                   const parsedJson = JSON.parse(selectedCharacter.jsonData);
                  
//                   // Only require roleCard and worldBook as minimum requirements
//                   if (!parsedJson.roleCard || !parsedJson.worldBook) {
//                     throw new Error('JSON数据缺少必要的结构');
//                   }
                  
//                   // Use it directly
//                   setEditingCharacter(selectedCharacter);
//                   setShowEditDialog(true);
//                 } catch (error) {
//                   // Show friendly error message
//                   Alert.alert(
//                     "角色数据格式错误",
//                     "角色的JSON数据格式不正确，无法编辑。错误：" + (error instanceof Error ? error.message : String(error)),
//                     [{ text: "确定", style: "default" }]
//                   );
//                 }
//               } else if (selectedCharacter.generatedCharacterId) {
//                 // Handle generated character case (existing code)
//                 // ...existing code...
//               } else {
//                 Alert.alert(
//                   "数据不完整",
//                   "该角色缺少必要的数据，无法编辑。请尝试重新生成角色。",
//                   [{ text: "确定", style: "default" }]
//                 );
//               }
//             } else {
//               Alert.alert(
//                 "角色尚未生成",
//                 "请先完成角色培育并生成，然后才能通过对话修改角色数据。",
//                 [{ text: "了解", style: "default" }]
//               );
//             }
//           }}
//           isEditable={isEditable} // Now this will always be a boolean
//           onRegenerateImage={() => setShowImageModal(true)}
//           onShowGallery={() => setShowGallerySidebar(true)}
//         />
//       </View>
//     );
//   };

//   // Update the render character card function to show action buttons inside the card
//   const renderCharacterCard = (character: CradleCharacter) => {
//     // Check if any images are being generated
//     const hasGeneratingImage = character.imageHistory?.some(img => 
//       img.generationStatus === 'pending'
//     );
//     const isPendingBackgroundImage = character.imageGenerationStatus === 'pending';
//     const isGeneratingImage = hasGeneratingImage || isPendingBackgroundImage;
    
//     // Determine if character is manually uploaded or AI-generated
//     const isTagGenerated = character.generationData?.appearanceTags !== undefined;
    
//     const isSelected = selectedCharacter?.id === character.id;
    
//     return (
//       <View key={character.id} style={styles.characterCardWrapper}>
//         <TouchableOpacity 
//           style={[
//             styles.characterCard,
//             isSelected && styles.selectedCharacterCard
//           ]}
//           onPress={() => {
//             setSelectedCharacter(character);
//           }}
//         >
//           {/* Character image container */}
//           <View style={styles.characterImageContainer}>
//             {character.backgroundImage ? (
//               <Image
//                 source={{ uri: character.backgroundImage }}
//                 style={styles.characterImage}
//                 resizeMode="cover"
//               />
//             ) : (
//               <View style={styles.characterImagePlaceholder}>
//                 <Ionicons name="image-outline" size={24} color="#666" />
//               </View>
//             )}
            
//             {/* Image generation status indicator */}
//             {isGeneratingImage && (
//               <View style={styles.loadingIconOverlay}>
//                 <ActivityIndicator size="small" color="#fff" />
//               </View>
//             )}
            

            
//             {/* Character info overlay with gradient for better text visibility */}
//             <LinearGradient
//               colors={['transparent', 'rgba(0,0,0,0.7)']}
//               style={styles.characterCardOverlay}
//             >
//               <Text style={styles.characterCardName} numberOfLines={1}>
//                 {character.name}
//               </Text>
              
//             </LinearGradient>
            
//             {/* Action buttons overlay - positioned at bottom, only show when selected */}
//             {isSelected && (
//               <View style={styles.characterCardActionsOverlay}>
//                 <LinearGradient
//                   colors={['transparent', 'rgba(0,0,0,0.8)']}
//                   style={styles.actionsGradient}
//                 >
//                   <View style={styles.characterCardActions}>
//                     {/* Edit button */}
//                     <TouchableOpacity
//                       style={[styles.imageActionButton, styles.transparentButton]}
//                       onPress={() => {
//                         // Check if character is editable
//                         const isEditable = !!(character.isCradleGenerated === true || 
//                                               character.isDialogEditable === true || 
//                                               (character.jsonData && character.jsonData.length > 0));
                                              
//                         if (isEditable) {
//                           // Set the editing character and show edit dialog
//                           if (character.jsonData && character.jsonData.length > 0) {
//                             try {
//                               const parsedJson = JSON.parse(character.jsonData);
//                               if (!parsedJson.roleCard || !parsedJson.worldBook) {
//                                 throw new Error('JSON数据缺少必要的结构');
//                               }
//                               setEditingCharacter(character);
//                               setShowEditDialog(true);
//                             } catch (error) {
//                               Alert.alert(
//                                 "角色数据格式错误",
//                                 "角色的JSON数据格式不正确，无法编辑。错误：" + (error instanceof Error ? error.message : String(error)),
//                                 [{ text: "确定", style: "default" }]
//                               );
//                             }
//                           } else {
//                             Alert.alert(
//                               "数据不完整",
//                               "该角色缺少必要的数据，无法编辑。请尝试先完成角色培育。",
//                               [{ text: "确定", style: "default" }]
//                             );
//                           }
//                         } else {
//                           Alert.alert(
//                             "角色尚未生成",
//                             "请先完成角色培育并生成，然后才能通过对话修改角色数据。",
//                             [{ text: "了解", style: "default" }]
//                           );
//                         }
//                       }}
//                     >
//                       <Ionicons name="brush-outline" size={18} color="#fff" />
//                     </TouchableOpacity>
                    
//                     {/* Image regeneration button */}
//                     <TouchableOpacity
//                       style={[styles.imageActionButton, styles.transparentButton]}
//                       onPress={() => {
//                         setSelectedCharacter(character);
//                         setShowImageModal(true);
//                       }}
//                     >
//                       <Ionicons name="refresh-outline" size={18} color="#fff" />
//                     </TouchableOpacity>
//                   </View>
//                 </LinearGradient>
//               </View>
//             )}
//           </View>
//         </TouchableOpacity>
//       </View>
//     );
//   };

//   // Render main tab content - update to fix scrolling behavior
//   const renderMainTab = () => (
//     <View style={{ flex: 1 }}>
//       {/* Selected character details - moved outside of ScrollView */}
//       {selectedCharacter && renderCharacterDetail()}
      
//       <ScrollView 
//         style={styles.tabContent}
//         contentContainerStyle={styles.tabPageContent}
//         refreshControl={
//           <RefreshControl 
//             refreshing={refreshing} 
//             onRefresh={handleRefresh}
//             tintColor="#fff" 
//             colors={["#fff"]}
//           />
//         }
//       >
//         {/* Removed cradle status bar */}
        
//         <Text style={styles.sectionHeading}>
//           角色列表
//         </Text>
        
//         {/* Render character grid or empty state */}
//         {cradleCharacters.length > 0 ? (
//           <View style={styles.characterGridContainer}>
//             <View style={styles.characterGrid}>
//               {cradleCharacters.map(character => renderCharacterCard(character))}
//             </View>
//           </View>
//         ) : (
//           <View style={styles.emptyStateContainer}></View>
//         )}
//       </ScrollView>
//     </View>
//   );

//   // Remove the separate renderGallerySection function since we're integrating it differently

//   // Render import tab content
//   const renderImportTab = () => (
//     <View style={styles.tabContent}>
//       <ScrollView contentContainerStyle={styles.tabPageContent}>
//         <View style={{ padding: 20, alignItems: 'center' }}>
//           <Ionicons name="cloud-download-outline" size={60} color={theme.colors.primary} />
//           <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 16 }}>
//             导入角色到摇篮系统
//           </Text>
//           <Text style={{ color: '#aaa', textAlign: 'center', marginVertical: 16, lineHeight: 22 }}>
//             选择您已创建的角色，将其导入到摇篮系统进行培育和完善
//           </Text>
//           <TouchableOpacity 
//             style={{
//               backgroundColor: theme.colors.primary,
//               paddingHorizontal: 20,
//               paddingVertical: 12,
//               borderRadius: 8,
//               marginTop: 16,
//             }}
//             onPress={() => setShowImportModal(true)}
//           >
//             <Text style={{ color: '#000', fontSize: 16, fontWeight: '600' }}>选择角色导入</Text>
//           </TouchableOpacity>
//         </View>
//       </ScrollView>
//     </View>
//   );

//   // Render settings tab content
//   const renderSettingsTab = () => (
//     <View style={styles.tabContent}>
//       <CradleSettings 
//         isVisible={activeTab === 'settings'}
//         onClose={() => setActiveTab('main')}
//         isCradleEnabled={cradleSettings.enabled}
//         onUpdateSettings={updateCradleSettings}
//         onCradleToggle={(enabled) => updateCradleSettings({ ...cradleSettings, enabled })}
//       />
        
//     </View>
//   );
  
//   // State for API settings visibility
//   const [showApiSettings, setShowApiSettings] = useState(false);

//   // Render API settings tab content
//   const renderApiSettingsTab = () => (
//     <View style={styles.tabContent}>
//       <CradleApiSettings
//         isVisible={activeTab === 'api'}
//         onClose={() => setActiveTab('main')}
//       />
//     </View>
//   );

//   // Determine which tab content to render based on activeTab
//   const renderTabContent = () => {
//     switch (activeTab) {
//       case 'main':
//         return renderMainTab();
//       case 'import':
//         return renderImportTab();
//       case 'settings':
//         return renderSettingsTab();
//       case 'api':
//         return renderApiSettingsTab();
//       default:
//         return renderMainTab();
//     }
//   };

//   // Improved notification display with rounded corners
//   const renderNotification = () => {
//     if (!notificationVisible) return null;
    
//     return (
//       <View style={styles.notificationContainer}>
//         <Animated.View style={styles.notification}>
//           <View style={styles.notificationContent}>
//             <Text style={styles.notificationTitle}>{notification.title}</Text>
//             <Text style={styles.notificationMessage}>{notification.message}</Text>
//           </View>
//           <TouchableOpacity 
//             style={styles.closeNotificationButton}
//             onPress={() => setNotificationVisible(false)}
//           >
//             <Ionicons name="close" size={18} color="#fff" />
//           </TouchableOpacity>
//         </Animated.View>
//       </View>
//     );
//   };

//   // Ensure we clean up the autoRefreshTimer when component unmounts
//   useEffect(() => {
//     return () => {
//       if (autoRefreshTimer) {
//         clearInterval(autoRefreshTimer);
//       }
//     };
//   }, [autoRefreshTimer]);

//   // Add this effect to respond to lastImageRefresh changes
//   useEffect(() => {
//     if (selectedCharacter) {
//       // When lastImageRefresh changes, reload the character to get fresh data
//       const freshCharacter = characters.find(c => c.id === selectedCharacter.id);
//       if (freshCharacter) {
//         setSelectedCharacter(freshCharacter as CradleCharacter);
//       }
//     }
//   }, [lastImageRefresh]);

//   // Add this utility function to keep track of already checked task IDs to prevent infinite loops
//   const checkedTaskIds = useRef<Set<string>>(new Set());
  
//   // Clear checked tasks when component unmounts or on dependency changes
//   useEffect(() => {
//     return () => {
//       checkedTaskIds.current.clear();
//     };
//   }, []);

//   // 新的顶部栏，完全对齐TopBarWithBackground.tsx
//   const renderHeader = () => (
//     <View style={[styles.topBarContainer, { height: HEADER_HEIGHT, paddingTop: Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 0) }]}>
//       <View style={styles.topBarOverlay} />
//       <View style={styles.topBarContent}>
//         <View style={styles.topBarTitleContainer}>
//           <Text style={styles.topBarTitle}>摇篮</Text>
//         </View>
//         <View style={styles.topBarActions}>
//           {/* 可根据需要添加更多按钮 */}
//         </View>
//       </View>
//     </View>
//   );

//   return (
//     <KeyboardAvoidingView 
//       style={[styles.safeArea, { paddingTop: insets.top }]}
//       behavior={Platform.OS === "ios" ? "padding" : undefined}
//       keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
//     >
//       <StatusBar barStyle="light-content" />
//       {renderHeader()}
//       {/* Main content area - only show main tab */}
//       <View style={styles.tabContentContainer}>
//         {renderMainTab()}
//       </View>
      
//       {/* Gallery Sidebar */}
//       {selectedCharacter && (
//         <CharacterImageGallerySidebar
//           visible={showGallerySidebar}
//           onClose={() => setShowGallerySidebar(false)}
//           images={characterImages}
//           isLoading={isLoadingImages}
//           onToggleFavorite={handleToggleFavorite}
//           onDelete={handleDeleteImage}
//           onSetAsBackground={handleSetAsBackground}
//           onSetAsAvatar={handleSetAsAvatar} // Add the new handler
//           character={selectedCharacter}
//           onAddNewImage={handleImageRegenerationSuccess}
//         />
//       )}
      
//       {/* Render improved notification */}
//       {renderNotification()}
      
      
//       {/* Import modal */}
//       <ImportToCradleModal
//       visible={showImportModal}
//         isVisible={showImportModal}
//         onClose={() => {
//           setShowImportModal(false);
//           // Refresh character list after importing to show new characters
//           setTimeout(() => loadCradleCharacters(), 500); 
//         }}
//       />
      
//       {/* Notification component */}


//       {/* 添加角色编辑对话框 - Use editingCharacter instead of selectedCharacter */}
//       {editingCharacter && (
//         <CharacterEditDialog 
//           isVisible={showEditDialog}
//           character={editingCharacter}
//           onClose={() => {
//             setShowEditDialog(false);
//             // Clear editing character when closing dialog
//             setEditingCharacter(null);
//           }}
//           onUpdateCharacter={async (updatedCharacter) => {
//             try {
//               console.log('[摇篮页面] 准备更新角色:', updatedCharacter.name);
//               console.log('[摇篮页面] 更新数据长度:', updatedCharacter.jsonData?.length || 0);
              
//               // Verify character data before updating
//               if (!updatedCharacter.jsonData) {
//                 console.error('[摇篮页面] 角色数据为空，无法更新');
//                 throw new Error('角色数据为空，无法更新');
//               }
              
//               // Basic JSON validation
//               try {
//                 const parsedJson = JSON.parse(updatedCharacter.jsonData);
//                 console.log('[摇篮页面] JSON数据解析成功，包含字段:', Object.keys(parsedJson).join(', '));
                
//                 // Check for presence of worldBook data
//                 console.log('[摇篮页面] 检查worldBook数据存在性:', !!parsedJson.worldBook);
//                 if (parsedJson.worldBook) {
//                   console.log('[摇篮页面] worldBook条目数量:', 
//                     Object.keys(parsedJson.worldBook.entries || {}).length);
//                 }
                
//                 if (!parsedJson.roleCard || !parsedJson.worldBook) {
//                   console.error('[摇篮页面] JSON数据缺少必要的字段');
//                   throw new Error('角色数据缺少必要的roleCard或worldBook结构');
//                 }
//               } catch (parseError) {
//                 console.error('[摇篮页面] JSON数据解析失败:', parseError);
//                 throw new Error(`角色数据格式无效: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
//               }
              
//               // Determine if this is a cradle character with a generated normal character
//               const isCradleCharacter = (updatedCharacter as CradleCharacter).inCradleSystem === true;
//               const generatedCharacterId = (updatedCharacter as CradleCharacter).generatedCharacterId;
              
//               console.log('[摇篮页面] 角色更新信息:', {
//                 isCradleCharacter,
//                 generatedCharacterId,
//                 characterId: updatedCharacter.id
//               });
              
//               // Apply the update to the cradle character
//               const updatedCradleCharacter: CradleCharacter = {
//                 ...(updatedCharacter as CradleCharacter),
//                 inCradleSystem: true, // Ensure it remains in the cradle system
//                 isCradleGenerated: true, // Keep the generated flag
//                 updatedAt: Date.now() // Add updated timestamp
//               };
              
//               // If there's a generated character reference, also update that character
//               if (generatedCharacterId) {
//                 const normalChar = characters.find(c => c.id === generatedCharacterId);
                
//                 if (normalChar) {
//                   console.log('[摇篮页面] 更新关联的正常角色:', generatedCharacterId);
                  
//                   // Create updated normal character 
//                   const updatedNormalChar = {
//                     ...normalChar,
//                     jsonData: updatedCharacter.jsonData,
//                     name: updatedCharacter.name,
//                     description: updatedCharacter.description,
//                     personality: updatedCharacter.personality,
//                     updatedAt: Date.now()
//                   };
                  
//                   // Get user API key and settings
//                   const apiKey = user?.settings?.chat?.characterApiKey || '';
//                   const apiSettings = user?.settings?.chat;
                  
//                   // Update the normal character in storage first
//                   await updateCharacter(updatedNormalChar);
//                   console.log('[摇篮页面] 已更新关联的正常角色');
                  
//                   // Send update to NodeST if API key is available
//                   if (apiKey) {
//                     console.log('[摇篮页面] 向NodeST发送角色更新');
//                     await NodeSTManager.processChatMessage({
//                       userMessage: "",
//                       status: "更新人设",
//                       conversationId: updatedNormalChar.id,
//                       apiKey: apiKey,
//                       apiSettings: {
//                         apiProvider: apiSettings?.apiProvider || 'gemini',
//                         openrouter: apiSettings?.openrouter
//                       },
//                       character: updatedNormalChar
//                     });
//                     console.log('[摇篮页面] NodeST角色更新完成');
//                   }
//                 }
//               }
              
//               // Now update the cradle character
//               await updateCradleCharacter(updatedCradleCharacter);
              
//               // Update state for immediate UI update
//               setSelectedCharacter(updatedCradleCharacter);
//               setCradleCharacters(prev => 
//                 prev.map(c => c.id === updatedCradleCharacter.id ? updatedCradleCharacter : c)
//               );
              
//               setShowEditDialog(false);
//               setEditingCharacter(null); // Clear the editing character
//               showNotification('角色更新成功', `角色 "${updatedCharacter.name}" 已通过对话成功更新！`);
//             } catch (error) {
//               console.error('[摇篮页面] 更新角色失败:', error);
//               showNotification('更新失败', 
//                 `角色 "${editingCharacter.name}" 更新失败: ${error instanceof Error ? error.message : String(error)}`);
//             }
//           }}
//         />
//       )}

//       {/* Image regeneration modal */}
//       {selectedCharacter && (
//         <ImageRegenerationModal
//           visible={showImageModal}
//           character={selectedCharacter}
//           onClose={() => setShowImageModal(false)}
//           onSuccess={handleImageRegenerationSuccess}
//         />
//       )}

//       {/* Full Image Viewer Modal */}
//       <Modal
//         visible={showFullImage}
//         transparent={true}
//         onRequestClose={() => setShowFullImage(false)}
//         animationType="fade"
//       >
//         <View style={styles.fullImageContainer}>
//           <TouchableOpacity
//             style={styles.fullImageCloseButton}
//             onPress={() => setShowFullImage(false)}
//           >
//             <Ionicons name="close" size={28} color="#fff" />
//           </TouchableOpacity>
          
//           {fullImageUri && (
//             <Image
//               source={{ uri: fullImageUri }}
//               style={styles.fullImage}
//               resizeMode="contain"
//             />
//           )}
//         </View>
//       </Modal>
//     </KeyboardAvoidingView>
//   );
// }

// const styles = StyleSheet.create({
//   safeArea: {
//     flex: 1,
//     backgroundColor: '#222',
//   },
//   tabText: {
//     color: '#aaa',
//     fontSize: 14,
//   },
//   tabContentContainer: {
//     flex: 1,
//   },
//   tabContent: {
//     flex: 1,
//     backgroundColor: '#222',
//   },
//   tabPageContent: {
//     flexGrow: 1,
//     paddingBottom: 24,
//   },
//   mainContent: {
//     flex: 1,
//     paddingBottom: 80,
//   },
//   emptyStateContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     padding: 20,
//     minHeight: 300,
//   },
//   emptyTitle: {
//     fontSize: 20,
//     fontWeight: 'bold',
//     color: '#fff',
//     marginTop: 16,
//     marginBottom: 8,
//   },
//   emptyText: {
//     color: '#aaa',
//     fontSize: 15,
//     textAlign: 'center',
//     marginBottom: 24,
//     lineHeight: 22,
//   },
//   createCharacterButton: {
//     flexDirection: 'row',
//     backgroundColor: theme.colors.primary,
//     paddingHorizontal: 20,
//     paddingVertical: 10,
//     borderRadius: 20,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   createCharacterButtonText: {
//     color: '#fff',
//     fontWeight: 'bold',
//     fontSize: 16,
//   },
//   floatingCreateButton: {
//     position: 'absolute',
//     right: 20,
//     bottom: 20,
//     width: 50,
//     height: 50,
//     borderRadius: 25,
//     backgroundColor: theme.colors.primary,
//     alignItems: 'center',
//     justifyContent: 'center',
//     elevation: 5,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.25,
//     shadowRadius: 3.84,
//   },
//   characterDetailSection: {
//     padding: 16,
//     marginBottom: 16,
//   },
//   notificationContainer: {
//     position: 'absolute',
//     top: 16,
//     right: 16,
//     left: 16,
//     alignItems: 'center',
//     zIndex: 1000,
//   },
//   notification: {
//     backgroundColor: 'rgba(0, 0, 0, 0.8)',
//     borderRadius: 8,
//     padding: 16,
//     width: '100%',
//     maxWidth: 500,
//     elevation: 4,
//     shadowColor: "#000",
//     shadowOffset: {
//       width: 0,
//       height: 2,
//     },
//     shadowOpacity: 0.25,
//     shadowRadius: 3.84,
//   },
//   notificationTitle: {
//     color: '#fff',
//     fontWeight: 'bold',
//     fontSize: 16,
//     marginBottom: 8,
//   },
//   notificationMessage: {
//     color: '#eee',
//     fontSize: 14,
//     lineHeight: 20,
//   },
//   closeNotificationButton: {
//     position: 'absolute',
//     top: 8,
//     right: 8,
//     width: 24,
//     height: 24,
//     borderRadius: 12,
//     backgroundColor: 'rgba(255,255,255,0.2)',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
  
//   // Styles for character grid view
//   characterGridContainer: {
//     paddingHorizontal: 8,
//     paddingVertical: 16,
//   },
//   characterGridCard: {
//     flex: 1,
//     margin: 8,
//     borderRadius: 12,
//     backgroundColor: '#333',
//     overflow: 'hidden',
//     elevation: 2,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.2,
//     shadowRadius: 2,
//   },
//   selectedCharacterGridCard: {
//     borderWidth: 2,
//     borderColor: theme.colors.primary,
//   },
//   characterGridImageContainer: {
//     height: 180,
//     position: 'relative',
//   },
//   characterGridImage: {
//     width: '100%',
//     height: '100%',
//     resizeMode: 'cover',
//   },
//   characterGridPlaceholder: {
//     width: '100%',
//     height: '100%',
//     backgroundColor: '#444',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   characterGridAvatarContainer: {
//     position: 'absolute',
//     bottom: -20,
//     left: 10,
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     borderWidth: 2,
//     borderColor: '#fff',
//     backgroundColor: '#333',
//     overflow: 'hidden',
//     elevation: 3,
//   },
//   characterGridAvatar: {
//     width: '100%',
//     height: '100%',
//     resizeMode: 'cover',
//   },
//   characterGridAvatarPlaceholder: {
//     width: '100%',
//     height: '100%',
//     backgroundColor: '#555',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   characterGridInfo: {
//     padding: 16,
//     paddingTop: 24,
//   },
//   characterGridName: {
//     fontSize: 16,
//     color: '#fff',
//     fontWeight: 'bold',
//     marginBottom: 8,
//   },
//   characterGridActions: {
//     flexDirection: 'row',
//     justifyContent: 'flex-end',
//   },
//   characterGridActionButton: {
//     width: 32,
//     height: 32,
//     borderRadius: 16,
//     backgroundColor: 'rgba(0,0,0,0.3)',
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginLeft: 8,
//   },
  
//   // Other styles
//   importContainer: {
//     padding: 20, 
//     alignItems: 'center',
//   },
//   importTitle: {
//     color: '#fff', 
//     fontSize: 20, 
//     fontWeight: 'bold', 
//     marginTop: 16,
//   },
//   importDescription: {
//     color: '#aaa', 
//     textAlign: 'center', 
//     marginVertical: 16, 
//     lineHeight: 22,
//   },
//   importButton: {
//     backgroundColor: theme.colors.primary,
//     paddingHorizontal: 20,
//     paddingVertical: 12,
//     borderRadius: 8,
//     marginTop: 16,
//   },
//   importButtonText: {
//     color: '#000', 
//     fontSize: 16, 
//     fontWeight: '600',
//   },
//   sectionTitle: {
//     color: '#fff',
//     fontSize: 18,
//     fontWeight: 'bold',
//     paddingHorizontal: 16,
//     marginTop: 16,
//     marginBottom: 8,
//   },
//   // Add new styles for the grid layout
//   characterGrid: {
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//     justifyContent: 'space-between',
//     paddingHorizontal: 8,
//   },
//   characterCard: {
//     width: (SCREEN_WIDTH - 48) / 2, // 2 columns with proper spacing
//     height: ((SCREEN_WIDTH - 48) / 2) * (16/9), // Proper 9:16 aspect ratio (width * 16/9)
//     borderRadius: 12,
//     overflow: 'hidden',
//     backgroundColor: '#333',
//     marginBottom: 16,
//     marginHorizontal: 4,
//     elevation: 2,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.2,
//     shadowRadius: 2,
//   },
//   selectedCharacterCard: {
//     borderWidth: 2,
//     borderColor: theme.colors.primary,
//   },
//   characterImageContainer: {
//     flex: 1,
//     position: 'relative',
//   },
//   characterImage: {
//     width: '100%',
//     height: '100%',
//     resizeMode: 'cover',
//   },
//   characterImagePlaceholder: {
//     flex: 1,
//     backgroundColor: '#444',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   statusOverlay: {
//     position: 'absolute',
//     top: 8,
//     right: 8,
//     backgroundColor: 'rgba(0,0,0,0.6)',
//     borderRadius: 12,
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   generatedBadge: {
//     position: 'absolute',
//     top: 8,
//     left: 8,
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#4CAF50',
//     paddingHorizontal: 8,
//     paddingVertical: 4,
//     borderRadius: 12,
//   },
//   generatedBadgeText: {
//     color: '#fff',
//     fontSize: 10,
//     fontWeight: '600',
//   },
//   characterCardOverlay: {
//     position: 'absolute',
//     bottom: 0,
//     left: 0,
//     right: 0,
//     padding: 12,
//     paddingTop: 24,
//   },
//   characterCardName: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: 'bold',
//     marginBottom: 8,
//     textShadowColor: 'rgba(0,0,0,0.5)',
//     textShadowOffset: { width: 1, height: 1 },
//     textShadowRadius: 2,
//   },
//   characterCardActions: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     marginTop: 8,
//     paddingHorizontal: 2,
//   },
//   imageActionButton: {
//     padding: 6,
//     borderRadius: 4,
//     backgroundColor: 'rgba(80, 80, 80, 0.8)',
//     alignItems: 'center',
//     justifyContent: 'center',
//     width: ((SCREEN_WIDTH - 48) / 2 - 20) / 3, // Distribute buttons evenly (updated for 2 buttons)
//   },
//   transparentButton: {
//     backgroundColor: 'rgba(0, 0, 0, 0.4)',
//   },
//   regenerateButton: {
//     backgroundColor: 'rgba(138, 43, 226, 0.6)',
//   },
//   generateButton: {
//     backgroundColor: 'rgba(46, 204, 113, 0.6)',
//   },
//   deleteButton: {
//     backgroundColor: 'rgba(231, 76, 60, 0.6)',
//   },
//   fullImageContainer: {
//     flex: 1,
//     backgroundColor: 'rgba(0,0,0,0.9)',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   fullImage: {
//     width: '100%',
//     height: '90%',
//   },
//   fullImageCloseButton: {
//     position: 'absolute',
//     top: 40,
//     right: 20,
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: 'rgba(0,0,0,0.5)',
//     justifyContent: 'center',
//     alignItems: 'center',
//     zIndex: 10,
//   },
//   sectionHeading: {
//     color: '#fff',
//     fontSize: 18,
//     fontWeight: 'bold',
//     paddingHorizontal: 16,
//     marginTop: 16,
//     marginBottom: 12,
//   },
//   loadingIconOverlay: {
//     position: 'absolute',
//     top: 8,
//     right: 8,
//     backgroundColor: 'rgba(0,0,0,0.5)',
//     borderRadius: 12,
//     padding: 6,
//   },
//   notificationContent: {
//     flex: 1,
//     marginRight: 24,
//   },
//   tagGeneratedBadge: {
//     position: 'absolute',
//     top: 8,
//     left: 8,
//     backgroundColor: 'rgba(74, 144, 226, 0.8)',
//     borderRadius: 12,
//     paddingHorizontal: 8,
//     paddingVertical: 4,
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   tagGeneratedBadgeText: {
//     color: '#fff',
//     fontSize: 10,
//     fontWeight: '600',
//     marginLeft: 4,
//   },
//   cardCreationMethodContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginTop: 4,
//   },
//   cardCreationMethodText: {
//     color: 'rgba(255,255,255,0.7)',
//     fontSize: 12,
//   },
//   characterCardWrapper: {
//     width: (SCREEN_WIDTH - 48) / 2, // 2 columns with proper spacing
//     marginBottom: 20,
//     marginHorizontal: 4,
//   },
//   characterCardActionsOverlay: {
//     position: 'absolute',
//     bottom: 0,
//     left: 0,
//     right: 0,
//     zIndex: 10,
//   },
//   actionsGradient: {
//     paddingVertical: 8,
//     paddingHorizontal: 6,
//   },
//   // 新增顶部栏样式，完全对齐TopBarWithBackground
//   topBarContainer: {
//     position: 'relative',
//     width: '100%',
//     zIndex: 100,
//   },
//   topBarOverlay: {
//     ...StyleSheet.absoluteFillObject,
//     backgroundColor: 'rgba(0,0,0,0.3)',
//   },
//   topBarContent: {
//     flex: 1,
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: 12,
//     height: '100%',
//   },
//   topBarTitleContainer: {
//     alignItems: 'flex-start',
//     justifyContent: 'center',
//     paddingHorizontal: 0,
//     flex: 1,
//   },
//   topBarTitle: {
//     color: '#fff',
//     fontSize: 18,
//     fontWeight: '600',
//     textShadowColor: 'rgba(0, 0, 0, 0.75)',
//     textShadowOffset: { width: 1, height: 1 },
//     textShadowRadius: 2,
//     textAlign: 'left',
//   },
//   topBarActions: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
// });