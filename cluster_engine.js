const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', sans-serif; color: #1e293b; line-height: 2.1; font-size: 16.5px; max-width: 800px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.6rem; font-weight: 1000; color: #0f172a; margin-top: 5rem; border-left: 15px solid #6366f1; padding-left: 1.5rem; }
    .vue-content-body h3 { font-size: 1.85rem; font-weight: 900; color: #334155; margin-top: 3.5rem; border-left: 6px solid #cbd5e1; padding-left: 1.2rem; }
    .vue-main-thumb { position: relative; width: 100%; height: 535px; border-radius: 45px; overflow: hidden; margin-bottom: 4rem; box-shadow: 0 45px 95px -15px rgba(0,0,0,0.35); }
    .vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.85); }
    .vue-hub-card { background: #ffffff; border: 2.5px solid #f1f5f9; border-radius: 35px; padding: 3rem; margin: 4.5rem 0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.06); }
    .vue-btn-more { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff !important; padding: 20px 52px; border-radius: 22px; font-weight: 1000; text-decoration: none !important; }
</style>`;

const PROMPT_RULE_HTML = "MANDATORY: Return ONLY article HTML. NO introductory filler. NO numbers in headings. Professional Magazine Style.";
const PROMPT_RULE_TEXT = "MANDATORY: Return ONLY plain text. NO introductory filler. NO quotes. NO markdown code blocks (e.g., NO `\`\`\`html). NO intro/outro. Just the raw string.";

async function callAI(model, prompt, isHTML = false) {
    const rule = isHTML ? PROMPT_RULE_HTML : PROMPT_RULE_TEXT;
    try { 
        const r = await model.generateContent(`${rule}\n\n${prompt}`); 
        return r.response.text().trim(); 
    } catch (e) { 
        console.log('⚠️ AI Error:', e.message); 
        return ""; 
    }
}

function clean(raw) {
    if (!raw) return "";
    let c = raw.replace(/\`\`\`html|\`\`\`/g, '').trim();
    const tags = ['head','body','html','meta','title','!DOCTYPE'];
    tags.forEach(t => { 
        const open = new RegExp('<'+t+'[^>]*>', 'gi');
        const close = new RegExp('</'+t+'>', 'gi');
        c = c.replace(open, '').replace(close, '');
    });
    c = c.replace(/<h([23])>(\d+[.\s]*)*/gi, '<h$1>');
    c = c.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('').trim();
    return c;
}

// 🛡️ NEW TITLE PURIFIER
function cleanTitle(raw) {
    if (!raw) return "";
    // Remove markdown code blocks and HTML residue
    return raw.replace(/\`\`\`html|\`\`\`/gi, '').replace(/<[^>]*>/gi, '').replace(/[\\"]/g, '').trim();
}

async function genImg(p, k) {
    if (!k) return "";
    try {
        const r = await axios.post("https://api.kie.ai/v1/images/generations", { prompt: p.substring(0,300), n: 1, size: "1024x768" }, { headers: { Authorization: "Bearer " + k } });
        return r.data.data?.[0]?.url || r.data.image_url || "";
    } catch (e) { return ""; }
}

async function run() {
    process.on('unhandledRejection', e => console.log('🛡️ Rejection Guard:', e));
    console.log("🌐 VUE Zen Pure v1.0.9 Starting...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const bId = (process.env.BLOG_ID || config.blog_id).toString().replace(/[^0-9]/g, '');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    const clusters = config.clusters || [];
    const target = clusters[Math.floor(Date.now() / 86400000) % clusters.length];
    
    const lang = config.lang || 'ko';
    const readBtn = lang === 'ko' ? "전체 보기 →" : "Read Insight →";

    const summaryHistory = [];
    for (let i = 0; i < 5; i++) {
        const isM = (i === 4);
        const ctx = isM ? target : (clusters[i] || target);
        console.log(`🎯 [${i+1}/5] Strategic Insight: ${ctx}`);

        let titleRaw = await callAI(model, `Unstoppable Long-tail SEO Title for: "${ctx}". NO markdown. Plain Text ONLY.`, false);
        const title = cleanTitle(titleRaw || ctx + " - Professional Insight").substring(0, 150);

        const ims = await Promise.all([1,2].map(() => genImg(title, process.env.KIE_API_KEY)));
        const sumRaw = await callAI(model, `3 main points for "${title}" in ${lang}. Plain Text ONLY.`, false);
        const cleanSum = cleanTitle(sumRaw || "Strategic perspective.").split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*\\d.]\\s*/, '')).join('<br>');

        let body = STYLE + `<div class="vue-content-body">
            ${ims[0] ? `<div class="vue-main-thumb"><img src="${ims[0]}"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;padding:25px;"><div style="font-size:3.2rem;font-weight:1050;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,0.9);text-align:center;">${title}</div></div></div>` : ''}
            <div style="background:#f8fafc;border-radius:28px;padding:2.8rem;margin:4rem 0;border:2.5px dashed #6366f1;"><span style="font-weight:1100;color:#4338ca;font-size:1.35rem;margin-bottom:1.5rem;display:block;">ELITE SNAPSHOT</span>${cleanSum}</div>`;

        if (isM) {
            body += clean(await callAI(model, `Write High-Authority Master Pillar Article for "${target}" in ${lang}. NO numbers in headings. HTML ONLY.`, true));
            summaryHistory.forEach(s => {
                body += `<div class="vue-hub-card"><span style="font-size:1.95rem;font-weight:1050;color:#1e293b;margin-bottom:1.5rem;display:block;">${s.title}</span><p style="color:#64748b;margin-bottom:2.2rem;">${s.summary}</p><a href="${s.url}" class="vue-btn-more">${readBtn}</a></div>`;
            });
        } else {
            for(let p=1; p<=3; p++) {
                body += clean(await callAI(model, `Write Deep Insight Level ${p} for "${title}" in ${lang}. NO numbers in headings. HTML ONLY.`, true));
                if(p === 1 && ims[1]) body += `<div style="margin:5rem 0;text-align:center;"><img src="${ims[1]}" style="max-width:100%;border-radius:40px;box-shadow:0 30px 60px rgba(0,0,0,0.15);"></div>`;
            }
        }

        const faqR = await callAI(model, `15 Professional FAQs for "${title}" in ${lang}. Return ONLY valid JSON array.`, false);
        try {
            const faqs = JSON.parse(faqR.replace(/\`\`\`json|\`\`\`/g, '').trim());
            let fH = `<div style="background:#fff;border-radius:45px;padding:4rem;margin-top:9rem;border:3.5px solid #f1f5f9;"><div style="font-size:2.8rem;font-weight:1000;color:#6366f1;margin-bottom:4rem;text-align:center;">EXPERT Q&A</div>`;
            faqs.forEach(f => { if(f.q && f.a) fH += `<div style="margin-bottom:3.5rem;"><span style="font-weight:1000;color:#1e293b;font-size:1.6rem;display:block;margin-bottom:1.2rem;">Q. ${f.q}</span><p style="color:#475569;font-size:1.18rem;">${f.a}</p></div>`; });
            body += fH + `</div>`;
        } catch(e) { }

        body += `<div style="margin-top:100px;text-align:center;color:#94a3b8;font-size:13px;">© VUE Zen Pure v1.0.9</div></div>`;

        try {
            if (!title) throw new Error("Crucial Error: Title missing after purification.");
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body } });
            console.log(`✅ Deep Success: ${title}`);
            summaryHistory.push({ title, url: r.data.url, summary: cleanSum });
        } catch (e) {
            console.log("❌ Blogger Error:", JSON.stringify(e.response?.data || e.message, null, 2));
        }
        await new Promise(r => setTimeout(r, 15000));
    }
}
run();