(function () {
  var PROD_API_BASE_URL = "https://api.subesiparis.com/api";
  var isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || "");
  var localApiBaseUrl = (window.location.protocol || "http:") + "//" + (window.location.hostname || "localhost") + ":4000/api";

  window.APP_CONFIG = {
    CONFIG_VERSION: "2026-02-26-prod1",
    TEST_MODE: false,
    API_BASE_URL: isLocalHost ? localApiBaseUrl : PROD_API_BASE_URL,
    DEFAULT_TEST_ROLE: "admin",
    DEFAULT_PROD_ROLE: "sube",
    ROLE_HOME: {
      sube: "sube/siparislerim.html",
      merkez: "merkez/merkez.html",
      admin: "admin/index.html"
    }
  };
})();
