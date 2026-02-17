
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

async function run() {
    console.log("🔥 VUE Precision Bombing Engine v3.0 Starting...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayIndex % config.clusters.length];
    
    console.log("🎯 Today's Target Topic: " + targetTopic);
    const angles = ["Expert Comprehensive Guide", "Real-world Applications & Cases", "Professional Tool Comparison", "Crucial Mistakes & Solutions", "Future Trends & Long-term Strategy"];

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    for (let i = 0; i < 5; i++) {
        console.log(`\n📦 [Post ${i+1}/5] Angle: ${angles[i]}`);

        // Search Context
        let searchContext = "";
        try {
            const sRes = await axios.post('https://google.serper.dev/search', { q: targetTopic + " " + angles[i] }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } });
            if (sRes.data.organic) searchContext = sRes.data.organic.slice(0, 3).map(o => o.snippet).join("\n");
        } catch(e) {}

        // Title Gen
        const tRes = await model.generateContent(`Target: "${targetTopic}". Angle: "${angles[i]}". Generate a high-CTR SEO long-tail title. English only. No quotes.`);
        const seoTitle = tRes.response.text().trim();
        console.log("✨ Generated Title: " + seoTitle);

        // Multi-Stage Body
        const h1Res = await model.generateContent(`Title: ${seoTitle}. Part 1: Introduction & Depth Analysis. Min 1500 words. HTML fragments only.`);
        const h1 = h1Res.response.text().replace(/```html|```/g, '').trim();
        await wait(2000);

        const h2Res = await model.generateContent(`Title: ${seoTitle}. Part 2: Strategies & Detailed Cases. Min 1500 words. HTML fragments only.`);
        const h2 = h2Res.response.text().replace(/```html|```/g, '').trim();
        await wait(2000);

        const h3Res = await model.generateContent(`Title: ${seoTitle}. Part 3: FAQ & Executive Conclusion. Min 1000 words. HTML fragments only.`);
        const h3 = h3Res.response.text().replace(/```html|```/g, '').trim();

        const fullHtml = `<div class="vue-content-body">` + h1 + h2 + h3 + `</div>`;

        // Image Handling
        let imageUrl = "";
        try {
            const pUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(`Cinematic photography of ${targetTopic}, ${angles[i]}, premium, 8k`) + "?width=1280&height=720&nologo=true";
            const imgBuffer = await axios.get(pUrl, { responseType: 'arraybuffer' });
            const base64 = Buffer.from(imgBuffer.data).toString('base64');
            const imgbb = await axios.post("https://api.imgbb.com/1/upload?key=" + process.env.IMGBB_API_KEY, new URLSearchParams({ image: base64 }));
            imageUrl = imgbb.data.data.url;
        } catch(e) { console.warn("Image fail:", e.message); }

        const finalBody = (imageUrl ? `<div style="text-align:center;margin-bottom:30px;"><img src="${imageUrl}" style="width:100%;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1)"></div>` : "") + fullHtml;

        // Post to Blogger
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const blogger = google.blogger({ version: 'v3', auth });
        await blogger.posts.insert({ blogId: process.env.BLOG_ID, requestBody: { title: seoTitle, content: finalBody, labels: ["VUE Cluster", targetTopic] } });

        console.log(`✅ Post ${i+1} completed!`);
        if (i < 4) {
            console.log("⏳ Waiting 3 minutes...");
            await wait(180000);
        }
    }
    console.log("🏆 Full Cluster Bombing Finished!");
}
run().catch(e => { console.error(e); process.exit(1); });
