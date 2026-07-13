// test/group_drag_extra.test.js
// 边界/回归补充测试,独立验证真·拖拽换组(一换一):
//   - 跨组交换后,两组 male+female+unknown 与成员实际性别严格一致、各组人数守恒
//   - 拖拽起点 member=0 不被 `!member` 误杀(== null 正确性)
//   - 非拖拽态 touchend / touchstart 缺 dataset,均安全不报错
//   - [已知限制演示] selectorQuery.exec 回调不触发时 dragging 会卡住(真实小程序必回调)
// 运行:node test/group_drag_extra.test.js

'use strict';

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS: ' + msg); }
  else { console.error('  FAIL: ' + msg); failures += 1; }
}

// ---------- 深度 setData 路径支持(模拟小程序 setData) ----------
function setPath(obj, path, value) {
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  const tokens = [];
  let m;
  while ((m = re.exec(path)) !== null) { tokens.push(m[1] !== undefined ? m[1] : m[2]); }
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] == null) cur[t] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    cur = cur[t];
  }
  cur[tokens[tokens.length - 1]] = value;
}

// ---------- mock 全局环境 ----------
global.getApp = function () {
  return { globalData: { settings: { sound: false, vibrate: false, keepScreen: false } } };
};
let captured = null;
global.Page = function (cfg) { captured = cfg; };

let mockMemberRects = [];
let execShouldFire = true; // 控制 exec 是否真的调用回调(用于已知限制演示)
global.wx = {
  vibrateShort: function () {},
  setStorageSync: function () {},
  getStorageSync: function () { return null; },
  showToast: function () {},
  showModal: function () {},
  setClipboardData: function () {},
  showActionSheet: function () {},
  createSelectorQuery: function () {
    const api = {
      selectAll: function () { return api; },
      fields: function () { return api; },
      // 真实小程序 selectAll().exec(cb) 回调入参为数组:res[0] 即匹配节点数组
      exec: function (cb) { if (execShouldFire) cb([mockMemberRects]); }
    };
    return api;
  }
};

// ---------- 加载页面 ----------
require('../pages/group/group.js');
if (!captured) { console.error('页面配置未通过 Page() 捕获,测试中止'); process.exit(1); }

// 构造页面实例(引用同一份方法 + 独立 data,带 mock setData)
const page = Object.assign({}, captured);
page.data = JSON.parse(JSON.stringify(captured.data));
page.setData = function (patch) {
  const self = this;
  Object.keys(patch).forEach(function (k) { setPath(self.data, k, patch[k]); });
};

// ---------- 辅助 ----------
function mkMember(name, gender) {
  return {
    name: name, gender: gender,
    gc: gender === 'M' ? 'gm' : gender === 'F' ? 'gf' : 'gu',
    gs: gender === 'M' ? '♂' : gender === 'F' ? '♀' : '·'
  };
}
function countG(g) {
  let male = 0, female = 0, unknown = 0;
  g.members.forEach(function (mm) {
    if (mm.gender === 'M') male++;
    else if (mm.gender === 'F') female++;
    else unknown++;
  });
  return { male: male, female: female, unknown: unknown, total: g.members.length };
}
function mkGroup(members, title) {
  const c = countG({ members: members });
  return {
    members: members, male: c.male, female: c.female, unknown: c.unknown,
    total: c.total,
    stat: '男 ' + c.male + ' / 女 ' + c.female + (c.unknown ? ' / 未知 ' + c.unknown : ''),
    classKey: 'card-yellow', dotClass: 'dot-green', title: title || '黄队'
  };
}
// 严格断言:统计与成员实际性别一致 + 总数守恒
function assertStatsMatch(group, label) {
  const c = countG(group);
  assert(c.male === group.male, label + ' male 统计 = 实际男(' + c.male + ')');
  assert(c.female === group.female, label + ' female 统计 = 实际女(' + c.female + ')');
  assert(c.unknown === group.unknown, label + ' unknown 统计 = 实际未知(' + c.unknown + ')');
  assert(group.male + group.female + group.unknown === group.total,
    label + ' male+female+unknown = total(' + group.total + ')');
  assert(group.total === group.members.length, label + ' total = members.length');
}

