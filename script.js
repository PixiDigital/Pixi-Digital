/* Pixi Digital – Seitenlogik: Navigation, Formular, Videovorschau */

const WEBHOOK_URL = 'https://hook.eu1.make.com/1ygkrxwp469r6g9ccnttnslmf8v4kak4';

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
  toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
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

// --- Videovorschau: nur abspielen, wenn sichtbar ---------------------------
const reel = document.getElementById('reelVideo');
if (reel) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    reel.controls = true;
  } else {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) reel.play().catch(() => {});
        else reel.pause();
      });
    }, { threshold: 0.25 }).observe(reel);
  }
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

  const errors = {
    name: 'Bitte geben Sie Ihren Namen an.',
    email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.',
    message: 'Bitte beschreiben Sie kurz Ihr Projekt.',
    privacy: 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.',
  };

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
      showStatus('Danke, Ihre Nachricht ist angekommen. Ich melde mich innerhalb von 24 Stunden.');
      return;
    }

    const payload = {
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      message: f.message.value.trim(),
      service: f.service.value,
      budget: f.budget.value,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird gesendet …';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset();
      showStatus('Danke, Ihre Nachricht ist angekommen. Ich melde mich innerhalb von 24 Stunden.');
    } catch (err) {
      showStatus(
        'Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie direkt an contact@pixidigital.io.',
        true
      );
    } finally {
      clearTimeout(timeout);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Anfrage senden';
    }
  });
}
