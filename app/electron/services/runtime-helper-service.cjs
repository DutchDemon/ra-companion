const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function createRuntimeHelperService({ app }) {
  let child = null;
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let nextRequestId = 1;
  const pending = new Map();
  let state = {
    supportedPlatform: process.platform === 'win32',
    available: false,
    running: false,
    ready: false,
    protocolVersion: null,
    rcheevosVersion: '',
    rcheevosTag: '',
    pid: null,
    lastError: '',
  };

  function helperPath() {
    const appRoot = typeof app?.getAppPath === 'function'
      ? app.getAppPath()
      : path.join(__dirname, '..', '..');
    return path.join(appRoot, 'tools', 'ra-runtime-helper.exe');
  }

  function publicStatus() {
    return { ...state };
  }

  function rejectPending(error) {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'ready') {
      state = {
        ...state,
        available: true,
        running: true,
        ready: Boolean(message.runtimeInitialized),
        protocolVersion: Number(message.protocolVersion || 0) || null,
        rcheevosVersion: String(message.rcheevosVersion || ''),
        rcheevosTag: String(message.rcheevosTag || ''),
        lastError: '',
      };
      return;
    }

    if (message.type === 'response') {
      const id = Number(message.id || 0);
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (message.ok === false) entry.reject(new Error(String(message.error || 'Runtime helper command failed.')));
      else entry.resolve(message);
    }
  }

  function parseStdout(chunk) {
    stdoutBuffer += String(chunk || '');
    while (true) {
      const newline = stdoutBuffer.indexOf('\n');
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch (error) {
        state = { ...state, lastError: `Invalid runtime-helper JSON: ${error?.message || error}` };
      }
    }
  }

  function start() {
    if (child && !child.killed) return publicStatus();

    if (process.platform !== 'win32') {
      state = { ...state, supportedPlatform: false, available: false, lastError: 'Runtime helper is Windows-only.' };
      return publicStatus();
    }

    const executable = helperPath();
    const available = fs.existsSync(executable);
    if (!available) {
      state = { ...state, available: false, running: false, ready: false, pid: null, lastError: 'Runtime helper is not installed.' };
      return publicStatus();
    }

    stdoutBuffer = '';
    stderrBuffer = '';
    state = { ...state, available: true, running: false, ready: false, pid: null, lastError: '' };

    try {
      const spawned = spawn(executable, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child = spawned;
      state = { ...state, running: true, pid: spawned.pid || null };

      spawned.stdout.setEncoding('utf8');
      spawned.stderr.setEncoding('utf8');
      spawned.stdout.on('data', parseStdout);
      spawned.stderr.on('data', (chunk) => {
        stderrBuffer = `${stderrBuffer}${String(chunk || '')}`.slice(-4000);
        const message = stderrBuffer.trim();
        if (message) state = { ...state, lastError: message.split(/\r?\n/).slice(-1)[0] };
      });

      spawned.on('error', (error) => {
        if (child !== spawned) return;
        state = {
          ...state,
          running: false,
          ready: false,
          pid: null,
          lastError: error?.message || 'Could not start runtime helper.',
        };
        rejectPending(error instanceof Error ? error : new Error(String(error)));
      });

      spawned.on('exit', (code, signal) => {
        if (child !== spawned) return;
        child = null;
        const expected = code === 0 || signal === 'SIGTERM';
        state = {
          ...state,
          running: false,
          ready: false,
          pid: null,
          lastError: expected ? state.lastError : `Runtime helper exited (${code ?? signal ?? 'unknown'}).`,
        };
        rejectPending(new Error('Runtime helper exited.'));
      });
    } catch (error) {
      child = null;
      state = {
        ...state,
        running: false,
        ready: false,
        pid: null,
        lastError: error?.message || 'Could not start runtime helper.',
      };
    }

    return publicStatus();
  }

  function request(command, timeoutMs = 2500) {
    start();
    if (!child || child.killed || !child.stdin?.writable) {
      return Promise.reject(new Error(state.lastError || 'Runtime helper is not running.'));
    }

    const id = nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Runtime helper command timed out: ${command}`));
      }, timeoutMs);

      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });

      child.stdin.write(`${JSON.stringify({ id, command })}\n`, (error) => {
        if (!error) return;
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        entry.reject(error);
      });
    });
  }

  function stop() {
    if (!child || child.killed) return;
    const target = child;
    try {
      if (target.stdin?.writable) {
        const id = nextRequestId++;
        target.stdin.write(`${JSON.stringify({ id, command: 'shutdown' })}\n`);
      }
    } catch {
      // Best effort during application shutdown.
    }
    setTimeout(() => {
      if (child === target && !target.killed) {
        try { target.kill(); } catch { /* best effort */ }
      }
    }, 400).unref();
  }

  return {
    start,
    stop,
    request,
    getStatus: publicStatus,
    getHelperPath: helperPath,
  };
}

module.exports = { createRuntimeHelperService };
