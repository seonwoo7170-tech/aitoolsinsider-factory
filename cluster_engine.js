const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const STYLE = `<style>
    .vue-content-body { font-family: 'Noto Sans KR', sans-serif; color: #1e293b; line-height: 2.3; font-size: 17.5px; max-width: 850px; margin: 0 auto; padding: 25px; }
    .vue-content-body p { margin-bottom: 2.3rem; }
    .vue-content-body h2 { font-size: 2.85rem; font-weight: 1000; color: #0f172a; margin: 7.5rem 0 3.5rem; border-left: 17px solid #6366f1; padding-left: 1.8rem; line-height: 1.25; }
    .vue-content-body h3 { font-size: 2.0rem; font-weight: 950; color: #334155; margin: 5.5rem 0 2.5rem; border-left: 8px solid #cbd5e1; padding-left: 1.4rem; }
    .vue-main-thumb { position: relative; width: 100%; height: 550px; border-radius: 50px; overflow: hidden; margin-bottom: 5.5rem; box-shadow: 0 45px 100px -20px rgba(0,0,0,0.4); }
    .vue-main-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.8); }
    .vue-ad-slot { height: 48px; width: 100%; margin: 3.5rem 0; background: transparent; display: flex; align-items: center; justify-content: center; border: 1.5px dashed #cbd5e1; border-radius: 15px; }
    .vue-ad-slot::after { content: 'SPONSORED BY VUE AD'; color: #cbd5e1; font-size: 9px; font-weight: 900; letter-spacing: 0.35rem; }
    .vue-disclaimer { margin-top: 100px; padding: 40px; background: #f8fafc; border-radius: 35px; border: 2.2px solid #e2e8f0; font-size: 14px; color: #64748b; line-height: 2; }
    .vue-btn-more { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff !important; padding: 22px 65px; border-radius: 25px; font-weight: 1000; text-decoration: none !important; }
</style>`;

const HRUE_HTML = "MANDATORY: Follow EEAT. Break text every 3-4 sentences with '<div class=\"vue-ad-slot\"></div>'. VARY writing patterns. NO headings with numbers. NO intro. HTML ONLY.";
const HRUE_TEXT = "MANDATORY: Return ONLY raw plain text. No markdown. No intro/filler.";

async function callAI(model, prompt, isHTML = false, retry = 3) {
    const rule = isHTML ? HRUE_HTML : HRUE_TEXT;
    try {
        const r = await model.generateContent(`${rule}\n\n${prompt}`);
        return r.response.text().trim();
    } catch (e) {
        if (e.message.includes('429') && retry > 0) {
            console.log('⏳ Gemini Busy. Retrying in 15s...');
            await new Promise(res => setTimeout(res, 15000));
            return callAI(model, prompt, isHTML, retry - 1);
        }
        console.log('❌ AI Error:', e.message);
        return "";
    }
}

