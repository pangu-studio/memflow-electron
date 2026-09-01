import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useDecksStore } from "../stores/decks";
import { useToastStore } from "../stores/toast";
import { useCardsStore } from "../stores/cards";
import { useMembershipStore } from "../stores/membership";
import { useUIStore, type CardViewMode } from "../stores/ui";
import MarkdownEditor from "../components/MarkdownEditor";
import CardPreviewDialog from "../components/CardPreviewDialog";
import TagInput from "../components/TagInput";
import { maskCloze, revealCloze } from "../utils/cloze";
import type { Card } from "../types";

export default function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { currentDeck, loading: deckLoading, loadDeck, deleteDeck, exportDeck } =
    useDecksStore();
  const {
    cards,
    total,
    loading: cardsLoading,
    loadingMore,
    loadCardsByDeck,
    loadMoreCards,
    createCard,
    updateCard,
    deleteCard,
    selectCard,
    selectedCard,
    cardsLoadedDeckId,
    pendingFocusCardId,
    clearPendingFocusCard,
  } = useCardsStore();
  const { cardViewMode, setCardViewMode } = useUIStore();
  const { quota, loadQuotaCache } = useMembershipStore();
  const { addToast } = useToastStore();

  // 导出牌组为 .mfdeck 加密包（仅供 Web 版卡片市场发布，桌面端不提供导入）
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!currentDeck || exporting) return;
    setExporting(true);
    try {
      const path = await exportDeck(currentDeck.id);
      if (path) {
        addToast("success", `已导出：${path}。到同誉记忆官网「牌组市场」上传此包即可发布。`);
      }
    } catch (e) {
      addToast("error", `导出失败：${e}`);
    } finally {
      setExporting(false);
    }
  };

  // Load-more paging: how many cards to render at a time in the full list.
  const PAGE_SIZE = 12;
  // focusCardId: when set (arriving from search), the list is filtered to that
  // single card. Cleared via "查看全部" to return to the full paginated list.
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Card form
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [showEditCard, setShowEditCard] = useState(false);
  const [showDeleteCard, setShowDeleteCard] = useState(false);
  const [editCardId, setEditCardId] = useState<string | null>(null);
  const [cardFormFront, setCardFormFront] = useState("");
  const [cardFormBack, setCardFormBack] = useState("");
  const [cardFormType, setCardFormType] = useState<"qa" | "cloze">("qa");
  const [cardFormTags, setCardFormTags] = useState<string[]>([]);
  const [cardFormError, setCardFormError] = useState("");

  // 卡片预览（列表项预览按钮 / 编辑对话框预览按钮共用，样式同复习页）
  const [previewCard, setPreviewCard] = useState<{
    front: string;
    back: string;
  } | null>(null);

  // Deck form
  const [showEditDeck, setShowEditDeck] = useState(false);
  const [showDeleteDeck, setShowDeleteDeck] = useState(false);
  const [deckFormName, setDeckFormName] = useState("");
  const [deckFormDesc, setDeckFormDesc] = useState("");
  const [deckFormError, setDeckFormError] = useState("");

  useEffect(() => {
    if (id) {
      loadDeck(id);
      loadCardsByDeck(id);
    }
    loadQuotaCache();
  }, [id]);

  // Reset the view (focus filter + paging) whenever the deck changes.
  useEffect(() => {
    setFocusCardId(null);
    setVisibleCount(PAGE_SIZE);
    // 清空上一个牌组的选中卡片，避免右侧信息栏残留旧牌组内容；
    // 从搜索跳转的场景由下方 pendingFocusCardId effect 随后重新选中目标卡
    selectCard(null);
  }, [id]);

  // Resolve a focus requested from the search panel once this deck's cards are
  // loaded: filter the list to that card and surface its properties. The
  // cardsLoadedDeckId === id gate guards against the previous deck's stale cards
  // still being in the store right after navigation.
  useEffect(() => {
    if (!pendingFocusCardId || !id) return;
    if (cardsLoadedDeckId !== id) return;
    const target = cards.find((c) => c.id === pendingFocusCardId) ?? null;
    setFocusCardId(target ? target.id : null);
    selectCard(target);
    clearPendingFocusCard();
  }, [
    pendingFocusCardId,
    cardsLoadedDeckId,
    id,
    cards,
    selectCard,
    clearPendingFocusCard,
  ]);

  const loading = deckLoading || cardsLoading;

  // Cards actually shown: filtered to the focused card (from search) or the
  // first `visibleCount` of the full list (load-more paging).
  const displayedCards = focusCardId
    ? cards.filter((c) => c.id === focusCardId)
    : cards.slice(0, visibleCount);
  // 本地还有未展示的，或云端还有未拉取的（cards < total），都算"有更多"
  const hasMore =
    !focusCardId && (visibleCount < cards.length || cards.length < total);

  // 先展开本地已加载的；本地用尽且云端还有剩余时，拉取下一页
  function handleLoadMore() {
    const next = visibleCount + PAGE_SIZE;
    setVisibleCount(next);
    if (id && next > cards.length && cards.length < total) {
      loadMoreCards(id);
    }
  }

  function resetCardForm() {
    setCardFormFront("");
    setCardFormBack("");
    setCardFormType("qa");
    setCardFormTags([]);
    setCardFormError("");
  }

  async function handleCreateCard() {
    if (!cardFormFront.trim() || !cardFormBack.trim()) {
      setCardFormError("请输入正面和反面内容");
      return;
    }
    if (!id) return;
    try {
      await createCard(id, cardFormFront.trim(), cardFormBack.trim(), cardFormType, cardFormTags);
      setShowCreateCard(false);
      resetCardForm();
    } catch (e) {
      setCardFormError(String(e));
    }
  }

  function openEditCard(card: Card) {
    setEditCardId(card.id);
    setCardFormFront(card.front);
    setCardFormBack(card.back);
    setCardFormType(card.card_type);
    setCardFormTags(card.tags ?? []);
    setShowEditCard(true);
  }

  async function handleUpdateCard() {
    if (!editCardId || !cardFormFront.trim() || !cardFormBack.trim()) {
      setCardFormError("请输入正面和反面内容");
      return;
    }
    try {
      await updateCard(
        editCardId,
        cardFormFront.trim(),
        cardFormBack.trim(),
        cardFormType,
        cardFormTags
      );
      setShowEditCard(false);
      resetCardForm();
    } catch (e) {
      setCardFormError(String(e));
    }
  }

  async function handleDeleteCard() {
    if (!editCardId) return;
    try {
      await deleteCard(editCardId);
      setShowDeleteCard(false);
    } catch (e) {
      setCardFormError(String(e));
    }
  }

  // Deck editing
  function openEditDeck() {
    if (!currentDeck) return;
    setDeckFormName(currentDeck.name);
    setDeckFormDesc(currentDeck.description || "");
    setDeckFormError("");
    setShowEditDeck(true);
  }

  async function handleUpdateDeck() {
    if (!id || !deckFormName.trim()) {
      setDeckFormError("请输入牌组名称");
      return;
    }
    try {
      const { updateDeck } = useDecksStore.getState();
      await updateDeck(id, deckFormName.trim(), deckFormDesc.trim());
      setShowEditDeck(false);
    } catch (e) {
      setDeckFormError(String(e));
    }
  }

  async function handleDeleteDeck() {
    if (!id) return;
    try {
      await deleteDeck(id);
      navigate("/decks");
    } catch (e) {
      setDeckFormError(String(e));
    }
  }

  return (
    <div className="p-6">
      {/* Back link */}
      <Link
        to="/decks"
        className="text-sm text-[var(--text-accent)] hover:text-[var(--text-accent-hover)] mb-4 inline-block transition-colors"
      >
        ← 返回
      </Link>

      {/* Loading */}
      {loading && (
        <div className="text-center text-[var(--text-muted)] py-20">
          加载中...
        </div>
      )}

      {/* Deck header */}
      {!loading && currentDeck && (
        <>
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-[var(--text-normal)]">
                  {currentDeck.name}
                </h1>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-[var(--background-modifier-hover)] text-[var(--text-muted)] tabular-nums">
                  {total} 张卡片
                </span>
                {quota && quota.card_limit_per_deck > 0 && (
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      total >= quota.card_limit_per_deck
                        ? "text-red-400"
                        : total * 10 >= quota.card_limit_per_deck * 9
                          ? "text-amber-300"
                          : "text-[var(--text-faint)]"
                    }`}
                    title={`当前会员每牌组卡片上限 ${quota.card_limit_per_deck}`}
                  >
                    配额 {total}/{quota.card_limit_per_deck}
                  </span>
                )}
                {currentDeck.suspended && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-[var(--background-modifier-hover)] text-[var(--text-faint)]">
                    ⏸️ 已暂停复习
                  </span>
                )}
                <button
                  className="shrink-0 text-xs px-3 py-1 rounded-full bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:bg-[var(--interactive-accent-hover)] transition-colors"
                  onClick={() => navigate(`/?deck=${currentDeck.id}`)}
                >
                  📖 复习此牌组
                </button>
              </div>
              {currentDeck.description && (
                <p className="text-sm text-[var(--text-muted)]">
                  {currentDeck.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-4">
              {!currentDeck.market_import_type && (
                <button
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors disabled:opacity-50"
                  onClick={handleExport}
                  disabled={exporting}
                  title="导出牌组包（用于在官网牌组市场发布）"
                >
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              )}
              <button
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={openEditDeck}
                title="编辑牌组"
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={() => setShowDeleteDeck(true)}
                title="删除牌组"
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Toolbar: add card + view toggle */}
          <div className="mb-4 flex items-center justify-between">
            <button
              className="px-4 py-2 bg-[var(--interactive-accent)] text-[var(--text-on-accent)] rounded-lg text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors"
              onClick={() => {
                resetCardForm();
                setShowCreateCard(true);
              }}
            >
              + 新建卡片
            </button>

            {/* List / Grid view toggle */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--background-modifier-hover)]">
              <button
                onClick={() => setCardViewMode("list")}
                title="列表视图"
                className={`p-1.5 rounded-md transition-colors ${cardViewMode === "list"
                  ? "bg-[var(--background-secondary)] text-[var(--text-normal)]"
                  : "text-[var(--text-faint)] hover:text-[var(--text-normal)]"
                  }`}
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
              <button
                onClick={() => setCardViewMode("grid")}
                title="卡片视图"
                className={`p-1.5 rounded-md transition-colors ${cardViewMode === "grid"
                  ? "bg-[var(--background-secondary)] text-[var(--text-normal)]"
                  : "text-[var(--text-faint)] hover:text-[var(--text-normal)]"
                  }`}
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
            </div>
          </div>

          {/* Card list */}
          {cards.length === 0 ? (
            <div className="text-center text-[var(--text-muted)] py-16">
              <div className="text-4xl mb-2">🗂️</div>
              <p>暂无卡片，点击「新建卡片」开始添加</p>
            </div>
          ) : (
            <>
              {/* Focus banner: arrived from search, showing only the matched card */}
              {focusCardId && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-modifier-hover)] px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-[var(--text-muted)]">
                    仅显示搜索命中的卡片：
                    <span className="ml-1 text-[var(--text-normal)]">
                      {displayedCards[0]?.front ?? ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusCardId(null);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--background-modifier-border)] hover:text-[var(--text-normal)] transition-colors"
                  >
                    ✕ 查看全部
                  </button>
                </div>
              )}

              <div
                className={
                  cardViewMode === "grid"
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                    : "space-y-2"
                }
              >
                {displayedCards.map((card) => (
                  <CardItem
                    key={card.id}
                    card={card}
                    viewMode={cardViewMode}
                    isSelected={selectedCard?.id === card.id}
                    onSelect={() => selectCard(card)}
                    onEdit={openEditCard}
                    onPreview={(c) =>
                      setPreviewCard({ front: c.front, back: c.back })
                    }
                    onDelete={(cid) => {
                      setEditCardId(cid);
                      setShowDeleteCard(true);
                    }}
                  />
                ))}
              </div>

              {/* Load more: 本地展开 + 用尽后自动拉取云端下一页 */}
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-lg border border-[var(--background-modifier-border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--interactive-accent)] hover:text-[var(--text-normal)] transition-colors disabled:opacity-50"
                  >
                    {loadingMore
                      ? "加载中..."
                      : `加载更多（剩余 ${Math.max(0, total - visibleCount)} 张）`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Create Card Dialog */}
      <Dialog.Root open={showCreateCard} onOpenChange={setShowCreateCard}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)] overflow-y-auto bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-4">
              新建卡片
            </Dialog.Title>
            <CardFormFields
              front={cardFormFront}
              back={cardFormBack}
              cardType={cardFormType}
              tags={cardFormTags}
              error={cardFormError}
              onFrontChange={setCardFormFront}
              onBackChange={setCardFormBack}
              onTypeChange={setCardFormType}
              onTagsChange={setCardFormTags}
            />
            <div className="flex justify-end gap-2 mt-2">
              <Dialog.Close asChild>
                <button
                  className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors"
                  onClick={resetCardForm}
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-on-accent)] text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors"
                onClick={handleCreateCard}
              >
                创建
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Card Dialog */}
      <Dialog.Root open={showEditCard} onOpenChange={setShowEditCard}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)] overflow-y-auto bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-4">
              编辑卡片
            </Dialog.Title>
            <CardFormFields
              front={cardFormFront}
              back={cardFormBack}
              cardType={cardFormType}
              tags={cardFormTags}
              error={cardFormError}
              onFrontChange={setCardFormFront}
              onBackChange={setCardFormBack}
              onTypeChange={setCardFormType}
              onTagsChange={setCardFormTags}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                className="mr-auto px-4 py-2 rounded-lg text-sm border border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={() =>
                  setPreviewCard({ front: cardFormFront, back: cardFormBack })
                }
              >
                预览
              </button>
              <Dialog.Close asChild>
                <button
                  className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors"
                  onClick={resetCardForm}
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-on-accent)] text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors"
                onClick={handleUpdateCard}
              >
                保存
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Card Dialog */}
      <Dialog.Root open={showDeleteCard} onOpenChange={setShowDeleteCard}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-2">
              确认删除
            </Dialog.Title>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              删除卡片将同时删除其复习状态和复习日志，此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors">
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
                onClick={handleDeleteCard}
              >
                确认删除
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Deck Dialog */}
      <Dialog.Root open={showEditDeck} onOpenChange={setShowEditDeck}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-4">
              编辑牌组
            </Dialog.Title>
            <label className="block text-sm text-[var(--text-muted)] mb-1">名称</label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3"
              placeholder="请输入牌组名称"
              value={deckFormName}
              onChange={(e) => setDeckFormName(e.target.value)}
              autoFocus
            />
            <label htmlFor="deck-description" className="block text-sm text-[var(--text-muted)] mb-1">描述</label>
            <textarea
              id="deck-description"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3 resize-none"
              placeholder="请输入牌组描述"
              rows={3}
              value={deckFormDesc}
              onChange={(e) => setDeckFormDesc(e.target.value)}
            />
            {deckFormError && (
              <p className="text-red-400 text-sm mb-2">{deckFormError}</p>
            )}
            <div className="flex justify-end gap-2 mt-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors">
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-on-accent)] text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors"
                onClick={handleUpdateDeck}
              >
                保存
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Deck Dialog */}
      <Dialog.Root open={showDeleteDeck} onOpenChange={setShowDeleteDeck}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-2">
              确认删除
            </Dialog.Title>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              删除牌组将同时删除其中所有卡片和复习数据，此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors">
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
                onClick={handleDeleteDeck}
              >
                确认删除
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 卡片预览弹窗（列表项 / 编辑对话框的预览入口共用） */}
      <CardPreviewDialog
        open={previewCard !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewCard(null);
        }}
        front={previewCard?.front ?? ""}
        back={previewCard?.back ?? ""}
      />
    </div>
  );
}

/* ── Card item (list / grid) ─── */
function CardItem({
  card,
  viewMode,
  isSelected,
  onSelect,
  onEdit,
  onPreview,
  onDelete,
}: {
  card: Card;
  viewMode: CardViewMode;
  isSelected?: boolean;
  onSelect?: () => void;
  onEdit: (card: Card) => void;
  onPreview: (card: Card) => void;
  onDelete: (id: string) => void;
}) {
  const isGrid = viewMode === "grid";

  // Shared badges (type + tags) — identical in both modes
  const badges = (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--background-modifier-hover)] text-[var(--text-faint)]">
        {card.card_type === "cloze" ? "填空" : "问答"}
      </span>
      {(card.tags ?? []).map((t) => (
        <span
          key={t}
          className="text-xs px-1.5 py-0.5 rounded bg-[var(--background-modifier-hover)] text-[var(--text-muted)]"
        >
          #{t}
        </span>
      ))}
    </div>
  );

  // Shared action buttons — wrapper differs by mode
  const actionButtons = (
    <>
      <button
        className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onPreview(card);
        }}
        title="预览"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button
        className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        onClick={() => onEdit(card)}
        title="编辑"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        className="p-1 rounded text-[var(--text-faint)] hover:text-red-400 hover:bg-[var(--background-modifier-hover)] transition-colors"
        onClick={() => onDelete(card.id)}
        title="删除"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </>
  );

  return (
    <div
      onClick={onSelect}
      className={
        isGrid
          ? `group p-4 rounded-xl bg-[var(--background-secondary)] border transition-colors cursor-pointer ${isSelected
            ? "border-[var(--interactive-accent)] ring-1 ring-[var(--interactive-accent)]"
            : "border-[var(--background-modifier-border)] hover:border-[var(--interactive-accent)]"
          }`
          : `group p-4 rounded-lg bg-[var(--background-secondary)] border transition-colors cursor-pointer ${isSelected
            ? "border-[var(--interactive-accent)] ring-1 ring-[var(--interactive-accent)]"
            : "border-[var(--background-modifier-border)] hover:border-[var(--background-modifier-border-hover)]"
          }`
      }
    >
      {isGrid ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text-normal)] line-clamp-2">
            {card.front}
          </p>
          <p className="text-sm text-[var(--text-muted)] line-clamp-2">
            {card.back}
          </p>
          <div className="flex items-center justify-between gap-2">
            {badges}
            <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {actionButtons}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 space-y-1 mr-4">
            <p className="text-sm font-medium text-[var(--text-normal)] truncate">
              {card.front}
            </p>
            <p className="text-sm text-[var(--text-muted)] truncate">
              {card.back}
            </p>
            {badges}
          </div>
          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
            {actionButtons}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card form fields ─── */
function CardFormFields({
  front,
  back,
  cardType,
  tags,
  error,
  onFrontChange,
  onBackChange,
  onTypeChange,
  onTagsChange,
}: {
  front: string;
  back: string;
  cardType: string;
  tags: string[];
  error: string;
  onFrontChange: (v: string) => void;
  onBackChange: (v: string) => void;
  onTypeChange: (v: "qa" | "cloze") => void;
  onTagsChange: (v: string[]) => void;
}) {
  return (
    <>
      <label className="block text-sm text-[var(--text-muted)] mb-1">类型</label>
      <select
        className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3"
        value={cardType}
        onChange={(e) => onTypeChange(e.target.value as "qa" | "cloze")}
        title="卡片类型"
      >
        <option value="qa">问答</option>
        <option value="cloze">填空</option>
      </select>
      <label className="block text-sm text-[var(--text-muted)] mb-1">标签</label>
      <div className="mb-3">
        <TagInput value={tags} onChange={onTagsChange} />
      </div>
      <label className="block text-sm text-[var(--text-muted)] mb-1">正面</label>
      <MarkdownEditor
        value={front}
        onChange={onFrontChange}
        autoFocus
        placeholder="问题或填空模板（{{答案}} 无编号=整卡一次评分；{{c1::答案}}{{c2::答案}} 编号=一空一卡独立调度；可加 ::提示；支持 Markdown）"
        previewTransform={cardType === "cloze" ? maskCloze : undefined}
      />
      <label className="block text-sm text-[var(--text-muted)] mb-1 mt-3">反面</label>
      <MarkdownEditor
        value={back}
        onChange={onBackChange}
        placeholder="答案（支持 Markdown 富文本）"
        previewTransform={cardType === "cloze" ? revealCloze : undefined}
      />
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
    </>
  );
}
