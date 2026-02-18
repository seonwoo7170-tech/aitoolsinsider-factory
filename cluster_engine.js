const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;800&family=Pretendard:wght@400;700;900&display=swap');
  .vue-body { font-family: 'Pretendard', sans-serif; line-height: 1.8; color: #333; font-size: 16px; max-width: 860px; margin: 0 auto; padding: 20px; word-break: keep-all; }
  .vue-body p { margin: 1.5em 0; line-height: 1.8; }
  .vue-body h2 { font-size: 24px; font-weight: bold; color: #000; background-color: #FFD8A8; padding: 15px 20px; border-radius: 8px; margin: 4em 0 1.8em; line-height: 1.3; border-left: 8px solid #000; }
  .vue-body h3 { font-size: 20px; font-weight: bold; color: #000; margin: 2.5em 0 1.2em; line-height: 1.4; padding-bottom: 8px; border-bottom: 2px solid #eee; display: flex; align-items: center; gap: 8px; }
  .vue-body h3::before { content: '📍'; font-size: 18px; }
  .vue-body b { color: #000; font-weight: 800; background: linear-gradient(to top, #fff3cd 50%, transparent 50%); }
  .vue-thumb { position: relative; width: 100%; border-radius: 12px; overflow: hidden; margin: 3.5em 0; box-shadow: 0 15px 35px rgba(0,0,0,0.15); }
  @keyframes fast-glow { from { box-shadow: 0 0 10px rgba(255,105,180,0.4); } to { box-shadow: 0 0 20px rgba(255,105,180,0.7); } }
  .internal-link-box { background: #eff6ff; border: 1px solid #3b82f6; border-radius: 12px; padding: 25px; margin: 4em 0; }
  .internal-link-box a { color: #2563eb; font-weight: bold; text-decoration: none; display: block; margin: 10px 0; }
  .faq-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 15px; padding: 30px; margin: 5em 0; }
  .faq-q { font-weight: 900; color: #0f172a; font-size: 18px; display: block; }
  .faq-a { color: #475569; line-height: 1.6; }
</style>`;

const LABELS = { ko: { toc: '📋 목차', sum: '📌 핵심 요약', faq: '❓ 자주 묻는 질문', links: '🔗 연관 가이드', p_intro: '종합 리포트' }, en: { toc: '📋 Contents', sum: '📌 Summary', faq: '❓ FAQ', links: '🔗 Related', p_intro: 'Comprehensive Report' } };

async function githubUpsert(path, content) {
  const token = process.env.GITHUB_TOKEN; const repo = process.env.GITHUB_REPOSITORY; const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  try { const res = await axios.get(url, { headers: { Authorization: `token ${token}` } }); await axios.put(url, { message: '[VUE] Sync', content: Buffer.from(content).toString('base64'), sha: res.data.sha }, { headers: { Authorization: `token ${token}` } }); } catch(e) {}
}

async function callAI(model, prompt, isHTML = false, forceEnglish = false) {
  const rules = isHTML ? "[RULES] HTML snippet. NO title in body. Use <h3>. MIN 1800 chars. START DIRECTLY.\n\n" : (forceEnglish ? "OUTPUT ONLY PLAIN ENGLISH.\n\n" : "NO MARKDOWN.\n\n");
  try { const r = await model.generateContent(rules + prompt); return r.response.text().trim(); } catch (e) { return ""; }
}

async function genImg(p, k) {
  if(!k || !p) return ""; try {
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: p.replace(/[\"\\\`\n*#-]/g, '') + ", cinematic, 8k, no humans", aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
    const tid = cr.data.data.taskId; for(let a=0; a<25; a++) { await new Promise(res => setTimeout(res, 8000)); const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } }); if(pr.data.data.state === 'success') return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || ""; if(pr.data.data.state === 'fail') break; }
  } catch(e) {} return "";
}

function clean(raw, isChapter = false) {
  if(!raw) return ""; let c = raw.replace(/```html|```/g, "").trim();
  ['head','body','html','meta','title','!DOCTYPE','style','h1','h2'].forEach(t => { c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), ''); });
  c = c.replace(/CHAPTER \d+[:]*/gi, '').replace(/PART \d+[:]*/gi, '').replace(/###/g, '').replace(/\*\*/g, '').replace(/<p>/gi, "<p data-ke-size='size16'>");
  if(isChapter) c = "<p data-ke-size='size16'>&nbsp;</p>" + c; return c;
}

async function writeAndPost(model, target, lang, blogger, bId, isPillar = false, subLinks = [], publishTime) {
  const L = LABELS[lang] || LABELS.en; console.log(`✍️ Posting: ${target} @ ${publishTime.toISOString()}`);
  const titleRaw = await callAI(model, "Write viral title for: '" + target + "' in " + lang, false);
  const title = titleRaw.replace(/[\"\\\`\n*#-]/gi, '').trim();
  const imgUrl = await genImg(await callAI(model, "Visual prompt for: '" + target + "' (English, No humans)", false, true), process.env.KIE_API_KEY);
  const sumRaw = await callAI(model, "5 summary points for: " + title + " in " + lang, false);
  const planR = await callAI(model, "4 chapters for: " + title + " in " + lang + ". JSON ['T1','T2','T3','T4']", false);
  const cls = JSON.parse(planR.replace(/```json|```/g, '').trim());

  let body = STYLE + "<div class='vue-body'>" + (imgUrl ? `<figure style='position:relative;border-radius:12px;overflow:hidden;margin:3em 0;'><img src='${imgUrl}' style='width:100%;'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;padding:25px;'><div style='color:#fff;font-weight:900;font-size:2.2rem;'>${title}</div></div></figure>` : "") + 
    `<div class='summary-box'><b>${L.sum}</b><br>${sumRaw}</div>`;

  for(let p=0; p<cls.length; p++) {
    const siu = [1, 2].includes(p) ? await genImg(await callAI(model, "Visual for: "+cls[p], false, true), process.env.KIE_API_KEY) : "";
    body += `<h2 id='section${p+1}'>🚀 ${cls[p]}</h2>` + (siu ? `<figure><img src='${siu}'></figure>` : "") + clean(await callAI(model, "Write section: '"+cls[p]+"'. NO title.", true), true);
  }

  if(isPillar && subLinks.length > 0) body += `<div class='internal-link-box'><b>${L.links}</b>` + subLinks.map(s => `<a href='${s.url}'>📌 ${s.title}</a>`).join('') + "</div>";

  const faqR = await callAI(model, "5 FAQs for: "+title+" in "+lang+". JSON [{q,a}]", false);
  const faqs = JSON.parse(faqR.replace(/```json|```/g, '').trim());
  body += `<div class='faq-section'><h3>${L.faq}</h3>` + faqs.map(f=>`<div class='faq-item'><span class='faq-q'>Q. ${f.q}</span><div class='faq-a'>${f.a}</div></div>`).join('') + "</div></div>";

  const res = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body, published: publishTime.toISOString() } });
  return { title, url: res.data.url };
}

async function run() {
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET); auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const blogger = google.blogger({ version: 'v3', auth }); const bId = config.blog_id.toString().replace(/[^0-9]/g, '');

  const allClusters = config.clusters || []; const used = allClusters.splice(0, 4); const subLinks = [];
  let currentTime = new Date();

  for(let i=0; i < used.length; i++) {
    // Stagger: 120 ~ 180 min gap for EACH post
    let delay = 120 + Math.floor(Math.random() * 61);
    currentTime.setMinutes(currentTime.getMinutes() + delay);
    try { const r = await writeAndPost(model, used[i], config.lang, blogger, bId, false, [], new Date(currentTime)); subLinks.push(r); } catch(e) { console.log('⚠️ Sub failed'); }
  }

  if(used.length > 0) {
    let delay = 120 + Math.floor(Math.random() * 61);
    currentTime.setMinutes(currentTime.getMinutes() + delay);
    try { await writeAndPost(model, config.pillar, config.lang, blogger, bId, true, subLinks, new Date(currentTime)); } catch(e) { console.log('⚠️ Pillar failed'); }
  }

  config.clusters = allClusters; await githubUpsert('cluster_config.json', JSON.stringify(config, null, 2));
}
run();