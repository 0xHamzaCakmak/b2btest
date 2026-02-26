const fs = require("fs");
const path = require("path");

const sourceDir = path.resolve(__dirname, "../../Frontend");
const targetDir = path.resolve(__dirname, "../public");

if (!fs.existsSync(sourceDir)) {
  console.warn(`[sync:frontend] source not found: ${sourceDir}`);
  process.exit(0);
}

try {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
  console.log(`[sync:frontend] copied ${sourceDir} -> ${targetDir}`);
} catch (error) {
  console.error("[sync:frontend] failed:", error && error.message ? error.message : error);
  process.exit(1);
}
