(function () {
  var explicitApiBaseUrl = "";
  if (typeof window.__APP_ENV__ === "object" && window.__APP_ENV__ && window.__APP_ENV__.API_BASE_URL) {
    explicitApiBaseUrl = String(window.__APP_ENV__.API_BASE_URL).trim();
  }
  if (!explicitApiBaseUrl && window.API_BASE_URL) {
    explicitApiBaseUrl = String(window.API_BASE_URL).trim();
  }

  var locationObj = window.location || {};
  var host = locationObj.hostname || "localhost";
  var protocol = locationObj.protocol || "http:";
  var port = locationObj.port || "";
  function isPrivateIpv4(value) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
    var parts = value.split(".").map(function (p) { return Number(p); });
    if (parts.some(function (n) { return Number.isNaN(n) || n < 0 || n > 255; })) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 127) return true;
    return false;
  }
  var isLocalHost = host === "localhost"
    || host === "::1"
    || host === "0.0.0.0"
    || isPrivateIpv4(host)
    || /\.local$/i.test(host);
  var productionApiBaseUrl = "https://api.subesiparis.com/api";
  var apiBaseUrl = "";

  if (explicitApiBaseUrl) {
    apiBaseUrl = explicitApiBaseUrl;
  } else if (isLocalHost && port && port !== "4000") {
    // Live Server gibi lokal farkli portlarda backend varsayilan olarak 4000 kabul edilir.
    apiBaseUrl = protocol + "//" + host + ":4000/api";
  } else if (!isLocalHost) {
    // Canli ortamda frontend ve backend farkli subdomain kullanir.
    apiBaseUrl = productionApiBaseUrl;
  } else {
    // Tek domain deploy veya backend'in ayni origin'de servis ettigi frontend.
    apiBaseUrl = (locationObj.origin || (protocol + "//" + host)) + "/api";
  }

  window.APP_CONFIG = {
    TEST_MODE: false,
    API_BASE_URL: apiBaseUrl,
    DEFAULT_TEST_ROLE: "admin",
    DEFAULT_PROD_ROLE: "sube",
    ROLE_HOME: {
      sube: "sube/siparislerim.html",
      merkez: "merkez/merkez.html",
      merkez_alt: "merkez/merkez.html",
      admin: "admin/index.html"
    }
  };
})();
