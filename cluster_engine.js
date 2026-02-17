const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', 'Inter', sans-serif; color: #1e293b; line-height: 2.0; font-size: 16px; max-width: 800px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.5rem; font-weight: 950; color: #0f172a; margin-top: 5rem; border-left: 14px solid #6366f1; padding-left: 1.5rem; }
    .vue-main-thumbnail { position: relative; width: 100%; height: 500px; border-radius: 40px; overflow: hidden; margin-bottom: 4rem; box-shadow: 0 45px 90px -15px rgba(0,0,0,0.3); }
    .vue-main-thumbnail img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.6); }
    .vue-hub-card { background: #ffffff; border: 2px solid #f1f5f9; border-radius: 35px; padding: 3rem; margin: 4.5rem 0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.06); transition: 0.5s ease; }
    .vue-hub-card:hover { transform: translateY(-12px); border-color: #6366f1; box-shadow: 0 35px 70px -15px rgba(99,102,241,0.15); }
    .vue-btn-more { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff !important; padding: 18px 45px; border-radius: 18px; font-weight: 1000; text-decoration: none !important; box-shadow: 0 10px 20px -5px rgba(67, 56, 202, 0.4); }
    .vue-spider-footer { background: #0f172a; color: #fff; border-radius: 40px; padding: 3.5rem; margin-top: 8rem; }
    .vue-web-link { background: rgba(255,255,255,0.05); padding: 18px; border-radius: 15px; color: #cbd5e1 !important; text-decoration: none !important; transition: 0.3s; display: block; margin-bottom: 12px; }
    .vue-web-link:hover { background: #6366f1; color: #fff !important; transform: translateX(8px); }
</style>`;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function callGemini(model, prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await model.generateContent(prompt);
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
    clean = clean.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('');
    const tags = ['html','head','body','title','!DOCTYPE'];
    tags.forEach(t => { clean = clean.replace(new RegExp('<' + t + '[^>]*>', 'gi'), '').replace(new RegExp('</' + t + '>', 'gi'), ''); });
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
            prompt: cleanP + ", epic cinematic photography, professional masterwork, 8k",
            model: "z-image", width: 1024, height: 768
        }, { headers: { "Authorization": "Bearer " + kieKey }, timeout: 60000 });
        if (res.data && res.data.image_url) return await uploadToImgBB(res.data.image_url, imgbbKey);
    } catch (e) { }
    return "";
}

async function run() {
    console.log("🕷️ VUE V16.8.1 Spider-Hub System Launching...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const lang = config.lang || 'ko';
    const kieKey = process.env.KIE_API_KEY;
    const imgbbKey = process.env.IMGBB_API_KEY;
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const dayI = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayI % config.clusters.length];
    
    const bText = lang === 'ko' ? "마스터 클래스" : "MASTER CLASS";
    const readBtn = lang === 'ko' ? "자세히 알아보기 →" : "Dive Deeper →";
    const netTitle = lang === 'ko' ? "🌐 지식 연결망" : "🌐 Knowledge Hub";

    let publishTime = new Date(Date.now() + 15 * 60 * 1000);
    const subHistory = []; // { id, title, url, summary, body }

    for (let i = 0; i < 5; i++) {
        const isMain = (i === 4);
        console.log(`📂 Building Article [${i+1}/5] (${isMain ? 'MASTER' : 'SUB'})...`);

        const titleRaw = await callGemini(model, `Extreme SEO Title for "${targetTopic}" in ${lang}.`);
        const title = titleRaw.trim().replace(/[\\"]/g, '');

        const imgPs = (await callGemini(model, `ONLY 4 image prompts for "${title}". English.`)).split("\n").slice(0, 4);
        const imageUrls = await Promise.all(imgPs.map(p => generateImage(p.trim(), kieKey, imgbbKey)));

        const sumRaw = await callGemini(model, `Write 3 explosive summary lines for "${title}" in ${lang}. NO intro.`);
        const cleanSum = sumRaw.split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*\\d.]\\s*/, '')).join('<br>');

        let finalBody = STYLE + `<div class="vue-content-body">
            ${imageUrls[0] ? `<div class="vue-main-thumbnail"><img src="${imageUrls[0]}" alt="${title}"><div class="vue-thumb-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;"><div style="background:#facc15;color:#000;padding:8px 22px;border-radius:12px;font-weight:950;margin-bottom:25px;font-size:1rem;">${bText}</div><div style="font-size:3.5rem;font-weight:1000;color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.6);text-align:center;">${title}</div></div></div>` : ''}`;

        if (isMain) {
            const mIntro = await callGemini(model, `Expert Intro for "${targetTopic}" ${lang}. HTML.`);
            finalBody += cleanHtml(mIntro);
            
            // THE ELITE HUB CARDS
            subHistory.forEach(s => {
                finalBody += `<div class="vue-hub-card">
                    <span style="font-size:1.8rem;font-weight:1000;color:#1e293b;margin-bottom:1.5rem;display:block;">${s.title}</span>
                    <p style="color:#64748b;font-size:1.1rem;margin-bottom:2rem;line-height:1.8;">${s.summary}</p>
                    <a href="${s.url}" class="vue-btn-more">${readBtn}</a>
                </div>`;
            });

            const mOutro = await callGemini(model, `Expert Conclusion for "${targetTopic}" ${lang}. HTML.`);
            finalBody += cleanHtml(mOutro);
        } else {
            for(let p=1; p<=3; p++) {
                const cP = await callGemini(model, `Section ${p} for "${title}" ${lang}. HTML ONLY.`);
                finalBody += cleanHtml(cP);
                if(imageUrls[p]) finalBody += `<div style="margin:4rem 0;text-align:center;"><img src="${imageUrls[p]}" style="max-width:100%;border-radius:30px;box-shadow:0 20px 40px rgba(0,0,0,0.1);"></div>`;
            }
        }

        finalBody += `<div style="margin-top:80px; text-align:center; color:#94a3b8; font-size:13px; font-style:italic;">Copyright © VUE Spider-Hub.</div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            const res = await blogger.posts.insert({ blogId: config.blog_id, requestBody: { title, content: finalBody, published: publishTime.toISOString() } });
            
            subHistory.push({ id: res.data.id, title, url: res.data.url, summary: cleanSum, body: finalBody, isMain });
            console.log(`✅ [${isMain ? 'MASTER' : 'SUB'}] Posted: ${title}`);
        } catch (e) { console.error(e); }
        
        await sleep(15000); 
        publishTime = new Date(publishTime.getTime() + (134 + Math.random() * 44) * 60 * 1000);
    }

    // PHASE 2: SPIDER WEAVING FOR SUBS
    console.log("🕷️ Weaving the Spider-Web Network for Sub Articles...");
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });

    const master = subHistory.find(h => h.isMain);
    for (let s of subHistory.filter(h => !h.isMain)) {
        const others = subHistory.filter(h => h.id !== s.id);
        let webHtml = `<div class="vue-spider-footer"><div style="font-size:1.8rem;font-weight:950;color:#6366f1;margin-bottom:2.5rem;text-align:center;">${netTitle}</div>`;
        others.forEach(o => { webHtml += `<a href="${o.url}" class="vue-web-link">🔗 ${o.title} ${o.isMain ? '(Recommended)' : ''}</a>`; });
        webHtml += `</div>`;
        
        try {
            await blogger.posts.patch({ blogId: config.blog_id, postId: s.id, requestBody: { content: s.body + webHtml } });
            console.log(`🕷️ Weaved Web into: ${s.title}`);
            await sleep(5000);
        } catch(e) { }
    }
}
run();