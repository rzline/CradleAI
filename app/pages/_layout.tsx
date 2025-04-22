// app/pages/_layout.tsx
import React from 'react';
import { Stack } from 'expo-router';

export default function PagesLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="character-detail"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="create_char"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="relationship-graph"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
            <Stack.Screen
        name="create_char_cradle"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      /> 
      <Stack.Screen
        name="global-settings"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
            <Stack.Screen
        name="api-settings"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
            <Stack.Screen
        name="token-planner"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
                  <Stack.Screen
        name="custom-settings-manager"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
    </Stack>
    
  );
}