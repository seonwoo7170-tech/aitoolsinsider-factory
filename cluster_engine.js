
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
    .vue-content-body { font-family: 'Inter', sans-serif; color: #1e293b; line-height: 1.9; font-size: 16px; max-width: 800px; margin: 0 auto; padding: 20px; }
    .vue-content-body h2 { font-size: 2.2rem; font-weight: 800; color: #0f172a; margin-top: 4rem; border-left: 10px solid #6366f1; padding-left: 1.5rem; letter-spacing: -0.02em; }
    .vue-callout { background: #f8fafc; border-radius: 1.5rem; padding: 2.3rem; margin: 3rem 0; border: 1px solid #e2e8f0; border-left: 6px solid #6366f1; }
    .vue-tip { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 1.2rem; border-radius: 1rem; margin: 2rem 0; font-weight: 600; }
    .vue-cta-button { display: inline-block; padding: 1.2rem 2.5rem; background: #6366f1; color: white !important; font-weight: 800; text-decoration: none !important; border-radius: 1rem; margin: 2rem 0; transition: transform 0.2s; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3); }
    .vue-cta-button:hover { background: #4f46e5; transform: translateY(-3px); }
    table { width: 100%; border-collapse: collapse; margin: 3rem 0; border-radius: 1rem; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); }
    th { background: #6366f1; color: white; padding: 1.2rem; text-align: left; }
    td { padding: 1.2rem; border-bottom: 1px solid #f1f5f9; background: white; }
</style>`;

async function run() {
    console.log("💎 VUE V11.1 Master Hub Engine starting...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const targetTopic = config.clusters[dayIndex % config.clusters.length];
    
    const angles = ["Deep Structural Analysis & Logic", "Strategic Case Study & Real Data", "Advanced Market Comparison Matrix", "Expert Security & Risk Mitigation", "THE ULTIMATE MASTER HUB"];
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });

    let publishTime = new Date(Date.now() + (Math.floor(Math.random() * 10) + 5) * 60 * 1000);
    const subLinks = []; 

    for (let i = 0; i < 5; i++) {
        const isMain = (i === 4);
        console.log(`\n📂 [${i+1}/5] Preparing ${isMain ? 'MASTER PILLAR' : 'SUB ANALYSIS'}`);
        
        // Context
        let searchContext = "";
        try {
            const sRes = await axios.post('https://google.serper.dev/search', { q: targetTopic + " " + angles[i] }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } });
            if (sRes.data.organic) searchContext = sRes.data.organic.slice(0, 5).map(o => o.snippet).join("\n");
        } catch(e) {}

        // Title
        const tPrompt = isMain ? 
            `Generate ONE grand pillar SEO Title for "${targetTopic}" as the ultimate master hub. English only.` :
            `Generate ONE clean, high-CTR SEO title for "${targetTopic}" focus on ${angles[i]}. No prefixes. English.`;
        
        const tRes = await model.generateContent(tPrompt);
        let title = tRes.response.text().trim().replace(/Option\s?\d:\s?/i, '').replace(/Title:\s?/i, '').replace(/[\"]/g, '');

        let bodyContent = "";
        if (isMain) {
            const mainPrompt = `Write the ULTIMATE PILLAR ARTICLE for "${title}". Context: ${searchContext}.
            Build 4 separate sections. After each section, insert the provided Link as a CTA Button.
            Link 1: "${subLinks[0].title}" -> ${subLinks[0].url}
            Link 2: "${subLinks[1].title}" -> ${subLinks[1].url}
            Link 3: "${subLinks[2].title}" -> ${subLinks[2].url}
            Link 4: "${subLinks[3].title}" -> ${subLinks[3].url}
            
            Button Code: <a href="URL" class="vue-cta-button">Deep Dive: TITLE</a>
            
            Focus on extreme depth (5000+ words). Use H2, H3, Tables, Callouts. English. HTML fragments only.`;
            const fullRes = await model.generateContent(mainPrompt);
            bodyContent = fullRes.response.text().replace(/```html|```/g, '').trim();
        } else {
            for(let p=1; p<=3; p++){
                const pRes = await model.generateContent(`Write Part ${p} for "${title}". Context: ${searchContext}. Min 1500 words. English. HTML only.`);
                bodyContent += pRes.response.text().replace(/```html|```/g, '').trim();
            }
        }

        // Visual
        const promo = encodeURIComponent(`Cinematic tech, ${targetTopic}, ${isMain ? 'Grand Scale' : angles[i]}`);
        const imageUrl = `https://image.pollinations.ai/prompt/${promo}?width=1280&height=720&nologo=true`;

        const finalContent = `<div style="text-align:center;margin-bottom:50px;"><img src="${imageUrl}" style="width:100%;border-radius:30px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)"></div>` + STYLE + `<div class="vue-content-body">${bodyContent}</div>`;

        // Deploy
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const blogger = google.blogger({ version: 'v3', auth });

        const isoTime = publishTime.toISOString();
        const bRes = await blogger.posts.insert({ blogId: config.blog_id, requestBody: { title, content: finalContent, published: isoTime, labels: [isMain ? "Pillar" : "Sub", targetTopic] } });
        
        if (!isMain) subLinks.push({ title, url: bRes.data.url });

        const gap = Math.floor(Math.random() * (240 - 120 + 1)) + 120;
        publishTime = new Date(publishTime.getTime() + gap * 60 * 1000);
        console.log(`✅ Post ${i+1} scheduled at ${isoTime}.`);
    }
}
run().catch(e => { console.error(e); process.exit(1); });
