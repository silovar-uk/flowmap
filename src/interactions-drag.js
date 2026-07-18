function beginNodeDrag(event, noteId) {
  const item = getNote(noteId);
  if (!item || event.button !== 0) return;
  const point = screenToWorld(event.clientX, event.clientY);
  drag = { type:'note', id:noteId, startX:point.x, startY:point.y, originalX:item.x, originalY:item.y, before:snapshot(), moved:false };
  select('note', noteId, { openInspector:false });
  event.preventDefault();
}

function beginGroupDrag(event, groupId) {
  const group = getGroup(groupId);
  if (!group || event.button !== 0) return;
  const point = screenToWorld(event.clientX, event.clientY);
  drag = {
    type:'group', id:groupId, startX:point.x, startY:point.y, originalX:group.x, originalY:group.y, before:snapshot(), moved:false,
    noteOrigins: state.notes.filter((item) => item.groupId === groupId).map((item) => ({ id:item.id,x:item.x,y:item.y }))
  };
  select('group', groupId, { openInspector:false });
  event.preventDefault();
}

function beginPan(event) {
  if (event.defaultPrevented) return false;
  const shortcutPan = spaceHeld || event.button === 1;
  const interactive = event.target.closest('.sticky-note,.group-header,.phase-title,.edge-hit,.edge-endpoint,button,input,textarea,select,[contenteditable="true"]');
  const blankPan = event.button === 0 && !interactive;
  if (!shortcutPan && !blankPan) return false;
  drag = {
    type:'pan',
    clientX:event.clientX,
    clientY:event.clientY,
    x:state.viewport.x,
    y:state.viewport.y,
    moved:false,
    clearSelectionOnClick: blankPan && !event.target.closest('.group-card,.phase-card')
  };
  els.stage.classList.add('is-panning');
  event.preventDefault();
  return true;
}

function suppressClickAfterPan() {
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cleanup();
  };
  const cleanup = () => document.removeEventListener('click', stop, true);
  document.addEventListener('click', stop, true);
  setTimeout(cleanup, 120);
}

function handlePointerMove(event) {
  if (connect) return updateConnection(event);
  if (!drag) return;
  if (drag.type === 'pan') {
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    drag.moved ||= Math.hypot(dx, dy) > 3;
    state.viewport.x = drag.x + dx;
    state.viewport.y = drag.y + dy;
    applyLayout(); renderMinimap();
    return;
  }
  const point = screenToWorld(event.clientX, event.clientY);
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;
  drag.moved ||= Math.hypot(dx,dy) > 3;
  if (drag.type === 'note') {
    const item = getNote(drag.id);
    item.x = clamp(drag.originalX + dx, 0, WORLD.width - 90);
    item.y = clamp(drag.originalY + dy, 0, WORLD.height - 60);
    const group = findGroupAt(item.x + noteDisplaySize(item).w/2, item.y + noteDisplaySize(item).h/2);
    $$('.group-card.drag-over', els['group-layer']).forEach((node) => node.classList.remove('drag-over'));
    if (group) $(`[data-group-id="${group.id}"]`, els['group-layer'])?.classList.add('drag-over');
    const nodeEl = $(`[data-note-id="${item.id}"]`, els['node-layer']);
    if (nodeEl) { nodeEl.style.left = `${item.x}px`; nodeEl.style.top = `${item.y}px`; }
    renderEdges(); renderMinimap();
  }
  if (drag.type === 'group') {
    const group = getGroup(drag.id);
    group.x = clamp(drag.originalX + dx, 0, WORLD.width-group.w);
    group.y = clamp(drag.originalY + dy, 0, WORLD.height-group.h);
    drag.noteOrigins.forEach((origin) => { const item=getNote(origin.id); if(item){ item.x=origin.x+dx; item.y=origin.y+dy; } });
    renderGroups(); renderNotes(); renderEdges(); renderMinimap();
  }
}

