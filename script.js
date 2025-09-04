/* 
  GrooveMatch — UNIFIED BUILD (merge2, 2025-09-04)
  ------------------------------------------------
  This file merges:
  • LIVE base (clean build)
  • USER script (your prior patches: submit modal sync, pattern UI, admin pending/approve fixes, audio bridge, etc.)

  Notes:
  - Keep LIVE as the base, layer USER patches after.
  - Avoid optional-chaining on the left side of assignments (e.g., el?.value = ... is illegal).
  - Use guarded assignments instead: const el = byId('id'); if (el) el.value = ...;
*/

// ------- Safe deep assignment helper (ONLY used when needed; guarded) -------
(function(){
  if (!window.__GM_ASSIGN_DEEP__) {
    window.__GM_ASSIGN_DEEP__ = true;
    window.assignDeepSafe = function(getter, path, value){
      try{
        const el = (typeof getter === 'function') ? getter() : getter;
        if (!el) return;
        const parts = String(path).split('.');
        let obj = el;
        for (let i = 0; i < parts.length - 1; i++){
          if (!obj) return;
          obj = obj[parts[i]];
        }
        if (obj) obj[parts[parts.length - 1]] = value;
      } catch (e) { /* no-op */ }
    };
  }
})();


// ------- Safe deep assignment helper (fixes "Invalid left-hand side" with ?.prop = value) -------
(function(){
  if (!window.__GM_ASSIGN_DEEP__) {
    window.__GM_ASSIGN_DEEP__ = true;
    window.assignDeepSafe = function(getter, path, value){
      try{
        const el = (typeof getter === 'function') ? getter() : getter;
        if (!el) return;
        const parts = String(path).split('.');
        let obj = el;
        for (let i = 0; i < parts.length - 1; i++){
          if (!obj) return;
          obj = obj[parts[i]];
        }
        if (obj) obj[parts[parts.length - 1]] = value;
      }catch{}
    };
  }
})();


/* ===== BEGIN LIVE BASE ===== */
/*
  GrooveMatch — Single-source clean build (v2025-09-04-4)
  -------------------------------------------------------
  • Consolidates all behaviors into one file (no duplicate listeners or functions)
  • Include ONCE via: <script type="module" src="/script.js?v=2025-09-04-4"></script>
  • Assumes no inline <script> blocks in index.html. If any remain, strip them.

  Major features retained/fixed:
  - Grid builder (2 measures), time-signatures, accents, open-hihat lock, accent symbol "x>"
  - Transport (Play/Stop) with visual playhead
  - Find Song Examples + free-text search + Load to grid
  - Submit Groove modal: mirrors current grid sig/tempo, Song vs Pattern toggle, form to Pending/Approved
  - Auth (local demo), first user bootstrap to admin, Account panel, header state
  - Route guard: if logged out, nav buttons to protected tabs toast and redirect to page-builder
  - Groove Library: default filter to Songs, filters & sort, Copy Link, Load, admin-only × delete with persistence
  - Admin panel: review Pending, edit/save, approve (moves to Approved), reject (with Undo), approved cache panel
  - Deep-links (#g=slug) load the groove into the builder

  IMPORTANT DOM IDs used (must match HTML):
  Header/nav: homeLink, authBtn, logoutBtn, adminBtn, libraryBtn, who
  Pages: page-builder, page-library, page-account, page-admin
  Builder: sig, tempo, playBtn, trashBtn, addBarBtn, removeBarBtn, system, barSep, m2
  Measure rows: m1-label, m1-hat, m1-snare, m1-kick, m2-*
  Find: findBtn, search, results
  Submit: submitBtn, submitModal, submitForm, thanksModal, openPendingNowBtn, currentSigShow, currentTempoShow
  Account: acctDisplay, acctEmail, acctRole, mySubs, adminTools, userList, newAdminEmail, promoteBtn, demoteBtn
  Admin editor: a1-label, a1-hat, a1-snare, a1-kick, admType, admArtist, admTitle, admDrummer, admGenre, admSig, admTempo, admSave, admApprove, admReject, admSystem
  Library: libGrid, libSearch, libType, libSig, libMin, libMax, libSort, libReset
*/

// ======= Guard against double-evaluations (HMR, duplicate tags) =======
if (window.__GM_CLEAN_V4__) {
  console.warn('GrooveMatch clean script already loaded.');
} else {
  window.__GM_CLEAN_V4__ = true;

  // ===================== Utilities & UI helpers =====================
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  // Toast (idempotent)
  (function ensureToast(){
    if (window.toast) return;
    const host = document.createElement('div');
    host.className = 'gm-toast-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;';
    document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(host));
    window.toast = function(msg, tone='ok', ms=2200){
      const el = document.createElement('div');
      el.className = `gm-toast ${tone}`;
      el.textContent = msg;
      el.style.cssText = 'background:#fff;border:1px solid #e6eaf2;border-radius:10px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.08);font:14px/1.2 system-ui;';
      if (tone==='danger') el.style.borderColor = '#fecaca';
      if (tone==='warn')   el.style.borderColor = '#fde68a';
      host.appendChild(el);
      const t = setTimeout(()=> el.remove(), ms);
      // Return disposer
      return ()=>{ clearTimeout(t); el.remove(); };
    };
  })();

  // Modal helpers (idempotent) — supports .show and aria-hidden
  window.openModal = window.openModal || function(elOrId){
    const el = typeof elOrId==='string' ? byId(elOrId) : elOrId;
    if (!el) return;
    el.setAttribute('aria-hidden','false');
    el.classList.add('show');
  };
  window.closeModal = window.closeModal || function(elOrId){
    const el = typeof elOrId==='string' ? byId(elOrId) : elOrId;
    if (!el) return;
    el.setAttribute('aria-hidden','true');
    el.classList.remove('show');
  };

  // Navigation between pseudo-pages
  function showPage(id){
    $$('.page').forEach(p=> p.classList.remove('active'));
    byId(id)?.classList.add('active');
  }
  window.showPage = showPage; // used elsewhere

  // ===================== Local storage & auth =====================
  const KEYS = {
    SESSION:"gm_session",
    PENDING:"gm_pending_submissions",
    APPROVED:"gm_approved_submissions",
    USERS:"gm_users"
  };
  const read = (k, fallback)=>{ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? fallback; } catch{ return fallback; } };
  const write = (k, v)=> localStorage.setItem(k, JSON.stringify(v));

  const currentUser = ()=> read(KEYS.SESSION, null);
  const getUsers    = ()=> read(KEYS.USERS, []);
  const setUsers    = (list)=> write(KEYS.USERS, list);
  const findUser    = (email)=> getUsers().find(u=>u.email===email);
  const isAuthed    = ()=> !!currentUser();
  const isAdmin = ()=> {
  const u = currentUser();
  if (!u) return false;
  const user = findUser(u.email);
  return user?.role === 'admin';
};


  function bootstrapRoleOnLogin(email){
    const users = getUsers();
    if (!users.length) { users.push({email, role:'admin'}); setUsers(users); return 'admin'; }
    if (!users.find(u=>u.email===email)) { users.push({email, role:'user'}); setUsers(users); return 'user'; }
    return findUser(email)?.role || 'user';
  }

  // Small helpers for account display
  const deriveDisplayName = (email)=> email ? email.split('@')[0] : 'Guest';

  function renderAccount(){
    const user = currentUser();
    const nameEl  = byId('acctDisplay');
    const emailEl = byId('acctEmail');
    const roleEl  = byId('acctRole');
    if (nameEl)  nameEl.textContent  = user ? (user.display || deriveDisplayName(user.email)) : 'Not signed in';
    if (emailEl) emailEl.textContent = user?.email ? `Email: ${user.email}` : '';
    if (roleEl)  roleEl.textContent  = user?.email ? `Role: ${findUser(user.email)?.role || 'user'}` : '';

    // My submissions
    const my = byId('mySubs'); if (my){
      const email = user?.email || '';
      const pend = (read(KEYS.PENDING, [] )||[]).filter(x=>x.by===email);
      const appr = (read(KEYS.APPROVED,[])||[]).filter(x=>x.by===email);
      const card = (g,st)=> `<div class="card"><div><strong>${g.title||'(untitled)'}</strong> — ${g.artist || (g.type==='pattern'?'Pattern':'')} <span class="status badge">${st}</span></div><div class="muted">${g.timeSig||'4/4'} • ${g.tempo||''} BPM</div></div>`;
      const blocks = [...pend.map(g=>card(g,'Pending')),...appr.map(g=>card(g,'Approved'))];
      my.innerHTML = blocks.length ? blocks.join('') : '<div class="muted">No submissions yet.</div>';
    }

    // Admin tools panel vis
    const tools = byId('adminTools');
    if (tools) tools.style.display = isAdmin() ? '' : 'none';
  }

  function refreshHeader(){
    const sess = currentUser();
    const role = sess ? (findUser(sess.email)?.role || 'user') : '';
    if (byId('who'))         byId('who').textContent = sess ? `Signed in as ${sess.email} · ${role}` : '';
    if (byId('authBtn'))     byId('authBtn').textContent = sess ? 'Account' : 'Log in / Sign up';
    if (byId('logoutBtn'))   byId('logoutBtn').style.display = sess ? '' : 'none';
    if (byId('adminBtn'))    byId('adminBtn').style.display = (sess && role==='admin') ? '' : 'none';
    // In Thanks modal, only show "Review Now" to admins
    const reviewBtn = byId('openPendingNowBtn');
    if (reviewBtn) reviewBtn.style.display = (sess && role==='admin') ? '' : 'none';
    renderAccount();
  }

  // Header/nav wiring (idempotent)
  (function wireHeader(){
    const homeLink = byId('homeLink');
    homeLink?.addEventListener('click', (e)=>{ e.preventDefault(); showPage('page-builder'); });

    byId('libraryBtn')?.addEventListener('click', ()=>{ renderLibrary(); showPage('page-library'); });

    byId('adminBtn')?.addEventListener('click', ()=>{
      if (!isAuthed()) { openLogin(); return; }
      if (!isAdmin())  { toast('Admins only.','danger'); return; }
      renderAdminList(); renderApprovedCache(); showPage('page-admin');
    });

    byId('backToBuilder')?.addEventListener('click', ()=> showPage('page-builder'));

    byId('logoutBtn')?.addEventListener('click', ()=>{
      localStorage.removeItem(KEYS.SESSION);
      toast('Signed out.','warn');
      refreshHeader();
      showPage('page-builder');
    });

    byId('authBtn')?.addEventListener('click', ()=>{
      if (isAuthed()) { showPage('page-account'); renderAccount(); }
      else { openLogin(); }
    });
  })();

  // Route guard for unauthenticated users (protect anything not page-builder)
  (function guardRoutes(){
    document.addEventListener('click', (e)=>{
      const nav = e.target.closest('[data-nav]');
      if (!nav) return;
      const route = nav.getAttribute('data-nav');
      if (route && route !== 'page-builder' && !isAuthed()){
        e.preventDefault();
        toast('Please log in to access that tab.','warn');
        showPage('page-builder');
      }
    }, {capture:true});
  })();

  // Login modal
  const loginModal = byId('loginModal');
  const openLogin  = ()=> openModal(loginModal);
  const closeLogin = ()=> closeModal(loginModal);
  loginModal?.querySelectorAll('[data-close]')
            .forEach(el=> el.addEventListener('click', closeLogin));
  byId('doLogin')?.addEventListener('click', ()=>{
    const email = byId('email')?.value.trim();
    const pass  = byId('pass')?.value || '';
    if (!email || pass.length < 6){ toast('Enter a valid email and a 6+ char password.','danger'); return; }
    const role = bootstrapRoleOnLogin(email);
    write(KEYS.SESSION, { email, at: Date.now() });
    toast(`Signed in as ${email} (${role}).`,'ok');
    closeLogin(); refreshHeader(); showPage('page-account');
  });

  // ===================== Sequencer / Grid =====================
  const TIME_SIGS = {
    '2/4':  { steps: 8,  type:'simple',   accents:[0,4] },
    '3/4':  { steps:12,  type:'simple',   accents:[0,4,8] },
    '4/4':  { steps:16,  type:'simple',   accents:[0,4,8,12] },
    '5/4':  { steps:20,  type:'simple',   accents:[0,4,8,12,16] },
    '6/8':  { steps: 6,  type:'compound', accents:[0,3] },
    '7/8':  { steps: 7,  type:'compound', accents:[0,2,4] },
    '9/8':  { steps: 9,  type:'compound', accents:[0,3,6] },
    '12/8': { steps:12,  type:'compound', accents:[0,3,6,9] }
  };
  const HH=0,SN=1,BD=2;
  let CURRENT_SIG = '4/4';
  let STEPS       = TIME_SIGS[CURRENT_SIG].steps;
  let measureCount = 1; // 1 or 2

  // Data structures (2 measures x 3 rows x STEPS)
  let gridState   = [ [Array(STEPS).fill(0), Array(STEPS).fill(0), Array(STEPS).fill(0)],
                      [Array(STEPS).fill(0), Array(STEPS).fill(0), Array(STEPS).fill(0)] ];
  let hatLockNext = [ Array(STEPS).fill(false), Array(STEPS).fill(false) ];

  // Audio
  let ac = null;
  function ensureAudio(){ if (!ac){ ac = new (window.AudioContext||window.webkitAudioContext)(); } if (ac.state==='suspended') ac.resume(); }
  function makeNoise(len){ const b=ac.createBuffer(1,ac.sampleRate*len,ac.sampleRate); const d=b.getChannelData(0); for (let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; }
  const hatNoise = ()=> makeNoise(0.6);
  const snrNoise = ()=> makeNoise(0.3);

  function playHat(open, tempo, sig, accent = false){
  ensureAudio();
  const t = ac.currentTime;

  const n = ac.createBufferSource();
  n.buffer = hatNoise();

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = open ? 6000 : (accent ? 7000 : 8000);

  // FIXED: compute subdiv normally (no assignDeepSafe nonsense)
  const subdiv = (TIME_SIGS[sig]?.type === 'simple') ? 4 : 2;

  const stepDur = (60 / tempo) / subdiv;
  const dur = open ? stepDur * 1.9 : stepDur * 0.6;

  const g = ac.createGain();
  let peak = 0.30;
  if (open) peak = 0.75;
  else if (accent) peak = 0.99;
  else peak = 0.30;

  const duck = window.__hhDuckScale; // optional duck from previous accent
  if (duck && !open && !accent) peak = Math.max(0.1, peak * duck);
  window.__hhDuckScale = null;

  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(Math.min(1.0, peak), t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);

  n.connect(hp).connect(g).connect(ac.destination);
  n.start(t);
  n.stop(t + dur + 0.02);
}

  function playKick(v=1){ ensureAudio(); const t=ac.currentTime; const o=ac.createOscillator(), g=ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(50,t+0.12); g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.9*v,t+0.005); g.gain.exponentialRampToValueAtTime(0.001,t+0.22); o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.25); }
  function playSnare(v=1){ ensureAudio(); const t=ac.currentTime; const n=ac.createBufferSource(); n.buffer=snrNoise(); const f=ac.createBiquadFilter(); f.type='highpass'; f.frequency.value=1500; const g=ac.createGain(); g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.7*v,t+0.002); g.gain.exponentialRampToValueAtTime(0.001,t+0.12); n.connect(f).connect(g).connect(ac.destination); n.start(t); n.stop(t+0.15); const o=ac.createOscillator(), og=ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(190,t); og.gain.setValueAtTime(0.001,t); og.gain.linearRampToValueAtTime(0.4*v,t+0.001); og.gain.exponentialRampToValueAtTime(0.001,t+0.08); o.connect(og).connect(ac.destination); o.start(t); o.stop(t+0.1); }

  function setColsCSS(idx, n){ const cols = Array.from({length:n}, ()=> 'minmax(0,1fr)').join(' '); [byId(`m${idx+1}-label`), byId(`m${idx+1}-hat`), byId(`m${idx+1}-snare`), byId(`m${idx+1}-kick`)].forEach(el=> el?.style.setProperty('--cols', cols)); }
  const isAccent = (sig,i)=> TIME_SIGS[sig].accents.includes(i);
  function labelsFor(sig){ const cfg = TIME_SIGS[sig]; if (cfg.type==='simple'){ const beats=cfg.steps/4, seq=[]; for(let b=1;b<=beats;b++){ seq.push(String(b),'e','&','a'); } return seq.slice(0,cfg.steps); } return Array.from({length:cfg.steps}, (_,i)=> String(i+1)); }

  function renderCell(m,r,c,cell){
    cell.className='cell' + (isAccent(CURRENT_SIG,c) ? ' beat-col' : '');
    cell.classList.remove('note','locked','playing'); cell.textContent='';
    if (r===HH){
      if (hatLockNext[m][c]) cell.classList.add('locked');
      const v = gridState[m][HH][c];
      if (v===1){ cell.classList.add('note'); cell.textContent='x'; }
      if (v===2){ cell.classList.add('note'); cell.textContent='O'; }
      if (v===3){ cell.classList.add('note'); cell.textContent='x>'; }
    } else if (r===SN){
      const v = gridState[m][SN][c];
      if (v===1){ cell.classList.add('note'); cell.textContent='●'; }
      if (v===2){ cell.classList.add('note'); cell.textContent='(●)'; }
    } else if (r===BD){
      if (gridState[m][BD][c]===1){ cell.classList.add('note'); cell.textContent='●'; }
    }
  }

  function onCellTap(m,r,c,cell){
    if (r===HH){
      if (hatLockNext[m][c]) return;
      let next = gridState[m][HH][c];
      // off -> x -> x> (accent) -> O (open) -> off
      next = (next===0)?1 : (next===1)?3 : (next===3)?2 : 0;
      setHiHatAt(m,c,next);
    } else if (r===SN){
      gridState[m][SN][c] = (gridState[m][SN][c] + 1) % 3;
      renderCell(m,r,c,cell);
    } else if (r===BD){
      gridState[m][BD][c] = gridState[m][BD][c]===0 ? 1 : 0;
      renderCell(m,r,c,cell);
    }
  }

  function buildRow(idx,rowKey,rowIdx){ const el = byId(`m${idx+1}-${rowKey}`); if (!el) return; el.innerHTML=''; for (let c=0;c<STEPS;c++){ const cell=document.createElement('div'); cell.dataset.m=idx; cell.dataset.row=rowIdx; cell.dataset.col=c; renderCell(idx,rowIdx,c,cell); cell.addEventListener('click', ()=> onCellTap(idx,rowIdx,c,cell)); el.appendChild(cell); } }
  function buildLabels(idx){ const lab = byId(`m${idx+1}-label`); if(!lab) return; lab.innerHTML=''; const seq=labelsFor(CURRENT_SIG); seq.forEach((t,i)=>{ const d=document.createElement('div'); d.className='cell'+(isAccent(CURRENT_SIG,i)?' beat':''); d.textContent=t; lab.appendChild(d); }); }
  function buildMeasure(idx){ setColsCSS(idx,STEPS); buildLabels(idx); buildRow(idx,'hat',HH); buildRow(idx,'snare',SN); buildRow(idx,'kick',BD); }

  function idxBeatSimple(beat){ return (beat-1)*4; }
  function applyDefaultsForSigTo(meas){
    gridState[meas] = [Array(STEPS).fill(0), Array(STEPS).fill(0), Array(STEPS).fill(0)];
    hatLockNext[meas] = Array(STEPS).fill(false);
    const cfg = TIME_SIGS[CURRENT_SIG];
    if (cfg.type==='compound') { for(let i=0;i<STEPS;i++) gridState[meas][HH][i]=1; }
    else { for(let i=0;i<STEPS;i++) if (i%2===0) gridState[meas][HH][i]=1; }
    if (CURRENT_SIG==='4/4'){
      gridState[meas][BD][ idxBeatSimple(1) ]=1; gridState[meas][BD][ idxBeatSimple(3) ]=1;
      gridState[meas][SN][ idxBeatSimple(2) ]=1; gridState[meas][SN][ idxBeatSimple(4) ]=1;
    } else if (CURRENT_SIG==='2/4'){
      gridState[meas][BD][ idxBeatSimple(1) ]=1; gridState[meas][SN][ idxBeatSimple(2) ]=1;
    } else if (CURRENT_SIG==='3/4'){
      gridState[meas][BD][ idxBeatSimple(1) ]=1; gridState[meas][SN][ idxBeatSimple(2) ]=1; gridState[meas][SN][ idxBeatSimple(3) ]=1;
    } else if (CURRENT_SIG==='5/4'){
      gridState[meas][BD][ idxBeatSimple(1) ]=1; gridState[meas][BD][ idxBeatSimple(3) ]=1;
      gridState[meas][SN][ idxBeatSimple(2) ]=1; gridState[meas][SN][ idxBeatSimple(4) ]=1; gridState[meas][SN][ idxBeatSimple(5) ]=1;
    } else if (CURRENT_SIG==='6/8'){
      gridState[meas][BD][0]=1; gridState[meas][SN][3]=1;
    } else if (CURRENT_SIG==='7/8'){
      gridState[meas][BD][0]=1; gridState[meas][SN][2]=1; gridState[meas][SN][4]=1;
    } else if (CURRENT_SIG==='9/8'){
      gridState[meas][BD][0]=1; gridState[meas][SN][3]=1; gridState[meas][SN][6]=1;
    } else if (CURRENT_SIG==='12/8'){
      gridState[meas][BD][0]=1; gridState[meas][BD][6]=1; gridState[meas][SN][3]=1; gridState[meas][SN][9]=1;
    }
  }
  function applyDefaultsBoth(){ applyDefaultsForSigTo(0); applyDefaultsForSigTo(1); buildMeasure(0); if (measureCount===2) buildMeasure(1); }

  function copyBar1ToBar2(){ for (let r=0;r<3;r++) for (let c=0;c<STEPS;c++) gridState[1][r][c]=gridState[0][r][c]; hatLockNext[1].fill(false); for (let c=0;c<STEPS-1;c++) if (gridState[1][HH][c]===2){ gridState[1][HH][c+1]=0; hatLockNext[1][c+1]=true; } }
  function showMeasure2(show){ const m2=byId('m2'); const sep=byId('barSep'); const sys=byId('system'); if (m2) m2.style.display = show?'':'none'; if (sep) sep.style.display = show?'':'none'; byId('addBarBtn')?.style.setProperty('display', show?'none':''); if (sys){ sys.classList.toggle('two', !!show); sys.classList.toggle('stack', !!show && (CURRENT_SIG==='4/4'||CURRENT_SIG==='5/4'||CURRENT_SIG==='12/8')); }}
  byId('addBarBtn')?.addEventListener('click', ()=>{ if (measureCount===2) return; copyBar1ToBar2(); buildMeasure(1); showMeasure2(true); measureCount=2; });
  byId('removeBarBtn')?.addEventListener('click', ()=>{ if (measureCount===1) return; $$('#m2 .cell.playing').forEach(el=>el.classList.remove('playing')); showMeasure2(false); measureCount=1; });

  function setHiHatAt(m,c,state){
    if (gridState[m][HH][c]===2 && c<STEPS-1) hatLockNext[m][c+1]=false; // free next if was open
    if (state!==2 && hatLockNext[m][c]) return; // locked slot after an open
    gridState[m][HH][c] = state;
    if (state===2 && c<STEPS-1){ gridState[m][HH][c+1]=0; hatLockNext[m][c+1]=true; }
    const thisCell = $(`#m${m+1}-hat .cell[data-col="${c}"]`);
    const nextCell = $(`#m${m+1}-hat .cell[data-col="${c+1}"]`);
    if (thisCell) renderCell(m,HH,c,thisCell);
    if (nextCell){ renderCell(m,HH,c+1,nextCell); nextCell.classList.toggle('locked', hatLockNext[m][c+1]); }
  }

  // Transport
  let intervalId = null, step = 0;
  function totalSteps(){ return STEPS * measureCount; }
  function setPlayingHighlight(meas,col){ $$('.row .cell.playing').forEach(el=>el.classList.remove('playing')); const scope = meas===0 ? '#m1 ' : '#m2 '; $$(scope+'.row .cell[data-col="'+col+'"]').forEach(el=> el.classList.add('playing')); }
  function getVal(m,row,col){ return (gridState[m] && gridState[m][row] && typeof gridState[m][row][col] !== 'undefined') ? gridState[m][row][col] : 0; }
  const stepSubdivisions = (sig)=> TIME_SIGS[sig].type==='simple' ? 4 : 2;

  function tick(tempo){
    const tSteps = totalSteps();
    const meas = (step<STEPS) ? 0 : 1;
    const col  = (step % STEPS);
    setPlayingHighlight(meas,col);

    const hh = getVal(meas,HH,col);
    const prevCol = (col-1+STEPS)%STEPS;
    const wasAcc = getVal(meas,HH,prevCol)===3;
    if (wasAcc && hh===1) window.__hhDuckScale = 0.65; // one-shot ducking after accent

    if (hh===1) playHat(false, tempo, CURRENT_SIG, false);
    if (hh===3) playHat(false, tempo, CURRENT_SIG, true);
    if (hh===2) playHat(true,  tempo, CURRENT_SIG, false);

    const sn = getVal(meas,SN,col); if (sn===1) playSnare(0.90); if (sn===2) playSnare(0.25);
    const bd = getVal(meas,BD,col); if (bd>0) playKick(1.0);

    step = (step+1) % tSteps;
  }
  function playGroove(){
    ensureAudio();
    if (intervalId){ clearTimeout(intervalId); intervalId=null; }
    step = 0; setPlayingHighlight(0,0);
    const loop = ()=>{
      const tempoEl = byId('tempo') || byId('admTempo');
      const tempo = parseInt((tempoEl && tempoEl.value) || '100') || 100;
      const subdiv = stepSubdivisions(CURRENT_SIG);
      const delay = (60/tempo) * 1000 / subdiv;
      tick(tempo);
      intervalId = setTimeout(loop, delay);
    };
    loop();
  }
  // ----- Play/Stop Button -----
byId('playBtn')?.addEventListener('click', () => {
  const pb = byId('playBtn');

  if (intervalId) {
    // Stop
    clearTimeout(intervalId);
    intervalId = null;

    $$('.row .cell.playing').forEach(el => el.classList.remove('playing'));

    if (pb) {
      pb.textContent = 'Play';
      pb.setAttribute('aria-pressed', 'false');
    }
  } else {
    // Start
    playGroove();

    if (pb) {
      pb.textContent = 'Stop';
      pb.setAttribute('aria-pressed', 'true');
    }
  }
});
  
// ---- Trash / Reset (page-builder) ----
function resetBuilder(){
  // stop playback + clear play state
  if (intervalId){ clearTimeout(intervalId); intervalId = null; }
  document.querySelectorAll('.row .cell.playing').forEach(el => el.classList.remove('playing'));
  const pb = document.getElementById('playBtn');
  if (pb){ pb.textContent = 'Play'; pb.setAttribute('aria-pressed','false'); }

  // keep current signature/tempo as-is
  const sigEl = document.getElementById('sig');
  const sig   = sigEl ? sigEl.value : (CURRENT_SIG || '4/4');
  const info  = (window.TIME_SIGS && window.TIME_SIGS[sig]) || { steps: 16 };
  const steps = info.steps || 16;

  // reset state for both measures
  CURRENT_SIG = sig;
  STEPS = steps;
  gridState = [
    [Array(steps).fill(0), Array(steps).fill(0), Array(steps).fill(0)],
    [Array(steps).fill(0), Array(steps).fill(0), Array(steps).fill(0)]
  ];
  hatLockNext = [Array(steps).fill(false), Array(steps).fill(false)];

  // rebuild UI columns + measures
  if (typeof setColsCSS === 'function'){ setColsCSS(0, steps); setColsCSS(1, steps); }
  if (typeof buildMeasure === 'function'){
    buildMeasure(0);
    if (measureCount === 2){ buildMeasure(1); } else if (typeof showMeasure2 === 'function'){ showMeasure2(false); }
  }

  // apply your “blank/default” pattern (backbeat, hats, etc.) if you use it
  if (typeof applyDefaultsBoth === 'function') applyDefaultsBoth();
}

// bind once
(function bindTrash(){
  const btn = document.getElementById('trashBtn');
  if (btn && !btn.__gmBound){
    btn.addEventListener('click', resetBuilder);
    btn.__gmBound = true;
  }
})();


  function rebuildForSig(sig){
    CURRENT_SIG = sig;
    STEPS = TIME_SIGS[sig].steps;
    gridState   = [ [Array(STEPS).fill(0), Array(STEPS).fill(0), Array(STEPS).fill(0)],
                    [Array(STEPS).fill(0), Array(STEPS).fill(0), Array(STEPS).fill(0)] ];
    hatLockNext = [ Array(STEPS).fill(false), Array(STEPS).fill(false) ];
    setColsCSS(0,STEPS); setColsCSS(1,STEPS);
    buildMeasure(0); buildMeasure(1);
    applyDefaultsBoth();
    if (intervalId){
  clearTimeout(intervalId); intervalId=null;
  byId('playBtn')?.setAttribute('aria-pressed','false');
  const pb = byId('playBtn'); if (pb) pb.textContent = 'Play';
}

    $$('.row .cell.playing').forEach(el=>el.classList.remove('playing'));
  }

  // ===================== Built-ins, search & load =====================
  const groovesSeed = [
    { type:'song', title:'Walk This Way',      artist:'Aerosmith',     drummer:'Joey Kramer',  genre:'Rock', timeSig:'4/4', tempo:'108', H:'2010101010101010', S:'0000100000001000', K:'1000000110100000', slug:'walk-this-way' },
    { type:'song', title:'Sober',               artist:'Tool',          drummer:'Danny Carey',  genre:'Rock', timeSig:'4/4', tempo:'76',  H:'1120112011201120', S:'0000100000001000', K:'1100001100000000', slug:'sober' },
    { type:'song', title:'We Will Rock You',    artist:'Queen',         drummer:'Roger Taylor', genre:'Rock', timeSig:'4/4', tempo:'81',  H:'1010101010101010', S:'0000100000001000', K:'1010000010100000', slug:'we-will-rock-you' },
    { type:'song', title:'Beverly Hills',       artist:'Weezer',        drummer:'Pat Wilson',   genre:'Rock', timeSig:'4/4', tempo:'88',  H:'1010101010101010', S:'0000100000001000', K:'1010000010100000', slug:'beverly-hills' },
    { type:'song', title:'Immigrant Song',      artist:'Led Zeppelin',  drummer:'John Bonham',  genre:'Rock', timeSig:'4/4', tempo:'113', H:'1010101010101010', S:'0000100200001002', K:'1011010010110100', slug:'immigrant-song' },
    { type:'song', title:'When the Levee Breaks',artist:'Led Zeppelin', drummer:'John Bonham',  genre:'Rock', timeSig:'4/4', tempo:'76',  H:'1010101010101010', S:'0000100000001000', K:'1000000100110000', slug:'when-the-levee-breaks' }
  ].filter(g => (g.title||'').toLowerCase() !== 'back in black');

  const getApproved = ()=> read(KEYS.APPROVED, []);
  const setApproved = (arr)=> write(KEYS.APPROVED, arr);

  function allApproved(){
    const approved = getApproved();
    // ensure slugs
    approved.forEach(g=>{ if(!g.slug) g.slug = newSlug(g.title || (g.artist ? g.artist+'-groove':'groove')); });
    setApproved(approved);
    return [...approved, ...groovesSeed];
  }

  function mapRow(m,r,loose=false){
    return gridState[m][r].map(v=>{
      if (r===HH) return loose ? (v?1:0) : v;
      if (r===SN) return loose ? (v?1:0) : (v===2?2:(v===1?1:0));
      return v?1:0;
    }).join('');
  }
  function serializeBar1(){ return { exact:{H:mapRow(0,HH,false), S:mapRow(0,SN,false), K:mapRow(0,BD,false)}, loose:{H:mapRow(0,HH,true), S:mapRow(0,SN,true), K:mapRow(0,BD,false)} }; }

  function matchGrooves(){ const cur=serializeBar1(); const need=TIME_SIGS[CURRENT_SIG]?.steps||16; const out=[]; allApproved().forEach(g=>{ const gLen=TIME_SIGS[g.timeSig||'4/4']?.steps||16; if (gLen!==need) return; const exact=g.H===cur.exact.H && g.S===cur.exact.S && g.K===cur.exact.K; const close=!exact && g.H.replace(/2/g,'1')===cur.loose.H && g.S.replace(/2/g,'1')===cur.loose.S && g.K===cur.loose.K; if (exact||close) out.push({...g, match: exact?'Exact':'Close'}); }); return out; }

