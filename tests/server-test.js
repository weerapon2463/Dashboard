// Server sign-in rules, checked against the real Code.gs (tests/gas-server.js) — no Google involved.
//   node tests/server-test.js            (needs tests/data/demo.json: python tests/snapshot.py)
const { spawn } = require("child_process");
const path = require("path");
const crypto = require("crypto");

const PORT = 8791, TOKEN = "t-master-123";
const URL_ = `http://127.0.0.1:${PORT}/exec`;
const fails = [];
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) fails.push(m); };
const call = async (p) => (await fetch(URL_, { method: "POST", body: JSON.stringify(p) })).json();
const pinHash = (pin, salt) => { let h = 2166136261; const s = `${salt}:${pin}:y2j`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const pwDerive = (secret, salt, iter) => crypto.pbkdf2Sync(secret, `forge:${salt}`, iter, 32, "sha256").toString("hex");
const login = async (user, pw, roster) => {
  const u = roster.find((x) => x.username === user);
  return call({ action: "login", user, proof: u && u.iter ? pwDerive(pw, u.id, u.iter) : "", proofPin: u ? pinHash(pw, u.id) : "" });
};

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, "gas-server.js"), PORT, path.join(__dirname, "data", "demo.json"), TOKEN, "1"], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv.stdout.once("data", r));
  try {
    console.log("sign-in");
    ok((await call({ action: "hello" })).secure === true, "hello reports server sign-in on");
    const pullNoAuth = await call({ action: "pull" });
    ok(pullNoAuth.auth === "required" && !pullNoAuth.data, "pull without key or session is refused");
    const ro = await call({ action: "roster" });
    ok(ro.ok && ro.users.length >= 10, `roster lists users (${ro.users && ro.users.length})`);
    ok(!JSON.stringify(ro).match(/"pw"|"pin"|signature/), "roster carries no hashes or signatures");
    const bad = await login("demo-weld", "9999", ro.users);
    ok(!bad.ok && /เหลือ 4/.test(bad.error), "wrong password refused, attempts counted");
    const good = await login("demo-weld", "1234", ro.users);
    ok(good.ok && good.session && good.uid === "u-demo-weld", "right password → session");
    const S = good.session;

    console.log("data a signed-in person gets");
    const pull = await call({ action: "pull", session: S });
    ok(pull.ok && Object.keys(pull.data).length > 5, "session can pull data");
    const auth = JSON.parse(pull.data["y2j-auth-v1"].value);
    const others = auth.users.filter((u) => u.id !== "u-demo-weld");
    ok(others.every((u) => !("pw" in u) && !("pin" in u)), "other people's password hashes removed");
    ok(auth.users.find((u) => u.id === "u-demo-weld").pin, "own hash kept (for signing documents)");

    console.log("users & rights");
    const ver = (await call({ action: "versions", session: S })).versions;
    const me = auth.users.find((u) => u.id === "u-demo-weld");
    me.role = "admin"; me.signature = "data:image/png;base64,TEST";
    auth.users.find((u) => u.id === "u-demo-qc").active = false;
    const esc = await call({ action: "push", session: S, key: "y2j-auth-v1", value: JSON.stringify(auth), baseVersion: ver["y2j-auth-v1"].version });
    const raw1 = JSON.parse((await (await fetch(`http://127.0.0.1:${PORT}/_raw`)).json())["y2j-auth-v1"].value);
    ok(esc.ok && raw1.users.find((u) => u.id === "u-demo-weld").role === "operator", "operator cannot make themselves admin");
    ok(raw1.users.find((u) => u.id === "u-demo-qc").active === true, "operator cannot disable someone else");
    ok(raw1.users.find((u) => u.id === "u-demo-weld").signature === "data:image/png;base64,TEST", "operator can update their own signature");
    ok(raw1.users.filter((u) => u.id !== "u-demo-weld").every((u) => u.pin || u.pw), "nobody's password was wiped");
    ok(typeof esc.value === "string" && JSON.parse(esc.value).users.find((u) => u.id === "u-demo-weld").role === "operator", "server hands back what it stored");

    const adm = await login("demo-admin", "1234", ro.users);
    const A = adm.session;
    const aAuth = JSON.parse((await call({ action: "pull", session: A, keys: "y2j-auth-v1" })).data["y2j-auth-v1"].value);
    aAuth.users.find((u) => u.id === "u-demo-qc").role = "plant";
    const aVer = (await call({ action: "versions", session: A })).versions["y2j-auth-v1"].version;
    const ar = await call({ action: "push", session: A, key: "y2j-auth-v1", value: JSON.stringify(aAuth), baseVersion: aVer });
    const raw2 = JSON.parse((await (await fetch(`http://127.0.0.1:${PORT}/_raw`)).json())["y2j-auth-v1"].value);
    ok(ar.ok && raw2.users.find((u) => u.id === "u-demo-qc").role === "plant", "admin can change rights");
    ok(raw2.users.filter((u) => u.role).every((u) => u.pin || u.pw), "admin save keeps everyone's password");
    aAuth.users.forEach((u) => { if (u.role === "admin") u.active = false; });
    const lock = await call({ action: "push", session: A, key: "y2j-auth-v1", value: JSON.stringify(aAuth), baseVersion: ar.version });
    ok(!lock.ok && /อย่างน้อย 1/.test(lock.error), "cannot disable the last admin");

    console.log("confidential documents");
    const DK = "y2j-dept-docs-v1--c-demo";
    const all = JSON.parse((await call({ action: "pull", token: TOKEN, keys: DK })).data[DK].value);
    const secret = { no: "SO-TEST-SECRET", title: "ราคาพิเศษลูกค้า", status: "ร่าง", createdBy: "u-demo-exec", visibility: { mode: "private" } };
    const dept = { no: "NCR-TEST-QC", title: "ภายใน QC", status: "ร่าง", createdBy: "u-demo-qc", visibility: { mode: "dept", ownerDept: "qc" } };
    all.so = (all.so || []).concat(secret); all.ncr = (all.ncr || []).concat(dept);
    const dv = (await call({ action: "versions", token: TOKEN })).versions[DK].version;
    await call({ action: "push", token: TOKEN, key: DK, value: JSON.stringify(all), baseVersion: dv });
    const S2 = (await login("demo-mc", "1234", ro.users)).session || (await login("demo-paint", "1234", ro.users)).session;
    const mine = JSON.parse((await call({ action: "pull", session: S2, keys: DK })).data[DK].value);
    ok(!(mine.so || []).some((d) => d.no === "SO-TEST-SECRET"), "private document is not sent to others");
    ok(!(mine.ncr || []).some((d) => d.no === "NCR-TEST-QC"), "department-only document is not sent outside the department");
    const QC = (await login("demo-qc", "1234", ro.users)).session;
    ok(JSON.parse((await call({ action: "pull", session: QC, keys: DK })).data[DK].value).ncr.some((d) => d.no === "NCR-TEST-QC"), "department members do receive it");
    mine.ncr = (mine.ncr || []).concat({ no: "NCR-TEST-NEW", title: "ใหม่", status: "ร่าง", createdBy: "u-demo-paint" });
    const dv2 = (await call({ action: "versions", session: S2 })).versions[DK].version;
    const pr = await call({ action: "push", session: S2, key: DK, value: JSON.stringify(mine), baseVersion: dv2 });
    const after = JSON.parse((await call({ action: "pull", token: TOKEN, keys: DK })).data[DK].value);
    ok(pr.ok && after.so.some((d) => d.no === "SO-TEST-SECRET") && after.ncr.some((d) => d.no === "NCR-TEST-QC"), "a save from someone who never saw them keeps hidden documents");
    ok(after.ncr.some((d) => d.no === "NCR-TEST-NEW"), "their own new document is saved");

    console.log("audit log");
    const aud = JSON.parse((await call({ action: "pull", session: S, keys: "y2j-audit-v1" })).data["y2j-audit-v1"].value);
    const n0 = aud.length;
    const forged = aud.slice(5).concat([{ ts: new Date().toISOString(), user: "u-demo-ceo", userName: "CEO", action: "ปลอม", target: "x", detail: "" }]);
    const av = (await call({ action: "versions", session: S })).versions["y2j-audit-v1"].version;
    await call({ action: "push", session: S, key: "y2j-audit-v1", value: JSON.stringify(forged), baseVersion: av });
    const aud2 = JSON.parse((await (await fetch(`http://127.0.0.1:${PORT}/_raw`)).json())["y2j-audit-v1"].value);
    ok(aud2.length === Math.min(n0 + 1, 3000), "entries cannot be deleted");
    ok(aud2[aud2.length - 1].user === "u-demo-weld", "new entries are stamped with the signed-in person");

    console.log("admin-only actions, lockout, sign-out");
    ok(!(await call({ action: "secure", session: S, on: "0" })).ok, "operator cannot turn sign-in off");
    for (let i = 0; i < 5; i++) await login("demo-mc", "0000", ro.users);
    const locked = await login("demo-mc", "1234", ro.users);
    ok(!locked.ok && locked.locked, "5 wrong passwords lock the account for 15 minutes");
    console.log("back office");
    const A2 = (await login("demo-admin", "1234", ro.users)).session;
    ok(!(await call({ action: "unlock", session: S, user: "demo-mc" })).ok, "operator cannot unlock accounts");
    ok((await call({ action: "unlock", session: A2, user: "demo-mc" })).ok && (await login("demo-mc", "1234", ro.users)).ok, "admin unlocks a locked account");
    const lg = await call({ action: "signinlog", session: A2 });
    ok(lg.ok && lg.rows.length && lg.rows.some((r) => r[1] === "เข้าระบบไม่สำเร็จ"), "admin reads the sign-in history (newest first)");
    ok(!(await call({ action: "signinlog", session: S })).ok, "operator cannot read the sign-in history");
    const W2 = (await login("demo-paint", "1234", ro.users)).session;
    ok((await call({ action: "revokeall", session: A2 })).ok, "admin signs every device out");
    ok((await call({ action: "pull", session: W2, keys: "y2j-auth-v1" })).auth === "required" && (await call({ action: "pull", session: A2, keys: "y2j-auth-v1" })).auth === "required", "old sessions stop working after sign-everyone-out");
    ok((await login("demo-paint", "1234", ro.users)).ok, "people can sign in again right away");

    await call({ action: "logout", session: S });
    ok((await call({ action: "pull", session: S })).auth === "required", "session ends at sign-out");
    const st = await (await fetch(`http://127.0.0.1:${PORT}/_stats`)).json();
    ok(st.log.some((r) => r[0] === "เข้าระบบ") && st.log.some((r) => r[0] === "เข้าระบบไม่สำเร็จ"), "sign-ins written to _log");
    ok((await call({ action: "pull", token: TOKEN })).ok, "master key still works (backups)");
  } catch (e) {
    fails.push("EXC " + e.stack);
    console.log(e);
  } finally {
    srv.kill();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
  process.exit(fails.length ? 1 : 0);
})();
