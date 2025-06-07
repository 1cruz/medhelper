// server.js
require('dotenv').config(); // 載入 .env 檔案中的環境變數
const express = require('express');
const { OpenAI } = require('openai'); // 使用 OpenAI v4 SDK 的正確引入方式
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
// API 端點：處理病歷解讀請求 (修改後)
app.post('/api/interpret', async (req, res) => {
    // --- 修改：接收新的欄位 ---
    const { name, age, gender, symptoms, version, ailmentArea } = req.body; // 注意：用 symptoms 取代 recordText，並加入其他欄位

    // --- 修改：更新輸入驗證 ---
    // 根據您的需求決定哪些是必填欄位
    if (!name || !symptoms || !version || !ailmentArea) {
        return res.status(400).json({ error: '缺少必要欄位：姓名 (name)、主訴 (symptoms)、版本 (version)、病情部位 (ailmentArea)。' });
    }

    let systemMessageContent = "";
    let userPrompt = "";

    // --- 修改：更新 userPrompt 以包含新資訊 ---
    const patientInfo = `病患資料：\n姓名：${name}\n年齡：${age || '未提供'}\n性別：${gender || '未提供'}\n病情部位：${ailmentArea}\n主訴症狀：${symptoms}`;

    if (version === 'layman') {
        systemMessageContent = "你是一位有耐心的醫療解說員，擅長用淺顯易懂的方式解釋複雜的醫療資訊給沒有醫療背景的民眾。你的回答應該溫暖且易於理解。";
        // 將 patientInfo 加入 prompt
        userPrompt = `${patientInfo}\n\n請用非常淺顯易懂、避免專業術語的方式，向沒有醫療背景的病患解釋這段主訴症狀的重點、可能的意義以及需要注意的事項。如果內容包含檢查結果，請說明結果是正常還是異常，以及異常可能代表什麼。請直接提供解釋，不要有多餘的開場白或結語。`;
    } else if (version === 'professional') {
        systemMessageContent = "你是一位資深的臨床醫師，能夠精準地解讀病歷並提供專業見解。你的回答應該專業、嚴謹且包含醫學術語。";
        // 將 patientInfo 加入 prompt
        userPrompt = `${patientInfo}\n\n請針對醫療專業人員，提供這段主訴症狀的專業解讀，包括：\n1. 主要發現與診斷（若有）。\n2. 關鍵數據或描述的臨床意義。\n3. 潛在的鑑別診斷。\n4. 建議的後續檢查或處理方向。\n請使用精確的醫學術語，條列式呈現。請直接提供專業解讀，不要有多餘的開場白或結語。`;
    } else {
        return res.status(400).json({ error: '無效的 version 參數。' });
    }

    try {
        // --- 修改：更新 console.log ---
        console.log(`收到 ${version} 版本請求。內容: 姓名: ${name}, 病情部位: ${ailmentArea}, 主訴: ${symptoms.substring(0, 50)}...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemMessageContent },
                { role: "user", content: userPrompt } // 使用更新後的 userPrompt
            ],
            temperature: 0.5,
            max_tokens: 1000,
        });

        const interpretation = completion.choices[0]?.message?.content?.trim();

        if (interpretation) {
            console.log(`OpenAI 回應：${interpretation.substring(0, 100)}...`);

            // ==================================================
            // === 在這裡插入儲存檔案的程式碼區塊 ===
            // ==================================================
            try { // 建議為檔案操作加上獨立的 try-catch
                const patientRecordDir = path.join(__dirname, 'patient_records', name, ailmentArea);
                const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, ''); // 產生類似 2025-06-07T14-16-00 的字串
                const fileName = `record_${timestamp}.txt`;
                const filePath = path.join(patientRecordDir, fileName);

                // 確保資料夾存在 (recursive: true 會創建所有不存在的父資料夾)
                if (!fs.existsSync(patientRecordDir)) {
                    fs.mkdirSync(patientRecordDir, { recursive: true });
                    console.log(`已創建資料夾: ${patientRecordDir}`);
                }

                // 準備要儲存的內容
                let contentToSave = `病患姓名: ${name}\n`;
                contentToSave += `年齡: ${age || '未提供'}\n`;
                contentToSave += `性別: ${gender || '未提供'}\n`;
                contentToSave += `病情部位: ${ailmentArea}\n`;
                contentToSave += `原始主訴: ${symptoms}\n`;
                contentToSave += `請求時間: ${new Date().toLocaleString()}\n\n`;
                contentToSave += `--- ${version === 'layman' ? '通俗版' : '專業版'} 解讀 (${version}) ---\n${interpretation}\n\n`; // 使用 interpretation 變數

                fs.writeFileSync(filePath, contentToSave);
                console.log(`病患資料已儲存到: ${filePath}`);

            } catch (fileError) {
                console.error('儲存檔案時發生錯誤:', fileError);
                // 注意：即使檔案儲存失敗，我們仍然會將翻譯結果回傳給前端
                // 您可以根據需求決定是否要因為檔案儲存失敗而回傳不同的錯誤訊息給前端
            }
            // ==================================================
            // === 檔案儲存程式碼區塊結束 ===
            // ==================================================

            // 將解讀結果回傳給前端
            res.json({ interpretation }); // 這行保持不變，在檔案儲存之後執行

        } else {
            console.error("OpenAI API 未返回有效的 content。");
            res.status(500).json({ error: 'OpenAI API 未返回有效的內容。' });
        }

    } catch (error) {
        // 這個 catch 區塊處理 OpenAI API 的錯誤
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