function clean(raw) {
    if (!raw) return "";
    let c = raw.replace(/\`\`\`html|\`\`\`/g, '').trim();
    ['head','body','html','meta','title','!DOCTYPE'].forEach(t => {
        c = c.replace(new RegExp('<'+t+'[^>]*>', 'gi'), '').replace(new RegExp('</'+t+'>', 'gi'), '');
    });
    c = c.replace(/<h([23])>(\d+[.\s]*)*/gi, '<h$1>');
    return c.split('**').map((v, i) => i % 2 === 1 ? '<b>' + v + '</b>' : v).join('').trim();
}

function cleanTitle(raw) {
    if (!raw) return "";
    return raw.replace(/\`\`\`html|\`\`\`|html|\n/gi, '').replace(/<[^>]*>/gi, '').replace(/[\"]/g, '').trim();
}

// 🛡️ ENHANCED IMAGE 수사 엔진
async function genImg(p, k) {
    if (!k || k.length < 5) {
        console.log("⚠️ [IMAGE ERROR] KIE_API_KEY is missing or invalid in Secrets.");
        return "";
    }
    try {
        const cleanP = p.replace(/[^\w\s\uAC00-\uD7A3]/g, ' ').substring(0, 250);
        console.log(`🎨 [IMAGE] Requesting Kie.ai for: "${cleanP}"`);
        const res = await axios.post("https://api.kie.ai/v1/images/generations", 
            { prompt: cleanP, n: 1, size: "1024x768" }, 
            { 
                headers: { "Authorization": "Bearer " + k, "Content-Type": "application/json" },
                timeout: 35000 
            }
        ).catch(err => {
            console.log("❌ [IMAGE API ERROR] Status:", err.response?.status, "Payload:", JSON.stringify(err.response?.data || err.message));
            throw err;
        });
        
        const url = res.data.data?.[0]?.url || res.data.image_url || res.data.url || "";
        if (url) {
            console.log("✅ [IMAGE SUCCESS] Found URL:", url.substring(0, 60) + "...");
            return url;
        } else {
            console.log("⚠️ [IMAGE WARNING] Response received but URL is missing. Body:", JSON.stringify(res.data));
            return "";
        }
    } catch (e) {
        return ""; 
    }
}

async function run() {
    console.log("🌐 VUE Deep Vision v1.1.5 (Advanced Diagnostics) Started.");
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const bId = (process.env.BLOG_ID || config.blog_id).toString().replace(/[^0-9]/g, '');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
    const clusters = config.clusters || [];
    const target = clusters[Math.floor(Date.now() / 86400000) % clusters.length];
    const lang = config.lang || 'ko';
    
    const patterns = ["Case Study structure", "Authority Strategic Report", "Expert Global Interview", "Master Insight Playbook"];
    const hubHistory = [];
    const discl = lang === 'ko' ? 
        `<div class="vue-disclaimer"><b>전문가 면책조항:</b> 본 콘텐츠는 객관적인 전문 분석을 바탕으로 정보 제공을 위해 작성되었습니다. 특정 상품의 구매나 투자 결정을 유도하지 않으며, 모든 판단의 책임은 본인에게 있습니다. AI 기술로 생성되어 일부 오류가 있을 수 있으니 전문가와 상의하십시오.</div>` :
        `<div class="vue-disclaimer"><b>Expert Disclaimer:</b> This content is based on objective analysis and is for informational purposes only. It does not constitute financial or legal advice. Please consult a specialist. Generated by VUE Context Engine.</div>`;

    for (let i = 0; i < 5; i++) {
        const isMaster = (i === 4);
        const ctx = isMaster ? target : (clusters[i] || target);
        const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)];
        console.log(`🎯 [${i+1}/5] Deep Process with Pattern: ${selectedPattern}`);

        let titleRaw = await callAI(model, `Ultimate EEAT Title for: "${ctx}". Magnetic & Authoritative. Plain text.`, false);
        const title = cleanTitle(titleRaw || ctx + " - Professional Case Study").substring(0, 150);

        // 이미지 생성 수사 시작
        const ims = await Promise.all([1,2].map(() => genImg(title, process.env.KIE_API_KEY)));
        
        const sumRaw = await callAI(model, `5 elite snapshot points for "${title}" in ${lang}. Use <br><br>. Expertise focus.`, false);
        const cleanSum = cleanTitle(sumRaw || "Strategic perspective.").split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*\d.]\s*/, '✦ ')).join('<br><br>');

        let body = STYLE + `<div class="vue-content-body">
            ${ims[0] ? `<div class="vue-main-thumb"><img src="${ims[0]}"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;padding:25px;"><div style="font-size:3.5rem;font-weight:1050;color:#fff;text-shadow:0 12px 60px rgba(0,0,0,0.95);text-align:center;line-height:1.2;">${title}</div></div></div>` : ''}
            <div style="background:#f8fafc;border-radius:45px;padding:3.8rem;margin:5.5rem 0;border:3px dashed #6366f1;"><span style="font-weight:1100;color:#4338ca;font-size:1.6rem;margin-bottom:2.2rem;display:block;letter-spacing:-0.03rem;">AUTHORITY PERSPECTIVE</span><div style="color:#334155;line-height:2.4;font-size:1.15rem;">${cleanSum}</div></div>
            <div class="vue-ad-slot"></div>`;

        let chainContext = ""; // 중복 서술 방지용 브레인
        if (isMaster) {
            for(let p=1; p<=3; p++) {
                const pTitle = ["Strategic Vision", "Executive Implementation", "Future Projection"][p-1];
                const content = clean(await callAI(model, `Write Part ${p} (${pTitle}) of 10k char article for "${target}" in ${lang} using ${selectedPattern}. ${chainContext ? "PREVIOUS: " + chainContext.substring(0, 1500) : ""} BREAK every 3 sentences with <div class=\"vue-ad-slot\"></div>. HTML.`, true));
                body += content;
                chainContext += content.replace(/<[^>]*>/g, ' ').substring(0, 800) + " ";
            }
            hubHistory.forEach(s => {
                body += `<div class="vue-hub-card"><span style="font-size:2.2rem;font-weight:1050;color:#1e293b;margin-bottom:2.2rem;display:block;line-height:1.3;">${s.title}</span><p style="color:#64748b;margin-bottom:3.2rem;line-height:2.1;font-size:1.1rem;">${s.summary}</p><a href="${s.url}" class="vue-btn-more">${lang === 'ko' ? "전문 통찰 분석 읽기 →" : "Read Full Authority Guide"}</a></div>`;
            });
        } else {
            for(let c=1; c<=4; c++) {
                const content = clean(await callAI(model, `Write Chapter ${c} for "${title}" in ${lang} using ${selectedPattern}. ${chainContext ? "ALREADY COVERED: " + chainContext.substring(0, 1200) : ""} NO overlap. BREAK every 3-4 sentences with <div class=\"vue-ad-slot\"></div>. HTML.`, true));
                body += content;
                chainContext += content.replace(/<[^>]*>/g, ' ').substring(0, 500) + " ";
                if(c === 1 && ims[1]) body += `<div style="margin:7.5rem 0;text-align:center;"><img src="${ims[1]}" style="max-width:100%;border-radius:65px;box-shadow:0 45px 95px rgba(0,0,0,0.25);"></div>`;
            }
        }

        const faqR = await callAI(model, `15 Professional FAQs for "${title}" in ${lang}. Return RAW JSON array only.`, false);
        try {
            const cleanFaq = faqR.substring(faqR.indexOf('['), faqR.lastIndexOf(']') + 1);
            const faqs = JSON.parse(cleanFaq);
            let fH = `<div class="vue-ad-slot"></div><div style="background:#fff;border-radius:60px;padding:5.5rem;margin-top:12rem;border:4.5px solid #f8fafc;"><div style="font-size:3.2rem;font-weight:1000;color:#6366f1;margin-bottom:5.5rem;text-align:center;letter-spacing:0.15rem;">EXPERT Q&A HUB (EEAT)</div>`;
            faqs.forEach(f => { if(f.q && f.a) fH += `<div style="margin-bottom:4.8rem;border-bottom:2.5px solid #f8fafc;padding-bottom:3.8rem;"><span style="font-weight:1100;color:#0f172a;font-size:1.9rem;display:block;margin-bottom:1.8rem;line-height:1.4;">Q. ${f.q}</span><p style="color:#475569;font-size:1.3rem;line-height:2.3;">${f.a}</p></div>`; });
            body += fH + `</div>`;
        } catch(e) { }

        body += discl + `<div style="margin-top:150px;text-align:center;color:#94a3b8;font-size:14px;font-weight:800;letter-spacing:0.3rem;">ENGINE POWERED BY VUE DEEPVISION v1.1.5</div></div>`;

        try {
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
            auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            const blogger = google.blogger({ version: 'v3', auth });
            const r = await blogger.posts.insert({ blogId: bId, requestBody: { title, content: body } });
            console.log(`✅ Chained Success: ${title}`);
            hubHistory.push({ title, url: r.data.url, summary: cleanSum.replace(/✦ |<br>/g, ' ').substring(0, 250) + '...' });
        } catch (e) { console.log("❌ Blogger Error:", JSON.stringify(e.response?.data || e.message, null, 2)); }
        await new Promise(res => setTimeout(res, 25000));
    }
}
run();