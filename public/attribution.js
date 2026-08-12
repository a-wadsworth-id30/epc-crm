(function () {
  "use strict";

  var PARAMS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
    "msclkid",
    "ttclid",
    "li_fat_id",
  ];
  var STORAGE_KEY = "id30_attribution";
  var VISITOR_KEY = "id30_visitor_id";
  var SESSION_KEY = "id30_session_id";
  var MAX_TIMELINE = 100;
  var MAX_FORM_FIELDS = 80;
  var MAX_FIELD_VALUE_LENGTH = 1500;
  var SENSITIVE_FIELD_PATTERN =
    /(pass(word|code)?|secret|token|api[-_\s]?key|authorization|auth|card|cc[-_\s]?num|cvc|cvv|iban|sort[-_\s]?code|account[-_\s]?number|routing[-_\s]?number)/i;
  var DEFAULT_CONFIG = {
    enabled: true,
    queryParams: PARAMS,
    phone: {
      autoDetect: true,
      replaceTelLinks: true,
      replaceVisibleNumbers: true,
    },
    forms: {
      autoTrack: true,
      injectHiddenField: true,
      hiddenFieldName: "crm_attribution",
    },
    consent: {
      required: false,
      storageKey: "id30_tracking_consent",
      prompt: {
        enabled: false,
        title: "Can we use cookies?",
        message: "We use cookies and similar technologies to improve your experience, understand site performance and measure marketing activity.",
        acceptLabel: "Accept",
        declineLabel: "Decline",
        privacyUrl: null,
        placement: "bottom-left",
        theme: "light",
        maxWidth: 480,
        borderRadius: 12,
        backgroundColor: null,
        textColor: null,
        mutedTextColor: null,
        borderColor: null,
        buttonBackgroundColor: null,
        buttonTextColor: null,
        linkColor: null,
      },
    },
    session: {
      assignmentWindowMinutes: 30,
      timelineLimit: MAX_TIMELINE,
      captureReferrer: true,
    },
  };
  var runtimeConfig = DEFAULT_CONFIG;
  var originalPhones = [];
  var assignedPhoneNumber = null;
  var debugQueue = [];
  var phoneTextPattern = /(?:\+?\d[\d\s().-]{8,}\d)/g;
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var recentLeadFingerprints = [];
  var fetchObserverAttached = false;
  var xhrObserverAttached = false;
  var mutationObserverAttached = false;

  function scriptElement() {
    return document.currentScript || document.querySelector("script[data-id30-attribution]");
  }

  function apiBase() {
    var script = scriptElement();
    var configured = script && script.getAttribute("data-api-base");

    if (configured) {
      return configured.replace(/\/$/, "");
    }

    if (script && script.src) {
      try {
        return new URL(script.src).origin;
      } catch {
        return window.location.origin;
      }
    }

    return window.location.origin;
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }

    return "id30-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function storage() {
    try {
      localStorage.setItem("__id30_test", "1");
      localStorage.removeItem("__id30_test");
      return {
        get: function (key) {
          return localStorage.getItem(key);
        },
        set: function (key, value) {
          localStorage.setItem(key, value);
        },
        remove: function (key) {
          localStorage.removeItem(key);
        },
      };
    } catch {
      var memory = {};
      return {
        get: function (key) {
          return memory[key] || null;
        },
        set: function (key, value) {
          memory[key] = value;
        },
        remove: function (key) {
          delete memory[key];
        },
      };
    }
  }

  function sessionStore() {
    try {
      sessionStorage.setItem("__id30_test", "1");
      sessionStorage.removeItem("__id30_test");
      return sessionStorage;
    } catch {
      return null;
    }
  }

  var local = storage();
  var session = sessionStore();

  function trimText(value, maxLength) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength || MAX_FIELD_VALUE_LENGTH);
  }

  function normaliseFieldKey(value) {
    return trimText(value, 160)
      .replace(/\[\]$/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function humanizeFieldName(value) {
    var normalised = normaliseFieldKey(value);

    if (!normalised) {
      return "Field";
    }

    return normalised.replace(/^./, function (character) {
      return character.toUpperCase();
    });
  }

  function readJson(key) {
    try {
      return JSON.parse(local.get(key) || "{}");
    } catch {
      return {};
    }
  }

  function writeJson(key, value) {
    local.set(key, JSON.stringify(value));
  }

  function stableId(key, scopedStorage) {
    var current = scopedStorage ? scopedStorage.getItem(key) : local.get(key);

    if (current) {
      return current;
    }

    current = uuid();
    if (scopedStorage) {
      scopedStorage.setItem(key, current);
    } else {
      local.set(key, current);
    }
    return current;
  }

  function scriptConsentAttribute() {
    var script = scriptElement();
    return script ? script.getAttribute("data-id30-consent") : null;
  }

  function hasConsent() {
    if (!runtimeConfig.consent.required) {
      return true;
    }

    return (
      scriptConsentAttribute() === "granted" ||
      local.get(runtimeConfig.consent.storageKey) === "granted"
    );
  }

  function hasDeclinedConsent() {
    var value = local.get(runtimeConfig.consent.storageKey);

    return (
      scriptConsentAttribute() === "denied" ||
      value === "denied" ||
      value === "declined"
    );
  }

  function currentParams() {
    var search = new URLSearchParams(window.location.search);
    var params = {};

    (runtimeConfig.queryParams || PARAMS).forEach(function (key) {
      var value = search.get(key);
      if (value) {
        params[key] = value;
      }
    });

    return params;
  }

  function hasKeys(value) {
    return Object.keys(value).length > 0;
  }

  function capture() {
    if (!runtimeConfig.enabled) {
      return readJson(STORAGE_KEY);
    }

    if (!hasConsent()) {
      return {};
    }

    var existing = readJson(STORAGE_KEY);
    var params = currentParams();
    var now = new Date().toISOString();
    var timelineLimit = Math.max(1, Math.min(Number(runtimeConfig.session.timelineLimit) || MAX_TIMELINE, 250));
    var referrer = runtimeConfig.session.captureReferrer ? document.referrer || existing.referrer || "" : "";
    var visitorId = existing.visitorId || stableId(VISITOR_KEY);
    var sessionId = stableId(SESSION_KEY, session);
    var landingPage = existing.landingPage || window.location.href;
    var touch = {
      capturedAt: now,
      url: window.location.href,
      landingPage: landingPage,
      referrer: referrer,
      params: params,
    };
    var attribution = {
      visitorId: visitorId,
      sessionId: sessionId,
      firstTouch: existing.firstTouch || (hasKeys(params) ? touch : null),
      lastTouch: hasKeys(params) ? touch : existing.lastTouch || null,
      timeline: Array.isArray(existing.timeline) ? existing.timeline.slice(-timelineLimit) : [],
      landingPage: landingPage,
      currentPage: window.location.href,
      referrer: referrer,
    };

    if (hasKeys(params)) {
      attribution.timeline.push(touch);
      attribution.timeline = attribution.timeline.slice(-timelineLimit);
    }

    writeJson(STORAGE_KEY, attribution);
    return attribution;
  }

  function loadConfig() {
    return fetch(apiBase() + "/api/attribution/config", {
      method: "GET",
      credentials: "omit",
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (config) {
        if (config && config.ok) {
          runtimeConfig = {
            enabled: config.enabled !== false,
            queryParams: config.queryParams || DEFAULT_CONFIG.queryParams,
            phone: Object.assign({}, DEFAULT_CONFIG.phone, config.phone || {}),
            forms: Object.assign({}, DEFAULT_CONFIG.forms, config.forms || {}),
            consent: Object.assign({}, DEFAULT_CONFIG.consent, config.consent || {}),
            session: Object.assign({}, DEFAULT_CONFIG.session, config.session || {}),
          };
        }
        trackDebug("config.loaded", "Config endpoint loaded.", {
          enabled: runtimeConfig.enabled,
          reason: config && config.domain ? config.domain.reason : null,
          registered: config && config.domain ? config.domain.registered : null,
        });
        if (runtimeConfig.consent.required && !hasConsent()) {
          trackDebug("consent.required", "Attribution consent required before tracking.", {
            storageKey: runtimeConfig.consent.storageKey,
          });
        }
        return runtimeConfig;
      })
      .catch(function () {
        trackDebug("config.error", "Config endpoint request failed.", null, "error");
        return runtimeConfig;
      });
  }

  function trackDebug(eventType, message, metadata, level) {
    if (
      runtimeConfig.consent.required &&
      !hasConsent() &&
      eventType.indexOf("consent.") !== 0
    ) {
      return;
    }

    var payload = {
      eventType: eventType,
      level: level || "info",
      message: message,
      hostname: window.location.hostname,
      origin: window.location.origin,
      path: window.location.pathname,
      attribution: api && api.get ? api.get() : readJson(STORAGE_KEY),
      metadata: metadata || {},
    };
    var body = JSON.stringify(payload);

    if (!navigator.sendBeacon) {
      debugQueue.push(body);
      setTimeout(flushDebugQueue, 0);
      return;
    }

    var blob = new Blob([body], { type: "text/plain" });
    if (!navigator.sendBeacon(apiBase() + "/api/attribution/debug", blob)) {
      debugQueue.push(body);
      setTimeout(flushDebugQueue, 0);
    }
  }

  function consentPromptConfig() {
    return Object.assign({}, DEFAULT_CONFIG.consent.prompt, runtimeConfig.consent.prompt || {});
  }

  function removeConsentPrompt() {
    var current = document.getElementById("id30-attribution-consent-prompt");
    if (current && current.parentNode) {
      current.parentNode.removeChild(current);
    }
  }

  function clearConsentState(preference) {
    if (preference) {
      local.set(runtimeConfig.consent.storageKey, preference);
    } else {
      local.remove(runtimeConfig.consent.storageKey);
    }
    local.remove(STORAGE_KEY);
    local.remove(VISITOR_KEY);
    if (session) {
      session.removeItem(SESSION_KEY);
    }
    assignedPhoneNumber = null;
    removeConsentPrompt();
  }

  function shouldShowConsentPrompt() {
    var prompt = consentPromptConfig();

    return Boolean(
      runtimeConfig.enabled &&
        runtimeConfig.consent.required &&
        prompt.enabled &&
        !hasConsent() &&
        !hasDeclinedConsent()
    );
  }

  function safePromptText(value, fallback, maxLength) {
    return trimText(value || fallback, maxLength);
  }

  function safePrivacyUrl(value) {
    if (typeof value !== "string") {
      return "";
    }

    var url = value.trim();
    return url && (url.charAt(0) === "/" || /^https?:\/\//i.test(url)) ? url : "";
  }

  function safePromptNumber(value, fallback, min, max) {
    var numberValue = typeof value === "number" ? value : Number(value);

    return Number.isInteger(numberValue) && numberValue >= min && numberValue <= max
      ? numberValue
      : fallback;
  }

  function safePromptColor(value, fallback) {
    return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
      ? value
      : fallback;
  }

  function promptThemePalette(theme) {
    var resolvedTheme = theme;
    if (theme === "auto") {
      resolvedTheme =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    }

    if (resolvedTheme === "dark") {
      return {
        backgroundColor: "#111827",
        textColor: "#ffffff",
        mutedTextColor: "#d1d5db",
        borderColor: "#374151",
        buttonBackgroundColor: "#ffffff",
        buttonTextColor: "#111827",
        privacyLinkColor: "#93c5fd",
        declineLinkColor: "#d1d5db",
      };
    }

    return {
      backgroundColor: "#ffffff",
      textColor: "#111827",
      mutedTextColor: "#4b5563",
      borderColor: "#e5e7eb",
      buttonBackgroundColor: "#111827",
      buttonTextColor: "#ffffff",
      privacyLinkColor: "#2563eb",
      declineLinkColor: "#4b5563",
    };
  }

  function promptStyleConfig(prompt) {
    var theme =
      ["light", "dark", "auto", "custom"].indexOf(prompt.theme) === -1
        ? "light"
        : prompt.theme;
    var palette = promptThemePalette(theme);
    var linkColor = typeof prompt.linkColor === "string" ? prompt.linkColor : "";

    return {
      placement: [
        "bottom-left",
        "bottom-center",
        "bottom-right",
        "top-left",
        "top-center",
        "top-right",
      ].indexOf(prompt.placement) === -1 ? "bottom-left" : prompt.placement,
      maxWidth: safePromptNumber(prompt.maxWidth, 480, 320, 720),
      borderRadius: safePromptNumber(prompt.borderRadius, 12, 0, 32),
      backgroundColor: safePromptColor(prompt.backgroundColor, palette.backgroundColor),
      textColor: safePromptColor(prompt.textColor, palette.textColor),
      mutedTextColor: safePromptColor(prompt.mutedTextColor, palette.mutedTextColor),
      borderColor: safePromptColor(prompt.borderColor, palette.borderColor),
      buttonBackgroundColor: safePromptColor(
        prompt.buttonBackgroundColor,
        palette.buttonBackgroundColor,
      ),
      buttonTextColor: safePromptColor(prompt.buttonTextColor, palette.buttonTextColor),
      privacyLinkColor: safePromptColor(linkColor, palette.privacyLinkColor),
      declineLinkColor: safePromptColor(linkColor, palette.declineLinkColor),
    };
  }

  function promptPlacementStyles(placement) {
    var styles = {
      bottom: placement.indexOf("bottom-") === 0 ? "16px" : "auto",
      left: "auto",
      right: "auto",
      top: placement.indexOf("top-") === 0 ? "16px" : "auto",
      transform: "none",
    };

    if (placement.indexOf("-left") !== -1) {
      styles.left = "16px";
    } else if (placement.indexOf("-right") !== -1) {
      styles.right = "16px";
    } else {
      styles.left = "50%";
      styles.transform = "translateX(-50%)";
    }

    return styles;
  }

  function setStyles(element, styles) {
    Object.keys(styles).forEach(function (key) {
      element.style[key] = styles[key];
    });
  }

  function showConsentPrompt() {
    if (!shouldShowConsentPrompt()) {
      removeConsentPrompt();
      return;
    }

    if (!document.body) {
      setTimeout(showConsentPrompt, 50);
      return;
    }

    if (document.getElementById("id30-attribution-consent-prompt")) {
      return;
    }

    var prompt = consentPromptConfig();
    var style = promptStyleConfig(prompt);
    var container = document.createElement("div");
    var copy = document.createElement("div");
    var title = document.createElement("strong");
    var message = document.createElement("p");
    var actions = document.createElement("div");
    var decline = document.createElement("button");
    var accept = document.createElement("button");
    var privacyUrl = safePrivacyUrl(prompt.privacyUrl);

    container.id = "id30-attribution-consent-prompt";
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-label", "Attribution tracking consent");
    setStyles(container, Object.assign({
      position: "fixed",
      zIndex: "2147483647",
      width: "calc(100% - 32px)",
      maxWidth: style.maxWidth + "px",
      padding: "16px",
      border: "1px solid " + style.borderColor,
      borderRadius: style.borderRadius + "px",
      background: style.backgroundColor,
      color: style.textColor,
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "14px",
      lineHeight: "1.45",
    }, promptPlacementStyles(style.placement)));

    setStyles(copy, {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    });

    title.textContent = safePromptText(prompt.title, DEFAULT_CONFIG.consent.prompt.title, 80);
    setStyles(title, {
      display: "block",
      fontSize: "15px",
      lineHeight: "1.3",
      fontWeight: "700",
    });

    message.textContent = safePromptText(prompt.message, DEFAULT_CONFIG.consent.prompt.message, 240);
    setStyles(message, {
      margin: "0",
      color: style.mutedTextColor,
    });

    copy.appendChild(title);
    copy.appendChild(message);

    if (privacyUrl) {
      var link = document.createElement("a");
      link.href = privacyUrl;
      link.textContent = "Privacy policy";
      if (privacyUrl.charAt(0) !== "/") {
        link.target = "_blank";
        link.rel = "noreferrer";
      }
      setStyles(link, {
        color: style.privacyLinkColor,
        textDecoration: "underline",
        textUnderlineOffset: "2px",
        width: "fit-content",
      });
      copy.appendChild(link);
    }

    setStyles(actions, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      justifyContent: "flex-end",
      marginTop: "14px",
    });

    [decline, accept].forEach(function (button) {
      button.type = "button";
      setStyles(button, {
        minHeight: "40px",
        borderRadius: "999px",
        border: "1px solid #d1d5db",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "14px",
        fontWeight: "700",
        padding: "8px 14px",
      });
    });

    decline.textContent = safePromptText(
      prompt.declineLabel,
      DEFAULT_CONFIG.consent.prompt.declineLabel,
      40,
    );
    setStyles(decline, {
      background: "transparent",
      border: "0",
      borderRadius: "0",
      color: style.declineLinkColor,
      fontWeight: "600",
      minHeight: "auto",
      padding: "8px 6px",
      textDecoration: "underline",
      textUnderlineOffset: "3px",
    });
    decline.addEventListener("click", function () {
      clearConsentState("denied");
    });

    accept.textContent = safePromptText(
      prompt.acceptLabel,
      DEFAULT_CONFIG.consent.prompt.acceptLabel,
      40,
    );
    setStyles(accept, {
      background: style.buttonBackgroundColor,
      borderColor: style.buttonBackgroundColor,
      color: style.buttonTextColor,
    });
    accept.addEventListener("click", function () {
      api.grantConsent();
    });

    actions.appendChild(decline);
    actions.appendChild(accept);
    container.appendChild(copy);
    container.appendChild(actions);
    document.body.appendChild(container);
  }

  function flushDebugQueue() {
    var queue = debugQueue.splice(0, 5);
    queue.forEach(function (body) {
      fetch(apiBase() + "/api/attribution/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        credentials: "omit",
        keepalive: true,
      }).catch(function () {});
    });
  }

  function ensureHiddenInput(form) {
    if (!hasConsent()) {
      return;
    }

    if (!runtimeConfig.forms.injectHiddenField) {
      return;
    }

    var input =
      form.querySelector('input[name="' + runtimeConfig.forms.hiddenFieldName + '"]') ||
      form.querySelector('input[name="attribution"]');

    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = runtimeConfig.forms.hiddenFieldName;
      form.appendChild(input);
    }

    input.value = JSON.stringify(api.get());
  }

  function fieldValue(form, names) {
    var lowered = names.map(function (name) {
      return name.toLowerCase();
    });
    var fields = Array.prototype.slice.call(form.querySelectorAll("input, textarea, select"));

    for (var index = 0; index < fields.length; index += 1) {
      var field = fields[index];
      var type = String(field.type || "").toLowerCase();
      var key = [
        field.name,
        field.id,
        field.getAttribute("aria-label"),
        field.getAttribute("placeholder"),
        fieldLabel(field),
        type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (type === "password" || type === "hidden" || type === "file") {
        continue;
      }

      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        continue;
      }

      if (lowered.some(function (name) { return key.indexOf(name) !== -1; })) {
        return submittedFieldValue(field) || "";
      }
    }

    return "";
  }

  function payloadValueText(value) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return trimText(value, MAX_FIELD_VALUE_LENGTH);
    }

    if (Array.isArray(value)) {
      return value
        .filter(function (item) {
          return (
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"
          );
        })
        .map(function (item) {
          return trimText(item, MAX_FIELD_VALUE_LENGTH);
        })
        .filter(Boolean)
        .join(", ")
        .slice(0, MAX_FIELD_VALUE_LENGTH);
    }

    return "";
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function shouldIgnorePayloadField(key) {
    return (
      !key ||
      SENSITIVE_FIELD_PATTERN.test(key) ||
      /(^|[._\-\s])(company[-_\s]?fax|honeypot|captcha|recaptcha|turnstile|crm[-_\s]?attribution|attribution)([._\-\s]|$)/i.test(
        key,
      )
    );
  }

  function payloadFieldLabel(key) {
    return humanizeFieldName(
      String(key || "")
        .split(".")
        .slice(-1)[0],
    );
  }

  function collectPayloadFields(value, prefix, fields) {
    if (!isPlainObject(value)) {
      return;
    }

    Object.keys(value).forEach(function (key) {
      if (fields.length >= MAX_FORM_FIELDS) {
        return;
      }

      var path = prefix ? prefix + "." + key : key;
      var entry = value[key];

      if (shouldIgnorePayloadField(path)) {
        return;
      }

      if (isPlainObject(entry)) {
        collectPayloadFields(entry, path, fields);
        return;
      }

      var text = payloadValueText(entry);
      if (!text) {
        return;
      }

      fields.push({
        name: path,
        label: payloadFieldLabel(path),
        type: "field",
        value: text,
      });
    });
  }

  function payloadFieldValue(fields, patterns, excludePatterns) {
    for (var index = 0; index < fields.length; index += 1) {
      var field = fields[index];
      var key = normaliseFieldKey((field.name || "") + " " + (field.label || ""));

      if (
        excludePatterns &&
        excludePatterns.some(function (pattern) {
          return pattern.test(key);
        })
      ) {
        continue;
      }

      if (
        patterns.some(function (pattern) {
          return pattern.test(key);
        })
      ) {
        return field.value || "";
      }
    }

    return "";
  }

  function payloadObjectLooksLikeLead(fields) {
    var email = payloadFieldValue(fields, [/\be-?mail\b/]);
    var phone = payloadFieldValue(fields, [/\b(phone|telephone|tel|mobile)\b/]);
    var name = payloadFieldValue(
      fields,
      [/\b(full name|name)\b/],
      [/\b(company|business|organisation|organization)\b/],
    );

    return Boolean((email || phone) && (name || fields.length >= 4));
  }

  function leadPayloadFromObject(value, requestUrl, formSource) {
    var fields = [];
    collectPayloadFields(value, "", fields);

    if (!payloadObjectLooksLikeLead(fields)) {
      return null;
    }

    return {
      name: payloadFieldValue(
        fields,
        [/\b(full name|name)\b/],
        [/\b(company|business|organisation|organization)\b/],
      ),
      email: payloadFieldValue(fields, [/\be-?mail\b/]),
      phone: payloadFieldValue(fields, [/\b(phone|telephone|tel|mobile)\b/]),
      companyName: payloadFieldValue(fields, [/\b(company|business|organisation|organization)\b/]),
      message: payloadFieldValue(fields, [/\b(message|enquiry|inquiry|comment|detail|description|project)\b/]),
      title: document.title || "Website enquiry",
      source: window.location.hostname,
      fields: fields,
      attribution: api.get(),
      formSource: formSource,
      formAction: requestUrl,
    };
  }

  function leadFingerprint(payload) {
    return [
      trimText(payload.email, 240).toLowerCase(),
      trimText(payload.phone, 80),
      trimText(payload.name, 240).toLowerCase(),
      trimText(payload.title, 240).toLowerCase(),
      Array.isArray(payload.fields) ? payload.fields.length : 0,
    ].join("|");
  }

  function leadContactKey(payload) {
    return [
      trimText(payload.email, 240).toLowerCase(),
      trimText(payload.phone, 80),
      trimText(payload.name, 240).toLowerCase(),
      trimText(payload.title, 240).toLowerCase(),
    ].join("|");
  }

  function shouldSendLeadCapture(payload) {
    var fingerprint = leadFingerprint(payload);
    var contactKey = leadContactKey(payload);
    var fieldCount = Array.isArray(payload.fields) ? payload.fields.length : 0;
    var now = Date.now();

    recentLeadFingerprints = recentLeadFingerprints.filter(function (entry) {
      return now - entry.createdAt < 10000;
    });

    if (
      recentLeadFingerprints.some(function (entry) {
        return (
          entry.fingerprint === fingerprint ||
          (entry.contactKey === contactKey && entry.fieldCount >= fieldCount)
        );
      })
    ) {
      return false;
    }

    recentLeadFingerprints.push({
      fingerprint: fingerprint,
      contactKey: contactKey,
      fieldCount: fieldCount,
      createdAt: now,
    });
    return true;
  }

  function fieldName(field) {
    return String(field.name || field.id || "").trim();
  }

  function fieldLabel(field) {
    var id = field.id ? String(field.id).replace(/"/g, '\\"') : "";
    var explicitLabel = "";
    var parentLabel = "";

    if (id) {
      var label = document.querySelector('label[for="' + id + '"]');
      explicitLabel = label ? label.textContent || "" : "";
    }

    var closestLabel = field.closest ? field.closest("label") : null;
    parentLabel = closestLabel ? closestLabel.textContent || "" : "";

    return String(
      field.getAttribute("data-crm-label") ||
        field.getAttribute("aria-label") ||
        explicitLabel ||
        parentLabel ||
        field.getAttribute("placeholder") ||
        field.name ||
        field.id ||
        "Field",
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  function shouldCaptureField(field) {
    var type = String(field.type || "").toLowerCase();
    var name = fieldName(field).toLowerCase();
    var label = fieldLabel(field).toLowerCase();

    if (field.disabled) {
      return false;
    }

    if (field.getAttribute("aria-hidden") === "true" || shouldIgnorePayloadField(name)) {
      return false;
    }

    if (
      type === "button" ||
      type === "submit" ||
      type === "reset" ||
      type === "password" ||
      type === "hidden" ||
      type === "file"
    ) {
      return false;
    }

    return !SENSITIVE_FIELD_PATTERN.test(name) && !SENSITIVE_FIELD_PATTERN.test(label);
  }

  function selectedOptions(field) {
    return Array.prototype.slice
      .call(field.options || [])
      .filter(function (option) {
        return option.selected;
      })
      .map(function (option) {
        return option.textContent || option.value || "";
      })
      .filter(Boolean);
  }

  function submittedFieldValue(field) {
    var type = String(field.type || "").toLowerCase();

    if ((type === "checkbox" || type === "radio") && !field.checked) {
      return null;
    }

    if (field.tagName && field.tagName.toLowerCase() === "select" && field.multiple) {
      return selectedOptions(field).join(", ");
    }

    return field.value || "";
  }

  function collectFormFields(form) {
    var fields = Array.prototype.slice.call(form.querySelectorAll("input, textarea, select"));
    var captured = [];

    for (var index = 0; index < fields.length && captured.length < MAX_FORM_FIELDS; index += 1) {
      var field = fields[index];
      if (!shouldCaptureField(field)) {
        continue;
      }

      var value = submittedFieldValue(field);
      if (value === null || String(value).trim() === "") {
        continue;
      }

      captured.push({
        name: fieldName(field) || null,
        label: fieldLabel(field),
        type: String(field.type || field.tagName || "field").toLowerCase().slice(0, 60),
        value: trimText(value, MAX_FIELD_VALUE_LENGTH),
      });
    }

    return captured;
  }

  function formPayload(form) {
    var fields = collectFormFields(form);

    return {
      name: fieldValue(form, ["name", "fullname", "full-name"]),
      firstName: fieldValue(form, ["firstname", "first-name", "first_name"]),
      lastName: fieldValue(form, ["lastname", "last-name", "last_name"]),
      email: fieldValue(form, ["email", "e-mail"]),
      phone: fieldValue(form, ["phone", "telephone", "tel", "mobile"]),
      companyName: fieldValue(form, ["company", "business", "organisation", "organization"]),
      message: fieldValue(form, ["message", "enquiry", "inquiry", "comments", "details"]),
      title: form.getAttribute("data-crm-title") || document.title || "Website enquiry",
      source: form.getAttribute("data-crm-source") || window.location.hostname,
      fields: fields,
      attribution: api.get(),
    };
  }

  function formLooksLikeMultiStep(form) {
    return Boolean(
      form.querySelector('[role="tab"], .formkit-tab, [data-type="multi-step"], [data-multistep]'),
    );
  }

  function sendLeadCapture(payload, debugMeta) {
    if (!shouldSendLeadCapture(payload)) {
      trackDebug("form.duplicate-client", "Duplicate website form capture skipped.", debugMeta || {}, "warning");
      return;
    }

    var body = JSON.stringify(payload);

    trackDebug("form.submit", "Website form submit detected.", Object.assign(
      {
        hasEmail: Boolean(payload.email),
        hasPhone: Boolean(payload.phone),
        hasMessage: Boolean(payload.message),
        fieldCount: Array.isArray(payload.fields) ? payload.fields.length : 0,
      },
      debugMeta || {},
    ));

    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "text/plain" });
      if (navigator.sendBeacon(apiBase() + "/api/attribution/lead", blob)) {
        return;
      }
    }

    (nativeFetch || window.fetch)(apiBase() + "/api/attribution/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      credentials: "omit",
      keepalive: true,
    }).catch(function () {});
  }

  function trackForm(form) {
    if (
      !runtimeConfig.enabled ||
      !runtimeConfig.forms.autoTrack ||
      form.getAttribute("data-crm-no-track") === "true"
    ) {
      return;
    }

    if (!hasConsent()) {
      return;
    }

    var payload = formPayload(form);
    var hasContact = Boolean(
      payload.email ||
        payload.phone ||
        payload.name ||
        payload.firstName ||
        payload.message ||
        (Array.isArray(payload.fields) && payload.fields.length > 0),
    );

    if (!hasContact) {
      trackDebug("form.skipped", "Form submit skipped because no contact fields were detected.", {
        formId: form.id || null,
        formName: form.getAttribute("name") || null,
      }, "warning");
      return;
    }

    var debugMeta = {
      formId: form.id || null,
      formName: form.getAttribute("name") || null,
    };

    if (formLooksLikeMultiStep(form) && payload.fields && payload.fields.length <= 4) {
      setTimeout(function () {
        sendLeadCapture(payload, Object.assign({ delayedPartial: true }, debugMeta));
      }, 800);
      return;
    }

    sendLeadCapture(payload, debugMeta);
  }

  function requestUrl(input) {
    try {
      if (typeof input === "string") {
        return new URL(input, window.location.href);
      }

      if (input && input.href) {
        return new URL(input.href, window.location.href);
      }

      if (input && input.url) {
        return new URL(input.url, window.location.href);
      }
    } catch {
      return null;
    }

    return null;
  }

  function requestMethod(input, init) {
    return String((init && init.method) || (input && input.method) || "GET").toUpperCase();
  }

  function isFormLikePostUrl(url) {
    if (!url || url.origin !== window.location.origin) {
      return false;
    }

    if (/\/api\/attribution\//i.test(url.pathname)) {
      return false;
    }

    return /(form|lead|contact|enquir|inquir|quote|project|plutio|submit)/i.test(
      url.pathname,
    );
  }

  function objectFromEntries(entries) {
    var record = {};
    var items = [];

    try {
      items = Array.from(entries || []);
    } catch {
      items = [];
    }

    items.forEach(function (entry) {
      var key = entry && entry[0];
      var value = entry && entry[1];

      if (!key) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(record, key)) {
        if (!Array.isArray(record[key])) {
          record[key] = [record[key]];
        }
        record[key].push(value);
      } else {
        record[key] = value;
      }
    });

    return record;
  }

  function payloadObjectFromBody(body) {
    if (!body) {
      return null;
    }

    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return {
        record: objectFromEntries(body.entries()),
        formSource: "formdata-post",
      };
    }

    if (body instanceof URLSearchParams) {
      return {
        record: objectFromEntries(body.entries()),
        formSource: "urlencoded-post",
      };
    }

    if (typeof body !== "string") {
      return null;
    }

    var text = body.trim();
    if (!text) {
      return null;
    }

    if (text.charAt(0) === "{") {
      try {
        return {
          record: JSON.parse(text),
          formSource: "json-post",
        };
      } catch {
        return null;
      }
    }

    if (text.indexOf("=") !== -1) {
      return {
        record: objectFromEntries(new URLSearchParams(text).entries()),
        formSource: "urlencoded-post",
      };
    }

    return null;
  }

  function observeFormPostLead(method, urlInput, body, transport) {
    if (!runtimeConfig.enabled || !runtimeConfig.forms.autoTrack || !hasConsent()) {
      return;
    }

    if (String(method || "GET").toUpperCase() !== "POST") {
      return;
    }

    var url = requestUrl(urlInput);
    if (!isFormLikePostUrl(url)) {
      return;
    }

    var parsed = payloadObjectFromBody(body);
    if (!parsed) {
      return;
    }

    var payload = leadPayloadFromObject(parsed.record, url.href, parsed.formSource);

    if (payload) {
      sendLeadCapture(payload, {
        formSource: parsed.formSource,
        formAction: url.href,
        transport: transport || "fetch",
      });
    }
  }

  function observeFetchPostLead(input, init) {
    var requestInit = init || {};
    var method = requestMethod(input, requestInit);
    var hasInitBody = Object.prototype.hasOwnProperty.call(requestInit, "body");

    if (hasInitBody) {
      observeFormPostLead(method, input, requestInit.body, "fetch");
      return;
    }

    if (typeof Request === "undefined" || !(input instanceof Request) || !input.clone) {
      return;
    }

    try {
      input
        .clone()
        .text()
        .then(function (text) {
          observeFormPostLead(method, input, text, "fetch");
        })
        .catch(function () {});
    } catch {
      // Ignore request bodies that cannot be cloned.
    }
  }

  function attachFetchObserver() {
    if (fetchObserverAttached || !nativeFetch) {
      return;
    }

    fetchObserverAttached = true;
    window.fetch = function (input, init) {
      try {
        observeFetchPostLead(input, init);
      } catch {
        // Do not let attribution diagnostics affect the host website request.
      }

      return nativeFetch(input, init);
    };
  }

  function attachXhrObserver() {
    if (xhrObserverAttached || !window.XMLHttpRequest) {
      return;
    }

    var nativeOpen = window.XMLHttpRequest.prototype.open;
    var nativeSend = window.XMLHttpRequest.prototype.send;

    xhrObserverAttached = true;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      this.__id30AttributionRequest = {
        method: method,
        url: url,
      };
      return nativeOpen.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function (body) {
      try {
        var request = this.__id30AttributionRequest || {};
        observeFormPostLead(request.method, request.url, body, "xhr");
      } catch {
        // Do not let attribution diagnostics affect the host website request.
      }

      return nativeSend.apply(this, arguments);
    };
  }

  function attachForms() {
    document.querySelectorAll("form").forEach(function (form) {
      if (runtimeConfig.enabled && runtimeConfig.forms.injectHiddenField) {
        ensureHiddenInput(form);
      }
      if (form.getAttribute("data-crm-attribution-bound") === "true") {
        return;
      }
      form.setAttribute("data-crm-attribution-bound", "true");
      form.addEventListener("submit", function () {
        if (runtimeConfig.enabled && runtimeConfig.forms.injectHiddenField) {
          ensureHiddenInput(form);
        }
        trackForm(form);
      }, true);
    });
  }

  function normalisePhone(value) {
    return String(value || "").replace(/[^\d+]/g, "");
  }

  function dialablePhone(value) {
    return normalisePhone(value).replace(/(?!^)\+/g, "");
  }

  function formatPhoneForDisplay(value) {
    var normalised = normalisePhone(value);

    if (!normalised) {
      return value;
    }

    var digits = normalised.replace(/\D/g, "");

    if (normalised.indexOf("+44") === 0) {
      var national = "0" + digits.slice(2);

      if (/^07\d{9}$/.test(national)) {
        return national.replace(/^(\d{5})(\d{6})$/, "$1 $2");
      }

      if (/^0(20|23|24|28|29)\d{8}$/.test(national)) {
        return national.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1 $2 $3");
      }

      if (/^01[1-9]1\d{7}$/.test(national)) {
        return national.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
      }

      if (/^011\d{8}$/.test(national)) {
        return national.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
      }

      if (/^01\d{9}$/.test(national)) {
        return national.replace(/^(\d{5})(\d{6})$/, "$1 $2");
      }

      if (/^0\d{9}$/.test(national)) {
        return national.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");
      }
    }

    if (normalised.indexOf("+1") === 0 && digits.length === 11) {
      return normalised.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 $1 $2 $3");
    }

    if (normalised.charAt(0) === "+" && digits.length > 4) {
      return "+" + digits.replace(/^(\d{1,3})(\d{3})(\d{3})(\d+)$/, "$1 $2 $3 $4");
    }

    return value;
  }

  function looksLikePhone(value) {
    var cleaned = normalisePhone(value);
    return cleaned.length >= 10 && cleaned.length <= 16;
  }

  function containsPhoneText(value) {
    phoneTextPattern.lastIndex = 0;
    var matched = phoneTextPattern.test(value || "");
    phoneTextPattern.lastIndex = 0;
    return matched;
  }

  function rememberOriginalPhone(value) {
    var cleaned = normalisePhone(value);

    if (looksLikePhone(cleaned) && originalPhones.indexOf(cleaned) === -1) {
      originalPhones.push(cleaned);
    }
  }

  function detectOriginalPhones() {
    document.querySelectorAll('a[href^="tel:"]').forEach(function (element) {
      rememberOriginalPhone(element.getAttribute("href").replace(/^tel:/i, ""));
    });

    if (!document.body) {
      return;
    }

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;

        if (!node.nodeValue || !parent) {
          return NodeFilter.FILTER_REJECT;
        }

        if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION)$/i.test(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        return containsPhoneText(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    var node = walker.nextNode();
    var scanned = 0;

    while (node && scanned < 250) {
      node.nodeValue.replace(phoneTextPattern, function (match) {
        rememberOriginalPhone(match);
        return match;
      });
      scanned += 1;
      phoneTextPattern.lastIndex = 0;
      node = walker.nextNode();
    }
  }

  function replaceTextNodeNumbers(root, phoneNumber, displayPhoneNumber) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue) {
          return NodeFilter.FILTER_REJECT;
        }

        var parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION)$/i.test(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        return containsPhoneText(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    var nodes = [];
    var node = walker.nextNode();

    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }

    var replacements = 0;

    nodes.forEach(function (textNode) {
      var nextValue = textNode.nodeValue.replace(phoneTextPattern, function (match) {
        var cleaned = normalisePhone(match);
        if (
          originalPhones.indexOf(cleaned) !== -1 ||
          (looksLikePhone(match) && cleaned !== normalisePhone(phoneNumber))
        ) {
          return displayPhoneNumber;
        }
        return match;
      });
      phoneTextPattern.lastIndex = 0;
      if (nextValue !== textNode.nodeValue) {
        textNode.nodeValue = nextValue;
        replacements += 1;
      }
    });

    return replacements;
  }

  function updateElementPhoneText(element, phoneNumber, displayPhoneNumber) {
    var replacements = replaceTextNodeNumbers(element, phoneNumber, displayPhoneNumber);

    if (replacements > 0) {
      return;
    }

    if (element.children.length === 0 || !element.textContent.trim()) {
      if (element.textContent !== displayPhoneNumber) {
        element.textContent = displayPhoneNumber;
      }
    }
  }

  function updatePhoneElements(phoneNumber) {
    if (!phoneNumber) {
      return;
    }

    assignedPhoneNumber = phoneNumber;
    var displayPhoneNumber = formatPhoneForDisplay(phoneNumber);
    var phoneHref = "tel:" + dialablePhone(phoneNumber);
    detectOriginalPhones();

    document
      .querySelectorAll("[data-crm-phone], [data-attribution-phone]")
      .forEach(function (element) {
        updateElementPhoneText(element, phoneNumber, displayPhoneNumber);
        if (element.tagName === "A") {
          if (element.getAttribute("href") !== phoneHref) {
            element.setAttribute("href", phoneHref);
          }
        }
      });

    document.querySelectorAll("a[data-crm-tel], a[data-attribution-tel]").forEach(function (element) {
      if (element.getAttribute("href") !== phoneHref) {
        element.setAttribute("href", phoneHref);
      }
    });

    if (runtimeConfig.phone.replaceTelLinks) {
      document.querySelectorAll('a[href^="tel:"]').forEach(function (element) {
        rememberOriginalPhone(element.getAttribute("href").replace(/^tel:/i, ""));
        if (element.getAttribute("href") !== phoneHref) {
          element.setAttribute("href", phoneHref);
        }
        if (looksLikePhone(element.textContent)) {
          updateElementPhoneText(element, phoneNumber, displayPhoneNumber);
        }
      });
    }

    if (runtimeConfig.phone.replaceVisibleNumbers) {
      replaceTextNodeNumbers(document.body, phoneNumber, displayPhoneNumber);
    }

    trackDebug("phone.replaced", "Tracking phone number applied to the page.", {
      phoneNumber: phoneNumber,
      displayPhoneNumber: displayPhoneNumber,
      originalPhoneCount: originalPhones.length,
      consentGranted: hasConsent(),
    });
  }

  function displayOnlyAttributionPayload() {
    return {
      currentPage: window.location.href,
      landingPage: window.location.href,
      referrer: runtimeConfig.session.captureReferrer ? document.referrer || "" : "",
    };
  }

  function refreshPhoneNumber() {
    if (!runtimeConfig.enabled || !runtimeConfig.phone.autoDetect) {
      return Promise.resolve(null);
    }

    var consentGranted = hasConsent();

    return fetch(apiBase() + "/api/attribution/phone-number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attribution: consentGranted ? api.get() : displayOnlyAttributionPayload(),
        displayOnly: !consentGranted,
      }),
      credentials: "omit",
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (data && data.phoneNumber) {
          updatePhoneElements(data.phoneNumber);
        } else {
          trackDebug("phone.unavailable", "No phone number was returned for this visitor.", data || {}, "warning");
        }
        return data;
      })
      .catch(function () {
        trackDebug("phone.error", "Phone number request failed.", null, "error");
        return null;
      });
  }

  function startMutationObserver() {
    if (mutationObserverAttached || !window.MutationObserver || !document.body) {
      return;
    }

    var mutationTimer = null;
    var observer = new MutationObserver(function () {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(function () {
        attachForms();
        if (assignedPhoneNumber) {
          updatePhoneElements(assignedPhoneNumber);
        }
      }, 100);
    });

    mutationObserverAttached = true;
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function startPhoneReplacementOnly() {
    refreshPhoneNumber();
    startMutationObserver();
  }

  function startTracking(debugEventType, debugMessage) {
    capture();
    attachFetchObserver();
    attachXhrObserver();
    trackDebug(debugEventType, debugMessage, {
      forms: runtimeConfig.forms,
      phone: runtimeConfig.phone,
    });
    attachForms();
    refreshPhoneNumber();
    startMutationObserver();
  }

  function submitLead(payload) {
    var body = payload || {};
    body.attribution = body.attribution || (hasConsent() ? api.get() : {});

    return fetch(apiBase() + "/api/attribution/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
    }).then(function (response) {
      trackDebug(response.ok ? "lead.submit" : "lead.error", "Manual lead submit completed.", {
        ok: response.ok,
        status: response.status,
      }, response.ok ? "info" : "error");
      return response.json();
    });
  }

  var api = {
    get: function () {
      return readJson(STORAGE_KEY);
    },
    capture: capture,
    refreshPhoneNumber: refreshPhoneNumber,
    attachForms: attachForms,
    submitLead: submitLead,
    hasConsent: hasConsent,
    grantConsent: function () {
      local.set(runtimeConfig.consent.storageKey, "granted");
      removeConsentPrompt();
      startTracking("consent.granted", "Attribution consent granted.");
      return api.get();
    },
    revokeConsent: function () {
      trackDebug("consent.revoked", "Attribution consent revoked.", {});
      clearConsentState("denied");
      return true;
    },
  };

  window.id30Attribution = api;

  function boot() {
    loadConfig().then(function () {
      if (!runtimeConfig.enabled) {
        return;
      }

      if (!hasConsent()) {
        showConsentPrompt();
        startPhoneReplacementOnly();
        return;
      }

      removeConsentPrompt();
      startTracking("script.ready", "Attribution script booted.");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
