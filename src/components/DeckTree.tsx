import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as Dialog from "@radix-ui/react-dialog";
import { useDecksStore } from "../stores/decks";
import { useGroupsStore } from "../stores/groups";
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
      path: `?group=${g.id}`,
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
      path: `/decks/${d.id}`,
      count: d.due_count,
      suspended: d.suspended,
    };
    if (d.group_id && groupNodes.has(d.group_id)) {
      groupNodes.get(d.group_id)!.children!.push(deckNode);
    } else {
      rootNodes.push(deckNode);
    }
  }

  return rootNodes;
}

/* ── Context menu state ──────────────────── */
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: "group" | "deck" | "sidebar";
  id: string;
  name: string;
}

/* ── Main component ──────────────────────── */
export default function DeckTree() {
  const { decks, loadDecks, deleteDeck, setDeckSuspended } = useDecksStore();
  const navigate = useNavigate();
  const { groups, loadGroups, deleteGroup } = useGroupsStore();
  const [tree, setTree] = useState<TreeNodeData[]>([]);

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

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    type: "group",
    id: "",
    name: "",
  });

  useEffect(() => {
    loadGroups();
    loadDecks();
  }, []);

  useEffect(() => {
    setTree(buildTree(groups, decks));
  }, [groups, decks]);

  // Close context menu on any click outside
  useEffect(() => {
    function close() {
      setCtxMenu((prev) => ({ ...prev, visible: false }));
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  /* ── Context menu handlers ──────────────── */
  function handleGroupContextMenu(
    e: React.MouseEvent,
    groupId: string,
    groupName: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: "group",
      id: groupId,
      name: groupName,
    });
  }

  function handleDeckContextMenu(
    e: React.MouseEvent,
    deckId: string,
    deckName: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: "deck",
      id: deckId,
      name: deckName,
    });
  }

  function handleSidebarContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: "sidebar",
      id: "",
      name: "",
    });
  }

  /* ── Group menu actions ─────────────────── */
  function handleNewSubgroup() {
    setCreateParentId(ctxMenu.id);
    setShowCreateGroup(true);
  }

  function handleNewRootGroup() {
    setCreateParentId(undefined);
    setShowCreateGroup(true);
  }

  function handleNewDeckInGroup() {
    setCreateDeckGroupId(ctxMenu.id);
    setShowCreateDeck(true);
  }

  function handleRenameGroup() {
    const g = groups.find((g) => g.id === ctxMenu.id);
    if (g) {
      setEditGroup({
        id: g.id,
        name: g.name,
        description: g.description || "",
        parent_id: g.parent_id,
      });
      setShowEditGroup(true);
    }
  }

  function handleDeleteGroupClick() {
    setDeleteGroupTarget({ id: ctxMenu.id, name: ctxMenu.name });
    setDeleteGroupError("");
    setShowDeleteGroup(true);
  }

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

  /* ── Deck menu actions ──────────────────── */
  function handleReviewDeck() {
    navigate(`/?deck=${ctxMenu.id}`);
  }

  async function handleToggleSuspend() {
    const d = decks.find((d) => d.id === ctxMenu.id);
    await setDeckSuspended(ctxMenu.id, !d?.suspended);
  }

  function handleMoveDeck() {
    const d = decks.find((d) => d.id === ctxMenu.id);
    setMoveDeckTarget({
      id: ctxMenu.id,
      name: ctxMenu.name,
      groupId: d?.group_id,
    });
    setShowMoveDeck(true);
  }

  function handleRenameDeck() {
    const d = decks.find((d) => d.id === ctxMenu.id);
    if (d) {
      setEditDeck({
        id: d.id,
        name: d.name,
        description: d.description || "",
        group_id: d.group_id,
      });
      setShowEditDeck(true);
    }
  }

  function handleDeleteDeckClick() {
    setDeleteDeckTarget({ id: ctxMenu.id, name: ctxMenu.name });
    setDeleteDeckError("");
    setShowDeleteDeck(true);
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
    <div
      className="flex flex-col flex-1 min-h-0"
      onContextMenu={handleSidebarContextMenu}
    >
      {/* Tree */}
      <nav className="flex-1 py-1 min-h-0">
        {tree.map((item) => (
          <TreeNode
            key={item.id}
            item={item}
            depth={0}
            onGroupContextMenu={handleGroupContextMenu}
            onDeckContextMenu={handleDeckContextMenu}
          />
        ))}
        {tree.length === 0 && groups.length === 0 && (
          <p className="text-xs text-[var(--text-faint)] text-center py-8">
            暂无分组，右键此区域新建
          </p>
        )}
      </nav>

      {/* Context menu */}
      {ctxMenu.visible && (
        <div
          className="fixed z-50 w-44 py-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {ctxMenu.type === "sidebar" ? (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
              onClick={handleNewRootGroup}
            >
              📁 新建分组
            </button>
          ) : ctxMenu.type === "group" ? (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleNewSubgroup}
              >
                📂 新建子分组
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleNewDeckInGroup}
              >
                📄 新建卡牌组
              </button>
              <div className="border-t border-[var(--background-modifier-border)] my-0.5" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleRenameGroup}
              >
                ✏️ 重命名
              </button>
              <div className="border-t border-[var(--background-modifier-border)] my-0.5" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleDeleteGroupClick}
              >
                🗑️ 删除
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleReviewDeck}
              >
                📖 复习此牌组
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleToggleSuspend}
              >
                {decks.find((d) => d.id === ctxMenu.id)?.suspended
                  ? "▶️ 恢复复习"
                  : "⏸️ 暂停复习"}
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleMoveDeck}
              >
                📂 移动到其他分组
              </button>
              <div className="border-t border-[var(--background-modifier-border)] my-0.5" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleRenameDeck}
              >
                ✏️ 重命名
              </button>
              <div className="border-t border-[var(--background-modifier-border)] my-0.5" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-[var(--background-modifier-hover)] transition-colors"
                onClick={handleDeleteDeckClick}
              >
                🗑️ 删除
              </button>
            </>
          )}
        </div>
      )}

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