function loadGroove(g){
  // Stop playback and reset Play button state
  if (intervalId){
    clearTimeout(intervalId);
    intervalId = null;
    const pb = byId('playBtn');
    if (pb) {
      pb.setAttribute('aria-pressed','false');
      pb.textContent = 'Play';
    }
  }

  // Handle time signature change
  const gSig = g.timeSig || '4/4';
  if (gSig !== CURRENT_SIG){
    const sigEl = byId('sig');
    if (sigEl) sigEl.value = gSig;
    rebuildForSig(gSig);
    showMeasure2(false);
    measureCount = 1;
  } else {
    applyDefaultsBoth();
  }

  // Tempo (guarded)
  const tempoEl = byId('tempo');
  if (g.tempo && tempoEl) tempoEl.value = String(g.tempo);

  // Write rows
  const writeRow = (row, str) => {
    for (let i = 0; i < STEPS; i++){
      const ch = str[i] || '0';
      if (row === HH) gridState[0][HH][i] = (ch === '2') ? 2 : (ch === '1' ? 1 : 0);
      if (row === SN) gridState[0][SN][i] = (ch === '2') ? 2 : (ch === '1' ? 1 : 0);
      if (row === BD) gridState[0][BD][i] = (ch !== '0') ? 1 : 0;
    }
  };
  writeRow(HH, g.H || '');
  writeRow(SN, g.S || '');
  writeRow(BD, g.K || '');

  // Rebuild hat lock & UI
  hatLockNext[0].fill(false);
  for (let c = 0; c < STEPS - 1; c++){
    if (gridState[0][HH][c] === 2){
      gridState[0][HH][c + 1] = 0;
      hatLockNext[0][c + 1] = true;
    }
  }
  buildMeasure(0);
  showMeasure2(false);
}


  byId('findBtn')?.addEventListener('click', ()=>{
    const results = byId('results'); if (!results) return;
    results.innerHTML='';
    const matches = matchGrooves();
    if (!matches.length){ results.innerHTML = '<div class="card">No matches yet. Try backbeat on 2 & 4 + your kick idea.</div>'; return; }
    matches.forEach(m=>{
      const card = document.createElement('div'); card.className='card';
      card.innerHTML = `<div class="rowline"><div><div class="title">${m.title}</div><div>${m.artist || (m.type==='pattern'?'Pattern':'') }${m.drummer?` • ${m.drummer}`:''} • ${m.genre||''}</div><div class="meta">${m.timeSig||'4/4'} • ${m.tempo||''} BPM • Match: ${m.match}</div></div><div class="act"><button class="btn" data-load>Load</button></div></div>`;
      card.querySelector('[data-load]').addEventListener('click', ()=> loadGroove(m));
      results.appendChild(card);
    });
  });

  const searchInput = byId('search');
  searchInput?.addEventListener('input', ()=>{
    const q = searchInput.value.trim().toLowerCase();
    const results = byId('results'); if (!results) return;
    if (!q){ results.innerHTML=''; return; }
    const hits = allApproved().filter(g=> [g.title,g.artist,g.drummer].filter(Boolean).some(s=> s.toLowerCase().includes(q) ));
    results.innerHTML = hits.length ? hits.map(m=>`<div class="card"><div class="rowline"><div><div class="title">${m.title}</div><div>${m.artist || (m.type==='pattern'?'Pattern':'') }${m.drummer?` • ${m.drummer}`:''} • ${m.genre||''}</div><div class="meta">${m.timeSig||'4/4'} • ${m.tempo||''} BPM</div></div><div class="act"><button class="btn" data-load-title="${m.title}">Load</button></div></div></div>`).join('') : `<div class="card">No results for “${q}”.</div>`;
    $$('#results [data-load-title]').forEach(btn=>{
      const t = btn.getAttribute('data-load-title');
      const g = allApproved().find(x=>x.title===t);
      btn.addEventListener('click', ()=> g && loadGroove(g));
    });
  });

  // ===================== Submit modal & flow =====================
  const submitModal  = byId('submitModal');
  const thanksModal  = byId('thanksModal');
  const submitBtn    = byId('submitBtn');
  const submitForm   = byId('submitForm');

  function mirrorGridSigTempo(){
    const sigEl = byId('sig');
    const tempoEl = byId('tempo');
    const sigOut = byId('currentSigShow') || $('#submitModal [data-current-sig]');
    const bpmOut = byId('currentTempoShow') || $('#submitModal [data-current-tempo]');
    if (sigOut) sigOut.value = (sigEl?.value || '4/4');
    if (bpmOut) bpmOut.value = (tempoEl?.value || '100');
  }

  submitBtn?.addEventListener('click', ()=>{ mirrorGridSigTempo(); openModal(submitModal); });
  submitModal?.querySelectorAll('[data-close]')?.forEach(el=> el.addEventListener('click', ()=> closeModal(submitModal)));
  thanksModal?.querySelectorAll('[data-close]')?.forEach(el=> el.addEventListener('click', ()=> closeModal(thanksModal)));
  window.addEventListener('keydown', (e)=>{
    if (e.key==='Escape' && submitModal?.getAttribute('aria-hidden')==='false') closeModal(submitModal);
    if (e.key==='Escape' && thanksModal?.getAttribute('aria-hidden')==='false') closeModal(thanksModal);
  });

  function slugify(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,''); }
  function newSlug(base){ const core=slugify(base)||'groove'; const rnd=Math.random().toString(36).slice(2,7); return `${core}-${rnd}`; }

  const getPending  = ()=> read(KEYS.PENDING, []);
  const setPending  = (arr)=> write(KEYS.PENDING, arr);

  function applySubmitKind(kind){
    const modal = submitModal || document;
    const rowPattern = byId('rowPatternName') || $('[data-row="pattern-name"]', modal);
    const rowSong    = byId('rowSongFields')  || $('[data-row="song-fields"]', modal);
    if (rowPattern) rowPattern.style.display = (kind==='pattern' ? '' : 'none');
    if (rowSong)    rowSong.style.display    = (kind==='song' ? '' : 'none');
    const opt = byId('patternNameOptional') || $('[data-input="pattern-name"]', modal);
    if (opt) opt.placeholder = (kind==='pattern' ? 'Pattern name (optional)' : '—');
  }
  document.addEventListener('change', (e)=>{
    if (e.target.matches('input[name="submissionType"]')){
      applySubmitKind(e.target.value==='pattern' ? 'pattern' : 'song');
    }
  });
  // init once if radios exist
  (function initSubmitKind(){ const checked = $('input[name="submissionType"]:checked'); if (checked) applySubmitKind(checked.value==='pattern'?'pattern':'song'); })();

  byId('openPendingNowBtn')?.addEventListener('click', ()=>{
    closeModal(thanksModal);
    if (!isAuthed()) { openLogin(); return; }
    if (!isAdmin())  { toast('Admins only. Ask a moderator.','danger'); return; }
    renderAdminList(); renderApprovedCache(); showPage('page-admin');
  });

  submitForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    if (!isAuthed()){ closeModal(submitModal); openLogin(); return; }
    const user = currentUser();
    const fd   = new FormData(submitForm);
    const type = (fd.get('type') || fd.get('submissionType') || 'song').toString();

    const payload = {
      type,
      title:   (fd.get('title')   || '').toString().trim(),
      artist:  (fd.get('artist')  || '').toString().trim(),
      drummer: (fd.get('drummer') || '').toString().trim(),
      genre:   (fd.get('genre')   || '').toString().trim(),
      timeSig: (fd.get('timeSig') || byId('sig')?.value || '4/4').toString().trim(),
      tempo:   (fd.get('tempo')   || byId('tempo')?.value || '100').toString().trim(),
      H: mapRow(0,HH,false), S: mapRow(0,SN,false), K: mapRow(0,BD,false),
      submittedAt: new Date().toISOString(),
      by: user?.email || null
    };

    // Patterns go straight to Approved; Songs go to Pending (as discussed)
    if (payload.type==='pattern'){
      const appr = getApproved();
      const slug = newSlug(payload.title || 'pattern');
      appr.unshift({...payload, slug, approvedAt: Date.now()});
      setApproved(appr);
      toast('Thanks for the Sick Groove!','ok');
      closeModal(submitModal);
      openModal(thanksModal);
      renderLibrary();
    } else {
      const arr = getPending();
      arr.unshift(payload);
      setPending(arr);
      toast('Submitted for review!','ok');
      closeModal(submitModal);
      openModal(thanksModal);
    }
  });

  // ===================== Library (filters, default to Songs, admin ×) =====================
  function keyTA(title, artist){ return (title||'').trim().toLowerCase() + '|' + (artist||'').trim().toLowerCase(); }
  function loadSet(key){ try{ return new Set(JSON.parse(localStorage.getItem(key)||'[]')); }catch{ return new Set(); } }

  function applyDeletionsToGrid(){
    const grid = byId('libGrid'); if (!grid) return;
    const delSlugs = loadSet('gm_deleted');
    const delTA    = loadSet('gm_deleted_ta');
    grid.querySelectorAll('.lib-card, .card').forEach(card=>{
      const slug   = (card.getAttribute('data-slug')||'').trim().toLowerCase();
      const title  = (card.querySelector('[data-title], .lib-title, .title, h3, h4, strong')?.textContent||'').trim();
      const artist = (card.querySelector('[data-artist], .artist, .sub, .meta .artist, .subtitle')?.textContent||'').trim();
      const k = keyTA(title, artist);
      if ((slug && delSlugs.has(slug)) || (k && delTA.has(k))) card.remove();
    });
  }

  function isStaff(){ try{ if (typeof isAdmin==='function' && isAdmin()) return true; const sess=currentUser(); const rec=sess?findUser(sess.email):null; return !!(rec && (rec.role==='admin' || rec.role==='mod')); } catch{ return false; } }

  function addDeleteButtons(){
    if (!isStaff()) return;
    const grid = byId('libGrid'); if (!grid) return;
    grid.querySelectorAll('.lib-card, .card').forEach(card=>{
      if (card.querySelector('[data-del]')) return;
      const btn = document.createElement('button');
      btn.className='icon-btn'; btn.setAttribute('data-del',''); btn.title='Delete'; btn.textContent='×';
      Object.assign(btn.style,{position:'absolute',top:'6px',right:'6px',zIndex:3,padding:'2px 6px',borderRadius:'6px'});
      const cs = getComputedStyle(card); if (cs.position==='static') card.style.position='relative';
      card.appendChild(btn);
    });
  }

  function copyLink(slug){ const url = `${location.origin}${location.pathname}#g=${encodeURIComponent(slug)}`; navigator.clipboard?.writeText(url).then(()=>toast('Link copied','ok')).catch(()=>toast('Copy failed','warn')); }

  function renderLibrary(){
    const grid = byId('libGrid'); if (!grid) return;
    const q = (byId('libSearch')?.value||'').toLowerCase();
    const type = byId('libType')?.value || 'song';
    const sig  = byId('libSig')?.value  || 'all';
    const min  = parseInt(byId('libMin')?.value||'0')||0;
    const max  = parseInt(byId('libMax')?.value||'999')||999;
    const sort = byId('libSort')?.value || 'new';

    let rows = allApproved().filter(g=>{
      const matchQ = !q || [g.title,g.artist,g.drummer].filter(Boolean).some(s=> s.toLowerCase().includes(q));
      const matchT = type==='all' || (g.type||'song')===type;
      const matchS = sig==='all'  || (g.timeSig||'4/4')===sig;
      const bpm = parseInt(g.tempo||'0')||0;
      const matchB = bpm>=min && bpm<=max;
      return matchQ && matchT && matchS && matchB;
    });

    rows.sort((a,b)=>{
      if (sort==='title') return (a.title||'').localeCompare(b.title||'');
      if (sort==='tempo') return (parseInt(a.tempo||'0')||0) - (parseInt(b.tempo||'0')||0);
      return (b.approvedAt||0) - (a.approvedAt||0); // newest
    });

    grid.innerHTML = rows.length ? rows.map(g=>{
      const who = g.type==='pattern' ? 'Pattern' : (g.artist || '');
      const sig = g.timeSig || '4/4';
      const bpm = g.tempo   || '';
      const chip = `<span class="chip">${g.type==='pattern'?'Pattern':'Song'}</span>`;
      const slug = g.slug || '';
      return `<div class="lib-card" data-slug="${slug}">
        <h4 class="lib-title">${g.title||'(untitled)'}</h4>
        <div class="lib-meta">${who}${g.drummer?` • ${g.drummer}`:''}</div>
        <div class="lib-meta">${sig} • ${bpm} BPM</div>
        <div class="lib-actions">
          <button class="btn small" data-load-slug="${slug}">Load</button>
          <button class="btn small outline" data-copy="${slug}">Copy Link</button>
          ${chip}
        </div>
      </div>`;
    }).join('') : '<div class="muted" style="text-align:center">No grooves yet. Approve some or clear filters.</div>';

    grid.querySelectorAll('[data-load-slug]').forEach(b=>{
      const slug=b.getAttribute('data-load-slug');
      b.addEventListener('click', ()=>{ const g = allApproved().find(x=>x.slug===slug); if (g){ loadGroove(g); showPage('page-builder'); } });
    });
    grid.querySelectorAll('[data-copy]').forEach(b=> b.addEventListener('click', ()=> copyLink(b.getAttribute('data-copy'))));

    // admin-only ×
    applyDeletionsToGrid(); addDeleteButtons();
  }

  byId('libReset')?.addEventListener('click', () => {
  const s   = byId('libSearch');
  const t   = byId('libType');
  const sig = byId('libSig');
  const min = byId('libMin');
  const max = byId('libMax');
  const sort= byId('libSort');

  if (s)   s.value = '';
  if (t)   t.value = 'song';   // keep Songs as default
  if (sig) sig.value = 'all';
  if (min) min.value = '';
  if (max) max.value = '';
  if (sort) sort.value = 'new';

  renderLibrary();
});


  // When navigating to Library, enforce the default to Songs once
  (function defaultLibraryOnOpen(){
    const goLibraryDefault = ()=>{ const typeSel = byId('libType'); if (typeSel) typeSel.value='song'; renderLibrary(); };
    byId('libraryBtn')?.addEventListener('click', goLibraryDefault);
    const _showPage = window.showPage; window.showPage = function(id){ _showPage?.(id); if (id==='page-library') goLibraryDefault(); };
    document.addEventListener('DOMContentLoaded', ()=>{ if (byId('page-library')?.classList.contains('active')) goLibraryDefault(); });
  })();

  // Library admin delete wiring (persistently hide; also remove from Approved if match)
  (function wireDelete(){
    const grid = byId('libGrid'); if (!grid) return;
    grid.addEventListener('click', (e)=>{
      const el = e.target.closest('[data-del]'); if (!el || !isStaff()) return;
      if (!confirm('Delete this groove from the library?')) return;
      const card = el.closest('.lib-card, .card');
      const slug = card?.getAttribute('data-slug') || '';
      const title = (card?.querySelector('.lib-title, [data-title], h3, h4, strong')?.textContent||'').trim();
      const artist = (card?.querySelector('.artist, .sub, .meta .artist, [data-artist], .subtitle')?.textContent||'').trim();
      const k = keyTA(title, artist);
      try{
        const approved = getApproved();
        let idx = approved.findIndex(x=> (x.slug||'')===slug && slug);
        if (idx<0 && k) idx = approved.findIndex(x=> keyTA(x.title, x.artist) === k);
        if (idx>=0){ approved.splice(idx,1); setApproved(approved); }
        else {
          const delSlugs = loadSet('gm_deleted'); if (slug) delSlugs.add(slug); localStorage.setItem('gm_deleted', JSON.stringify([...delSlugs]));
          const delTA    = loadSet('gm_deleted_ta'); if (k)    delTA.add(k);    localStorage.setItem('gm_deleted_ta', JSON.stringify([...delTA]));
        }
      } catch(err){ console.error('Delete failed', err); }
      if (card && card.parentNode) card.parentNode.removeChild(card);
      try{ renderLibrary(); }catch{}
    });
  })();

  // ===================== Admin panel =====================
  const AHH=0, ASN=1, ABD=2;
  let A_SIG='4/4', A_STEPS=TIME_SIGS[A_SIG].steps;
  let A_grid=[Array(A_STEPS).fill(0),Array(A_STEPS).fill(0),Array(A_STEPS).fill(0)];
  let A_hatLock=Array(A_STEPS).fill(false);
  let A_interval=null, A_step=0;
  let lastRejected=null;

  function a_setCols(n){ const cols=Array.from({length:n},()=> 'minmax(0,1fr)').join(' '); ['a1-label','a1-hat','a1-snare','a1-kick'].forEach(id=> byId(id)?.style.setProperty('--cols', cols)); }
  function a_labels(){ const lab=byId('a1-label'); if (!lab) return; lab.innerHTML=''; const cfg=TIME_SIGS[A_SIG]; const seq=(cfg.type==='simple')?(()=>{const beats=cfg.steps/4,arr=[];for(let b=1;b<=beats;b++){arr.push(String(b),'e','&','a');} return arr.slice(0,cfg.steps);})():Array.from({length:cfg.steps},(_,i)=>String(i+1)); seq.forEach((t,i)=>{ const d=document.createElement('div'); d.className='cell'+(TIME_SIGS[A_SIG].accents.includes(i)?' beat':''); d.textContent=t; lab.appendChild(d); }); }
  function a_renderCell(r,c,cell){ cell.className='cell'+(TIME_SIGS[A_SIG].accents.includes(c)?' beat-col':''); cell.classList.remove('note','locked','playing'); cell.textContent=''; if (r===AHH){ if (A_hatLock[c]) cell.classList.add('locked'); if (A_grid[AHH][c]===1){ cell.classList.add('note'); cell.textContent='x'; } if (A_grid[AHH][c]===2){ cell.classList.add('note'); cell.textContent='O'; } if (A_grid[AHH][c]===3){ cell.classList.add('note'); cell.textContent='x>'; } } else if (r===ASN){ if (A_grid[ASN][c]===1){ cell.classList.add('note'); cell.textContent='●'; } if (A_grid[ASN][c]===2){ cell.classList.add('note'); cell.textContent='(●)'; } } else if (r===ABD){ if (A_grid[ABD][c]===1){ cell.classList.add('note'); cell.textContent='●'; } } }
  function a_buildRow(rowId,rowIdx){ const el=byId(rowId); if (!el) return; el.innerHTML=''; for (let c=0;c<A_STEPS;c++){ const cell=document.createElement('div'); cell.dataset.row=rowIdx; cell.dataset.col=c; a_renderCell(rowIdx,c,cell); cell.addEventListener('click',()=> a_tap(rowIdx,c,cell)); el.appendChild(cell);} }
  function a_buildMeasure(){ A_STEPS=TIME_SIGS[A_SIG].steps; a_setCols(A_STEPS); a_labels(); a_buildRow('a1-hat',AHH); a_buildRow('a1-snare',ASN); a_buildRow('a1-kick',ABD); }
  function a_setHat(c,state){ if (A_grid[AHH][c]===2 && c<A_STEPS-1) A_hatLock[c+1]=false; if (state!==2 && A_hatLock[c]) return; A_grid[AHH][c]=state; if (state===2 && c<A_STEPS-1){ A_grid[AHH][c+1]=0; A_hatLock[c+1]=true; } const thisCell = $(`#a1-hat .cell[data-col="${c}"]`); const nextCell = $(`#a1-hat .cell[data-col="${c+1}"]`); if (thisCell) a_renderCell(AHH,c,thisCell); if (nextCell){ a_renderCell(AHH,c+1,nextCell); nextCell.classList.toggle('locked',A_hatLock[c+1]); } }
  function a_tap(r,c,cell){ if (r===AHH){ if (A_hatLock[c]) return; let next=A_grid[AHH][c]; next=(next===0)?1:(next===1)?3:(next===3)?2:0; a_setHat(c,next); } else if (r===ASN){ A_grid[ASN][c]=(A_grid[ASN][c]+1)%3; a_renderCell(ASN,c,cell); } else if (r===ABD){ A_grid[ABD][c]=A_grid[ABD][c]===0?1:0; a_renderCell(ABD,c,cell); } }
  function a_fromStrings(H,S,K,sig){ A_SIG=sig||'4/4'; A_STEPS=TIME_SIGS[A_SIG].steps; A_grid=[Array(A_STEPS).fill(0),Array(A_STEPS).fill(0),Array(A_STEPS).fill(0)]; A_hatLock=Array(A_STEPS).fill(false); for(let i=0;i<A_STEPS;i++){ const chH=(H||'')[i]||'0', chS=(S||'')[i]||'0', chK=(K||'')[i]||'0'; A_grid[AHH][i]= chH==='2'?2 : chH==='1'?1 : 0; A_grid[ASN][i]= chS==='2'?2 : chS==='1'?1 : 0; A_grid[ABD][i]= chK!=='0'?1:0; if (A_grid[AHH][i]===2 && i+1<A_STEPS){ A_grid[AHH][i+1]=0; A_hatLock[i+1]=true; } } a_buildMeasure(); }
  function a_toStrings(){ const enc=(arr,kind)=> arr.map(v=>{ if(kind==='H') return v===2?'2':(v?1:0); if(kind==='S') return v===2?'2':(v?1:0); return v?1:0; }).join(''); return { H:enc(A_grid[AHH],'H'), S:enc(A_grid[ASN],'S'), K:enc(A_grid[ABD],'K') }; }
  function a_stop(){ if (A_interval){ clearTimeout(A_interval); A_interval=null; } A_step=0; $$('#admSystem .playing').forEach(el=>el.classList.remove('playing')); }
  function a_tick(){ const tempo=parseInt(byId('admTempo')?.value)||100; const subdiv=(TIME_SIGS[A_SIG].type==='simple')?4:2; const col=A_step% A_STEPS; $$('#admSystem .row .cell').forEach(el=>el.classList.remove('playing')); $(`#a1-hat .cell[data-col="${col}"]`)?.classList.add('playing'); $(`#a1-snare .cell[data-col="${col}"]`)?.classList.add('playing'); $(`#a1-kick .cell[data-col="${col}"]`)?.classList.add('playing'); const hh=A_grid[AHH][col]; const prevCol=(col-1 + A_STEPS)%A_STEPS; const wasAcc=A_grid[AHH][prevCol]===3; if (wasAcc && hh===1) window.__hhDuckScale = 0.40; if (hh===1) playHat(false,tempo,A_SIG,false); if (hh===3) playHat(false,tempo,A_SIG,true); if (hh===2) playHat(true, tempo,A_SIG,false); const sn=A_grid[ASN][col]; if (sn===1) playSnare(0.9); if (sn===2) playSnare(0.13); const bd=A_grid[ABD][col]; if (bd>0) playKick(1.0); A_step=(A_step+1)%A_STEPS; return (60/tempo)*1000/subdiv; }

  function renderAdminList(){
    const list=byId('adminList'); if (!list) return; const items=getPending();
    list.innerHTML = items.length ? '' : '<div class="admin-item">No pending grooves.</div>';
    items.forEach((g,idx)=>{
      const it=document.createElement('div'); it.className='admin-item'; it.dataset.idx=idx;
      it.innerHTML=`<div class="t">${g.title||'(untitled)'}</div><div class="sub">${g.type==='pattern'?'Pattern':(g.artist||'')}</div><div class="sub">${g.timeSig||'4/4'} • ${g.tempo||''} BPM</div>`;
      it.addEventListener('click', ()=> loadAdmin(idx));
      list.appendChild(it);
    });
    if (items.length) loadAdmin(0);
  }
  function renderApprovedCache(){ const cache=byId('approvedCache'); if (!cache) return; const arr=getApproved(); cache.innerHTML = arr.length ? arr.slice(0,20).map(g=>`<div class="approved-item"><strong>${g.title}</strong> — ${g.artist || (g.type==='pattern'?'Pattern':'')} <span class="muted">(${g.timeSig||'4/4'} • ${g.tempo||''} BPM)</span></div>`).join('') : '<div class="muted">No approvals yet.</div>'; }
  function loadAdmin(idx){ const items=getPending(); const g=items[idx]; if (!g) return; byId('admType').value = g.type||'song'; byId('admArtist').value=g.artist||''; byId('admTitle').value=g.title||''; byId('admDrummer').value=g.drummer||''; byId('admGenre').value=g.genre||''; byId('admSig').value=g.timeSig||'4/4'; byId('admTempo').value=g.tempo||'100'; a_fromStrings(g.H,g.S,g.K, byId('admSig').value); byId('admSig').onchange=(e)=>{ A_SIG=e.target.value; a_fromStrings(a_toStrings().H, a_toStrings().S, a_toStrings().K, A_SIG); };
    byId('admSave').onclick=()=>{ if (!isAdmin()){ toast('Admins only.','danger'); return; } const gridStr=a_toStrings(); const edit={ type:byId('admType').value, artist:byId('admArtist').value.trim(), title:byId('admTitle').value.trim(), drummer:byId('admDrummer').value.trim(), genre:byId('admGenre').value.trim(), timeSig:byId('admSig').value, tempo:byId('admTempo').value, H:gridStr.H, S:gridStr.S, K:gridStr.K }; const arr=getPending(); arr[idx] = {...arr[idx], ...edit}; setPending(arr); toast('Saved','ok'); renderAdminList(); };
    byId('admApprove').onclick=()=>{ if (!isAdmin()){ toast('Admins only.','danger'); return; } const arr=getPending(); const cur=arr[idx]; if (!cur) return; const approved=getApproved(); const sig=x=> [x.title,x.artist,x.H,x.S,x.K].join('|'); const have=new Set(approved.map(sig)); const slug = cur.slug || newSlug(cur.title || (cur.artist ? cur.artist+' groove' : 'groove')); const record={...cur, slug, approvedAt:Date.now()}; if(!have.has(sig(record))) approved.unshift(record); setApproved(approved); arr.splice(idx,1); setPending(arr); a_stop(); renderAdminList(); renderApprovedCache(); renderLibrary(); toast('Approved','ok'); };
    byId('admReject').onclick=()=>{ if (!isAdmin()){ toast('Admins only.','danger'); return; } if (!confirm('Reject this submission?')) return; const arr=getPending(); const removed=arr.splice(idx,1)[0]; setPending(arr); a_stop(); renderAdminList(); lastRejected = removed; const undo = toast('Rejected','warn'); // basic toast
      // quick undo: reinsert
      setTimeout(()=>{ if (lastRejected){ const cur=getPending(); cur.unshift(lastRejected); setPending(cur); renderAdminList(); lastRejected=null; } }, 1600);
    };
  }

  // -------- Deep-link handler (#g=slug) --------
  function handleDeepLink(){
    const m = location.hash.match(/#g=([^&]+)/);
    if (!m) return;
    const slug = decodeURIComponent(m[1]);
    const g = allApproved().find(x => (x.slug || '') === slug);
    if (g){ loadGroove(g); showPage('page-builder'); }
  }
  window.addEventListener('hashchange', handleDeepLink);

  // ===================== Boot =====================
  document.addEventListener('DOMContentLoaded', ()=>{
    // grid + audio init AFTER DOM is parsed so rows/buttons exist
    rebuildForSig(byId('sig')?.value || '4/4');
    showMeasure2(false);
    window.addEventListener('touchstart', ()=> ensureAudio(), {once:true});
    byId('sig')?.addEventListener('change', (e)=> rebuildForSig(e.target.value));

    refreshHeader();
    renderLibrary();
    handleDeepLink(); // load shared groove if present

    console.log('%cGrooveMatch clean build loaded (v2025-09-04-4)','padding:2px 6px;border-radius:4px;background:#111;color:#0f0');
  });
}
// ==== Submit Groove modal — Netlify-safe wiring (paste at END of script.js) ====
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, r=document) => r.querySelector(s);

  const submitBtn   = $('#submitBtn');          // the "Submit Groove" top-right button
  const submitModal = $('#submitModal');        // the modal wrapper
  const form        = $('#submitForm');         // the <form> inside the modal
  const subSig      = $('#subSig');             // readonly/mirrored field in modal
  const subTempo    = $('#subTempo');           // readonly/mirrored field in modal

  // bail if your page doesn’t have the modal on this route
  if (!submitBtn || !submitModal || !form) return;

  // open modal and mirror current grid meta
  function mirrorMeta() {
    const sigEl = $('#sig');     // builder selects
    const bpmEl = $('#tempo');

    const sig  = (sigEl?.value || '4/4');
    const bpm  = (bpmEl?.value || '100');

    if (subSig)   subSig.value   = sig;
    if (subTempo) subTempo.value = `${bpm} BPM`;
  }

  function openModal() {
    mirrorMeta();
    submitModal.setAttribute('aria-hidden', 'false');
    // run mirror again a few times in case the builder finishes rendering after click
    let n = 4; const t = setInterval(() => { mirrorMeta(); if (--n <= 0) clearInterval(t); }, 100);
  }

  // close helper (if you have an “X” in the modal with data-close)
  submitModal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close], .modal [aria-label="Close"]')) {
      submitModal.setAttribute('aria-hidden', 'true');
    }
  }, true);

  // bind open button (replace existing handlers safely)
  const btnClone = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(btnClone, submitBtn);
  btnClone.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  // robust localStorage helpers
  const get = (k, d=[]) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(v) ? v : d; } catch { return d; } };
  const set = (k, v)    => localStorage.setItem(k, JSON.stringify(v));

  // derive display name from session (email → before @)
  function currentUser() {
    try { return JSON.parse(localStorage.getItem('gm_session') || 'null'); } catch { return null; }
  }
  function deriveDisplay(email){ return email ? String(email).split('@')[0] : 'Guest'; }

  // capture current grid (works even if your A_grid isn’t present)
  function captureGroove() {
    const sig   = $('#sig')?.value || '4/4';
    const tempo = ($('#tempo')?.value || '100').toString();
    const stepsMap = { '2/4':8,'3/4':12,'4/4':16,'5/4':20,'6/8':12,'7/8':14,'9/8':18,'12/8':24 };
    const steps = stepsMap[sig] || 16;

    const readRow = (sel, kind) => {
      const cells = Array.from(document.querySelectorAll(`${sel} .cell`));
      if (!cells.length && Array.isArray(window.A_grid?.[0])) {
        // fallback to arrays if DOM rows aren’t mounted
        const rowIdx = kind==='H'?0:kind==='S'?1:2;
        return (window.A_grid[rowIdx] || []).slice(0, steps).map(v => String(v|0)).join('');
      }
      return cells.slice(0, steps).map(c => {
        const t = (c.textContent || '').trim();
        if (kind==='H') return (t==='x>'||t==='x›') ? '3' : (t==='O' ? '2' : (t==='x' ? '1' : '0'));
        if (kind==='S') return (t==='(●)') ? '2' : (t==='●' ? '1' : '0');
        if (kind==='K') return (t==='●') ? '1' : '0';
        return '0';
      }).join('');
    };

    const H = readRow('#m1-hat','H'), S = readRow('#m1-snare','S'), K = readRow('#m1-kick','K');
    const hasBar2 = getComputedStyle($('#m2') || document.createElement('div')).display !== 'none';
    const H2 = hasBar2 ? readRow('#m2-hat','H')   : '';
    const S2 = hasBar2 ? readRow('#m2-snare','S') : '';
    const K2 = hasBar2 ? readRow('#m2-kick','K')  : '';

    return { sig, tempo, bars: hasBar2 ? 2 : 1, H, S, K, H2, S2, K2 };
  }

  // submit handler (stores to localStorage so you can view it in Pending/Library)
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const type    = (fd.get('type')   || 'song').toString();
    let   title   = (fd.get('title')  || '').toString().trim();
    const artist  = (fd.get('artist') || '').toString().trim();
    const drummer = (fd.get('drummer')|| '').toString().trim();
    const genre   = (fd.get('genre')  || '').toString().trim();

    const user    = currentUser();
    const email   = user?.email || null;
    const display = user?.display || deriveDisplay(email || '');

    const cap = captureGroove();
    if (!title && type === 'pattern') title = `Pattern by ${display}`;

    const rec = {
      type,
      title,
      artist,
      drummer,
      genre,
      timeSig: cap.sig,
      tempo: cap.tempo,
      bars: cap.bars,
      H: cap.H, S: cap.S, K: cap.K, H2: cap.H2, S2: cap.S2, K2: cap.K2,
      submittedAt: new Date().toISOString(),
      by: email,
      display,
      slug: (title || 'groove').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
    };

    // No backend yet → keep patterns “approved”, songs “pending”
    if (type === 'pattern') {
      const list = get('gm_approved_submissions', []);
      list.unshift({ ...rec, approvedAt: Date.now() });
      set('gm_approved_submissions', list);
    } else {
      const pend = get('gm_pending_submissions', []);
      pend.unshift(rec);
      set('gm_pending_submissions', pend);
    }

    // close + clear
    submitModal.setAttribute('aria-hidden', 'true');
    try { form.reset(); } catch {}
    (window.toast || alert)('Thanks for the Sick Groove!');
  });
});

/* ===== END LIVE BASE ===== */

/* ===== BEGIN USER PATCHES ===== */
/* =========================================================
   GROOVEMATCH — CLEAN OVERRIDE (no duplicate bindings)
   Paste this LAST in your JS (or include as last external asset)
   It assumes your HTML IDs exactly as in your Pen.
=========================================================*/

