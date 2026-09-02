"use strict";
/*
 * lite-app.js — Podcast 財經導讀站前端進入點。
 *
 * T-804：卡片渲染鏈（移植自 public/index.html:1277, 2501-2716）＋防禦性
 * 渲染（SDD M-5）。卡片流、導航、深入解讀內容、映射表套用留給後續 Task。
 */

// ═══════════════════════════════════════════════════════════════════════
// 工具函式（移植自 public/index.html:1277-1281，邏輯逐字相同）
// ═══════════════════════════════════════════════════════════════════════

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 防禦性陣列取值：確保永遠回傳陣列，型別異常（非陣列）時視為空陣列，
 * 而非讓後續 .map() 拋例外（SDD M-5）。
 */
function _asArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * 防禦性物件取值：確保永遠回傳可安全做屬性存取的物件，型別異常
 * （null / 陣列 / 純量）時視為空物件（SDD M-5）。
 */
function _asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * ep_id 格式驗證：ep_id 會被插進 fetch 路徑（`./notes/${epId}.json`／
 * `.deep.json`），因此只接受已知格式 `<podcaster>/<slug>`，其餘一律拒絕。
 * 已對全部 91 筆出貨 ep_id 驗證 100% 符合，不影響既有內容。
 */
const _EP_ID_RE = /^[a-z0-9]+\/[A-Za-z0-9._-]+$/;

function _isSafeEpId(v) {
  return typeof v === 'string' && _EP_ID_RE.test(v);
}

// ═══════════════════════════════════════════════════════════════════════
// 卡片小元件（移植自 public/index.html:2501-2527，邏輯逐字相同）
// ═══════════════════════════════════════════════════════════════════════

function _srcBadge(src) {
  if (!Array.isArray(src) || src.length < 2) return '';
  return `<span class="ml-1 text-slate-400 font-mono text-xs">[${escHtml(src[0])}–${escHtml(src[1])}]</span>`;
}

function _stanceBadge(stance) {
  if (!stance || typeof stance !== 'string') return '';
  const s = stance.replace(/\(.*\)/, '').trim();
  if (s.includes('看多') || s.includes('偏多')) return `<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">${escHtml(stance)}</span>`;
  if (s.includes('看空') || s.includes('偏空')) return `<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">${escHtml(stance)}</span>`;
  return `<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">${escHtml(stance)}</span>`;
}

function _riskBadge(risk) {
  if (!risk) return '';
  if (risk === '高') return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-600 border border-red-200">風險 高</span>`;
  if (risk === '低') return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-600 border border-green-200">風險 低</span>`;
  return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">風險 中</span>`;
}

