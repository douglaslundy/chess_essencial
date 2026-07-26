import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useAuth } from '@/lib/auth/auth-context';
import { useTheme } from '@/hooks/use-theme';

function TabIcon({ color, glyph }: { color: ColorValue; glyph: string }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { isLoading, user } = useAuth();
  const theme = useTheme();
  if (!isLoading && !user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="jogar"
        options={{ tabBarIcon: ({ color }) => <TabIcon color={color} glyph="♞" />, title: 'Jogar' }}
      />
      <Tabs.Screen
        name="cursos"
        options={{
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="📚" />,
          title: 'Cursos',
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="👥" />,
          title: 'Social',
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          tabBarIcon: ({ color }) => <TabIcon color={color} glyph="👤" />,
          title: 'Perfil',
        }}
      />
    </Tabs>
  );
}
