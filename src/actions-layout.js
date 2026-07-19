function autoLayout() {
  mutate('全体を整列', () => {
    const phaseW = 720;
    const phaseStep = 790;
    state.phases.forEach((phase, phaseIndex) => {
      phase.x = 40 + phaseIndex * phaseStep;
      phase.y = 40;
      phase.w = phaseW;
      phase.h = 1320;
      const groups = state.groups.filter((group) => group.phaseId === phase.id);
      let gy = phase.y + 72;
      groups.forEach((group) => {
        const notes = state.notes.filter((item) => item.groupId === group.id);
        const rows = Math.max(1, Math.ceil(notes.length / 2));
        group.x = phase.x + 44;
        group.y = gy;
        group.w = 632;
        group.h = 84 + rows * 164;
        notes.forEach((item, index) => {
          item.x = group.x + 42 + (index % 2) * 292;
          item.y = group.y + 64 + Math.floor(index / 2) * 164;
          item.phaseId = phase.id;
        });
        gy += group.h + 44;
      });
      state.notes.filter((item) => item.phaseId === phase.id && !item.groupId).forEach((item, index) => {
        item.x = phase.x + 86 + (index % 2) * 292;
        item.y = gy + 20 + Math.floor(index / 2) * 164;
      });
    });
  });
  fitView();
}

function fitView(targetNoteId = null) {
  const rect = els.stage.getBoundingClientRect();
  const framePadding = clamp(Math.min(rect.width, rect.height) * .09, 76, 128);
  let bounds;
  if (targetNoteId) {
    const item = getNote(targetNoteId);
    if (!item) return;
    const size = noteDisplaySize(item);
    bounds = {
      minX: item.x - 150,
      minY: item.y - 125,
      maxX: item.x + size.w + 150,
      maxY: item.y + size.h + 125
    };
  } else {
    const objects = [
      ...state.notes.map((item) => ({ x:item.x,y:item.y,w:noteDisplaySize(item).w,h:noteDisplaySize(item).h })),
      ...state.groups.map((item) => ({ x:item.x,y:item.y,w:item.w,h:item.collapsed ? 40 : item.h }))
    ];
    if (!objects.length) return;
    bounds = {
      minX: Math.min(...objects.map((item) => item.x)) - framePadding,
      minY: Math.min(...objects.map((item) => item.y)) - framePadding,
      maxX: Math.max(...objects.map((item) => item.x + item.w)) + framePadding,
      maxY: Math.max(...objects.map((item) => item.y + item.h)) + framePadding
    };
  }
  const maxScale = targetNoteId ? 1.22 : 1.16;
  const scale = clamp(Math.min(rect.width / (bounds.maxX-bounds.minX), rect.height / (bounds.maxY-bounds.minY)), .28, maxScale);
  state.viewport.scale = scale;
  state.viewport.x = (rect.width - (bounds.maxX-bounds.minX)*scale)/2 - bounds.minX*scale;
  state.viewport.y = (rect.height - (bounds.maxY-bounds.minY)*scale)/2 - bounds.minY*scale;
  saveState(); renderAll();
}

function zoomAt(factor, clientX, clientY) {
  const rect = els.stage.getBoundingClientRect();
  const old = state.viewport.scale;
  const next = clamp(old * factor, .28, 1.8);
  const sx = clientX ?? rect.left + rect.width / 2;
  const sy = clientY ?? rect.top + rect.height / 2;
  const worldX = (sx - rect.left - state.viewport.x) / old;
  const worldY = (sy - rect.top - state.viewport.y) / old;
  state.viewport.scale = next;
  state.viewport.x = sx - rect.left - worldX * next;
  state.viewport.y = sy - rect.top - worldY * next;
  saveState(); renderAll();
}

function screenToWorld(clientX, clientY) {
  const rect = els.stage.getBoundingClientRect();
  return { x: (clientX - rect.left - state.viewport.x) / state.viewport.scale, y: (clientY - rect.top - state.viewport.y) / state.viewport.scale };
}

function findGroupAt(x, y, exceptId = null) {
  return [...state.groups].reverse().find((group) => group.id !== exceptId && !group.collapsed && x >= group.x && x <= group.x + group.w && y >= group.y && y <= group.y + group.h);
}

function findPhaseAt(x, y) {
  return [...state.phases].reverse().find((phase) => x >= phase.x && x <= phase.x + phase.w && y >= phase.y && y <= phase.y + phase.h);
}
