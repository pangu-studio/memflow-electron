import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { invoke } from "@/lib/invoke";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CliInstallStatus {
  installed: boolean;
  path?: string;
  target?: string;
  hint?: string;
}

export default function CliSettingsDialog({ open, onOpenChange }: Props) {
  const [cliStatus, setCliStatus] = useState<CliInstallStatus | null>(null);
  const [cliBusy, setCliBusy] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);

  // Load install status when dialog opens
  useEffect(() => {
    if (!open) return;
    setCliError(null);
    invoke<CliInstallStatus | null>("get_cli_install_status")
      .then(setCliStatus)
      .catch(() => {
        // ignore — CLI install status is best-effort
      });
  }, [open]);

  const handleInstallCli = async () => {
    setCliBusy(true);
    setCliError(null);
    try {
      const st = await invoke<CliInstallStatus>("install_cli_tool");
      setCliStatus(st);
    } catch (e) {
      setCliError(String(e));
    }
    setCliBusy(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-xl bg-[var(--background-secondary)] p-6 border border-[var(--background-modifier-border)] shadow-2xl z-50">
          <Dialog.Title className="text-lg font-bold text-[var(--text-normal)] mb-5">
            命令行工具
          </Dialog.Title>

          <div className="mb-6 rounded-lg border border-[var(--background-modifier-border)] p-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-[var(--text-normal)]">
                  memflow-cli（AI 制卡）
                </label>
                <p className="text-xs text-[var(--text-faint)] mt-0.5">
                  {cliStatus?.installed
                    ? `已安装：${cliStatus.path}`
                    : "安装后 Claude Code 等 AI 工具可通过 memflow-cli 制卡"}
                </p>
                {cliStatus?.hint && (
                  <p className="text-xs text-[var(--text-faint)] mt-1">
                    {cliStatus.hint}
                  </p>
                )}
                {cliError && (
                  <p className="text-xs text-red-400 mt-1">{cliError}</p>
                )}
              </div>
              <button
                onClick={handleInstallCli}
                disabled={cliBusy}
                className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--background-modifier-hover)] text-[var(--text-normal)] hover:bg-[var(--background-modifier-border)] transition-colors disabled:opacity-50"
              >
                {cliBusy ? "安装中..." : cliStatus?.installed ? "重新安装" : "安装"}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] transition-colors">
                关闭
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
