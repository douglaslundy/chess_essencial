import * as SecureStore from 'expo-secure-store';

import type { TokenPair } from '@xadrez/contracts';

const ACCESS_TOKEN_KEY = 'xadrez.access_token';
const REFRESH_TOKEN_KEY = 'xadrez.refresh_token';

export async function saveSession(tokens: TokenPair) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
