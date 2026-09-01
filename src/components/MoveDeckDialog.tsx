import { useState, useEffect, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useGroupsStore } from "../stores/groups";
import { useDecksStore } from "../stores/decks";
import type { Group } from "../types";

interface MoveDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
  currentGroupId?: string | null;
  onSuccess?: () => void;
}

interface FlatGroupOption {
  id: string;
  name: string;
  depth: number;
}

/** Flatten group tree into indented list for display */
function flattenGroups(
  groups: Group[],
  parentId: string | null,
  depth: number
): FlatGroupOption[] {
  const result: FlatGroupOption[] = [];
  const children = groups.filter(
    (g) => (g.parent_id ?? null) === parentId
  );
  for (const g of children) {
    result.push({ id: g.id, name: g.name, depth });
    result.push(...flattenGroups(groups, g.id, depth + 1));
  }
  return result;
}

export default function MoveDeckDialog({
  open,
  onOpenChange,
  deckId,
  deckName,
  currentGroupId,
  onSuccess,
}: MoveDeckDialogProps) {
  const { groups } = useGroupsStore();
  const { updateDeck } = useDecksStore();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const flatOptions = useMemo(
    () => flattenGroups(groups, null, 0),
    [groups]
  );

  useEffect(() => {
    if (open) {
      setSelectedGroupId(null);
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  async function handleMove() {
    setSubmitting(true);
    setError("");
    try {
      // cloud_update_deck 为全字段写：带上当前描述，避免被清空
      const deck = useDecksStore.getState().decks.find((d) => d.id === deckId);
      await updateDeck(
        deckId,
        deckName,
        deck?.description ?? "",
        selectedGroupId ?? undefined
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const currentGroupName = currentGroupId
    ? groups.find((g) => g.id === currentGroupId)?.name ?? "未知分组"
    : "未分类";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-2">
            移动牌组
          </Dialog.Title>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            将「{deckName}」从
            <span className="text-[var(--text-normal)]"> {currentGroupName} </span>
            移动到其他分组
          </p>

          <label className="block text-sm text-[var(--text-muted)] mb-1">
            目标分组
          </label>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--background-modifier-border)] mb-3">
            {/* Unclassified option */}
            <button
              className={`w-full text-left px-3 py-2 text-sm transition-colors
                ${selectedGroupId === null
                  ? "bg-[var(--interactive-accent)] text-[var(--text-on-accent)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]"
                }`}
              onClick={() => setSelectedGroupId(null)}
            >
              📂 未分类
            </button>
            {flatOptions
              .filter((g) => g.id !== currentGroupId)
              .map((g) => (
                <button
                  key={g.id}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors
                    ${selectedGroupId === g.id
                      ? "bg-[var(--interactive-accent)] text-[var(--text-on-accent)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]"
                    }`}
                  style={{ paddingLeft: `${12 + g.depth * 20}px` }}
                  onClick={() => setSelectedGroupId(g.id)}
                >
                  {g.depth === 0 ? "📁" : "└📁"} {g.name}
                </button>
              ))}
            {flatOptions.filter((g) => g.id !== currentGroupId).length ===
              0 && (
              <p className="text-xs text-[var(--text-faint)] text-center py-4">
                暂无其他分组可移动
              </p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors">
                取消
              </button>
            </Dialog.Close>
            <button
              className="px-4 py-2 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-on-accent)] text-sm hover:bg-[var(--interactive-accent-hover)] transition-colors disabled:opacity-50"
              onClick={handleMove}
              disabled={submitting}
            >
              移动
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
