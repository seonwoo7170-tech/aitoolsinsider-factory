const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', 'Inter', sans-serif; color: #1e293b; line-height: 2.1; font-size: 16px; max-width: 800px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.6rem; font-weight: 1000; color: #0f172a; margin-top: 5rem; border-left: 15px solid #6366f1; padding-left: 1.5rem; letter-spacing: -0.05em; }
    .vue-content-body h3 { font-size: 1.8rem; font-weight: 900; color: #334155; margin-top: 3.5rem; margin-bottom: 1.5rem; border-left: 6px solid #e2e8f0; padding-left: 1.2rem; }
    .vue-main-thumbnail { position: relative; width: 100%; height: 500px; border-radius: 40px; overflow: hidden; margin-bottom: 4rem; box-shadow: 0 45px 90px -15px rgba(0,0,0,0.35); }
    .vue-main-thumbnail img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.65); }
    .vue-hub-card { background: #ffffff; border: 2.5px solid #f1f5f9; border-radius: 35px; padding: 3rem; margin: 4.5rem 0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.06); transition: 0.5s ease; }
    .vue-btn-more { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff !important; padding: 20px 50px; border-radius: 20px; font-weight: 1000; text-decoration: none !important; }
</style>`;

const PURE_PROMPT = "MANDATORY: Return ONLY article HTML content. NO intro. NO numbers/Part labels in any headings (h2, h3). Use professional, natural subheadings.";

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function callGemini(model, prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await model.generateContent(`${PURE_PROMPT}\n\n${prompt}`);
            await sleep(3500); 
            return res.response.text();
        } catch (e) {
            if (e.message.includes('429') && i < retries - 1) { await sleep((i + 1) * 12000); continue; }
            throw e;
        }
    }
}

function cleanHtml(raw) {
    if (!raw) return "";
    let clean = raw.replace(/\`\`\`html|\`\`\`/g, '').trim();
    // Deep Head/Body Purge
    const stripBlocks = [/<head[\\s\\S]*?\\/head>/gi, /<body[^>]*?>/gi, /<\\/body>/gi, /<html[^>]*?>/gi, /<\\/html>/gi, /<meta[^>]*?>/gi, /<title[\\s\\S]*?\\/title>/gi, /<!DOCTYPE[^>]*?>/gi];
    stripBlocks.forEach(p => { clean = clean.replace(p, ''); });
    // Remove accidental numeric prefixes in headings (1., 3.1)
    clean = clean.replace(/<(h[23])>(\\d+[.\\s]*)*/gi, '<$1>');
    // Markdown Bold Fix
    clean = clean.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('');
    return clean.trim();
}

async function uploadToImgBB(url, apiKey) {
    if(!apiKey || !url) return url;
    try {
        const form = new FormData();
        form.append('image', url);
        const res = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, form, { headers: form.getHeaders() });
        return res.data.data.url;
    } catch (e) { return url; }
}

async function generateImage(prompt, kieKey, imgbbKey) {
    let cleanP = prompt.replace(/[^a-zA-Z0-9\\s]/g, '').substring(0, 300);
    if (!kieKey) return "";
    try {
        const res = await axios.post("https://api.kie.ai/v1/image/generate", {
            prompt: cleanP + ", ultra high resolution professional photography, cinematic, 8k",
            model: "z-image", width: 1024, height: 768
        }, { headers: { "Authorization": "Bearer " + kieKey }, timeout: 60000 });
        if (res.data && res.data.image_url) return await uploadToImgBB(res.data.image_url, imgbbKey);
    } catch (e) { }
    return "";
}

async function run() {
    console.log("🧘 VUE V16.9.1 Zen-Visuals Initializing...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const lang = config.lang || 'ko';
    const kieKey = process.env.KIE_API_KEY;
    const imgbbKey = process.env.IMGBB_API_KEY;
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const dayI = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayI % config.clusters.length];
    const subTopics = config.clusters;
    
    const bText = lang === 'ko' ? "독점 칼럼" : "EXCLUSIVE COLUMN";
    const readBtn = lang === 'ko' ? "본문 읽기 →" : "Read More →";

    let publishTime = new Date(Date.now() + 15 * 60 * 1000);
    const subHistory = [];

    for (let i = 0; i < 5; i++) {
        const isMain = (i === 4);
        const currentContext = isMain ? targetTopic : (subTopics[i] || targetTopic);
        console.log(`🎯 [${isMain ? 'MASTER' : 'SUB'}] Crafting Zen Visually ${i+1}/5...`);

        const titlePrompt = `Generate a High-Authority Long-tail SEO Title for: "${currentContext}". 
            NO "Part X", NO numbers, NO colon. Make it a standalone professional headline.`;
        
        const titleRaw = await callGemini(model, titlePrompt);
        const title = titleRaw.trim().replace(/[\\"]/g, '');

        const imgPs = (await callGemini(model, `4 image prompts for "${title}". English.`)).split("\n").slice(0, 4);
        const imageUrls = await Promise.all(imgPs.map(p => generateImage(p.trim(), kieKey, imgbbKey)));

        const sumRaw = await callGemini(model, `3 punchy summary bullets for "${title}" in ${lang}.`);
        const cleanSum = sumRaw.split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*\\d.]\\s*/, '')).join('<br>');

        let finalBody = STYLE + `<div class="vue-content-body">
            ${imageUrls[0] ? `<div class="vue-main-thumbnail"><img src="${imageUrls[0]}" alt="${title}"><div class="vue-thumb-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;background:rgba(0,0,0,0.1);"><div style="background:#facc15;color:#000;padding:8px 25px;border-radius:12px;font-weight:950;margin-bottom:25px;">${bText}</div><div style="font-size:3.5rem;font-weight:1000;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,0.8);text-align:center;">${title}</div></div></div>` : ''}
            <div style="background:#f8fafc;border-radius:25px;padding:2.5rem;margin:4rem 0;border:2px dashed #6366f1;"><span style="font-weight:900;color:#4338ca;font-size:1.3rem;margin-bottom:1.5rem;display:block;">QUICK INSIGHTS</span>${cleanSum}</div>`;

        if (isMain) {
            const mBody = await callGemini(model, `Write Flagship Master Article for "${targetTopic}" in ${lang}. NO numeric subheads. Use h2 and h3 properly. HTML ONLY.`);
            finalBody += cleanHtml(mBody);
            subHistory.forEach(s => {
                finalBody += `<div class="vue-hub-card">
                    <span style="font-size:1.9rem;font-weight:1000;color:#1e293b;margin-bottom:1.5rem;display:block;">${s.title}</span>
                    <p style="color:#64748b;font-size:1.15rem;margin-bottom:2rem;">${s.summary}</p>
                    <a href="${s.url}" class="vue-btn-more">${readBtn}</a>
                </div>`;
            });
        } else {
            for(let p=1; p<=3; p++) {
                const pBody = await callGemini(model, `Professional analysis segment ${p} for article: "${title}" in ${lang}. Use h3 for details. NO numeric headings. HTML ONLY.`);
                finalBody += cleanHtml(pBody);
                if(imageUrls[p]) finalBody += `<div style="margin:5rem 0;text-align:center;"><img src="${imageUrls[p]}" style="max-width:100%;border-radius:35px;box-shadow:0 30px 60px rgba(0,0,0,0.12);"></div>`;
            }
        }

        const faqR = await callGemini(model, `15 High-Intent SEO FAQs for "${title}" in ${lang}. Return ONLY raw JSON.`);
        try {
            const faqs = JSON.parse(faqR.replace(/\`\`\`json|\`\`\`/g, '').trim());
            let fH = `<div style="background:#fff;border-radius:40px;padding:4rem;margin-top:8rem;border:3px solid #f1f5f9;"><div style="font-size:2.5rem;font-weight:1000;color:#6366f1;margin-bottom:4rem;text-align:center;">FAQ</div>`;
            faqs.forEach(f => { if(f.q && f.a) fH += `<div style="margin-bottom:3rem;"><span style="font-weight:1000;color:#1e293b;font-size:1.5rem;display:flex;">Q. ${f.q}</span><p style="color:#475569;font-size:1.15rem;padding-left:45px;">${f.a}</p></div>`; });
            finalBody += fH + `</div>`;
        } catch(e) { }

        finalBody += `<div style="margin-top:100px; text-align:center; color:#94a3b8; font-size:13px;">© VUE Zen-Visuals Platform.</div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            await blogger.posts.insert({ blogId: config.blog_id, requestBody: { title, content: finalBody, published: publishTime.toISOString() } });
            
            subHistory.push({ title, url: "", summary: cleanSum, body: finalBody, isMain });
            console.log(`✅ [${isMain ? 'MASTER' : 'SUB'}] Posted Zen: ${title}`);
        } catch (e) { }
        
        await sleep(15000); 
        publishTime = new Date(publishTime.getTime() + (138 + Math.random() * 48) * 60 * 1000);
    }
}
run();