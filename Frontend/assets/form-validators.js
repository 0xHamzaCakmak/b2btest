(function () {
  function digitsOnly(text) {
    return String(text || "").replace(/\D/g, "");
  }

  function normalizePhoneValue(raw) {
    var digits = digitsOnly(raw);
    if (!digits.startsWith("90")) {
      if (digits.startsWith("0")) digits = digits.slice(1);
      if (digits.startsWith("90")) {
        // no-op
      } else {
        digits = "90" + digits;
      }
    }
    if (!digits.startsWith("90")) digits = "90";
    digits = "90" + digits.slice(2, 12);
    return digits;
  }

  function initStrictPhoneInput(input) {
    if (!input || input.dataset.phoneInit === "1") return;
    input.dataset.phoneInit = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "tel");
    input.setAttribute("maxlength", "12");

    function normalizeAndKeepCaretEnd() {
      var next = normalizePhoneValue(input.value || "90");
      input.value = next;
      try {
        input.setSelectionRange(next.length, next.length);
      } catch (_err) {}
    }

    if (!input.value) input.value = "90";
    normalizeAndKeepCaretEnd();

    input.addEventListener("focus", function () {
      if (!input.value) input.value = "90";
      normalizeAndKeepCaretEnd();
    });

    input.addEventListener("keydown", function (event) {
      var key = event.key;
      if (key === " ") {
        event.preventDefault();
        return;
      }
      var start = Number(input.selectionStart || 0);
      var end = Number(input.selectionEnd || 0);
      if (key === "Backspace" && start <= 2 && end <= 2) {
        event.preventDefault();
        return;
      }
      if (key === "Delete" && start < 2) {
        event.preventDefault();
      }
    });

    input.addEventListener("input", normalizeAndKeepCaretEnd);
  }

  function validatePhoneInput(input, options) {
    var opts = options || {};
    var label = String(opts.label || "Telefon");
    var required = !!opts.required;
    var normalized = normalizePhoneValue(input && input.value ? input.value : "90");
    if (input) input.value = normalized;

    if (normalized === "90") {
      if (required) {
        if (input) input.setCustomValidity(label + " zorunludur.");
        return { ok: false, message: label + " zorunludur.", value: null };
      }
      if (input) input.setCustomValidity("");
      return { ok: true, message: "", value: null };
    }

    if (!/^90\d{10}$/.test(normalized)) {
      var message = label + " 90 ile baslamali ve 10 hane icermelidir.";
      if (input) input.setCustomValidity(message);
      return { ok: false, message: message, value: null };
    }

    if (input) input.setCustomValidity("");
    return { ok: true, message: "", value: normalized };
  }

  function validateEmailInput(input, options) {
    var opts = options || {};
    var label = String(opts.label || "E-posta");
    var required = !!opts.required;
    var value = String((input && input.value) || "").trim().toLowerCase();
    if (input) input.value = value;

    if (!value) {
      if (required) {
        if (input) input.setCustomValidity(label + " zorunludur.");
        return { ok: false, message: label + " zorunludur.", value: null };
      }
      if (input) input.setCustomValidity("");
      return { ok: true, message: "", value: null };
    }

    var regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(value)) {
      var message = "Gecerli bir e-posta formati girin.";
      if (input) input.setCustomValidity(message);
      return { ok: false, message: message, value: null };
    }

    if (input) input.setCustomValidity("");
    return { ok: true, message: "", value: value };
  }

  window.FormValidators = {
    initStrictPhoneInput: initStrictPhoneInput,
    validatePhoneInput: validatePhoneInput,
    validateEmailInput: validateEmailInput,
    normalizePhoneValue: normalizePhoneValue
  };
})();