function _sectionHeader(icon, label) {
  return `<div class="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
    <span>${escHtml(icon)}</span><span>${escHtml(label)}</span></div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 深入解讀入口（T-806：改讀靜態 .deep.json，取代原本的 POST /api/deepdive）
// ═══════════════════════════════════════════════════════════════════════

const _deepdiveInflight = new Set();

/**
 * 開啟深入解讀 modal。改寫自 public/index.html:1888-1917——原本 POST
 * /api/deepdive 即時生成，公開站無後端，改為 fetch 靜態
 * ./notes/<pod>/<slug>.deep.json，依 block_id 前綴選 company_blocks／
 * blocks 陣列，找 block_id 相符者。
 *
 * 404（無 deep.json）或查無該 block_id（M-6）：modal 仍開啟，顯示
 * 「目前尚無深入解讀資料」，不得無盡 loading、不得僅 console 報錯。
 */
async function openDeepDive(epId, blockId) {
  const key = `${epId}::${blockId}`;
  if (_deepdiveInflight.has(key)) return;
  _deepdiveInflight.add(key);

  const overlay = document.getElementById('dd-overlay');
  const left = document.getElementById('dd-col-left');
  const center = document.getElementById('dd-col-center');
  if (!overlay || !left || !center) {
    _deepdiveInflight.delete(key);
    return;
  }
  left.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#9CA3AF;font-size:13px;">載入中…</div>';
  center.innerHTML = '';
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  try {
    if (!_isSafeEpId(epId)) {
      _renderDeepDiveUnavailable(epId, blockId);
      return;
    }
    const res = await fetch(`./notes/${epId}.deep.json`);
    if (!res.ok) {
      // 404（或其他非 2xx）：包含「該集尚未生成深入解讀」與「該集已被
      // T-801 build-time hash 驗證排除」兩種情況，對讀者呈現一致的降級。
      _renderDeepDiveUnavailable(epId, blockId);
      return;
    }
    const deep = await res.json();
    const pool = _asArray(_asObject(deep).company_blocks).concat(_asArray(_asObject(deep).blocks));
    const block = pool.find(b => _asObject(b).block_id === blockId);
    if (!block) {
      _renderDeepDiveUnavailable(epId, blockId);
      return;
    }
    _renderDeepModal(block, epId);
  } catch (err) {
    console.error('[lite] 深入解讀載入失敗', epId, blockId, err);
    _renderDeepDiveUnavailable(epId, blockId);
  } finally {
    _deepdiveInflight.delete(key);
  }
}

function closeDeepDive() {
  const overlay = document.getElementById('dd-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════════════
// 區塊渲染（移植自 public/index.html:2528-2620，邏輯逐字相同 + 防禦性強化）
// ═══════════════════════════════════════════════════════════════════════

function _renderNewsEvents(events, epId, startIndex = 0) {
  events = _asArray(events);
  if (events.length === 0) return '';
  const items = events.map((ev, i) => {
    ev = _asObject(ev);
    return `
    <div class="bg-slate-50 rounded-xl p-3 space-y-1">
      <div class="card-head flex items-start justify-between gap-2">
        <span class="text-xs font-bold text-slate-800">${escHtml(ev.標題 || '')}</span>
        <div class="card-head-meta flex items-center gap-1 flex-shrink-0">
          ${ev.標籤 ? `<span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium">${escHtml(ev.標籤)}</span>` : ''}
          ${_srcBadge(ev.來源)}
          ${epId ? `<button class="dd-more-btn" data-action="open-deep-dive" data-ep-id="${escHtml(epId)}" data-block-id="news-${startIndex + i}">深入解讀</button>` : ''}
        </div>
      </div>
      <div class="text-xs text-slate-700 leading-relaxed">${escHtml(ev.事件 || '')}</div>
      ${ev.觀點 ? `<div class="text-xs text-blue-700 italic">→ ${escHtml(ev.觀點)}</div>` : ''}
    </div>`;
  }).join('');
  return `<div>${_sectionHeader('📰', '新聞事件')}<div class="space-y-2">${items}</div></div>`;
}

function _renderIndustry(industries, epId, startIndex = 0) {
  industries = _asArray(industries);
  if (industries.length === 0) return '';
  const items = industries.map((ind, i) => {
    ind = _asObject(ind);
    const ctx = _asObject(ind.脈絡);
    const kp = _asObject(ind.卡片重點);
    return `
    <div class="border border-slate-200 rounded-xl overflow-hidden">
      <div class="card-head px-3 py-2 bg-slate-800 flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-white">${escHtml(ind.標題 || '')}</span>
        <div class="card-head-meta flex items-center gap-1 flex-shrink-0">
          ${ind.標籤 ? `<span class="px-1.5 py-0.5 rounded bg-slate-600 text-slate-200 text-xs">${escHtml(ind.標籤)}</span>` : ''}
          ${_srcBadge(ind.來源)}
          ${epId ? `<button class="dd-more-btn" data-action="open-deep-dive" data-ep-id="${escHtml(epId)}" data-block-id="industry-${startIndex + i}">深入解讀</button>` : ''}
        </div>
      </div>
      <div class="p-3 space-y-2">
        ${kp.值 ? `<div class="text-sm font-bold text-slate-900">${escHtml(kp.值)}</div>` : ''}
        ${ctx.定調 ? `<div class="text-xs text-slate-700"><span class="font-semibold text-slate-500">定調</span> ${escHtml(ctx.定調)}</div>` : ''}
        ${ctx.現況 ? `<div class="text-xs text-slate-700"><span class="font-semibold text-slate-500">現況</span> ${escHtml(ctx.現況)}</div>` : ''}
        ${ctx.機制 ? `<div class="text-xs text-slate-700"><span class="font-semibold text-slate-500">機制</span> ${escHtml(ctx.機制)}</div>` : ''}
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
          ${ind.主持人態度 ? `<span>${escHtml(_labelFor('主持人態度', '態度'))}：<span class="text-slate-700">${escHtml(ind.主持人態度)}</span></span>` : ''}
          ${ind.短線風險 ? `<span>${escHtml(_labelFor('短線風險', '短線'))}：<span class="text-slate-700">${escHtml(ind.短線風險)}</span></span>` : ''}
          ${ind.中期觀察 ? `<span>${escHtml(_labelFor('中期觀察', '中期'))}：<span class="text-slate-700">${escHtml(ind.中期觀察)}</span></span>` : ''}
        </div>
        ${ind.收斂 ? `<div class="text-xs text-amber-700 font-medium bg-amber-50 rounded-lg px-3 py-2">${escHtml(ind.收斂)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div>${_sectionHeader('🏭', '產業動態')}<div class="space-y-2">${items}</div></div>`;
}

function _renderTargets(targets, epId, startIndex = 0) {
  targets = _asArray(targets);
  if (targets.length === 0) return '';
  const items = targets.map((t, i) => {
    t = _asObject(t);
    return `
    <div class="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
      <div class="flex-shrink-0 flex flex-col gap-1 min-w-[80px]">
        <span class="text-xs font-bold text-slate-900">${escHtml(t.標的 || '')}</span>
        <div class="flex flex-wrap gap-1">${_stanceBadge(t.立場)} ${_riskBadge(t.風險)}</div>
      </div>
      <div class="flex-1 space-y-0.5">
        <div class="text-xs text-slate-500">${escHtml(t.立場依據 || '')} ${_srcBadge(t.來源)}${epId ? ` <button class="dd-more-btn" data-action="open-deep-dive" data-ep-id="${escHtml(epId)}" data-block-id="target-${startIndex + i}">深入解讀</button>` : ''}</div>
        ${t.論述 ? `<div class="text-xs text-slate-700 leading-relaxed">${escHtml(t.論述)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div>${_sectionHeader('🎯', '標的觀點')}<div class="divide-y divide-slate-100">${items}</div></div>`;
}

function _renderQA(qas, epId, startIndex = 0) {
  qas = _asArray(qas);
  if (qas.length === 0) return '';
  let validIdx = startIndex;
  const items = qas.map(qa => {
    qa = _asObject(qa);
    if (qa.標題 === 'API 呼叫失敗') return '';
    validIdx++;
    const pts = _asArray(qa.要點).map(p => {
      p = _asObject(p);
      return `<li class="flex gap-1.5 text-xs text-slate-700"><span class="text-blue-500 flex-shrink-0">•</span><span><span class="font-semibold">${escHtml(p.標題 || '')}</span>${p.內容 ? '：' + escHtml(p.內容) : ''}</span></li>`;
    }).join('');
    return `
    <div class="bg-blue-50 rounded-xl p-3 space-y-2">
      <div class="card-head flex items-start justify-between gap-2">
        <div class="text-xs font-bold text-blue-800">${escHtml(qa.標題 || '')}</div>
        <div class="card-head-meta flex items-center gap-1 flex-shrink-0">
          ${_srcBadge(qa.來源)}
        </div>
      </div>
      ${qa.問題 ? `<div class="text-xs text-blue-700 italic">Q：${escHtml(qa.問題)}</div>` : ''}
      ${pts ? `<ul class="space-y-1">${pts}</ul>` : ''}
      ${qa.結論 ? `<div class="text-xs font-semibold text-blue-900">${escHtml(qa.結論)}</div>` : ''}
    </div>`;
  }).join('');
  return items ? `<div>${_sectionHeader('💬', 'QA 心法')}<div class="space-y-2">${items}</div></div>` : '';
}

// ═══════════════════════════════════════════════════════════════════════
// 主渲染函式（移植自 public/index.html:2621-2716，邏輯逐字相同 + 防禦性強化）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 渲染單張導讀卡的 HTML 字串。
 *
 * 防禦性渲染（SDD M-5）：任何欄位缺失或型別異常，最多造成該區塊留白，
 * 不得整個函式拋例外。card 本身非物件時視為空卡片渲染（不拋例外）。
 * 外層再包一層 try/catch 作為最後防線——即使前述防禦仍有漏網情況，
 * 也只讓該張卡片顯示錯誤佔位，不得讓呼叫端的整頁渲染中斷。
 */
function renderEpisodeCard(card) {
  try {
    return _renderEpisodeCardInner(card);
  } catch (err) {
    console.error('[lite] renderEpisodeCard 渲染失敗，該卡片顯示為空白', err);
    return `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center text-slate-400 text-xs">此集卡片暫時無法顯示</div>`;
  }
}

/**
 * 卡片底部的非官方標示＋原節目連結（T-808，D-2）。
 *
 * card.source_url 由發布管線（lite_publish.py／SPEC-007 T-701）注入，
 * 100% 覆蓋已發布集數；缺失時仍顯示免責文字，只是不含可點擊連結
 * （防禦性渲染，SDD M-5——不因單一欄位缺失而讓整張卡片出錯）。
 */
function _cardDisclaimerHtml(card) {
  card = _asObject(card);
  const url = typeof card.source_url === 'string' ? card.source_url : '';
  const link = url
    ? `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">點此聆聽原節目</a>`
    : '';
  return `<div class="text-xs text-slate-400 border-t border-slate-100 pt-3 mt-1">
    本摘要由 AI 生成，為第三方非官方專案${link ? '，' + link : ''}
  </div>`;
}

function _renderEpisodeCardInner(card) {
  card = _asObject(card);
  const twStocks = _asArray(card.tw_stocks);
  const usStocks = _asArray(card.us_stocks);
  const allStocks = [...twStocks, ...usStocks];

  // 新格式判斷
  const isNewFormat = card.新聞事件 !== undefined || card.產業動態 !== undefined;

  const epId = typeof card.ep_id === 'string' ? card.ep_id : '';
  const stocksHtml = allStocks.map(s => {
    s = _asObject(s);
    const blockId = `company-${s.ticker || ''}`;
    return epId
      ? `<button class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700 font-medium hover:border-slate-400 cursor-pointer transition-colors" data-action="open-deep-dive" data-ep-id="${escHtml(epId)}" data-block-id="${escHtml(blockId)}">
          ${escHtml(s.canonical || '')}
          <span class="text-slate-400 font-mono">${escHtml(s.ticker || '')}</span>
        </button>`
      : `<span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700 font-medium">
          ${escHtml(s.canonical || '')}
          <span class="text-slate-400 font-mono">${escHtml(s.ticker || '')}</span>
        </span>`;
  }).join('');

  // 舊格式相容渲染
  if (!isNewFormat) {
    const summary = _asArray(card.three_line_summary);
    const topics = _asArray(card.topic_paragraphs);
    const mindset = card.mindset_note || '';
    const summaryHtml = summary.map(s =>
      `<li class="flex gap-2 text-sm text-slate-700"><span class="text-blue-500 flex-shrink-0 mt-0.5">•</span><span>${escHtml(s)}</span></li>`
    ).join('');
    const topicsHtml = topics.slice(0, 4).map(t => {
      t = _asObject(t);
      return `
      <div class="bg-slate-50 rounded-xl p-3">
        <div class="text-xs font-bold text-slate-800 mb-1">${escHtml(t.topic || '')}</div>
        <div class="text-xs text-slate-600 leading-relaxed">${escHtml(t.content || '')}</div>
      </div>`;
    }).join('');
    return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden signal-card">
        <div class="px-5 py-4 bg-slate-900">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-blue-300 uppercase tracking-wider">${escHtml(card.podcaster || '—')}</span>
            <span class="text-xs text-slate-400 font-mono">${escHtml(card.date || '—')}</span>
          </div>
          <div class="text-white font-bold text-sm leading-snug line-clamp-2">${escHtml(card.title || '—')}</div>
        </div>
        <div class="p-5 space-y-4">
          ${summary.length > 0 ? `<div><div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">核心觀點</div><ul class="space-y-1.5">${summaryHtml}</ul></div>` : ''}
          ${topics.length > 0 ? `<div><div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">主題精華</div><div class="grid grid-cols-1 gap-2">${topicsHtml}</div></div>` : ''}
          ${mindset ? `<div class="border-l-4 border-blue-700 bg-blue-50 rounded-r-xl px-4 py-3"><div class="text-xs font-bold text-blue-700 mb-1.5">交易心法</div><div class="text-sm text-blue-900 leading-relaxed">${escHtml(mindset)}</div></div>` : ''}
          ${allStocks.length > 0 ? `<div><div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">提及公司</div><div class="flex flex-wrap gap-1.5">${stocksHtml}</div></div>` : ''}
          ${_cardDisclaimerHtml(card)}
        </div>
      </div>`;
  }

  // 新格式渲染
  const hasContent = _asArray(card.新聞事件).length > 0 || _asArray(card.產業動態).length > 0
    || _asArray(card.標的觀點).length > 0 || _asArray(card.QA心法).some(q => _asObject(q).標題 !== 'API 呼叫失敗');

  return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden signal-card">
      <!-- 卡片標頭 -->
      <div class="px-5 py-4 bg-slate-900">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold text-blue-300 uppercase tracking-wider">
            ${escHtml(card.podcaster || '—')}
          </span>
          <span class="text-xs text-slate-400 font-mono">${escHtml(card.date || '—')}</span>
        </div>
        <div class="text-white font-bold text-sm leading-snug line-clamp-2">${escHtml(card.title || '—')}</div>
      </div>

      <div class="p-5 space-y-4">
        <!-- 提及標的（確定性層，永遠顯示） -->
        ${allStocks.length > 0 ? `
        <div>
          <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">提及公司</div>
          <div class="flex flex-wrap gap-1.5">${stocksHtml}</div>
        </div>` : ''}

        ${hasContent ? `
          ${_renderNewsEvents(card.新聞事件, card.ep_id)}
          ${_renderIndustry(card.產業動態, card.ep_id)}
          ${_renderTargets(card.標的觀點, card.ep_id)}
          ${_renderQA(card.QA心法, card.ep_id)}
        ` : `
        <div class="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <div class="text-sm">等待 LLM 抽取</div>
          <div class="text-xs mt-1">請重跑 generate_weekly_reading_cards.py</div>
        </div>`}
        ${_cardDisclaimerHtml(card)}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// T-805：首頁雙導航（日期倒序卡片流 + 週別篩選）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 由 'YYYY-MM-DD' 字串推導 ISO 8601 週別字串 'YYYY-Www'。
 *
 * 標準演算法（ISO 8601）：週四所在的西元年即為該週所屬年份；第 1 週
 * 是包含當年第一個週四的那一週。跨年邊界因此需要「以週四回推」，不能
 * 直接用輸入日期的年份——12/29~12/31 可能屬於下一年的第 1 週，
 * 1/1~1/3 可能屬於前一年的第 52/53 週（ADR-10、spec-008 §7.3）。
 *
 * 非法輸入（缺失、格式不符、無法解析）回傳 null，呼叫端須自行防禦。
 */
function isoWeekOf(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  // 用 UTC 建構，避免時區造成日界偏移影響週次計算。
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;

  // ISO 8601：週一為一週開始（getUTCDay() 0=週日...6=週六，換算成 1=週一...7=週日）。
  const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  // 移到當週週四：該週四所在的西元年即為 ISO 週所屬年份。
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + (4 - isoDow));
  const isoYear = thursday.getUTCFullYear();

  // 該年第 1 週的週四：ISO 8601 定義「第 1 週＝包含 1/4 的那一週」，
  // 不是「包含 1/1 的那一週」——當 1/1 落在週五／六／日時，1/1 所在週
  // 其實屬於前一年的最後一週（第 52 或 53 週），若誤用 1/1 反推會讓
  // 該年第 1 週的週四算早一週，使 1 月初的日期被判到錯誤的週別。
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Thursday = new Date(jan4);
  week1Thursday.setUTCDate(jan4.getUTCDate() + (4 - jan4Dow));

  const weekNum = Math.round((thursday - week1Thursday) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * 由已發布集數清單（notes/index.json 的 items）推導相異週別清單，
 * 依週別字串降序排列（新到舊）。跳過無法解析週別的項目。
 */
function deriveWeekOptions(items) {
  const weeks = new Set();
  for (const it of _asArray(items)) {
    const w = isoWeekOf(_asObject(it).date);
    if (w) weeks.add(w);
  }
  return Array.from(weeks).sort().reverse();
}

/**
 * 由集數清單推導出去重的 podcaster slug 清單（T-1201，spec-012 §7.1）。
 * 排序：集數多寡降序；同數量時 slug 字典序升序（確保重複執行輸出一致、可測）。
 * 防禦性：ep_id 非字串、缺 '/'、或項目本身非物件時，該項直接略過，不拋例外。
 */
function derivePodcasterOptions(items) {
  const counts = new Map();
  for (const raw of _asArray(items)) {
    const it = _asObject(raw);
    const epId = it.ep_id;
    if (typeof epId !== 'string' || !epId.includes('/')) continue;
    const slug = epId.split('/')[0];
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([slug]) => slug);
}

/**
 * 依選定週別（null 表示「全部」）篩選並依 date 降序排列集數清單。
 * 純函式，不觸碰 DOM，方便獨立測試。
 */
function filterByWeek(items, week) {
  const arr = _asArray(items).filter(it => {
    const obj = _asObject(it);
    if (!week) return true;
    return isoWeekOf(obj.date) === week;
  });
  arr.sort((a, b) => String(_asObject(b).date || '').localeCompare(String(_asObject(a).date || '')));
  return arr;
}

/**
 * 依選定的 podcaster slug 清單過濾集數（T-1203，spec-012 §7.2）。
 * selected 為空陣列／null／undefined 時回傳全部（使用者裁決：零選取視同全部）。
 * 不負責排序——排序仍由 filterByWeek 處理（spec §7.3 的串接順序）。
 * 純函式：回傳新陣列，不改動傳入的 items。
 */
function filterByPodcasters(items, selected) {
  const arr = _asArray(items);
  const sel = _asArray(selected);
  if (sel.length === 0) return arr.slice();
  const selSet = new Set(sel);
  return arr.filter(it => {
    const epId = _asObject(it).ep_id;
    if (typeof epId !== 'string' || !epId.includes('/')) return false;
    return selSet.has(epId.split('/')[0]);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// T-809：field_label_map.json 套用（PRD §0.2、D-20、ADR-17）
// ═══════════════════════════════════════════════════════════════════════
//
// 映射表為唯一定義，公開站與自用側（T-810）共讀同一份 field_label_map.json
// ——本輪只做 Lite 側的載入與取值，不改映射表內容本身（Non-scope）。
// 查無鍵時退回呼叫端提供的預設字面，避免顯示 undefined，也避免映射表
// 缺鍵時整頁跟著壞掉。

/** 映射表載入結果；載入完成前為空物件，_labelFor 一律退回預設字面。 */
let FIELD_LABEL_MAP = {};

async function _loadFieldLabelMap() {
  try {
    const res = await fetch('./field_label_map.json');
    if (!res.ok) throw new Error(`field_label_map.json 載入失敗：${res.status}`);
    const data = await res.json();
    FIELD_LABEL_MAP = _asObject(data);
  } catch (err) {
    console.error('[lite] field_label_map.json 載入失敗，欄位標籤將全數退回預設字面', err);
    FIELD_LABEL_MAP = {};
  }
}

/**
 * 依欄位全名查映射表取得顯示標籤；查無鍵或值非字串時退回呼叫端提供
 * 的 defaultLabel，不得顯示 undefined（M-5 防禦性）。呼叫端不得直接
 * 寫死 field_label_map.json 裡的映射後字串——那會讓這裡的查表形同
 * 虛設，且違反 R-8（兩套內容漂移，公開站與自用側顯示不一致）。
 */
function _labelFor(fieldKey, defaultLabel) {
  const v = FIELD_LABEL_MAP[fieldKey];
  return typeof v === 'string' && v ? v : defaultLabel;
}

/** 卡片流容器與週別選單的 DOM id（與 lite/index.html 的骨架對應）。 */
const NAV_STATE = { allItems: [], selectedWeek: null, selectedPodcasters: [] };

async function _fetchCardIndex() {
  const res = await fetch('./notes/index.json');
  if (!res.ok) throw new Error(`notes/index.json 載入失敗：${res.status}`);
  const data = await res.json();
  return _asArray(_asObject(data).items);
}

async function _fetchCardBody(epId) {
  if (!_isSafeEpId(epId)) throw new Error(`ep_id 格式不合法，拒絕載入：${epId}`);
  const res = await fetch(`./notes/${epId}.json`);
  if (!res.ok) throw new Error(`卡片載入失敗：${epId}（${res.status}）`);
  return res.json();
}

function _renderWeekSelector(container, weeks, selected) {
  if (!container) return;
  if (weeks.length === 0) {
    container.innerHTML = '';
    return;
  }
  const options = ['<option value="">全部</option>']
    .concat(weeks.map(w => `<option value="${escHtml(w)}"${w === selected ? ' selected' : ''}>${escHtml(w)}</option>`));
  container.innerHTML = options.join('');
}

/**
 * 渲染 podcaster 篩選 chip（T-1205，spec-012 §7.1/§7.2）。
 * 顯示文字為 slug 大寫；每個 chip 帶 data-action="toggle-podcaster" 與
 * data-podcaster="<slug>"，事件由 _handleDelegatedClick 統一委派處理
 * （T-1207 接線，本函式不掛 onclick，避免 CSP script-src 'self' 擋掉）。
 * aria-pressed 依 selected 是否包含該 slug 決定，供 AC-8 斷言與可及性。
 */
function _renderPodcasterChips(container, options, selected) {
  if (!container) return;
  const sel = new Set(_asArray(selected));
  container.innerHTML = _asArray(options).map(slug => {
    const pressed = sel.has(slug) ? 'true' : 'false';
    return `<button type="button" class="podcaster-chip" data-action="toggle-podcaster" data-podcaster="${escHtml(slug)}" aria-pressed="${pressed}">${escHtml(slug.toUpperCase())}</button>`;
  }).join('');
}

function _renderEmptyState(container, message) {
  container.innerHTML = `<div class="empty-state">${escHtml(message)}</div>`;
}

/** 逐集 lazy fetch 卡片本體並渲染（ADR-6：沿用既有逐集載入策略）。 */
async function _renderCardList(container, items) {
  if (items.length === 0) {
    _renderEmptyState(container, '本頁篩選範圍內尚無集數。');
    return;
  }
  container.innerHTML = '<div class="empty-state">載入卡片中…</div>';
  const cards = await Promise.all(items.map(async it => {
    try {
      const card = await _fetchCardBody(it.ep_id);
      return renderEpisodeCard(card);
    } catch (err) {
      console.error('[lite] 卡片載入失敗，顯示佔位', it.ep_id, err);
      return `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center text-slate-400 text-xs">此集卡片暫時無法載入</div>`;
    }
  }));
  container.innerHTML = `<div class="card-grid">${cards.join('')}</div>`;
}

