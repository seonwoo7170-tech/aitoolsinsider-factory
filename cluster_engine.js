const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', 'Inter', sans-serif; color: #1e293b; line-height: 2.1; font-size: 16px; max-width: 800px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.6rem; font-weight: 1000; color: #0f172a; margin-top: 5rem; border-left: 15px solid #6366f1; padding-left: 1.5rem; letter-spacing: -0.05em; }
    .vue-main-thumbnail { position: relative; width: 100%; height: 500px; border-radius: 40px; overflow: hidden; margin-bottom: 4rem; box-shadow: 0 45px 90px -15px rgba(0,0,0,0.35); }
    .vue-main-thumbnail img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.65); }
    .vue-hub-card { background: #ffffff; border: 2.5px solid #f1f5f9; border-radius: 35px; padding: 3rem; margin: 4.5rem 0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.06); transition: 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
    .vue-btn-more { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff !important; padding: 20px 50px; border-radius: 20px; font-weight: 1000; text-decoration: none !important; box-shadow: 0 12px 24px -5px rgba(67, 56, 202, 0.4); }
    .vue-spider-footer { background: #0f172a; color: #fff; border-radius: 40px; padding: 4rem; margin-top: 10rem; }
</style>`;

const PURE_CMD = "MANDATORY: Return ONLY the final output. NO intro text, NO 'Here is...', NO options, NO meta-explanation, NO 'Certainly!', NO quotes around the content.";

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function callGemini(model, prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await model.generateContent(`${PURE_CMD}\n\nPROMPT: ${prompt}`);
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
    // Aggressive AI Meta-Talk Removal
    const badPhrases = [/Here are a few options/gi, /Certainly!/gi, /I hope this helps/gi, /Sure thing/gi, /I've selected the best/gi, /Okay, here is/gi, /Option \\d:/gi];
    badPhrases.forEach(p => { clean = clean.replace(p, ''); });
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
            prompt: cleanP + ", ultra high quality magazine photography, cinematic, 8k, professional",
            model: "z-image", width: 1024, height: 768
        }, { headers: { "Authorization": "Bearer " + kieKey }, timeout: 60000 });
        if (res.data && res.data.image_url) return await uploadToImgBB(res.data.image_url, imgbbKey);
    } catch (e) { }
    return "";
}

async function run() {
    console.log("🦁 VUE V16.8.2 Content-Dictator Enforced...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const lang = config.lang || 'ko';
    const kieKey = process.env.KIE_API_KEY;
    const imgbbKey = process.env.IMGBB_API_KEY;
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const dayI = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayI % config.clusters.length];
    
    const bText = lang === 'ko' ? "프리미엄 리포트" : "PREMIUM REPORT";
    const readBtn = lang === 'ko' ? "풀 스토리 읽어보기 →" : "Read Full Story →";

    let publishTime = new Date(Date.now() + 15 * 60 * 1000);
    const subHistory = [];

    for (let i = 0; i < 5; i++) {
        const isMain = (i === 4);
        console.log(`🎯 [${isMain ? 'MASTER' : 'SUB'}] Crafting Pure Content Article [${i+1}/5]...`);

        const titleRaw = await callGemini(model, `Choose and return ONLY ONE final high-CTR SEO title for "${targetTopic}" in ${lang}. NO options.`);
        const title = titleRaw.trim().replace(/[\\"]/g, '');

        const imgPs = (await callGemini(model, `Return ONLY 4 image prompts for "${title}". English.`)).split("\n").slice(0, 4);
        const imageUrls = await Promise.all(imgPs.map(p => generateImage(p.trim(), kieKey, imgbbKey)));

        const sumRaw = await callGemini(model, `Write 3 punchy summary bullet points for "${title}" in ${lang}. NO intro.`);
        const cleanSum = sumRaw.split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*\\d.]\\s*/, '')).join('<br>');

        let finalBody = STYLE + `<div class="vue-content-body">
            ${imageUrls[0] ? `<div class="vue-main-thumbnail"><img src="${imageUrls[0]}" alt="${title}"><div class="vue-thumb-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;background:rgba(0,0,0,0.1);"><div style="background:#facc15;color:#000;padding:8px 25px;border-radius:12px;font-weight:950;margin-bottom:25px;">${bText}</div><div style="font-size:3.7rem;font-weight:1000;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,0.7);text-align:center;">${title}</div></div></div>` : ''}
            <div style="background:#f8fafc;border-radius:25px;padding:2.5rem;margin:4rem 0;border:2px dashed #6366f1;"><span style="font-weight:900;color:#4338ca;font-size:1.3rem;margin-bottom:1.5rem;display:block;">QUICK SUMMARY</span>${cleanSum}</div>`;

        if (isMain) {
            const mIntro = await callGemini(model, `Write Elite Knowledge Hub Lead Paragraph for "${targetTopic}" ${lang}. NO intro/outro. HTML ONLY.`);
            finalBody += cleanHtml(mIntro);
            
            subHistory.forEach(s => {
                finalBody += `<div class="vue-hub-card">
                    <span style="font-size:1.9rem;font-weight:1000;color:#1e293b;margin-bottom:1.5rem;display:block;">${s.title}</span>
                    <p style="color:#64748b;font-size:1.15rem;margin-bottom:2rem;">${s.summary}</p>
                    <a href="${s.url}" class="vue-btn-more">${readBtn}</a>
                </div>`;
            });

            const mOutro = await callGemini(model, `Write Master Synthesis Conclusion for "${targetTopic}" ${lang}. NO meta-talk. HTML.`);
            finalBody += cleanHtml(mOutro);
        } else {
            for(let p=1; p<=3; p++) {
                const cP = await callGemini(model, `Write Deep Insight Part ${p} for "${title}" ${lang}. DO NOT provide options. HTML ONLY.`);
                finalBody += cleanHtml(cP);
                if(imageUrls[p]) finalBody += `<div style="margin:5rem 0;text-align:center;"><img src="${imageUrls[p]}" style="max-width:100%;border-radius:35px;box-shadow:0 30px 60px rgba(0,0,0,0.12);"></div>`;
            }
        }

        const faqR = await callGemini(model, `15 Professional FAQs for "${title}" ${lang}. Return ONLY raw JSON Array. NO explain.`);
        try {
            const faqs = JSON.parse(faqR.replace(/\`\`\`json|\`\`\`/g, '').trim());
            let fH = `<div style="background:#fff;border-radius:40px;padding:4rem;margin-top:8rem;border:3px solid #f1f5f9;"><div style="font-size:2.5rem;font-weight:1000;color:#6366f1;margin-bottom:4rem;text-align:center;">FAQ</div>`;
            faqs.forEach(f => { fH += `<div style="margin-bottom:3rem;"><span style="font-weight:1000;color:#1e293b;font-size:1.5rem;display:flex;">Q. ${f.q}</span><p style="color:#475569;font-size:1.15rem;padding-left:45px;">${f.a}</p></div>`; });
            finalBody += fH + `</div>`;
        } catch(e) { }

        finalBody += `<div style="margin-top:100px; text-align:center; color:#94a3b8; font-size:13px;">Copyright © VUE Spider-Hub.</div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            const res = await blogger.posts.insert({ blogId: config.blog_id, requestBody: { title, content: finalBody, published: publishTime.toISOString() } });
            
            subHistory.push({ id: res.data.id, title, url: res.data.url, summary: cleanSum, body: finalBody, isMain });
            console.log(`✅ [${isMain ? 'MASTER' : 'SUB'}] Enforced: ${title}`);
        } catch (e) { console.error(e); }
        
        await sleep(15000); 
        publishTime = new Date(publishTime.getTime() + (135 + Math.random() * 45) * 60 * 1000);
    }

    // PHASE 2: SPIDER WEAVING
    console.log("🕸️ Weaving Spider-Web (Phase 2)...");
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });

    for (let s of subHistory.filter(h => !h.isMain)) {
        let webHtml = `<div class="vue-spider-footer"><div style="font-size:1.95rem;font-weight:1000;color:#6366f1;margin-bottom:3rem;text-align:center;">🌐 KNOWLEDGE NETWORK</div>`;
        subHistory.filter(h => h.id !== s.id).forEach(o => { webHtml += `<a href="${o.url}" style="background:rgba(255,255,255,0.06);padding:20px;border-radius:18px;color:#cbd5e1 !important;text-decoration:none !important;display:block;margin-bottom:15px;transition:0.3s;">🔗 ${o.title} ${o.isMain ? '<b>(MUST READ)</b>' : ''}</a>`; });
        webHtml += `</div>`;
        try { await blogger.posts.patch({ blogId: config.blog_id, postId: s.id, requestBody: { content: s.body + webHtml } }); await sleep(5000); } catch(e) { }
    }
}
run();