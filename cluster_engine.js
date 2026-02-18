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
  .toc-container { background-color: #F8E8EE; padding: 25px; border-radius: 12px; border: 2px solid #000; margin: 3em auto; animation: fast-glow 0.8s infinite alternate; }
  .summary-box { background-color:#d4edda; border:1px solid #28a745; border-radius:12px; padding:25px; margin:4em 0; color:#155724; }
  .faq-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 15px; padding: 30px; margin: 5em 0; }
  .faq-item { margin-bottom: 25px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 15px; }
  .faq-q { font-weight: 900; color: #0f172a; font-size: 18px; display: block; }
  .faq-a { color: #475569; line-height: 1.6; }
  .internal-link-box { background: #eff6ff; border: 1px solid #3b82f6; border-radius: 12px; padding: 25px; margin: 4em 0; }
  .internal-link-box a { color: #2563eb; font-weight: bold; text-decoration: none; display: block; margin: 10px 0; }
  .alert-box { background-color:#fff3cd; border:1px solid #ffc107; border-radius:12px; padding:20px; margin:4em 0; color:#856404; font-size:14px; }
  @keyframes fast-glow { from { box-shadow: 0 0 10px rgba(255,105,180,0.4); } to { box-shadow: 0 0 20px rgba(255,105,180,0.7); } }
  .vue-ad { height: 40px; margin: 3.5rem 0; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vue-ad::after { content: 'ADVERTISEMENT'; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 3px; }
</style>`;

const LABELS = { 
  ko: { toc: '📋 목차', sum: '📌 핵심 요약', faq: '❓ 자주 묻는 질문', links: '🔗 연관 가이드', p_intro: '종합 리포트', disclaimer: '본 정보는 참고용이며 실제 결과는 다를 수 있습니다.' }, 
  en: { toc: '📋 Contents', sum: '📌 Summary', faq: '❓ FAQ', links: '🔗 Master Insights', p_intro: 'Deep Analysis', disclaimer: 'This information is for reference only.' } 
};

function dash() { console.log('\n' + '='.repeat(60) + '\n'); }
function logInfo(m) { console.log('💡 [정보] ' + m); }
function logStep(m) { console.log('🚀 [단계] ' + m); }
function logSuccess(m) { console.log('✅ [성공] ' + m); }
function logError(m) { console.log('❌ [에러] ' + m); }

async function githubUpsert(path, content) {
  const token = process.env.GITHUB_TOKEN; const repo = process.env.GITHUB_REPOSITORY; const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  try { 
    const res = await axios.get(url, { headers: { Authorization: `token ${token}` } }); 
    await axios.put(url, { message: '[VUE] Sync', content: Buffer.from(content).toString('base64'), sha: res.data.sha }, { headers: { Authorization: `token ${token}` } }); 
    logSuccess('GitHub 데이터 동기화 성공'); 
  } catch(e) { logError('GitHub 동기화 실패: ' + e.message); }
}

async function callAI(model, prompt, isHTML = false, forceEnglish = false, retry = 3, isTitle = false) {
  let rules = isHTML ? "[RULES] HTML snippet. NO <h1>/<h2>. 1800+ chars. START DIRECTLY.\n\n" : (forceEnglish ? "OUTPUT ONLY PLAIN ENGLISH description for AI image generator. NO KOREAN.\n\n" : "NO MARKDOWN. NO INTRO.\n\n");
  if(isTitle) {
    rules = "[🚨 TASK: SEO LONG-TAIL SPECIALIST]\n1. Expand into high-ranking GOOGLE LONG-TAIL KEYWORD.\n2. Target #1 Google results.\n3. Professional/Authoritative ONE line only.\n4. MAX 85 chars. NO clickbait.\n\n";
  }
  try { 
    const r = await model.generateContent(rules + prompt); 
    let text = r.response.text().trim(); 
    if(isTitle) text = text.split('\n')[0].replace(/[\"#*>-]/g, '').trim().substring(0, 85);
    return text;
  } catch (e) { 
    if (retry > 0) { logInfo('AI 재시도 중...'); await new Promise(res => setTimeout(res, 15000)); return callAI(model, prompt, isHTML, forceEnglish, retry - 1, isTitle); } 
    throw e;
  }
}

async function genImg(desc, k) {
  if(!k || !desc) return ""; 
  logInfo('이미지 생성 프롬프트: ' + desc);
  try {
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: desc.replace(/[\"\\\`\n*#-]/g, '') + ", cinematic, 8k, no humans", aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
    const tid = cr.data.data.taskId;
    for(let a=1; a<=25; a++) {
      process.stdout.write(`    .. 이미지 렌더링 중 (${a*8}초) \r`);
      await new Promise(res => setTimeout(res, 8000));
      const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } });
      if(pr.data.data.state === 'success') { console.log(''); return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || ""; }
      if(pr.data.data.state === 'fail') break;
    }
  } catch(e) { logError('이미지 생성 실패: ' + e.message); } return "";
}

function clean(raw, isChapter = false) {
  if(!raw) return ""; let c = raw.replace(/#+ /g, '').replace(/\*\*/g, '').replace(/\`/g, '').replace(/- /g, '').trim();
  c = c.split('\n').filter(l => l.trim()).join('<br>');
  c = c.replace(/<p>/gi, "<p data-ke-size='size16'>"); 
  if(isChapter) c = "<p data-ke-size='size16'>&nbsp;</p>" + c; return c;
}

async function writeAndPost(model, target, lang, blogger, bId, config, isPillar, subLinks, publishTime, seqLabel) {
  const L = LABELS[lang] || LABELS.en;
  logStep(`${seqLabel} 시작: ${target} [${publishTime.toLocaleString('ko-KR')}]`);
  
  const title = await callAI(model, "Create one SEO Long-tail title for: '" + target + "'", false, false, 3, true);
  logSuccess('확정 제목: ' + title);
  
  const imgUrl = await genImg(await callAI(model, "Visual for: '" + title + "'", false, true), process.env.KIE_API_KEY);
  const sumRaw = await callAI(model, "5 summary points for: " + title, false);
  const planR = await callAI(model, "JSON array of 4 chapter titles for: " + title, false);
  const cls = JSON.parse(planR.replace(/\`\`\`json|\`\`\`/g, '').trim());

  let body = STYLE + "<div class='vue-body'>" + (imgUrl ? `<figure style='position:relative;border-radius:12px;overflow:hidden;margin:3em 0;'><img src='${imgUrl}' style='width:100%;'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;padding:25px;'><div style='color:#fff;font-weight:900;font-size:2.5rem;text-shadow:0 4px 15px rgba(0,0,0,0.5);'>${title}</div></div></figure>` : "") + 
    `<div class='toc-container'><div style='font-size:20px;font-weight:900;text-align:center;'>${L.toc}</div><ul>` + cls.map((t,i)=>`<li><a href='#section${i+1}'>🚀 ${t}</a></li>`).join('') + `<li><a href='#faq'>${L.faq}</a></li></ul></div>` +
    `<div class='summary-box'><b>${L.sum}</b><br>${sumRaw}</div>`;

  for(let p=0; p<cls.length; p++) {
    logInfo(`   - 섹션 ${p+1}/4 작성 중: ${cls[p]}`);
    const content = await callAI(model, "Write section for: '" + cls[p] + "' in HTML style.", true);
    body += `<h2 id='section${p+1}'>🚀 ${cls[p]}</h2>` + clean(content, true) + "<div class='vue-ad'></div>";
  }

  if(isPillar && subLinks.length > 0) body += `<div class='internal-link-box'><b>${L.links}</b>` + subLinks.map(s => `<a href='${s.url}'>📌 ${s.title}</a>`).join('') + "</div>";
  
  const faqR = await callAI(model, "5 FAQs JSON {q,a}", false);
  const faqs = JSON.parse(faqR.replace(/\`\`\`json|\`\`\`/g, '').trim());
  body += `<div id='faq' class='faq-section'><h3>${L.faq}</h3>` + faqs.map(f=>`<div class='faq-item'><b>Q. ${f.q}</b><div>${f.a}</div></div>`).join('') + `</div><div class='alert-box'>${L.disclaimer}</div></div>`;

  const res = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body, published: publishTime.toISOString() } });
  logSuccess(`발행 완료: ${res.data.url}`);
  return { title, url: res.data.url };
}

async function run() {
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET); auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const blogger = google.blogger({ version: 'v3', auth }); const bId = config.blog_id.toString().replace(/[^0-9]/g, '');

  const allClusters = config.clusters || []; const used = allClusters.splice(0, 4); const subLinks = [];
  let currentTime = new Date();

  dash(); console.log('🚀 VUE 하이퍼 클러스터 가동 (4+1)'); dash();
  for(let i=0; i < used.length; i++) {
    currentTime.setMinutes(currentTime.getMinutes() + 120 + Math.floor(Math.random() * 61));
    try { const r = await writeAndPost(model, used[i], config.lang, blogger, bId, config, false, [], new Date(currentTime), `[서브글 ${i+1}/4]`); subLinks.push(r); } catch(e) { logError(`서브 ${i+1} 실패: ` + e.message); }
    dash();
  }
  if(used.length > 0) {
    currentTime.setMinutes(currentTime.getMinutes() + 120 + Math.floor(Math.random() * 61));
    try { await writeAndPost(model, config.pillar, config.lang, blogger, bId, config, true, subLinks, new Date(currentTime), '[마스터글]'); } catch(e) { logError('마스터 실패: ' + e.message); }
    dash();
  }
  config.clusters = allClusters; await githubUpsert('cluster_config.json', JSON.stringify(config, null, 2));
}
run();