/**
 * 套用目前的 podcaster 與週別篩選並重繪卡片清單（T-1207）。
 * 串接順序固定為 filterByWeek(filterByPodcasters(all, pods), week)（spec-012
 * §7.3）——podcaster 篩選在前、週別篩選在後，兩者互不重置對方的選取狀態。
 */
async function _applyFilters(els) {
  const byPod = filterByPodcasters(NAV_STATE.allItems, NAV_STATE.selectedPodcasters);
  const filtered = filterByWeek(byPod, NAV_STATE.selectedWeek);
  await _renderCardList(els.main, filtered);
}

async function _applyWeekFilter(week, els) {
  NAV_STATE.selectedWeek = week || null;
  await _applyFilters(els);
}

/**
 * 切換單一 podcaster 的選取狀態（T-1207，委派入口，見 _handleDelegatedClick）。
 * 加入／移除完全獨立於其他 slug（複選），不引入 localStorage（使用者裁決：
 * 不記住選擇）。自行查找 DOM 節點而非依賴外部傳入的 els——因為委派監聽器
 * （見 _handleDelegatedClick）本身沒有 els 的上下文可傳。
 */
async function _togglePodcaster(slug) {
  const idx = NAV_STATE.selectedPodcasters.indexOf(slug);
  if (idx === -1) {
    NAV_STATE.selectedPodcasters.push(slug);
  } else {
    NAV_STATE.selectedPodcasters.splice(idx, 1);
  }

  const chipsEl = document.getElementById('podcaster-chips');
  if (chipsEl) {
    _renderPodcasterChips(chipsEl, derivePodcasterOptions(NAV_STATE.allItems), NAV_STATE.selectedPodcasters);
  }

  await _applyFilters({ main: document.getElementById('site-main') });
}

