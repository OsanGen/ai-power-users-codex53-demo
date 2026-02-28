#!/usr/bin/env node
"use strict";

const fs = require("fs");

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    return null;
  }
}

function fail(message) {
  console.error(`[dependency-contract] FAIL: ${message}`);
  process.exit(1);
}

function toSortedRecordMap(record) {
  if (!record || typeof record !== "object") {
    return {};
  }
  return Object.keys(record)
    .sort()
    .reduce((acc, key) => {
      acc[key] = String(record[key]);
      return acc;
    }, {});
}

function compareDependencySection(sectionName, expected, actual) {
  const expectedSorted = toSortedRecordMap(expected);
  const actualSorted = toSortedRecordMap(actual);

  const expectedKeys = Object.keys(expectedSorted);
  const actualKeys = Object.keys(actualSorted);

  const missingFromLock = [];
  const mismatch = [];

  for (let i = 0; i < expectedKeys.length; i += 1) {
    const key = expectedKeys[i];
    const expectedValue = expectedSorted[key];
    if (!Object.prototype.hasOwnProperty.call(actualSorted, key)) {
      missingFromLock.push(`${sectionName}.${key} => ${expectedValue}`);
      continue;
    }
    if (actualSorted[key] !== expectedValue) {
      mismatch.push(`${sectionName}.${key}: manifest ${expectedValue}, lock ${actualSorted[key]}`);
    }
  }

  const extraInLock = actualKeys.filter((key) => !Object.prototype.hasOwnProperty.call(expectedSorted, key));

  if (missingFromLock.length > 0) {
    fail(`manifest dependency section '${sectionName}' has entries missing from lockfile: ${missingFromLock.join(", ")}`);
  }

  if (mismatch.length > 0) {
    fail(`manifest dependency versions do not match lockfile in section '${sectionName}': ${mismatch.join(", ")}`);
  }

  if (extraInLock.length > 0) {
    fail(`lockfile has extra top-level entries in '${sectionName}' not declared in package.json: ${extraInLock.join(", ")}`);
  }
}

const packageJsonPath = "package.json";
const lockJsonPath = "package-lock.json";

const packageData = readJson(packageJsonPath);
if (!packageData) {
  fail(`unable to read or parse ${packageJsonPath}`);
}

const lockData = readJson(lockJsonPath);
if (!lockData) {
  fail(`unable to read or parse ${lockJsonPath}`);
}

if (lockData.lockfileVersion < 2) {
  fail(`unsupported lockfileVersion ${lockData.lockfileVersion}; expected >=2`);
}

if (typeof lockData.name === "string" && lockData.name !== packageData.name) {
  fail(`lockfile package name mismatch: lock '${lockData.name}' vs package '${packageData.name}'`);
}

const lockRoot = lockData.packages && typeof lockData.packages === "object" ? lockData.packages[""] : null;
if (!lockRoot) {
  fail("lockfile root package entry not found at packages['']");
}

const packageDependencies = packageData.dependencies || {};
const packageDevDependencies = packageData.devDependencies || {};
const lockDependencies = lockRoot.dependencies || {};
const lockDevDependencies = lockRoot.devDependencies || {};

compareDependencySection("dependencies", packageDependencies, lockDependencies);
compareDependencySection("devDependencies", packageDevDependencies, lockDevDependencies);

if (lockRoot.name && packageData.name && lockRoot.name === packageData.name) {
  console.log(`dependency-contract ok for ${packageData.name}@${packageData.version || "unknown"}`);
}
