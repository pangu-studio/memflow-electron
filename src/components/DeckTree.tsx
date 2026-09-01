import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useDecksStore } from "../stores/decks";
import { useGroupsStore } from "../stores/groups";
import { useToastStore } from "../stores/toast";
import CreateGroupDialog from "./CreateGroupDialog";
import CreateDeckDialog from "./CreateDeckDialog";
import MoveDeckDialog from "./MoveDeckDialog";
import type { TreeNodeData } from "../types";

/* ── Build tree from flat lists ──────────── */
function buildTree(
  groups: { id: string; name: string; parent_id?: string | null }[],
  decks: { id: string; name: string; group_id?: string | null; due_count: number; suspended?: boolean }[]
): TreeNodeData[] {
  const groupNodes = new Map<string, TreeNodeData>();

  // Create group nodes
  for (const g of groups) {
    groupNodes.set(g.id, {
      id: g.id,
      name: g.name,
      type: "group",
      children: [],
    });
  }

  // Attach children groups
  const rootNodes: TreeNodeData[] = [];
  for (const g of groups) {
    const node = groupNodes.get(g.id)!;
    if (g.parent_id && groupNodes.has(g.parent_id)) {
      groupNodes.get(g.parent_id)!.children!.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // Attach decks
  for (const d of decks) {
    const deckNode: TreeNodeData = {
      id: d.id,
      name: d.name,
      type: "deck",
      count: d.due_count,
      suspended: d.suspended,
    };
    if (d.group_id && groupNodes.has(d.group_id)) {
      groupNodes.get(d.group_id)!.children!.push(deckNode);
    } else {
      rootNodes.push(deckNode);
    }
  }

  // Aggregate due counts for groups (含子分组)
  const aggregateDue = (node: TreeNodeData): number => {
    let sum = node.type === "deck" ? node.count ?? 0 : 0;
    for (const c of node.children ?? []) sum += aggregateDue(c);
    node.count = sum;
    return sum;
  };
  for (const root of rootNodes) aggregateDue(root);

  return rootNodes;
}

/* ── Row actions passed down the tree ────── */
interface TreeActions {
  onNewRootGroup: () => void;
  onNewSubgroup: (groupId: string) => void;
  onNewDeckInGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string, groupName: string) => void;
  onReviewDeck: (deckId: string) => void;
  onToggleSuspend: (deckId: string) => void;
  onMoveDeck: (deckId: string) => void;
  onRenameDeck: (deckId: string) => void;
  onDeleteDeck: (deckId: string, deckName: string) => void;
}

type NodeKind = "sidebar" | "group" | "deck";

/* ── Shared context menu (Radix) ─────────── */
function MenuItem({
  className = "",
  ...props
}: ContextMenu.ContextMenuItemProps) {
  return (
    <ContextMenu.Item
      className={`px-3 py-1.5 text-sm outline-none cursor-default transition-colors text-[var(--text-normal)] data-[highlighted]:bg-[var(--background-modifier-hover)] ${className}`}
      {...props}
    />
  );
}

function MenuSeparator() {
  return (
    <ContextMenu.Separator className="my-0.5 h-px bg-[var(--background-modifier-border)]" />
  );
}

const menuContentClass =
  "z-50 w-44 py-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] shadow-xl";

function NodeContextMenu({
  type,
  id,
  name,
  suspended,
  actions,
  children,
}: {
  type: NodeKind;
  id: string;
  name: string;
  suspended?: boolean;
  actions: TreeActions;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClass}>
          {type === "group" ? (
            <>
              <MenuItem onSelect={() => actions.onNewSubgroup(id)}>
                📂 新建子分组
              </MenuItem>
              <MenuItem onSelect={() => actions.onNewDeckInGroup(id)}>
                📄 新建卡牌组
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => actions.onRenameGroup(id)}>
                ✏️ 重命名
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                className="text-red-400"
                onSelect={() => actions.onDeleteGroup(id, name)}
              >
                🗑️ 删除
              </MenuItem>
            </>
          ) : type === "deck" ? (
            <>
              <MenuItem onSelect={() => actions.onReviewDeck(id)}>
                📖 复习此牌组
              </MenuItem>
              <MenuItem onSelect={() => actions.onToggleSuspend(id)}>
                {suspended ? "▶️ 恢复复习" : "⏸️ 暂停复习"}
              </MenuItem>
              <MenuItem onSelect={() => actions.onMoveDeck(id)}>
                📂 移动到其他分组
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => actions.onRenameDeck(id)}>
                ✏️ 重命名
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                className="text-red-400"
                onSelect={() => actions.onDeleteDeck(id, name)}
              >
                🗑️ 删除
              </MenuItem>
            </>
          ) : null}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/* ── Due count badge ─────────────────────── */
