function handleKeyDown(event){
  const typing=event.target.matches('input,textarea,select,[contenteditable="true"]');
  if(event.code==='Space'&&!typing){spaceHeld=true;event.preventDefault();}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();els['search-input'].focus();els['search-input'].select();return;}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();return;}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d'&&!typing){event.preventDefault();duplicateSelected();return;}
  if(typing)return;
  if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelection();return;}
  if(event.key==='Escape'){clearSelection();return;}
  if(event.key.toLowerCase()==='f'){event.preventDefault();selection.type==='note'?fitView(selection.id):fitView();return;}
  if(event.key==='Enter'&&event.shiftKey&&selection.type==='note'){event.preventDefault();addChild(selection.id);return;}
  if(event.key==='Enter'&&selection.type==='note'){event.preventDefault();startInlineEdit(selection.id);return;}
  if(event.key==='Tab'){event.preventDefault();if(selection.type==='note')addSibling(selection.id);else{const rect=els.stage.getBoundingClientRect();const p=screenToWorld(rect.left+rect.width/2,rect.top+rect.height/2);addNoteMutation(p.x-112,p.y-58);}return;}
}

function updatePanGuidance(){
  els['add-note'].innerHTML='<span>＋</span>処理';
  els['add-note'].title='処理を追加';
  els['canvas-hint'].innerHTML='<strong>空白をドラッグ</strong>でボードを移動　・　ダブルクリックで処理を追加　・　上下左右の点から接続';
  const shortcuts=[...els['help-dialog'].querySelectorAll('.shortcut-grid > div')];
  const panShortcut=shortcuts.find((item)=>item.textContent.includes('Space + ドラッグ'));
  if(panShortcut)panShortcut.innerHTML='<kbd>空白をドラッグ</kbd><span>ボードを移動（Space＋ドラッグでも可）</span>';
  const connectShortcut=shortcuts.find((item)=>item.textContent.includes('右端の点'));
  if(connectShortcut)connectShortcut.innerHTML='<kbd>上下左右の点をドラッグ</kbd><span>直角に接続。空白へ離すと処理を追加</span>';
  const badge=document.querySelector('.version-badge');
  if(badge)badge.textContent='v0.9.0';
  els['save-indicator'].title='IndexedDBに保存';
}

const baseFinalizeNoteDrop = finalizeNoteDrop;
finalizeNoteDrop = function finalizeFlowchartNoteDrop(noteId){
  const item=getNote(noteId);
  if(!item)return;
  const size=noteDisplaySize(item);
  const cx=item.x+size.w/2,cy=item.y+size.h/2;
  const group=findGroupAt(cx,cy);
  const phase=group?getPhase(group.phaseId):findPhaseAt(cx,cy);
  if(group?.id!==item.groupId){
    item.groupId=group?.id||'';
    if(group)item.phaseId=group.phaseId;
  }
  if(phase)item.phaseId=phase.id;
  const edgeItem=nearestEdge(cx,cy,24/state.viewport.scale,noteId);
  if(edgeItem){
    state.edges=state.edges.filter((edgeObj)=>edgeObj.id!==edgeItem.id);
    state.edges.push(
      edge(uid('edge'),edgeItem.from,noteId,edgeItem.label||''),
      edge(uid('edge'),noteId,edgeItem.to,'')
    );
    recordActivity('矢印の途中へ図形を挿入',noteId);
    toast('矢印の途中へ図形を挿入しました');
    return;
  }
  const overlap=state.notes.find((other)=>other.id!==noteId&&overlapRatio(item,other)>.38);
  if(overlap&&(!item.groupId||item.groupId!==overlap.groupId)){
    actionToast('重なった2枚を囲みにまとめますか？','まとめる',()=>groupPair(noteId,overlap.id));
  }
  recordActivity('図形を移動',noteId);
};

async function init(){
  cacheElements();
  updateSaveIndicator('読み込み中…','IndexedDBから読み込んでいます');
  try {
    const restored=await loadState();
    state=normalizeFlowchartState(restored||initialState());
  } catch(error) {
    console.error('[Flowmap] Startup restore failed',error);
    state=normalizeFlowchartState(initialState());
    updateSaveIndicator('復元失敗',error.message||'保存データを読み込めませんでした');
  }
  updatePanGuidance();
  installFlowchartUi();
  bindEvents();
  renderAll();
  saveState();
  requestAnimationFrame(()=>fitView());
  window.Flowmap={
    getState:()=>clone(state),
    reset:()=>{state=normalizeFlowchartState(initialState());saveState();renderAll();},
    storage:{flush:()=>flushStateSave()}
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void init();});else void init();
