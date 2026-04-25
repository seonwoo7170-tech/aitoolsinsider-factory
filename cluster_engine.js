/**
 * [VUE STUDIO MASTER ENGINE v18.9 - SOFT SOVEREIGN X]
 * - Persona: Soft-Mastery (Kodari Optimized)
 * - Brain: Dual Qwen 3 (Cerebras 235B Primary + Groq 32B Failover)
 * - Research: Tavily AI Search (v1.5 API)
 * - Logic: No self-labeling expert, just deep technical data with friendly '~해요' style.
 */

const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { execSync } = require('child_process');

// --- [CONFIG & SECRETS] ---
const SECRETS_PATH = 'secrets_config.json';
if (fs.existsSync(SECRETS_PATH)) {
    const secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
    Object.keys(secrets).forEach(k => { process.env[k] = secrets[k]; });
}

const log = (msg, type = 'info') => {
    const icons = { success: '✅', error: '❌', ai: '🤖', action: '⚙️', img: '🖼️', seo: '⚡' };
    console.log(`[${new Date().toLocaleTimeString()}] ${icons[type] || '💠'} ${msg}`);
};

function cleanQwenOutput(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function aiSearch(query) {
    if (!process.env.TAVILY_API_KEY) return "AI search research unavailable.";
    try {
        const res = await axios.post('https://api.tavily.com/search', { 
            api_key: process.env.TAVILY_API_KEY,
            query: query,
            search_depth: "basic"
        });
        return res.data.results.slice(0, 5).map(r => `${r.title}: ${r.content}`).join('\n');
    } catch (e) { return "Search data limit reached."; }
}

async function callAIWithRetry(prompt, retries = 35) {
    for (let i = 0; i < retries; i++) {
        await new Promise(r => setTimeout(r, 2500));
        // --- [CEREBRAS - PRIMARY] ---
        if (process.env.CEREBRAS_API_KEY) {
            try {
                const res = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
                    model: "qwen-3-235b-a22b-instruct-2507",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7
                }, { headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}` }, timeout: 60000 });
                if (res.data?.choices?.[0]?.message?.content) return cleanQwenOutput(res.data.choices[0].message.content);
            } catch (e) { log(`Cerebras 429. Switching to Failover...`, 'ai'); }
        }
        // --- [GROQ - FAILOVER] ---
        if (process.env.GROQ_API_KEY) {
            try {
                const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: "qwen/qwen3-32b",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7
                }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` } });
                if (res.data?.choices?.[0]?.message?.content) return cleanQwenOutput(res.data.choices[0].message.content);
            } catch (e) { log(`Engines Busy. Cooldown 15s...`, 'ai'); }
        }
        await new Promise(r => setTimeout(r, 15000));
    }
    throw new Error("AI Cluster Exhausted.");
}

async function pushToGallery(localPath, fileName) {
    try {
        if (process.env.GITHUB_TOKEN) {
            const gitUser = process.env.GITHUB_USER;
            const gitRepo = process.env.GITHUB_REPO;
            const content = fs.readFileSync(localPath, { encoding: 'base64' });
            const url = `https://api.github.com/repos/${gitUser}/${gitRepo}/contents/${localPath.replace(/\\/g, '/')}`;
            await axios.put(url, { message: `Gallery: ${fileName}`, content }, {
                headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
            });
            return `https://raw.githubusercontent.com/${gitUser}/${gitRepo}/main/${localPath.replace(/\\/g, '/')}`;
        }
    } catch (e) { log(`Gallery Sync Fail: ${e.message}`, 'error'); }
    return localPath; 
}

