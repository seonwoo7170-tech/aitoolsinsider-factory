const { google } = require('googleapis');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

function clean(raw, defType = 'obj') {
    if(!raw) return defType === 'text' ? '' : (defType === 'obj' ? '{}' : '[]');
    let t = raw.replace(/```(json|html|javascript|js)?/gi, '').trim();
    t = t.replace(/<think>[\\s\\S]*?<\\/think>/g, '').trim();
    if (defType === 'text') return t;
    try {
        const start = t.indexOf('{'); const end = t.lastIndexOf('}');
        const startArr = t.indexOf('['); const endArr = t.lastIndexOf(']');
        let jsonStr = '';
        if (defType === 'obj' && start !== -1 && end !== -1) jsonStr = t.substring(start, end + 1);
        else if (defType === 'arr' && startArr !== -1 && endArr !== -1) jsonStr = t.substring(startArr, endArr + 1);
        if (jsonStr) return jsonStr;
    } catch(e) { }
    return defType === 'obj' ? '{"title":"' + t.replace(/["\\\\\\n]/g, '') + '"}' : '[]';
}

async function callAI(prompt, retry = 0) {
    await new Promise(r => setTimeout(r, 2500));
    // [PRIMARY] Cerebras Qwen 3 235B
    if (process.env.CEREBRAS_API_KEY) {
        try {
            const res = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
                model: 'qwen-3-235b-a22b-instruct-2507',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.72
            }, { headers: { 'Authorization': 'Bearer ' + process.env.CEREBRAS_API_KEY }, timeout: 90000 });
            if (res.data?.choices?.[0]?.message?.content) return clean(res.data.choices[0].message.content, 'text');
        } catch (e) { console.log('   [Cerebras] ' + (e.response?.status || 'ERR') + '. Switching...'); }
    }
    // [FAILOVER] Groq Qwen 3 32B
    if (process.env.GROQ_API_KEY) {
        try {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'qwen/qwen3-32b',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.72
            }, { headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY }, timeout: 90000 });
            if (res.data?.choices?.[0]?.message?.content) return clean(res.data.choices[0].message.content, 'text');
        } catch (e) { console.log('   [Groq] ' + (e.response?.status || 'ERR') + '. Cooldown...'); }
    }
    if (retry < 5) { await new Promise(r => setTimeout(r, 15000)); return callAI(prompt, retry + 1); }
    throw new Error('All AI engines exhausted.');
}

async function searchWithAI(query) {
    try {
        return await callAI('주제: "' + query + '"에 대해 2026년 기준 최신 핵심 정보, 통계, 트렌드를 5가지로 정리해주세요. 간결하게 팩트 위주로.');
    } catch(e) { return ''; }
}

async function genImg(desc) {
    if(!desc) return '';
    const kieKey = process.env.KIE_API_KEY;
    let imageUrl = '';

    // Translate prompt to English if Korean
    let engPrompt = desc;
    if(/[가-힣]/.test(desc)) {
        try {
            engPrompt = await callAI('Translate to concise English for AI image generation (under 400 chars, ONLY English text): ' + desc);
            engPrompt = engPrompt.replace(/[^a-zA-Z0-9, ]/g, '').trim();
        } catch(e) { engPrompt = desc; }
    }

    // 1. Kie.ai (Primary Image Engine)
    if(kieKey && kieKey.length > 5) {
        try {
            console.log('   [Kie.ai] Generating 1:1 image...');
            const cr = await axios.post('https://api.kie.ai/api/v1/jobs/createTask', {
                model: 'z-image',
                input: { prompt: engPrompt + ', high-end, editorial photography, 8k, square format, 1:1 aspect ratio, no text, no watermark', aspect_ratio: '1:1' }
            }, { headers: { Authorization: 'Bearer ' + kieKey } });
            const tid = cr.data.taskId || cr.data.data?.taskId;
            if(tid) {
                for(let a=0; a<20; a++) {
                    await new Promise(r => setTimeout(r, 6000));
                    const pr = await axios.get('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + tid, { headers: { Authorization: 'Bearer ' + kieKey } });
                    const state = pr.data.state || pr.data.data?.state;
                    if(state === 'success') {
                        const resData = pr.data.resultJson || pr.data.data?.resultJson;
                        const resJson = typeof resData === 'string' ? JSON.parse(resData) : resData;
                        imageUrl = resJson.resultUrls[0]; break;
                    }
                    if(state === 'fail' || state === 'failed') break;
                }
            }
        } catch(e) { console.log('   [Kie.ai] Error: ' + e.message); }
    }

    // 2. Pollinations.ai (Free Fallback)
    if(!imageUrl) {
        try {
            imageUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(engPrompt) + '?width=1024&height=1024&nologo=true&seed=' + Math.floor(Math.random()*1000000) + '&model=flux';
        } catch(e) { }
    }

    // 3. Upload to GitHub Gallery
    try {
        if(imageUrl && process.env.GITHUB_TOKEN) {
            const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
            const b64 = Buffer.from(res.data).toString('base64');
            const fileName = 'v20_' + Date.now() + '_' + Math.floor(Math.random()*1000) + '.png';
            const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
            const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/assets/gallery/' + fileName;
            let sha = null;
            try { const g = await axios.get(apiUrl, { headers: { Authorization: 'token ' + process.env.GITHUB_TOKEN } }); sha = g.data.sha; } catch(e) {}
            await axios.put(apiUrl, { message: 'Gallery: ' + fileName, content: b64, sha }, { headers: { Authorization: 'token ' + process.env.GITHUB_TOKEN } });
            return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/assets/gallery/' + fileName;
        }
        return imageUrl;
    } catch(e) {
        console.log('   [Gallery] Upload failed: ' + e.message);
        return imageUrl;
    }
}

async function genThumbnail(imageUrl, title) {
    try {
        console.log('   [Thumbnail] Creating Canvas thumbnail with title...');
        const { createCanvas, loadImage } = require('canvas');
        const size = 1024;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');

        // Draw Kie.ai image as background
        if(imageUrl) {
            try {
                const bgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
                const bgImg = await loadImage(Buffer.from(bgRes.data));
                ctx.drawImage(bgImg, 0, 0, size, size);
            } catch(e) {
                ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, size, size);
            }
        } else {
            ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, size, size);
        }

        // Bottom gradient overlay
        const grad = ctx.createLinearGradient(0, size * 0.5, 0, size);
        grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);

        // Title text (auto word-wrap)
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
        ctx.font = 'bold 48px sans-serif';
        const words = title.split(' ');
        let lines = []; let currentLine = '';
        for(const w of words) {
            const test = currentLine ? currentLine + ' ' + w : w;
            if(ctx.measureText(test).width > size - 100) { lines.push(currentLine); currentLine = w; }
            else currentLine = test;
        }
        if(currentLine) lines.push(currentLine);
        const lineH = 60; const startY = size - 80 - (lines.length * lineH);
        lines.forEach((line, li) => { ctx.fillText(line, size/2, startY + li * lineH); });

        // Upload to GitHub Gallery
        const b64 = canvas.toBuffer('image/png').toString('base64');
        const fileName = 'thumb_' + Date.now() + '.png';
        const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
        const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/assets/gallery/' + fileName;
        let sha = null;
        try { const g = await axios.get(apiUrl, { headers: { Authorization: 'token ' + process.env.GITHUB_TOKEN } }); sha = g.data.sha; } catch(e) {}
        await axios.put(apiUrl, { message: 'Thumb: ' + fileName, content: b64, sha }, { headers: { Authorization: 'token ' + process.env.GITHUB_TOKEN } });
        const thumbUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/assets/gallery/' + fileName;
        console.log('   [Thumbnail] Uploaded: ' + fileName);
        return thumbUrl;
    } catch(e) {
        console.log('   [Thumbnail] Canvas failed, using raw image: ' + e.message);
        return imageUrl;
    }
}

async function writeAndPost(target, blogger, bId, pTime, extraLinks, idx, total) {
    console.log('\n[Post ' + idx + '/' + total + '] Writing: ' + target);
    const searchData = await searchWithAI(target);
    const bp = await callAI('Create a 5-part content strategy for: "' + target + '". Return JSON: {"title":"SEO_TITLE", "chapters":["Ch1", "Ch2", "Ch3", "Ch4", "Ch5"]}. ONLY JSON.');
    let title, chapters;
    try { const p = JSON.parse(clean(bp, 'obj')); title = p.title; chapters = p.chapters; } catch(e) { title = target; chapters = [target + ' 개요', target + ' 핵심', target + ' 비교', target + ' 활용', target + ' FAQ']; }

    // === MODULE 6-B STEP 1: Batch Image Prompt Generation ===
    console.log('   [6-B STEP 1] Generating 4 image prompts...');
    const imgPromptsRaw = await callAI('Topic: "' + target + '"\nChapters: ' + JSON.stringify(chapters) + '\n\nGenerate exactly 4 different English image prompts for this article. Rules: 1:1 square, photorealistic, no text/watermark, high-end editorial photography. Each prompt must be unique and match different aspects of the topic.\nFormat:\nprompt_1: [description]\nprompt_2: [description]\nprompt_3: [description]\nprompt_4: [description]');
    const imgPrompts = imgPromptsRaw.split('\n').filter(l => l.includes('prompt_')).map(l => l.substring(l.indexOf(':') + 1).trim());
    while(imgPrompts.length < 4) imgPrompts.push(target + ' high-end editorial photography 8k');

    // === MODULE 6-B STEP 2 & 3: Generate & Upload 4 Images ===
    console.log('   [6-B STEP 2-3] Generating & uploading 4 images...');
    const imgUrls = [];
    for(let p=0; p<4; p++) {
        const url = await genImg(imgPrompts[p]);
        imgUrls.push(url || '');
    }

    // === MODULE 6-B STEP 4: HTML Assembly ===
    console.log('   [6-B STEP 4] Assembling HTML...');
    const altTexts = await callAI('Generate 4 unique, SEO-optimized Korean alt texts for images about: "' + target + '". Each must be different. Format: alt_1: [text]\nalt_2: [text]\nalt_3: [text]\nalt_4: [text]');
    const alts = altTexts.split('\n').filter(l => l.includes('alt_')).map(l => l.substring(l.indexOf(':') + 1).trim());
    while(alts.length < 4) alts.push(target);
    const THEMES = ['theme-indigo','theme-mint','theme-rose','theme-peach','theme-sky','theme-lemon','theme-sage'];
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    let body = '<div class="' + theme + '">';

    // Image 1: Canvas thumbnail with title text = Blogger Thumbnail
    const thumbUrl = await genThumbnail(imgUrls[0], title);
    if(thumbUrl) body += '<img src="' + thumbUrl + '" alt="' + alts[0] + '" title="' + title + '" style="max-width:100%;border-radius:12px;display:block;margin:20px auto;" />';

    // TOC (Table of Contents)
    body += '<div class="vue-toc"><p style="font-weight:800;font-size:18px;margin-bottom:12px;">📑 목차</p><ul>';
    chapters.forEach((ch, ci) => { body += '<li><a href="#section-' + ci + '">' + ch + '</a></li>'; });
    body += '</ul></div>';

    for(let i=0; i<chapters.length; i++) {
        console.log('   [Section ' + (i+1) + '/' + chapters.length + '] ' + chapters[i]);
        const sectionBody = await callAI('주제: "' + target + '" - 섹션: "' + chapters[i] + '"\n최신 데이터: ' + searchData + '\n\n위 섹션에 대해 2000자 이상 상세하게 작성해주세요. ~해요 체. HTML만 사용(<p>, <h3>, <ul>, <li>). <h1>, <h2> 금지. 인라인 스타일 사용 금지.');
        body += '<h2 id="section-' + i + '">' + chapters[i] + '</h2>' + sectionBody;

        // Tip box after section 1
        if(i === 0) body += '<div class="vue-msg-box tip"><p><strong>💡 smileseon\'s tip</strong></p><p>' + await callAI('주제 "' + chapters[i] + '"에 대한 핵심 팁을 한 문장으로. ~해요 체.') + '</p></div>';

        // Images 2,3,4: After sections 1,2,3 (no wrapper tags per 6-B)
        if(i === 1 && imgUrls[1]) body += '<img src="' + imgUrls[1] + '" alt="' + alts[1] + '" title="' + target + ' - ' + chapters[i] + '" style="max-width:100%;border-radius:12px;display:block;margin:20px auto;" />';
        if(i === 2 && imgUrls[2]) body += '<img src="' + imgUrls[2] + '" alt="' + alts[2] + '" title="' + target + ' - ' + chapters[i] + '" style="max-width:100%;border-radius:12px;display:block;margin:20px auto;" />';
        if(i === 3 && imgUrls[3]) body += '<img src="' + imgUrls[3] + '" alt="' + alts[3] + '" title="' + target + ' - ' + chapters[i] + '" style="max-width:100%;border-radius:12px;display:block;margin:20px auto;" />';
    }

    // Disclaimer
    body += '<div class="vue-disclaimer"><strong>⚠️ 면책 고지</strong> 이 글은 정보 제공 목적으로 작성되었으며, 전문적인 조언을 대체하지 않아요. 정확한 정보를 위해 관련 전문가와 상담하시길 권장해요.</div>';

    // === Pinterest Pin Thumbnail (Canvas 2:3) - Generate BEFORE posting ===
    let pinUrl = '';
    try {
        console.log('   [Pinterest] Generating pin thumbnail...');
        const { createCanvas, loadImage } = require('canvas');
        const pinW = 1000; const pinH = 1500;
        const canvas = createCanvas(pinW, pinH);
        const ctx = canvas.getContext('2d');

        if(imgUrls[0]) {
            try {
                const bgRes = await axios.get(imgUrls[0], { responseType: 'arraybuffer', timeout: 30000 });
                const bgImg = await loadImage(Buffer.from(bgRes.data));
                ctx.drawImage(bgImg, 0, 0, pinW, pinH);
            } catch(e) { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, pinW, pinH); }
        } else { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, pinW, pinH); }

        const grad = ctx.createLinearGradient(0, pinH * 0.4, 0, pinH);
        grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, pinW, pinH);

        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
        ctx.font = 'bold 52px sans-serif';
        const words = title.split(' ');
        let lines = []; let currentLine = '';
        for(const w of words) {
            const test = currentLine ? currentLine + ' ' + w : w;
            if(ctx.measureText(test).width > pinW - 120) { lines.push(currentLine); currentLine = w; }
            else currentLine = test;
        }
        if(currentLine) lines.push(currentLine);
        const lineH = 68; const startY = pinH - 180 - (lines.length * lineH);
        lines.forEach((line, li) => { ctx.fillText(line, pinW/2, startY + li * lineH); });

        ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Studio VUE', pinW/2, pinH - 60);

        const pinB64 = canvas.toBuffer('image/png').toString('base64');
        const pinName = 'pin_' + Date.now() + '.png';
        const [pOwner, pRepo] = process.env.GITHUB_REPOSITORY.split('/');
        const pinApiUrl = 'https://api.github.com/repos/' + pOwner + '/' + pRepo + '/contents/assets/pins/' + pinName;
        let pinSha = null;
        try { const pg = await axios.get(pinApiUrl, { headers: { Authorization: 'token ' + process.env.GITHUB_TOKEN } }); pinSha = pg.data.sha; } catch(e) {}
        await axios.put(pinApiUrl, { message: 'Pin: ' + pinName, content: pinB64, sha: pinSha }, { headers: { Authorization: 'token ' + process.env.GITHUB_TOKEN } });
        pinUrl = 'https://raw.githubusercontent.com/' + pOwner + '/' + pRepo + '/main/assets/pins/' + pinName;
        console.log('   [Pinterest] Pin uploaded: ' + pinName);
    } catch(e) { console.log('   [Pinterest] Pin skipped: ' + e.message); }

    // Hidden Pinterest pin image (display:none - crawlers still find it)
    if(pinUrl) body += '<img src="' + pinUrl + '" alt="' + title + ' Pinterest" data-pin-description="' + title + '" style="display:none;" />';

    body += '</div>';
    const post = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body, published: pTime.toISOString() } });
    console.log('   Posted: ' + post.data.url);

    return { title, url: post.data.url };
}

const CATEGORY_MAP = {
    '1': 'PC Repair, Computer Troubleshooting, Windows Error, Driver Fix',
    '2': 'Hardware, CPU, GPU, RAM, SSD, Motherboard, PC Build',
    '3': 'Gaming, PlayStation, Xbox, Nintendo, Steam, Game Review',
    '4': 'AI, Artificial Intelligence, ChatGPT, Machine Learning, Tech Tools',
    '5': 'Coding, Programming, JavaScript, Python, Web Development',
    '6': 'Cooking, Recipe, Kitchen, Meal Prep, Food',
    '7': 'Fashion, Style, Outfit, Clothing, Trend',
    '8': 'Health, Fitness, Diet, Wellness, Medical',
    '9': 'News, Current Events, Breaking News, World',
    '10': 'Finance, Investment, Stock, Crypto, Money',
    '11': 'Travel, Tourism, Hotel, Flight, Destination',
    '12': 'Home, Interior, DIY, Cleaning, Organization'
};

async function fetchTrendingKeywords(lang) {
    const geo = lang === 'ko' ? 'KR' : 'US';
    try {
        console.log('[Trends] Fetching Google Trends RSS (geo=' + geo + ')...');
        const res = await axios.get('https://trends.google.com/trending/rss?geo=' + geo, { timeout: 15000 });
        const xml = res.data;
        const titles = [];
        const regex = /<title>([^<]+)<\/title>/g;
        let match;
        while((match = regex.exec(xml)) !== null) {
            if(match[1] !== 'Daily Search Trends' && match[1] !== 'Trending Searches') titles.push(match[1]);
        }
        console.log('[Trends] Found ' + titles.length + ' trending topics.');
        return titles.slice(0, 20);
    } catch(e) {
        console.log('[Trends] RSS fetch failed: ' + e.message);
        return [];
    }
}

async function run() {
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });

    // 1. Get category keywords for this blog
    const catIds = (config.categories || '1').split(',');
    const catKeywords = catIds.map(id => CATEGORY_MAP[id.trim()] || '').filter(Boolean).join(', ');
    console.log('[Config] Blog categories: ' + catKeywords);

    // 2. Fetch real-time Google Trends
    const trending = await fetchTrendingKeywords(config.blog_lang || 'ko');

    // 3. AI filters trending topics by category relevance
    let seed;
    if(trending.length > 0) {
        const filterPrompt = 'Trending topics: ' + trending.join(', ') + '\n\nBlog category keywords: ' + catKeywords + '\n\nFrom the trending topics above, pick the ONE topic most relevant to the blog category. If none are relevant, create a new trending topic that fits the category. Return ONLY the topic text, nothing else.';
        seed = await callAI(filterPrompt);
        console.log('[AI Filter] Selected seed topic: ' + seed);
    } else {
        seed = await callAI('Generate ONE highly trending topic for 2026 in this category: ' + catKeywords + '. Return ONLY the topic, nothing else.');
        console.log('[AI Fallback] Generated seed topic: ' + seed);
    }

    // 4. Generate sub-topics
    let subRes = await callAI('Topic: "' + seed + '".\nGenerate 4 sub-topics as JSON array: ["A","B","C","D"]. ONLY JSON.');
    let subTopics;
    try { subTopics = JSON.parse(clean(subRes, 'arr')); if(!Array.isArray(subTopics) || subTopics.length < 2) throw 0; }
    catch(e) { subTopics = [seed + ' 핵심 정리', seed + ' 비교 분석', seed + ' 활용법', seed + ' 최신 트렌드']; }

    // 5. Post all articles
    let subLinks = []; let cTime = new Date();
    for(let i=0; i<subTopics.length; i++) {
        cTime.setMinutes(cTime.getMinutes()+180);
        subLinks.push(await writeAndPost(subTopics[i], blogger, config.blog_id, new Date(cTime), [], i+1, 5));
    }
    cTime.setMinutes(cTime.getMinutes()+180);
    await writeAndPost(seed, blogger, config.blog_id, new Date(cTime), subLinks, 5, 5);

    console.log('\n[DONE] All posts published successfully!');
}
run();