import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import CardPreview from "./CardPreview";

interface CardPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  front: string;
  back: string;
}

/**
 * 卡片预览弹窗：以复习页完全一致的卡片样式展示正/背面。
 * z-index 高于普通编辑弹窗（z-50），可从编辑对话框上叠加打开。
 */
export default function CardPreviewDialog({
  open,
  onOpenChange,
  front,
  back,
}: CardPreviewDialogProps) {
  const [flipped, setFlipped] = useState(false);
  // 每次打开回到正面
  useEffect(() => {
    if (open) setFlipped(false);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)] overflow-y-auto bg-[var(--background-primary)] rounded-xl border border-[var(--background-modifier-border)] shadow-2xl z-[70] p-6">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-normal)] mb-4">
            卡片预览
          </Dialog.Title>
          <CardPreview
            front={front}
            back={back}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
          />
          <p className="text-xs text-[var(--text-faint)] text-center mt-3">
            点击卡片翻面
          </p>
          <div className="flex justify-end mt-3">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-lg bg-[var(--background-modifier-hover)] text-[var(--text-normal)] text-sm hover:bg-[var(--background-modifier-border)] transition-colors">
                关闭
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
