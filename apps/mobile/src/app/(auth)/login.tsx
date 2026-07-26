import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth/auth-context';
import { LoginScreen } from '@/screens/login-screen';

export default function Login() {
  const { isLoading, user } = useAuth();
  if (!isLoading && user) return <Redirect href="/(tabs)/jogar" />;
  return <LoginScreen />;
}
