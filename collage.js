(function () {
  var IMG_BASE = 'assets/img/';
  var SHEET_URL =
    'https://docs.google.com/spreadsheets/d/13dgF7zdWF2XfN4dEGKMaxWGGMKwQfgvALN5IioWhnpg/gviz/tq?tqx=out:csv&sheet=Foglio1';
  var FOLDERS_URL = 'assets/folders.json';

  // items render in sheet order, one row of 6
  var items = [];
  var folderManifest = {};
  var activeSlug = null;
  var descriptionEl = null;

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
    var i = header.indexOf(name);
    return i === -1 ? -1 : i;
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
    var folderIdx = colIndex(header, 'folder');
    var fileIdx = colIndex(header, 'filenames');
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
        folder: folder,
        filename: filename,
        imagePath: folder + '/' + filename,
        slug: slug,
        cls: 'collage-item-' + parsed.length
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

  function layoutMainGrid() {
    var collage = document.getElementById('collage');
    if (!collage || !items.length) return;

    collage.style.setProperty('--collage-cols', String(items.length));
    for (var i = 0; i < items.length; i++) {
      var el = collage.querySelector('.' + items[i].cls);
      if (el) applyGridPlacement(el, i);
    }
  }

  function layoutFocusRow(item) {
    var collage = document.getElementById('collage');
    if (!collage) return;

    var activeEl = collage.querySelector('.' + item.cls);
    var extras = collage.querySelectorAll('.focus-extra');
    var total = 1 + extras.length;

    collage.style.setProperty('--collage-cols', String(total));
    if (activeEl) {
      activeEl.style.gridColumn = '1';
      activeEl.style.gridRow = '1';
    }
    for (var i = 0; i < extras.length; i++) {
      extras[i].style.gridColumn = String(i + 2);
      extras[i].style.gridRow = '1';
    }
  }

  function clearFocusExtras() {
    var collage = document.getElementById('collage');
    if (!collage) return;

    var extras = collage.querySelectorAll('.focus-extra');
    for (var i = 0; i < extras.length; i++) {
      extras[i].remove();
    }
    layoutMainGrid();
  }

  function showFocusExtras(item) {
    var collage = document.getElementById('collage');
    if (!collage) return;

    clearFocusExtras();

    var files = getFolderFiles(item.folder).filter(function (file) {
      return !sameFile(file, item.filename);
    });

    for (var i = 0; i < files.length; i++) {
      var div = document.createElement('div');
      div.className = 'focus-extra';
      var img = document.createElement('img');
      img.className = 'collage-img';
      img.src = IMG_BASE + item.folder + '/' + files[i];
      img.alt = '';
      div.appendChild(img);
      collage.appendChild(div);
    }

    layoutFocusRow(item);

    requestAnimationFrame(function () {
      var extras = collage.querySelectorAll('.focus-extra');
      for (var j = 0; j < extras.length; j++) {
        (function (el, delay) {
          setTimeout(function () {
            el.classList.add('is-visible');
          }, delay);
        })(extras[j], j * 90);
      }
    });
  }

  function applyGridPlacement(el, index) {
    el.style.gridColumn = String(index + 1);
    el.style.gridRow = '1';
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
    return title + year + '<br>' + category;
  }

  function labelHtml(item) {
    if (index < 0 || index >= items.length) return;

    var item = items[index];
    var collage = document.getElementById('collage');
    if (!collage || !descriptionEl) return;

    activeSlug = item.slug;

    for (var i = 0; i < items.length; i++) {
      var el = collage.querySelector('.' + items[i].cls);
      if (!el) continue;
      el.classList.toggle('is-active', items[i].slug === item.slug);
    }

    descriptionEl.textContent = item.description;
    descriptionEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('collage-focus');
    document.title = item.name + ' — csvslv';
    showFocusExtras(item);

    if (updateHistory !== false) {
      history.pushState({ project: item.slug }, '', '#' + item.slug);
    }
  }

  function exitFocus(updateHistory) {
    var collage = document.getElementById('collage');
    activeSlug = null;

    if (collage) {
      var activeEls = collage.querySelectorAll('.is-active');
      for (var i = 0; i < activeEls.length; i++) {
        activeEls[i].classList.remove('is-active');
      }
    }

    if (descriptionEl) {
      descriptionEl.textContent = '';
      descriptionEl.setAttribute('aria-hidden', 'true');
    }

    clearFocusExtras();
    document.body.classList.remove('collage-focus');
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

  function renderItems(collage) {
    collage.innerHTML = '';

    for (var i = 0; i < items.length; i++) {
      (function (index) {
        var item = items[index];
        var container = document.createElement('div');
        container.className = 'collage-item ' + item.cls;
        container.dataset.slug = item.slug;
        applyGridPlacement(container, index);

        var photo = document.createElement('div');
        photo.className = 'collage-photo';

        var img = document.createElement('img');
        img.className = 'collage-img';
        img.src = IMG_BASE + item.imagePath;
        img.alt = item.name;
        img.dataset.name = item.name;
        img.dataset.category = item.category;
        img.dataset.year = item.year;
        img.dataset.filename = item.filename;

        var label = document.createElement('div');
        label.className = 'collage-label';
        label.innerHTML = labelHtml(item);

        photo.appendChild(img);
        photo.appendChild(label);
        container.appendChild(photo);
        container.addEventListener('click', function () {
          if (activeSlug === item.slug) {
            exitFocus(true);
          } else {
            enterFocus(index, true);
          }
        });
        collage.appendChild(container);
      })(i);
    }
  }

  function loadCollage() {
    var collage = document.getElementById('collage');
    descriptionEl = document.getElementById('project-description');
    if (!collage) return;

    fetch(SHEET_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Sheet fetch failed');
        return res.text();
      })
      .then(function (text) {
        return fetch(FOLDERS_URL).then(function (res) {
          if (!res.ok) throw new Error('Folder manifest fetch failed');
          return res.json().then(function (manifest) {
            return { text: text, manifest: manifest };
          });
        });
      })
      .then(function (data) {
        folderManifest = data.manifest;
        items = parseSheet(data.text);
        if (!items.length) return;
        renderItems(collage);
        layoutMainGrid();
        handleRoute();
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
          layoutFocusRow(items[idx]);
          var collage = document.getElementById('collage');
          if (collage) {
            var extras = collage.querySelectorAll('.focus-extra');
            for (var i = 0; i < extras.length; i++) {
              extras[i].classList.add('is-visible');
            }
          }
        }
      } else {
        layoutMainGrid();
      }
    }, 100);
  });
  window.addEventListener('popstate', handleRoute);
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeSlug) exitFocus(true);
  });
  window.addEventListener('load', loadCollage);
})();
