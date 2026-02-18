const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;800&family=Pretendard:wght@400;700;900&display=swap');
  .vue-body { font-family: 'Pretendard', sans-serif; line-height: 1.8; color: #333; font-size: 16px; max-width: 860px; margin: 0 auto; padding: 20px; word-break: keep-all; }
  .vue-body h2 { font-size: 24px; font-weight: bold; color: #000; background-color: #FFD8A8; padding: 15px 20px; border-radius: 8px; margin: 4em 0 1.8em; line-height: 1.3; border-left: 8px solid #000; }
  .vue-body h3 { font-size: 20px; font-weight: bold; color: #000; margin: 2.5em 0 1.2em; line-height: 1.4; padding-bottom: 8px; border-bottom: 2px solid #eee; display: flex; align-items: center; gap: 8px; }
  .vue-body h3::before { content: '📍'; font-size: 18px; }
  .summary-box { background-color:#d4edda; border:1px solid #28a745; border-radius:12px; padding:25px; margin:4em 0; }
  .internal-link-box { background: #eff6ff; border: 1px solid #3b82f6; border-radius: 12px; padding: 25px; margin: 4em 0; }
  .internal-link-box b { color: #1e40af; display: block; margin-bottom: 12px; }
  .internal-link-box a { color: #2563eb; font-weight: bold; text-decoration: none; display: block; margin: 8px 0; border-left: 3px solid #3b82f6; padding-left: 12px; transition: 0.2s; }
  .btn-more { display: inline-block; background: #000; color: #fff !important; padding: 15px 35px; border-radius: 50px; text-decoration: none !important; font-weight: 900; margin: 2em 0; }
  .faq-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 15px; padding: 30px; margin: 5em 0; }
</style>`;

const LABELS = { ko: { sum: '📌 핵심 요약', btn: '전체 가이드 읽어보기 🚀', links: '🔗 연관 추천 콘텐츠' }, en: { sum: '📌 Summary', btn: 'Read Full Guide 🚀', links: '🔗 Recommended Reading' } };

function dash() { console.log('\n' + '='.repeat(60) + '\n'); }
function logStep(m) { console.log('🚀 [단계] ' + m); }
function logSuccess(m) { console.log('✅ [성공] ' + m); }
function logError(m) { console.log('❌ [에러] ' + m); }

async function githubUpsert(path, content) {
  const token = process.env.GITHUB_TOKEN; const repo = process.env.GITHUB_REPOSITORY; const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  try { 
    const res = await axios.get(url, { headers: { Authorization: `token ${token}` } }); 
    await axios.put(url, { message: '[VUE] Sync Success', content: Buffer.from(content).toString('base64'), sha: res.data.sha }, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }); 
  } catch(e) { console.log('❌ GitHub Sync Error: ' + e.message); }
}

async function callAI(model, prompt, isHTML = false, forceEnglish = false, isTitle = false) {
  let rules = isHTML ? "[RULES] PURE HTML SNIPPET ONLY. NO <html>. NO REPEATING CHAPTER TITLE. START DIRECTLY. MIN 1800 chars.\n\n" : "NO MARKDOWN. NO INTRO.\n\n";
  if(isTitle) rules = "[🚨 TASK: SEO LONG-TAIL SPECIALIST]\n1. Expand keyword into high-ranking GOOGLE LONG-TAIL.\n2. MAX 85 chars. ONE line only.\n\n";
  try {
    const r = await model.generateContent(rules + prompt);
    let text = r.response.text().trim();
    if(isTitle) text = text.split('\n')[0].replace(/[\"#*>-]/g, '').trim().substring(0, 85);
    return text;
  } catch (e) { throw e; }
}

async function genImg(desc, k) {
  if(!k || !desc) return "";
  try {
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: desc.replace(/[\"\\\`\n*#-]/g, '') + ", cinematic, award winning", aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
    const tid = cr.data.data.taskId; for(let a=1; a<=25; a++) { await new Promise(res => setTimeout(res, 8000)); const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } }); if(pr.data.data.state === 'success') return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || ""; if(pr.data.data.state === 'fail') break; }
  } catch(e) { return ""; }
}

async function writeAndPost(model, target, lang, blogger, bId, isPillar, prevLinks, publishTime, seqLabel) {
  const L = LABELS[lang] || LABELS.en;
  logStep(`${seqLabel} 시작: ${target}`);
  const title = await callAI(model, "SEO Long-tail Title for: " + target, false, false, true);
  const imgUrl = await genImg(await callAI(model, "Visual for: " + title, false, true), process.env.KIE_API_KEY);
  const sumRaw = await callAI(model, "5 summary points for: " + title, false);
  
  let cls = [];
  if(isPillar && prevLinks.length > 0) {
    cls = prevLinks.map(s => s.title);
  } else {
    const planR = await callAI(model, "JSON array of 4 chapter titles for: " + title, false);
    cls = JSON.parse(planR.replace(/\`\`\`json|\`\`\`/g, '').trim());
  }

  let body = STYLE + `<div class='vue-body'>` + (imgUrl ? `<figure style='position:relative;'><img src='${imgUrl}' style='width:100%;'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;padding:25px;font-weight:900;color:#fff;font-size:2.5rem;'>${title}</div></figure>` : "") + 
    `<div class='summary-box'><b>${L.sum}</b><br>${sumRaw}</div>`;

  // Spider Web Interlink
  if(!isPillar && prevLinks.length > 0) {
    const last = prevLinks[prevLinks.length - 1];
    body += `<div class='internal-link-box'><b>${L.links}</b><a href='${last.url}'>📌 ${last.title}</a></div>`;
  }

  for(let p=0; p<cls.length; p++) {
    const prompt = isPillar ? `Write a professional intro summary (1200+ chars) of this sub-topic: '${cls[p]}'. Entice clicks.` : `Deep analysis of: '${cls[p]}'. Use <h3>.`;
    const content = await callAI(model, prompt, true);
    body += `<h2>🚀 ${cls[p]}</h2>` + content;
    if(isPillar && prevLinks[p]) body += `<div style='text-align:center;'><a href='${prevLinks[p].url}' class='btn-more'>${L.btn}</a></div>`;
  }

  body += "</div>";
  const res = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body, published: publishTime.toISOString() } });
  logSuccess('발행 완료: ' + res.data.url);
  return { title, url: res.data.url };
}

async function run() {
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET); auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const blogger = google.blogger({ version: 'v3', auth });
  
  const allClusters = config.clusters || []; 
  const used = allClusters.splice(0, 4); // <-- FIXED: 'used' is now properly defined here!
  const subLinks = [];
  let currentTime = new Date();

  dash(); console.log('🚀 VUE 하이퍼 클러스터 가동 (4+1)'); dash();
  for(let i=0; i < used.length; i++) {
    currentTime.setMinutes(currentTime.getMinutes() + 120 + Math.floor(Math.random() * 61));
    try { const r = await writeAndPost(model, used[i], config.lang, blogger, config.blog_id, false, subLinks, new Date(currentTime), `서브 ${i+1}`); subLinks.push(r); } catch(e) { logError(e.message); }
    dash();
  }
  if(used.length > 0) {
    currentTime.setMinutes(currentTime.getMinutes() + 120);
    try { await writeAndPost(model, config.pillar, config.lang, blogger, config.blog_id, true, subLinks, new Date(currentTime), '마스터 필러'); } catch(e) { logError(e.message); }
    dash();
  }
  config.clusters = allClusters; await githubUpsert('cluster_config.json', JSON.stringify(config, null, 2));
}
run();