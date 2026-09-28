"""End-to-end server sign-in in a real browser, against the real Code.gs running locally (gas-server.js).

A new device opens the site → sign-in screen from the server's roster → wrong password (message) →
right password → forced new password (temporary 1234) → sign out → sign in with the new password →
reload (only changed datasets are downloaded).   python tests/secure-client.py
"""
import html, io, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import HERE, REPO, DATA, chrome

PORT = 8792
URL = f"http://127.0.0.1:{PORT}/exec"

BOOT = r"""
try{if(!sessionStorage.getItem('b')){sessionStorage.setItem('b','1');localStorage.clear();
 localStorage.setItem('y2j-storage-config',JSON.stringify({mode:'sheets',url:'__URL__',token:'',secure:true,session:''}));
 localStorage.setItem('y2j-company-v1','demo');localStorage.setItem('y2j-demo-clean-v1','1');localStorage.setItem('y2j-login-mode-v1','pass');}}catch(e){}
window.__errs=JSON.parse(sessionStorage.getItem('errs')||'[]');
window.addEventListener('error',function(e){window.__errs.push(e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno);sessionStorage.setItem('errs',JSON.stringify(window.__errs))});
window.confirm=()=>true;window.alert=()=>{};
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
const rec=(x)=>{const a=JSON.parse(sessionStorage.getItem('rec')||'[]');a.push(x);sessionStorage.setItem('rec',JSON.stringify(a));};
const until=async(f,ms)=>{for(let i=0;i<(ms||60000)/100;i++){try{if(f())return true;}catch(e){}await sleep(100);}return false;};
const stats=async()=>(await fetch('http://127.0.0.1:__PORT__/_stats')).json();
const raw=async()=>(await fetch('http://127.0.0.1:__PORT__/_raw')).json();
const finish=()=>{const pre=document.createElement('pre');pre.id='OUT';pre.textContent=JSON.stringify({rec:JSON.parse(sessionStorage.getItem('rec')||'[]'),errs:window.__errs});document.body.appendChild(pre);};
async function signIn(user,pw){
  document.getElementById('loginEmpNo').value=user;document.getElementById('loginEmpPw').value=pw;document.getElementById('loginEmpBtn').click();
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{
 const step=Number(sessionStorage.getItem('step')||0);
 try{
 if(step===0){
   await until(()=>!document.getElementById('loginScreen').hidden,20000);
   rec('login screen shown: '+!document.getElementById('loginScreen').hidden+' · serverLogin '+!!(AUTH&&AUTH.serverLogin)+' · roster '+AUTH.users.length+' · conn: '+document.getElementById('loginConn').textContent.trim().slice(0,40));
   rec('badge button '+!!document.getElementById('loginBadgeBtn')+' · eye '+document.querySelectorAll('.login-eye').length);
   await signIn('demo-weld','0000');
   await until(()=>!document.getElementById('loginEmpErr').hidden&&!document.getElementById('loginEmpBtn').disabled,120000);
   rec('wrong password → '+document.getElementById('loginEmpErr').textContent);
   sessionStorage.setItem('step','1');
   await signIn('demo-weld','1234');
   await sleep(20000); rec('STEP0 did not reload'); finish(); return;
 }
 if(step===1){
   await until(()=>typeof authCurrentUser==='function'&&authCurrentUser(),30000);
   const u=authCurrentUser();
   rec('signed in as '+(u&&u.username)+' · others without hashes '+AUTH.users.filter(x=>x.id!==u.id).every(x=>!('pw' in x)&&!('pin' in x)));
   const ok=await until(()=>document.getElementById('pwBackdrop')&&document.getElementById('pwBackdrop').classList.contains('open'),10000);
   rec('forced new-password dialog '+ok+' · cancel hidden '+!document.getElementById('pwCancel'));
   document.getElementById('pwNew').value='abc123';document.getElementById('pwNew2').value='abc999';
   document.querySelector('#pwBackdrop form').dispatchEvent(new Event('submit',{cancelable:true}));await sleep(300);
   rec('mismatch → '+document.getElementById('pwErr').textContent);
   document.getElementById('pwNew2').value='abc123';
   document.querySelector('#pwBackdrop form').dispatchEvent(new Event('submit',{cancelable:true}));
   await until(()=>!document.getElementById('pwBackdrop').classList.contains('open'),10000);
   await sleep(1500);for(let i=0;i<20&&Y2JStore.status().pending.length;i++){await Y2JStore.flush();await sleep(500);}
   let r={};for(let i=0;i<120;i++){r=JSON.parse((await raw())['y2j-auth-v1'].value).users.find(x=>x.id==='u-demo-weld');if(r.pw)break;await Y2JStore.flush().catch(()=>{});await sleep(500);}
   rec('server has new password '+(!!r.pw&&r.pw.startsWith('p2$'))+' · mustChange cleared '+!r.mustChange);
   sessionStorage.setItem('step','2');
   document.getElementById('logoutBtn').click();
   await sleep(20000); rec('STEP1 did not reload'); finish(); return;
 }
 if(step===2){
   await until(()=>!document.getElementById('loginScreen').hidden,20000);
   rec('after sign-out: login screen '+!document.getElementById('loginScreen').hidden+' · needLogin '+Y2JStore.needLogin()+' · serverLogin '+!!AUTH.serverLogin+' · error shown '+(document.getElementById('loginEmpErr').hidden?'no':'YES')+' · raw pw '+JSON.parse((await raw())['y2j-auth-v1'].value).users.find(x=>x.id==='u-demo-weld').pw);
   const c0=(await stats()).calls.length;
   await signIn('demo-weld','1234');
   await until(()=>!document.getElementById('loginEmpErr').hidden&&!document.getElementById('loginEmpBtn').disabled,120000);
   await sleep(500);
   rec('old password now → '+document.getElementById('loginEmpErr').textContent+' · server calls '+JSON.stringify((await stats()).calls.slice(c0).map(c=>c[0])));
   const wu=AUTH.users.find(x=>x.username==='demo-weld'); rec('roster weld iter '+wu.iter+' serverLogin now '+!!AUTH.serverLogin);
   sessionStorage.setItem('step','3');
   await signIn('demo-weld','abc123');
   const fin=await until(()=>!document.getElementById('loginEmpBtn').disabled,300000); if(fin){rec('STEP2 new password did not sign in: '+document.getElementById('loginEmpErr').textContent);finish();} return;
 }
 if(step===3){
   await until(()=>typeof authCurrentUser==='function'&&authCurrentUser(),30000);
   rec('new password works: '+(authCurrentUser()||{}).username+' · floor mode '+document.documentElement.getAttribute('data-floor'));
   const s=await stats(); sessionStorage.setItem('pulls0',String(s.pulls.length));
   sessionStorage.setItem('step','4'); location.reload(); return;
 }
 if(step===4){
   await until(()=>typeof authCurrentUser==='function'&&authCurrentUser(),30000);
   const s=await stats(); const n0=Number(sessionStorage.getItem('pulls0'));
   rec('reload pulls: '+JSON.stringify(s.pulls.slice(n0))+' (none or a few keys = only changed data)');
   rec('server log: '+s.log.slice(-6).map(r=>r[0]+' '+r[1]).join(' | '));
   finish(); return;
 }
 }catch(e){rec('EXC '+e.message+' '+String(e.stack).split('\n')[1]);finish();}
},400));
"""


