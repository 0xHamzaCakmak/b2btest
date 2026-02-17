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

  function ensureProfileMenuStyles() {
    if (document.getElementById("profile-menu-styles")) return;
    var style = document.createElement("style");
    style.id = "profile-menu-styles";
    style.textContent = [
      ".profile-menu{position:relative;}",
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
    if (role === "admin") return toRootPage("admin/settings.html");
    return toRootPage("login.html");
  }

  function injectProfileMenu(role) {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    if (nav.querySelector("[data-profile-menu='1']")) return;

    var session = getSession() || {};
    var displayName = session.displayName || session.branchName || session.email || ("Rol: " + (role || "-"));
    var subline = (role || "-").toUpperCase();
    if (session.branchName) subline += " | " + session.branchName;

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
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var existing = nav.querySelector("a[href='admin/index.html'], a[href='../admin/index.html'], a[href='index.html'][data-admin-link='1']");
    if (existing) return;
    var a = document.createElement("a");
    var path = window.location.pathname.replace(/\\/g, "/");
    if (path.indexOf("/admin/") > -1) {
      a.href = "index.html";
    } else if (path.indexOf("/sube/") > -1 || path.indexOf("/merkez/") > -1) {
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
  document.addEventListener("DOMContentLoaded", function () {
    var role = currentRole();
    toggleNavByRole(role);
    injectAdminLink(role);
    injectProfileMenu(role);
    bindLogout();
  });
})();
