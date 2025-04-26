````markdown
# 角色卡的加载路径与正确加载方法

## 角色卡（Role Card）数据存储路径

- **所有角色相关的持久化数据（如角色卡、朋友圈框架、记忆等）均存储在：**
  ```
  FileSystem.documentDirectory + 'nodest_characters/'
  ```
  例如，某角色ID为 `1745647522796`，其角色卡文件路径为：
  ```
  FileSystem.documentDirectory + 'nodest_characters/nodest_1745647522796_role.json'
  ```

- **角色基础信息列表（如角色名、头像、描述等）存储在：**
  ```
  FileSystem.documentDirectory + 'characters.json'
  ```
  这是一个包含所有角色对象的数组。

## 正确加载角色卡的方法

1. **加载角色卡（role）**
   ```typescript
   import * as FileSystem from 'expo-file-system';

   const dir = FileSystem.documentDirectory + 'nodest_characters/';
   const filePath = dir + `nodest_${characterId}_role.json`;
   const fileInfo = await FileSystem.getInfoAsync(filePath);
   if (fileInfo.exists) {
     const content = await FileSystem.readAsStringAsync(filePath);
     const roleCard = JSON.parse(content);
     // 使用 roleCard
   } else {
     // 角色卡不存在，需初始化或报错
   }
   ```

2. **加载角色基础信息**
   ```typescript
   const filePath = FileSystem.documentDirectory + 'characters.json';
   const fileInfo = await FileSystem.getInfoAsync(filePath);
   if (fileInfo.exists) {
     const content = await FileSystem.readAsStringAsync(filePath);
     const allCharacters = JSON.parse(content); // 数组
     const character = allCharacters.find(c => c.id === characterId);
     // 使用 character
   }
   ```

## 注意事项

- **不要再从 AsyncStorage 读取角色卡数据。**
- 角色相关的所有结构化数据（如 `_role`, `_circle_framework`, `_circle_memory` 等）都应在 `nodest_characters/` 目录下以 JSON 文件形式存取。
- 角色列表和基础属性统一存储在 `characters.json`，用于角色选择、展示等场景。

---
```