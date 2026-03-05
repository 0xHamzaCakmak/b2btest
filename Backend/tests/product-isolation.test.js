const { app } = require("../src/app");

const merkezACreds = {
  emailOrPhone: process.env.TEST_MERKEZ_A_EMAIL || "merkez@borekci.com",
  password: process.env.TEST_MERKEZ_A_PASSWORD || "12345678"
};
const merkezBCreds = {
  emailOrPhone: process.env.TEST_MERKEZ_B_EMAIL || "merkez2@borekci.com",
  password: process.env.TEST_MERKEZ_B_PASSWORD || "12345678"
};
const subeACreds = {
  emailOrPhone: process.env.TEST_SUBE_A_EMAIL || "sube01@borekci.com",
  password: process.env.TEST_SUBE_A_PASSWORD || "12345678"
};
const subeBCreds = {
  emailOrPhone: process.env.TEST_SUBE_B_EMAIL || "sube06@borekci.com",
  password: process.env.TEST_SUBE_B_PASSWORD || "12345678"
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

async function login(baseUrl, creds) {
  const jar = {};
  const res = await call(baseUrl, jar, "POST", "/api/auth/login", creds);
  assertStatus(res.response.status, 200, "Login", res.payload && res.payload.message);
  return jar;
}

async function run(baseUrl) {
  const merkezAJar = await login(baseUrl, merkezACreds);
  const merkezBJar = await login(baseUrl, merkezBCreds);
  const subeAJar = await login(baseUrl, subeACreds);
  const subeBJar = await login(baseUrl, subeBCreds);

  const nowTag = Date.now();
  const code = `izole_${nowTag}`;
  const name = `Izole Urun ${nowTag}`;
  const created = await call(baseUrl, merkezAJar, "POST", "/api/products", {
    code,
    name,
    unit: "ADET",
    basePrice: 999
  });
  assertStatus(created.response.status, 201, "Merkez A urun olusturma", created.payload && created.payload.message);
  const createdId = created.payload && created.payload.data && created.payload.data.id;
  const createdUnit = created.payload && created.payload.data && created.payload.data.unit;
  if (!createdId) throw new Error("Olusan urun id bulunamadi");
  if (String(createdUnit || "") !== "ADET") throw new Error("Olusan urun birimi beklenen degerde degil");

  const merkezAList = await call(baseUrl, merkezAJar, "GET", "/api/products");
  assertStatus(merkezAList.response.status, 200, "Merkez A urun listesi", merkezAList.payload && merkezAList.payload.message);
  const merkezAHas = Array.isArray(merkezAList.payload && merkezAList.payload.data)
    && merkezAList.payload.data.some((row) => row.id === createdId);
  if (!merkezAHas) throw new Error("Merkez A kendi olusturdugu urunu goremiyor");

  const merkezBList = await call(baseUrl, merkezBJar, "GET", "/api/products");
  assertStatus(merkezBList.response.status, 200, "Merkez B urun listesi", merkezBList.payload && merkezBList.payload.message);
  const merkezBHas = Array.isArray(merkezBList.payload && merkezBList.payload.data)
    && merkezBList.payload.data.some((row) => row.id === createdId);
  if (merkezBHas) throw new Error("Merkez B, Merkez A urununu goruyor");

  const subeAList = await call(baseUrl, subeAJar, "GET", "/api/products");
  assertStatus(subeAList.response.status, 200, "Sube A urun listesi", subeAList.payload && subeAList.payload.message);
  const subeAHas = Array.isArray(subeAList.payload && subeAList.payload.data)
    && subeAList.payload.data.some((row) => row.id === createdId);
  if (!subeAHas) throw new Error("Sube A, kendi merkez urununu goremiyor");

  const subeBList = await call(baseUrl, subeBJar, "GET", "/api/products");
  assertStatus(subeBList.response.status, 200, "Sube B urun listesi", subeBList.payload && subeBList.payload.message);
  const subeBHas = Array.isArray(subeBList.payload && subeBList.payload.data)
    && subeBList.payload.data.some((row) => row.id === createdId);
  if (subeBHas) throw new Error("Sube B, baska merkez urununu goruyor");

  const merkezBById = await call(baseUrl, merkezBJar, "GET", `/api/products/${encodeURIComponent(createdId)}`);
  assertStatus(merkezBById.response.status, 403, "Merkez B baska center urun by id", merkezBById.payload && merkezBById.payload.message);
}

async function main() {
  const port = Number(process.env.TEST_PORT || 4216);
  const server = app.listen(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
    console.log("PASS product-isolation");
    process.exitCode = 0;
  } catch (err) {
    console.error("FAIL product-isolation");
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error("FAIL product-isolation");
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});
