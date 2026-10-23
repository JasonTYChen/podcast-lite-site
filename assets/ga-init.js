// ga-init.js — GA4 頁面瀏覽統計的初始化（T-2003，SPEC-020 §7.1）。
//
// 原本以 inline <script> 寫在 index.html，但 CSP 的 script-src 未含
// 'unsafe-inline'，瀏覽器會直接擋掉該段 inline script：gtag.js 雖然載入，
// config 卻從未執行，GA4 實際上收不到任何 page_view（2026-10-21 線上實測
// 主控台出現 CSP 違規訊息）。改為同源檔案即可通過 script-src 'self'，
// 不需要為此放寬 CSP。
//
// 只送 page_view（gtag 預設行為），不得傳送任何可回推使用者身分的資訊或
// 分類標籤（附錄 D 第 5 條的對外承諾）。Measurement ID 集中於此單一位置。
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-HSYX2JN6EN');
