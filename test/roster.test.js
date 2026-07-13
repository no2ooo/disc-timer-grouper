// test/roster.test.js
// 独立验收测试：智能解析报名名单 + 性别均衡随机分组
// 运行：node test/roster.test.js
// 被测模块（纯 Node，无需小程序运行时）：
//   ../utils/roster.js -> parseRoster, groupInto3Balanced, detectGender, shuffle
//   ../utils/group.js  -> parseNames, groupInto3 (回归验证)

const assert = require('assert');
const path = require('path');

const {
  parseRoster,
  groupInto3Balanced,
  detectGender,
  shuffle,
  isLikelyPersonName,
} = require(path.join(__dirname, '..', 'utils', 'roster'));

const { parseNames, groupInto3 } = require(path.join(__dirname, '..', 'utils', 'group'));

// emoji 转义，避免文件编码问题
const MALE = '\u{1F64B}\u{200D}\u{2642}\u{FE0F}'; // 🙋‍♂️
const FEMALE = '\u{1F64B}\u{200D}\u{2640}\u{FE0F}'; // 🙋‍♀️
const RAISE = '\u{1F64B}'; // 🙋 (裸举手)

// ---------------------------------------------------------------------------
// 19 人样例（11 男 8 女），混合 `1.` 与 `2、` 两种序号格式，混合三种性别标记
// ---------------------------------------------------------------------------
const SAMPLE_LINES = [
  '1. 张三 ' + MALE,
  '2、李四 ' + FEMALE,
  '3. 王五 ' + MALE,
  '4、赵六 ' + FEMALE,
  '5. 钱七 ' + RAISE, // 裸举手 -> 男
  '6、孙八 ' + MALE,
  '7. 周九 ' + FEMALE,
  '8、吴十 ' + MALE,
  '9. 郑十一 ' + FEMALE,
  '10、王十二 ' + MALE,
  '11. 冯十三 ' + FEMALE,
  '12、陈十四 ' + RAISE, // 裸举手 -> 男
  '13. 褚十五 ' + MALE,
  '14、卫十六 ' + FEMALE,
  '15. 蒋十七 ' + MALE,
  '16、沈十八 ' + FEMALE,
  '17. 韩十九 ' + MALE,
  '18、杨二十 ' + FEMALE,
  '19. 朱廿一 ' + MALE,
];

// 期望结果（与上面一一对应）
const EXPECTED = [
  { name: '张三', gender: 'M' },
  { name: '李四', gender: 'F' },
  { name: '王五', gender: 'M' },
  { name: '赵六', gender: 'F' },
  { name: '钱七', gender: 'M' },
  { name: '孙八', gender: 'M' },
  { name: '周九', gender: 'F' },
  { name: '吴十', gender: 'M' },
  { name: '郑十一', gender: 'F' },
  { name: '王十二', gender: 'M' },
  { name: '冯十三', gender: 'F' },
  { name: '陈十四', gender: 'M' },
  { name: '褚十五', gender: 'M' },
  { name: '卫十六', gender: 'F' },
  { name: '蒋十七', gender: 'M' },
  { name: '沈十八', gender: 'F' },
  { name: '韩十九', gender: 'M' },
  { name: '杨二十', gender: 'F' },
  { name: '朱廿一', gender: 'M' },
];

// ---------------------------------------------------------------------------
// 极简测试运行器
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, message: e.message });
    console.log('  ✗ ' + name);
    console.log('      ' + e.message.split('\n').join('\n      '));
  }
}

// ===========================================================================
console.log('\n[1] parseRoster — 名字提取 + 性别判定');
// ===========================================================================
test('19 人全部解析，总数正确', () => {
  const r = parseRoster(SAMPLE_LINES.join('\n'));
  assert.strictEqual(r.total, 19, 'total 应为 19，实际 ' + r.total);
  assert.strictEqual(r.names.length, 19, 'names.length 应为 19');
});

test('性别计数准确 (11男/8女/0未知)', () => {
  const r = parseRoster(SAMPLE_LINES.join('\n'));
  assert.strictEqual(r.maleCount, 11, 'maleCount 应为 11，实际 ' + r.maleCount);
  assert.strictEqual(r.femaleCount, 8, 'femaleCount 应为 8，实际 ' + r.femaleCount);
  assert.strictEqual(r.unknownCount, 0, 'unknownCount 应为 0，实际 ' + r.unknownCount);
});

