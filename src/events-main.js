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
  els['canvas-hint'].innerHTML='<strong>空白をドラッグ</strong>でボードを移動　・　ダブルクリックで処理を追加　・　上下左右の点から接続';
  const shortcut=[...els['help-dialog'].querySelectorAll('.shortcut-grid > div')].find((item)=>item.textContent.includes('Space + ドラッグ'));
  if(shortcut)shortcut.innerHTML='<kbd>空白をドラッグ</kbd><span>ボードを移動（Space＋ドラッグでも可）</span>';
  const badge=document.querySelector('.version-badge');
  if(badge)badge.textContent='v0.8.0';
}

function init(){
  cacheElements();
  state=normalizeFlowchartState(loadState());
  updatePanGuidance();
  installFlowchartUi();
  bindEvents();
  renderAll();
  requestAnimationFrame(()=>fitView());
  window.Flowmap={getState:()=>clone(state),reset:()=>{state=initialState();state=normalizeFlowchartState(state);renderAll();}};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
