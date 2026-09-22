#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return "";
  return args[idx + 1];
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const version = getArg("--version");
const shouldPublish = args.includes("--publish");

function run(command) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: "inherit" });
}

function runCapture(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

if (!version) {
  fail("Usage: node scripts/release.mjs --version <semver> [--publish]");
}

if (!/^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/.test(version)) {
  fail("Version must look like 0.1.4");
}

const repoRoot = process.cwd();
const tauriConfigPath = path.join(repoRoot, "backend", "tauri.conf.json");
const cargoTomlPath = path.join(repoRoot, "backend", "Cargo.toml");
const frontendPkgPath = path.join(repoRoot, "frontend", "package.json");

for (const filePath of [tauriConfigPath, cargoTomlPath, frontendPkgPath]) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${filePath}`);
  }
}

const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
const frontendPkg = JSON.parse(fs.readFileSync(frontendPkgPath, "utf8"));
const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");

tauriConfig.version = version;
frontendPkg.version = version;

const updatedCargoToml = cargoToml.replace(/^version = "[^"]+"/m, `version = "${version}"`);
if (updatedCargoToml === cargoToml && !cargoToml.includes(`version = "${version}"`)) {
  fail("Could not update version in backend/Cargo.toml");
}

fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
fs.writeFileSync(frontendPkgPath, `${JSON.stringify(frontendPkg, null, 2)}\n`);
fs.writeFileSync(cargoTomlPath, updatedCargoToml);

console.log("Release files updated:");
console.log(`- backend/tauri.conf.json -> ${version}`);
console.log(`- backend/Cargo.toml -> ${version}`);
console.log(`- frontend/package.json -> ${version}`);
console.log("");
if (!shouldPublish) {
  console.log("Next commands:");
  console.log("git add backend/tauri.conf.json backend/Cargo.toml frontend/package.json");
  console.log(`git commit -m "Release v${version}"`);
  console.log(`git tag -a v${version} -m "Release v${version}"`);
  console.log("git push");
  console.log("git push origin --follow-tags");
  console.log("");
  console.log("Or run with --publish to do all git steps automatically.");
  process.exit(0);
}

run("git add .");
const stagedFiles = runCapture("git diff --cached --name-only");
if (!stagedFiles) {
  fail("No staged changes found after git add .");
}
run(`git commit -m "Release v${version}"`);
run(`git tag -a v${version} -m "Release v${version}"`);
run("git push");
run("git push origin --follow-tags");
console.log("");
console.log(`Release published: v${version}`);
console.log("GitHub Actions will build Windows, macOS, and Linux.");
