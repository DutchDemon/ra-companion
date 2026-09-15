const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function makeStream() {
  const stream = new EventEmitter();
  stream.writable = true;
  stream.setEncoding = () => {};
  stream.write = (_data, callback) => {
    if (callback) callback();
    return true;
  };
  return stream;
}

function makeChild(pid) {
  const child = new EventEmitter();
  child.stdin = makeStream();
  child.stdout = makeStream();
  child.stderr = makeStream();
  child.killed = false;
  child.pid = pid;
  child.kill = () => { child.killed = true; return true; };
  return child;
}

(async () => {
  const filename = path.resolve(__dirname, '../app/electron/services/runtime-helper-service.cjs');
  const source = fs.readFileSync(filename, 'utf8');
  const children = [];
  const fakeSpawn = () => {
    const child = makeChild(9000 + children.length);
    children.push(child);
    return child;
  };

  const moduleObject = { exports: {} };
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    __dirname: path.dirname(filename),
    console,
    Buffer,
    JSON,
    Error,
    Number,
    String,
    Boolean,
    Array,
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    process: { platform: 'win32' },
    require(id) {
      if (id === 'fs') return { existsSync: () => true };
      if (id === 'path') return path;
      if (id === 'child_process') return { spawn: fakeSpawn };
      throw new Error(`Unexpected require: ${id}`);
    },
  };

  const wrapper = vm.runInNewContext(`(function(require,module,exports,__dirname){${source}\n})`, sandbox, { filename });
  wrapper(sandbox.require, moduleObject, moduleObject.exports, sandbox.__dirname);
  const service = moduleObject.exports.createRuntimeHelperService({ app: { getAppPath: () => '/fake' } });

  service.start();
  assert.equal(children.length, 1);
  assert.equal(service.getStatus().running, true);

  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
  children[0].stdin.emit('error', epipe);
  assert.equal(service.getStatus().running, false);
  assert.equal(children[0].killed, true);
  assert.match(service.getStatus().lastError, /reconnect automatically/i);

  service.start();
  assert.equal(children.length, 2, 'service should be restartable after the pipe closes');

  children[1].stdin.write = (_data, callback) => {
    const error = Object.assign(new Error('stream destroyed'), { code: 'ERR_STREAM_DESTROYED' });
    callback?.(error);
    return false;
  };
  await assert.rejects(service.request('memoryStatus'), /stream destroyed/i);
  assert.equal(service.getStatus().running, false);

  service.start();
  assert.equal(children.length, 3);
  children[2].stdin.write = (_data, callback) => {
    const error = Object.assign(new Error('shutdown EPIPE'), { code: 'EPIPE' });
    callback?.(error);
    return false;
  };
  assert.doesNotThrow(() => service.stop());
  assert.equal(service.getStatus().running, false);

  console.log('runtime-helper EPIPE/shutdown regression: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
