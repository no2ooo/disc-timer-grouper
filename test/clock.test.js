/**
 * 翻页时钟首页「行为级」验收测试（独立验证，不修改任何业务代码）
 * 通过 mock 微信小程序运行时（Page / setData / setInterval）真实执行 clock.js 逻辑。
 * 适配新的 digits 数据结构：每个数字为 { curr, prev, anim } 对象。
 * 运行： node test/clock.test.js
 */
const RealDate = Date;
const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : '  -> ' + detail));
  ok ? pass++ : fail++;
}

// ---- mock 微信运行时 ----
let captured = null;
global.Page = (config) => { captured = config; };

// 可控的定时器计数
let intervalCount = 0;
let clearCount = 0;
let lastCallback = null;
global.setInterval = (cb) => { intervalCount++; lastCallback = cb; return { id: intervalCount }; };
global.clearInterval = () => { clearCount++; };

// 加载被测页面（执行 Page(config) 捕获配置）
require(path.join(__dirname, '..', 'pages', 'clock', 'clock.js'));
if (!captured) { check('加载 clock.js 并捕获 Page 配置', false, 'Page() 未被调用'); process.exit(1); }

/**
 * 支持 'a.b.c' 形式的点路径写入，与微信小程序 setData 的语义一致。
 * 这样 updateTime 里的 `digits.hh.curr` 等路径键才能正确落到嵌套对象上。
 */
