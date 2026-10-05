import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 8787)
const UPSTREAM = (process.env.PROVIDER_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
const KEY = process.env.PROVIDER_API_KEY ?? ''
const MODELS = (process.env.MODELS ?? 'gpt-5.5').split(',').map(x => x.trim()).filter(Boolean)

const json = (data: unknown, status = 200) => Response.json(data, {
  status,
  headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }
})
const auth = (r: Request) => r.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || 'local-user'

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Freebuff Self-Hosted</title><style>body{font-family:system-ui;margin:0;background:#111;color:#eee}main{max-width:900px;margin:auto;padding:24px}textarea{width:100%;height:130px;background:#222;color:#eee;border:1px solid #444;border-radius:8px;padding:12px;box-sizing:border-box}button,select{padding:10px;border-radius:8px;border:1px solid #555;background:#222;color:#eee}button{cursor:pointer}.row{display:flex;gap:8px;margin:10px 0}.msg{white-space:pre-wrap;background:#1b1b1b;padding:12px;border-radius:8px;margin:10px 0}.muted{color:#999}</style></head><body><main><h1>Freebuff Self-Hosted</h1><p class="muted">Sem anúncios e sem quota imposta por este backend.</p><div class="row"><select id="model"></select><button onclick="clearChat()">Limpar</button></div><div id="chat"></div><textarea id="input" placeholder="Digite sua pergunta..."></textarea><div class="row"><button onclick="send()">Enviar</button></div></main><script>
const chat=[]; const model=document.querySelector('#model'); const box=document.querySelector('#chat');
fetch('/api/v1/freebuff/models').then(r=>r.json()).then(x=>x.rows.forEach(m=>{const o=document.createElement('option');o.value=m.displayName;o.textContent=m.displayName;model.appendChild(o)}));
function draw(){box.innerHTML=chat.map(x=>'<div class="msg"><b>'+x.role+'</b>\\n'+x.content.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</div>').join('');}
async function send(){const el=document.querySelector('#input');const text=el.value.trim();if(!text)return;el.value='';chat.push({role:'user',content:text});draw();const r=await fetch('/api/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer local-user'},body:JSON.stringify({model:model.value||'gpt-5.5',messages:chat})});const d=await r.json();const answer=d.choices?.[0]?.message?.content||d.error?.message||JSON.stringify(d);chat.push({role:'assistant',content:answer});draw()}
function clearChat(){chat.length=0;draw()}
</script></body></html>`

async function proxy(req: Request) {
  if (!KEY) return json({ error: { message: 'Configure PROVIDER_API_KEY in .env' } }, 500)
  const body = await req.text()
  const u = await fetch(`${UPSTREAM}/chat/completions`, { method:'POST', headers:{authorization:`Bearer ${KEY}`,'content-type':'application/json'}, body })
  return new Response(u.body,{status:u.status,headers:{'content-type':u.headers.get('content-type')??'application/json','access-control-allow-origin':'*'}})
}

Bun.serve({ port: PORT, async fetch(req) {
  if(req.method==='OPTIONS') return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*'}})
  const p=new URL(req.url).pathname
  if(p==='/'||p==='/index.html') return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})
  if(p==='/health') return json({ok:true,unlimited:true,ads:false})
  if(p==='/api/v1/me') return json({id:`local-${auth(req).slice(0,12)}`,email:'local@selfhosted.invalid',name:'Local User'})
  if(p==='/api/v1/usage') return json({type:'usage-response',usage:0,remainingBalance:null,next_quota_reset:null})
  if(p==='/api/v1/freebuff/models') return json({protocol:1,issuedAt:Date.now(),refreshAt:Date.now()+3600000,rows:MODELS.map((m,i)=>({key:`local-${i}`,handle:`fbm1.${Buffer.from(m).toString('base64url')}`,displayName:m,tagline:'Self-hosted model',premium:false,access:'open'})),recommendedKey:'local-0',fallbackKey:'local-0',fetchId:randomUUID()})
  if(p.startsWith('/api/v1/ads')) return json({ads:[],enabled:false})
  if(p==='/api/v1/freebuff/session') return json({status:'active',accessTier:'full',rateLimitsByModel:{}})
  if(p==='/api/v1/freebuff/session/admission') return json({status:'active',accessTier:'full',rateLimitsByModel:{}})
  if(p==='/api/v1/freebuff/streak') return json({streak:0})
  if(p==='/api/v1/chat/completions' && req.method==='POST') return proxy(req)
  return json({error:'not_found'},404)
}})
console.log(`Running on http://localhost:${PORT}`)