/** 首頁雙導航初始化：讀索引、建週別選單與 podcaster chip、渲染預設倒序流。 */
async function initHomeNav(els) {
  els = els || {
    main: document.getElementById('site-main'),
    weekSelect: document.getElementById('week-select'),
    podcasterChips: document.getElementById('podcaster-chips'),
  };
  try {
    NAV_STATE.allItems = await _fetchCardIndex();
  } catch (err) {
    console.error('[lite] 索引載入失敗', err);
    if (els.main) _renderEmptyState(els.main, '內容載入失敗，請稍後重新整理頁面。');
    return;
  }

  if (NAV_STATE.allItems.length === 0) {
    if (els.main) _renderEmptyState(els.main, '目前尚無已發布的集數。');
    _renderWeekSelector(els.weekSelect, [], null);
    return;
  }

  const weeks = deriveWeekOptions(NAV_STATE.allItems);
  _renderWeekSelector(els.weekSelect, weeks, NAV_STATE.selectedWeek);

  const podcasterOptions = derivePodcasterOptions(NAV_STATE.allItems);
  _renderPodcasterChips(els.podcasterChips, podcasterOptions, NAV_STATE.selectedPodcasters);

  if (els.weekSelect) {
    els.weekSelect.addEventListener('change', e => {
      _applyWeekFilter(e.target.value || null, els);
    });
  }

  await _applyWeekFilter(null, els);
}

