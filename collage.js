(function () {
  var IMG_BASE = 'assets/img/';
  var SHEET_URL =
    'https://docs.google.com/spreadsheets/d/13dgF7zdWF2XfN4dEGKMaxWGGMKwQfgvALN5IioWhnpg/gviz/tq?tqx=out:csv&sheet=Foglio1';
  var FOLDERS_URL = 'assets/folders.json';
  var LAYOUT_URL = 'assets/layout.json';

  var COMPOSE = {
    cols: 5,
    rows: 2,
    unit: 1,
    gap: 0.2,
    displayScale: 1.45,
    candidates: 96,
    topReserve: 0.2
  };

  var items = [];
  var folderManifest = {};
  var activeSlug = null;
  var descriptionEl = null;
  var mainPlacements = null;
  var savedLayoutFile = null;
  var layoutSeed = 7;
  var MOBILE_MQ = window.matchMedia('(max-aspect-ratio: 1/1)');

  function isMobileLayout() {
    return MOBILE_MQ.matches;
  }

  function syncMobileIntroOffset() {
    var intro = document.getElementById('intro');
    if (!intro || !isMobileLayout()) {
      document.documentElement.style.removeProperty('--mobile-intro-offset');
      return;
    }
    document.documentElement.style.setProperty('--mobile-intro-offset', intro.offsetHeight + 'px');
  }

  function clearCollageItemStyles(el) {
    el.style.width = '';
    el.style.height = '';
    el.style.left = '';
    el.style.right = '';
    el.style.top = '';
    el.style.bottom = '';
    el.style.transform = '';
    el.style.transformOrigin = '';
  }

  function applyGridConfig(grid) {
    if (!grid) return;
    if (grid.cols != null) COMPOSE.cols = grid.cols;
    if (grid.rows != null) COMPOSE.rows = grid.rows;
    if (grid.unit != null) COMPOSE.unit = grid.unit;
    if (grid.gap != null) COMPOSE.gap = grid.gap;
    if (grid.displayScale != null) COMPOSE.displayScale = grid.displayScale;
  }

  function normalizePlacement(p) {
    if (!p) return null;
    return {
      gx: p.gx,
      gy: p.gy,
      w: p.w != null ? p.w : COMPOSE.unit,
      h: p.h != null ? p.h : COMPOSE.unit
    };
  }

  function placementsForItems(raw) {
    if (!raw) return null;
    var result = [];

    if (Array.isArray(raw)) {
      if (raw.length < items.length) return null;
      for (var i = 0; i < items.length; i++) {
        var arrP = normalizePlacement(raw[i]);
        if (!arrP) return null;
        result.push(arrP);
      }
      return result;
    }

    for (var j = 0; j < items.length; j++) {
      var key = String(j + 1);
      var entry = raw[key] || raw[j + 1] || raw[items[j].slug];
      var objP = normalizePlacement(entry);
      if (!objP) return null;
      result.push(objP);
    }
    return result;
  }

  function loadSavedLayout(layout) {
    if (!layout || !layout.placements) return false;
    var placements = placementsForItems(layout.placements);
    if (!placements) return false;
    savedLayoutFile = layout;
    applyGridConfig(layout.grid);
    if (layout.seed != null) layoutSeed = layout.seed;
    mainPlacements = placements;
    return true;
  }

  function exportLayoutJson() {
    if (!items.length || !mainPlacements) return;

    var numbered = {};
    for (var i = 0; i < items.length; i++) {
      numbered[String(i + 1)] = mainPlacements[i];
    }

    var payload = {
      grid: {
        cols: COMPOSE.cols,
        rows: COMPOSE.rows,
        unit: COMPOSE.unit,
        gap: COMPOSE.gap,
        displayScale: COMPOSE.displayScale
      },
      seed: layoutSeed,
      placements: numbered
    };

    var text = JSON.stringify(payload, null, 2);
    console.log('Save as assets/layout.json (1 = first spreadsheet row):\n\n' + text);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        console.log('Layout copied to clipboard.');
      }).catch(function () {
        console.log('Could not copy to clipboard — use the JSON above.');
      });
    }

    return text;
  }

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      var next = text[i + 1];

      if (c === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(cell);
        cell = '';
      } else if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && next === '\n') i++;
        row.push(cell);
        if (row.some(function (v) { return v.trim(); })) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += c;
      }
    }

    if (cell || row.length) {
      row.push(cell);
      if (row.some(function (v) { return v.trim(); })) rows.push(row);
    }

    return rows;
  }

  function colIndex(header, name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < header.length; i++) {
      if (header[i].trim().toLowerCase() === lower) return i;
    }
    return -1;
  }

  function slugify(name) {
    return String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function parseSheet(text) {
    var rows = parseCSV(text);
    if (!rows.length) return [];

    var header = rows[0].map(function (h) { return h.trim(); });
    var nameIdx = colIndex(header, 'name');
    var categoryIdx = colIndex(header, 'category');
    var yearIdx = colIndex(header, 'year');
    var descIdx = colIndex(header, 'Description');
    var detailsIdx = colIndex(header, 'details');
    var folderIdx = colIndex(header, 'folder');
    var fileIdx = colIndex(header, 'filenames');
    var aspectIdx = colIndex(header, 'aspect');
    var aspect2Idx = colIndex(header, 'aspect2');
    var videoIdx = colIndex(header, 'video');
    var slugsUsed = {};

    if (fileIdx === -1) return [];

    var parsed = [];

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var filename = (row[fileIdx] || '').trim();
      var folder = folderIdx >= 0 ? (row[folderIdx] || '').trim() : '';
      if (!filename || !folder) continue;

      var name = nameIdx >= 0 ? (row[nameIdx] || '').trim() : '';
      var slug = slugify(name) || 'project-' + parsed.length;
      if (slugsUsed[slug]) {
        slug = slug + '-' + parsed.length;
      }
      slugsUsed[slug] = true;

      parsed.push({
        name: name,
        category: categoryIdx >= 0 ? (row[categoryIdx] || '').trim() : '',
        year: yearIdx >= 0 ? (row[yearIdx] || '').trim() : '',
        description: descIdx >= 0 ? (row[descIdx] || '').trim() : '',
        details: detailsIdx >= 0 ? (row[detailsIdx] || '').trim() : '',
        folder: folder,
        filename: filename,
        imagePath: folder + '/' + filename,
        slug: slug,
        cls: 'gallery-item-' + (parsed.length + 1),
        aspect: aspectIdx >= 0 ? (row[aspectIdx] || '').trim().toLowerCase() : '',
        aspect2: aspect2Idx >= 0 ? (row[aspect2Idx] || '').trim().replace(/\s+/g, '').replace(':', '/') : '',
        video: videoIdx >= 0 ? (row[videoIdx] || '').trim().replace(/"+$/, '') : ''
      });
    }

    return parsed;
  }

  function findIndexBySlug(slug) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].slug === slug) return i;
    }
    return -1;
  }

  function getFolderFiles(folder) {
    if (folderManifest[folder]) return folderManifest[folder];
    var keys = Object.keys(folderManifest);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === folder.toLowerCase()) {
        return folderManifest[keys[i]];
      }
    }
    return [];
  }

  function sameFile(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function rectGap(a, b, gap) {
    var dx = Math.max(0, Math.max(a.gx - (b.gx + b.w), b.gx - (a.gx + a.w)));
    var dy = Math.max(0, Math.max(a.gy - (b.gy + b.h), b.gy - (a.gy + a.h)));
    return Math.sqrt(dx * dx + dy * dy);
  }

  function overlapsAny(rect, placed, gap) {
    for (var i = 0; i < placed.length; i++) {
      if (rectGap(rect, placed[i], 0) < gap) return true;
    }
    return false;
  }

  function pickClusters(count, cols, rows, rand) {
    var clusters = [];
    var minDist = 3.5;
    for (var i = 0; i < count; i++) {
      for (var attempt = 0; attempt < 60; attempt++) {
        var c = {
          x: 1 + Math.floor(rand() * (cols - COMPOSE.unit - 2)),
          y: 1 + Math.floor(rand() * (rows - COMPOSE.unit - 2))
        };
        var ok = true;
        for (var j = 0; j < clusters.length; j++) {
          var dx = c.x - clusters[j].x;
          var dy = c.y - clusters[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < minDist) {
            ok = false;
            break;
          }
        }
        if (ok) {
          clusters.push(c);
          break;
        }
      }
    }
    return clusters;
  }

  function generateCandidate(n, rand) {
    var cols = COMPOSE.cols;
    var rows = COMPOSE.rows;
    var unit = COMPOSE.unit;
    var gap = COMPOSE.gap;
    var clusterCount = clamp(Math.round(n / 1.6), 2, 4);
    var clusters = pickClusters(clusterCount, cols, rows, rand);
    if (!clusters.length) return null;

    var assignments = [];
    for (var i = 0; i < n; i++) assignments.push(i % clusters.length);
    shuffle(assignments, rand);

    var placed = [];
    var placements = [];

    for (var p = 0; p < n; p++) {
      var cluster = clusters[assignments[p]];
      var found = false;
      for (var attempt = 0; attempt < 140; attempt++) {
        var gx = clamp(
          cluster.x + Math.floor(rand() * 7) - 3,
          0,
          cols - unit
        );
        var gy = clamp(
          cluster.y + Math.floor(rand() * 7) - 3,
          0,
          rows - unit
        );
        var rect = { gx: gx, gy: gy, w: unit, h: unit };
        if (!overlapsAny(rect, placed, gap)) {
          placed.push(rect);
          placements.push(rect);
          found = true;
          break;
        }
      }
      if (!found) return null;
    }

    return placements;
  }

  function scoreLayout(placements) {
    var cols = COMPOSE.cols;
    var rows = COMPOSE.rows;
    var n = placements.length;
    var cx = 0;
    var cy = 0;
    var left = 0;
    var right = 0;
    var rowBins = {};
    var colBins = {};
    var xs = [];
    var ys = [];

    for (var i = 0; i < n; i++) {
      var p = placements[i];
      var px = p.gx + p.w * 0.5;
      var py = p.gy + p.h * 0.5;
      cx += px;
      cy += py;
      xs.push(px);
      ys.push(py);
      if (px < cols * 0.5) left += 1;
      else right += 1;
      var rowKey = Math.round(py * 2);
      var colKey = Math.round(px * 2);
      rowBins[rowKey] = (rowBins[rowKey] || 0) + 1;
      colBins[colKey] = (colBins[colKey] || 0) + 1;
    }

    cx /= n;
    cy /= n;

    var score = 0;
    score -= Math.pow(cx - cols * 0.5, 2) + Math.pow(cy - rows * 0.5, 2);

    score -= Math.abs(left - right) * 2.5;

    var maxRow = 0;
    var maxCol = 0;
    var rowKeys = Object.keys(rowBins);
    for (var r = 0; r < rowKeys.length; r++) {
      maxRow = Math.max(maxRow, rowBins[rowKeys[r]]);
    }
    var colKeys = Object.keys(colBins);
    for (var c = 0; c < colKeys.length; c++) {
      maxCol = Math.max(maxCol, colBins[colKeys[c]]);
    }
    score -= maxRow * 4;
    score -= maxCol * 4;

    var occupied = {};
    for (var g = 0; g < placements.length; g++) {
      var cell = placements[g];
      for (var yy = cell.gy; yy < cell.gy + cell.h; yy++) {
        for (var xx = cell.gx; xx < cell.gx + cell.w; xx++) {
          occupied[xx + ',' + yy] = true;
        }
      }
    }

    var holePenalty = 0;
    for (var hy = 1; hy < rows - 1; hy++) {
      for (var hx = 1; hx < cols - 1; hx++) {
        if (occupied[hx + ',' + hy]) continue;
        var neighbors = 0;
        if (occupied[(hx - 1) + ',' + hy]) neighbors++;
        if (occupied[(hx + 1) + ',' + hy]) neighbors++;
        if (occupied[hx + ',' + (hy - 1)]) neighbors++;
        if (occupied[hx + ',' + (hy + 1)]) neighbors++;
        if (neighbors === 0) holePenalty += 1.2;
        else if (neighbors >= 3) holePenalty += 0.35;
      }
    }
    score -= holePenalty;

    var sumXY = 0;
    var sumX = 0;
    var sumY = 0;
    for (var d = 0; d < n; d++) {
      sumXY += xs[d] * ys[d];
      sumX += xs[d];
      sumY += ys[d];
    }
    var denom = n * sumXY - sumX * sumY;
    if (denom !== 0) score += Math.min(8, Math.abs(denom) * 0.02);

    var spread = 0;
    for (var s = 0; s < n; s++) {
      spread += Math.sqrt(Math.pow(xs[s] - cx, 2) + Math.pow(ys[s] - cy, 2));
    }
    score += spread * 0.35;

    return score;
  }

  function pickBestLayout(n, seed) {
    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < COMPOSE.candidates; i++) {
      var rand = mulberry32((seed + i * 9973) >>> 0);
      var candidate = generateCandidate(n, rand);
      if (!candidate) continue;
      var s = scoreLayout(candidate);
      if (s > bestScore) {
        bestScore = s;
        best = candidate;
      }
    }
    if (!best) {
      best = [];
      for (var j = 0; j < n; j++) {
        best.push({
          gx: (j % 4) * 3,
          gy: Math.floor(j / 4) * 3,
          w: COMPOSE.unit,
          h: COMPOSE.unit
        });
      }
    }
    return best;
  }

  function collageMetrics() {
    var collage = document.getElementById('gallery-projects');
    if (!collage) return null;
    var W = collage.clientWidth;
    var H = collage.clientHeight;
    return {
      collage: collage,
      W: W,
      H: H,
      cellX: W / COMPOSE.cols,
      cellY: H / COMPOSE.rows
    };
  }

  function readItemLayout(el, fallback) {
    if (!el || !el.classList.contains('gallery-item')) return fallback;
    var style = getComputedStyle(el);
    var col = parseFloat(style.getPropertyValue('--col'));
    if (!isNaN(col)) {
      var row = parseFloat(style.getPropertyValue('--row'));
      var size = parseFloat(style.getPropertyValue('--size'));
      if (isNaN(size)) size = COMPOSE.unit;
      return {
        col: col,
        row: isNaN(row) ? null : row,
        pinX: (style.getPropertyValue('--pin-x').trim() || 'left').toLowerCase(),
        pinY: (style.getPropertyValue('--pin-y').trim() || 'top').toLowerCase(),
        size: size
      };
    }
    var gx = parseFloat(style.getPropertyValue('--gx'));
    var gy = parseFloat(style.getPropertyValue('--gy'));
    var w = parseFloat(style.getPropertyValue('--w'));
    var h = parseFloat(style.getPropertyValue('--h'));
    if (isNaN(w)) w = COMPOSE.unit;
    if (isNaN(h)) h = COMPOSE.unit;
    if (!isNaN(gx) && !isNaN(gy)) {
      return { gx: gx, gy: gy, w: w, h: h };
    }
    return fallback;
  }

  function applyPinPosition(el, p, m, gapPx, itemHeight) {
    el.style.left = 'auto';
    el.style.right = 'auto';
    el.style.top = 'auto';
    el.style.bottom = 'auto';

    if (p.pinX === 'right') {
      el.style.right = (COMPOSE.cols - p.col) * m.cellX + gapPx * 0.5 + 'px';
    } else {
      el.style.left = (p.col - 1) * m.cellX + gapPx * 0.5 + 'px';
    }

    if (p.pinY === 'bottom') {
      var rowFromBottom = p.row != null ? p.row - 1 : 0;
      el.style.bottom = rowFromBottom * ((itemHeight || 0) + gapPx) + gapPx * 0.5 + 'px';
    } else {
      var row = p.row != null ? p.row : 1;
      el.style.top = (row - 1) * m.cellY + gapPx * 0.5 + 'px';
    }
  }

  function layoutCollageItem(el) {
    if (isMobileLayout()) {
      clearCollageItemStyles(el);
      return;
    }

    var m = collageMetrics();
    if (!m) return;

    var p = readItemLayout(el, null);
    if (!p || p.col == null) return;

    var gapPx = Math.max(3, Math.min(m.cellX, m.cellY) * COMPOSE.gap * 0.28);
    var units = p.size != null ? p.size : COMPOSE.unit;
    var sizeW = units * m.cellX - gapPx;
    var sizeH = units * m.cellY - gapPx;
    var size = Math.max(64, Math.min(sizeW, sizeH));
    var h = Math.round(size * 4 / 5);

    el.style.width = size + 'px';
    el.style.height = h + 'px';
    el.style.transform = '';
    el.style.transformOrigin = '';
    applyPinPosition(el, p, m, gapPx, h);
  }

  function applyPlacements(placements, elements) {
    var m = collageMetrics();
    if (!m || !elements.length) return;

    var gapPx = Math.max(3, Math.min(m.cellX, m.cellY) * COMPOSE.gap * 0.28);

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.classList.contains('gallery-item')) continue;

      var p = placements && placements[i] ? placements[i] : null;
      if (!el || !p) continue;

      var units = p.size != null ? p.size : p.w;
      var sizeW = units * m.cellX - gapPx;
      var sizeH = units * m.cellY - gapPx;
      var size = Math.min(sizeW, sizeH);
      size = Math.max(64, size);

      el.style.width = size + 'px';
      el.style.height = Math.round(size * 4 / 5) + 'px';
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.left = p.gx * m.cellX + gapPx * 0.5 + 'px';
      el.style.top = p.gy * m.cellY + gapPx * 0.5 + 'px';
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
  }

  function layoutMainComposition() {
    var collage = document.getElementById('gallery-projects');
    if (!collage || !items.length) return;

    for (var i = 0; i < items.length; i++) {
      var el = collage.querySelector('.' + items[i].cls);
      if (el) layoutCollageItem(el);
    }
  }

  function layoutFocusComposition(item) {
    if (isMobileLayout()) return;

    var collage = document.getElementById('gallery-projects');
    if (!collage) return;

    var extras = collage.querySelectorAll('.focus-extra');
    for (var i = 0; i < extras.length; i++) {
      clearCollageItemStyles(extras[i]);
    }
  }

  function clearFocusExtras() {
    var collage = document.getElementById('gallery-projects');
    if (!collage) return;

    var extras = collage.querySelectorAll('.focus-extra');
    for (var i = 0; i < extras.length; i++) {
      extras[i].remove();
    }
    layoutMainComposition(false);
  }

  function showFocusExtras(item) {
    var collage = document.getElementById('gallery-projects');
    if (!collage) return;

    clearFocusExtras();

    var files = getFolderFiles(item.folder).filter(function (file) {
      return !sameFile(file, item.filename);
    });

    for (var i = 0; i < files.length; i++) {
      var div = document.createElement('div');
      div.className = 'focus-extra';
      var img = document.createElement('img');
      img.className = 'gallery-img';
      img.src = IMG_BASE + item.folder + '/' + files[i];
      img.alt = '';
      div.appendChild(img);
      collage.appendChild(div);
    }

    if (item.video) {
      var videoDiv = document.createElement('div');
      videoDiv.className = 'focus-extra focus-video';
      videoDiv.style.aspectRatio = '5/4';
      videoDiv.style.position = 'relative';
      videoDiv.style.overflow = 'hidden';
      var iframe = document.createElement('iframe');
      iframe.src = toEmbedUrl(item.video);
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.style.cssText = 'position:absolute;top:0;left:50%;height:100%;width:177.78%;transform:translateX(-50%);border:none;';
      videoDiv.appendChild(iframe);
      collage.appendChild(videoDiv);
    }

    layoutFocusComposition(item);

    requestAnimationFrame(function () {
      var extraEls = collage.querySelectorAll('.focus-extra');
      for (var j = 0; j < extraEls.length; j++) {
        (function (el, delay) {
          setTimeout(function () {
            el.classList.add('is-visible');
          }, delay);
        })(extraEls[j], j * 90);
      }
    });
  }

  function toEmbedUrl(url) {
    var gd = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (gd) return 'https://drive.google.com/file/d/' + gd[1] + '/preview';
    return url;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function labelHtml(item) {
    var title = escapeHtml(item.name);
    var year = item.year ? ' (' + escapeHtml(item.year) + ')' : '';
    var category = escapeHtml(item.category);
    return title + year + '<br><span class="label-category">' + category + '</span>';
  }

  function enterFocus(index, updateHistory) {
    if (index < 0 || index >= items.length) return;

    var item = items[index];
    var collage = document.getElementById('gallery-projects');
    if (!collage || !descriptionEl) return;

    activeSlug = item.slug;

    for (var i = 0; i < items.length; i++) {
      var el = collage.querySelector('.' + items[i].cls);
      if (!el) continue;
      el.classList.toggle('is-active', items[i].slug === item.slug);
    }


    var plainText = item.description.replace(/<[^>]*>/g, '');
    var wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
    var isLong = wordCount > 60;
    var metaParts = [];
    if (item.year) metaParts.push('Year: ' + escapeHtml(item.year));
    if (item.category) metaParts.push('Category: ' + escapeHtml(item.category));
    if (item.details) metaParts.push(item.details);
    descriptionEl.innerHTML =
      '<div class="project-desc' + (isLong ? ' is-long' : '') + '">' + item.description + '</div>' +
      '<div class="project-meta">' + metaParts.join('<br>') + '<br><a class="back-link" href="index.html">Back to projects overview. ⮐</a></div>';
    descriptionEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gallery-focus');
    document.title = item.name + ' — csvslv';
    showFocusExtras(item);

    if (updateHistory !== false) {
      history.pushState({ project: item.slug }, '', '#' + item.slug);
    }

    if (isMobileLayout()) {
      var activeEl = collage.querySelector('.' + item.cls);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function exitFocus(updateHistory) {
    var collage = document.getElementById('gallery-projects');
    activeSlug = null;

    if (collage) {
      var activeEls = collage.querySelectorAll('.is-active');
      for (var i = 0; i < activeEls.length; i++) {
        activeEls[i].classList.remove('is-active');
      }
    }

    if (descriptionEl) {
      descriptionEl.innerHTML = '';
      descriptionEl.setAttribute('aria-hidden', 'true');
    }

    clearFocusExtras();
    document.body.classList.remove('gallery-focus');
    document.title = 'csvslv';

    if (updateHistory !== false) {
      history.pushState({ project: null }, '', location.pathname + location.search);
    }
  }

  function handleRoute() {
    var slug = location.hash.replace(/^#/, '');
    if (!slug) {
      if (activeSlug) exitFocus(false);
      return;
    }

    var index = findIndexBySlug(slug);
    if (index >= 0) {
      enterFocus(index, false);
    } else if (activeSlug) {
      exitFocus(false);
    }
  }

  function makeItem(index) {
    var item = items[index];
    var container = document.createElement('div');
    var portrait = item.aspect === 'portrait' || item.aspect === 'v' || item.aspect === 'vertical';
    container.className = 'gallery-item ' + item.cls + (portrait ? ' is-portrait' : '');
    container.dataset.slug = item.slug;
    container.tabIndex = 0;

    var photo = document.createElement('div');
    photo.className = 'gallery-photo';

    var img = document.createElement('img');
    img.className = 'gallery-img';
    img.src = IMG_BASE + item.imagePath;
    img.alt = item.name;
    img.dataset.name = item.name;
    img.dataset.category = item.category;
    img.dataset.year = item.year;
    img.dataset.filename = item.filename;

    var label = document.createElement('div');
    label.className = 'gallery-label';
    label.innerHTML = labelHtml(item);

    photo.appendChild(img);
    container.appendChild(photo);
    container.appendChild(label);
    container.addEventListener('click', function () {
      if (activeSlug === item.slug) {
        exitFocus(true);
      } else {
        enterFocus(index, true);
      }
    });
    return container;
  }

  function renderItems(collage) {
    collage.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      collage.appendChild(makeItem(i));
    }
  }

  function loadCollage() {
    var collage = document.getElementById('gallery-projects');
    descriptionEl = document.getElementById('project-description');
    if (!collage) return;

    fetch(SHEET_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Sheet fetch failed');
        return res.text();
      })
      .then(function (text) {
        return Promise.all([
          fetch(FOLDERS_URL).then(function (res) {
            if (!res.ok) throw new Error('Folder manifest fetch failed');
            return res.json();
          }),
          fetch(LAYOUT_URL).then(function (res) {
            if (!res.ok) return null;
            return res.json();
          }).catch(function () {
            return null;
          })
        ]).then(function (results) {
          return { text: text, manifest: results[0], layout: results[1] };
        });
      })
      .then(function (data) {
        folderManifest = data.manifest;
        items = parseSheet(data.text);
        if (!items.length) return;
        if (data.layout) loadSavedLayout(data.layout);
        renderItems(collage);
        requestAnimationFrame(function () {
          layoutMainComposition();
          syncMobileIntroOffset();
          handleRoute();
        });
      })
      .catch(function (err) {
        console.error('Could not load collage from spreadsheet:', err);
      });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (activeSlug) {
        var idx = findIndexBySlug(activeSlug);
        if (idx >= 0) {
          layoutFocusComposition(items[idx]);
          var collage = document.getElementById('gallery-projects');
          if (collage) {
            var extras = collage.querySelectorAll('.focus-extra');
            for (var i = 0; i < extras.length; i++) {
              extras[i].classList.add('is-visible');
            }
          }
        }
      } else {
        layoutMainComposition();
      }
      syncMobileIntroOffset();
    }, 100);
  });
  window.addEventListener('load', syncMobileIntroOffset);
  MOBILE_MQ.addEventListener('change', syncMobileIntroOffset);
  window.addEventListener('popstate', handleRoute);
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeSlug) exitFocus(true);
  });

  document.addEventListener('click', function (e) {
    if (!activeSlug) return;
    var desc = document.getElementById('project-description');
    if (desc && desc.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.gallery-item')) return;
    if (e.target.closest && e.target.closest('.focus-extra')) return;
    exitFocus(true);
  });

  window.addEventListener('load', function () {
    var name = document.getElementById('name');
    if (name) {
      name.style.cursor = 'pointer';
      name.addEventListener('click', function () {
        if (activeSlug) exitFocus(true);
      });
    }
  });

  window.addEventListener('load', loadCollage);
})();
