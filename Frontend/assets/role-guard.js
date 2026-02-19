(function () {
  var cfg = window.APP_CONFIG || {};
  var sessionKey = cfg.AUTH_SESSION_KEY || "authSession";

  function normalizePath() {
    var path = window.location.pathname.replace(/\\/g, "/");
    return path.split("/").pop() || "login.html";
  }

  function rootPrefix() {
    var path = window.location.pathname.replace(/\\/g, "/");
    if (path.indexOf("/admin/") > -1 || path.indexOf("/sube/") > -1 || path.indexOf("/merkez/") > -1) {
      return "../";
    }
    return "";
  }

  function toRootPage(page) {
    if (!page) return "login.html";
    return rootPrefix() + page;
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionKey) || "null");
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(sessionKey);
  }

  function apiBaseUrl() {
    return String(cfg.API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");
  }

  function toAbsoluteUrl(input) {
    try {
      if (typeof input === "string") {
        return new URL(input, window.location.origin).href;
      }
      if (input && typeof input.url === "string") {
        return new URL(input.url, window.location.origin).href;
      }
    } catch (_e) {}
    return "";
  }

  function isApiRequest(input) {
    var absolute = toAbsoluteUrl(input);
    if (!absolute) return false;
    return absolute.indexOf(apiBaseUrl()) === 0;
  }

  function isAuthBypassPath(input) {
    var absolute = toAbsoluteUrl(input);
    if (!absolute) return false;
    return absolute.indexOf("/api/auth/login") > -1 || absolute.indexOf("/api/auth/refresh") > -1;
  }

  function normalizeHeaders(headers) {
    var out = {};
    if (!headers) return out;
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      headers.forEach(function (value, key) {
        out[key] = value;
      });
      return out;
    }
    if (Array.isArray(headers)) {
      headers.forEach(function (entry) {
        if (!Array.isArray(entry) || entry.length < 2) return;
        out[String(entry[0])] = entry[1];
      });
      return out;
    }
    if (typeof headers === "object") {
      Object.keys(headers).forEach(function (key) {
        out[key] = headers[key];
      });
    }
    return out;
  }

  var refreshPromise = null;
  async function refreshAccessToken() {
    var session = getSession();
    if (!session || !session.refreshToken) return false;

    var response = await window.__AUTH_RAW_FETCH(apiBaseUrl() + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken })
    });
    var payload = await response.json().catch(function () { return null; });
    if (!response.ok || !payload || payload.ok !== true || !payload.data) {
      return false;
    }

    var nextSession = Object.assign({}, session, {
      accessToken: payload.data.accessToken || "",
      refreshToken: payload.data.refreshToken || session.refreshToken,
      refreshedAt: new Date().toISOString()
    });
    if (payload.data.user && typeof payload.data.user === "object") {
      nextSession.userId = payload.data.user.id || nextSession.userId || null;
      nextSession.email = payload.data.user.email || nextSession.email || null;
      nextSession.phone = payload.data.user.phone || nextSession.phone || null;
      nextSession.displayName = payload.data.user.displayName || nextSession.displayName || null;
      nextSession.role = payload.data.user.role || nextSession.role || null;
      nextSession.branchId = payload.data.user.branchId || null;
      nextSession.branchName = payload.data.user.branchName || null;
      nextSession.centerId = payload.data.user.centerId || null;
      nextSession.centerName = payload.data.user.centerName || null;
      nextSession.isActive = payload.data.user.isActive !== false;
    }
    setSession(nextSession);
    return true;
  }

  async function refreshOnce() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = refreshAccessToken()
      .catch(function () { return false; })
      .finally(function () { refreshPromise = null; });
    return refreshPromise;
  }

  function installAuthFetchInterceptor() {
    if (typeof window.fetch !== "function") return;
    if (window.__AUTH_FETCH_INSTALLED) return;

    var rawFetch = window.fetch.bind(window);
    window.__AUTH_RAW_FETCH = rawFetch;

    window.fetch = async function (input, init) {
      var response = await rawFetch(input, init);

      if (cfg.TEST_MODE) return response;
      if (response.status !== 401) return response;
      if (!isApiRequest(input) || isAuthBypassPath(input)) return response;

      var refreshed = await refreshOnce();
      if (!refreshed) {
        clearSession();
        window.location.replace(toRootPage("login.html"));
        return response;
      }

      var session = getSession();
      var nextHeaders = normalizeHeaders(init && init.headers);
      if (session && session.accessToken) {
        nextHeaders.Authorization = "Bearer " + session.accessToken;
      }

      var retryInit = Object.assign({}, init || {}, { headers: nextHeaders });
      return rawFetch(input, retryInit);
    };

    window.__AUTH_FETCH_INSTALLED = true;
  }

  function currentRole() {
    var session = getSession();
    if (session && session.role) return session.role;
    if (cfg.TEST_MODE) return cfg.DEFAULT_TEST_ROLE || "admin";
    return null;
  }

  function routeRoles(page) {
    var path = window.location.pathname.replace(/\\/g, "/");
    var subePages = ["siparis.html", "siparislerim.html"];
    var merkezPages = ["merkez.html", "merkez-urun-fiyat.html", "merkez-subeler.html"];
    var publicPages = ["login.html"];

    if (page.indexOf("admin") === 0 || window.location.pathname.replace(/\\/g, "/").indexOf("/admin/") > -1) {
      return ["admin"];
    }
    if (page === "profil.html" && path.indexOf("/sube/") > -1) return ["sube", "admin"];
    if (page === "profil.html" && path.indexOf("/merkez/") > -1) return ["merkez", "admin"];
    if (publicPages.indexOf(page) > -1) return null;
    if (subePages.indexOf(page) > -1) return ["sube", "admin"];
    if (merkezPages.indexOf(page) > -1) return ["merkez", "admin"];
    return null;
  }

  function isAllowed(page, role) {
    var allowed = routeRoles(page);
    if (!allowed) return true;
    return !!role && allowed.indexOf(role) > -1;
  }

  function roleHome(role) {
    var homes = cfg.ROLE_HOME || {};
    if (homes[role]) return toRootPage(homes[role]);
    return toRootPage("login.html");
  }

  function mapHrefToPage(href) {
    if (!href || href.indexOf(".html") === -1) return null;
    var clean = href.split("?")[0].split("#")[0];
    var parts = clean.split("/");
    return parts[parts.length - 1] || null;
  }

  function toggleNavByRole(role) {
    if (cfg.TEST_MODE) return;
    var anchors = document.querySelectorAll("a[href]");
    anchors.forEach(function (anchor) {
      var page = mapHrefToPage(anchor.getAttribute("href"));
      if (!page) return;
      if (!isAllowed(page, role)) {
        anchor.style.display = "none";
      }
    });
  }

  function bindLogout() {
    var anchors = document.querySelectorAll("a[href$='login.html']");
    anchors.forEach(function (a) {
      var label = (a.textContent || "").trim().toLowerCase();
      if (label.indexOf("cikis") > -1 || label.indexOf("logout") > -1) {
        a.addEventListener("click", function () {
          clearSession();
        });
      }
    });
  }

  function bindNavDropdowns() {
    var nav = document.querySelector(".nav");
    if (!nav) return;

    var detailNodes = nav.querySelectorAll("details");
    if (!detailNodes.length) return;

    function closeAll(exceptNode) {
      detailNodes.forEach(function (node) {
        if (exceptNode && node === exceptNode) return;
        node.open = false;
      });
    }

    detailNodes.forEach(function (node) {
      node.addEventListener("toggle", function () {
        if (!node.open) return;
        closeAll(node);
      });
    });

    nav.querySelectorAll("details a[href]").forEach(function (link) {
      link.addEventListener("click", function () {
        closeAll();
      });
    });

    document.addEventListener("click", function (event) {
      if (nav.contains(event.target)) return;
      closeAll();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAll();
    });
  }

  function ensureProfileMenuStyles() {
    if (document.getElementById("profile-menu-styles")) return;
    var style = document.createElement("style");
    style.id = "profile-menu-styles";
    style.textContent = [
      ".profile-menu{position:relative;}",
      ".nav .profile-menu{margin-left:auto;}",
      ".profile-menu summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;",
      "text-decoration:none;color:var(--ink);border:1px solid var(--border);border-radius:11px;padding:.5rem .75rem;",
      "background:rgba(255,255,255,.72);font-weight:600;}",
      ".profile-menu summary::-webkit-details-marker{display:none;}",
      ".profile-menu .menu-pop{position:absolute;right:0;top:calc(100% + .45rem);min-width:220px;z-index:20;",
      "border:1px solid var(--border);border-radius:12px;background:#fff;box-shadow:0 10px 22px rgba(19,34,31,.16);padding:.45rem;}",
      ".profile-menu .menu-head{padding:.35rem .45rem .5rem;border-bottom:1px dashed var(--border);margin-bottom:.35rem;}",
      ".profile-menu .menu-name{font-weight:700;font-size:.93rem;}",
      ".profile-menu .menu-sub{font-size:.82rem;opacity:.8;}",
      ".profile-menu .menu-item{display:block;text-decoration:none;color:var(--ink);font-weight:600;",
      "border:1px solid transparent;border-radius:9px;padding:.45rem .5rem;}",
      ".profile-menu .menu-item:hover{background:rgba(19,34,31,.05);border-color:var(--border);}",
      ".profile-menu .menu-item.exit{color:#8a2323;}"
    ].join("");
    document.head.appendChild(style);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function profileLinkByRole(role) {
    if (role === "sube") return toRootPage("sube/profil.html");
    if (role === "merkez") return toRootPage("merkez/profil.html");
    if (role === "admin") return toRootPage("admin/profile.html");
    return toRootPage("login.html");
  }

  function injectProfileMenu(role) {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    if (nav.querySelector("[data-profile-menu='1']")) return;

    var session = getSession() || {};
    var displayName = session.displayName || session.branchName || session.centerName || session.email || ("Rol: " + (role || "-"));
    var subline = (role || "-").toUpperCase();
    if (session.branchName) subline += " | " + session.branchName;
    if (session.centerName) subline += " | " + session.centerName;

    ensureProfileMenuStyles();

    var showAdminLink = cfg.TEST_MODE || role === "admin";

    var details = document.createElement("details");
    details.className = "profile-menu";
    details.setAttribute("data-profile-menu", "1");
    details.innerHTML = [
      "<summary>",
      "<span>", escapeHtml(displayName), "</span>",
      "</summary>",
      "<div class='menu-pop'>",
      "<div class='menu-head'>",
      "<div class='menu-name'>", escapeHtml(displayName), "</div>",
      "<div class='menu-sub'>", escapeHtml(subline), "</div>",
      "</div>",
      "<a class='menu-item' href='", profileLinkByRole(role), "'>Profili Gor</a>",
      showAdminLink ? "<a class='menu-item' href='" + toRootPage("admin/index.html") + "'>Admin Paneli</a>" : "",
      "<a class='menu-item exit' href='", toRootPage("login.html"), "'>Cikis</a>",
      "</div>"
    ].join("");

    nav.appendChild(details);
  }

  function injectAdminLink(role) {
    if (!cfg.TEST_MODE && role !== "admin") return;
    var path = window.location.pathname.replace(/\\/g, "/");
    if (path.indexOf("/admin/") > -1) return;
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var existing = nav.querySelector("a[href='admin/index.html'], a[href='../admin/index.html'], a[href='index.html'][data-admin-link='1']");
    if (existing) return;
    var a = document.createElement("a");
    if (path.indexOf("/sube/") > -1 || path.indexOf("/merkez/") > -1) {
      a.href = "../admin/index.html";
    } else {
      a.href = "admin/index.html";
    }
    a.textContent = "Admin";
    a.setAttribute("data-admin-link", "1");
    nav.appendChild(a);
  }

  function applyGuard() {
    if (cfg.TEST_MODE) return;
    var page = normalizePath();
    var role = currentRole();
    var allowed = routeRoles(page);

    if (!allowed) return;
    if (!role) {
      window.location.replace(toRootPage("login.html"));
      return;
    }
    if (allowed.indexOf(role) === -1) {
      window.location.replace(roleHome(role));
    }
  }

  window.AuthSession = {
    get: getSession,
    set: setSession,
    clear: clearSession,
    role: currentRole
  };

  applyGuard();
  installAuthFetchInterceptor();
  document.addEventListener("DOMContentLoaded", function () {
    var role = currentRole();
    toggleNavByRole(role);
    injectAdminLink(role);
    injectProfileMenu(role);
    bindNavDropdowns();
    bindLogout();
  });
})();