def main():
    srv = subprocess.Popen(["node", os.path.join(HERE, "gas-server.js"), str(PORT), DATA, "t-master", "1"], stdout=subprocess.PIPE)
    srv.stdout.readline()
    site = tempfile.mkdtemp(prefix="forge-sec-")
    prof = tempfile.mkdtemp(prefix="forge-prof-")
    try:
        shutil.copytree(REPO, site, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "tests"))
        io.open(os.path.join(site, "secboot.js"), "w", encoding="utf-8").write(BOOT.replace("__URL__", URL).replace("__PORT__", str(PORT)))
        idx = os.path.join(site, "index.html")
        h = io.open(idx, encoding="utf-8").read().replace("<head>", '<head><script src="secboot.js"></script>', 1)
        io.open(idx, "w", encoding="utf-8").write(h)
        out = subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--user-data-dir=" + prof, "--allow-file-access-from-files",
                              "--virtual-time-budget=600000", "--dump-dom", "file:///" + idx.replace("\\", "/")],
                             capture_output=True, timeout=900).stdout.decode("utf-8", "replace")
    finally:
        srv.kill()
        shutil.rmtree(site, ignore_errors=True)
        shutil.rmtree(prof, ignore_errors=True)
    m = re.search(r'<pre id="OUT">(.*?)</pre>', out, re.S)
    if not m:
        print("NO RESULT", (re.search(r"<title>(.*?)</title>", out, re.S) or [None, ""])[1][:200]); sys.exit(1)
    d = json.loads(html.unescape(m.group(1)))
    for x in d["rec"]: print("  -", x)
    for x in d["errs"]: print("  ✗ page error:", x)
    bad = d["errs"] or any(re.search(r"\bfalse\b|EXC|did not", x) for x in d["rec"] if not x.startswith("reload pulls") and not x.startswith("server log"))
    print("FAILED" if bad else "ALL PASSED")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
