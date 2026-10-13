(() => {
  let client;
  const filenamePrefixes = {
    'android-normal':'FISH MOD Z ALOK THỨC TỈNH ADR FFTH',
    'android-max':'FISH MOD Z ALOK THỨC TỈNH ADR FFM',
    'ios-normal':'FISH MOD Z ALOK THỨC TỈNH IOS FFTH',
    'ios-max':'FISH MOD Z ALOK THỨC TỈNH IOS FFM'
  };
  const usedCodes = new Set();
  let lastCode;
  try { lastCode = localStorage.getItem('alok-last-export-code'); } catch {}
  function exportFilename(version) {
    const prefix = filenamePrefixes[version];
    if (!prefix) throw Error('Phiên bản không hợp lệ.');
    if (usedCodes.size >= 67600) usedCodes.clear();
    let code;
    do {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      if (random[0] >= 4294966000) continue;
      const value = random[0] % 67600;
      code = String.fromCharCode(65 + Math.floor(value / 2600), 65 + Math.floor(value / 100) % 26)
        + String(value % 100).padStart(2, '0');
    } while (!code || usedCodes.has(code) || code === lastCode);
    usedCodes.add(code);
    lastCode = code;
    try { localStorage.setItem('alok-last-export-code', code); } catch {}
    return prefix + ' ' + code + '.zip';
  }

  window.alokCancelExport=()=>{};
  window.fishServerExport=async({character,items,versions,signal,progress})=>{
    const endpoint=(window.FISH_EXPORT_API||'').replace(/\/$/,'');
    if(!endpoint)throw Error('Chưa thiết lập máy chủ xuất file.');
    if(!window.supabase)throw Error('Không tải được chức năng đăng nhập.');
    client ||= window.supabase.createClient('https://kokonossmhkjgngkcbcb.supabase.co','sb_publishable_DZrNfRCHTeQEfkZCg9-kkg_YLLNob3G');
    const session=await client.auth.getSession();
    if(session.error||!session.data.session)throw Error('Bạn cần đăng nhập để tạo file.');
    const headers={Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'};
    const selected={character,items,versions};
    const serialized=JSON.stringify(selected);
    let previous;
    try{previous=JSON.parse(sessionStorage.getItem('fish-export-retry'));}catch{}
    const id=previous?.user===session.data.session.user.id&&previous.request===serialized&&Date.now()-previous.created<3600000?previous.id:crypto.randomUUID();
    try{sessionStorage.setItem('fish-export-retry',JSON.stringify({id,user:session.data.session.user.id,request:serialized,created:Date.now()}));}catch{}
    let registered=false;
    const cancel=()=>{
      // Reuse the known request ID if the initial response was lost.
      fetch(endpoint+'/api/jobs/'+id+'/cancel',{method:'POST',headers,keepalive:true}).catch(()=>{});
    };
    signal?.addEventListener('abort',cancel,{once:true});
    async function json(url,options={}){
      const response=await fetch(endpoint+url,{headers,signal,...options});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Không kết nối được máy chủ.');
      return data;
    }
    try{
      progress(2,'Đang xác thực tài khoản và kiểm tra điểm…');
      const ticket=await json('/api/jobs',{method:'POST',body:JSON.stringify({id,character,items,versions})});
      registered=true;
      const heading=document.getElementById('fish-mod-turns');
      if(heading)heading.textContent='Bạn còn '+ticket.points+' lượt mod';
      const deadline=Date.now()+240000;
      let job;
      while(Date.now()<deadline){
        if(signal?.aborted)throw new DOMException('Đã hủy tạo file.','AbortError');
        job=await json('/api/jobs/'+id);
        if(job.status==='ready')break;
        if(['failed','cancelled'].includes(job.status)){
          try{sessionStorage.removeItem('fish-export-retry');}catch{}
          throw Error((job.error||'Tạo file chưa hoàn tất.')+(job.refunded?' Đã hoàn điểm.':''));
        }
        progress(5+Math.min(85,job.progress*.85),job.status==='queued'?'Đang chờ máy chủ tạo file…':'Máy chủ đang ghép trang phục…');
        await new Promise((resolve,reject)=>{
          const abort=()=>{clearTimeout(timer);reject(new DOMException('Đã hủy tạo file.','AbortError'));};
          const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},1500);
          signal?.addEventListener('abort',abort,{once:true});
        });
      }
      if(job?.status!=='ready')throw Error('Chưa nhận được kết quả. Mã yêu cầu: '+id+'. Không bấm tạo lại trước khi kiểm tra yêu cầu này.');
      const files=[];
      for(let i=0;i<versions.length;i++){
        progress(90+i/versions.length*9,'Đang tải file kết quả…');
        const response=await fetch(endpoint+'/api/jobs/'+id+'/files/'+versions[i],{headers,signal});
        if(!response.ok){const data=await response.json();throw Error((data.error||'Không tải được file.')+' Mã yêu cầu: '+id);}
        files.push({blob:await response.blob(),name:exportFilename(versions[i])});
      }
      try{sessionStorage.removeItem('fish-export-retry');}catch{}
      return files;
    }catch(error){
      if(signal?.aborted&&registered)cancel();
      throw error;
    }finally{signal?.removeEventListener('abort',cancel);window.dispatchEvent(new Event('focus'));}
  };
})();