test('每个名字正确提取（去序号 + 去 emoji + 去首尾空白）', () => {
  const r = parseRoster(SAMPLE_LINES.join('\n'));
  assert.strictEqual(r.names.length, EXPECTED.length);
  for (let i = 0; i < EXPECTED.length; i++) {
    const got = r.names[i];
    const exp = EXPECTED[i];
    assert.strictEqual(got.name, exp.name, `第${i + 1}行名字应为「${exp.name}」，实际「${got.name}」`);
    assert.strictEqual(got.gender, exp.gender, `第${i + 1}行性别应为 ${exp.gender}，实际 ${got.gender}`);
    // 名字里不应残留 emoji / 序号
    assert.ok(!got.name.includes('\u{1F64B}'), `第${i + 1}行名字残留举手 emoji: ${got.name}`);
    assert.strictEqual(got.name.trim(), got.name, `第${i + 1}行名字含首尾空白: "${got.name}"`);
  }
});

test('混合 `N.` 与 `N、` 两种序号格式都能解析', () => {
  const dot = parseRoster('1. 甲 ' + MALE + '\n2. 乙 ' + FEMALE).names.map((n) => n.name);
  const comma = parseRoster('1、甲 ' + MALE + '\n2、乙 ' + FEMALE).names.map((n) => n.name);
  assert.deepStrictEqual(dot, ['甲', '乙']);
  assert.deepStrictEqual(comma, ['甲', '乙']);
});

test('空输入返回空结果', () => {
  const r = parseRoster('');
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.maleCount, 0);
  assert.strictEqual(r.femaleCount, 0);
  assert.deepStrictEqual(r.names, []);
});

// ===========================================================================
console.log('\n[2] detectGender — 三种性别标记 + 未知');
// ===========================================================================
test('detectGender: 🙋‍♂️ -> M', () => {
  assert.strictEqual(detectGender('张三 ' + MALE), 'M');
});
test('detectGender: 🙋‍♀️ -> F', () => {
  assert.strictEqual(detectGender('李四 ' + FEMALE), 'F');
});
test('detectGender: 裸 🙋 -> M', () => {
  assert.strictEqual(detectGender('钱七 ' + RAISE), 'M');
});
test('detectGender: 纯文本 -> U', () => {
  assert.strictEqual(detectGender('王五'), 'U');
});

// ===========================================================================
console.log('\n[3] groupInto3Balanced — 性别均衡随机分组（跑 50 次）');
// ===========================================================================
const PEOPLE = parseRoster(SAMPLE_LINES.join('\n')).names;

test('所有人被全部分配、无重复无遗漏（50 次）', () => {
  const expectedSet = new Set(EXPECTED.map((e) => e.name));
  for (let iter = 0; iter < 50; iter++) {
    const groups = groupInto3Balanced(PEOPLE);
    const all = groups.flatMap((g) => g.members.map((m) => m.name));
    assert.strictEqual(all.length, 19, `第${iter}次：总人数应为 19，实际 ${all.length}`);
    assert.strictEqual(new Set(all).size, 19, `第${iter}次：出现重复或缺失`);
    const gotSet = new Set(all);
    for (const n of expectedSet) {
      assert.ok(gotSet.has(n), `第${iter}次：缺少 ${n}`);
    }
  }
});

test('每组男/女人数差尽量小（任意两组同性别人数差 ≤ 1，50 次）', () => {
  for (let iter = 0; iter < 50; iter++) {
    const groups = groupInto3Balanced(PEOPLE);
    const m = groups.map((g) => g.male);
    const f = groups.map((g) => g.female);
    const mDiff = Math.max(...m) - Math.min(...m);
    const fDiff = Math.max(...f) - Math.min(...f);
    assert.ok(mDiff <= 1, `第${iter}次：男分布 ${JSON.stringify(m)} 组间差 ${mDiff} > 1`);
    assert.ok(fDiff <= 1, `第${iter}次：女分布 ${JSON.stringify(f)} 组间差 ${fDiff} > 1`);
  }
});

test('每组总人数尽量平均（最大组与最小组差 ≤ 1，50 次）', () => {
  const badRuns = [];
  let exampleTotals = null;
  for (let iter = 0; iter < 50; iter++) {
    const groups = groupInto3Balanced(PEOPLE);
    const totals = groups.map((g) => g.total);
    const diff = Math.max(...totals) - Math.min(...totals);
    if (diff > 1) {
      badRuns.push(totals.slice());
      if (!exampleTotals) exampleTotals = totals.slice();
    }
  }
  assert.strictEqual(
    badRuns.length,
    0,
    `共 ${badRuns.length}/50 次出现「组间总人数差 > 1」，示例分组人数 ${JSON.stringify(exampleTotals)}（期望最大最小差 ≤ 1）`
  );
});

