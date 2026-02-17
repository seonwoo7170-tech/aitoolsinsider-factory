
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const PREMIUM_STYLE = `<style>
    .vue-content-body { font-family: 'Inter', sans-serif; color: #1e293b; line-height: 1.8; font-size: 16px; max-width: 800px; margin: 0 auto; padding: 20px; }
    .vue-content-body h2 { font-size: 2.2rem; font-weight: 800; color: #0f172a; margin-top: 4rem; margin-bottom: 2rem; border-left: 8px solid #6366f1; padding-left: 1.5rem; letter-spacing: -0.02em; }
    .vue-content-body h3 { font-size: 1.6rem; font-weight: 700; color: #334155; margin-top: 2.5rem; margin-bottom: 1.2rem; }
    .vue-content-body p { margin-bottom: 1.8rem; text-align: justify; opacity: 0.9; }
    .vue-callout { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 1.5rem; padding: 2rem; margin: 3rem 0; border-left: 6px solid #6366f1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .vue-tip { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 1.2rem; border-radius: 1rem; margin: 2rem 0; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 3rem 0; border-radius: 1rem; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
    th { background: #6366f1; color: white; padding: 1.2rem; text-align: left; font-weight: 700; }
    td { padding: 1.2rem; border-bottom: 1px solid #f1f5f9; background: white; }
    tr:last-child td { border-bottom: none; }
</style>`;

async function run() {
    console.log("💎 VUE Premium Engine v6.0 Starting...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayIndex % config.clusters.length];
    
    console.log("🎯 Daily Target: " + targetTopic);
    const angles = ["Master Guide & Internal Architecture", "Case Studies & Practical Implementation", "Global Market Comparison", "Security, Pitfalls & Countermeasures", "Vision 2026 & Future Roadmap"];
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    for (let i = 0; i < 5; i++) {
        console.log(`\n📦 [${i+1}/5] Generating Angle: ${angles[i]}`);
        
        // 1. Search Context
        let searchContext = "";
        try {
            console.log("🔍 Fetching Serper Data...");
            const sRes = await axios.post('https://google.serper.dev/search', { q: targetTopic + " " + angles[i] }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } });
            if (sRes.data.organic) searchContext = sRes.data.organic.slice(0, 5).map(o => o.snippet).join("\n");
        } catch(e) { console.warn("Serper skip:", e.message); }

        // 2. Generate Content
        const prompt = (part) => `You are a premium tech journalist. Write Part ${part} for article topic: "${targetTopic}". 
        Angle: "${angles[i]}". 
        Real Data: ${searchContext}. 
        Use <h2>, <h3>, <table>, and <div class="vue-tip">. 
        English only. Respond only in HTML fragments. Min 1500 words per section.`;

        const tRes = await model.generateContent(`Generate high-CTR SEO title for "${targetTopic}" focused on ${angles[i]}. English only. No quotes.`);
        const seoTitle = tRes.response.text().trim();
        console.log("✨ Title: " + seoTitle);

        const h1Res = await model.generateContent(prompt(1));
        const h1 = h1Res.response.text().replace(/```html|```/g, '').trim();
        await new Promise(r => setTimeout(r, 2000));

        const h2Res = await model.generateContent(prompt(2));
        const h2 = h2Res.response.text().replace(/```html|```/g, '').trim();
        await new Promise(r => setTimeout(r, 2000));

        const h3Res = await model.generateContent(prompt(3));
        const h3 = h3Res.response.text().replace(/```html|```/g, '').trim();

        // 3. Image
        let imageUrl = "";
        try {
            const pUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(`Hyper-realistic 8k tech photography, ${targetTopic}, premium aesthetic`) + "?width=1280&height=720&nologo=true";
            const imgRes = await axios.get(pUrl, { responseType: 'arraybuffer' });
            const b64 = Buffer.from(imgRes.data).toString('base64');
            const imgbb = await axios.post("https://api.imgbb.com/1/upload?key=" + process.env.IMGBB_API_KEY, new URLSearchParams({ image: b64 }));
            imageUrl = imgbb.data.data.url;
        } catch(e) {}

        const finalContent = (imageUrl ? `<div style="text-align:center;margin-bottom:50px;"><img src="${imageUrl}" style="width:100%;border-radius:30px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25)"></div>` : "") + PREMIUM_STYLE + `<div class="vue-content-body">${h1}${h2}${h3}</div>`;

        // 4. Publish
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const blogger = google.blogger({ version: 'v3', auth });
        await blogger.posts.insert({ blogId: process.env.BLOG_ID, requestBody: { title: seoTitle, content: finalContent, labels: ["VUE-Premium", targetTopic] } });

        console.log(`✅ Published ${i+1}/5`);
        if (i < 4) { console.log("⏳ Cooling down 3 mins..."); await new Promise(r => setTimeout(r, 180000)); }
    }
}
run().catch(e => { console.error(e); process.exit(1); });
