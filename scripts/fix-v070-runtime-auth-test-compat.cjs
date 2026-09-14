const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../app/src/AppPages.tsx');
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const before = `  React.useEffect(() => {\n    let cancelled = false;\n    window.raCompanion.getRuntimeAuthStatus()\n      .then((status) => { if (!cancelled) setRuntimeAuth(status); })\n      .catch((runtimeStatusError) => { if (!cancelled) setRuntimeError(runtimeStatusError?.message || String(runtimeStatusError)); });\n    return () => { cancelled = true; };\n  }, [connectedUser, lastVerifiedAt]);`;

const after = `  React.useEffect(() => {\n    let cancelled = false;\n    const getRuntimeAuthStatus = window.raCompanion?.getRuntimeAuthStatus;\n    if (typeof getRuntimeAuthStatus !== 'function') return () => { cancelled = true; };\n    getRuntimeAuthStatus()\n      .then((status) => { if (!cancelled) setRuntimeAuth(status); })\n      .catch((runtimeStatusError) => { if (!cancelled) setRuntimeError(runtimeStatusError?.message || String(runtimeStatusError)); });\n    return () => { cancelled = true; };\n  }, [connectedUser, lastVerifiedAt]);`;

if (!content.includes(after)) {
  if (!content.includes(before)) throw new Error('Could not find Settings runtime auth effect.');
  content = content.replace(before, after);
  fs.writeFileSync(file, content, 'utf8');
}

console.log('v0.7 runtime auth settings mock compatibility applied.');
