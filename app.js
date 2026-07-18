/* Flowmap v0.3 application bootstrap */
(async()=>{const p=globalThis.__FLOWMAP_APP__,b=Uint8Array.from(atob(p),c=>c.charCodeAt(0)),s=new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip")),js=await new Response(s).text();delete globalThis.__FLOWMAP_APP__;(0,eval)(js)})();
