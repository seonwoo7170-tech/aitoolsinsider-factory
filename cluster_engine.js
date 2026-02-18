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
  .vue-body img { width: 100%; border-radius: 12px; margin: 2em 0; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
  .summary-box { background-color:#d4edda; border:1px solid #28a745; border-radius:12px; padding:25px; margin:4em 0; }
  .internal-link-box { background: #eff6ff; border: 1px solid #3b82f6; border-radius: 12px; padding: 25px; margin: 4em 0; }
  .btn-more { display: inline-block; background: #000; color: #fff !important; padding: 15px 35px; border-radius: 50px; text-decoration: none !important; font-weight: 900; margin: 2em 0; transition: 0.3s; }
  .btn-more:hover { transform: scale(1.05); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
</style>`;

const LABELS = { ko: { sum: '📌 핵심 요약', btn: '전체 가이드 읽어보기 🚀', links: '🔗 연관 추천 콘텐츠' }, en: { sum: '📌 Summary', btn: 'Read Full Guide 🚀', links: '🔗 Recommended Reading' } };

function dash() { console.log('\n' + '='.repeat(60) + '\n'); }
function logInfo(m) { console.log('💡 [정보] ' + m); }
function logStep(m) { console.log('🚀 [단계] ' + m); }
function logSuccess(m) { console.log('✅ [성공] ' + m); }
function logError(m) { console.log('❌ [에러] ' + m); }

function clean(raw) {
  if(!raw) return "";
  let c = raw.replace(/\`\`\`[a-z]*\n?/gi, '').replace(/\`\`\`/g, '').trim();
  c = c.replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<html[\s\S]*?>/gi, '').replace(/<head>[\s\S]*?<\/head>/gi, '').replace(/<body[\s\S]*?>/gi, '').replace(/<\/html>|<\/body>|<title>[\s\S]*?<\/title>|<style[\s\S]*?<\/style>/gi, '');
  c = c.replace(/<section[^>]*>|<\/section>/gi, '').replace(/^\s*<h[1234][^>]*>[\s\S]*?<\/h[1234]>\s*/i, '');
  c = c.replace(/<p>/gi, "<p data-ke-size='size16'>");
  return c.trim();
}

async function callAI(model, prompt, isHTML = false, forceEnglish = false, isTitle = false) {
  let rules = isHTML ? "[RULES] PURE HTML SNIPPET ONLY. NO <html>. START DIRECTLY WITH CONTENT.\n\n" : "NO MARKDOWN. NO INTRO.\n\n";
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
  logInfo('이미지 프롬프트: ' + desc.substring(0, 60) + '...');
  try {
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: desc.replace(/[\"\\\\\`\n*#-]/g, '') + ", photorealistic, 8k, cinematic", aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
    const tid = cr.data.data.taskId;
    logInfo('이미지 태스크 ID: ' + tid);
    for(let a=1; a<=20; a++) {
      process.stdout.write(`    .. 렌더링 중 (${a*8}초) \r`);
      await new Promise(res => setTimeout(res, 8000));
      const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } });
      if(pr.data.data.state === 'success') { console.log(''); return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || ""; }
      if(pr.data.data.state === 'fail') break;
    }
  } catch(e) { logError("이미지 생성 실패: " + e.message); } return "";
}

async function writeAndPost(model, target, lang, blogger, bId, isPillar, prevLinks, publishTime, seqLabel) {
  const L = LABELS[lang] || LABELS.en;
  dash();
  logStep(`[${seqLabel}] 프로세스 기동: ${target}`);
  const title = await callAI(model, "Google SEO Long-tail Title for: " + target, false, false, true);
  logSuccess('확정 롱테일 제목: ' + title);
  
  const heroImg = await genImg(await callAI(model, "Visual for: " + title, false, true), process.env.KIE_API_KEY);
  if(heroImg) logSuccess('히어로 이미지 생성 완료');
  
  const sumRaw = await callAI(model, "5 summary points for: " + title, false);
  logInfo('내용 요약 생성 완료');
  
  let cls = [];
  if(isPillar && prevLinks.length > 0) {
    cls = prevLinks.map(s => s.title);
    logInfo('필러 챕터 구성: 연관 서브글 4개 매칭');
  } else {
    const planR = await callAI(model, "JSON array of 4 chapter titles for: " + title, false);
    cls = JSON.parse(planR.replace(/\`\`\`json|\`\`\`/g, '').trim());
    logInfo('본문 챕터 구성 완료');
  }

  let body = STYLE + `<div class='vue-body'>` + (heroImg ? `<figure style='position:relative;'><img src='${heroImg}'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;padding:25px;font-weight:900;color:#fff;font-size:2.5rem;'>${title}</div></figure>` : "") + `<div class='summary-box'><b>${L.sum}</b><br>${sumRaw}</div>`;

  if(!isPillar && prevLinks.length > 0) {
    const last = prevLinks[prevLinks.length - 1];
    body += `<div class='internal-link-box'><b>${L.links}</b><a href='${last.url}'>📌 ${last.title}</a></div>`;
    logInfo('거미줄 내부 링크 연결: ' + last.title);
  }

  for(let p=0; p<cls.length; p++) {
    logInfo(`  -> 섹션 ${p+1} 집필 시작... (${cls[p]})`);
    let secImg = "";
    if(p === 1 || p === 3) secImg = await genImg(await callAI(model, "Visual for: " + cls[p], false, true), process.env.KIE_API_KEY);
    
    const rawContent = await callAI(model, isPillar ? "Summary introduction for section: " + cls[p] : "Deep analysis for: " + cls[p], true);
    body += `<h2>🚀 ${cls[p]}</h2>` + (secImg ? `<img src='${secImg}'>` : "") + clean(rawContent);
    if(isPillar && prevLinks[p]) body += `<div style='text-align:center;'><a href='${prevLinks[p].url}' class='btn-more'>${L.btn}</a></div>`;
  }

  body += "</div>";
  const res = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body, published: publishTime.toISOString() } });
  logSuccess('발행 완료: ' + res.data.url);
  return { title, url: res.data.url };
}

async function run() {
  logStep('VUE 하이퍼 클러스터 엔진 가동 준비...');
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET); 
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const blogger = google.blogger({ version: 'v3', auth });

  const used = (config.clusters || []).splice(0, 4);
  const subLinks = [];
  let currentTime = new Date();

  for(let i=0; i < used.length; i++) {
    currentTime.setMinutes(currentTime.getMinutes() + 120 + Math.floor(Math.random() * 61));
    const r = await writeAndPost(model, used[i], config.lang, blogger, config.blog_id, false, subLinks, new Date(currentTime), `서브글 ${i+1}/4`);
    subLinks.push(r);
  }
  if(used.length > 0) {
    currentTime.setMinutes(currentTime.getMinutes() + 120);
    await writeAndPost(model, config.pillar, config.lang, blogger, config.blog_id, true, subLinks, new Date(currentTime), '마스터 메인글');
  }
  
  config.clusters = (config.clusters || []).slice(4);
  const token = process.env.GITHUB_TOKEN; const repo = process.env.GITHUB_REPOSITORY;
  const url = `https://api.github.com/repos/${repo}/contents/cluster_config.json`;
  try {
    const gRes = await axios.get(url, { headers: { Authorization: `token ${token}` } });
    await axios.put(url, { message: '[VUE] Sync', content: Buffer.from(JSON.stringify(config, null, 2)).toString('base64'), sha: gRes.data.sha }, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } });
    logSuccess('시스템 데이터 동기화 완료');
  } catch(e) { logError('동기화 실패: ' + e.message); }
  dash();
  logSuccess('오늘의 모든 과업이 완료되었습니다. 내일 뵙겠습니다, 대표님!');
}
run();