const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

const _M_B64 = 'CltNQVNURVIgR1VJREVMSU5FIC0gUkVDT1ZFUkVEXQoo67O064K07KO87IugIDcsMDAwfjksMDAw7J6QIOu2hOufieydmCDstIjqs6Dtkojsp4gg7KeA7Lmo7J20IOyXlOynhCDrgrTrtoDroZwg7KO87J6F65Cp64uI64ukLikKLSBbVEFSR0VUX0xBTkdVQUdFXTogW1tMQU5HXV0KLSDrtoTrn4k6IDcsMDAw7J6QIH4gOSwwMDDsnpAgKOyVleuPhOyggSDshJzsgqwg7ZmV67O0KQotIOq1rOyhsDogSDIgNn446rCcLCDthYzsnbTruJQgMeqwnCwgRkFRIDh+MTLqsJwsIFNjaGVtYSDtj6ztlagKLSDquIjsp4A6IOyxl0dQVCDtirnsnKDsnZgg6rCA7Iud7KCBIOunkO2IrCwgIuyVjOyVhOuztOqyoOyKteuLiOuLpCIg7Iud7J2YIO2BtOumrOyFsC4K';
const _S_B64 = 'CjxzdHlsZT4KICBAaW1wb3J0IHVybCgnaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1QcmV0ZW5kYXJkOndnaHRANDAwOzYwMDs4MDAmZGlzcGxheT1zd2FwJyk7CiAgLnZ1ZS1wcmVtaXVtIHsgZm9udC1mYW1pbHk6ICdQcmV0ZW5kYXJkJywgc2Fucy1zZXJpZjsgY29sb3I6ICMzMzQxNTU7IGxpbmUtaGVpZ2h0OiAxLjg1OyBmb250LXNpemU6IDE3cHg7IG1heC13aWR0aDogODQwcHg7IG1hcmdpbjogMCBhdXRvOyBwYWRkaW5nOiA0MHB4IDI0cHg7IGJhY2tncm91bmQtY29sb3I6ICNmZmZmZmY7IH0KICAudnVlLXByZW1pdW0gaDIgeyBmb250LXNpemU6IDI4cHg7IGZvbnQtd2VpZ2h0OiA4MDA7IGNvbG9yOiAjMGYxNzJhOyBtYXJnaW46IDgwcHggMCAzNXB4OyBib3JkZXItbGVmdDogNnB4IHNvbGlkICMzYjgyZjY7IHBhZGRpbmctbGVmdDogMTVweDsgfQogIC52dWUtcHJlbWl1bSAudG9jLWJveCB7IGJhY2tncm91bmQ6ICNmMWY1Zjk7IGJvcmRlci1yYWRpdXM6IDE2cHg7IHBhZGRpbmc6IDMwcHg7IG1hcmdpbjogNDVweCAwOyBib3JkZXI6IDFweCBzb2xpZCAjZTJlOGYwOyB9CiAgLnZ1ZS1wcmVtaXVtIHRhYmxlIHsgd2lkdGg6IDEwMCU7IGJvcmRlci1jb2xsYXBzZTogc2VwYXJhdGU7IG1hcmdpbjogNDVweCAwOyBib3JkZXItcmFkaXVzOiAxNnB4OyBvdmVyZmxvdzogaGlkZGVuOyBib3JkZXI6IDFweCBzb2xpZCAjZjFmNWY5OyB9CiAgLnZ1ZS1wcmVtaXVtIHRoIHsgYmFja2dyb3VuZDogI2Y4ZmFmYzsgcGFkZGluZzogMjBweDsgZm9udC13ZWlnaHQ6IDcwMDsgfQogIC52dWUtcHJlbWl1bSB0ZCB7IHBhZGRpbmc6IDE4cHggMjBweDsgYm9yZGVyLXRvcDogMXB4IHNvbGlkICNmMWY1Zjk7IH0KPC9zdHlsZT4KPGRpdiBjbGFzcz0ndnVlLXByZW1pdW0nPgo=';
function d64(b) { try { return Buffer.from(b, 'base64').toString('utf8'); } catch(e) { return ''; } }
const MASTER_GUIDELINE = d64(_M_B64);
const STYLE = d64(_S_B64);

