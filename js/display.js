/* Halaman display TV: pengambilan data, cache, playlist, transisi, fullscreen */
(function () {
  'use strict';
  var P = window.PPDS, h = P.h;
  var $ = function (s) { return document.querySelector(s); };
  var stage = $('#stage'), slidesEl = $('#slides'), progressBar = $('#progress span');

  var CACHE_KEY = 'ppds_signage_cache_v1';
  var DEFAULT_SETTINGS = {
    institution_name: 'PPDS Obstetri dan Ginekologi FKIK ULM–RSUD Ulin', logo_url: null,
    slide_duration_seconds: 15, refresh_interval_seconds: 60, footer_text: '', theme: 'light'
  };
  var state = {
    settings: DEFAULT_SETTINGS, playlist: [],
    data: { schedules: [], announcements: [], events: [], media: [] },
    lastUpdate: null, failing: false, hasData: false
  };
  var queue = [], qi = 0, current = null, timer = null, started = false, failStreak = 0;

  /* ---------- Skala kanvas 1920x1080 ---------- */
  function fit() {
    stage.style.setProperty('--s', Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
  }
  window.addEventListener('resize', fit); fit();

  /* ---------- Jam ---------- */
  function tick() {
    var n = new Date();
    $('#clock').textContent = P.pad(n.getHours()) + ':' + P.pad(n.getMinutes()) + ':' + P.pad(n.getSeconds());
    $('#date').textContent = n.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  tick(); setInterval(tick, 1000);

  /* ---------- Pengaturan & status ---------- */
  function applySettings() {
    var s = state.settings;
    $('#instName').textContent = s.institution_name || DEFAULT_SETTINGS.institution_name;
    $('#footerText').textContent = s.footer_text || '';
    var logo = $('#logo');
    var src = s.logo_url && /^https?:\/\//i.test(s.logo_url) ? s.logo_url : 'assets/logo-placeholder.svg';
    if (logo.getAttribute('src') !== src) logo.setAttribute('src', src);
    logo.onerror = function () { logo.onerror = null; logo.setAttribute('src', 'assets/logo-placeholder.svg'); };
    document.body.classList.toggle('theme-dark', s.theme === 'dark');
  }
  function renderStatus() {
    var conn = $('#conn'), txt = $('#connText'), cls = 'conn ', msg;
    if (!navigator.onLine) { cls += 'warn'; msg = 'Offline — menampilkan data tersimpan'; }
    else if (state.failing) { cls += state.hasData ? 'warn' : 'err'; msg = 'Server tidak dapat dihubungi — mencoba kembali'; }
    else if (state.lastUpdate) { cls += 'ok'; msg = 'Terhubung'; }
    else { msg = 'Menghubungkan…'; }
    conn.className = cls; txt.textContent = msg;
    $('#lastUpdate').textContent = 'Pembaruan terakhir: ' + (state.lastUpdate
      ? new Date(state.lastUpdate).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—');
  }

  /* ---------- Cache lokal ---------- */
  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        settings: state.settings, playlist: state.playlist, data: state.data, ts: state.lastUpdate
      }));
    } catch (e) { /* abaikan */ }
  }
  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || !c.data || !c.playlist) return false;
      state.settings = Object.assign({}, DEFAULT_SETTINGS, c.settings || {});
      state.playlist = c.playlist; state.data = c.data; state.lastUpdate = c.ts || null; state.hasData = true;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- Pengambilan data ---------- */
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Waktu habis')); }, ms); })]);
  }
  function fetchAll() {
    var sb = P.sb, y = P.todayStr(new Date(Date.now() - 864e5));
    return withTimeout(Promise.all([
      sb.from('signage_settings').select('*').order('updated_at', { ascending: false }).limit(1),
      sb.from('signage_playlist').select('*').eq('is_enabled', true).order('sort_order'),
      sb.from('schedules').select('*').eq('is_published', true).gte('event_date', y).order('event_date').order('start_time').limit(200),
      sb.from('announcements').select('*').eq('is_published', true).order('publish_at', { ascending: false }).limit(100),
      sb.from('events').select('*').eq('is_published', true).gte('event_date', y).order('event_date').order('start_time', { nullsFirst: true }).limit(100),
      sb.from('media').select('*').eq('is_published', true).order('sort_order').limit(200)
    ]), 20000).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      return r.map(function (x) { return x.data; });
    });
  }
  function refresh() {
    return fetchAll().then(function (r) {
      state.settings = Object.assign({}, DEFAULT_SETTINGS, r[0][0] || {});
      state.playlist = r[1];
      state.data = { schedules: r[2], announcements: r[3], events: r[4], media: r[5] };
      state.lastUpdate = Date.now(); state.failing = false; state.hasData = true;
      applySettings(); saveCache();
    }).catch(function (e) {
      console.warn('Gagal memuat data:', e && e.message);
      state.failing = true;
    }).then(function () {
      renderStatus();
      if (!started && state.hasData) { started = true; advance(); }
      else if (!started && state.failing) showStatic(messageSlide('Tidak dapat terhubung ke server', 'Mencoba kembali secara otomatis…'));
      var wait = state.failing ? Math.min(state.settings.refresh_interval_seconds, 15) : state.settings.refresh_interval_seconds;
      setTimeout(refresh, wait * 1000);
    });
  }
  window.addEventListener('online', function () { renderStatus(); });
  window.addEventListener('offline', renderStatus);

  /* ---------- Komponen slide ---------- */
  function frame(cls, title, sub) {
    var body = h('div', { class: 'slide-body' });
    var el = h('section', { class: 'slide ' + cls },
      h('div', { class: 'slide-head' }, h('h1', { text: title }), sub ? h('p', { text: sub }) : null), body);
    return { el: el, body: body };
  }
  function messageSlide(title, text) {
    return {
      duration: 10, noProgress: true, render: function () {
        var logo = $('#logo').getAttribute('src');
        return h('section', { class: 'slide msg' }, h('img', { src: logo, alt: '' }),
          h('h1', { text: title }), text ? h('p', { text: text }) : null);
      }
    };
  }
  function emptySlide() {
    return messageSlide(state.settings.institution_name || 'PPDS Digital Signage', 'Belum ada konten yang ditayangkan.');
  }
  function paginate(n, per, max) { return Math.min(Math.ceil(n / per), max || 99); }

  /* ---------- Jadwal hari ini ---------- */
  function scheduleRows(now) {
    var today = P.todayStr(now);
    return state.data.schedules.filter(function (r) { return r.event_date === today; })
      .sort(function (a, b) { return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0; });
  }
  function buildSchedule(item, dur) {
    var pages = paginate(scheduleRows(new Date()).length, 5, 4), out = [];
    for (var p = 0; p < pages; p++) (function (p) {
      out.push({ duration: dur, render: function () {
        var now = new Date(), rows = scheduleRows(now), slice = rows.slice(p * 5, p * 5 + 5);
        if (!slice.length) return null;
        var nextIdx = rows.findIndex(function (r) { return P.dt(r.event_date, r.start_time) > now; });
        var f = frame('sched', item.title || 'Jadwal Hari Ini',
          P.fmtDate(P.todayStr(now), { weekday: 'long', day: 'numeric', month: 'long' }) + (pages > 1 ? '  ·  ' + (p + 1) + '/' + pages : ''));
        slice.forEach(function (r, i) {
          var st = P.dt(r.event_date, r.start_time), en = P.dt(r.event_date, r.end_time), cls, label;
          if (now >= st && now <= en) { cls = 'live'; label = '● Sedang Berlangsung'; }
          else if (now > en) { cls = 'done'; label = 'Selesai'; }
          else if (p * 5 + i === nextIdx) { cls = 'next'; label = 'Berikutnya'; }
          else { cls = ''; label = 'Akan Datang'; }
          f.body.append(h('div', { class: 'row ' + cls },
            h('div', { class: 'time', text: P.fmtTime(r.start_time) + ' – ' + P.fmtTime(r.end_time) }),
            h('div', null, h('div', { class: 't', text: r.title }), r.location ? h('div', { class: 'loc', text: '📍 ' + r.location }) : null),
            h('div', { class: 'badge', text: label })));
        });
        return f.el;
      } });
    })(p);
    return out;
  }

  /* ---------- Pengumuman & informasi akademik ---------- */
  function annRows(academic) {
    var now = Date.now();
    return state.data.announcements.filter(function (a) {
      if ((a.category === 'Akademik') !== academic) return false;
      return !a.expires_at || new Date(a.expires_at).getTime() > now;
    }).sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
      return new Date(b.publish_at) - new Date(a.publish_at);
    }).slice(0, 8);
  }
  function annSlide(a, title, dur) {
    return { duration: dur, render: function () {
      var f = frame('ann', title, null), len = (a.content || '').length;
      var fs = len > 700 ? 30 : len > 450 ? 34 : len > 250 ? 40 : 48;
      var meta = 'Dipublikasikan ' + P.fmtDate(P.todayStr(new Date(a.publish_at))) +
        (a.expires_at ? ' · Berlaku hingga ' + P.fmtDate(P.todayStr(new Date(a.expires_at))) : '');
      var content = h('div', { class: 'content', text: a.content || '' });
      content.style.fontSize = fs + 'px';
      f.body.append(h('div', { class: 'card ' + (a.priority === 'high' ? 'high' : '') },
        h('div', { class: 'chips' }, a.priority === 'high' ? h('span', { class: 'chip high', text: '⚑ PENTING' }) : null,
          h('span', { class: 'chip', text: a.category })),
        h('h2', { text: a.title }), content, h('div', { class: 'meta', text: meta })));
      return f.el;
    } };
  }
  function buildAnn(academic) {
    return function (item, dur) {
      var def = academic ? 'Informasi Akademik' : 'Pengumuman Terbaru';
      return annRows(academic).map(function (a) { return annSlide(a, item.title || def, dur); });
    };
  }

  /* ---------- Agenda mendatang ---------- */
  var UPCOMING_DAYS = 14; // jadwal kegiatan H+1 s.d. H+7 ikut tampil di slide Agenda
  function eventRows(now) {
    var today = P.todayStr(now);
    var limit = P.todayStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_DAYS));
    var manual = state.data.events.filter(function (e) {
      return P.dt(e.event_date, e.end_time || e.start_time ? (e.end_time || e.start_time) : '23:59:59') >= now;
    });
    // Jadwal kegiatan yang tanggalnya setelah hari ini (hari ini sudah tampil di slide Jadwal).
    // Dilewati jika agenda manual dengan judul & tanggal sama sudah ada, agar tidak ganda.
    var fromSchedules = state.data.schedules.filter(function (s) {
      if (s.event_date <= today || s.event_date > limit) return false;
      return !manual.some(function (e) {
        return e.event_date === s.event_date && (e.title || '').trim().toLowerCase() === (s.title || '').trim().toLowerCase();
      });
    }).map(function (s) {
      return { title: s.title, description: s.description, event_date: s.event_date,
               start_time: s.start_time, end_time: s.end_time, location: s.location };
    });
    return manual.concat(fromSchedules).sort(function (a, b) {
      return P.dt(a.event_date, a.start_time) - P.dt(b.event_date, b.start_time);
    });
  }
  function buildEvents(item, dur) {
    var pages = paginate(eventRows(new Date()).length, 4, 2), out = [];
    for (var p = 0; p < pages; p++) (function (p) {
      out.push({ duration: dur, render: function () {
        var now = new Date(), slice = eventRows(now).slice(p * 4, p * 4 + 4);
        if (!slice.length) return null;
        var f = frame('events', item.title || 'Agenda Mendatang', pages > 1 ? (p + 1) + '/' + pages : null);
        slice.forEach(function (e) {
        var d = P.dt(e.event_date), isToday = e.event_date === P.todayStr(now);
        var isTomorrow = e.event_date === P.todayStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
        var time = e.start_time ? P.fmtTime(e.start_time) + (e.end_time ? ' – ' + P.fmtTime(e.end_time) : '') : 'Sepanjang hari';
        f.body.append(h('div', { class: 'ev' + (isToday ? ' today' : '') + (isTomorrow ? ' tomorrow' : '') },
          h('div', { class: 'date' }, h('small', { text: d.toLocaleDateString('id-ID', { weekday: 'short' }) }),
            h('b', { text: String(d.getDate()) }), h('span', { text: d.toLocaleDateString('id-ID', { month: 'short' }) })),
          h('div', null, h('div', { class: 't', text: e.title }), e.description ? h('div', { class: 'd', text: e.description }) : null),
          h('div', { class: 'side' },
            isTomorrow ? h('div', null, h('span', { class: 'ev-tag', text: 'BESOK' })) : null,
            h('b', { text: time }), e.location ? '📍 ' + e.location : '')));
      });
        return f.el;
      } });
    })(p);
    return out;
  }

  /* ---------- Dokumentasi ---------- */
  function buildGallery(item, dur) {
    return state.data.media.filter(function (m) { return m.media_type === 'image' && P.mediaUrl(m); }).map(function (m) {
      return { duration: dur, render: function () {
        var url = P.mediaUrl(m);
        var bg = h('div', { class: 'bg' }); bg.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
        var el = h('section', { class: 'slide full gallery' }, bg, h('img', { class: 'photo', src: url, alt: m.title }),
          h('div', { class: 'tag', text: item.title || 'Dokumentasi Kegiatan' }),
          h('div', { class: 'caption' }, h('h2', { text: m.title }), m.description ? h('p', { text: m.description }) : null,
            m.event_date ? h('small', { text: P.fmtDate(m.event_date, { day: 'numeric', month: 'long', year: 'numeric' }) }) : null));
        el.querySelector('img.photo').addEventListener('error', function () { el.dispatchEvent(new Event('slidefail')); });
        return el;
      } };
    });
  }

  /* ---------- Slideshow (gambar saja, tanpa teks) ---------- */
