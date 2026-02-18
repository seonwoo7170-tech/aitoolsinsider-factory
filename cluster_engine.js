const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;800&family=Pretendard:wght@400;700;900&display=swap');
  .vue-body { font-family: 'Pretendard', sans-serif; line-height: 1.8; color: #333; font-size: 16px; max-width: 860px; margin: 0 auto; padding: 20px; word-break: keep-all; }
  .vue-body h2 { font-size: 24px; font-weight: bold; color: #000; background-color: #FFD8A8; padding: 15px 20px; border-radius: 8px; margin: 4em 0 1.8em; line-height: 1.3; border-left: 8px solid #000; }
  .internal-link-box { background: #eff6ff; border: 1px solid #3b82f6; border-radius: 12px; padding: 25px; margin: 4em 0; }
  .internal-link-box b { color: #1e40af; display: block; margin-bottom: 12px; }
  .internal-link-box a { color: #2563eb; font-weight: bold; text-decoration: none; display: block; margin: 8px 0; border-left: 3px solid #3b82f6; padding-left: 12px; transition: 0.2s; }
  .internal-link-box a:hover { color: #000; background: #fff; transform: translateX(5px); }
  .btn-more { display: inline-block; background: #000; color: #fff !important; padding: 14px 30px; border-radius: 50px; text-decoration: none !important; font-weight: 800; margin: 2em 0; }
</style>`;

const LABELS = { ko: { sum: '📌 핵심 요약', btn: '전체 가이드 읽어보기 🚀', links: '🔗 연관 추천 콘텐츠 (함께 읽으면 좋은 글)' }, en: { sum: '📌 Summary', btn: 'Read Full Guide 🚀', links: '🔗 Recommended Reading (Spider Web Interlink)' } };

async function writeAndPost(model, target, lang, blogger, bId, isPillar, prevLinks, publishTime) {
  const L = LABELS[lang] || LABELS.en;
  // ... Header & AI Logic ... (Same as v1.3.32)
  
  let body = STYLE + `<div class='vue-body'> ...content... `;

  // SPIDER WEB LINKING: If it's a sub-post, link to the previous sub-post
  if(!isPillar && prevLinks.length > 0) {
    body += `<div class='internal-link-box'><b>${L.links}</b>`;
    const lastLink = prevLinks[prevLinks.length - 1]; // Link to the immediately preceding post
    body += `<a href='${lastLink.url}'>📌 ${lastLink.title}</a>`;
    body += `</div>`;
  }

  // PILLAR LINKING: Already links to all 4 subs.
  // ... rest of logic ...
}

async function run() {
  const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
  // ... setup ...
  const subLinks = [];
  for(let i=0; i < used.length; i++) {
    const r = await writeAndPost(model, used[i], config.lang, blogger, config.blog_id, false, subLinks, new Date(currentTime));
    subLinks.push(r); // Add to the 'web'
  }
  // Pillar links to all subLinks
  await writeAndPost(model, config.pillar, config.lang, blogger, config.blog_id, true, subLinks, new Date(currentTime));
}
run();