/* ---------------- Toast (safe, only once) ---------------- */
(function(){
  if (window.toast) return;
  const host = document.createElement('div');
  host.className = 'gm-toast-host';
  document.body.appendChild(host);
  window.toast = function(msg, type='ok', ms=2200){
    try{
      const el = document.createElement('div');
      el.className = `gm-toast ${type}`;
      el.innerHTML = `<span>${msg}</span><button class="x" aria-label="Close">✕</button>`;
      host.appendChild(el);
      requestAnimationFrame(()=> el.classList.add('show'));
      const close = ()=>{ el.classList.remove('show'); setTimeout(()=> el.remove(), 200); };
      el.querySelector('.x').addEventListener('click', close);
      if (ms>0) setTimeout(close, ms);
    }catch(e){ console.log('toast:', msg); }
  };
})();

/* ---------------- Account: header + helpers ---------------- */
function deriveDisplayName(email){ return email ? email.split('@')[0] : 'Guest'; }
function renderAccount(){
  const user = JSON.parse(localStorage.getItem('gm_session') || 'null');
  const nameEl = document.getElementById('acctDisplay');
  const emailEl= document.getElementById('acctEmail');
  const roleEl = document.getElementById('acctRole');
  if (!nameEl || !emailEl || !roleEl) return;
  if (!user){ nameEl.textContent='Not signed in'; emailEl.textContent=''; roleEl.textContent=''; return; }
  const display = user.display || deriveDisplayName(user.email);
  nameEl.textContent = display;
  emailEl.textContent = user.email || '';
  roleEl.textContent = user.role ? ('Role: ' + user.role) : '';
}
(function hookAuthRefresh(){
  const prev = window.refreshAuthUI;
  window.refreshAuthUI = function(){ try{ prev?.(); }catch{} renderAccount(); };
})();
document.addEventListener('DOMContentLoaded', renderAccount);
// For local testing, set a session manually (uncomment):
// window._gm_setSession = function(email, role='user'){
//   const display = deriveDisplayName(email);
//   localStorage.setItem('gm_session', JSON.stringify({ email, role, display }));
//   if (typeof refreshAuthUI === 'function') refreshAuthUI();
// };
// _gm_setSession('insanedrummer89@gmail.com', 'admin');

/* ---------------- Submit modal: mirror Sig/Tempo + Type UI ---------------- */
(function submitMetaForceSync(){
  const getSig   = () => document.getElementById('sig')?.value || null;
  const getTempo = () => document.getElementById('tempo')?.value || null;
  function fill(){
    const sigEl   = document.querySelector('#submitModal #subSig');
    const tempoEl = document.querySelector('#submitModal #subTempo');
    const sigVal   = getSig();
    const tempoVal = getTempo();
    if (!sigEl || !tempoEl) return;
    if (!sigVal || !tempoVal) return;
    sigEl.value   = sigVal;
    tempoEl.value = `${tempoVal} BPM`;
  }
  document.getElementById('submitBtn')?.addEventListener('click', ()=> setTimeout(fill,0));
  const submitModal = document.getElementById('submitModal');
  if (submitModal){
    new MutationObserver(()=>{
      if (submitModal.getAttribute('aria-hidden') === 'false'){
        fill();
        let n=4; const t=setInterval(()=>{ fill(); if(--n<=0) clearInterval(t); }, 100);
      }
    }).observe(submitModal, {attributes:true, attributeFilter:['aria-hidden']});
  }
  ['sig','tempo'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    ['change','input'].forEach(evt=> el.addEventListener(evt, ()=>{
      if (submitModal?.getAttribute('aria-hidden') === 'false') fill();
    }));
  });
})();

(function submitTypeToggle(){
  const $ = s => document.querySelector(s);

  function syncTypeFields(){
    const typeEl   = $('#submitType');
    const isPattern = !!typeEl && typeEl.value === 'pattern';

    const wrap = $('#detailFields');
    if (!wrap) return;

    // Hide song-only detail fields when “Pattern” is selected
    wrap.style.display = isPattern ? 'none' : '';

    // Toggle required/disabled on inner fields
    wrap.querySelectorAll('input,select,textarea').forEach(el => {
      if (isPattern){
        el.dataset._wasRequired = el.required ? '1' : '';
        el.required = false;
        el.disabled = true;
      } else {
        if (el.dataset._wasRequired === '1') el.required = true;
        el.disabled = false;
      }
    });
  }

  // Bind once
  const typeEl = $('#submitType');
  if (typeEl && !typeEl.__gmBound){
    typeEl.addEventListener('change', syncTypeFields);
    typeEl.__gmBound = true;
  }

  // Initial state on load/open
  syncTypeFields();
})();

  // Submit modal — keep Sig/BPM in sync with the grid
(function submitMetaSync(){
  const $ = sel => document.querySelector(sel);

  function fillMetaFromGrid(){
    const sigEl   = document.getElementById('sig');
    const tempoEl = document.getElementById('tempo');

    const sig = sigEl ? sigEl.value : '4/4';
    const bpm = tempoEl ? tempoEl.value : '100';

    const showSig  = document.getElementById('currentSigShow');
    const showBpm  = document.getElementById('currentTempoShow');

    if (showSig) showSig.value = sig;
    if (showBpm) showBpm.value = `${bpm} BPM`;
  }

  function safeSyncTypeFields(){
    if (typeof window.syncTypeFields === 'function') {
      window.syncTypeFields();
    }
  }

  // When clicking Submit, mirror fields + apply Pattern/Song toggle
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn && !submitBtn.__gmBound){
    submitBtn.addEventListener('click', ()=>{
      fillMetaFromGrid();
      safeSyncTypeFields();
    });
    submitBtn.__gmBound = true;
  }

  // When modal opens, mirror again
  const submitModal = document.getElementById('submitModal');
  if (submitModal && !submitModal.__gmObs){
    const obs = new MutationObserver(()=>{
      if (submitModal.getAttribute('aria-hidden') === 'false'){
        fillMetaFromGrid();
        safeSyncTypeFields();
      }
    });
    obs.observe(submitModal, { attributes:true, attributeFilter:['aria-hidden'] });
    submitModal.__gmObs = true;
  }

  // If Sig/BPM change while modal is open, keep in sync
  ['sig','tempo'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    ['change','input'].forEach(evt=>{
      el.addEventListener(evt, ()=>{
        const modal = document.getElementById('submitModal');
        if (modal && modal.getAttribute('aria-hidden') === 'false'){
          fillMetaFromGrid();
        }
      });
    });
  });

  // Initial sync when script loads (harmless if modal is closed)
  fillMetaFromGrid();
})();


/* ---------------- Submit: ensure Pattern Title UI (no hijack) ---------------- */
(function ensurePatternTitleUI(){
  const $ = s=>document.querySelector(s);
  const form = $('#submitForm'); const typeEl = $('#submitType');
  if (!form || !typeEl) return;
  let patWrap = $('#patternTitleWrap');
  if (!patWrap){
    patWrap = document.createElement('div');
    patWrap.id='patternTitleWrap';
    patWrap.style.cssText='display:none;margin-top:8px';
    patWrap.innerHTML = `<label>Pattern Title (optional)
      <input id="patternTitle" name="pattitle" placeholder="e.g. Half-time shuffle"></label>`;
    const detail = $('#detailFields'); (detail?.parentNode||form).insertBefore(patWrap, (detail?.nextSibling||null));
  }
  let hiddenTitle = $('#patternTitleHidden');
  if (!hiddenTitle){
    hiddenTitle = document.createElement('input');
    hiddenTitle.type='hidden'; hiddenTitle.id='patternTitleHidden'; hiddenTitle.name='title';
    form.appendChild(hiddenTitle);
  }
  function sync(){ const isPattern = typeEl.value==='pattern';
    const detail = document.getElementById('detailFields');
    if (detail) detail.style.display = isPattern ? 'none' : '';
    patWrap.style.display = isPattern ? '' : 'none';
    hiddenTitle.disabled = !isPattern;
  }
  typeEl.addEventListener('change', sync); sync();
})();

/* ---------------- Submit button: redirect to Builder or open modal ---------------- */
(function(){
  const toast = (m,t='info') => (window.toast ? window.toast(m,t) : alert(m));
  function goBuilder(cb){
    try { window.showPage?.('page-builder'); } catch {}
    try {
      document.querySelectorAll('.modal[aria-hidden="false"]').forEach(m=>m.setAttribute('aria-hidden','true'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-builder')?.classList.add('active');
      window.scrollTo({top:0, behavior:'instant'});
    } catch {}
    let tries=0;(function wait(){
      const ready = document.getElementById('page-builder')?.classList.contains('active')
                 && document.getElementById('m1-hat');
      if (ready || tries++>40){ try{cb?.();}catch{} return; }
      setTimeout(wait,25);
    })();
  }
  function openSubmitModalAndMirror(){
    try{
      const sig = document.getElementById('sig')?.value || '4/4';
      const bpm = document.getElementById('tempo')?.value || '100';
      const sEl = document.getElementById('currentSigShow');
      const tEl = document.getElementById('currentTempoShow');
      if (sEl) sEl.value = sig; if (tEl) tEl.value = bpm + ' BPM';
      document.getElementById('submitModal')?.setAttribute('aria-hidden','false');
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    const oldBtn = document.getElementById('submitBtn'); if (!oldBtn) return;
    const btn = oldBtn.cloneNode(true); oldBtn.parentNode.replaceChild(btn, oldBtn);
    btn.addEventListener('click', (e)=>{
      const onBuilder = document.getElementById('page-builder')?.classList.contains('active');
      if (!onBuilder){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        toast('Create a Killer Groove','info'); goBuilder(()=>{}); return; }
      openSubmitModalAndMirror();
    });
  });
})();

/* ---------------- Submit handler (single canonical) ---------------- */
(() => {
  const form = document.getElementById('submitForm');
  if (!form) return;
  const $  = s => document.querySelector(s);
  const get = (k, d=[]) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch { return d; } };
  const set = (k, v)    => localStorage.setItem(k, JSON.stringify(v));
  const show = el => el?.setAttribute('aria-hidden','false');
  const hide = el => el?.setAttribute('aria-hidden','true');
  const KEYS = { APPROVED:'gm_approved_submissions', PENDING:'gm_pending_submissions', SESSION:'gm_session' };
  const currentUser = ()=> { try { return JSON.parse(localStorage.getItem(KEYS.SESSION)||'null'); } catch { return null; } };
  const isAuthed = ()=> !!currentUser();
  function captureGroove(){
    const sig   = $('#sig')?.value || '4/4';
    const tempo = ($('#tempo')?.value || '100').toString();
    const hasBar2 = ($('#m2')?.style?.display !== 'none');
    const useArrays = typeof window.A_grid !== 'undefined';
    const encFromArray = arr => (arr||[]).map(v=>v|0).join('');
    const encFromCells = (rowSel, kind) => {
      const cells = Array.from(document.querySelectorAll(`${rowSel} .cell`));
      return cells.map(c=>{
        const t=(c.textContent||'').trim();
        if(kind==='hat')   return (t==='x›'||t==='x>'?3:t==='O'?2:t==='x'?1:0);
        if(kind==='snare') return (t==='(●)'?2:t==='●'?1:0);
        if(kind==='kick')  return (t==='●'?1:0);
        return 0;
      }).join('');
    };
    const H  = useArrays ? encFromArray(window.A_grid?.[0]) : encFromCells('#m1-hat','hat');
    const S  = useArrays ? encFromArray(window.A_grid?.[1]) : encFromCells('#m1-snare','snare');
    const K  = useArrays ? encFromArray(window.A_grid?.[2]) : encFromCells('#m1-kick','kick');
    const H2 = hasBar2 ? (useArrays ? encFromArray(window.B_grid?.[0]) : encFromCells('#m2-hat','hat'))   : '';
    const S2 = hasBar2 ? (useArrays ? encFromArray(window.B_grid?.[1]) : encFromCells('#m2-snare','snare')): '';
    const K2 = hasBar2 ? (useArrays ? encFromArray(window.B_grid?.[2]) : encFromCells('#m2-kick','kick'))  : '';
    return { sig, tempo, bars: hasBar2?2:1, H,S,K,H2,S2,K2 };
  }
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    if (!isAuthed()){ hide($('#submitModal')); show($('#loginModal')); const t=$('#loginTitle'); if(t) t.textContent='Log in / Sign up'; return; }
    const fd   = new FormData(form);
    const type = (fd.get('type') || 'song').toString();
    const cap  = captureGroove();
    let   title   = (fd.get('title')||'').toString().trim();
    const patTitle= (fd.get('pattitle')||'').toString().trim();
    const artist  = (fd.get('artist')||'').toString().trim();
    const drummer = (fd.get('drummer')||'').toString().trim();
    const genre   = (fd.get('genre')||'').toString().trim();
    const display = (currentUser()?.display || deriveDisplayName(currentUser()?.email || '') || 'user');
    if (type==='pattern'){ title = patTitle || title || `Pattern by ${display}`; }
    const rec = {
      type, title, artist, drummer, genre,
      timeSig: cap.sig, tempo: cap.tempo, bars: cap.bars,
      H:cap.H, S:cap.S, K:cap.K, H2:cap.H2, S2:cap.S2, K2:cap.K2,
      submittedAt: new Date().toISOString(),
      by: currentUser()?.email || null,
      display, // <-- add this
  slug: (title||'item').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
};
    if (type === 'pattern'){
      const list = get(KEYS.APPROVED, []);
      rec.approvedAt = Date.now();
      list.unshift(rec); set(KEYS.APPROVED, list);
      hide($('#submitModal'));
      if (window.renderLibrary) window.renderLibrary();
      if (window.showPage) window.showPage('page-library');
      window.toast?.('Thanks for the Sick Groove!', 'info');
    } else {
      const pend = get(KEYS.PENDING, []);
      pend.push(rec); set(KEYS.PENDING, pend);
      hide($('#submitModal')); show($('#thanksModal')); window.refreshAuthUI?.();
    }
  });
})();

/* ---------------- Account: My Submissions + Load-to-Grid ---------------- */
(function(){
  const KEYS = { SESSION:'gm_session', PENDING:'gm_pending_submissions', APPROVED:'gm_approved_submissions' };
  const $ = s=>document.querySelector(s);
  const get = (k,d=[]) => { try { return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); } catch { return d; } };
  function currentEmail(){ try{ return JSON.parse(localStorage.getItem(KEYS.SESSION)||'null')?.email || null; }catch{return null;} }
  window.renderMySubs = function renderMySubs(){
    const host = $('#mySubs'); if (!host) return;
    const me = currentEmail();
    if (!me){ host.innerHTML = `<div class="muted">Sign in to see your submissions.</div>`; return; }
    const mine = []
      .concat(get(KEYS.PENDING,  []).map(x=>({...x,_status:'Pending'})))
      .concat(get(KEYS.APPROVED, []).map(x=>({...x,_status:'Approved'})))
      .filter(x => x.by === me);
    if (!mine.length){ host.innerHTML = `<div class="muted">No submissions yet.</div>`; return; }
    window.__MY_SUBS = mine;
    host.innerHTML = mine.map((g,i)=>`
      <div class="admin-item" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div class="t">${g.title || (g.type==='pattern'?'Pattern':'Untitled')}</div>
          <div class="sub">${g.timeSig || '4/4'} • ${g.tempo || 100} BPM ${(g.bars||1)===2?' • 2 bars':''} • <span class="status badge">${g._status}</span></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn small" data-load="${i}">Load to Grid</button>
        </div>
      </div>
    `).join('');
  };
  document.getElementById('mySubs')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-load]'); if (!btn) return;
    const rec = window.__MY_SUBS?.[+btn.dataset.load]; if (!rec) return;
    gmLoadToGrid(rec);
    
  });
  document.addEventListener('DOMContentLoaded', ()=> setTimeout(window.renderMySubs, 0));
  const _showPage = window.showPage;
  window.showPage = function(id){ _showPage?.(id); if (id==='page-account') setTimeout(window.renderMySubs, 0); };
  const _refresh = window.refreshAuthUI;
  window.refreshAuthUI = function(){ _refresh?.(); setTimeout(window.renderMySubs, 0); };
})();

/* ---------------- ADMIN: transport primitives (fixed fallback) ---------------- */
(function(){
  // If a_tick already exists (from your newer engine), don't touch it.
  if (typeof window.a_tick === 'function') return;

  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // globals used by the admin play loop
  window.A_SIG   = window.A_SIG   || '4/4';
  window.A_STEPS = window.A_STEPS || 16;
  window.A_step  = window.A_step  || 0;

  // FIX #1: highlight by column index (not data-col) to match how we read cells
  function a_highlight(col){
    // clear any prior highlights
    $$('#admSystem .row .cell.playing').forEach(el => el.classList.remove('playing'));
    // add to the nth cell in each row
    ['#a1-hat','#a1-snare','#a1-kick'].forEach(sel=>{
      const cells = $$(sel + ' .cell');
      const c = cells[col];
      if (c) c.classList.add('playing');
    });
  }

  // Prefer numeric A_grid if available; otherwise fall back to glyph text
  function readFromGrid(col){
    try {
      if (Array.isArray(window.A_grid) && window.A_grid.length >= 3) {
        const H = window.A_grid[0][col] | 0;   // 0,1,2,3
        const S = window.A_grid[1][col] | 0;   // 0,1,2
        const K = window.A_grid[2][col] | 0;   // 0,1
        return { h: H, s: S, k: K };
      }
    } catch {}

    // Fallback: read glyphs from DOM
    const txt = sel => ( ($$(sel+' .cell')[col]?.textContent) || '' ).trim();
    const th = txt('#a1-hat'), ts = txt('#a1-snare'), tk = txt('#a1-kick');
    const h  = (th==='x>'||th==='x›') ? 3 : (th==='O' ? 2 : (th==='x' ? 1 : 0));
    const s  = (ts==='(●)') ? 2 : (ts==='●' ? 1 : 0);
    const k  = (tk==='●') ? 1 : 0;
    return { h, s, k };
  }

  window.a_tick = function(){
    const tempo = parseInt($('#admTempo')?.value || '100', 10) || 100;
    const cfg   = (window.TIME_SIGS && window.TIME_SIGS[window.A_SIG]) || { type:'simple', steps: window.A_STEPS };
    const subdiv= (cfg.type === 'simple') ? 4 : 2;

    // FIX #2: keep A_STEPS in sync with the current signature
    window.A_STEPS = cfg.steps || window.A_STEPS;

    const col = window.A_step % window.A_STEPS;
    a_highlight(col);

    // FIX #3: read from A_grid when present (preserves accents etc.)
    const { h, s, k } = readFromGrid(col);

    // trigger one step of audio (your playHat/Snare/Kick are defined elsewhere)
    if (h === 1) window.playHat?.(false, tempo, window.A_SIG, false);
    if (h === 3) window.playHat?.(false, tempo, window.A_SIG, true);
    if (h === 2) window.playHat?.(true,  tempo, window.A_SIG, false);

    if (s === 1) window.playSnare?.(0.90);
    if (s === 2) window.playSnare?.(0.25);

    if (k === 1) window.playKick?.(1.0);

    window.A_step = (window.A_step + 1) % window.A_STEPS;
    return (60 / tempo) * 1000 / subdiv; // ms until next tick
  };
})();

