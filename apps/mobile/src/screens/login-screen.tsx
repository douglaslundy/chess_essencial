import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiProblem } from '@/lib/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { useTheme } from '@/hooks/use-theme';

export function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ identifier, password });
    } catch (submitError) {
      setError(
        submitError instanceof ApiProblem
          ? submitError.message
          : 'Não foi possível entrar. Verifique sua conexão.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Xadrez Essencial
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setIdentifier}
            placeholder="E-mail ou usuário"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            value={identifier}
          />
          <TextInput
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="Senha"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            style={[styles.input, { color: theme.text }]}
            value={password}
          />

          {error ? (
            <ThemedText themeColor="text" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          <ThemedText
            themeColor="text"
            onPress={isSubmitting ? undefined : handleSubmit}
            style={styles.submitButton}
            type="smallBold"
          >
            {isSubmitting ? <ActivityIndicator /> : 'Entrar'}
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  title: {
    textAlign: 'center',
  },
  form: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8888',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  error: {
    color: '#e5484d',
  },
  submitButton: {
    textAlign: 'center',
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
});
