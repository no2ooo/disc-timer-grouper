// pages/group/group.js
const { parseRoster, groupInto3Balanced } = require('../../utils/roster.js');
const storage = require('../../utils/storage.js');
const notify = require('../../utils/notify.js');

const PALETTES = [
  { classKey: 'card-yellow', dotClass: 'dot-green', title: '黄队' },
  { classKey: 'card-green',  dotClass: 'dot-blue',  title: '绿队' },
  { classKey: 'card-blue',   dotClass: 'dot-red',   title: '蓝队' }
];

// 性别 -> 卡片内小图标样式类(单 class,避免 WXSS 组合选择器)
function genderClass(gender) {
  if (gender === 'M') return 'gm';
  if (gender === 'F') return 'gf';
  return 'gu';
}
// 性别 -> 符号
function genderSymbol(gender) {
  if (gender === 'M') return '♂';
  if (gender === 'F') return '♀';
  return '·';
}

// 报名名单示例里用到的举手 emoji(用 codePoint 精确构造,确保 ♂/♀ 符号存在)
const RAW_M = String.fromCodePoint(0x1F64B, 0x1F3FB, 0x200D, 0x2642, 0xFE0F); // 🙋🏻‍♂️
const RAW_F = String.fromCodePoint(0x1F64B, 0x1F3FB, 0x200D, 0x2640, 0xFE0F); // 🙋🏻‍♀️

/**
 * 名字超长截断:超过 max 个字(默认 4)只取前 max 个字,方便一行显示。
 * 放在显示层而不是解析层(utils/roster.js 保留原始名字以保证语义与单测),
 * 在构建分组结果时统一截断,历史存储也会用截断后的名字,保证展示层一致。
 * @param {string} name 原始名字
 * @param {number} [max=4] 最大字数
 * @returns {string} 截断后的名字
 */
function truncateName(name, max) {
  max = max || 4;
  const s = String(name || '');
  return s.length > max ? s.slice(0, max) : s;
}