function buildSlideshow(item, dur) {
  return state.data.media.filter(function (m) { return m.media_type === 'slideshow' && P.mediaUrl(m); }).map(function (m) {
    return { duration: dur, render: function () {
      var url = P.mediaUrl(m);
      var bg = h('div', { class: 'bg' }); bg.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
      var el = h('section', { class: 'slide full gallery' }, bg,
        h('img', { class: 'photo', src: url, alt: m.title }),
        m.show_title !== false ? h('div', { class: 'caption' }, h('h2', { text: m.title })) : null);
      el.querySelector('img.photo').addEventListener('error', function () { el.dispatchEvent(new Event('slidefail')); });
      return el;
    } };
  });
}

  /* ---------- Video ---------- */
  function buildVideo(item, dur) {
    return state.data.media.filter(function (m) { return m.media_type === 'video' && P.mediaUrl(m); }).map(function (m) {
      return { duration: m.duration_seconds || 900, noProgress: !m.duration_seconds, video: true, render: function () {
        var url = P.mediaUrl(m);
        var v = h('video', { src: url, playsinline: true, preload: 'auto' });
        v.muted = false;
        var el = h('section', { class: 'slide full vid' }, v,
          h('div', { class: 'tag', text: m.title || item.title }));
        v.addEventListener('ended', function () { if (current && current.el === el) advance(); });
        v.addEventListener('error', function () { el.dispatchEvent(new Event('slidefail')); });
        el._video = v;
        return el;
      } };
    });
  }
  function playVideo(v) {
    var ok = function () { $('#audioHint').hidden = !v.muted; };
    var p = v.play();
    if (!p || !p.then) return ok();
    p.then(ok).catch(function () {
      v.muted = true;
      var p2 = v.play();
      if (p2 && p2.then) p2.then(ok).catch(function () { v.dispatchEvent(new Event('error')); });
      else ok();
    });
  }
  function unmute() {
    if (current && current.el._video) { current.el._video.muted = false; $('#audioHint').hidden = true; }
  }

  var BUILDERS = {
    schedule: buildSchedule, announcement: buildAnn(false), academic: buildAnn(true),
    event: buildEvents, gallery: buildGallery, video: buildVideo, slideshow: buildSlideshow
  };

  /* ---------- Antrean & pemutaran ---------- */
  function buildQueue() {
    var out = [];
    state.playlist.forEach(function (item) {
      var fn = BUILDERS[item.slide_type]; if (!fn) return;
      var dur = item.duration_seconds || state.settings.slide_duration_seconds;
      try { out = out.concat(fn(item, dur)); } catch (e) { console.error('Slide gagal dibangun', item.slide_type, e); }
    });
    return out;
  }
  function advance() {
    clearTimeout(timer);
    if (qi >= queue.length) {
      queue = buildQueue(); qi = 0;
      if (!queue.length) queue = [emptySlide()];
    }
    show(queue[qi++]);
  }
  function fail(el) {
    if (!current || current.el !== el) return;
    if (++failStreak > 5) { failStreak = 0; show(messageSlide('Konten tidak dapat dimuat', 'Mencoba kembali sebentar lagi…')); }
    else advance();
  }
  function showStatic(slide) { clearTimeout(timer); show(slide, true); }
  function show(s, hold) {
    var el;
    try { el = s.render(); } catch (e) { console.error(e); el = null; }
    if (!el) { if (++failStreak > 5) { failStreak = 0; el = messageSlide('Belum ada konten', '').render(); } else { return advance(); } }
    el.addEventListener('slidefail', function () { fail(el); });
    slidesEl.append(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('active'); }); });
    var prev = current; current = { s: s, el: el };
    if (prev) {
      prev.el.classList.remove('active');
      setTimeout(function () {
        var v = prev.el._video; if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
        prev.el.remove();
        $('#audioHint').hidden = !(current && current.el._video && current.el._video.muted);
      }, 900);
    }
    // progress bar
    progressBar.style.transition = 'none'; progressBar.style.width = '0';
    if (!s.noProgress && !hold) {
      void progressBar.offsetWidth;
      progressBar.style.transition = 'width ' + s.duration + 's linear'; progressBar.style.width = '100%';
    }
    if (el._video) playVideo(el._video);
    if (hold) return;
    timer = setTimeout(function () { failStreak = 0; advance(); }, s.duration * 1000);
  }

  /* ---------- Fullscreen & kontrol ---------- */
  function isFs() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFs() {
    var de = document.documentElement;
    try {
      if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { var r = (de.requestFullscreen || de.webkitRequestFullscreen).call(de); if (r && r.catch) r.catch(function () {}); }
    } catch (e) { /* tidak didukung */ }
  }
  function fsLabel() { $('#fsBtn').textContent = isFs() ? '⛶ Keluar Layar Penuh' : '⛶ Layar Penuh'; }
  document.addEventListener('fullscreenchange', fsLabel);
  document.addEventListener('webkitfullscreenchange', fsLabel);
  $('#fsBtn').addEventListener('click', function (e) { e.stopPropagation(); toggleFs(); unmute(); });
  document.addEventListener('click', function () { if (!isFs()) toggleFs(); unmute(); });
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (k === 'f') toggleFs(); else if (k === 'm') unmute();
  });
  var uiTimer;
  function showUi(ms) {
    document.body.classList.add('active-ui'); clearTimeout(uiTimer);
    uiTimer = setTimeout(function () { document.body.classList.remove('active-ui'); }, ms || 4000);
  }
  ['mousemove', 'touchstart', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { showUi(); }, { passive: true }); });
  showUi(15000);

