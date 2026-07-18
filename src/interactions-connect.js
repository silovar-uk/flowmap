function beginReconnect(event, edgeId, end) {
  const item = getEdge(edgeId);
  if (!item) return;
  const oppositeId = end === 'from' ? item.to : item.from;
  const opposite = getNote(oppositeId);
  if (!opposite) return;
  const size = noteDisplaySize(opposite);
  const start = end === 'from'
    ? { x: opposite.x, y: opposite.y + size.h / 2 }
    : { x: opposite.x + size.w, y: opposite.y + size.h / 2 };
  connect = { reconnectEdgeId: edgeId, end, start, shift: false };
  els['connection-preview'].hidden = false;
  updateConnection(event);
  event.preventDefault(); event.stopPropagation();
}

function beginConnection(event, fromId) {
  const from = getNote(fromId); if(!from)return;
  const size=noteDisplaySize(from);
  connect={fromId,start:{x:from.x+size.w,y:from.y+size.h/2},shift:event.shiftKey};
  els['connection-preview'].hidden=false;
  updateConnection(event);
  event.preventDefault(); event.stopPropagation();
}

function updateConnection(event) {
  const point=screenToWorld(event.clientX,event.clientY);
  const sx=connect.start.x,sy=connect.start.y,tx=point.x,ty=point.y,gap=Math.max(48,Math.abs(tx-sx)*.48);
  els['connection-preview'].setAttribute('d',`M ${sx} ${sy} C ${sx+gap} ${sy}, ${tx-gap} ${ty}, ${tx} ${ty}`);
}

function finishConnection(event) {
  const current=connect; connect=null; els['connection-preview'].hidden=true;
  const targetEl=document.elementFromPoint(event.clientX,event.clientY)?.closest('.sticky-note');
  const targetId=targetEl?.dataset.noteId;
  if (current.reconnectEdgeId) {
    const item = getEdge(current.reconnectEdgeId);
    if (item && targetId) {
      const otherId = current.end === 'from' ? item.to : item.from;
      if (targetId !== otherId) {
        mutate(current.end === 'from' ? '矢印の接続元を変更' : '矢印の接続先を変更', () => { item[current.end] = targetId; });
        return;
      }
    }
    renderAll(); return;
  }
  if(targetId&&targetId!==current.fromId){
    if(state.edges.some((item)=>item.from===current.fromId&&item.to===targetId))return renderAll();
    mutate('付箋を接続',()=>state.edges.push(edge(uid('edge'),current.fromId,targetId)),current.fromId);return;
  }
  const point=screenToWorld(event.clientX,event.clientY);
  undoStack.push(snapshot());redoStack.length=0;
  if(current.shift){
    const created=[];
    [-150,0,150].forEach((offset,index)=>{const item=note(uid('note'),`分岐 ${index+1}`,point.x,point.y+offset,'','',{now:new Date().toISOString()});const group=findGroupAt(item.x+112,item.y+58);const phase=group?getPhase(group.phaseId):findPhaseAt(item.x,item.y);item.groupId=group?.id||'';item.phaseId=phase?.id||state.phases[0]?.id||'';state.notes.push(item);state.edges.push(edge(uid('edge'),current.fromId,item.id));created.push(item);recordActivity('分岐付箋を追加',item.id);});
    selection={type:'note',id:created[1].id};saveState();renderAll();requestAnimationFrame(()=>startInlineEdit(created[1].id));
  }else{
    addNoteAt(point.x,point.y,{connectFrom:current.fromId,label:'接続先の付箋を追加'});
  }
}

function openQuickEditor(noteId, kind, anchor) {
  const item=getNote(noteId);if(!item)return;
  const rect=anchor.getBoundingClientRect();
  select('note',noteId,{openInspector:false});
  const pop=els['quick-popover'];
  let title='',control='';
  if(kind==='status'){title='状態';control=`<select data-quick-input><option value="todo">未着手</option><option value="doing">対応中</option><option value="waiting">確認待ち</option><option value="done">完了</option></select>`;}
  if(kind==='due'){title='期限';control=`<input data-quick-input type="date" value="${esc(item.due||'')}">`;}
  if(kind==='assignee'){title='担当';control=`<input data-quick-input type="text" value="${esc(item.assignee||'')}" placeholder="担当名">`;}
  if(kind==='tag'){title='タグを追加';control=`<input data-quick-input type="text" value="" placeholder="例：発注">`;}
  if(kind==='memo'){state.settings.inspectorOpen=true;activeTab='memo';renderAll();requestAnimationFrame(()=>els['field-note'].focus());return;}
  pop.innerHTML=`<strong>${title}</strong>${control}<div class="quick-actions"><button type="button" data-quick-cancel>取消</button><button class="primary" type="button" data-quick-save>保存</button></div>`;
  pop.hidden=false;pop.style.left=`${clamp(rect.left,8,window.innerWidth-242)}px`;pop.style.top=`${clamp(rect.bottom+6,8,window.innerHeight-130)}px`;
  const input=$('[data-quick-input]',pop);if(kind==='status')input.value=item.status;requestAnimationFrame(()=>input.focus());
  $('[data-quick-cancel]',pop).onclick=closeQuickPopover;
  $('[data-quick-save]',pop).onclick=()=>{
    const value=input.value.trim();
    mutate(kind==='tag'?'タグを追加':`${title}を更新`,()=>{if(kind==='status')item.status=value;if(kind==='due')item.due=value;if(kind==='assignee')item.assignee=value;if(kind==='tag'&&value&&!item.tags.includes(value))item.tags.push(value);},item.id);
    closeQuickPopover();
  };
  input.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();$('[data-quick-save]',pop).click();}if(event.key==='Escape')closeQuickPopover();});
}

function closeQuickPopover(){els['quick-popover'].hidden=true;els['quick-popover'].innerHTML='';}
function toast(message, duration=2200){const node=document.createElement('div');node.className='toast';node.innerHTML=`<span>${esc(message)}</span>`;els['toast-region'].append(node);setTimeout(()=>node.remove(),duration);}
function actionToast(message,label,callback){const node=document.createElement('div');node.className='toast';node.innerHTML=`<span>${esc(message)}</span><button type="button">${esc(label)}</button>`;els['toast-region'].append(node);$('button',node).onclick=()=>{node.remove();callback();};setTimeout(()=>node.remove(),6000);}
function relativeTime(iso){const diff=Date.now()-new Date(iso).getTime();if(diff<60000)return'今';if(diff<3600000)return`${Math.floor(diff/60000)}分前`;if(diff<86400000)return`${Math.floor(diff/3600000)}時間前`;return`${Math.floor(diff/86400000)}日前`;}
function formatDateTime(iso){return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}