// ===========================================================================
console.log('\n[4] shuffle — 随机性 / 长度 / 元素集合');
// ===========================================================================
test('shuffle 长度不变、元素集合不变', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const s = shuffle(arr);
  assert.strictEqual(s.length, arr.length);
  assert.deepStrictEqual([...s].sort((a, b) => a - b), arr);
  // 不修改原数组
  assert.deepStrictEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('shuffle 具有随机性（50 次并非全部相同）', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const distinct = new Set();
  for (let i = 0; i < 50; i++) {
    distinct.add(JSON.stringify(shuffle(arr)));
  }
  assert.ok(distinct.size > 1, 'shuffle 50 次结果完全相同，疑似未随机');
});

// ===========================================================================
console.log('\n[5] 回归：utils/group.js（手写逐行输入入口不能被破坏）');
// ===========================================================================
test('parseNames 解析 5 个手写名字', () => {
  const names = parseNames('张三\n李四\n王五\n赵六\n钱七');
  assert.strictEqual(names.length, 5);
  assert.deepStrictEqual(names.sort(), ['李四', '钱七', '王五', '张三', '赵六'].sort());
});

test('groupInto3 将 5 人分入 3 组（全部分配、无遗漏/重复）', () => {
  const names = parseNames('张三\n李四\n王五\n赵六\n钱七');
  const groups = groupInto3(names);
  assert.strictEqual(groups.length, 3, '应始终返回 3 组结构');
  const all = groups.flatMap((g) => g);
  assert.strictEqual(all.length, 5, '5 人应全部分配，实际 ' + all.length);
  assert.strictEqual(new Set(all).size, 5, '不应有重复或遗漏');
  // 原始集合完整
  const set = new Set(all);
  for (const n of names) assert.ok(set.has(n), '缺少 ' + n);
});

// ===========================================================================
console.log('\n[6] 健壮性：含未知(U)的随机规模，总人数与性别均衡（跑 200 次）');
// ===========================================================================
test('随机男/女/未知组合：总人数差≤1 且性别差≤1 且全部分配（200 次）', () => {
  for (let iter = 0; iter < 200; iter++) {
    const pool = [];
    const nM = 5 + Math.floor(Math.random() * 16); // 5..20
    const nF = 5 + Math.floor(Math.random() * 16);
    const nU = Math.floor(Math.random() * 8); // 0..7
    for (let i = 0; i < nM; i++) pool.push({ name: 'M' + iter + '_' + i, gender: 'M' });
    for (let i = 0; i < nF; i++) pool.push({ name: 'F' + iter + '_' + i, gender: 'F' });
    for (let i = 0; i < nU; i++) pool.push({ name: 'U' + iter + '_' + i, gender: 'U' });

    const groups = groupInto3Balanced(pool);
    const totals = groups.map((g) => g.total);
    const m = groups.map((g) => g.male);
    const f = groups.map((g) => g.female);
    const u = groups.map((g) => g.unknown);

    if (Math.max.apply(null, totals) - Math.min.apply(null, totals) > 1) {
      throw new Error(`第${iter}次：总人数差>1，分组=${JSON.stringify(totals)} (M${nM}/F${nF}/U${nU})`);
    }
    if (Math.max.apply(null, m) - Math.min.apply(null, m) > 1) {
      throw new Error(`第${iter}次：男差>1，分布=${JSON.stringify(m)}`);
    }
    if (Math.max.apply(null, f) - Math.min.apply(null, f) > 1) {
      throw new Error(`第${iter}次：女差>1，分布=${JSON.stringify(f)}`);
    }
    if (Math.max.apply(null, u) - Math.min.apply(null, u) > 1) {
      throw new Error(`第${iter}次：未知差>1，分布=${JSON.stringify(u)}`);
    }
    const all = groups.flatMap((g) => g.members.map((x) => x.name));
    assert.strictEqual(all.length, pool.length, `第${iter}次：人数遗漏/重复`);
    assert.strictEqual(new Set(all).size, pool.length, `第${iter}次：存在重复`);
  }
});

// ===========================================================================
console.log('\n[7] Bug 修复：智能解析应过滤混入的元数据行');
// ===========================================================================
// 用户粘贴的接龙文本里常混有活动标题 / 时间 / 地点 / 价格 / 已上车 / 报名链接等
// 元数据。这些行虽以「数字. 内容」形式出现，但「内容」并非人名，应被过滤。
const LEMON = '\u{1F34B}'; // 🍋
const SPEECH = '\u{1F4AC}'; // 💬

// 应被过滤的元数据行
const META_LINES = [
  '1. 活动时间：20:00-22:00周三',
  '2. 户外',
  '3. 已上车：21/21',
  '4. 主办俱乐部：23',
  '5. 活动地点：大连格致中学',
  '6. 报名链接：weixin://dl/business/?t=DWFHvRGcOle',
  '7. 价格：39.00元/人',
  '8. 2026',
  '9. 07.15',
  '10. - - - - - -',
];

