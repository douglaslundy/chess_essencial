import type { Friend, LeaderboardEntry, Post, RatingPool } from '@xadrez/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAccessToken } from '@/lib/api/session';
import { ApiProblem, socialApi } from '@/lib/api/social';

type Section = 'feed' | 'friends' | 'ranking';

const sections: Array<{ label: string; value: Section }> = [
  { label: 'Feed', value: 'feed' },
  { label: 'Amigos', value: 'friends' },
  { label: 'Ranking', value: 'ranking' },
];

const pools: Array<{ label: string; value: RatingPool }> = [
  { label: 'Bullet', value: 'bullet' },
  { label: 'Blitz', value: 'blitz' },
  { label: 'Rápida', value: 'rapid' },
  { label: 'Clássica', value: 'classical' },
  { label: 'Corresp.', value: 'correspondence' },
];

function formatPostDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

export default function SocialScreen() {
  const theme = useTheme();
  const [section, setSection] = useState<Section>('feed');

  const [posts, setPosts] = useState<Post[]>([]);
  const [feedMessage, setFeedMessage] = useState('Carregando…');
  const [loadingMore, setLoadingMore] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsMessage, setFriendsMessage] = useState('Carregando…');

  const [pool, setPool] = useState<RatingPool>('rapid');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [rankingMessage, setRankingMessage] = useState('Carregando…');

  const loadFeed = useCallback(async (before?: string) => {
    const token = await getAccessToken();
    if (!token) {
      setFeedMessage('Entre na sua conta para ver o feed.');
      return;
    }
    try {
      const value = await socialApi.listFeed(token, before);
      setPosts((current) => (before ? [...current, ...value] : value));
      setFeedMessage(value.length || before ? '' : 'Ainda não há publicações.');
    } catch (error) {
      setFeedMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível carregar o feed.',
      );
    }
  }, []);

  const loadFriends = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setFriendsMessage('Entre na sua conta para ver seus amigos.');
      return;
    }
    try {
      const value = await socialApi.listFriends(token);
      setFriends(value);
      setFriendsMessage(value.length ? '' : 'Você ainda não tem amigos adicionados.');
    } catch (error) {
      setFriendsMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível carregar seus amigos.',
      );
    }
  }, []);

  const loadRanking = useCallback(async (selectedPool: RatingPool) => {
    const token = await getAccessToken();
    if (!token) {
      setRankingMessage('Entre na sua conta para ver o ranking.');
      return;
    }
    setRankingMessage('Carregando…');
    try {
      const value = await socialApi.getLeaderboard(selectedPool, token);
      setEntries(value);
      setRankingMessage(value.length ? '' : 'Ainda não há jogadores classificados neste ritmo.');
    } catch (error) {
      setRankingMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível carregar o ranking.',
      );
    }
  }, []);

  useEffect(() => {
    void loadFeed();
    void loadFriends();
  }, [loadFeed, loadFriends]);

  useEffect(() => {
    void loadRanking(pool);
  }, [loadRanking, pool]);

  async function likeToggle(post: Post) {
    const token = await getAccessToken();
    if (!token) return;
    try {
      if (post.likedByMe) {
        await socialApi.unlikePost(post.id, token);
        setPosts((current) =>
          current.map((item) =>
            item.id === post.id
              ? { ...item, likeCount: item.likeCount - 1, likedByMe: false }
              : item,
          ),
        );
      } else {
        const updated = await socialApi.likePost(post.id, token);
        setPosts((current) => current.map((item) => (item.id === post.id ? updated : item)));
      }
    } catch {
      // Silently ignore — the like state simply doesn't update this tap.
    }
  }

  async function loadMoreFeed() {
    if (loadingMore || posts.length === 0) return;
    setLoadingMore(true);
    await loadFeed(posts[posts.length - 1]!.createdAt);
    setLoadingMore(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.tabs}>
          {sections.map((option) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: section === option.value }}
              key={option.value}
              onPress={() => setSection(option.value)}
              style={[
                styles.tabButton,
                {
                  backgroundColor:
                    section === option.value ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}
            >
              <ThemedText type="smallBold">{option.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {section === 'feed' ? (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={posts}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              feedMessage ? <ThemedText type="small">{feedMessage}</ThemedText> : null
            }
            ListFooterComponent={loadingMore ? <ActivityIndicator /> : null}
            onEndReached={() => void loadMoreFeed()}
            onEndReachedThreshold={0.4}
            renderItem={({ item }) => (
              <ThemedView style={styles.card} type="backgroundElement">
                <ThemedText type="smallBold">{item.authorDisplayName}</ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  {formatPostDate(item.createdAt)}
                </ThemedText>
                {item.body ? <ThemedText>{item.body}</ThemedText> : null}
                <Pressable onPress={() => void likeToggle(item)}>
                  <ThemedText themeColor={item.likedByMe ? 'text' : 'textSecondary'} type="link">
                    {item.likedByMe ? '♥' : '♡'} {item.likeCount}
                  </ThemedText>
                </Pressable>
              </ThemedView>
            )}
          />
        ) : null}

        {section === 'friends' ? (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={friends}
            keyExtractor={(item) => item.userId}
            ListEmptyComponent={
              friendsMessage ? <ThemedText type="small">{friendsMessage}</ThemedText> : null
            }
            renderItem={({ item }) => (
              <ThemedView style={styles.row} type="backgroundElement">
                <ThemedText type="smallBold">{item.displayName}</ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  {item.presence.online ? 'online' : 'offline'}
                </ThemedText>
              </ThemedView>
            )}
          />
        ) : null}

        {section === 'ranking' ? (
          <>
            <View style={styles.tabs}>
              {pools.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setPool(option.value)}
                  style={[
                    styles.poolButton,
                    {
                      backgroundColor:
                        pool === option.value ? theme.backgroundSelected : theme.backgroundElement,
                    },
                  ]}
                >
                  <ThemedText type="small">{option.label}</ThemedText>
                </Pressable>
              ))}
            </View>
            <FlatList
              contentContainerStyle={styles.listContent}
              data={entries}
              keyExtractor={(item) => item.userId}
              ListEmptyComponent={
                rankingMessage ? <ThemedText type="small">{rankingMessage}</ThemedText> : null
              }
              renderItem={({ item }) => (
                <ThemedView style={styles.row} type="backgroundElement">
                  <ThemedText type="smallBold">
                    {item.rank}. {item.displayName}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" type="small">
                    {item.rating}
                  </ThemedText>
                </ThemedView>
              )}
            />
          </>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    gap: Spacing.half,
    padding: Spacing.three,
  },
  container: {
    flex: 1,
  },
  listContent: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
  poolButton: {
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  row: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  safeArea: {
    flex: 1,
  },
  tabButton: {
    borderRadius: Spacing.two,
    flex: 1,
    paddingVertical: Spacing.two,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
