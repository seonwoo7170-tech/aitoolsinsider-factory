const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Pretendard:wght@400;600;700;900&display=swap');
  .vue-content-body { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 2.1; color: #1e293b; font-size: 1.1rem; max-width: 900px; margin: 0 auto; padding: 30px; word-break: keep-all; }
  .vue-content-body p { margin-bottom: 2.8rem; text-align: justify; }
  .vue-content-body h2 { font-size: 2.6rem; font-weight: 900; color: #0f172a; margin: 6rem 0 3rem; line-height: 1.25; letter-spacing: -1.5px; }
  .vue-content-body h2::after { content: ''; display: block; width: 60px; height: 7px; background: linear-gradient(90deg, #6366f1, #a855f7); margin-top: 15px; border-radius: 4px; }
  .vue-content-body b { color: #1a202c; font-weight: 700; background: linear-gradient(to top, #e0e7ff 45%, transparent 45%); padding: 0 4px; }
  .vue-main-thumb { position: relative; width: 100%; height: 520px; border-radius: 40px; overflow: hidden; margin-bottom: 6rem; box-shadow: 0 40px 80px -15px rgba(0,0,0,0.3); }
  .vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.8); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 50px 0; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; table-layout: fixed; }
  th { background: #1a202c; color: white; padding: 20px; font-weight: 700; text-align: center; }
  td { padding: 18px; border-bottom: 1px solid #edf2f7; text-align: center; background: #fff; font-size: 0.95rem; }
  blockquote { background: #f8fafc; border-radius: 20px; padding: 35px; margin: 50px 0; border-left: 10px solid #6366f1; font-style: italic; font-size: 1.2rem; color: #334155; }
  .vue-ad-slot { height: 48px; width: 100%; margin: 4rem 0; background: transparent; display: flex; align-items: center; justify-content: center; border: 1.5px dashed #cbd5e1; border-radius: 15px; }
  .vue-ad-slot::after { content: 'SPONSORED BY VUE AD'; color: #cbd5e1; font-size: 10px; font-weight: 900; letter-spacing: 0.4rem; }
</style>`;

async function callAI(model, prompt, isHTML = false, retry = 3) {
    const rules = isHTML ? 
        `[🚨 VUE Platinum Writing Rules]\n` +
        `1. NO AI labels like [Introduction], [Analysis].\n` +
        `2. Minimum 1 COMPARISON TABLE (<table>) per chapter. Pure facts only in tables.\n` +
        `3. Provide ONLY inner HTML snippet. NO h1, NO style, NO html/body tags.\n` +
        `4. Break long text with <div class='vue-ad-slot'></div> every 4-5 paragraphs.\n` +
        `5. Start directly with the narrative. No 'Sure, here is...' or introductions.\n\n` : "RAW TEXT. ONE viral SEO title. NO colon.\n\n";
    try {
        const r = await model.generateContent(rules + prompt);
        return r.response.text().trim();
    } catch (e) {
        if (e.message.includes('429') && retry > 0) {
            await new Promise(res => setTimeout(res, 20000));
            return callAI(model, prompt, isHTML, retry - 1);
        }
        return "";
    }
}

async function genImg(p, k) {
    if (!k) return "";
    const cleanP = p.replace(/[^\w\s\uAC00-\uD7A3]/g, ' ').substring(0, 250).trim();
    try {
        console.log("🎨 [KIE 16:9] Requesting image for: " + cleanP);
        const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: cleanP, aspect_ratio: "16:9" } }, { headers: { Authorization: `Bearer ${k.trim()}` } });
        if (cr.data.code !== 200) { console.log("❌ Kie.ai Task Creation Failed: " + cr.data.message); return ""; }
        const tid = cr.data.data.taskId;
        console.log("⏳ Polling Kie.ai task: " + tid);
        for (let a = 0; a < 15; a++) {
            await new Promise(res => setTimeout(res, 10000));
            const pr = await axios.get(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${tid}`, { headers: { Authorization: `Bearer ${k.trim()}` } });
            if (pr.data.data.state === 'success') {
                const res = JSON.parse(pr.data.data.resultJson);
                const url = res.resultUrls?.[0] || "";
                console.log("✅ Image Success: " + url);
                return url;
            } else if (pr.data.data.state === 'fail') { console.log("❌ Kie.ai Task Failed."); return ""; }
            console.log("...waiting for image (" + (a+1)*10 + "s)");
        }
    } catch (e) { console.log("❌ genImg Error: " + e.message); }
    return "";
}

function clean(raw) {
    if (!raw) return "";
    let c = raw.replace(/```html|```/g, "").trim();
    ['head','body','html','meta','title','!DOCTYPE','style','h1'].forEach(t => {
        c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), '');
    });
    c = c.replace(/^([#\s\-\*]*)(서론|본론|결론|도입부|포스팅 시작|작성 완료|요청하신|이번 섹션|다음 섹션).*$/gm, '');
    return c.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('').trim();
}

async function run() {
    console.log("💎 VUE Platinum Engine v1.3.1 Active.");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const bId = (process.env.BLOG_ID || config.blog_id).toString().replace(/[^0-9]/g, '');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    const target = (config.clusters || [])[0] || config.pillar;
    const lang = config.lang || 'ko';

    console.log("✍️ Step 1: Generating viral title for: " + target);
    let titleRaw = await callAI(model, `Write ONE viral SEO title for: "${target}" in ${lang}. NO colon.`, false);
    const title = titleRaw.replace(/["\`\n]/g, '').split(/[.?!]/)[0].substring(0, 100).trim();
    console.log("📌 Final Title: " + title);

    console.log("🎨 Step 2: Generating cinematic image...");
    const imgUrl = await genImg(title, process.env.KIE_API_KEY);

    console.log("📝 Step 3: Generating summaries...");
    const sumRaw = await callAI(model, `5 elite summary points for "${title}" in ${lang}. Use <br><br>.`, false);
    const cleanSum = sumRaw.replace(/[*#-]/g, '✦').split('\n').filter(l => l.trim()).join('<br><br>');

    let body = STYLE + `<div class="vue-content-body">` + 
        (imgUrl ? `<div class="vue-main-thumb"><img src="${imgUrl}"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;padding:25px;"><div style="font-size:3.2rem;font-weight:1100;color:#fff;text-shadow:0 15px 70px rgba(0,0,0,1);text-align:center;line-height:1.2;">${title}</div></div></div>` : '') + 
        `<div style="background:#f8fafc;border-radius:45px;padding:3.8rem;margin:5.5rem 0;border:3px dashed #6366f1;"><span style="font-weight:1100;color:#4338ca;font-size:1.6rem;margin-bottom:2.2rem;display:block;">VUE EXECUTIVE SUMMARY</span><div style="color:#334155;line-height:2.4;">${cleanSum}</div></div><div class="vue-ad-slot"></div>`;

    const isEn = lang === 'en';
    const totalChapters = isEn ? 7 : 4; 
    const chapterLength = isEn ? 4000 : 3500;
    
    const enClusters = [
        { theme: "The Disruptive Reality: Why the Old Way is Dying", tone: "Investigative & Provocative" },
        { theme: "The Architecture of Excellence: Deep Technical Truths", tone: "Expert-level & Analytical" },
        { theme: "Strategic implementation: The Step-by-Step Blueprint", tone: "Actionable & Practical" },
        { theme: "Hidden Pitfalls: What 99% of People Get Wrong", tone: "Critical & Warning" },
        { theme: "Elite Optimization: Maximizing ROI & Efficiency", tone: "Results-oriented" },
        { theme: "Case Studies: Real-world Heroic Transformations", tone: "Inspirational & Proof-based" },
        { theme: "The Visionary Verdict: Dominating the 2026 Landscape", tone: "Decisive & Forward-looking" }
    ];

    const koClusters = [
        { theme: "충격적인 현실과 우리가 모르던 숨겨진 문제", tone: "탐사 보도형" },
        { theme: "심층 분석: 기술적 미묘함과 전문가적 진실", tone: "분석형" },
        { theme: "생존 전략: 실전 구현을 위한 단계별 가이드", tone: "실용형" },
        { theme: "최종 평결: 미래를 대비하는 1%의 비전", tone: "결론형" }
    ];

    const targetChapters = isEn ? enClusters : koClusters;
    let fullContext = "";

    for(let p=0; p < targetChapters.length; p++) {
        console.log("📘 Step 4." + (p+1) + ": Crafting " + targetChapters[p].theme + "...");
        let subImgHtml = "";
        const imgMarkers = isEn ? [2, 4, 6] : [1, 2, 3];
        if(imgMarkers.includes(p)) {
            console.log("🎨 Generating contextual image for Part " + (p+1) + "...");
            const subImgUrl = await genImg(title + " - " + targetChapters[p].theme, process.env.KIE_API_KEY);
            if(subImgUrl) subImgHtml = BT + "<div class='vue-main-thumb' style='height:380px;margin-top:6rem;'><img src='" + subImgUrl + "'></div>" + BT + ";
        }
        const segHead = isEn ? '5,000 WORDS TARGET' : '15,000 CHARS TARGET';
        const segmentPrompt = "[🚨 MASTER PLATINUM SEQUENTIAL WRITING: " + segHead + "]\n" +
            "This is Part " + (p+1) + " of " + targetChapters.length + ". TITLE: \"" + title + "\"\n" +
            "CHAPTER THEME: " + targetChapters[p].theme + ". TONE: " + targetChapters[p].tone + "\n\n" +
            "[FULL PREVIOUS NARRATIVE - DO NOT REPEAT]:\n" + fullContext.substring(fullContext.length - 2000) + "\n\n" +
            "[CORE RULES FROM PLATINUM GUIDELINE]:\n" +
            "1. Narrative: Use 1st-person story (e.g., \"I found that...\", \"When I first tried...\").\n" +
            "2. Style: Mix short, punchy sentences with long, flowing expert sentences.\n" +
            "3. Human Touch: Use metaphors related to daily life.\n" +
            "4. NO FILLER: Start immediately with the core problem/solution.\n" +
            "5. LENGTH: Target " + chapterLength + " characters for this specific chunk.\n" +
            "6. Visual: Include 1 <table> or <blockquote class='vue-tip'>.\n" +
            "7. Language: Write in " + lang + ".\n";
        const content = clean(await callAI(model, segmentPrompt, true));
        body += subImgHtml + content;
        fullContext += "\n/* PART " + (p+1) + " */\n" + content;
    }

    console.log("❓ Step 5: Generating FAQs...");
    const faqR = await callAI(model, "Based on the full article, generate 20 high-value, non-generic FAQs for \"" + title + "\" in " + lang + ". JSON array of {q, a}.", false);
    try {
        const faqs = JSON.parse(faqR.substring(faqR.indexOf('['), faqR.lastIndexOf(']') + 1));
        let fH = BT + "<div class='vue-ad-slot'></div><div style='background:#fdfdfd;border-radius:24px;padding:3rem;margin-top:6rem;border:2px solid #f1f5f9;box-shadow:0 10px 30px rgba(0,0,0,0.02);'><div style='font-size:1.8rem;font-weight:900;color:#1e293b;margin-bottom:3rem;border-bottom:4px solid #6366f1;display:inline-block;padding-bottom:10px;'>Questions & Expert Insights</div>" + BT + ";
        faqs.forEach(f => { if(f.q && f.a) fH += BT + "<div style='margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:1px solid #f1f5f9;'><span style='font-weight:800;color:#0f172a;font-size:1.2rem;display:flex;align-items:flex-start;gap:12px;'><b style='color:#6366f1;font-family:Outfit;'>Q.</b> " + f.q + "</span><p style='color:#475569;font-size:1.05rem;line-height:2.0;margin-top:10px;'>" + f.a + "</p></div>" + BT + "; });
        body += fH + '</div>';
    } catch(e) { console.log("⚠️ FAQ Parse Failed: " + e.message); }

    body += BT + "<div style='margin-top:120px;text-align:center;color:#cbd5e1;font-size:12px;letter-spacing:3px;font-weight:900;text-transform:uppercase;'>VUE PLATINUM v1.3.1 | MASTER NARRATIVE SYSTEM</div></div>" + BT + ";

    console.log("🚀 Step 6: Posting to Blogger...");
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });
    await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body } });
    console.log("✅ Success: " + title);
}
run();