/* ---------------- ADMIN: Pending (single canonical binding) ---------------- */
(function(){
  const KEY_P = 'gm_pending_submissions';
  const KEY_A = 'gm_approved_submissions';
  const $  = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const get = (k, d=[]) => { try { const v=JSON.parse(localStorage.getItem(k)||'null'); return Array.isArray(v)?v:d; } catch { return d; } };
  const set = (k, v)    => localStorage.setItem(k, JSON.stringify(v));
  const toast = (window.toast || ((m)=>console.log('[toast]', m)));
  // hide "Type" + remove extra Stop button
  document.addEventListener('DOMContentLoaded', ()=>{ $('#admType')?.closest('label')?.style && ($('#admType').closest('label').style.display='none'); $('#admStop')?.remove(); });
  const ADM = (window.__ADM ||= { sel:null, timer:null, playing:false });
  function allRows(){ let rows = $$('#adminList .admin-item'); if (!rows.length) rows = Array.from($('#adminList')?.children||[]); return rows; }
  function reindexRows(){ allRows().forEach((el,i)=> el.dataset.idx = String(i)); }
  function highlightRow(idx){ allRows().forEach(r=> r.classList.remove('selected')); const row=allRows()[idx]; row?.classList?.add('selected'); }
  function loadIntoEditor(g){
    if (!g) return;
    const setV = (id,val)=>{ const el=document.getElementById(id); if (el) el.value=val??''; };
    setV('admSig', g.timeSig||'4/4'); setV('admTempo', g.tempo||'100');
    setV('admType', g.type||'song'); setV('admTitle', g.title||'');
    setV('admArtist', g.artist||''); setV('admDrummer', g.drummer||''); setV('admGenre', g.genre||'');
    try { typeof window.a_fromStrings==='function' && window.a_fromStrings(g.H||'', g.S||'', g.K||'', (g.timeSig||'4/4')); } catch {}
  }
  function selectPending(idx){
    const pend = get(KEY_P,[]); if (idx==null || !pend[idx]) { ADM.sel=null; return; }
    ADM.sel = idx; highlightRow(idx); loadIntoEditor(pend[idx]);
  }
  function undeletionFor(rec){
    try{
      const slug = (rec.slug||'').trim().toLowerCase();
      const key  = `${(rec.title||'').trim().toLowerCase()}|${(rec.artist||'').trim().toLowerCase()}`;
      const delS = new Set(JSON.parse(localStorage.getItem('gm_deleted')||'[]')); if (slug) delS.delete(slug);
      localStorage.setItem('gm_deleted', JSON.stringify([...delS]));
      const delTA= new Set(JSON.parse(localStorage.getItem('gm_deleted_ta')||'[]')); if (key) delTA.delete(key);
      localStorage.setItem('gm_deleted_ta', JSON.stringify([...delTA]));
    }catch{}
  }
  function ensureSlug(rec){
    if (rec.slug) return rec.slug;
    const base = (rec.title || (rec.artist ? rec.artist + ' groove' : 'groove'))
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'');
    rec.slug = `${base}-${Math.random().toString(36).slice(2,7)}`;
    return rec.slug;
  }
  function captureMeta(cur){
    const v = id => document.getElementById(id)?.value ?? '';
    return {
      type:    v('admType')    || cur.type    || 'song',
      title:   v('admTitle')   || cur.title   || '',
      artist:  v('admArtist')  || cur.artist  || '',
      drummer: v('admDrummer') || cur.drummer || '',
      genre:   v('admGenre')   || cur.genre   || '',
      timeSig: v('admSig')     || cur.timeSig || '4/4',
      tempo:   v('admTempo')   || cur.tempo   || '100',
    };
  }
  function saveSelected(){
  const pend = get(KEY_P, []) || [];

  // 1) resolve target index
  let idx = ADM.sel;
  // try to grab the slug the editor is currently showing
  const editor = document.querySelector('.admin-wrap .admin-card:nth-child(2)');
  const form   = editor?.querySelector('form') || editor;
  const curSlug = (editor?.getAttribute('data-current-slug')
                || form?.querySelector('[name="slug"]')?.value
                || form?.querySelector('[data-slug]')?.getAttribute('data-slug')
                || '').trim().toLowerCase();

  if ((idx == null || !pend[idx]) && curSlug) {
    idx = pend.findIndex(g => (g.slug||'').toLowerCase() === curSlug);
  }

  // fall back: resolve by title+artist from the form if we have them
  if (idx == null || !pend[idx]) {
    const title  = (form?.querySelector('[name="title"], #title, #song-title')?.value || '').trim().toLowerCase();
    const artist = (form?.querySelector('[name="artist"], [data-artist]')?.value
                 || form?.querySelector('[data-artist]')?.getAttribute('data-artist')
                 || '').split('•')[0].trim().toLowerCase();
    if (title) {
      idx = pend.findIndex(g =>
        (g.title||'').trim().toLowerCase() === title &&
        (g.artist||'').trim().toLowerCase() === artist
      );
    }
  }

  // convenience: if there’s exactly one pending, just save that
  if ((idx == null || !pend[idx]) && pend.length === 1) idx = 0;

  // if nothing explicitly selected, default to the first pending (if any)
if (idx == null || !pend[idx]) {
  if (pend.length) {
    idx = 0;                         // <- auto-pick first
  } else {
    toast('No pending items.', 'warn');
    return;
  }
}
// keep ADM + row in sync when we auto-pick
ADM.sel = idx;
document.querySelectorAll('#adminList .admin-item').forEach(el=> el.classList.remove('selected'));
document.querySelector(`#adminList .admin-item[data-idx="${idx}"]`)?.classList.add('selected');


  // 2) merge edits from the editor
  let cur = pend[idx];
  try { if (typeof window.a_toStrings === 'function') cur = { ...cur, ...window.a_toStrings() }; } catch {}
  cur = { ...cur, ...captureMeta(cur) };

  // 3) write back
  pend[idx] = cur;
  set(KEY_P, pend);
  
}

  function approveSelected(){
  const pend = get(KEY_P, []);
  if (ADM.sel == null || !pend[ADM.sel]) { toast('Nothing selected','warn'); return; }

  // Merge latest grid + meta
  let cur = pend[ADM.sel];
  try { if (typeof window.a_toStrings === 'function') cur = { ...cur, ...window.a_toStrings() }; } catch {}
  cur = { ...cur, ...captureMeta(cur), approvedAt: Date.now() };

  ensureSlug(cur);
  undeletionFor(cur);

  // Add to approved (dedupe by title|artist|H|S|K)
  const appr = get(KEY_A, []);
  const sig  = x => [x.title||'', x.artist||'', x.H||'', x.S||'', x.K||''].join('|');
  const have = new Set(appr.map(sig));
  if (!have.has(sig(cur))) appr.unshift(cur);

  // Remove from pending + persist
  const removedIdx = ADM.sel;
  pend.splice(removedIdx, 1);
  set(KEY_A, appr);
  set(KEY_P, pend);

  // Update DOM list without jumping to first item
  const preRows = allRows();
  preRows[removedIdx]?.remove();
  reindexRows();

  const remaining = allRows().length;
  if (remaining) {
    const nextIdx = Math.min(removedIdx, remaining - 1); // stay on same slot or last
    ADM.sel = nextIdx;
    selectPending(nextIdx);
  } else {
    ADM.sel = null;
    stopPlay?.();
    try {
      if (typeof window.a_fromStrings === 'function') {
        const sigSel = document.getElementById('admSig')?.value || '4/4';
        window.a_fromStrings('', '', '', sigSel);
      }
    } catch {}
  }

  try { window.renderApprovedCache?.(); } catch {}
  try { window.renderLibrary?.(); } catch {}
  try { window.renderAdminList?.(); } catch {}

  toast('Approved','ok');
}

  function rejectSelected(){
  const pend = get(KEY_P, []);
  const idx  = ADM.sel;

  if (idx == null || !pend[idx]) { toast('Nothing selected','warn'); return; }

  // remove from data + persist
  pend.splice(idx, 1);
  set(KEY_P, pend);

  // remove DOM row + reindex (no jump to first)
  const rows = allRows();
  rows[idx]?.remove();
  reindexRows();

  const remaining = allRows().length;
  if (remaining) {
    const nextIdx = Math.min(idx, remaining - 1); // keep same slot, or last
    ADM.sel = nextIdx;
    selectPending(nextIdx);
  } else {
    ADM.sel = null;
    stopPlay?.();
    try {
      if (typeof window.a_fromStrings === 'function') {
        const sigSel = document.getElementById('admSig')?.value || '4/4';
        window.a_fromStrings('', '', '', sigSel);
      }
    } catch {}
  }

  toast('Rejected','warn');
}

  // delegated events (single binding)
  document.addEventListener('click', (e)=>{
    const row = e.target.closest('#adminList .admin-item'); if (row){ const idx = +row.dataset.idx || Array.from(allRows()).indexOf(row); if (idx>=0) selectPending(idx); return; }
    if (e.target.closest('#admSave'))   { e.preventDefault(); saveSelected(); }
    if (e.target.closest('#admApprove')){ e.preventDefault(); approveSelected(); }
    if (e.target.closest('#admReject')) { e.preventDefault(); rejectSelected(); }
  }, true);
  document.addEventListener('DOMContentLoaded', ()=>{ reindexRows(); const rows = allRows(); if (rows.length) selectPending(0); });
})();
/* PATCH 1: Admin Audio Bridge */
(() => {
  if (window.__GM_PATCH_AUDIO__) return; window.__GM_PATCH_AUDIO__ = true;

  // Shared AudioContext
  window.__gm_ac = window.__gm_ac || null;
  function getAC(){
    if (window.__gm_ac) return window.__gm_ac;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    window.__gm_ac = new Ctx();
    return window.__gm_ac;
  }
  window.ensureAudio = window.ensureAudio || function(){
    const ac = getAC();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };

  // Fallback play* if builder versions aren't global
  if (!window.playHat || !window.playSnare || !window.playKick) {
    const ac = () => (window.ensureAudio(), window.__gm_ac);
    const mkNoise = (len)=>{ const a=ac(); const b=a.createBuffer(1,a.sampleRate*len,a.sampleRate);
      const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; };
    const hatNoise = ()=>mkNoise(0.6), snrNoise = ()=>mkNoise(0.3);

    window.playHat = window.playHat || function(open, tempo, sig, accent=false, scale=1){
      const a=ac(), t=a.currentTime;
      const n=a.createBufferSource(); n.buffer=hatNoise();
      const hp=a.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=open?6000:(accent?7000:8000);
      const subdiv = (/^(2|3|4|5)\/4$/.test(sig)?4:2);
      const stepDur=(60/tempo)/subdiv, dur=open?stepDur*1.9:stepDur*0.6;
      const g=a.createGain(); const peak=Math.min(1,(open?0.75:(accent?0.99:0.30))*(scale||1));
      g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(peak,t+0.005); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
      n.connect(hp).connect(g).connect(a.destination); n.start(t); n.stop(t+dur+0.02);
    };
    window.playKick = window.playKick || function(v=1){
      const a=ac(), t=a.currentTime; const o=a.createOscillator(), g=a.createGain();
      o.type='sine'; o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(50,t+0.12);
      g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.9*v,t+0.005); g.gain.exponentialRampToValueAtTime(0.001,t+0.22);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t+0.25);
    };
    window.playSnare = window.playSnare || function(v=1){
      const a=ac(), t=a.currentTime;
      const n=a.createBufferSource(); n.buffer=snrNoise();
      const f=a.createBiquadFilter(); f.type='highpass'; f.frequency.value=1500;
      const g=a.createGain(); g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.7*v,t+0.002); g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
      n.connect(f).connect(g).connect(a.destination); n.start(t); n.stop(t+0.15);
      const o=a.createOscillator(), og=a.createGain();
      o.type='sine'; o.frequency.setValueAtTime(190,t);
      og.gain.setValueAtTime(0.001,t); og.gain.linearRampToValueAtTime(0.4*v,t+0.001); og.gain.exponentialRampToValueAtTime(0.001,t+0.08);
      o.connect(og).connect(a.destination); o.start(t); o.stop(t+0.1);
    };
  }
})();
/* PATCH 2 — Admin loop that truly respects the time signature (all meters) */
(() => {
  if (window.__GM_ADMIN_METER_LOOP__) return;
  window.__GM_ADMIN_METER_LOOP__ = true;

  const $  = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));

  // Same signature map as your builder (fallback kept just in case)
  const TS = window.TIME_SIGS || {
    "2/4":{steps:8,type:"simple"}, "3/4":{steps:12,type:"simple"}, "4/4":{steps:16,type:"simple"},
    "5/4":{steps:20,type:"simple"}, "6/8":{steps:6,type:"compound"}, "7/8":{steps:7,type:"compound"},
    "9/8":{steps:9,type:"compound"}, "12/8":{steps:12,type:"compound"}
  };

  const getSig   = () => $('#admSig')?.value || '4/4';
  const getType  = (sig) => (TS[sig]?.type || 'simple');
  const getSteps = (sig) => (TS[sig]?.steps || 16);
  const getTempo = () => parseInt($('#admTempo')?.value || '100', 10) || 100;
  const msPerStep= (sig, tempo) => {
    // exactly like the builder: simple ⇒ 4 (sixteenth), compound ⇒ 2 (eighth)
    const subdiv = getType(sig) === 'simple' ? 4 : 2;
    return (60 / (tempo||100)) * 1000 / subdiv;
  };

  let timer = null;
  let step  = 0;

  function killAllAdminTimers(){
    if (timer) { clearTimeout(timer); timer = null; }
    try { window.a_stop?.(); } catch(_) {}
    try { if (window.A_interval) { clearTimeout(window.A_interval); window.A_interval = null; } } catch(_){}
    try { if (window.__ADM?.timer) { clearTimeout(window.__ADM.timer); window.__ADM.timer = null; } } catch(_){}
  }

  function highlight(col){
    $$('#admSystem .row .cell.playing').forEach(el=>el.classList.remove('playing'));
    $(`#a1-hat   .cell[data-col="${col}"]`)?.classList.add('playing');
    $(`#a1-snare .cell[data-col="${col}"]`)?.classList.add('playing');
    $(`#a1-kick  .cell[data-col="${col}"]`)?.classList.add('playing');
  }

  // Prefer A_grid; fallback to reading DOM cells if needed
  function readCol(col){
    try {
      const AHH=0, ASN=1, ABD=2;
      if (Array.isArray(window.A_grid?.[0]) && typeof window.A_grid[0][col] !== 'undefined') {
        return { h: window.A_grid[AHH][col]|0, s: window.A_grid[ASN][col]|0, k: window.A_grid[ABD][col]|0 };
      }
    } catch(_) {}
    const t = sel => (($(`${sel} .cell[data-col="${col}"]`)?.textContent)||'').trim();
    const H = v => (v==='x>'||v==='x›')?3 : (v==='O'?2 : (v==='x'?1:0));
    const S = v => (v==='(●)')?2 : (v==='●'?1:0);
    const K = v => (v==='●'?1:0);
    return { h:H(t('#a1-hat')), s:S(t('#a1-snare')), k:K(t('#a1-kick')) };
  }

  function normalizeGridToCurrentSig(){
    const sig = getSig();
    try {
      if (typeof window.a_toStrings === 'function' && typeof window.a_fromStrings === 'function'){
        const cur = window.a_toStrings(); // {H,S,K}
        window.a_fromStrings(cur.H, cur.S, cur.K, sig); // rebuild grid to new step count
      }
    } catch(_) {}
  }

  function loop(){
    const sig   = getSig();
    const steps = getSteps(sig);
    const tempo = getTempo();

    const col   = step % steps;
    highlight(col);

    const prev  = (col - 1 + steps) % steps;
    const cur   = readCol(col);
    const prevH = readCol(prev).h;

    // one-shot duck on closed after accent (you already do this in builder)
    if (prevH === 3 && cur.h === 1) window.__hhDuckScale = 0.65;

    // HH
    if (cur.h === 1) window.playHat?.(false, tempo, sig, false);
    if (cur.h === 3) window.playHat?.(false, tempo, sig, true);
    if (cur.h === 2) window.playHat?.(true,  tempo, sig, false);

    // SN
    if (cur.s === 1) window.playSnare?.(0.90);
    if (cur.s === 2) window.playSnare?.(0.25);

    // BD
    if (cur.k) window.playKick?.(1.0);

    step = (step + 1) % steps;
    timer = setTimeout(loop, msPerStep(sig, tempo));
  }

  function start(){
    killAllAdminTimers();
    try { window.ensureAudio?.(); } catch(_) {}
    normalizeGridToCurrentSig();
    step = 0;

    const p = $('#admPlay'); if (p){ p.textContent='Stop'; p.setAttribute('aria-pressed','true'); }
    loop();
  }
  function stop(){
    killAllAdminTimers();
    $$('#admSystem .row .cell.playing').forEach(el=>el.classList.remove('playing'));
    const p = $('#admPlay'); if (p){ p.textContent='Play'; p.setAttribute('aria-pressed','false'); }
  }

  // Rebind controls by cloning (wipes old listeners cleanly)
  function rebind(btn, handler){
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', (e)=>{ e.preventDefault(); handler(); });
  }
  const playBtn = $('#admPlay');
  const stopBtn = $('#admStop');
  if (playBtn) rebind(playBtn, ()=> (timer ? stop() : start()));
  if (stopBtn) rebind(stopBtn, stop);

  // Changing meter/tempo while playing → instant resync (fresh loop with correct steps)
  ['admSig','admTempo'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    const resync = ()=> { if (timer) start(); };
    el.addEventListener('input',  resync);
    el.addEventListener('change', resync);
  });
})();
/* ============================================================
   PENDING GROOVES PATCH — keep selection, correct approve/reject,
   and preserve HH accent (x>) in admin (a_fromStrings / a_toStrings)
   Paste this at the very end of your JS (last script).
============================================================ */
(function(){
  /* ---------- small storage helpers ---------- */
  const KEY_P = 'gm_pending_submissions';
  const KEY_A = 'gm_approved_submissions';
  const read = (k,f)=>{ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v??f; }catch{ return f; } };
  const write= (k,v)=> localStorage.setItem(k, JSON.stringify(v));
  const getPending = ()=> read(KEY_P,[]);
  const setPending = (arr)=> write(KEY_P,arr);
  const getApproved= ()=> read(KEY_A,[]);
  const setApproved= (arr)=> write(KEY_A,arr);

  /* ---------- selection helpers (index is sticky) ---------- */
  const sel = (window.__GM_ADM_SEL ||= { idx: null });
  const listEl = ()=> document.getElementById('adminList');
  function currentRowEl(){
    const list = listEl(); if(!list) return null;
    return list.querySelector('.admin-item.selected, .admin-item.active, .admin-item.sel') ||
           list.querySelector('.admin-item[data-idx="'+sel.idx+'"]') ||
           list.querySelector('.admin-item');
  }
  function getIdxFromDOM(){
    const row = currentRowEl(); 
    const idx = row ? +row.getAttribute('data-idx') : NaN;
    return Number.isFinite(idx) ? idx : 0;
  }
  function markSelected(idx){
    sel.idx = idx;
    const list = listEl(); if(!list) return;
    list.querySelectorAll('.admin-item').forEach(el=> el.classList.remove('selected','active','sel'));
    const row = list.querySelector('.admin-item[data-idx="'+idx+'"]');
    if(row){ row.classList.add('selected'); }
  }
  function reindexList(){
    const list = listEl(); if(!list) return;
    Array.from(list.children).forEach((el,i)=> el.setAttribute('data-idx', String(i)));
  }
  // Keep our selection tracker updated when user clicks rows
  listEl()?.addEventListener('click', (e)=>{
    const row = e.target.closest('.admin-item[data-idx]');
    if(row) markSelected(+row.getAttribute('data-idx'));
  }, true);

  /* ---------- HH accent (x>) preservation ---------- */
  // Robust enc/dec so we don’t lose "3" (accent) in hats.
  function encodeFromAdminGrid(){
    // Prefer A_grid if present
    if (Array.isArray(window.A_grid)?.length >= 3) {
      const H = window.A_grid[0].map(v => v===3 ? '3' : (v===2 ? '2' : (v ? '1' : '0'))).join('');
      const S = window.A_grid[1].map(v => v===2 ? '2' : (v ? '1' : '0')).join('');
      const K = window.A_grid[2].map(v => v ? '1' : '0').join('');
      return { H,S,K };
    }
    // Fallback: read DOM glyphs in admin grid
    const readRow = (sel, kind) => {
      const cells = Array.from(document.querySelectorAll(sel+' .cell'));
      return cells.map(c=>{
        const t=(c.textContent||'').trim();
        if(kind==='H') return (t==='x>'||t==='x›')?'3':(t==='O'?'2':(t==='x'?'1':'0'));
        if(kind==='S') return t==='(●)'?'2':(t==='●'?'1':'0');
        if(kind==='K') return t==='●'?'1':'0';
        return '0';
      }).join('');
    };
    return { H:readRow('#a1-hat','H'), S:readRow('#a1-snare','S'), K:readRow('#a1-kick','K') };
  }
  function applyH3ToGrid(H){
    try{
      const steps = H.length;
      if (Array.isArray(window.A_grid)?.length >= 3) {
        for (let i=0;i<steps;i++){
          if (H[i]==='3') window.A_grid[0][i]=3;
        }
      }
      // Fix up glyphs visually too
      const hat = document.getElementById('a1-hat');
      if (hat) {
        const cells = hat.querySelectorAll('.cell');
        for (let i=0;i<Math.min(steps, cells.length); i++){
          if (H[i]==='3'){ cells[i].classList.add('note'); cells[i].textContent='x>'; }
        }
      }
    }catch(_){}
  }

  // Wrap a_fromStrings / a_toStrings once, but don’t break originals
  (function wrapAccentCoders(){
    const origFrom = window.a_fromStrings;
    const origTo   = window.a_toStrings;

    window.a_fromStrings = function(H,S,K,sig){
      const r = origFrom ? origFrom.apply(this, arguments) : undefined;
      if (H && /3/.test(H)) applyH3ToGrid(H);
      return r;
    };

    window.a_toStrings = function(){
      // Start with original result (if any), then overwrite H with our encoder
      const base = origTo ? (origTo.apply(this, arguments) || {}) : {};
      const enc  = encodeFromAdminGrid();
      base.H = enc.H; base.S = base.S || enc.S; base.K = base.K || enc.K;
      return base;
    };
  })();

  /* ---------- Keep selection on SAVE; do not jump ---------- */
  (function overrideSave(){
    const btn = document.getElementById('admSave');
    if (!btn) return;
    // replace the button to remove any prior bound handlers that reload the list
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);

    clone.addEventListener('click', ()=>{
      const idx = (sel.idx!=null) ? sel.idx : getIdxFromDOM();
      const pend = getPending();
      const cur  = pend[idx];
     

      // Pull edited meta
      const meta = {
        type:   document.getElementById('admType')?.value || cur.type || 'song',
        title:  document.getElementById('admTitle')?.value?.trim() || cur.title || '',
        artist: document.getElementById('admArtist')?.value?.trim()|| cur.artist|| '',
        drummer:document.getElementById('admDrummer')?.value?.trim()|| cur.drummer||'',
        genre:  document.getElementById('admGenre')?.value?.trim() || cur.genre || '',
        timeSig:document.getElementById('admSig')?.value || cur.timeSig || '4/4',
        tempo:  document.getElementById('admTempo')?.value || cur.tempo || '100'
      };
      // Pull strings (HH preserves "3")
      const gridStr = (typeof window.a_toStrings === 'function') ? window.a_toStrings() : encodeFromAdminGrid();

      pend[idx] = { ...cur, ...meta, ...gridStr };
      setPending(pend);

      // stay on the same record (no renderPendingList call here)
      (window.toast||alert)('Saved','ok');
      markSelected(idx);
    });
  })();

  /* ---------- APPROVE: move + remove, keep list consistent ---------- */
  (function overrideApprove(){
    const btn = document.getElementById('admApprove');
    if (!btn) return;
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);

    function ensureSlug(rec){
      if (rec.slug) return rec.slug;
      const base = (rec.title || (rec.artist ? rec.artist+' groove' : 'groove'))
        .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'');
      rec.slug = `${base}-${Math.random().toString(36).slice(2,7)}`;
      return rec.slug;
    }

    clone.addEventListener('click', ()=>{
      const idx = (sel.idx!=null) ? sel.idx : getIdxFromDOM();
      const pend = getPending();
      const cur  = pend[idx];
      if (!cur){ (window.toast||alert)('Nothing selected','warn'); return; }

      // Pull latest strings/meta from editor
      const gridStr = (typeof window.a_toStrings==='function') ? window.a_toStrings() : encodeFromAdminGrid();
      const meta = {
        type:   document.getElementById('admType')?.value || cur.type || 'song',
        title:  document.getElementById('admTitle')?.value?.trim() || cur.title || '',
        artist: document.getElementById('admArtist')?.value?.trim()|| cur.artist|| '',
        drummer:document.getElementById('admDrummer')?.value?.trim()|| cur.drummer||'',
        genre:  document.getElementById('admGenre')?.value?.trim() || cur.genre || '',
        timeSig:document.getElementById('admSig')?.value || cur.timeSig || '4/4',
        tempo:  document.getElementById('admTempo')?.value || cur.tempo || '100'
      };

      const rec = { ...cur, ...meta, ...gridStr, approvedAt: Date.now() };
      ensureSlug(rec);

      const appr = getApproved();
      appr.unshift(rec);
      setApproved(appr);

      // remove from pending (ONLY the selected)
      pend.splice(idx, 1);
      setPending(pend);

      // remove the DOM row + reindex; select next sensible row
      const row = listEl()?.querySelector(`.admin-item[data-idx="${idx}"]`);
      if (row && row.parentNode) row.parentNode.removeChild(row);
      reindexList();

      const nextIdx = Math.min(idx, pend.length-1);
      markSelected(nextIdx);

      // update any side panels you already have
      try{ window.renderApprovedCache?.(); }catch{}
      try{ window.renderLibrary?.(); }catch{}

      (window.toast||alert)('Approved','ok');
    });
  })();

  /* ---------- REJECT: remove only the selected ---------- */
  (function overrideReject(){
    const btn = document.getElementById('admReject');
    if (!btn) return;
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);

    clone.addEventListener('click', ()=>{
      const idx = (sel.idx!=null) ? sel.idx : getIdxFromDOM();
      const pend = getPending();
      if (!pend[idx]){ (window.toast||alert)('Nothing selected','warn'); return; }

      // Remove ONLY the selected item
      pend.splice(idx,1);
      setPending(pend);

      // Clean UI row + reindex; pick next
      const row = listEl()?.querySelector(`.admin-item[data-idx="${idx}"]`);
      if (row && row.parentNode) row.parentNode.removeChild(row);
      reindexList();

      const nextIdx = Math.min(idx, pend.length-1);
      markSelected(nextIdx);

      (window.toast||alert)('Rejected','ok');
    });
  })();

  /* ---------- Safety: preserve selection when your code re-renders list ---------- */
  (function wrapRenderPendingList(){
    const orig = window.renderPendingList;
    if (!orig || window.__gm_wrap_rpl) return;
    window.__gm_wrap_rpl = true;

    window.renderPendingList = function(){
      // remember current idx or best guess from DOM
      const keep = (sel.idx!=null) ? sel.idx : getIdxFromDOM();
      const r = orig.apply(this, arguments);
      // After original paint, reindex and reselect same slot if possible
      try{
        reindexList();
        const pend = getPending();
        const idx  = Math.min(keep, Math.max(0, pend.length-1));
        markSelected(idx);
      }catch(_){}
      return r;
    };
  })();

})();
/* =========================================================
   GROOVEMATCH — FINAL CLEAN OVERRIDE (paste LAST)
   Fixes:
   • Admin Play timing for all meters (2/4–12/8)
   • HH accent x> preserved in Pending (read/write/visual + audio)
   • Save Changes stays on same row (no jump)
   • Approve moves item to Library and removes from Pending (blue toast)
   • Reject removes only selected (blue/yellow toast untouched)
   • Submit: form fields clear after successful send
========================================================= */

/* ---------- safe toast alias (use your existing) ---------- */
const _toast = (m,t='ok') => (window.toast ? window.toast(m,t) : alert(`${t.toUpperCase()}: ${m}`));

/* ---------- Submit: clear fields after successful submit ---------- */
(() => {
  const form = document.getElementById('submitForm');
  if (!form) return;
  // After your own submit handler runs, clear inputs:
  form.addEventListener('submit', () => {
    // clear after your storage writes/modal changes
    setTimeout(() => { try{ form.reset(); }catch{} }, 0);
  }, true);
})();

/* ---------- Admin: keep selection utilities ---------- */
const __GM_ADM = (window.__GM_ADM ||= { idx:null });
function gm_admin_listEl(){ return document.getElementById('adminList'); }
function gm_admin_rows(){
  const list = gm_admin_listEl();
  if (!list) return [];
  return Array.from(list.querySelectorAll('.admin-item'));
}
function gm_admin_reindex(){
  gm_admin_rows().forEach((el,i)=> el.setAttribute('data-idx', String(i)));
}
function gm_admin_mark(idx){
  __GM_ADM.idx = idx;
  gm_admin_rows().forEach(el=> el.classList.remove('selected','active','sel'));
  const row = gm_admin_listEl()?.querySelector(`.admin-item[data-idx="${idx}"]`);
  if (row) row.classList.add('selected');
}
function gm_admin_currentIdx(){
  if (__GM_ADM.idx!=null) return __GM_ADM.idx;
  const row = gm_admin_listEl()?.querySelector('.admin-item.selected, .admin-item.active, .admin-item.sel');
  const idx = row ? +row.getAttribute('data-idx') : 0;
  return Number.isFinite(idx) ? idx : 0;
}
gm_admin_listEl()?.addEventListener('click', (e)=>{
  const row = e.target.closest('.admin-item[data-idx]');
  if (row) gm_admin_mark(+row.getAttribute('data-idx'));
}, true);

/* ---------- HH accent (x>) preservation in ADMIN ---------- */
(() => {
  if (window.__GM_HH3_WRAP__) return; window.__GM_HH3_WRAP__ = true;

  function encodeFromAdmin(){
    // Prefer A_grid if available
    try{
      if (Array.isArray(window.A_grid?.[0])) {
        const H = window.A_grid[0].map(v => v===3?'3':v===2?'2':v? '1':'0').join('');
        const S = window.A_grid[1].map(v => v===2?'2':v? '1':'0').join('');
        const K = window.A_grid[2].map(v => v? '1':'0').join('');
        return {H,S,K};
      }
    }catch{}
    // Fallback read from DOM glyphs
    const readRow = (sel, kind)=>{
      return Array.from(document.querySelectorAll(sel+' .cell')).map(c=>{
        const t=(c.textContent||'').trim();
        if (kind==='H') return (t==='x>'||t==='x›')?'3' : (t==='O'?'2' : (t==='x'?'1':'0'));
        if (kind==='S') return t==='(●)'?'2' : (t==='●'?'1':'0');
        if (kind==='K') return t==='●' ? '1' : '0';
        return '0';
      }).join('');
    };
    return { H:readRow('#a1-hat','H'), S:readRow('#a1-snare','S'), K:readRow('#a1-kick','K') };
  }

  function applyH3Visual(H){
    try{
      const hat = document.getElementById('a1-hat'); if (!hat) return;
      const cells = hat.querySelectorAll('.cell');
      for (let i=0;i<Math.min(H.length, cells.length); i++){
        if (H[i]==='3'){ cells[i].classList.add('note'); cells[i].textContent='x>'; }
      }
    }catch{}
  }

  const origFrom = window.a_fromStrings;
  const origTo   = window.a_toStrings;

  window.a_fromStrings = function(H,S,K,sig){
    const r = origFrom ? origFrom.apply(this, arguments) : undefined;
    if (H && /3/.test(H)) {
      try{
        // ensure A_grid reflects accents
        if (Array.isArray(window.A_grid?.[0])) {
          for (let i=0;i<H.length;i++) if (H[i]==='3') window.A_grid[0][i] = 3;
        }
      }catch{}
      applyH3Visual(H);
    }
    return r;
  };

  window.a_toStrings = function(){
    const base = origTo ? (origTo.apply(this, arguments) || {}) : {};
    const enc  = encodeFromAdmin();
    base.H = enc.H;                 // force-preserve '3' for hats
    base.S = base.S || enc.S;
    base.K = base.K || enc.K;
    return base;
  };
})();

/* ---------- Admin audio/timing: exact builder subdivision rules ---------- */
(() => {
  if (window.__GM_ADMIN_TRANSPORT_FIX__) return;
  window.__GM_ADMIN_TRANSPORT_FIX__ = true;

  // Shared AudioContext resume on play
  const admPlayBtn = document.getElementById('admPlay');
  if (admPlayBtn && !admPlayBtn.__gmAudioBound) {
    admPlayBtn.__gmAudioBound = true;
    admPlayBtn.addEventListener('click', () => { try{ window.ensureAudio?.(); }catch{} }, {capture:true});
  }

// TIME_SIGS fallback (matches your builder)
const TS = window.TIME_SIGS || {
  "2/4":{steps:8,type:"simple"}, "3/4":{steps:12,type:"simple"}, "4/4":{steps:16,type:"simple"},
  "5/4":{steps:20,type:"simple"}, "6/8":{steps:6,type:"compound"}, "7/8":{steps:7,type:"compound"},
  "9/8":{steps:9,type:"compound"}, "12/8":{steps:12,type:"compound"}
};

const msPerStep = (sig, tempo) => {
  const info   = TS[sig] || { type: 'simple' };
  const subdiv = (info.type === 'simple') ? 4 : 2; // simple=16ths, compound=8ths
  const t = parseInt(tempo, 10) || 100;
  return (60 / t) * 1000 / subdiv;
};

  let T = null;
  let step = 0;

  function highlight(col){
    document.querySelectorAll('#admSystem .row .cell.playing').forEach(el=>el.classList.remove('playing'));
    document.querySelector(`#a1-hat   .cell[data-col="${col}"]`)?.classList.add('playing');
    document.querySelector(`#a1-snare .cell[data-col="${col}"]`)?.classList.add('playing');
    document.querySelector(`#a1-kick  .cell[data-col="${col}"]`)?.classList.add('playing');
  }
  function readCol(col){
    try{
      const AHH=0,ASN=1,ABD=2;
      if (Array.isArray(window.A_grid?.[0])) {
        return { h: window.A_grid[AHH][col]|0, s: window.A_grid[ASN][col]|0, k: window.A_grid[ABD][col]|0 };
      }
    }catch{}
    const t = sel => ((document.querySelector(`${sel} .cell[data-col="${col}"]`)?.textContent)||'').trim();
    const H = v => (v==='x>'||v==='x›')?3 : (v==='O'?2 : (v==='x'?1:0));
    const S = v => (v==='(●)')?2 : (v==='●'?1:0);
    const K = v => (v==='●'?1:0);
    return { h:H(t('#a1-hat')), s:S(t('#a1-snare')), k:K(t('#a1-kick')) };
  }

  function tickLoop(){
    const sig   = document.getElementById('admSig')?.value  || '4/4';
    const tempo = document.getElementById('admTempo')?.value || '100';
    const steps = (TS[sig]?.steps) || 16;

    const col = step % steps;
    highlight(col);

    const prev = (col-1+steps)%steps;
    const cur  = readCol(col);
    const prevH= readCol(prev).h;

    // HH (with one-shot duck after accent like builder)
    if (prevH===3 && cur.h===1) window.__hhDuckScale = 0.65;
    if (cur.h===1) window.playHat?.(false, tempo, sig, false);
    if (cur.h===3) window.playHat?.(false, tempo, sig, true);
    if (cur.h===2) window.playHat?.(true,  tempo, sig, false);

    // SN
    if (cur.s===1) window.playSnare?.(0.90);
    if (cur.s===2) window.playSnare?.(0.25);

    // BD
    if (cur.k) window.playKick?.(1.0);

    step = (step+1) % steps;
    const d = msPerStep(sig, tempo);
    T = setTimeout(tickLoop, d);
  }

  function start(){
    stop();
    // Normalize admin internal grid to the current select meter
    try{
      if (typeof window.a_toStrings==='function' && typeof window.a_fromStrings==='function'){
        const sig = document.getElementById('admSig')?.value || '4/4';
        const cur = window.a_toStrings();      // {H,S,K} with '3' preserved by our wrapper
        window.a_fromStrings(cur.H,cur.S,cur.K,sig); // rebuilds A_SIG/A_STEPS under the hood
      }
    }catch{}
    step = 0;
    const p = document.getElementById('admPlay'); if (p){ p.textContent='Stop'; p.setAttribute('aria-pressed','true'); }
    tickLoop();
  }

  function stop(){
    if (T) clearTimeout(T);
    T = null;
    document.querySelectorAll('#admSystem .playing').forEach(el=>el.classList.remove('playing'));
    const p = document.getElementById('admPlay'); if (p){ p.textContent='Play'; p.setAttribute('aria-pressed','false'); }
  }

  // Rebind Play/Stop cleanly (wipe old listeners)
  function cloneBind(btn, fn){
    const c = btn.cloneNode(true);
    btn.parentNode.replaceChild(c, btn);
    c.addEventListener('click', (e)=>{ e.preventDefault(); fn(); });
  }
  const pBtn = document.getElementById('admPlay');
  const sBtn = document.getElementById('admStop');
  if (pBtn) cloneBind(pBtn, ()=> (T ? stop() : start()));
  if (sBtn) cloneBind(sBtn, stop);

  // Live resync if meter/tempo change during playback
  ['admSig','admTempo'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    const resync = ()=>{ if (T) start(); };
    el.addEventListener('input',  resync);
    el.addEventListener('change', resync);
  });

  // Visiting Admin page → ensure clean stop
  const _showPage = window.showPage;
  window.showPage = function(id){
    const r = _showPage?.apply(this, arguments);
    if (id==='page-admin') stop();
    return r;
  };
})();

/* ---------- Admin: Save/Approve/Reject behaviors ---------- */
(() => {
  if (window.__GM_ADMIN_ACTIONS_FIX__) return;
  window.__GM_ADMIN_ACTIONS_FIX__ = true;

  const KEY_P='gm_pending_submissions', KEY_A='gm_approved_submissions';
  const get = (k,d=[])=>{ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return Array.isArray(v)?v:d; }catch{ return d; } };
  const set = (k,v)=> localStorage.setItem(k, JSON.stringify(v));

  function ensureSlug(rec){
    if (rec.slug) return rec.slug;
    const base=(rec.title || (rec.artist? rec.artist+' groove':'groove'))
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'');
    rec.slug = `${base}-${Math.random().toString(36).slice(2,7)}`;
    return rec.slug;
  }
  function captureMeta(cur){
    const v = id => document.getElementById(id)?.value ?? '';
    return {
      type:    v('admType')    || cur.type    || 'song',
      title:   v('admTitle')   || cur.title   || '',
      artist:  v('admArtist')  || cur.artist  || '',
      drummer: v('admDrummer') || cur.drummer || '',
      genre:   v('admGenre')   || cur.genre   || '',
      timeSig: v('admSig')     || cur.timeSig || '4/4',
      tempo:   v('admTempo')   || cur.tempo   || '100',
    };
  }

  // SAVE (stay on same – no list reload)
  (() => {
    const btn = document.getElementById('admSave'); if (!btn) return;
    const clone = btn.cloneNode(true); btn.replaceWith(clone);
    clone.addEventListener('click', (e)=>{
      e.preventDefault();
      const pend = get(KEY_P,[]);
      const idx  = gm_admin_currentIdx();
      const cur  = pend[idx];
      if (!cur) { _toast('Nothing selected','warn'); return; }

      const gridStr = (typeof window.a_toStrings==='function') ? window.a_toStrings() : {};
      pend[idx] = { ...cur, ...captureMeta(cur), ...gridStr };
      set(KEY_P, pend);

      gm_admin_mark(idx); // keep selection
      _toast('Saved','ok');
    });
  })();

  // APPROVE (move to approved + remove ONLY selected)
  (() => {
    const btn = document.getElementById('admApprove'); if (!btn) return;
    const clone = btn.cloneNode(true); btn.replaceWith(clone);
    clone.addEventListener('click', (e)=>{
      e.preventDefault();
      const idx  = gm_admin_currentIdx();
      const pend = get(KEY_P,[]);
      let cur    = pend[idx];
      if (!cur) { _toast('Nothing selected','warn'); return; }

      const gridStr = (typeof window.a_toStrings==='function') ? window.a_toStrings() : {};
      cur = { ...cur, ...captureMeta(cur), ...gridStr, approvedAt: Date.now() };
      ensureSlug(cur);

      const appr = get(KEY_A,[]);
      // avoid duplicate by key
      const sigKey = x => [x.title||'',x.artist||'',x.H||'',x.S||'',x.K||''].join('|');
      const have = new Set(appr.map(sigKey));
      if (!have.has(sigKey(cur))) appr.unshift(cur);
      set(KEY_A, appr);

      // remove only this one from pending
      pend.splice(idx,1); set(KEY_P, pend);

      // remove DOM row + reindex and select next sensible row
      const list = gm_admin_listEl();
      const row = list?.querySelector(`.admin-item[data-idx="${idx}"]`);
      if (row && row.parentNode) row.parentNode.removeChild(row);
      gm_admin_reindex();
      const next = Math.min(idx, pend.length-1);
      if (pend.length) gm_admin_mark(next);

      try{ window.renderApprovedCache?.(); }catch{}
      try{ window.renderLibrary?.(); }catch{}

      _toast('Approved','ok');
    });
  })();

  // REJECT (remove ONLY selected)
  (() => {
    const btn = document.getElementById('admReject'); if (!btn) return;
    const clone = btn.cloneNode(true); btn.replaceWith(clone);
    clone.addEventListener('click', (e)=>{
      e.preventDefault();
      const idx  = gm_admin_currentIdx();
      const pend = get(KEY_P,[]);
      if (!pend[idx]) { _toast('Nothing selected','warn'); return; }

      pend.splice(idx,1); set(KEY_P, pend);

      const list = gm_admin_listEl();
      const row  = list?.querySelector(`.admin-item[data-idx="${idx}"]`);
      if (row && row.parentNode) row.parentNode.removeChild(row);
      gm_admin_reindex();
      const next = Math.min(idx, pend.length-1);
      if (pend.length) gm_admin_mark(next);

      _toast('Rejected','warn');
    });
  })();
})();
/* ==== My Submissions: categories + Go to Builder (drop-in) ==== */
(function mySubsCategories(){
  const $ = s => document.querySelector(s);
  const get = (k,d=[]) => { try { return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); } catch { return d; } };
  const deriveDisplayName = window.deriveDisplayName || (email => email ? email.split('@')[0] : 'user');

  // keep selected category between renders
  window.__MY_CAT = window.__MY_CAT || (localStorage.getItem('gm_mycat') || 'all');

  function currentEmail(){
    try{ return JSON.parse(localStorage.getItem('gm_session')||'null')?.email || null; }catch{ return null; }
  }

  // Make a small toolbar above #mySubs if not present
  function ensureToolbar(){
    const host = $('#mySubs'); if (!host) return;
    const card = host.closest('.account-card'); if (!card) return;
    if (card.querySelector('.mycat-toolbar')) return;

    const bar = document.createElement('div');
    bar.className = 'mycat-toolbar';
    bar.innerHTML = `
      <div class="chips">
        <button class="chip" data-cat="all">All</button>
        <button class="chip" data-cat="song">Songs</button>
        <button class="chip" data-cat="pattern">Patterns</button>
      </div>
      <button class="btn small" id="toBuilder">Go to Builder</button>
    `;
    card.insertBefore(bar, host);

    bar.addEventListener('click', (e)=>{
      const c = e.target.closest('.chip'); if (!c) return;
      window.__MY_CAT = c.dataset.cat;
      localStorage.setItem('gm_mycat', window.__MY_CAT);
      renderMySubs();
    });
    bar.querySelector('#toBuilder')?.addEventListener('click', ()=>{
      (window.showPage ? showPage('page-builder') : (location.hash='#page-builder'));
    });
  }

  // Replaces/defines renderMySubs to honor categories
  window.renderMySubs = function renderMySubs(){
    ensureToolbar();
    const host = $('#mySubs'); if (!host) return;

    const me = currentEmail();
    if (!me){ host.innerHTML = `<div class="muted">Sign in to see your submissions.</div>`; return; }

    const all = []
      .concat(get('gm_pending_submissions',  []).map(x=>({...x,_status:'Pending'})))
      .concat(get('gm_approved_submissions', []).map(x=>({...x,_status:'Approved'})))
      .filter(x => (x.by||'') === me);

    const counts = {
      all: all.length,
      song: all.filter(x=>x.type==='song').length,
      pattern: all.filter(x=>x.type==='pattern').length
    };

    const cat = window.__MY_CAT || 'all';
    const list = (cat==='all') ? all : all.filter(x=> x.type === cat);

    // update chips + counts
    const bar = host.closest('.account-card')?.querySelector('.mycat-toolbar');
    if (bar){
      bar.querySelectorAll('.chip').forEach(btn=>{
        const label = btn.dataset.cat;
        btn.classList.toggle('active', label === cat);
        const title = label.charAt(0).toUpperCase() + label.slice(1);
        const n = (label==='all') ? counts.all : counts[label];
        btn.textContent = `${title} (${n})`;
      });
    }

    if (!list.length){
      host.innerHTML = `<div class="muted">No ${cat==='all'?'submissions':cat} yet.</div>`;
      window.__MY_SUBS = [];
      return;
    }

    window.__MY_SUBS = list;
    const nameFor = (g)=> g.display || deriveDisplayName(me);
    host.innerHTML = list.map((g,i)=>`
      <div class="admin-item" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div class="t">${g.title || (g.type==='pattern' ? ('Pattern by ' + nameFor(g)) : 'Untitled')}</div>
          <div class="sub">${g.timeSig || '4/4'} • ${g.tempo || 100} BPM • ${g.bars||1} bar${(g.bars||1)>1?'s':''} • <span class="status badge">${g._status}</span></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn small" data-load="${i}">Load to Grid</button>
        </div>
      </div>
    `).join('');
  };

  // Delegate click for “Load to Grid”
  (function bindLoad(){
    const host = document.getElementById('mySubs');
    if (!host || host.dataset.bound) return;
    host.dataset.bound = '1';
    host.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-load]'); if (!btn) return;
      const rec = window.__MY_SUBS?.[+btn.dataset.load]; if (!rec) return;
      (window.gmLoadToGrid || window.safeLoadToGrid || function(){})(rec);
      window.showPage?.('page-builder');
      const sigEl = document.getElementById('sig');   if (sigEl)   sigEl.value   = rec.timeSig || '4/4';
      const bpmEl = document.getElementById('tempo'); if (bpmEl)   bpmEl.value   = rec.tempo || 100;
      
    });
  })();