// ===========================================================================
console.log('\n[测试 C1] 跨组交换后,两组统计与成员性别严格一致 + 各组人数守恒');
// ===========================================================================
page.setData({ balancedGroups: [
  mkGroup([mkMember('A', 'M'), mkMember('B', 'F')], '黄队'),
  mkGroup([mkMember('C', 'F'), mkMember('D', 'M')], '绿队'),
  mkGroup([mkMember('E', 'M')], '蓝队')
] });
const before = page.data.balancedGroups.map(countG);
page.swapMembers(0, 0, 1, 0);
const after = page.data.balancedGroups;
assertStatsMatch(after[0], '组0');
assertStatsMatch(after[1], '组1');
assertStatsMatch(after[2], '组2(未参与)');
// 交换前后每组人数不变(只换人不换总数)
assert(after[0].total === before[0].total, '组0 人数守恒(' + before[0].total + '→' + after[0].total + ')');
assert(after[1].total === before[1].total, '组1 人数守恒');
assert(after[2].total === before[2].total, '组2 人数守恒');
// 被交换进来的成员性别与统计一致
assert(after[0].members[0].gender === 'F' && after[0].female === 2, '组0 换入 F,女=2');
assert(after[1].members[0].gender === 'M' && after[1].male === 2, '组1 换入 M,男=2');
// 全局人头守恒
const sumBefore = before.reduce(function (s, g) { return s + g.total; }, 0);
const sumAfter = after.reduce(function (s, g) { return s + g.total; }, 0);
assert(sumBefore === sumAfter, '全局人头守恒(' + sumBefore + '=' + sumAfter + ')');

// ===========================================================================
console.log('\n[测试 C2] 单成员组参与交换(组1 仅 1 人)');
// ===========================================================================
page.setData({ balancedGroups: [
  mkGroup([mkMember('A', 'M'), mkMember('B', 'F')], '黄队'),
  mkGroup([mkMember('C', 'F')], '绿队'),
  mkGroup([mkMember('E', 'M')], '蓝队')
] });
page.swapMembers(0, 0, 1, 0);
assertStatsMatch(page.data.balancedGroups[0], '组0(换入后)');
assertStatsMatch(page.data.balancedGroups[1], '组1(换出后)');
assert(page.data.balancedGroups[0].total === 2, '组0 仍 2 人');
assert(page.data.balancedGroups[1].total === 1, '组1 仍 1 人');
assert(page.data.balancedGroups[1].members[0].gender === 'M', '组1 现为原组0的 M');

// ===========================================================================
console.log('\n[测试 C3] 连续两次跨组交换,各组统计始终自洽 + 全局守恒');
// ===========================================================================
page.setData({ balancedGroups: [
  mkGroup([mkMember('A', 'M'), mkMember('B', 'F')], '黄队'),
  mkGroup([mkMember('C', 'F'), mkMember('D', 'M')], '绿队'),
  mkGroup([mkMember('E', 'M'), mkMember('F2', 'F')], '蓝队')
] });
const total0 = page.data.balancedGroups.reduce(function (s, g) { return s + g.total; }, 0);
page.swapMembers(0, 0, 1, 0);
page.swapMembers(0, 1, 2, 0);
page.data.balancedGroups.forEach(function (g, i) { assertStatsMatch(g, '组' + i + '(二次交换后)'); });
const total1 = page.data.balancedGroups.reduce(function (s, g) { return s + g.total; }, 0);
assert(total0 === total1, '二次交换后全局人头守恒(' + total0 + '=' + total1 + ')');

