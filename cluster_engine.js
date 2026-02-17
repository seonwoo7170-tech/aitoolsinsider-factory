const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Pretendard:wght@400;600;700;900&display=swap');.vue-content-body { font-family: 'Pretendard', sans-serif; line-height: 2.1; color: #1e293b; font-size: 1.1rem; max-width: 900px; margin: 0 auto; padding: 30px; word-break: keep-all; }.vue-content-body p { margin-bottom: 2.8rem; text-align: justify; }.vue-content-body h2 { font-size: 2.6rem; font-weight: 900; color: #0f172a; margin: 6rem 0 3rem; line-height: 1.25; }.vue-content-body b { color: #1a202c; font-weight: 700; background: linear-gradient(to top, #e0e7ff 45%, transparent 45%); padding: 0 4px; }.vue-main-thumb { position: relative; width: 100%; height: 520px; border-radius: 40px; overflow: hidden; margin-bottom: 6rem; box-shadow: 0 40px 80px -15px rgba(0,0,0,0.3); }.vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.8); }table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 50px 0; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }th { background: #1a202c; color: white; padding: 20px; }td { padding: 18px; border-bottom: 1px solid #edf2f7; text-align: center; }.vue-ad-slot { height: 48px; width: 100%; margin: 4rem 0; border: 1.5px dashed #cbd5e1; border-radius: 15px; display: flex; align-items: center; justify-content: center; }.vue-ad-slot::after { content: 'SPONSORED BY VUE AD'; color: #cbd5e1; font-size: 10px; font-weight: 900; letter-spacing: 0.4rem; }</style>`;

async function callAI(model, prompt, isHTML = false, retry = 3) {
    const rules = isHTML ? 
        "[🚨 VUE Platinum Writing Rules]\n1. NO AI labels.\n2. Min 1 comparison table.\n3. HTML SNIPPET ONLY.\n4. Start directly with text.\n\n" : "RAW TITLE ONLY.\n\n";
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
    try {
        const cr = await axios.post("https://api.kie.ai/api/v1/jobs/createTask", { model: "z-image", input: { prompt: p, aspect_ratio: "16:9" } }, { headers: { Authorization: "Bearer " + k.trim() } });
        if (cr.data.code !== 200) return "";
        const tid = cr.data.data.taskId;
        for (let a = 0; a < 15; a++) {
            await new Promise(res => setTimeout(res, 10000));
            const pr = await axios.get("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + tid, { headers: { Authorization: "Bearer " + k.trim() } });
            if (pr.data.data.state === 'success') {
                const res = JSON.parse(pr.data.data.resultJson);
                return res.resultUrls?.[0] || "";
            } else if (pr.data.data.state === 'fail') return "";
        }
    } catch (e) { }
    return "";
}

function clean(raw) {
    if (!raw) return "";
    let c = raw.replace(/```html|```/g, "").trim();
    ['head','body','html','meta','title','!DOCTYPE','style','h1'].forEach(t => {
        c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), '');
    });
    return c.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('').trim();
}

async function run() {
    console.log("💎 VUE Zero Error Engine Active.");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const bId = config.blog_id.toString().replace(/[^0-9]/g, '');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    const target = (config.clusters || [])[0] || config.pillar;
    const lang = config.lang || 'ko';

    let titleRaw = await callAI(model, "ONE viral SEO title for: " + target + " in " + lang, false);
    const title = titleRaw.replace(/["\`\n]/g, '').split(/[.?!]/)[0].substring(0, 100).trim();
    console.log("📌 Title: " + title);

    const imgUrl = await genImg(title, process.env.KIE_API_KEY);
    const sumRaw = await callAI(model, "5 summary points for " + title + " in " + lang, false);

    let body = STYLE + "<div class='vue-content-body'>" + 
        (imgUrl ? "<div class='vue-main-thumb'><img src='" + imgUrl + "'><div style='position:absolute;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;padding:25px;'><div style='font-size:3.2rem;font-weight:900;color:#fff;text-align:center;'>" + title + "</div></div></div>" : "") + 
        "<div style='background:#f8fafc;border-radius:40px;padding:3rem;margin:5rem 0;border:2px dashed #6366f1;'><span style='font-weight:900;color:#4338ca;font-size:1.4rem;display:block;margin-bottom:1rem;'>VUE EXECUTIVE SUMMARY</span>" + sumRaw + "</div><div class='vue-ad-slot'></div>";

    const isEn = lang === 'en';
    const totalParts = isEn ? 7 : 4;
    let fullContext = "";

    for(let p=0; p < totalParts; p++) {
        console.log("📘 Part " + (p+1) + " processing...");
        let subImgHtml = "";
        if([2, 4, 6].includes(p) || (!isEn && p > 0)) {
            const subImgUrl = await genImg(title + " context " + p, process.env.KIE_API_KEY);
            if(subImgUrl) subImgHtml = "<div class='vue-main-thumb' style='height:380px;margin-top:6rem;'><img src='" + subImgUrl + "'></div>";
        }
        const prompt = "[PLATINUM MODE] Part " + (p+1) + " of " + totalParts + ". TITLE: " + title + ". NO REPEAT. PREVIOUS: " + fullContext.substring(fullContext.length - 1500);
        const content = clean(await callAI(model, prompt, true));
        body += subImgHtml + content;
        fullContext += content;
    }

    body += "</div>";
    console.log("🚀 Step 6: Posting to Blogger...");
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });
    await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body } });
    console.log("✅ SUCCESS");
}
run();