const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', sans-serif; color: #1e293b; line-height: 2.1; font-size: 16.5px; max-width: 800px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.6rem; font-weight: 1000; color: #0f172a; margin-top: 5rem; border-left: 15px solid #6366f1; padding-left: 1.5rem; }
    .vue-content-body h3 { font-size: 1.85rem; font-weight: 900; color: #334155; margin-top: 3.5rem; border-left: 6px solid #cbd5e1; padding-left: 1.2rem; }
    .vue-main-thumb { position: relative; width: 100%; height: 530px; border-radius: 45px; overflow: hidden; margin-bottom: 4rem; box-shadow: 0 45px 95px -15px rgba(0,0,0,0.35); }
    .vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.8); }
    .vue-hub-card { background: #ffffff; border: 2.5px solid #f1f5f9; border-radius: 35px; padding: 3rem; margin: 4.5rem 0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.06); }
    .vue-btn-more { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff !important; padding: 18px 48px; border-radius: 20px; font-weight: 1000; text-decoration: none !important; }
</style>`;

const PROMPT_RULE = "MANDATORY: Return ONLY article HTML content. NO intro. NO numbers in headings. Professional SEO style.";

async function callAI(model, prompt) {
    try { const r = await model.generateContent(`${PROMPT_RULE}\n\n${prompt}`); return r.response.text(); } catch (e) { console.log('⚠️ AI Call Warning:', e.message); return ""; }
}

function clean(raw) {
    if (!raw) return "";
    let c = raw.replace(/\`\`\`html|\`\`\`/g, '').trim();
    // 🛡️ RE-FIXED REGEX ESCAPING FOR V1.0.6
    const r1 = new RegExp('<(head|body|html|meta|title|!DOCTYPE)[^>]*>[\\s\\S]*?<\\/\\1>|<(body|html|meta|!DOCTYPE)[^>]*?>', 'gi');
    const r2 = new RegExp('<(h[23])>(\\d+[.\\s]*)', 'gi');
    c = c.replace(r1, '');
    c = c.replace(r2, '<$1>');
    c = c.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('');
    return c.trim();
}

async function genImg(p, k) {
    if (!k) return "";
    try {
        const r = await axios.post("https://api.kie.ai/v1/images/generations", { prompt: p.substring(0,300), n: 1, size: "1024x768" }, { headers: { Authorization: "Bearer " + k } });
        return r.data.data?.[0]?.url || r.data.image_url || "";
    } catch (e) { return ""; }
}

async function run() {
    console.log("💎 VUE Elite Genesis v1.0.6 Strong Initializing...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const bId = (process.env.BLOG_ID || config.blog_id).toString().replace(/[^0-9]/g, '');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    const clusters = config.clusters || [];
    const target = clusters[Math.floor(Date.now() / 86400000) % clusters.length];
    
    const lang = config.lang || 'ko';
    const readBtn = lang === 'ko' ? "상세 보기 →" : "Read Insight →";

    const summaryHistory = [];
    for (let i = 0; i < 5; i++) {
        const isM = (i === 4);
        const ctx = isM ? target : (clusters[i] || target);
        console.log(`🎯 [${i+1}/5] Processing: ${ctx}`);

        let titleRaw = await callAI(model, `Unforgettable SEO Title for: "${ctx}". NO Part/Numbers.`);
        // 🛡️ TITLE GUARD: Fallback if AI returns empty
        if (!titleRaw) titleRaw = ctx + " - Professional Insight";
        const title = titleRaw.replace(/[\\"]/g, '').substring(0, 150);

        const ims = await Promise.all([1,2].map(() => genImg(title, process.env.KIE_API_KEY)));

        const sumRaw = await callAI(model, `3 main points for "${title}" in ${lang}.`);
        const cleanSum = (sumRaw || "Elite strategic insight summary.").split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*\\d.]\\s*/, '')).join('<br>');

        let body = STYLE + `<div class="vue-content-body">
            ${ims[0] ? `<div class="vue-main-thumb"><img src="${ims[0]}"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;padding:25px;"><div style="font-size:3.2rem;font-weight:1050;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,0.85);text-align:center;">${title}</div></div></div>` : ''}
            <div style="background:#f8fafc;border-radius:28px;padding:2.5rem;margin:4rem 0;border:2px dashed #6366f1;"><span style="font-weight:1000;color:#4338ca;font-size:1.3rem;margin-bottom:1.5rem;display:block;">ELITE SUMMARY</span>${cleanSum}</div>`;

        if (isM) {
            body += clean(await callAI(model, `Write Master Article for "${target}" in ${lang}. NO numeric subheads. HTML ONLY.`));
            summaryHistory.forEach(s => {
                body += `<div class="vue-hub-card"><span style="font-size:1.8rem;font-weight:1000;color:#1e293b;margin-bottom:1.2rem;display:block;">${s.title}</span><p style="color:#64748b;margin-bottom:2rem;">${s.summary}</p><a href="${s.url}" class="vue-btn-more">${readBtn}</a></div>`;
            });
        } else {
            for(let p=1; p<=3; p++) {
                body += clean(await callAI(model, `Write Chapter ${p} for article "${title}" in ${lang}. NO numbers in subheads. HTML ONLY.`));
                if(p === 1 && ims[1]) body += `<div style="margin:5rem 0;text-align:center;"><img src="${ims[1]}" style="max-width:100%;border-radius:40px;box-shadow:0 30px 60px rgba(0,0,0,0.12);"></div>`;
            }
        }

        const faqR = await callAI(model, `15 JSON SEO FAQs for "${title}" in ${lang}. Array ONLY.`);
        try {
            const faqs = JSON.parse(faqR.replace(/\`\`\`json|\`\`\`/g, '').trim());
            let fH = `<div style="background:#fff;border-radius:45px;padding:4rem;margin-top:9rem;border:3px solid #f1f5f9;"><div style="font-size:2.5rem;font-weight:1000;color:#6366f1;margin-bottom:4rem;text-align:center;">FAQ</div>`;
            faqs.forEach(f => { if(f.q && f.a) fH += `<div style="margin-bottom:3.2rem;"><span style="font-weight:1000;color:#1e293b;font-size:1.5rem;display:block;margin-bottom:1rem;">Q. ${f.q}</span><p style="color:#475569;font-size:1.15rem;">${f.a}</p></div>`; });
            body += fH + `</div>`;
        } catch(e) { }

        body += `<div style="margin-top:100px;text-align:center;color:#94a3b8;font-size:13px;">© VUE Elite Genesis v1.0.6</div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            
            if (!title || !body) throw new Error("Missing content or title.");

            const r = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body } });
            console.log(`✅ Posted Success: ${title}`);
            summaryHistory.push({ title, url: r.data.url, summary: cleanSum });
        } catch (e) { console.log("❌ Blogger Critical Error:", e.response?.data || e.message); }
        await new Promise(r => setTimeout(r, 15000));
    }
}
run();