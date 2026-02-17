const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', 'Inter', sans-serif; color: #1e293b; line-height: 1.9; font-size: 16px; max-width: 850px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.3rem; font-weight: 900; color: #0f172a; margin-top: 4.5rem; border-left: 15px solid #6366f1; padding-left: 1.5rem; letter-spacing: -0.02em; }
    .vue-main-thumbnail { position: relative; width: 100%; height: 500px; border-radius: 35px; overflow: hidden; margin-bottom: 3.5rem; box-shadow: 0 45px 90px -20px rgba(0,0,0,0.45); }
    .vue-main-thumbnail img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.6); }
    .vue-thumb-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px; text-align: center; }
    .vue-thumb-title { font-size: 3.2rem; font-weight: 1000; line-height: 1.2; color: #ffffff; text-shadow: 0 5px 30px rgba(0,0,0,0.8); word-break: keep-all; }
    .vue-thumb-badge { background: #facc15; color: #000; padding: 8px 18px; border-radius: 8px; font-size: 0.9rem; font-weight: 950; margin-bottom: 20px; }
    .vue-img-container { text-align:center; margin: 4.5rem 0; clear: both; }
    .vue-img-container img { width:100%; border-radius:35px; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.3); border: 2px solid #f1f5f9; display: block; margin: 0 auto; }
    .vue-faq-section { background: #f8fafc; border-radius: 2rem; padding: 3.5rem; margin-top: 6rem; border: 1px solid #e2e8f0; }
    .vue-faq-header { font-size: 2rem; font-weight: 1000; color: #0f172a; margin-bottom: 3rem; text-align: center; border-bottom: 3px solid #6366f1; width: 100%; padding-bottom: 10px; }
    .vue-faq-item { margin-bottom: 2.5rem; }
    .vue-faq-q { font-weight: 950; color: #4338ca; font-size: 1.3rem; margin-bottom: 0.8rem; display: block; border-left: 5px solid #4338ca; padding-left: 15px; }
    .vue-faq-a { color: #334155; font-size: 1.1rem; line-height: 1.8; padding-left: 20px; }
    .vue-disclaimer-section { background: #f8fafc; border-radius: 1.5rem; padding: 2rem; margin-top: 5rem; border-top: 5px solid #cbd5e1; }
    .vue-disclaimer-text { color: #64748b; font-size: 0.9rem; line-height: 1.7; text-align: center; }
</style>`;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function cleanHtml(raw) {
    if (!raw) return "";
    let clean = raw.replace(new RegExp('\\\`\\\`\\\`html|\\\`\\\`\\\`', 'g'), '').trim();
    clean = clean.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>');
    clean = clean.replace(/\\*(.*?)\\*/g, '<i>$1</i>');
    const tags = ['html','head','body','title','!DOCTYPE'];
    tags.forEach(t => { clean = clean.replace(new RegExp('<' + t + '[^>]*>', 'gi'), '').replace(new RegExp('</' + t + '>', 'gi'), ''); });
    return clean.trim();
}

async function uploadToImgBB(url, apiKey) {
    if(!apiKey || !url) return url;
    if(!url.startsWith('http')) return "";
    try {
        const form = new FormData();
        form.append('image', url);
        const res = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, form, { headers: form.getHeaders() });
        return res.data.data.url;
    } catch (e) { console.warn("ImgBB Fail:", e.message); return url; }
}

async function generateImage(prompt, kieKey, imgbbKey) {
    let rawUrl = "";
    let cleanP = prompt.replace(/^[0-9]+[\\.\\)]\\s*/, '').trim().replace(/[^a-zA-Z0-9\\s]/g, '').substring(0, 300);

    if (kieKey) {
        try {
            console.log("🎨 Kie.ai Generation...");
            const res = await axios.post("https://api.kie.ai/v1/image/generate", {
                prompt: cleanP + ", cinematic, cinematic lighting, 8k, highly detailed, professional photography",
                model: "z-image", width: 1024, height: 768
            }, { headers: { "Authorization": "Bearer " + kieKey }, timeout: 60000 });
            if (res.data && res.data.image_url) rawUrl = res.data.image_url;
        } catch (e) { console.warn("Kie Error:", e.message); }
    }
    
    // No fallback to pollinations. Only ImgBB hosting if rawUrl exists.
    if (rawUrl) return await uploadToImgBB(rawUrl, imgbbKey);
    return "";
}

async function run() {
    console.log("🚀 VUE V16.5.2 Pure-Kie Engine Active...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const lang = config.lang || 'ko';
    const kieKey = process.env.KIE_API_KEY;
    const imgbbKey = process.env.IMGBB_API_KEY;
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayIndex % config.clusters.length];
    const personas = lang === 'ko' ? ["실무 전문가", "따뜻한 멘토", "분석가"] : ["Expert", "Mentor", "Analyst"];
    const activePersona = personas[dayIndex % personas.length];
    
    const badgeText = lang === 'ko' ? "마스터 클래스" : "MASTER CLASS";
    const faqTitle = lang === 'ko' ? "자주 묻는 질문 (FAQ)" : "Frequently Asked Questions";
    const disclaimerT = lang === 'ko' ? "본 콘텐츠는 일반 정보 제공용이며 법적 책임을 지지 않습니다." : "General information only. No liability assumed.";

    let publishTime = new Date(Date.now() + 15 * 60 * 1000);

    for (let i = 0; i < 5; i++) {
        const isMain = (i === 4);
        console.log(`📂 Article [${i+1}/5] (Premium Kie Mode)`);

        const titleRaw = await callGemini(model, `SEO Title for "${targetTopic}" in ${lang}. NO quotes. NO intro.`);
        const title = titleRaw.trim().replace(/[\\"]/g, '');

        const imgPRaw = await callGemini(model, `Return ONLY 4 cinematic image prompts for "${title}". English. One per line. NO text.`);
        const imgPs = imgPRaw.split("\n").filter(p => p.trim().length > 5).slice(0, 4);
        const imageUrls = await Promise.all(imgPs.map(p => generateImage(p.trim(), kieKey, imgbbKey)));

        let finalBody = STYLE + `<div class="vue-content-body">
            ${imageUrls[0] ? `<div class="vue-main-thumbnail">
                <img src="${imageUrls[0]}" alt="${title}">
                <div class="vue-thumb-overlay">
                    <div class="vue-thumb-badge">${badgeText}</div>
                    <div class="vue-thumb-title">${title}</div>
                </div>
            </div>` : ''}`;

        if (isMain) {
            const mB = await callGemini(model, `Write Master Article for "${title}" in ${lang}. Style: ${activePersona}. HTML only.`);
            finalBody += cleanHtml(mB);
        } else {
            for(let p=1; p<=3; p++) {
                const cR = await callGemini(model, `Part ${p} for "${title}" in ${lang}. NO intro. HTML only.`);
                finalBody += cleanHtml(cR);
                if(imageUrls[p]) finalBody += `<div class="vue-img-container"><img src="${imageUrls[p]}" alt="visual ${p}"></div>`;
            }
        }

        const faqR = await callGemini(model, `15-20 FAQs for "${title}" in ${lang}. Output JSON: [{"q":"...","a":"..."}].`);
        try {
            const faqs = JSON.parse(faqR.replace(new RegExp('\\\`\\\`\\\`json|\\\`\\\`\\\`', 'g'), '').trim());
            let fH = `<div class="vue-faq-section"><div class="vue-faq-header">${faqTitle}</div>`;
            faqs.forEach(f => { fH += `<div class="vue-faq-item"><span class="vue-faq-q">${f.q}</span><p class="vue-faq-a">${f.a}</p></div>`; });
            fH += `</div>`;
            const sD = { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faqs.map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } })) };
            finalBody += fH + `<script type="application/ld+json">${JSON.stringify(sD)}<\/script>`;
        } catch(e) { }

        finalBody += `<div class="vue-disclaimer-section"><p class="vue-disclaimer-text">${disclaimerT}</p></div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            await blogger.posts.insert({ blogId: config.blog_id, requestBody: { title, content: finalBody, published: publishTime.toISOString() } });
            console.log(`✅ PREMIUM POSTED: ${title}`);
        } catch (e) { }
        
        await sleep(15000); 
        publishTime = new Date(publishTime.getTime() + (130 + Math.random() * 40) * 60 * 1000);
    }
}
run();