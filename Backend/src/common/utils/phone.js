function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // TR local habit: 0555xxxxxxx -> 90555xxxxxxx
  if (digits.length === 11 && digits.startsWith("0")) {
    return "90" + digits.slice(1);
  }

  // TR short mobile habit: 555xxxxxxx -> 90555xxxxxxx
  if (digits.length === 10) {
    return "90" + digits;
  }

  // Already in country format: 90xxxxxxxxxx
  if (digits.length === 12 && digits.startsWith("90")) {
    return digits;
  }

  return digits;
}

function isStrictTrPhone(value) {
  const normalized = normalizePhone(value);
  return /^90\d{10}$/.test(normalized);
}

function looksLikePhone(value) {
  const normalized = normalizePhone(value);
  const digitCount = normalized.replace(/\D/g, "").length;
  return digitCount >= 10 && digitCount <= 15;
}

module.exports = {
  normalizePhone,
  isStrictTrPhone,
  looksLikePhone
};
