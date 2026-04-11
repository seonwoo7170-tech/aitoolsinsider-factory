const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

const _M_B64 = 'CltHTE9CQUwgTEFOR1VBR0UgUk9VVElOR10KLSBbVEFSR0VUX0xBTkdVQUdFXTog7J20IOyEpOygleydtCDstZzsmrDshKDsnbTrqbAsIOuwmOuTnOyLnCDsp4DsoJXrkJwg7Ja47Ja066Gc66eMIOyekeyEse2VmOyLreyLnOyYpC4KCltDT1JFIFJVTEVTXQotIEgxIOygnOuqqSAo7ZWE7IiYKQotIOyLnOyekSDsp4DsoJA6IFtDT05URU5UX1NUQVJUXQotIOyiheujjCDsp4DsoJA6IFtDT05URU5UX0VORF0K';
const _S_B64 = 'CjxzdHlsZT4KICBAaW1wb3J0IHVybCgnaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1QcmV0ZW5kYXJkOndnaHRANDAwOzcwMCZkaXNwbGF5PXN3YXAnKTsKICAudnVlLXByZW1pdW0geyBmb250LWZhbWlseTogJ1ByZXRlbmRhcmQnLCBzYW5zLXNlcmlmOyBjb2xvcjogIzMzNDE1NTsgbGluZS1oZWlnaHQ6IDEuODsgbWF4LXdpZHRoOiA4MDBweDsgbWFyZ2luOiAwIGF1dG87IHBhZGRpbmc6IDIwcHg7IH0KICAudnVlLXByZW1pdW0gaDIgeyBjb2xvcjogIzBmMTcyYTsgYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAjNjM2NmYxOyBwYWRkaW5nLWxlZnQ6IDE1cHg7IG1hcmdpbjogNTBweCAwIDIwcHg7IH0KPC9zdHlsZT4KPGRpdiBjbGFzcz0ndnVlLXByZW1pdW0nPgo=';

function d64(b) { try { return Buffer.from(b, 'base64').toString('utf8'); } catch(e) { return ''; } }
const MASTER_GUIDELINE = d64(_M_B64);
const STYLE = d64(_S_B64);

function report(msg, type = 'info') {
    const icon = type === 'error' ? 'X' : type === 'warning' ? '!' : 'i';
    process.stdout.write(icon + ' [' + new Date().toLocaleTimeString() + '] ' + msg + '\n');
}

const fontDir = path.join(__dirname, 'assets', 'fonts');
const fontPaths = [ { path: path.join(fontDir, 'Pretendard-Black.ttf'), family: 'Pretendard' } ];
let aFont = 'sans-serif';
for (const f of fontPaths) { if (fs.existsSync(f.path)) { try { registerFont(f.path, { family: f.family }); aFont = f.family; break; } catch (e) {} } }

const gKeys = (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(k => k);
let kIdx = 0;

async function callAI(p, retries = 0) {
    try {
        if (gKeys.length === 0) throw new Error('No Keys');
        const genAI = new GoogleGenerativeAI(gKeys[kIdx]);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const res = await model.generateContent(p);
        return res.response.text();
    } catch (e) {
        if (retries < gKeys.length * 2) {
            kIdx = (kIdx + 1) % gKeys.length;
            report('Retry with key ' + kIdx, 'warning');
            await new Promise(r => setTimeout(r, 2000));
            return callAI(p, retries + 1);
        }
        throw e;
    }
}

async function post(t, config, blogger) {
    report('Post: ' + t);
    const prompt = '[GUIDELINE]\n' + MASTER_GUIDELINE + '\n\nTopic: ' + t + '\n[CONTENT_START]...[CONTENT_END]';
    const content = await callAI(prompt);
    let html = (content.match(/\[CONTENT_START\]([\s\S]*)\[CONTENT_END\]/) || [null, content])[1].trim();
    const thumb = 'https://loremflickr.com/1200/630/' + encodeURIComponent(t);
    const final = STYLE + '\n<img src="' + thumb + '" style="width:100%" />\n' + html + '\n</div>';
    await blogger.posts.insert({ blogId: config.blog_id, isDraft: false, requestBody: { title: t, content: final } });
    report('Success: ' + t, 'success');
}

async function run() {
    report('VUE Engine V7 Standard Online');
    if (!fs.existsSync('cluster_config.json')) return report('Config lost', 'error');
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });
    const ts = (config.clusters || []).slice(0, config.daily_count || 1);
    if (ts.length === 0) ts.push('Tech Insight');
    for (const t of ts) { try { await post(t, config, blogger); } catch (e) { report('Fail: ' + t + ' (' + e.message + ')', 'error'); } }
}

run().catch(e => { report('Fatal: ' + e.message, 'error'); process.exit(1); });