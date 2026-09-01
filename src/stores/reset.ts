import { useDecksStore } from "./decks";
import { useCardsStore } from "./cards";
import { useStatsStore } from "./stats";
import { useMembershipStore } from "./membership";
import { useTagsStore } from "./tags";
import { useGroupsStore } from "./groups";
import { useMarketStore } from "./market";
import { useTokenStore } from "./token";
import { useSettingsStore } from "./settings";

/**
 * 切换/登出账号时集中重置账号相关的 store。
 * 账号无关的不动：apiEnv（环境覆盖）、toast、ui、membership.plans（全局方案）。
 * settings 整个 store 都是云端按账号拉取的复习设置（FSRS 参数/desired_retention），
 * 必须重置——错账号参数会算错调度。
 */
export function resetAccountScopedStores() {
  useDecksStore.setState({
    decks: [],
    currentDeck: null,
    loading: false,
    error: null,
  });
  useCardsStore.setState({
    cards: [],
    total: 0,
    selectedCard: null,
    searchResults: [],
    loading: false,
    error: null,
    cardsLoadedDeckId: null,
    pendingFocusCardId: null,
  });
  useStatsStore.setState({ stats: null, loading: false, scopeDeckId: null });
  useMembershipStore.setState({
    subscription: null,
    quota: null,
    loading: false,
    subscribing: false,
  });
  useTagsStore.setState({ tags: [], loaded: false, loading: false, error: null });
  useGroupsStore.setState({ groups: [], loading: false, error: null });
  useMarketStore.setState({ items: [], total: 0, loading: false });
  useTokenStore.setState({
    balance: null,
    packages: [],
    transactions: [],
    loading: false,
  });
  useSettingsStore.setState({ settings: null, loading: false, error: null });
}
