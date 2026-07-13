// utils/group.js
// 随机分组:Fisher-Yates 洗牌,平均分 3 组,余数并入最后一组(并入方式 = 最后一组多 1~2 人,前面不变)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 解析用户输入(每行一个),去重、去空、保留原始顺序去重后的稳定输入
function parseNames(text) {
  if (!text) return [];
  const lines = String(text).split(/[\r\n,，\s]+/).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const n of lines) {
    if (!seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

// 分组:始终 3 组;人数不足时最后一组承担余数(即可少于 3 组,但默认保持 3 组结构,空组展示)
// 规则:
//  - n >= 3:均分 3 组,余数人并入最后一组(最后一组多 1~2 人)
//  - n == 2:返回 [[a],[b],[]] 仍展示 3 个组,空组标"少人"
//  - n == 1:返回 [[a],[],[]] 仍展示 3 个组
//  - n == 0:返回 [[],[],[]] 不允许开始
function groupInto3(names) {
  const shuffled = shuffle(names);
  const total = shuffled.length;
  if (total === 0) return [[], [], []];
  if (total === 1) return [[shuffled[0]], [], []];
  if (total === 2) return [[shuffled[0]], [shuffled[1]], []];
  // total >= 3
  const base = Math.floor(total / 3);
  const remainder = total - base * 3; // 0, 1, 2
  // 第 1 组:base;第 2 组:base;第 3 组:base + remainder
  // 任何余数都让最后一组多承担(容错友好,前两组始终均匀)
  const a = shuffled.slice(0, base);
  const b = shuffled.slice(base, base * 2);
  const c = shuffled.slice(base * 2, base * 2 + base + remainder);
  return [a, b, c];
}

module.exports = { shuffle, parseNames, groupInto3 };
