(function () {
  window.APP_CONFIG = {
    TEST_MODE: false,
    API_BASE_URL: "http://localhost:4000/api",
    AUTH_SESSION_KEY: "authSession",
    DEFAULT_TEST_ROLE: "admin",
    DEFAULT_PROD_ROLE: "sube",
    ROLE_HOME: {
      sube: "sube/siparislerim.html",
      merkez: "merkez/merkez.html",
      admin: "admin/index.html"
    }
  };
})();
