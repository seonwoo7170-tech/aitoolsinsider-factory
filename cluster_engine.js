const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', sans-serif; color: #1e293b; line-height: 2.3; font-size: 17.5px; max-width: 850px; margin: 0 auto; padding: 25px; }
    .vue-content-body p { margin-bottom: 2.3rem; }
    .vue-content-body h2 { font-size: 2.9rem; font-weight: 1000; color: #0f172a; margin: 7.5rem 0 3.5rem; border-left: 17px solid #6366f1; padding-left: 1.8rem; line-height: 1.25; }
    .vue-content-body h3 { font-size: 2.0rem; font-weight: 950; color: #334155; margin: 5.5rem 0 2.5rem; border-left: 8px solid #cbd5e1; padding-left: 1.4rem; }
    .vue-main-thumb { position: relative; width: 100%; height: 550px; border-radius: 50px; overflow: hidden; margin-bottom: 5.5rem; box-shadow: 0 45px 100px -20px rgba(0,0,0,0.4); }
    .vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.8); }
    .vue-ad-slot { height: 48px; width: 100%; margin: 3.5rem 0; background: transparent; display: flex; align-items: center; justify-content: center; border: 1.5px dashed #cbd5e1; border-radius: 15px; }
    .vue-ad-slot::after { content: 'SPONSORED BY VUE AD'; color: #cbd5e1; font-size: 9px; font-weight: 900; letter-spacing: 0.35rem; }
</style>`;

async function callAI(model, prompt, isHTML = false, retry = 3) {
    try {
        const r = await model.generateContent((isHTML ? "MANDATORY: Follow EEAT. Break text every 3-4 sentences with '<div class=\"vue-ad-slot\"></div>'. HTML ONLY.\n\n" : "RAW TEXT ONLY.\n\n") + prompt);
        return r.response.text().trim();
    } catch (e) {
        if (e.message.includes('429') && retry > 0) {
            await new Promise(res => setTimeout(res, 15000));
            return callAI(model, prompt, isHTML, retry - 1);
        }
        return "";
    }
}

async function genImg(p, k, retry = 2) {
    if (!k || k.length < 5) return "";
    try {
        const cleanP = p.replace(/[^\w\s\uAC00-\uD7A3]/g, ' ').substring(0, 200);
        console.log(`🎨 [IMAGE] Size 3:2 Requesting: "${cleanP}"`);
        const r = await axios.post("https://api.kie.ai/api/v1/gpt4o-image/generate", 
            { prompt: cleanP, n: 1, size: "3:2" }, 
            { headers: { Authorization: "Bearer " + k }, timeout: 45000 }
        );
        const url = r.data.data?.[0]?.url || r.data.image_url || r.data.url || "";
        if (url) return url;
        console.log("⚠️ [IMAGE] Resp:", JSON.stringify(r.data));
    } catch (e) {
        console.log(`❌ [IMAGE ERROR] Status: ${e.response?.status}. Body: ${JSON.stringify(e.response?.data || e.message)}`);
        if (retry > 0) {
            console.log("⏳ [IMAGE] Retrying...");
            await new Promise(res => setTimeout(res, 5000));
            return genImg(p, k, retry - 1);
        }
    }
    return "";
}

function clean(raw) {
    if (!raw) return "";
    const bx = String.fromCharCode(96);
    let c = raw.replace(new RegExp(bx + "{3}html|" + bx + "{3}", "g"), "").trim();
    ['head','body','html','meta','title','!DOCTYPE'].forEach(t => {
        c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), '');
    });
    return c.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('').trim();
}

async function run() {
    console.log("💎 VUE SEO Dominator v1.2.1 Active.");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const bId = (process.env.BLOG_ID || config.blog_id).toString().replace(/[^0-9]/g, '');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    const target = (config.clusters || [])[0] || config.pillar;
    const lang = config.lang || 'ko';
    
    for (let i = 0; i < 1; i++) {
        console.log(`🎯 [1/1] SEO & Vision Run: ${target}`);
        // 💎 SEO TITLE UPGRADE: Viral, Natural, No "Keyword: Subtitle" pattern
        let titleRaw = await callAI(model, `Generate a Viral, Click-Inducing SEO Title for: "${target}" in ${lang}. Use psychological triggers and power words. DO NOT use the "Keyword: Subtitle" format. Be natural and provocative. Plain text only.`, false);
        const title = titleRaw.replace(/[\"\`\n]/g, '').substring(0, 150);

        const imgUrl = await genImg(title, process.env.KIE_API_KEY);
        const sumRaw = await callAI(model, `5 elite summary points for "${title}" in ${lang}. Use <br><br>.`, false);
        const cleanSum = sumRaw.replace(/[*#-]/g, '✦').split('\n').filter(l => l.trim()).join('<br><br>');

        let body = STYLE + `<div class="vue-content-body">
            ${imgUrl ? `<div class="vue-main-thumb"><img src="${imgUrl}"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;padding:25px;"><div style="font-size:3.5rem;font-weight:1050;color:#fff;text-shadow:0 12px 60px rgba(0,0,0,0.95);text-align:center;">${title}</div></div></div>` : ''}
            <div style="background:#f8fafc;border-radius:45px;padding:3.8rem;margin:5.5rem 0;border:3px dashed #6366f1;"><span style="font-weight:1100;color:#4338ca;font-size:1.6rem;margin-bottom:2.2rem;display:block;">EXPERT INSIGHT SUMMARY</span><div style="color:#334155;line-height:2.4;">${cleanSum}</div></div>
            <div class="vue-ad-slot"></div>`;

        let context = "";
        for(let p=1; p<=4; p++) {
            const content = clean(await callAI(model, `Write Deep Insight Chapter ${p} for "${title}" in ${lang}. ${context ? "PREVIOUS CONTEXT: " + context.substring(0, 1000) : ""} MIN 3000 chars. Use <div class=\"vue-ad-slot\"></div> every 3-4 sentences. HTML.`, true));
            body += content;
            context += content.replace(/<[^>]*>/g, ' ').substring(0, 500) + " ";
        }

        const faqR = await callAI(model, `10 FAQs for "${title}" in ${lang}. JSON array of {q, a}.`, false);
        try {
            const faqs = JSON.parse(faqR.substring(faqR.indexOf('['), faqR.lastIndexOf(']') + 1));
            let fH = `<div class="vue-ad-slot"></div><div style="background:#fff;border-radius:60px;padding:5.5rem;margin-top:12rem;border:4px solid #f8fafc;"><div style="font-size:3.2rem;font-weight:1000;color:#6366f1;margin-bottom:5.5rem;text-align:center;">EXPERT ADVISORY FAQ</div>`;
            faqs.forEach(f => { if(f.q && f.a) fH += `<div style="margin-bottom:4.8rem;border-bottom:2.5px solid #f8fafc;padding-bottom:3.8rem;"><span style="font-weight:1100;color:#0f172a;font-size:1.9rem;display:block;margin-bottom:1.8rem;">Q. ${f.q}</span><p style="color:#475569;font-size:1.3rem;line-height:2.3;">${f.a}</p></div>`; });
            body += fH + '</div>';
        } catch(e) { }

        body += `<div style="margin-top:100px;padding:40px;background:#f8fafc;border-radius:35px;border:2px solid #e2e8f0;font-size:14px;color:#64748b;line-height:2;"><b>Deep Disclaimer:</b> AI generated content. Provided for educational purpose. Consult professionals for expert advice.</div>`;
        body += `<div style="margin-top:150px;text-align:center;color:#94a3b8;font-size:14px;font-weight:800;">© VUE SEO v1.2.1</div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body } });
            console.log(`✅ SEO Success: ${title}`);
        } catch (e) { console.log("❌ Blogger Error:", JSON.stringify(e.response?.data || e.message, null, 2)); }
    }
}
run();