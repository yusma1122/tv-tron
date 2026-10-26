/* Utilitas bersama untuk admin.html dan display.html */
(function () {
  'use strict';
  var cfg = window.PPDS_CONFIG || null;
  var P = (window.PPDS = {});
  P.cfg = cfg;

  var placeholder = /YOUR_|your-project/i;
  P.configured = !!(
    cfg && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !placeholder.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY) &&
    window.supabase && window.supabase.createClient
  );
  P.bucket = (cfg && cfg.STORAGE_BUCKET) || 'signage-media';
  P.sb = P.configured
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  /* ---------- DOM helper (selalu memakai textContent: aman dari XSS) ---------- */
  P.h = function (tag, props) {
    var e = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) return add(c);
        e.append(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return e;
  };

  /* ---------- Tanggal & waktu (waktu perangkat) ---------- */
  P.pad = function (n) { return String(n).padStart(2, '0'); };
  P.todayStr = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + P.pad(d.getMonth() + 1) + '-' + P.pad(d.getDate());
  };
  P.dt = function (dateStr, timeStr) {
    var a = dateStr.split('-').map(Number);
    var t = (timeStr || '00:00:00').split(':').map(Number);
    return new Date(a[0], a[1] - 1, a[2], t[0] || 0, t[1] || 0, t[2] || 0);
  };
  P.fmtTime = function (t) { return t ? String(t).slice(0, 5) : ''; };
  P.fmtDate = function (s, opts) {
    if (!s) return '';
    return P.dt(s).toLocaleDateString('id-ID', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  P.fmtDateTime = function (iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  P.toLocalInput = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return P.todayStr(d) + 'T' + P.pad(d.getHours()) + ':' + P.pad(d.getMinutes());
  };
  P.fromLocalInput = function (v) { return v ? new Date(v).toISOString() : null; };

  /* ---------- Media ---------- */
  P.publicUrl = function (path) {
    return P.sb.storage.from(P.bucket).getPublicUrl(path).data.publicUrl;
  };
  P.mediaUrl = function (row) {
    if (row.storage_path) return P.publicUrl(row.storage_path);
    if (row.external_url && /^https?:\/\//i.test(row.external_url)) return row.external_url;
    return null;
  };
  /* Mengenali jenis tautan video: YouTube, Google Drive, atau file langsung */
  P.parseVideo = function (url) {
    if (!url) return null;
    var m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/i);
    if (m) return { kind: 'youtube', id: m[1] };
    m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)/i);
    if (m) return { kind: 'drive', id: m[1] };
    if (/^https?:\/\//i.test(url)) return { kind: 'file', url: url };
    return null;
  };
})();
