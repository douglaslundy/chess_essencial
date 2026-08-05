import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function PerfilScreen() {
  const { logout, updateProfile, user } = useAuth();
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function setProfilePublic(next: boolean) {
    if (isSaving || !user) return;
    setError('');
    setIsSaving(true);
    try {
      await updateProfile({ isProfilePublic: next });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar a privacidade do perfil.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Olá, {user?.profile.displayName}</ThemedText>
        <ThemedText type="small">@{user?.username}</ThemedText>

        {user ? (
          <ThemedView style={styles.preferenceCard} type="backgroundElement">
            <View style={styles.preferenceText}>
              <ThemedText type="smallBold">Perfil público</ThemedText>
              <ThemedText themeColor="textSecondary" type="small">
                Permite que outros jogadores encontrem e visualizem seu perfil.
              </ThemedText>
            </View>
            {isSaving ? (
              <ActivityIndicator accessibilityLabel="Salvando privacidade" />
            ) : (
              <Switch
                accessibilityHint="Altera a visibilidade do perfil em todos os dispositivos."
                accessibilityLabel="Perfil público"
                accessibilityRole="switch"
                accessibilityState={{ checked: user.profile.isProfilePublic }}
                disabled={isSaving}
                onValueChange={(value) => void setProfilePublic(value)}
                testID="profile-public-switch"
                value={user.profile.isProfilePublic}
              />
            )}
          </ThemedView>
        ) : null}

        {error ? (
          <ThemedText accessibilityRole="alert" themeColor="text" type="small">
            {error}
          </ThemedText>
        ) : null}

        <ThemedText onPress={() => void logout()} type="linkPrimary">
          Sair
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  preferenceCard: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'space-between',
    padding: Spacing.three,
    width: '100%',
  },
  preferenceText: {
    flex: 1,
    gap: Spacing.one,
  },
  safeArea: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