/* ── Single node (recursive) ────────────── */
function TreeNode({
  item,
  depth,
  onGroupContextMenu,
  onDeckContextMenu,
}: {
  item: TreeNodeData;
  depth: number;
  onGroupContextMenu: (e: React.MouseEvent, groupId: string, groupName: string) => void;
  onDeckContextMenu: (e: React.MouseEvent, deckId: string, deckName: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = item.children && item.children.length > 0;

  if (!hasChildren) {
    return (
      <NavLink
        to={item.path}
        className={({ isActive }) =>
          `flex items-center gap-2 py-1.5 text-sm rounded mx-1 cursor-pointer
           ${
             isActive
               ? "bg-[var(--background-modifier-active)] text-[var(--text-normal)]"
               : "text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)]"
           }`
        }
        style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "8px" }}
        onContextMenu={(e) => {
          if (item.type === "group") {
            onGroupContextMenu(e, item.id, item.name);
          } else {
            onDeckContextMenu(e, item.id, item.name);
          }
        }}
      >
        <span className="shrink-0 text-sm opacity-50">
          {item.type === "deck" ? "📄" : "📁"}
        </span>
        <span className="truncate flex-1">
          {item.name}
          {item.suspended && <span className="ml-1 opacity-60">⏸️</span>}
        </span>
        {item.count !== undefined && item.count > 0 && (
          <span className="ml-auto text-xs text-[var(--text-faint)] tabular-nums shrink-0">
            {item.count}
          </span>
        )}
      </NavLink>
    );
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      {/* Trigger row */}
      <div
        className="flex items-center gap-0.5 mx-1 rounded cursor-pointer
                   hover:bg-[var(--background-modifier-hover)]"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onContextMenu={(e) => {
          if (item.type === "group") {
            onGroupContextMenu(e, item.id, item.name);
          } else {
            onDeckContextMenu(e, item.id, item.name);
          }
        }}
      >
        <Collapsible.Trigger asChild>
          <button
            className="p-0.5 text-[var(--text-faint)] hover:text-[var(--text-normal)] shrink-0"
            aria-label={open ? "折叠" : "展开"}
          >
            <Chevron open={open} />
          </button>
        </Collapsible.Trigger>
        <NavLink
          to={item.path}
          className={({ isActive }) =>
            `flex items-center gap-2 py-1.5 text-sm flex-1 min-w-0 rounded
             ${
               isActive
                 ? "text-[var(--text-normal)]"
                 : "text-[var(--text-muted)]"
             }`
          }
        >
          <span className="shrink-0 text-sm opacity-50">📁</span>
          <span className="truncate">{item.name}</span>
          {item.count !== undefined && item.count > 0 && (
            <span className="ml-auto mr-2 text-xs text-[var(--text-faint)] tabular-nums shrink-0">
              {item.count}
            </span>
          )}
        </NavLink>
      </div>

      {/* Children */}
      <Collapsible.Content>
        {item.children?.map((child) => (
          <TreeNode
            key={child.id}
            item={child}
            depth={depth + 1}
            onGroupContextMenu={onGroupContextMenu}
            onDeckContextMenu={onDeckContextMenu}
          />
        ))}
      </Collapsible.Content>
    </Collapsible.Root>
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
