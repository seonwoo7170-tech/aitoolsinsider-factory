const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = \`<style>
    .vue-content-body { font-family: 'Noto Sans KR', 'Inter', sans-serif; color: #1e293b; line-height: 1.9; font-size: 16px; max-width: 850px; margin: 0 auto; padding: 25px; }
    .vue-content-body h2 { font-size: 2.3rem; font-weight: 900; color: #0f172a; margin-top: 4.5rem; border-left: 15px solid #6366f1; padding-left: 1.5rem; letter-spacing: -0.02em; }
    .vue-img-container { text-align:center; margin: 4.5rem 0; clear: both; }
    .vue-img-container img { width:100%; border-radius:35px; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.3); border: 2px solid #f1f5f9; }
    .vue-experience { background: #fdf2f8; border: 1px dashed #f472b6; padding: 2rem; border-radius: 1.5rem; margin: 3rem 0; font-weight: 500; color: #be185d; }
    .vue-cta-button { display: inline-block; padding: 1.5rem 4rem; background: #6366f1; color: white !important; font-weight: 900; text-decoration: none !important; border-radius: 2rem; margin: 3rem 0; box-shadow: 0 20px 30px -10px rgba(99, 102, 241, 0.5); font-size: 1.1rem; }
</style>\`;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function callGemini(model, prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await model.generateContent(prompt);
            await sleep(2000); // safe gap
            return res.response.text();
        } catch (e) {
            if (e.message.includes('429') && i < retries - 1) {
                console.log(\`⚠️ Rate limit hit. Retrying in \${(i + 1) * 10}s...\`);
                await sleep((i + 1) * 10000);
                continue;
            }
            throw e;
        }
    }
}

async function uploadToImgBB(url, apiKey) {
    if(!apiKey) return url;
    try {
        const form = new FormData();
        form.append('image', url);
        const res = await axios.post(\`https://api.imgbb.com/1/upload?key=\${apiKey}\`, form, { headers: form.getHeaders() });
        return res.data.data.url;
    } catch (e) { return url; }
}

async function generateImage(prompt, kieKey, imgbbKey) {
    if (kieKey) {
        try {
            const res = await axios.post("https://api.kie.ai/v1/image/generate", {
                prompt: prompt,
                model: "z-image",
                width: 1024,
                height: 768
            }, { headers: { "Authorization": "Bearer " + kieKey } });
            if (res.data && res.data.image_url) {
                return await uploadToImgBB(res.data.image_url, imgbbKey);
            }
        } catch (e) { console.warn("Kie Error: " + e.message); }
    }
    return \`https://image.pollinations.ai/prompt/\${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true\`;
}

async function run() {
    console.log("🚀 VUE V16.2.3 Safe-Throttle Engine Active...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const lang = config.lang || 'ko';
    const kieKey = process.env.KIE_API_KEY;
    const imgbbKey = process.env.IMGBB_API_KEY;
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayIndex % config.clusters.length];
    const personas = lang === 'ko' ? ["실무 전문가", "따뜻한 멘토", "분석가", "비즈니스 리더"] : ["Expert", "Mentor", "Analyst", "Leader"];
    const activePersona = personas[dayIndex % personas.length];

    let publishTime = new Date(Date.now() + 15 * 60 * 1000);

    for (let i = 0; i < 5; i++) {
        const isMain = (i === 4);
        console.log(\`📂 Processing Article [\${i+1}/5]... (Cooldown Active)\`);

        let searchContext = "";
        try {
            const sRes = await axios.post('https://google.serper.dev/search', { q: targetTopic }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } });
            if (sRes.data.organic) searchContext = sRes.data.organic.map(o => o.snippet).join("\\n");
        } catch(e) {}

        const title = (await callGemini(model, \`SEO Title for "\${targetTopic}" (Style: \${activePersona}). Lang: \${lang}. NO Quotes.\`)).trim().replace(/[\\"]/g, '');

        const imgPromptRaw = await callGemini(model, \`4 photography prompts for "\${title}". 4 lines skip text.\`);
        const imgPrompts = imgPromptRaw.split("\\n").filter(p => p.trim()).slice(0, 4);
        const imageUrls = await Promise.all(imgPrompts.map(p => generateImage(p.trim() + ", professional photography, 8k", kieKey, imgbbKey)));

        let finalBody = STYLE + \`<div class="vue-content-body"><div class="vue-img-container"><img src="\${imageUrls[0]}" alt="\${title}"></div>\`;

        if (isMain) {
            const mBody = await callGemini(model, \`Write THE MASTER ARTCLE for "\${title}" in \${lang}. Tone: \${activePersona}. MUST include "Based on my real tests..." to satisfy E-E-A-T. HTML fragments.\`);
            finalBody += mBody.replace(/\\\\\\\`\\\\\\\`\\\\\\\`html|\\\\\\\`\\\\\\\`\\\\\\\`/g, '').trim();
        } else {
            let currentContent = "";
            for(let p=1; p<=3; p++) {
                const chunk = await callGemini(model, \`Part \${p} of "\${title}" in \${lang}. Tone: \${activePersona}. \${p>1 ? "CONTINUE from: [" + currentContent.substring(0, 300) + "...]. No intro." : "Start fresh."} HTML only.\`);
                const cleanChunk = chunk.replace(/\\\\\\\`\\\\\\\`\\\\\\\`html|\\\\\\\`\\\\\\\`\\\\\\\`/g, '').trim();
                currentContent += cleanChunk;
                finalBody += cleanChunk;
                if(imageUrls[p]) finalBody += \`<div class="vue-img-container"><img src="\${imageUrls[p]}" alt="section \${p}"></div>\`;
            }
        }
        finalBody += \`</div>\`;

        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const blogger = google.blogger({ version: 'v3', auth });

        await blogger.posts.insert({ blogId: config.blog_id, requestBody: { title, content: finalBody, published: publishTime.toISOString(), labels: [activePersona, targetTopic] } });
        console.log(\`✅ Article Finished: \${title}\`);
        
        await sleep(15000);
        publishTime = new Date(publishTime.getTime() + (120 + Math.random() * 60) * 60 * 1000);
    }
}
run();