/** Cloze helpers for {{answer}} / {{cN::answer::hint}} syntax.（与小程序端 src/utils/cloze.ts 对齐）
 *  无编号 {{x}} 归一为空号 0（"整卡一卡多空"，一条 FSRS 状态，一次评分），存量行为不变。
 *  仅当存在显式编号 cN 且空号集合 >1 时，才拆成一空一卡独立调度。
 */

export interface ClozePart {
  n: number; // 空号；无编号为 0（整卡）；同号 = 同组同显隐
  answer: string;
  hint?: string;
}

const CLOZE_RE = /\{\{(.+?)\}\}/g;

/** 解析括号内文本：支持 "答案"、"c1::答案"、"c1::答案::提示"。无编号 → n=0。 */
function parseInner(inner: string): ClozePart {
  const m = /^c(\d+)::([\s\S]*)$/.exec(inner);
  if (!m) {
    return { n: 0, answer: inner };
  }
  const seg = m[2].split("::");
  return {
    n: Number(m[1]),
    answer: seg[0],
    hint: seg.length > 1 ? seg.slice(1).join("::") : undefined,
  };
}

/** 正面：遮蔽挖空。无 target 时遮蔽全部（兼容旧行为）；有 target 时仅遮蔽该空号、其余空号显示答案。 */
export function maskCloze(text: string, target?: number): string {
  return text.replace(CLOZE_RE, (_, inner) => {
    const p = parseInner(inner);
    if (target !== undefined && p.n !== target) {
      return p.answer;
    }
    return p.hint ? `[${p.hint}]` : "[...]";
  });
}

/** 背面：揭示全部挖空为答案（忽略提示）。 */
export function revealCloze(text: string): string {
  return text.replace(CLOZE_RE, (_, inner) => parseInner(inner).answer);
}

/** 提取所有挖空为结构化数据（空号/答案/提示）。 */
export function extractCloze(text: string): ClozePart[] {
  const parts: ClozePart[] = [];
  CLOZE_RE.lastIndex = 0;
  let m;
  while ((m = CLOZE_RE.exec(text)) !== null) {
    parts.push(parseInner(m[1]));
  }
  return parts;
}

/** 调度空号集合：仅当存在显式编号（>1 个空号）时返回该集合（一空一卡）；
 *  其余情况（无挖空、仅无编号、或只出现单一空号）返回空数组，表示整卡一卡多空（由后端建 cloze_num=0 单条状态）。 */
export function clozeNums(text: string): number[] {
  const seen = new Set<number>();
  for (const p of extractCloze(text)) {
    seen.add(p.n);
  }
  return seen.size > 1 ? [...seen] : [];
}
