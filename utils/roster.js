// utils/roster.js
// 智能解析报名名单(群接龙 / 小红书报名文本):
//   1. 提取「数字. 名字」行
//   2. 剥离举手 emoji(🙋 系列)并判定性别 M / F / U
//   3. 提供性别均衡的 3 组随机分组 groupInto3Balanced
//
// 设计约束:
//   - 不依赖任何 npm 包;使用 ES6 + /u flag 正则(小程序支持)
//   - 保留原始名字字符串(含备注 emoji / 前后缀),不做截断
//   - 去空、去重(同名只保留第一个)

/**
 * 移除「举手」系列 emoji(含肤色修饰符 / ZWJ / 性别符号 / 变体选择符)。
 * 仅剥离 🙋 相关 emoji,保留名字中的其它备注 emoji(如 💬 🍋)。
 */
const EMOJI_RE = /\u{1F64B}[\u{1F3FB}-\u{1F3FF}]?\u{200D}[\u{2640}\u{2642}]\u{FE0F}|\u{1F64B}[\u{1F3FB}-\u{1F3FF}]?\u{200D}[\u{2640}\u{2642}]|\u{1F64B}[\u{1F3FB}-\u{1F3FF}]?/gu;

// 性别判定:女性符号 ♀(U+2640)、男性符号 ♂(U+2642)
const RE_FEMALE = /\u{1F64B}[\u{1F3FB}-\u{1F3FF}]?\u{200D}\u{2640}/u;
const RE_MALE = /\u{1F64B}[\u{1F3FB}-\u{1F3FF}]?\u{200D}\u{2642}/u;
// 裸「举手」emoji(接龙语境下用于男,作为兜底)
const RE_RAISE_HAND = /\u{1F64B}[\u{1F3FB}-\u{1F3FF}]?/u;

// 剥离 emoji 后可能残留在名字首部的格式字符(变体选择符 / ZWJ / 零宽空格)
const FORMAT_RE = /[\u{FE0F}\u{FE0E}\u{200D}\u{200B}\u{200C}]/gu;

// 行匹配:行首可选空白 + 数字 + . 或 、 + 可选空白 + 剩余文本
const LINE_RE = /^\s*(\d+)[.、]\s*(.*)$/;

// 元数据黑名单关键词:出现即判定该行「数字. 内容」的「内容」并非人名。
// 覆盖活动标题 / 时间 / 地点 / 链接 / 价格 / 主办方 / 报名状态等常见接龙头部信息。
const META_BLACKLIST = [
  '时间', '地点', '链接', '价格', '费用', '俱乐部', '主办', '已上车', '报名', '截止',
  '户外', '活动', '限制', '人数', '联系方式', '备注', '说明', '规则', '须知', '集合',
  '解散', '已满', '报名中', '已报名', '已截止', '未开始', '进行中', '已结束',
];

// 纯日期格式(如 07.15)、纯价格格式(如 39元 / 39.00元/人)
const DATE_RE = /^\d{1,2}[./]\d{1,2}$/;
const PRICE_RE = /^\d+(\.\d+)?元(\/人)?$/;
// URL 开头(如 weixin://、http://、https://、wxwork://、tel:)
const URL_RE = /^(https?:\/\/|weixin:\/\/|wxwork:\/\/|tel:)/i;
// 合法人名至少需含一个汉字或英文字母(避免只剩符号 / 分隔线)
const HAS_NAME_CHAR_RE = /[一-鿿A-Za-z]/;

/**
 * 根据剩余文本判定性别。
 *   - 含 ♀ 序列            -> 'F'
 *   - 含 ♂ 序列            -> 'M'
 *   - 仅含举手 emoji(无性别符号,如样例里裸 🙋) -> 'M'(接龙语境下视为男)
 *   - 都没有(纯文本)        -> 'U'
 * @param {string} rest 去掉行号后的剩余文本
 * @returns {'M'|'F'|'U'}
 */
function detectGender(rest) {
  if (RE_FEMALE.test(rest)) return 'F';
  if (RE_MALE.test(rest)) return 'M';
  if (RE_RAISE_HAND.test(rest)) return 'M';
  return 'U';
}