/** 深入解讀 modal 的固定互動元件（關閉鈕、筆記本收摺、欄寬拖曳）。 */
function initDeepDiveModal() {
  const overlay = document.getElementById('dd-overlay');
  const closeBtn = document.getElementById('dd-close');
  const notebookToggle = document.getElementById('dd-notebook-toggle');

  if (closeBtn) closeBtn.addEventListener('click', closeDeepDive);
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeDeepDive();
    });
  }
  // 筆記本隱藏時不綁點擊、並把切換鈕本身藏起來——讀者不該看到一個按下去
  // 只會撐開一塊永遠空白欄位的按鈕（右欄 dd-col-right 從未實作內容）。
  if (notebookToggle) {
    if (LITE_NOTEBOOK_ENABLED) {
      notebookToggle.addEventListener('click', _ddToggleNotebook);
    } else {
      notebookToggle.style.display = 'none';
    }
  }
  _ddInitColumnResizer();
}

// 筆記本與擷取功能整體隱藏（2026-08-29 使用者裁決）。
// 兩者是同一套未完成功能的前後端：「擷取」按鈕原本要把 A／C 區內容存進
// 右欄「筆記本」，但右欄從未實作（dd-col-right 全程無任何內容填入），
// 擷取按鈕也從未綁定任何點擊處理，兩者皆為純裝飾。
// false 時：A／C 區不輸出「📌 擷取」按鈕、Modal 標題列不顯示 📔 切換鈕、
// 不綁定 _ddToggleNotebook。程式碼本身不刪除，日後若真的實作筆記本，
// 改回 true 即可復原入口。
const LITE_NOTEBOOK_ENABLED = false;

/**
 * 事件委派總開關（bug 修復，2026-08-21）：CSP 的 `script-src 'self'`
 * （T-803，M-4／H-7 為擋 BYOK 金鑰被第三方 script 竊取而設）會連同本頁
 * 自己的 inline `onclick="..."` 屬性一起擋掉——這是所有主流瀏覽器對
 * CSP3 的一致實作，不是特定環境的問題。卡片「深入解讀」按鈕與 D 區的
 * 金鑰／送出按鈕原本都是動態產生的 HTML 字串配 `onclick`，因此在真實瀏
 * 覽器（有 CSP 生效）下完全點不動；先前的 `vm` 沙盒測試都是直接呼叫函
 * 式、從未真的透過 DOM click 事件觸發，所以沒攔到。
 *
 * 修法：改用 `data-action`（與必要的 `data-*` 參數）標記這些動態按鈕，
 * 在 `document` 上註冊「一個」委派的 click 監聽器依 `data-action` 分派
 * ——`addEventListener` 註冊本身不受 `script-src` 限制，且不需要放寬
 * CSP，H-7 的防線維持最嚴格狀態。
 */
function _handleDelegatedClick(event) {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'open-deep-dive') {
    openDeepDive(el.dataset.epId, el.dataset.blockId);
  } else if (action === 'toggle-podcaster') {
    _togglePodcaster(el.dataset.podcaster);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', _handleDelegatedClick);
}

async function initApp() {
  // 映射表必須先載入完成才開始渲染卡片，確保第一次繪製就是正確標籤，
  // 不需要卡片渲染後再重繪一次（T-809）。
  await _loadFieldLabelMap();
  await initHomeNav();
  initDeepDiveModal();
  _cleanupLegacyApiKey();
}

/**
 * 一次性清除讀者瀏覽器裡殘留的舊版 Gemini API key（BYOK／對話功能已
 * physically 移除，見本次清版紀錄）。純粹的儲存清理，不是功能：不渲染
 * 任何 UI、不接受任何輸入、找不到值時什麼都不做。保留這一行是因為曾經
 * 開放過這項功能的讀者，瀏覽器裡可能還留著舊金鑰，而移除功能本身的程式
 * 碼後已無任何介面能讓讀者自行清除它。
 */
function _cleanupLegacyApiKey() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('lite_gemini_api_key');
  } catch (e) {
    // 無痕模式等情境下 localStorage 不可用，本來就無殘留可清，忽略即可。
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => { initApp(); });
}

// ═══════════════════════════════════════════════════════════════════════
// T-806：深入解讀 A/B/C 區（逐字移植 + 防禦性強化）
// 原始碼：public/index.html:2217-2455（扣除 chat 送出邏輯，屬 T-807）
// ═══════════════════════════════════════════════════════════════════════

