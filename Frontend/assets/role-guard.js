(function () {
  var cfg = window.APP_CONFIG || {};
  var sessionCache = null;
  var sessionHydratePromise = null;

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
    return sessionCache;
  }

  function setSession(session) {
    if (!session || typeof session !== "object") {
      sessionCache = null;
      return;
    }
    var next = Object.assign({}, session);
    if (Object.prototype.hasOwnProperty.call(next, "accessToken")) delete next.accessToken;
    if (Object.prototype.hasOwnProperty.call(next, "refreshToken")) delete next.refreshToken;
    sessionCache = next;
  }

  function clearSession() {
    sessionCache = null;
  }

  function mapUserToSession(user) {
    if (!user || typeof user !== "object") return null;
    return {
      userId: user.id || null,
      email: user.email || null,
      phone: user.phone || null,
      displayName: user.displayName || null,
      role: user.role || null,
      branchId: user.branchId || null,
      branchName: user.branchName || null,
      centerId: user.centerId || null,
      centerName: user.centerName || null,
      isActive: user.isActive !== false,
      hydratedAt: new Date().toISOString()
    };
  }

  async function hydrateSessionFromApi(force) {
    if (cfg.TEST_MODE) {
      if (!sessionCache) {
        setSession({
          role: cfg.DEFAULT_TEST_ROLE || "admin",
          displayName: "Test Kullanici",
          hydratedAt: new Date().toISOString()
        });
      }
      return sessionCache;
    }
    if (!force && sessionCache && sessionCache.role) return sessionCache;
    if (!force && sessionHydratePromise) return sessionHydratePromise;

    var rawFetch = window.__AUTH_RAW_FETCH || (typeof window.fetch === "function" ? window.fetch.bind(window) : null);
    if (!rawFetch) return null;

    sessionHydratePromise = rawFetch(apiBaseUrl() + "/me", {
      method: "GET",
      credentials: "include"
    })
      .then(function (response) {
        return response.json().catch(function () { return null; }).then(function (payload) {
          if (!response.ok || !payload || payload.ok !== true || !payload.data) {
            clearSession();
            return null;
          }
          var nextSession = mapUserToSession(payload.data);
          setSession(nextSession);
          return nextSession;
        });
      })
      .catch(function () {
        clearSession();
        return null;
      })
      .finally(function () {
        sessionHydratePromise = null;
      });

    return sessionHydratePromise;
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
    var requestBody = {};
    if (session && session.refreshToken) requestBody.refreshToken = session.refreshToken;

    var response = await window.__AUTH_RAW_FETCH(apiBaseUrl() + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(requestBody)
    });
    var payload = await response.json().catch(function () { return null; });
    if (!response.ok || !payload || payload.ok !== true || !payload.data) {
      return false;
    }

    if (payload.data.user && typeof payload.data.user === "object") {
      setSession(mapUserToSession(payload.data.user));
    } else {
      await hydrateSessionFromApi(true);
    }
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

      var nextHeaders = normalizeHeaders(init && init.headers);

      var retryInit = Object.assign({}, init || {}, { headers: nextHeaders });
      return rawFetch(input, retryInit);
    };

    window.__AUTH_FETCH_INSTALLED = true;
  }

  function currentRole() {
    if (sessionCache && sessionCache.role) return sessionCache.role;
    if (cfg.TEST_MODE) return (sessionCache && sessionCache.role) || cfg.DEFAULT_TEST_ROLE || "admin";
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
          if (!cfg.TEST_MODE && window.__AUTH_RAW_FETCH) {
            window.__AUTH_RAW_FETCH(apiBaseUrl() + "/auth/logout", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" }
            }).catch(function () {});
          }
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
      ".nav{display:flex;flex-wrap:wrap;align-items:center;gap:.55rem .6rem;}",
      ".nav > a,.nav > details > summary{min-height:40px;line-height:1.1;}",
      ".nav > a{display:inline-flex;align-items:center;justify-content:center;padding:.55rem .8rem;}",
      ".nav > details > summary{padding:.55rem .8rem;}",
      ".nav > a,.nav > details > summary{font-size:.98rem;font-weight:600;}",
      "@media (max-width: 900px){.nav{gap:.45rem .45rem;}}",
      "@media (max-width: 700px){",
      ".nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;}",
      ".nav > a,.nav > details > summary{width:100%;justify-content:center;}",
      ".nav .profile-menu{grid-column:1 / -1;margin-left:0;justify-self:stretch;}",
      ".nav .profile-menu summary{max-width:100%;justify-content:space-between;}",
      ".profile-menu .menu-pop{left:0;right:auto;max-width:min(92vw,360px);}",
      "}",
      ".profile-menu{position:relative;}",
      ".nav .profile-menu{margin-left:auto;}",
      ".profile-menu summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;",
      "text-decoration:none;color:var(--ink);border:1px solid var(--border);border-radius:11px;padding:.5rem .75rem;",
      "background:rgba(255,255,255,.72);font-weight:600;max-width:min(38vw,280px);}",
      ".profile-menu summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".profile-menu summary::-webkit-details-marker{display:none;}",
      ".profile-menu .menu-pop{position:absolute;right:0;top:calc(100% + .45rem);min-width:220px;z-index:20;",
      "border:1px solid var(--border);border-radius:12px;background:#fff;box-shadow:0 10px 22px rgba(19,34,31,.16);padding:.45rem;max-width:min(84vw,300px);}",
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

  async function applyGuard() {
    if (cfg.TEST_MODE) return;
    var page = normalizePath();
    var allowed = routeRoles(page);

    if (!allowed) return;
    await hydrateSessionFromApi(false);
    var role = currentRole();
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
    role: currentRole,
    hydrate: hydrateSessionFromApi
  };

  installAuthFetchInterceptor();
  applyGuard();
  document.addEventListener("DOMContentLoaded", async function () {
    await hydrateSessionFromApi(false);
    var role = currentRole();
    toggleNavByRole(role);
    injectAdminLink(role);
    injectProfileMenu(role);
    bindNavDropdowns();
    bindLogout();
  });
})();
