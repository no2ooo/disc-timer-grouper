// test/group_drag.test.js
// 集成测试:mock wx / getApp / Page,加载 pages/group/group.js,
// 验证真·拖拽换组(一换一):
//   测试 A(核心,确定性):直接调用 swapMembers,断言两组对应位置互换 + 性别统计重算正确。
//   测试 B(完整链路):mock wx.createSelectorQuery 命中检测 + onMemberTouch* 全链路。
// 运行:node test/group_drag.test.js

'use strict';

// ---------- 简易断言框架(无第三方依赖) ----------
let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  PASS: ' + msg);
  } else {
    console.error('  FAIL: ' + msg);
    failures += 1;
  }
}

// ---------- 深度 setData 路径支持(模拟小程序 setData) ----------
function setPath(obj, path, value) {
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  const tokens = [];
  let m;
  while ((m = re.exec(path)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
  }
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] == null) {
      cur[t] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    }
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

// 命中检测矩形(由测试 B 控制;mock 的 exec 同步回调 cb)
let mockMemberRects = [];
global.wx = {
  vibrateShort: function () {},
  setStorageSync: function (k, v) { storageStore[k] = v; },
  getStorageSync: function (k) { return storageStore[k] || null; },
  showToast: function () {},
  showModal: function () {},
  setClipboardData: function () {},
  showActionSheet: function () {},
  createSelectorQuery: function () {
    const api = {
      selectAll: function () { return api; },
      fields: function () { return api; },
      // 真实小程序 selectAll().exec(cb) 的回调入参为数组:res[0] 即匹配节点数组
      exec: function (cb) { cb([mockMemberRects]); }
    };
    return api;
  }
};

// ---------- 加载页面 ----------
require('../pages/group/group.js');
if (!captured) {
  console.error('页面配置未通过 Page() 捕获,测试中止');
  process.exit(1);
}

// 构造页面实例(引用同一份方法 + 独立 data,带 mock setData)
const page = Object.assign({}, captured);
page.data = JSON.parse(JSON.stringify(captured.data));
page.setData = function (patch) {
  const self = this;
  Object.keys(patch).forEach(function (k) {
    setPath(self.data, k, patch[k]);
  });
};

// ---------- 构造已知 balancedGroups 的辅助 ----------
function mkMember(name, gender) {
  return {
    name: name,
    gender: gender,
    gc: gender === 'M' ? 'gm' : gender === 'F' ? 'gf' : 'gu',
    gs: gender === 'M' ? '♂' : gender === 'F' ? '♀' : '·'
  };
}
function mkGroup(members) {
  let male = 0, female = 0, unknown = 0;
  members.forEach(function (mm) {
    if (mm.gender === 'M') male++;
    else if (mm.gender === 'F') female++;
    else unknown++;
  });
  return {
    members: members,
    male: male, female: female, unknown: unknown,
    total: members.length,
    stat: '男 ' + male + ' / 女 ' + female + (unknown ? ' / 未知 ' + unknown : ''),
    classKey: 'card-yellow', dotClass: 'dot-green', title: '黄队'
  };
}
function threeGroups() {
  return [
    mkGroup([mkMember('A', 'M'), mkMember('B', 'F')]),
    mkGroup([mkMember('C', 'F'), mkMember('D', 'M')]),
    mkGroup([mkMember('E', 'M')])
  ];
}

// ===========================================================================
console.log('\n[测试 A] swapMembers(0,0,1,0) — 一换一 + 性别统计重算');
// ===========================================================================
page.setData({ balancedGroups: threeGroups() });
page.swapMembers(0, 0, 1, 0);
const g0 = page.data.balancedGroups[0];
const g1 = page.data.balancedGroups[1];
const g2 = page.data.balancedGroups[2];
assert(g0.members[0].name === 'C', '(0,0) 现为原(1,0)的 C');
assert(g0.members[1].name === 'B', '(0,1) 保持不变 B');
assert(g1.members[0].name === 'A', '(1,0) 现为原(0,0)的 A');
assert(g1.members[1].name === 'D', '(1,1) 保持不变 D');
// 性别统计重算
assert(g0.male === 0 && g0.female === 2, '组0 重算:男0/女2(原男1/女1)');
assert(g0.total === 2, '组0 总数仍为 2(守恒)');
assert(g0.stat === '男 0 / 女 2', '组0 stat 重算为「男 0 / 女 2」(实际:' + g0.stat + ')');
assert(g1.male === 2 && g1.female === 0, '组1 重算:男2/女0(原男1/女1)');
assert(g1.total === 2, '组1 总数仍为 2(守恒)');
assert(g1.stat === '男 2 / 女 0', '组1 stat 重算为「男 2 / 女 0」(实际:' + g1.stat + ')');
assert(g2.members.length === 1 && g2.members[0].name === 'E', '组2 完全不受影响');
assert(g0.total + g1.total + g2.total === 5, '交换前后总人数守恒(5)');

// ===========================================================================
console.log('\n[测试 A2] swapMembers(g,g) 同位置直接 return,无副作用');
// ===========================================================================
const beforeSame = JSON.stringify(page.data.balancedGroups);
page.swapMembers(0, 0, 0, 0);
assert(JSON.stringify(page.data.balancedGroups) === beforeSame, '同位置交换不改变数据');