function _ddLeadHtml(blockType, orig) {
  orig = _asObject(orig);
  if (blockType === '產業動態') {
    const ctx = _asObject(orig.脈絡);
    return ctx.定調 ? `<strong>主持人定調：</strong>${escHtml(ctx.定調)}` : '';
  }
  if (blockType === '新聞事件') {
    return orig.事件 ? `<strong>事件：</strong>${escHtml(orig.事件)}` : '';
  }
  if (blockType === '標的觀點') {
    return orig.立場依據 ? `<strong>立場依據：</strong>${escHtml(orig.立場依據)}` : '';
  }
  if (blockType === 'QA心法') {
    return orig.問題 ? `<strong>Q：</strong>${escHtml(orig.問題)}` : '';
  }
  if (blockType === 'company') {
    return orig.via ? `<strong>本集提及方式：</strong>透過「${escHtml(orig.via)}」被點名` : '';
  }
  return '';
}

/** 擷取按鈕 HTML；筆記本功能隱藏時回傳空字串（見 LITE_NOTEBOOK_ENABLED）。 */
function _ddCaptureBtnHtml() {
  if (!LITE_NOTEBOOK_ENABLED) return '';
  return `<button class="dd-capture-btn" type="button" title="擷取至筆記（尚未開放）">📌 擷取</button>`;
}

function _ddZoneA(blockType, orig) {
  orig = _asObject(orig);
  const bar = `<div class="dd-zone-bar"><span class="dd-zone-id">A</span><span class="dd-zone-name">主持人原始觀點</span>${_ddCaptureBtnHtml()}</div>`;
  let inner = '';

  if (blockType === '產業動態') {
    const ctx = _asObject(orig.脈絡);
    const tags = String(orig.標籤 || '').split('/').filter(Boolean);
    inner = `
      ${tags.length ? `<div style="margin-bottom:12px;"><div class="dd-fh">標籤</div><div style="display:flex;flex-wrap:wrap;gap:4px;">${tags.map(t => `<span style="padding:2px 7px;border-radius:3px;border:1px solid #E5E7EB;font-size:10px;color:#6B7280;">${escHtml(t)}</span>`).join('')}</div></div>` : ''}
      ${ctx.現況 ? `<div style="margin-bottom:12px;"><div class="dd-fh">現況</div><div class="dd-prose">${escHtml(ctx.現況)}</div></div>` : ''}
      ${ctx.機制 ? `<div style="margin-bottom:12px;"><div class="dd-fh">機制</div><div class="dd-prose">${escHtml(ctx.機制)}</div></div>` : ''}
      <div class="dd-divider"></div>
      ${orig.主持人態度 ? `<div style="margin-bottom:12px;"><div class="dd-fh">主持人態度</div><div class="dd-box-host">${escHtml(orig.主持人態度)}</div></div>` : ''}
      ${orig.短線風險 ? `<div style="margin-bottom:12px;"><div class="dd-fh">⚠ 短線風險</div><div class="dd-warn-box">${escHtml(orig.短線風險)}</div></div>` : ''}
      ${orig.中期觀察 ? `<div style="margin-bottom:12px;"><div class="dd-fh">中期觀察</div><div class="dd-box-trend">${escHtml(orig.中期觀察)}</div></div>` : ''}
      ${orig.收斂 ? `<div><div class="dd-fh">💡 收斂</div><div class="dd-hl-box">${escHtml(orig.收斂)}</div></div>` : ''}
    `;
  } else if (blockType === '新聞事件') {
    inner = `
      ${orig.事件 ? `<div style="margin-bottom:12px;"><div class="dd-fh">事件</div><div class="dd-prose">${escHtml(orig.事件)}</div></div>` : ''}
      ${orig.觀點 ? `<div><div class="dd-fh">觀點</div><div class="dd-prose">${escHtml(orig.觀點)}</div></div>` : ''}
    `;
  } else if (blockType === '標的觀點') {
    inner = `
      <div style="margin-bottom:8px;font-size:16px;font-weight:700;color:#111827;">${escHtml(orig.標的 || '')}</div>
      ${orig.分類 ? `<div style="margin-bottom:10px;font-size:11px;color:#6B7280;">${escHtml(orig.分類)}</div>` : ''}
      <div class="dd-divider"></div>
      ${orig.立場依據 ? `<div style="margin-bottom:12px;"><div class="dd-fh">立場依據</div><div class="dd-prose">${escHtml(orig.立場依據)}</div></div>` : ''}
      ${orig.論述 ? `<div><div class="dd-fh">論述</div><div class="dd-prose">${escHtml(orig.論述)}</div></div>` : ''}
    `;
  } else if (blockType === 'QA心法') {
    const pts = _asArray(orig.要點).map(p => {
      p = _asObject(p);
      return `<li style="margin-bottom:8px;"><strong style="font-size:12px;">${escHtml(p.標題 || '')}</strong>${p.內容 ? `<div style="font-size:12px;color:#374151;margin-top:2px;">${escHtml(p.內容)}</div>` : ''}</li>`;
    }).join('');
    inner = `
      ${orig.問題 ? `<div style="margin-bottom:12px;font-size:13px;font-style:italic;color:#374151;">Q：${escHtml(orig.問題)}</div>` : ''}
      ${pts ? `<ul style="list-style:none;padding:0;">${pts}</ul>` : ''}
      ${orig.結論 ? `<div class="dd-hl-box" style="margin-top:12px;">${escHtml(orig.結論)}</div>` : ''}
    `;
  } else if (blockType === 'company') {
    inner = `
      <div style="margin-bottom:4px;font-size:16px;font-weight:700;">${escHtml(orig.canonical || '')} <span style="font-size:12px;font-family:monospace;color:#6B7280;">${escHtml(orig.ticker || '')}</span></div>
      ${orig.via ? `<div style="font-size:12px;color:#6B7280;">本集提及：「${escHtml(orig.via)}」</div>` : ''}
    `;
  }

  return bar + `<div class="dd-zone-a">${inner}</div>`;
}

function _ddZoneB(tc, srcText) {
  tc = _asObject(tc);
  const bar = `<div class="dd-zone-bar"><span class="dd-zone-id">B</span><span class="dd-zone-name">逐字稿原文切片</span><span class="dd-zone-right">${escHtml(srcText)}</span></div>`;
  const drift = tc.drift_detected
    ? `<div class="dd-drift-bar">⚠ 行號定位已擴大範圍（±20 行），以確保相關內容完整收錄</div>`
    : '';
  return `${bar}<div class="dd-zone-b">
    ${drift}
    ${tc.before ? `<div class="dd-tsec" style="opacity:.5;"><div class="dd-tsec-head">前文</div><div class="dd-tsec-text">${escHtml(tc.before)}</div></div><div class="dd-tsep"></div>` : ''}
    <div class="dd-tsec dd-tsec-matched"><div class="dd-tsec-head">▶ 原文段落</div><div class="dd-tsec-text">${escHtml(tc.matched || '（無逐字稿資料）')}</div></div>
    ${tc.after ? `<div class="dd-tsep"></div><div class="dd-tsec" style="opacity:.5;"><div class="dd-tsec-head">後文</div><div class="dd-tsec-text">${escHtml(tc.after)}</div></div>` : ''}
  </div>`;
}

