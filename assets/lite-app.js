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
// 卡片小元件
// 【2026-10-21 改版】Lite 呈現層與自用側（public/index.html）暫時分岔，
// 經使用者明確授權（自用側之後再同步）。仍與自用側共用的是：欄位語意、
// 文字內容（逐字輸出、不改寫）、欄位標籤映射（_labelFor）、data-action
// 與 data-block-id 的格式——深入解讀與 Copilot 的入口契約不變。
// ═══════════════════════════════════════════════════════════════════════

const _POD_RE = /^[a-z0-9]+$/;

/** 取節目 slug（ep_id 前段，退回 podcaster 欄位）；只放行小寫英數，供 data-pod 屬性使用。 */
function _podSlug(card) {
  card = _asObject(card);
  const fromId = typeof card.ep_id === 'string' ? card.ep_id.split('/')[0] : '';
  const slug = fromId || (typeof card.podcaster === 'string' ? card.podcaster : '');
  return _POD_RE.test(slug) ? slug : '';
}

const _WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 'YYYY-MM-DD' → '2026.09.09 週三'（withYear=false 時省略年份）。非法輸入原樣回傳。 */
function _formatDate(dateStr, withYear = true) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return String(dateStr || '—');
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const md = `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
  return `${withYear ? y + '.' : ''}${md} 週${_WEEKDAYS[dow]}`;
}

const _ICON = {
  up: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5 9 8.5H1z" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 8.5 1 1.5h8z" fill="currentColor"/></svg>',
  flat: '<svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3" fill="currentColor"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>',
  out: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3h7v7M13 3 4 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/**
 * 逐字稿行號。[0, 0] 是抽取時找不到錨句的哨兵值（不是真的第 0 行），
 * 顯示出來只是雜訊，故不輸出。
 */
function _srcBadge(src) {
  if (!Array.isArray(src) || src.length < 2) return '';
  const a = Number(src[0]);
  const b = Number(src[1]);
  if (!a && !b) return '';
  const label = a === b ? `逐字稿 L${a}` : `逐字稿 L${a}–${b}`;
  return `<span class="src">${escHtml(label)}</span>`;
}

/** 立場徽章。依台股慣例紅漲綠跌：偏多用 --up（紅）、偏空用 --down（綠）。文字逐字輸出。 */
function _stanceBadge(stance) {
  if (!stance || typeof stance !== 'string') return '';
  const s = stance.replace(/\(.*\)/, '').trim();
  if (s.includes('看多') || s.includes('偏多')) return `<span class="stance stance--up">${_ICON.up}${escHtml(stance)}</span>`;
  if (s.includes('看空') || s.includes('偏空')) return `<span class="stance stance--down">${_ICON.down}${escHtml(stance)}</span>`;
  return `<span class="stance stance--flat">${_ICON.flat}${escHtml(stance)}</span>`;
}

/** 風險徽章：三格量表＋文字。非「高」「低」的值一律視為「中」（沿用原判斷）。 */
function _riskBadge(risk) {
  if (!risk) return '';
  const level = risk === '高' ? 3 : risk === '低' ? 1 : 2;
  const text = level === 3 ? '高' : level === 1 ? '低' : '中';
  return `<span class="risk risk--${level}"><span class="risk-meter" aria-hidden="true"><i></i><i></i><i></i></span>風險 ${text}</span>`;
}

/** 區塊標題：斜體序號＋名稱＋則數。no 為空字串時不輸出序號。 */
function _sectionHeader(no, label, count) {
  return `<h3 class="ep-sec-title">${no ? `<span class="ep-sec-no">${escHtml(no)}</span>` : ''}<span>${escHtml(label)}</span>${count ? `<span class="ep-sec-count">${count} 則</span>` : ''}</h3>`;
}

/** 標籤字串（以 / 分隔）→ 標籤列。 */
function _tagsHtml(tagStr) {
  const tags = String(tagStr || '').split('/').map(t => t.trim()).filter(Boolean);
  return tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>` : '';
}

function _deepDiveBtnHtml(epId, blockId) {
  return epId ? `<button class="dd-more-btn" data-action="open-deep-dive" data-ep-id="${escHtml(epId)}" data-block-id="${escHtml(blockId)}">深入解讀</button>` : '';
}

/**
 * 「💬 帶入討論」按鈕的 HTML（T-2714，spec-027 §2.3／§7.3）。**產業動態
 * 與個股區塊皆可用**——呼叫端在 `_renderIndustry()` 與 `_renderTargets()`
 * 各自呼叫本函式，每則觀點各生成一顆按鈕（AC-15）。
 *
 * `hidden` 屬性依 `_copilotConfig.generation_enabled` 決定，由
 * `_applyCopilotButtonVisibility()` 在 config 解析後修正。**額度用盡時
 * `disabled`**（spec §7.3）——由 `_applyDiscussButtonState()` 依
 * `_copilotQuotaExhausted` 事後套用，本函式不另判斷一次（避免兩處各自
 * 維護一份判斷邏輯）。
 *
 * @param {string} epId
 * @param {string} blockId `industry-<N>` 或 `target-<N>`
 * @param {string} title 該則的標題（產業動態）或標的名稱（個股）
 */
