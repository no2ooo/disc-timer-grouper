const { parseDuration } = require('../utils/format.js');
const cases = [
  ['90', 90], ['1:30', 90], ['0:45', 45], ['2分30秒', 150],
  ['1分', 60], ['30秒', 30], ['1m30s', 90], [' 2 : 0 ', 120],
  ['abc', null], ['', null],
];
let pass = 0, fail = 0;
for (const [input, expect] of cases) {
  const got = parseDuration(input);
  const ok = got === expect;
  console.log((ok ? '✓' : '✗') + ' parseDuration(' + JSON.stringify(input) + ') = ' + got + (ok ? '' : ' (期望 ' + expect + ')'));
  ok ? pass++ : fail++;
}
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