function _ddZoneC(blockType, content, disclaimer) {
  content = _asObject(content);
  const bar = `<div class="dd-zone-bar"><span class="dd-zone-id">C</span><span class="dd-zone-name">AI 延伸解讀</span><span class="dd-zone-right">✦ gemini-3.7-flash</span>${_ddCaptureBtnHtml()}</div>`;
  const notice = `<div class="dd-ai-notice">⚠ 以下為 <strong>AI 生成的教育性延伸解讀</strong>，不代表主持人立場，不構成投資建議。</div>`;

  let fields = '';
  if (blockType === '產業動態') {
    fields = _ddCIndustry(content);
  } else if (blockType === 'company') {
    fields = _ddCCompany(content);
  } else {
    fields = Object.entries(content).map(([k, v]) => {
      if (!v || (typeof v === 'string' && !v.trim())) return '';
      const valHtml = typeof v === 'string'
        ? `<div class="dd-afb">${escHtml(v)}</div>`
        : `<div class="dd-afb">${escHtml(JSON.stringify(v))}</div>`;
      return `<div class="dd-af"><div class="dd-afh">${escHtml(k)}</div>${valHtml}</div>`;
    }).join('');
  }

  const footerLine = `<div class="dd-footer-line">${escHtml(disclaimer || 'AI 生成內容，非主持人觀點，亦非投資建議。')}</div>`;
  return `${bar}<div class="dd-zone-c">${notice}${fields}${footerLine}</div>`;
}

function _ddCIndustry(content) {
  content = _asObject(content);
  let html = '';
  if (content['一句定義']) {
    html += `<div class="dd-af"><div class="dd-afh">一句定義</div><div class="dd-afb-lg">${escHtml(content['一句定義'])}</div></div>`;
  }
  if (content['驅動力']) {
    html += `<div class="dd-af"><div class="dd-afh">驅動力</div><div class="dd-afb">${escHtml(content['驅動力'])}</div></div>`;
  }
  if (content['上中下游結構']) {
    const val = content['上中下游結構'];
    let inner = '';
    if (typeof val === 'string') {
      inner = `<div class="dd-afb">${escHtml(val)}</div>`;
    } else if (val && typeof val === 'object') {
      const entries = Object.entries(val);
      inner = `<div class="dd-supply-grid">${entries.map(([k, v]) =>
        `<div class="dd-supply-card" data-supply-node="${escHtml(k)}" data-supply-prompt="${escHtml(`請針對供應鏈環節「${k}」進一步解讀其產業地位、代表廠商與投資機會。`)}"><div class="dd-sc-head">${escHtml(k)}</div><div class="dd-sc-body">${escHtml(String(v))}</div></div>`
      ).join('')}</div>`;
    }
    html += `<div class="dd-af"><div class="dd-afh">上中下游結構</div>${inner}</div>`;
  }
  if (content['代表性公司']) {
    const val = content['代表性公司'];
    let inner = '';
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const groups = ['台', '美', '日'].filter(region => _asArray(val[region]).length > 0);
      inner = groups.map(region =>
        `<div style="margin-bottom:6px;"><span style="font-size:11px;color:#6B7280;margin-right:6px;">${escHtml(region)}</span>${_asArray(val[region]).map(c => escHtml(c)).join('、')}</div>`
      ).join('');
    } else if (Array.isArray(val)) {
      inner = `<div class="dd-afb">${val.map(c => escHtml(String(c))).join('、')}</div>`;
    } else {
      inner = `<div class="dd-afb">${escHtml(String(val))}</div>`;
    }
    html += `<div class="dd-af"><div class="dd-afh">代表性公司</div>${inner}</div>`;
  }
  if (content['主持人立場回扣']) {
    html += `<div class="dd-af"><div class="dd-afh">主持人立場回扣</div><div class="dd-hl-box">${escHtml(content['主持人立場回扣'])}</div></div>`;
  }
  if (content['追蹤變數']) {
    html += `<div class="dd-af"><div class="dd-afh">追蹤變數</div><div class="dd-afb" style="white-space:pre-line;">${escHtml(content['追蹤變數'])}</div></div>`;
  }
  const knownKeys = new Set(['一句定義', '驅動力', '上中下游結構', '代表性公司', '主持人立場回扣', '追蹤變數']);
  Object.entries(content).forEach(([k, v]) => {
    if (knownKeys.has(k) || !v) return;
    const valHtml = (v && typeof v === 'object')
      ? `<div class="dd-afb">${escHtml(JSON.stringify(v))}</div>`
      : `<div class="dd-afb">${escHtml(String(v))}</div>`;
    html += `<div class="dd-af"><div class="dd-afh">${escHtml(k)}</div>${valHtml}</div>`;
  });
  return html;
}

function _ddCCompany(content) {
  content = _asObject(content);
  let html = '';
  if (content['公司定位']) {
    html += `<div class="dd-af"><div class="dd-afh">公司定位</div><div class="dd-afb-lg">${escHtml(content['公司定位'])}</div></div>`;
  }
  if (content['供應鏈位置']) {
    html += `<div class="dd-af"><div class="dd-afh">供應鏈位置</div><div class="dd-afb">${escHtml(content['供應鏈位置'])}</div></div>`;
  }
  if (content['主要對手']) {
    html += `<div class="dd-af"><div class="dd-afh">主要對手</div><div class="dd-afb" style="white-space:pre-line;">${escHtml(content['主要對手'])}</div></div>`;
  }
  if (content['本集提及脈絡']) {
    html += `<div class="dd-af"><div class="dd-afh">本集提及脈絡</div><div class="dd-hl-box">${escHtml(content['本集提及脈絡'])}</div></div>`;
  }
  const known = new Set(['公司定位', '供應鏈位置', '主要對手', '本集提及脈絡']);
  Object.entries(content).forEach(([k, v]) => {
    if (known.has(k) || !v) return;
    const valHtml = (v && typeof v === 'object')
      ? `<div class="dd-afb">${escHtml(JSON.stringify(v))}</div>`
      : `<div class="dd-afb">${escHtml(String(v))}</div>`;
    html += `<div class="dd-af"><div class="dd-afh">${escHtml(k)}</div>${valHtml}</div>`;
  });
  return html;
}

// ── coverage 區塊：F-12 裁決 A，原樣保留（不發布 coverage 資料，
// 產物不含 api/ 目錄，./api/coverage/{ticker}.json 必然 404，
// 既有降級「📚 無資料庫支援」直接生效，零額外工作量）──────────────

function _ddCoverageField(label, value) {
  if (!value) return '';
  return `<div class="dd-af"><div class="dd-afh">${escHtml(label)}</div><div class="dd-afb" style="white-space:pre-line;">${escHtml(value)}</div></div>`;
}

