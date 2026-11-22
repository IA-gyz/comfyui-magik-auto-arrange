// Pure layout engine; operates on LiteGraph-like nodes and links.
export function arrange(nodes, links, options = {}) {
  const o = {horizontal: 140, vertical: 55, mode: 'balanced', helpers: true, weights: true, lockX: false, lockY: false, direction: 'horizontal', passes: 6, snap: 40, hubRepulsion: 0, pack: false, ...options};
  if (o.direction === 'vertical') {
    // Transpose into working space, lay out horizontally, then swap coordinates back.
    const t = p => [Number(p?.[1]) || 0, Number(p?.[0]) || 0];
    const back = new Map();
    const tn = nodes.map(n => { const c = {...n, pos: t(n.pos), size: t(n.size)}; back.set(c, n); return c; });
    const tob = (options.obstacles || []).map(n => { const c = {...n, pos: t(n.pos), size: t(n.size)}; back.set(c, n); return c; });
    const res = layout(tn, links, {...o, direction: 'horizontal', lockX: o.lockY, lockY: o.lockX, obstacles: tob});
    const out = new Map();
    for (const [n, p] of res) out.set(back.get(n) || n, [p[1], p[0]]);
    return out;
  }
  return layout(nodes, links, o);
}

function layout(nodes, links, o) {
  const ns = [...nodes], byId = new Map(ns.map(n => [String(n.id), n]));
  if (!ns.length) return new Map();
  const edges = links.map(l => ({a: byId.get(String(l.origin_id)), b: byId.get(String(l.target_id)), slot: l.target_slot ?? 0})).filter(e => e.a && e.b && e.a !== e.b);
  const incoming = new Map(ns.map(n => [n, []])), outgoing = new Map(ns.map(n => [n, []]));
  for (const e of edges) { outgoing.get(e.a).push(e); incoming.get(e.b).push(e); }
  const posOf = n => [Number(n.pos?.[0]) || 0, Number(n.pos?.[1]) || 0];
  const size = n => [Math.max(40, Number(n.size?.[0]) || 200), Math.max(30, Number(n.size?.[1]) || 80)];
  const origX = n => posOf(n)[0], origY = n => posOf(n)[1];
  const lockWx = !!o.lockX, lockWy = !!o.lockY;
  const targetsOf = n => [...new Set(outgoing.get(n).map(e => e.b))];
  const sourcesOf = n => [...new Set(incoming.get(n).map(e => e.a))];
  const neighborsOf = n => new Set([...(incoming.get(n) || []).map(e => e.a), ...(outgoing.get(n) || []).map(e => e.b)]);
  // Primitives (no inputs) and output nodes (no outputs) with a single counterpart are free to move and snap close to it.
  const freeSources = o.helpers ? ns.filter(n => incoming.get(n).length === 0 && targetsOf(n).length === 1) : [];
  const freeSinks = o.helpers ? ns.filter(n => outgoing.get(n).length === 0 && sourcesOf(n).length === 1) : [];
  const free = new Set([...freeSources, ...freeSinks]);
  const main = ns.filter(n => !free.has(n));
  // Simulated mass: many distinct neighbours or a large body means more weight and inertia.
  const mass = n => {
    if (!o.weights) return 1;
    if (free.has(n)) return 0.25;
    return 1 + 0.6 * neighborsOf(n).size + 0.4 * Math.min(2, size(n)[0] * size(n)[1] / 16000);
  };
  // Hub repulsion: extra empty margin around nodes with many distinct neighbours (3 or fewer -> none, 5+ -> full).
  const pad = n => o.hubRepulsion * Math.max(0, Math.min(1, (neighborsOf(n).size - 3) / 2));
  let result;
  // Pack disconnected components: arrange each weakly connected component separately, then tile them side by side.
  if (o.pack) {
    const seen = new Set(), comps = [], adj = new Map(ns.map(n => [n, []]));
    for (const e of edges) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
    for (const n of ns) { if (seen.has(n)) continue; const c = [], q = [n]; seen.add(n);
      while (q.length) { const v = q.pop(); c.push(v); for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); q.push(w); } }
      comps.push(c); }
    if (comps.length > 1) {
      result = new Map();
      let cursor = Math.min(...ns.map(origX));
      for (const c of comps) {
        const inC = new Set(c);
        const subLinks = links.filter(l => inC.has(byId.get(String(l.origin_id))) && inC.has(byId.get(String(l.target_id))));
        const sub = layout(c, subLinks, {...o, pack: false, lockX: false, lockY: false, obstacles: o.obstacles || []});
        let minLeft = Infinity, maxRight = -Infinity;
        for (const [m, p] of sub) { minLeft = Math.min(minLeft, p[0]); maxRight = Math.max(maxRight, p[0] + size(m)[0]); }
        for (const [m, p] of sub) result.set(m, [p[0] - minLeft + cursor, p[1]]);
        cursor += maxRight - minLeft + o.horizontal;
      }
    }
  }
  if (!result) {
    // Condense strongly connected components so unusual cyclic graphs remain bounded.
    let counter = 0; const idx = new Map(), low = new Map(), stack = [], on = new Set(), components = [];
    function visit(v) { idx.set(v,counter); low.set(v,counter++); stack.push(v); on.add(v);
      for (const e of outgoing.get(v)) { const w=e.b; if (free.has(w)) continue; if (!idx.has(w)) { visit(w); low.set(v,Math.min(low.get(v),low.get(w))); } else if(on.has(w)) low.set(v,Math.min(low.get(v),idx.get(w))); }
      if(low.get(v)===idx.get(v)){const c=[]; let w; do {w=stack.pop();on.delete(w);c.push(w);} while(w!==v);components.push(c);}}
    main.forEach(n=>{if(!idx.has(n)) visit(n)});
    const comp = new Map(); components.forEach((c,i)=>c.forEach(n=>comp.set(n,i)));
    const ins=components.map(()=>new Set()), outs=components.map(()=>new Set());
    for(const e of edges){if(free.has(e.a)||free.has(e.b))continue; const a=comp.get(e.a),b=comp.get(e.b); if(a!==b){outs[a].add(b);ins[b].add(a);}}
    const indeg=ins.map(s=>s.size), queue=indeg.map((v,i)=>v===0?i:-1).filter(i=>i>=0), rank=components.map(()=>0);
    for(let k=0;k<queue.length;k++){const a=queue[k];for(const b of outs[a]){rank[b]=Math.max(rank[b],rank[a]+1);if(--indeg[b]===0)queue.push(b);}}
    const layers=[]; for(const n of main){const r=rank[comp.get(n)];(layers[r]??=[]).push(n);}
    layers.forEach(l=>l.sort((a,b)=>origY(a)-origY(b)));
    // Repeated barycentric sweeps reduce crossings while the original order breaks ties.
    // Neighbour mass pulls light nodes toward heavy hubs; a node's own mass damps its movement (inertia).
    for(let pass=0;pass<o.passes;pass++){const forward=pass%2===0, order=forward?layers:[...layers].reverse();
      for(const layer of order){const positions=new Map();layers.forEach(l=>l.forEach((n,i)=>positions.set(n,i)));
        const score=n=>{const es=forward?incoming.get(n):outgoing.get(n), neighbors=es.map(e=>forward?e.a:e.b).filter(x=>positions.has(x)&&rank[comp.get(x)]!==rank[comp.get(n)]);
          if(!neighbors.length)return positions.get(n);
          let num=0,den=0;for(const x of neighbors){const m=mass(x);num+=m*positions.get(x);den+=m;}
          return (num+mass(n)*positions.get(n))/(den+mass(n));};
        layer.sort((a,b)=>score(a)-score(b)||origY(a)-origY(b));}}
    const minX=Math.min(...ns.map(origX)), minY=Math.min(...ns.map(origY));
    // Reserve a source column left of each layer and a sink column right of it for free nodes.
    const sourceFor=new Map(main.map(n=>[n,freeSources.filter(h=>targetsOf(h)[0]===n)]));
    const sinkFor=new Map(main.map(n=>[n,freeSinks.filter(s=>sourcesOf(s)[0]===n)]));
    const maxWidths=layers.map(l=>{const w=l.length?Math.max(...l.map(n=>size(n)[0])):0;return w+(l.length?Math.max(...l.map(pad)):0);});
    const sourceWidths=layers.map(l=>Math.max(0,...l.flatMap(n=>sourceFor.get(n).map(h=>size(h)[0]+o.snap))));
    const sinkWidths=layers.map(l=>Math.max(0,...l.flatMap(n=>sinkFor.get(n).map(s=>size(s)[0]+o.snap))));
    const xs=[], sinkXs=[]; let x=minX;
    layers.forEach((l,i)=>{x+=sourceWidths[i];xs[i]=x;x+=maxWidths[i];sinkXs[i]=x+o.snap;x+=sinkWidths[i]+o.horizontal;});
    result=new Map();
    for(let i=0;i<layers.length;i++){let y=minY;
      for(const n of layers[i]){const hs=sourceFor.get(n);const hh=hs.reduce((s,h)=>s+size(h)[1]+o.vertical,0);const block=Math.max(size(n)[1],hh?hh-o.vertical:0)+pad(n); if(o.mode==='balanced'){y=Math.max(y,origY(n)); result.set(n,[xs[i],y]);} else result.set(n,[xs[i],y+(block-size(n)[1])/2]);let hy=y;for(const h of hs){result.set(h,[xs[i]-o.snap-size(h)[0],hy]);hy+=size(h)[1]+o.vertical;}y+=block+o.vertical;}
      for(const n of layers[i]){let sy=result.get(n)[1];for(const s of sinkFor.get(n)){result.set(s,[sinkXs[i],sy]);sy+=size(s)[1]+o.vertical;}}}
    for(const h of freeSources){if(!result.has(h))result.set(h,posOf(h));const p=result.get(h);let sy=p[1];for(const s of freeSinks.filter(s=>sourcesOf(s)[0]===h)){result.set(s,[p[0]+size(h)[0]+o.snap,sy]);sy+=size(s)[1]+o.vertical;}}
  }
  // Locked axes keep the original coordinate; collision resolution then uses the other axis.
  if(lockWx||lockWy) for(const [n,p] of result){if(lockWx)p[0]=origX(n);if(lockWy)p[1]=origY(n);result.set(n,p);}
  // Locked and out-of-scope nodes are obstacles. Heavy nodes are placed first and keep their spot; lighter blocks move around them.
  const locked=n=>!!n.properties?.magikArrangeLocked;
  const obstacles=(o.obstacles||[]).concat(ns.filter(locked));
  for(const n of ns.filter(locked)) result.set(n,posOf(n));
  const placed=obstacles.map(n=>({n,p:posOf(n),s:size(n)}));
  const movable=[...ns].filter(n=>!locked(n)).sort((a,b)=>mass(b)-mass(a));
  for(const n of movable){let p=result.get(n);if(!p)continue;const s=size(n),pn=pad(n);
    if(!(lockWx&&lockWy)){let attempts=0, moved=true;
      while(moved&&attempts++<placed.length+2){moved=false;
        for(const q of placed){const m=20+pn+pad(q.n);
          if(p[0]<q.p[0]+q.s[0]+m&&p[0]+s[0]+m>q.p[0]&&p[1]<q.p[1]+q.s[1]+m&&p[1]+s[1]+m>q.p[1]){p=lockWy?[q.p[0]+q.s[0]+m,p[1]]:[p[0],q.p[1]+q.s[1]+o.vertical+pn+pad(q.n)];moved=true;}}}}
    result.set(n,p);placed.push({n,p,s});}
  return result;
}