function DueBadge({ count, isGroup }: { count?: number; isGroup: boolean }) {
  if (count === undefined || count <= 0) return null;
  return (
    <span
      className="mr-1 text-xs text-[var(--text-faint)] tabular-nums shrink-0"
      title={isGroup ? `该分组（含子分组）今日待复习 ${count} 张` : `今日待复习 ${count} 张`}
    >
      {count}
    </span>
  );
}

/* ── Main component ──────────────────────── */
export default function DeckTree() {
  const { decks, loadDecks, deleteDeck, setDeckSuspended } = useDecksStore();
  const navigate = useNavigate();
  const { groups, loadGroups, deleteGroup } = useGroupsStore();
  const addToast = useToastStore((s) => s.addToast);

  const tree = useMemo(() => buildTree(groups, decks), [groups, decks]);

  // Group dialog state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [editGroup, setEditGroup] = useState<
    { id: string; name: string; description: string; parent_id?: string | null } | undefined
  >();
  const [showEditGroup, setShowEditGroup] = useState(false);

  // Deck dialog state
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [createDeckGroupId, setCreateDeckGroupId] = useState<string | undefined>();
  const [editDeck, setEditDeck] = useState<
    { id: string; name: string; description: string; group_id?: string | null } | undefined
  >();
  const [showEditDeck, setShowEditDeck] = useState(false);

  // Move deck dialog
  const [showMoveDeck, setShowMoveDeck] = useState(false);
  const [moveDeckTarget, setMoveDeckTarget] = useState<{
    id: string;
    name: string;
    groupId?: string | null;
  } | null>(null);

  // Delete dialogs
  const [showDeleteGroup, setShowDeleteGroup] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteGroupError, setDeleteGroupError] = useState("");

  const [showDeleteDeck, setShowDeleteDeck] = useState(false);
  const [deleteDeckTarget, setDeleteDeckTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteDeckError, setDeleteDeckError] = useState("");

  useEffect(() => {
    loadGroups();
    loadDecks();
  }, []);

  /* ── Tree row actions ───────────────────── */
  const actions: TreeActions = {
    onNewRootGroup: () => {
      setCreateParentId(undefined);
      setShowCreateGroup(true);
    },
    onNewSubgroup: (groupId) => {
      setCreateParentId(groupId);
      setShowCreateGroup(true);
    },
    onNewDeckInGroup: (groupId) => {
      setCreateDeckGroupId(groupId);
      setShowCreateDeck(true);
    },
    onRenameGroup: (groupId) => {
      const g = groups.find((g) => g.id === groupId);
      if (g) {
        setEditGroup({
          id: g.id,
          name: g.name,
          description: g.description || "",
          parent_id: g.parent_id,
        });
        setShowEditGroup(true);
      }
    },
    onDeleteGroup: (groupId, groupName) => {
      setDeleteGroupTarget({ id: groupId, name: groupName });
      setDeleteGroupError("");
      setShowDeleteGroup(true);
    },
    onReviewDeck: (deckId) => {
      navigate(`/?deck=${deckId}`);
    },
    onToggleSuspend: async (deckId) => {
      const d = decks.find((d) => d.id === deckId);
      if (!d) return;
      try {
        await setDeckSuspended(deckId, !d.suspended);
      } catch (e) {
        addToast("error", `操作失败：${String(e)}`);
      }
    },
    onMoveDeck: (deckId) => {
      const d = decks.find((d) => d.id === deckId);
      if (!d) return;
      setMoveDeckTarget({
        id: d.id,
        name: d.name,
        groupId: d.group_id,
      });
      setShowMoveDeck(true);
    },
    onRenameDeck: (deckId) => {
      const d = decks.find((d) => d.id === deckId);
      if (d) {
        setEditDeck({
          id: d.id,
          name: d.name,
          description: d.description || "",
          group_id: d.group_id,
        });
        setShowEditDeck(true);
      }
    },
    onDeleteDeck: (deckId, deckName) => {
      setDeleteDeckTarget({ id: deckId, name: deckName });
      setDeleteDeckError("");
      setShowDeleteDeck(true);
    },
  };

  async function handleDeleteGroup() {
    if (!deleteGroupTarget) return;
    try {
      await deleteGroup(deleteGroupTarget.id);
      setShowDeleteGroup(false);
      setDeleteGroupTarget(null);
    } catch (e) {
      setDeleteGroupError(String(e));
    }
  }

  async function handleDeleteDeck() {
    if (!deleteDeckTarget) return;
    try {
      await deleteDeck(deleteDeckTarget.id);
      setShowDeleteDeck(false);
      setDeleteDeckTarget(null);
    } catch (e) {
      setDeleteDeckError(String(e));
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tree；空白区域右键 = 新建分组 */}
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <nav aria-label="牌组树" className="flex-1 py-1 min-h-0">
            {tree.map((item) => (
              <TreeNode key={item.id} item={item} depth={0} actions={actions} />
            ))}
            {tree.length === 0 && (
              <p className="text-xs text-[var(--text-faint)] text-center py-8">
                暂无牌组或分组，右键此区域新建
              </p>
            )}
          </nav>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={menuContentClass}>
            <MenuItem onSelect={actions.onNewRootGroup}>📁 新建分组</MenuItem>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Create Group Dialog */}
      <CreateGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        parentId={createParentId}
        onSuccess={() => loadGroups()}
      />

      {/* Edit Group Dialog */}
      <CreateGroupDialog
        open={showEditGroup}
        onOpenChange={setShowEditGroup}
        group={editGroup}
        onSuccess={() => loadGroups()}
      />

      {/* Create Deck Dialog */}
      <CreateDeckDialog
        open={showCreateDeck}
        onOpenChange={setShowCreateDeck}
        groupId={createDeckGroupId}
        onSuccess={() => loadDecks()}
      />

      {/* Edit Deck Dialog */}
      <CreateDeckDialog
        open={showEditDeck}
        onOpenChange={setShowEditDeck}
        deck={editDeck}
        onSuccess={() => loadDecks()}
      />

      {/* Move Deck Dialog */}
      {moveDeckTarget && (
        <MoveDeckDialog
          open={showMoveDeck}
          onOpenChange={setShowMoveDeck}
          deckId={moveDeckTarget.id}
          deckName={moveDeckTarget.name}
          currentGroupId={moveDeckTarget.groupId}
          onSuccess={() => loadDecks()}
        />
      )}

      {/* Delete Group Confirmation Dialog */}
      <Dialog.Root open={showDeleteGroup} onOpenChange={setShowDeleteGroup}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-2">
              确认删除
            </Dialog.Title>
            <p className="text-sm text-[var(--text-muted)] mb-2">
              确定要删除分组「{deleteGroupTarget?.name}」吗？
            </p>
            <p className="text-sm text-amber-400 mb-6">
              ⚠️ 该分组下的所有子分组将被级联删除，分组内的牌组将回归「未分类」状态。此操作不可撤销。
            </p>
            {deleteGroupError && (
              <p className="text-red-400 text-sm mb-3">{deleteGroupError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors">
                  取消
                </button>
              </Dialog.Close>
              <button
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
                onClick={handleDeleteGroup}
              >
                确认删除
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Deck Confirmation Dialog */}
      <Dialog.Root open={showDeleteDeck} onOpenChange={setShowDeleteDeck}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] max-w-[calc(100vw-2rem)] bg-[var(--background-secondary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-2">
              确认删除
            </Dialog.Title>
            <p className="text-sm text-[var(--text-muted)] mb-2">
              确定要删除牌组「{deleteDeckTarget?.name}」吗？
            </p>
            <p className="text-sm text-amber-400 mb-6">
              ⚠️ 该牌组下的所有卡片及复习状态将被级联删除。此操作不可撤销。
            </p>
            {deleteDeckError && (
              <p className="text-red-400 text-sm mb-3">{deleteDeckError}</p>
            )}
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
    </div>
  );
}

/* ── Single node (recursive) ──────────────
 * 统一行布局：所有行 paddingLeft = 8 + depth*20，
 * 并为 chevron 预留固定 20px 列，保证任意层级图标对齐。 */
function TreeNode({
  item,
  depth,
  actions,
}: {
  item: TreeNodeData;
  depth: number;
  actions: TreeActions;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = !!item.children?.length;
  const padLeft = 8 + depth * 20;

  /* 叶子行：牌组 = 导航链接；空分组 = 静态行 */
  if (!hasChildren) {
    if (item.type === "group") {
      return (
        <NodeContextMenu type="group" id={item.id} name={item.name} actions={actions}>
          <div
            className="flex items-center gap-1 py-1.5 pr-1 text-sm rounded mx-1 text-[var(--text-muted)]"
            style={{ paddingLeft: padLeft }}
            title={item.name}
          >
            <span className="w-5 shrink-0" aria-hidden="true" />
            <span className="shrink-0 text-sm opacity-50">📁</span>
            <span className="truncate flex-1">
              {item.name}
              <span className="ml-1 text-xs text-[var(--text-faint)]">（空）</span>
            </span>
            <DueBadge count={item.count} isGroup />
          </div>
        </NodeContextMenu>
      );
    }

    return (
      <NodeContextMenu
        type="deck"
        id={item.id}
        name={item.name}
        suspended={item.suspended}
        actions={actions}
      >
        <NavLink
          to={`/decks/${item.id}`}
          title={item.name}
          className={({ isActive }) =>
            `relative flex items-center gap-1 py-1.5 pr-1 text-sm rounded mx-1 ${
              item.suspended ? "opacity-60" : ""
            } ${
              isActive
                ? `bg-[var(--background-modifier-active)] text-[var(--text-normal)]
                   before:absolute before:left-[3px] before:top-1/2 before:h-4 before:w-[3px]
                   before:-translate-y-1/2 before:rounded-full before:bg-[var(--interactive-accent)]`
                : "text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)]"
            }`
          }
          style={{ paddingLeft: padLeft }}
        >
          <span className="w-5 shrink-0" aria-hidden="true" />
          <span className="shrink-0 text-sm opacity-50">📄</span>
          <span className="truncate flex-1">
            {item.name}
            {item.suspended && <span className="ml-1 opacity-60">⏸️</span>}
          </span>
          <DueBadge count={item.count} isGroup={false} />
        </NavLink>
      </NodeContextMenu>
    );
  }

  /* 分组行（有子节点）：整行点击 = 折叠/展开，chevron 仅作指示器 */
  return (
    <NodeContextMenu type="group" id={item.id} name={item.name} actions={actions}>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div
          className="flex items-center rounded mx-1 hover:bg-[var(--background-modifier-hover)]"
          style={{ paddingLeft: padLeft }}
        >
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className="flex flex-1 items-center gap-1 min-w-0 py-1.5 pr-1 text-sm text-left
                         text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
            >
              <span className="w-5 shrink-0 flex items-center justify-center text-[var(--text-faint)]">
                <Chevron open={open} />
              </span>
              <span className="shrink-0 text-sm opacity-50">📁</span>
              <span className="truncate flex-1" title={item.name}>
                {item.name}
              </span>
              <DueBadge count={item.count} isGroup />
            </button>
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content>
          {item.children!.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              depth={depth + 1}
              actions={actions}
            />
          ))}
        </Collapsible.Content>
      </Collapsible.Root>
    </NodeContextMenu>
  );
}

/* ── Chevron icon ────────────────────────── */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${
        open ? "" : "-rotate-90"
      }`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