function setByPath(obj, dotted, value) {
  const keys = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// 构造一个页面实例上下文（含 data / timer / setData / 方法）
function makeCtx() {
  const ctx = Object.assign({}, captured);   // 拷贝方法 + timer:null + data 引用
  ctx.data = JSON.parse(JSON.stringify(captured.data)); // 独立 data 副本
  ctx.setData = function (kv) {
    Object.keys(kv).forEach((k) => setByPath(this.data, k, kv[k]));
  };
  return ctx;
}

// 用固定本地时间 mock Date，使 updateTime 可确定性验证
function mockDate(ts) {
  global.Date = class extends RealDate {
    constructor(...args) { if (args.length === 0) super(ts); else super(...args); }
    static now() { return ts; }
  };
}
function restoreDate() { global.Date = RealDate; }

// 读取某个数字当前的 curr 值
function getDigit(ctx, k) {
  return ctx.data.digits[k].curr;
}

// ============ 测试 1：updateTime 拆分到 digits.*.curr（含补零）============
function testUpdateTime(ts, expected) {
  mockDate(ts);
  const ctx = makeCtx();
  ctx.updateTime();
  restoreDate();
  const got = {
    hh: getDigit(ctx, 'hh'), h: getDigit(ctx, 'h'),
    mm: getDigit(ctx, 'mm'), m: getDigit(ctx, 'm'),
    ss: getDigit(ctx, 'ss'), s: getDigit(ctx, 's'),
  };
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  check(
    `updateTime 拆分 ${expected.hh}${expected.h}:${expected.mm}${expected.m}:${expected.ss}${expected.s}`,
    ok,
    '得到 ' + JSON.stringify(got)
  );
}
// 13:45:09 -> '134509'
testUpdateTime(new RealDate(2025, 0, 15, 13, 45, 9).getTime(), { hh: '1', h: '3', mm: '4', m: '5', ss: '0', s: '9' });
// 08:03:05 -> pad 补零 -> '080305'
testUpdateTime(new RealDate(2025, 5, 7, 8, 3, 5).getTime(), { hh: '0', h: '8', mm: '0', m: '3', ss: '0', s: '5' });
// 00:00:00 -> '000000'
testUpdateTime(new RealDate(2025, 0, 1, 0, 0, 0).getTime(), { hh: '0', h: '0', mm: '0', m: '0', ss: '0', s: '0' });
// 23:59:59 -> '235959'
testUpdateTime(new RealDate(2025, 11, 31, 23, 59, 59).getTime(), { hh: '2', h: '3', mm: '5', m: '9', ss: '5', s: '9' });

// ============ 测试 2：onResize 横屏检测 ============
function testResize(size, resUndefined, expected, label) {
  const ctx = makeCtx();
  const res = resUndefined ? undefined : { size };
  ctx.onResize(res);
  check('onResize ' + label, ctx.data.isLandscape === expected, '得到 ' + ctx.data.isLandscape);
}
testResize({ windowWidth: 800, windowHeight: 360 }, false, true, '横屏(宽>高) -> true');
testResize({ windowWidth: 360, windowHeight: 800 }, false, false, '竖屏(宽<高) -> false');
testResize({ windowWidth: 600, windowHeight: 600 }, false, false, '正方形(宽==高) -> false');
testResize(undefined, true, false, 'res 为 undefined 不抛错 -> false');
testResize({}, false, false, 'res.size 缺失不抛错 -> false');

// ============ 测试 3：定时器生命周期（无泄漏/无重复）============
intervalCount = 0; clearCount = 0; lastCallback = null;
let ctx = makeCtx();
ctx.onLoad();                       // 启动定时器 #1
check('onLoad 启动定时器', intervalCount === 1 && ctx.timer != null, 'intervalCount=' + intervalCount + ' timer=' + ctx.timer);
ctx.onShow();                       // 已存在 timer，不应重复启动
check('onShow 不重复启动定时器', intervalCount === 1, 'intervalCount=' + intervalCount);
ctx.onHide();                       // 应清理
check('onHide 清理定时器', clearCount === 1 && ctx.timer === null, 'clearCount=' + clearCount + ' timer=' + ctx.timer);
ctx.onShow();                       // 重新启动 #2
check('onHide 后 onShow 重新启动定时器', intervalCount === 2 && ctx.timer != null, 'intervalCount=' + intervalCount);
ctx.onUnload();                     // 应清理
check('onUnload 清理定时器', clearCount === 2 && ctx.timer === null, 'clearCount=' + clearCount + ' timer=' + ctx.timer);

// 回调确实调用 updateTime（箭头函数词法捕获其注册时的 ctx，故用独立 ctx 验证）
{
  intervalCount = 0; clearCount = 0; lastCallback = null;
  const cbCtx = makeCtx();
  cbCtx.onLoad();                   // 注册 setInterval(() => this.updateTime())
  const cb = lastCallback;          // 箭头函数，词法 this = cbCtx
  mockDate(new RealDate(2025, 0, 15, 13, 45, 9).getTime());
  cb();                             // 等价于每秒触发
  restoreDate();
  check(
    '定时器回调执行 updateTime 并刷新数据',
    cbCtx.data.digits.hh.curr === '1' && cbCtx.data.digits.s.curr === '9' && cbCtx.data.digits.ss.curr === '0',
    'data=' + JSON.stringify(cbCtx.data.digits.hh)
  );
}

// ============ 测试 4：翻页动画触发与结束复位 ============
{
  const aCtx = makeCtx();
  // 模拟一次时间变化触发动画（13:45:09，hh 由初始 '0' 变为 '1'）
  mockDate(new RealDate(2025, 0, 15, 13, 45, 9).getTime());
  aCtx.updateTime();
  restoreDate();
  check('updateTime 触发动画 anim=true', aCtx.data.digits.hh.anim === true, 'anim=' + aCtx.data.digits.hh.anim);
  check('updateTime 记录 prev 旧值', aCtx.data.digits.hh.prev === '0', 'prev=' + aCtx.data.digits.hh.prev);
  check('updateTime 记录 curr 新值', aCtx.data.digits.hh.curr === '1', 'curr=' + aCtx.data.digits.hh.curr);
  // 动画结束事件
  aCtx.onFlipEnd({ currentTarget: { dataset: { key: 'hh' } } });
  check('onFlipEnd 重置 anim=false', aCtx.data.digits.hh.anim === false, 'anim=' + aCtx.data.digits.hh.anim);

  // 数字未变化时不应触发动画（09:09:09 -> '090909'，ss/s 从 '0' 变仍需验证，这里用同值场景）
  const bCtx = makeCtx();
  mockDate(new RealDate(2025, 0, 1, 0, 0, 0).getTime());
  bCtx.updateTime(); // 初始全 '0'，无变化
  restoreDate();
  const anyAnim = ['hh', 'h', 'mm', 'm', 'ss', 's'].some((k) => bCtx.data.digits[k].anim === true);
  check('数字未变化时不触发动画', anyAnim === false, 'anyAnim=' + anyAnim);
}

// ============ 测试 5：横屏动态 scale 计算 + tabBar 显隐 ============
// mock 微信运行时（getSystemInfoSync / hideTabBar / showTabBar）
const wxState = { hide: 0, show: 0, hideShouldFail: false, showShouldFail: false, systemInfo: null };
global.wx = {
  getSystemInfoSync() {
    return wxState.systemInfo || { windowWidth: 0, windowHeight: 0 };
  },
  hideTabBar(opt) {
    wxState.hide++;
    if (opt && typeof opt.fail === 'function' && wxState.hideShouldFail) opt.fail();
  },
  showTabBar(opt) {
    wxState.show++;
    if (opt && typeof opt.fail === 'function' && wxState.showShouldFail) opt.fail();
  },
};

// 宽度上限理论值：0.95 * 750 / 632
const WIDTH_LIMIT = (0.95 * 750) / 632;

// 5.1 onResize 横屏（iPad 宽屏，宽度主导）正确设置 isLandscape 与 scale
{
  const ctx = makeCtx();
  ctx.onResize({ size: { windowWidth: 1024, windowHeight: 768 } });
  check('onResize 横屏(isLandscape) 检测正确', ctx.data.isLandscape === true, 'isLandscape=' + ctx.data.isLandscape);
  check('onResize 宽屏横屏 scale≈宽度上限(0.95*750/632)',
    Math.abs(ctx.data.scale - WIDTH_LIMIT) < 1e-6,
    'scale=' + ctx.data.scale + ' expect≈' + WIDTH_LIMIT);
}

// 5.2 onResize 手机横屏（高度主导 + 触发 0.85 下限兜底）
//     移除 CLOCK 标签后高度基准降为 132rpx，需更矮的屏(800x260)才能使自然高度上限<0.85 触发下限兜底。
{
  const ctx = makeCtx();
  ctx.onResize({ size: { windowWidth: 800, windowHeight: 260 } });
  check('onResize 手机横屏 isLandscape=true', ctx.data.isLandscape === true, 'isLandscape=' + ctx.data.isLandscape);
  check('onResize 手机横屏 scale=下限兜底 0.85(高度上限<0.85)',
    Math.abs(ctx.data.scale - 0.85) < 1e-6, 'scale=' + ctx.data.scale);
  check('onResize 手机横屏 scale<宽度上限(高度主导)',
    ctx.data.scale < WIDTH_LIMIT, 'scale=' + ctx.data.scale);
}

// 5.3 onResize 竖屏 scale 固定 1.0
{
  const ctx = makeCtx();
  ctx.onResize({ size: { windowWidth: 360, windowHeight: 800 } });
  check('onResize 竖屏 isLandscape=false', ctx.data.isLandscape === false, 'isLandscape=' + ctx.data.isLandscape);
  check('onResize 竖屏 scale=1.0', ctx.data.scale === 1.0, 'scale=' + ctx.data.scale);
}

// 5.4 极矮横屏：受高度限制且被下限 0.85 兜底（不溢出）
{
  const ctx = makeCtx();
  const s = ctx.calcLandscapeScale(800, 200); // 高度很小
  check('calcLandscapeScale 极矮屏不低于下限 0.85', s >= 0.85, 'scale=' + s);
  check('calcLandscapeScale 极矮屏不超过宽度上限', s <= WIDTH_LIMIT + 1e-9, 'scale=' + s);
}

// 5.5 calcLandscapeScale 偏高横屏(900x520)：移除 CLOCK 标签后高度基准降为 132rpx，
//      此时高度上限(0.45*availH/132)大于宽度上限，故返回宽度上限(0.95*750/632)。
{
  const ctx = makeCtx();
  const w = 900, h = 520;
  const s = ctx.calcLandscapeScale(w, h);
  check('calcLandscapeScale 偏高横屏=宽度上限(标签移除后高度上限不再主导)',
    Math.abs(s - WIDTH_LIMIT) < 1e-6, 'scale=' + s + ' expect≈' + WIDTH_LIMIT);
}

// 5.6 calcLandscapeScale iPad 宽屏返回宽度上限
{
  const ctx = makeCtx();
  const s = ctx.calcLandscapeScale(1024, 768);
  check('calcLandscapeScale iPad 宽屏=宽度上限', Math.abs(s - WIDTH_LIMIT) < 1e-6, 'scale=' + s);
}

// 5.7 calcLandscapeScale 异常尺寸兜底返回 1.0
{
  const ctx = makeCtx();
  const s = ctx.calcLandscapeScale(0, 0);
  check('calcLandscapeScale 异常尺寸兜底返回 1.0', s === 1.0, 'scale=' + s);
}

// 5.8 calcLandscapeScale 高度上限使真实时钟高≈屏高 45%（文档目标成立，未触底）
// 注：文档目标「缩放后时钟面高 ≤ 屏高 45%」仅当自然高度上限 ≥ MIN_SCALE(0.85) 时精确成立；
//     若高度上限 < 0.85（极矮屏），MIN_SCALE 兜底会使真实占比 > 45%（但仍不溢出）。
{
  const ctx = makeCtx();
  const w = 900, h = 360; // h/w=0.4，availH=300rpx，自然高度上限(0.45*300/132)=1.02>0.85 且 < 宽度上限
  const s = ctx.calcLandscapeScale(w, h);
  const availH = (750 * h) / w;
  const realH = 132 * s; // 缩放后真实时钟面高（无标签）
  const ratio = realH / availH;
  check('calcLandscapeScale 高度主导(未触底)真实时钟高≈屏高45%',
    Math.abs(ratio - 0.45) < 1e-6,
    'ratio=' + ratio.toFixed(4) + ' scale=' + s);
}

// 5.9 onLoad 横屏（iPad 宽屏，宽度主导）：读取系统信息并隐藏 tabBar
{
  wxState.systemInfo = { windowWidth: 1024, windowHeight: 768 };
  wxState.hide = 0; wxState.show = 0;
  const ctx = makeCtx();
  ctx.onLoad();
  check('onLoad 横屏隐藏 tabBar(hideTabBar 调用)', wxState.hide === 1, 'hide=' + wxState.hide);
  check('onLoad 横屏 isLandscape=true', ctx.data.isLandscape === true, 'isLandscape=' + ctx.data.isLandscape);
  check('onLoad 横屏 scale≈宽度上限', Math.abs(ctx.data.scale - WIDTH_LIMIT) < 1e-6, 'scale=' + ctx.data.scale);
}

// 5.6 onLoad 竖屏：显示 tabBar
{
  wxState.systemInfo = { windowWidth: 360, windowHeight: 800 };
  wxState.hide = 0; wxState.show = 0;
  const ctx = makeCtx();
  ctx.onLoad();
  check('onLoad 竖屏显示 tabBar(showTabBar 调用)', wxState.show === 1, 'show=' + wxState.show);
  check('onLoad 竖屏 scale=1.0', ctx.data.scale === 1.0, 'scale=' + ctx.data.scale);
}

// 5.7 onHide / onUnload 恢复 tabBar
{
  wxState.systemInfo = { windowWidth: 800, windowHeight: 360 };
  const ctx = makeCtx();
  ctx.onLoad(); // 横屏 -> hide 一次
  wxState.hide = 0; wxState.show = 0; // 重置计数便于断言 onHide
  ctx.onHide();
  check('onHide 恢复 tabBar(showTabBar 调用)', wxState.show === 1, 'show=' + wxState.show);

  ctx.onLoad(); // 重新横屏 -> hide
  wxState.show = 0; // 重置便于断言 onUnload
  ctx.onUnload();
  check('onUnload 恢复 tabBar(showTabBar 调用)', wxState.show === 1, 'show=' + wxState.show);
}

// 5.8 hideTabBar / showTabBar 的 fail 回调不应抛出
{
  wxState.systemInfo = { windowWidth: 800, windowHeight: 360 };
  wxState.hideShouldFail = true;
  wxState.showShouldFail = true;
  const ctx = makeCtx();
  let threw = false;
  try {
    ctx.onLoad();
  } catch (e) {
    threw = true;
  }
  check('tabBar fail 回调不抛错', threw === false, 'threw=' + threw);
  wxState.hideShouldFail = false;
  wxState.showShouldFail = false;
}

// ============ 测试 6：强化用例 A —— 极端矮屏横屏(900×280) ============
// 验证「自然高度上限 < MIN_SCALE 下限」「scale 被下限兜底为 0.85」「仍不溢出」。
// 真实渲染总高 = clock-face(132rpx)，已移除底部 CLOCK 标签；源码 calcLandscapeScale 以
// BASE_FACE_HEIGHT_RPX=132 为基准。
// 该屏(900x280)自然高度上限 heightScale=(0.45*availH)/132≈0.795 < 0.85，触发 MIN_SCALE 兜底 → scale=0.85，
// 真实高度占比≈48.1%（>45% 但「不溢出」，可读性优先，符合规格下限要求）。
const REAL_CLOCK_HEIGHT_RPX = 132;
{
  const ctx = makeCtx();
  const w = 900, h = 280;
  const s = ctx.calcLandscapeScale(w, h);
  const widthScale = (0.95 * 750) / 632;
  const availH = (750 * h) / w;
  const heightScale = (0.45 * availH) / 132;
  check('强化A 900×280 自然高度上限<0.85下限', heightScale < 0.85,
    'heightScale=' + heightScale.toFixed(4));
  check('强化A 900×280 scale 被下限兜底为 0.85',
    Math.abs(s - 0.85) < 1e-6, 'scale=' + s);
  check('强化A 900×280 高度上限 < 宽度上限',
    heightScale < widthScale, 'heightScale=' + heightScale + ' widthScale=' + widthScale);
  // 不溢出：缩放后宽 ≤ 95% 屏宽；缩放后真实总高 ≤ 屏高（均换算 rpx）
  const scaledW = 632 * s;
  const scaledH = REAL_CLOCK_HEIGHT_RPX * s;
  check('强化A 900×280 宽度不溢出(≤95%屏宽)',
    scaledW <= 750 * 0.95 + 1e-6,
    'scaledW=' + scaledW.toFixed(1) + 'rpx / 上限=' + (750 * 0.95).toFixed(1) + 'rpx');
  check('强化A 900×280 高度不溢出(≤屏高)',
    scaledH <= availH + 1e-6,
    'scaledH=' + scaledH.toFixed(1) + 'rpx / 屏高=' + availH.toFixed(1) + 'rpx');
  const hPctReal = (scaledH / availH * 100);
  console.log('  · 900×280 真实时钟高度占屏 ≈ ' + hPctReal.toFixed(1) +
    '%（自然上限<0.85→被 MIN_SCALE 兜底；45% 目标在更高屏如 900×520 精确成立，见测试 5.8）');
}

// ============ 测试 7：强化用例 B —— tabBar 显隐状态机序列 ============
// 序列：横屏进入→hide、切竖屏→show、onHide→show（离开页面恢复）。
{
  wxState.systemInfo = { windowWidth: 800, windowHeight: 360 }; // 横屏
  wxState.hide = 0; wxState.show = 0;
  const ctx = makeCtx();
  ctx.onLoad();                                   // 横屏 -> hide 1
  check('强化B 横屏进入隐藏 tabBar(hide=1)', wxState.hide === 1 && wxState.show === 0,
    'hide=' + wxState.hide + ' show=' + wxState.show);
  // 模拟旋转到竖屏
  ctx.onResize({ size: { windowWidth: 360, windowHeight: 800 } });
  check('强化B 切竖屏恢复 tabBar(show 累计=1)',
    wxState.show === 1 && wxState.hide === 1, 'hide=' + wxState.hide + ' show=' + wxState.show);
  // 离开页面
  ctx.onHide();
  check('强化B onHide 恢复 tabBar(show 累计=2)',
    wxState.show === 2 && wxState.hide === 1, 'hide=' + wxState.hide + ' show=' + wxState.show);
}

// ============ 测试 8：源码静态复核（强化回归防护，独立验证修复）============
// 目的：不依赖行为推断，直接从源码层面确认「CLOCK 标签已移除 + 高度基准恒定 132」。
const clockDir = path.join(__dirname, '..', 'pages', 'clock');
const clockJsSrc = fs.readFileSync(path.join(clockDir, 'clock.js'), 'utf8');

// 8.1 常量名 + 取值确认：BASE_FACE_HEIGHT_RPX = 132
check('源码常量 BASE_FACE_HEIGHT_RPX 定义为 132',
  /const\s+BASE_FACE_HEIGHT_RPX\s*=\s*132/.test(clockJsSrc),
  '未在 clock.js 找到 `const BASE_FACE_HEIGHT_RPX = 132`');

// 8.2 无残留旧常量（标签相关高度基准已彻底移除）
check('源码无 BASE_LABEL_HEIGHT_RPX 残留',
  !/BASE_LABEL_HEIGHT_RPX/.test(clockJsSrc), 'clock.js 仍含 BASE_LABEL_HEIGHT_RPX');
check('源码无 BASE_TOTAL_HEIGHT_RPX 残留',
  !/BASE_TOTAL_HEIGHT_RPX/.test(clockJsSrc), 'clock.js 仍含 BASE_TOTAL_HEIGHT_RPX');

// 8.3 calcLandscapeScale 高度上限确实除以 BASE_FACE_HEIGHT_RPX（而非旧标签总高）
check('calcLandscapeScale 高度上限以 BASE_FACE_HEIGHT_RPX 为基准',
  /heightScale\s*=\s*\(HEIGHT_SAFE_RATIO\s*\*\s*availableHeightRpx\)\s*\/\s*BASE_FACE_HEIGHT_RPX/.test(clockJsSrc),
  'heightScale 未除以 BASE_FACE_HEIGHT_RPX');

// 8.4 grep 整个 pages/clock/ 目录，确认不再含 clock-label 类引用（wxml 视图 + wxss 样式 + 其它）
let clockLabelHit = null;
for (const f of fs.readdirSync(clockDir)) {
  const txt = fs.readFileSync(path.join(clockDir, f), 'utf8');
  if (/clock-label/.test(txt)) { clockLabelHit = f; break; }
}
check('整个 pages/clock/ 目录不再含 clock-label 引用',
  clockLabelHit === null, clockLabelHit ? ('在 ' + clockLabelHit + ' 中发现 clock-label') : '');

// 清理 wx mock（本测试位于末尾，无后续用例依赖）
delete global.wx;

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
