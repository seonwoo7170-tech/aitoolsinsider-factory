
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const PREMIUM_STYLE = `<style>
    .vue-content-body { font-family: 'Inter', sans-serif; color: #1e293b; line-height: 1.8; font-size: 16px; max-width: 800px; margin: 0 auto; }
    .vue-content-body h2 { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin-top: 3rem; margin-bottom: 1.5rem; border-left: 6px solid #6366f1; padding-left: 1rem; }
    .vue-content-body h3 { font-size: 1.4rem; font-weight: 700; color: #334155; margin-top: 2rem; margin-bottom: 1rem; }
    .vue-content-body p { margin-bottom: 1.5rem; text-align: justify; }
    .vue-callout { background: #f1f5f9; border-radius: 1rem; padding: 1.5rem; margin: 2rem 0; border-left: 4px solid #6366f1; }
    .vue-tip { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 1rem; border-radius: 0.5rem; margin: 1.5rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 2rem 0; }
    th { background: #6366f1; color: white; padding: 0.8rem; text-align: left; }
    td { padding: 0.8rem; border-bottom: 1px solid #f1f5f9; }
</style>`;

async function run() {
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayIndex % config.clusters.length];
    
    console.log("🎯 Focus: " + targetTopic);
    const angles = ["Extreme Comprehensive Guide", "Deep Strategic Case Studies", "Unbiased Tool Comparison", "Critical Pitfalls & Solutions", "Future Industry Vision 2026"];
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    for (let i = 0; i < 5; i++) {
        console.log(`\n📦 [${i+1}/5] Angle: ${angles[i]}`);
        let searchContext = "";
        try {
            const sRes = await axios.post('https://google.serper.dev/search', { q: targetTopic + " " + angles[i] }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } });
            if (sRes.data.organic) searchContext = sRes.data.organic.slice(0, 5).map(o => o.snippet).join("\n");
        } catch(e) {}

        const tRes = await model.generateContent(`Create high-CTR SEO title for "${targetTopic}" focusing on ${angles[i]}. English only. No quotes.`);
        const seoTitle = tRes.response.text().trim();

        const base = `You are a premium tech journalist. Use <h2>, <h3>, <table>, <div class="vue-tip">. Respond ONLY in HTML fragments.`;
        const h1Res = await model.generateContent(`${base}\n\nPart 1: Intro/Analysis for "${seoTitle}". Min 1500 words.\n\nCONTEXT:\n${searchContext}`);
        const h1 = h1Res.response.text().replace(/```html|```/g, '').trim();

        const h2Res = await model.generateContent(`${base}\n\nPart 2: Strategies/Cases for "${seoTitle}". Min 1500 words.\n\nCONTEXT:\n${searchContext}`);
        const h2 = h2Res.response.text().replace(/```html|```/g, '').trim();

        const h3Res = await model.generateContent(`${base}\n\nPart 3: FAQ/Conclusion for "${seoTitle}". Min 1000 words.\n\nCONTEXT:\n${searchContext}`);
        const h3 = h3Res.response.text().replace(/```html|```/g, '').trim();

        let imageUrl = "";
        try {
            const pUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(`Cinematic 8k photography of ${targetTopic}, ${angles[i]}`) + "?width=1280&height=720&nologo=true";
            const imgRes = await axios.get(pUrl, { responseType: 'arraybuffer' });
            const b64 = Buffer.from(imgRes.data).toString('base64');
            const imgbb = await axios.post("https://api.imgbb.com/1/upload?key=" + process.env.IMGBB_API_KEY, new URLSearchParams({ image: b64 }));
            imageUrl = imgbb.data.data.url;
        } catch(e) {}

        const body = (imageUrl ? `<div style="text-align:center;margin-bottom:40px;"><img src="${imageUrl}" style="width:100%;border-radius:24px;"></div>` : "") + PREMIUM_STYLE + `<div class="vue-content-body">` + h1 + h2 + h3 + `</div>`;
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        await google.blogger({ version: 'v3', auth }).posts.insert({ blogId: process.env.BLOG_ID, requestBody: { title: seoTitle, content: body, labels: ["VUE", targetTopic] } });

        console.log(`✅ Post ${i+1} published!`);
        if (i < 4) await new Promise(r => setTimeout(r, 180000));
    }
}
run().catch(e => { console.error(e); process.exit(1); });