function _discussButtonHtml(epId, blockId, title) {
  if (!epId) return '';
  const hiddenAttr = _copilotConfig && _copilotConfig.generation_enabled === true ? '' : ' hidden';
  return `<button class="dd-more-btn" data-action="bring-into-discussion" data-ep-id="${escHtml(epId)}" data-block-id="${escHtml(blockId)}" data-title="${escHtml(title || '')}"${hiddenAttr}>💬 帶入討論</button>`;
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
  left.innerHTML = '<div class="dd-empty">載入中…</div>';
  center.innerHTML = '';
  if (overlay.style.display !== 'flex') _ddReturnFocus = document.activeElement;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const closeBtn = document.getElementById('dd-close');
  if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus({ preventScroll: true });

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

/** 開啟深入解讀前的焦點所在（通常是被點的按鈕），關閉時歸還。 */
let _ddReturnFocus = null;

function closeDeepDive() {
  const overlay = document.getElementById('dd-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  const back = _ddReturnFocus;
  _ddReturnFocus = null;
  if (back && typeof back.focus === 'function' && document.contains && document.contains(back)) back.focus({ preventScroll: true });
}

// ═══════════════════════════════════════════════════════════════════════
// 區塊渲染（防禦性渲染：任何欄位缺失或型別異常，最多造成該區塊留白）
// 第四個參數 secNo 為區塊序號（'01'…），由 _renderEpisodeCardInner 依
// 實際出現的區塊依序編號；單獨呼叫時可省略。
// ═══════════════════════════════════════════════════════════════════════

function _renderNewsEvents(events, epId, startIndex = 0, secNo = '') {
  events = _asArray(events);
  if (events.length === 0) return '';
  const items = events.map((ev, i) => {
    ev = _asObject(ev);
    return `
    <li class="news-item">
      <span class="news-no" aria-hidden="true"></span>
      <div>
        <h4 class="news-title">${escHtml(ev.標題 || '')}</h4>
        ${_tagsHtml(ev.標籤)}
        <p class="news-body">${escHtml(ev.事件 || '')}</p>
        ${ev.觀點 ? `<p class="news-view"><b>觀點</b>${escHtml(ev.觀點)}</p>` : ''}
        <div class="item-actions">
          ${_deepDiveBtnHtml(epId, `news-${startIndex + i}`)}
          ${_srcBadge(ev.來源)}
        </div>
      </div>
    </li>`;
  }).join('');
  return `<section class="ep-sec" data-sec="新聞事件">${_sectionHeader(secNo, '新聞事件', events.length)}<ol class="news-list">${items}</ol></section>`;
}

function _renderIndustry(industries, epId, startIndex = 0, secNo = '') {
  industries = _asArray(industries);
  if (industries.length === 0) return '';
  const items = industries.map((ind, i) => {
    ind = _asObject(ind);
    const ctx = _asObject(ind.脈絡);
    const kp = _asObject(ind.卡片重點);
    const headline = kp.值 || ind.標題 || '';
    const ctxRows = [['定調', ctx.定調], ['現況', ctx.現況], ['機制', ctx.機制]]
      .filter(([, v]) => v)
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${escHtml(v)}</dd></div>`).join('');
    // 欄位標籤一律查共用映射表（T-809）——不得寫死映射後的字串。
    const signals = [
      ['主持人態度', '態度', ind.主持人態度],
      ['短線風險', '短線', ind.短線風險],
      ['中期觀察', '中期', ind.中期觀察],
    ].filter(([, , v]) => v)
      .map(([key, def, v]) => `<div><dt class="sig-label">${escHtml(_labelFor(key, def))}</dt><dd>${escHtml(v)}</dd></div>`).join('');
    return `
    <article class="ind">
      <header class="ind-head">
        <h4 class="ind-kp">${escHtml(headline)}</h4>
        ${kp.值 && ind.標題 ? `<p class="ind-title">${escHtml(ind.標題)}</p>` : ''}
        ${_tagsHtml(ind.標籤)}
      </header>
      ${ctxRows ? `<dl class="ind-ctx">${ctxRows}</dl>` : ''}
      ${signals ? `<dl class="ind-signals">${signals}</dl>` : ''}
      ${ind.收斂 ? `<p class="ind-converge">${escHtml(ind.收斂)}</p>` : ''}
      <div class="ind-foot">
        ${_deepDiveBtnHtml(epId, `industry-${startIndex + i}`)}
        ${_discussButtonHtml(epId, `industry-${startIndex + i}`, ind.標題)}
        ${_srcBadge(ind.來源)}
      </div>
    </article>`;
  }).join('');
  return `<section class="ep-sec" data-sec="產業動態">${_sectionHeader(secNo, '產業動態', industries.length)}<div class="ind-list">${items}</div></section>`;
}

function _renderTargets(targets, epId, startIndex = 0, secNo = '') {
  targets = _asArray(targets);
  if (targets.length === 0) return '';
  const items = targets.map((t, i) => {
    t = _asObject(t);
    return `
    <li class="tg">
      <div>
        <h4 class="tg-name">${escHtml(t.標的 || '')}</h4>
        ${t.分類 ? `<p class="tg-cat">${escHtml(t.分類)}</p>` : ''}
        <div class="tg-badges">${_stanceBadge(t.立場)}${_riskBadge(t.風險)}</div>
      </div>
      <div>
        ${t.立場依據 ? `<p class="tg-basis"><span class="lbl">立場依據</span>${escHtml(t.立場依據)}</p>` : ''}
        ${t.論述 ? `<p class="tg-thesis">${escHtml(t.論述)}</p>` : ''}
        <div class="item-actions">
          ${_deepDiveBtnHtml(epId, `target-${startIndex + i}`)}
          ${_discussButtonHtml(epId, `target-${startIndex + i}`, t.標的)}
          ${_srcBadge(t.來源)}
        </div>
      </div>
    </li>`;
  }).join('');
  return `<section class="ep-sec" data-sec="標的觀點">${_sectionHeader(secNo, '標的觀點', targets.length)}<ol class="tg-list">${items}</ol></section>`;
}

/** 抽取失敗的佔位 QA（標題為「API 呼叫失敗」）不是內容，計數與渲染一律排除。 */
function _validQAs(qas) {
  return _asArray(qas).map(_asObject).filter(q => q.標題 !== 'API 呼叫失敗');
}

function _renderQA(qas, epId, startIndex = 0, secNo = '') {
  const valid = _validQAs(qas);
  if (valid.length === 0) return '';
  const items = valid.map(qa => {
    const pts = _asArray(qa.要點).map(p => {
      p = _asObject(p);
      return `<li><strong>${escHtml(p.標題 || '')}</strong>${p.內容 ? '：' + escHtml(p.內容) : ''}</li>`;
    }).join('');
    return `
    <article class="qa">
      <div class="qa-top"><h4 class="qa-title">${escHtml(qa.標題 || '')}</h4>${_srcBadge(qa.來源)}</div>
      ${qa.問題 ? `<p class="qa-q">${escHtml(qa.問題)}</p>` : ''}
      ${pts ? `<ul class="qa-points">${pts}</ul>` : ''}
      ${qa.結論 ? `<p class="qa-conclusion">${escHtml(qa.結論)}</p>` : ''}
    </article>`;
  }).join('');
  return `<section class="ep-sec" data-sec="QA 心法">${_sectionHeader(secNo, 'QA 心法', valid.length)}<div class="qa-list">${items}</div></section>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 主渲染函式：單集導讀全文（閱讀器內呈現）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 渲染單張導讀卡的 HTML 字串。
 *
 * 防禦性渲染（SDD M-5）：任何欄位缺失或型別異常，最多造成該區塊留白，
 * 不得整個函式拋例外。card 本身非物件時視為空卡片渲染（不拋例外）。
 * 外層再包一層 try/catch 作為最後防線——只讓該張卡片顯示錯誤佔位，
 * 不得讓呼叫端的整頁渲染中斷。
 */
function renderEpisodeCard(card) {
  try {
    return _renderEpisodeCardInner(card);
  } catch (err) {
    console.error('[lite] renderEpisodeCard 渲染失敗，該卡片顯示為空白', err);
    return `<div class="tile-placeholder">此集卡片暫時無法顯示</div>`;
  }
}

/**
 * 卡片底部的非官方標示＋原節目連結（T-808，D-2）。
 *
 * card.source_url 由發布管線（lite_publish.py／SPEC-007 T-701）注入，
 * 100% 覆蓋已發布集數；缺失時仍顯示免責文字，只是不含可點擊連結。
 */
function _cardDisclaimerHtml(card) {
  card = _asObject(card);
  const url = typeof card.source_url === 'string' ? card.source_url : '';
  const link = url
    ? `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">點此聆聽原節目${_ICON.out}</a>`
    : '';
  return `<footer class="ep-disclaimer"><span>本摘要由 AI 生成，為第三方非官方專案</span>${link}</footer>`;
}

function _stockChipsHtml(allStocks, epId) {
  return allStocks.map(s => {
    s = _asObject(s);
    const inner = `${escHtml(s.canonical || '')}<small>${escHtml(s.ticker || '')}</small>`;
    return epId
      ? `<button type="button" class="stock-chip" data-action="open-deep-dive" data-ep-id="${escHtml(epId)}" data-block-id="${escHtml(`company-${s.ticker || ''}`)}">${inner}</button>`
      : `<span class="stock-chip">${inner}</span>`;
  }).join('');
}

function _renderEpisodeCardInner(card) {
  card = _asObject(card);
  const allStocks = [..._asArray(card.tw_stocks), ..._asArray(card.us_stocks)];
  const epId = typeof card.ep_id === 'string' ? card.ep_id : '';
  const pod = _podSlug(card);
  const url = typeof card.source_url === 'string' ? card.source_url : '';

  const stocksSec = allStocks.length > 0 ? `
    <section class="ep-sec" data-sec="提及公司">
      ${_sectionHeader('', '提及公司', 0)}
      <p class="ep-sec-hint">${epId ? '點選公司名稱，查看 AI 整理的公司定位與本集提及脈絡。' : ''}</p>
      <div class="stock-list">${_stockChipsHtml(allStocks, epId)}</div>
    </section>` : '';

  // 新格式判斷（新聞事件／產業動態欄位存在）；舊格式走相容分支。
  const isNewFormat = card.新聞事件 !== undefined || card.產業動態 !== undefined;
  let body = '';
  let digest = [];
  if (isNewFormat) {
    const counts = [
      ['新聞事件', _asArray(card.新聞事件).length],
      ['產業動態', _asArray(card.產業動態).length],
      ['標的觀點', _asArray(card.標的觀點).length],
      ['QA 心法', _validQAs(card.QA心法).length],
    ];
    digest = counts.filter(([, n]) => n > 0);
    let no = 0;
    const next = (n) => (n > 0 ? String(++no).padStart(2, '0') : '');
    body = [
      _renderNewsEvents(card.新聞事件, epId, 0, next(counts[0][1])),
      _renderIndustry(card.產業動態, epId, 0, next(counts[1][1])),
      _renderTargets(card.標的觀點, epId, 0, next(counts[2][1])),
      _renderQA(card.QA心法, epId, 0, next(counts[3][1])),
    ].join('');
    if (!digest.length) body = `<div class="ep-pending">這一集的導讀還在整理中。</div>`;
  } else {
    const summary = _asArray(card.three_line_summary);
    const topics = _asArray(card.topic_paragraphs).slice(0, 4).map(_asObject);
    body = `
      ${summary.length ? `<section class="ep-sec" data-sec="核心觀點">${_sectionHeader('01', '核心觀點', summary.length)}<ul class="qa-points">${summary.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul></section>` : ''}
      ${topics.length ? `<section class="ep-sec" data-sec="主題精華">${_sectionHeader('02', '主題精華', topics.length)}<div class="qa-list">${topics.map(t => `<article class="qa"><h4 class="qa-title">${escHtml(t.topic || '')}</h4><p class="news-body">${escHtml(t.content || '')}</p></article>`).join('')}</div></section>` : ''}
      ${card.mindset_note ? `<section class="ep-sec" data-sec="交易心法">${_sectionHeader('03', '交易心法', 0)}<p class="qa-conclusion">${escHtml(card.mindset_note)}</p></section>` : ''}`;
  }

  return `
    <article class="ep signal-card" data-pod="${pod}">
      <header class="ep-head">
        <div class="ep-kicker"><span class="pod-mark"><i></i>${escHtml(String(card.podcaster || pod || '—').toUpperCase())}</span><span>${escHtml(_formatDate(card.date))}</span></div>
        <h2 class="ep-title">${escHtml(card.title || '—')}</h2>
        ${digest.length ? `<ul class="ep-digest">${digest.map(([k, n]) => `<li><b>${n}</b>${k}</li>`).join('')}</ul>` : ''}
        ${url ? `<div class="ep-cta"><a class="btn btn--accent" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${_ICON.play}收聽原節目</a><span class="ep-cta-note">導讀只是索引，完整脈絡請以原節目為準。</span></div>` : ''}
      </header>
      ${stocksSec}
      ${body}
      ${_cardDisclaimerHtml(card)}
    </article>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 導讀磚（首頁列表用的摘要卡）：只挑重點，全文交給閱讀器
// ═══════════════════════════════════════════════════════════════════════

/** 摘要卡上要列出的重點：先產業動態的卡片重點，再新聞事件標題（皆為既有欄位原文）。 */
function _tilePoints(card) {
  const pts = [];
  _asArray(card.產業動態).map(_asObject).forEach(ind => {
    const v = _asObject(ind.卡片重點).值 || ind.標題;
    if (v) pts.push(['產業', v, 'pt-kind--industry']);
  });
  _asArray(card.新聞事件).map(_asObject).forEach(ev => {
    if (ev.標題) pts.push(['新聞', ev.標題, '']);
  });
  return pts;
}

function _renderEpisodeTile(card, isLead) {
  card = _asObject(card);
  const epId = typeof card.ep_id === 'string' ? card.ep_id : '';
  const pod = _podSlug(card);
  const href = _isSafeEpId(epId) ? `#/ep/${epId}` : '#';
  const points = _tilePoints(card).slice(0, isLead ? 5 : 3);
  const stocks = [..._asArray(card.tw_stocks), ..._asArray(card.us_stocks)].map(_asObject).filter(s => s.canonical);
  const maxTk = isLead ? 8 : 5;
  const quote = isLead ? (_asArray(card.產業動態).map(_asObject).find(i => i.收斂) || {}).收斂 : '';
  const counts = [
    [_asArray(card.新聞事件).length, '新聞'],
    [_asArray(card.產業動態).length, '產業'],
    [_asArray(card.標的觀點).length, '標的'],
    [_validQAs(card.QA心法).length, 'QA'],
  ].filter(([n]) => n > 0).map(([n, k]) => `${n} ${k}`).join(' · ');

  return `
  <article class="tile${isLead ? ' tile--lead' : ''} reveal" data-pod="${pod}" data-ep-id="${escHtml(epId)}">
    <div class="tile-main">
      <div class="tile-meta"><span class="pod-mark"><i></i>${escHtml(pod.toUpperCase() || '—')}</span><time datetime="${escHtml(card.date || '')}">${escHtml(_formatDate(card.date, false))}</time></div>
      <h3 class="tile-title"><a class="tile-link" href="${escHtml(href)}">${escHtml(card.title || '—')}</a></h3>
      ${stocks.length ? `<div class="tile-tickers">${stocks.slice(0, maxTk).map(s => `<span class="tk">${escHtml(s.canonical)}<small>${escHtml(s.ticker || '')}</small></span>`).join('')}${stocks.length > maxTk ? `<span class="tk">+${stocks.length - maxTk}</span>` : ''}</div>` : ''}
    </div>
    <div class="tile-side">
      ${points.length ? `<ul class="tile-points">${points.map(([k, v, cls]) => `<li><span class="pt-kind ${cls}">${k}</span><span>${escHtml(v)}</span></li>`).join('')}</ul>` : ''}
      ${quote ? `<p class="tile-quote">${escHtml(quote)}</p>` : ''}
    </div>
    <div class="tile-foot"><span>${escHtml(counts || '整理中')}</span><span class="tile-cta" aria-hidden="true">閱讀導讀${_ICON.arrow}</span></div>
  </article>`;
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

/** 首頁導覽狀態。selectedTicker 為標的篩選（熱門標的點選），null 表示不限。 */
const NAV_STATE = { allItems: [], selectedWeek: null, selectedPodcasters: [], selectedTicker: null, lastFiltered: [] };

async function _fetchCardIndex() {
  const res = await fetch('./notes/index.json');
  if (!res.ok) throw new Error(`notes/index.json 載入失敗：${res.status}`);
  const data = await res.json();
  return _asArray(_asObject(data).items);
}

/**
 * 卡片本體快取（epId → Promise）。首頁統計、列表、閱讀器都讀同一批卡片，
 * 切換篩選不必重抓。失敗的 Promise 立即移出快取，下次呼叫會重試，避免
 * 一次暫時性網路錯誤讓該集永久顯示為載入失敗。
 */
const _CARD_CACHE = new Map();

function _fetchCardBody(epId) {
  if (!_isSafeEpId(epId)) return Promise.reject(new Error(`ep_id 格式不合法，拒絕載入：${epId}`));
  if (_CARD_CACHE.has(epId)) return _CARD_CACHE.get(epId);
  const p = (async () => {
    const res = await fetch(`./notes/${epId}.json`);
    if (!res.ok) throw new Error(`卡片載入失敗：${epId}（${res.status}）`);
    return res.json();
  })();
  _CARD_CACHE.set(epId, p);
  p.catch(() => { if (_CARD_CACHE.get(epId) === p) _CARD_CACHE.delete(epId); });
  return p;
}

/** ISO 週別 'YYYY-Www' → 該週週一～週日的 'M/D' 字串；非法輸入回傳 null。 */
function _weekRange(week) {
  const m = typeof week === 'string' && week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const num = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1) + (num - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return { num, from: fmt(monday), to: fmt(sunday) };
}

function _renderWeekSelector(container, weeks, selected) {
  if (!container) return;
  if (weeks.length === 0) {
    container.innerHTML = '';
    return;
  }
  const label = (w) => {
    const r = _weekRange(w);
    return r ? `第 ${r.num} 週・${r.from}–${r.to}` : w;
  };
  const options = ['<option value="">全部週別</option>']
    .concat(weeks.map(w => `<option value="${escHtml(w)}"${w === selected ? ' selected' : ''}>${escHtml(label(w))}</option>`));
  container.innerHTML = options.join('');
}

/**
 * 渲染 podcaster 篩選 chip（T-1205，spec-012 §7.1/§7.2）。
 * 顯示文字為 slug 大寫（使用者裁決，不新增中文對照表）；每個 chip 帶
 * data-action="toggle-podcaster" 與 data-podcaster="<slug>"，事件由
 * _handleDelegatedClick 統一委派處理（不掛 onclick，避免 CSP 擋掉）。
 * aria-pressed 依 selected 是否包含該 slug 決定。集數取自已載入的索引，
 * 索引尚未載入（計數為 0）時不顯示數字。
 */
function _renderPodcasterChips(container, options, selected) {
  if (!container) return;
  const sel = new Set(_asArray(selected));
  const counts = new Map();
  for (const it of _asArray(NAV_STATE.allItems)) {
    const slug = String(_asObject(it).ep_id || '').split('/')[0];
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  container.innerHTML = _asArray(options).map(slug => {
    const pressed = sel.has(slug) ? 'true' : 'false';
    const n = counts.get(slug) || 0;
    const pod = _POD_RE.test(slug) ? slug : '';
    return `<button type="button" class="podcaster-chip" data-action="toggle-podcaster" data-podcaster="${escHtml(slug)}" data-pod="${pod}" aria-pressed="${pressed}"><span class="chip-dot" aria-hidden="true"></span><span>${escHtml(slug.toUpperCase())}</span>${n ? `<span class="chip-count">${n}</span>` : ''}</button>`;
  }).join('');
}

function _hasActiveFilter() {
  return !!(NAV_STATE.selectedWeek || NAV_STATE.selectedTicker || NAV_STATE.selectedPodcasters.length);
}

function _renderEmptyState(container, message) {
  const reset = _hasActiveFilter()
    ? `<div><button type="button" class="btn btn--line" data-action="reset-filters">清除所有篩選</button></div>`
    : '';
  container.innerHTML = `<div class="empty-state"><p>${escHtml(message)}</p>${reset}</div>`;
}

function _weekHeadHtml(week, count) {
  const r = _weekRange(week);
  if (!r) return `<header class="week-head"><h2 class="week-num">—</h2><div class="week-meta"><span class="week-count">${count} 集</span></div></header>`;
  return `<header class="week-head">
      <h2 class="week-num"><span>W</span>${String(r.num).padStart(2, '0')}</h2>
      <div class="week-meta"><span class="week-range">${escHtml(r.from)} — ${escHtml(r.to)}</span><span class="week-count">${count} 集</span></div>
    </header>`;
}

/**
 * 逐集 lazy fetch 卡片本體並渲染（ADR-6：沿用既有逐集載入策略）。
 * 依 ISO 週別分組，每週一個 .card-grid；DOM 順序維持傳入 items 的
 * 日期倒序（AC-6）。整份清單的第一張為頭版（.tile--lead）。單集載入
 * 失敗只讓該集顯示佔位，佔位仍位於 grid 內、不跨欄（AC-9）。
 */
let _listRenderSeq = 0;

async function _renderCardList(container, items) {
  // 渲染序號：連續切換篩選時，較早發出、但較晚等到卡片的那次渲染必須
  // 作廢，否則舊結果會蓋掉新結果（例如先點 chip、再選一個交集為空的週別）。
  const seq = ++_listRenderSeq;
  if (items.length === 0) {
    _renderEmptyState(container, '本頁篩選範圍內尚無集數。');
    return;
  }
  // 骨架磚：卡片本體已在快取時，下面的 await 在同一個影格內完成，不會閃爍。
  const skel = '<div class="tile tile-skel" aria-hidden="true"><div class="sk" style="width:40%"></div><div class="sk sk-lg"></div><div class="sk sk-lg" style="width:70%"></div><div class="sk"></div><div class="sk" style="width:82%"></div></div>';
  container.innerHTML = `<div class="week" aria-busy="true"><p class="sr-only">載入卡片中…</p><div class="card-grid">${skel.repeat(Math.min(items.length, 6))}</div></div>`;
  const entries = await Promise.all(items.map(async it => {
    try {
      return { it, card: await _fetchCardBody(it.ep_id) };
    } catch (err) {
      console.error('[lite] 卡片載入失敗，顯示佔位', it.ep_id, err);
      return { it, card: null };
    }
  }));
  if (seq !== _listRenderSeq) return;
  const groups = [];
  entries.forEach(({ it, card }, i) => {
    const week = isoWeekOf(_asObject(it).date) || '';
    let g = groups[groups.length - 1];
    if (!g || g.week !== week) {
      g = { week, html: [] };
      groups.push(g);
    }
    g.html.push(card
      ? _renderEpisodeTile(card, i === 0)
      : `<div class="tile-placeholder">此集卡片暫時無法載入</div>`);
  });
  container.innerHTML = groups.map(g =>
    `<section class="week">${_weekHeadHtml(g.week, g.html.length)}<div class="card-grid">${g.html.join('')}</div></section>`
  ).join('');
  _observeReveal(container);
}

/**
 * 依標的代號篩選（熱門標的點選）。ticker 為空時回傳全部。讀索引上的
 * tw_tickers／us_tickers（發布管線產出），不需先載入卡片本體。純函式。
 */
function filterByTicker(items, ticker) {
  const arr = _asArray(items);
  if (!ticker) return arr.slice();
  return arr.filter(it => {
    const o = _asObject(it);
    return _asArray(o.tw_tickers).includes(ticker) || _asArray(o.us_tickers).includes(ticker);
  });
}

/**
 * 套用目前的 podcaster、標的與週別篩選並重繪卡片清單（T-1207）。
 * 串接順序固定為 podcaster → 標的 → 週別（spec-012 §7.3 的延伸）——
 * 三者互不重置對方的選取狀態。
 */
async function _applyFilters(els) {
  const byPod = filterByPodcasters(NAV_STATE.allItems, NAV_STATE.selectedPodcasters);
  const byTicker = filterByTicker(byPod, NAV_STATE.selectedTicker);
  const filtered = filterByWeek(byTicker, NAV_STATE.selectedWeek);
  NAV_STATE.lastFiltered = filtered;
  _syncFilterUi(filtered.length);
  await _renderCardList(els.main, filtered);
}

async function _applyWeekFilter(week, els) {
  NAV_STATE.selectedWeek = week || null;
  await _applyFilters(els);
}

/**
 * 切換單一 podcaster 的選取狀態（T-1207，委派入口，見 _handleDelegatedClick）。
 * 加入／移除完全獨立於其他 slug（複選），不引入 localStorage（使用者裁決：
 * 不記住選擇）。自行查找 DOM 節點而非依賴外部傳入的 els——委派監聽器
 * 本身沒有 els 的上下文可傳。
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

/** 設定（或以同一代號再點一次取消）標的篩選，並把列表捲到篩選列下方。 */
async function _setTickerFilter(ticker, name) {
  NAV_STATE.selectedTicker = ticker && NAV_STATE.selectedTicker !== ticker ? ticker : null;
  NAV_STATE.selectedTickerName = NAV_STATE.selectedTicker ? (name || ticker) : '';
  await _applyFilters({ main: document.getElementById('site-main') });
  _scrollToFeed();
}

async function _resetFilters() {
  NAV_STATE.selectedPodcasters = [];
  NAV_STATE.selectedTicker = null;
  NAV_STATE.selectedWeek = null;
  const weekSel = document.getElementById('week-select');
  if (weekSel) weekSel.value = '';
  const chipsEl = document.getElementById('podcaster-chips');
  if (chipsEl) _renderPodcasterChips(chipsEl, derivePodcasterOptions(NAV_STATE.allItems), []);
  await _applyFilters({ main: document.getElementById('site-main') });
}

function _scrollToFeed() {
  const bar = document.getElementById('filter-bar');
  if (!bar || typeof bar.getBoundingClientRect !== 'function' || typeof window.scrollTo !== 'function') return;
  const mast = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mast-h')) || 64;
  const top = bar.getBoundingClientRect().top + window.scrollY - mast;
  if (window.scrollY > top + 1) window.scrollTo({ top, behavior: _reducedMotion() ? 'auto' : 'smooth' });
}

/**
 * 篩選列附屬 UI（結果數、標的 chip、熱門標的按下狀態、脈動圖淡化）。
 * 純粹是把狀態畫出來；任何一步失敗都不得影響列表渲染本身（測試沙盒的
 * 假 DOM 也沒有完整 API），故整段包在 try/catch。
 */
function _syncFilterUi(shown) {
  try {
    const total = NAV_STATE.allItems.length;
    const countEl = document.getElementById('result-count');
    if (countEl) {
      countEl.innerHTML = total
        ? `顯示 <b>${shown}</b> / ${total} 集${_hasActiveFilter() ? `　<button type="button" class="ghost-btn" data-action="reset-filters">清除篩選</button>` : ''}`
        : '';
    }
    const tf = document.getElementById('ticker-filter');
    if (tf) {
      tf.hidden = !NAV_STATE.selectedTicker;
      tf.innerHTML = NAV_STATE.selectedTicker
        ? `<span>標的：${escHtml(NAV_STATE.selectedTickerName || NAV_STATE.selectedTicker)}</span><button type="button" data-action="filter-ticker" data-ticker="${escHtml(NAV_STATE.selectedTicker)}" aria-label="取消標的篩選">×</button>`
        : '';
    }
    if (typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('.trend-btn').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.ticker === NAV_STATE.selectedTicker ? 'true' : 'false');
    });
    const visible = new Set(NAV_STATE.lastFiltered.map(it => it.ep_id));
    const dimAll = _hasActiveFilter();
    document.querySelectorAll('.pulse-bar').forEach(b => {
      b.classList.toggle('is-dim', dimAll && !visible.has(b.dataset.epId));
    });
  } catch (e) {
    // 純呈現，忽略。
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 首屏：統計、節目脈動圖、熱門標的、新聞跑馬燈
// 全部由已發布卡片「計數」而來，不產生任何新文字內容。
// ═══════════════════════════════════════════════════════════════════════

function _reducedMotion() {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

/** 由全部卡片計算首屏用的統計。entries 為 [{ it, card }]，card 可能為 null。 */
function _computeInsights(entries) {
  const pods = new Map();
  const tickers = new Map();
  const totals = { news: 0, ind: 0, tg: 0, qa: 0 };
  const episodes = [];
  for (const { it, card } of entries) {
    if (!card) continue;
    const c = _asObject(card);
    const pod = _podSlug(c);
    pods.set(pod, (pods.get(pod) || 0) + 1);
    const n = {
      news: _asArray(c.新聞事件).length,
      ind: _asArray(c.產業動態).length,
      tg: _asArray(c.標的觀點).length,
      qa: _validQAs(c.QA心法).length,
    };
    Object.keys(totals).forEach(k => { totals[k] += n[k]; });
    episodes.push({ epId: c.ep_id, date: c.date || it.date, title: c.title || '', pod, weight: n.news + n.ind + n.tg + n.qa, card: c });
    const seen = new Set();
    [['tw', c.tw_stocks], ['us', c.us_stocks]].forEach(([market, list]) => {
      _asArray(list).map(_asObject).forEach(s => {
        if (!s.ticker || seen.has(s.ticker)) return;
        seen.add(s.ticker);
        const t = tickers.get(s.ticker) || { ticker: s.ticker, name: s.canonical || s.ticker, market, eps: 0 };
        t.eps += 1;
        tickers.set(s.ticker, t);
      });
    });
  }
  episodes.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { pods, tickers, totals, episodes };
}

function _countUp(el, value) {
  if (!el) return;
  if (_reducedMotion() || typeof requestAnimationFrame !== 'function') {
    el.textContent = String(value);
    return;
  }
  const start = performance.now();
  const dur = 1100;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = String(Math.round(value * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * 首屏分兩階段畫，避免版面位移（CLS）：
 *   1. 索引（notes/index.json）一到就畫「骨架」——日期範圍、脈動圖的圖例與
 *      月份軸、熱門標的的排名（索引上就有 tw_tickers／us_tickers）。
 *   2. 卡片本體到齊後只「就地填值」——柱子長出來、公司名換掉代號、統計數字
 *      與跑馬燈文字。這些區塊的高度在第 1 階段就已固定，填值不會推動版面。
 */
function _indexEpisodes(items) {
  return _asArray(items).map(_asObject)
    .filter(it => _isSafeEpId(it.ep_id))
    .map(it => ({ epId: it.ep_id, date: it.date || '', title: it.title || '', pod: _podSlug(it) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function _renderInsightsFrame(items) {
  const eps = _indexEpisodes(items);
  if (!eps.length) return;

  const range = `${String(eps[0].date).replace(/-/g, '.')} — ${String(eps[eps.length - 1].date).replace(/-/g, '.')}`;
  ['hero-range', 'footer-range'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = range;
  });

  const pods = new Map();
  eps.forEach(e => pods.set(e.pod, (pods.get(e.pod) || 0) + 1));
  const legend = document.getElementById('pulse-legend');
  if (legend) {
    legend.innerHTML = Array.from(pods.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([pod, n]) => `<li data-pod="${pod}"><i></i>${escHtml(pod.toUpperCase())} ${n}</li>`).join('');
  }
  const axis = document.getElementById('pulse-axis');
  if (axis) {
    let prevMonth = '';
    const ticks = [];
    eps.forEach((e, i) => {
      const month = String(e.date).slice(0, 7);
      if (month === prevMonth) return;
      prevMonth = month;
      const [y, m] = month.split('-');
      ticks.push(`<span style="left:${((i / eps.length) * 100).toFixed(2)}%">${Number(m)} 月${i === 0 ? ` ${y}` : ''}</span>`);
    });
    axis.innerHTML = ticks.join('');
  }

  // 熱門標的：排名只看「幾集提到」，索引就算得出來；名稱待卡片本體到齊再補。
  const counts = new Map();
  for (const it of _asArray(items).map(_asObject)) {
    [['tw', it.tw_tickers], ['us', it.us_tickers]].forEach(([market, list]) => {
      new Set(_asArray(list)).forEach(ticker => {
        const t = counts.get(ticker) || { ticker, market, eps: 0 };
        t.eps += 1;
        counts.set(ticker, t);
      });
    });
  }
  const all = Array.from(counts.values());
  let shown = 0;
  [['tw', 'trend-tw'], ['us', 'trend-us']].forEach(([market, elId]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const top = all.filter(t => t.market === market)
      .sort((a, b) => (b.eps - a.eps) || String(a.ticker).localeCompare(String(b.ticker)))
      .slice(0, 6);
    const max = top.length ? top[0].eps : 1;
    shown += top.length;
    el.innerHTML = top.map((t, i) => `<li><button type="button" class="trend-btn" data-action="filter-ticker" data-ticker="${escHtml(t.ticker)}" data-name="${escHtml(t.ticker)}" aria-pressed="false">
        <span class="trend-rank">${i + 1}</span>
        <span class="trend-name">${escHtml(t.ticker)}</span>
        <span class="trend-meter"><i style="--w:${(t.eps / max).toFixed(3)}"></i>${t.eps} 集</span>
      </button></li>`).join('');
  });
  const sec = document.getElementById('trending');
  if (sec) sec.hidden = shown === 0;
}

function _renderHero(ins) {
  const vals = [ins.episodes.length, ins.pods.size, ins.totals.news, ins.totals.ind, ins.totals.tg, ins.totals.qa];
  const dds = document.querySelectorAll('#hero-stats dd');
  dds.forEach((dd, i) => _countUp(dd, vals[i] || 0));
}

function _renderPulse(ins) {
  const track = document.getElementById('pulse-track');
  if (!track || !ins.episodes.length) return;
  const eps = ins.episodes;
  // 以最小～最大值重新映射到 22%～100%：各集重點數集中在 8～15 則，
  // 直接除以最大值會讓所有柱子幾乎一樣高，看不出節奏。
  const max = Math.max(...eps.map(e => e.weight), 1);
  const min = Math.min(...eps.map(e => e.weight));
  const scale = (w) => (max === min ? 1 : .22 + .78 * (w - min) / (max - min));
  const grow = _reducedMotion() ? '' : ' is-grow';
  track.innerHTML = eps.map((e, i) => {
    const label = `${e.date}｜${e.pod.toUpperCase()}｜${e.title}`;
    return `<a class="pulse-bar${grow}" href="#/ep/${escHtml(e.epId)}" data-ep-id="${escHtml(e.epId)}" data-pod="${e.pod}" data-tip-meta="${escHtml(`${_formatDate(e.date)} · ${e.pod.toUpperCase()} · ${e.weight} 則重點`)}" data-tip-title="${escHtml(e.title)}" style="--h:${scale(e.weight).toFixed(3)};--i:${i}" aria-label="${escHtml(label)}"></a>`;
  }).join('');
  _initPulseTip(track);
}

function _initPulseTip(track) {
  const tip = document.getElementById('pulse-tip');
  if (!tip || track.dataset.tipBound) return;
  track.dataset.tipBound = '1';
  const show = (bar) => {
    tip.innerHTML = `<b>${escHtml(bar.dataset.tipMeta || '')}</b>${escHtml(bar.dataset.tipTitle || '')}`;
    const r = bar.getBoundingClientRect();
    const tw = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - tw - 12, r.left + r.width / 2 - tw / 2));
    tip.style.width = tw + 'px';
    tip.style.left = left + 'px';
    tip.style.top = Math.max(12, r.top - 12 - tip.offsetHeight) + 'px';
    tip.classList.add('is-on');
  };
  const hide = () => tip.classList.remove('is-on');
  track.addEventListener('pointerover', e => { const b = e.target.closest('.pulse-bar'); if (b) show(b); });
  track.addEventListener('pointerleave', hide);
  track.addEventListener('focusin', e => { const b = e.target.closest('.pulse-bar'); if (b) show(b); });
  track.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
}

/** 熱門標的：把第 1 階段的代號換成公司名（就地替換，列高不變）。 */
function _fillTrendingNames(ins) {
  document.querySelectorAll('.trend-btn').forEach(btn => {
    const t = ins.tickers.get(btn.dataset.ticker);
    if (!t) return;
    btn.dataset.name = t.name;
    const nameEl = btn.querySelector('.trend-name');
    if (nameEl) nameEl.innerHTML = `${escHtml(t.name)}<small>${escHtml(t.ticker)}</small>`;
  });
}

/** 新聞跑馬燈：最新數集的新聞事件標題（原文），兩份相同序列首尾相接做無縫循環。 */
function _renderTape(ins) {
  const tape = document.getElementById('tape');
  if (!tape) return;
  const items = [];
  for (const e of ins.episodes.slice().reverse()) {
    _asArray(e.card.新聞事件).map(_asObject).forEach(ev => {
      if (ev.標題 && items.length < 16) items.push({ e, title: ev.標題 });
    });
    if (items.length >= 16) break;
  }
  if (!items.length) return;
  const set = (aria) => `<div class="tape-set"${aria ? ' aria-hidden="true"' : ''}>${items.map(({ e, title }) =>
    `<a href="#/ep/${escHtml(e.epId)}"${aria ? ' tabindex="-1"' : ''}><span class="tape-pod" data-pod="${e.pod}">${escHtml(e.pod.toUpperCase())}</span>${escHtml(title)}</a>`).join('')}</div>`;
  tape.innerHTML = `<div class="tape-track" style="--tape-dur:${items.length * 7}s">${set(false)}${set(true)}</div>`;
}

async function _loadInsights() {
  const entries = await Promise.all(NAV_STATE.allItems.map(async it => {
    try {
      return { it, card: await _fetchCardBody(it.ep_id) };
    } catch (e) {
      return { it, card: null };
    }
  }));
  const ins = _computeInsights(entries);
  _renderHero(ins);
  _renderPulse(ins);
  _fillTrendingNames(ins);
  _renderTape(ins);
  _syncFilterUi(NAV_STATE.lastFiltered.length);
}

// ═══════════════════════════════════════════════════════════════════════
// 閱讀器：單集導讀全文。網址 #/ep/<podcaster>/<slug> 可直接分享與返回。
// ═══════════════════════════════════════════════════════════════════════

const READER = { epId: null, returnFocus: null, viaHistory: false, baseTitle: '' };

function _readerOrder() {
  return NAV_STATE.lastFiltered.length ? NAV_STATE.lastFiltered : NAV_STATE.allItems;
}

function _lockScroll(on) {
  if (document.body && document.body.classList) document.body.classList.toggle('is-locked', on);
}

async function openReader(epId) {
  const reader = document.getElementById('reader');
  const body = document.getElementById('reader-body');
  if (!reader || !body || !_isSafeEpId(epId)) return;
  if (reader.hidden) {
    READER.returnFocus = document.activeElement;
    READER.baseTitle = READER.baseTitle || document.title;
    reader.hidden = false;
    // 共享元素轉場進行中時由 View Transition 負責進場，不再疊加自身動畫。
    if (!document.documentElement.classList.contains('vt-morph')) {
      reader.classList.add('is-entering');
      setTimeout(() => reader.classList.remove('is-entering'), 700);
    }
    _lockScroll(true);
  }
  READER.epId = epId;
  body.innerHTML = '<div class="dd-empty">載入中…</div>';

  let card;
  try {
    card = await _fetchCardBody(epId);
  } catch (err) {
    console.error('[lite] 閱讀器載入失敗', epId, err);
    if (READER.epId === epId) body.innerHTML = '<div class="dd-empty">此集卡片暫時無法載入</div>';
    return;
  }
  if (READER.epId !== epId) return;

  const order = _readerOrder();
  let idx = order.findIndex(it => it.ep_id === epId);
  const nextItem = idx !== -1 ? order[idx + 1] : null;
  const nextHtml = nextItem
    ? `<a class="reader-next" href="#/ep/${escHtml(nextItem.ep_id)}" data-action="reader-goto" data-ep-id="${escHtml(nextItem.ep_id)}"><small>下一集（較舊）→</small><strong>${escHtml(nextItem.title || '')}</strong></a>`
    : '';
  body.innerHTML = `<div class="reader-layout">
      <nav class="reader-toc" aria-label="本集段落"><p class="reader-toc-title">本集段落</p><ol id="reader-toc-list"></ol></nav>
      <div>${renderEpisodeCard(card)}${nextHtml}</div>
    </div>`;

  const posEl = document.getElementById('reader-pos');
  if (posEl) posEl.textContent = idx !== -1 ? `${idx + 1} / ${order.length}` : '';
  const prev = document.getElementById('reader-prev');
  const next = document.getElementById('reader-next');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx === -1 || idx >= order.length - 1;

  const scroller = document.getElementById('reader-scroll');
  if (scroller) scroller.scrollTop = 0;
  document.title = `${card.title || '導讀'}｜Podcast 財經導讀站`;
  reader.setAttribute('aria-label', card.title || '導讀全文');
  // 焦點移入對話框本身（而非第一顆按鈕）：螢幕閱讀器會先讀出標題
  // （aria-label），鍵盤使用者按 Tab 即進入返回鈕，且不會出現搶眼的焦點框。
  if (!reader.contains(document.activeElement)) reader.focus({ preventScroll: true });

  _buildReaderToc(body);
  _applyDiscussButtonState();
  _probeDeepAvailability(epId, body);
}

/**
 * 只有 24／86 集有深入解讀資料。開啟閱讀器時先查一次該集的 .deep.json，
 * 查無資料的區塊直接拿掉「深入解讀」按鈕、公司 chip 改為不可點，避免
 * 讀者點進去只看到「目前尚無深入解讀資料」。網路錯誤時保留原狀（按鈕
 * 本身仍有 404 降級，不會壞）。
 */
async function _probeDeepAvailability(epId, body) {
  let ids;
  try {
    const res = await fetch(`./notes/${epId}.deep.json`);
    if (res.ok) {
      const deep = _asObject(await res.json());
      ids = new Set(_asArray(deep.company_blocks).concat(_asArray(deep.blocks)).map(b => _asObject(b).block_id));
    } else {
      ids = new Set();
    }
  } catch (e) {
    return;
  }
  if (READER.epId !== epId) return;
  body.querySelectorAll('[data-action="open-deep-dive"]').forEach(btn => {
    if (ids.has(btn.dataset.blockId)) return;
    if (btn.classList.contains('stock-chip')) {
      btn.disabled = true;
      btn.removeAttribute('data-action');
    } else {
      btn.remove();
    }
  });
  const hint = body.querySelector('.ep-sec-hint');
  if (hint && !Array.from(ids).some(id => String(id).startsWith('company-'))) {
    hint.textContent = '本集尚未提供 AI 公司解讀。';
  }
}

function _buildReaderToc(body) {
  const list = document.getElementById('reader-toc-list');
  const scroller = document.getElementById('reader-scroll');
  if (!list) return;
  const secs = Array.from(body.querySelectorAll('[data-sec]'));
  list.innerHTML = secs.map((s, i) => {
    const count = s.querySelector('.ep-sec-count');
    return `<li><button type="button" data-action="reader-jump" data-index="${i}"><span>${escHtml(s.dataset.sec)}</span><span>${count ? escHtml(count.textContent.replace(' 則', '')) : ''}</span></button></li>`;
  }).join('');
  if (READER.tocObserver) READER.tocObserver.disconnect();
  if (typeof IntersectionObserver !== 'function' || !scroller) return;
  const buttons = list.querySelectorAll('button');
  READER.tocObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const i = secs.indexOf(en.target);
      buttons.forEach((b, j) => b.classList.toggle('is-active', j === i));
    });
  }, { root: scroller, rootMargin: '-20% 0px -70% 0px' });
  secs.forEach(s => READER.tocObserver.observe(s));
}

function _jumpReaderSection(index) {
  const body = document.getElementById('reader-body');
  const sec = body && body.querySelectorAll('[data-sec]')[Number(index)];
  if (sec) sec.scrollIntoView({ behavior: _reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function closeReader(fromRoute) {
  const reader = document.getElementById('reader');
  if (!reader || reader.hidden || READER.closing) return;
  const tileTitle = _visibleTileTitle(READER.epId);
  const hide = () => {
    reader.hidden = true;
    READER.closing = false;
    if (tileTitle) tileTitle.style.viewTransitionName = 'ep-title';
  };
  if (tileTitle && typeof document.startViewTransition === 'function' && !_reducedMotion()) {
    // 反向轉場：閱讀器標題縮回列表上的那張磚。hide 在下一個影格才執行，
    // 期間以 closing 旗標擋住 history.back() 觸發的第二次關閉。
    READER.closing = true;
    document.startViewTransition(hide).finished.finally(() => { tileTitle.style.viewTransitionName = ''; });
  } else {
    hide();
  }
  READER.epId = null;
  _lockScroll(false);
  if (READER.baseTitle) document.title = READER.baseTitle;
  if (READER.tocObserver) READER.tocObserver.disconnect();
  if (!fromRoute && /^#\/ep\//.test(location.hash)) {
    // 由站內連結開啟（hash 變更有一筆歷史）就退回上一頁，讓瀏覽器的上一頁
    // 鍵與關閉鈕行為一致；直接以分享網址進站則只清掉 hash。
    if (READER.viaHistory) history.back();
    else history.replaceState(null, '', location.pathname + location.search);
  }
  READER.viaHistory = false;
  const back = READER.returnFocus;
  if (back && typeof back.focus === 'function' && document.contains(back)) back.focus({ preventScroll: true });
}

/** 上一則／下一則：以 replaceState 換網址，不堆疊歷史紀錄。 */
function _stepReader(step) {
  const order = _readerOrder();
  const idx = order.findIndex(it => it.ep_id === READER.epId);
  const target = order[idx + Number(step)];
  if (idx === -1 || !target) return;
  _gotoReader(target.ep_id);
}

function _gotoReader(epId) {
  if (!_isSafeEpId(epId)) return;
  history.replaceState(null, '', `#/ep/${epId}`);
  openReader(epId);
}

/** 列表上該集導讀磚的標題元素；不在畫面內（或尚未繪製）時回傳 null。 */
function _visibleTileTitle(epId) {
  if (!epId || typeof document.querySelector !== 'function') return null;
  const el = document.querySelector(`.tile[data-ep-id="${String(epId).replace(/"/g, '')}"] .tile-title`);
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight ? el : null;
}

/**
 * 共享元素轉場：點導讀磚開閱讀器時，磚上的標題變形移動到閱讀器標題的位置
 * （View Transitions API；閱讀器的 .ep-title 固定帶同名 view-transition-name）。
 * 不支援、偏好減少動態、或磚不在畫面內時直接開啟，閱讀器自身的進場動畫照舊。
 */
function _openReaderWithMorph(epId) {
  const tileTitle = _visibleTileTitle(epId);
  if (!tileTitle || typeof document.startViewTransition !== 'function' || _reducedMotion()) {
    openReader(epId);
    return;
  }
  tileTitle.style.viewTransitionName = 'ep-title';
  document.documentElement.classList.add('vt-morph');
  const vt = document.startViewTransition(async () => {
    tileTitle.style.viewTransitionName = '';
    await openReader(epId);
  });
  vt.finished.finally(() => document.documentElement.classList.remove('vt-morph'));
}

/** 依目前 hash 開關閱讀器。非 #/ep/ 的 hash（如 #site-main）一律不處理。 */
function _route(initial) {
  const m = location.hash.match(/^#\/ep\/(.+)$/);
  if (m) {
    const epId = decodeURIComponent(m[1]);
    if (initial) {
      openReader(epId);
    } else {
      READER.viaHistory = true;
      _openReaderWithMorph(epId);
    }
  } else {
    closeReader(true);
  }
}

// ── 進場動畫、標頭、鍵盤 ────────────────────────────────────────────────

let _revealObserver = null;

/** 列表重繪後為導讀磚掛上進場動畫；不支援 IntersectionObserver 時內容直接可見。 */
function _observeReveal(container) {
  if (!_revealObserver || !container || typeof container.querySelectorAll !== 'function') return;
  container.querySelectorAll('.card-grid').forEach(grid => {
    Array.from(grid.children).forEach((el, i) => {
      el.style.setProperty('--d', String(i % 3));
      _revealObserver.observe(el);
    });
  });
}

function _initReveal() {
  if (typeof IntersectionObserver !== 'function' || _reducedMotion()) return;
  document.documentElement.classList.add('reveal-on');
  _revealObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        _revealObserver.unobserve(en.target);
      }
    });
  }, { rootMargin: '0px 0px -6% 0px' });
}

function _initMasthead() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const sync = () => {
    document.documentElement.style.setProperty('--mast-h', header.offsetHeight + 'px');
  };
  sync();
  window.addEventListener('resize', sync, { passive: true });
  window.addEventListener('scroll', () => header.classList.toggle('is-scrolled', window.scrollY > 8), { passive: true });
  // 首屏進場動畫只播一次，結束後移除 class，避免之後的重繪重播。
  setTimeout(() => document.body.classList.remove('intro'), 1600);
}

function _initReader() {
  const scroller = document.getElementById('reader-scroll');
  const bar = document.getElementById('reader-progress');
  if (scroller && bar) {
    scroller.addEventListener('scroll', () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      bar.style.setProperty('--p', max > 0 ? (scroller.scrollTop / max).toFixed(4) : '0');
    }, { passive: true });
  }
  window.addEventListener('hashchange', () => _route(false));
}

/** Tab 焦點鎖在 container 內（aria-modal 疊層）：到頭尾時循環，不會跑到背後的頁面。 */
function _trapFocus(e, container) {
  const nodes = Array.from(container.querySelectorAll('a[href], button:not([disabled]), select, textarea, input, [tabindex]:not([tabindex="-1"])'))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === container || !container.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !container.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

/** Esc 依疊層由上而下關閉；閱讀器開著時 ←／→ 切換集數。輸入框內不攔截。 */
function _handleGlobalKeydown(e) {
  const t = e.target;
  if (e.key === 'Tab') {
    const dd = document.getElementById('dd-overlay');
    const reader = document.getElementById('reader');
    const panel = document.getElementById('copilot-panel');
    const panelOpen = panel && panel.style.display === 'flex';
    if (panelOpen) return;
    if (dd && dd.style.display === 'flex') _trapFocus(e, dd);
    else if (reader && !reader.hidden) _trapFocus(e, reader);
    return;
  }
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const compliance = document.getElementById('compliance-overlay');
  if (compliance && compliance.style.display !== 'none') return;
  const dd = document.getElementById('dd-overlay');
  const ddOpen = dd && dd.style.display !== 'none';
  const panel = document.getElementById('copilot-panel');
  const panelOpen = panel && panel.style.display !== 'none' && panel.style.display !== '';
  const reader = document.getElementById('reader');
  const readerOpen = reader && !reader.hidden;
  if (e.key === 'Escape') {
    if (ddOpen) closeDeepDive();
    else if (panelOpen) _closeCopilotPanel();
    else if (readerOpen) closeReader(false);
    return;
  }
  if (readerOpen && !ddOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    _stepReader(e.key === 'ArrowLeft' ? -1 : 1);
  }
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

  try {
    _renderInsightsFrame(NAV_STATE.allItems);
  } catch (e) {
    // 純呈現，失敗不影響列表。
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
 * ——`addEventListener` 註冊本身不受 `script-src` 限制，因此這個修法
 * 不需要為了本頁的按鈕而放寬 CSP。
 *
 * 【2026-09-08 更新，SPEC-022 T-2204】原文此處另有一句「H-7 的防線維持
 * 最嚴格狀態」，該敘述已不成立，故刪除：script-src 目前含兩組外部來源
 * ——GA4（SPEC-020，PRD 4.9-8(b)）與 Google 登入（SPEC-022，4.9-8(a)），
 * 皆為逐條列舉、經裁決放寬。
 *
 * 但上述修法的理由完全不受影響：委派監聽器之所以正確，是因為它不需要
 * inline script；而放寬的那些來源與本頁按鈕無關。保留 data-action 委派
 * 仍是對的，不要因為 CSP 已放寬就改回 inline onclick——那會重新引入
 * 2026-08-21 那個「按鈕在真實瀏覽器下完全點不動」的 bug。
 */
function _handleDelegatedClick(event) {
  // T-2715：專家選單「點擊外部收合」必須在下面的 data-action 早退
  // 之前檢查——選單外部的點擊通常沒有 data-action，若放在早退之後
  // 就永遠不會被呼叫到。
  _maybeCollapsePersonaMenu(event);

  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'open-deep-dive') {
    openDeepDive(el.dataset.epId, el.dataset.blockId);
  } else if (action === 'toggle-podcaster') {
    _togglePodcaster(el.dataset.podcaster);
  } else if (action === 'select-copilot-option') {
    // T-2504（spec-025 §7.2）：個人化選項 chip 的點擊。
    _selectCopilotOption(el.dataset.group, el.dataset.value);
  } else if (action === 'start-copilot-generate') {
    // T-2505（spec-025 §7.3）：點擊「開始生成」，本身是 async 但刻意
    // 不 await——委派監聽器本身不是 async 函式，且呼叫端（DOM click
    // 事件）沒有任何東西在等它的完成時間點。函式自身以 try/finally
    // 保證不會產生未處理的 rejection（見其內部說明）。
    _startCopilotGenerate();
  } else if (action === 'bring-into-discussion') {
    // T-2714（spec-027 §2.3／§7.3）：點擊「💬 帶入討論」。
    _bringIntoDiscussion(el.dataset.epId, el.dataset.blockId, el.dataset.title);
  } else if (action === 'toggle-overview-toolbar') {
    // T-2813（spec-028 §7.4）：點擊「產業全景速覽」標頭，收折／展開。
    _toggleCopilotOverviewToolbar();
  } else if (action === 'toggle-overview-card') {
    // T-2814（spec-028 §7.3）：點擊速覽文件卡標頭，收折／展開。
    _toggleCopilotOverviewCard(el.dataset.bodyId, el.dataset.arrowId);
  } else if (action === 'toggle-persona-menu') {
    // T-2715（spec-027 §2.3／§7.3）：點擊專家選單觸發鈕，展開／收合。
    _toggleCopilotPersonaMenu();
  } else if (action === 'select-copilot-persona') {
    // T-2715：點擊選單項目，切換目前選取的專家。
    _selectCopilotPersona(el.dataset.persona);
  } else if (action === 'submit-copilot-message') {
    // T-2716（spec-027 §2.3／§7.3）：點擊「送出」。
    _submitCopilotComposerMessage();
  } else if (action === 'export-copilot-chat') {
    // T-2720（spec-027 §2.3／§7.3）：點擊「📥 .md」。
    _exportCopilotChatTranscript();
  } else if (action === 'filter-ticker') {
    // 2026-10 改版：熱門標的點選／取消標的篩選。
    _setTickerFilter(el.dataset.ticker, el.dataset.name);
  } else if (action === 'reset-filters') {
    _resetFilters();
  } else if (action === 'close-reader') {
    closeReader(false);
  } else if (action === 'reader-step') {
    _stepReader(el.dataset.step);
  } else if (action === 'reader-goto') {
    // 閱讀器底部「下一集」：本身是 <a href="#/ep/...">（無 JS 也能用），
    // 有 JS 時改走 replaceState，不堆疊歷史紀錄。
    if (event.preventDefault) event.preventDefault();
    _gotoReader(el.dataset.epId);
  } else if (action === 'reader-jump') {
    _jumpReaderSection(el.dataset.index);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', _handleDelegatedClick);
}

async function initApp() {
  // 映射表必須先載入完成才開始渲染卡片，確保第一次繪製就是正確標籤，
  // 不需要卡片渲染後再重繪一次（T-809）。
  await _loadFieldLabelMap();
  _initReveal();
  _initMasthead();
  _initReader();
  document.addEventListener('keydown', _handleGlobalKeydown);
  await initHomeNav();
  // 首屏統計與分享網址（#/ep/...）都需要索引已載入；統計刻意不 await，
  // 列表先畫出來，脈動圖與熱門標的隨卡片本體到齊再補上。
  _loadInsights();
  _route(true);
  initDeepDiveModal();
  _cleanupLegacyApiKey();
  _initGoogleLogoutButton();
  _initComplianceModal();
  _initCopilotPanel();
  _initCopilotViewportMode();
  // T-2719（Q27-C）：**被動還原**——只重建狀態，不自動打開面板（依
  // 使用者裁決）；面板本來就開著（如一鍵生成流程）或使用者下次點擊
  // 「帶入討論」時，指示條自然會反映還原後的狀態。
  _restoreCopilotSessionFromStorage();
  // T-1903（SPEC-019 §7.2）：刻意不 await——現有渲染流程已在上面幾行
  // 完成，此呼叫的結果本輪（walking skeleton）尚無任何 UI 消費，不需要
  // initApp() 的完成時間點等它。函式自身保證絕不 throw（見其內部
  // try/catch），fire-and-forget 不會產生未處理的 rejection。
  //
  // T-2211（SPEC-022 §7.6）：串接 `.then(_maybeInitGoogleLogin)`——只讀
  // _fetchCopilotConfig() 的解析結果，不改動其內部邏輯（Non-scope）。
  // _fetchCopilotConfig() 保證絕不 reject，_maybeInitGoogleLogin() 自身
  // 也保證絕不 throw（見其內部 try/catch），故此串接同樣不會產生未處理
  // 的 rejection。
  //
  // T-2502（SPEC-025 §7.1 S-3）：追加 `_applyCopilotButtonVisibility`——
  // 同一個 `.then()`，同樣只讀解析結果、不改動 `_fetchCopilotConfig()`
  // 內部邏輯。此時導讀卡（含生成入口按鈕，預設 hidden）已渲染完成，
  // 這裡只是依旗標決定是否移除隱藏，不會延誤卡片顯示。
  //
  // T-2512：再追加 `_applyCopilotViewportMode`——懸浮鈕的顯示條件同時
  // 依賴斷點與 `generation_enabled`（見該函式說明），旗標剛確定時需
  // 重新套用一次，理由與上一段完全相同。
  _fetchCopilotConfig().then((config) => {
    _maybeInitGoogleLogin(config);
    _applyCopilotButtonVisibility(config);
    _applyCopilotViewportMode();
  });
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

// T-1903（SPEC-019 §7.2）：Copilot 2.0 執行期功能旗標。與後端
// functions/api/config.js 的 DEFAULT_CONFIG 各自獨立宣告——兩者位於
// 不同執行環境（前端靜態資產 vs Pages Functions），無法共用常數，
// 值必須手動保持一致。
const _COPILOT_CONFIG_DEFAULT = {
  generation_enabled: false,
  tier2_enabled: true,
  quota_limit: 3,
};

/**
 * 模組層狀態。【2026-09-15 更新，T-2807】🚀 生成入口按鈕已隨 spec-028
 * §7.1 移除；本變數現由「帶入討論」按鈕（`_discussButtonHtml()`）與其
 * 顯示閘門（`_applyCopilotButtonVisibility()`）讀取。
 */
let _copilotConfig = { ..._COPILOT_CONFIG_DEFAULT };

/**
 * 取得 Copilot 2.0 的執行期功能旗標（PRD DoD-13）。
 *
 * 以相對路徑呼叫，確保換網域時前端零改動（SDD §5）。任何失敗情境
 * （網路錯誤、非 2xx、JSON 壞掉）一律回傳預設值物件，絕不 throw——
 * 呼叫端（`initApp()`）刻意不 await 這個函式，若此處會 throw 或
 * reject，就會變成未處理的 promise rejection。
 *
 * 靜態站（GitHub Pages，尚未接上 Cloudflare Pages Functions）上呼叫
 * 此函式必然落入這個失敗降級路徑（404 或 HTML），這是雙 origin
 * 過渡期的正常狀態，不是錯誤（SDD §1.10）。
 */
async function _fetchCopilotConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) {
      _copilotConfig = { ..._COPILOT_CONFIG_DEFAULT };
      return _copilotConfig;
    }
    _copilotConfig = await res.json();
    return _copilotConfig;
  } catch (e) {
    _copilotConfig = { ..._COPILOT_CONFIG_DEFAULT };
    return _copilotConfig;
  }
}

/**
 * T-2502（spec-025 §7.1 S-3）：依 `_fetchCopilotConfig()` 的解析結果，
 * 移除或維持「帶入討論」按鈕的 `hidden`。【2026-09-15 更新，T-2807】
 * 🚀 生成入口按鈕已隨 spec-028 §7.1 移除，本函式現只處理
 * `bring-into-discussion` 一種按鈕。
 *
 * 呼叫時機（見 `initApp()`）保證卡片渲染早已完成——按鈕在渲染當下已依
 * `_copilotConfig` 的預設值（`generation_enabled: false`）正確地帶上
 * `hidden`（見 `_discussButtonHtml()`），本函式要處理的是「已經渲染在
 * DOM 上、屬性卻可能過期」的既有節點，單純改模組層變數不會回頭影響
 * 已插入的 HTML。
 *
 * `generation_enabled` 非嚴格 `true`（旗標為 `false`、鍵不存在、或整個
 * 請求失敗回退到預設值）一律維持隱藏——**維持隱藏是唯一的 fail-closed
 * 分支**，不因例外或非預期輸入意外顯示按鈕。
 */
function _applyCopilotButtonVisibility(config) {
  try {
    if (typeof document === 'undefined') return;
    const enabled = !!(config && config.generation_enabled === true);
    // T-2714：「帶入討論」按鈕與生成入口共用同一個旗標閘門
    // （`generation_enabled`），一併於此修正，不另立第二個 config
    // 解析後的修補時機。
    document.querySelectorAll('[data-action="bring-into-discussion"]').forEach((el) => {
      el.hidden = !enabled;
    });
  } catch (e) {
    // 例外一律維持既有（隱藏）狀態，不得往上拋（比照 _maybeInitGoogleLogin）。
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Copilot 對話工作台面板（T-2713，spec-027 §2.3）
// ═══════════════════════════════════════════════════════════════════════
//
// **T-2713 拆除範圍的裁決（2026-09-14，已與使用者確認）**：SPEC-025
// 舊版的生成面板容器同時裝了「一鍵生成全效卡」（PRD 4.1-G，本輪
// 不動）與 SPEC-026 舊版單輪追問（要被本輪的多輪多專家對話取代）。
// 本輪只拆除並重建容器本身（舊容器 id 已改名為 `#copilot-panel`）與
// 舊版單輪追問的 JS／DOM（含舊版送出追問函式與其專用輸入區、
// 匯出鍵，改由 T-2714 之後的新對話工作台取代），**一鍵生成全效卡的
// 呼叫與渲染邏輯原樣保留，只更新容器 ID**。

/**
 * 開啟 Copilot 對話工作台面板（`#copilot-panel`）。
 *
 * 面板是**獨立於深入解讀 Modal（`#dd-overlay`）之外的另一個疊層**——
 * CSS 只讓它固定佔用畫面右側 440px、不設任何遮罩背景，因此不論從導讀卡
 * 或深入解讀 Modal 內點擊，左側內容都維持原樣、可獨立捲動，不被本面板
 * 遮蓋（PRD 4.1-D）。本函式完全不碰 `.dd-grid`／`.dd-col-*` 的任何節點
 * 或樣式。
 *
 * 桌機（≥900px）開啟時額外在 `<body>` 加上 `copilot-panel-open` class
 * ——CSS 依此把 `.site-main` 收窄置中至 800px（spec §2.3 電腦端雙欄），
 * 純粹是外層寬度限制，不觸碰卡片渲染本身。
 *
 * @param {string} epId 來自被點擊按鈕的 `data-ep-id`
 * @param {string} blockId 來自被點擊按鈕的 `data-block-id`（如 `industry-2`）
 * @param {string} title 來自被點擊按鈕的 `data-title`（該則產業動態或個股標題）
 */
/**
 * 面板目前是否已開啟（spec-028 §7.5 FAB 圖層判定用）。**刻意不用
 * `document.body.classList.contains('copilot-panel-open')` 或
 * `panel.style.display` 判斷**——前者在既有測試沙盒（`test_chat_
 * workbench.cjs`／`test_generation_ui.cjs` 的 `fakeEl()`）的
 * `classList` mock 只提供 `add()`／`remove()`，呼叫 `contains()` 會
 * 拋例外並被 `_applyCopilotViewportMode()` 的 try/catch 吞掉，讓 FAB
 * 判定在測試環境下靜默失效；獨立的模組層旗標不依賴任何 DOM API，
 * 兩種環境行為一致。
 */
let _copilotPanelOpen = false;

function _openCopilotPanel(epId, blockId, title) {
  try {
    const panel = document.getElementById('copilot-panel');
    if (!panel) return;
    // 記錄在面板容器自身的 dataset 上，供驗收方式核對「面板上記錄的
    // ep_id／block_id 逐字等於被點擊按鈕的 data-* 值」，也供既有的
    // 一鍵生成流程讀取。
    panel.dataset.epId = epId || '';
    panel.dataset.blockId = blockId || '';
    const titleEl = document.getElementById('copilot-panel-title');
    if (titleEl) titleEl.textContent = title || '';
    panel.style.display = 'flex';
    if (document.body && document.body.classList) document.body.classList.add('copilot-panel-open');
    _copilotPanelOpen = true;
    // 每次開啟都重新套用一次斷點狀態，不完全依賴 resize 事件——涵蓋
    // 「開啟當下才是使用者第一次看到面板」的情境。此處也是 FAB 隱藏
    // 判定（spec §7.5）真正生效的時機——必須排在 `_copilotPanelOpen`
    // 賦值之後。
    _applyCopilotViewportMode();
    // 每次開啟都重置個人化選項為預設值——避免上一則的選取（例如
    // 「長線／逆勢」）殘留到這次新開的一則，讀者看到的視覺狀態才會
    // 跟實際會送出的 enum 一致。
    _resetCopilotSelection();
    // 先取消可能還在跑的舊串流，避免遲到的 chunk 之後寫進一個已經換了
    // 則、甚至已重新開啟的面板。
    // 【2026-09-15 更新，T-2811（spec-028 §7.3／ADR-3）】**停止清空報告
    // 區**——速覽改為對話流中的文件卡（T-2814），需與登入期間對話全程
    // 保存的原則一致：既有速覽文件卡的內文須逐字保留，不得因重新開啟
    // 面板而被清空（H-7：清空邏輯若移除不完全，上一則的速覽內容可能
    // 混進新主題，讀者會看到錯誤的產業報告卻毫無察覺——本次修正的
    // 方向是移除清空動作本身，徹底避免這個風險，而非把清空邏輯改
    // 得更「精準」）。
    _cancelCopilotStream();
    _ensureCopilotReportArea();
    _copilotGenerateInflight = false;
    // 生成鍵的 disabled 狀態**不是**單純「重置為可點擊」——額度是會員
    // 層級的狀態，換開另一則不會讓已用盡的額度恢復。先套用目前已知的
    // 額度狀態（避免短暫顯示成可點擊的閃爍），再非同步重新查詢一次
    // 最新值（滿足「面板常駐顯示剩餘次數」——開啟當下就要看得到）。
    _applyCopilotGenerateButtonState();
    _refreshCopilotQuota();
  } catch (e) {
    // 開啟失敗不得影響既有導讀卡渲染或深入解讀 Modal（Non-scope 明訂）。
  }
}

/**
 * 關閉 Copilot 對話工作台面板。**不得重整頁面**——單純切換 `display`，
 * 不觸碰 `location`／`history`，也不清除既有導讀卡或深入解讀 Modal 的
 * 任何狀態。
 */
function _closeCopilotPanel() {
  try {
    const panel = document.getElementById('copilot-panel');
    if (panel) panel.style.display = 'none';
    if (document.body && document.body.classList) document.body.classList.remove('copilot-panel-open');
    _copilotPanelOpen = false;
    // 面板關閉後重算 FAB 顯示條件（spec-028 §7.5）——手機端關閉面板時
    // FAB 須恢復顯示，杜絕「關閉後 FAB 消失不見」的殘留狀態。
    _applyCopilotViewportMode();
    // 關閉時取消尚未完成的串流讀取，避免遲到的 chunk 之後寫進一個
    // 已經換了則、甚至已經關閉的面板（DOM 節點是共用的，不會因為
    // 面板隱藏就停止接收 innerHTML／textContent 的寫入）。
    _cancelCopilotStream();
  } catch (e) {
    // 關閉失敗不得往上拋，比照本檔其餘 UI 初始化函式的既有慣例。
  }
}

/**
 * 綁定面板關閉鈕的 click 監聽器。抽成獨立函式並在 `initApp()` 內呼叫，
 * 比照 `_initGoogleLogoutButton()`／`initDeepDiveModal()` 的既有慣例。
 */
function _initCopilotPanel() {
  const closeBtn = document.getElementById('copilot-panel-close');
  if (closeBtn) closeBtn.addEventListener('click', _closeCopilotPanel);
  _ensureCopilotReportArea();
}

// ═══════════════════════════════════════════════════════════════════════
// 帶入討論與上下文指示條（T-2714，spec-027 §2.3／§7.3）
// ═══════════════════════════════════════════════════════════════════════
//
// 這是新版多輪多專家對話工作台的第一塊拼圖：讓讀者能把某一則產業動態
// 或個股觀點「帶入討論」，之後的專家選單（T-2715）、Composer 與送出
// （T-2716）、對話流渲染（T-2717）皆疊加在「目前討論主題」這個狀態
// 之上。**本 Task 不呼叫任何 `/api/` 端點**——錨定 API（`mode="anchor"`）
// 要等讀者真正送出第一則訊息才會呼叫（T-2716），本 Task 只負責「記錄
// 使用者想討論哪一則」與「畫面上顯示出來」。

/**
 * 目前的討論主題（`null` 代表全域模式，尚未錨定任何段落）。只存
 * `epId`／`blockId`／`title` 三項（供 T-2716 組 `mode="anchor"` 的
 * request body、以及指示條顯示標題），**不存任何對話內容**——比照
 * spec §13 ADR-9 的既有原則，內容一律即時組裝或即時渲染，不持久化。
 */
let _copilotDiscussionContext = null;

/**
 * 建立上下文指示條的 DOM（若尚未建立），插入 `#copilot-panel-body`
 * 最前面。比照 `_ensureCopilotReportArea()` 的既有慣例：只建立一次
 * （`getElementById` 已存在就直接回傳）。
 *
 * 【2026-09-15 更新，T-2809】**不含「退出主題」關閉鈕**（spec-028
 * §7.2 條款 4，PRD Non-goal #2）——切換主題一律透過主列表卡片點選，
 * 不提供退回無錨定空白狀態的手動出口。
 */
function _ensureCopilotContextIndicator() {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return null;
    let indicator = document.getElementById('copilot-context-indicator');
    if (indicator) return indicator;
    body.insertAdjacentHTML('afterbegin', [
      '<div id="copilot-context-indicator" hidden style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#EEF2FF;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;">',
      '<span id="copilot-context-indicator-text" style="color:var(--accent);font-weight:600;"></span>',
      '</div>',
    ].join(''));
    return document.getElementById('copilot-context-indicator');
  } catch (e) {
    return null;
  }
}

/**
 * 依 `_copilotDiscussionContext` 顯示或隱藏指示條、更新標題文字。
 * **未錨定時高度 0（隱藏）**（spec §7.3）：用 `hidden` 屬性達成，比照
 * 本檔其餘條件式顯示節點的既有慣例。
 */
function _updateCopilotContextIndicator() {
  try {
    const indicator = _ensureCopilotContextIndicator();
    if (!indicator) return;
    const textEl = document.getElementById('copilot-context-indicator-text');
    if (_copilotDiscussionContext) {
      indicator.hidden = false;
      if (textEl) textEl.textContent = '📑 正在討論：' + (_copilotDiscussionContext.title || '');
    } else {
      indicator.hidden = true;
      if (textEl) textEl.textContent = '';
    }
  } catch (e) {
    // 例外不得影響既有渲染（比照本檔其餘 UI 函式）。
  }
}

/**
 * 依額度用盡狀態設定「帶入討論」按鈕的 `disabled`（spec §7.3：額度用盡
 * 時 disabled，沿用既有「你的 3 次免費體驗已用完」文案，**不得為此
 * 新增任何形式的方案解鎖或儲值提示**——本函式只負責 disabled，文案由
 * 既有 `#copilot-quota-text` 顯示，不重複寫字）。
 */
function _applyDiscussButtonState() {
  try {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-action="bring-into-discussion"]').forEach((el) => {
      el.disabled = _copilotQuotaExhausted;
    });
  } catch (e) {
    // 例外不得影響既有渲染。
  }
}

/**
 * 嘗試喚起 Google 登入（One Tap）。**這是本專案第一次需要「偵測未登入
 * 時主動觸發登入」**（W-26 記錄過的既有空隙：舊版「一鍵生成」入口從未
 * 實作這個動線，訪客點擊後畫面沒有反應）——`google.accounts.id.prompt()`
 * 是 GIS 官方提供、`initialize()` 之後即可呼叫的程式化觸發方式，不需要
 * 新建任何 UI。**防禦性**：GIS 尚未載入或初始化失敗時安靜放棄，不拋出
 * 例外，也不假裝登入成功。
 */
function _triggerGoogleLoginPrompt() {
  try {
    if (typeof window !== 'undefined' && window.google && window.google.accounts && window.google.accounts.id
      && typeof window.google.accounts.id.prompt === 'function') {
      window.google.accounts.id.prompt();
    }
  } catch (e) {
    // 觸發失敗不得往上拋，比照本檔其餘 UI 操作函式的既有慣例。
  }
}

/**
 * 點擊「帶入討論」（T-2714）。**未登入 → 觸發登入流程，不送出任何
 * `/api/` 請求**；**額度用盡 → 不動作**（按鈕理論上已因
 * `_applyDiscussButtonState()` 而 disabled，這裡是防禦性複查）。
 *
 * 通過檢查後：把新主題**直接覆蓋**（不堆疊）目前的討論主題，開啟面板
 * （手機端抽屜升起、桌機端閱讀區收窄），更新指示條。**不呼叫任何
 * `/api/` 端點**——真正的錨定（`mode="anchor"`）留給 T-2716 的送出
 * 行為，本函式只記錄「使用者想討論哪一則」。
 *
 * @param {string} epId
 * @param {string} blockId
 * @param {string} title
 */
function _bringIntoDiscussion(epId, blockId, title) {
  try {
    if (typeof _lastIdToken !== 'string' || _lastIdToken.length === 0) {
      _triggerGoogleLoginPrompt();
      return;
    }
    if (_copilotQuotaExhausted) return;

    // 【2026-09-15 更新，T-2811（spec-028 §7.3）】切換前先記住舊主題，
    // 用來判定「是否為同一主題重複呼叫」（邊界：同 (epId, blockId) 時
    // 不插分隔線、不 push 新的匯出段落）與「是否為首次呼叫」（邊界：
    // 此前無任何主題時不插分隔線）。**必須在覆蓋 `_copilotDiscussionContext`
    // 之前讀取**，否則舊主題資訊已遺失。
    const previousDiscussionContext = _copilotDiscussionContext;
    const isSameTopic = !!(
      previousDiscussionContext &&
      previousDiscussionContext.epId === (epId || '') &&
      previousDiscussionContext.blockId === (blockId || '')
    );

    _copilotDiscussionContext = { epId: epId || '', blockId: blockId || '', title: title || '', sessionId: null };
    // T-2717：新段落直接覆蓋舊的，連帶重置對話歷史——新主題與舊主題
    // 是不同的 session，沿用舊歷史送給後端會混淆 Prompt 的討論對象。
    // **SDD H-8：本行與下方「DOM 不清空對話流」是同一個不變式的兩面**
    // ——`_copilotChatMessages` 給 LLM 看（必清），對話流 DOM 給人看
    // （必留）。混淆會把舊主題內容送進新主題的 Prompt，AI 答非所問且
    // 畫面看起來完全正常，不易察覺。**本函式（含以下新增的分隔線邏輯）
    // 刻意不含任何清空 `#copilot-chat-thread` 的操作。**
    _copilotChatMessages = [];
    _updateCopilotContextIndicator();
    // T-2813（spec-028 §7.4）：依 blockId 前綴決定「產業全景速覽」
    // 工具條的建立／移除（PRD §4.6 不對稱工具列）。
    _applyOverviewToolbarForTopic(blockId);

    if (!isSameTopic) {
      // 換至不同主題（或首次呼叫）：僅在「此前已有主題」時插入分隔線
      // （spec §7.3 邊界 7：首次呼叫不插入，此時面板尚無任何歷史可
      // 承接）。分隔線與對話氣泡同層插入 `#copilot-chat-thread`，DOM
      // 不清空，符合「登入期間全程保存」的 PRD §4.3 要求。
      if (previousDiscussionContext) {
        _insertCopilotSystemDivider('切換討論主題：' + (title || ''));
      }
      // 新主題開啟獨立的匯出段落（spec §7.3：`_copilotExportLog.length`
      // 增加 1）。同主題重複呼叫則不新增段落（邊界 6），避免同一主題
      // 在匯出檔中被拆成多段。
      _copilotExportLog.push({ title: title || '', entries: [], overview: null });
    }

    const panel = document.getElementById('copilot-panel');
    if (panel) {
      panel.style.display = 'flex';
      if (document.body && document.body.classList) document.body.classList.add('copilot-panel-open');
      // 【2026-09-15 更新，T-2810】本函式是獨立於 `_openCopilotPanel()`
      // 的第二條開啟面板路徑——若不在此也設定 `_copilotPanelOpen`，
      // 「帶入討論」（本輪起唯一入口，見 T-2807）開啟面板時 FAB 判定
      // 會讀到過期的旗標值，讓 FAB 錯誤地在已開啟的工作台上方殘留，
      // 直接牴觸 spec §7.5 的目標。
      _copilotPanelOpen = true;
      _applyCopilotViewportMode();
      // 【2026-09-16 修正】同理，`panel.dataset.epId`／`blockId` 與
      // `#copilot-panel-title` 也只有 `_openCopilotPanel()` 會設定——
      // 但 T-2807 起本函式是唯一入口，`_openCopilotPanel()` 在正式流程
      // 中從未被呼叫，導致這三者維持初始（空）值。**這是一個會讓
      // `_startCopilotGenerate()`（讀 `panel.dataset.epId`/`blockId`，
      // T-2814）與 `_handleCopilotFabClick()`（讀 `panel.dataset.epId`
      // 判斷是否可重開）雙雙靜默失效的既有 bug**，本次一併補上，不
      // 整段改呼叫 `_openCopilotPanel()`——後者會連帶重置個人化選項、
      // 取消進行中串流等本函式刻意不做的動作（見上方「刻意不含任何
      // 清空」說明），範圍需侷限在僅補這三個賦值。
      panel.dataset.epId = epId || '';
      panel.dataset.blockId = blockId || '';
      const panelTitleEl = document.getElementById('copilot-panel-title');
      if (panelTitleEl) panelTitleEl.textContent = title || '';
    }
    // T-2715：確保專家選單存在（若已建立則為 no-op）。**選單本身不
    // 依附任何特定主題**——切換新段落只覆蓋指示條與 dataset，選單與
    // 目前選取的專家（`_copilotSelectedPersona`）維持不變，符合 spec
    // §7.3「persona 維持」的既有原則。
    _ensureCopilotPersonaMenu();
    // T-2716：確保 Composer 存在，並在「帶入討論」後取得焦點
    // （spec §7.3：點擊後輸入框取得 focus）。
    _ensureCopilotComposer();
    const composerInput = document.getElementById('copilot-composer-input');
    if (composerInput && typeof composerInput.focus === 'function') composerInput.focus();
    // T-2720：確保匯出鍵存在。**新主題段落的 push 已移至上方**
    // （T-2811，隨 isSameTopic 判定一併處理，不在此無條件重複 push）。
    // 空段落（使用者按了「帶入討論」卻從未送出訊息）會在匯出時被濾掉，
    // 見 `_buildCopilotChatExportMarkdown()`。
    _ensureCopilotExportButton();
    // T-2812（spec-028 §7.3 條款 4）：主題切換完成——捲動觸發點之一，
    // 無條件對唯一捲動容器 `#copilot-panel-body` 呼叫平滑捲動至底。
    // **不得依 `scrollTop`／`clientHeight` 判斷是否略過**——ADR-7 的
    // 代價條款只排除「串流逐段寫入」這第三個來源，本觸發點與送出
    // 新訊息兩者皆無條件執行。
    const scrollBody = document.getElementById('copilot-panel-body');
    if (scrollBody && typeof scrollBody.scrollTo === 'function') {
      scrollBody.scrollTo({ top: scrollBody.scrollHeight, behavior: 'smooth' });
    }
  } catch (e) {
    // 開啟失敗不得影響既有導讀卡渲染（比照 _openCopilotPanel 的既有慣例）。
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 「產業全景速覽」收折工具條（T-2813，spec-028 §7.4）
// ═══════════════════════════════════════════════════════════════════════
//
// 把原 T-2504（SPEC-025）常駐的個人化選項（週期／屬性 chip）降級為
// 工作台內的小工具：僅產業主題顯示，預設收折（Q28-C：桌機與手機一致，
// 本節不含任何依視窗寬度分支）。【2026-09-16 更新，T-2814】「立即產出」
// 鈕已接上（`id="copilot-generate-btn"`，沿用既有 `start-copilot-
// generate` 事件委派與 `_applyCopilotGenerateButtonState()` 的額度
// 閘門機制，皆不必新增）；串流與文件卡邏輯見下方「速覽文件卡」小節。

/**
 * 建立工具條的 DOM（若尚未建立），插入 `#copilot-quota-text` 之前——
 * 與舊版 `#copilot-options` 原本的靜態位置相同。只建立一次
 * （`getElementById` 已存在就直接回傳）。展開態內含既有的週期／屬性
 * chip，markup 與 `data-*` 屬性逐字沿用 SPEC-025 版本，`_selectCopilotOption()`／
 * `_syncCopilotOptionVisuals()` 皆用全域 `document.querySelectorAll`
 * 選取、不依賴容器路徑，行為不受插入方式改變影響。
 */
function _ensureCopilotOverviewToolbar() {
  try {
    let toolbar = document.getElementById('copilot-overview-toolbar');
    if (toolbar) return toolbar;
    const quotaEl = document.getElementById('copilot-quota-text');
    if (!quotaEl) return null;
    quotaEl.insertAdjacentHTML('beforebegin', [
      '<div class="copilot-overview-toolbar" id="copilot-overview-toolbar">',
      '<div class="copilot-overview-toolbar-header" id="copilot-overview-toolbar-header" data-action="toggle-overview-toolbar">',
      '<span>⚡ 產業全景速覽</span><span id="copilot-overview-toolbar-arrow">▸</span>',
      '</div>',
      '<div class="copilot-overview-toolbar-body" id="copilot-overview-toolbar-body" hidden>',
      '<div class="copilot-options" id="copilot-options">',
      '<div class="copilot-option-group">',
      '<div class="copilot-option-label">投資週期</div>',
      '<div class="copilot-option-chips">',
      '<button type="button" class="copilot-chip is-selected" data-action="select-copilot-option" data-group="horizon" data-value="swing">波段</button>',
      '<button type="button" class="copilot-chip" data-action="select-copilot-option" data-group="horizon" data-value="scalp">超短線</button>',
      '<button type="button" class="copilot-chip" data-action="select-copilot-option" data-group="horizon" data-value="longterm">長線</button>',
      '</div></div>',
      '<div class="copilot-option-group">',
      '<div class="copilot-option-label">偏好屬性</div>',
      '<div class="copilot-option-chips">',
      '<button type="button" class="copilot-chip is-selected" data-action="select-copilot-option" data-group="style" data-value="steady">穩健</button>',
      '<button type="button" class="copilot-chip" data-action="select-copilot-option" data-group="style" data-value="growth">爆發</button>',
      '<button type="button" class="copilot-chip" data-action="select-copilot-option" data-group="style" data-value="contrarian">逆勢</button>',
      '</div></div>',
      '</div>',
      '<button type="button" class="dd-more-btn" id="copilot-generate-btn-toolbar" data-action="start-copilot-generate">🚀 立即產出</button>',
      '</div>',
      '</div>',
    ].join(''));
    return document.getElementById('copilot-overview-toolbar');
  } catch (e) {
    return null;
  }
}

/**
 * 移除工具條（若存在）——切到個股主題時呼叫（spec §7.4 條款 1：
 * 「若前一主題已建立則自 DOM 移除」，非僅隱藏）。`Element.prototype.remove`
 * 為標準 DOM API；既有測試沙盒的 `fakeEl()` 未提供此方法，呼叫會拋出
 * 例外並被本函式的 try/catch 吞掉——與本檔其餘 UI 函式的既有容錯慣例
 * 一致，不影響其他斷言。
 */
function _removeCopilotOverviewToolbar() {
  try {
    const toolbar = document.getElementById('copilot-overview-toolbar');
    if (toolbar && typeof toolbar.remove === 'function') toolbar.remove();
  } catch (e) {
    // 移除失敗不得往上拋。
  }
}

/**
 * 依 `blockId` 前綴決定工具條的建立／移除（PRD §4.6 不對稱工具列，
 * spec §7.4 條款 1）。**單一判定函式**——SDD §9 擴充預留點：Roadmap P1
 * 個股專屬速覽屆時只需在此加一個分支。
 *
 * @param {string} blockId `industry-N` 或 `target-N`
 */
function _applyOverviewToolbarForTopic(blockId) {
  if (typeof blockId === 'string' && blockId.indexOf('industry-') === 0) {
    _ensureCopilotOverviewToolbar();
  } else {
    _removeCopilotOverviewToolbar();
  }
}

/**
 * 點擊標頭收折／展開工具條（由 `_handleDelegatedClick` 呼叫）。
 */
function _toggleCopilotOverviewToolbar() {
  try {
    const body = document.getElementById('copilot-overview-toolbar-body');
    const arrow = document.getElementById('copilot-overview-toolbar-arrow');
    if (!body) return;
    const wasCollapsed = !!body.hidden;
    body.hidden = !wasCollapsed;
    if (arrow) arrow.textContent = wasCollapsed ? '▾' : '▸';
  } catch (e) {
    // 收折/展開失敗不得往上拋。
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 四專家選單與切換（T-2715，spec-027 §2.3／§7.3）
// ═══════════════════════════════════════════════════════════════════════
//
// **不扣額度、不重置 session_id**（spec §7.3）：本 Task 完全不呼叫任何
// `/api/` 端點，也不觸碰 `_copilotDiscussionContext`——`session_id`
// 要到 T-2716 送出第一則訊息、`mode="anchor"` 成功後才會存在，本 Task
// 只負責「記錄使用者選了哪位專家」與「畫面上顯示出來」，不涉及任何
// 會影響額度或 session 的狀態。

/**
 * enum → 顯示標籤，**逐字對應**附錄 A-3~A-6 的專家角色名稱（見
 * `docs/prd01.md`），避免同一位專家在 Prompt 與畫面上叫不同名字。
 */
const COPILOT_PERSONA_LABELS = {
  sop: '📈 個股操盤特助',
  chain: '🔗 供應鏈情報官',
  bear: '🐻 風險長',
  buffett: '💰 長期價值視角顧問',
};

/** `persona=null`（沿用附錄 A-2 通用底稿）時的顯示標籤。 */
const COPILOT_PERSONA_DEFAULT_LABEL = '🧑‍💼 通用分析師';

/**
 * 目前選取的專家 enum（`null` 代表沿用附錄 A-2 通用底稿）。**獨立於
 * `_copilotDiscussionContext`**——切換段落不會連帶重置這個變數
 * （PRD Non-goal #2：本輪已無「退出主題」動作，僅切換段落一種情境）。
 */
let _copilotSelectedPersona = null;

/** @param {string|null} persona @returns {string} 顯示標籤 */
function _copilotPersonaLabel(persona) {
  return (persona && COPILOT_PERSONA_LABELS[persona]) || COPILOT_PERSONA_DEFAULT_LABEL;
}

/**
 * 建立專家選單的 DOM（若尚未建立），插在上下文指示條之後。比照
 * `_ensureCopilotReportArea()` 的既有慣例：只建立一次，點擊監聽器在
 * 建立當下一併綁定（委派點擊已涵蓋選單項目本身，這裡不需另綁）。
 */
function _ensureCopilotPersonaMenu() {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return null;
    let menu = document.getElementById('copilot-persona-menu');
    if (menu) return menu;
    const optionsHtml = Object.keys(COPILOT_PERSONA_LABELS).map((p) =>
      `<button type="button" data-action="select-copilot-persona" data-persona="${escHtml(p)}" style="display:block;width:100%;text-align:left;padding:8px 12px;font-size:12px;border:none;background:transparent;cursor:pointer;">${escHtml(COPILOT_PERSONA_LABELS[p])}</button>`
    ).join('');
    const html = [
      '<div id="copilot-persona-menu" style="position:relative;margin-bottom:12px;">',
      '<button type="button" id="copilot-persona-trigger" data-action="toggle-persona-menu" aria-haspopup="true" aria-expanded="false" style="display:flex;align-items:center;gap:4px;font-size:12px;border:1px solid #D1D5DB;border-radius:6px;padding:4px 10px;background:#fff;cursor:pointer;">',
      `<span id="copilot-persona-trigger-label">${escHtml(COPILOT_PERSONA_DEFAULT_LABEL)}</span> ▾`,
      '</button>',
      '<div id="copilot-persona-list" hidden style="position:absolute;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #D1D5DB;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:1;min-width:170px;">',
      optionsHtml,
      '</div>',
      '</div>',
    ].join('');
    const indicator = document.getElementById('copilot-context-indicator');
    if (indicator && indicator.insertAdjacentHTML) {
      indicator.insertAdjacentHTML('afterend', html);
    } else {
      body.insertAdjacentHTML('afterbegin', html);
    }
    return document.getElementById('copilot-persona-menu');
  } catch (e) {
    return null;
  }
}

/** 同步觸發鈕的 `aria-expanded` 與選單清單的 `hidden` 狀態一致。 */
function _syncPersonaMenuAria() {
  try {
    const trigger = document.getElementById('copilot-persona-trigger');
    const list = document.getElementById('copilot-persona-list');
    if (trigger && list) trigger.setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
  } catch (e) {
    // 例外不得往上拋。
  }
}

/** 點擊觸發鈕：展開／收合選單清單。 */
function _toggleCopilotPersonaMenu() {
  try {
    const list = document.getElementById('copilot-persona-list');
    if (!list) return;
    list.hidden = !list.hidden;
    _syncPersonaMenuAria();
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 點擊選單外部時收合選單清單。**必須在委派點擊處理的 `data-action`
 * 早退之前呼叫**（見 `_handleDelegatedClick()`）——選單外部的點擊
 * 通常沒有 `data-action`，若放在早退之後就永遠不會被呼叫到。
 *
 * @param {Event} event
 */
function _maybeCollapsePersonaMenu(event) {
  try {
    if (typeof document === 'undefined') return;
    const list = document.getElementById('copilot-persona-list');
    if (!list || list.hidden) return;
    const menu = document.getElementById('copilot-persona-menu');
    if (menu && menu.contains && !menu.contains(event.target)) {
      list.hidden = true;
      _syncPersonaMenuAria();
    }
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 在對話流插入一則置中的系統分隔線（spec §7.3：切換專家時插入，
 * **UI 歷史不清空**）。對話流容器（`#copilot-chat-thread`）本身是
 * T-2717 才會真正渲染氣泡的地方，本 Task 只需要一個空容器可以插入
 * 分隔線——比照 `_ensureCopilotReportArea()` 的既有慣例，只建立一次。
 *
 * @param {string} text 分隔線文字（不含裝飾符號，本函式統一加上）
 */
function _insertCopilotSystemDivider(text) {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return;
    let thread = document.getElementById('copilot-chat-thread');
    if (!thread) {
      body.insertAdjacentHTML('beforeend', '<div id="copilot-chat-thread"></div>');
      thread = document.getElementById('copilot-chat-thread');
    }
    if (!thread || typeof thread.appendChild !== 'function') return;
    const divider = document.createElement('div');
    divider.className = 'copilot-system-divider';
    divider.style.textAlign = 'center';
    divider.style.fontSize = '11px';
    divider.style.color = '#94A3B8';
    divider.style.margin = '10px 0';
    divider.textContent = '── ' + text + ' ──';
    thread.appendChild(divider);
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 點擊選單項目：切換目前選取的專家（T-2715）。**白名單檢查**：四個
 * enum 之外一律不動作，比照 `_selectCopilotOption()` 的既有慣例——
 * 即使 `data-persona` 因故被竄改，也不會讓 `_copilotSelectedPersona`
 * 吐出白名單外的值（後端 `validateBody()` 雖然也會擋，前端這裡先擋
 * 一次，狀態本身永遠合法；**不做 fallback**，不合法值直接不動作，
 * 不是改用預設值，見 Non-scope）。
 *
 * 選同一位專家不重複插入分隔線（純粹收合選單）；換一位才切換文字、
 * 插入分隔線。**不呼叫任何 `/api/` 端點，不觸碰 `_copilotDiscussionContext`**
 * ——不扣額度、不重置 session_id（本 Task 尚無 session_id 概念，交由
 * T-2716 銜接時確認不受本函式影響）。
 *
 * @param {string} persona
 */
function _selectCopilotPersona(persona) {
  try {
    if (!Object.prototype.hasOwnProperty.call(COPILOT_PERSONA_LABELS, persona)) return;
    const list = document.getElementById('copilot-persona-list');
    if (_copilotSelectedPersona === persona) {
      if (list) list.hidden = true;
      _syncPersonaMenuAria();
      return;
    }
    _copilotSelectedPersona = persona;
    const triggerLabel = document.getElementById('copilot-persona-trigger-label');
    if (triggerLabel) triggerLabel.textContent = _copilotPersonaLabel(persona);
    _insertCopilotSystemDivider('已切換至 ' + _copilotPersonaLabel(persona));
    if (list) list.hidden = true;
    _syncPersonaMenuAria();
    // T-2719：若已有錨定的主題，同步更新還原記錄裡的 persona——
    // 避免重整後還原到「切換前」的舊專家。無主題（尚未 anchor）時
    // `_saveCopilotSessionRestore()` 內部的 guard 會安全地不寫入。
    _saveCopilotSessionRestore();
  } catch (e) {
    // 例外不得往上拋。
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Composer 輸入守衛（T-2716，spec-027 §2.3／§7.3）
// ═══════════════════════════════════════════════════════════════════════
//
// **本 Task 完全不呼叫任何 `/api/` 端點**——spec §7.3 明訂「送出後鎖定
// 1 秒」是**時間鎖**（`setTimeout` 1000ms），不是「等待回應才解鎖」，
// 因此送出守衛本身不需要知道網路呼叫何時完成。實際呼叫 `/api/ask`、
// 消費 SSE、渲染對話流氣泡皆是 T-2717 的範圍（Non-scope 明訂），本
// Task 只提供一個銜接點 `_dispatchCopilotComposerMessage()`，目前刻意
// 留空。

const COPILOT_COMPOSER_MAX_LEN = 200;
const COPILOT_COMPOSER_MIN_HEIGHT = 48;
const COPILOT_COMPOSER_MAX_HEIGHT = 120;
const COPILOT_COMPOSER_SEND_LOCK_MS = 1000;

/** 送出鎖旗標，防止 1 秒鎖定期間重複送出（比照 `_copilotAskInflight`
 *  的既有慣例，但本旗標是**時間鎖**而非「等待回應」鎖，見上方檔頭
 *  說明）。 */
let _copilotComposerSending = false;

/**
 * 建立 Composer 的 DOM（若尚未建立），附加在面板第三段容器
 * `#copilot-panel-footer` 最後面（spec-028 §7.2 S-2；**不再插入
 * `#copilot-panel-body`**——後者是唯一的捲動區，Composer 移出使其固定
 * 吸附於面板最底端，不隨訊息捲動位移）。比照 `_ensureCopilotReportArea()`
 * 的既有慣例：只建立一次，輸入監聽器在建立當下一併綁定。
 *
 * **邊界（spec §7.2 條款 6）**：若 `#copilot-panel-footer` 尚不存在
 * （例如面板骨架未完整載入），自行於 `#copilot-panel` 內建立該容器後
 * 再插入 Composer——**不得回落插入 `#copilot-panel-body`**，否則會
 * 重新造成 Composer 隨訊息捲動位移的原始問題。
 *
 * **不做任何字元過濾或清洗**（Q26-C／Non-scope 明訂）：`maxlength`
 * 屬性只限制長度，不改寫或攔截任何字元本身——財經提問中大量出現的
 * 括號、比較符與百分比必須原樣可輸入。
 */
function _ensureCopilotComposer() {
  try {
    let footer = document.getElementById('copilot-panel-footer');
    if (!footer) {
      const panel = document.getElementById('copilot-panel');
      if (!panel) return null;
      panel.insertAdjacentHTML('beforeend', '<div class="copilot-panel-footer" id="copilot-panel-footer"></div>');
      footer = document.getElementById('copilot-panel-footer');
      if (!footer) return null;
    }
    let composer = document.getElementById('copilot-composer');
    if (composer) return composer;
    footer.insertAdjacentHTML('beforeend', [
      '<div id="copilot-composer" style="margin-top:12px;border-top:1px solid #E5E7EB;padding-top:12px;">',
      `<textarea id="copilot-composer-input" maxlength="${COPILOT_COMPOSER_MAX_LEN}" placeholder="輸入你的問題…" style="width:100%;box-sizing:border-box;font-size:13px;padding:8px;border:1px solid #D1D5DB;border-radius:6px;resize:none;height:${COPILOT_COMPOSER_MIN_HEIGHT}px;max-height:${COPILOT_COMPOSER_MAX_HEIGHT}px;overflow-y:auto;"></textarea>`,
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">',
      '<span id="copilot-composer-counter" style="font-size:11px;color:#6B7280;"></span>',
      '<button type="button" id="copilot-composer-submit" data-action="submit-copilot-message" disabled style="border:none;background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:600;padding:7px 16px;border-radius:999px;cursor:pointer;">送出</button>',
      '</div>',
      '</div>',
    ].join(''));
    const input = document.getElementById('copilot-composer-input');
    if (input) {
      input.addEventListener('input', _handleCopilotComposerInput);
      input.addEventListener('keydown', _handleCopilotComposerKeydown);
    }
    _updateCopilotComposerCounter();
    return document.getElementById('copilot-composer');
  } catch (e) {
    return null;
  }
}

/**
 * `Enter`（不含 `Shift`）送出；`Shift+Enter` 為換行，交給瀏覽器原生
 * `textarea` 行為，本函式不介入（spec §7.3）。
 * @param {KeyboardEvent} event
 */
function _handleCopilotComposerKeydown(event) {
  try {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      _submitCopilotComposerMessage();
    }
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 輸入事件：auto-grow（48→120px，超過 120px 改用內部捲動，由 CSS
 * 的 `max-height`／`overflow-y` 負責，本函式只調整 `height`）、更新
 * 字數計數器、更新送出鍵的 `disabled` 狀態。
 */
function _handleCopilotComposerInput() {
  try {
    const input = document.getElementById('copilot-composer-input');
    if (!input) return;
    if (input.style && typeof input.scrollHeight === 'number') {
      // 先收回最小高度再依 scrollHeight 撐開，避免刪字後高度卡住不
      // 縮回。測試沙盒的 textarea 沒有真實 `scrollHeight`（恆為
      // `undefined`），此段在該情境下安全地略過，不影響其餘守衛邏輯。
      input.style.height = COPILOT_COMPOSER_MIN_HEIGHT + 'px';
      const grown = Math.min(COPILOT_COMPOSER_MAX_HEIGHT, Math.max(COPILOT_COMPOSER_MIN_HEIGHT, input.scrollHeight));
      input.style.height = grown + 'px';
    }
    _updateCopilotComposerCounter();
    _applyCopilotComposerSubmitState();
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 更新「已輸入 N / 200」計數器。**達上限（200）時轉紅**（spec §7.3）。
 * 與舊版（T-2606，已隨 T-2713 拆除）不同：本版**恆常顯示**，不是
 * `N ≥ 120` 才出現——新設計沒有這條件，此處刻意不沿用舊版差異化顯示
 * 的理由。
 */
function _updateCopilotComposerCounter() {
  try {
    const input = document.getElementById('copilot-composer-input');
    const counter = document.getElementById('copilot-composer-counter');
    if (!input || !counter) return;
    const len = (input.value || '').length;
    counter.textContent = len + ' / ' + COPILOT_COMPOSER_MAX_LEN;
    counter.style.color = len >= COPILOT_COMPOSER_MAX_LEN ? '#DC2626' : '#6B7280';
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 依「輸入框去除頭尾空白後是否為空」與「是否在 1 秒送出鎖定期間」
 * 設定送出鍵的 `disabled`（spec §7.3：空字串時送出鍵 disabled）。
 */
function _applyCopilotComposerSubmitState() {
  try {
    const input = document.getElementById('copilot-composer-input');
    const submitBtn = document.getElementById('copilot-composer-submit');
    if (!input || !submitBtn) return;
    const trimmedEmpty = (input.value || '').trim().length === 0;
    submitBtn.disabled = trimmedEmpty || _copilotComposerSending;
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 送出目前輸入框內容（點擊送出鍵或按 `Enter` 皆呼叫本函式）。
 *
 * **鎖定期間或內容不合法（空字串／超過 200 字）一律不動作**——後者
 * 理論上不可達（`maxlength` 已由瀏覽器原生鎖住輸入上限），仍保留檢查
 * 作為防禦性複查，比照本檔其餘送出函式的既有慣例。
 *
 * **鎖定 1 秒是純時間鎖**（spec §7.3），不等待任何網路回應——實際呼叫
 * `/api/ask` 由 `_dispatchCopilotComposerMessage()` 銜接，T-2717 落地
 * 前刻意留空（Non-scope：不實作回答渲染）。
 */
function _submitCopilotComposerMessage() {
  try {
    if (_copilotComposerSending) return;
    const input = document.getElementById('copilot-composer-input');
    if (!input) return;
    const text = (input.value || '').trim();
    if (text.length === 0 || text.length > COPILOT_COMPOSER_MAX_LEN) return;

    _copilotComposerSending = true;
    _applyCopilotComposerSubmitState();
    input.value = '';
    _updateCopilotComposerCounter();
    if (input.style) input.style.height = COPILOT_COMPOSER_MIN_HEIGHT + 'px';

    _dispatchCopilotComposerMessage(text);

    setTimeout(() => {
      _copilotComposerSending = false;
      _applyCopilotComposerSubmitState();
    }, COPILOT_COMPOSER_SEND_LOCK_MS);
  } catch (e) {
    _copilotComposerSending = false;
  }
}

/**
 * 送出目前這則訊息：組 request body、呼叫 `POST /api/ask`、消費 SSE
 * 並逐段渲染 AI 氣泡（T-2717，取代 T-2716 留下的空函式）。
 *
 * **mode 判定**：`_copilotDiscussionContext.sessionId` 尚未存在 →
 * `mode="anchor"`（第一輪，會扣 1 次額度）；已存在 → `mode="follow"`
 * （追問，不扣額度）。**anchor 成功後從回應標頭 `X-Session-Id` 讀出
 * session_id 存回 `_copilotDiscussionContext`**（T-2709 的既有設計，
 * 串流回應無法像 JSON 一樣直接夾帶欄位）。
 *
 * @param {string} text 已通過 Composer 守衛檢查的訊息內容（未經任何
 *   字元過濾——Q26-C：字元黑名單擋不住語意層注入，卻會誤殺財經提問
 *   中的括號、比較符與百分比，定界隔離交給後端 `<user_question>` 標籤）
 */
async function _dispatchCopilotComposerMessage(text) {
  try {
    // 理論上不可達：Composer 只在 `_bringIntoDiscussion()` 建立主題後
    // 才會出現，此處仍防禦性檢查，不假設呼叫端一定先設好狀態。
    if (!_copilotDiscussionContext) return;

    // 樂觀渲染使用者自己的問題氣泡，不等回應（spec §7.3：使用者氣泡
    // 靠右）。
    _appendCopilotChatBubble('user', text);
    // T-2812（spec-028 §7.3 條款 4）：送出新訊息——捲動觸發點之二，
    // 無條件對唯一捲動容器 `#copilot-panel-body` 呼叫平滑捲動至底。
    // 置於此處（送出當下）而非等 `_consumeCopilotStream()` 收完，
    // 是因為後者屬於逐段寫入、依 Non-scope 不得觸碰（T-2408／T-2413
    // 凍結區），且 ADR-7 明文串流寫入本身不得觸發捲動。
    const scrollBodyOnSend = document.getElementById('copilot-panel-body');
    if (scrollBodyOnSend && typeof scrollBodyOnSend.scrollTo === 'function') {
      scrollBodyOnSend.scrollTo({ top: scrollBodyOnSend.scrollHeight, behavior: 'smooth' });
    }

    const isFollow = typeof _copilotDiscussionContext.sessionId === 'string' && _copilotDiscussionContext.sessionId.length > 0;
    const fullMessages = _copilotChatMessages.concat([{ role: 'user', content: text }]);
    // T-2718：16KB 滑動視窗，永遠保留最後一則（當前這輪的提問）——
    // 後端仍會獨立再擋一次 16KB 上限（不信任前端的滑動視窗，Non-scope
    // 明訂），這裡只是儘量避免因累積歷史過長而被後端退件。
    const { messages, truncated } = _applyCopilotMessagesSlidingWindow(fullMessages);
    if (truncated) {
      _insertCopilotSystemDivider('已省略較舊的對話內容以符合長度限制');
    }
    const body = {
      ep_id: _copilotDiscussionContext.epId,
      block_id: _copilotDiscussionContext.blockId,
      mode: isFollow ? 'follow' : 'anchor',
      session_id: isFollow ? _copilotDiscussionContext.sessionId : null,
      persona: _copilotSelectedPersona,
      messages: messages,
    };
    const headers = { 'Content-Type': 'application/json' };
    if (typeof _lastIdToken === 'string' && _lastIdToken.length > 0) {
      headers.Authorization = 'Bearer ' + _lastIdToken;
    }

    // AI 氣泡（靠左）先建立、空字串起手——逐段串流累加進這個節點的
    // `textContent`（見下方 `_consumeCopilotStream()` 呼叫）。**不得
    // 以「收齊後一次渲染」代替**（Non-scope 明訂）：本函式從送出到
    // 呼叫 `_consumeCopilotStream()` 之間不做任何緩衝或延遲寫入，
    // 該函式本身在每個 SSE `chunk` 事件到達時立即累加文字。
    const answerEl = _appendCopilotChatBubble('assistant', '');
    const errEl = _ensureCopilotChatErrorArea();

    let res;
    try {
      res = await fetch('/api/ask', { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      // 收到 error 事件時不清空「已經收到的內容」（spec §7.3）——這裡是
      // 連 fetch 都沒送出去成功的情況，答案根本沒開始，不屬於那條保護
      // 範圍：把這個仍是空字串的 AI 氣泡移除（B-034），避免留下一個
      // 永久卡住的空氣泡，再顯示錯誤文字。
      _removeCopilotChatBubbleIfEmpty(answerEl);
      if (errEl) { errEl.hidden = false; errEl.textContent = '追問失敗，本次不扣除額度'; }
      return;
    }
    if (!res.ok || !res.body) {
      // 同上：尚未開始收到任何內容，先移除空氣泡（B-034）。
      // T-2719：follow 收到 403 session_invalid 需要特殊處理（清除
      // 還原記錄、退回全域模式，不得誤判為需要重新錨定），一般錯誤
      // 才沿用既有降級文案對照。
      _removeCopilotChatBubbleIfEmpty(answerEl);
      await _handleCopilotChatHttpError(res, errEl, isFollow);
      return;
    }

    if (!isFollow) {
      const sessionId = res.headers.get('X-Session-Id');
      if (sessionId) {
        _copilotDiscussionContext.sessionId = sessionId;
        _saveCopilotSessionRestore(); // T-2719：anchor 成功才有 session_id 可存
      }
    }
    // 對話歷史在成功送出後才更新——若上面任一步驟提前 return，
    // `_copilotChatMessages` 維持送出前的狀態，避免把「送出失敗的
    // 這一輪」誤植入歷史。
    _copilotChatMessages = messages;

    await _consumeCopilotStream(res.body, answerEl, errEl);
    const answerText = (answerEl && answerEl.textContent) || '';
    _copilotChatMessages = _copilotChatMessages.concat([{ role: 'assistant', content: answerText }]);
    // T-2720：記錄這一問一答到匯出用的完整紀錄（跨主題、跨專家，不
    // 受 16KB 滑動視窗影響——`_copilotChatMessages` 可能已被截斷，
    // 但 `_copilotExportLog` 永遠完整保留）。當前主題必為
    // `_copilotExportLog` 的最後一個元素（`_bringIntoDiscussion()`
    // 開新主題時已推入）。
    const currentTopic = _copilotExportLog[_copilotExportLog.length - 1];
    if (currentTopic) {
      currentTopic.entries.push({ persona: _copilotSelectedPersona, question: text, answer: answerText });
    }
  } catch (e) {
    // 例外不得往上拋，比照本檔其餘送出函式的既有慣例。
  }
}

/**
 * 已送出的對話歷史（`role`／`content` 陣列，逐字比照 `/api/ask` 的
 * `messages` 契約）。**新主題會覆蓋重置**（見 `_bringIntoDiscussion()`），
 * **只存在於本次分頁的記憶體內**——比照 spec §13 ADR-9 的既有原則，
 * 不落地保存，重整頁面後這份歷史自然消失。
 */
let _copilotChatMessages = [];

/** `messages` 陣列序列化後的位元組上限（UTF-8），逐字對應後端
 *  `/api/ask` 的既有上限（見 `functions/api/ask.js` 的
 *  `MESSAGES_MAX_BYTES`）——前端這裡是**不信任自己的粗篩**，後端仍會
 *  獨立再擋一次（T-2718 Non-scope 明訂）。 */
const COPILOT_MESSAGES_MAX_BYTES = 16 * 1024;

/** @param {Array<{role:string,content:string}>} messages @returns {number} */
function _copilotMessagesByteLength(messages) {
  try {
    return new TextEncoder().encode(JSON.stringify(messages)).length;
  } catch (e) {
    return 0;
  }
}

/**
 * 依 16KB 上限裁剪 `messages` 陣列（T-2718，spec §7.3）：**丟棄最舊的
 * 輪次**，**永遠保留最後一則**（當前這輪的提問，不論裁到只剩它一則
 * 也不再繼續丟）。
 *
 * @param {Array<{role:string,content:string}>} messages
 * @returns {{messages: Array<{role:string,content:string}>, truncated: boolean}}
 */
function _applyCopilotMessagesSlidingWindow(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return { messages: messages, truncated: false };
  const working = messages.slice();
  let truncated = false;
  while (working.length > 1 && _copilotMessagesByteLength(working) > COPILOT_MESSAGES_MAX_BYTES) {
    working.shift();
    truncated = true;
  }
  return { messages: working, truncated: truncated };
}

// ═══════════════════════════════════════════════════════════════════════
// 主題 session 跨頁面重整存活（T-2719，Q27-C，spec §14 L-5）
// ═══════════════════════════════════════════════════════════════════════
//
// **V-13 零新增持久化基準線的具名特例**：使用者已於 Q27-C 正式批准打破
// 這條基準線，特許本功能把還原記錄寫進瀏覽器的本機儲存（見
// `docs/prd01.md` 附錄／spec-027 §14 L-5、`tasks/open-questions.md`
// §2.11 的裁決全文）。**驗收方式明訂「恰新增一處持久化命中」**——全檔
// 只在 `_getCopilotLocalStore()` 這一行實際點名該項瀏覽器 API，其餘
// 函式一律透過它取得的參照操作，避免同一個字面詞在多處重複出現而
// 超出核准的命中數。
//
// **只存三項**：`session_id`、`ep_id`／`block_id`（重建指示條標題與供
// 下一次 follow 用）、`persona`——**不存任何對話內文、`sub_hash` 或
// token**（Non-scope 明訂）。
//
// **被動還原**（依使用者 2026-09-14 裁決）：頁面載入時只重建狀態，
// 不自動打開面板。**主題壽命僅 30 分鐘（Q27-A），還原路徑必然會遇到
// 過期情境**——這不是例外分支：session 是否仍有效交給下一次實際送出
// 訊息時，由後端的 `403 session_invalid` 判定並清除本地記錄（見
// `_handleCopilotChatHttpError()`），**不得誤判為需要重新錨定**（那
// 會在使用者無感的情況下吃掉第二次終身額度，不可逆）。
//
// **關閉指示條（✕）不清除還原記錄**（依使用者裁決）：即使使用者當下
// 關閉指示條退回全域模式，重整後仍會嘗試還原上一次的主題——這是刻意
// 的選擇，理由是「關閉指示條」與「這個主題已經不值得討論」不是同一件
// 事，讀者可能只是想暫時瀏覽別的內容，稍後仍想繼續同一個主題。

/** 還原記錄的儲存鍵名。 */
const COPILOT_SESSION_STORAGE_KEY = 'lite_copilot_session';

/**
 * 取得瀏覽器的本機儲存物件，不可用時（無痕模式等情境）回傳 `null`。
 * **全檔唯一一處**實際點名該項瀏覽器 API 的地方——其餘存取一律透過
 * 本函式回傳的參照，滿足 T-2719 驗收方式「恰新增一處持久化命中」。
 */
function _getCopilotLocalStore() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    return null;
  }
}

/**
 * 寫入還原記錄。呼叫時機：①`mode="anchor"` 成功取得 `session_id` 時
 * ②切換專家時（保持記錄與目前選取的專家同步，避免還原後 persona
 * 過期）。**寫入失敗（無痕模式、儲存空間已滿等）不得影響既有功能**
 * ——本 Task 只是「盡量」讓主題撐過重整，寫入失敗頂多回到「重整即
 * 失效」的既有行為，不是新的錯誤狀態。
 */
function _saveCopilotSessionRestore() {
  try {
    const store = _getCopilotLocalStore();
    if (!store) return;
    if (!_copilotDiscussionContext || typeof _copilotDiscussionContext.sessionId !== 'string' || _copilotDiscussionContext.sessionId.length === 0) return;
    const record = {
      sessionId: _copilotDiscussionContext.sessionId,
      epId: _copilotDiscussionContext.epId,
      blockId: _copilotDiscussionContext.blockId,
      title: _copilotDiscussionContext.title,
      persona: _copilotSelectedPersona,
    };
    store.setItem(COPILOT_SESSION_STORAGE_KEY, JSON.stringify(record));
  } catch (e) {
    // 例外不得往上拋，見函式說明。
  }
}

/**
 * 清除還原記錄。呼叫時機：`follow` 收到 `403 session_invalid`（見
 * `_handleCopilotChatHttpError()`）——主題已過期或已回補，本地記錄
 * 留著只會在下次重整時誤導使用者以為還能繼續。
 */
function _clearCopilotSessionRestore() {
  try {
    const store = _getCopilotLocalStore();
    if (!store) return;
    store.removeItem(COPILOT_SESSION_STORAGE_KEY);
  } catch (e) {
    // 例外不得往上拋。
  }
}

/**
 * 頁面載入時嘗試還原上一次的討論主題（`initApp()` 呼叫）。**只重建
 * `_copilotDiscussionContext`／`_copilotSelectedPersona` 與指示條／
 * 選單文字，不主動送出任何請求、不自動打開面板**（依使用者裁決）。
 * 對話內文本來就不持久化，還原後從空歷史開始——讀者下一次送出訊息
 * 會是這個主題的第一則 `mode="follow"`（因為 `session_id` 已存在），
 * 若該 session 其實已過期，屆時由 `403 session_invalid` 的既有分支
 * 處理，不在還原當下猜測。
 *
 * **格式不符、解析失敗、欄位缺失一律安靜放棄**，維持全域模式，不得
 * 往上拋——這是還原機制的正常失敗模式，不是需要向使用者呈現的錯誤。
 */
function _restoreCopilotSessionFromStorage() {
  try {
    const store = _getCopilotLocalStore();
    if (!store) return;
    const raw = store.getItem(COPILOT_SESSION_STORAGE_KEY);
    if (!raw) return;
    const record = JSON.parse(raw);
    if (!record || typeof record.sessionId !== 'string' || record.sessionId.length === 0) return;

    _copilotDiscussionContext = {
      epId: typeof record.epId === 'string' ? record.epId : '',
      blockId: typeof record.blockId === 'string' ? record.blockId : '',
      title: typeof record.title === 'string' ? record.title : '',
      sessionId: record.sessionId,
    };
    _copilotChatMessages = [];
    if (typeof record.persona === 'string' && Object.prototype.hasOwnProperty.call(COPILOT_PERSONA_LABELS, record.persona)) {
      _copilotSelectedPersona = record.persona;
    }
    _updateCopilotContextIndicator();
    const triggerLabel = document.getElementById('copilot-persona-trigger-label');
    if (triggerLabel) triggerLabel.textContent = _copilotPersonaLabel(_copilotSelectedPersona);
  } catch (e) {
    // 例外不得往上拋，見函式說明。
  }
}

/**
 * 在對話流中新增一則使用者或 AI 氣泡（T-2717，spec §7.3：使用者氣泡
 * 靠右、AI 靠左）。**問題文字以 `textContent` 賦值**——使用者輸入
 * 原樣顯示，不經過 `innerHTML`，不會被讀者輸入中的標籤破壞畫面或
 * 造成注入（比照舊版 `_appendCopilotAskEntry()`，已隨 T-2713 拆除的
 * 既有慣例）。
 *
 * @param {"user"|"assistant"} role
 * @param {string} text 初始文字（AI 氣泡通常傳空字串，交給
 *   `_consumeCopilotStream()` 逐段累加）
 * @returns {*} 內層文字節點，供逐段串流以 `textContent +=` 累加；
 *   建立失敗時回傳 `null`
 */
function _appendCopilotChatBubble(role, text) {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return null;
    let thread = document.getElementById('copilot-chat-thread');
    if (!thread) {
      body.insertAdjacentHTML('beforeend', '<div id="copilot-chat-thread"></div>');
      thread = document.getElementById('copilot-chat-thread');
    }
    if (!thread || typeof thread.appendChild !== 'function') return null;

    const bubble = document.createElement('div');
    bubble.className = 'copilot-chat-bubble';
    bubble.style.display = 'flex';
    bubble.style.margin = '8px 0';
    bubble.style.justifyContent = role === 'user' ? 'flex-end' : 'flex-start';

    const inner = document.createElement('div');
    inner.style.maxWidth = '85%';
    inner.style.padding = '8px 12px';
    inner.style.borderRadius = '10px';
    inner.style.fontSize = '13px';
    inner.style.whiteSpace = 'pre-wrap';
    inner.style.background = role === 'user' ? 'var(--accent)' : 'var(--paper-2)';
    inner.style.color = role === 'user' ? '#fff' : '#0F172A';
    inner.textContent = text || '';
    bubble.appendChild(inner);

    if (role === 'assistant') {
      // T-2717：複製筆記按鈕，附掛在 AI 氣泡旁。
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.setAttribute('aria-label', '複製這則筆記');
      copyBtn.style.marginLeft = '4px';
      copyBtn.style.border = 'none';
      copyBtn.style.background = 'transparent';
      copyBtn.style.cursor = 'pointer';
      copyBtn.textContent = '📋';
      copyBtn.addEventListener('click', () => _copyCopilotChatNote(inner));
      bubble.appendChild(copyBtn);
    }

    thread.appendChild(bubble);
    // B-034：留一條回頭路可以移除這個氣泡（見
    // `_removeCopilotChatBubbleIfEmpty()`）——AI 氣泡是樂觀建立、空字串
    // 起手，若後續送出失敗到連一個 chunk 都沒收到，需要把這個空氣泡
    // 清掉，否則會變成一個永久卡住、看起來像「送出後沒有任何回應」的
    // 空氣泡。只是普通物件屬性，不影響原有的 DOM 結構或既有呼叫端。
    inner._copilotBubbleEl = bubble;
    inner._copilotBubbleThread = thread;
    return inner;
  } catch (e) {
    return null;
  }
}

/**
 * B-034（spec-027，2026-09-14 發現）：`_dispatchCopilotComposerMessage()`
 * 樂觀建立的 AI 氣泡若在**開始收到任何內容之前**就失敗（fetch 例外、
 * HTTP 非 200——含 `403 compliance_required`），需要把這個空氣泡移除，
 * 否則使用者看到的是一個永久卡住的空白氣泡，體感等同「送出後沒有任何
 * 回應」。**只在氣泡仍是空字串時才移除**——已經收到部分內容後才失敗
 * 的情形（`_consumeCopilotStream()` 內部的 `error` 事件）屬於 spec
 * §7.3「error 事件時不清空既有內容」的既有保護範圍，本函式完全不觸碰
 * 那條路徑，兩者不衝突。
 *
 * @param {*} el `_appendCopilotChatBubble()` 回傳的內層文字節點
 */
function _removeCopilotChatBubbleIfEmpty(el) {
  try {
    if (!el || (el.textContent && el.textContent.length > 0)) return;
    const wrapper = el._copilotBubbleEl;
    const thread = el._copilotBubbleThread;
    if (!wrapper || !thread) return;
    if (typeof thread.removeChild === 'function') {
      thread.removeChild(wrapper);
    } else if (Array.isArray(thread.children)) {
      // 測試沙盒的假 DOM 沒有真實 `removeChild`（比照本檔其餘函式對
      // 沙盒能力差異的既有降級慣例），直接操作 `children` 陣列。
      const idx = thread.children.indexOf(wrapper);
      if (idx >= 0) thread.children.splice(idx, 1);
    }
  } catch (e) {
    // 例外不得往上拋，比照本檔其餘 UI 操作函式的既有慣例。
  }
}

/**
 * 建立對話流專屬的錯誤顯示區（若尚未建立），插在對話流容器之後。
 * 沿用 `COPILOT_HTTP_ERROR_TEXT`／`COPILOT_GENERIC_ERROR_TEXT` 的既有
 * 降級文案對照（`_handleCopilotGenerateHttpError()`），不新增或修改
 * 任何文案。
 */
function _ensureCopilotChatErrorArea() {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return null;
    let errEl = document.getElementById('copilot-chat-error');
    if (errEl) return errEl;
    body.insertAdjacentHTML('beforeend', '<div id="copilot-chat-error" hidden style="color:#DC2626;font-size:12px;margin-top:8px;"></div>');
    return document.getElementById('copilot-chat-error');
  } catch (e) {
    return null;
  }
}

/**
 * 複製一則 AI 筆記到剪貼簿（spec §7.3）。**權限被拒或 API 不存在時
 * 降級為選取文字並提示**——不是把錯誤吞掉不理，讀者仍能手動
 * `Ctrl+C`。Toast 顯示 2 秒後淡出（`_showCopilotToast()`）。
 *
 * @param {*} noteEl 該則筆記的內層文字節點
 */
async function _copyCopilotChatNote(noteEl) {
  const text = (noteEl && noteEl.textContent) || '';
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('clipboard_unavailable');
    }
    await navigator.clipboard.writeText(text);
    _showCopilotToast('已複製筆記');
  } catch (e) {
    try {
      if (typeof document !== 'undefined' && document.createRange && typeof window !== 'undefined' && window.getSelection && noteEl) {
        const range = document.createRange();
        range.selectNodeContents(noteEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (e2) {
      // 選取失敗不得往上拋——本函式的降級路徑本身也可能在某些沙盒
      // 環境不可用，此時單純顯示提示文字即可。
    }
    _showCopilotToast('已選取文字，請手動複製');
  }
}

/** Toast 的淡出計時器參照，供重複觸發時取消前一個尚未到期的計時器。 */
let _copilotToastTimer = null;

/**
 * 顯示一則 2 秒後自動淡出的 Toast（spec §7.3）。**沒有堆疊機制**——
 * 新的 Toast 直接覆蓋舊的文字與計時器，比照上下文指示條「直接覆蓋、
 * 不堆疊」的既有原則。
 *
 * @param {string} message
 */
function _showCopilotToast(message) {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return;
    let toast = document.getElementById('copilot-toast');
    if (!toast) {
      body.insertAdjacentHTML('beforeend', '<div id="copilot-toast" hidden style="text-align:center;font-size:12px;background:#111827;color:#fff;border-radius:6px;padding:6px 10px;margin-top:8px;"></div>');
      toast = document.getElementById('copilot-toast');
    }
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    if (_copilotToastTimer) clearTimeout(_copilotToastTimer);
    _copilotToastTimer = setTimeout(() => { toast.hidden = true; }, 2000);
  } catch (e) {
    // 例外不得往上拋。
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 匯出 .md（T-2720，spec-027 §2.3／§7.3）
// ═══════════════════════════════════════════════════════════════════════
//
// **匯出範圍為整場對話（跨主題、跨專家），不受 T-2718 的 16KB 滑動
// 視窗影響**——`_copilotChatMessages` 是送給後端的版本，可能已被截斷
// 掉最舊輪次；`_copilotExportLog` 是獨立的完整紀錄，只在成功收到一則
// 回答時才追加，永不因滑動視窗而移除任何內容。**只存在於本次分頁的
// 記憶體內**，不落地保存（Non-scope：不新增檔案下載以外的持久化）。

/**
 * 匯出用的完整對話紀錄，每個元素代表一個主題段落：
 * `{ title: string, entries: Array<{persona: string|null, question: string, answer: string}>,
 * overview: string|null }`。由 `_bringIntoDiscussion()` 在每次錨定新
 * 主題時推入一筆（空段落——使用者按了「帶入討論」卻從未送出訊息、
 * 也未產出速覽——會在匯出時被濾掉，見 `_buildCopilotChatExportMarkdown()`）。
 * `overview`（T-2815）由 `_startCopilotGenerate()` 在速覽串流結束後
 * 寫入當前段落，記錄該主題的速覽全文。
 */
let _copilotExportLog = [];

/**
 * 免責水印文字。**逐字沿用**既有頁尾免責聲明的既有措辭（比照舊版
 * `COPILOT_EXPORT_DISCLAIMER`，已隨 T-2713 拆除的既有慣例），不另立
 * 一套新文案。
 */
const COPILOT_EXPORT_DISCLAIMER = '⚠️ 內容由 AI 自動生成，可能有誤，不構成投資建議，請自行查證判斷，投資風險請自負。';

/**
 * 組出匯出檔案的完整 Markdown 字串（spec §7.3：每個主題前加註標題與
 * 當時的專家名稱）。**濾掉沒有任何問答的空主題段落**——見
 * `_copilotExportLog` 的說明。
 *
 * @returns {string}
 */
function _buildCopilotChatExportMarkdown() {
  const lines = [];
  lines.push(COPILOT_EXPORT_DISCLAIMER);
  lines.push('');

  // T-2815：段落保留條件擴為「有問答」或「有速覽全文」，只看速覽不
  // 提問的主題（PRD 情境 1）也要能匯出，不再只看 entries.length。
  const topics = _copilotExportLog.filter((t) => t && (
    (Array.isArray(t.entries) && t.entries.length > 0) ||
    (typeof t.overview === 'string' && t.overview.length > 0)
  ));
  topics.forEach((topic, topicIndex) => {
    lines.push('## ' + (topic.title || '（未命名主題）'));
    lines.push('');
    if (typeof topic.overview === 'string' && topic.overview.length > 0) {
      lines.push(topic.overview);
      lines.push('');
    }
    topic.entries.forEach((entry) => {
      lines.push('**專家：' + _copilotPersonaLabel(entry.persona) + '**');
      lines.push('');
      lines.push('Q：' + entry.question);
      lines.push('');
      lines.push(entry.answer);
      lines.push('');
    });
    if (topicIndex < topics.length - 1) {
      lines.push('---');
      lines.push('');
    }
  });

  return lines.join('\n');
}

/**
 * 點擊「📥 .md」：組字串、建立 `Blob`、觸發下載、釋放 Object URL。
 *
 * **B-033 回歸**：`Blob` 內容**必須帶 UTF-8 BOM**（`'﻿'` 字元）
 * ——檔案一旦下載落地就只剩位元組，MIME 資訊不隨檔案儲存，檢視器只能
 * 依系統語系猜編碼（繁中環境會猜成 Big5，整份中文變亂碼，本專案已
 * 實測發生過一次）。BOM 是唯一能寫進檔案本身的編碼標記，成本一個
 * 字元。**不要因為「內容本來就是 UTF-8」而拿掉它**。
 */
function _exportCopilotChatTranscript() {
  try {
    const markdown = _buildCopilotChatExportMarkdown();
    const blob = new Blob(['﻿' + markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'copilot-conversation.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    // 匯出失敗不得影響面板其餘功能（比照本檔其餘 UI 操作函式的既有慣例）。
  }
}

/**
 * 建立匯出鍵的 DOM（若尚未建立），插在專家選單之後。比照
 * `_ensureCopilotReportArea()` 的既有慣例：只建立一次。
 */
function _ensureCopilotExportButton() {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return null;
    let btn = document.getElementById('copilot-export-chat-btn');
    if (btn) return btn;
    const html = '<button type="button" id="copilot-export-chat-btn" data-action="export-copilot-chat" style="margin-left:8px;font-size:12px;border:1px solid #D1D5DB;border-radius:6px;padding:4px 10px;background:#fff;cursor:pointer;">📥 .md</button>';
    const menu = document.getElementById('copilot-persona-menu');
    if (menu && menu.insertAdjacentHTML) {
      menu.insertAdjacentHTML('afterend', html);
    } else {
      body.insertAdjacentHTML('afterbegin', html);
    }
    return document.getElementById('copilot-export-chat-btn');
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 串流消費與逐段渲染（T-2505，spec-025 §7.3）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 建立「生成」按鈕與報告區的 DOM（若尚未建立）。節點用 JS 動態插入
 * `#copilot-panel-body`，不是寫死在 index.html——比照 `_renderDeepModal()`
 * 動態填 `dd-col-left` 的既有慣例。只建立一次（`getElementById` 已存在
 * 就直接回傳），避免重複插入。
 *
 * **T-2713：不再插入舊版單輪追問輸入區與匯出鍵**——
 * 那是 SPEC-026 的單輪模型，本輪由多輪多專家對話工作台取代，改為
 * T-2714 之後的 Task 各自建立自己的容器（比照本函式的既有慣例：獨立
 * 子容器，不重新產生整個 body 的 innerHTML）。
 */
function _ensureCopilotReportArea() {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return null;
    let area = document.getElementById('copilot-report-area');
    if (area) return area;
    body.insertAdjacentHTML('beforeend', [
      '<div id="copilot-report-area" style="margin-top:16px;">',
      '<button type="button" class="dd-more-btn" id="copilot-generate-btn" data-action="start-copilot-generate">🚀 開始生成</button>',
      '<div id="copilot-report-text" style="white-space:pre-wrap;font-size:13px;line-height:1.6;margin-top:10px;"></div>',
      '<div id="copilot-report-error" hidden style="color:#DC2626;font-size:12px;margin-top:8px;"></div>',
      '</div>',
    ].join(''));
    return document.getElementById('copilot-report-area');
  } catch (e) {
    return null;
  }
}

/** 生成請求進行中旗標，防止同一份報告被重複觸發（雙擊、或前一份尚未
 * 收完就再按一次）。以布林值而非 Set 記錄——同一時間本檔只會開一個
 * 面板，不需要像 `_deepdiveInflight` 那樣以 key 區分多個並發請求。 */
let _copilotGenerateInflight = false;

/**
 * 速覽文件卡的遞增序號（T-2814，spec-028 §7.3／ADR-3）。同主題重複
 * 產出時，每次呼叫都要是「新增一張新卡」而非覆寫同一張（Scope
 * 明訂），故以遞增序號確保每張卡的內文／錯誤節點 id 皆唯一。
 */
let _copilotOverviewCardSeq = 0;

/**
 * 在對話流（`#copilot-chat-thread`）末端新增一張可收折的速覽文件卡
 * （T-2814）。**取代舊版單一靜態報告區的顯示路徑，但不移除
 * `_ensureCopilotReportArea()` 本身**——該函式與其建立的節點原樣保留
 * （H-8／既有 AC-13 仍依賴其內容在關閉再開啟面板後逐字保存），本函式
 * 只是另外新增一條獨立、平行的路徑，兩者互不讀寫對方的節點。
 *
 * 卡片以 `dataset.epId`／`dataset.blockId` 記錄產出當時的值（逐字
 * 保留，不隨之後切換主題而更新），標頭顯示產出當時的主題標題。
 * 標題與其餘動態文字一律以 `textContent` 賦值（比照
 * `_appendCopilotChatBubble()` 的既有慣例），不經過 `innerHTML`。
 *
 * @param {string} epId
 * @param {string} blockId
 * @param {string} title 產出當時的主題標題（來自 `#copilot-panel-title`）
 * @returns {{textEl:*, errEl:*}|null} 供 `_consumeCopilotStream()`／
 *   `_handleCopilotGenerateHttpError()` 原樣使用的內文與錯誤節點；
 *   建立失敗時回傳 `null`
 */
function _appendCopilotOverviewCard(epId, blockId, title) {
  try {
    const body = document.getElementById('copilot-panel-body');
    if (!body) return null;
    let thread = document.getElementById('copilot-chat-thread');
    if (!thread) {
      body.insertAdjacentHTML('beforeend', '<div id="copilot-chat-thread"></div>');
      thread = document.getElementById('copilot-chat-thread');
    }
    if (!thread || typeof thread.appendChild !== 'function') return null;

    _copilotOverviewCardSeq += 1;
    const bodyId = 'copilot-overview-card-body-' + _copilotOverviewCardSeq;
    const arrowId = 'copilot-overview-card-arrow-' + _copilotOverviewCardSeq;

    const card = document.createElement('div');
    card.className = 'copilot-overview-card';
    if (card.dataset) {
      card.dataset.epId = epId || '';
      card.dataset.blockId = blockId || '';
    }
    card.style.margin = '8px 0';
    card.style.border = '1px solid #E2E8F0';
    card.style.borderRadius = '8px';

    const header = document.createElement('div');
    header.setAttribute('data-action', 'toggle-overview-card');
    if (header.dataset) {
      header.dataset.bodyId = bodyId;
      header.dataset.arrowId = arrowId;
    }
    header.style.cursor = 'pointer';
    header.style.padding = '8px 10px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = '⚡ ' + (title || '');
    const arrowSpan = document.createElement('span');
    arrowSpan.id = arrowId;
    arrowSpan.textContent = '▾';
    header.appendChild(titleSpan);
    header.appendChild(arrowSpan);

    const cardBody = document.createElement('div');
    cardBody.id = bodyId;
    cardBody.style.padding = '0 10px 10px';

    const textEl = document.createElement('div');
    textEl.style.whiteSpace = 'pre-wrap';
    textEl.style.fontSize = '13px';
    textEl.style.lineHeight = '1.6';

    const errEl = document.createElement('div');
    errEl.hidden = true;
    errEl.style.color = '#DC2626';
    errEl.style.fontSize = '12px';
    errEl.style.marginTop = '8px';

    cardBody.appendChild(textEl);
    cardBody.appendChild(errEl);
    card.appendChild(header);
    card.appendChild(cardBody);
    thread.appendChild(card);

    return { textEl: textEl, errEl: errEl };
  } catch (e) {
    return null;
  }
}

/**
 * 點擊速覽文件卡標頭收折／展開（T-2814，比照
 * `_toggleCopilotOverviewToolbar()` 的既有慣例，由 `_handleDelegatedClick`
 * 呼叫）。
 *
 * @param {string} bodyId
 * @param {string} arrowId
 */
function _toggleCopilotOverviewCard(bodyId, arrowId) {
  try {
    const cardBody = document.getElementById(bodyId);
    const arrow = document.getElementById(arrowId);
    if (!cardBody) return;
    const wasVisible = !cardBody.hidden;
    cardBody.hidden = wasVisible;
    if (arrow) arrow.textContent = wasVisible ? '▸' : '▾';
  } catch (e) {
    // 收折/展開失敗不得往上拋。
  }
}

/**
 * 點擊「立即產出」：組 request body（**恰四個鍵**，PRD 4.7-②／SDD §3.3
 * 明訂前端只送 enum）並呼叫 `POST /api/generate`，以 `fetch` +
 * `ReadableStream` 消費 SSE（**不得用瀏覽器內建的 SSE 客戶端 API**——
 * 該 API 只能發 `GET` 且無法帶 `Authorization` 標頭，這裡走不通，見
 * spec §7.3）。
 *
 * **T-2814 起，每次點擊都在對話流新增一張獨立的速覽文件卡**
 * （`_appendCopilotOverviewCard()`），串流內容寫入該卡專屬的內文／
 * 錯誤節點，取代舊版讀寫 `#copilot-report-text`／`#copilot-report-error`
 * 的路徑；同主題重複產出因此各自新增新卡，不覆寫前一張。
 *
 * **非 200 的初次回應**（§7.6 完整降級文案表，T-2507）交給
 * `_handleCopilotGenerateHttpError()` 處理；本函式的 try/finally
 * 仍保證按鈕最終會恢復可點擊狀態。
 */
async function _startCopilotGenerate() {
  // 這三項提前守衛**刻意留在 try/finally 之外**：若在 finally 裡無條件
  // 把 `_copilotGenerateInflight` 重設為 false，「已有一份在進行中，
  // 這次點擊直接不動作」這個分支也會跑到 finally，反而把正在進行的
  // 那一份的旗標錯誤清掉——等於雙擊防護形同虛設。只有真正把旗標設為
  // true 的那條路徑，才需要對應的 finally 收尾。
  const panel = document.getElementById('copilot-panel');
  if (!panel) return;
  const epId = panel.dataset && panel.dataset.epId;
  const blockId = panel.dataset && panel.dataset.blockId;
  if (!epId || !blockId) return;
  if (_copilotGenerateInflight) return;
  _copilotGenerateInflight = true;

  try {
    const btn = document.getElementById('copilot-generate-btn');
    const toolbarBtn = document.getElementById('copilot-generate-btn-toolbar');
    if (btn) btn.disabled = true;
    if (toolbarBtn) toolbarBtn.disabled = true;

    const titleEl = document.getElementById('copilot-panel-title');
    const title = (titleEl && titleEl.textContent) || '';
    const card = _appendCopilotOverviewCard(epId, blockId, title);
    if (!card) return;
    const textEl = card.textEl;
    const errEl = card.errEl;

    const selection = _getCopilotSelection();
    const body = { ep_id: epId, block_id: blockId, horizon: selection.horizon, style: selection.style };
    const headers = { 'Content-Type': 'application/json' };
    if (typeof _lastIdToken === 'string' && _lastIdToken.length > 0) {
      headers.Authorization = 'Bearer ' + _lastIdToken;
    }

    let res;
    try {
      res = await fetch('/api/generate', { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      if (errEl) { errEl.hidden = false; errEl.textContent = '生成失敗，本次不扣除額度'; }
      return;
    }
    if (!res.ok || !res.body) {
      await _handleCopilotGenerateHttpError(res, errEl);
      return;
    }
    await _consumeCopilotStream(res.body, textEl, errEl);
    // T-2815：速覽串流結束後，把全文寫入當前主題段落的 overview，供
    // 匯出使用。比照 _submitCopilotComposerMessage() 記錄 entries 的
    // 既有慣例：當前主題必為 _copilotExportLog 的最後一個元素
    // （_bringIntoDiscussion() 開新主題時已推入），無條件記錄（不論
    // 串流末段是否曾經 error，畫面上顯示什麼就匯出什麼）。
    const currentTopic = _copilotExportLog[_copilotExportLog.length - 1];
    if (currentTopic) currentTopic.overview = textEl ? textEl.textContent : '';
  } catch (e) {
    // 呼叫端（_handleDelegatedClick）刻意不 await 本函式，任何未預期
    // 例外都不得變成未處理的 promise rejection——比照本檔其餘 fire-
    // and-forget 函式（如 _fetchCopilotConfig()）的既有慣例。
  } finally {
    _copilotGenerateInflight = false;
    // T-2506：**不寫死 disabled = false**——改交給
    // _applyCopilotGenerateButtonState()（依 _copilotQuotaExhausted 決定，
    // 該函式與其依賴的模組層變數皆在本檔稍後宣告，函式宣告會被提升，
    // 呼叫時機是使用者點擊之後，模組早已完整載入，故無次序疑慮）。
    // 寫死 false 的話，額度用盡後跑完一次生成會把「用盡」的生成鍵意外
    // 重新點亮，這是本 Task 實作期間發現並修正的真實 bug（詳見回報）。
    _applyCopilotGenerateButtonState();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// §7.6 降級文案全表（T-2507）
// ═══════════════════════════════════════════════════════════════════════

/**
 * `POST /api/generate` 非 200 回應的文案對照（spec §7.6，**逐字**，
 * Non-scope 明訂不得改字）。鍵為 `"<status> <error>"`，值為要顯示的
 * 文字；`compliance_required` 不在這個對照表——它是另一條分支（觸發
 * 既有合規彈窗，不顯示錯誤文字），見 `_handleCopilotGenerateHttpError()`。
 */
const COPILOT_HTTP_ERROR_TEXT = {
  '403 quota_exhausted': '你的 3 次免費體驗已用完',
  '503 global_circuit_open': '今日免費研究配額已滿，明日 00:00 重新開放',
  '503 upstream_quota_exhausted': '今日免費研究配額已滿，明日 00:00 重新開放',
  '502 upstream_failed': '生成失敗，本次不扣除額度',
  '503 feature_disabled': '生成失敗，本次不扣除額度', // 理論上不可達（§7.1 閘門），仍列出防禦
  '403 tier2_disabled': '此主題深化整理中，敬請期待',
};

/**
 * 通用降級文案（spec §7.6）：`400`／`404`／`410`／`422` 明訂使用本文案，
 * 且須以 `data-error-code` 保留原始錯誤字串。
 *
 * **本函式額外把任何未列在 `COPILOT_HTTP_ERROR_TEXT`、也非
 * `compliance_required` 的錯誤一併歸入這個通用分支**——例如後端的
 * `403 not_industry_block`（DoD-8 的第二道防線，前端 T-2502 已擋過
 * 一次，理論上很少觸發）不在 spec §7.6 表列的任何一條。這是本 Task
 * 的解讀而非 spec 字面規定：§7.6 開頭明文「全部都是產品狀態，不得是
 * 空白或錯誤頁」，故未列舉的錯誤碼寧可落在「此則內容目前無法生成」
 * 這個語意最接近的通用分支，也不留白——如實記錄於回報供覆核。
 */
const COPILOT_GENERIC_ERROR_TEXT = '此則內容目前無法生成';

/**
 * 處理 `POST /api/generate` 的非 200 回應（T-2507，spec §7.6）。
 *
 * `403 compliance_required` 是唯一的例外分支：觸發既有合規彈窗
 * （T-2311），**不另顯示任何錯誤文字**（spec 明訂）。
 *
 * @param {Response} res
 * @param {*} errEl `#copilot-report-error` 節點
 */
async function _handleCopilotGenerateHttpError(res, errEl) {
  let errorCode = '';
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') errorCode = data.error;
  } catch (e) {
    // 解析失敗，errorCode 維持空字串，落到下方的通用分支。
  }

  if (res.status === 403 && errorCode === 'compliance_required') {
    _openComplianceModal();
    return;
  }

  const key = res.status + ' ' + errorCode;
  const mapped = COPILOT_HTTP_ERROR_TEXT[key];
  if (!errEl) return;
  errEl.hidden = false;
  if (typeof mapped === 'string') {
    errEl.textContent = mapped;
    // 清掉可能殘留自上一次「通用分支」嘗試的 data-error-code——這次是
    // 明確列舉的錯誤，不該留著舊的錯誤碼誤導讀者或線上除錯的人。
    if (errEl.dataset) delete errEl.dataset.errorCode;
  } else {
    errEl.textContent = COPILOT_GENERIC_ERROR_TEXT;
    errEl.dataset.errorCode = errorCode;
  }
}

/**
 * 處理 `POST /api/ask` 的非 200 回應（T-2717／T-2719）。邏輯與
 * `_handleCopilotGenerateHttpError()` 大致相同，但**不能直接重用**
 * ——`Response.json()` 只能讀一次，本函式需要在判斷是否為
 * `session_invalid` 之前先讀出 body，若呼叫既有函式會讓 body 被
 * 讀第二次而丟出例外。
 *
 * **T-2719 新增分支**：`mode="follow"` 收到 `403 session_invalid`
 * （主題已過期或已回補）——**清除本地還原記錄、退回全域模式，
 * 不得誤判為需要重新錨定**（那會在使用者無感的情況下吃掉第二次
 * 終身額度，不可逆）。這是全新錯誤情境，沒有既有文案可沿用，故
 * 新增一句最小、事實陳述的提示文字。
 *
 * @param {Response} res
 * @param {*} errEl 對話流專屬的錯誤節點（`#copilot-chat-error`）
 * @param {boolean} isFollow 本次請求是否為 `mode="follow"`
 */
async function _handleCopilotChatHttpError(res, errEl, isFollow) {
  let errorCode = '';
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') errorCode = data.error;
  } catch (e) {
    // 解析失敗，errorCode 維持空字串，落到下方的通用分支。
  }

  if (res.status === 403 && errorCode === 'compliance_required') {
    _openComplianceModal();
    return;
  }

  if (isFollow && res.status === 403 && errorCode === 'session_invalid') {
    _clearCopilotSessionRestore();
    _copilotDiscussionContext = null;
    _updateCopilotContextIndicator();
    if (errEl) { errEl.hidden = false; errEl.textContent = '這個主題已逾時失效，請重新點擊「帶入討論」開始新的討論'; }
    return;
  }

  const key = res.status + ' ' + errorCode;
  const mapped = COPILOT_HTTP_ERROR_TEXT[key];
  if (!errEl) return;
  errEl.hidden = false;
  if (typeof mapped === 'string') {
    errEl.textContent = mapped;
    if (errEl.dataset) delete errEl.dataset.errorCode;
  } else {
    errEl.textContent = COPILOT_GENERIC_ERROR_TEXT;
    if (errEl.dataset) errEl.dataset.errorCode = errorCode;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 串流讀取器管理（T-2505，spec-025 §7.3）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 目前串流讀取器的參照，供 `_closeCopilotPanel()`／重新開啟面板時
 * 取消尚未完成的讀取——避免上一則遲到的內容混進新開啟的面板（兩者
 * 共用同一組 `#copilot-report-text` 等 DOM 節點，不是各自獨立的實例）。
 */
let _copilotStreamReader = null;

/**
 * 取消目前進行中的串流讀取（若有）。呼叫 `.cancel()` 會讓對應的
 * `reader.read()` 提前結束，`_consumeCopilotStream()` 的迴圈隨之退出
 * ——不會再有更多 `chunk` 寫進舊的 DOM 節點。重複呼叫或本來就沒有
 * 進行中的讀取皆安全（no-op）。
 */
function _cancelCopilotStream() {
  if (_copilotStreamReader) {
    try { _copilotStreamReader.cancel(); } catch (e) {
      // 取消失敗不影響後續操作（面板即將關閉或重新開啟，狀態本來就要
      // 被覆蓋）。
    }
    _copilotStreamReader = null;
  }
}

/**
 * 消費 `/api/generate` 的 SSE 串流（事件契約見 spec-024 §7.7.1，已於
 * 2026-09-09 以真實上游驗證，見 tasks/inventory.md T-2410）。
 *
 * **`TextDecoder` 單一實例、跨 chunk 共用且帶 `{ stream: true }`**——
 * T-2408 的既有教訓：每塊各自 new 一個 decoder 會在多位元組字元的切點
 * 產生亂碼，本函式沿用該修正手法。
 *
 * **逐段渲染是本 Task 的核心承諾（模組 0 先到）**：每收到一個 `chunk`
 * 就立刻把 `text` 接到 `textEl`，不等迴圈跑完、不等 `done`。
 *
 * **`error` 事件不清空 `textEl`**（Non-scope 明訂）——只顯示失敗文案，
 * 已顯示的內容原樣保留。
 */
async function _consumeCopilotStream(bodyStream, textEl, errEl) {
  const reader = bodyStream.getReader();
  _copilotStreamReader = reader;
  const decoder = new TextDecoder();
  let buffer = '';
  try {
  for (;;) {
    let result;
    try {
      result = await reader.read();
    } catch (e) {
      if (errEl) { errEl.hidden = false; errEl.textContent = '生成失敗，本次不扣除額度'; }
      return;
    }
    buffer += result.done ? decoder.decode() : decoder.decode(result.value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const evMatch = block.match(/^event: (.*)$/m);
      if (!evMatch) continue;
      const ev = evMatch[1];
      const dataMatch = block.match(/^data: (.*)$/m);
      let data = {};
      try { data = dataMatch ? JSON.parse(dataMatch[1]) : {}; } catch (e) { data = {}; }

      if (ev === 'chunk') {
        if (textEl && typeof data.text === 'string') textEl.textContent += data.text;
      } else if (ev === 'done') {
        _refreshCopilotQuota();
      } else if (ev === 'error') {
        if (errEl) { errEl.hidden = false; errEl.textContent = '生成失敗，本次不扣除額度'; }
        // 不動 textEl——見函式說明。
      }
    }
    if (result.done) return;
  }
  } finally {
    // 不論正常收完、error 事件、讀取例外、或被 _cancelCopilotStream()
    // 取消，皆須清掉參照——避免指向一個已經不會再被讀的舊 reader。
    if (_copilotStreamReader === reader) _copilotStreamReader = null;
  }
}

/**
 * 目前是否已達額度上限（T-2506）。模組層狀態，供
 * `_applyCopilotGenerateButtonState()` 判斷生成鍵該不該恢復可點擊——
 * 額度是**會員層級**、不是單一則的狀態，換一則開啟或一次生成結束都
 * 不能無條件把它忘掉。
 */
let _copilotQuotaExhausted = false;

/**
 * 依 `_copilotQuotaExhausted` 決定生成鍵的 `disabled`。**這是生成鍵
 * disabled 狀態的唯一真實來源**——T-2505 的 `_startCopilotGenerate()`
 * 完成後（無論成功、error、或例外）改呼叫本函式，而不是直接寫死
 * `disabled = false`：若寫死 false，額度用盡後跑完一次生成（或訪客
 * 觸發了一次註定失敗的呼叫）反而會把「用盡」的生成鍵意外重新點亮。
 */
function _applyCopilotGenerateButtonState() {
  const btn = document.getElementById('copilot-generate-btn');
  if (btn) btn.disabled = _copilotQuotaExhausted;
  // T-2814：工具條版「立即產出」鈕（見 _ensureCopilotOverviewToolbar()）
  // id 不同於舊版靜態區的 #copilot-generate-btn，須各自套用同一狀態，
  // 避免舊區與工具條各自獨立、其中一個忘了同步用盡狀態。
  const toolbarBtn = document.getElementById('copilot-generate-btn-toolbar');
  if (toolbarBtn) toolbarBtn.disabled = _copilotQuotaExhausted;
}

/**
 * 查詢 `GET /api/me` 並更新剩餘次數顯示與生成鍵的 `disabled` 狀態
 * （T-2506，spec §7.4）。
 *
 * **呼叫時機有兩處**：面板開啟時（`_openCopilotPanel()`，本 Task
 * 新增，滿足「面板常駐顯示剩餘次數」）與收到 `done` 事件時
 * （`_consumeCopilotStream()`，T-2505 已接好呼叫點——**該 Task 的
 * Non-scope「不做 done 事件後的重查」指的是呼叫時機的 wiring，不是
 * 這裡的渲染邏輯**，本 Task 補完的正是這裡）。
 *
 * **未登入（`_lastIdToken` 為 `null`）→ 不顯示**（Scope 明訂）：隱藏
 * 節點、不呼叫任何 API。查詢失敗（網路、非 200、欄位缺失）一律隱藏，
 * 不猜測狀態——但**不改動 `_copilotQuotaExhausted`**，避免一次網路
 * 抖動就把「已知用盡」的生成鍵意外重新點亮。
 */
async function _refreshCopilotQuota() {
  const quotaEl = document.getElementById('copilot-quota-text');
  if (typeof _lastIdToken !== 'string' || _lastIdToken.length === 0) {
    if (quotaEl) quotaEl.hidden = true;
    return;
  }
  try {
    const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + _lastIdToken } });
    if (!res.ok) { if (quotaEl) quotaEl.hidden = true; return; }
    const data = await res.json();
    if (typeof data.quota_limit !== 'number' || typeof data.used_quota !== 'number') {
      if (quotaEl) quotaEl.hidden = true;
      return;
    }
    const remaining = data.quota_limit - data.used_quota;
    _copilotQuotaExhausted = remaining <= 0;
    if (quotaEl) {
      quotaEl.hidden = false;
      if (_copilotQuotaExhausted) {
        // PRD 4.4／spec §7.4 逐字：固定寫「3 次」，不隨 quota_limit 樣板化
        // ——這是產品文案的既有慣例，不是本 Task 引入的巧合。
        quotaEl.textContent = '你的 3 次免費體驗已用完';
        quotaEl.classList.add('is-exhausted');
      } else {
        quotaEl.textContent = '剩餘 ' + remaining + '/' + data.quota_limit + ' 次';
        quotaEl.classList.remove('is-exhausted');
      }
    }
    _applyCopilotGenerateButtonState();
    _applyDiscussButtonState(); // T-2714：額度用盡連帶停用「帶入討論」按鈕
  } catch (e) {
    if (quotaEl) quotaEl.hidden = true;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 個人化選項（T-2504，spec-025 §7.2）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 與 `functions/api/generate.js` 的 VALID_HORIZONS／VALID_STYLES 白名單
 * 值一致（spec-024 §7.4）——前端這裡重複宣告一份是刻意的：兩邊位於
 * 不同執行環境（靜態資產 vs Pages Functions），無法共用常數，值必須
 * 手動保持一致（比照 _COPILOT_CONFIG_DEFAULT 的既有慣例）。
 */
const COPILOT_VALID_HORIZONS = new Set(['swing', 'scalp', 'longterm']);
const COPILOT_VALID_STYLES = new Set(['steady', 'growth', 'contrarian']);

/**
 * 面板個人化選項的目前選取狀態。**只存 enum**（Non-scope 明訂「不得把
 * 中文顯示文字混進選取狀態」）——顯示文字只在 chip 的 HTML／textContent
 * 裡出現，這個物件永遠只有兩個 enum 值。預設值（波段／穩健）須與
 * lite/index.html 內 chip 的 `is-selected` 初始 class 手動保持一致。
 */
let _copilotSelection = { horizon: 'swing', style: 'steady' };

/**
 * 讀取目前選取的兩個 enum 值，供 T-2505 組 `POST /api/generate` 的
 * request body 用。**回傳新物件**（防禦性複製）——呼叫端拿到的是快照，
 * 修改它不會反過來影響本檔內部狀態。
 */
function _getCopilotSelection() {
  return { horizon: _copilotSelection.horizon, style: _copilotSelection.style };
}

/**
 * 重置選取狀態為預設值。在 `_openCopilotPanel()` 內呼叫——每次開啟
 * （不論是開一則新的產業動態，或重新開啟同一則）都從預設值開始，
 * 避免上一次的選取殘留到本次，讀者看到的視覺狀態才會跟實際送出的
 * enum 一致。
 */
function _resetCopilotSelection() {
  _copilotSelection = { horizon: 'swing', style: 'steady' };
  _syncCopilotOptionVisuals();
}

/**
 * 點擊個人化選項 chip 的處理邏輯（由 `_handleDelegatedClick` 呼叫）。
 *
 * **白名單檢查**：`group`／`value` 不合法一律不動作——這是本 Task 自己
 * 的輸入面防線，不依賴 chip 的 `data-*` 值可信：即使某個 chip 的
 * `data-value` 因故被竄改，也不會讓 `_getCopilotSelection()` 吐出白
 * 名單外的值（後端 `validateBody()` 雖然也會擋，但前端這裡先擋一次，
 * 狀態本身永遠合法）。
 */
function _selectCopilotOption(group, value) {
  if (group === 'horizon' && COPILOT_VALID_HORIZONS.has(value)) {
    _copilotSelection.horizon = value;
  } else if (group === 'style' && COPILOT_VALID_STYLES.has(value)) {
    _copilotSelection.style = value;
  } else {
    return;
  }
  _syncCopilotOptionVisuals();
}

/**
 * 同步所有 chip 的 `.is-selected` 視覺樣式與 `_copilotSelection` 一致。
 *
 * **純視覺，失敗不得影響狀態本身**：`_selectCopilotOption()`／
 * `_resetCopilotSelection()` 對 `_copilotSelection` 的賦值在呼叫本函式
 * 之前就已完成，即使這裡的 DOM 查詢在某些環境下不可用（例如測試沙盒
 * 的 `querySelectorAll` 是空實作），`_getCopilotSelection()` 仍會吐出
 * 正確的值——這也是為何本 Task 的驗收方式可以只測狀態、不需要真實
 * DOM 就能驗證核心行為。
 */
function _syncCopilotOptionVisuals() {
  try {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.copilot-chip').forEach((el) => {
      const group = el.dataset && el.dataset.group;
      const value = el.dataset && el.dataset.value;
      const selected =
        group === 'horizon' ? _copilotSelection.horizon === value :
        group === 'style' ? _copilotSelection.style === value : false;
      if (!el.classList) return;
      if (selected) el.classList.add('is-selected');
      else el.classList.remove('is-selected');
    });
  } catch (e) {
    // 視覺同步失敗不得影響狀態本身（見函式說明），故此處吞掉例外。
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 手機斷點：懸浮鈕與全螢幕呈現（T-2512，spec-025 §7.5 手機部分）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 斷點數值：**沿用 T-1101（spec-011 §7.1）既有的雙欄斷點 900px**，不是
 * 本 Task 新發明的數字——該斷點已把 `<900px` 定義為單欄（窄螢幕）版面，
 * 這裡延用同一條分界線區分「手機」與「桌機」，避免專案內出現兩套語意
 * 不同的斷點。900px 本身（`min-width: 900px` 語意）算桌機，故此處用
 * 嚴格小於比較。
 */
const COPILOT_MOBILE_BREAKPOINT = 900;

function _isMobileViewport() {
  return typeof window !== 'undefined' && typeof window.innerWidth === 'number'
    && window.innerWidth < COPILOT_MOBILE_BREAKPOINT;
}

/**
 * 依斷點與旗標決定懸浮鈕（`#copilot-fab`）的顯示狀態，以及面板是否套用
 * 手機端底部抽屜（86vh）呈現（T-2713，spec-027 §2.3；取代 SPEC-025
 * 舊版的全螢幕呈現）。
 *
 * **懸浮鈕的顯示條件是「手機寬度」且「`generation_enabled === true`」
 * 兩者皆成立**——後者不是驗收方式明訂的條件，是本 Task 額外追加的一致
 * 性防線：若只看斷點，github.io（Q25-A 裁決長期維運、`generation_enabled`
 * 恆為 `false`）的手機訪客會看到一顆點了沒反應的按鈕。詳見回報「發現
 * 事項」。
 *
 * 呼叫時機：`initApp()` 內初始化一次、`_fetchCopilotConfig()` resolve
 * 後再呼叫一次（旗標可能剛確定）、`resize` 事件時再呼叫（比照桌機／
 * 手機切換的即時性）。
 */
function _applyCopilotViewportMode() {
  try {
    if (typeof document === 'undefined') return;
    const fab = document.getElementById('copilot-fab');
    const panel = document.getElementById('copilot-panel');
    const mobile = _isMobileViewport();
    const generationEnabled = !!(_copilotConfig && _copilotConfig.generation_enabled === true);
    // spec-028 §7.5：面板已開啟時 FAB 一律隱藏，杜絕遮擋已開啟的工作台
    // 內容（ADR-4：以顯示條件達成，不得改動堆疊層級）。
    if (fab) fab.hidden = !(mobile && generationEnabled && !_copilotPanelOpen);
    if (panel) {
      if (mobile) panel.classList.add('copilot-panel-mobile-drawer');
      else panel.classList.remove('copilot-panel-mobile-drawer');
    }
  } catch (e) {
    // 例外一律不影響既有渲染（比照本檔其餘 UI 初始化函式）。
  }
}

/**
 * 懸浮鈕點擊：**只在面板此前已被開過（`panel.dataset.epId` 非空）時才
 * 重新開啟**，否則不動作——比照 T-2502「點擊後暫時無反應」的既有慣例，
 * 不無中生有指定一則產業動態（懸浮鈕本身沒有 `data-ep-id`，也不該有：
 * 它代表的是「回到我剛剛在看的那份」，不是入口本身）。
 */
function _handleCopilotFabClick() {
  try {
    const panel = document.getElementById('copilot-panel');
    if (!panel || !panel.dataset || !panel.dataset.epId) return;
    const titleEl = document.getElementById('copilot-panel-title');
    _openCopilotPanel(panel.dataset.epId, panel.dataset.blockId, titleEl ? titleEl.textContent : '');
  } catch (e) {
    // 同上，不得往上拋。
  }
}

/**
 * 綁定懸浮鈕的 click 監聽器並套用初始斷點狀態。於 `initApp()` 呼叫，
 * 比照 `_initCopilotPanel()` 的既有慣例。
 */
function _initCopilotViewportMode() {
  const fab = document.getElementById('copilot-fab');
  if (fab) fab.addEventListener('click', _handleCopilotFabClick);
  _applyCopilotViewportMode();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', _applyCopilotViewportMode);
  }
}

// T-2211（SPEC-022 §7.6）：Google 登入的初始化閘門。
//
// 純函式，不讀取任何全域狀態，只依傳入的 config 判斷——供測試直接
// 提取驗證（比照 _fetchCopilotConfig 的抽取方式），不需啟動任何伺服器
// 或載入真實 GIS SDK。
//
// 回傳 true 的唯一條件：config.google_client_id 是非空字串。這與
// functions/api/config.js 的 resolveClientId() 刻意對齊——後端未設定
// 時回 null，前端收到 null 或整個請求失敗（降級為預設值、無此鍵）都
// 一律視為「不啟用」，不區分兩種情境（皆導向同一個安全的結果：不顯示
// 登入入口）。
function _shouldEnableGoogleLogin(config) {
  return !!(config && typeof config.google_client_id === 'string' && config.google_client_id.length > 0);
}

/**
 * 依閘門結果決定是否初始化 GIS SDK。
 *
 * **只做初始化判斷，不渲染任何登入按鈕、不呼叫 /api/session、不做
 * 登出**（T-2211 Non-scope；上述皆屬 T-2212）。callback 目前是本輪
 * 刻意留空的佔位函式，真正的登入回呼邏輯由 T-2212 補上。
 *
 * 容錯設計：GIS SDK 載入失敗（離線、被擋、CSP 誤設）時
 * `window.google` 不存在，此處必須偵測並直接放棄，不得拋出——本函式
 * 是 `_fetchCopilotConfig().then(...)` 的串接對象，若在此拋出會變成
 * 未處理的 promise rejection，且會讓「GIS 失敗不得影響既有功能」
 * 這條 Scope 承諾破功。
 */
function _maybeInitGoogleLogin(config) {
  try {
    if (!_shouldEnableGoogleLogin(config)) return;
    if (typeof window === 'undefined' || !window.google || !window.google.accounts || !window.google.accounts.id) {
      return;
    }
    window.google.accounts.id.initialize({
      client_id: config.google_client_id,
      callback: _handleGoogleCredentialResponse,
    });
    const container = document.getElementById('google-login-container');
    if (container) {
      window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'medium' });
      container.style.display = '';
    }
  } catch (e) {
    // GIS SDK 初始化失敗不得影響既有功能（Scope 明訂），亦不得往上拋。
  }
}

/**
 * 綁定登出按鈕的 click 監聽器。抽成獨立函式並在 initApp() 內呼叫——
 * 比照 initHomeNav()／initDeepDiveModal() 的既有慣例：所有初始化集中
 * 在 initApp() 一次完成，不額外掛第二個 DOMContentLoaded 監聽器
 * （本檔已有的唯一一個在檔尾負責啟動 initApp() 本身）。按鈕本輪一定
 * 存在於 DOM（T-2212 已直接寫入 index.html，非動態產生），仍做
 * null 檢查以防萬一。
 */
function _initGoogleLogoutButton() {
  const logoutButton = document.getElementById('google-logout-button');
  if (logoutButton) logoutButton.addEventListener('click', _handleGoogleLogout);
}

/**
 * 解碼 ID Token 的 payload 段，僅供前端顯示用，不做任何簽章驗證——
 * 真正的身分驗證發生在後端的 POST /api/session（T-2207／T-2209）。
 * 前端這裡拿到的欄位只用來畫姓名與頭像（PRD 4.1-A），不做任何安全
 * 判斷；即使有人竄改它，最多只是顯示錯的名字，不影響 /api/session
 * 的驗簽結果。
 *
 * 解析失敗一律回傳 null，不得拋出。
 */
function _decodeIdTokenPayloadForDisplay(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

/** 記憶體中的登入顯示狀態（姓名／頭像）。永不寫入任何持久儲存。 */
let _googleUserDisplay = null;

/**
 * GIS 登入成功的回呼：呼叫後端驗證，通過才顯示使用者資訊。
 *
 * 後端驗證失敗（非 200）視為未登入（Scope 明訂）——不顯示任何使用者
 * 資訊，登入容器維持可見以便重試。整個函式不得拋出，網路失敗、後端
 * 500、JSON 壞掉都只能導致「維持未登入」，不能讓例外往上冒到 GIS
 * SDK 的呼叫端。
 */
async function _handleGoogleCredentialResponse(response) {
  try {
    const idToken = response && response.credential;
    if (typeof idToken !== 'string' || idToken.length === 0) return;

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + idToken },
    });
    if (!res.ok) return;

    const payload = _decodeIdTokenPayloadForDisplay(idToken);
    if (!payload) return;

    _googleUserDisplay = {
      name: typeof payload.name === 'string' ? payload.name : '',
      picture: typeof payload.picture === 'string' ? payload.picture : '',
    };
    _renderGoogleUserInfo();

    // T-2311（SPEC-023 §7.6）：登入成功後查詢合規狀態，未同意者強制彈窗。
    // 記住這次登入的 idToken，供彈窗內的 POST /api/compliance 使用——
    // 不落盤，只存在這個閉包能存取的模組層變數（見下方 _lastIdToken）。
    _lastIdToken = idToken;
    await _maybeShowComplianceModal(idToken);
  } catch (e) {
    // 任何失敗一律維持未登入狀態，不拋出（見函式說明）。
  }
}

/** 最近一次登入成功的 ID Token，僅供合規彈窗送出同意時使用。記憶體變數，永不落盤。 */
let _lastIdToken = null;

/**
 * 查詢 `GET /api/me`，`compliance_agreed === false` 時強制彈出合規彈窗
 * （spec §7.6）。任何查詢失敗（網路、非 200、JSON 壞掉）一律不彈窗——
 * 與 `_handleGoogleCredentialResponse` 同一套「失敗就維持現狀，不拋出」
 * 的容錯原則；彈窗要求的是「已同意」這個正向事實，查不到就不假設。
 */
async function _maybeShowComplianceModal(idToken) {
  try {
    const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + idToken } });
    if (!res.ok) return;
    const body = await res.json();
    if (body && body.compliance_agreed === false) {
      _openComplianceModal();
    }
  } catch (e) {
    // 查詢失敗不彈窗（見函式說明），不拋出。
  }
}

function _openComplianceModal() {
  const overlay = document.getElementById('compliance-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function _closeComplianceModal() {
  const overlay = document.getElementById('compliance-overlay');
  if (overlay) overlay.style.display = 'none';
}

/**
 * 綁定合規彈窗的勾選框與送出鍵。勾選框控制送出鍵的 disabled 狀態
 * （spec §7.6：「須勾選核取方塊才能按下同意鍵」）；送出呼叫
 * `POST /api/compliance`，成功才關閉彈窗，失敗維持開啟並顯示錯誤、
 * 允許重試（**不得靜默關閉**，spec 明訂）。
 */
function _initComplianceModal() {
  const checkbox = document.getElementById('compliance-checkbox');
  const submitButton = document.getElementById('compliance-submit');
  const errorEl = document.getElementById('compliance-error');
  if (!checkbox || !submitButton) return;

  checkbox.addEventListener('change', () => {
    submitButton.disabled = !checkbox.checked;
  });

  submitButton.addEventListener('click', async () => {
    if (!checkbox.checked || typeof _lastIdToken !== 'string') return;
    if (errorEl) errorEl.style.display = 'none';
    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + _lastIdToken },
      });
      if (!res.ok) {
        if (errorEl) errorEl.style.display = '';
        return;
      }
      _closeComplianceModal();
    } catch (e) {
      if (errorEl) errorEl.style.display = '';
    }
  });
}

/** 依 _googleUserDisplay 目前的值切換登入容器／使用者資訊的顯示。 */
function _renderGoogleUserInfo() {
  const loginContainer = document.getElementById('google-login-container');
  const userInfo = document.getElementById('google-user-info');
  const nameEl = document.getElementById('google-user-name');
  const avatarEl = document.getElementById('google-user-avatar');
  if (!userInfo || !nameEl || !avatarEl) return;

  if (_googleUserDisplay) {
    nameEl.textContent = _googleUserDisplay.name;
    avatarEl.src = _googleUserDisplay.picture;
    userInfo.style.display = 'flex';
    if (loginContainer) loginContainer.style.display = 'none';
  } else {
    userInfo.style.display = 'none';
    if (loginContainer) loginContainer.style.display = '';
  }
}

/**
 * 登出：清除記憶體狀態並呼叫 GIS 的 disableAutoSelect()（Scope 明訂）。
 * 不清除任何持久儲存——本來就沒寫過（Non-scope），這裡沒有東西可清。
 */
function _handleGoogleLogout() {
  _googleUserDisplay = null;
  try {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch (e) {
    // 忽略——登出動作本身（清除記憶體狀態）已完成，SDK 呼叫失敗不影響它。
  }
  _renderGoogleUserInfo();
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
      ${tags.length ? `<div class="dd-field"><div class="dd-fh">標籤</div><div class="dd-tags">${tags.map(t => `<span class="dd-tag">${escHtml(t)}</span>`).join('')}</div></div>` : ''}
      ${ctx.現況 ? `<div class="dd-field"><div class="dd-fh">現況</div><div class="dd-prose">${escHtml(ctx.現況)}</div></div>` : ''}
      ${ctx.機制 ? `<div class="dd-field"><div class="dd-fh">機制</div><div class="dd-prose">${escHtml(ctx.機制)}</div></div>` : ''}
      <div class="dd-divider"></div>
      ${orig.主持人態度 ? `<div class="dd-field"><div class="dd-fh">${escHtml(_labelFor('主持人態度', '主持人態度'))}</div><div class="dd-box-host">${escHtml(orig.主持人態度)}</div></div>` : ''}
      ${orig.短線風險 ? `<div class="dd-field"><div class="dd-fh">${escHtml(_labelFor('短線風險', '短線風險'))}</div><div class="dd-warn-box">${escHtml(orig.短線風險)}</div></div>` : ''}
      ${orig.中期觀察 ? `<div class="dd-field"><div class="dd-fh">${escHtml(_labelFor('中期觀察', '中期觀察'))}</div><div class="dd-box-trend">${escHtml(orig.中期觀察)}</div></div>` : ''}
      ${orig.收斂 ? `<div><div class="dd-fh">💡 收斂</div><div class="dd-hl-box">${escHtml(orig.收斂)}</div></div>` : ''}
    `;
  } else if (blockType === '新聞事件') {
    inner = `
      ${orig.事件 ? `<div class="dd-field"><div class="dd-fh">事件</div><div class="dd-prose">${escHtml(orig.事件)}</div></div>` : ''}
      ${orig.觀點 ? `<div><div class="dd-fh">觀點</div><div class="dd-prose">${escHtml(orig.觀點)}</div></div>` : ''}
    `;
  } else if (blockType === '標的觀點') {
    inner = `
      <div class="dd-name">${escHtml(orig.標的 || '')}</div>
      ${orig.分類 ? `<div class="dd-sub">${escHtml(orig.分類)}</div>` : ''}
      <div class="dd-divider"></div>
      ${orig.立場依據 ? `<div class="dd-field"><div class="dd-fh">立場依據</div><div class="dd-prose">${escHtml(orig.立場依據)}</div></div>` : ''}
      ${orig.論述 ? `<div><div class="dd-fh">論述</div><div class="dd-prose">${escHtml(orig.論述)}</div></div>` : ''}
    `;
  } else if (blockType === 'QA心法') {
    const pts = _asArray(orig.要點).map(p => {
      p = _asObject(p);
      return `<li><strong>${escHtml(p.標題 || '')}</strong>${p.內容 ? `<div>${escHtml(p.內容)}</div>` : ''}</li>`;
    }).join('');
    inner = `
      ${orig.問題 ? `<div class="dd-q">Q：${escHtml(orig.問題)}</div>` : ''}
      ${pts ? `<ul class="dd-list">${pts}</ul>` : ''}
      ${orig.結論 ? `<div class="dd-hl-box" style="margin-top:16px;">${escHtml(orig.結論)}</div>` : ''}
    `;
  } else if (blockType === 'company') {
    inner = `
      <div class="dd-name">${escHtml(orig.canonical || '')} <span class="dd-src-mono">${escHtml(orig.ticker || '')}</span></div>
      ${orig.via ? `<div class="dd-sub">本集提及：「${escHtml(orig.via)}」</div>` : ''}
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
    ${tc.before ? `<div class="dd-tsec dd-tsec-dim"><div class="dd-tsec-head">前文</div><div class="dd-tsec-text">${escHtml(tc.before)}</div></div><div class="dd-tsep"></div>` : ''}
    <div class="dd-tsec dd-tsec-matched"><div class="dd-tsec-head">▶ 原文段落</div><div class="dd-tsec-text">${escHtml(tc.matched || '（無逐字稿資料）')}</div></div>
    ${tc.after ? `<div class="dd-tsep"></div><div class="dd-tsec dd-tsec-dim"><div class="dd-tsec-head">後文</div><div class="dd-tsec-text">${escHtml(tc.after)}</div></div>` : ''}
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
        `<div class="dd-region"><span>${escHtml(region)}</span>${_asArray(val[region]).map(c => escHtml(c)).join('、')}</div>`
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
    html += `<div class="dd-af"><div class="dd-afh">追蹤變數</div><div class="dd-afb dd-pre">${escHtml(content['追蹤變數'])}</div></div>`;
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
    html += `<div class="dd-af"><div class="dd-afh">主要對手</div><div class="dd-afb dd-pre">${escHtml(content['主要對手'])}</div></div>`;
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
  return `<div class="dd-af"><div class="dd-afh">${escHtml(label)}</div><div class="dd-afb dd-pre">${escHtml(value)}</div></div>`;
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
      ${blockType === '產業動態' || blockType === '標的觀點' ? _discussButtonHtml(epId, block.block_id, title) : ''}
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
    `<div class="dd-empty">目前尚無深入解讀資料</div>`;
}
