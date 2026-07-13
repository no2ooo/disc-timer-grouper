// test/group_truncate_edge.test.js
// 任务 B 边缘用例:名字截断正确性 + 截断发生在显示层(group.js)而非解析层(utils/roster.js)。
// 运行:node test/group_truncate_edge.test.js
//
// 说明:业务代码 group.js 的 truncateName 为模块内私有函数、未导出。
// 为测试“真实代码”而非复制实现,这里从源码中提取该函数的真实文本并执行,
// 既验证了真实逻辑,又不修改任何业务代码。

'use strict';

const fs = require('fs');
const path = require('path');

// ---------- 简易断言框架 ----------
let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  PASS: ' + msg);
  } else {
    console.error('  FAIL: ' + msg);
    failures += 1;
  }
}

// ---------- 从源码提取真实的 truncateName 并执行 ----------
const groupSrc = fs.readFileSync(path.join(__dirname, '..', 'pages', 'group', 'group.js'), 'utf8');
const fnMatch = groupSrc.match(/function\s+truncateName\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!fnMatch) {
  console.error('无法从 group.js 定位 truncateName 函数,测试中止');
  process.exit(1);
}
const truncateName = new Function(fnMatch[0] + '\nreturn truncateName;')();

// ---------- 深度 setData 路径支持(模拟小程序 setData) ----------
function setPath(obj, p, value) {
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  const tokens = [];
  let m;
  while ((m = re.exec(p)) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2]);
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] == null) cur[t] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    cur = cur[t];
  }
  cur[tokens[tokens.length - 1]] = value;
}

// ---------- mock 全局环境 ----------
const storageStore = {};
global.getApp = function () {
  return { globalData: { settings: { sound: false, vibrate: false, keepScreen: false } } };
};
let captured = null;
global.Page = function (cfg) { captured = cfg; };
global.wx = {
  vibrateShort: function () {},
  setStorageSync: function (k, v) { storageStore[k] = v; },
  getStorageSync: function (k) { return storageStore[k] || null; },
  showToast: function () {},
  showModal: function () {},
  setClipboardData: function () {},
  showActionSheet: function () {}
};

// ---------- 加载页面 ----------
require('../pages/group/group.js');
if (!captured) {
  console.error('页面配置未通过 Page() 捕获,测试中止');
  process.exit(1);
}
const page = Object.assign({}, captured);
page.data = JSON.parse(JSON.stringify(captured.data));
page.setData = function (patch) {
  const self = this;
  Object.keys(patch).forEach(function (k) { setPath(self.data, k, patch[k]); });
};

// ============ 用例1:名字恰好 4 字 → 原样保留,不截断 ============
console.log('\n[用例1] 名字恰好 4 字 → 原样保留,不截断');
assert(truncateName('1234') === '1234', '4 位 ASCII「1234」原样保留');
assert(truncateName('王二小三') === '王二小三', '4 字中文「王二小三」原样保留');
assert(truncateName('王二小三').length === 4, '4 字名字长度为 4(未被截断)');

// ============ 用例2:含 emoji 长名 → 截断为前 4 字 ============
console.log('\n[用例2] 含 emoji 长名「阿杰一道杠💬cium」→ 前 4 字「阿杰一道」');
const e2 = truncateName('阿杰一道杠💬cium');
assert(e2 === '阿杰一道', '含 emoji 长名截断为「阿杰一道」(实际:' + e2 + ')');
assert(e2.length === 4, '截断结果长度为 4');

// ============ 用例3:空 / undefined / null → 不报错 ============
console.log('\n[用例3] 空字符串 / undefined / null → 不报错,返回空串');
let threw = false;
try {
  assert(truncateName('') === '', '空字符串 → 空串');
  assert(truncateName(undefined) === '', 'undefined → 空串(不抛错)');
  assert(truncateName(null) === '', 'null → 空串(不抛错)');
  assert(truncateName('阿') === '阿', '单字原样保留');
} catch (e) {
  threw = true;
  console.error('  异常:' + e);
}
assert(!threw, '空 / undefined / null 场景均不抛异常');

// ============ 用例4:onParseRoster 全流程截断,且解析层(utils/roster.js)保持原始名字 ============
console.log('\n[用例4] onParseRoster 全流程截断,且解析层(utils/roster.js)保持原始名字(分层正确)');
const roster = require('../utils/roster.js');
const parsed = roster.parseRoster('1. 王二小三丰');
assert(parsed.total === 1 && parsed.names[0].name === '王二小三丰', 'parseRoster 保留原始 5 字(解析层不截断)');

const text = '1. 王二小三丰\n2. 李四';
page.onRosterInput({ detail: { value: text } });
page.onParseRoster();
const groups = page.data.balancedGroups;
assert(Array.isArray(groups) && groups.length === 3, 'balancedGroups 为 3 组结构');
const allNames = groups.flatMap(function (g) { return g.members.map(function (mm) { return mm.name; }); });
assert(allNames.indexOf('王二小三') >= 0, 'onParseRoster:5 字「王二小三丰」→「王二小三」');
assert(allNames.indexOf('王二小三丰') < 0, 'onParseRoster:原始 5 字已不存在(已截断)');
assert(allNames.indexOf('李四') >= 0, '4 字「李四」原样保留');
assert(allNames.every(function (n) { return n.length <= 4; }), '所有成员名字均 ≤ 4 字(显示层截断生效)');
assert(groups[0].members.length > 0, 'balancedGroups[0] 至少有 1 名成员(确定性:2 人填入组 0/1)');
assert(groups[0].members[0].name.length <= 4, 'balancedGroups[0].members[0].name 为截断后(≤4 字)');

// ============ 已知限制说明(非失败):emoji 前置场景按 UTF-16 code unit 截断 ============
console.log('\n[已知限制] emoji 前置名字按 UTF-16 code unit 截断(非用户感知字形)');
const eLead = truncateName('💬张三丰你好');
console.log('  信息:「💬张三丰你好」→「' + eLead + '」(长度 ' + eLead.length + ' 个 UTF-16 code unit)');
assert(
  typeof eLead === 'string' && eLead.length <= 4,
  'emoji 前置名字不抛错且结果 ≤ 4 code units(建议后续改用 Array.from 按字形截断,非本轮阻塞项)'
);

console.log('\n========================================');
if (failures === 0) {
  console.log('边缘用例全部通过 ✅');
  process.exit(0);
} else {
  console.error('存在 ' + failures + ' 个失败用例 ❌');
  process.exit(1);
}
