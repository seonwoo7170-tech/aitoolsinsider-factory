
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

async function run() {
    console.log("🚀 VUE Cluster Engine v2.0 Starting...");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    
    // 1. Pick Topic (Select the first one that hasn't been posted or follow a sequence)
    const topicIdx = Math.floor(Math.random() * config.clusters.length);
    const targetTopic = config.clusters[topicIdx];
    console.log("📝 Target Topic: " + targetTopic);

    // 2. Search for real-time data via Serper (Global Scope)
    let searchContext = "";
    if (process.env.SERPER_API_KEY) {
        console.log("🔍 Searching real-time data for: " + targetTopic);
        try {
            const searchRes = await axios.post('https://google.serper.dev/search', {
                q: targetTopic
            }, {
                headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }
            });
            if (searchRes.data.organic) {
                searchContext = searchRes.data.organic.slice(0, 5).map(item => 
                    `[Search Result] Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`
                ).join('\n\n');
            }
        } catch (e) { console.warn("Search failed, proceeding without real-time data."); }
    }

    // 3. Setup Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // 4. Multi-Stage Generation for 15,000+ chars (English)
    console.log("🧠 Starting Multi-Stage English Generation...");
    
    // Stage 1: Intro & Analysis
    const prompt1 = `Topic: "${targetTopic}"\nSearch Data:\n${searchContext}\n\n
    You are the "Origin Master" of Studio VUE. Write the [Part 1: In-depth Introduction & Market Analysis] of a 4,000-word blog post.
    - language: English (Professional, Native-level)
    - Minimum 1,500 words for this part.
    - Include detailed analysis based on the search data.
    - Respond strictly in HTML format.`;
    const res1 = await model.generateContent(prompt1);
    const stage1Html = res1.response.text().replace(/```html|```/g, '').trim();
    console.log("✅ Stage 1 Completed");

    // Stage 2: Strategy & Case Studies
    const prompt2 = `Continue from the previous content and write [Part 2: Detailed Strategies, Comparison, and Real-world Cases].\n
    Context Summary of Part 1: ${stage1Html.substring(0, 500)}...\n
    - language: English
    - Minimum 1,500 words for this part.
    - Ensure a seamless transition from Part 1.
    - Respond strictly in HTML format.`;
    const res2 = await model.generateContent(prompt2);
    const stage2Html = res2.response.text().replace(/```html|```/g, '').trim();
    console.log("✅ Stage 2 Completed");

    // Stage 3: FAQ 25 & Executive Conclusion
    const prompt3 = `Finally, write [Part 3: Comprehensive FAQ (25 items) & Executive Conclusion].\n
    - language: English
    - Minimum 1,000 words for this part.
    - The FAQ must be professional and insightful.
    - Conclusion should be a strong call-to-action.
    - Respond strictly in HTML format.`;
    const res3 = await model.generateContent(prompt3);
    const stage3Html = res3.response.text().replace(/```html|```/g, '').trim();
    console.log("✅ Stage 3 Completed (Full English Content Ready!)");

    const htmlContent = stage1Html + stage2Html + stage3Html;

    // 5. Handle Image (Improved Prompt for English)
    let imageUrl = "";
    if (process.env.IMGBB_API_KEY) {
        console.log("🎨 Generating thumbnail...");
        const imgPrompt = `Professional cinematic photography of ${targetTopic}, futuristic AI style, 8k, highly detailed, premium aesthetic`;
        try {
            const pollinationUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(imgPrompt) + "?width=1280&height=720&nologo=true";
            const imgRes = await axios.get(pollinationUrl, { responseType: 'arraybuffer' });
            const base64Img = Buffer.from(imgRes.data, 'binary').toString('base64');
            
            const formData = new URLSearchParams();
            formData.append('image', base64Img);
            const imgbbRes = await axios.post("https://api.imgbb.com/1/upload?key=" + process.env.IMGBB_API_KEY, formData);
            imageUrl = imgbbRes.data.data.url;
            console.log("📸 Image Uploaded: " + imageUrl);
        } catch(e) { console.error("Image gen failed cover", e); }
    }

    const finalHtml = (imageUrl ? `<div style="text-align:center;margin-bottom:30px;"><img src="${imageUrl}" alt="${targetTopic}" style="width:100%;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1)"></div>` : "") + htmlContent;

    // 6. Post to Blogger
    console.log("📡 Connecting to Blogger API...");
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth: oauth2Client });

    await blogger.posts.insert({
        blogId: process.env.BLOG_ID,
        requestBody: {
            title: targetTopic,
            content: finalHtml,
            labels: ["AI Tool", "Studio VUE Cluster"]
        }
    });

    console.log("✅ Post completed successfully in English!");
}

run().catch(err => {
    console.error("❌ Critical Error:", err);
    process.exit(1);
});
