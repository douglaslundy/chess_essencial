import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function CursosStackLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Cursos' }} />
      <Stack.Screen name="[slug]/index" options={{ title: 'Curso' }} />
      <Stack.Screen name="[slug]/[lessonId]" options={{ title: 'Aula' }} />
    </Stack>
  );
}
