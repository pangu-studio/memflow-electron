import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDecksStore } from "../stores/decks";
import { useGroupsStore } from "../stores/groups";

interface CreateDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck?: {
    id: string;
    name: string;
    description: string;
    group_id?: string | null;
  };
  /** Preselected group when creating from right-click on a group */
  groupId?: string;
  onSuccess?: () => void;
}

export default function CreateDeckDialog({
  open,
  onOpenChange,
  deck,
  groupId,
  onSuccess,
}: CreateDeckDialogProps) {
  const { groups } = useGroupsStore();
  const { createDeck, updateDeck } = useDecksStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!deck;

  useEffect(() => {
    if (open) {
      if (deck) {
        setName(deck.name);
        setDescription(deck.description || "");
        setSelectedGroupId(deck.group_id ?? null);
      } else {
        setName("");
        setDescription("");
        setSelectedGroupId(groupId ?? null);
      }
      setError("");
      setSubmitting(false);
    }
  }, [open, deck, groupId]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("请输入牌组名称");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (isEdit) {
        await updateDeck(
          deck!.id,
          name.trim(),
          description.trim(),
          selectedGroupId ?? undefined
        );
      } else {
        await createDeck(
          name.trim(),
          description.trim(),
          selectedGroupId ?? undefined
        );
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-4">
            {isEdit ? "编辑牌组" : "新建牌组"}
          </Dialog.Title>

          <label className="block text-sm text-[var(--text-muted)] mb-1">
            名称
          </label>
          <input
            className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3"
            placeholder="牌组名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />

          <label className="block text-sm text-[var(--text-muted)] mb-1">
            描述
          </label>
          <textarea
            className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3 resize-none"
            placeholder="牌组描述（可选）"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="block text-sm text-[var(--text-muted)] mb-1">
            所属分组
          </label>
          <select
            className="w-full px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--interactive-accent)] mb-3"
            value={selectedGroupId ?? ""}
            onChange={(e) =>
              setSelectedGroupId(e.target.value ? e.target.value : null)
            }
          >
            <option value="">无（未分类）</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                📁 {g.name}
              </option>
            ))}
          </select>

          {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors">
                取消
              </button>
            </Dialog.Close>
            <button
              className="px-4 py-2 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-on-accent)] text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {isEdit ? "保存" : "创建"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
