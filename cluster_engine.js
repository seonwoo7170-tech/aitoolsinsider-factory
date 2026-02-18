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
  .vue-yt-line { background: #000; color: #fff; padding: 6px 22px; font-weight: 900; font-size: 2.2rem; line-height: 1.2; box-shadow: 10px 0 0 #000, -10px 0 0 #000; }
  .vue-yt-line.highlight { background: #6366f1; box-shadow: 10px 0 0 #6366f1, -10px 0 0 #6366f1; }
  .toc-container { background-color: #F8E8EE; padding: 25px; border-radius: 12px; border: 2px solid #000; margin: 3em auto; animation: fast-glow 0.8s infinite alternate; }
  .summary-box { background-color:#d4edda; border:1px solid #28a745; border-radius:12px; padding:25px; margin:4em 0; color:#155724; }
  .alert-box { background-color:#fff3cd; border:1px solid #ffc107; border-radius:12px; padding:20px; margin:4em 0; color:#856404; font-size:14px; }
  .faq-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 15px; padding: 30px; margin: 5em 0; }
  .faq-item { margin-bottom: 25px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 15px; }
  .faq-q { font-weight: 900; color: #0f172a; font-size: 18px; margin-bottom: 8px; display: block; }
  .faq-a { color: #475569; line-height: 1.6; }
  @keyframes fast-glow { from { box-shadow: 0 0 10px rgba(255,105,180,0.4); } to { box-shadow: 0 0 20px rgba(255,105,180,0.7); } }
  .vue-ad { height: 40px; margin: 3.5rem 0; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vue-ad::after { content: 'ADVERTISEMENT'; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 3px; }
</style>`;

const LABELS = {
  ko: { toc: '📋 목차', sum: '📌 핵심 요약', faq: '❓ 자주 묻는 질문 (FAQ)', disclaimer: '⚠️ 면책 문구: 본 정보는 참고용이며 실제 결과는 다를 수 있습니다.', more: '심층 분석 리포트입니다.' },
  en: { toc: '📋 Table of Contents', sum: '📌 Executive Summary', faq: '❓ Frequently Asked Questions (FAQ)', disclaimer: '⚠️ Disclaimer: This information is for reference only and actual results may vary.', more: 'This is an in-depth analysis report.' }
};

async function githubUpsert(path, content) {
  const token = process.env.GITHUB_TOKEN; const repo = process.env.GITHUB_REPOSITORY; const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  try { const res = await axios.get(url, { headers: { Authorization: `token ${token}` } }); await axios.put(url, { message: '[VUE] Config Sync', content: Buffer.from(content).toString('base64'), sha: res.data.sha }, { headers: { Authorization: `token ${token}` } }); } catch(e) { console.log('⚠️ GitHub sync failed'); }
}

async function callAI(model, prompt, isHTML = false, retry = 3, forceEnglish = false) {
  const rules = isHTML ? "[RULES]\n1. HTML snippet only.\n2. NO <h1> or <h2>.\n3. Use <h3> sub-headings.\n4. Use <b>.\n5. NEVER repeat the section title in body.\n6. MIN 1500 chars.\n\n" : 
                (forceEnglish ? "[STRICT RULE] OUTPUT ONLY PLAIN ENGLISH. NO KOREAN. NO MARKDOWN.\n\n" : "NO MARKDOWN. NO INTRO.\n\n");
  try { const r = await model.generateContent(rules + prompt); return r.response.text().trim(); } catch (e) { if (retry > 0) { await new Promise(res => setTimeout(res, 20000)); return callAI(model, prompt, isHTML, retry - 1, forceEnglish); } return ""; }
}

async function genImg(p, k) {
  if(!k || !p) return ""; const cp = p.replace(/[\"\\\`\n*#-]/g, '').trim();
  try { const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: cp + ", cinematic photography, 8k, ultra detailed, award winning, no humans", aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } }); const tid = cr.data.data.taskId;
    for(let a=0; a<25; a++) { await new Promise(res => setTimeout(res, 8000)); const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } }); if(pr.data.data.state === 'success') return JSON.parse(pr.data.data.resultJson).resultUrls?.[0] || ""; if(pr.data.data.state === 'fail') break; }
  } catch(e) {} return "";
}

function clean(raw, isChapter = false) {
  if(!raw) return ""; let c = raw.replace(/```html|```/g, "").trim();
  ['head','body','html','meta','title','!DOCTYPE','style','h1','h2'].forEach(t => { c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), ''); });
  c = c.replace(/CHAPTER \d+[:]*/gi, '').replace(/PART \d+[:]*/gi, '').replace(/###/g, '').replace(/\*\*/g, '');
  c = c.replace(/<p>/gi, "<p data-ke-size='size16'>"); if(isChapter) c = "<p data-ke-size='size16'>&nbsp;</p>" + c; return c;
}

async function run() {
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
  const lang = config.lang || 'ko';
  const L = LABELS[lang] || LABELS.en;

  const clusters = config.clusters || []; const target = clusters.length > 0 ? clusters.shift() : config.pillar;
  console.log("🎯 Target: " + target);

  const titleRaw = await callAI(model, "Write ONE high-impact viral SEO title for: '" + target + "' in " + lang, false);
  const title = titleRaw.replace(/[\"\\\`\n*#-]/g, '').trim();

  const mainImgDesc = await callAI(model, "Visual for image AI in PLAIN ENGLISH ONLY for topic: '" + target + "'. No humans.", false, 3, true);
  const imgUrl = await genImg(mainImgDesc, process.env.KIE_API_KEY);
  const sumRaw = await callAI(model, "5 summary points for '" + title + "' in " + lang, false);

  const words = title.split(' '); let ytTitleHtml = "<div class='vue-title-box'>";
  if(words.length > 5) { const mid = Math.ceil(words.length / 2); ytTitleHtml += `<span class='vue-yt-line'>${words.slice(0, mid).join(' ')}</span><span class='vue-yt-line highlight'>${words.slice(mid).join(' ')}</span>`; } else { ytTitleHtml += `<span class='vue-yt-line highlight'>${title}</span>`; }
  ytTitleHtml += "</div>";

  const planR = await callAI(model, "Create 4 logical chapter titles for '" + title + "' in " + lang + ". JSON array like ['Title1', 'Title2', ...]", false);
  const cls = JSON.parse(planR.replace(/```json|```/g, '').trim());

  let bodyContent = STYLE + "<div class='vue-body'>" + 
    (imgUrl ? "<figure style='position:relative;border-radius:12px;overflow:hidden;margin:3em 0;'><img src='" + imgUrl + "' style='width:100%;display:block;'><div style='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);'>" + ytTitleHtml + "</div></figure>" : "") +
    "<p data-ke-size='size16'>" + title + " - " + L.more + "</p>" + 
    `<div class='toc-container'><div style='font-size:21px;font-weight:900;text-align:center;margin-bottom:15px;color:#000;'>${L.toc}</div><ul>` + 
    cls.map((t, i) => `<li><a href='#section${i+1}'>🚀 ${t}</a></li>`).join('') + `<li><a href='#faq'>${L.faq}</a></li></ul></div>` +
    `<div class='summary-box'><span style='font-weight:900;font-size:18px;'>${L.sum}</span><br>${sumRaw}</div>`;

  for(let p=0; p < cls.length; p++) {
    const visDesc = await callAI(model, "Visual for '" + cls[p] + "' of '" + title + "' in ENGLISH. No humans.", false, 3, true);
    const siu = [1, 2].includes(p) ? await genImg(visDesc, process.env.KIE_API_KEY) : "";
    const contentRaw = await callAI(model, "Write 1500+ chars about: '" + cls[p] + "'. DO NOT repeat title. Use story-telling and professional tone. Use <h3> sub-headers.", true);
    bodyContent += `<h2 id='section${p+1}'>🚀 ${cls[p]}</h2>` + (siu ? "<figure><img src='" + siu + "'></figure>" : "") + clean(contentRaw, true) + "<div class='vue-ad'></div>";
  }

  console.log("❓ FAQ Generation");
  const faqRaw = await callAI(model, "Generate 5 high-value FAQs for '" + title + "' in " + lang + ". JSON array of {q, a}", false);
  const faqs = JSON.parse(faqRaw.replace(/```json|```/g, '').trim());
  bodyContent += `<div id='faq' class='faq-section'><h2 style='background:none;border:none;padding:0;margin-bottom:30px;'>${L.faq}</h2>` + 
    faqs.map(f => `<div class='faq-item'><span class='faq-q'>Q. ${f.q}</span><div class='faq-a'>${f.a}</div></div>`).join('') + "</div>";

  bodyContent += `<div class='alert-box'>${L.disclaimer}</div></div>`;

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const blogger = google.blogger({ version: 'v3', auth });
  const requestBody = { title, content: bodyContent };
  if (config.random_delay) { let d = new Date(); d.setMinutes(d.getMinutes() + Math.random() * 720); requestBody.published = d.toISOString(); }
  await blogger.posts.insert({ blogId: config.blog_id.toString().replace(/[^0-9]/g, ''), requestBody });
  console.log("✅ SUCCESS");

  if (config.clusters) { config.clusters = clusters; await githubUpsert('cluster_config.json', JSON.stringify(config, null, 2)); }
}
run();