const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', sans-serif; color: #1e293b; line-height: 2.1; font-size: 16.2px; max-width: 800px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.6rem; font-weight: 1000; color: #0f172a; margin-top: 5rem; border-left: 14px solid #6366f1; padding-left: 1.5rem; }
    .vue-content-body h3 { font-size: 1.8rem; font-weight: 900; color: #334155; margin-top: 3.5rem; border-left: 6px solid #cbd5e1; padding-left: 1.2rem; }
    .vue-main-thumb { position: relative; width: 100%; height: 520px; border-radius: 42px; overflow: hidden; margin-bottom: 4rem; box-shadow: 0 40px 85px -15px rgba(0,0,0,0.3); }
    .vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .vue-btn-more { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff !important; padding: 18px 48px; border-radius: 22px; font-weight: 950; text-decoration: none !important; }
</style>`;

const PROMPT_RULE = "MANDATORY: Return ONLY article HTML. NO numbers in headings. Professional SEO style.";

async function callAI(model, prompt) {
    try { const r = await model.generateContent(`${PROMPT_RULE}\n\n${prompt}`); return r.response.text(); } catch (e) { return ""; }
}

function clean(raw) {
    if (!raw) return "";
    let c = raw.replace(/\`\`\`html|\`\`\`/g, '').trim();
    c = c.replace(/<(head|body|html|meta|title|!DOCTYPE)[^>]*>[\\s\\S]*?<\\/\\1>|<(body|html|meta|!DOCTYPE)[^>]*?>/gi, '');
    c = c.replace(/<(h[23])>(\\d+[.\\s]*)*/gi, '<$1>');
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
    console.log("💎 Genesis Engine v1.0.2 Active.");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const bId = (process.env.BLOG_ID || config.blog_id).toString().replace(/[^0-9]/g, '');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    const clusters = config.clusters || [];
    const target = clusters[Math.floor(Date.now() / 86400000) % clusters.length];
    
    const history = [];
    for (let i = 0; i < 5; i++) {
        const isM = (i === 4);
        const ctx = isM ? target : (clusters[i] || target);
        const titleRaw = await callAI(model, `Standalone Long-tail SEO Title for: "${ctx}". NO Part/Numbers.`);
        const title = titleRaw.replace(/[\\"]/g, '').substring(0, 150);
        const ims = await Promise.all([1,2].map(() => genImg(title, process.env.KIE_API_KEY)));

        let body = STYLE + `<div class="vue-content-body">
            ${ims[0] ? `<div class="vue-main-thumb"><img src="${ims[0]}"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;padding:25px;"><div style="font-size:3.2rem;font-weight:1000;color:#fff;text-shadow:0 6px 25px rgba(0,0,0,0.85);text-align:center;">${title}</div></div></div>` : ''}
            ${clean(await callAI(model, `Write ${isM ? 'Master Pillar' : 'Deep Dive'} for "${title}" in ${config.lang || 'ko'}. HTML ONLY.`))}
            ${ims[1] ? `<div style="margin:5rem 0;text-align:center;"><img src="${ims[1]}" style="max-width:100%;border-radius:35px;box-shadow:0 25px 50px rgba(0,0,0,0.12);"></div>` : ''}
            <div style="margin-top:100px;text-align:center;color:#94a3b8;font-size:13px;">© Genesis v1.0.2</div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            const r = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body } });
            console.log(`✅ Posted: ${title}`);
            history.push({ title, url: r.data.url });
        } catch (e) { console.log("❌ Blogger Error:", e.message); }
        await new Promise(r => setTimeout(r, 12000));
    }
}
run();