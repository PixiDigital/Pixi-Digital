/* Pixi Digital – Seitenlogik: Navigation, Formular, Videovorschau */

const WEBHOOK_URL = 'https://hook.eu1.make.com/1ygkrxwp469r6g9ccnttnslmf8v4kak4';

// --- Texte je nach Seitensprache (<html lang="de"> oder "en") ---------------
const TEXT = {
  de: {
    menuOpen: 'Menü öffnen',
    menuClose: 'Menü schließen',
    errors: {
      name: 'Bitte geben Sie Ihren Namen an.',
      email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.',
      message: 'Bitte beschreiben Sie kurz Ihr Projekt.',
      privacy: 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.',
    },
    sent: 'Danke, Ihre Nachricht ist angekommen. Ich melde mich innerhalb von 24 Stunden.',
    failed: 'Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie direkt an contact@pixidigital.io.',
    sending: 'Wird gesendet …',
    submit: 'Anfrage senden',
    files: {
      type: 'Diese Datei kann nicht hochgeladen werden. Erlaubt sind JPG, PNG, WebP und PDF.',
      count: 'Es sind höchstens 5 Dateien möglich.',
      size: 'Die Dateien sind zusammen zu groß (max. 4 MB). Bitte weniger oder kleinere Dateien wählen.',
      remove: 'Entfernen',
    },
  },
  en: {
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
    errors: {
      name: 'Please enter your name.',
      email: 'Please enter a valid email address.',
      message: 'Please briefly describe your project.',
      privacy: 'Please agree to the processing of your details.',
    },
    sent: 'Thank you, your message has arrived. I will get back to you within 24 hours.',
    failed: 'Your message could not be sent. Please try again or write directly to contact@pixidigital.io.',
    sending: 'Sending …',
    submit: 'Send inquiry',
    files: {
      type: 'This file cannot be uploaded. JPG, PNG, WebP and PDF are allowed.',
      count: 'You can add up to 5 files.',
      size: 'The files are too large in total (max. 4 MB). Please choose fewer or smaller files.',
      remove: 'Remove',
    },
  },
};
const t = document.documentElement.lang === 'en' ? TEXT.en : TEXT.de;

// --- Kopfzeile: Hintergrund beim Scrollen ----------------------------------
const header = document.getElementById('siteHeader');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// --- Mobile Navigation -----------------------------------------------------
const toggle = document.getElementById('navToggle');
const nav = document.getElementById('siteNav');

function setMenu(open) {
  header.classList.toggle('menu-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? t.menuClose : t.menuOpen);
}
toggle.addEventListener('click', () => setMenu(!header.classList.contains('menu-open')));
nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && header.classList.contains('menu-open')) {
    setMenu(false);
    toggle.focus();
  }
});

// --- Aktiver Menüpunkt (nur auf der Startseite) -----------------------------
const sectionLinks = [...nav.querySelectorAll('a[href^="#"]:not(.btn)')];
if (sectionLinks.length) {
  const targets = sectionLinks
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      sectionLinks.forEach((a) =>
        a.toggleAttribute('aria-current', a.getAttribute('href') === `#${entry.target.id}`)
      );
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  targets.forEach((t) => spy.observe(t));
}

// --- Videos: nur abspielen, wenn sichtbar ---------------------------------
const autoVideos = document.querySelectorAll('video[data-autoplay]');
if (autoVideos.length) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const watcher = reduce ? null : new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.play().catch(() => {});
      else entry.target.pause();
    });
  }, { threshold: 0.25 });
  autoVideos.forEach((video) => {
    if (reduce) video.controls = true;
    else watcher.observe(video);
  });
}

