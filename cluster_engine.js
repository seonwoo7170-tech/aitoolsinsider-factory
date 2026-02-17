
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

    // 2. Search for real-time data via Serper
    let searchContext = "";
    if (process.env.SERPER_API_KEY) {
        console.log("🔍 Searching real-time data for: " + targetTopic);
        try {
            const searchRes = await axios.post('https://google.serper.dev/search', {
                q: targetTopic,
                gl: 'kr',
                hl: 'ko'
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

    // 4. Generate Content (15,000 chars instruction)
    const prompt = `주제: "${targetTopic}"\n
    상세 검색 데이터:\n${searchContext}\n\n
    당신은 Studio VUE의 오리진 마스터입니다. 위 검색 데이터를 바탕으로 15,000자 이상의 초고품질 HTML 포스팅을 작성하세요.
    - 한국어 12,000자~13,500자 준수 (섹션당 1,500자 이상)
    - 반드시 h2 태그를 사용하고 전문적인 분석과 1인칭 서사를 포함하세요.
    - 검색 데이터에 있는 최신 수치와 정보를 글에 자연스럽게 녹여내세요.
    - FAQ 25개를 포함하세요.
    - 오직 HTML 태그로만 응답하세요.`;
    
    console.log("🧠 Generating high-quality content via Gemini...");
    const result = await model.generateContent(prompt);
    const htmlContent = result.response.text().replace(/```html|```/g, '').trim();

    // 4. Handle Image (Simplified: Thumbnail generation via Pollinations fallback logic if ImgBB provided)
    let imageUrl = "";
    if (process.env.IMGBB_API_KEY) {
        console.log("🎨 Generating thumbnail...");
        const imgPrompt = `Professional cinematic photography of ${targetTopic}, 8k, premium style`;
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

    const finalHtml = (imageUrl ? `<div style="text-align:center;margin-bottom:30px;"><img src="${imageUrl}" style="width:100%;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1)"></div>` : "") + htmlContent;

    // 5. Post to Blogger
    console.log("📡 Connecting to Blogger API...");
    const oauth2Client = new google.auth.OAuth2();
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

    console.log("✅ Post completed successfully!");
}

run().catch(err => {
    console.error("❌ Critical Error:", err);
    process.exit(1);
});
