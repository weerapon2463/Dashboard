"""Pull the public DEMO data into tests/data/demo.json (read only: nothing is changed or uploaded).

The app is opened in headless Chrome on the DEMO backend (the same public key the site ships with),
waits for the first sync, then dumps its datasets. Refuses to write a partial snapshot.
"""
import html, io, os, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import HERE, REPO, DATA, chrome

# With server sign-in on (the DEMO has it since 28 ก.ย.), a full copy needs the DEMO master key from the
# sheet's _ตั้งค่า tab (B1):  set FORGE_DEMO_KEY=<key>  — it is only used here, never saved in the repo.
DEMO_URL = "https://script.google.com/macros/s/AKfycbwbMJvGEudXfHvw0YeKNaLhA6vyIzb1qsyLNBhCy7GlgFx_3TRK7fC1McqJnu4deGXIdw/exec"
KEY = os.environ.get("FORGE_DEMO_KEY", "")
CFG = ("localStorage.setItem('y2j-storage-config',JSON.stringify({mode:'sheets',demo:true,url:'%s',token:'%s'}));" % (DEMO_URL, KEY)) if KEY else ""
SCRIPT = """try{if(!sessionStorage.getItem('b')){sessionStorage.setItem('b','1');localStorage.clear();""" + CFG + """localStorage.setItem('y2j-demo-clean-v1','1');localStorage.setItem('y2j-company-v1','demo');}}catch(e){}
document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{const sl=(m)=>new Promise(r=>setTimeout(r,m));
 for(let i=0;i<600&&Y2JStore.status().state!=='synced';i++)await sl(200);
 const d={};Object.keys(localStorage).forEach((k)=>{if(/^y2j-/.test(k)&&!/storage-config|sync-meta|session|demo-clean/.test(k))d[k]=localStorage.getItem(k);});
 const pre=document.createElement('pre');pre.id='SNAP';pre.dataset.state=Y2JStore.status().state;pre.textContent=JSON.stringify(d);document.body.appendChild(pre);},300));"""


def main():
    site = tempfile.mkdtemp(prefix="forge-snap-")
    prof = tempfile.mkdtemp(prefix="forge-prof-")
    try:
        shutil.copytree(REPO, site, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "tests"))
        io.open(os.path.join(site, "snap.js"), "w", encoding="utf-8").write(SCRIPT)
        idx = os.path.join(site, "index.html")
        h = io.open(idx, encoding="utf-8").read().replace("<head>", '<head><script src="snap.js"></script>', 1)
        io.open(idx, "w", encoding="utf-8").write(h)
        out = subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--user-data-dir=" + prof, "--allow-file-access-from-files",
                              "--virtual-time-budget=300000", "--dump-dom", "file:///" + idx.replace("\\", "/")],
                             capture_output=True, timeout=900).stdout.decode("utf-8", "replace")
    finally:
        shutil.rmtree(site, ignore_errors=True)
        shutil.rmtree(prof, ignore_errors=True)
    m = re.search(r'<pre id="SNAP" data-state="(\w+)">(.*?)</pre>', out, re.S)
    if not m or m.group(1) != "synced":
        sys.exit("DEMO did not sync — snapshot not written" + ("" if KEY else " (server sign-in is on: set FORGE_DEMO_KEY to the DEMO key from _ตั้งค่า!B1)"))
    text = html.unescape(m.group(2))
    if len(text) < 100000:
        sys.exit(f"snapshot looks partial ({len(text)} chars) — not written")
    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    io.open(DATA, "w", encoding="utf-8").write(text)
    print("wrote", DATA, len(text), "chars")


if __name__ == "__main__":
    main()