// ===========================================================================
console.log('\n[测试 E] touchstart 第 0 个成员:== null 判断不被误杀');
// ===========================================================================
page.setData({ balancedGroups: [
  mkGroup([mkMember('A', 'M'), mkMember('B', 'F')], '黄队'),
  mkGroup([mkMember('C', 'F')], '绿队'),
  mkGroup([mkMember('E', 'M')], '蓝队')
] });
// 关键:member=0 必须用 == null 而非 !member,否则 !0 为 true 会误判无效
page.onMemberTouchStart({ currentTarget: { dataset: { group: 0, member: 0 } }, touches: [{ clientX: 5, clientY: 5 }] });
assert(page.data.dragging !== null, 'member=0 也能进入拖拽态(未被 !member 误杀)');
assert(page.data.dragging.fromMember === 0, 'dragging.fromMember === 0(来源记录正确)');
assert(page.data.dragging.name === 'A', 'dragging.name 为第 0 个成员 A');
page.setData({ dragging: null });

// ===========================================================================
console.log('\n[测试 F] 未拖拽态直接 touchend:安全清空不报错');
// ===========================================================================
page.setData({ dragging: null });
let threw = false;
try {
  page.onMemberTouchEnd({ changedTouches: [{ clientX: 1, clientY: 1 }] });
} catch (e) { threw = true; }
assert(!threw, '非拖拽态 touchend 不抛异常');
assert(page.data.dragging === null, '非拖拽态 touchend 后 dragging 仍为 null');

// ===========================================================================
console.log('\n[测试 G] touchstart 缺 dataset(group/member 缺失):安全返回不拖拽');
// ===========================================================================
page.setData({ balancedGroups: [
  mkGroup([mkMember('A', 'M')], '黄队'),
  mkGroup([mkMember('C', 'F')], '绿队'),
  mkGroup([mkMember('E', 'M')], '蓝队')
] });
page.onMemberTouchStart({ currentTarget: { dataset: {} }, touches: [{ clientX: 5, clientY: 5 }] });
assert(page.data.dragging === null, 'dataset 缺 group/member 时不进入拖拽态');

// ===========================================================================
console.log('\n[测试 H][已知限制演示] selectorQuery.exec 回调不触发 -> dragging 卡住');
console.log('  (说明:真实微信 selectAll().exec(cb) 必然异步回调;此处演示极端异常路径)');
// ===========================================================================
execShouldFire = false; // 模拟 exec 永不调用回调
try {
  page.setData({ balancedGroups: [
    mkGroup([mkMember('A', 'M'), mkMember('B', 'F')], '黄队'),
    mkGroup([mkMember('C', 'F')], '绿队'),
    mkGroup([mkMember('E', 'M')], '蓝队')
  ] });
  mockMemberRects = [
    { dataset: { group: 0, member: 0 }, left: 0, top: 0, right: 60, bottom: 60 },
    { dataset: { group: 1, member: 0 }, left: 300, top: 300, right: 360, bottom: 360 }
  ];
  page.onMemberTouchStart({ currentTarget: { dataset: { group: 0, member: 0 } }, touches: [{ clientX: 10, clientY: 10 }] });
  page.onMemberTouchEnd({ changedTouches: [{ clientX: 330, clientY: 330 }] });
  // 回调未触发 -> setData({dragging:null}) 未执行 -> dragging 仍卡住
  assert(page.data.dragging !== null, '[已知限制] exec 未回调时 dragging 仍卡在(需兜底超时/异常保护)');
  console.log('  ⚠ 建议:工程师可在 onMemberTouchEnd 增加兜底(如 setTimeout/异常保护)确保极端异常下也能清浮层');
} finally {
  execShouldFire = true; // 恢复,避免影响其它调用
}

// ===========================================================================
console.log('\n========================================');
if (failures === 0) {
  console.log('边界/回归补充测试全部通过 ✅  (IS_PASS: YES)');
  process.exit(0);
} else {
  console.error('存在 ' + failures + ' 个失败用例 ❌');
  process.exit(1);
}
