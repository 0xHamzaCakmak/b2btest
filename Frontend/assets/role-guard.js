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
    var subePages = ["profil.html", "siparis.html", "siparislerim.html"];
    var merkezPages = ["merkez.html", "merkez-urun-fiyat.html", "merkez-subeler.html"];
    var publicPages = ["login.html"];

    if (page.indexOf("admin") === 0 || window.location.pathname.replace(/\\/g, "/").indexOf("/admin/") > -1) {
      return ["admin"];
    }
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
    bindLogout();
    injectAdminLink(role);
  });
})();
