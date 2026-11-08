// Pure layout engine; operates on LiteGraph-like nodes and links.
export function arrange(nodes, links, options = {}) {
  const o = {horizontal: 140, vertical: 55, mode: 'balanced', helpers: true, ...options};
  const ns = [...nodes], byId = new Map(ns.map(n => [String(n.id), n]));
  const edges = links.map(l => ({a: byId.get(String(l.origin_id)), b: byId.get(String(l.target_id)), slot: l.target_slot ?? 0})).filter(e => e.a && e.b && e.a !== e.b);
  const incoming = new Map(ns.map(n => [n, []])), outgoing = new Map(ns.map(n => [n, []]));
  for (const e of edges) { outgoing.get(e.a).push(e); incoming.get(e.b).push(e); }
  const size = n => [Math.max(40, Number(n.size?.[0]) || 200), Math.max(30, Number(n.size?.[1]) || 80)];
  // Helpers are only compacted when their output goes to one distinct target.
  const helper = n => o.helpers && incoming.get(n).length === 0 && new Set(outgoing.get(n).map(e => e.b)).size === 1 && (/(primitive|reroute|\bconstant\b)/i.test(`${n.type || ''} ${n.title || ''}`) || (size(n)[0] <= 240 && size(n)[1] <= 120));
  const helpers = new Set(ns.filter(helper));
  const main = ns.filter(n => !helpers.has(n));
  if (!main.length) return new Map(ns.map(n => [n, [...n.pos]]));
  // Condense strongly connected components so unusual cyclic graphs remain bounded.
  let counter = 0; const idx = new Map(), low = new Map(), stack = [], on = new Set(), components = [];
  function visit(v) { idx.set(v,counter); low.set(v,counter++); stack.push(v); on.add(v);
    for (const e of outgoing.get(v)) { const w=e.b; if (helpers.has(w)) continue; if (!idx.has(w)) { visit(w); low.set(v,Math.min(low.get(v),low.get(w))); } else if(on.has(w)) low.set(v,Math.min(low.get(v),idx.get(w))); }
    if(low.get(v)===idx.get(v)){const c=[]; let w; do {w=stack.pop();on.delete(w);c.push(w);} while(w!==v);components.push(c);}}
  main.forEach(n=>{if(!idx.has(n)) visit(n)});
  const comp = new Map(); components.forEach((c,i)=>c.forEach(n=>comp.set(n,i)));
  const ins=components.map(()=>new Set()), outs=components.map(()=>new Set());
  for(const e of edges){if(helpers.has(e.a)||helpers.has(e.b))continue; const a=comp.get(e.a),b=comp.get(e.b); if(a!==b){outs[a].add(b);ins[b].add(a);}}
  const indeg=ins.map(s=>s.size), queue=indeg.map((v,i)=>v===0?i:-1).filter(i=>i>=0), rank=components.map(()=>0);
  for(let k=0;k<queue.length;k++){const a=queue[k];for(const b of outs[a]){rank[b]=Math.max(rank[b],rank[a]+1);if(--indeg[b]===0)queue.push(b);}}
  const layers=[]; for(const n of main){const r=rank[comp.get(n)];(layers[r]??=[]).push(n);}
  const origY=n=>Number(n.pos?.[1])||0; layers.forEach(l=>l.sort((a,b)=>origY(a)-origY(b)));
  // Repeated barycentric sweeps reduce crossings while the original order breaks ties.
  for(let pass=0;pass<6;pass++){const forward=pass%2===0, order=forward?layers:[...layers].reverse();
    for(const layer of order){const positions=new Map();layers.forEach(l=>l.forEach((n,i)=>positions.set(n,i)));
      const score=n=>{const es=forward?incoming.get(n):outgoing.get(n), neighbors=es.map(e=>forward?e.a:e.b).filter(x=>positions.has(x)&&rank[comp.get(x)]!==rank[comp.get(n)]);return neighbors.length?neighbors.reduce((s,x)=>s+positions.get(x),0)/neighbors.length:positions.get(n);};
      layer.sort((a,b)=>score(a)-score(b)||origY(a)-origY(b));}}
  const minX=Math.min(...ns.map(n=>Number(n.pos?.[0])||0)), minY=Math.min(...ns.map(origY));
  // Reserve width for a helper column before each target layer.
  const helperFor=new Map(main.map(n=>[n,ns.filter(h=>helpers.has(h)&&outgoing.get(h)[0]?.b===n)]));
  const maxWidths=layers.map(l=>Math.max(...l.map(n=>size(n)[0])));
  const helperWidths=layers.map(l=>Math.max(0,...l.flatMap(n=>helperFor.get(n).map(h=>size(h)[0]+40))));
  const xs=[]; let x=minX; layers.forEach((l,i)=>{x+=helperWidths[i];xs[i]=x;x+=maxWidths[i]+o.horizontal;});
  const result=new Map();
  for(let i=0;i<layers.length;i++){let y=minY;for(const n of layers[i]){const hs=helperFor.get(n);const hh=hs.reduce((s,h)=>s+size(h)[1]+o.vertical,0);const block=Math.max(size(n)[1],hh?hh-o.vertical:0); if(o.mode==='balanced') y=Math.max(y,origY(n)); result.set(n,[xs[i],y+(block-size(n)[1])/2]);let hy=y;for(const h of hs){result.set(h,[xs[i]-40-size(h)[0],hy]);hy+=size(h)[1]+o.vertical;}y+=block+o.vertical;}}
  // Locked and out-of-scope nodes are obstacles. Move whole blocks down to avoid collisions.
  const locked=n=>!!n.properties?.magikArrangeLocked;
  const obstacles=(options.obstacles||[]).concat(ns.filter(locked));
  for(const n of ns.filter(locked)) result.set(n,[...n.pos]);
  const placed=obstacles.map(n=>({n,p:n.pos,s:size(n)}));
  for(const n of [...main,...ns.filter(h=>helpers.has(h))]){if(locked(n))continue;let p=result.get(n);if(!p)continue;const s=size(n);let attempts=0, moved=true;while(moved&&attempts++<placed.length+2){moved=false;for(const q of placed){if(p[0]<q.p[0]+q.s[0]+20&&p[0]+s[0]+20>q.p[0]&&p[1]<q.p[1]+q.s[1]+20&&p[1]+s[1]+20>q.p[1]){p=[p[0],q.p[1]+q.s[1]+o.vertical];moved=true;}}}result.set(n,p);placed.push({n,p,s});}
  return result;
}