function handlePointerUp(event) {
  if (connect) return finishConnection(event);
  if (!drag) return;
  if (drag.type === 'pan') {
    const finished = drag;
    drag = null;
    els.stage.classList.remove('is-panning');
    if (finished.moved) suppressClickAfterPan();
    else if (finished.clearSelectionOnClick) selection = { type:null, id:null };
    saveState(); renderAll(); return;
  }
  const finished = drag;
  drag = null;
  $$('.group-card.drag-over', els['group-layer']).forEach((node) => node.classList.remove('drag-over'));
  if (!finished.moved) return renderAll();
  undoStack.push(finished.before); redoStack.length = 0;
  if (finished.type === 'note') finalizeNoteDrop(finished.id);
  if (finished.type === 'group') {
    const group = getGroup(finished.id);
    const phase = findPhaseAt(group.x + group.w/2, group.y + 20);
    if (phase) { group.phaseId = phase.id; state.notes.filter((item) => item.groupId === group.id).forEach((item) => item.phaseId = phase.id); }
    recordActivity('囲みを移動');
  }
  saveState(); renderAll();
}

function finalizeNoteDrop(noteId) {
  const item = getNote(noteId);
  if (!item) return;
  const size = noteDisplaySize(item);
  const cx = item.x + size.w/2, cy = item.y + size.h/2;
  const group = findGroupAt(cx, cy);
  const phase = group ? getPhase(group.phaseId) : findPhaseAt(cx, cy);
  if (group?.id !== item.groupId) {
    item.groupId = group?.id || '';
    if (group) item.phaseId = group.phaseId;
  }
  if (phase) item.phaseId = phase.id;
  const edgeItem = nearestEdge(cx, cy, 24 / state.viewport.scale, noteId);
  if (edgeItem) {
    state.edges = state.edges.filter((edgeObj) => edgeObj.id !== edgeItem.id);
    state.edges.push(edge(uid('edge'), edgeItem.from, noteId), edge(uid('edge'), noteId, edgeItem.to));
    recordActivity('矢印の途中へ付箋を挿入', noteId);
    toast('矢印の途中へ付箋を挿入しました');
    return;
  }
  const overlap = state.notes.find((other) => other.id !== noteId && overlapRatio(item, other) > .38);
  if (overlap && (!item.groupId || item.groupId !== overlap.groupId)) {
    actionToast('重なった2枚を囲みにまとめますか？', 'まとめる', () => groupPair(noteId, overlap.id));
  }
  recordActivity('付箋を移動', noteId);
}

function overlapRatio(a, b) {
  const as = noteDisplaySize(a), bs = noteDisplaySize(b);
  const x = Math.max(0, Math.min(a.x+as.w,b.x+bs.w)-Math.max(a.x,b.x));
  const y = Math.max(0, Math.min(a.y+as.h,b.y+bs.h)-Math.max(a.y,b.y));
  return (x*y) / Math.min(as.w*as.h,bs.w*bs.h);
}

function groupPair(aId, bId) {
  const a=getNote(aId), b=getNote(bId); if(!a||!b)return;
  mutate('付箋を囲みにまとめる', () => {
    const minX=Math.min(a.x,b.x)-28,minY=Math.min(a.y,b.y)-48,maxX=Math.max(a.x+a.w,b.x+b.w)+28,maxY=Math.max(a.y+a.h,b.y+b.h)+28;
    const phaseId=a.phaseId||b.phaseId||state.phases[0]?.id||'';
    const group={id:uid('group'),phaseId,title:'新しい囲み',x:minX,y:minY,w:maxX-minX,h:maxY-minY,color:'gray',collapsed:false};
    state.groups.push(group); a.groupId=group.id;b.groupId=group.id;a.phaseId=phaseId;b.phaseId=phaseId; selection={type:'group',id:group.id};
  });
}

function nearestEdge(x, y, threshold, ignoreNoteId) {
  let best = null, bestDistance = Infinity;
  state.edges.forEach((item) => {
    if (item.from === ignoreNoteId || item.to === ignoreNoteId) return;
    const path = edgePath(item);
    const pts = sampleBezier(path.points, 24);
    for (let i=1;i<pts.length;i++) {
      const distance=distanceToSegment(x,y,pts[i-1],pts[i]);
      if(distance<bestDistance){bestDistance=distance;best=item;}
    }
  });
  return bestDistance <= threshold ? best : null;
}

function sampleBezier(points, count) {
  if(points.length<4)return points;
  const [p0,p1,p2,p3]=points, out=[];
  for(let i=0;i<=count;i++){const t=i/count,u=1-t;out.push({x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y});}
  return out;
}

function distanceToSegment(px,py,a,b){const dx=b.x-a.x,dy=b.y-a.y;if(!dx&&!dy)return Math.hypot(px-a.x,py-a.y);const t=clamp(((px-a.x)*dx+(py-a.y)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(px-(a.x+t*dx),py-(a.y+t*dy));}
