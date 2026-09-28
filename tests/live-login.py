"""Sign in on the LIVE public DEMO like a brand-new device (read only — nothing is changed except the
sign-in itself being logged).   python tests/live-login.py [username] [password]
"""
import html, io, json, os, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import REPO, chrome

USER = sys.argv[1] if len(sys.argv) > 1 else "demo-weld"
PW = sys.argv[2] if len(sys.argv) > 2 else "1234"
BOOT = r"""
try{if(!sessionStorage.getItem('b')){sessionStorage.setItem('b','1');localStorage.clear();localStorage.setItem('y2j-login-mode-v1','pass');}}catch(e){}
window.__errs=JSON.parse(sessionStorage.getItem('errs')||'[]');
window.addEventListener('error',function(e){window.__errs.push(e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno);sessionStorage.setItem('errs',JSON.stringify(window.__errs))});
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
const rec=(x)=>{const a=JSON.parse(sessionStorage.getItem('rec')||'[]');a.push(x);sessionStorage.setItem('rec',JSON.stringify(a));};
const until=async(f,ms)=>{for(let i=0;i<(ms||60000)/100;i++){try{if(f())return true;}catch(e){}await sleep(100);}return false;};
const finish=()=>{const pre=document.createElement('pre');pre.id='OUT';pre.textContent=JSON.stringify({rec:JSON.parse(sessionStorage.getItem('rec')||'[]'),errs:window.__errs});document.body.appendChild(pre);};
document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{
 const step=Number(sessionStorage.getItem('step')||0);
 try{
 if(step===0){
   const shown=await until(()=>typeof AUTH!=='undefined'&&AUTH&&AUTH.serverLogin&&!document.getElementById('loginScreen').hidden,120000);
   rec('new device → server sign-in screen: '+shown+' · people '+(AUTH&&AUTH.users.length)+' · '+document.getElementById('loginConn').textContent.trim().slice(0,60));
   sessionStorage.setItem('step','1');
   document.getElementById('loginEmpNo').value='__USER__';document.getElementById('loginEmpPw').value='__PW__';document.getElementById('loginEmpBtn').click();
   const fin=await until(()=>!document.getElementById('loginEmpBtn').disabled,300000);
   if(fin){rec('sign-in FAILED: '+document.getElementById('loginEmpErr').textContent);finish();}
   return;
 }
 if(step===1){
   await until(()=>typeof authCurrentUser==='function'&&authCurrentUser()&&Y2JStore.status().state==='synced',180000);
   const u=authCurrentUser();const c=Y2JStore.config();
   rec('signed in: '+(u&&u.username)+' · synced '+Y2JStore.status().state+' · master key on device: '+(c.token?'YES':'no')+' · session: '+(c.session?'yes':'NO'));
   rec('others\' password hashes on device: '+AUTH.users.filter(x=>x.id!==u.id&&(x.pw||x.pin)).length+' · work orders '+WORK_ORDERS.length+' · floor mode '+document.documentElement.getAttribute('data-floor'));
   finish();return;
 }
 }catch(e){rec('EXC '+e.message);finish();}
},400));
"""


def main():
    site = tempfile.mkdtemp(prefix="forge-live-")
    prof = tempfile.mkdtemp(prefix="forge-prof-")
    try:
        shutil.copytree(REPO, site, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "tests"))
        io.open(os.path.join(site, "liveboot.js"), "w", encoding="utf-8").write(BOOT.replace("__USER__", USER).replace("__PW__", PW))
        idx = os.path.join(site, "index.html")
        h = io.open(idx, encoding="utf-8").read().replace("<head>", '<head><script src="liveboot.js"></script>', 1)
        io.open(idx, "w", encoding="utf-8").write(h)
        out = subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--user-data-dir=" + prof, "--allow-file-access-from-files",
                              "--virtual-time-budget=900000", "--dump-dom", "file:///" + idx.replace("\\", "/")],
                             capture_output=True, timeout=1200).stdout.decode("utf-8", "replace")
    finally:
        shutil.rmtree(site, ignore_errors=True)
        shutil.rmtree(prof, ignore_errors=True)
    m = re.search(r'<pre id="OUT">(.*?)</pre>', out, re.S)
    if not m:
        print("NO RESULT"); sys.exit(1)
    d = json.loads(html.unescape(m.group(1)))
    for x in d["rec"]: print("  -", x)
    for x in d["errs"]: print("  ✗ page error:", x)
    bad = d["errs"] or any(re.search(r"FAILED|EXC|: false|YES|NO\b", x) for x in d["rec"]) or not any(x.startswith("signed in") for x in d["rec"])
    print("FAILED" if bad else "ALL PASSED")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
