/* Dashboard admin PPDS Digital Signage */
(function () {
  'use strict';
  var P = window.PPDS, h = P.h, sb = P.sb;
  var $ = function (s) { return document.querySelector(s); };
  var view = $('#view');

  /* ======================= Utilitas UI ======================= */
  function toast(msg, type) {
    var t = h('div', { class: 'toast ' + (type || 'ok'), text: msg });
    $('#toasts').append(t); setTimeout(function () { t.remove(); }, 4500);
  }
  function fail(e, prefix) {
    console.error(e);
    toast((prefix ? prefix + ': ' : '') + (e && e.message ? e.message : 'Terjadi kesalahan.'), 'err');
  }
  function stateBox(text, err, retry) {
    return h('div', { class: 'state' + (err ? ' err' : '') }, text, retry ? h('div', null, h('br'), h('button', { class: 'btn', type: 'button', text: 'Coba lagi', onclick: retry })) : null);
  }
  function modal(title, body, foot, wide) {
    var overlay = h('div', { class: 'overlay' });
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.append(h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' }, h('h2', { text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', text: '✕', onclick: close })),
      h('div', { class: 'modal-body' }, body), foot ? h('div', { class: 'modal-foot' }, foot) : null));
    $('#modalRoot').append(overlay); document.addEventListener('keydown', onKey);
    return { close: close };
  }

  /* ======================= Form generik ======================= */
  function getRaw(f, inp) {
    switch (f.type) {
      case 'checkbox': return inp.checked;
      case 'number': return inp.value === '' ? null : Number(inp.value);
      case 'file': return inp.files[0] || null;
      case 'datetime': return P.fromLocalInput(inp.value);
      case 'text': case 'textarea': return inp.value.trim();
      default: var v = inp.value.trim(); return v === '' ? null : v;
    }
  }
  function buildForm(fields, vals) {
    var box = h('div', { class: 'fields' }), ctl = {};
    function rawVals() { var o = {}; fields.forEach(function (f) { o[f.name] = getRaw(f, ctl[f.name].input); }); return o; }
    function refresh() { var r = rawVals(); fields.forEach(function (f) { if (f.showIf) ctl[f.name].wrap.hidden = !f.showIf(r); }); }
    fields.forEach(function (f) {
      var v = vals[f.name], id = 'f_' + f.name, input, wrap;
      switch (f.type) {
        case 'textarea': input = h('textarea', { id: id, rows: f.rows || 5, maxlength: f.max || 2000 }); input.value = v == null ? '' : v; break;
        case 'select':
          input = h('select', { id: id }, f.options.map(function (o) { return h('option', { value: o.value !== undefined ? o.value : o, text: o.label || o }); }));
          input.value = v == null ? '' : v; break;
        case 'checkbox': input = h('input', { id: id, type: 'checkbox' }); input.checked = !!v; break;
        case 'datetime': input = h('input', { id: id, type: 'datetime-local' }); input.value = P.toLocalInput(v); break;
        case 'time': input = h('input', { id: id, type: 'time' }); input.value = v ? String(v).slice(0, 5) : ''; break;
        case 'date': input = h('input', { id: id, type: 'date' }); input.value = v || ''; break;
        case 'number': input = h('input', { id: id, type: 'number', min: f.lo, max: f.hi }); input.value = v == null ? '' : v; break;
        case 'file': input = h('input', { id: id, type: 'file', accept: f.accept }); break;
        case 'url': input = h('input', { id: id, type: 'url', maxlength: 500, placeholder: f.placeholder }); input.value = v || ''; break;
        default: input = h('input', { id: id, type: 'text', maxlength: f.max || 200 }); input.value = v == null ? '' : v;
      }
      if (f.type === 'checkbox') wrap = h('label', { class: 'check' }, input, f.label);
      else {
        wrap = h('div', { class: 'field' + (f.full ? ' full' : '') },
          h('label', { for: id, text: f.label + (f.required ? ' *' : '') }), input,
          f.help ? h('div', { class: 'help', text: f.help }) : null);
        if (f.type === 'file' && f.kind === 'image') {
          var prev = h('img', { class: 'preview', alt: 'Pratinjau' });
          if (vals._currentUrl) prev.src = vals._currentUrl; else prev.hidden = true;
          input.addEventListener('change', function () {
            var file = input.files[0];
            if (file) { prev.src = URL.createObjectURL(file); prev.hidden = false; }
          });
          wrap.append(prev);
        }
      }
      ctl[f.name] = { wrap: wrap, input: input }; box.append(wrap);
      input.addEventListener('input', refresh); input.addEventListener('change', refresh);
    });
    refresh();
    return {
      el: box,
      read: function () {
        var raw = rawVals(), payload = {}, errors = [];
        fields.forEach(function (f) {
          if (ctl[f.name].wrap.hidden) return;
          var v = raw[f.name];
          if (f.required && (v === null || v === '' || v === undefined)) errors.push(f.label + ' wajib diisi.');
          if (f.type === 'number' && v !== null && ((f.lo !== undefined && v < f.lo) || (f.hi !== undefined && v > f.hi)))
            errors.push(f.label + ' harus antara ' + f.lo + ' dan ' + f.hi + '.');
          if (f.type === 'url' && v && !/^https?:\/\//i.test(v)) errors.push(f.label + ' harus diawali http:// atau https://');
          if (f.name.charAt(0) !== '_' && f.type !== 'file') payload[f.name] = v;
        });
        return { raw: raw, payload: payload, errors: errors };
      }
    };
  }

  /* ======================= Storage ======================= */
  var KINDS = {
    image: { types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }, max: 5, label: 'JPG, PNG, atau WebP maksimal 5 MB' },
    logo: { types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }, max: 2, label: 'JPG, PNG, atau WebP maksimal 2 MB' },
    video: { types: { 'video/mp4': 'mp4', 'video/webm': 'webm' }, max: 50, label: 'MP4 atau WebM maksimal 50 MB' }
  };
  function uuid() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2); }
  async function upload(file, folder, kind, ctx) {
    var k = KINDS[kind], ext = k.types[file.type];
    if (!ext) throw new Error('Format file tidak didukung. Gunakan ' + k.label + '.');
    if (file.size > k.max * 1048576) throw new Error('Ukuran file melebihi ' + k.max + ' MB.');
    var path = folder + '/' + uuid() + '.' + ext;
    var r = await sb.storage.from(P.bucket).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (r.error) throw r.error;
    ctx.uploaded.push(path); return path;
  }
  async function removeFiles(paths) {
    paths = paths.filter(Boolean);
    if (!paths.length) return;
    try { await sb.storage.from(P.bucket).remove(paths); } catch (e) { console.warn(e); }
  }
  function pathFromUrl(url) {
    var m = url && url.split('/object/public/' + P.bucket + '/')[1];
    return m ? decodeURIComponent(m) : null;
  }

  /* ======================= Definisi modul ======================= */
  var CATEGORIES = ['Akademik', 'Administrasi', 'Kegiatan', 'Ujian', 'Informasi Umum', 'Lainnya'];
  function badge(text, cls) { return h('span', { class: 'badge ' + (cls || ''), text: text }); }
  function titleCell(r, sub) { return h('div', null, h('b', { text: r.title }), sub ? h('span', { class: 'sub', text: sub }) : null); }

  function schedStatus(r, now) {
    var st = P.dt(r.event_date, r.start_time), en = P.dt(r.event_date, r.end_time);
    if (now > en) return badge('Selesai');
    if (now >= st) return badge('Sedang berlangsung', 'live');
    return r.event_date === P.todayStr(now) ? badge('Hari ini', 'warn') : badge('Akan datang', 'ok');
  }
  function annState(r, now) {
    if (!r.is_published) return 'hidden';
    if (r.expires_at && new Date(r.expires_at) <= now) return 'expired';
    if (new Date(r.publish_at) > now) return 'scheduled';
    return 'active';
  }
  var ANN_LABEL = { active: ['Aktif', 'ok'], expired: ['Kedaluwarsa', ''], scheduled: ['Terjadwal', 'warn'], hidden: ['Disembunyikan', ''] };

  var MODULES = {
    schedules: {
      title: 'Jadwal Kegiatan', table: 'schedules', noun: 'jadwal',
      order: [['event_date', false], ['start_time', true]],
      fields: [
        { name: 'title', label: 'Judul kegiatan', type: 'text', required: true, full: true },
        { name: 'event_date', label: 'Tanggal', type: 'date', required: true },
        { name: 'location', label: 'Lokasi', type: 'text' },
        { name: 'start_time', label: 'Waktu mulai', type: 'time', required: true },
        { name: 'end_time', label: 'Waktu selesai', type: 'time', required: true },
        { name: 'description', label: 'Keterangan', type: 'textarea', max: 1000, rows: 3 },
        { name: 'is_published', label: 'Tampilkan di TV', type: 'checkbox' }
      ],
      defaults: function () { return { event_date: P.todayStr(), is_published: true }; },
      validate: function (p) { if (p.start_time && p.end_time && p.end_time <= p.start_time) return 'Waktu selesai harus setelah waktu mulai.'; },
      filters: [
        { key: 'all', label: 'Semua', fn: function () { return true; } },
        { key: 'today', label: 'Hari ini', fn: function (r, n) { return r.event_date === P.todayStr(n); } },
        { key: 'live', label: 'Sedang berlangsung', fn: function (r, n) { return n >= P.dt(r.event_date, r.start_time) && n <= P.dt(r.event_date, r.end_time); } },
        { key: 'next', label: 'Akan datang', fn: function (r, n) { return P.dt(r.event_date, r.start_time) > n; } },
        { key: 'done', label: 'Sudah selesai', fn: function (r, n) { return P.dt(r.event_date, r.end_time) < n; } }
      ],
      columns: [
        ['Tanggal', function (r) { return P.fmtDate(r.event_date); }],
        ['Waktu', function (r) { return P.fmtTime(r.start_time) + ' – ' + P.fmtTime(r.end_time); }],
        ['Kegiatan', function (r) { return titleCell(r, r.location); }],
        ['Status', function (r, n) { return schedStatus(r, n); }]
      ]
    },
    announcements: {
      title: 'Pengumuman', table: 'announcements', noun: 'pengumuman',
      order: [['publish_at', false]],
      fields: [
        { name: 'title', label: 'Judul', type: 'text', required: true, full: true },
        { name: 'content', label: 'Isi pengumuman', type: 'textarea', required: true, max: 1200, rows: 6, help: 'Teks biasa (HTML tidak diproses). Maksimal 1200 karakter agar terbaca di TV.' },
        { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES, required: true },
        { name: 'priority', label: 'Prioritas', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'Tinggi (tampilan khusus)' }], required: true },
        { name: 'publish_at', label: 'Mulai tayang', type: 'datetime', required: true },
        { name: 'expires_at', label: 'Kedaluwarsa (opsional)', type: 'datetime' },
        { name: 'is_published', label: 'Tampilkan di TV (hilangkan centang untuk menyembunyikan)', type: 'checkbox' }
      ],
      defaults: function () { return { category: 'Informasi Umum', priority: 'normal', publish_at: new Date().toISOString(), is_published: true }; },
      validate: function (p) { if (p.expires_at && p.publish_at && new Date(p.expires_at) <= new Date(p.publish_at)) return 'Tanggal kedaluwarsa harus setelah waktu mulai tayang.'; },
      filters: [
        { key: 'all', label: 'Semua', fn: function () { return true; } },
        { key: 'active', label: 'Aktif', fn: function (r, n) { return annState(r, n) === 'active'; } },
        { key: 'scheduled', label: 'Terjadwal', fn: function (r, n) { return annState(r, n) === 'scheduled'; } },
        { key: 'expired', label: 'Kedaluwarsa', fn: function (r, n) { return annState(r, n) === 'expired'; } },
        { key: 'hidden', label: 'Disembunyikan', fn: function (r, n) { return annState(r, n) === 'hidden'; } }
      ],
      columns: [
        ['Pengumuman', function (r) { return titleCell(r, r.category); }],
        ['Prioritas', function (r) { return r.priority === 'high' ? badge('Tinggi', 'high') : badge('Normal'); }],
        ['Periode', function (r) { return P.fmtDateTime(r.publish_at) + (r.expires_at ? ' → ' + P.fmtDateTime(r.expires_at) : ''); }],
        ['Status', function (r, n) { var s = ANN_LABEL[annState(r, n)]; return badge(s[0], s[1]); }]
      ]
    },
    events: {
      title: 'Agenda Mendatang', table: 'events', noun: 'agenda',
      order: [['event_date', true], ['start_time', true]],
      fields: [
        { name: 'title', label: 'Nama kegiatan', type: 'text', required: true, full: true },
        { name: 'event_date', label: 'Tanggal', type: 'date', required: true },
        { name: 'location', label: 'Lokasi', type: 'text' },
        { name: 'start_time', label: 'Waktu mulai (opsional)', type: 'time' },
        { name: 'end_time', label: 'Waktu selesai (opsional)', type: 'time' },
        { name: 'description', label: 'Keterangan', type: 'textarea', max: 1000, rows: 3 },
        { name: 'is_published', label: 'Tampilkan di TV', type: 'checkbox' }
      ],
      defaults: function () { return { event_date: P.todayStr(), is_published: true }; },
      validate: function (p) { if (p.start_time && p.end_time && p.end_time <= p.start_time) return 'Waktu selesai harus setelah waktu mulai.'; },
      columns: [
        ['Tanggal', function (r) { return P.fmtDate(r.event_date); }],
        ['Waktu', function (r) { return r.start_time ? P.fmtTime(r.start_time) + (r.end_time ? ' – ' + P.fmtTime(r.end_time) : '') : 'Sepanjang hari'; }],
        ['Agenda', function (r) { return titleCell(r, r.location); }],
        ['Status', function (r, n) { return P.dt(r.event_date, r.end_time || r.start_time || '23:59:59') < n ? badge('Selesai') : badge('Mendatang', 'ok'); }]
      ]
    },
    gallery: {
      title: 'Dokumentasi Kegiatan', table: 'media', noun: 'foto', mediaType: 'image', reorder: true,
      order: [['sort_order', true], ['created_at', false]],
      fields: [
        { name: 'title', label: 'Judul dokumentasi', type: 'text', required: true, full: true },
        { name: 'description', label: 'Deskripsi', type: 'textarea', max: 1000, rows: 3 },
        { name: 'event_date', label: 'Tanggal kegiatan', type: 'date' },
        { name: '_file', label: 'Foto', type: 'file', kind: 'image', accept: 'image/jpeg,image/png,image/webp', help: KINDS.image.label + '. Saat mengedit, kosongkan untuk mempertahankan foto.' },
        { name: 'is_published', label: 'Tampilkan di TV', type: 'checkbox' }
      ],
      defaults: function () { return { is_published: true }; },
      prepare: function (row) { return row.storage_path ? { _currentUrl: P.publicUrl(row.storage_path) } : {}; },
      beforeSave: async function (p, raw, row, ctx, rows) {
        p.media_type = 'image'; p.external_url = null;
        if (raw._file) {
          p.storage_path = await upload(raw._file, 'photos', 'image', ctx);
          if (row && row.storage_path) ctx.remove.push(row.storage_path);
        } else if (row && row.storage_path) p.storage_path = row.storage_path;
        else throw new Error('Pilih file foto.');
        if (!row) p.sort_order = nextOrder(rows);
        return p;
      },
      columns: [
        ['Foto', function (r) { return r.storage_path ? h('img', { class: 'thumb', src: P.publicUrl(r.storage_path), alt: r.title, loading: 'lazy' }) : '—'; }],
        ['Judul', function (r) { return titleCell(r, r.description); }],
        ['Tanggal', function (r) { return r.event_date ? P.fmtDate(r.event_date) : '—'; }]
      ]
    },
    videos: {
      title: 'Video', table: 'media', noun: 'video', mediaType: 'video', reorder: true,
      order: [['sort_order', true], ['created_at', false]],
      fields: [
        { name: 'title', label: 'Judul video', type: 'text', required: true, full: true },
        { name: 'description', label: 'Deskripsi', type: 'textarea', max: 1000, rows: 3 },
        { name: '_source', label: 'Sumber video', type: 'select', options: [{ value: 'upload', label: 'Unggah file' }, { value: 'url', label: 'Tautan (YouTube, Google Drive, atau URL file)' }] },
        { name: '_file', label: 'File video', type: 'file', kind: 'video', accept: 'video/mp4,video/webm', showIf: function (r) { return r._source === 'upload'; }, help: KINDS.video.label + '. Saat mengedit, kosongkan untuk mempertahankan file.' },
        { name: 'external_url', label: 'Tautan video', type: 'url', placeholder: 'https://www.youtube.com/watch?v=…', showIf: function (r) { return r._source === 'url'; }, help: 'Bisa tautan YouTube (disarankan), Google Drive (file harus dibagikan "Siapa saja yang memiliki link"), atau tautan langsung ke file .mp4/.webm.' },
        { name: 'duration_seconds', label: 'Durasi tayang maksimal (detik, opsional)', type: 'number', lo: 5, hi: 3600, help: 'Kosongkan agar video diputar sampai selesai (YouTube dan file). Untuk Google Drive, isi durasi sebagai cadangan jika pemutaran langsung ditolak Drive.' },
        { name: 'is_published', label: 'Tampilkan di TV', type: 'checkbox' }
      ],
      defaults: function () { return { is_published: true, _source: 'upload' }; },
      prepare: function (row) { return { _source: row.storage_path ? 'upload' : 'url' }; },
      beforeSave: async function (p, raw, row, ctx, rows) {
        p.media_type = 'video';
        if (raw._source === 'url') {
          if (!p.external_url) throw new Error('Tautan video wajib diisi.');
          if (!P.parseVideo(p.external_url)) throw new Error('Tautan video tidak dikenali.');
          p.storage_path = null;
          if (row && row.storage_path) ctx.remove.push(row.storage_path);
        } else {
          p.external_url = null;
          if (raw._file) {
            p.storage_path = await upload(raw._file, 'videos', 'video', ctx);
            if (row && row.storage_path) ctx.remove.push(row.storage_path);
          } else if (row && row.storage_path) p.storage_path = row.storage_path;
          else throw new Error('Pilih file video.');
        }
        if (!row) p.sort_order = nextOrder(rows);
        return p;
      },
      preview: function (r) {
        var src = r.storage_path ? { kind: 'file', url: P.publicUrl(r.storage_path) } : P.parseVideo(r.external_url), node;
        if (!src) return toast('Sumber video tidak valid.', 'err');
        if (src.kind === 'youtube') node = h('iframe', { src: 'https://www.youtube.com/embed/' + src.id + '?rel=0', allow: 'autoplay; fullscreen', referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: true, style: 'width:100%;aspect-ratio:16/9;border:0;border-radius:10px' });
        else if (src.kind === 'drive') node = h('iframe', { src: 'https://drive.google.com/file/d/' + src.id + '/preview', allow: 'autoplay; fullscreen', style: 'width:100%;aspect-ratio:16/9;border:0;border-radius:10px' });
        else {
          node = h('video', { src: src.url, controls: true, autoplay: true, playsinline: true });
          node.addEventListener('error', function () { toast('Video tidak dapat diputar browser.', 'err'); });
        }
        var m = modal('Pratinjau: ' + r.title, node, null, true);
        document.addEventListener('keydown', function f(e) { if (e.key === 'Escape') { if (node.pause) node.pause(); document.removeEventListener('keydown', f); } });
      },
      columns: [
        ['Video', function (r) { return titleCell(r, r.description); }],
        ['Sumber', function (r) {
          if (r.storage_path) return badge('Unggahan', 'ok');
          var k = P.parseVideo(r.external_url);
          return badge(k ? ({ youtube: 'YouTube', drive: 'Google Drive', file: 'URL file' })[k.kind] : 'Tidak valid');
        }],
        ['Durasi maks.', function (r) { return r.duration_seconds ? r.duration_seconds + ' dtk' : 'Sampai selesai'; }]
      ]
    }
  };
  function nextOrder(rows) { return (rows || []).reduce(function (m, r) { return Math.max(m, r.sort_order || 0); }, 0) + 1; }

  /* ======================= CRUD generik ======================= */
  async function saveRow(m, row, payload, raw, rows) {
    var ctx = { uploaded: [], remove: [] };
    try {
      if (m.beforeSave) payload = await m.beforeSave(payload, raw, row, ctx, rows);
      var res = row ? await sb.from(m.table).update(payload).eq('id', row.id) : await sb.from(m.table).insert(payload);
      if (res.error) throw res.error;
    } catch (e) { await removeFiles(ctx.uploaded); throw e; }
    await removeFiles(ctx.remove);
  }
  function openForm(m, row, rows, onSaved) {
    var vals = Object.assign({}, row ? row : (m.defaults ? m.defaults() : {}), m.prepare && row ? m.prepare(row) : {});
    if (m.defaults && !row) vals = Object.assign({}, m.defaults());
    var form = buildForm(m.fields, vals), err = h('div', { class: 'alert hidden', role: 'alert' });
    var save = h('button', { class: 'btn primary', type: 'submit', text: 'Simpan' });
    var cancel = h('button', { class: 'btn', type: 'button', text: 'Batal' });
    var f = h('form', { novalidate: true }, err, form.el);
    var box = h('div', null, f);
    var mod = modal((row ? 'Edit ' : 'Tambah ') + m.noun, box, [cancel, save], true);
    cancel.addEventListener('click', mod.close);
    async function submit(ev) {
      ev.preventDefault();
      var r = form.read(), msg = r.errors[0] || (m.validate && m.validate(r.payload));
      if (msg) { err.textContent = msg; err.classList.remove('hidden'); return; }
      err.classList.add('hidden'); save.disabled = true; save.textContent = 'Menyimpan…';
      try {
        await saveRow(m, row, r.payload, r.raw, rows);
        mod.close(); toast('Data tersimpan.'); onSaved();
      } catch (e) { err.textContent = e.message || 'Gagal menyimpan.'; err.classList.remove('hidden'); save.disabled = false; save.textContent = 'Simpan'; }
    }
    f.addEventListener('submit', submit);
    save.addEventListener('click', function () { f.requestSubmit ? f.requestSubmit() : submit(new Event('submit')); });
  }
  async function deleteRow(m, row, reload) {
    if (!confirm('Hapus "' + row.title + '"? Tindakan ini tidak dapat dibatalkan.')) return;
    var r = await sb.from(m.table).delete().eq('id', row.id);
    if (r.error) return fail(r.error, 'Gagal menghapus');
    if (row.storage_path) await removeFiles([row.storage_path]);
    toast('Data dihapus.'); reload();
  }
  async function togglePublished(m, row, val, reload) {
    var r = await sb.from(m.table).update({ is_published: val }).eq('id', row.id);
    if (r.error) { fail(r.error, 'Gagal memperbarui'); return reload(); }
    toast(val ? 'Konten ditampilkan.' : 'Konten disembunyikan.');
    row.is_published = val;
  }
  async function moveRow(m, rows, idx, dir, reload) {
    var j = idx + dir; if (j < 0 || j >= rows.length) return;
    var arr = rows.slice(); var t = arr[idx]; arr[idx] = arr[j]; arr[j] = t;
    var jobs = [];
    arr.forEach(function (r, i) { if (r.sort_order !== i + 1) jobs.push(sb.from(m.table).update({ sort_order: i + 1 }).eq('id', r.id)); });
    var res = await Promise.all(jobs), bad = res.find(function (x) { return x.error; });
    if (bad) fail(bad.error, 'Gagal mengurutkan');
    reload();
  }

  async function renderModule(key) {
    var m = MODULES[key], filterKey = 'all';
    view.replaceChildren(stateBox('Memuat…'));
    var q = sb.from(m.table).select('*');
    if (m.mediaType) q = q.eq('media_type', m.mediaType);
    m.order.forEach(function (o) { q = q.order(o[0], { ascending: o[1] }); });
    var res = await q;
    if (res.error) return view.replaceChildren(stateBox('Gagal memuat data: ' + res.error.message, true, function () { renderModule(key); }));
    var rows = res.data, reload = function () { renderModule(key); };

    var holder = h('div');
    function draw() {
      var now = new Date(), f = (m.filters || []).find(function (x) { return x.key === filterKey; });
      var list = f ? rows.filter(function (r) { return f.fn(r, now); }) : rows;
      if (!list.length) {
        holder.replaceChildren(h('div', { class: 'table-wrap' }, stateBox(rows.length ? 'Tidak ada data pada filter ini.' : 'Belum ada ' + m.noun + '. Klik "Tambah" untuk membuat yang pertama.')));
        return;
      }
      var head = m.columns.map(function (c) { return h('th', { text: c[0] }); });
      head.push(h('th', { text: 'Tayang' }));
      if (m.reorder) head.push(h('th', { text: 'Urutan' }));
      head.push(h('th'));
      var body = list.map(function (r) {
        var idx = rows.indexOf(r);
        var tds = m.columns.map(function (c) { return h('td', null, c[1](r, now)); });
        var sw = h('input', { class: 'switch', type: 'checkbox', 'aria-label': 'Tampilkan di TV' }); sw.checked = !!r.is_published;
        sw.addEventListener('change', function () { togglePublished(m, r, sw.checked, reload); });
        tds.push(h('td', null, sw));
        if (m.reorder) tds.push(h('td', null,
          h('button', { class: 'btn sm', type: 'button', text: '↑', 'aria-label': 'Naikkan', disabled: idx === 0, onclick: function () { moveRow(m, rows, idx, -1, reload); } }),
          h('button', { class: 'btn sm', type: 'button', text: '↓', 'aria-label': 'Turunkan', disabled: idx === rows.length - 1, onclick: function () { moveRow(m, rows, idx, 1, reload); } })));
        tds.push(h('td', { class: 'actions' },
          m.preview ? h('button', { class: 'btn sm', type: 'button', text: 'Pratinjau', onclick: function () { m.preview(r); } }) : null,
          h('button', { class: 'btn sm', type: 'button', text: 'Edit', onclick: function () { openForm(m, r, rows, reload); } }),
          h('button', { class: 'btn sm danger', type: 'button', text: 'Hapus', onclick: function () { deleteRow(m, r, reload); } })));
        return h('tr', null, tds);
      });
      holder.replaceChildren(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, head)), h('tbody', null, body))));
    }
    var tools = [h('div', { class: 'grow muted', text: rows.length + ' ' + m.noun })];
    if (m.filters) {
      var sel = h('select', { 'aria-label': 'Filter' }, m.filters.map(function (x) { return h('option', { value: x.key, text: x.label }); }));
      sel.addEventListener('change', function () { filterKey = sel.value; draw(); });
      tools.push(sel);
    }
    tools.push(h('button', { class: 'btn primary', type: 'button', text: '+ Tambah', onclick: function () { openForm(m, null, rows, reload); } }));
    view.replaceChildren(h('div', { class: 'toolbar' }, tools), holder);
    draw();
  }

  /* ======================= Dashboard ======================= */
  async function cnt(table, mod) {
    var q = sb.from(table).select('id', { count: 'exact', head: true });
    if (mod) q = mod(q);
    var r = await q; if (r.error) throw r.error; return r.count || 0;
  }
  async function renderDashboard() {
    view.replaceChildren(stateBox('Memuat…'));
    try {
      var now = new Date().toISOString(), today = P.todayStr();
      var r = await Promise.all([
        cnt('announcements', function (q) { return q.eq('is_published', true).lte('publish_at', now).or('expires_at.is.null,expires_at.gt.' + now); }),
        cnt('events', function (q) { return q.eq('is_published', true).gte('event_date', today); }),
        cnt('schedules'),
        cnt('media', function (q) { return q.eq('media_type', 'image'); }),
        cnt('media', function (q) { return q.eq('media_type', 'video'); }),
        cnt('schedules', function (q) { return q.eq('is_published', true); }),
        cnt('announcements', function (q) { return q.eq('is_published', true); }),
        cnt('announcements'),
        cnt('events', function (q) { return q.eq('is_published', true); }),
        cnt('events'),
        cnt('media', function (q) { return q.eq('is_published', true).eq('media_type', 'image'); }),
        cnt('media', function (q) { return q.eq('is_published', true).eq('media_type', 'video'); })
      ]);
      var stat = function (n, label) { return h('div', { class: 'stat' }, h('b', { text: String(n) }), h('span', { text: label })); };
      var row = function (name, pub, tot) { return h('tr', null, h('td', { text: name }), h('td', null, badge(String(pub), 'ok')), h('td', { text: String(tot - pub) }), h('td', { text: String(tot) })); };
      view.replaceChildren(
        h('div', { class: 'stats' }, stat(r[0], 'Pengumuman aktif'), stat(r[1], 'Agenda mendatang'), stat(r[2], 'Jadwal kegiatan'), stat(r[3] + r[4], 'Media (' + r[3] + ' foto, ' + r[4] + ' video)')),
        h('div', { class: 'card-box' }, h('h2', { text: 'Status publikasi konten' }),
          h('div', { class: 'table-wrap' }, h('table', null,
            h('thead', null, h('tr', null, ['Modul', 'Dipublikasikan', 'Draf / disembunyikan', 'Total'].map(function (t) { return h('th', { text: t }); }))),
            h('tbody', null, row('Jadwal', r[5], r[2]), row('Pengumuman', r[6], r[7]), row('Agenda', r[8], r[9]), row('Foto', r[10], r[3]), row('Video', r[11], r[4]))))),
        h('div', { class: 'card-box' }, h('h2', { text: 'Tayangan TV' }),
          h('p', { class: 'muted' }, 'Buka halaman display di TV melalui URL ', h('code', { text: new URL('display.html', location.href).href }), '. Perubahan dari dashboard muncul otomatis sesuai interval pembaruan.'),
          h('p', null, h('a', { class: 'btn primary', href: 'display.html', target: '_blank', rel: 'noopener', text: '▶ Buka Tayangan TV' }))));
    } catch (e) { view.replaceChildren(stateBox('Gagal memuat ringkasan: ' + e.message, true, renderDashboard)); }
  }

  /* ======================= Pengaturan ======================= */
  var SLIDE_LABEL = { schedule: 'Jadwal', announcement: 'Pengumuman', event: 'Agenda', gallery: 'Dokumentasi', academic: 'Informasi Akademik', video: 'Video' };
  async function getSettings() {
    var r = await sb.from('signage_settings').select('*').order('updated_at', { ascending: false }).limit(1);
    if (r.error) throw r.error;
    if (r.data.length) return r.data[0];
    var i = await sb.from('signage_settings').insert({}).select().single();
    if (i.error) throw i.error; return i.data;
  }
  function settingsCard(title, fields, s, extra) {
    var form = buildForm(fields, s), err = h('div', { class: 'alert hidden' });
    var btn = h('button', { class: 'btn primary', type: 'button', text: 'Simpan pengaturan' });
    btn.addEventListener('click', async function () {
      var r = form.read();
      if (r.errors.length) { err.textContent = r.errors[0]; err.classList.remove('hidden'); return; }
      err.classList.add('hidden'); btn.disabled = true;
      var ctx = { uploaded: [], remove: [] };
      try {
        var payload = r.payload;
        if (extra) payload = await extra(payload, r.raw, s, ctx);
        var u = await sb.from('signage_settings').update(payload).eq('id', s.id);
        if (u.error) throw u.error;
        await removeFiles(ctx.remove); toast('Pengaturan tersimpan.'); Object.assign(s, payload); applyBrand(s);
      } catch (e) { await removeFiles(ctx.uploaded); err.textContent = e.message; err.classList.remove('hidden'); }
      btn.disabled = false;
    });
    return h('div', { class: 'card-box' }, h('h2', { text: title }), err, form.el, btn);
  }
  async function renderPlaylistSettings() {
    view.replaceChildren(stateBox('Memuat…'));
    try {
      var s = await getSettings();
      var pr = await sb.from('signage_playlist').select('*').order('sort_order');
      if (pr.error) throw pr.error;
      var rows = pr.data;
      var tbody = h('tbody'), edits = {};
      function drawList() {
        tbody.replaceChildren.apply(tbody, rows.map(function (r, i) {
          var title = h('input', { class: 'inline-input', style: 'width:220px', type: 'text', maxlength: 100, value: r.title });
          var dur = h('input', { class: 'inline-input', type: 'number', min: 5, max: 300, value: r.duration_seconds });
          var en = h('input', { class: 'switch', type: 'checkbox', 'aria-label': 'Aktif' }); en.checked = r.is_enabled;
          title.addEventListener('input', function () { r.title = title.value; });
          dur.addEventListener('input', function () { r.duration_seconds = Number(dur.value); });
          en.addEventListener('change', function () { r.is_enabled = en.checked; });
          return h('tr', null, h('td', { text: String(i + 1) }), h('td', null, badge(SLIDE_LABEL[r.slide_type] || r.slide_type)), h('td', null, title), h('td', null, dur), h('td', null, en),
            h('td', null,
              h('button', { class: 'btn sm', type: 'button', text: '↑', disabled: i === 0, onclick: function () { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); drawList(); } }),
              h('button', { class: 'btn sm', type: 'button', text: '↓', disabled: i === rows.length - 1, onclick: function () { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); drawList(); } })));
        }));
      }
      drawList();
      var perr = h('div', { class: 'alert hidden' });
      var pbtn = h('button', { class: 'btn primary', type: 'button', text: 'Simpan urutan tayangan' });
      pbtn.addEventListener('click', async function () {
        for (var k = 0; k < rows.length; k++) {
          if (!rows[k].title.trim()) { perr.textContent = 'Judul tayangan tidak boleh kosong.'; perr.classList.remove('hidden'); return; }
          if (!(rows[k].duration_seconds >= 5 && rows[k].duration_seconds <= 300)) { perr.textContent = 'Durasi tayangan harus 5–300 detik.'; perr.classList.remove('hidden'); return; }
        }
        perr.classList.add('hidden'); pbtn.disabled = true;
        var res = await Promise.all(rows.map(function (r, i) {
          return sb.from('signage_playlist').update({ sort_order: i + 1, title: r.title.trim(), duration_seconds: r.duration_seconds, is_enabled: r.is_enabled }).eq('id', r.id);
        }));
        var bad = res.find(function (x) { return x.error; });
        if (bad) fail(bad.error, 'Gagal menyimpan'); else toast('Urutan tayangan tersimpan.');
        pbtn.disabled = false;
      });
      view.replaceChildren(
        h('div', { class: 'card-box' }, h('h2', { text: 'Urutan & durasi tayangan' }),
          h('p', { class: 'muted small', text: 'Jenis tayangan tanpa konten dilewati otomatis. Durasi berlaku per slide (video memakai durasi video).' }), perr,
          h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['#', 'Jenis', 'Judul di layar', 'Durasi (dtk)', 'Aktif', 'Urutan'].map(function (t) { return h('th', { text: t }); }))), tbody)),
          h('p', null, pbtn)),
        settingsCard('Pengaturan tampilan', [
          { name: 'slide_duration_seconds', label: 'Durasi slide bawaan (detik)', type: 'number', lo: 5, hi: 120, required: true },
          { name: 'refresh_interval_seconds', label: 'Interval pemeriksaan pembaruan (detik)', type: 'number', lo: 10, hi: 3600, required: true },
          { name: 'theme', label: 'Mode tampilan', type: 'select', options: [{ value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }], required: true },
          { name: 'footer_text', label: 'Teks footer', type: 'text', max: 250, full: true }
        ], s));
    } catch (e) { view.replaceChildren(stateBox('Gagal memuat pengaturan: ' + e.message, true, renderPlaylistSettings)); }
  }
  async function renderAppSettings() {
    view.replaceChildren(stateBox('Memuat…'));
    try {
      var s = await getSettings();
      view.replaceChildren(settingsCard('Identitas program', [
        { name: 'institution_name', label: 'Nama program / institusi', type: 'text', max: 150, required: true, full: true },
        { name: '_file', label: 'Logo', type: 'file', kind: 'image', accept: 'image/jpeg,image/png,image/webp', help: KINDS.logo.label + '. Kosongkan untuk mempertahankan logo saat ini.' }
      ], Object.assign({}, s, { _currentUrl: s.logo_url }), async function (payload, raw, cur, ctx) {
        if (raw._file) {
          var path = await upload(raw._file, 'branding', 'logo', ctx);
          payload.logo_url = P.publicUrl(path);
          var old = pathFromUrl(cur.logo_url); if (old) ctx.remove.push(old);
        }
        return payload;
      }));
    } catch (e) { view.replaceChildren(stateBox('Gagal memuat pengaturan: ' + e.message, true, renderAppSettings)); }
  }

  /* ======================= Router & auth ======================= */
  var NAV = [
    ['dashboard', 'Dashboard', renderDashboard], ['schedules', 'Jadwal Kegiatan'], ['announcements', 'Pengumuman'],
    ['events', 'Agenda Mendatang'], ['gallery', 'Dokumentasi'], ['videos', 'Video'],
    ['playlist', 'Pengaturan Tayangan', renderPlaylistSettings], ['app', 'Pengaturan Aplikasi', renderAppSettings]
  ];
  function buildNav() {
    $('#nav').replaceChildren.apply($('#nav'), NAV.map(function (n) {
      return h('a', { class: 'navlink', href: '#/' + n[0], 'data-key': n[0], text: n[1], onclick: function () { $('#sidebar').classList.remove('open'); } });
    }));
  }
  function route() {
    var key = (location.hash.replace('#/', '') || 'dashboard'), n = NAV.find(function (x) { return x[0] === key; }) || NAV[0];
    document.querySelectorAll('#nav .navlink').forEach(function (a) { a.classList.toggle('active', a.dataset.key === n[0]); });
    $('#pageTitle').textContent = n[1];
    if (n[2]) n[2](); else renderModule(n[0]);
  }
  function applyBrand(s) {
    var src = s && s.logo_url && /^https?:\/\//i.test(s.logo_url) ? s.logo_url : 'assets/logo-placeholder.svg';
    document.querySelectorAll('.brand-logo').forEach(function (img) {
      img.onerror = function () { img.onerror = null; img.src = 'assets/logo-placeholder.svg'; };
      img.src = src;
    });
    if (s && s.institution_name) { var n = $('#brandName'); if (n) n.textContent = s.institution_name; }
  }
  function showLogin(msg) {
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
    if (msg) { $('#loginError').textContent = msg; $('#loginError').classList.remove('hidden'); }
  }
  async function enter(user) {
    var r = await sb.from('profiles').select('display_name,role').eq('id', user.id).maybeSingle();
    if (r.error || !r.data || r.data.role !== 'admin') {
      await sb.auth.signOut(); showLogin('Akun ini tidak memiliki akses administrator.'); return;
    }
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    $('#userInfo').textContent = (r.data.display_name || user.email);
    buildNav(); route();
    getSettings().then(applyBrand).catch(function () { /* logo bawaan */ });
  }
  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#loginBtn'); $('#loginError').classList.add('hidden');
    var email = $('#email').value.trim(), pw = $('#password').value;
    if (!email || !pw) { $('#loginError').textContent = 'Email dan kata sandi wajib diisi.'; $('#loginError').classList.remove('hidden'); return; }
    btn.disabled = true; btn.textContent = 'Memeriksa…';
    var r = await sb.auth.signInWithPassword({ email: email, password: pw });
    btn.disabled = false; btn.textContent = 'Masuk';
    if (r.error) { $('#loginError').textContent = 'Email atau kata sandi salah.'; $('#loginError').classList.remove('hidden'); return; }
    $('#password').value = '';
    enter(r.data.user);
  });
  $('#logout').addEventListener('click', async function () { await sb.auth.signOut(); location.hash = ''; showLogin(); });
  $('#burger').addEventListener('click', function () { $('#sidebar').classList.toggle('open'); });
  window.addEventListener('hashchange', function () { if (!$('#app').classList.contains('hidden')) route(); });


  /* ======================= Tema gelap / terang ======================= */
  function paintTheme() {
    var t = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', b = $('#themeBtn');
    if (!b) return;
    b.textContent = t === 'dark' ? '☀' : '☾';
    b.setAttribute('aria-label', t === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
    b.title = t === 'dark' ? 'Mode terang' : 'Mode gelap';
  }
  $('#themeBtn').addEventListener('click', function () {
    var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('ppds_theme', t); } catch (e) { /* abaikan */ }
    paintTheme();
  });
  paintTheme();

  (async function boot() {
    if (!P.configured) { $('#setup').classList.remove('hidden'); return; }
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) enter(s.data.session.user); else showLogin();
  })();
})();
