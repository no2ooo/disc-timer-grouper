/**
 * 翻页时钟 WXSS 布局「几何级」验收测试（独立验证，不修改任何业务代码）。
 *
 * 目标：验证上下半片文字的对齐方式是否正确，使数字能拼合成一个【正立】的完整数字。
 * 该缺陷属于纯视觉/布局问题，无法被 clock.test.js（仅测 JS 逻辑）捕获，故单独用此测试固化要求。
 *
 * 正确的翻页时钟几何（业界标准做法）：
 *   - 上半片容器(.digit-top-static, 高 66rpx, overflow:hidden) 必须显示数字的【上半部分】
 *     → 其内 .digit-text 应 top:0（文字顶边对齐容器顶边，容器只露出文字的上半）。
 *   - 下半片容器(.digit-bottom-static) 必须显示数字的【下半部分】
 *     → 其内 .digit-text 应 bottom:0（文字底边对齐容器底边，容器只露出文字的下半）。
 *
 * 若对齐颠倒（上半片用 bottom:0、下半片用 top:0），则上半片会显示数字的下半、下半片显示数字的上半，
 * 拼合后数字整体上下颠倒，无法正确合成一个正立数字（正是用户原始反馈①的问题）。
 *
 * 运行： node test/clock_wxss.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : '  -> ' + detail));
  ok ? pass++ : fail++;
}

const wxssPath = path.join(__dirname, '..', 'pages', 'clock', 'clock.wxss');
const wxmlPath = path.join(__dirname, '..', 'pages', 'clock', 'clock.wxml');
const src = fs.readFileSync(wxssPath, 'utf8');
const wxml = fs.readFileSync(wxmlPath, 'utf8');

/**
 * 抽取某个选择器的声明块内容（不含外层花括号）。
 * 支持跨行、嵌套花括号（本文件无嵌套，但做基础容错）。
 */
function blockOf(selector) {
  const re = new RegExp('\\s*' + escapeRe(selector) + '\\s*\\{');
  const start = src.search(re);
  if (start < 0) return null;
  // 从匹配到的 '{' 之后开始找匹配的 '}'
  let i = src.indexOf('{', start);
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(i + 1, j);
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function hasDecl(block, prop, value) {
  if (!block) return false;
  const re = new RegExp('\\b' + escapeRe(prop) + '\\s*:\\s*' + escapeRe(value) + '\\s*;');
  return re.test(block);
}

// ---- 雷区扫描：不允许组合选择器 .a.b 或后代选择器 .a .b ----
const landmine = src.match(/^\s*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|^\s*\.[A-Za-z0-9_-]+\s+\.[A-Za-z0-9_-]+/gm);
check('WXSS 无组合/后代选择器(.a.b / .a .b)', !landmine || landmine.length === 0,
  '发现: ' + JSON.stringify(landmine));

// ---- 半片文字对齐：上半片应 top:0，下半片应 bottom:0 ----
const topBlock = blockOf('.digit-text-top');
const bottomBlock = blockOf('.digit-text-bottom');

check('.digit-text-top 应 top:0（上半片显示数字上半）',
  hasDecl(topBlock, 'top', '0'),
  '当前块=' + JSON.stringify(topBlock));

check('.digit-text-bottom 应 bottom:0（下半片显示数字下半）',
  hasDecl(bottomBlock, 'bottom', '0'),
  '当前块=' + JSON.stringify(bottomBlock));

// 反向确认：不应出现颠倒的对齐
check('.digit-text-top 不应 bottom:0（否则上半片会显示数字下半→颠倒）',
  !hasDecl(topBlock, 'bottom', '0'),
  '当前块=' + JSON.stringify(topBlock));

check('.digit-text-bottom 不应 top:0（否则下半片会显示数字上半→颠倒）',
  !hasDecl(bottomBlock, 'top', '0'),
  '当前块=' + JSON.stringify(bottomBlock));

// ---- 横屏缩放适配：移除写死的 scale(1.45)，改由内联 style 动态控制 ----
check('WXSS 已移除写死的 transform: scale(1.45)',
  !/transform\s*:\s*scale\(\s*1\.45\s*\)/.test(src),
  '仍残留 scale(1.45)');

const wrapperBlock = blockOf('.clock-wrapper');
check('.clock-wrapper 保留 transform-origin(缩放锚点)',
  hasDecl(wrapperBlock, 'transform-origin', 'center center'),
  '当前块=' + JSON.stringify(wrapperBlock));

// wxml 中 clock-wrapper 应带内联 transform: scale({{scale}}) 动态样式
check('wxml 内联 transform: scale({{scale}}) 已应用',
  /class="clock-wrapper[^"]*"[^>]*style="[^"]*transform:\s*scale\(\{\{scale\}\}\)/.test(wxml) ||
  /style="[^"]*transform:\s*scale\(\{\{scale\}\}\)[^"]*"[^>]*class="clock-wrapper/.test(wxml),
  '未在 clock-wrapper 上找到内联 scale 样式');

// 横屏类 .clock-wrapper-landscape 若存在，不得再携带任何 transform 缩放（旧写死 scale 已移除）
const landBlock = blockOf('.clock-wrapper-landscape');
check('.clock-wrapper-landscape 不再携带 transform 缩放',
  !landBlock || !/transform\s*:\s*scale\(/.test(landBlock),
  '当前块=' + JSON.stringify(landBlock));

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