// Don't auto-run renderMySubs on load
// Only wire it up for page-account AFTER user clicks there
const prevShow = window.showPage;
window.showPage = function(id){ 
  const r = prevShow?.apply(this, arguments); 
  if (id === 'page-account') {
    // just render the list, NO auto gmLoadToGrid calls
    try { window.renderMySubs?.(); } catch {}
  }
  return r;
};


  // Try a few common nav containers; moving a node preserves its listeners.
  const CANDIDATE_SELECTORS = [
    'nav a, nav button',
    '.nav a, .nav button, .nav .btn',
    '.topbar a, .topbar button, .topbar .btn',
    'header a, header button, header .btn',
    '.tabs .btn, .tabs a, .tabs button',
    'a.btn, button.btn'
  ];
  
// --- Helper: find an element by its visible text ---
function findByText(selector, text, root){
  const scope  = root || document;
  const needle = String(text || '').trim().toLowerCase();
  if (!needle) return null;
  const list = scope.querySelectorAll(selector);
  for (const el of list) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (t === needle) return el;
  }
  return null;
}

  function getAccount(){
    // Prefer explicit id if you have one; fallback to text search
    return document.getElementById('navAccount')
        || findByText(CANDIDATE_SELECTORS.join(','), 'account')
        || findByText(CANDIDATE_SELECTORS.join(','), 'my account');
  }
  function getLogout(){
    return document.getElementById('navLogout')
        || findByText(CANDIDATE_SELECTORS.join(','), 'log out')
        || findByText(CANDIDATE_SELECTORS.join(','), 'logout');
  }

  function moveOnce(){
    const account = getAccount();
    const logout  = getLogout();
    if (!account || !logout) return false;

    const parent = logout.parentElement;
    if (!parent) return false;

    // If already directly before logout, we're good.
    if (account.nextElementSibling === logout) return true;

    parent.insertBefore(account, logout);
    return true;
  }

  function tryMove(){
    if (moveOnce()) obs.disconnect?.();
  }

  // Run on load
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', tryMove);
  } else {
    tryMove();
  }

  // Re-run after auth UI refresh (your app calls refreshAuthUI)
  const prevRefresh = window.refreshAuthUI;
  window.refreshAuthUI = function(){
    const r = prevRefresh?.apply(this, arguments);
    setTimeout(tryMove, 0);
    return r;
  };

  // Watch for nav re-renders (SPA-style)
  const obs = new MutationObserver(()=> tryMove());
  obs.observe(document.body, { childList: true, subtree: true });
})();

/* === ACCOUNT MODULE — summary <-> editor, one-or-the-other === */
(function AccountUI(){
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // --- session helpers ---
  const getSession = () => { try { return JSON.parse(localStorage.getItem('gm_session')||'null') } catch { return null; } };
  const setSession = (obj) => { localStorage.setItem('gm_session', JSON.stringify(obj)); window.refreshAuthUI?.(); };

  // --- build UI once ---
  function buildUI(){
    const card = $('#page-account .account-card'); // first "My Account" card
    if (!card || card.dataset.acctBuilt === '1') return card;
    card.dataset.acctBuilt = '1';

    // summary
    const sum = document.createElement('div');
    sum.id = 'acctSummary';
    sum.className = 'acct-summary';
    sum.hidden = true;
    sum.innerHTML = `
      <img id="acctAvatarMini" alt="Profile">
      <div class="acct-lines">
        <div id="acctSummaryName" class="acct-name"></div>
        <div id="acctSummaryEmail" class="acct-email"></div>
      </div>
      <button class="btn small outline" id="acctChangeBtn">Change Settings</button>
    `;
    const h3 = card.querySelector('h3');
    (h3?.nextSibling ? card.insertBefore(sum, h3.nextSibling) : card.appendChild(sum));

    // editor
    const ed = document.createElement('div');
    ed.id = 'acctEditWrap';
    ed.className = 'acct-edit';
    ed.hidden = true;
    ed.innerHTML = `
      <div class="acct-sec-title">Customize Display Name</div>
      <input id="acctDisplayEdit" type="text" class="input" placeholder="Enter display name">

      <div class="acct-sec-title" style="margin-top:10px">Add a Profile Picture</div>
      <div class="acct-avatar-row">
        <img id="acctAvatar" alt="Preview">
        <div class="acct-avatar-ctrls">
          <input id="acctAvatarFile" type="file" accept="image/*" aria-label="Choose profile picture">
          <div class="hint">PNG/JPG recommended. Square images look best.</div>
        </div>
      </div>

      <div class="acct-actions">
        <button class="btn small" id="acctProfileSave">Save Profile</button>
      </div>
    `;
    card.appendChild(ed);

    // bind once
    $('#acctChangeBtn')?.addEventListener('click', showEditor);
    $('#acctAvatarFile')?.addEventListener('change', onFileChange);
    $('#acctProfileSave')?.addEventListener('click', onSave);

    // kill legacy duplicates
    nukeLegacy();

    return card;
  }

  // --- legacy rows off the page ---
  function nukeLegacy(){
    ['acctDisplay','acctEmail','acctRole'].forEach(id => document.getElementById(id)?.remove());
  }

  // --- fill summary + editor from session ---
  function fillFromSession(){
    const s = getSession() || {};
    const name  = s.display || (s.email ? s.email.split('@')[0] : '');
    const email = s.email || '';
    const img   = s.pfp || '';

    // summary
    $('#acctAvatarMini')  && ($('#acctAvatarMini').src = img || '');
    $('#acctSummaryName') && ($('#acctSummaryName').textContent = name || '');
    $('#acctSummaryEmail')&& ($('#acctSummaryEmail').textContent = email || '');

    // editor
    $('#acctDisplayEdit') && ($('#acctDisplayEdit').value = name || '');
    $('#acctAvatar')      && ($('#acctAvatar').src = img || '');

    // keep any external labels in sync if they exist elsewhere
    // (we removed the legacy blocks, but this is harmless)
    $('#acctDisplay') && ($('#acctDisplay').textContent = name || '');
    $('#acctEmail')   && ($('#acctEmail').textContent = email || '');
  }

  // --- toggle helpers (always one visible) ---
  function showSummary(){
    const sum = $('#acctSummary'); const ed = $('#acctEditWrap');
    if (sum) sum.hidden = false;
    if (ed)  ed.hidden  = true;
  }
  function showEditor(){
    // ensure editor exists (first click safety)
    buildUI();
    const sum = $('#acctSummary'); const ed = $('#acctEditWrap');
    if (sum) sum.hidden = true;
    if (ed)  ed.hidden  = false;
  }

  // --- first-time users see editor; otherwise summary ---
  function enforceMode(){
    buildUI();
    fillFromSession();
    const s = getSession() || {};
    (!s.display && !s.pfp) ? showEditor() : showSummary();
  }

  // --- editor actions ---
  function onFileChange(e){
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ()=> { const img = $('#acctAvatar'); if (img) img.src = r.result; };
    r.readAsDataURL(f);
  }

  function onSave(){
    const s = getSession(); if (!s){ window.toast?.('Please sign in first','warn'); return; }
    const newName = ($('#acctDisplayEdit')?.value || '').trim();
    const file    = $('#acctAvatarFile')?.files?.[0];

    const finalize = (pfpDataUrl)=>{
  const next = {...s};
  if (newName) next.display = newName;
  if (pfpDataUrl != null) next.pfp = pfpDataUrl;
  setSession(next);
  fillFromSession();
  showSummary();

  window.__ensureBlueToast?.();            // ← add this line
  window.toast?.('Profile updated','info');  // stays the same, now blue
};


    if (file){
      const r = new FileReader();
      r.onload  = ()=> finalize(r.result);
      r.onerror = ()=> { window.toast?.('Image failed to load','err'); finalize(null); };
      r.readAsDataURL(file);
    } else {
      finalize(null);
    }
  }

  // --- lifecycle hooks ---
  function init(){ enforceMode(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  const prevShow = window.showPage;
  window.showPage = function(id){ const r = prevShow?.apply(this, arguments); if (id==='page-account') setTimeout(init,0); return r; };

  const prevRefresh = window.refreshAuthUI;
  window.refreshAuthUI = function(){ const r = prevRefresh?.apply(this, arguments); setTimeout(()=>{ fillFromSession(); enforceMode(); },0); return r; };
})();

// Remove "Go to Builder" if it ever gets re-inserted
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.mycat-toolbar #toBuilder').forEach(el=> el.remove());
});
(function(){
  const prev = window.renderMySubs;
  window.renderMySubs = function(){
    const r = prev?.apply(this, arguments);
    document.querySelectorAll('.mycat-toolbar #toBuilder').forEach(el=> el.remove());
    return r;
  };
})();

/* Default My Subs to "All" whenever page-account becomes active */
(function(){
  const pg = document.getElementById('page-account');
  if (!pg) return;
  new MutationObserver((muts)=>{
    if (pg.classList.contains('active')){
      window.__MY_CAT = 'all';
      try{ localStorage.setItem('gm_mycat','all'); }catch{}
      window.renderMySubs?.();
    }
  }).observe(pg, { attributes:true, attributeFilter:['class'] });
})();

/* ==== My Subs: row click loads to grid (kill button) — paste LAST ==== */
(() => {
  if (window.__GM_MYSUBS_ROWCLICK__) return;
  window.__GM_MYSUBS_ROWCLICK__ = true;

  function wireMySubs() {
    const host = document.getElementById('mySubs');
    if (!host) return;

    // 1) Nuke any old "Load to Grid" buttons so it looks like they never existed
    host.querySelectorAll('[data-load]').forEach(btn => btn.remove());

    // 2) Make each row clickable and map to __MY_SUBS[i]
    const rows = Array.from(host.querySelectorAll('.admin-item'));
    rows.forEach((row, i) => {
      if (row.__gmBound) return;
      row.__gmBound = true;

      row.dataset.msidx = i;
      row.style.cursor = 'pointer';
      row.setAttribute('tabindex', '0');     // a11y
      row.setAttribute('role', 'button');    // a11y

      const act = () => {
        const rec = (window.__MY_SUBS || [])[i];
        if (!rec) return;

        // same path as Groove Library
        (window.gmLoadToGrid || function(){})(rec);
        window.__gmSyncBuilderFromRec?.(rec);

        if (typeof window.goBuilder === 'function') { goBuilder(()=>{}); }
        else { window.showPage?.('page-builder'); }

        const sigEl = document.getElementById('sig');   if (sigEl) sigEl.value = rec.timeSig || '4/4';
        const bpmEl = document.getElementById('tempo'); if (bpmEl) bpmEl.value = rec.tempo  || 100;

        
      };

      row.addEventListener('click', act, true);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
      }, true);
    });
  }

  // Run after renders
  const prevRender = window.renderMySubs;
  window.renderMySubs = function() {
    const r = prevRender?.apply(this, arguments);
    setTimeout(wireMySubs, 0);
    return r;
  };

  // Also try on load + when account page activates
  document.addEventListener('DOMContentLoaded', () => setTimeout(wireMySubs, 0));
  const pg = document.getElementById('page-account');
  if (pg) new MutationObserver(() => {
    if (pg.classList.contains('active')) setTimeout(wireMySubs, 0);
  }).observe(pg, { attributes:true, attributeFilter:['class'] });
})();
/* ==== My Subs → Builder: forced nav + clean sync (paste LAST) ==== */
(() => {
  if (window.__GM_MYSUBS_FORCE_NAV__) return;
  window.__GM_MYSUBS_FORCE_NAV__ = true;

  function fallbackSync(rec){
    if (typeof window.__gmSyncBuilderFromRec === 'function') return window.__gmSyncBuilderFromRec(rec);
    const STEPS = {'2/4':8,'3/4':12,'4/4':16,'5/4':20,'6/8':6,'7/8':7,'9/8':9,'12/8':12};
    const steps = STEPS[rec.timeSig || '4/4'] || 16;
    const toArr = s => {
      const a = (s||'').split('').map(n=>+n||0);
      if (a.length < steps) a.push(...Array(steps-a.length).fill(0));
      return a.slice(0, steps);
    };
    window.A_SIG   = rec.timeSig || '4/4';
    window.A_STEPS = steps;
    window.A_step  = 0;
    window.A_grid  = [ toArr(rec.H),  toArr(rec.S),  toArr(rec.K) ];
    window.B_grid  = (rec.bars||1)===2 ? [ toArr(rec.H2), toArr(rec.S2), toArr(rec.K2) ] : null;
  }

  function hardResetBuilderDOM(){
    try{ window.stopPlay?.(); }catch{}
    try{ window.a_stop?.(); }catch{}
    try{ if (window.__builderTimer) { clearTimeout(window.__builderTimer); window.__builderTimer=null; } }catch{}
    ['#m1-hat','#m1-snare','#m1-kick','#m1-label',
     '#m2-hat','#m2-snare','#m2-kick','#m2-label'].forEach(sel=>{
       const el = document.querySelector(sel); if (el) el.innerHTML = '';
     });
    const sys = document.getElementById('system'); if (sys) sys.classList.remove('two');
    const m2  = document.getElementById('m2');     if (m2)  m2.style.display = 'none';
  }

  function ensureBuilderActive(cb){
    if (typeof window.goBuilder === 'function') { window.goBuilder(cb); return; }
    // fallback: manual page switch
    try{
      document.querySelectorAll('.modal[aria-hidden="false"]').forEach(m=>m.setAttribute('aria-hidden','true'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-builder')?.classList.add('active');
      window.scrollTo({top:0, behavior:'instant'});
    }catch{}
    let tries=0;(function wait(){
      const ready = document.getElementById('page-builder')?.classList.contains('active')
                 && document.getElementById('m1-hat');
      if (ready || tries++>40){ try{ cb?.(); }catch{} return; }
      setTimeout(wait, 25);
    })();
  }

  function applyDataCol(){
    ['#m1-hat','#m1-snare','#m1-kick','#m1-label',
     '#m2-hat','#m2-snare','#m2-kick','#m2-label'].forEach(sel=>{
       const row=document.querySelector(sel);
       if (row) Array.from(row.children).forEach((c,i)=> c.setAttribute('data-col', i));
     });
  }

  function loadRecToBuilder(rec){
    ensureBuilderActive(() => {
      hardResetBuilderDOM();
      (window.gmLoadToGrid || function(){})(rec); // paint DOM
      fallbackSync(rec);                           // ensure arrays for Play
      applyDataCol();
      const sigEl=document.getElementById('sig');   if (sigEl) sigEl.value = rec.timeSig || '4/4';
      const bpmEl=document.getElementById('tempo'); if (bpmEl) bpmEl.value = rec.tempo  || 100;
      
    });
  }

  function onRowClick(e){
    const row = e.target.closest('#mySubs .admin-item');
    if (!row) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const i = +row.dataset.msidx;
    const rec = (window.__MY_SUBS || [])[i];
    if (rec) loadRecToBuilder(rec);
  }
  function onRowKey(e){
    if (e.key!=='Enter' && e.key!==' ') return;
    const row = e.target.closest('#mySubs .admin-item');
    if (!row) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const i = +row.dataset.msidx;
    const rec = (window.__MY_SUBS || [])[i];
    if (rec) loadRecToBuilder(rec);
  }

  function wireMySubs(){
    const host = document.getElementById('mySubs');
    if (!host) return;

    // erase any old buttons to keep UI clean
    host.querySelectorAll('[data-load]').forEach(el=>el.remove());

    // make rows clickable + index them
    Array.from(host.querySelectorAll('.admin-item')).forEach((row,i)=>{
      row.dataset.msidx = i;
      row.style.cursor = 'pointer';
      row.setAttribute('tabindex','0');
      row.setAttribute('role','button');
    });

    // bind once per host (capture beats older handlers)
    if (!host.__gmRowBound){
      host.__gmRowBound = true;
      host.addEventListener('click',   onRowClick, true);
      host.addEventListener('keydown', onRowKey,   true);
    }
  }

  // hook after any renderMySubs call
  const prevRender = window.renderMySubs;
  window.renderMySubs = function(){
    const r = prevRender?.apply(this, arguments);
    setTimeout(wireMySubs, 0);
    return r;
  };

  // first wire + when Account page becomes active
  document.addEventListener('DOMContentLoaded', ()=> setTimeout(wireMySubs, 0));
  const pg = document.getElementById('page-account');
  if (pg) new MutationObserver(()=> {
    if (pg.classList.contains('active')) setTimeout(wireMySubs, 0);
  }).observe(pg, { attributes:true, attributeFilter:['class'] });
})();
/* My Subs — use the exact Groove Library path on row click */
(() => {
  const host = document.getElementById('mySubs');
  if (!host || host.__gmRowLoadBound) return;
  host.__gmRowLoadBound = true;

  function allApprovedLocal(){
    try {
      if (typeof window.allApproved === 'function') return window.allApproved();
      return JSON.parse(localStorage.getItem('gm_approved_submissions') || '[]');
    } catch { return []; }
  }
  function norm(s){ return (s||'').trim().toLowerCase(); }

  function resolveApproved(rec){
    const lib = allApprovedLocal();
    if (!lib.length) return null;

    // Prefer slug (Library always ensures slug)
    if (rec.slug){
      const hit = lib.find(x => x.slug === rec.slug);
      if (hit) return hit;
    }
    // Fallback: loose match (title+artist+sig+tempo)
    const t = norm(rec.title), a = norm(rec.artist);
    const s = String(rec.timeSig||''); const b = String(rec.tempo||'');
    return lib.find(x =>
      norm(x.title)  === t &&
      norm(x.artist) === a &&
      String(x.timeSig||'') === s &&
      String(x.tempo||'')   === b
    ) || null;
  }

  host.addEventListener('click', (e) => {
    const row = e.target.closest('.admin-item');
    if (!row) return;

    // index of the row among #mySubs children
    const idx = +row.getAttribute('data-idx') || Array.prototype.indexOf.call(host.children, row);
    const rec = (window.__MY_SUBS || [])[idx];
    if (!rec) return;

    // Only behave like Library for approved items
    if (rec._status !== 'Approved'){
      window.toast?.('Not in Library yet (pending).', 'warn');
      return;
    }

    const g = resolveApproved(rec);
    if (!g){
      window.toast?.('Could not find approved copy.', 'warn');
      return;
    }

    // Ensure the same loader the Library uses is callable
    if (typeof window.loadGroove !== 'function'){
      // If loadGroove was defined in a closure, expose it once where it’s defined:
      //   window.loadGroove = loadGroove;
      window.toast?.('Loader missing.', 'err');
      return;
    }

    // EXACT Library path: load then go to Builder
    window.loadGroove(g);
    setTimeout(() => {
      if (typeof window.showPage === 'function') window.showPage('page-builder');
      else if (typeof window.goBuilder === 'function') window.goBuilder(()=>{});
    }, 0);

    // Your preferred blue toast text
    window.__ensureBlueToast?.();
    window.toast?.('Load to grid', 'info');
  }, false);
})();
/* ==== My Subs → Builder: labels + audio grid sync (final drop-in) ==== */
(() => {
  if (window.__GM_MYSUBS_LABELS_AUDIO_FIX__) return;
  window.__GM_MYSUBS_LABELS_AUDIO_FIX__ = true;

  // --- meter table (mirrors builder) ---
  const TS = {
    "2/4":{steps:8, type:"simple"},
    "3/4":{steps:12,type:"simple"},
    "4/4":{steps:16,type:"simple"},
    "5/4":{steps:20,type:"simple"},
    "6/8":{steps:12,type:"compound"}, // builder uses 8ths across two bars-worth
    "7/8":{steps:14,type:"compound"},
    "9/8":{steps:18,type:"compound"},
    "12/8":{steps:24,type:"compound"}
  };
  const stepsFor = sig => (TS[sig]?.steps) || 16;

  // --- builder page activation ---
  function ensureBuilderActive(cb){
    if (typeof window.goBuilder === 'function'){ window.goBuilder(cb); return; }
    try{
      document.querySelectorAll('.modal[aria-hidden="false"]').forEach(m=>m.setAttribute('aria-hidden','true'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-builder')?.classList.add('active');
      window.scrollTo({top:0, behavior:'instant'});
    }catch{}
    let tries=0;(function wait(){
      const ready = document.getElementById('page-builder')?.classList.contains('active')
                 && document.getElementById('m1-hat');
      if (ready || tries++>40){ try{ cb?.(); }catch{} return; }
      setTimeout(wait, 25);
    })();
  }

  // --- stop any existing builder playback / timers ---
  function stopBuilderPlayback(){
    try{ window.stopPlay?.(); }catch{}
    try{ window.a_stop?.(); }catch{}
    try{ if (window.__builderTimer) { clearTimeout(window.__builderTimer); window.__builderTimer = null; } }catch{}
    try{ if (window.A_interval) { clearTimeout(window.A_interval); window.A_interval = null; } }catch{}
    document.querySelectorAll('#system .playing').forEach(el=> el.classList.remove('playing'));
  }

  // --- clear grid DOM to a blank state ---
  function hardResetBuilderDOM(){
    ['#m1-hat','#m1-snare','#m1-kick','#m1-label',
     '#m2-hat','#m2-snare','#m2-kick','#m2-label'].forEach(sel=>{
       const el = document.querySelector(sel); if (el) el.innerHTML = '';
     });
    const sys = document.getElementById('system'); if (sys) sys.classList.remove('two');
    const m2  = document.getElementById('m2');     if (m2)  m2.style.display = 'none';
  }

  // --- paint helpers (rows + labels) ---
  function decodeRow(str, kind){
    return String(str||'').split('').map(ch => {
      if (kind==='H') return ch==='3' ? 'x>' : ch==='2' ? 'O' : ch==='1' ? 'x' : '';
      if (kind==='S') return ch==='2' ? '(●)' : ch==='1' ? '●' : '';
      if (kind==='K') return ch==='1' ? '●' : '';
      return '';
    });
  }
  function paintRow(sel, vals){
    const row = document.querySelector(sel); if (!row) return;
    row.innerHTML = '';
    vals.forEach((tok, i) => {
      const c = document.createElement('div');
      c.className = 'cell';
      c.setAttribute('data-col', String(i));
      c.textContent = tok;
      row.appendChild(c);
    });
  }
  function paintLabels(sel, sig, steps){
    const row = document.querySelector(sel); if (!row) return;
    const denom8 = /\/8$/.test(sig);
    row.innerHTML = '';
    for (let i=0;i<steps;i++){
      const c = document.createElement('div');
      c.className = 'cell' + ((denom8 ? (i%3===0) : (i%4===0)) ? ' beat' : '');
      if (!denom8){
        const bi = Math.floor(i/4), sub = i%4;
        c.textContent = sub===0 ? (1+bi) : (sub===1?'e' : sub===2?'&' : 'a');
      } else {
        if (i%3===0) c.textContent = 1 + Math.floor(i/3);
      }
      c.setAttribute('data-col', String(i));
      row.appendChild(c);
    }
  }

  function applyDataCol(){
    ['#m1-hat','#m1-snare','#m1-kick','#m1-label',
     '#m2-hat','#m2-snare','#m2-kick','#m2-label'].forEach(sel=>{
       const row = document.querySelector(sel);
       if (row) Array.from(row.children).forEach((c,i)=> c.setAttribute('data-col', i));
     });
  }

  // --- make the arrays the play loop reads from ---
  function setAudioArrays(rec){
    const steps = stepsFor(rec.timeSig || '4/4');
    const toArr = s => {
      const a=(s||'').split('').map(n=>+n||0);
      if (a.length<steps) a.push(...Array(steps-a.length).fill(0));
      return a.slice(0,steps);
    };
    window.A_SIG   = rec.timeSig || '4/4';
    window.A_STEPS = steps;
    window.A_step  = 0;
    window.A_grid  = [ toArr(rec.H),  toArr(rec.S),  toArr(rec.K) ];
    window.B_grid  = (rec.bars||1)===2 ? [ toArr(rec.H2), toArr(rec.S2), toArr(rec.K2) ] : null;
  }

  // --- single entry point we call from My Subs click ---
  function loadRecToBuilder(rec){
    if (!rec) return;
    ensureBuilderActive(() => {
      stopBuilderPlayback();         // stop old groove
      hardResetBuilderDOM();         // clear DOM
      const sig   = rec.timeSig || '4/4';
      const steps = stepsFor(sig);

      // bar 1
      paintLabels('#m1-label', sig, steps);
      paintRow('#m1-hat',   decodeRow(rec.H,  'H').slice(0,steps));
      paintRow('#m1-snare', decodeRow(rec.S,  'S').slice(0,steps));
      paintRow('#m1-kick',  decodeRow(rec.K,  'K').slice(0,steps));

      // bar 2
      const isTwo = (rec.bars||1)===2;
      const sys = document.getElementById('system');
      const m2  = document.getElementById('m2');
      if (isTwo && m2){
        if (sys) sys.classList.add('two');
        m2.style.display = '';
        paintLabels('#m2-label', sig, steps);
        paintRow('#m2-hat',   decodeRow(rec.H2, 'H').slice(0,steps));
        paintRow('#m2-snare', decodeRow(rec.S2, 'S').slice(0,steps));
        paintRow('#m2-kick',  decodeRow(rec.K2, 'K').slice(0,steps));
      }

      applyDataCol();                // for playhead highlight
      setAudioArrays(rec);           // 👈 audio reads these now

      // sync controls
      const sEl = document.getElementById('sig');   if (sEl) sEl.value = sig;
      const tEl = document.getElementById('tempo'); if (tEl) tEl.value = rec.tempo || 100;
      
    });
  }

  // --- hook My Subs row clicks (capture = stop others) ---
  function wireMySubs(){
    const host = document.getElementById('mySubs');
    if (!host || host.__gmLoaderBound) return;
    host.__gmLoaderBound = true;

    host.addEventListener('click', (e)=>{
      const row = e.target.closest('.admin-item');
      if (!row) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

      // figure out index regardless of prior markup
      const rows = Array.from(host.querySelectorAll('.admin-item'));
      const i = rows.indexOf(row);
      const rec = (window.__MY_SUBS || [])[i];
      if (!rec) return;

      loadRecToBuilder(rec);
    }, true);

    host.addEventListener('keydown', (e)=>{
      if (e.key!=='Enter' && e.key!==' ') return;
      const row = e.target.closest('.admin-item');
      if (!row) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

      const rows = Array.from(host.querySelectorAll('.admin-item'));
      const i = rows.indexOf(row);
      const rec = (window.__MY_SUBS || [])[i];
      if (!rec) return;

      loadRecToBuilder(rec);
    }, true);
  }

  // wire after renders and on load
  const prevRender = window.renderMySubs;
  window.renderMySubs = function(){
    const r = prevRender?.apply(this, arguments);
    setTimeout(wireMySubs, 0);
    return r;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=> setTimeout(wireMySubs,0));
  } else {
    setTimeout(wireMySubs,0);
  }
})();
// Promote Library "Load to Grid" buttons to primary styling
(function(){
  const res = document.getElementById('results');
  if (!res) return;
  const apply = () => res.querySelectorAll('[data-loadslug]').forEach(b => b.classList.add('primary'));
  // run now + after each search render
  apply();
  const mo = new MutationObserver(apply);
  mo.observe(res, { childList: true, subtree: true });
})();
/* ==== HARD KILL: block auto "Load to grid" unless user just interacted ==== */
(() => {
  // 1) Mark a short window after a *real* user gesture
  const ARM_MS = 900;
  function arm() {
    window.__GM_ALLOW_LOAD = true;
    clearTimeout(window.__GM_ALLOW_LOAD_T);
    window.__GM_ALLOW_LOAD_T = setTimeout(() => (window.__GM_ALLOW_LOAD = false), ARM_MS);
  }
  // Any normal user gesture will arm the gate
  window.addEventListener('mousedown',  arm, true);
  window.addEventListener('touchstart', arm, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') arm();
  }, true);

  // 2) Wrap gmLoadToGrid so programmatic calls are ignored
  const _gmLoadToGrid = window.gmLoadToGrid?.bind(window);
  window.gmLoadToGrid = function(rec) {
    if (!window.__GM_ALLOW_LOAD) {
      // silently block any background/init loads
      // console.debug('[gmLoadToGrid] blocked (no user gesture)');
      return;
    }
    // one-shot: consume the allowance so background code can’t chain-call
    window.__GM_ALLOW_LOAD = false;
    return _gmLoadToGrid ? _gmLoadToGrid(rec) : undefined;
  };

  // 3) (Optional but helpful) explicitly disarm on Account page activation
  const prevShow = window.showPage;
  window.showPage = function(id) {
    const r = prevShow?.apply(this, arguments);
    if (id === 'page-account') {
      window.__GM_ALLOW_LOAD = false;
      clearTimeout(window.__GM_ALLOW_LOAD_T);
    }
    return r;
  };
})();
/* ============= NUKE PHANTOM LOADS (keep Library/Search clicks) ============= */
(() => {
  if (window.__GM_NOAUTO_WRAP__) return;
  window.__GM_NOAUTO_WRAP__ = true;

  const orig = (typeof window.gmLoadToGrid === 'function')
    ? window.gmLoadToGrid.bind(window)
    : null;

  // Mark genuine user intent when clicking Library/Search/My Subs load controls
  let __lastIntentAt = 0;
  const markIntent = () => { __lastIntentAt = performance.now(); };
  document.addEventListener('click', (e) => {
    if (
      e.target.closest('[data-loadslug]') ||          // Library/Search buttons
      e.target.closest('[data-action="load"]') ||     // any other load action
      e.target.closest('.lib-actions .btn') ||        // Library primary action
      e.target.closest('#results .btn') ||            // Search area
      e.target.closest('#mySubs .admin-item')         // My Submissions row click
    ) {
      markIntent();
    }
  }, true);

  // Block window for a moment on startup and when entering Account
  const blockMs = 1200;
  const now = () => performance.now();
  window.__GM_STARTUP_BLOCK_UNTIL = now() + blockMs;

  const prevShow = window.showPage;
  window.showPage = function(id){
    const r = prevShow?.apply(this, arguments);
    // Extend block briefly when Account is shown (where the flash happens)
    if (id === 'page-account') window.__GM_STARTUP_BLOCK_UNTIL = now() + blockMs;
    return r;
  };

  function userIntended() { return (now() - __lastIntentAt) < 1200; }

  window.gmLoadToGrid = function(rec){
    // Allow only if a recent user click triggered it, or if not in startup/account-block
    const onAccount = document.getElementById('page-account')?.classList.contains('active');
    const startupBlocked = now() < (window.__GM_STARTUP_BLOCK_UNTIL || 0);
    const allow = userIntended() || (!onAccount && !startupBlocked);

    if (!allow) {
      // Silent drop (phantom call)
      // console.debug('[gmLoadToGrid] blocked phantom', rec);
      return;
    }
    return orig ? orig(rec) : undefined;
  };
})();

/* =========================================================
   GROOVEMATCH — CLEAN PATCH (drop-in, paste LAST)
   Fixes:
   • My Submissions loads + Play works (uses unified loader)
   • Search = songs only; loads via same loader
   • No phantom autoload on Account
   • Stop playback when leaving Builder
   • White avatar circle
   • "Save Profile" uses primary blue
========================================================= */

(function(){
  /* ---------- tiny utils ---------- */
  const TS = {                // steps == what your builder expects
    "2/4":8, "3/4":12, "4/4":16, "5/4":20,
    "6/8":12, "7/8":14, "9/8":18, "12/8":24
  };
  const stepsFor = sig => TS[sig] || 16;
  const PIX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const ready = fn => (document.readyState==='loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn();

  /* ---------- stop any playback when leaving Builder ---------- */
  function stopBuilder(){
    try{ window.stopPlay?.() }catch{}
    try{ window.a_stop?.() }catch{}
    try{ if (window.__builderTimer) { clearTimeout(window.__builderTimer); window.__builderTimer=null; } }catch{}
    try{ if (window.A_interval)     { clearTimeout(window.A_interval);     window.A_interval=null; } }catch{}
    document.querySelectorAll('#system .playing').forEach(el=>el.classList.remove('playing'));
  }
  const _showPage = window.showPage;
  window.showPage = function(id){ const r=_showPage?.apply(this,arguments); if(id!=='page-builder') stopBuilder(); return r; };

  /* ---------- one true loader: rec -> builder DOM + audio arrays ---------- */
  window.loadRecToBuilder = function(rec){
    if (!rec) return;

    const sig   = String(rec.timeSig || '4/4');
    const tempo = String(rec.tempo  || '100');
    const steps = stepsFor(sig);
    const toTok = (s, kind) => String(s||'').split('').map(ch => {
      if (kind==='H') return ch==='3' ? 'x>' : ch==='2' ? 'O' : ch==='1' ? 'x' : '';
      if (kind==='S') return ch==='2' ? '(●)' : ch==='1' ? '●' : '';
      if (kind==='K') return ch==='1' ? '●' : '';
      return '';
    }).slice(0, steps);
    const toArr = s => {
      const a = String(s||'').split('').map(n=>+n||0);
      if (a.length<steps) a.push(...Array(steps-a.length).fill(0));
      return a.slice(0,steps);
    };

    // ensure Builder page active
    try{
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-builder')?.classList.add('active');
      window.scrollTo({top:0, behavior:'instant'});
    }catch{}

    // clear old DOM
    ['#m1-hat','#m1-snare','#m1-kick','#m1-label',
     '#m2-hat','#m2-snare','#m2-kick','#m2-label']
      .forEach(sel=>{ const el=document.querySelector(sel); if(el) el.innerHTML=''; });
    const sys = document.getElementById('system'); if (sys) sys.classList.remove('two');
    const m2  = document.getElementById('m2');     if (m2)  m2.style.display='none';

    // paint labels + rows
    function paintLabels(sel){
      const row = document.querySelector(sel); if(!row) return;
      const denom8 = /\/8$/.test(sig);
      for(let i=0;i<steps;i++){
        const c = document.createElement('div');
        c.className = 'cell' + ((denom8 ? (i%3===0) : (i%4===0)) ? ' beat' : '');
        if (!denom8){
          const bi=Math.floor(i/4), sub=i%4;
          c.textContent = sub===0 ? (1+bi) : (sub===1?'e':sub===2?'&':'a');
        } else if (i%3===0){ c.textContent = 1 + Math.floor(i/3); }
        c.setAttribute('data-col', String(i));
        row.appendChild(c);
      }
    }
    function paintRow(sel, toks){
      const row = document.querySelector(sel); if(!row) return;
      toks.forEach((t,i)=>{
        const c=document.createElement('div');
        c.className='cell'; c.textContent=t; c.setAttribute('data-col', String(i));
        row.appendChild(c);
      });
    }

    paintLabels('#m1-label');
    paintRow('#m1-hat',   toTok(rec.H,'H'));
    paintRow('#m1-snare', toTok(rec.S,'S'));
    paintRow('#m1-kick',  toTok(rec.K,'K'));

    const isTwo = (rec.bars||1)===2;
    if (isTwo && m2){
      sys?.classList.add('two'); m2.style.display='';
      paintLabels('#m2-label');
      paintRow('#m2-hat',   toTok(rec.H2,'H'));
      paintRow('#m2-snare', toTok(rec.S2,'S'));
      paintRow('#m2-kick',  toTok(rec.K2,'K'));
    }

    // sync controls
    const sEl=document.getElementById('sig');   if(sEl) sEl.value=sig;
    const tEl=document.getElementById('tempo'); if(tEl) tEl.value=tempo;

    // audio arrays the play loop reads
    window.A_SIG   = sig;
    window.A_STEPS = steps;
    window.A_step  = 0;
    window.A_grid  = [ toArr(rec.H),  toArr(rec.S),  toArr(rec.K) ];
    window.B_grid  = isTwo ? [ toArr(rec.H2), toArr(rec.S2), toArr(rec.K2) ] : null;
  };

  /* ---------- My Submissions: click -> unified loader ---------- */
  function wireMySubs(){
    const host = document.getElementById('mySubs');
    if (!host || host.__gmBound) return;
    host.__gmBound = true;

    host.addEventListener('click', (e)=>{
      const row = e.target.closest('.admin-item');
      if (!row) return;
      e.preventDefault(); e.stopPropagation();

      // index by DOM order
      const rows = Array.from(host.querySelectorAll('.admin-item'));
      const i = rows.indexOf(row);
      const src = (window.__MY_SUBS || [])[i];
      if (!src){ window.toast?.('Can’t find that one','warn'); return; }

      // prefer approved copy by slug (same as Library does)
      let rec = src;
      try{
        const lib = JSON.parse(localStorage.getItem('gm_approved_submissions')||'[]');
        const hit = lib.find(x => x.slug && x.slug === src.slug);
        if (hit) rec = hit;
      }catch{}

      window.loadRecToBuilder(rec);
    }, true);
  }

  /* ---------- Search: clamp to songs only and use unified loader ---------- */
  function wireSearch(){
    const btn = document.getElementById('findBtn');
    const input = document.getElementById('search');
    const results = document.getElementById('results');
    if (!btn || !input || !results) return;

    const get = (k,d=[])=>{ try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d));}catch{return d;} };

    btn.addEventListener('click', ()=>{
      const q=(input.value||'').trim().toLowerCase();
      const songs = get('gm_approved_submissions', []).filter(x => (x.type||'song')==='song');
      const hits = songs.filter(g=>{
        if(!q) return true;
        const hay=[g.title,g.artist,g.drummer,g.genre,g.timeSig,String(g.tempo||'')].join(' ').toLowerCase();
        return hay.includes(q);
      });
      if (!hits.length){ results.innerHTML = `<div class="muted">No song results. (Patterns are excluded.)</div>`; return; }

      results.innerHTML = hits.slice(0,20).map(g=>`
        <div class="card"><div class="rowline">
          <div>
            <div class="title">${g.title||'Untitled Song'}</div>
            <div class="meta">${g.artist||'Unknown'} • ${g.timeSig||'4/4'} • ${g.tempo||100} BPM</div>
          </div>
          <button class="btn small primary" data-slug="${g.slug}">Load to Grid</button>
        </div></div>
      `).join('');

      results.addEventListener('click', function onClick(e){
        const b = e.target.closest('[data-slug]'); if(!b) return;
        const rec = hits.find(x=>x.slug===b.dataset.slug);
        if (rec) window.loadRecToBuilder(rec);
      }, { once:true, capture:true });
    });
  }

  /* ---------- nuke autoload on Account (only load on explicit click) ---------- */
  function blockPhantomLoads(){
    if (!window.gmLoadToGrid) return; // nothing to wrap
    const orig = window.gmLoadToGrid.bind(window);
    window.gmLoadToGrid = function(rec){
      const onAccount = document.getElementById('page-account')?.classList.contains('active');
      if (onAccount && !window.__GM_INTENT_CLICK) return; // ignore silent calls on Account
      return orig(rec);
    };
    document.addEventListener('click', (e)=>{
      const legit = e.target.closest('[data-slug],[data-loadslug],[data-action="load"],.lib-actions .btn,#results .btn');
      window.__GM_INTENT_CLICK = !!legit;
      if (legit) setTimeout(()=> window.__GM_INTENT_CLICK=false, 500);
    }, true);
  }

  /* ---------- white avatar circle + "Save" blue ---------- */
  function fixAccountChrome(){
    const mini = document.getElementById('acctAvatarMini');
    const big  = document.getElementById('acctAvatar');
    [mini,big].forEach(el=>{
      if (!el) return;
      if (!el.getAttribute('src')) el.setAttribute('src', PIX);
      el.style.background='#fff'; el.style.border='1px solid #dcdcdc';
      el.style.borderRadius='50%'; el.style.objectFit='cover';
      if (el===mini){ el.style.width='40px'; el.style.height='40px'; }
      if (el===big ){ el.style.width='72px'; el.style.height='72px'; }
    });
    const save = document.getElementById('acctProfileSave');
    if (save) save.classList.add('primary');
  }

  /* ---------- boot ---------- */
  ready(()=>{
    wireMySubs();
    wireSearch();
    blockPhantomLoads();
    fixAccountChrome();
  });
})();
/* --- Redirect to Home on logout --- */
(function(){
  const logout = document.getElementById('navLogout') 
               || document.querySelector('#logout, #nav-logout, button[onclick*="logout"]');
  if (!logout) return;

  logout.addEventListener('click', ()=> {
    try {
      // clear session (whatever you already do)
      localStorage.removeItem('gm_session');
      window.refreshAuthUI?.();

      // redirect to Home
      if (typeof window.showPage === 'function') {
        window.showPage('page-home');
      } else {
        // fallback: if showPage isn’t global
        document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
        document.getElementById('page-home')?.classList.add('active');
        window.scrollTo({top:0, behavior:'instant'});
      }
    } catch(e){ console.error('[logout redirect]', e); }
  }, { capture:true });
})();
/* --- Ensure Admin Tools show if role === 'admin' --- */
(function(){
  function ensureAdminTools(){
    const s = JSON.parse(localStorage.getItem('gm_session')||'null');
    const role = s?.role || '';
    const card = document.querySelector('#page-account .account-card');
    if (!card) return;

    let tools = document.getElementById('acctAdminTools');
    if (role === 'admin') {
      if (!tools) {
        tools = document.createElement('div');
        tools.id = 'acctAdminTools';
        tools.className = 'acct-sec';
        tools.innerHTML = `
          <div class="acct-sec-title">Admin Tools</div>
          <ul class="admin-links">
            <li><a href="#" onclick="showPage('page-pending')">Pending Grooves</a></li>
            <li><a href="#" onclick="showPage('page-library')">Approved Library</a></li>
            <!-- add more links as needed -->
          </ul>
        `;
        card.appendChild(tools);
      }
      tools.hidden = false;
    } else if (tools) {
      tools.hidden = true;
    }
  }

  // Run on load + whenever Account is shown
  document.addEventListener('DOMContentLoaded', ensureAdminTools);
  const prevShow = window.showPage;
  window.showPage = function(id){
    const r = prevShow?.apply(this, arguments);
    if (id === 'page-account') setTimeout(ensureAdminTools,0);
    return r;
  };

  // Also on auth refresh
  const prevRefresh = window.refreshAuthUI;
  window.refreshAuthUI = function(){
    const r = prevRefresh?.apply(this, arguments);
    setTimeout(ensureAdminTools,0);
    return r;
  };
})();
/* ==== GROOVEMATCH PATCH — SINGLE LOADER (used everywhere) ==== */
(() => {
  if (window.__GM_UNIFIED_LOADER__) return;
  window.__GM_UNIFIED_LOADER__ = true;

  const libLoader = (typeof window.loadGroove === 'function') ? window.loadGroove.bind(window) : null;
  const prior     = (typeof window.gmLoadToGrid === 'function') ? window.gmLoadToGrid.bind(window) : null;

  const TS = window.TIME_SIGS || {
    "2/4":{steps:8,type:"simple"}, "3/4":{steps:12,type:"simple"}, "4/4":{steps:16,type:"simple"},
    "5/4":{steps:20,type:"simple"}, "6/8":{steps:12,type:"compound"}, "7/8":{steps:14,type:"compound"},
    "9/8":{steps:18,type:"compound"}, "12/8":{steps:24,type:"compound"}
  };
  function stepsFor(sig){ return (TS[sig]?.steps) || 16; }
  function toArr(s, steps){
    const a = String(s||'').split('').map(n=>+n||0);
    if (a.length < steps) a.push(...Array(steps-a.length).fill(0));
    return a.slice(0, steps);
  }

  window.gmLoadToGrid = function unifiedLoad(rec){
    if (!rec) return;

    if (libLoader) {
      libLoader(rec);                           // use the exact Library path
    } else if (prior) {
      prior(rec);                               // fallback to your old function if present
    } else {
      // last-resort: paint DOM + audio arrays so Play works
      const sig   = rec.timeSig || '4/4';
      const steps = stepsFor(sig);
      window.A_SIG   = sig;
      window.A_STEPS = steps;
      window.A_step  = 0;
      window.A_grid  = [ toArr(rec.H, steps),  toArr(rec.S, steps),  toArr(rec.K, steps) ];
      window.B_grid  = (rec.bars||1)===2 ? [ toArr(rec.H2, steps), toArr(rec.S2, steps), toArr(rec.K2, steps) ] : null;

      const put = (sel, arr, kind) => {
        const row = document.querySelector(sel); if (!row) return;
        row.innerHTML = '';
        arr.forEach(v => {
          const c = document.createElement('div'); c.className='cell';
          if (kind==='H') c.textContent = v===3?'x›':v===2?'O':v===1?'x':'';
          if (kind==='S') c.textContent = v===2?'(●)':v===1?'●':'';
          if (kind==='K') c.textContent = v===1?'●':'';
          row.appendChild(c);
        });
      };
      const paintLabels = (sel) => {
        const denom8 = /\/8$/.test(sig);
        const row = document.querySelector(sel); if (!row) return;
        row.innerHTML = '';
        for (let i=0;i<steps;i++){
          const c=document.createElement('div'); c.className='cell'+((denom8 ? i%3===0 : i%4===0)?' beat':'');
          if (!denom8){
            const bi=Math.floor(i/4), sub=i%4;
            c.textContent = sub===0 ? (1+bi) : (sub===1?'e':sub===2?'&':'a');
          } else if (i%3===0) c.textContent = 1 + Math.floor(i/3);
          row.appendChild(c);
        }
      };
      paintLabels('#m1-label');
      put('#m1-hat',   window.A_grid[0], 'H');
      put('#m1-snare', window.A_grid[1], 'S');
      put('#m1-kick',  window.A_grid[2], 'K');

      const two = !!window.B_grid;
      const m2  = document.getElementById('m2');
      if (m2){ m2.style.display = two ? '' : 'none'; }
      if (two){
        paintLabels('#m2-label');
        put('#m2-hat',   window.B_grid[0], 'H');
        put('#m2-snare', window.B_grid[1], 'S');
        put('#m2-kick',  window.B_grid[2], 'K');
      }
    }

    const $ = s => document.querySelector(s);
    $('#sig')   && ($('#sig').value   = rec.timeSig || '4/4');
    $('#tempo') && ($('#tempo').value = rec.tempo   || 100);
    if (typeof window.showPage === 'function') window.showPage('page-builder');
  };
})();
/* === Admin Tools: de-dupe + use the real card === */
(() => {
  function ensureAdminTools() {
    // remove the injected clone if it exists
    document.getElementById('acctAdminTools')?.remove();

    // show/hide the real Admin Tools card
    const tools = document.getElementById('adminTools');
    if (!tools) return;

    // try the existing helpers if they exist; fallback to reading session
    let role = 'user';
    try {
      if (typeof findUser === 'function' && typeof currentUser === 'function') {
        role = (findUser(currentUser()?.email || '')?.role) || 'user';
      } else {
        const s = JSON.parse(localStorage.getItem('gm_session') || 'null');
        role = s?.role || 'user';
      }
    } catch {}

    tools.style.display = role === 'admin' ? '' : 'none';
    if (role === 'admin' && typeof renderUserList === 'function') renderUserList();
  }

  // run now + whenever Account page is shown
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureAdminTools);
  } else {
    ensureAdminTools();
  }
  const prevShow = window.showPage;
  window.showPage = function(id){
    const r = prevShow?.apply(this, arguments);
    if (id === 'page-account') setTimeout(ensureAdminTools, 0);
    return r;
  };
})();
/* === My Submissions: disable ONLY "Load to Grid" (Library/Search Load untouched) === */
(() => {
  const scopeSel = '#page-account #mySubs';

  // 1) remove the "Load to Grid" UI inside My Submissions, keep everything else
  function scrub(root = document){
    const scope = root.querySelector(scopeSel);
    if (!scope) return;

    // kill obvious controls by data-attrs
    scope.querySelectorAll('[data-load-to-grid],[data-loadgrid],[data-load_grid]').forEach(el => el.remove());

    // kill buttons/links whose text is exactly "Load to Grid" (ignore Library "Load")
    scope.querySelectorAll('button,a').forEach(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      if (/^load\s*(to\s*grid)\s*$/.test(t)) el.remove();
    });
  }

  // run now + on DOM changes that touch Account page
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scrub());
  } else {
    scrub();
  }
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.target instanceof Element && (m.target.closest('#page-account') || m.addedNodes.length)) scrub();
    }
  }).observe(document.body, { childList:true, subtree:true });

  // 2) capture-phase shield: block any surviving delegated listeners inside My Submissions only
  document.addEventListener('click', (e) => {
    const accountActive = document.querySelector('#page-account.active');
    if (!accountActive) return;

    const hit = e.target.closest(`${scopeSel} [data-load-to-grid], ${scopeSel} [data-loadgrid], ${scopeSel} [data-load_grid], ${scopeSel} button, ${scopeSel} a`);
    if (!hit) return;

    const label = (hit.textContent || '').trim().toLowerCase();
    const isBad = hit.hasAttribute('data-load-to-grid') || hit.hasAttribute('data-loadgrid') ||
                  /^load\s*(to\s*grid)\s*$/.test(label);

    if (isBad) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
      oneToast('“Load to Grid” is disabled in My Submissions. Use Library → Load.', 'warn');
    }
  }, true);

  // 3) if some script calls a global loader, intercept it only when Account is active
  const orig = window.gmLoadToGrid;
  window.gmLoadToGrid = function(){
    if (document.querySelector('#page-account.active')) {
      oneToast('“Load to Grid” is disabled in My Submissions. Use Library → Load.', 'warn');
      return;
    }
    return typeof orig === 'function' ? orig.apply(this, arguments) : undefined;
  };

  // tiny helper used here + by the toast deduper below
  function oneToast(msg, tone='ok'){
    const now = performance.now();
    if (oneToast._last && now - oneToast._last.t < 800 && oneToast._last.m === msg) return;
    oneToast._last = { m: msg, t: now };
    (window.toast ? window.toast(msg, tone) : console.log(`[${tone}] ${msg}`));
  }
})();
/* === Toast de-dupe: collapse identical toasts fired within 800ms === */
(() => {
  function wrap(){
    const orig = window.toast;
    if (!orig || orig.__dedup) return;
    const wrapped = function(msg, tone='ok', ms){
      const now = performance.now();
      if (wrapped._last && now - wrapped._last.t < 800 && wrapped._last.m === msg) return;
      wrapped._last = { m: msg, t: now };
      return orig.call(this, msg, tone, ms);
    };
    wrapped.__dedup = true;
    window.toast = wrapped;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrap);
  } else {
    wrap();
  }
})();

