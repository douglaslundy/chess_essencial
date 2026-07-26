import type {
  Conversation,
  DirectMessage,
  Friend,
  FriendRequest,
  LeaderboardEntry,
  Post,
  RatingPool,
} from '@xadrez/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAccessToken } from '@/lib/api/session';
import { ApiProblem, socialApi } from '@/lib/api/social';

type Section = 'feed' | 'friends' | 'messages' | 'ranking';

const sections: Array<{ label: string; value: Section }> = [
  { label: 'Feed', value: 'feed' },
  { label: 'Amigos', value: 'friends' },
  { label: 'Mensagens', value: 'messages' },
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
  const [composerText, setComposerText] = useState('');
  const [posting, setPosting] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsMessage, setFriendsMessage] = useState('Carregando…');
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [friendRequestMessage, setFriendRequestMessage] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsMessage, setConversationsMessage] = useState('Carregando…');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [thread, setThread] = useState<DirectMessage[]>([]);
  const [threadMessage, setThreadMessage] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

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

  const loadFriendsAndRequests = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setFriendsMessage('Entre na sua conta para ver seus amigos.');
      return;
    }
    try {
      const [friendsValue, requestsValue] = await Promise.all([
        socialApi.listFriends(token),
        socialApi.listFriendRequests(token),
      ]);
      setFriends(friendsValue);
      setIncomingRequests(requestsValue.incoming);
      setOutgoingRequests(requestsValue.outgoing);
      setFriendsMessage(friendsValue.length ? '' : 'Você ainda não tem amigos adicionados.');
    } catch (error) {
      setFriendsMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível carregar seus amigos.',
      );
    }
  }, []);

  const loadConversations = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setConversationsMessage('Entre na sua conta para ver suas mensagens.');
      return;
    }
    try {
      const value = await socialApi.listConversations(token);
      setConversations(value);
      setConversationsMessage(value.length ? '' : 'Você ainda não tem conversas.');
    } catch (error) {
      setConversationsMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível carregar as mensagens.',
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
    void loadFriendsAndRequests();
    void loadConversations();
  }, [loadFeed, loadFriendsAndRequests, loadConversations]);

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

  async function submitPost() {
    const body = composerText.trim();
    if (!body) return;
    const token = await getAccessToken();
    if (!token) return;
    setPosting(true);
    try {
      const created = await socialApi.createPost({ body }, token);
      setPosts((current) => [created, ...current]);
      setComposerText('');
    } catch (error) {
      setFeedMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível publicar agora.',
      );
    } finally {
      setPosting(false);
    }
  }

  async function submitFriendRequest() {
    const username = newFriendUsername.trim();
    if (!username) return;
    const token = await getAccessToken();
    if (!token) return;
    setSendingRequest(true);
    setFriendRequestMessage('');
    try {
      await socialApi.sendFriendRequest({ username }, token);
      setNewFriendUsername('');
      await loadFriendsAndRequests();
    } catch (error) {
      setFriendRequestMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível enviar o pedido.',
      );
    } finally {
      setSendingRequest(false);
    }
  }

  async function acceptRequest(request: FriendRequest) {
    const token = await getAccessToken();
    if (!token) return;
    try {
      await socialApi.acceptFriendRequest(request.username, token);
      await loadFriendsAndRequests();
    } catch (error) {
      setFriendRequestMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível aceitar o pedido.',
      );
    }
  }

  async function declineRequest(request: FriendRequest) {
    const token = await getAccessToken();
    if (!token) return;
    try {
      await socialApi.declineFriendRequest(request.username, token);
      setIncomingRequests((current) => current.filter((item) => item.userId !== request.userId));
    } catch (error) {
      setFriendRequestMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível recusar o pedido.',
      );
    }
  }

  async function cancelRequest(request: FriendRequest) {
    const token = await getAccessToken();
    if (!token) return;
    try {
      await socialApi.cancelFriendRequest(request.username, token);
      setOutgoingRequests((current) => current.filter((item) => item.userId !== request.userId));
    } catch (error) {
      setFriendRequestMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível cancelar o pedido.',
      );
    }
  }

  async function openConversation(conversation: Conversation) {
    setActiveConversation(conversation);
    setThread([]);
    setThreadMessage('Carregando…');
    const token = await getAccessToken();
    if (!token) return;
    try {
      const value = await socialApi.listMessages(conversation.userId, token);
      setThread(value);
      setThreadMessage(value.length ? '' : 'Nenhuma mensagem ainda — diga oi!');
    } catch (error) {
      setThreadMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível carregar a conversa.',
      );
    }
  }

  async function submitMessage() {
    const body = draftMessage.trim();
    if (!body || !activeConversation) return;
    const token = await getAccessToken();
    if (!token) return;
    setSendingMessage(true);
    try {
      const sent = await socialApi.sendMessage(activeConversation.userId, { body }, token);
      setThread((current) => [...current, sent]);
      setDraftMessage('');
    } catch (error) {
      setThreadMessage(
        error instanceof ApiProblem ? error.message : 'Não foi possível enviar a mensagem.',
      );
    } finally {
      setSendingMessage(false);
    }
  }

  const listRef = useRef<FlatList<DirectMessage>>(null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.tabs}>
          {sections.map((option) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: section === option.value }}
              key={option.value}
              onPress={() => {
                setSection(option.value);
                setActiveConversation(null);
              }}
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
            ListHeaderComponent={
              <View style={styles.composer}>
                <TextInput
                  multiline
                  onChangeText={setComposerText}
                  placeholder="No que você está pensando?"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.composerInput, { color: theme.text }]}
                  value={composerText}
                />
                <Pressable
                  disabled={posting || !composerText.trim()}
                  onPress={() => void submitPost()}
                  style={[
                    styles.postButton,
                    (posting || !composerText.trim()) && styles.postButtonDisabled,
                  ]}
                >
                  <ThemedText type="smallBold">{posting ? 'Publicando…' : 'Publicar'}</ThemedText>
                </Pressable>
              </View>
            }
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
            ListHeaderComponent={
              <View style={styles.friendsHeader}>
                <View style={styles.addFriendRow}>
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setNewFriendUsername}
                    placeholder="Adicionar por usuário"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.addFriendInput, { color: theme.text }]}
                    value={newFriendUsername}
                  />
                  <Pressable
                    disabled={sendingRequest || !newFriendUsername.trim()}
                    onPress={() => void submitFriendRequest()}
                    style={[
                      styles.postButton,
                      (sendingRequest || !newFriendUsername.trim()) && styles.postButtonDisabled,
                    ]}
                  >
                    <ThemedText type="smallBold">Enviar</ThemedText>
                  </Pressable>
                </View>
                {friendRequestMessage ? (
                  <ThemedText type="small">{friendRequestMessage}</ThemedText>
                ) : null}

                {incomingRequests.length > 0 ? (
                  <View style={styles.requestsSection}>
                    <ThemedText type="smallBold">Pedidos recebidos</ThemedText>
                    {incomingRequests.map((request) => (
                      <ThemedView key={request.userId} style={styles.row} type="backgroundElement">
                        <ThemedText type="smallBold">{request.displayName}</ThemedText>
                        <View style={styles.requestActions}>
                          <Pressable onPress={() => void acceptRequest(request)}>
                            <ThemedText type="link">Aceitar</ThemedText>
                          </Pressable>
                          <Pressable onPress={() => void declineRequest(request)}>
                            <ThemedText themeColor="textSecondary" type="link">
                              Recusar
                            </ThemedText>
                          </Pressable>
                        </View>
                      </ThemedView>
                    ))}
                  </View>
                ) : null}

                {outgoingRequests.length > 0 ? (
                  <View style={styles.requestsSection}>
                    <ThemedText type="smallBold">Pedidos enviados</ThemedText>
                    {outgoingRequests.map((request) => (
                      <ThemedView key={request.userId} style={styles.row} type="backgroundElement">
                        <ThemedText type="smallBold">{request.displayName}</ThemedText>
                        <Pressable onPress={() => void cancelRequest(request)}>
                          <ThemedText themeColor="textSecondary" type="link">
                            Cancelar
                          </ThemedText>
                        </Pressable>
                      </ThemedView>
                    ))}
                  </View>
                ) : null}

                <ThemedText type="smallBold">Amigos</ThemedText>
              </View>
            }
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

        {section === 'messages' ? (
          activeConversation ? (
            <View style={styles.threadContainer}>
              <Pressable onPress={() => setActiveConversation(null)} style={styles.backRow}>
                <ThemedText type="link">← Conversas</ThemedText>
              </Pressable>
              <ThemedText type="smallBold">{activeConversation.displayName}</ThemedText>
              <FlatList
                contentContainerStyle={styles.listContent}
                data={thread}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  threadMessage ? <ThemedText type="small">{threadMessage}</ThemedText> : null
                }
                ref={listRef}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.messageBubble,
                      {
                        alignSelf: item.mine ? 'flex-end' : 'flex-start',
                        backgroundColor: item.mine
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                      },
                    ]}
                  >
                    <ThemedText type="small">{item.body}</ThemedText>
                  </View>
                )}
              />
              <View style={styles.messageComposer}>
                <TextInput
                  onChangeText={setDraftMessage}
                  placeholder="Escreva uma mensagem…"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.messageInput, { color: theme.text }]}
                  value={draftMessage}
                />
                <Pressable
                  disabled={sendingMessage || !draftMessage.trim()}
                  onPress={() => void submitMessage()}
                  style={[
                    styles.postButton,
                    (sendingMessage || !draftMessage.trim()) && styles.postButtonDisabled,
                  ]}
                >
                  <ThemedText type="smallBold">Enviar</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <FlatList
              contentContainerStyle={styles.listContent}
              data={conversations}
              keyExtractor={(item) => item.userId}
              ListEmptyComponent={
                conversationsMessage ? (
                  <ThemedText type="small">{conversationsMessage}</ThemedText>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable onPress={() => void openConversation(item)}>
                  <ThemedView style={styles.row} type="backgroundElement">
                    <View>
                      <ThemedText type="smallBold">{item.displayName}</ThemedText>
                      {item.lastMessage ? (
                        <ThemedText themeColor="textSecondary" type="small">
                          {item.lastMessage.mine ? 'Você: ' : ''}
                          {item.lastMessage.body}
                        </ThemedText>
                      ) : null}
                    </View>
                    {item.unreadCount > 0 ? (
                      <ThemedText type="smallBold">{item.unreadCount}</ThemedText>
                    ) : null}
                  </ThemedView>
                </Pressable>
              )}
            />
          )
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
  addFriendInput: {
    borderColor: '#8888',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  addFriendRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  backRow: {
    paddingBottom: Spacing.two,
  },
  card: {
    borderRadius: Spacing.two,
    gap: Spacing.half,
    padding: Spacing.three,
  },
  composer: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  composerInput: {
    borderColor: '#8888',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 60,
    padding: Spacing.three,
    textAlignVertical: 'top',
  },
  container: {
    flex: 1,
  },
  friendsHeader: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  listContent: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
  messageBubble: {
    borderRadius: Spacing.two,
    marginVertical: Spacing.half,
    maxWidth: '80%',
    padding: Spacing.two,
  },
  messageComposer: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  messageInput: {
    borderColor: '#8888',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  poolButton: {
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  postButton: {
    alignItems: 'center',
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.two,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  requestsSection: {
    gap: Spacing.one,
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
  threadContainer: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
});
