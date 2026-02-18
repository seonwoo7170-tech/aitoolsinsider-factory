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
  .vue-title-box { display: inline-flex; flex-direction: column; align-items: center; gap: 8px; }
  .vue-yt-line { background: #000; color: #fff; padding: 4px 18px; font-weight: 950; font-size: 2.6rem; line-height: 1.3; box-shadow: 10px 0 0 #000, -10px 0 0 #000; }
  .vue-yt-line.highlight { background: #6366f1; box-shadow: 10px 0 0 #6366f1, -10px 0 0 #6366f1; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 40px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  th { background: #1e293b; color: #fff; padding: 18px; }td { padding: 18px; border-bottom: 1px solid #edf2f7; text-align: center; }
  .vue-ad { height: 40px; margin: 3rem 0; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vue-ad::after { content: 'ADVERTISEMENT'; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 3px; }
</style>`;

async function callAI(model, prompt, isHTML = false, retry = 3) {
  const rules = isHTML ? "[RULES]\n1. NO labels.\n2. Use h3.\n3. FINISH TAGS.\n4. START DIRECTLY.\n\n" : "PROVIDE ONE SEO TITLE. NO MARKDOWN. MAX 8 WORDS.\n\n";
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
    const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: clp + " cinematic lighting, ultra detailed", aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
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
  ['head','body','html','meta','title','!DOCTYPE','style','h1','h2'].forEach(t => {
    c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), '');
  });
  c = c.replace(/CHAPTER \d+[:]*/gi, '').replace(/PART \d+[:]*/gi, '').replace(/###/g, '');
  return c.split('**').map((v, i) => i%2===1 ? '<b>'+v+'</b>' : v).join('').trim();
}

async function run() {
  console.log("💎 VUE YouTube Impact Engine v1.3.10 Active.");
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const target = (config.clusters || [])[0] || config.pillar;
  const lang = config.lang || 'ko';

  let titleRaw = await callAI(model, "Create ONE high-impact SEO title for: " + target + " in " + lang + ". (MAX 8 words, NO punctuation)", false);
  const title = titleRaw.replace(/[\"\\\`\n*#-]/g, '').trim();
  console.log("📌 Final Title: " + title);

  const imgUrl = await genImg(title, process.env.KIE_API_KEY);
  const sumRaw = await callAI(model, "5 summary points for: " + title + " in " + lang + ". Use <br><br>.", false);

  const words = title.split(' ');
  let ytTitleHtml = "<div class='vue-title-box'>";
  if(words.length > 4) {
    const mid = Math.ceil(words.length / 2);
    ytTitleHtml += `<span class='vue-yt-line'>${words.slice(0, mid).join(' ')}</span>`;
    ytTitleHtml += `<span class='vue-yt-line highlight'>${words.slice(mid).join(' ')}</span>`;
  } else {
    ytTitleHtml += `<span class='vue-yt-line highlight'>${title}</span>`;
  }
  ytTitleHtml += "</div>";

  let body = STYLE + "<div class='vue-body'>" + 
    (imgUrl ? "<div class='vue-thumb'><img src='" + imgUrl + "'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;padding:20px;'>" + ytTitleHtml + "</div></div>" : "") +
    "<div style='background:#f8fafc;border-radius:35px;padding:3rem;margin:4rem 0;border:2px dashed #6366f1;'><span style='font-weight:900;color:#4338ca;display:block;margin-bottom:1rem;'>CORE SUMMARY</span>" + sumRaw + "</div><div class='vue-ad'></div>";

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
    console.log("📘 Section " + (p+1));
    let subImgHtml = "";
    if([1, 2, 3].includes(p)) {
      const siu = await genImg(title + " context " + (p+1), process.env.KIE_API_KEY);
      if(siu) subImgHtml = "<div class='vue-thumb' style='height:420px;margin:5rem 0;'><img src='" + siu + "'></div>";
    }
    const prompt = "Write SECTION " + (p+1) + " of " + cls.length + ".\nTITLE: " + cls[p].t + "\n[RULES]: NO titles/headers. Use h3. Start with narrative in " + lang + ".";
    const content = clean(await callAI(model, prompt, true));
    body += "<h2>" + cls[p].t + "</h2>" + subImgHtml + content + "<div class='vue-ad'></div>";
    fullContext += content;
  }

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const blogger = google.blogger({ version: 'v3', auth });
  const requestBody = { title, content: body + "</div>" };
  if (config.random_delay) {
    let pubDate = new Date();
    pubDate.setMinutes(pubDate.getMinutes() + Math.floor(Math.random() * 720));
    requestBody.published = pubDate.toISOString();
  }
  await blogger.posts.insert({ blogId: config.blog_id.toString().replace(/[^0-9]/g, ''), requestBody });
  console.log("✅ SUCCESS");
}
run();