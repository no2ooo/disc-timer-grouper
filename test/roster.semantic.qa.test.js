// test/roster.semantic.qa.test.js
// 独立验收（QA 严过关）：真实语义回归测试
// 目标：在工程师既有用例之上，用一份「贴近用户真实粘贴」的混合名单，
//       验证 parseRoster 不会把活动元数据误当成人名。
// 运行：node test/roster.semantic.qa.test.js
// 被测模块：../utils/roster.js -> parseRoster, isLikelyPersonName

const assert = require('assert');
const path = require('path');

const { parseRoster, isLikelyPersonName } = require(path.join(__dirname, '..', 'utils', 'roster'));

// emoji 转义，避免文件编码问题
const STAR = '\u{1F31F}';          // 🌟
const LEMON = '\u{1F34B}';         // 🍋
const MALE = '\u{1F64B}\u{200D}\u{2642}\u{FE0F}'; // 🙋‍♂️

// 极简测试运行器（与既有套件保持一致风格）
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

// 元数据泄漏关键词白名单：解析结果的人名里绝不应当出现这些词
const LEAK_KEYWORDS = ['时间', '地点', '价格', '链接', '已上车', '报名', '截止', '户外', '活动'];

function assertNoLeak(names) {
  for (const kw of LEAK_KEYWORDS) {
    for (const n of names) {
      assert.ok(!n.includes(kw), `解析结果泄漏了元数据关键词「${kw}」于人名「${n}」`);
    }
  }
}

// ===========================================================================
console.log('\n[A] 真实语义：标题 + 元数据 + 4 个真实人名 混合名单');
// ===========================================================================
// 贴近用户真实粘贴：开头是活动标题（带 emoji、未编号），
// 接龙里混有「数字. 内容」形式的活动元数据行，
// 最后是 4 个真实报名人名（其中含举手男标记与备注柠檬 emoji）。
const REAL_ROSTER = [
  STAR + STAR + '周三 格致 户外 2026',                                  // 标题行（未编号）
  '1. 活动时间：20:00-22:00周三',
  '2. 活动地点：大连格致中学',
  '3. 价格：39.00元/人',
  '4. 已上车：21/21',
  '5. 报名链接：weixin://dl/business/?t=abc123xyz',
  '6. 旺仔不喝奶',
  '7. 王清灏 ' + MALE,
  '8. 秋',
  '9. 超会玩-柠檬' + LEMON,
].join('\n');

test('真实名单：只解析出 4 个真实人名（total === 4）', () => {
  const r = parseRoster(REAL_ROSTER);
  assert.strictEqual(r.total, 4, '真实人名应为 4，实际 ' + r.total);
  assert.strictEqual(r.names.length, 4, 'names.length 应为 4，实际 ' + r.names.length);
});

test('真实名单：结果恰好为 4 个真实人名，无元数据泄漏', () => {
  const r = parseRoster(REAL_ROSTER);
  const got = r.names.map((n) => n.name);
  assert.deepStrictEqual(
    got,
    ['旺仔不喝奶', '王清灏', '秋', '超会玩-柠檬' + LEMON],
    '解析结果应恰好为 4 个真实人名'
  );
  assertNoLeak(got); // 人名里不得含 时间/地点/价格/链接/已上车/报名 等关键词
});

test('真实名单：王清灏 性别应为 M（用原始 rest 判性别，emoji 已剥离）', () => {
  const r = parseRoster(REAL_ROSTER);
  const wqh = r.names.find((n) => n.name === '王清灏');
  assert.ok(wqh, '应解析出「王清灏」');
  assert.strictEqual(wqh.gender, 'M', '王清灏 应判定为男性 M');
  assert.ok(!wqh.name.includes('\u{1F64B}'), '名字不应残留举手 emoji');
});

test('真实名单：备注 emoji 🍋 应被保留（非举手 emoji）', () => {
  const r = parseRoster(REAL_ROSTER);
  const n = r.names.find((x) => x.name === '超会玩-柠檬' + LEMON);
  assert.ok(n, '应解析出「超会玩-柠檬🍋」且保留 🍋');
});

// ===========================================================================
console.log('\n[B] 标题行「即使带编号」也应被过滤');
// ===========================================================================
// 用户可能把标题行也写成「数字. 内容」形式，验证含黑名单关键词(户外)的标题被过滤。
test('带编号的标题行（含「户外」）被过滤，不计入人名', () => {
  const text = [
    '0. ' + STAR + STAR + '周三 格致 户外 2026',
    '1. 旺仔不喝奶',
    '2. 秋',
  ].join('\n');
  const r = parseRoster(text);
  assert.strictEqual(r.total, 2, '编号标题行应被过滤，仅 2 个真实人名，实际 ' + r.total);
  assertNoLeak(r.names.map((n) => n.name));
});

test('带编号的标题行（未编号时本来就跳过的对照）被过滤', () => {
  const text = [
    STAR + STAR + '周三 格致 户外 2026', // 未编号 -> LINE_RE 不匹配 -> 跳过
    '1. 旺仔不喝奶',
    '2. 秋',
  ].join('\n');
  const r = parseRoster(text);
  assert.strictEqual(r.total, 2, '未编号标题行本就跳过，仅 2 个真实人名，实际 ' + r.total);
});

// ===========================================================================
console.log('\n[C] isLikelyPersonName 真实输入校验（与既有单测互补）');
// ===========================================================================
test('真实人名 -> true（含单字名「秋」、英文名、带备注 emoji）', () => {
  const ok = ['旺仔不喝奶', '王清灏', '秋', '超会玩-柠檬' + LEMON, 'Tom', 'ZY'];
  for (const s of ok) {
    assert.ok(isLikelyPersonName(s), `真实人名应判为 true，误判为元数据: "${s}"`);
  }
});

test('真实元数据 -> false（时间/地点/价格/已上车/报名链接）', () => {
  const meta = [
    '活动时间：20:00-22:00周三',
    '活动地点：大连格致中学',
    '价格：39.00元/人',
    '已上车：21/21',
    '报名链接：weixin://dl/business/?t=abc123xyz',
  ];
  for (const s of meta) {
    assert.ok(!isLikelyPersonName(s), `元数据应判为 false，误判为人名: "${s}"`);
  }
});

// ===========================================================================
console.log('\n========================================');
console.log(`QA 真实语义测试结果：通过 ${passed} / 失败 ${failed}`);
if (failed > 0) {
  console.log('\n失败用例：');
  for (const f of failures) {
    console.log('  - ' + f.name + ' : ' + f.message.split('\n')[0]);
  }
}
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);
