import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAuthStore } from "../stores/auth";
import { useMarketStore, fenToYuan, type MarketDeckItem, type MarketCard, type CreatorBrief } from "../stores/market";
import { parseInsufficient } from "../stores/token";
import { useDecksStore } from "../stores/decks";
import { useToastStore } from "../stores/toast";
import { useNavigate } from "react-router-dom";

/** 创作者徽标：头像 + 昵称（无头像用首字符占位，无昵称显示匿名创作者） */
function CreatorBadge({ creator, size = "sm" }: { creator?: CreatorBrief; size?: "sm" | "md" }) {
  if (!creator) return null;
  const name = creator.nickname || "匿名创作者";
  const dim = size === "md" ? "w-6 h-6" : "w-4 h-4";
  const fontSize = size === "md" ? "text-xs" : "text-[10px]";
  return (
    <span className="flex items-center gap-1.5 min-w-0" title={`创作者：${name}`}>
      {creator.avatar_url ? (
        <img src={creator.avatar_url} alt={name} className={`${dim} rounded-full object-cover shrink-0`} />
      ) : (
        <span className={`${dim} rounded-full bg-[var(--interactive-accent)]/20 text-[var(--interactive-accent)] flex items-center justify-center ${fontSize} shrink-0`}>
          {name[0]}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

export default function Market() {
  const navigate = useNavigate();
  const { isLoggedIn, openLoginDialog } = useAuthStore();
  const { items, total, loading, loadDecks, getDeck, preview, purchase, importDeck } =
    useMarketStore();
  const { addToast } = useToastStore();

  const [keyword, setKeyword] = useState("");
  const [pricingType, setPricingType] = useState("");
  const [sort, setSort] = useState<"sales" | "latest">("sales");

  const [detail, setDetail] = useState<MarketDeckItem | null>(null);
  const [owned, setOwned] = useState(false);
  const [cards, setCards] = useState<MarketCard[]>([]);
  const [full, setFull] = useState(false);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (isLoggedIn) loadDecks({ sort });
  }, [isLoggedIn, sort, loadDecks]);

  const openDetail = async (deck: MarketDeckItem) => {
    setDetail(deck);
    setCards([]);
    setFlipped({});
    try {
      const [d, p] = await Promise.all([getDeck(deck.id), preview(deck.id)]);
      setOwned(d.owned);
      setCards(p.cards);
      setFull(p.full);
    } catch (e) {
      addToast("error", String(e) || "加载详情失败");
    }
  };

  const handlePurchase = async () => {
    if (!detail || acting) return;
    setActing(true);
    try {
      await purchase(detail.id);
      addToast("success", detail.pricing_type === "free" ? "领取成功" : "购买成功");
      setOwned(true);
    } catch (e) {
      const insufficient = parseInsufficient(e);
      if (insufficient) {
        addToast("error", `灵光点不足（当前 ${insufficient.balance}，需要 ${insufficient.required}），请先充值`);
        navigate("/wallet");
      } else {
        addToast("error", String(e) || "购买失败");
      }
    } finally {
      setActing(false);
    }
  };

  const handleImport = async () => {
    if (!detail || acting) return;
    setActing(true);
    try {
      const imported = await importDeck(detail.id);
      addToast("success", `「${imported.name}」已导入`);
      setDetail(null);
      // 市场卡组由云端创建，刷新牌组列表即可见
      await useDecksStore.getState().loadDecks();
      navigate(`/decks/${imported.id}`);
    } catch (e) {
      addToast("error", String(e) || "导入失败");
    } finally {
      setActing(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-[var(--text-normal)] mb-6">卡片市场</h1>
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-10 text-center">
            <p className="text-[var(--text-muted)] mb-4">登录后即可浏览并购买市场卡组</p>
            <button
              onClick={() => openLoginDialog()}
              className="px-6 py-2.5 rounded-lg text-sm font-medium bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:opacity-90"
            >
              登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-[var(--text-normal)]">卡片市场</h1>
          <div className="flex items-center gap-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadDecks({ keyword, pricingType, sort })}
              placeholder="搜索卡组"
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-normal)] w-48"
            />
            <button
              onClick={() => setSort(sort === "sales" ? "latest" : "sales")}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            >
              {sort === "sales" ? "最畅销" : "最新"}
            </button>
            <button
              onClick={() => {
                const next = pricingType === "free" ? "" : "free";
                setPricingType(next);
                loadDecks({ keyword, pricingType: next, sort });
              }}
              className={`px-3 py-1.5 text-xs rounded-lg border ${
                pricingType === "free"
                  ? "border-[var(--interactive-accent)] text-[var(--interactive-accent)]"
                  : "border-[var(--background-modifier-border)] text-[var(--text-muted)]"
              }`}
            >
              免费
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">加载中...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">市场暂无卡组，敬请期待</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map((deck) => (
              <button
                key={deck.id}
                onClick={() => openDetail(deck)}
                className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5 text-left hover:border-[var(--interactive-accent)] transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--text-normal)] flex-1 mr-2">
                    {deck.title}
                  </h3>
                  {deck.pricing_type === "free" ? (
                    <span className="text-xs font-semibold text-green-400">免费</span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-400">
                      ¥{fenToYuan(deck.price)}
                    </span>
                  )}
                </div>
                {deck.description && (
                  <p className="text-xs text-[var(--text-muted)] mb-3 line-clamp-2">
                    {deck.description}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-[var(--text-faint)]">
                  <CreatorBadge creator={deck.creator} />
                  {deck.category && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--interactive-accent)]/10 text-[var(--interactive-accent)]">
                      {deck.category}
                    </span>
                  )}
                  <span>{deck.card_count} 张</span>
                  <span>已售 {deck.sales_count}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {total > items.length && (
          <p className="text-xs text-[var(--text-faint)] mt-4 text-center">共 {total} 个卡组</p>
        )}
      </div>

      {/* 详情弹窗 */}
      <Dialog.Root open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[80vh] overflow-y-auto rounded-xl bg-[var(--background-primary)] border border-[var(--background-modifier-border)] shadow-[var(--shadow-modal)] p-6">
            {detail && (
              <>
                <div className="flex items-start justify-between mb-2">
                  <Dialog.Title className="text-base font-semibold text-[var(--text-normal)] flex-1 mr-3">
                    {detail.title}
                  </Dialog.Title>
                  {detail.pricing_type === "free" ? (
                    <span className="text-sm font-semibold text-green-400">免费</span>
                  ) : (
                    <span className="text-sm font-semibold text-amber-400">
                      ¥{fenToYuan(detail.price)}
                    </span>
                  )}
                </div>
                <Dialog.Description className="text-xs text-[var(--text-muted)] mb-4">
                  {detail.card_count} 张卡片 · 已售 {detail.sales_count} · v{detail.version}
                </Dialog.Description>
                {detail.creator && (
                  <div className="flex items-center gap-2 mb-4 text-xs text-[var(--text-muted)]">
                    <CreatorBadge creator={detail.creator} size="md" />
                  </div>
                )}
                {detail.description && (
                  <p className="text-sm text-[var(--text-muted)] mb-4">{detail.description}</p>
                )}

                <h3 className="text-sm font-medium text-[var(--text-normal)] mb-2">
                  {full ? "全部卡片" : `内容预览（前 ${cards.length} 张）`}
                </h3>
                <div className="space-y-2 mb-5">
                  {cards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => setFlipped((prev) => ({ ...prev, [card.id]: !prev[card.id] }))}
                      className="w-full text-left rounded-lg border border-[var(--background-modifier-border)] p-3 hover:border-[var(--interactive-accent)]/50"
                    >
                      <p className="text-sm text-[var(--text-normal)]">{card.front}</p>
                      {flipped[card.id] ? (
                        <p className="text-xs text-[var(--text-muted)] mt-2 pt-2 border-t border-[var(--background-modifier-border)]">
                          {card.back}
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--text-faint)] mt-1">点击查看答案</p>
                      )}
                    </button>
                  ))}
                  {!full && !owned && (
                    <p className="text-xs text-[var(--text-faint)] text-center py-2">
                      购买后查看全部 {detail.card_count} 张卡片
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  {owned ? (
                    <button
                      onClick={handleImport}
                      disabled={acting}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:opacity-90 disabled:opacity-50"
                    >
                      {acting ? "导入中..." : "导入到我的牌组"}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate("/wallet")}
                        className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-[var(--interactive-accent)]/30 text-[var(--interactive-accent)] hover:bg-[var(--interactive-accent)]/10"
                      >
                        充值灵光点
                      </button>
                      <button
                        onClick={handlePurchase}
                        disabled={acting}
                        className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:opacity-90 disabled:opacity-50"
                      >
                        {acting
                          ? "处理中..."
                          : detail.pricing_type === "free"
                            ? "免费领取"
                            : `¥${fenToYuan(detail.price)} 购买`}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
