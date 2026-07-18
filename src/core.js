'use strict';

const STORAGE_KEY = 'flowmap:v7';
const WORLD = { width: 2400, height: 1600 };
const STATUS = {
  todo: '未着手',
  doing: '対応中',
  waiting: '確認待ち',
  done: '完了'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const els = {};
let state;
let selection = { type: null, id: null };
let undoStack = [];
let redoStack = [];
let drag = null;
let connect = null;
let spaceHeld = false;
let activeTab = 'detail';
let saveTimer = null;

function initialState() {
  const now = new Date().toISOString();
  const phases = [
    { id: 'phase_plan', title: '準備', x: 40, y: 40, w: 720, h: 720 },
    { id: 'phase_run', title: '実施', x: 790, y: 40, w: 720, h: 720 },
    { id: 'phase_close', title: '振り返り', x: 1540, y: 40, w: 720, h: 720 }
  ];
  const groups = [
    { id: 'group_plan', phaseId: 'phase_plan', title: '企画・設計', x: 80, y: 110, w: 610, h: 260, color: 'blue', collapsed: false },
    { id: 'group_order', phaseId: 'phase_plan', title: '発注・確認', x: 80, y: 400, w: 610, h: 280, color: 'orange', collapsed: false },
    { id: 'group_day', phaseId: 'phase_run', title: '当日運用', x: 830, y: 110, w: 610, h: 300, color: 'green', collapsed: false },
    { id: 'group_report', phaseId: 'phase_close', title: '集計・報告', x: 1580, y: 110, w: 610, h: 300, color: 'purple', collapsed: false }
  ];
  const notes = [
    note('n1', '目的と対象を整理する', 120, 165, 'phase_plan', 'group_plan', { status: 'done', tags: ['企画'], assignee: '広報', checklist: checks(['目的', '対象', '導線'], 3), now }),
    note('n2', '実施内容を決める', 385, 165, 'phase_plan', 'group_plan', { status: 'doing', tags: ['イベント'], checklist: checks(['会場', '体験内容', '必要物'], 1), now }),
    note('n3', '見積もりを取得する', 120, 465, 'phase_plan', 'group_order', { status: 'waiting', tags: ['発注'], assignee: '担当A', due: dateOffset(2), now }),
    note('n4', '社内申請を提出する', 385, 465, 'phase_plan', 'group_order', { status: 'todo', tags: ['申請'], due: dateOffset(4), now }),
    note('n5', '関係者へ当日案内を送る', 120, 565, 'phase_plan', 'group_order', { status: 'todo', tags: ['連絡'], due: dateOffset(6), now }),
    note('n6', '設営状況を確認する', 870, 170, 'phase_run', 'group_day', { status: 'todo', tags: ['当日'], assignee: '運営', location: '会場', now }),
    note('n7', '来場者対応を実施する', 1135, 170, 'phase_run', 'group_day', { status: 'todo', tags: ['当日'], assignee: 'スタッフ', now }),
    note('n8', '撤収と忘れ物確認', 1000, 285, 'phase_run', 'group_day', { status: 'todo', tags: ['撤収'], now }),
    note('n9', '実績数値をまとめる', 1620, 170, 'phase_close', 'group_report', { status: 'todo', tags: ['集計'], assignee: '広報', now }),
    note('n10', '改善点を次回へ残す', 1885, 170, 'phase_close', 'group_report', { status: 'todo', tags: ['振り返り'], now })
  ];
  const edges = [
    edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3'), edge('e3', 'n3', 'n4'), edge('e4', 'n4', 'n5'),
    edge('e5', 'n5', 'n6'), edge('e6', 'n6', 'n7'), edge('e7', 'n7', 'n8'), edge('e8', 'n8', 'n9'), edge('e9', 'n9', 'n10')
  ];
  return {
    version: 7,
    phases,
    groups,
    notes,
    edges,
    viewport: { x: 20, y: 20, scale: 0.78 },
    activity: [{ id: uid('activity'), at: now, label: 'サンプルを作成', noteId: null }],
    settings: { grid: true, navigatorOpen: true, inspectorOpen: true }
  };
}

function note(id, title, x, y, phaseId, groupId, extra = {}) {
  return {
    id, title, x, y, w: 224, h: 116, phaseId, groupId,
    status: extra.status || 'todo',
    due: extra.due || '', assignee: extra.assignee || '', tags: extra.tags || [],
    location: extra.location || '', link: extra.link || '', note: extra.note || '',
    checklist: extra.checklist || [],
    createdAt: extra.now || new Date().toISOString(),
    updatedAt: extra.now || new Date().toISOString()
  };
}

function edge(id, from, to) { return { id, from, to }; }
function checks(labels, doneCount = 0) { return labels.map((text, index) => ({ id: uid('check'), text, done: index < doneCount })); }
function dateOffset(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

function cacheElements() {
  [
    'app','add-note','add-group','add-phase','auto-layout','undo','redo','zoom-out','zoom-reset','zoom-in','fit-view','search-input','data-button','print-button','save-indicator',
    'navigator','collapse-navigator','navigator-search','structure-tree','nav-add-phase','board','stage','world','phase-layer','group-layer','edge-layer','edges','connection-preview','node-layer',
    'open-navigator','open-inspector','quick-popover','canvas-hint','center-selection','toggle-grid','help-button','minimap','minimap-svg','minimap-viewport',
    'inspector','close-inspector','inspector-heading','inspector-empty','node-inspector','edge-inspector','group-inspector','phase-inspector',
    'field-title','field-status','field-due','field-assignee','field-tags','field-location','field-link','field-phase','field-group','checklist-count','checklist-bar','checklist-editor','add-check-item','field-note','node-history','delete-node',
    'edge-summary','edge-from','edge-to','reverse-edge','delete-edge','group-title-field','group-phase-field','group-color-field','toggle-group-collapse','delete-group','phase-title-field','delete-phase',
    'data-dialog','export-json','export-yaml','import-file','reset-sample','help-dialog','toast-region','print-sheet'
  ].forEach((id) => { els[id] = document.getElementById(id); });
  els.workspace = $('.workspace');
  els.tabs = $$('.inspector-tab');
  els.tabPanels = $$('.tab-panel');
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 7 || !Array.isArray(parsed.notes)) return initialState();
    return parsed;
  } catch (error) {
    console.warn('[Flowmap] Failed to restore state', error);
    return initialState();
  }
}

