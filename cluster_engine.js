const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Pretendard:wght@400;600;700;900&display=swap');
  .vue-content-body { font-family: 'Pretendard', sans-serif; line-height: 2.1; color: #1e293b; font-size: 1.15rem; max-width: 900px; margin: 0 auto; padding: 30px; word-break: keep-all; }
  .vue-content-body p { margin-bottom: 2.5rem; text-align: justify; }
  .vue-content-body h2 { font-size: 2.5rem; font-weight: 900; color: #0f172a; margin: 5rem 0 2.5rem; line-height: 1.2; letter-spacing: -1px; }
  .vue-content-body b { color: #1e293b; font-weight: 800; background: linear-gradient(to top, #e0e7ff 40%, transparent 40%); padding: 0 2px; }
  .vue-main-thumb { position: relative; width: 100%; height: 500px; border-radius: 35px; overflow: hidden; margin-bottom: 5rem; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.2); }
  .vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.85); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 40px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  th { background: #1e293b; color: #fff; padding: 18px; font-weight: 700; }.vue-tip { background: #f0f9ff; border-left: 5px solid #0ea5e9; padding: 25px; border-radius: 10px; margin: 40px 0; font-style: italic; }
  .vue-ad-slot { height: 40px; margin: 3rem 0; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vue-ad-slot::after { content: 'ADVERTISEMENT'; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 3px; }
</style>`;

async function callAI(model, prompt, isHTML = false, retry = 3) {
  const rules = isHTML ? "[VUE PLATINUM RULES]\n1. NO AI labels (e.g. [Section 1]).\n2. NO generic conclusions.\n3. Use ONLY inner HTML.\n4. Start directly with the narrative content.\n\n" : "RAW TEXT ONLY.\n\n";
  try {
    const r = await model.generateContent(rules + prompt);
    return r.response.text().trim();
  } catch (e) {
    if (e.message.includes('429') && retry > 0) {
      await new Promise(res => setTimeout(res, 20000));
      return callAI(model, prompt, isHTML, retry - 1);
    } return "";
  }
}

async function genImg(p, k) {
  if(!k) return "";
  try {
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: p, aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
    if(cr.data.code !== 200) return "";
    const tid = cr.data.data.taskId;
    for(let a=0; a<15; a++) {
      await new Promise(res => setTimeout(res, 10000));
      const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } });
      if(pr.data.data.state === 'success') { return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || ""; }
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
  console.log("💎 VUE Ultimate Engine Active.");
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const bId = config.blog_id.toString().replace(/[^0-9]/g, '');
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const target = (config.clusters || [])[0] || config.pillar;
  const lang = config.lang || 'ko';
  const isEn = lang === 'en';

  console.log("📝 Step 1: Generating SEO context...");
  let titleRaw = await callAI(model, "Write ONE viral, high-CTR SEO title for: " + target + " in " + lang, false);
  const title = titleRaw.replace(/[\"\\\`\n]/g, '').split(/[.?!]/)[0].substring(0, 100).trim();
  console.log("📌 Title: " + title);

  const imgUrl = await genImg(title, process.env.KIE_API_KEY);
  const sumRaw = await callAI(model, "Write 5 elite executive summary bullet points for: " + title + " in " + lang + ". Use <br><br> between points. NO labels.", false);

  let body = STYLE + "<div class='vue-content-body'>" + 
    (imgUrl ? "<div class='vue-main-thumb'><img src='" + imgUrl + "'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;padding:25px;'><div style='font-size:3.2rem;font-weight:900;color:#fff;text-shadow:0 10px 40px rgba(0,0,0,0.8);text-align:center;'>" + title + "</div></div></div>" : "") +
    "<div style='background:#f8fafc;border-radius:35px;padding:3.5rem;margin:5rem 0;border:2px dashed #6366f1;'><span style='font-weight:900;color:#4338ca;font-size:1.5rem;display:block;margin-bottom:1.5rem;'>EXECUTIVE SUMMARY</span><div style='color:#334155;'>" + sumRaw + "</div></div><div class='vue-ad-slot'></div>";

  const clusters = isEn ? [
    { t: "The Disruptive Reality: Why the Old Paradigm is Failing", tone: "Shocking, analytical" },
    { t: "The Architecture of Mastery: A Deep Technical Deep-Dive", tone: "Expert, detailed" },
    { t: "Strategic Blueprint: Step-by-Step Implementation Guide", tone: "Practical, actionable" },
    { t: "Hidden Pitfalls & Professional Warnings for 2026", tone: "Cautions, investigative" },
    { t: "Elite ROI Optimization: Harvesting Maximum Efficiency", tone: "Results-focused" },
    { t: "The Game-Changer Protocol: Real-world Success Metrics", tone: "Proof-based" },
    { t: "The Visionary Verdict: Dominating your Industry Future", tone: "Decisive, inspirational" }
  ] : [
    { t: "우리가 모르던 충격적인 진실과 현재의 문제점", tone: "폭로형, 분석적" },
    { t: "심층 기술 분석: 내부 구조와 상위 1%의 노하우", tone: "전문가형, 상세함" },
    { t: "실전 생존 전략: 지금 바로 적용 가능한 액션 플랜", tone: "실천형, 구체적" },
    { t: "마스터의 평결: 미래 예측과 필승의 로드맵", tone: "결정적, 비전제시" }
  ];

  let fullContext = "";
  for(let p=0; p < clusters.length; p++) {
    console.log("📘 Section " + (p+1) + ": " + clusters[p].t);
    let subImg = "";
    const imgMarkers = isEn ? [2, 4, 6] : [1, 2, 3];
    if(imgMarkers.includes(p)) {
      const siu = await genImg(title + " " + clusters[p].t, process.env.KIE_API_KEY);
      if(siu) subImg = "<div class='vue-main-thumb' style='height:400px;margin-top:6rem;'><img src='" + siu + "'></div>";
    }
    const prompt = "[PLATINUM SEQUENTIAL MODE] This is PART " + (p+1) + " of " + clusters.length + ".\n" +
      "TITLE: \"" + title + "\"\n" +
      "FOCUS: " + clusters[p].t + "\n" +
      "TONE: " + clusters[p].tone + "\n" +
      "TARGET LENGTH: " + (isEn ? "700 words" : "3,500 characters") + "\n\n" +
      "[CRITICAL MEMORY - DO NOT REPEAT ANYTHING FROM BELOW]:\n" + fullContext.substring(fullContext.length - 2500) + "\n\n" +
      "[INSTRUCTION]: Start immediately without intro. Use 1st-person storytelling. Include 1 detailed Comparison Table or complex checklist. write in " + lang + ". Finish the sentence completely.";
    const content = clean(await callAI(model, prompt, true));
    body += subImg + content;
    fullContext += "\n/* SECTION " + (p+1) + " */\n" + content;
  }

  console.log("🚀 Posting to Blogger...");
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  await google.blogger({ version: 'v3', auth }).posts.insert({ blogId: bId, requestBody: { title, content: body + "</div>" } });
  console.log("✅ SUCCESS: " + title);
}
run();