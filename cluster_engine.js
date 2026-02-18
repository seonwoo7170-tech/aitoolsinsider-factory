const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;800&family=Pretendard:wght@400;700;900&display=swap');
  .vue-body { font-family: 'Pretendard', sans-serif; line-height: 2.1; color: #1e293b; font-size: 1.15rem; max-width: 900px; margin: 0 auto; padding: 30px; word-break: keep-all; }
  .vue-body p { margin-bottom: 2.5rem; text-align: justify; }
  .vue-body h2 { font-size: 2.5rem; font-weight: 900; color: #0f172a; margin: 6rem 0 2.5rem; line-height: 1.25; letter-spacing: -1px; }
  .vue-body h3 { font-size: 1.8rem; font-weight: 800; color: #1e293b; margin: 4rem 0 1.8rem; padding-left: 18px; border-left: 6px solid #6366f1; line-height: 1.4; }
  .vue-body b { color: #1e293b; font-weight: 800; background: linear-gradient(to top, #e0e7ff 40%, transparent 40%); }
  .vue-thumb { position: relative; width: 100%; height: 500px; border-radius: 35px; overflow: hidden; margin: 40px 0; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.2); }
  .vue-thumb img { width: 100%; height: 100%; object-fit: cover; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 40px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  th { background: #1e293b; color: #fff; padding: 18px; }td { padding: 18px; border-bottom: 1px solid #edf2f7; text-align: center; }
  .vue-ad { height: 40px; margin: 3rem 0; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vue-ad::after { content: 'ADVERTISEMENT'; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 3px; }
</style>`;

async function callAI(model, prompt, isHTML = false, retry = 3) {
  const rules = isHTML ? "[VUE PLATINUM RULES]\n1. NO AI labels.\n2. Use h3 for sub-points.\n3. ONE table per part.\n4. FINISH ALL TAGS.\n5. START DIRECTLY.\n\n" : "RAW TEXT ONLY.\n\n";
  try {
    const r = await model.generateContent(rules + prompt);
    return r.response.text().trim();
  } catch (e) {
    if (e.message.includes('429') && retry > 0) { await new Promise(res => setTimeout(res, 20000)); return callAI(model, prompt, isHTML, retry - 1); }
    return "";
  }
}

async function genImg(p, k) {
  if(!k) return "";
  const clp = p.replace(/[*#\"\`]/g, '').substring(0, 200).trim();
  try {
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: clp, aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
    if(cr.data.code !== 200) return "";
    const tid = cr.data.data.taskId;
    for(let a=0; a<20; a++) {
      await new Promise(res => setTimeout(res, 10000));
      const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } });
      if(pr.data.data.state === 'success') return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || "";
      if(pr.data.data.state === 'fail') return "";
    }
  } catch(e) {}
  return "";
}

function clean(raw) {
  if(!raw) return "";
  let c = raw.replace(/```html|```/g, "").trim();
  ['head','body','html','meta','title','!DOCTYPE','style','h1'].forEach(t => {
    c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), '');
  });
  return c.split('**').map((v, i) => i%2===1 ? '<b>'+v+'</b>' : v).join('').trim();
}

async function run() {
  console.log("💎 VUE Typography Engine v1.3.6.");
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const bId = config.blog_id.toString().replace(/[^0-9]/g, '');
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const target = (config.clusters || [])[0] || config.pillar;
  const lang = config.lang || 'ko';

  let titleRaw = await callAI(model, "Write ONE viral SEO title for: " + target + " in " + lang, false);
  const title = titleRaw.replace(/[\"\\\`\n*#-]/g, '').split(/[.?!]/)[0].substring(0, 100).trim();
  console.log("📌 Title: " + title);

  const imgUrl = await genImg(title, process.env.KIE_API_KEY);
  const sumRaw = await callAI(model, "5 summary points for: " + title + " in " + lang + ". Use <br><br>.", false);

  let body = STYLE + "<div class='vue-body'>" + 
    (imgUrl ? "<div class='vue-thumb'><img src='" + imgUrl + "'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;padding:25px;'><div style='font-size:3rem;font-weight:900;color:#fff;text-shadow:0 10px 30px rgba(0,0,0,0.9);text-align:center;'>" + title + "</div></div></div>" : "") +
    "<div style='background:#f8fafc;border-radius:35px;padding:3rem;margin:4rem 0;border:2px dashed #6366f1;'><span style='font-weight:900;color:#4338ca;display:block;margin-bottom:1rem;'>SUMMARY</span>" + sumRaw + "</div><div class='vue-ad'></div>";

  const cls = lang === 'en' ? [
    { t: "The Paradigm Shift: Decoding the Future", tone: "Shocking" },
    { t: "Expert Analysis: Inside the Engine", tone: "Detailed" },
    { t: "Action Plan: Practical ROI Blueprint", tone: "Results-driven" },
    { t: "The ROI Masterclass: Harvesting Gains", tone: "Analytical" },
    { t: "The Final Verdict: Dominating 2026", tone: "Visionary" }
  ] : [
    { t: "충격적 진실과 우리가 몰랐던 현실", tone: "폭로형" },
    { t: "상위 1% 기술 분석과 전문가의 시선", tone: "기술적" },
    { t: "지금 당장 적용하는 실전 생존 가이드", tone: "실천형" },
    { t: "마스터의 평결: 미래를 장악할 마침표", tone: "비전제시" }
  ];

  let fullContext = "";
  for(let p=0; p < cls.length; p++) {
    console.log("📘 Part " + (p+1) + ": " + cls[p].t);
    let subImgHtml = "";
    if([1, 2, 3].includes(p)) {
      const siu = await genImg(title + " " + cls[p].t, process.env.KIE_API_KEY);
      if(siu) subImgHtml = "<div class='vue-thumb' style='height:420px;margin-top:6rem;'><img src='" + siu + "'></div>";
    }
    const prompt = "[PLATINUM MODE] Write CHAPTER " + (p+1) + " of " + cls.length + ".\n" +
      "CHAPTER TITLE: " + cls[p].t + "\n" + 
      "[CRITICAL]: Use h3 for important sub-sections within this chapter.\n" +
      "PREVIOUS CONTENT: " + fullContext.substring(fullContext.length - 2000) + "\n\n" +
      "[TASK]: Start directly. Use 1st-person storytelling. Include 1 Comparison Table. Write at least " + (lang==='en'?"800 words":"3500 chars") + ".";
    const content = clean(await callAI(model, prompt, true));
    body += "<h2>" + cls[p].t + "</h2>" + subImgHtml + content + "<div class='vue-ad'></div>";
    fullContext += content;
  }

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  await google.blogger({ version: 'v3', auth }).posts.insert({ blogId: bId, requestBody: { title, content: body + "</div>" } });
  console.log("✅ SUCCESS");
}
run();