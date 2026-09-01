import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useDecksStore } from "../stores/decks";
import { useGroupsStore } from "../stores/groups";
import { useMembershipStore, tierLabel } from "../stores/membership";
import { useToastStore } from "../stores/toast";

export default function DeckList() {
  const { decks, loading, loadDecks, createDeck, updateDeck, deleteDeck, exportDeck } =
    useDecksStore();
  const { groups, loadGroups } = useGroupsStore();
  const { quota, loadQuotaCache } = useMembershipStore();
  const { addToast } = useToastStore();

  const [exportingId, setExportingId] = useState<string | null>(null);

  // 导出牌组为 .mfdeck 加密包（仅供 Web 版卡片市场发布，桌面端不提供导入）
  async function handleExport(id: string) {
    if (exportingId) return;
    setExportingId(id);
    try {
      const path = await exportDeck(id);
      if (path) {
        addToast("success", `已导出：${path}。到同誉记忆官网「牌组市场」上传此包即可发布。`);
      }
    } catch (e) {
      addToast("error", `导出失败：${e}`);
    } finally {
      setExportingId(null);
    }
  }

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formGroupId, setFormGroupId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    loadDecks();
    loadGroups();
    loadQuotaCache();
  }, []);

  // Reset form
  function resetForm() {
    setFormName("");
    setFormDesc("");
    setFormGroupId(null);
    setFormError("");
  }

  // Handle create
  async function handleCreate() {
    if (!formName.trim()) {
      setFormError("请输入牌组名称");
      return;
    }
    try {
      await createDeck(formName.trim(), formDesc.trim(), formGroupId ?? undefined);
      setShowCreate(false);
      resetForm();
    } catch (e) {
      setFormError(String(e));
    }
  }

  // Handle edit
  function openEdit(id: string) {
    const deck = decks.find((d) => d.id === id);
    if (!deck) return;
    setEditId(id);
    setFormName(deck.name);
    setFormDesc(deck.description || "");
    setFormGroupId(deck.group_id ?? null);
    setShowEdit(true);
  }

  async function handleUpdate() {
    if (!editId || !formName.trim()) {
      setFormError("请输入牌组名称");
      return;
    }
    try {
      await updateDeck(
        editId,
        formName.trim(),
        formDesc.trim(),
        formGroupId ?? undefined
      );
      setShowEdit(false);
      resetForm();
    } catch (e) {
      setFormError(String(e));
    }
  }

  // Handle delete
  async function handleDelete() {
    if (!editId) return;
    try {
      await deleteDeck(editId);
      setShowDelete(false);
      resetForm();
    } catch (e) {
      setFormError(String(e));
    }
  }

  // Form UI
  function formFields() {
    return (
      <>
        <label className="block text-sm text-[var(--text-muted)] mb-1">
          名称
        </label>
        <input
          className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3"
          placeholder="牌组名称"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          autoFocus
        />
        <label className="block text-sm text-[var(--text-muted)] mb-1">
          描述
        </label>
        <textarea
          className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3 resize-none"
          placeholder="牌组描述（可选）"
          rows={3}
          value={formDesc}
          onChange={(e) => setFormDesc(e.target.value)}
        />
        <label className="block text-sm text-[var(--text-muted)] mb-1">
          所属分组
        </label>
        <select
          className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3"
          title="所属分组"
          value={formGroupId ?? ""}
          onChange={(e) =>
            setFormGroupId(e.target.value ? e.target.value : null)
          }
        >
          <option value="">无分组</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {formError && (
          <p className="text-red-400 text-sm mb-2">{formError}</p>
        )}
      </>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold text-[var(--text-normal)]">我的牌组</h1>
          {quota && quota.deck_limit > 0 && (
            <span
              className={`text-xs tabular-nums ${
                quota.deck_count >= quota.deck_limit
                  ? "text-red-400"
                  : quota.deck_count * 10 >= quota.deck_limit * 9
                    ? "text-amber-300"
                    : "text-[var(--text-muted)]"
              }`}
              title={`${tierLabel[quota.tier] ?? quota.tier}：牌组上限 ${quota.deck_limit}，每牌组卡片上限 ${quota.card_limit_per_deck || "不限"}`}
            >
              牌组 {quota.deck_count}/{quota.deck_limit}
            </span>
          )}
        </div>
        <button
          className="px-4 py-2 bg-[var(--interactive-accent)] text-[var(--text-on-accent)] rounded-lg text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors"
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
        >
          + 新建
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center text-[var(--text-muted)] py-20">
          加载中...
        </div>
      )}

      {/* Empty state */}
      {!loading && decks.length === 0 && (
        <div className="text-center text-[var(--text-muted)] py-20">
          <div className="text-5xl mb-3">📁</div>
          <p>暂无牌组，点击「新建」开始</p>
        </div>
      )}

      {/* Deck grid */}
      {!loading && decks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="group relative p-4 rounded-xl bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] hover:border-[var(--interactive-accent)] transition-colors"
            >
              <Link to={`/decks/${deck.id}`} className="block">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-[var(--text-normal)] truncate">
                    {deck.name}
                  </h3>
                  <span className="ml-2 shrink-0 text-xs px-2 py-0.5 rounded-full bg-[var(--background-modifier-hover)] text-[var(--text-muted)] tabular-nums group-hover:opacity-0 transition-opacity">
                    {deck.due_count} 待复习
                  </span>
                </div>
                {deck.description && (
                  <p className="text-sm text-[var(--text-muted)] line-clamp-2">
                    {deck.description}
                  </p>
                )}
              </Link>

              {/* Hover actions */}
              <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                {!deck.market_import_type && (
                  <button
                    className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors disabled:opacity-50"
                    onClick={(e) => {
                      e.preventDefault();
                      handleExport(deck.id);
                    }}
                    disabled={exportingId === deck.id}
                    title="导出牌组包（用于在官网牌组市场发布）"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                )}
                <button
                  className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    openEdit(deck.id);
                  }}
                  title="编辑"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  className="p-1 rounded text-[var(--text-faint)] hover:text-red-400 hover:bg-[var(--background-modifier-hover)] transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    setEditId(deck.id);
                    setShowDelete(true);
                  }}
                  title="删除"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-4">
              新建牌组
            </Dialog.Title>
            {formFields()}
            <div className="flex justify-end gap-2 mt-2">
              <Dialog.Close asChild>
                <button
                  className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors"
                  onClick={resetForm}
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-on-accent)] text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors"
                onClick={handleCreate}
              >
                创建
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Dialog */}
      <Dialog.Root open={showEdit} onOpenChange={setShowEdit}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-4">
              编辑牌组
            </Dialog.Title>
            {formFields()}
            <div className="flex justify-end gap-2 mt-2">
              <Dialog.Close asChild>
                <button
                  className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors"
                  onClick={resetForm}
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-on-accent)] text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors"
                onClick={handleUpdate}
              >
                保存
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={showDelete} onOpenChange={setShowDelete}>
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
                onClick={handleDelete}
              >
                确认删除
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
