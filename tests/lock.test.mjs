import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

async function loadLockModule() {
    const source = readFileSync(new URL("../extension.mjs", import.meta.url), "utf8");
    const start = source.indexOf("// Section 5b: Lock File Management");
    const end = source.indexOf("// Section 6: Access Control & Pairing");
    assert.notEqual(start, -1, "lock section start marker should exist");
    assert.notEqual(end, -1, "lock section end marker should exist");

    const moduleDir = join(tmpdir(), `telegram-lock-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(moduleDir, { recursive: true });
    const modulePath = join(moduleDir, "lock-harness.mjs");
    const constantsStart = source.indexOf("const POLL_TIMEOUT = 30;");
    const constantsEnd = source.indexOf("// Section 2: Utility Functions");
    assert.notEqual(constantsStart, -1, "constants start marker should exist");
    assert.notEqual(constantsEnd, -1, "constants end marker should exist");

    const harness = `
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { join } from "node:path";
import { hostname, platform } from "node:os";

const BOTS_DIR = ${JSON.stringify(join(moduleDir, "bots"))};
${source.slice(constantsStart, constantsEnd)}

function loadJsonOrDefault(filePath, defaultValue) {
    try {
        return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (err) {
        if (err.code === "ENOENT") return structuredClone(defaultValue);
        if (err instanceof SyntaxError) return structuredClone(defaultValue);
        throw err;
    }
}

function saveJsonAtomic(filePath, data, mode) {
    mkdirSync(join(filePath, ".."), { recursive: true });
    const tmp = filePath + ".tmp";
    const opts = mode != null ? { mode } : undefined;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\\n", opts);
    renameSync(tmp, filePath);
}

function botDir(name) { return join(BOTS_DIR, name); }
function botLockPath(name) { return join(botDir(name), "lock.json"); }

${source.slice(start, end)}

export {
    botLockPath,
    LOCK_STALE_AFTER_MS,
    readLock,
    writeLock,
    refreshLock,
    removeLock,
    isLockStale,
    getProcessStartToken,
    lockOwnedByCurrentProcess,
};
`;
    writeFileSync(modulePath, harness);
    return import(pathToFileURL(modulePath));
}

test("writeLock records heartbeat and process identity", async () => {
    const locks = await loadLockModule();

    locks.writeLock("copilotcli", "session-1");
    const lock = locks.readLock("copilotcli");

    assert.equal(lock.pid, process.pid);
    assert.equal(lock.sessionId, "session-1");
    assert.equal(lock.botName, "copilotcli");
    assert.match(lock.connectedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(lock.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof lock.hostname, "string");
    assert.ok(lock.hostname.length > 0);
    assert.equal(lock.processStartToken, locks.getProcessStartToken(process.pid));
    assert.equal(lock.processStartTokenSource, process.platform);
    assert.equal(locks.isLockStale(lock), false);
});

test("isLockStale rejects old heartbeats even when the pid still exists", async () => {
    const locks = await loadLockModule();

    locks.writeLock("copilotcli", "session-1");
    const lock = locks.readLock("copilotcli");
    lock.updatedAt = new Date(Date.now() - locks.LOCK_STALE_AFTER_MS - 1000).toISOString();

    assert.equal(locks.isLockStale(lock), true);
});

test("isLockStale rejects pid reuse when the platform exposes process start tokens", async () => {
    const locks = await loadLockModule();

    locks.writeLock("copilotcli", "session-1");
    const lock = locks.readLock("copilotcli");
    lock.processStartToken = "definitely-not-this-process";

    assert.equal(locks.isLockStale(lock), locks.getProcessStartToken(process.pid) !== null);
});

test("refreshLock updates only the current session lock", async () => {
    const locks = await loadLockModule();

    locks.writeLock("copilotcli", "session-1");
    const first = locks.readLock("copilotcli");
    const oldUpdatedAt = new Date(Date.now() - 10_000).toISOString();
    writeFileSync(locks.botLockPath("copilotcli"), JSON.stringify({ ...first, updatedAt: oldUpdatedAt }, null, 2) + "\n");

    assert.equal(locks.refreshLock("copilotcli", "wrong-session"), false);
    assert.equal(locks.readLock("copilotcli").updatedAt, oldUpdatedAt);

    assert.equal(locks.refreshLock("copilotcli", "session-1"), true);
    assert.notEqual(locks.readLock("copilotcli").updatedAt, oldUpdatedAt);
});

test("removeLock only removes locks owned by this process and session", async () => {
    const locks = await loadLockModule();

    locks.writeLock("copilotcli", "session-1");
    assert.equal(locks.lockOwnedByCurrentProcess(locks.readLock("copilotcli"), "session-1"), true);

    locks.removeLock("copilotcli", "wrong-session");
    assert.ok(locks.readLock("copilotcli"));

    locks.removeLock("copilotcli", "session-1");
    assert.equal(locks.readLock("copilotcli"), null);
});