/* ===== My Submissions → ONE TRUE LOADER (leave Library/Search alone) ===== */
(() => {
  if (window.__GM_MYSUBS_FINAL_FIX__) return;
  window.__GM_MYSUBS_FINAL_FIX__ = true;

  // Meter table matching the Builder (notice 6/8 = 12, etc.)
  const TS = {
    "2/4":{steps:8,type:"simple"},
    "3/4":{steps:12,type:"simple"},
    "4/4":{steps:16,type:"simple"},
    "5/4":{steps:20,type:"simple"},
    "6/8":{steps:12,type:"compound"},
    "7/8":{steps:14,type:"compound"},
    "9/8":{steps:18,type:"compound"},
    "12/8":{steps:24,type:"compound"}
  };
  const stepsFor = sig => (TS[sig]?.steps) || 16;

  // --- page activation (works whether you have goBuilder or showPage) ---
  function ensureBuilderActive(cb){
    if (typeof window.goBuilder === 'function') { window.goBuilder(cb); return; }
    try{
      document.querySelectorAll('.modal[aria-hidden="false"]').forEach(m=>m.setAttribute('aria-hidden','true'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-builder')?.classList.add('active');
      window.scrollTo({top:0, behavior:'instant'});
    }catch{}
    let tries=0;(function wait(){
      const ready = document.getElementById('page-builder')?.classList.contains('active')
                 && document.getElementById('m1-hat');
      if (ready || tries++>40){ try{ cb?.(); }catch{} return; }
      setTimeout(wait, 25);
    })();
  }

  // --- stop any old playback/timers and clear DOM ---
  function stopBuilderPlayback(){
    try{ window.stopPlay?.(); }catch{}
    try{ window.a_stop?.(); }catch{}
    try{ if (window.__builderTimer) { clearTimeout(window.__builderTimer); window.__builderTimer = null; } }catch{}
    try{ if (window.A_interval)    { clearTimeout(window.A_interval);    window.A_interval    = null; } }catch{}
    document.querySelectorAll('#system .playing').forEach(el=> el.classList.remove('playing'));
  }
  function hardResetBuilderDOM(){
    ['#m1-hat','#m1-snare','#m1-kick','#m1-label',
     '#m2-hat','#m2-snare','#m2-kick','#m2-label'].forEach(sel=>{
       const el = document.querySelector(sel); if (el) el.innerHTML = '';
     });
    const sys = document.getElementById('system'); if (sys) sys.classList.remove('two');
    const m2  = document.getElementById('m2');     if (m2)  m2.style.display = 'none';
  }

  // --- painters with data-col (so playhead + DOM fallback work) ---
  function decodeRow(str, kind){
    return String(str||'').split('').map(ch => {
      if (kind==='H') return ch==='3' ? 'x>' : ch==='2' ? 'O' : ch==='1' ? 'x' : '';
      if (kind==='S') return ch==='2' ? '(●)' : ch==='1' ? '●' : '';
      if (kind==='K') return ch==='1' ? '●' : '';
      return '';
    });
  }
  function paintRow(sel, vals){
    const row = document.querySelector(sel); if (!row) return;
    row.innerHTML = '';
    vals.forEach((tok, i) => {
      const c = document.createElement('div');
      c.className = 'cell';
      c.setAttribute('data-col', String(i));
      c.textContent = tok;
      row.appendChild(c);
    });
  }
  function paintLabels(sel, sig, steps){
    const row = document.querySelector(sel); if (!row) return;
    const denom8 = /\/8$/.test(sig);
    row.innerHTML = '';
    for (let i=0;i<steps;i++){
      const c = document.createElement('div');
      c.className = 'cell' + ((denom8 ? (i%3===0) : (i%4===0)) ? ' beat' : '');
      if (!denom8){
        const bi = Math.floor(i/4), sub = i%4;
        c.textContent = sub===0 ? (1+bi) : (sub===1?'e' : sub===2?'&' : 'a');
      } else if (i%3===0) {
        c.textContent = 1 + Math.floor(i/3);
      }
      c.setAttribute('data-col', String(i));
      row.appendChild(c);
    }
  }

  // --- build the arrays the play loop actually reads ---
  function setAudioArrays(rec){
    const steps = stepsFor(rec.timeSig || '4/4');
    const toArr = s => {
      const a=(s||'').split('').map(n=>+n||0);
      if (a.length<steps) a.push(...Array(steps-a.length).fill(0));
      return a.slice(0,steps);
    };
    window.A_SIG   = rec.timeSig || '4/4';
    window.A_STEPS = steps;
    window.A_step  = 0;
    window.A_grid  = [ toArr(rec.H),  toArr(rec.S),  toArr(rec.K) ];
    window.B_grid  = (rec.bars||1)===2 ? [ toArr(rec.H2), toArr(rec.S2), toArr(rec.K2) ] : null;
  }

  // --- prefer the approved copy (like Library) if it exists ---
  function resolveApprovedCopy(rec){
    try{
      const lib = (typeof window.allApproved === 'function')
        ? window.allApproved()
        : JSON.parse(localStorage.getItem('gm_approved_submissions') || '[]');
      if (!lib?.length) return rec;
      if (rec.slug){
        const hit = lib.find(x => x.slug === rec.slug);
        if (hit) return hit;
      }
      // loose fallback by title/artist/sig/tempo
      const norm = s => (s||'').trim().toLowerCase();
      const t = norm(rec.title), a = norm(rec.artist);
      const s = String(rec.timeSig||''), b = String(rec.tempo||'');
      return lib.find(x => norm(x.title)===t && norm(x.artist)===a &&
                            String(x.timeSig||'')===s && String(x.tempo||'')===b) || rec;
    }catch{ return rec; }
  }

  // --- single entry point we call from My Subs click ---
  function loadRecToBuilder(rec){
    if (!rec) return;
    if (rec._status === 'Approved') rec = resolveApprovedCopy(rec); // mirror Library
    ensureBuilderActive(() => {
      stopBuilderPlayback();
      hardResetBuilderDOM();

      const sig   = rec.timeSig || '4/4';
      const steps = stepsFor(sig);

      // bar 1
      paintLabels('#m1-label', sig, steps);
      paintRow('#m1-hat',   decodeRow(rec.H,  'H').slice(0,steps));
      paintRow('#m1-snare', decodeRow(rec.S,  'S').slice(0,steps));
      paintRow('#m1-kick',  decodeRow(rec.K,  'K').slice(0,steps));

      // bar 2 (if present)
      const isTwo = (rec.bars||1)===2;
      const sys = document.getElementById('system');
      const m2  = document.getElementById('m2');
      if (isTwo && m2){
        if (sys) sys.classList.add('two');
        m2.style.display = '';
        paintLabels('#m2-label', sig, steps);
        paintRow('#m2-hat',   decodeRow(rec.H2, 'H').slice(0,steps));
        paintRow('#m2-snare', decodeRow(rec.S2, 'S').slice(0,steps));
        paintRow('#m2-kick',  decodeRow(rec.K2, 'K').slice(0,steps));
      }

      setAudioArrays(rec);              // <-- the part that fixes playback
      const sEl = document.getElementById('sig');   if (sEl) sEl.value = sig;
      const tEl = document.getElementById('tempo'); if (tEl) tEl.value = rec.tempo || 100;
      
    });
  }

  // --- capture-phase handler that beats/blocks the old ones ---
  function onRowClick(e){
    const row = e.target.closest('#mySubs .admin-item');
    if (!row) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

    // figure out index regardless of markup
    const host = document.getElementById('mySubs');
    const rows = Array.from(host.querySelectorAll('.admin-item'));
    const i = rows.indexOf(row);
    const rec = (window.__MY_SUBS || [])[i];
    if (rec) loadRecToBuilder(rec);
  }
  function onRowKey(e){
    if (e.key!=='Enter' && e.key!==' ') return;
    const row = e.target.closest('#mySubs .admin-item');
    if (!row) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

    const host = document.getElementById('mySubs');
    const rows = Array.from(host.querySelectorAll('.admin-item'));
    const i = rows.indexOf(row);
    const rec = (window.__MY_SUBS || [])[i];
    if (rec) loadRecToBuilder(rec);
  }

  function wireMySubs(){
    const host = document.getElementById('mySubs');
    if (!host || host.__gmRowLoaderBound) return;
    host.__gmRowLoaderBound = true;

    // hide legacy "Load to Grid" buttons inside My Subs
    host.querySelectorAll('[data-load]').forEach(el=>el.remove());

    // capture-phase listeners beat older bubbling handlers
    host.addEventListener('click',   onRowClick, true);
    host.addEventListener('keydown', onRowKey,   true);
  }

  // wire after renders + on account page activation
  const prevRender = window.renderMySubs;
  window.renderMySubs = function(){
    const r = prevRender?.apply(this, arguments);
    setTimeout(wireMySubs, 0);
    return r;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=> setTimeout(wireMySubs,0));
  } else {
    setTimeout(wireMySubs,0);
  }
})();
/* ==== ACCENTS FIX: Re-tag beat columns after any grid repaint ==== */
(() => {
  // Your desired accents by signature (1-based beat numbers)
  const ACCENT_BEATS = {
    '2/4':  [1,2],
    '3/4':  [1,2,3],
    '4/4':  [1,2,3,4],
    '5/4':  [1,2,3,4,5],      // sensible default
    '5/8':  [1,3],            // your specified group (2+3)
    '6/8':  [1,4],            // 1 & 4
    '7/8':  [1,3,5],          // 1,3,5 (2+2+3)
    '9/8':  [1,4,7],          // 1,4,7
    '12/8': [1,4,7,10],       // 1,4,7,10
  };

  // Turn those beat numbers into zero-based column indexes
  function accentColsFor(sig, steps) {
    // Fallback: try to read denominator from sig; if missing, infer from steps
    const m = String(sig||'4/4').match(/^(\d+)\s*\/\s*(\d+)$/);
    const num = m ? +m[1] : 4;
    const den = m ? +m[2] : 4;

    // known beats for this signature, or best-effort default
    const beats = ACCENT_BEATS[sig] || (
      den === 4 ? Array.from({length:num}, (_,i)=> i+1) :
      den === 8 ? (num===7 ? [1,3,5] : num===5 ? [1,3] : Array.from({length:Math.max(2, Math.round(num/3))}, (_,i)=> 1 + i*3))
                : [1]
    );

    // Map beats → columns:
    // - /4: each beat is 4 columns (1=e, & , a) → 0,4,8,12...
    // - /8: grid is one column per 8th → 0-based beat numbers (6/8: 0 and 3, etc.)
    if (den === 4) return beats.map(b => (b-1)*4).filter(i => i < steps);
    if (den === 8) return beats.map(b => (b-1)).filter(i => i < steps);

    // fallback
    return [0];
  }

  function clearBeatClasses(root) {
    root.querySelectorAll('.cell.beat, .cell.beat-col').forEach(el => {
      el.classList.remove('beat'); el.classList.remove('beat-col');
    });
  }

  function addBeatClassesForMeasure(measureRoot, cols) {
    if (!measureRoot) return;
    const label = measureRoot.querySelector('.label, #m1-label, #m2-label') || measureRoot.querySelector('[id$="-label"]');
    const hat   = measureRoot.querySelector('.hat,   #m1-hat,   #m2-hat')   || measureRoot.querySelector('[id$="-hat"]');
    const snr   = measureRoot.querySelector('.snare, #m1-snare, #m2-snare') || measureRoot.querySelector('[id$="-snare"]');
    const kick  = measureRoot.querySelector('.kick,  #m1-kick,  #m2-kick')  || measureRoot.querySelector('[id$="-kick"]');

    cols.forEach(i => {
      label?.querySelectorAll('.cell')[i]?.classList.add('beat');
      hat  ?.querySelectorAll('.cell')[i]?.classList.add('beat-col');
      snr  ?.querySelectorAll('.cell')[i]?.classList.add('beat-col');
      kick ?.querySelectorAll('.cell')[i]?.classList.add('beat-col');
    });
  }

  function applyAccents(sig) {
    const steps = document.querySelectorAll('#m1-hat .cell').length || 16;
    const cols  = accentColsFor(sig, steps);

    const root  = document.getElementById('page-builder') || document;
    clearBeatClasses(root);

    // bar 1
    const m1 = document.getElementById('m1') || root;
    addBeatClassesForMeasure(m1, cols);

    // bar 2 (only if visible)
    const m2 = document.getElementById('m2');
    if (m2 && getComputedStyle(m2).display !== 'none') addBeatClassesForMeasure(m2, cols);
  }

  // —— wires: run when builder is visible, when sig changes, or when grid repaints ——
  function currentSig() {
    return (document.getElementById('sig')?.value) || '4/4';
  }

  function tryApply() { applyAccents(currentSig()); }

  // on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryApply);
  } else {
    tryApply();
  }

  // when switching pages (if you use showPage/goBuilder)
  const _show = window.showPage;
  window.showPage = function(id) {
    const r = _show?.apply(this, arguments);
    if (id === 'page-builder') setTimeout(tryApply, 0);
    return r;
  };

  // when time signature changes
  document.getElementById('sig')?.addEventListener('change', tryApply);

  // when grid is repainted (My Submissions / Library loads)
  const mo = new MutationObserver(() => tryApply());
  const system = document.getElementById('system') || document.body;
  mo.observe(system, { childList: true, subtree: true });
})();
/* ==== MY SUBMISSIONS → RELIABLE LOAD (uses Library when possible; else simulates clicks) ==== */
(() => {
  if (window.__GM_MY_SUBS_ROUTER__) return;
  window.__GM_MY_SUBS_ROUTER__ = true;

  // Steps per signature matching your Builder UI (note 6/8 = 12)
  const TS_STEPS = { "2/4":8, "3/4":12, "4/4":16, "5/4":20, "6/8":12, "7/8":14, "9/8":18, "12/8":24 };

  const norm = s => (s||'').trim().toLowerCase();

  // --- 1) Try to load via Library (identical behavior to your “Load” buttons) ---
  function tryLibraryRoute(rec){
    if (!rec) return false;
    const slug = rec.slug && String(rec.slug).trim();
    if (slug) {
      const btn = document.querySelector(`#libGrid [data-load-slug="${CSS.escape(slug)}"]`);
      if (btn) { btn.click(); return true; }
    }
    // fallback: find by title+artist (Approved copy may have slug the pending doesn’t)
    const title = norm(rec.title), artist = norm(rec.artist);
    const cards = [...document.querySelectorAll('#libGrid .lib-card')];
    for (const card of cards){
      const t = norm(card.querySelector('h4,.title,[data-title]')?.textContent);
      const a = norm(card.querySelector('.lib-meta .artist,[data-artist]')?.textContent || card.querySelector('.lib-meta')?.textContent);
      if (t && a && t===title && a.includes(artist)){
        card.querySelector('[data-load-slug]')?.click();
        return true;
      }
    }
    return false;
  }

  // --- 2) If not in Library (Pending items), simulate clicks so the module updates its arrays ---
  function showBuilder(cb){
    // Prefer your own router if present
    if (typeof window.showPage === 'function') window.showPage('page-builder');
    document.querySelectorAll('.page').forEach(p=> p.classList.remove('active'));
    document.getElementById('page-builder')?.classList.add('active');
    // wait until grid rows exist
    let tries=0;(function wait(){
      const ok = document.getElementById('m1-hat') && document.getElementById('m1-snare') && document.getElementById('m1-kick');
      if (ok || tries++>40) { cb?.(); return; }
      setTimeout(wait, 20);
    })();
  }

  function eventClick(el){
    if (!el) return;
    // simulate a real user click so the existing listeners (inside your module) fire
    el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
  }

  function setSigTempo(sig, tempo){
    const sigEl = document.getElementById('sig');
    if (sigEl) { sigEl.value = sig; sigEl.dispatchEvent(new Event('change', {bubbles:true})); }
    const tEl = document.getElementById('tempo');
    if (tEl) { tEl.value = String(tempo||'100'); tEl.dispatchEvent(new Event('input', {bubbles:true})); }
  }

  function setBars(bars){
    const m2 = document.getElementById('m2');
    const two = bars === 2;
    if (two && m2 && getComputedStyle(m2).display === 'none') eventClick(document.getElementById('addBarBtn'));
    if (!two && m2 && getComputedStyle(m2).display !== 'none') eventClick(document.getElementById('removeBarBtn'));
  }

  function currentToken(cell){
    const t = (cell?.textContent||'').trim();
    return t; // '', 'x', 'x>', 'O', '●', '(●)'
  }
  function targetToken(kind, ch){
    if (kind==='H') return ch==='3' ? 'x>' : ch==='2' ? 'O' : ch==='1' ? 'x' : '';
    if (kind==='S') return ch==='2' ? '(●)' : ch==='1' ? '●' : '';
    if (kind==='K') return ch==='1' ? '●' : '';
    return '';
  }

  function cellByIndex(rowSel, i){
    // Prefer data-col if you’ve got it; fall back to nth cell
    return document.querySelector(`${rowSel} .cell[data-col="${i}"]`) ||
           document.querySelectorAll(`${rowSel} .cell`)[i] || null;
  }

  function clickToMatch(cell, kind, want){
    if (!cell) return;
    // Cycles:
    // H: '' → 'x' → 'x>' → 'O' → ''
    // S: '' → '●' → '(●)' → ''
    // K: '' ↔ '●'
    const limit = (kind==='H') ? 4 : (kind==='S') ? 3 : 2;
    let n=0;
    while (currentToken(cell) !== want && n++ < limit){
      eventClick(cell);
    }
  }

  function paintBar(prefix, steps, H, S, K){
    for (let i=0;i<steps;i++){
      clickToMatch(cellByIndex(`#${prefix}-hat`,   i), 'H', targetToken('H', (H||'')[i]||'0'));
      clickToMatch(cellByIndex(`#${prefix}-snare`, i), 'S', targetToken('S', (S||'')[i]||'0'));
      clickToMatch(cellByIndex(`#${prefix}-kick`,  i), 'K', targetToken('K', (K||'')[i]||'0'));
    }
  }

  function simulateBuilderLoad(rec){
    const sig   = rec.timeSig || '4/4';
    const tempo = rec.tempo   || '100';
    const steps = TS_STEPS[sig] || 16;
    showBuilder(() => {
      // reset (use your existing button so the module clears internal arrays/state)
      eventClick(document.getElementById('trashBtn'));
      setSigTempo(sig, tempo);
      setBars((rec.bars||1));

      paintBar('m1', steps, rec.H,  rec.S,  rec.K);
      if ((rec.bars||1)===2) paintBar('m2', steps, rec.H2, rec.S2, rec.K2);

      // push accents again if you style them – optional
      try { document.getElementById('sig')?.dispatchEvent(new Event('change', {bubbles:true})); } catch {}
      (window.toast||console.log)(`Loaded "${rec.title||'groove'}"`, 'info');
    });
  }

  // --- 3) Find the record the user clicked in My Submissions ---
  function readStorage(){
    let pend=[], appr=[];
    try { pend = JSON.parse(localStorage.getItem('gm_pending_submissions')||'[]')||[]; } catch {}
    try { appr = JSON.parse(localStorage.getItem('gm_approved_submissions')||'[]')||[]; } catch {}
    return { pend, appr };
  }
  function parseRow(row){
    const title = row.querySelector('.t, strong, .title,[data-title]')?.textContent?.trim() || '';
    const meta  = row.textContent || '';
    const sig   = (meta.match(/(\d+\/\d+)/)||[])[1] || '';
    const tempo = (meta.match(/(\d+)\s*bpm/i)||[])[1] || '';
    // try to extract artist if it’s shown on the row
    let artist = '';
    const aEl = row.querySelector('.sub,[data-artist]');
    if (aEl) {
      const raw = aEl.getAttribute('data-artist') || aEl.textContent || '';
      artist = raw.split('•')[0].trim();
    }
    return { title, artist, sig, tempo };
  }
  function findRecordFromRow(row){
    const { pend, appr } = readStorage();
    const p = parseRow(row);
    const t = norm(p.title), a = norm(p.artist);
    const s = String(p.sig||''), b = String(p.tempo||'');
    // best shot: match title+artist+sig+tempo
    const hitA = appr.find(x => norm(x.title)===t && norm(x.artist)===a && String(x.timeSig||'')===s && String(x.tempo||'')===b);
    if (hitA) { hitA._status='Approved'; return hitA; }
    const hitP = pend.find(x => norm(x.title)===t && norm(x.artist)===a && String(x.timeSig||'')===s && String(x.tempo||'')===b);
    if (hitP) { hitP._status='Pending'; return hitP; }
    // relax matching if artist not present on row
    const hitA2 = appr.find(x => norm(x.title)===t && String(x.timeSig||'')===s && String(x.tempo||'')===b);
    if (hitA2){ hitA2._status='Approved'; return hitA2; }
    const hitP2 = pend.find(x => norm(x.title)===t && String(x.timeSig||'')===s && String(x.tempo||'')===b);
    if (hitP2){ hitP2._status='Pending'; return hitP2; }
    return null;
  }

  // --- 4) Capture My Submissions clicks, route them properly ---
  function onMySubsClick(e){
    const row = e.target.closest('#mySubs .admin-item, #mySubs .card, #mySubs [data-sub-row]');
    if (!row) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

    const rec = findRecordFromRow(row);
    if (!rec) { (window.toast||console.log)('Could not resolve submission record','warn'); return; }

    // If the groove is approved and visible in Library, use Library’s own loader.
    if (rec._status==='Approved' && tryLibraryRoute(rec)) return;

    // Otherwise simulate clicks so the module sets its own arrays.
    simulateBuilderLoad(rec);
  }

  function wire(){
    const host = document.getElementById('mySubs');
    if (!host || host.__gmMySubsRouted) return;
    host.__gmMySubsRouted = true;
    // kill any “Load to Grid” button inside My Subs so we own the flow
    host.querySelectorAll('[data-load],[data-load-to-grid]').forEach(el=> el.remove());
    // capture-phase to beat any older listeners
    host.addEventListener('click', onMySubsClick, true);
    host.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') onMySubsClick(e); }, true);
  }

  // wire now and after My Subs re-renders
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else setTimeout(wire, 0);

  // If you have a renderMySubs() function, hook it to re-wire
  const prev = window.renderMySubs;
  window.renderMySubs = function(){ const r = prev?.apply(this, arguments); setTimeout(wire,0); return r; };
})();
/* =============================
   1) LIBRARY "×" → delete everywhere
   - Removes from Approved & Pending storage
   - Adds masks so it stays gone even if re-seeded
   - Scrubs Library, Search results, and My Submissions DOM
============================= */
(() => {
  const KEYS = {
    APPROVED: 'gm_approved_submissions',
    PENDING:  'gm_pending_submissions',
    USERS:    'gm_users',
    SESSION:  'gm_session',
    MASK_SLUGS: 'gm_deleted_slugs',
    MASK_TA:    'gm_deleted_ta'
  };
  const read  = (k,f)=>{ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? f; }catch{ return f; } };
  const write = (k,v)=> localStorage.setItem(k, JSON.stringify(v));
  const norm  = s => (s||'').trim().toLowerCase();
  const keyTA = (t,a)=> `${norm(t)}|${norm(a)}`;

  function loadMasks(){
    return {
      slugs: new Set(read(KEYS.MASK_SLUGS,[])),
      ta:    new Set(read(KEYS.MASK_TA,[]))
    };
  }
  function saveMasks(m){
    write(KEYS.MASK_SLUGS, [...m.slugs]);
    write(KEYS.MASK_TA,    [...m.ta]);
  }

  function grooveIdentityFromCard(card){
    const slug   = (card?.querySelector('[data-load-slug]')?.getAttribute('data-load-slug')
                 || card?.getAttribute('data-slug') || '').trim();
    const title  = (card?.querySelector('h4,.title,[data-title]')?.textContent || '').trim();
    // try a few spots for artist
    const meta   = card?.querySelector('.lib-meta,[data-artist]')?.textContent || '';
    const artist = (card?.querySelector('[data-artist]')?.getAttribute('data-artist')
                 || meta.split('•')[0] || '').trim();
    return { slug, title, artist };
  }

  function deleteFromStorage({slug, title, artist}){
    const ta = keyTA(title, artist);
    // 1) Approved
    let approved = read(KEYS.APPROVED, []);
    approved = approved.filter(g => {
      if (slug && (g.slug||'') === slug) return false;
      if (ta && keyTA(g.title,g.artist) === ta) return false;
      return true;
    });
    write(KEYS.APPROVED, approved);
    // 2) Pending (defense-in-depth: if something was still pending with same TA)
    let pending = read(KEYS.PENDING, []);
    pending = pending.filter(g => keyTA(g.title,g.artist) !== ta);
    write(KEYS.PENDING, pending);
  }

  function addDeletionMasks({slug, title, artist}){
    const masks = loadMasks();
    if (slug) masks.slugs.add(norm(slug));
    const ta = keyTA(title, artist);
    if (ta) masks.ta.add(norm(ta));
    saveMasks(masks);
  }

  function applyMasksInDOM(){
    const masks = loadMasks();
    const kill = (rootSel, cardSel) => {
      const root = document.querySelector(rootSel);
      if (!root) return;
      root.querySelectorAll(cardSel).forEach(card => {
        const { slug, title, artist } = grooveIdentityFromCard(card);
        const ta = keyTA(title, artist).toLowerCase();
        if ((slug && masks.slugs.has(slug.toLowerCase())) || (ta && masks.ta.has(ta))) card.remove();
      });
    };
    kill('#libGrid', '.lib-card, .card');     // Library
    kill('#results', '.card');                // Builder search results
    kill('#mySubs',  '.admin-item, .card');   // My Submissions
  }

  function guardLoads(){
    const masks = loadMasks();
    // Block any future attempts to load deleted grooves by slug or TA key
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-load-slug], [data-load], button, a');
      if (!btn) return;
      const card = btn.closest('.lib-card, .card, .admin-item') || document;
      const { slug, title, artist } = grooveIdentityFromCard(card);
      const ta = keyTA(title, artist).toLowerCase();
      if ((slug && masks.slugs.has(slug.toLowerCase())) || (ta && masks.ta.has(ta))) {
        e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
        (window.toast||console.log)('This groove has been deleted.', 'warn');
      }
    }, true);
  }

  // Wire your existing "×" in Library (whatever selector you use)
  function wireLibraryDelete(){
    const grid = document.getElementById('libGrid');
    if (!grid || grid.__gmDeleteEverywhereBound) return;
    grid.__gmDeleteEverywhereBound = true;

    grid.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-del], .lib-card .icon-btn, .lib-card .delete, .card .icon-btn');
      if (!btn) return;
      const card = btn.closest('.lib-card, .card');
      if (!card) return;

      const id = grooveIdentityFromCard(card);
      if (!id.title && !id.slug) return;

      if (!confirm(`Delete “${id.title || id.slug}” from the Library? This removes it everywhere.`)) return;

      deleteFromStorage(id);
      addDeletionMasks(id);

      // Remove card now + scrub other surfaces
      card.remove();
      applyMasksInDOM();

      (window.toast||console.log)('Deleted everywhere.', 'ok');
    });
  }

  // run now + keep scrubbing surfaces if they re-render
  function init(){
    wireLibraryDelete();
    guardLoads();
    applyMasksInDOM();
    new MutationObserver(() => applyMasksInDOM())
      .observe(document.body, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
/* =============================
   MY SUBMISSIONS — select mode (right-side checks, Cancel left)
   - Select All → shows Clear All + Cancel
   - Delete appears only after a box is checked
   - Cancel returns to default
   - Checkbox clicks don't trigger row load
============================= */
(() => {
  const KEYS = {
    SESSION: 'gm_session',
    HIDDEN_PREFIX: 'gm_user_hidden_subs:' // + email
  };
  const read  = (k,f)=>{ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? f; }catch{ return f; } };
  const write = (k,v)=> localStorage.setItem(k, JSON.stringify(v));
  const norm  = s => (s||'').trim().toLowerCase();
  const keyTA = (t,a)=> `${norm(t)}|${norm(a)}`;
  const me = ()=> (read(KEYS.SESSION,null)?.email || '__anon__');
  const hiddenKey = ()=> `${KEYS.HIDDEN_PREFIX}${me()}`;

  const host = ()=> document.getElementById('mySubs');
  const rows = ()=> Array.from(host()?.querySelectorAll('.admin-item, .card, [data-sub-row]') || []);
  const hideSet = ()=> new Set(read(hiddenKey(), []));
  const saveHideSet = set => write(hiddenKey(), [...set]);

  const rowIdentity = row => {
    const title  = (row.querySelector('.t, strong, .title, [data-title]')?.textContent || '').trim();
    const artist = (row.querySelector('[data-artist]')?.getAttribute('data-artist')
                 || row.querySelector('.sub')?.textContent || '').split('•')[0].trim();
    const slug   = (row.getAttribute('data-slug') || '').trim().toLowerCase();
    return { title, artist, slug, ta: keyTA(title, artist) };
  };

  function applyUserHidden(){
    const h = host(); if (!h) return;
    const hidden = hideSet();
    rows().forEach(row=>{
      const id = rowIdentity(row);
      if (!id.title && !id.slug) return;
      if (hidden.has(id.slug) || hidden.has(id.ta)) row.remove();
    });
  }

  function ensureToolbar(){
    const h = host(); if (!h || h.__gmSelectModeBound) return;

    const bar = document.createElement('div');
    bar.className = 'mySubs-toolbar';
    bar.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin:8px 0;';

    const btnSelect = document.createElement('button');
    btnSelect.className = 'btn small';
    btnSelect.textContent = 'Select All';

    const btnClear = document.createElement('button');
    btnClear.className = 'btn small outline';
    btnClear.textContent = 'Clear All';
    btnClear.style.display = 'none';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn small';
    btnCancel.textContent = 'Cancel';
    btnCancel.style.display = 'none';
    // style + place Cancel on the LEFT
    btnCancel.style.background = '#000';
    btnCancel.style.color = '#fff';
    btnCancel.style.borderColor = '#000';

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn small danger';
    btnDelete.textContent = 'Delete';
    btnDelete.style.display = 'none';

    // Cancel | spacer | Select/Clear/Delete (right group)
    // NEW (everything on the right; spacer sits on the left)
    bar.append(spacer, btnSelect, btnClear, btnCancel, btnDelete);

    h.parentNode.insertBefore(bar, h);

    const inSelectMode = () => btnClear.style.display !== 'none';
    const anyChecked   = () => !!h.querySelector('.ms-check:checked');

    function injectCheckbox(row){
      if (!row || row.querySelector('.ms-check')) return;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'ms-check';
      box.style.cssText = 'position:absolute; right:10px; top:50%; transform:translateY(-50%); margin:0;';
      const cs = getComputedStyle(row);
      if (cs.position === 'static') row.style.position = 'relative';
      if ((parseInt(cs.paddingRight||'0',10)) < 46) row.style.paddingRight = '46px';
      row.appendChild(box);
    }

    function setSelectMode(on){
      btnSelect.style.display = on ? 'none' : '';
      btnClear.style.display  = on ? '' : 'none';
      btnCancel.style.display = on ? '' : 'none';
      // Delete stays hidden until a box is checked
      btnDelete.style.display = (on && anyChecked()) ? '' : 'none';

      h.querySelectorAll('.ms-check').forEach(c=> c.remove());
      if (on) rows().forEach(injectCheckbox);
    }

    function resetDefault(){ setSelectMode(false); }

    btnSelect.addEventListener('click', ()=> setSelectMode(true));
    btnCancel.addEventListener('click', resetDefault);

    btnClear.addEventListener('click', ()=>{
      if (!inSelectMode()) setSelectMode(true);
      const boxes = Array.from(h.querySelectorAll('.ms-check'));
      if (!boxes.length) return;
      boxes.forEach(b=> b.checked = true);
      if (!confirm('Clear All submissions from your list?')) { boxes.forEach(b=> b.checked=false); return; }
      const hidden = hideSet();
      rows().forEach(row=>{
        const id = rowIdentity(row);
        if (id.slug) hidden.add(id.slug.toLowerCase());
        if (id.ta)   hidden.add(id.ta.toLowerCase());
        row.remove();
      });
      saveHideSet(hidden);
      resetDefault();
      (window.toast||console.log)('Cleared All.', 'ok');
    });

    btnDelete.addEventListener('click', ()=>{
      const boxes = Array.from(h.querySelectorAll('.ms-check:checked'));
      if (!boxes.length) return;
      if (!confirm(`Delete ${boxes.length} selected from your list?`)) return;
      const hidden = hideSet();
      boxes.forEach(b=>{
        const row = b.closest('.admin-item, .card, [data-sub-row]');
        const id = rowIdentity(row);
        if (id.slug) hidden.add(id.slug.toLowerCase());
        if (id.ta)   hidden.add(id.ta.toLowerCase());
        row.remove();
      });
      saveHideSet(hidden);
      // stay in select mode; update Delete visibility
      btnDelete.style.display = anyChecked() ? '' : 'none';
      (window.toast||console.log)('Selection Deleted.', 'ok');
    });

    // Show/Hide "Delete" based on first selection
    h.addEventListener('change', (e)=>{
      if (!inSelectMode()) return;
      if (e.target && e.target.classList && e.target.classList.contains('ms-check')) {
        btnDelete.style.display = anyChecked() ? '' : 'none';
      }
    }, true);

    // prevent checkbox clicks from loading grooves
    document.addEventListener('click', (e)=>{
      if (!e.target.closest('#mySubs')) return;
      const el = e.target;
      if (el.classList?.contains('ms-check') || el.closest?.('input[type="checkbox"], [role="checkbox"]')) {
        e.stopImmediatePropagation();
        e.stopPropagation();
      }
    }, true);
    document.addEventListener('keydown', (e)=>{
      if (!e.target.closest('#mySubs')) return;
      if ((e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') &&
          (e.target.classList?.contains('ms-check') || e.target.closest?.('input[type="checkbox"], [role="checkbox"]'))) {
        e.stopImmediatePropagation();
        e.stopPropagation();
      }
    }, true);

    // keep masks applied; maintain select-mode UI on mutations
    new MutationObserver(() => {
      applyUserHidden();
      if (inSelectMode()) rows().forEach(injectCheckbox);
      btnDelete.style.display = (inSelectMode() && anyChecked()) ? '' : 'none';
    }).observe(h, { childList:true, subtree:true });

    // initial
    applyUserHidden();
    resetDefault();

    // expose reset for page-show
    h.__gmResetSelectUI = resetDefault;
    h.__gmSelectBoundBtns = { btnSelect, btnClear, btnCancel, btnDelete };
    h.__gmSelectModeBound = true;
  }

  function init(){
    ensureToolbar();
    applyUserHidden();
    // default view on first load if Account already open
    const h = host();
    if (h && typeof h.__gmResetSelectUI === 'function') h.__gmResetSelectUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // always reset to default when navigating to Account
  const _show = window.showPage;
  window.showPage = function(id){
    const r = _show?.apply(this, arguments);
    if (id === 'page-account') setTimeout(()=>{ ensureToolbar(); applyUserHidden(); host()?.__gmResetSelectUI?.(); }, 0);
    return r;
  };
})();
/* === My Subs: live counts that handle data-cat="song"/"pattern" === */
(() => {
  const host = () => document.getElementById('mySubs');

  // Tweak this if you have a better flag for patterns:
  const isPatternRow = (row) => {
    if (!row) return false;
    if (row.matches?.('[data-kind="pattern"],[data-type="pattern"],.is-pattern,.pattern')) return true;
    const hint = `${row.getAttribute('data-kind')||''} ${row.getAttribute('data-type')||''} ${row.textContent||''}`.toLowerCase();
    return /\bpattern(s)?\b/.test(hint);
  };

  // Grab chips by data-cat OR by text (“All”, “Songs”, “Patterns”)
  function findBuckets(){
    const root = document.getElementById('page-account') || document;
    const sels = ['[data-cat]', '.chip', '.pill', '.tab', '[role="tab"]', '.filters button', '.filter button', '.btn'].join(',');
    const B = { all: [], song: [], songs: [], pattern: [], patterns: [] };
    root.querySelectorAll(sels).forEach(el => {
      const dc = el.getAttribute('data-cat')?.toLowerCase();
      if (dc && (dc in B)) { B[dc].push(el); return; }
      const t = (el.textContent||'').replace(/\(\s*\d+\s*\)\s*$/,'').trim().toLowerCase();
      if (t.startsWith('all')) B.all.push(el);
      else if (t.startsWith('song')) B.songs.push(el);     // “Song” or “Songs”
      else if (t.startsWith('pattern')) B.patterns.push(el);
    });
    return B;
  }

  function setCount(els, labelText, n){
    els.forEach(el => {
      const base = el.getAttribute('data-base') || labelText;
      el.setAttribute('data-base', base);
      const badge = el.querySelector('.count, .badge, [data-count]');
      if (badge) {
        // ensure base + count
        // replace existing first text node with base
        if (!el.textContent.toLowerCase().startsWith(base.toLowerCase())) {
          if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = base + ' ';
        }
        badge.textContent = `(${n})`;
      } else {
        el.innerHTML = `${base} <span class="count">(${n})</span>`;
      }
    });
  }

  function updateCounts(){
    const h = host(); if (!h) return;
    const rows = Array.from(h.querySelectorAll('.admin-item, .card, [data-sub-row]'));
    const all = rows.length;
    const patterns = rows.filter(isPatternRow).length;
    const songs = all - patterns;

    const B = findBuckets();
    setCount(B.all,      'All',      all);
    setCount([...B.song, ...B.songs], 'Songs',    songs);
    setCount([...B.pattern, ...B.patterns], 'Patterns', patterns);
  }

  function init(){
    updateCounts();
    const h = host(); if (!h) return;
    if (!h.__gmCountsObs){
      h.__gmCountsObs = new MutationObserver(() => {
        clearTimeout(h.__gmCountsTick);
        h.__gmCountsTick = setTimeout(updateCounts, 0);
      });
      h.__gmCountsObs.observe(h, { childList:true, subtree:true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const _show = window.showPage;
  window.showPage = function(id){
    const r = _show?.apply(this, arguments);
    if (id === 'page-account') setTimeout(init, 0);
    return r;
  };
})();
/* === My Subs: hide "Select All" when empty; show when items exist === */
(() => {
  const host = () => document.getElementById('mySubs');

  function findBtns() {
    const bar = document.querySelector('#page-account .mySubs-toolbar');
    if (!bar) return {};
    const byText = (t) => Array.from(bar.querySelectorAll('button'))
      .find(b => new RegExp(`^\\s*${t}\\s*$`, 'i').test((b.textContent||'').trim()));
    return {
      select: byText('Select All'),
      clear:  byText('Clear All'),
      cancel: byText('Cancel'),
      del:    byText('Delete')
    };
  }

  function countRows() {
    const h = host(); if (!h) return 0;
    return h.querySelectorAll('.admin-item, .card, [data-sub-row]').length;
  }

  function exitSelectMode() {
    const { select, clear, cancel, del } = findBtns();
    // hide select mode bits, remove checkboxes
    if (clear)  clear.style.display  = 'none';
    if (cancel) cancel.style.display = 'none';
    if (del)    del.style.display    = 'none';
    host()?.querySelectorAll('.ms-check').forEach(c => c.remove());
    // show Select All only if there are items (handled by updateButton)
  }

  function updateButton() {
    const { select, clear, cancel, del } = findBtns();
    if (!select) return;

    const n = countRows();
    if (n === 0) {
      // nothing to select: hide Select All and ensure we're not in select mode
      select.style.display = 'none';
      exitSelectMode();
    } else {
      // items exist: show Select All when not in select mode
      const inSelectMode = !!(clear && clear.style.display !== 'none');
      if (!inSelectMode) select.style.display = '';
    }
  }

  function initWatcher() {
    const h = host(); if (!h || h.__gmEmptyWatch) return;
    h.__gmEmptyWatch = true;
    // react to adds/removes in the list
    new MutationObserver(() => setTimeout(updateButton, 0))
      .observe(h, { childList: true, subtree: true });
    updateButton();
  }

  // boot + whenever Account is shown
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWatcher);
  } else {
    initWatcher();
  }
  const _show = window.showPage;
  window.showPage = function(id){
    const r = _show?.apply(this, arguments);
    if (id === 'page-account') setTimeout(initWatcher, 0);
    return r;
  };
})();
/* === After clicking "Load" in Search, scroll back to the Builder grid === */
(() => {
  if (window.__GM_SCROLL_AFTER_LOAD__) return; window.__GM_SCROLL_AFTER_LOAD__ = true;

  function scrollToGrid(offset = 120) {           // <— tweak this number
  const builder = document.getElementById('page-builder');
  if (!builder) return;
  const target = document.getElementById('system') || builder;
  const y = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: y, behavior: 'smooth' });
}


  // When user clicks a "Load" inside Search, wait a tick for your loader to navigate, then scroll
  document.addEventListener('click', (e)=>{
    const loadBtn = e.target.closest('#results [data-load-slug], #results .load, #results .btn');
    if (!loadBtn) return;
    // small delay so your existing handler runs first (loads + routes)
    setTimeout(scrollToGrid, 60);
  }, true);
})();
// findByText (tiny helper; case-insensitive, partial match)
window.findByText = window.findByText || function (root, text, {selector='*', exact=false, trim=true} = {}) {
  root = root && root.nodeType ? root : document;
  const norm = s => (trim ? String(s).replace(/\s+/g,' ').trim() : String(s)).toLowerCase();
  const needle = norm(text || '');
  if (!needle) return null;
  for (const el of root.querySelectorAll(selector)) {
    const hay = norm(el.textContent || '');
    if (exact ? hay === needle : hay.includes(needle)) return el;
  }
  return null;
};

/* === Groove Catalog (source of truth) === */
(() => {
  if (window.Catalog) return;
  const ENV = (localStorage.getItem('gm_env') || 'prod').trim(); // set to 'dev' locally if you want isolation
  const K = (name) => `${ENV}:${name}`;
  const KEYS = {
    APPROVED: K('gm_approved_submissions'),
    PENDING:  K('gm_pending_submissions'),
    DEL_SLUG: K('gm_deleted_slugs'),
    DEL_TA:   K('gm_deleted_ta'),
    DEL_TIT:  K('gm_deleted_titles'),
  };
  const read = (k,f)=>{ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? f; }catch{ return f; } };
  const norm = s => (s||'').trim().toLowerCase();
  const taKey = (t,a)=> `${norm(t)}|${norm(a)}`;
  const titleKey = t => norm(String(t).replace(/[\s\-\–\—\(\)\[\]\{\}:;.,!?'"`~]+/g,' '));

  function approved(){ return read(KEYS.APPROVED, []) || []; }
  function pending(){  return read(KEYS.PENDING,  []) || []; }

  function allowSets(){
    const okS = new Set(), okTA = new Set();
    approved().forEach(g => { const s=norm(g.slug||''); if (s) okS.add(s); const ta=taKey(g.title||'', g.artist||''); if (ta) okTA.add(ta); });
    return { okS, okTA };
  }
  function deleteMasks(){
    const delS = new Set((read(KEYS.DEL_SLUG,  [])||[]).map(norm));
    const delTA= new Set((read(KEYS.DEL_TA,    [])||[]).map(norm));
    const delT = new Set((read(KEYS.DEL_TIT,   [])||[]).map(titleKey));
    return { delS, delTA, delT };
  }

  function isAllowed({slug, title, artist}){
    const s = norm(slug||''); const ta = (title&&artist) ? taKey(title,artist) : ''; const t = titleKey(title||'');
    const { okS, okTA } = allowSets();
    const { delS, delTA, delT } = deleteMasks();
    // Library wins: if in approved (by slug or TA), always allow even if title masked
    if ((s && okS.has(s)) || (ta && okTA.has(ta))) return true;
    // Otherwise, block only if explicitly deleted by slug/TA/title
    if ((s && delS.has(s)) || (ta && delTA.has(ta)) || (t && delT.has(t))) return false;
    return true;
  }

  window.Catalog = { approved, pending, isAllowed, _keys: KEYS };
})();
/* === Logout → Builder + queued submit (no header reordering) === */
(() => {
  const KEYS = { SESSION:'gm_session', QUEUE:'gm_submit_queue' };

  // ---- storage + state helpers ----
  const read  = (k,f)=>{ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? f; }catch{ return f; } };
  const write = (k,v)=> localStorage.setItem(k, JSON.stringify(v));
  const isLoggedIn = ()=> {
    try { const s = JSON.parse(localStorage.getItem(KEYS.SESSION)||'null'); return !!(s && (s.email||s.user||s.uid)); }
    catch { return false; }
  };

  // ---- element finders (use your existing buttons) ----
  const $  = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const header = ()=> $('#topbar, header, .topbar, .toolbar, nav, .nav, .header, #header') || document;

  const btnByText = (re, scope=document) =>
    $$('a,button,[role="button"]', scope).find(b => re.test((b.textContent||'').trim().toLowerCase()));

  const findLoginBtn   = ()=> btnByText(/log\s*in|sign\s*in|sign\s*up/i, header());
  const findLogoutBtn  = ()=> btnByText(/log\s*out|sign\s*out/i, header());
  const findSubmitBtn  = ()=> {
    const scope = document.getElementById('page-builder') || document;
    return (
      scope.querySelector('[data-submit], .btn-submit, #submitGroove, #submit-groove, .submit-groove') ||
      btnByText(/submit\s+groove|^submit$/i, scope)
    );
  };

  // ---- route to builder (no layout changes) ----
  function showBuilder(){
    if (typeof window.showPage === 'function') window.showPage('page-builder');
    else (document.getElementById('page-builder')||document.body).scrollIntoView({behavior:'smooth', block:'start'});
  }

  function wireLogoutRoute(){
    const out = findLogoutBtn(); if (!out || out.__gmRouteBound) return;
    out.__gmRouteBound = true;
    out.addEventListener('click', () => setTimeout(showBuilder, 50), true);
  }

  // ---- queued submit: intercept while logged out, finish after login ----
  function interceptSubmitWhenLoggedOut(){
    const root = document.getElementById('page-builder') || document;
    if (root.__gmSubmitIntercept) return; root.__gmSubmitIntercept = true;

    root.addEventListener('click', (e)=>{
      const btn = e.target.closest('button,a,[role="button"]'); if (!btn) return;
      const isSubmit =
        btn.matches?.('[data-submit], .btn-submit, #submitGroove, #submit-groove, .submit-groove') ||
        /submit\s+groove|^submit$/i.test((btn.textContent||'').trim());
      if (!isSubmit) return;

      if (!isLoggedIn()) {
        e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
        write(KEYS.QUEUE, { queuedAt: Date.now() });
        (window.toast||console.log)('Please log in to submit — I’ll finish it right after you sign in.', 'info');
        // nudge login UI if you have a button
        try { const login = findLoginBtn(); login && login.click(); } catch {}
      }
    }, true);
  }

  function processQueuedSubmitAfterLogin(){
    const q = read(KEYS.QUEUE, null); if (!q) return;
    localStorage.removeItem(KEYS.QUEUE); // clear first to avoid doubles

    // Make sure Builder is visible, then "press" your existing Submit button
    showBuilder();
    const clickWhenReady = (tries=0)=>{
      const btn = findSubmitBtn();
      if (btn) {
        (window.toast||console.log)('Thanks for the Killer Groove.', 'ok');
        try { btn.click(); } catch {}
        return;
      }
      if (tries < 60) setTimeout(()=>clickWhenReady(tries+1), 50);
    };
    setTimeout(clickWhenReady, 120);
  }

  // ---- state sync (no header movement) ----
  let last = isLoggedIn();
  function sync(){
    const now = isLoggedIn();
    interceptSubmitWhenLoggedOut();
    wireLogoutRoute();

    // transition handling
    if (now !== last) {
      if (now) processQueuedSubmitAfterLogin(); // just logged in → finish queued submit
      else     showBuilder();                   // just logged out → go to builder
    }
    last = now;
  }

  // boot + watch
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();

  new MutationObserver(()=> sync()).observe(document.body, { childList:true, subtree:true });

  const _show = window.showPage;
  window.showPage = function(id){ const r = _show?.apply(this, arguments); setTimeout(sync, 0); return r; };

  // safety poll in case session changes without DOM mutations
  setInterval(()=> { const now = isLoggedIn(); if (now !== last) sync(); }, 800);
})();

/* === A) HARD route to Page-builder when user logs out === */
(() => {
  const KEY = 'gm_session';

  const isIn  = () => { try { const s=JSON.parse(localStorage.getItem(KEY)||'null'); return !!(s && (s.email||s.uid||s.user)); } catch { return false; } };
  const pages = () => Array.from(document.querySelectorAll('.page,[data-page]'));

  function forceBuilderView() {
    const id = 'page-builder';
    if (typeof window.showPage === 'function') {
      try { window.showPage(id); } catch {}
    }
    // manual fallback: flip classes
    const t = document.getElementById(id);
    if (t) {
      pages().forEach(p => p.classList && p.classList.remove('active'));
      t.classList.add('active');
      // optional: set hash so your own router picks it up
      try { history.replaceState(null, '', '#builder'); } catch {}
      // make sure user actually sees it
      setTimeout(()=> t.scrollIntoView({behavior:'smooth', block:'start'}), 0);
    }
  }

  // 1) Click on any logout button → after session clears, route hard
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('a,button,[role="button"]');
    if (!btn) return;
    const txt = (btn.textContent||'').toLowerCase();
    const looksLogout = btn.matches?.('[data-logout],.logout,.btn-logout') || /\blog\s*out|sign\s*out\b/.test(txt);
    if (!looksLogout) return;

    const wasIn = isIn();
    setTimeout(() => {
      // poll briefly in case your logout clears storage async
      let tries = 0;
      (function waitGone(){
        const nowIn = isIn();
        if ((!nowIn && wasIn) || tries++ > 40) return forceBuilderView();
        setTimeout(waitGone, 40);
      })();
    }, 0);
  }, true);

  // 2) Also poll for session flips (covers programmatic logout)
  let last = isIn();
  setInterval(() => {
    const now = isIn();
    if (last && !now) forceBuilderView(); // just went from in → out
    last = now;
  }, 400);
})();
/* ===========================
   Pending Grooves — SONGS ONLY
   - No "type/kind" checks anywhere
   - Any stray patterns in Pending are auto-moved to Library
   - Load → Builder (correct groove)
   - Approve → Library, Reject/Delete → remove + mask
   - Live counts
=========================== */
(() => {
  const KEYS = {
    PENDING:  'gm_pending_submissions',    // songs waiting approval
    APPROVED: 'gm_approved_submissions',   // library (songs + patterns)
    MASK_SLUG:'gm_deleted_slugs',
    MASK_TA:  'gm_deleted_ta',
    MASK_TIT: 'gm_deleted_titles'
  };

  // ---------- utils ----------
  const read  = (k,f)=>{ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? f; }catch{ return f; } };
  const write = (k,v)=> localStorage.setItem(k, JSON.stringify(v));
  const norm  = s => (s||'').trim().toLowerCase();
  const taKey = (t,a)=> `${norm(t)}|${norm(a)}`;
  const titleKey = t => norm(String(t).replace(/[\s\-\–\—\(\)\[\]\{\}:;.,!?'"`~]+/g,' '));
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));

  const pending  = ()=> read(KEYS.PENDING,  []) || [];
  const approved = ()=> read(KEYS.APPROVED, []) || [];
  const savePending  = arr => write(KEYS.PENDING,  arr||[]);
  const saveApproved = arr => write(KEYS.APPROVED, arr||[]);

  function masksAdd({slug,title,artist}){
    const add = (key, val, xform=(x)=>x) => {
      const set = new Set((read(key,[])||[]).map(xform));
      if (val) { set.add(xform(val)); write(key, [...set]); }
    };
    if (slug)  add(KEYS.MASK_SLUG, norm(slug));
    if (title || artist) add(KEYS.MASK_TA,   taKey(title||'', artist||''));
    if (title) add(KEYS.MASK_TIT,  titleKey(title||''));
  }

  // ---------- find pending UI + ids ----------
  const pendingRoot = () =>
    $('#pendingList') || $('#pending, #page-account #pending, #page-builder #pending') ||
    $('#page-account') || document;

  function rowId(row){
    const slug = (row.getAttribute('data-slug')
               || row.querySelector('[data-slug],[data-load-slug]')?.getAttribute('data-load-slug')
               || '').trim().toLowerCase();
    const title  = (row.querySelector('.t, .title, h4, [data-title]')?.textContent || '').trim();
    const artist = (row.querySelector('[data-artist]')?.getAttribute('data-artist')
                 || row.querySelector('.sub,.meta,.lib-meta')?.textContent || '')
                   .split('•')[0].trim();
    return { slug, title, artist, ta: taKey(title, artist) };
  }

  function findPendingById({slug, ta, title}){
    const list = pending();
    const tkey = titleKey(title||'');
    return list.find(g =>
      (slug && norm(g.slug||'') === slug) ||
      (ta && taKey(g.title||'', g.artist||'') === ta) ||
      (tkey && titleKey(g.title||'') === tkey)
    );
  }

  // ---------- SONG load → builder (and actually play THIS groove) ----------
  function stopAudio(){
    try { window.stopTransport?.(); } catch {}
    try { window.stopAll?.(); } catch {}
    try { window.sequencer?.stop?.(); } catch {}
  }
  function renderGridFromEntry(entry){
    if (typeof window.loadGrooveFromEntry === 'function') { window.loadGrooveFromEntry(entry); return; }
    if (typeof window.setCurrentGroove === 'function')    { window.setCurrentGroove(entry);    return; }
    if (entry.grid) {
      if (typeof window.setGridFromPattern === 'function') { window.setGridFromPattern(entry.grid); }
      else if (typeof window.renderGrid === 'function')    { window.renderGrid(entry.grid); }
    }
    const titleEl = $('#song-title,#title,input[name="title"]');
    if (titleEl) titleEl.value = entry.title || titleEl.value || 'Untitled';
    try { window.paintAccents?.(entry.timeSig); } catch {}
  }
  function scrollToGrid(offset=140){
    const builder = $('#page-builder');
    const target = $('#system') || builder || document.body;
    const y = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
  function loadPendingToBuilder(entry){
    if (!entry) return;
    stopAudio();
    if (typeof window.showPage === 'function') window.showPage('page-builder');
    setTimeout(()=> {
      renderGridFromEntry(entry);
      setTimeout(()=> scrollToGrid(140), 60);
      (window.toast||console.log)('This song is pending approval (not in Library yet).', 'info');
    }, 0);
  }

  // ---------- approve / reject (SONGS) ----------
  function approveEntry(entry, row){
    if (!entry) return;
    // mark explicitly as song (harmless if your Library ignores this field)
    entry.kind = 'song';

    const s = norm(entry.slug||'');
    const nextApproved = [entry, ...approved().filter(g => norm(g.slug||'') !== s)];
    saveApproved(nextApproved);

    savePending(pending().filter(g => norm(g.slug||'') !== s));
    row?.remove();
    updatePendingCount();

    (window.toast||console.log)('Approved to Library.', 'ok');
    window.dispatchEvent(new CustomEvent('gm:data-changed', { detail:{source:'pending-approve', entry} }));
  }

  function rejectEntry(entry, row){
    if (!entry) return;
    const s = norm(entry.slug||'');
    savePending(pending().filter(g => norm(g.slug||'') !== s));
    masksAdd(entry); // keep ghosts out of Search/My Subs
    row?.remove();
    updatePendingCount();

    (window.toast||console.log)('Removed from Pending.', 'warn');
    window.dispatchEvent(new CustomEvent('gm:data-changed', { detail:{source:'pending-reject', entry} }));
  }

  // ---------- clicks inside Pending ----------
  function getRow(el){
    const r = el.closest?.('#pendingList .admin-item, #pendingList .card, #pendingList [data-sub-row], #pending .admin-item, #pending .card, #pending [data-sub-row]');
    return r || el.closest('.admin-item, .card, [data-sub-row], li, .row');
  }

  function wirePendingDelegation(){
    const root = pendingRoot();
    if (!root || root.__gmPendingWired) return;
    root.__gmPendingWired = true;

    document.addEventListener('click', (e)=>{
      const row = getRow(e.target); if (!row) return;

      // Only handle rows that live in a Pending section
      const inPending = row.closest?.('#pendingList, #pending, [data-pending]') || $('#page-account .tab-content[data-tab="pending"]');
      if (!inPending) return;

      const id = rowId(row);
      const entry = findPendingById(id);

      const txt = (e.target.textContent||'').toLowerCase();
      const isApprove = e.target.closest('[data-approve], .approve, .btn-approve') || /^\s*approve\s*$/i.test(txt);
      const isReject  = e.target.closest('[data-reject],[data-del], .reject, .delete, .btn-delete') || /^\s*(reject|remove|delete)\s*$/i.test(txt);
      const isLoadBtn = e.target.closest('[data-load],[data-load-slug], .load, .btn-load, button, a');

      if (isApprove) { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); approveEntry(entry, row); return; }
      if (isReject)  { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); if (confirm('Remove this from Pending?')) rejectEntry(entry, row); return; }
      if (isLoadBtn) { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); loadPendingToBuilder(entry); return; }
    }, true);
  }

  // ---------- counts ----------
  function setCountOn(el, n){
    if (!el) return;
    const base = el.getAttribute('data-base') || (el.textContent||'').replace(/\(\s*\d+\s*\)\s*$/,'').trim();
    el.setAttribute('data-base', base);
    const badge = el.querySelector('.count, .badge, [data-count]');
    if (badge) badge.textContent = `(${n})`;
    else el.innerHTML = `${base} <span class="count">(${n})</span>`;
  }
  function updatePendingCount(){
    const n = pending().length;
    const els = $$('#page-account [data-cat="pending"], [data-cat="Pending"]');
    if (els.length) els.forEach(el => setCountOn(el, n));
    else {
      const cands = $$('#page-account .chip, #page-account .tab, #page-account [role="tab"], #page-account .btn');
      cands.filter(el => /^\s*pending\b/i.test((el.textContent||'').replace(/\(\s*\d+\s*\)\s*$/,'').trim()))
           .forEach(el => setCountOn(el, n));
    }
  }

  window.addEventListener('storage', (e)=> { if (e.key === KEYS.PENDING) setTimeout(updatePendingCount, 0); });
  window.addEventListener('gm:data-changed', ()=> setTimeout(updatePendingCount, 0));

  // ---------- sanitizer: purge non-songs from Pending (one-time on init) ----------
  function purgeNonSongsFromPending(){
    const list = pending();
    const keep = [];
    let moved = 0;
    list.forEach(g=>{
      // heuristics: if an item claims kind=pattern OR has an explicit pattern flag in text, move to Approved
      const looksPattern = (String(g.kind||'').toLowerCase().includes('pattern'));
      if (looksPattern) {
        // ensure it's in Library
        const s = norm(g.slug||'');
        const nextApproved = [g, ...approved().filter(x => norm(x.slug||'') !== s)];
        saveApproved(nextApproved);
        moved++;
      } else {
        // keep as song pending
        g.kind = 'song'; // normalize (harmless if you ignore it elsewhere)
        keep.push(g);
      }
    });
    if (moved) (window.toast||console.log)(`Moved ${moved} pattern(s) from Pending to Library.`, 'info');
    savePending(keep);
  }

  // ---------- boot ----------
  function init(){
    purgeNonSongsFromPending();
    wirePendingDelegation();
    updatePendingCount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const _show = window.showPage;
  window.showPage = function(id){
    const r = _show?.apply(this, arguments);
    if (id === 'page-account') setTimeout(init, 0);
    return r;
  };
})();
/* === Submit Modal: rock-solid type/labels reset === */
(function(){
  const modal   = document.getElementById('submitModal');
  const form    = document.getElementById('submitForm');
  const typeEl  = document.getElementById('submitType');
  const sigShow = document.getElementById('currentSigShow');
  const bpmShow = document.getElementById('currentTempoShow');

  if (!modal || !form || !typeEl) return;

  // Label node for the Title input (so we can change text cleanly)
  const titleInput = form.querySelector('input[name="title"]');
  const titleLabel = titleInput ? titleInput.closest('label') : null;

  function setTitleLabel() {
    if (!titleLabel) return;
    // ensure first text node exists and update it
    const txt = (typeEl.value === 'pattern') ? 'Pattern (optional title) ' : 'Song Title ';
    // normalize text node
    if (!titleLabel.firstChild || titleLabel.firstChild.nodeType !== Node.TEXT_NODE) {
      titleLabel.insertBefore(document.createTextNode(''), titleLabel.firstChild || null);
    }
    titleLabel.firstChild.nodeValue = txt;
  }

  function fillSigTempo() {
    const gridSig  = document.getElementById('sig')?.value || '4/4';
    const gridBpm  = document.getElementById('tempo')?.value || '100';
    if (sigShow) sigShow.value = gridSig;
    if (bpmShow) bpmShow.value = gridBpm;
  }

  // Keep label in sync whenever the type changes (piggybacks your existing syncFields)
  typeEl.addEventListener('change', setTitleLabel);
  setTitleLabel();

  // When opening the modal from the header button, mirror grid meta and refresh labels
  document.getElementById('submitBtn')?.addEventListener('click', () => {
    fillSigTempo();
    // do not trust prior state—force a change event to re-run all toggles
    typeEl.dispatchEvent(new Event('change', { bubbles:true }));
    setTitleLabel();
  });

  // On any close of the modal, reset to a known-good state so it doesn’t “stick”
  modal.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      // default back to Song for the next open
      typeEl.value = 'song';
      typeEl.dispatchEvent(new Event('change', { bubbles:true }));
      setTitleLabel();
    });
  });

  // After a successful submit, reset the form **without** losing the grid meta mirrors
  form.addEventListener('submit', () => {
    // allow your existing handler to run first
    setTimeout(() => {
      // Clear text fields, keep selects sane
      form.reset();
      // Force type back to Song + re-hide detail fields appropriately
      typeEl.value = 'song';
      typeEl.dispatchEvent(new Event('change', { bubbles:true }));
      setTitleLabel();
      fillSigTempo();
    }, 0);
  });
})();
/* === Library: add "by <display>" subtitle for patterns === */
(function(){
  const get = (k, d=[]) => { try { return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); } catch { return d; } };
  const byName = (rec) => (rec?.display) 
      || (rec?.by ? (rec.by.split('@')[0]) : '')
      || (window.deriveDisplayName ? deriveDisplayName(rec?.by||'') : '');

  function recBySlug(slug) {
    if (!slug) return null;
    const all = get('gm_approved_submissions', []);
    return all.find(g => g.slug === slug) || null;
  }

  function injectBylines(root){
    (root || document).querySelectorAll('#libGrid .lib-card').forEach(card => {
      if (card.querySelector('.lib-by')) return; // already added
      const loadBtn = card.querySelector('[data-load-slug]');
      const slug = loadBtn?.getAttribute('data-load-slug') || card.getAttribute('data-slug') || '';
      const rec = recBySlug(slug);
      if (!rec || rec.type !== 'pattern') return;

      const meta = card.querySelector('.lib-meta'); // where tempo/sig usually lives
      const byline = document.createElement('div');
      byline.className = 'lib-meta lib-by';
      const name = byName(rec);
      if (!name) return;
      byline.textContent = `by ${name}`;
      // insert right after the first meta line, or at the end of the card
      (meta && meta.parentNode) ? meta.parentNode.insertBefore(byline, meta.nextSibling)
                                : card.appendChild(byline);
    });
  }

  // Run after your Library render (don’t replace it)
  const prev = window.renderLibrary;
  window.renderLibrary = function(){
    const r = prev?.apply(this, arguments);
    try { injectBylines(); } catch {}
    return r;
  };

  // Also try once on load, in case Library is already on screen
  injectBylines();
})();

