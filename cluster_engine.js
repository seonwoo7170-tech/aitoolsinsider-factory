const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;800&family=Pretendard:wght@400;700;900&display=swap');
  .vue-body { font-family: 'Pretendard', sans-serif; line-height: 1.8; color: #333; font-size: 16px; max-width: 860px; margin: 0 auto; padding: 20px; word-break: keep-all; }
  .vue-body p { margin: 1.5em 0; line-height: 1.8; }
  .vue-body h2 { font-size: 22px; font-weight: bold; color: #000; background-color: #FFD8A8; padding: 12px 15px; border-radius: 6px; margin: 3em 0 1.5em; line-height: 1.4; border-bottom: none; }
  .vue-body h3 { font-size: 19px; font-weight: bold; color: #000; margin: 2.5em 0 1.2em; line-height: 1.4; }
  .vue-body b { color: #000; font-weight: 800; background: linear-gradient(to top, #fff3cd 50%, transparent 50%); }
  .vue-body ul, .vue-body ol { margin: 1.5em 0; padding-left: 1.5em; }
  .vue-body li { margin-bottom: 0.8em; }
  .vue-thumb { position: relative; width: 100%; border-radius: 12px; overflow: hidden; margin: 3em 0; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
  .vue-thumb img { width: 100%; height: auto; display: block; }
  .vue-title-box { display: inline-flex; flex-direction: column; align-items: center; gap: 8px; }
  .vue-yt-line { background: #000; color: #fff; padding: 5px 20px; font-weight: 900; font-size: 2.5rem; line-height: 1.2; box-shadow: 10px 0 0 #000, -10px 0 0 #000; }
  .vue-yt-line.highlight { background: #6366f1; box-shadow: 10px 0 0 #6366f1, -10px 0 0 #6366f1; }
  .toc-container { background-color: #F8E8EE; padding: 25px; border-radius: 12px; border: 2px solid #000; max-width: 90%; margin: 3em auto; box-shadow: 0 0 15px rgba(255, 105, 180, 0.4); animation: fast-glow 0.8s infinite alternate; }
  .toc-title { font-size: 20px; font-weight: bold; text-align: center; color: #000; margin-bottom: 15px; }
  .toc-container ul { list-style: none; padding: 0; margin: 0; }
  .toc-container li a { text-decoration: none !important; color: #000 !important; font-weight: bold; font-size: 15px; display: block; padding: 5px 0; }
  @keyframes fast-glow { from { box-shadow: 0 0 10px rgba(255,105,180,0.4); } to { box-shadow: 0 0 20px rgba(255,105,180,0.7); } }
  .alert-box { background-color:#fff3cd; border:1px solid #ffc107; border-radius:8px; padding:18px; margin:3em 0; color:#856404; font-size:14px; }
  .summary-box { background-color:#d4edda; border:1px solid #28a745; border-radius:8px; padding:18px; margin:3em 0; color:#155724; font-size:14px; }
  figure { margin: 3em 0; text-align: center; }
  figcaption { font-size: 0.9em; color: #666; margin-top: 10px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 40px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  th { background: #1e293b; color: #fff; padding: 18px; }td { padding: 18px; border-bottom: 1px solid #edf2f7; text-align: center; }
  .vue-ad { height: 40px; margin: 3rem 0; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vue-ad::after { content: 'ADVERTISEMENT'; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 3px; }
</style>`;

async function callAI(model, prompt, isHTML = false, retry = 3) {
  const rules = isHTML ? "[RULES]\n1. USE <p> tags for all text.\n2. NO <h1> or <h2>.\n3. Use <h3> for sub-points.\n4. Use <b> for important phrases.\n5. START DIRECTLY.\n\n" : "PROVIDE ONE SEO TITLE. NO MARKDOWN.\n\n";
  try { const r = await model.generateContent(rules + prompt); return r.response.text().trim(); }
  catch (e) { if (e.message.includes('429') && retry > 0) { await new Promise(res => setTimeout(res, 20000)); return callAI(model, prompt, isHTML, retry - 1); } return ""; }
}

async function genImg(p, k) {
  if(!k) return "";
  const clp = p.replace(/[*#\"\`]/g, '').substring(0, 200).trim();
  console.log('🎨 Generating Image for: ' + clp);
  try {
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: clp + " cinematic lighting, ultra detailed", aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
    const tid = cr.data.data.taskId;
    for(let a=0; a<25; a++) {
      await new Promise(res => setTimeout(res, 8000));
      const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } });
      if(pr.data.data.state === 'success') return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || "";
      if(pr.data.data.state === 'fail') break;
    }
  } catch(e) { console.log('⚠️ Image Error: ' + e.message); }
  return "";
}

function clean(raw, isChapter = false) {
  if(!raw) return "";
  let c = raw.replace(/```html|```/g, "").trim();
  ['head','body','html','meta','title','!DOCTYPE','style','h1','h2'].forEach(t => { c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), ''); });
  c = c.replace(/CHAPTER \d+[:]*/gi, '').replace(/PART \d+[:]*/gi, '').replace(/###/g, '');
  c = c.split('**').map((v, i) => i%2===1 ? '<b>'+v+'</b>' : v).join('').trim();
  c = c.replace(/<p>/gi, "<p data-ke-size='size16'>");
  if(isChapter) c = "<p data-ke-size='size16'>&nbsp;</p>" + c;
  return c;
}

async function run() {
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const target = (config.clusters || [])[0] || config.pillar;
  const lang = config.lang || 'ko';
  const bId = config.blog_id.toString().replace(/[^0-9]/g, '');

  console.log("🚀 Step 1: Viral Title");
  let titleRaw = await callAI(model, "Create ONE high-impact SEO title for: " + target + " in " + lang, false);
  const title = titleRaw.replace(/[\"\\\`\n*#-]/g, '').trim();

  console.log("🎨 Step 2: Main Thumbnail");
  const imgUrl = await genImg(title, process.env.KIE_API_KEY);

  console.log("📝 Step 3: Elite Summary");
  const sumRaw = await callAI(model, "Summarize '" + title + "' in 5 points. Language: " + lang, false);

  const words = title.split(' ');
  let ytTitleHtml = "<div class='vue-title-box'>";
  if(words.length > 3) {
    const mid = Math.ceil(words.length / 2);
    ytTitleHtml += `<span class='vue-yt-line'>${words.slice(0, mid).join(' ')}</span>`;
    ytTitleHtml += `<span class='vue-yt-line highlight'>${words.slice(mid).join(' ')}</span>`;
  } else { ytTitleHtml += `<span class='vue-yt-line highlight'>${title}</span>`; }
  ytTitleHtml += "</div>";

  const cls = lang === 'en' ? [
    { t: "The Paradigm Shift: Decoding the Future" },
    { t: "Expert Analysis: Inside the Engine" },
    { t: "Action Plan: Practical ROI Blueprint" },
    { t: "The ROI Masterclass: Harvesting Gains" },
    { t: "The Final Verdict: Dominating 2026" }
  ] : [
    { t: "충격적 진실과 우리가 몰랐던 현실" },
    { t: "상위 1% 기술 분석과 전문가의 시선" },
    { t: "지금 당장 적용하는 실전 생존 가이드" },
    { t: "마스터의 평결: 미래를 장악할 마침표" }
  ];

  const tocHtml = `<div class='toc-container'><div class='toc-title'>📋 목차</div><ul>` + 
    cls.map((c, i) => `<li><a href='#section${i+1}'>🚀 ${c.t}</a></li>`).join('') + 
    `<li><a href='#faq'>❓ 자주 묻는 질문 (FAQ)</a></li></ul></div>`;

  let bodyContent = STYLE + "<div class='vue-body'>" + 
    (imgUrl ? "<figure><img src='" + imgUrl + "' alt='" + title + "'><figcaption>" + title + "</figcaption></figure>" : "") +
    "<p data-ke-size='size16'>" + title + " - 더 자세히 알아볼까요?</p>" + tocHtml + 
    "<div class='summary-box'><span style='font-weight:900;'>📌 요약:</span><br>" + sumRaw + "</div><div class='vue-ad'></div>";

  for(let p=0; p < cls.length; p++) {
    console.log("📘 Writing Section " + (p+1));
    let subImgHtml = "";
    if([1, 2, 3].includes(p)) {
      const siu = await genImg(title + " snapshot " + (p+1), process.env.KIE_API_KEY);
      if(siu) subImgHtml = "<figure><img src='" + siu + "'></figure>";
    }
    const prompt = "Write chapter: " + cls[p].t + " for topic: " + title + " in " + lang + ". Use story-telling.";
    const contentRaw = await callAI(model, prompt, true);
    const content = clean(contentRaw, true);
    bodyContent += `<h2 id='section${p+1}'>🚀 ${cls[p].t}</h2>` + subImgHtml + content + "<div class='vue-ad'></div>";
  }

  bodyContent += `<div class='alert-box'>⚠️ 면책 문구: 본 정보는 참고용이며 실제 결과는 다를 수 있습니다.</div></div>`;

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const blogger = google.blogger({ version: 'v3', auth });
  const requestBody = { title, content: bodyContent };
  if (config.random_delay) {
    let pubDate = new Date();
    pubDate.setMinutes(pubDate.getMinutes() + Math.floor(Math.random() * 720));
    requestBody.published = pubDate.toISOString();
  }
  await blogger.posts.insert({ blogId: bId, requestBody });
  console.log("✅ SUCCESS");
}
run();