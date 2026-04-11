const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const _M_B64 = 'CltHTE9CQUwgTEFOR1VBR0UgUk9VVElOR10KLSBbVEFSR0VUX0xBTkdVQUdFXTog7J20IOyEpOygleydtCDstZzsmrDshKDsnbTrqbAsIOuwmOuTnOyLnCDsp4DsoJXrkJwg7Ja47Ja066Gc66eMIOyekeyEse2VmOyLreyLnOyYpC4KW09VVFBVVCBGT1JNQVRdCi0gSFRNTCDtmJXsi53snLzroZwg7Iuc7J6RIOyngOygkCBbQ09OVEVOVF9TVEFSVF0sIOyiheujjCDsp4DsoJAgW0NPTlRFTlRfRU5EXeulvCDtj6ztlajtlZjsi63si5zsmKQuCg==';
const _S_B64 = 'CjxzdHlsZT4KICAudnVlLXByZW1pdW0geyBmb250LWZhbWlseTogc2Fucy1zZXJpZjsgY29sb3I6ICMzMzQxNTU7IGxpbmUtaGVpZ2h0OiAxLjg7IG1heC13aWR0aDogODAwcHg7IG1hcmdpbjogMCBhdXRvOyBwYWRkaW5nOiAyMHB4OyB9CiAgLnZ1ZS1wcmVtaXVtIGgyIHsgY29sb3I6ICMwZjE3MmE7IGJvcmRlci1sZWZ0OiA1cHggc29saWQgIzYzNjZmMTsgcGFkZGluZy1sZWZ0OiAxNXB4OyBtYXJnaW46IDUwcHggMCAyMHB4OyB9Cjwvc3R5bGU+CjxkaXYgY2xhc3M9J3Z1ZS1wcmVtaXVtJz4K';
function d64(b) { try { return Buffer.from(b, 'base64').toString('utf8'); } catch(e) { return ''; } }
const MASTER_GUIDELINE = d64(_M_B64);
const STYLE = d64(_S_B64);

function report(msg, type = 'info') {
    const icon = type === 'error' ? 'X' : type === 'warning' ? '!' : 'i';
    process.stdout.write(icon + ' [' + new Date().toLocaleTimeString() + '] ' + msg + '\n');
}

const gKeys = (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(k => k);
let kIdx = 0;
// 독점 모델 리스트: 구형 모델(2.0, 1.5) 완전 배제
const M_LIST = ['gemini-3.0', 'gemini-2.5-flash'];

async function callAI(p, retries = 0) {
    try {
        if (gKeys.length === 0) throw new Error('No Gemini Keys');
        const genAI = new GoogleGenerativeAI(gKeys[kIdx]);
        const mName = M_LIST[retries % M_LIST.length];
        const model = genAI.getGenerativeModel({ model: mName });
        const res = await model.generateContent(p);
        return res.response.text();
    } catch (e) {
        if (retries < gKeys.length * M_LIST.length) {
            report('Key ' + (kIdx+1) + ' [' + M_LIST[retries % M_LIST.length] + '] FAILED: ' + e.message, 'warning');
            kIdx = (kIdx + 1) % gKeys.length;
            await new Promise(r => setTimeout(r, 2000));
            return callAI(p, retries + 1);
        }
        throw e;
    }
}

async function post(t, config, blogger) {
    report('Target: ' + t);
    const prompt = 'Blog post about: ' + t + '\n' + MASTER_GUIDELINE + '\n[CONTENT_START]...[CONTENT_END]';
    const content = await callAI(prompt);
    let html = (content.match(/\[CONTENT_START\]([\s\S]*)\[CONTENT_END\]/) || [null, content])[1].trim();
    const final = STYLE + '\n' + html + '\n</div>';
    await blogger.posts.insert({ blogId: config.blog_id, isDraft: false, requestBody: { title: t, content: final } });
    report('Post Success: ' + t, 'success');
}

async function run() {
    report('🛡️ VUE Engine V7.4 Exclusive Protocol Online');
    report('Only Gemini 3.0 & 2.5 Flash are allowed.');
    if (!fs.existsSync('cluster_config.json')) return report('Config lost', 'error');
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });
    const ts = (config.clusters || []).slice(0, config.daily_count || 1);
    if (ts.length === 0) ts.push('Tech Master');
    for (const t of ts) { try { await post(t, config, blogger); } catch (e) { report('CRITICAL Fail: ' + t + ' - ' + e.message, 'error'); } }
}
run().catch(e => { report('Fatal: ' + e.message, 'error'); process.exit(1); });