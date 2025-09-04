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
  const isAdmin     = ()=> { const u=currentUser(); if(!u) return false; return (findUser(u.email)?.role==='admin'); };

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

  function playHat(open, tempo, sig, accent=false){
    ensureAudio();
    const t = ac.currentTime;
    const n = ac.createBufferSource(); n.buffer = hatNoise();
    const hp = ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = open ? 6000 : (accent ? 7000 : 8000);
    const subdiv = (TIME_SIGS[sig]?.type==='simple') ? 4 : 2;
    const stepDur = (60/tempo)/subdiv;
    const dur = open ? stepDur*1.9 : stepDur*0.6;
    const g = ac.createGain();
    let peak = 0.30;
    if (open) peak = 0.75; else if (accent) peak = 0.99; else peak = 0.30;
    const duck = window.__hhDuckScale; // optional duck from previous accent
    if (duck && !open && !accent) peak = Math.max(0.1, peak * duck);
    window.__hhDuckScale = null;
    g.gain.setValueAtTime(0.001,t);
    g.gain.linearRampToValueAtTime(Math.min(1.0,peak), t+0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    n.connect(hp).connect(g).connect(ac.destination);
    n.start(t); n.stop(t+dur+0.02);
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
      toast('Pattern added to Library!','ok');
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