/* ==== FIND SONG EXAMPLES — match current grid → SONG Library (original behavior) ==== */
(() => {
  if (window.__GM_FIND_EXAMPLES__) return; window.__GM_FIND_EXAMPLES__ = true;

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const get = (k, d=[]) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch { return d; } };

  // Source of truth for Approved songs
  const approved = () =>
    (typeof window.allApproved === 'function')
      ? window.allApproved()
      : get('gm_approved_submissions', []);

  // Steps per time signature (fallbacks)
  const TS = window.TIME_SIGS || {
    "2/4":{steps:8,type:"simple"}, "3/4":{steps:12,type:"simple"}, "4/4":{steps:16,type:"simple"},
    "5/4":{steps:20,type:"simple"}, "6/8":{steps:12,type:"compound"}, "7/8":{steps:14,type:"compound"},
    "9/8":{steps:18,type:"compound"}, "12/8":{steps:24,type:"compound"}
  };
  const stepsFor = (sig) => (TS[String(sig||'4/4')]?.steps) || 16;

  // Read the CURRENT builder grid → numeric arrays (0/1/2/3)
  function readGridFromDOM(prefix) {
    const pick = (rowSel) => $(`${rowSel} .cell`) ? $(`${rowSel} .cell`) : null;
    const cells = (sel) => Array.from(document.querySelectorAll(`${sel} .cell`));

    const encH = cells(`#${prefix}-hat`).map(c => {
      const t = (c.textContent || '').trim();
      if (t === 'x>' || t === 'x›') return 3;             // accented tip
      if (t === 'O')             return 2;                 // open
      if (t === 'x')             return 1;                 // closed
      return 0;
    });
    const encS = cells(`#${prefix}-snare`).map(c => {
      const t = (c.textContent || '').trim();
      if (t === '(●)') return 2;                           // ghost
      if (t === '●')   return 1;                           // hit
      return 0;
    });
    const encK = cells(`#${prefix}-kick`).map(c => {
      const t = (c.textContent || '').trim();
      return (t === '●') ? 1 : 0;                          // hit vs empty
    });
    return [encH, encS, encK];
  }

  function captureCurrentGrid() {
    const sig = ($('#sig')?.value) || (window.A_SIG) || '4/4';
    const steps = stepsFor(sig);

    // determine if second bar is visible
    const m2 = $('#m2');
    const hasBar2 = !!(m2 && getComputedStyle(m2).display !== 'none');

    function clamp(a) {
      const out = a.slice(0, steps);
      if (out.length < steps) out.push(...Array(steps - out.length).fill(0));
      return out;
    }

    const [H1, S1, K1] = readGridFromDOM('m1').map(clamp);
    let H2=[], S2=[], K2=[];
    if (hasBar2) { [H2, S2, K2] = readGridFromDOM('m2').map(clamp); }

    // quick sanity: empty grid?
    const sum = (a) => a.reduce((p,v)=>p+(+v||0),0);
    const empty = (sum(H1)+sum(S1)+sum(K1)+(hasBar2?(sum(H2)+sum(S2)+sum(K2)):0)) === 0;

    return { sig, steps, hasBar2, H1,S1,K1,H2,S2,K2, empty };
  }

  // Normalize a library record’s bar arrays → fixed length number arrays
  function toArr(str, steps, kind) {
    // library stores digits: hats 0/1/2/3, snare 0/1/2, kick 0/1
    const a = String(str||'').split('').map(n => +n || 0);
    if (a.length < steps) a.push(...Array(steps - a.length).fill(0));
    return a.slice(0, steps);
  }

  function barFromRec(rec, steps) {
    return {
      A: [ toArr(rec.H,  steps, 'H'), toArr(rec.S,  steps, 'S'), toArr(rec.K,  steps, 'K') ],
      B: [ toArr(rec.H2, steps, 'H'), toArr(rec.S2, steps, 'S'), toArr(rec.K2, steps, 'K') ]
    };
  }

  function equalArr(a,b){ if (a.length !== b.length) return false; for(let i=0;i<a.length;i++){ if ((+a[i]|0) !== (+b[i]|0)) return false; } return true; }
  function equalBar([h1,s1,k1], [h2,s2,k2]){ return equalArr(h1,h2) && equalArr(s1,s2) && equalArr(k1,k2); }

  // Match logic (original spirit):
  // - songs only
  // - same time signature
  // - if your grid has 1 bar → match ANY of the record’s bars (A or B) to your Bar 1
  // - if your grid has 2 bars → require rec.A matches your Bar1 AND rec.B matches your Bar2
  function findMatches(current) {
    const { sig, steps, hasBar2, H1,S1,K1,H2,S2,K2 } = current;
    const lib = approved().filter(x => (x?.type || 'song') === 'song' && String(x.timeSig||'4/4') === String(sig));

    const hits = [];
    for (const g of lib) {
      const bars = barFromRec(g, steps);
      if (!hasBar2) {
        if ( equalBar([H1,S1,K1], bars.A) || (bars.B?.[0]?.length && equalBar([H1,S1,K1], bars.B)) ) {
          hits.push(g);
        }
      } else {
        if ( bars.B?.[0]?.length && equalBar([H1,S1,K1], bars.A) && equalBar([H2,S2,K2], bars.B) ) {
          hits.push(g);
        }
      }
    }
    return hits;
  }

  function renderResults(hits) {
    const results = $('#results');
    if (!results) return;

    if (!hits.length) {
      results.innerHTML = `<div class="muted">No Results Found.</div>`;
      return;
    }

    results.innerHTML = hits.slice(0, 30).map(g => `
      <div class="card">
        <div class="rowline">
          <div>
            <div class="title">${g.title || 'Untitled Song'}</div>
            <div class="meta">${g.artist || 'Unknown'} • ${g.timeSig || '4/4'} • ${g.tempo || 100} BPM</div>
          </div>
          <button class="btn small primary" data-slug="${g.slug||''}">Load to Grid</button>
        </div>
      </div>
    `).join('');

    // Delegate Load → same unified loader the rest of the app uses
    results.addEventListener('click', function onClick(e){
      const btn = e.target.closest('[data-slug]'); if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      const slug = btn.getAttribute('data-slug');
      const rec  = approved().find(x => (x.slug||'') === slug) || null;
      if (!rec) return;
      if (typeof window.gmLoadToGrid === 'function') window.gmLoadToGrid(rec);
      else if (typeof window.loadGroove === 'function') window.loadGroove(rec);
      // optional: smooth scroll back to the grid so the load is obvious
      const builder = document.getElementById('page-builder');
      const target  = document.getElementById('system') || builder;
      if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, { once: true, capture: true });
  }

  function runFindExamples() {
    // Ensure we’re on Builder (so cells exist)
    const onBuilder = document.getElementById('page-builder')?.classList.contains('active');
    if (!onBuilder && typeof window.goBuilder === 'function') {
      window.goBuilder(() => setTimeout(runFindExamples, 0));
      return;
    }
    const current = captureCurrentGrid();
    if (current.empty) {
      (window.toast || console.log)('Put a groove in the grid first.', 'warn');
      const results = $('#results'); if (results) results.innerHTML = `<div class="muted">No pattern in the grid.</div>`;
      return;
    }
    const hits = findMatches(current);
    renderResults(hits);
  }

  // Wire the button “Find Song Examples”
  function wire() {
    const btn = document.getElementById('findBtn');
    if (!btn || btn.__gmFindBound) return;
    btn.__gmFindBound = true;
    btn.addEventListener('click', (e)=> {
      e.preventDefault(); e.stopPropagation();
      runFindExamples();
    }, true);
  }

  // boot + re-wire when page switches to Builder
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
  const prevShow = window.showPage;
  window.showPage = function(id) {
    const r = prevShow?.apply(this, arguments);
    if (id === 'page-builder') setTimeout(wire, 0);
    return r;
  };
})();
/* --- SONGS-ONLY SEARCH PRUNE (non-destructive) ------------------------- */
(function(){
  const get = (k,d=[]) => { try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); }catch{ return d; } };

  // Robust song detector:
  // 1) If type/kind exists -> must be "song"
  // 2) Else fallback: must have an artist; patterns usually don't.
  window.__GM_isSong = window.__GM_isSong || function(rec){
    if (!rec || typeof rec !== 'object') return false;
    const t = String(rec.type || rec.kind || '').toLowerCase();
    if (t) return t === 'song';
    const hasArtist = !!(rec.artist && String(rec.artist).trim());
    return hasArtist; // conservative fallback
  };

  // After your normal search fills #results, prune patterns from the DOM.
  function pruneResultsToSongs(){
    const res = document.getElementById('results');
    if (!res) return;

    const lib = get('gm_approved_submissions', []);

    // helper: try to resolve the record for a result card
    function recFromCard(card){
      const slug = card.querySelector('[data-load-slug]')?.getAttribute('data-load-slug')
                 || card.getAttribute('data-slug') || '';
      if (slug) {
        return lib.find(x => String(x.slug||'') === String(slug));
      }
      const title  = (card.querySelector('.title, h4, [data-title]')?.textContent || '').trim();
      const artist = (card.querySelector('[data-artist]')?.getAttribute('data-artist')
                   || card.querySelector('.lib-meta, .meta, .sub')?.textContent || '')
                     .split('•')[0].trim();
      // best-effort fallback match
      return lib.find(x => (String(x.title||'').trim() === title) &&
                           (String(x.artist||'').trim() === artist));
    }

    // Remove any card that resolves to a non-song
    let kept = 0;
    res.querySelectorAll('.lib-card, .card, [data-slug]').forEach(card => {
      const rec = recFromCard(card);
      if (rec && !window.__GM_isSong(rec)) {
        card.remove();
      } else {
        kept++;
      }
    });

    if (!kept) {
      res.innerHTML = '<div class="muted">No song results. (Patterns are excluded.)</div>';
    }
  }

  // Hook into your existing search button—non-invasive.
  function hookSearchPrune(){
    const btn = document.getElementById('findBtn');
    if (!btn || btn.__gmSongsOnly) return;
    btn.__gmSongsOnly = true;

    // Run *after* the original handler populates the #results list
    btn.addEventListener('click', () => setTimeout(pruneResultsToSongs, 0), true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookSearchPrune);
  } else {
    hookSearchPrune();
  }
})();

