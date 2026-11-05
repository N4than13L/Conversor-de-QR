"use strict";

/*
 * QR Studio
 * Generación, personalización, exportación e historial de códigos QR.
 * Todo se ejecuta en el navegador: no hay peticiones a ningún servidor.
 */
(() => {
  const PREVIEW_SIZE = 640;
  const HISTORY_LIMIT = 20;
  const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  const MOBILE_QUERY = window.matchMedia("(max-width: 900px)");

  const STORAGE_KEYS = {
    settings: "qrstudio.settings.v1",
    history: "qrstudio.history.v1",
    theme: "qrstudio.theme.v1",
  };

  const DEFAULTS = Object.freeze({
    size: 1024,
    margin: 16,
    ecl: "M",
    style: "square",
    fg: "#111827",
    bg: "#ffffff",
    transparent: false,
  });

  // Tipos válidos de qr-code-styling para cada estilo visual.
  const DOT_STYLES = Object.freeze({
    square: "square",
    rounded: "rounded",
    dots: "dots",
    classy: "classy",
  });

  const CORNER_SQUARE_STYLES = Object.freeze({
    square: "square",
    rounded: "extra-rounded",
    dots: "dot",
    classy: "square",
  });

  const CORNER_DOT_STYLES = Object.freeze({
    square: "square",
    rounded: "dot",
    dots: "dot",
    classy: "dot",
  });

  const QR_TYPES = Object.freeze({
    url: "Enlace o texto",
    whatsapp: "WhatsApp",
    social: "Red social",
    wifi: "WiFi",
    email: "Email",
    phone: "Teléfono",
    sms: "SMS",
    vcard: "Contacto",
    location: "Ubicación",
    event: "Evento",
  });

  const TYPE_FIELDS = Object.freeze({
    url: ["texto"],
    whatsapp: ["waPhone", "waMessage"],
    social: ["socialNetwork", "socialHandle"],
    wifi: ["wifiSsid", "wifiSecurity", "wifiPassword", "wifiHidden"],
    email: ["emailTo", "emailSubject", "emailBody"],
    phone: ["phoneNumber"],
    sms: ["smsNumber", "smsMessage"],
    vcard: [
      "vcardFirst",
      "vcardLast",
      "vcardOrg",
      "vcardTitle",
      "vcardPhone",
      "vcardEmail",
      "vcardWebsite",
      "vcardAddress",
    ],
    location: ["locationQuery", "locationLat", "locationLng"],
    event: [
      "eventTitle",
      "eventStart",
      "eventEnd",
      "eventLocation",
      "eventDetails",
    ],
  });

  const SOCIAL_NETWORKS = Object.freeze({
    instagram: { label: "Instagram", base: "https://instagram.com/" },
    tiktok: { label: "TikTok", base: "https://tiktok.com/@" },
    facebook: { label: "Facebook", base: "https://facebook.com/" },
    x: { label: "X", base: "https://x.com/" },
    telegram: { label: "Telegram", base: "https://t.me/" },
    linkedin: {
      label: "LinkedIn",
      base: "https://www.linkedin.com/in/",
    },
    youtube: { label: "YouTube", base: "https://youtube.com/@" },
    discord: { label: "Discord", base: "https://discord.gg/" },
    threads: { label: "Threads", base: "https://threads.net/@" },
    bluesky: { label: "Bluesky", base: "https://bsky.app/profile/" },
    pinterest: { label: "Pinterest", base: "https://pinterest.com/" },
    twitch: { label: "Twitch", base: "https://twitch.tv/" },
    spotify: { label: "Spotify", base: "https://open.spotify.com/user/" },
  });

  const TYPE_EMPTY_HINTS = Object.freeze({
    url: "Escribe una URL o un texto para generar el QR.",
    whatsapp: "Escribe el número de WhatsApp para generar el QR.",
    social: "Escribe el usuario o enlace del perfil.",
    wifi: "Escribe el nombre de la red WiFi.",
    email: "Escribe la dirección de email.",
    phone: "Escribe el número de teléfono.",
    sms: "Escribe el número de teléfono para el SMS.",
    vcard: "Escribe al menos el nombre o la empresa del contacto.",
    location: "Escribe un lugar o las coordenadas.",
    event: "Escribe el título y la fecha de inicio del evento.",
  });

  const TYPE_FOCUS_FIELDS = Object.freeze({
    url: "texto",
    whatsapp: "waPhone",
    social: "socialHandle",
    wifi: "wifiSsid",
    email: "emailTo",
    phone: "phoneNumber",
    sms: "smsNumber",
    vcard: "vcardFirst",
    location: "locationQuery",
    event: "eventTitle",
  });

  const HEX_RE = /^#[0-9a-f]{6}$/i;
  const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
  const DOMAIN_RE =
    /^(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i;

  let settings = { ...DEFAULTS };
  let history = [];
  let qrType = "url";
  let currentText = "";
  let currentContent = {
    type: "url",
    text: "",
    label: "",
    fields: {},
    empty: true,
    error: "",
  };
  let logoDataUrl = "";
  let preview = null;
  let canExport = false;
  let busy = false;
  let renderTimer = 0;
  let miniEligible = false;
  let qrInView = false;
  let miniSyncToken = 0;
  let miniObserver = null;

  const el = {};
  let exportButtons = [];

  let relativeFormatter = null;
  try {
    relativeFormatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  } catch (error) {
    relativeFormatter = null;
  }

  /* =========================================================
     Utilidades
     ========================================================= */

  function readJSON(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function persistSettings() {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.settings,
        JSON.stringify(settings)
      );
    } catch (error) {
      // El almacenamiento puede estar lleno o deshabilitado.
    }
  }

  function saveHistory() {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.history,
        JSON.stringify(history)
      );
    } catch (error) {
      // Si no se puede guardar, el historial sigue funcionando en memoria.
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function uid() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      "qr-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function sortHistory(a, b) {
    return (
      Number(b.favorite) - Number(a.favorite) || b.createdAt - a.createdAt
    );
  }

  function formatRelative(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.round(diff / 60000);

    if (minutes < 1) {
      return "ahora mismo";
    }

    if (relativeFormatter) {
      if (minutes < 60) {
        return relativeFormatter.format(-minutes, "minute");
      }

      const hours = Math.round(minutes / 60);
      if (hours < 24) {
        return relativeFormatter.format(-hours, "hour");
      }

      const days = Math.round(hours / 24);
      if (days < 7) {
        return relativeFormatter.format(-days, "day");
      }
    }

    return new Intl.DateTimeFormat("es", {
      day: "numeric",
      month: "short",
    }).format(timestamp);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return character;
      }
    });
  }

  function normalizeInput(value) {
    const text = value.trim();

    if (!text) {
      return "";
    }

    if (SCHEME_RE.test(text) || /\s/.test(text)) {
      return text;
    }

    return DOMAIN_RE.test(text) ? "https://" + text : text;
  }

  function cleanPhoneDigits(value) {
    return value.replace(/^00/, "").replace(/\D/g, "");
  }

  function cleanTel(value) {
    return value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function escapeWifi(value) {
    return String(value).replace(/([\\;,:"])/g, "\\$1");
  }

  function escapeVCard(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function parseCoordinate(value) {
    const text = String(value).trim().replace(",", ".");

    if (!text) {
      return null;
    }

    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }

  function formatCalendarDate(date) {
    return date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  }

  function ensureProtocol(value) {
    const text = value.trim();

    if (!text || SCHEME_RE.test(text)) {
      return text;
    }

    return "https://" + text;
  }

  function hexToRgb(hex) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    if (!match) {
      return { r: 0, g: 0, b: 0 };
    }

    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
    };
  }

  function luminance(hex) {
    const rgb = hexToRgb(hex);
    const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    });

    return (
      0.2126 * channels[0] +
      0.7152 * channels[1] +
      0.0722 * channels[2]
    );
  }

  function contrastRatio(foreground, background) {
    const first = luminance(foreground);
    const second = luminance(background);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /* =========================================================
     Estado persistente
     ========================================================= */

  function loadSettings() {
    const stored = readJSON(STORAGE_KEYS.settings, {});
    const source = stored && typeof stored === "object" ? stored : {};
    const next = { ...DEFAULTS, ...source };

    const sizes = [512, 1024, 2048, 4096];
    const size = Number(next.size);
    next.size = sizes.includes(size) ? size : DEFAULTS.size;

    const margin = Number(next.margin);
    next.margin = Number.isFinite(margin)
      ? Math.round(clamp(margin, 0, 64) / 4) * 4
      : DEFAULTS.margin;

    next.ecl = ["L", "M", "Q", "H"].includes(next.ecl)
      ? next.ecl
      : DEFAULTS.ecl;

    next.style = Object.prototype.hasOwnProperty.call(
      DOT_STYLES,
      next.style
    )
      ? next.style
      : DEFAULTS.style;

    next.fg = typeof next.fg === "string" && HEX_RE.test(next.fg)
      ? next.fg
      : DEFAULTS.fg;

    next.bg = typeof next.bg === "string" && HEX_RE.test(next.bg)
      ? next.bg
      : DEFAULTS.bg;

    next.transparent = Boolean(next.transparent);

    return next;
  }

  function loadHistory() {
    const stored = readJSON(STORAGE_KEYS.history, []);

    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .filter(
        (item) =>
          item &&
          typeof item.text === "string" &&
          item.text.trim() &&
          Number.isFinite(Number(item.createdAt))
      )
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : uid(),
        type:
          typeof item.type === "string" && QR_TYPES[item.type]
            ? item.type
            : "url",
        text: item.text.slice(0, 3000),
        label:
          typeof item.label === "string" && item.label.trim()
            ? item.label.slice(0, 200)
            : formatMiniLabel(item.text),
        fields:
          item.fields &&
          typeof item.fields === "object" &&
          !Array.isArray(item.fields)
            ? item.fields
            : null,
        createdAt: Number(item.createdAt),
        favorite: Boolean(item.favorite),
      }))
      .sort(sortHistory)
      .slice(0, HISTORY_LIMIT);
  }

  /* =========================================================
     Referencias del DOM
     ========================================================= */

  function cacheElements() {
    el.form = document.getElementById("qrForm");
    el.qrType = document.getElementById("qrType");
    el.typePanels = document.getElementById("typePanels");
    el.texto = document.getElementById("texto");
    el.charCount = document.getElementById("charCount");
    el.pasteBtn = document.getElementById("pasteBtn");
    el.limpiar = document.getElementById("limpiar");

    Object.values(TYPE_FIELDS)
      .flat()
      .forEach((id) => {
        if (!el[id]) {
          el[id] = document.getElementById(id);
        }
      });

    el.size = document.getElementById("size");
    el.margin = document.getElementById("margin");
    el.marginValue = document.getElementById("marginValue");
    el.ecl = document.getElementById("ecl");
    el.dotStyle = document.getElementById("dotStyle");
    el.fg = document.getElementById("fg");
    el.fgValue = document.getElementById("fgValue");
    el.bg = document.getElementById("bg");
    el.bgValue = document.getElementById("bgValue");
    el.transparent = document.getElementById("transparent");
    el.contrastHint = document.getElementById("contrastHint");
    el.settings = document.getElementById("settings");

    el.logo = document.getElementById("logo");
    el.logoInfo = document.getElementById("logoInfo");
    el.logoThumb = document.getElementById("logoThumb");
    el.logoName = document.getElementById("logoName");
    el.removeLogo = document.getElementById("removeLogo");
    el.logoHint = document.getElementById("logoHint");

    el.historyCount = document.getElementById("historyCount");
    el.historyEmpty = document.getElementById("historyEmpty");
    el.historyList = document.getElementById("historyList");
    el.clearHistory = document.getElementById("clearHistory");

    el.previewCard = document.getElementById("previewCard");
    el.sizeBadge = document.getElementById("sizeBadge");
    el.qrFrame = document.getElementById("qrFrame");
    el.qrPreview = document.getElementById("qrPreview");
    el.status = document.getElementById("status");

    el.miniPreview = document.getElementById("miniPreview");
    el.miniCanvas = document.getElementById("miniCanvas");
    el.miniText = document.getElementById("miniText");
    el.miniBadge = document.getElementById("miniBadge");
    el.miniAction = document.getElementById("miniAction");

    el.downloadPng = document.getElementById("downloadPng");
    el.downloadSvg = document.getElementById("downloadSvg");
    el.copyBtn = document.getElementById("copyBtn");
    el.shareBtn = document.getElementById("shareBtn");
    el.printBtn = document.getElementById("printBtn");

    el.themeToggle = document.getElementById("themeToggle");

    exportButtons = [
      el.downloadPng,
      el.downloadSvg,
      el.copyBtn,
      el.shareBtn,
      el.printBtn,
    ];
  }

  /* =========================================================
     Ajustes e interfaz
     ========================================================= */

  function applySettingsToForm() {
    el.size.value = String(settings.size);
    el.margin.value = String(settings.margin);
    el.marginValue.textContent = settings.margin + " px";
    el.ecl.value = settings.ecl;
    el.dotStyle.value = settings.style;
    el.fg.value = settings.fg;
    el.bg.value = settings.bg;
    el.fgValue.textContent = settings.fg.toUpperCase();
    el.bgValue.textContent = settings.bg.toUpperCase();
    el.transparent.checked = settings.transparent;
    el.bg.disabled = settings.transparent;
    updateContrastHint();
    updateLogoHint();
  }

  function updateContrastHint() {
    const background = settings.transparent ? "#ffffff" : settings.bg;
    const ratio = contrastRatio(settings.fg, background);
    const lowContrast = ratio < 3.5;

    el.contrastHint.hidden = !lowContrast;
    el.contrastHint.textContent = lowContrast
      ? "Contraste bajo: el QR podría no leerse bien. Usa un color más oscuro o un fondo más claro."
      : "";
  }

  function updateLogoHint() {
    el.logoHint.hidden = !(logoDataUrl && settings.ecl !== "H");
  }

  function updateCounter(length) {
    const total =
      typeof length === "number"
        ? length
        : (currentContent.text || "").length;
    el.charCount.textContent =
      total + " " + (total === 1 ? "carácter" : "caracteres");
  }

  function updateActionState() {
    const enabled = canExport && Boolean(currentText) && !busy;
    exportButtons.forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function setBusy(value) {
    busy = Boolean(value);
    updateActionState();
  }

  function setStatus(message, type) {
    el.status.textContent = message || "";
    el.status.className = "status" + (type ? " " + type : "");
  }

  function setEmptyState(empty) {
    el.qrFrame.classList.toggle("is-empty", Boolean(empty));
    miniEligible = !empty;

    if (empty) {
      el.qrPreview.setAttribute("aria-hidden", "true");
      clearMiniPreview();
      updateMiniVisibility();
      return;
    }

    el.qrPreview.removeAttribute("aria-hidden");
    const rawLabel =
      currentContent.label || formatMiniLabel(currentContent.text || "");
    const label =
      rawLabel.length > 120 ? rawLabel.slice(0, 117) + "..." : rawLabel;
    el.qrPreview.setAttribute(
      "aria-label",
      "Código QR que contiene: " + label
    );
    updateMiniInfo();
    updateMiniVisibility();
  }

  function scrollPreviewIntoView() {
    if (MOBILE_QUERY.matches) {
      el.previewCard.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function popPreview() {
    el.qrPreview.classList.remove("pop");
    // Fuerza el reinicio de la animación.
    void el.qrPreview.offsetWidth;
    el.qrPreview.classList.add("pop");
    window.setTimeout(() => {
      el.qrPreview.classList.remove("pop");
    }, 260);
  }

  /* =========================================================
     Vista previa rápida (móvil)
     ========================================================= */

  function formatMiniLabel(text) {
    try {
      const url = new URL(text);

      if (url.hostname) {
        const path =
          (url.pathname === "/" ? "" : url.pathname) + url.search;
        return url.hostname.replace(/^www\./i, "") + path;
      }

      if (/^(mailto|tel):/i.test(text)) {
        return text.replace(/^(mailto|tel):/i, "");
      }
    } catch (error) {
      // El contenido no es una URL: se muestra tal cual.
    }

    return text;
  }

  function updateMiniInfo() {
    const hasContent = Boolean(currentContent.text);
    const label = currentContent.label || formatMiniLabel(currentContent.text);

    el.miniText.textContent = hasContent ? label : "";

    if (hasContent) {
      el.miniText.title = currentContent.text;
    } else {
      el.miniText.removeAttribute("title");
    }

    el.miniBadge.textContent = hasContent ? settings.size + " px" : "—";
  }

  function clearMiniPreview() {
    miniSyncToken++;
    const context = el.miniCanvas.getContext("2d");

    if (context) {
      context.clearRect(0, 0, el.miniCanvas.width, el.miniCanvas.height);
    }

    el.miniText.textContent = "";
    el.miniText.removeAttribute("title");
    el.miniBadge.textContent = "—";
  }

  function isQrFrameVisible() {
    const rect = el.qrFrame.getBoundingClientRect();

    if (!rect.height) {
      return false;
    }

    const visible =
      Math.min(rect.bottom, window.innerHeight) -
      Math.max(rect.top, 72);

    return visible / rect.height >= 0.35;
  }

  function updateMiniVisibility() {
    const visible = Boolean(
      miniEligible &&
        currentText &&
        MOBILE_QUERY.matches &&
        !qrInView
    );

    el.miniPreview.classList.toggle("is-visible", visible);
    el.miniPreview.toggleAttribute("inert", !visible);
    el.miniPreview.setAttribute(
      "aria-hidden",
      visible ? "false" : "true"
    );
  }

  function drawMiniPreview() {
    const source = el.qrPreview.querySelector("canvas");
    const target = el.miniCanvas;

    if (!source || !target) {
      return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = target.clientWidth || 50;
    const size = Math.max(1, Math.round(cssSize * ratio));

    if (target.width !== size || target.height !== size) {
      target.width = size;
      target.height = size;
    }

    const context = target.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, size, size);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, size, size);
  }

  function scheduleMiniSync() {
    if (!MOBILE_QUERY.matches) {
      return;
    }

    const token = ++miniSyncToken;

    [0, 80, 200, 450].forEach((delay) => {
      window.setTimeout(() => {
        if (token === miniSyncToken) {
          drawMiniPreview();
        }
      }, delay);
    });
  }

  function handleMobileLayoutChange(event) {
    qrInView = event.matches ? isQrFrameVisible() : true;

    if (event.matches) {
      scheduleMiniSync();
    }

    updateMiniVisibility();
  }

  function setupMiniPreview() {
    if ("IntersectionObserver" in window) {
      miniObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          qrInView =
            entry.isIntersecting && entry.intersectionRatio >= 0.35;
          updateMiniVisibility();
        },
        {
          threshold: [0, 0.35, 0.6, 1],
          rootMargin: "-72px 0px 0px 0px",
        }
      );

      miniObserver.observe(el.qrFrame);
    } else {
      const onScroll = () => {
        qrInView = isQrFrameVisible();
        updateMiniVisibility();
      };

      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }

    qrInView = isQrFrameVisible();

    if (typeof MOBILE_QUERY.addEventListener === "function") {
      MOBILE_QUERY.addEventListener("change", handleMobileLayoutChange);
    } else if (typeof MOBILE_QUERY.addListener === "function") {
      MOBILE_QUERY.addListener(handleMobileLayoutChange);
    }

    el.miniAction.addEventListener("click", () => {
      scrollPreviewIntoView();
      popPreview();
    });

    updateMiniVisibility();
  }

  /* =========================================================
     Generación y vista previa
     ========================================================= */

  function buildOptions(size, type, isPreview) {
    const margin = isPreview
      ? Math.max(
          0,
          Math.round((settings.margin * size) / settings.size)
        )
      : settings.margin;

    return {
      width: size,
      height: size,
      type: type,
      data: currentText,
      margin: margin,
      qrOptions: {
        errorCorrectionLevel: settings.ecl,
      },
      dotsOptions: {
        color: settings.fg,
        type: DOT_STYLES[settings.style],
      },
      cornersSquareOptions: {
        color: settings.fg,
        type: CORNER_SQUARE_STYLES[settings.style],
      },
      cornersDotOptions: {
        color: settings.fg,
        type: CORNER_DOT_STYLES[settings.style],
      },
      backgroundOptions: {
        color: settings.transparent ? "transparent" : settings.bg,
      },
      image: logoDataUrl || "",
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: 0.36,
        margin: Math.round(size * 0.012),
        crossOrigin: "anonymous",
      },
    };
  }

  function snapshotFields(type) {
    const fields = {};

    (TYPE_FIELDS[type] || []).forEach((id) => {
      const field = el[id];

      if (!field) {
        return;
      }

      fields[id] =
        field.type === "checkbox" ? field.checked : field.value;
    });

    return fields;
  }

  function applyFields(type, fields) {
    if (!fields) {
      return;
    }

    (TYPE_FIELDS[type] || []).forEach((id) => {
      const field = el[id];

      if (!field || !(id in fields)) {
        return;
      }

      if (field.type === "checkbox") {
        field.checked = Boolean(fields[id]);
        return;
      }

      field.value = fields[id] === null ? "" : String(fields[id]);

      if (field.tagName === "SELECT" && !field.value) {
        field.selectedIndex = 0;
      }
    });
  }

  function clearFields(type) {
    (TYPE_FIELDS[type] || []).forEach((id) => {
      const field = el[id];

      if (!field) {
        return;
      }

      if (field.type === "checkbox") {
        field.checked = false;
      } else if (field.tagName === "SELECT") {
        field.selectedIndex = 0;
      } else {
        field.value = "";
      }
    });
  }

  function setQrType(type, options) {
    const config = options || {};
    const next = QR_TYPES[type] ? type : "url";

    qrType = next;

    if (el.qrType && el.qrType.value !== next) {
      el.qrType.value = next;
    }

    if (el.typePanels) {
      el.typePanels
        .querySelectorAll(".type-panel")
        .forEach((panel) => {
          panel.hidden = panel.dataset.type !== next;
        });
    }

    setStatus("");

    if (config.render !== false) {
      renderPreview();
    }
  }

  function focusActiveField() {
    const preferred = {
      wifi: [el.wifiSsid, el.wifiPassword],
      vcard: [el.vcardFirst, el.vcardOrg],
      location: [el.locationQuery, el.locationLat, el.locationLng],
      event: [el.eventTitle, el.eventStart],
    };
    const fields =
      preferred[qrType] || [el[TYPE_FOCUS_FIELDS[qrType]]];
    const target =
      fields.find(
        (field) => field && !String(field.value || "").trim()
      ) || fields[0];

    if (target) {
      target.focus();
    }
  }

  function handleContentInput() {
    const preview = buildContent();

    updateCounter(preview.text.length);
    setStatus("");
    schedulePreview();
  }

  function contentResult(text, label, options) {
    const extra = options || {};

    return {
      text: text || "",
      label: label || "",
      empty: Boolean(extra.empty),
      error: extra.error || "",
    };
  }

  function buildSocialUrl(network, rawValue) {
    const value = rawValue.trim();
    const config = SOCIAL_NETWORKS[network] || SOCIAL_NETWORKS.instagram;

    if (!value) {
      return "";
    }

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (/^www\./i.test(value)) {
      return "https://" + value;
    }

    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}\//i.test(value)) {
      return "https://" + value;
    }

    const handle = value.replace(/^@+/, "").replace(/\/+$/, "");
    return handle ? config.base + handle : "";
  }

  function buildContent() {
    let result;

    switch (qrType) {
      case "whatsapp": {
        const rawPhone = el.waPhone.value.trim();
        const message = el.waMessage.value.trim();
        const phone = cleanPhoneDigits(rawPhone);

        if (!rawPhone && !message) {
          result = contentResult("", "", { empty: true });
        } else if (!phone) {
          result = contentResult("", "", {
            error: "Escribe un número de WhatsApp válido.",
          });
        } else if (phone.length < 8 || phone.length > 15) {
          result = contentResult("", "", {
            error:
              "El número de WhatsApp debe incluir el prefijo del país (entre 8 y 15 dígitos).",
          });
        } else {
          const text =
            "https://wa.me/" +
            phone +
            (message ? "?text=" + encodeURIComponent(message) : "");
          result = contentResult(text, "WhatsApp · +" + phone);
        }
        break;
      }

      case "social": {
        const network = SOCIAL_NETWORKS[el.socialNetwork.value]
          ? el.socialNetwork.value
          : "instagram";
        const raw = el.socialHandle.value.trim();

        if (!raw) {
          result = contentResult("", "", { empty: true });
        } else {
          const text = buildSocialUrl(network, raw);
          const info = SOCIAL_NETWORKS[network];
          const handle = raw.replace(/^@+/, "").replace(/\/+$/, "");

          result = text
            ? contentResult(
                text,
                info.label +
                  " · " +
                  (handle || formatMiniLabel(text))
              )
            : contentResult("", "", {
                error: "Escribe un usuario o un enlace válido.",
              });
        }
        break;
      }

      case "wifi": {
        const ssid = el.wifiSsid.value.trim();
        const security = el.wifiSecurity.value;
        const password = el.wifiPassword.value;
        const hidden = el.wifiHidden.checked;

        if (!ssid && !password) {
          result = contentResult("", "", { empty: true });
        } else if (!ssid) {
          result = contentResult("", "", {
            error: "Escribe el nombre de la red WiFi.",
          });
        } else if (security !== "nopass" && !password) {
          result = contentResult("", "", {
            error:
              "Escribe la contraseña de la red o elige «Sin contraseña».",
          });
        } else {
          const text =
            "WIFI:T:" +
            security +
            ";S:" +
            escapeWifi(ssid) +
            ";" +
            (security !== "nopass" && password
              ? "P:" + escapeWifi(password) + ";"
              : "") +
            (hidden ? "H:true;" : "") +
            ";";

          result = contentResult(text, "WiFi · " + ssid);
        }
        break;
      }

      case "email": {
        const address = el.emailTo.value.trim();
        const subject = el.emailSubject.value.trim();
        const body = el.emailBody.value;

        if (!address && !subject && !body.trim()) {
          result = contentResult("", "", { empty: true });
        } else if (!address) {
          result = contentResult("", "", {
            error: "Escribe la dirección de email.",
          });
        } else if (!isValidEmail(address)) {
          result = contentResult("", "", {
            error: "La dirección de email no parece válida.",
          });
        } else {
          const params = [];

          if (subject) {
            params.push("subject=" + encodeURIComponent(subject));
          }

          if (body.trim()) {
            params.push("body=" + encodeURIComponent(body));
          }

          const text =
            "mailto:" +
            address +
            (params.length ? "?" + params.join("&") : "");

          result = contentResult(text, "Email · " + address);
        }
        break;
      }

      case "phone": {
        const raw = el.phoneNumber.value.trim();
        const tel = cleanTel(raw);

        if (!raw) {
          result = contentResult("", "", { empty: true });
        } else if (tel.replace(/\D/g, "").length < 5) {
          result = contentResult("", "", {
            error: "Escribe un número de teléfono válido.",
          });
        } else {
          result = contentResult("tel:" + tel, "Teléfono · " + tel);
        }
        break;
      }

      case "sms": {
        const number = cleanTel(el.smsNumber.value);
        const message = el.smsMessage.value.trim();
        const hasInput = Boolean(el.smsNumber.value.trim() || message);

        if (!hasInput) {
          result = contentResult("", "", { empty: true });
        } else if (number.replace(/\D/g, "").length < 5) {
          result = contentResult("", "", {
            error: "Escribe un número de teléfono válido para el SMS.",
          });
        } else {
          result = contentResult(
            "SMSTO:" + number + ":" + message,
            "SMS · " + number
          );
        }
        break;
      }

      case "vcard": {
        const first = el.vcardFirst.value.trim();
        const last = el.vcardLast.value.trim();
        const org = el.vcardOrg.value.trim();
        const title = el.vcardTitle.value.trim();
        const phone = el.vcardPhone.value.trim();
        const email = el.vcardEmail.value.trim();
        const website = el.vcardWebsite.value.trim();
        const address = el.vcardAddress.value.trim();
        const hasInput = Boolean(
          first ||
            last ||
            org ||
            title ||
            phone ||
            email ||
            website ||
            address
        );

        if (!hasInput) {
          result = contentResult("", "", { empty: true });
        } else if (!first && !last && !org) {
          result = contentResult("", "", {
            error: "Escribe el nombre o la empresa del contacto.",
          });
        } else if (email && !isValidEmail(email)) {
          result = contentResult("", "", {
            error: "La dirección de email del contacto no es válida.",
          });
        } else {
          const displayName =
            [first, last].filter(Boolean).join(" ") || org;
          const lines = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            "N:" +
              escapeVCard(last) +
              ";" +
              escapeVCard(first) +
              ";;;",
            "FN:" + escapeVCard(displayName),
          ];

          if (org) {
            lines.push("ORG:" + escapeVCard(org));
          }

          if (title) {
            lines.push("TITLE:" + escapeVCard(title));
          }

          if (phone) {
            lines.push("TEL;TYPE=CELL:" + escapeVCard(phone));
          }

          if (email) {
            lines.push("EMAIL;TYPE=INTERNET:" + escapeVCard(email));
          }

          if (website) {
            lines.push("URL:" + escapeVCard(ensureProtocol(website)));
          }

          if (address) {
            lines.push(
              "ADR;TYPE=WORK:;;" + escapeVCard(address) + ";;;;"
            );
          }

          lines.push("END:VCARD");

          result = contentResult(
            lines.join("\r\n"),
            "Contacto · " + displayName
          );
        }
        break;
      }

      case "location": {
        const query = el.locationQuery.value.trim();
        const lat = parseCoordinate(el.locationLat.value);
        const lng = parseCoordinate(el.locationLng.value);
        const hasInput = Boolean(query) || lat !== null || lng !== null;

        if (!hasInput) {
          result = contentResult("", "", { empty: true });
        } else if ((lat === null) !== (lng === null)) {
          result = contentResult("", "", {
            error:
              "Indica latitud y longitud juntas, o solo un lugar o dirección.",
          });
        } else if (
          lat !== null &&
          (Number.isNaN(lat) ||
            Number.isNaN(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180)
        ) {
          result = contentResult("", "", {
            error:
              "Las coordenadas no son válidas. La latitud va de -90 a 90 y la longitud de -180 a 180.",
          });
        } else {
          const coords =
            lat !== null ? lat + "," + lng : "";
          const text =
            "https://www.google.com/maps?q=" +
            encodeURIComponent(coords || query);

          result = contentResult(
            text,
            "Ubicación · " + (query || coords)
          );
        }
        break;
      }

      case "event": {
        const title = el.eventTitle.value.trim();
        const startRaw = el.eventStart.value;
        const endRaw = el.eventEnd.value;
        const location = el.eventLocation.value.trim();
        const details = el.eventDetails.value.trim();
        const hasInput = Boolean(
          title || startRaw || endRaw || location || details
        );

        if (!hasInput) {
          result = contentResult("", "", { empty: true });
        } else if (!title) {
          result = contentResult("", "", {
            error: "Escribe el título del evento.",
          });
        } else if (!startRaw) {
          result = contentResult("", "", {
            error: "Indica la fecha y hora de inicio del evento.",
          });
        } else {
          const start = new Date(startRaw);
          const end = endRaw
            ? new Date(endRaw)
            : new Date(start.getTime() + 60 * 60 * 1000);

          if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime())
          ) {
            result = contentResult("", "", {
              error: "Las fechas del evento no son válidas.",
            });
          } else if (end <= start) {
            result = contentResult("", "", {
              error:
                "La fecha de fin debe ser posterior a la fecha de inicio.",
            });
          } else {
            const params = new URLSearchParams({
              action: "TEMPLATE",
              text: title,
              dates:
                formatCalendarDate(start) +
                "/" +
                formatCalendarDate(end),
            });

            if (location) {
              params.set("location", location);
            }

            if (details) {
              params.set("details", details);
            }

            result = contentResult(
              "https://calendar.google.com/calendar/render?" +
                params.toString(),
              "Evento · " + title
            );
          }
        }
        break;
      }

      default: {
        const raw = el.texto.value.trim();

        if (!raw) {
          result = contentResult("", "", { empty: true });
        } else {
          const text = normalizeInput(raw);
          result = contentResult(text, formatMiniLabel(text));
        }
      }
    }

    return {
      ...result,
      type: qrType,
      fields: snapshotFields(qrType),
    };
  }

  function renderPreview() {
    window.clearTimeout(renderTimer);

    const content = buildContent();
    currentContent = content;
    updateCounter(content.text.length);

    if (!content.text) {
      currentText = "";
      canExport = false;
      setEmptyState(true);
      updateActionState();
      el.sizeBadge.textContent = "—";
      return false;
    }

    currentText = content.text;

    try {
      const options = buildOptions(PREVIEW_SIZE, "canvas", true);

      if (!preview) {
        preview = new window.QRCodeStyling(options);
        preview.append(el.qrPreview);
      } else {
        preview.update(options);
      }

      canExport = true;
      setEmptyState(false);
      updateActionState();
      el.sizeBadge.textContent = settings.size + " px";
      scheduleMiniSync();
      return true;
    } catch (error) {
      console.error("No se pudo generar el código QR:", error);
      canExport = false;
      setEmptyState(true);
      updateActionState();
      el.sizeBadge.textContent = "—";
      setStatus(
        "No se pudo generar el QR. El contenido es demasiado largo o los ajustes no son válidos.",
        "error"
      );
      return false;
    }
  }

  function schedulePreview(delay) {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderPreview, delay || 220);
  }

  /* =========================================================
     Exportación
     ========================================================= */

  async function getExportBlob(format) {
    const type = format === "svg" ? "svg" : "canvas";
    const qr = new window.QRCodeStyling(
      buildOptions(settings.size, type, false)
    );
    const raw = await qr.getRawData(format);

    if (raw instanceof Blob) {
      return raw;
    }

    return new Blob([raw], {
      type: format === "svg" ? "image/svg+xml" : "image/png",
    });
  }

  function buildFilename(format) {
    let base = "codigo-qr";
    const label = (currentContent.label || "").trim();

    if (label) {
      const slug = label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

      if (slug) {
        base = "qr-" + slug;
      }
    }

    const now = new Date();
    const stamp =
      now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate());

    return base + "-" + stamp + "." + format;
  }

  async function handleDownload(format) {
    if (!currentText || busy || !canExport) {
      return;
    }

    setBusy(true);
    setStatus("Generando " + format.toUpperCase() + "…");

    try {
      const blob = await getExportBlob(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = buildFilename(format);
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 2000);

      addToHistory();
      setStatus("Descarga " + format.toUpperCase() + " lista.", "success");
    } catch (error) {
      console.error("Error al exportar:", error);
      setStatus(
        "No se pudo generar el archivo. Prueba con otro tamaño o revisa el contenido.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!currentText || busy || !canExport) {
      return;
    }

    setBusy(true);

    try {
      const blob = await getExportBlob("png");

      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error("La imagen no se puede copiar en este navegador.");
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      addToHistory();
      setStatus("Imagen copiada al portapapeles.", "success");
    } catch (error) {
      try {
        await navigator.clipboard.writeText(currentText);
        setStatus(
          "No se pudo copiar la imagen; se copió el texto del QR.",
          "warning"
        );
      } catch (fallbackError) {
        setStatus(
          "No se pudo copiar. Asegúrate de usar HTTPS o localhost, o descarga el PNG.",
          "error"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!currentText || busy || !canExport) {
      return;
    }

    setBusy(true);

    try {
      const blob = await getExportBlob("png");
      const file = new File([blob], buildFilename("png"), {
        type: "image/png",
      });
      const shareData = {
        title: "Código QR",
        text: currentText,
        files: [file],
      };

      if (
        typeof navigator.canShare === "function" &&
        !navigator.canShare(shareData)
      ) {
        delete shareData.files;
      }

      if (typeof navigator.share !== "function") {
        throw new Error("Compartir no está disponible.");
      }

      await navigator.share(shareData);
      addToHistory();
      setStatus("Código QR compartido.", "success");
    } catch (error) {
      if (error && error.name === "AbortError") {
        setStatus("");
      } else {
        setStatus(
          "Tu navegador no permite compartir. Descarga el PNG o cópialo.",
          "error"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!currentText || busy || !canExport) {
      return;
    }

    setBusy(true);
    setStatus("Preparando la impresión…");

    try {
      const blob = await getExportBlob("png");
      const url = URL.createObjectURL(blob);
      const win = window.open("", "_blank", "width=760,height=900");

      if (!win) {
        URL.revokeObjectURL(url);
        throw new Error("Ventana emergente bloqueada.");
      }

      const date = new Intl.DateTimeFormat("es", {
        dateStyle: "long",
      }).format(new Date());

      win.document.write(
        "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\">" +
          "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
          "<title>Código QR</title><style>" +
          ":root{color-scheme:light}*{box-sizing:border-box}" +
          "body{margin:0;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111;background:#fff}" +
          "main{max-width:520px;margin:0 auto;text-align:center}" +
          "img{display:block;width:100%;max-width:460px;height:auto;margin:0 auto}" +
          ".content{margin:20px 0 8px;font-size:14px;line-height:1.5;word-break:break-all}" +
          ".meta{margin:0;font-size:12px;color:#666}" +
          "@media print{body{padding:0}}" +
          "</style></head><body><main>" +
          "<img src=\"" +
          url +
          "\" alt=\"Código QR\">" +
          "<p class=\"content\">" +
          escapeHtml(currentText) +
          "</p><p class=\"meta\">" +
          escapeHtml(date) +
          " · QR Studio</p></main></body></html>"
      );

      win.document.close();
      win.focus();

      window.setTimeout(() => {
        try {
          win.print();
        } catch (error) {
          // El navegador puede bloquear la impresión automática.
        }
      }, 350);

      window.setTimeout(() => URL.revokeObjectURL(url), 60000);

      addToHistory();
      setStatus("Ventana de impresión abierta.", "success");
    } catch (error) {
      console.error("Error al imprimir:", error);
      setStatus(
        "No se pudo abrir la impresión. Revisa el bloqueador de ventanas emergentes.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  /* =========================================================
     Historial
     ========================================================= */

  function addToHistory() {
    const content = currentContent;

    if (!content || !content.text) {
      return;
    }

    const existing = history.find(
      (item) => item.text === content.text
    );

    if (existing) {
      existing.createdAt = Date.now();
      existing.type = content.type;
      existing.label = content.label;
      existing.fields = content.fields;
    } else {
      history.unshift({
        id: uid(),
        type: content.type,
        text: content.text,
        label: content.label,
        fields: content.fields,
        createdAt: Date.now(),
        favorite: false,
      });
    }

    history.sort(sortHistory);
    history = history.slice(0, HISTORY_LIMIT);
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    const items = [...history].sort(sortHistory);
    const fragment = document.createDocumentFragment();

    el.historyList.replaceChildren();
    el.clearHistory.hidden = items.length === 0;
    el.historyEmpty.hidden = items.length > 0;
    el.historyCount.textContent = items.length
      ? items.length +
        " " +
        (items.length === 1 ? "código guardado" : "códigos guardados")
      : "";

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const star = document.createElement("button");
      star.type = "button";
      star.className =
        "icon-btn small" + (item.favorite ? " is-fav" : "");
      star.dataset.action = "favorite";
      star.dataset.id = item.id;
      star.setAttribute(
        "aria-label",
        item.favorite ? "Quitar de favoritos" : "Marcar como favorito"
      );
      star.setAttribute("aria-pressed", String(item.favorite));
      star.innerHTML =
        '<svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>';

      const main = document.createElement("button");
      main.type = "button";
      main.className = "history-main";
      main.dataset.action = "load";
      main.dataset.id = item.id;

      const text = document.createElement("span");
      text.className = "history-text";
      const label = item.label || formatMiniLabel(item.text);
      text.textContent = label;
      text.title = item.text;

      const meta = document.createElement("span");
      meta.className = "history-meta";
      meta.textContent =
        (QR_TYPES[item.type] || "QR") +
        " · " +
        formatRelative(item.createdAt);

      main.append(text, meta);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn small";
      remove.dataset.action = "delete";
      remove.dataset.id = item.id;
      remove.setAttribute("aria-label", "Eliminar del historial");
      remove.innerHTML =
        '<svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg>';

      li.append(star, main, remove);
      fragment.append(li);
    });

    el.historyList.append(fragment);
  }

  function handleHistoryClick(event) {
    const button = event.target.closest("button[data-action]");

    if (!button || !el.historyList.contains(button)) {
      return;
    }

    const action = button.dataset.action;
    const id = button.dataset.id;
    const item = history.find((entry) => entry.id === id);

    if (!item) {
      return;
    }

    if (action === "load") {
      const type = QR_TYPES[item.type] ? item.type : "url";
      const fields = item.fields;

      setQrType(type, { render: false });

      if (fields && Object.keys(fields).length) {
        applyFields(type, fields);
      } else if (type === "url") {
        el.texto.value = item.text;
      }

      const ok = renderPreview();

      if (ok) {
        setStatus("Cargado desde el historial.", "success");
        scrollPreviewIntoView();
      }
    } else if (action === "favorite") {
      item.favorite = !item.favorite;
      saveHistory();
      renderHistory();
    } else if (action === "delete") {
      history = history.filter((entry) => entry.id !== id);
      saveHistory();
      renderHistory();
      setStatus("Entrada eliminada del historial.", "");
    }
  }

  function handleClearHistory() {
    if (!history.length) {
      return;
    }

    if (!window.confirm("¿Borrar todos los códigos del historial?")) {
      return;
    }

    history = [];
    saveHistory();
    renderHistory();
    setStatus("Historial borrado.", "");
  }

  /* =========================================================
     Acciones del formulario
     ========================================================= */

  function handleSubmit(event) {
    event.preventDefault();
    window.clearTimeout(renderTimer);

    if (qrType === "url") {
      const normalized = normalizeInput(el.texto.value);

      if (normalized !== el.texto.value) {
        el.texto.value = normalized;
      }
    }

    const ok = renderPreview();

    if (!ok) {
      if (!currentContent.text) {
        const message =
          currentContent.error ||
          TYPE_EMPTY_HINTS[qrType] ||
          "Completa los datos para generar el QR.";

        setStatus(message, "error");
        focusActiveField();
      }

      return;
    }

    addToHistory();
    setStatus("QR generado y guardado en el historial.", "success");
    popPreview();
    scrollPreviewIntoView();
  }

  function handleBlur() {
    if (qrType !== "url") {
      return;
    }

    const raw = el.texto.value.trim();

    if (!raw) {
      return;
    }

    const normalized = normalizeInput(raw);

    if (normalized !== el.texto.value) {
      el.texto.value = normalized;
      renderPreview();
    }
  }

  function clearAll() {
    window.clearTimeout(renderTimer);

    clearFields(qrType);
    currentText = "";
    currentContent = {
      type: qrType,
      text: "",
      label: "",
      fields: {},
      empty: true,
      error: "",
    };
    canExport = false;
    preview = null;
    el.qrPreview.replaceChildren();
    setEmptyState(true);
    updateActionState();
    updateCounter(0);
    setStatus("");
    el.sizeBadge.textContent = "—";
    focusActiveField();
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();

      if (!text.trim()) {
        setStatus("El portapapeles está vacío.", "warning");
        return;
      }

      const targets = {
        url: el.texto,
        whatsapp: el.waPhone,
        social: el.socialHandle,
        wifi: el.wifiSsid,
        email: el.emailTo,
        phone: el.phoneNumber,
        sms: el.smsNumber,
        vcard: el.vcardWebsite,
        location: el.locationQuery,
        event: el.eventTitle,
      };
      const field =
        targets[qrType] || el[TYPE_FOCUS_FIELDS[qrType]];

      if (!field) {
        setStatus("No hay un campo disponible para pegar.", "warning");
        return;
      }

      field.value = text.trim();
      renderPreview();
      setStatus("Contenido pegado.", "success");
    } catch (error) {
      setStatus(
        "No se pudo leer el portapapeles. Usa Ctrl+V en el campo.",
        "error"
      );
      focusActiveField();
    }
  }

  /* =========================================================
     Logo
     ========================================================= */

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(reader.error || new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  function preloadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Imagen no válida."));
      image.src = source;
    });
  }

  async function handleLogoChange() {
    const file = el.logo.files && el.logo.files[0];

    if (!file) {
      return;
    }

    const isImage =
      (file.type && file.type.startsWith("image/")) ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);

    if (!isImage) {
      setStatus("Selecciona un archivo de imagen.", "error");
      el.logo.value = "";
      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      setStatus("El logo debe pesar menos de 2 MB.", "error");
      el.logo.value = "";
      return;
    }

    try {
      const dataUrl = await readAsDataURL(file);
      await preloadImage(dataUrl);

      logoDataUrl = dataUrl;
      el.logoThumb.src = dataUrl;
      el.logoInfo.hidden = false;
      el.logoName.textContent = file.name;

      if (settings.ecl !== "H") {
        settings.ecl = "H";
        el.ecl.value = "H";
        persistSettings();
      }

      updateLogoHint();
      setStatus(
        "Logo añadido. Se activó la corrección H para mejorar la lectura.",
        "success"
      );

      if (currentText) {
        renderPreview();
      }
    } catch (error) {
      setStatus(
        "No se pudo leer esa imagen. Prueba con PNG, JPG, WEBP o SVG.",
        "error"
      );
      removeLogo({ silent: true });
    }
  }

  function removeLogo(options) {
    const config = options || {};

    logoDataUrl = "";
    el.logo.value = "";
    el.logoInfo.hidden = true;
    el.logoThumb.removeAttribute("src");
    el.logoName.textContent = "";
    updateLogoHint();

    if (!config.silent) {
      setStatus("Logo eliminado.", "");
      if (currentText) {
        renderPreview();
      }
    }
  }

  /* =========================================================
     Tema
     ========================================================= */

  function updateThemeButton() {
    const isDark =
      document.documentElement.dataset.theme === "dark";
    el.themeToggle.setAttribute("aria-pressed", String(isDark));
    el.themeToggle.setAttribute(
      "aria-label",
      isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
    );
  }

  function setTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    updateThemeButton();

    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.theme, theme);
      } catch (error) {
        // Sin persistencia si el almacenamiento no está disponible.
      }
    }
  }

  /* =========================================================
     Eventos e inicialización
     ========================================================= */

  function bindEvents() {
    el.form.addEventListener("submit", handleSubmit);

    el.qrType.addEventListener("change", () => {
      setQrType(el.qrType.value);
    });

    el.typePanels.addEventListener("input", handleContentInput);
    el.typePanels.addEventListener("change", handleContentInput);

    el.typePanels.addEventListener("keydown", (event) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.isComposing
      ) {
        return;
      }

      const target = event.target;

      if (
        target.tagName !== "INPUT" ||
        target.type === "checkbox" ||
        target.type === "color" ||
        target.type === "file"
      ) {
        return;
      }

      event.preventDefault();
      el.form.requestSubmit();
    });

    el.texto.addEventListener("blur", handleBlur);

    el.texto.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        el.form.requestSubmit();
      }
    });

    el.size.addEventListener("change", () => {
      settings.size = Number(el.size.value);
      persistSettings();
      renderPreview();
    });

    el.margin.addEventListener("input", () => {
      settings.margin = Number(el.margin.value);
      el.marginValue.textContent = settings.margin + " px";
      persistSettings();
      schedulePreview(90);
    });

    el.ecl.addEventListener("change", () => {
      settings.ecl = el.ecl.value;
      persistSettings();
      updateLogoHint();
      renderPreview();
    });

    el.dotStyle.addEventListener("change", () => {
      settings.style = el.dotStyle.value;
      persistSettings();
      renderPreview();
    });

    el.fg.addEventListener("input", () => {
      settings.fg = el.fg.value;
      el.fgValue.textContent = settings.fg.toUpperCase();
      updateContrastHint();
      persistSettings();
      schedulePreview(90);
    });

    el.bg.addEventListener("input", () => {
      settings.bg = el.bg.value;
      el.bgValue.textContent = settings.bg.toUpperCase();
      updateContrastHint();
      persistSettings();
      schedulePreview(90);
    });

    el.transparent.addEventListener("change", () => {
      settings.transparent = el.transparent.checked;
      el.bg.disabled = settings.transparent;
      updateContrastHint();
      persistSettings();
      renderPreview();
    });

    el.logo.addEventListener("change", handleLogoChange);
    el.removeLogo.addEventListener("click", () => removeLogo());

    el.limpiar.addEventListener("click", clearAll);
    el.pasteBtn.addEventListener("click", handlePaste);

    el.downloadPng.addEventListener("click", () =>
      handleDownload("png")
    );
    el.downloadSvg.addEventListener("click", () =>
      handleDownload("svg")
    );
    el.copyBtn.addEventListener("click", handleCopy);
    el.shareBtn.addEventListener("click", handleShare);
    el.printBtn.addEventListener("click", handlePrint);

    el.historyList.addEventListener("click", handleHistoryClick);
    el.clearHistory.addEventListener("click", handleClearHistory);

    el.themeToggle.addEventListener("click", () => {
      const next =
        document.documentElement.dataset.theme === "dark"
          ? "light"
          : "dark";
      setTheme(next, true);
    });
  }

  function init() {
    if (
      document.documentElement.dataset.theme !== "dark" &&
      document.documentElement.dataset.theme !== "light"
    ) {
      document.documentElement.dataset.theme = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
        ? "dark"
        : "light";
    }

    cacheElements();
    settings = loadSettings();
    history = loadHistory();
    setQrType("url", { render: false });

    if (typeof window.QRCodeStyling !== "function") {
      setStatus(
        "No se pudo cargar el generador de QR. Recarga la página.",
        "error"
      );
    }

    // En pantallas pequeñas el panel de personalización empieza cerrado
    // para que la vista previa quede más cerca del formulario.
    if (MOBILE_QUERY.matches) {
      el.settings.open = false;
    }

    applySettingsToForm();
    renderHistory();
    updateThemeButton();
    updateCounter();
    setEmptyState(true);
    updateActionState();
    bindEvents();
    setupMiniPreview();

    if (el.texto.value.trim()) {
      renderPreview();
    }
  }

  init();
})();