// --- Kontaktformular -------------------------------------------------------
const form = document.getElementById('contactForm');
if (form) {
  const status = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBtn');
  const serviceSelect = document.getElementById('service');
  const openedAt = Date.now();
  // form.name wäre das Name-Attribut des Formulars, nicht das Feld: daher elements
  const f = form.elements;

  // Klick auf "… anfragen" wählt die passende Leistung vor
  document.querySelectorAll('[data-service]').forEach((link) => {
    link.addEventListener('click', () => {
      serviceSelect.value = link.dataset.service;
    });
  });


  // Beispielbilder: Make nimmt pro Anfrage höchstens 5 MB an, daher werden
  // Fotos vor dem Senden verkleinert und die Gesamtgröße begrenzt.
  const MAX_FILES = 5;
  const MAX_TOTAL = 4 * 1024 * 1024;
  const MAX_EDGE = 2000;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const fileInput = document.getElementById('files');
  const fileList = document.getElementById('fileList');
  const drop = document.getElementById('uploadDrop');
  const filesError = document.getElementById('files-error');
  let chosen = [];

  const totalSize = () => chosen.reduce((sum, c) => sum + c.file.size, 0);
  const formatSize = (bytes) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  async function shrink(file) {
    if (!file.type.startsWith('image/')) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (err) {
      return file;
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 700 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  }

  function renderFiles() {
    fileList.replaceChildren(
      ...chosen.map((c, i) => {
        const li = document.createElement('li');
        li.className = 'upload__item';
        let thumb;
        if (c.url) {
          thumb = document.createElement('img');
          thumb.src = c.url;
          thumb.alt = '';
        } else {
          thumb = document.createElement('span');
          thumb.textContent = 'PDF';
        }
        thumb.className = 'upload__thumb';
        const name = document.createElement('span');
        name.className = 'upload__name';
        name.textContent = c.file.name;
        const size = document.createElement('span');
        size.className = 'upload__size';
        size.textContent = formatSize(c.file.size);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'upload__remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `${t.files.remove}: ${c.file.name}`);
        remove.addEventListener('click', () => {
          if (c.url) URL.revokeObjectURL(c.url);
          chosen.splice(i, 1);
          filesError.textContent = '';
          renderFiles();
          fileInput.focus();
        });
        li.append(thumb, name, size, remove);
        return li;
      })
    );
  }

  function clearFiles() {
    chosen.forEach((c) => c.url && URL.revokeObjectURL(c.url));
    chosen = [];
    filesError.textContent = '';
    renderFiles();
  }

  fileInput.addEventListener('change', async () => {
    const picked = Array.from(fileInput.files);
    filesError.textContent = '';
    for (const original of picked) {
      if (!ALLOWED.includes(original.type)) {
        filesError.textContent = t.files.type;
        continue;
      }
      if (chosen.length >= MAX_FILES) {
        filesError.textContent = t.files.count;
        break;
      }
      let file = await shrink(original);
      // Inhalt sofort einlesen, damit die Datei auch nach dem Leeren des Feldes erhalten bleibt
      if (file === original) file = new File([await original.arrayBuffer()], original.name, { type: original.type });
      if (totalSize() + file.size > MAX_TOTAL) {
        filesError.textContent = t.files.size;
        continue;
      }
      const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      chosen.push({ file, url });
    }
    // Feld leeren, damit dieselbe Datei erneut gewählt werden kann
    fileInput.value = '';
    renderFiles();
  });

  ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, () => drop.classList.add('is-over')));
  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('is-over')));

  const errors = t.errors;

  function setError(id, on) {
    const field = form.querySelector(`#${id}`);
    const msg = form.querySelector(`#${id}-error`);
    field.classList.toggle('has-error', on);
    field.setAttribute('aria-invalid', String(on));
    msg.textContent = on ? errors[id] : '';
  }

  function validate() {
    const email = f.email.value.trim();
    const checks = {
      name: f.name.value.trim().length > 0,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: f.message.value.trim().length > 0,
      privacy: f.privacy.checked,
    };
    let firstInvalid = null;
    Object.entries(checks).forEach(([id, ok]) => {
      setError(id, !ok);
      if (!ok && !firstInvalid) firstInvalid = form.querySelector(`#${id}`);
    });
    return firstInvalid;
  }

  ['name', 'email', 'message'].forEach((id) =>
    form.querySelector(`#${id}`).addEventListener('input', () => setError(id, false))
  );
  f.privacy.addEventListener('change', () => setError('privacy', false));

  function showStatus(text, isError) {
    status.textContent = text;
    status.classList.toggle('is-error', Boolean(isError));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showStatus('');

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    // Spam-Schutz: Honeypot gefüllt oder in unter 3 Sekunden abgeschickt.
    // Bots bekommen eine Erfolgsmeldung, es wird aber nichts gesendet.
    const looksLikeBot = f.website.value !== '' || Date.now() - openedAt < 3000;
    if (looksLikeBot) {
      form.reset();
      clearFiles();
      showStatus(t.sent);
      return;
    }

    // multipart/form-data, damit Make die Bilder als Dateien bekommt
    const payload = new FormData();
    payload.append('name', f.name.value.trim());
    payload.append('email', f.email.value.trim());
    payload.append('message', f.message.value.trim());
    payload.append('service', f.service.value);
    payload.append('budget', f.budget.value);
    // Make liest pro Feldname nur eine Datei, daher file0 bis file4
    chosen.forEach((c, i) => payload.append('file' + i, c.file, c.file.name));

    submitBtn.disabled = true;
    submitBtn.textContent = t.sending;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: payload,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset();
      clearFiles();
      showStatus(t.sent);
    } catch (err) {
      showStatus(t.failed, true);
    } finally {
      clearTimeout(timeout);
      submitBtn.disabled = false;
      submitBtn.textContent = t.submit;
    }
  });
}
