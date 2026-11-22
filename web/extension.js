import { app } from '../../scripts/app.js';
import { arrange } from './layout.js';

const getGraph = () => app.canvas?.graph || app.graph;
const allNodes = g => g?._nodes || [];
const selected = () => Object.values(app.canvas?.selected_nodes || {});
const linkList = g => Object.values(g?.links || {}).filter(Boolean);
const redraw = () => app.canvas?.setDirty?.(true, true);
function groupNodes(g, group) {
  const b=group?._bounding || group?.bounding; if(!b) return [];
  return allNodes(g).filter(n => n.pos[0]>=b[0] && n.pos[1]>=b[1] && n.pos[0]+n.size[0]<=b[0]+b[2] && n.pos[1]+n.size[1]<=b[1]+b[3]);
}
function reachable(g, start, direction) {
 const found=new Set([start]), links=linkList(g), byId=new Map(allNodes(g).map(n=>[String(n.id),n])), queue=[start];
 for(let i=0;i<queue.length;i++) for(const l of links){const from=direction==='up'?l.target_id:l.origin_id,to=direction==='up'?l.origin_id:l.target_id;if(String(from)===String(queue[i].id)){const n=byId.get(String(to));if(n&&!found.has(n)){found.add(n);queue.push(n);}}} return [...found];
}
function show(scope, g=getGraph()) {
 if(!scope.length){alert('Magik Auto Arrange: no nodes in this scope.');return;}
 const original=new Map(scope.map(n=>[n,[...n.pos]]));
 let settings; try { settings=JSON.parse(localStorage.getItem('magik.autoArrange.settings')||'{}'); } catch { settings={}; }
 const overlay=document.createElement('div'); overlay.style.cssText='position:fixed;inset:0;background:#0009;z-index:100000;display:flex;align-items:center;justify-content:center;color:#eee;font:14px sans-serif';
 overlay.innerHTML=`<div style="background:#242731;border:1px solid #626c81;border-radius:10px;padding:20px;min-width:340px;box-shadow:0 8px 40px #000"><h2 style="margin:0 0 14px">Magik Auto Arrange</h2><p style="color:#bac2d3;margin:0 0 14px">${scope.length} nodes selected for arrangement</p><label>Layout <select id="maa-mode"><option value="balanced">Balanced</option><option value="full">Full reorganize</option></select></label> <label>Flow <select id="maa-dir"><option value="horizontal">Left to right</option><option value="vertical">Top to bottom</option></select></label><br><br><label>Horizontal spacing <input id="maa-h" type="range" min="20" max="1000" style="width:130px"><span id="maa-hval"></span></label><br><br><label>Vertical spacing <input id="maa-v" type="range" min="10" max="500" style="width:130px"><span id="maa-vval"></span></label><br><br><label>Crossing passes <input id="maa-p" type="range" min="0" max="12" step="1" style="width:130px"><span id="maa-pval"></span></label><br><br><label>Snap gap <input id="maa-s" type="range" min="0" max="150" style="width:130px"><span id="maa-sval"></span></label><br><br><label>Hub repulsion <input id="maa-r" type="range" min="0" max="100" style="width:130px"><span id="maa-rval"></span></label><br><br><label><input id="maa-help" type="checkbox"> Compact helper nodes</label><br><label><input id="maa-weight" type="checkbox"> Anchor heavy nodes (samplers, hubs)</label><br><label><input id="maa-lx" type="checkbox"> Lock X (keep column)</label><br><label><input id="maa-ly" type="checkbox"> Lock Y (keep row)</label><br><label><input id="maa-pack" type="checkbox"> Pack disconnected components</label><p id="maa-status" style="color:#aab9ce">Change a slider or option to update the preview on the fly. Apply to keep or Cancel to restore.</p><div style="display:flex;gap:8px;justify-content:flex-end"><button id="maa-preview">Preview</button><button id="maa-cancel">Cancel</button><button id="maa-apply">Apply</button></div></div>`;
 document.body.append(overlay); const $=id=>overlay.querySelector('#maa-'+id);
 $('mode').value=settings.mode||'balanced'; $('dir').value=settings.direction||'horizontal'; $('h').value=settings.horizontal??140; $('v').value=settings.vertical??55; $('p').value=settings.passes??6; $('help').checked=settings.helpers!==false; $('weight').checked=settings.weights!==false; $('lx').checked=!!settings.lockX; $('ly').checked=!!settings.lockY; $('s').value=settings.snap??40; $('r').value=settings.hubRepulsion??0; $('pack').checked=!!settings.pack;
 const restore=()=>{for(const [n,p] of original) {n.pos[0]=p[0];n.pos[1]=p[1];}redraw();};
 const opts=()=>({mode:$('mode').value,direction:$('dir').value,horizontal:Math.min(1000,Math.max(20,Number($('h').value)||140)),vertical:Math.min(500,Math.max(10,Number($('v').value)||55)),passes:Math.min(12,Math.max(0,Number($('p').value)||0)),helpers:$('help').checked,weights:$('weight').checked,lockX:$('lx').checked,lockY:$('ly').checked,snap:Math.min(150,Math.max(0,Number($('s').value)||0)),hubRepulsion:Math.min(100,Math.max(0,Number($('r').value)||0)),pack:$('pack').checked});
 function calculate(){restore();const o=opts(); const obstacles=allNodes(g).filter(n=>!original.has(n));return arrange(scope,linkList(g),{...o,obstacles});}
 const move=map=>{for(const [n,p] of map){n.pos[0]=p[0];n.pos[1]=p[1];}redraw();};
 const bubbles=()=>{$('hval').textContent=$('h').value;$('vval').textContent=$('v').value;$('pval').textContent=$('p').value;$('sval').textContent=$('s').value;$('rval').textContent=$('r').value;};
 const live=()=>{bubbles();move(calculate());$('status').textContent='Preview updated. Apply to keep or Cancel to restore.';};
 overlay.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',live);el.addEventListener('change',live);});
 bubbles();
 $('preview').onclick=()=>live();
 $('cancel').onclick=()=>{restore();overlay.remove();};
 $('apply').onclick=()=>{const positions=calculate(); restore();g.beforeChange?.(); move(positions);g.afterChange?.(); localStorage.setItem('magik.autoArrange.settings',JSON.stringify(opts()));overlay.remove();};
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){restore();overlay.remove();}});
}
function addOptions(options, entries){ if(!Array.isArray(options))return options; options.push(null,...entries); return options; }
app.registerExtension({name:'Magik.AutoArrange', async setup(){
 const canvas=app.canvas; if(!canvas || canvas.__magikAutoArrange) return; canvas.__magikAutoArrange=true;
 const oldCanvas=canvas.getCanvasMenuOptions;
 if(oldCanvas) canvas.getCanvasMenuOptions=function(...args){const opts=oldCanvas.apply(this,args);return addOptions(opts,[{content:'Magik Auto Arrange: entire workflow',callback:()=>show(allNodes(getGraph()))},{content:'Magik Auto Arrange: selected nodes',callback:()=>show(selected())}]);};
 const oldNode=canvas.getNodeMenuOptions;
 if(oldNode) canvas.getNodeMenuOptions=function(node,...args){const opts=oldNode.call(this,node,...args);return addOptions(opts,[{content:'Magik Auto Arrange: upstream',callback:()=>show(reachable(getGraph(),node,'up'))},{content:'Magik Auto Arrange: downstream',callback:()=>show(reachable(getGraph(),node,'down'))},{content:node.properties?.magikArrangeLocked?'Magik Auto Arrange: unlock position':'Magik Auto Arrange: lock position',callback:()=>{const g=getGraph();g.beforeChange?.();node.properties??={};node.properties.magikArrangeLocked=!node.properties.magikArrangeLocked;g.afterChange?.();redraw();}}]);};
 const oldGroup=canvas.getGroupMenuOptions;
 if(oldGroup) canvas.getGroupMenuOptions=function(group,...args){const opts=oldGroup.call(this,group,...args);return addOptions(opts,[{content:'Magik Auto Arrange: nodes in group',callback:()=>show(groupNodes(getGraph(),group))}]);};
 }});