/* ---------- Cegah layar tidur (Screen Wake Lock) ---------- */
  // var wakeLock = null;
  // function requestWake() {
  //   if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  //   navigator.wakeLock.request('screen').then(function (l) {
  //     wakeLock = l;
  //     l.addEventListener('release', function () { if (wakeLock === l) wakeLock = null; });
  //   }).catch(function (e) { console.warn('Wake lock gagal:', e && e.message); });
  // }
  // document.addEventListener('visibilitychange', requestWake);
  // document.addEventListener('fullscreenchange', requestWake);
  // document.addEventListener('click', requestWake);
  // setInterval(function () { if (!wakeLock) requestWake(); }, 30000);
  // requestWake();

/* ---------- Keep-awake: media senyap berulang (cadangan Wake Lock, untuk webOS) ---------- */
var KEEPAWAKE_SRC = 'assets/silent.mp4'; // ganti ke 'assets/silent.mp4' jika memakai video
var keepEl = null;
function startKeepAwake() {
  if (!keepEl) {
    var isVideo = /\.(mp4|webm)$/i.test(KEEPAWAKE_SRC);
    keepEl = document.createElement(isVideo ? 'video' : 'audio');
    keepEl.src = KEEPAWAKE_SRC;
    keepEl.loop = true;
    keepEl.setAttribute('playsinline', '');
    keepEl.setAttribute('aria-hidden', 'true');
    if (isVideo) {
      keepEl.muted = true;
      keepEl.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;opacity:0.02;pointer-events:none;z-index:9999;object-fit:cover';
    }
    document.body.appendChild(keepEl);
  }
  if (keepEl.paused) {
    var p = keepEl.play();
    if (p && p.catch) p.catch(function () { /* menunggu klik berikutnya */ });
  }
}
['click', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, startKeepAwake); });
document.addEventListener('fullscreenchange', startKeepAwake);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') startKeepAwake(); });
setInterval(startKeepAwake, 30000);
startKeepAwake();

  /* ---------- Mulai ---------- */
  function boot() {
    if (!P.configured) {
      slidesEl.append(messageSlide('Konfigurasi belum diisi', 'Salin config.example.js menjadi config.js dan isi URL serta anon key Supabase.').render());
      slidesEl.lastChild.classList.add('active');
      $('#connText').textContent = 'Belum dikonfigurasi'; $('#conn').className = 'conn err';
      return;
    }
    if (loadCache()) {
      applySettings(); started = true; advance();
    } else {
      showStatic(messageSlide('Memuat konten…', ''));
    }
    renderStatus();
    refresh();
  }
  boot();
})();