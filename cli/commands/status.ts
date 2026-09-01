/** status：outbox / 登录 / 环境摘要 */
import * as authToken from "../../electron/authToken";
import * as accounts from "../../electron/accounts";
import { countPendingReviews, listPendingUserIds } from "../../electron/db";
import { currentEnvKey, resolveApiBase } from "../../electron/config";
import { printJson, type GlobalFlags } from "../bin/memflow";

export async function run(_flags: GlobalFlags): Promise<void> {
  const stored = authToken.load();
  const acc = accounts.current();
  printJson({
    ok: true,
    logged_in: !!stored,
    env: currentEnvKey() ?? null,
    api_base: resolveApiBase(),
    current_account: acc
      ? { user_id: acc.user_id, nickname: acc.nickname ?? null, email: acc.email ?? null }
      : null,
    accounts: accounts.count(),
    pending_reviews: acc ? countPendingReviews(acc.user_id) : 0,
    pending_user_ids: listPendingUserIds(),
  });
}
