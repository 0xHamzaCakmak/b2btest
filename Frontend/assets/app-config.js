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
  var isLocalHost = host === "localhost" || host === "127.0.0.1";
  var apiBaseUrl = "";

  if (explicitApiBaseUrl) {
    apiBaseUrl = explicitApiBaseUrl;
  } else if (isLocalHost && port && port !== "4000") {
    // Live Server gibi lokal farkli portlarda backend varsayilan olarak 4000 kabul edilir.
    apiBaseUrl = protocol + "//" + host + ":4000/api";
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
      admin: "admin/index.html"
    }
  };
})();
