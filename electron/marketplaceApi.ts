/**
 * 插件市场公开 API（纯 REST，renderer 可安全导入）。
 * 安装逻辑（文件落盘/验签/解压）见 marketplace.ts（仅主进程）。
 */
import { api } from "./http";

export interface MarketplacePluginItem {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  icon_url?: string;
  latest_version?: string;
  install_count?: number;
}

export interface MarketplaceInstallTarget {
  id: string;
  plugin_id: string;
  version: string;
  package_url: string;
  package_name: string;
  package_size?: number;
  sha256?: string;
  signature?: string;
  manifest?: string;
}

export async function listMarketplacePlugins(
  keyword?: string,
  page = 1
): Promise<{ items: MarketplacePluginItem[]; total: number }> {
  return api.get("/api/marketplace/plugins", { params: { keyword, page: String(page), page_size: "20" } });
}

export async function getInstallTarget(name: string): Promise<MarketplaceInstallTarget> {
  return api.get(`/api/marketplace/install/${encodeURIComponent(name)}`);
}
