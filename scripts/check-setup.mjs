import fs from 'node:fs';
const file='.env.local';
if(!fs.existsSync(file)){console.error('Missing .env.local. Copy .env.example and add your credentials.');process.exit(1);}
const entries=Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
let missing=false;
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']){const ok=!!entries[key]&&!entries[key].includes('YOUR_PROJECT');console.log(`${key}: ${ok?'set':'MISSING'}`);missing||=!ok;}
const provider=entries.AI_PROVIDER||'openai';const key={openai:'OPENAI_API_KEY',gemini:'GEMINI_API_KEY',groq:'GROQ_API_KEY',local:'LOCAL_LLM_BASE_URL'}[provider];
console.log(`Default AI provider: ${provider}`);
console.log(`Provider configuration: ${key&&entries[key]?'set':'MISSING'}`);
missing||=!key||!entries[key];
console.log('This checks configuration presence only. It does not send your keys or test provider billing.');
process.exitCode=missing?1:0;
