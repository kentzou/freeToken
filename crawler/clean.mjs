/** 双层清洗：正则参数清洗器（防上游新卡夹带引流）+ 本站逐卡覆盖 */

const PROMO_KEYS = [
  "usercode",
  "user_code",
  "invite_code",
  "invite_code_v2",
  "invitecode",
  "invite",
  "aff",
  "keyfrom",
  "from",
  "share_from",
  "refer",
  "ref",
  "source",
  "ic", // MonkeyCode：?ic=019fe…（实测上游在用）
  "clubtaskbiz", // 云工开物：?clubTaskBiz=subTask..（活动任务追踪）
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

/**
 * 推广短链域名：邀请码写在路径里（s.mi.cn/NNI4kZp9），剥参数清不掉。
 * 命中即判定为风险链接，必须在 config/site-config.json 逐卡换成官方地址。
 */
export const SHORT_LINK_HOSTS = ["curl.qcloud.com", "s.qiniu.com", "s.mi.cn", "url.cn", "t.cn"];

function isPromoKey(key) {
  const k = key.toLowerCase();
  return PROMO_KEYS.includes(k) || k.startsWith("utm_");
}

/** query 串（不含前导 ?）里剔除推广键，返回剩余参数串 */
function pruneQuery(qs) {
  const keep = [];
  new URLSearchParams(qs).forEach((value, key) => {
    if (!isPromoKey(key)) keep.push([key, value]);
  });
  return keep.length ? new URLSearchParams(keep).toString() : "";
}

/** "#"、相对路径等解析不了 → 返回 null，调用方保持原样 */
function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** 无协议裸域名形态（如 "example.com/x?userCode=1"）：new URL 必失败，旧实现据此绕过全部检测
 *  （终审遗留 #10）。补 https:// 再解析；bare=true 表示原串缺协议，终审单列风险。
 *  排除 ':'（协议/邮件）、'#'、'/' 开头（站内相对）、空白。 */
function parseLoose(url) {
  const p = parse(url);
  if (p) return { p, bare: false };
  if (typeof url === "string" && /^[^:/?#\s]+\.[a-z]{2,}/i.test(url)) {
    const q = parse("https://" + url);
    if (q) return { p: q, bare: true };
  }
  return null;
}

/** 剥掉推广/追踪参数（含 hash 内参数）；保留其余业务参数；解析失败返回原值 */
export function stripPromoParams(url) {
  if (typeof url !== "string" || !url) return url;
  const loose = parseLoose(url);
  if (!loose) return url;
  const parsed = loose.p;
  const cut = parsed.hash.indexOf("?");
  if (!parsed.search && cut < 0) return url; // 无可洗参数：原样返回，避免归一化凭空加尾斜杠/补协议
  const search = pruneQuery(parsed.search.replace(/^\?/, ""));
  parsed.search = search ? "?" + search : "";
  if (cut > -1) {
    const hash = pruneQuery(parsed.hash.slice(cut + 1));
    parsed.hash = parsed.hash.slice(0, cut) + (hash ? "?" + hash : "");
  }
  return parsed.toString().replace(/\/\?$/, "");
}

/** 清洗后残余风险检测；返回 null 表示干净，否则返回可读原因（seed 与阶段 D 爬虫共用） */
export function linkRisk(url) {
  if (typeof url !== "string" || !url) return null;
  const loose = parseLoose(url);
  if (!loose) return null; // "#"、相对路径：站内形态，放行
  const parsed = loose.p;
  const hits = [];
  const collect = (qs) =>
    new URLSearchParams(qs).forEach((_v, key) => {
      if (isPromoKey(key)) hits.push(key);
    });
  collect(parsed.search.replace(/^\?/, ""));
  const cut = parsed.hash.indexOf("?");
  if (cut > -1) collect(parsed.hash.slice(cut + 1));
  if (hits.length) return `残留引流参数 ${hits.join(", ")}`;
  if (SHORT_LINK_HOSTS.includes(parsed.hostname)) return `推广短链域名 ${parsed.hostname}`;
  if (loose.bare) return "缺少协议前缀（裸域名），必须写成 https:// 开头的完整地址";
  return null;
}

const POOL_KEYS = ["inviteBase", "inviteCodes", "inviteParam", "traeLinks"];

/** 单卡清洗：链接剥参 + 上游码池与原作者海报置空 */
export function cleanCard(card) {
  const out = { ...card };
  if (typeof out.link === "string") out.link = stripPromoParams(out.link);
  if (out.extraAction && !Array.isArray(out.extraAction) && typeof out.extraAction.link === "string") {
    out.extraAction = { ...out.extraAction, link: stripPromoParams(out.extraAction.link) };
  }
  for (const k of POOL_KEYS) delete out[k];
  if (typeof out.poster === "string" && !/^https?:\/\//.test(out.poster)) delete out.poster; // 上游物料不入包
  return out;
}

/**
 * 本站 site-config 逐卡覆盖，语义与镜像 site-config.js 对齐：
 * 同名卡（含 DONOTS 中重名）全部覆盖；配 link 未配码池则清池；hide 只作用于情报卡。
 */
export function applySiteConfig(cards, donots, cfg) {
  const outCards = (cards || []).map((c) => ({ ...c }));
  const outDonots = (donots || []).map((d) => ({ ...d }));
  if (!cfg || !cfg.cards || typeof cfg.cards !== "object" || Array.isArray(cfg.cards)) {
    return { cards: outCards, donots: outDonots };
  }
  const byName = Object.create(null); // 无原型字典，防 "constructor" 误命中
  const collect = (list) =>
    list.forEach((item) => {
      if (!item || typeof item.name !== "string") return;
      (byName[item.name] || (byName[item.name] = [])).push(item);
    });
  collect(outCards);
  collect(outDonots);

  for (const name of Object.keys(cfg.cards)) {
    const hits = byName[name];
    const patch = cfg.cards[name] || {};
    if (!hits) {
      console.warn("[site-config] 未找到卡片：", name);
      continue;
    }
    for (const t of hits) {
      for (const k of ["link", ...POOL_KEYS]) {
        if (patch[k] !== undefined) t[k] = patch[k];
      }
      if (patch.link !== undefined && patch.inviteCodes === undefined) {
        delete t.inviteBase;
        delete t.inviteCodes;
      }
      if (patch.link !== undefined && patch.traeLinks === undefined) delete t.traeLinks;
      if (patch.hide) {
        const i = outCards.indexOf(t);
        if (i > -1) outCards.splice(i, 1);
      }
    }
  }
  return { cards: outCards, donots: outDonots };
}
