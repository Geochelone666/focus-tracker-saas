#!/usr/bin/env node
// Offline-only migration inventory comparison. No credentials, network or SQL execution.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_PATTERN = /^(\d{3}|\d{14})_([a-z][a-z0-9_]*)\.sql$/;
const VERSION_PATTERN = /^(\d{3}|\d{14})$/;
const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const DEFAULT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');
const MAX_SNAPSHOT_BYTES = 256 * 1024;

export class PreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function scanLocalMigrations(directory = DEFAULT_DIR) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    throw new PreflightError('LOCAL_READ_ERROR', 'Cannot read the local migrations directory.');
  }
  const migrations = [];
  const findings = [];
  const versions = new Set();
  for (const entry of entries) {
    if (!entry.name.endsWith('.sql')) continue;
    const match = entry.name.match(LOCAL_PATTERN);
    if (!entry.isFile() || !match) {
      findings.push({ code: 'INVALID_LOCAL_FILENAME' });
      continue;
    }
    const [, version, name] = match;
    if (versions.has(version)) {
      findings.push({ code: 'DUPLICATE_LOCAL_VERSION', localVersion: version });
      continue;
    }
    versions.add(version);
    migrations.push({ version, name });
  }
  if (migrations.length === 0) findings.push({ code: 'EMPTY_LOCAL_INVENTORY' });
  migrations.sort((a, b) => a.version.localeCompare(b.version));
  return { migrations, findings };
}

export function parseRemoteSnapshot(input) {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new PreflightError('INVALID_SNAPSHOT', 'Remote inventory must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).some(key => !['complete', 'migrations'].includes(key)) ||
      !Array.isArray(parsed.migrations) || typeof parsed.complete !== 'boolean') {
    throw new PreflightError('INVALID_SNAPSHOT', 'Expected only complete (boolean) and migrations (array).');
  }
  if (!parsed.complete) {
    throw new PreflightError('INCOMPLETE_INVENTORY', 'The supplied remote inventory is not explicitly complete.');
  }
  if (!parsed.migrations.length) {
    throw new PreflightError('INCOMPLETE_INVENTORY', 'An empty remote inventory cannot establish parity.');
  }
  const migrations = parsed.migrations.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).some(key => !['version', 'name'].includes(key)) ||
        typeof row.version !== 'string' || !VERSION_PATTERN.test(row.version) ||
        typeof row.name !== 'string' || !NAME_PATTERN.test(row.name)) {
      throw new PreflightError('INVALID_SNAPSHOT', 'Each remote row must contain only a valid version and name.');
    }
    return { version: row.version, name: row.name };
  });
  return migrations;
}

function duplicateFindings(rows, source) {
  const seen = new Set();
  const duplicates = [];
  for (const row of rows) {
    if (seen.has(row.version)) {
      duplicates.push({ code: 'DUPLICATE_' + source + '_VERSION', [source.toLowerCase() + 'Version']: row.version });
    }
    seen.add(row.version);
  }
  return duplicates;
}

function potentialAliases(remote, candidates) {
  return candidates.filter(local =>
    remote.name === local.name ||
    (local.version.length === 14 && remote.name.split('_').includes(local.version)));
}

export function compareInventories(local, remote, initialFindings = []) {
  const findings = [...initialFindings, ...duplicateFindings(local, 'LOCAL'), ...duplicateFindings(remote, 'REMOTE')];
  if (findings.length) {
    return { status: 'BLOCKED', mode: 'comparison', localCount: local.length, remoteCount: remote.length, findings };
  }
  const localByVersion = new Map(local.map(item => [item.version, item]));
  const matchedLocal = new Set();
  const unmatchedRemote = [];
  for (const item of remote) {
    const exact = localByVersion.get(item.version);
    if (exact) {
      matchedLocal.add(exact.version);
      if (exact.name !== item.name) {
        findings.push({ code: 'NAME_MISMATCH', localVersion: exact.version, remoteVersion: item.version,
          localName: exact.name, remoteName: item.name });
      }
    } else {
      unmatchedRemote.push(item);
    }
  }
  const matchedRemote = new Set();
  for (const item of unmatchedRemote) {
    const remaining = local.filter(candidate => !matchedLocal.has(candidate.version));
    const candidates = potentialAliases(item, remaining);
    if (candidates.length > 1) {
      findings.push({ code: 'AMBIGUOUS_ALIAS', remoteVersion: item.version, remoteName: item.name,
        candidateVersions: candidates.map(candidate => candidate.version).sort() });
    } else if (candidates.length === 1) {
      const candidate = candidates[0];
      findings.push({ code: 'VERSION_MISMATCH', localVersion: candidate.version,
        remoteVersion: item.version, localName: candidate.name, remoteName: item.name });
      matchedLocal.add(candidate.version);
      matchedRemote.add(item.version);
    }
  }
  for (const item of unmatchedRemote) {
    if (!matchedRemote.has(item.version) &&
        !findings.some(finding => finding.code === 'AMBIGUOUS_ALIAS' && finding.remoteVersion === item.version)) {
      findings.push({ code: 'REMOTE_ONLY', remoteVersion: item.version, remoteName: item.name });
    }
  }
  for (const item of local) {
    if (!matchedLocal.has(item.version)) {
      findings.push({ code: 'LOCAL_ONLY', localVersion: item.version, localName: item.name });
    }
  }
  findings.sort((a, b) => a.code.localeCompare(b.code) ||
    (a.localVersion ?? a.remoteVersion ?? '').localeCompare(b.localVersion ?? b.remoteVersion ?? ''));
  return { status: findings.length ? 'BLOCKED' : 'PASS', mode: 'comparison',
    localCount: local.length, remoteCount: remote.length, findings };
}