/* === BYLINE UNDER SIG/BPM (Library, Search, My Subs, Pending) === */
(() => {
  if (window.__GM_BYLINE_UNDER_META__) return;
  window.__GM_BYLINE_UNDER_META__ = true;

  const get = (k, d=[]) => { try { return JSON.parse(localStorage.getItem(k) || '[]') || d; } catch { return d; } };
  const APPROVED = () => get('gm_approved_submissions', []);
  const PENDING  = () => get('gm_pending_submissions',  []);
  const norm = s => (s||'').trim().toLowerCase();

  const deriveDisplay = (email) => email ? String(email).split('@')[0] : '';

  function lookupBySlug(slug){
    if (!slug) return null;
    const s = norm(slug);
    return APPROVED().find(r => norm(r.slug||'')===s)
        || PENDING().find(r => norm(r.slug||'')===s)
        || null;
  }
  function lookupByTitleArtist(title, artist){
    const t = norm(title), a = norm(artist);
    const from = (list)=> list.find(r => norm(r.title||'')===t && norm(r.artist||'')===a);
    return from(APPROVED()) || from(PENDING()) || null;
  }

  function cardIdentity(el){
    const slug   = el.getAttribute?.('data-slug')
                 || el.querySelector?.('[data-load-slug]')?.getAttribute('data-load-slug')
                 || '';
    const title  = (el.querySelector?.('h4,.title,[data-title],.t,strong')?.textContent || '').trim();
    const metaTx = (el.querySelector?.('[data-artist]')?.getAttribute('data-artist')
                 || el.querySelector?.('.sub,.meta,.lib-meta')?.textContent || '').trim();
    const artist = (metaTx.split('•')[0] || '').trim();
    return { slug, title, artist };
  }

  function byText(rec){
    if (!rec) return '';
    const display = (rec.display || '').trim();
    if (display) return `by ${display}`;
    const email = (rec.by || rec.email || '').trim();  // fallback: email only
    return email ? `by ${email}` : '';
  }

  function placeUnderMeta(card, text){
    if (!text) return;
    // create or reuse
    let line = card.querySelector('.gm-byline');
    if (!line) {
      line = document.createElement('div');
      line.className = 'gm-byline';
    }
    line.textContent = text;

    // find the **last** meta row (where sig/BPM usually is)
    const metas = card.querySelectorAll('.lib-meta, .meta');
    const after = metas.length ? metas[metas.length - 1] : null;

    if (after && after.parentNode) {
      // insert right after the last meta row
      if (line.previousSibling !== after) after.parentNode.insertBefore(line, after.nextSibling);
    } else {
      // fallback: before action buttons or at end
      const actions = card.querySelector('.lib-actions, .actions, .rowline, .btn');
      if (actions?.parentNode) actions.parentNode.insertBefore(line, actions);
      else card.appendChild(line);
    }
  }

  function applyIn(root=document){
    const cards = root.querySelectorAll?.(
      '#libGrid .lib-card, #libGrid .card, ' +     // Library
      '#results .card, ' +                         // Search results
      '#mySubs .admin-item, #mySubs .card, #mySubs [data-sub-row], ' + // My Subs
      '#pendingList .admin-item, #pendingList .card, #pendingList [data-sub-row]' // Pending
    ) || [];
    cards.forEach(card => {
      const id  = cardIdentity(card);
      const rec = (id.slug && lookupBySlug(id.slug)) || lookupByTitleArtist(id.title, id.artist);
      const txt = byText(rec);
      if (txt) placeUnderMeta(card, txt);
    });
  }

  // initial pass
  applyIn(document);

  // light styles (subtle, compact)
  if (!document.getElementById('gm-byline-css')) {
    const css = document.createElement('style');
    css.id = 'gm-byline-css';
    css.textContent = `
      .gm-byline{ font-size:12px; opacity:.75; margin-top:4px; line-height:1.2 }
      #libGrid .gm-byline{ margin-top:6px }
    `;
    document.head.appendChild(css);
  }

  // Re-run after your renderers
  const hook = (name) => {
    const prev = window[name];
    window[name] = function(){ const r = prev?.apply(this, arguments); setTimeout(()=>applyIn(document), 0); return r; };
  };
  hook('renderLibrary');
  hook('renderMySubs');

  // Watch dynamic containers
  const watch = (sel) => {
    const host = document.querySelector(sel);
    if (!host || host.__gmByObs) return;
    host.__gmByObs = new MutationObserver(() => setTimeout(()=>applyIn(host), 0));
    host.__gmByObs.observe(host, { childList:true, subtree:true });
  };
  const arm = () => ['#libGrid', '#results', '#mySubs', '#pendingList'].forEach(watch);
  arm();
  new MutationObserver(arm).observe(document.body, { childList:true, subtree:true });
})();



(function pinAuthToRight(){
  // 1) tiny helper to find by visible text if IDs aren’t present
  function findByText(selector, text, root){
    const scope = root || document, needle = String(text||'').trim().toLowerCase();
    for (const el of scope.querySelectorAll(selector)){
      if ((el.textContent||'').trim().toLowerCase() === needle) return el;
    }
    return null;
  }

  function apply(){
    const nav = document.querySelector('header nav, .topbar nav, .topbar .right, nav');
    if (!nav) return;
    nav.style.display = 'flex';
    nav.style.alignItems = 'center';
    nav.style.flexWrap = 'nowrap';

    // Left group
    const submit  = document.getElementById('toBuilder')  || findByText('a,button', 'submit groove', nav);
    const library = document.getElementById('toLibrary')  || findByText('a,button', 'groove library', nav) || findByText('a,button','library',nav);
    const pending = document.getElementById('toPending')  || findByText('a,button', 'pending grooves', nav);

    // Right group (logged in vs out)
    const acct    = document.getElementById('navAccount') || findByText('a,button', 'account', nav) || findByText('a,button','my account',nav);
    const logout  = document.getElementById('navLogout')  || findByText('a,button', 'log out', nav) || findByText('a,button','logout',nav);
    const login   = document.getElementById('navLogin')   || findByText('a,button', 'log in / sign up', nav) || findByText('a,button','log in',nav);
    const signup  = document.getElementById('navSignup')  || findByText('a,button', 'sign up', nav);

    // 2) Use flexbox ORDER instead of moving DOM (so nothing "fights" us)
    const setOrder = (el, n) => { if (el) el.style.order = String(n); };

    setOrder(submit,  10);
    setOrder(library, 20);
    setOrder(pending, 30);

    // whichever exists first on the right gets margin-left:auto to push to edge
    const right1 = acct || login;
    const right2 = logout || signup;

    if (right1){
      right1.style.order = '100';
      right1.style.marginLeft = 'auto';   // <-- pins everything after to the far right
      // make it match your outline pills:
      right1.classList.add('btn','outline');
    }
    if (right2){
      right2.style.order = '110';
      right2.classList.add('btn','outline');
    }
  }

  // Run now and whenever nav re-renders
  apply();
  const nav = document.querySelector('header nav, .topbar nav, .topbar .right, nav');
  if (nav){
    new MutationObserver(apply).observe(nav, {childList:true, subtree:false});
  }
  setTimeout(apply, 300);
})();