Page({
  data: {
    history: [],
    // —— 智能解析报名名单(唯一入口) ——
    showRoster: false,          // 折叠区是否展开
    rosterText: '',             // 粘贴文本
    rosterTotal: 0,             // 解析人数
    rosterStat: '',             // 解析统计文案:男 X / 女 Y(/ 未知 Z)
    balancedGroups: [],         // 均衡分组结果
    balancedHasResult: false,
    dragging: null,             // 拖拽中:{fromGroup,fromMember,name,x,y,ghostStyle},非拖拽时为 null
    emptyVisible: true          // 空状态(无解析结果时显示)
  },

  onShow() {
    this._loadHistory();
  },

  // ============ 智能解析入口 ============
  onToggleRoster() {
    notify.tap();
    this.setData({ showRoster: !this.data.showRoster });
  },

  onRosterInput(e) {
    const text = e.detail.value;
    const stats = parseRoster(text);
    this.setData({
      rosterText: text,
      rosterTotal: stats.total,
      rosterStat: buildStatText(stats.maleCount, stats.femaleCount, stats.unknownCount)
    });
  },

  onRosterSample() {
    notify.tap();
    const sample = [
      '🌟🌟周三 格致 户外 2026',
      '⏰活动时间：20:00-22:00周三 07.15',
      '📍活动地点：大连格致中学',
      '🎟价格：39.00元/人',
      '已上车：21/21',
      `1. ${RAW_M} 每年达`,
      `2. ${RAW_M} 23`,
      `3. ${RAW_F} 'ZY`,
      `4. ${RAW_M} 王清灏`,
      `5. ${RAW_F} 秋`,
      `6. ${RAW_M} 阿杰一道杠💬cium`,
      `7. ${RAW_F} 小柚子🍋`,
      `8. ${RAW_M} 大壮`,
      `9. ${RAW_F} 喵喵`,
      `10. ${RAW_M} 老李`,
      `11. ${RAW_M} 阿伟`,
      `12. ${RAW_F} 莉莉`,
      `13. ${RAW_M} 强子`,
      `14. ${RAW_M} 小王`,
      `15. ${RAW_F} 婷婷`,
      `16. ${RAW_M} 超人`,
      `17. ${RAW_M} 阿明`,
      `18. ${RAW_F} 果果`,
      `19. ${RAW_M} 开源`,
      '- - - - - -',
      '🌟报名链接：weixin://dl/business/?t=DWFHvRGcOle'
    ].join('\n');
    const stats = parseRoster(sample);
    this.setData({
      rosterText: sample,
      rosterTotal: stats.total,
      rosterStat: buildStatText(stats.maleCount, stats.femaleCount, stats.unknownCount)
    });
  },

  onParseRoster() {
    notify.tap();
    const text = this.data.rosterText;
    if (!text || !text.trim()) {
      wx.showToast({ title: '请先粘贴名单', icon: 'none' });
      return;
    }
    const stats = parseRoster(text);
    if (stats.total === 0) {
      wx.showToast({ title: '未识别到名单', icon: 'none' });
      this.setData({ balancedGroups: [], balancedHasResult: false });
      this._syncEmpty();
      return;
    }
    const result = groupInto3Balanced(stats.names);
    const balancedGroups = result.map((g, i) => ({
      members: g.members.map((mm) => ({
        name: truncateName(mm.name),   // 这里截断,历史存储也会跟着一致
        gender: mm.gender,
        gc: genderClass(mm.gender),
        gs: genderSymbol(mm.gender)
      })),
      male: g.male,
      female: g.female,
      unknown: g.unknown,
      total: g.total,
      stat: buildStatText(g.male, g.female, g.unknown),
      ...PALETTES[i]
    }));
    this.setData({ balancedGroups, balancedHasResult: true });
    // 历史:用名字数组存储(已是截断后的名字)
    const historyGroups = balancedGroups.map((g) => g.members.map((mm) => mm.name));
    const preview = balancedGroups.map((g, i) => ({ label: PALETTES[i].title, count: g.total }));
    storage.pushGroupHistory({ namesCount: stats.total, groups: historyGroups, preview });
    this._loadHistory();
    wx.vibrateShort({ type: 'medium' });
    this._syncEmpty();
  },

  onTapBalanced(e) {
    notify.tap();
    const idx = e.currentTarget.dataset.idx;
    const g = this.data.balancedGroups[idx];
    if (!g || !g.members.length) return;
    wx.showModal({
      title: g.title,
      content: g.members.map((mm) => mm.name).join('、'),
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onLongPressBalanced(e) {
    notify.tap();
    wx.showActionSheet({
      itemList: ['只看这组', '复制名单', '复制所有人', '取消'],
      success: (res) => {
        const idx = e.currentTarget.dataset.idx;
        const g = this.data.balancedGroups[idx];
        if (!g) return;
        if (res.tapIndex === 0) {
          this.onTapBalanced(e);
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({ data: g.members.map((mm) => mm.name).join('\n') });
          wx.showToast({ title: '已复制', icon: 'success' });
        } else if (res.tapIndex === 2) {
          const all = this.data.balancedGroups.flatMap((x) => x.members.map((mm) => mm.name)).join('\n');
          wx.setClipboardData({ data: all });
          wx.showToast({ title: '已复制全部', icon: 'success' });
        }
      }
    });
  },

  // ============ 真·拖拽换组(一换一) ============
  // 手指按住某成员跟手拖动,松手落在另一个成员身上即交换两人(不移动其他人)。
  // 使用自定义 touch 事件而非 movable-view,命中检测更可控、体验即真拖。
  onMemberTouchStart(e) {
    const group = e.currentTarget.dataset.group;
    const member = e.currentTarget.dataset.member;
    if (group == null || member == null) return;
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;
    // 用 this.data 取最新成员名字(避免闭包旧值)
    const cur = this.data.balancedGroups[group] && this.data.balancedGroups[group].members[member];
    if (!cur) return;
    this.setData({
      dragging: {
        fromGroup: group,
        fromMember: member,
        name: cur.name,
        x: x,
        y: y,
        ghostStyle: 'left:' + x + 'px;top:' + y + 'px;'
      }
    });
  },

  onMemberTouchMove(e) {
    if (!this.data.dragging) return;
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;
    // 让浮层跟手(用路径更新,避免整块重建 dragging 对象)
    this.setData({
      ['dragging.x']: x,
      ['dragging.y']: y,
      ['dragging.ghostStyle']: 'left:' + x + 'px;top:' + y + 'px;'
    });
  },

  onMemberTouchEnd(e) {
    if (!this.data.dragging) {
      this.setData({ dragging: null });
      return;
    }
    const fromGroup = this.data.dragging.fromGroup;
    const fromMember = this.data.dragging.fromMember;
    const t = e.changedTouches[0];
    const x = t.clientX;
    const y = t.clientY;
    const self = this;
    // 异步命中检测:取所有成员矩形,找落点所在且非自身的第一个成员作为目标
    wx.createSelectorQuery()
      .selectAll('.member')
      .fields({ dataset: true, rect: true })
      .exec(function (res) {
        const rects = (res && res[0]) || [];
        let tg = -1;
        let tm = -1;
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          const hit = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
          const isSelf = r.dataset.group === fromGroup && r.dataset.member === fromMember;
          if (hit && !isSelf) {
            tg = r.dataset.group;
            tm = r.dataset.member;
            break;
          }
        }
        if (tg >= 0 && tm >= 0) {
          self.swapMembers(fromGroup, fromMember, tg, tm);
        }
        // 无论是否交换都清掉浮层(selectorQuery 异步,swap 与清 dragging 都在回调里)
        self.setData({ dragging: null });
      });
  },

  swapMembers(g1, m1, g2, m2) {
    if (g1 === g2 && m1 === m2) return;
    const groups = this.data.balancedGroups;
    if (!groups[g1] || !groups[g2]) return;
    if (!groups[g1].members[m1] || !groups[g2].members[m2]) return;
    // 交换两个 member 对象本身(不移动其他人)
    const tmp = groups[g1].members[m1];
    groups[g1].members[m1] = groups[g2].members[m2];
    groups[g2].members[m2] = tmp;
    // 仅对涉及的两组重算性别统计:总数与男/女/未知计数变化,stat 文案同步更新
    recalcGroupStats(groups[g1]);
    recalcGroupStats(groups[g2]);
    this.setData({ balancedGroups: groups });
    // 注意:手动微调不视为新分组,不推历史
  },

  // ============ 历史 ============
  _loadHistory() {
    const list = storage.get('groupHistory') || [];
    const history = list.map((it) => ({
      id: it.id,
      namesCount: it.namesCount,
      timeLabel: formatTimeAgo(it.at),
      preview: it.preview || []
    }));
    this.setData({ history });
  },

  _syncEmpty() {
    // 仅以智能解析结果是否存在为准(手写入口已移除)
    this.setData({ emptyVisible: !this.data.balancedHasResult });
  },

  onClearHistory() {
    notify.tap();
    wx.showModal({
      title: '清空历史',
      content: '将清除所有分组记录,确定吗?',
      success: (res) => {
        if (res.confirm) {
          storage.clearGroupHistory();
          this._loadHistory();
        }
      }
    });
  }
});

// ============ 工具函数 ============
function buildStatText(male, female, unknown) {
  let s = `男 ${male} / 女 ${female}`;
  if (unknown) s += ` / 未知 ${unknown}`;
  return s;
}

// 重算单组的性别统计(被 swapMembers 调用):遍历 members 统计 gender,
// 更新 male/female/unknown/total,并用 buildStatText 重算 stat 文案。
function recalcGroupStats(g) {
  let male = 0;
  let female = 0;
  let unknown = 0;
  for (let i = 0; i < g.members.length; i++) {
    const gender = g.members[i].gender;
    if (gender === 'M') male++;
    else if (gender === 'F') female++;
    else unknown++;
  }
  g.male = male;
  g.female = female;
  g.unknown = unknown;
  g.total = g.members.length;
  g.stat = buildStatText(male, female, unknown);
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
