"""FORGE regression tests — run the real app in headless Chrome against a data snapshot.

Nothing is synced: the app runs in local mode on a copy of the site, loaded with the
snapshot's data, signed in as each test user. A test is a JS file that defines
`async function run(ctx)` and returns a list of lines; `ctx.assert(cond, msg)` fails it.
Any page error (window 'error' event) also fails the test.

  python tests/snapshot.py            # once: pull the public DEMO data into tests/data/demo.json
  python tests/run.py                 # every suite in tests/suites.json
  python tests/run.py floor u-demo-mc # one test file (tests/floor.test.js) as one user
"""
import html, io, json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(HERE, "data", "demo.json")
CHROMES = [os.environ.get("CHROME", ""), r"C:\Program Files\Google\Chrome\Application\chrome.exe",
           r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]


def chrome():
    for c in CHROMES:
        if c and os.path.exists(c):
            return c
    sys.exit("Chrome not found — set CHROME=<path to chrome>")


BOOT = """try{if(!sessionStorage.getItem('boot')){sessionStorage.setItem('boot','1');localStorage.clear();
Object.keys(window.__DATA).forEach(function(k){localStorage.setItem(k,window.__DATA[k]);});
localStorage.setItem('y2j-storage-config',JSON.stringify({mode:'local',url:'',token:''}));
localStorage.setItem('y2j-session-v1',__USER__);localStorage.setItem('y2j-company-v1','demo');}}catch(e){document.title='BOOTERR '+e.message}
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});
window.confirm=function(){return true};window.prompt=function(){return null};
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
/*BODY*/
document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{
 for(let i=0;i<100&&!(typeof authCurrentUser==='function'&&authCurrentUser());i++)await sleep(100);
 const fails=[];const ctx={assert:(c,m)=>{if(!c)fails.push(m);return !!c},sleep};
 let lines=[];try{lines=await run(ctx)||[];}catch(e){fails.push('EXC '+e.message+' '+String(e.stack||'').split('\\n')[1]);}
 const pre=document.createElement('pre');pre.id='OUT';
 pre.textContent=JSON.stringify({who:(authCurrentUser()||{}).name||'(not signed in)',lines,fails,errs:window.__errs});
 document.body.appendChild(pre);
},300));"""


def run_one(test, user, data):
    site = tempfile.mkdtemp(prefix="forge-test-")
    prof = tempfile.mkdtemp(prefix="forge-prof-")
    try:
        shutil.copytree(REPO, site, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "tests"))
        io.open(os.path.join(site, "testdata.js"), "w", encoding="utf-8").write("window.__DATA=" + data + ";")
        body = io.open(os.path.join(HERE, test + ".test.js"), encoding="utf-8").read()
        io.open(os.path.join(site, "testboot.js"), "w", encoding="utf-8").write(BOOT.replace("__USER__", json.dumps(user)).replace("/*BODY*/", body))
        idx = os.path.join(site, "index.html")
        h = io.open(idx, encoding="utf-8").read().replace("<head>", '<head><script src="testdata.js"></script><script src="testboot.js"></script>', 1)
        io.open(idx, "w", encoding="utf-8").write(h)
        out = subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--user-data-dir=" + prof, "--allow-file-access-from-files",
                              "--virtual-time-budget=400000", "--dump-dom", "file:///" + idx.replace("\\", "/")],
                             capture_output=True, timeout=600).stdout.decode("utf-8", "replace")
    finally:
        shutil.rmtree(site, ignore_errors=True)
        shutil.rmtree(prof, ignore_errors=True)  # headless profiles are large; never leave them behind
    m = re.search(r'<pre id="OUT">(.*?)</pre>', out, re.S)
    if not m:
        t = re.search(r"<title>(.*?)</title>", out, re.S)
        return {"who": user, "lines": [], "fails": ["no result — " + (t.group(1)[:200] if t else "page did not load")], "errs": []}
    return json.loads(html.unescape(m.group(1)))


def main():
    if not os.path.exists(DATA):
        sys.exit("No data snapshot — run: python tests/snapshot.py")
    data = io.open(DATA, encoding="utf-8").read()
    if len(sys.argv) >= 3:
        plan = [[sys.argv[1], [sys.argv[2]]]]
    else:
        plan = json.load(io.open(os.path.join(HERE, "suites.json"), encoding="utf-8"))
    bad = 0
    for test, users in plan:
        for user in users:
            r = run_one(test, user, data)
            ok = not r["fails"] and not r["errs"]
            bad += 0 if ok else 1
            print(f"{'PASS' if ok else 'FAIL'}  {test:<12} {user:<14} {r['who']}")
            for x in r["lines"]:
                print("        ", str(x)[:300])
            for x in r["fails"]:
                print("   ✗ ", x)
            for x in r["errs"][:5]:
                print("   ✗ page error:", x)
    print(f"\n{'ALL PASSED' if not bad else f'{bad} FAILED'}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