export function runPreflight({ migrationsDir = DEFAULT_DIR, remoteFile = null, localOnly = false } = {}) {
  if (localOnly === Boolean(remoteFile)) {
    throw new PreflightError('INVALID_ARGUMENTS', 'Choose exactly one: --local-only or --remote FILE.');
  }
  const { migrations, findings } = scanLocalMigrations(migrationsDir);
  if (localOnly) {
    return { status: findings.length ? 'BLOCKED' : 'LOCAL_ONLY', mode: 'local-only',
      localCount: migrations.length, remoteCount: null, findings };
  }
  let source;
  try {
    const buffer = readFileSync(remoteFile);
    if (buffer.byteLength > MAX_SNAPSHOT_BYTES) {
      throw new PreflightError('INVALID_SNAPSHOT', 'Snapshot exceeds the 256 KiB size limit.');
    }
    source = buffer.toString('utf8');
  } catch (error) {
    if (error instanceof PreflightError) throw error;
    throw new PreflightError('SNAPSHOT_READ_ERROR', 'Cannot read the supplied snapshot file.');
  }
  const remote = parseRemoteSnapshot(source);
  return compareInventories(migrations, remote, findings);
}

const HELP = [
  'Offline Supabase migration drift preflight (never connects to Supabase).',
  'Usage:',
  '  node scripts/migration-drift-preflight.mjs --local-only [--format json]',
  '  node scripts/migration-drift-preflight.mjs --remote sanitized-inventory.json [--format json]',
  'Optional testing argument: --migrations-dir PATH',
  'Exit: 0 = valid local-only or exact parity; 1 = detected drift; 2 = invalid/incomplete input.',
  'A LOCAL_ONLY result never proves production migration parity.'
].join('\n');

function parseArgs(args) {
  const opts = { localOnly: false, remoteFile: null, migrationsDir: DEFAULT_DIR, format: 'text' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') return { help: true };
    if (arg === '--local-only') opts.localOnly = true;
    else if (arg === '--remote' || arg === '--migrations-dir' || arg === '--format') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new PreflightError('INVALID_ARGUMENTS', 'Missing option value.');
      }
      if (arg === '--remote') opts.remoteFile = value;
      if (arg === '--migrations-dir') opts.migrationsDir = value;
      if (arg === '--format') opts.format = value;
    } else if (arg === '--json') opts.format = 'json';
    else throw new PreflightError('INVALID_ARGUMENTS', 'Unknown option.');
  }
  if (!['text', 'json'].includes(opts.format)) {
    throw new PreflightError('INVALID_ARGUMENTS', 'Format must be text or json.');
  }
  return opts;
}

function emit(report, format) {
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('Migration preflight: ' + report.status + ' (' + report.mode + ')');
  console.log('Local: ' + report.localCount + '; remote: ' + (report.remoteCount ?? 'not checked'));
  for (const issue of report.findings) {
    const details = Object.entries(issue).filter(([key]) => key !== 'code')
      .map(([key, value]) => key + '=' + (Array.isArray(value) ? value.join(',') : value)).join(' ');
    console.log('- ' + issue.code + (details ? ': ' + details : ''));
  }
  if (report.status === 'LOCAL_ONLY') console.log('Local filenames valid; remote database NOT checked.');
  if (report.status === 'BLOCKED') console.log('STOP: manual reconciliation required; do not run db push.');
  if (report.status === 'PASS') console.log('Snapshot matches filenames; this does NOT verify SQL effects or live schema.');
}

function main(args) {
  let format = args.includes('--json') || args.includes('--format') &&
    args[args.indexOf('--format') + 1] === 'json' ? 'json' : 'text';
  try {
    const opts = parseArgs(args);
    if (opts.help) {
      console.log(HELP);
      return 0;
    }
    format = opts.format;
    const report = runPreflight(opts);
    emit(report, format);
    return report.status === 'BLOCKED' ? 1 : 0;
  } catch (error) {
    const report = { status: 'BLOCKED', mode: 'input-error', code: error instanceof PreflightError ?
      error.code : 'UNEXPECTED_ERROR', message: error instanceof PreflightError ?
      error.message : 'Preflight failed without changing any files.' };
    emit({ ...report, localCount: 0, remoteCount: null, findings: [{ code: report.code }] }, format);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
