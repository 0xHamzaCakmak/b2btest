const { app } = require("../src/app");

const adminCreds = {
  emailOrPhone: process.env.TEST_ADMIN_EMAIL || "admin@borekci.com",
  password: process.env.TEST_ADMIN_PASSWORD || "12345678"
};
const subeCreds = {
  emailOrPhone: process.env.TEST_SUBE_EMAIL || "sube01@borekci.com",
  password: process.env.TEST_SUBE_PASSWORD || "12345678"
};
const merkezCreds = {
  emailOrPhone: process.env.TEST_MERKEZ_EMAIL || "merkez@borekci.com",
  password: process.env.TEST_MERKEZ_PASSWORD || "12345678"
};

function splitSetCookie(raw) {
  if (!raw) return [];
  return String(raw).split(/,(?=\s*[^;]+=)/g);
}

function updateJar(jar, setCookieHeader) {
  splitSetCookie(setCookieHeader).forEach((entry) => {
    const pair = String(entry || "").split(";")[0];
    const idx = pair.indexOf("=");
    if (idx <= 0) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) return;
    jar[key] = value;
  });
}

function toCookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(baseUrl, jar, method, path, body) {
  const headers = { "content-type": "application/json" };
  const cookie = toCookieHeader(jar);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  updateJar(jar, response.headers.get("set-cookie"));
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function assertStatus(actual, expected, label, details) {
  if (actual !== expected) {
    const reason = details ? ` | ${details}` : "";
    throw new Error(`${label} beklenen ${expected}, gelen ${actual}${reason}`);
  }
}

async function run(baseUrl) {
  const anonJar = {};
  const adminJar = {};
  const subeJar = {};
  const merkezJar = {};

  const anonMe = await call(baseUrl, anonJar, "GET", "/api/me");
  assertStatus(
    anonMe.response.status,
    401,
    "Anonim /api/me",
    anonMe.payload && anonMe.payload.message
  );

  const adminLogin = await call(baseUrl, adminJar, "POST", "/api/auth/login", adminCreds);
  assertStatus(
    adminLogin.response.status,
    200,
    "Admin login",
    adminLogin.payload && adminLogin.payload.message
  );

  const adminUsers = await call(baseUrl, adminJar, "GET", "/api/admin/users");
  assertStatus(
    adminUsers.response.status,
    200,
    "Admin /api/admin/users",
    adminUsers.payload && adminUsers.payload.message
  );

  const subeLogin = await call(baseUrl, subeJar, "POST", "/api/auth/login", subeCreds);
  assertStatus(
    subeLogin.response.status,
    200,
    "Sube login",
    subeLogin.payload && subeLogin.payload.message
  );

  const subeMe = await call(baseUrl, subeJar, "GET", "/api/me");
  assertStatus(
    subeMe.response.status,
    200,
    "Sube /api/me",
    subeMe.payload && subeMe.payload.message
  );

  const subeAdminUsers = await call(baseUrl, subeJar, "GET", "/api/admin/users");
  assertStatus(
    subeAdminUsers.response.status,
    403,
    "Sube /api/admin/users forbidden",
    subeAdminUsers.payload && subeAdminUsers.payload.message
  );

  const subeOrdersMy = await call(baseUrl, subeJar, "GET", "/api/orders/my");
  assertStatus(
    subeOrdersMy.response.status,
    200,
    "Sube /api/orders/my",
    subeOrdersMy.payload && subeOrdersMy.payload.message
  );

  const merkezLogin = await call(baseUrl, merkezJar, "POST", "/api/auth/login", merkezCreds);
  assertStatus(
    merkezLogin.response.status,
    200,
    "Merkez login",
    merkezLogin.payload && merkezLogin.payload.message
  );

  const merkezOrders = await call(baseUrl, merkezJar, "GET", "/api/orders");
  assertStatus(
    merkezOrders.response.status,
    200,
    "Merkez /api/orders",
    merkezOrders.payload && merkezOrders.payload.message
  );

  const merkezAdminUsers = await call(baseUrl, merkezJar, "GET", "/api/admin/users");
  assertStatus(
    merkezAdminUsers.response.status,
    403,
    "Merkez /api/admin/users forbidden",
    merkezAdminUsers.payload && merkezAdminUsers.payload.message
  );

  const refresh = await call(baseUrl, adminJar, "POST", "/api/auth/refresh", {});
  assertStatus(
    refresh.response.status,
    200,
    "Admin refresh",
    refresh.payload && refresh.payload.message
  );

  const meAfterRefresh = await call(baseUrl, adminJar, "GET", "/api/me");
  assertStatus(
    meAfterRefresh.response.status,
    200,
    "Admin /api/me after refresh",
    meAfterRefresh.payload && meAfterRefresh.payload.message
  );

  const logout = await call(baseUrl, adminJar, "POST", "/api/auth/logout", {});
  assertStatus(
    logout.response.status,
    200,
    "Admin logout",
    logout.payload && logout.payload.message
  );

  const meAfterLogout = await call(baseUrl, adminJar, "GET", "/api/me");
  assertStatus(
    meAfterLogout.response.status,
    401,
    "Admin /api/me after logout",
    meAfterLogout.payload && meAfterLogout.payload.message
  );
}

async function main() {
  const port = Number(process.env.TEST_PORT || 4215);
  const server = app.listen(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
    console.log("PASS auth-regression");
    process.exitCode = 0;
  } catch (err) {
    console.error("FAIL auth-regression");
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error("FAIL auth-regression");
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});