/**
 * 判定「数字. 内容」中的「内容」是否像一个人名。
 * 仅做「排除元数据」的过滤(去掉举手 emoji 与格式字符后)，不负责性别判定。
 * 返回 false 的情况:
 *   - 去掉举手 emoji / 格式字符后为空(如只剩序号或 emoji)
 *   - 纯数字(如 23、2026)
 *   - 纯日期 / 价格格式(如 07.15、39元、39.00元/人)
 *   - URL 开头(如 weixin://、http://、https://)
 *   - 含元数据黑名单关键词(时间 / 地点 / 链接 / 价格 / 俱乐部 / 活动 ...)
 *   - 清洗后不含任何汉字或英文字母(只剩符号 / 分隔线,如 ---)
 * @param {string} rest 去掉行号后的剩余文本
 * @returns {boolean} true=像人名,false=疑似元数据
 */
function isLikelyPersonName(rest) {
  const clean = String(rest).replace(EMOJI_RE, '').replace(FORMAT_RE, '').trim();
  if (!clean) return false;                                   // 空
  if (/^\d+$/.test(clean)) return false;                       // 纯数字
  if (DATE_RE.test(clean)) return false;                       // 纯日期 07.15
  if (PRICE_RE.test(clean)) return false;                      // 纯价格 39元/39.00元/人
  if (URL_RE.test(clean)) return false;                        // URL 开头
  if (META_BLACKLIST.some((k) => clean.includes(k))) return false; // 元数据关键词
  if (!HAS_NAME_CHAR_RE.test(clean)) return false;             // 仅符号 / 分隔线
  return true;
}

/**
 * 解析报名名单文本。
 * @param {string} text 原始粘贴文本
 * @returns {{names: Array<{name:string, gender:'M'|'F'|'U'}>, maleCount:number, femaleCount:number, unknownCount:number, total:number}}
 */
function parseRoster(text) {
  const names = [];
  const seen = new Set();
  let maleCount = 0;
  let femaleCount = 0;
  let unknownCount = 0;

  if (!text) {
    return { names, maleCount, femaleCount, unknownCount, total: 0 };
  }

  const lines = String(text).split(/\r?\n/);
  for (const raw of lines) {
    const m = LINE_RE.exec(raw);
    if (!m) continue; // 非「数字. 名字」行,跳过(标题 / 已上车 / 链接 / 分隔线等)

    const rest = m[2]; // 行号之后的剩余文本

    // 先过滤元数据:「内容」看起来像活动标题 / 时间 / 地点 / 价格等则跳过,
    // 不进入分组结果(用户反馈:只有「数字. 人名」中的人名才有效)。
    if (!isLikelyPersonName(rest)) continue;

    const gender = detectGender(rest); // 用原始 rest 判性别,不能先过滤后判性别

    // 剥离举手 emoji,再清理可能残留的格式字符并去首尾空白
    let name = rest.replace(EMOJI_RE, '');
    name = name.replace(FORMAT_RE, '').trim();
    if (!name) continue; // 去空
    if (seen.has(name)) continue; // 去重(同名保留第一个)

    seen.add(name);
    if (gender === 'M') maleCount++;
    else if (gender === 'F') femaleCount++;
    else unknownCount++;

    names.push({ name, gender });
  }

  return { names, maleCount, femaleCount, unknownCount, total: names.length };
}

/**
 * Fisher-Yates 洗牌(返回新数组,不修改原数组)。
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blankGroup() {
  return { members: [], male: 0, female: 0, unknown: 0, total: 0 };
}

/**
 * 性别轮流填的 3 组均衡分组。
 * 先把 M 轮流填入 0->1->2->0...,再把 F 同样轮流填,最后把 U 同样轮流填。
 * 这样可保证三组之间的 M 数差 ≤1、F 数差 ≤1;U 不影响男女均衡。
 * 但 M / F 的「+1 余量」可能都落在同一组,导致总人数差达到 2,
 * 因此最后再做一次总人数再平衡(rebalanceTotals),在不破坏性别均衡的前提下把总人数差收敛到 ≤1。
 *
 * @param {Array<{name:string, gender:'M'|'F'|'U'}>} people
 * @returns {Array<{members:Array<{name:string, gender:string}>, male:number, female:number, unknown:number, total:number}>}
 */