function saveState() {
  clearTimeout(saveTimer);
  els['save-indicator'].textContent = '保存中…';
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      els['save-indicator'].textContent = '保存済み';
    } catch (error) {
      console.error('[Flowmap] Save failed', error);
      els['save-indicator'].textContent = '保存失敗';
    }
  }, 120);
}

function snapshot() {
  const copy = clone(state);
  copy.viewport = clone(state.viewport);
  return copy;
}

function recordActivity(label, noteId = null) {
  const at = new Date().toISOString();
  state.activity.unshift({ id: uid('activity'), at, label, noteId });
  state.activity = state.activity.slice(0, 250);
  if (noteId) {
    const target = getNote(noteId);
    if (target) target.updatedAt = at;
  }
}

function mutate(label, fn, noteId = null) {
  undoStack.push(snapshot());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  fn();
  recordActivity(label, noteId);
  saveState();
  renderAll();
}

function restore(next) {
  state = clone(next);
  saveState();
  renderAll();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  toast('元に戻しました');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  toast('やり直しました');
}

const getNote = (id) => state.notes.find((item) => item.id === id);
const getGroup = (id) => state.groups.find((item) => item.id === id);
const getPhase = (id) => state.phases.find((item) => item.id === id);
const getEdge = (id) => state.edges.find((item) => item.id === id);
