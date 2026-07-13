// test/group_truncate.test.js
// 集成测试:mock wx / getApp / Page,加载 pages/group/group.js,
// 验证(1) 手写输入入口相关方法/字段/类已彻底删除;
//     (2) 名字超过 4 字时在 onParseRoster 阶段被截断为 4 字,且历史存储一致。
// 运行:node test/group_truncate.test.js

'use strict';

const fs = require('fs');
const path = require('path');

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
  return {
    globalData: {
      settings: { sound: false, vibrate: false, keepScreen: false }
    }
  };
};

let captured = null;
global.Page = function (cfg) {
  captured = cfg;
};

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

// 构造页面实例(引用同一份方法 + 独立 data,带 mock setData)
const page = Object.assign({}, captured);
page.data = JSON.parse(JSON.stringify(captured.data));
page.setData = function (patch) {
  const self = this;
  Object.keys(patch).forEach(function (k) {
    setPath(self.data, k, patch[k]);
  });
};

console.log('\n[1] 手写入口方法已删除');
const deletedMethods = ['onInput', 'onClear', 'onSample', 'onShuffle', 'onTapCard', 'onLongPressCard', '_saveManualHistory'];
deletedMethods.forEach(function (mName) {
  assert(typeof page[mName] === 'undefined', 'Page 实例上不存在已删除方法 ' + mName);
});

console.log('\n[2] data 中已删除手写相关字段');
const deletedFields = ['namesText', 'count', 'perGroup', 'hasResult', 'groups', 'bigbtnActive'];
deletedFields.forEach(function (f) {
  assert(!(f in page.data), 'data 中不存在已删除字段 ' + f);
});

console.log('\n[3] 智能解析入口保留完好');
const keptMethods = ['onToggleRoster', 'onRosterInput', 'onRosterSample', 'onParseRoster', 'onTapBalanced', 'onLongPressBalanced', '_loadHistory', '_syncEmpty', 'onClearHistory'];
keptMethods.forEach(function (mName) {
  assert(typeof page[mName] === 'function', 'Page 实例保留方法 ' + mName);
});
assert('balancedGroups' in page.data && 'rosterText' in page.data, 'data 保留智能解析字段(rosterText / balancedGroups)');

console.log('\n[4] 名字超 4 字截断');
const text = '1. 张三丰你好\n2. 李四';
page.onRosterInput({ detail: { value: text } });
assert(page.data.rosterText === text, 'onRosterInput 写入 rosterText');
page.onParseRoster();
assert(page.data.balancedHasResult === true, 'onParseRoster 生成均衡分组结果');
assert(Array.isArray(page.data.balancedGroups) && page.data.balancedGroups.length === 3, 'balancedGroups 始终为 3 组结构');

const allNames = page.data.balancedGroups.flatMap(function (g) {
  return g.members.map(function (mm) { return mm.name; });
});
assert(allNames.indexOf('张三丰你') >= 0, '5 字名字「张三丰你好」被截断为「张三丰你」(4 字)');
assert(allNames.indexOf('张三丰你好') < 0, '原始 5 字名字「张三丰你好」已不存在(已截断)');
assert(allNames.indexOf('李四') >= 0, '4 字以内名字「李四」原样保留');

console.log('\n[5] 历史存储使用截断后的名字(显示层一致)');
const saved = storageStore['groupHistory'];
assert(Array.isArray(saved) && saved.length === 1, '分组结果已写入历史(1 条)');
if (saved && saved[0]) {
  const histNames = saved[0].groups.flatMap(function (g) { return g; });
  assert(histNames.indexOf('张三丰你') >= 0, '历史中存储的是截断后的名字「张三丰你」');
  assert(histNames.indexOf('张三丰你好') < 0, '历史中不含原始 5 字名字');
}

console.log('\n[6] WXML/WXSS 雷区自查(删除无残留引用)');
const wxmlPath = path.join(__dirname, '..', 'pages', 'group', 'group.wxml');
const wxssPath = path.join(__dirname, '..', 'pages', 'group', 'group.wxss');
const wxml = fs.readFileSync(wxmlPath, 'utf8');
const wxss = fs.readFileSync(wxssPath, 'utf8');

assert(!wxml.includes('手写'), 'WXML 不再提及「手写」');
assert(!wxml.includes('input-card'), 'WXML 不含已删除的 input-card');
assert(!wxml.includes('bigbtn'), 'WXML 不含已删除的 bigbtn');
assert(!wxml.includes('grp-divider'), 'WXML 不含已删除的 grp-divider');
assert(!wxml.includes('hasResult'), 'WXML 不引用已删除字段 hasResult');
assert(!wxml.includes('wx:key="$idx"'), 'WXML 无 wx:key="$idx"');
assert(!/style\s*=.*;/.test(wxml), 'WXML 无 style 带分号');
assert(!wxss.includes('.input-card'), 'WXSS 不含 .input-card');
assert(!wxss.includes('.input-bar'), 'WXSS 不含 .input-bar');
assert(!wxss.includes('.bigbtn'), 'WXSS 不含 .bigbtn');
assert(!wxss.includes('.grp-divider'), 'WXSS 不含 .grp-divider');
// 共用类仍然保留(group.wxss 内部定义的那些)
['.ta', '.ph', '.counter', '.op', '.opbtn', '.opbtn-primary'].forEach(function (cls) {
  assert(wxss.includes(cls), 'WXSS 保留共用类 ' + cls);
});
// .text-yellow 为全局样式(app.wxss 定义),不在 group.wxss 内,确认其全局定义与 WXML 引用都还在
const appWxssPath = path.join(__dirname, '..', 'app.wxss');
const appWxss = fs.readFileSync(appWxssPath, 'utf8');
assert(appWxss.includes('.text-yellow'), '全局 app.wxss 仍定义 .text-yellow');
assert(wxml.includes('text-yellow'), 'WXML 仍引用全局 .text-yellow 类');

console.log('\n========================================');
if (failures === 0) {
  console.log('全部测试通过 ✅  (IS_PASS: YES)');
  process.exit(0);
} else {
  console.error('存在 ' + failures + ' 个失败用例 ❌');
  process.exit(1);
}