// 应被正确提取的有效人名
const VALID_LINES = [
  '1. 旺仔不喝奶',
  '2. 东歌',
  '3. 王清灏',
  '4. 秋',
  '5. 龙飞',
  '6. 卡特',
  '7. 开源',
  '8. 格致',
  '9. 石嫣然',
  '10. 超会玩-柠檬' + LEMON,
  '11. 一道杠' + SPEECH + 'cium',
  '12. ZY',
  '13. 李',
  '14. 吸鱼徐',
  '15. 每年达',
];

const EXPECTED_VALID = [
  '旺仔不喝奶', '东歌', '王清灏', '秋', '龙飞', '卡特', '开源', '格致', '石嫣然',
  '超会玩-柠檬' + LEMON, '一道杠' + SPEECH + 'cium', 'ZY', '李', '吸鱼徐', '每年达',
];

test('元数据行 + 有效人名混合：仅提取 15 个有效人名', () => {
  const text = META_LINES.concat(VALID_LINES).join('\n');
  const r = parseRoster(text);
  assert.strictEqual(r.total, 15, '应只提取 15 个有效人名，实际 ' + r.total);
  assert.strictEqual(r.names.length, 15, 'names.length 应为 15，实际 ' + r.names.length);
});

test('过滤后结果恰好等于有效人名集合（无元数据泄漏）', () => {
  const text = META_LINES.concat(VALID_LINES).join('\n');
  const r = parseRoster(text);
  const got = r.names.map((n) => n.name);
  // 行序保持:先 10 行元数据(全过滤)后 15 行有效人名,故结果应精确等于 EXPECTED_VALID
  assert.deepStrictEqual(got, EXPECTED_VALID, '过滤后结果应恰好为 15 个有效人名');
});

test('有效人名全部被正确提取（顺序 / 内容一致）', () => {
  const text = VALID_LINES.join('\n');
  const r = parseRoster(text);
  assert.strictEqual(r.total, 15, '有效人名应为 15，实际 ' + r.total);
  const got = r.names.map((n) => n.name);
  for (let i = 0; i < EXPECTED_VALID.length; i++) {
    assert.strictEqual(got[i], EXPECTED_VALID[i], `第${i + 1}人应为「${EXPECTED_VALID[i]}」，实际「${got[i]}」`);
  }
});

test('含备注 emoji 的人名被保留（🍋 / 💬 不算举手 emoji）', () => {
  const r = parseRoster('1. 超会玩-柠檬' + LEMON + '\n2. 一道杠' + SPEECH + 'cium').names;
  assert.deepStrictEqual(r.map((n) => n.name), ['超会玩-柠檬' + LEMON, '一道杠' + SPEECH + 'cium']);
});

// ===========================================================================
console.log('\n[8] isLikelyPersonName — 元数据过滤规则单测');
// ===========================================================================
const IS_NAME = [
  '旺仔不喝奶', '东歌', '王清灏', '秋', '龙飞', '卡特', '开源', '格致', '石嫣然',
  '超会玩-柠檬' + LEMON, '一道杠' + SPEECH + 'cium', 'ZY', '李', '吸鱼徐', '每年达',
  '张三 ' + MALE, '李四' + FEMALE,
];
const NOT_NAME = [
  '', ' ', '🙋', '活动时间：20:00-22:00周三', '户外', '已上车：21/21', '主办俱乐部：23',
  '活动地点：大连格致中学', '报名链接：weixin://dl/business/?t=DWFHvRGcOle', '价格：39.00元/人',
  '2026', '07.15', '39元', '39.00元/人', '- - - - - -', '---', 'http://example.com',
  'https://x.com/a', 'weixin://dl/business/?t=xyz', '费用：免费', '备注：带水',
];
test('有效人名判定为 true', () => {
  for (const s of IS_NAME) {
    assert.ok(isLikelyPersonName(s), `应判定为有效人名，实际误判为元数据: "${s}"`);
  }
});
test('元数据判定为 false', () => {
  for (const s of NOT_NAME) {
    assert.ok(!isLikelyPersonName(s), `应判定为元数据(过滤)，实际误判为人名: "${s}"`);
  }
});

// ===========================================================================
// 汇总
// ===========================================================================
console.log('\n========================================');
console.log(`测试结果：通过 ${passed} / 失败 ${failed}`);
if (failed > 0) {
  console.log('\n失败用例：');
  for (const f of failures) {
    console.log('  - ' + f.name + ' : ' + f.message.split('\n')[0]);
  }
}
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);