async function genKieVisual(topic, index) {
    const KIE_KEY = process.env.KIE_API_KEY;
    if (!KIE_KEY) return null;
    try {
        const vPrompt = await callAIWithRetry(`Generate high-end tech magazine photo prompt for "${topic}". 8k cinematic, no text.`);
        const createTask = await axios.post('https://api.kie.ai/api/v1/jobs/createTask', 
            { model: 'z-image', input: { prompt: vPrompt, aspect_ratio: '16:9' } }, 
            { headers: { Authorization: `Bearer ${KIE_KEY}` } }
        );
        const tid = createTask.data.taskId || createTask.data.data.taskId;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const record = await axios.get(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${tid}`, { headers: { Authorization: `Bearer ${KIE_KEY}` } });
            const jobData = record.data.data || record.data;
            if (jobData.status === 'SUCCEEDED') {
                const imgUrl = jobData.result.url;
                const fileName = `v_cluster_${Date.now()}_${index}.png`;
                const localPath = path.join('assets', 'gallery', fileName);
                if (!fs.existsSync('assets/gallery')) fs.mkdirSync('assets/gallery', { recursive: true });
                const writer = fs.createWriteStream(localPath);
                const response = await axios({ url: imgUrl, method: 'GET', responseType: 'stream' });
                response.data.pipe(writer);
                await new Promise((res) => writer.on('finish', res));
                return await pushToGallery(localPath, fileName);
            }
        }
    } catch (e) { log(`Visual Crash: ${e.message}`, 'error'); }
    return null;
}

async function writeSovereignPost(topic) {
    log(`Initializing Search-Infused Write for: ${topic}`, 'ai');
    const searchData = await aiSearch(topic);
    
    const metaPrompt = `당신은 세계 정상급 하드웨어 설계 지식을 가진 사람입니다.
    [LATEST DATA]: ${searchData}
    [RULE]: 자기소개나 전문가임을 강조하는 표현은 금지합니다. 오직 데이터로 증명하세요.
    [TONE]: 친절하고 다정한 구어체(~해요 체)를 사용합니다.`;

    const sections = [
        { id: 'intro', focus: "최신 기술 동향과 우리가 놓치고 있는 실체" },
        { id: 'deep', focus: "하드웨어의 물리적 한계와 신호 체계의 비밀" },
        { id: 'power', focus: "효율적인 전력 운용과 발열 관리의 진실" },
        { id: 'asset', focus: "자산 가치를 지키는 현명한 유지보수 전략" },
        { id: 'faq', focus: "실무자들이 가장 궁금해하는 10가지 질문답변" }
    ];

    let html = `<div class='sovereign-post' style='font-family: Pretendard, sans-serif; line-height: 2.1; color: #1e293b;'>`;
    
    for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        log(`Generating Section ${i+1}/5 [${s.focus}]...`, 'ai');
        
        const h2 = await callAIWithRetry(`주제 "${topic}" - "${s.focus}"에 대한 아주 부드럽고 다정한 소제목 한 줄만 지어주세요.`);
        const body = await callAIWithRetry(`${metaPrompt}\n주제: "${topic}"\n영역: "${s.focus}"\n위 주제에 대해 2000자 이상 아주 상세하고 친절하게 설명해주세요. <html> 태그 금지, 오직 <p>, <h3>, <ul>, <li>만 사용하세요.`);
        
        html += `<section id='${s.id}' style='margin-bottom:80px;'>
            <h2 style='font-size:32px; font-weight:800; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;'>${h2}</h2>
            ${body}
        </section>`;

        if (i === 1) {
            const imgUrl = await genKieVisual(topic, i);
            if (imgUrl) html += `<div style='margin:40px 0;'><img src='${imgUrl}' style='width:100%; border-radius:24px; box-shadow: 0 20px 40px rgba(0,0,0,0.1);'></div>`;
        }
    }
    return html;
}

async function run() {
    log('🚀 V18.9 SOVEREIGN-X ENGINE START', 'action');
    try {
        const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
        const topic = config.clusters?.[0] || "최신 하드웨어 기술 트렌드";
        const finalHtml = await writeSovereignPost(topic);
        fs.writeFileSync('g_action_final.html', finalHtml);
        log(`Success: Content saved to g_action_final.html`, 'success');
    } catch (e) { log(`Fatal Error: ${e.message}`, 'error'); }
}

run();
