
(() => {
  if (!document.getElementById('g')) return;
  // ---- the lineage ----------------------------------------------------
  // Same model as the paper: typed edges, parent -> child, merges have two
  // parents, and an adapter composes against a base it was never merged into.
  const N = [
    {id:'base-a',   x: 30, y: 24, kind:'root',      signed:true },
    {id:'base-b',   x:330, y: 24, kind:'root',      signed:true },
    {id:'ft-1',     x: 30, y: 98, kind:'fine-tune', signed:true },
    {id:'ft-2',     x:330, y: 98, kind:'fine-tune', signed:false},
    {id:'quant-1',  x:  8, y:172, kind:'quantize',  signed:true },
    {id:'ft-3',     x:168, y:172, kind:'fine-tune', signed:true },
    {id:'quant-2',  x:352, y:172, kind:'quantize',  signed:true },
    {id:'lora-1',   x:  8, y:246, kind:'compose',   signed:true },
    {id:'merge-1',  x:250, y:246, kind:'merge',     signed:false},
    {id:'ft-4',     x:398, y:246, kind:'fine-tune', signed:true },
  ];
  const E = [
    ['base-a','ft-1'], ['base-b','ft-2'],
    ['ft-1','quant-1'], ['ft-1','ft-3'], ['ft-2','quant-2'],
    ['quant-1','lora-1'], ['ft-3','merge-1'], ['quant-2','merge-1'],
    ['quant-2','ft-4'],
  ];
  const W = 104, H = 40;
  const byId = Object.fromEntries(N.map(n => [n.id, n]));
  let pz = null, cut = new Set();

  const live = () => E.filter((_, i) => !cut.has(i));
  const kids = id => live().filter(e => e[0] === id).map(e => e[1]);
  const dads = id => live().filter(e => e[1] === id).map(e => e[0]);

  // forward reachability -- the blast radius, over recorded edges only
  function radius(z){
    const seen = new Set([z]), q = [z];
    while (q.length) for (const c of kids(q.pop())) if (!seen.has(c)) { seen.add(c); q.push(c); }
    return seen;
  }

  // nearest clean AND signed ancestor, then the merge check from the paper:
  // only a parent this plan does not itself rebuild can block
  function verdict(m, aff){
    if (m === pz) return 'patient zero';
    const q = [[m, []]], seen = new Set([m]);
    while (q.length){
      const [cur, path] = q.shift();
      for (const par of dads(cur)){
        if (seen.has(par)) continue;
        seen.add(par);
        const p2 = [[par, cur], ...path];
        if (!aff.has(par) && byId[par].signed){
          const blocked = p2.some(([a, b]) =>
            byId[b].kind === 'merge' && dads(b).some(x => aff.has(x) && x !== a));
          return blocked ? 'blocked' : 'recoverable';
        }
        q.push([par, p2]);
      }
    }
    return 'unrecoverable';
  }

  // ---- drawing --------------------------------------------------------
  const svg = document.getElementById('g');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (t, a) => { const n = document.createElementNS(NS, t);
    for (const k in a) n.setAttribute(k, a[k]); return n; };

  function path(a, b){
    const s = byId[a], t = byId[b];
    const x1 = s.x + W/2, y1 = s.y + H, x2 = t.x + W/2, y2 = t.y;
    const m = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`;
  }

  function draw(){
    svg.innerHTML = '';
    const aff = pz ? radius(pz) : new Set();

    const defs = el('defs');
    for (const [id, col] of [['ah','#6b7889'], ['ah2','#e0574f']]){
      const mk = el('marker', {id, viewBox:'0 0 8 8', refX:7, refY:4,
        markerWidth:5, markerHeight:5, orient:'auto-start-reverse'});
      mk.appendChild(el('path', {d:'M0,0 L8,4 L0,8 z', fill:col}));
      defs.appendChild(mk);
    }
    svg.appendChild(defs);

    E.forEach(([a, b], i) => {
      const isCut = cut.has(i);
      const hot = !isCut && aff.has(a) && aff.has(b);
      svg.appendChild(el('path', {d:path(a,b), class:`edge${hot?' hot':''}${isCut?' cut':''}`,
        'marker-end':`url(#${hot?'ah2':'ah'})`}));
      const hit = el('path', {d:path(a,b), class:'edge-hit'});
      hit.addEventListener('click', () => { isCut ? cut.delete(i) : cut.add(i); draw(); });
      hit.appendChild(el('title', {})).textContent =
        isCut ? 'Unrecorded. Click to restore' : 'Click to delete: an unrecorded derivation';
      svg.appendChild(hit);
    });

    for (const n of N){
      const v = aff.has(n.id) ? verdict(n.id, aff) : null;
      const cls = n.id === pz ? 'pz' : v === 'recoverable' ? 'hit ok-rec' : v ? 'hit' : '';
      const g = el('g', {class:`node ${cls}`, tabindex:0, role:'button'});
      g.appendChild(el('rect', {x:n.x, y:n.y, width:W, height:H, rx:7}));
      const t1 = el('text', {x:n.x+10, y:n.y+15}); t1.textContent = n.id;
      const t2 = el('text', {x:n.x+10, y:n.y+28, class:'kind'}); t2.textContent = n.kind;
      g.append(t1, t2);
      if (n.signed){ const sg = el('text', {x:n.x+W-14, y:n.y+15, class:'sig'});
        sg.textContent = '◆'; g.appendChild(sg); }
      const act = () => { pz = pz === n.id ? null : n.id; draw(); };
      g.addEventListener('click', act);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ')
        { e.preventDefault(); act(); } });
      svg.appendChild(g);
    }
    report(aff);
  }

  function report(aff){
    const out = document.getElementById('readout');
    const list = document.getElementById('verdicts');
    if (!pz){
      out.innerHTML = 'Click any model to mark it compromised.';
      list.innerHTML = '<li>nothing selected</li>';
      return;
    }
    const others = [...aff].filter(x => x !== pz);
    const vs = others.map(m => [m, verdict(m, aff)]);
    const n = k => vs.filter(v => v[1] === k).length;
    const hidden = cut.size;
    out.innerHTML = `<b>${pz}</b> is compromised. ${others.length} other artifact`
      + `${others.length === 1 ? '' : 's'} downstream`
      + (hidden ? `, with ${hidden} derivation${hidden===1?'':'s'} unrecorded, `
          + `so this is a <b>lower bound</b> and never an over-estimate.` : '.');
    const cl = {recoverable:'v-rec', blocked:'v-blk', unrecoverable:'v-unr'};
    list.innerHTML = `<li class="v-pz"><span>${pz}</span><span>patient zero</span></li>`
      + vs.map(([m, v]) => `<li class="${cl[v]}"><span>${m}</span><span>${v}</span></li>`).join('')
      + (others.length ? '' : '<li><span>none</span><span>nothing downstream</span></li>');
  }

  document.getElementById('reset').onclick = () => { pz = null; cut.clear(); draw(); };
  document.getElementById('restore').onclick = () => { cut.clear(); draw(); };
  draw();
})();