// ===========================================================================
console.log('\n[测试 A3] 含「未知性别」也正确重算');
// ===========================================================================
page.setData({ balancedGroups: [
  mkGroup([mkMember('A', 'M'), mkMember('X', 'U')]),
  mkGroup([mkMember('B', 'F'), mkMember('Y', 'U')]),
  mkGroup([mkMember('E', 'M')])
] });
page.swapMembers(0, 0, 1, 0);
const u0 = page.data.balancedGroups[0];
const u1 = page.data.balancedGroups[1];
assert(u0.male === 0 && u0.female === 1 && u0.unknown === 1, '组0 含未知:男0/女1/未知1');
assert(u0.stat === '男 0 / 女 1 / 未知 1', '组0 stat 含未知(实际:' + u0.stat + ')');
assert(u1.male === 1 && u1.female === 0 && u1.unknown === 1, '组1 含未知:男1/女0/未知1');
assert(u1.stat === '男 1 / 女 0 / 未知 1', '组1 stat 含未知(实际:' + u1.stat + ')');

// ===========================================================================
console.log('\n[测试 B] 完整拖拽链路:touchstart -> touchmove -> touchend(命中检测)');
// ===========================================================================
mockMemberRects = [
  { dataset: { group: 0, member: 0 }, left: 0, top: 0, right: 60, bottom: 60 },
  { dataset: { group: 1, member: 0 }, left: 300, top: 300, right: 360, bottom: 360 }
];
page.setData({ balancedGroups: threeGroups() });

page.onMemberTouchStart({ currentTarget: { dataset: { group: 0, member: 0 } }, touches: [{ clientX: 10, clientY: 10 }] });
assert(page.data.dragging && page.data.dragging.name === 'A', 'touchstart 进入拖拽态,name=A');
assert(page.data.dragging.fromGroup === 0 && page.data.dragging.fromMember === 0, 'touchstart 记录来源(0,0)');
assert(page.data.dragging.ghostStyle === 'left:10px;top:10px;', 'touchstart 初始 ghostStyle 跟随起点');

page.onMemberTouchMove({ touches: [{ clientX: 100, clientY: 100 }] });
assert(page.data.dragging.x === 100 && page.data.dragging.y === 100, 'touchmove 更新浮层坐标(x=100,y=100)');
assert(page.data.dragging.ghostStyle === 'left:100px;top:100px;', 'touchmove 更新 ghostStyle 跟随手指');

// 落点 (330,330) 命中矩形2(组1,成员0:left300/top300/right360/bottom360)
page.onMemberTouchEnd({ changedTouches: [{ clientX: 330, clientY: 330 }] });
// mock 的 exec 同步调用 cb,swap 已在回调内完成,dragging 已置空
assert(page.data.dragging === null, 'touchend 后 dragging 被置为 null');
assert(page.data.balancedGroups[0].members[0].name === 'C', '命中(1,0):(0,0)现为 C');
assert(page.data.balancedGroups[1].members[0].name === 'A', '命中(1,0):(1,0)现为 A(一换一全链路通)');
assert(page.data.balancedGroups[0].members[1].name === 'B' && page.data.balancedGroups[1].members[1].name === 'D', '其余成员不受拖拽影响');

// ===========================================================================
console.log('\n[测试 B2] 落点未命中任何成员 -> 不交换,dragging 仍清空');
// ===========================================================================
page.setData({ balancedGroups: threeGroups() });
mockMemberRects = [
  { dataset: { group: 0, member: 0 }, left: 0, top: 0, right: 60, bottom: 60 },
  { dataset: { group: 1, member: 0 }, left: 300, top: 300, right: 360, bottom: 360 }
];
page.onMemberTouchStart({ currentTarget: { dataset: { group: 0, member: 0 } }, touches: [{ clientX: 10, clientY: 10 }] });
page.onMemberTouchEnd({ changedTouches: [{ clientX: 9999, clientY: 9999 }] }); // 落点外
assert(page.data.dragging === null, '未命中:dragging 清空');
assert(page.data.balancedGroups[0].members[0].name === 'A', '未命中:(0,0)仍为 A(未交换)');
assert(page.data.balancedGroups[1].members[0].name === 'C', '未命中:(1,0)仍为 C(未交换)');

// ===========================================================================
console.log('\n[测试 B3] 落点命中自身 -> 不交换(一换一不移动自己)');
// ===========================================================================
page.setData({ balancedGroups: threeGroups() });
mockMemberRects = [
  { dataset: { group: 0, member: 0 }, left: 0, top: 0, right: 60, bottom: 60 },
  { dataset: { group: 1, member: 0 }, left: 300, top: 300, right: 360, bottom: 360 }
];
page.onMemberTouchStart({ currentTarget: { dataset: { group: 0, member: 0 } }, touches: [{ clientX: 10, clientY: 10 }] });
page.onMemberTouchEnd({ changedTouches: [{ clientX: 30, clientY: 30 }] }); // 落在自身矩形内
assert(page.data.dragging === null, '命中自身:dragging 清空');
assert(page.data.balancedGroups[0].members[0].name === 'A', '命中自身:(0,0)仍为 A(未交换)');

// ===========================================================================
console.log('\n========================================');
if (failures === 0) {
  console.log('全部测试通过 ✅  (IS_PASS: YES)');
  process.exit(0);
} else {
  console.error('存在 ' + failures + ' 个失败用例 ❌');
  process.exit(1);
}
