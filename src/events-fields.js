function bindInspectorFields(){
  const noteField=(element,key,label,transform=(value)=>value)=>{element.addEventListener('change',()=>{const item=getNote(selection.id);if(!item)return;const value=transform(element.value);if(JSON.stringify(item[key])===JSON.stringify(value))return;mutate(label,()=>item[key]=value,item.id);});};
  noteField(els['field-title'],'title','付箋名を変更');noteField(els['field-status'],'status','状態を変更');noteField(els['field-due'],'due','期限を変更');noteField(els['field-assignee'],'assignee','担当を変更');noteField(els['field-tags'],'tags','タグを変更',(value)=>value.split(',').map((item)=>item.trim()).filter(Boolean));noteField(els['field-location'],'location','場所を変更');noteField(els['field-link'],'link','リンクを変更');noteField(els['field-note'],'note','メモを変更');
  els['field-phase'].addEventListener('change',()=>{const item=getNote(selection.id);if(!item)return;mutate('フェーズを変更',()=>{item.phaseId=els['field-phase'].value;if(item.groupId&&getGroup(item.groupId)?.phaseId!==item.phaseId)item.groupId='';},item.id);});
  els['field-group'].addEventListener('change',()=>{const item=getNote(selection.id);if(!item)return;mutate('所属する囲みを変更',()=>{item.groupId=els['field-group'].value;if(item.groupId)item.phaseId=getGroup(item.groupId)?.phaseId||item.phaseId;},item.id);});
  els['add-check-item'].addEventListener('click',()=>{const item=getNote(selection.id);if(!item)return;mutate('チェックを追加',()=>item.checklist.push({id:uid('check'),text:'新しいチェック',done:false}),item.id);});
  els['checklist-editor'].addEventListener('change',(event)=>{const row=event.target.closest('[data-check-id]');const item=getNote(selection.id);if(!row||!item)return;const check=item.checklist.find((entry)=>entry.id===row.dataset.checkId);if(!check)return;if(event.target.type==='checkbox')mutate('チェック状態を変更',()=>check.done=event.target.checked,item.id);else mutate('チェック内容を変更',()=>check.text=event.target.value,item.id);});
  els['checklist-editor'].addEventListener('click',(event)=>{const button=event.target.closest('button');const row=event.target.closest('[data-check-id]');const item=getNote(selection.id);if(!button||!row||!item)return;mutate('チェックを削除',()=>item.checklist=item.checklist.filter((entry)=>entry.id!==row.dataset.checkId),item.id);});
  els['delete-node'].addEventListener('click',deleteSelection);
  els['edge-from'].addEventListener('change',()=>{const item=getEdge(selection.id);if(item)mutate('接続元を変更',()=>item.from=els['edge-from'].value);});
  els['edge-to'].addEventListener('change',()=>{const item=getEdge(selection.id);if(item)mutate('接続先を変更',()=>item.to=els['edge-to'].value);});
  els['reverse-edge'].addEventListener('click',()=>{const item=getEdge(selection.id);if(item)mutate('矢印を反転',()=>[item.from,item.to]=[item.to,item.from]);});els['delete-edge'].addEventListener('click',deleteSelection);
  els['group-title-field'].addEventListener('change',()=>{const item=getGroup(selection.id);if(item)mutate('囲み名を変更',()=>item.title=els['group-title-field'].value);});
  els['group-phase-field'].addEventListener('change',()=>{const item=getGroup(selection.id);if(item)mutate('囲みのフェーズを変更',()=>{item.phaseId=els['group-phase-field'].value;state.notes.filter((noteItem)=>noteItem.groupId===item.id).forEach((noteItem)=>noteItem.phaseId=item.phaseId);});});
  els['group-color-field'].addEventListener('change',()=>{const item=getGroup(selection.id);if(item)mutate('囲み色を変更',()=>item.color=els['group-color-field'].value);});
  els['toggle-group-collapse'].addEventListener('click',()=>{const item=getGroup(selection.id);if(item)mutate(item.collapsed?'囲みを展開':'囲みを折りたたむ',()=>item.collapsed=!item.collapsed);});els['delete-group'].addEventListener('click',deleteSelection);
  els['phase-title-field'].addEventListener('change',()=>{const item=getPhase(selection.id);if(item)mutate('フェーズ名を変更',()=>item.title=els['phase-title-field'].value);});els['delete-phase'].addEventListener('click',deleteSelection);
}

function bindDataEvents(){
  els['export-json'].addEventListener('click',()=>download('flowmap.json',JSON.stringify(state,null,2),'application/json'));
  els['export-yaml'].addEventListener('click',()=>{if(!window.jsyaml)return toast('YAMLライブラリを読み込めませんでした');download('flowmap.yaml',window.jsyaml.dump(state,{noRefs:true,lineWidth:120}),'text/yaml');});
  els['import-file'].addEventListener('change',async()=>{const file=els['import-file'].files[0];if(!file)return;try{const text=await file.text();const data=file.name.endsWith('.json')?JSON.parse(text):window.jsyaml.load(text);validateImport(data);undoStack.push(snapshot());state={...data,version:7};redoStack.length=0;selection={type:null,id:null};saveState();renderAll();els['data-dialog'].close();toast('データを読み込みました');}catch(error){console.error(error);toast('読み込みに失敗しました');}finally{els['import-file'].value='';}});
  els['reset-sample'].addEventListener('click',()=>{undoStack.push(snapshot());state=initialState();redoStack.length=0;selection={type:null,id:null};saveState();renderAll();els['data-dialog'].close();toast('サンプルへ戻しました');});
}

function validateImport(data){if(!data||!Array.isArray(data.notes)||!Array.isArray(data.edges)||!Array.isArray(data.groups)||!Array.isArray(data.phases))throw new Error('Invalid flowmap data');}
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
