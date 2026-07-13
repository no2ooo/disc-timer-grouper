// utils/storage.js
// 预设/历史的本地存储

const KEYS = {
  presets: 'presets',         // 用户保存的计时器预设
  groupHistory: 'groupHistory', // 分组历史
  settings: 'settings'        // 偏好(app.js 已存)
};

function get(key) {
  return wx.getStorageSync(KEYS[key]) || (key === 'presets' || key === 'groupHistory' ? [] : {});
}

function set(key, val) {
  wx.setStorageSync(KEYS[key], val);
}

// 预设结构:{ id, name, type, params, createdAt }
// type: 'hiit' | 'cycle' | 'stopwatch'
// params 因 type 而异
function addPreset(preset) {
  const list = get('presets');
  preset.id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  preset.createdAt = Date.now();
  list.unshift(preset);
  set('presets', list);
  return preset;
}

function removePreset(id) {
  const list = get('presets').filter(p => p.id !== id);
  set('presets', list);
}

function pushGroupHistory(record) {
  // record: { namesCount, groups: [[..],[..],[..]] }
  const list = get('groupHistory');
  list.unshift({ id: 'g_' + Date.now(), at: Date.now(), ...record });
  // 只保留最近 20 条
  if (list.length > 20) list.length = 20;
  set('groupHistory', list);
}

function clearGroupHistory() {
  set('groupHistory', []);
}

module.exports = { get, set, addPreset, removePreset, pushGroupHistory, clearGroupHistory };
