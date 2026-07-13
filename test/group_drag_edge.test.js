// test/group_drag_edge.test.js
// 独立验收补充:覆盖 group_drag.test.js 未覆盖的分支
//   - 同组内不同成员交换(同组不同位置一换一 + 统计重算)
//   - 未先 touchstart 直接 touchend(dragging 为 null)不应崩溃
// 运行:node test/group_drag_edge.test.js

'use strict';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  PASS: ' + msg);
  else { console.error('  FAIL: ' + msg); failures += 1; }
}

function setPath(obj, path, value) {
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  const tokens = [];
  let m;
  while ((m = re.exec(path)) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2]);
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] == null) cur[t] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    cur = cur[t];
  }
  cur[tokens[tokens.length - 1]] = value;
}

let mockMemberRects = [];
global.getApp = function () { return { globalData: { settings: {} } }; };
let captured = null;
global.Page = function (cfg) { captured = cfg; };
global.wx = {
  vibrateShort() {}, setStorageSync() {}, getStorageSync() { return null; },
  showToast() {}, showModal() {}, setClipboardData() {}, showActionSheet() {},
  createSelectorQuery() {
    const api = { selectAll() { return api; }, fields() { return api; }, exec(cb) { cb([mockMemberRects]); } };
    return api;
  }
};

require('../pages/group/group.js');
if (!captured) { console.error('页面未捕获'); process.exit(1); }
const page = Object.assign({}, captured);
page.data = JSON.parse(JSON.stringify(captured.data));
page.setData = function (patch) {
  const self = this;
  Object.keys(patch).forEach(function (k) { setPath(self.data, k, patch[k]); });
};

function mkMember(name, gender) {
  return { name, gender, gc: gender === 'M' ? 'gm' : gender === 'F' ? 'gf' : 'gu',
    gs: gender === 'M' ? '♂' : gender === 'F' ? '♀' : '·' };
}
function mkGroup(members) {
  let male = 0, female = 0, unknown = 0;
  members.forEach(function (mm) { if (mm.gender === 'M') male++; else if (mm.gender === 'F') female++; else unknown++; });
  return { members, male, female, unknown, total: members.length,
    stat: '男 ' + male + ' / 女 ' + female + (unknown ? ' / 未知 ' + unknown : ''),
    classKey: 'card-yellow', dotClass: 'dot-green', title: '黄队' };
}

// ============ 测试 A4:同组内不同成员交换 ============
console.log('\n[测试 A4] swapMembers(0,0,0,1) — 同组不同位置一换一 + 统计重算');
page.setData({ balancedGroups: [ mkGroup([mkMember('A', 'M'), mkMember('B', 'F')]), mkGroup([mkMember('C', 'F')]), mkGroup([]) ] });
page.swapMembers(0, 0, 0, 1);
const s0 = page.data.balancedGroups[0];
assert(s0.members[0].name === 'B' && s0.members[1].name === 'A', '同组(0,0)<->(0,1) 互换成功');
assert(s0.male === 1 && s0.female === 1, '同组交换后统计仍为 男1/女1(守恒)');
assert(s0.total === 2, '同组交换后总数仍为 2');
assert(s0.stat === '男 1 / 女 1', '同组交换后 stat 正确(实际:' + s0.stat + ')');
assert(page.data.balancedGroups[1].members[0].name === 'C', '其他组不受同组交换影响');

// ============ 测试 A5:越界索引安全返回,无副作用 ============
console.log('\n[测试 A5] swapMembers 越界索引直接 return');
page.setData({ balancedGroups: [ mkGroup([mkMember('A', 'M')]), mkGroup([mkMember('B', 'F')]), mkGroup([]) ] });
const beforeOOB = JSON.stringify(page.data.balancedGroups);
page.swapMembers(0, 0, 1, 5);   // m2 越界
assert(JSON.stringify(page.data.balancedGroups) === beforeOOB, '目标成员越界:不交换、数据不变');
page.swapMembers(0, 0, 9, 0);   // g2 越界
assert(JSON.stringify(page.data.balancedGroups) === beforeOOB, '目标组越界:不交换、数据不变');

// ============ 测试 B4:未 touchstart 直接 touchend(dragging=null)不崩溃 ============
console.log('\n[测试 B4] 直接 touchend(dragging 为 null)应安全清空、不抛错');
page.setData({ balancedGroups: [ mkGroup([mkMember('A', 'M')]), mkGroup([mkMember('B', 'F')]), mkGroup([]) ] });
let threw = false;
try {
  page.onMemberTouchEnd({ changedTouches: [{ clientX: 30, clientY: 30 }] });
} catch (e) { threw = true; console.error('  异常:' + e); }
assert(!threw, 'dragging 为 null 时 touchend 不抛异常');
assert(page.data.dragging === null, 'dragging 保持 null(无内存泄漏态)');

// ============ 测试 B5:touchstart 后 touchend 命中自身成员仍不交换(同组场景) ============
console.log('\n[测试 B5] 同组内从(0,0)拖到自身(0,0):不交换,清空');
mockMemberRects = [
  { dataset: { group: 0, member: 0 }, left: 0, top: 0, right: 60, bottom: 60 },
  { dataset: { group: 0, member: 1 }, left: 0, top: 100, right: 60, bottom: 160 }
];
page.setData({ balancedGroups: [ mkGroup([mkMember('A', 'M'), mkMember('B', 'F')]), mkGroup([]), mkGroup([]) ] });
page.onMemberTouchStart({ currentTarget: { dataset: { group: 0, member: 0 } }, touches: [{ clientX: 10, clientY: 10 }] });
page.onMemberTouchEnd({ changedTouches: [{ clientX: 30, clientY: 30 }] }); // 落回自身(0,0)
assert(page.data.dragging === null, '命中自身:dragging 清空');
assert(page.data.balancedGroups[0].members[0].name === 'A' && page.data.balancedGroups[0].members[1].name === 'B', '命中自身:顺序不变(未交换)');

console.log('\n========================================');
if (failures === 0) { console.log('拖拽边缘用例全部通过 ✅'); process.exit(0); }
else { console.error('存在 ' + failures + ' 个失败用例 ❌'); process.exit(1); }
