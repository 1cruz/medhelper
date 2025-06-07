// server.js
require('dotenv').config(); // 載入 .env 檔案中的環境變數
const express = require('express');
const { OpenAI } = require('openai'); // 使用 OpenAI v4 SDK 的正確引入方式
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 檢查 API 金鑰是否存在
if (!process.env.OPENAI_API_KEY) {
    console.error("錯誤：OPENAI_API_KEY 未在 .env 檔案中設定。");
    process.exit(1); // 終止程式
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 中介軟體
app.use(cors()); // 啟用 CORS，允許來自不同來源的請求 (例如本地端 HTML 檔案)
app.use(express.json()); // 解析傳入請求的 JSON 主體
app.use(express.static(path.join(__dirname, 'public'))); // 託管 public 資料夾中的靜態檔案

// API 端點：處理病歷解讀請求
app.post('/api/interpret', async (req, res) => {
    const { recordText, version } = req.body;

    if (!recordText || !version) {
        return res.status(400).json({ error: '缺少 recordText 或 version 參數。' });
    }

    let systemMessageContent = "";
    let userPrompt = "";

    if (version === 'layman') {
        systemMessageContent = "你是一位有耐心的醫療解說員，擅長用淺顯易懂的方式解釋複雜的醫療資訊給沒有醫療背景的民眾。你的回答應該溫暖且易於理解。";
        userPrompt = `這是一段病歷內容：\n"${recordText}"\n\n請用非常淺顯易懂、避免專業術語的方式，向沒有醫療背景的病患解釋這段病歷的重點、可能的意義以及需要注意的事項。如果內容包含檢查結果，請說明結果是正常還是異常，以及異常可能代表什麼。請直接提供解釋，不要有多餘的開場白或結語。`;
    } else if (version === 'professional') {
        systemMessageContent = "你是一位資深的臨床醫師，能夠精準地解讀病歷並提供專業見解。你的回答應該專業、嚴謹且包含醫學術語。";
        userPrompt = `這是一段病歷內容：\n"${recordText}"\n\n請針對醫療專業人員，提供這段病歷的專業解讀，包括：\n1. 主要發現與診斷（若有）。\n2. 關鍵數據或描述的臨床意義。\n3. 潛在的鑑別診斷。\n4. 建議的後續檢查或處理方向。\n請使用精確的醫學術語，條列式呈現。請直接提供專業解讀，不要有多餘的開場白或結語。`;
    } else {
        return res.status(400).json({ error: '無效的 version 參數。' });
    }

    try {
        console.log(`收到 ${version} 版本請求，內容：${recordText.substring(0, 50)}...`);
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // 您可以根據需求選擇不同模型，例如 "gpt-4" (如果可用)
            messages: [
                { role: "system", content: systemMessageContent },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.5, // 調整溫度以控制回應的隨機性，0.2-0.7 是常見範圍
            max_tokens: 1000, // 限制回應的最大長度
        });

        const interpretation = completion.choices[0]?.message?.content?.trim();
        if (interpretation) {
            console.log(`OpenAI 回應：${interpretation.substring(0, 100)}...`);
            res.json({ interpretation });
        } else {
            console.error("OpenAI API 未返回有效的 content。");
            res.status(500).json({ error: 'OpenAI API 未返回有效的內容。' });
        }

    } catch (error) {
        console.error('與 OpenAI API 通訊時發生錯誤:', error.response ? error.response.data : error.message);
        res.status(500).json({
            error: '與 OpenAI API 通訊時發生錯誤。',
            details: error.response ? error.response.data : error.message
        });
    }
});

// 根路徑，提供 HTML 檔案 (可選)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'medical_interpreter.html'));
});

// 啟動伺服器
app.listen(port, () => {
    console.log(`伺服器正在 http://localhost:${port} 上運行`);
    console.log(`前端頁面可於 http://localhost:${port}/medical_interpreter.html 存取`);
});