function _ddCoverageStaleWarningHtml(asOf) {
  if (!asOf) return '';
  const asOfDate = new Date(asOf);
  if (isNaN(asOfDate.getTime())) return '';
  const daysDiff = Math.floor((Date.now() - asOfDate.getTime()) / 86400000);
  if (daysDiff > 90) {
    return ` <span class="dd-coverage-stale">⚠ 資料已超過 90 天未更新</span>`;
  }
  return '';
}

async function _ddZoneCoverage(ticker) {
  const container = document.getElementById('dd-coverage-zone');
  if (!container) return;
  try {
    const res = await fetch(`./api/coverage/${encodeURIComponent(ticker)}.json`);
    if (!res.ok) {
      container.innerHTML = `<div class="dd-coverage-badge">📚 無資料庫支援</div>`;
      return;
    }
    const snap = await res.json();
    const valuation = _asObject(snap.valuation);
    const quarterly = _asObject(snap.quarterly);
    const latestPeriod = _asArray(quarterly.period_ends)[0] || '';
    const asOf = valuation.as_of || '';

    const bar = `<div class="dd-zone-bar"><span class="dd-zone-id">📚</span><span class="dd-zone-name">資料庫（My-TW-Coverage）</span></div>`;
    const meta = `<div class="dd-coverage-meta">估值日期：${escHtml(asOf || '—')}${_ddCoverageStaleWarningHtml(asOf)}${latestPeriod ? `　財務至：${escHtml(latestPeriod)}` : ''}</div>`;

    let fields = '';
    fields += _ddCoverageField('業務簡介', snap.business_intro);
    const supplyChain = _asObject(snap.supply_chain);
    fields += _ddCoverageField('供應鏈上游', supplyChain.upstream);
    fields += _ddCoverageField('供應鏈下游', supplyChain.downstream);
    fields += _ddCoverageField('主要客戶', snap.customers);
    fields += _ddCoverageField('主要供應商', snap.suppliers);

    container.innerHTML = `${bar}<div class="dd-zone-coverage">${meta}${fields}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="dd-coverage-badge">📚 無資料庫支援</div>`;
  }
}

// ── 右欄筆記本收摺與左中欄拖拉調整（逐字移植自 public/index.html:1929-1998，
// 部分不在 T-806 條列的函式清單內，但屬「modal DOM」的一部分——DOM 裡的
// 收摺鈕與拖曳把手若不接對應 JS 會是死 UI，故一併移植）───────────────────

function _ddToggleNotebook() {
  APP_STATE.ddNotebookOpen = !APP_STATE.ddNotebookOpen;
  const grid = document.getElementById('dd-grid');
  grid.classList.toggle('dd-grid-notebook-open', APP_STATE.ddNotebookOpen);
  document.getElementById('dd-notebook-toggle').classList.toggle('active', APP_STATE.ddNotebookOpen);
  if (APP_STATE.ddColLeftPct != null) {
    _ddApplyColumnWidths(APP_STATE.ddColLeftPct);
  }
}

function _ddApplyColumnWidths(leftPct) {
  const grid = document.getElementById('dd-grid');
  const clamped = Math.min(60, Math.max(15, leftPct));
  APP_STATE.ddColLeftPct = clamped;
  const remaining = 100 - clamped;
  if (APP_STATE.ddNotebookOpen) {
    const centerPct = remaining * (41.7 / 75);
    const rightPct = remaining - centerPct;
    grid.style.gridTemplateColumns = `${clamped}% 5px ${centerPct}% ${rightPct}%`;
  } else {
    grid.style.gridTemplateColumns = `${clamped}% 5px ${remaining}% 0%`;
  }
}

function _ddInitColumnResizer() {
  const resizer = document.getElementById('dd-col-resizer');
  const grid = document.getElementById('dd-grid');
  if (!resizer || !grid) return;

  let dragging = false;

  const onMouseMove = (e) => {
    if (!dragging) return;
    const rect = grid.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    _ddApplyColumnWidths(pct);
  };
  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    grid.classList.remove('dd-resizing');
    resizer.classList.remove('dd-resizing');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    grid.classList.add('dd-resizing');
    resizer.classList.add('dd-resizing');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ── 主渲染（逐字移植自 public/index.html:2091-2148，扣除 chat 組裝改為佔位）──

let APP_STATE = { ddNotebookOpen: false, ddColLeftPct: null };

function _renderDeepModal(block, epId) {
  block = _asObject(block);
  const orig = _asObject(block.original);
  const tc = _asObject(block.transcript_context);
  const ai = _asObject(block.ai_extension);
  const content = _asObject(ai.content);
  const blockType = block.block_type || '';
  const srcLines = _asArray(block.source_lines);
  const srcText = srcLines.length === 2 ? `行 ${srcLines[0]}–${srcLines[1]}` : '';

  const typeLabel = {
    '新聞事件': '📰 新聞事件',
    '產業動態': '🏭 產業動態',
    '標的觀點': '🎯 標的觀點',
    'QA心法': '💬 QA 心法',
    'company': '🏢 公司',
  }[blockType] || blockType;

  const title = orig.標題 || orig.canonical || orig.標的 || block.block_id;
  const lead = _ddLeadHtml(blockType, orig);

  document.getElementById('dd-header-left').innerHTML = `
    <div class="dd-meta">
      <span class="dd-meta-tag">${escHtml(epId)}</span>
      <span class="dd-block-chip">${escHtml(typeLabel)}</span>
      ${srcText ? `<span class="dd-src-mono">${escHtml(srcText)}</span>` : ''}
    </div>
    <div class="dd-title">${escHtml(title)}</div>
  `;
  document.getElementById('dd-lead').innerHTML = lead;
  document.getElementById('dd-footer-id').textContent = `${block.block_id} · ${epId}`;

  const aHtml = _ddZoneA(blockType, orig);
  const bHtml = _ddZoneB(tc, srcText);
  const cHtml = _ddZoneC(blockType, content, ai.disclaimer || '');

  const isTwCompany = blockType === 'company' && block.market === 'TW' && block.ticker;
  const coverageHtml = isTwCompany ? `<div id="dd-coverage-zone" class="dd-zone-coverage-wrap"></div>` : '';

  document.getElementById('dd-col-left').innerHTML = aHtml + bHtml + cHtml + coverageHtml;
  document.getElementById('dd-col-left').scrollTop = 0;
  document.getElementById('dd-col-center').scrollTop = 0;

  if (isTwCompany) {
    _ddZoneCoverage(block.ticker);
  }
}

function _renderDeepDiveUnavailable(epId, blockId) {
  document.getElementById('dd-header-left').innerHTML = `
    <div class="dd-meta"><span class="dd-meta-tag">${escHtml(epId)}</span></div>
    <div class="dd-title">深入解讀</div>
  `;
  document.getElementById('dd-lead').innerHTML = '';
  document.getElementById('dd-footer-id').textContent = `${escHtml(blockId)} · ${escHtml(epId)}`;
  document.getElementById('dd-col-left').innerHTML =
    `<div style="padding:40px 20px;text-align:center;color:#9CA3AF;font-size:13px;">目前尚無深入解讀資料</div>`;
}