function groupInto3Balanced(people) {
  const list = Array.isArray(people) ? people : [];
  const males = shuffle(list.filter((p) => p.gender === 'M'));
  const females = shuffle(list.filter((p) => p.gender === 'F'));
  const unknowns = shuffle(list.filter((p) => p.gender === 'U'));

  const groups = [blankGroup(), blankGroup(), blankGroup()];

  function fill(arr) {
    arr.forEach((p, i) => {
      const g = groups[i % 3];
      g.members.push({ name: p.name, gender: p.gender });
      if (p.gender === 'M') g.male++;
      else if (p.gender === 'F') g.female++;
      else g.unknown++;
      g.total++;
    });
  }

  fill(males);
  fill(females);
  fill(unknowns);

  return rebalanceTotals(groups);
}

/**
 * 判断把 srcIdx 组里某个 gender 的人迁移到 dstIdx 组后,三组各自的男/女/未知人数极差是否仍 ≤1。
 * @param {Array} groups
 * @param {number} srcIdx
 * @param {number} dstIdx
 * @param {string} gender
 * @returns {boolean}
 */
function okAfterMove(groups, srcIdx, dstIdx, gender) {
  const male = groups.map((g, i) =>
    g.male + (i === dstIdx && gender === 'M' ? 1 : 0) - (i === srcIdx && gender === 'M' ? 1 : 0));
  const female = groups.map((g, i) =>
    g.female + (i === dstIdx && gender === 'F' ? 1 : 0) - (i === srcIdx && gender === 'F' ? 1 : 0));
  const unknown = groups.map((g, i) =>
    g.unknown + (i === dstIdx && gender === 'U' ? 1 : 0) - (i === srcIdx && gender === 'U' ? 1 : 0));
  const md = Math.max.apply(null, male) - Math.min.apply(null, male);
  const fd = Math.max.apply(null, female) - Math.min.apply(null, female);
  const ud = Math.max.apply(null, unknown) - Math.min.apply(null, unknown);
  return md <= 1 && fd <= 1 && ud <= 1;
}

/**
 * 在性别已均衡(M / F 各自组间差 ≤1)的基础上做总人数再平衡:
 * 当最大组与最小组人数差 >1 时,从最大组迁 1 人到最小组,
 * 优先选择「迁移后三组男 / 女 / 未知人数差仍 ≤1」的人(性别均衡不被破坏)。
 * 每轮最多把极差降 1;因总人数极差最多为 2(M、F 余量叠加),至多 1~2 轮即可收敛到 ≤1。
 * @param {Array} groups
 * @returns {Array}
 */
function rebalanceTotals(groups) {
  for (let iter = 0; iter <= groups.length; iter++) {
    const totals = groups.map((g) => g.total);
    const maxT = Math.max.apply(null, totals);
    const minT = Math.min.apply(null, totals);
    if (maxT - minT <= 1) break;

    const srcIdx = groups.findIndex((g) => g.total === maxT);
    const dstIdx = groups.findIndex((g) => g.total === minT);
    const src = groups[srcIdx];
    const dst = groups[dstIdx];

    // 选一个迁移后不破坏性别均衡的人
    let candIdx = -1;
    for (let k = 0; k < src.members.length; k++) {
      if (okAfterMove(groups, srcIdx, dstIdx, src.members[k].gender)) {
        candIdx = k;
        break;
      }
    }
    if (candIdx < 0) candIdx = 0; // 兜底:理论上 max-min==2 时必存在可迁者

    const person = src.members.splice(candIdx, 1)[0];
    dst.members.push(person);
    if (person.gender === 'M') { src.male -= 1; dst.male += 1; }
    else if (person.gender === 'F') { src.female -= 1; dst.female += 1; }
    else { src.unknown -= 1; dst.unknown += 1; }
    src.total -= 1;
    dst.total += 1;
  }
  return groups;
}

module.exports = { parseRoster, groupInto3Balanced, detectGender, shuffle, isLikelyPersonName };