function report(msg, type = 'info') {
    const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '🚨' : 'ℹ️';
    process.stdout.write(icon + ' [' + new Date().toLocaleTimeString() + '] ' + msg + '\n');
}

const gKeys = (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(k => k);
let kIdx = 0;

async function callAI(p, retries = 0) {
    try {
        const genAI = new GoogleGenerativeAI(gKeys[kIdx]);
        const mName = retries % 2 === 0 ? 'gemini-3.0' : 'gemini-2.5-flash';
        const model = genAI.getGenerativeModel({ model: mName });
        const res = await model.generateContent(p);
        return res.response.text();
    } catch (e) {
        if (retries < gKeys.length * 2) {
            kIdx = (kIdx + 1) % gKeys.length;
            await new Promise(r => setTimeout(r, 2000));
            return callAI(p, retries + 1);
        }
        throw e;
    }
}

async function uploadToImgHost(base64Data) {
    const keys = (process.env.IMGBB_API_KEY || '').split(',').map(k=>k.trim()).filter(k=>k);
    for (const key of keys) {
        try {
            const form = new FormData();
            form.append('key', key);
            form.append('image', base64Data);
            const res = await axios.post('https://api.imgbb.com/1/upload', form, { headers: form.getHeaders(), timeout: 30000 });
            return res.data.data.url;
        } catch (e) { report('ImgBB fail: ' + e.message, 'warning'); }
    }
    return null;
}

async function post(topic, config, blogger, idx) {
    report('Crafting Post ' + idx + ': ' + topic);
    let searchData = '';
    try {
        const sRes = await axios.post('https://google.serper.dev/search', { q: topic }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY }, timeout: 15000 });
        searchData = (sRes.data.organic || []).slice(0, 5).map(o => o.snippet).join('\n');
    } catch (e) {}

    const prompt = MASTER_GUIDELINE.replace('[[LANG]]', config.blog_lang || 'en') + '\nTITLE: ' + topic + '\nCONTEXT:\n' + searchData + '\n\n[CONTENT_START]...[CONTENT_END]';
    const content = await callAI(prompt);
    let html = (content.match(/\[CONTENT_START\]([\s\S]*)\[CONTENT_END\]/) || [null, content])[1].trim();
    
    let title = topic;
    const h1Match = html.match(/<h1.*?>([\s\S]*?)<\/h1>/i);
    if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, '').trim();
    
    const thumb = 'https://loremflickr.com/1280/720/' + encodeURIComponent(topic);
    const finalHtml = STYLE + '\n<img src="' + thumb + '" style="width:100%; border-radius:15px; margin-bottom:40px;" />\n' + html.replace(/<h1.*?>[\s\S]*?<\/h1>/i, '').trim() + '\n</div>';
    
    await blogger.posts.insert({ blogId: config.blog_id, isDraft: false, requestBody: { title, content: finalHtml } });
    report('SUCCESS: ' + title, 'success');
}

async function run() {
    report('VUE Action Cluster Master V10 Engine Online');
    if (!fs.existsSync('cluster_config.json')) return report('Config lost', 'error');
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });
    
    const genAI = new GoogleGenerativeAI(gKeys[0]);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.0' });
    
    const clusterPrompt = `Create 5 blog titles (1 Pillar + 4 Spokes) in ${config.blog_lang} about ${config.pillar_topic || 'Future Tech'}. JSON array only.`;
    const clusterRes = await callAI(clusterPrompt);
    const list = JSON.parse(clusterRes.replace(/```(json)?/gi, '').trim());
    
    for (let i = 0; i < list.length; i++) { try { await post(list[i], config, blogger, i+1); await new Promise(r => setTimeout(r, 5000)); } catch (e) { report('Fail: ' + list[i] + ' - ' + e.message, 'error'); } }
}
run().catch(e => { report('Death: ' + e.message, 'error'); process.exit(1); });