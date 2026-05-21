export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { service, niche, location, licenseKey } = req.body;

  if (!licenseKey || !licenseKey.toUpperCase().includes('INCEPTION')) {
    return res.status(401).json({ error: 'Mã bản quyền không hợp lệ!' });
  }

  try {
    // 1. Gọi Serper API để quét dữ liệu Google
    const serperResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: `top ${niche} in ${location} website business`,
        num: 5
      })
    });
    
    const serperData = await serperResponse.json();
    
    // Bắt lỗi nếu Serper API sai chìa khóa
    if (serperData.error) {
      return res.status(500).json({ error: `Lỗi từ Serper API (Check lại key Serper): ${serperData.error}` });
    }

    const organicResults = serperData.organic || [];
    if (organicResults.length === 0) {
      return res.status(404).json({ error: 'Không cào được doanh nghiệp nào. Hãy thử nhập chữ tiếng Anh ở ô Ngách (ví dụ: Gyms, Spa) và Khu vực (Texas, New York) nhé!' });
    }
    
    const leadsSummary = organicResults.map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));

    // 2. Gọi Gemini API để phân tích
    const systemPrompt = `You are a B2B Growth Hacker. Analyze these business leads for an agency offering "${service}".
    Leads data: ${JSON.stringify(leadsSummary)}.
    
    For each lead, perform an operational gap audit. Return a strict JSON array of objects with keys:
    "name" (Business name),
    "website" (URL link),
    "email" (Generic fallback email like info@domain.com),
    "gap" (1 critical operational gap regarding ${service} written in Vietnamese),
    "loom" (A 60s personalized Loom video script pitch in English),
    "email_script" (A conversion-focused 3-line cold email pitch in English).
    
    Respond ONLY with the valid JSON array. No markdown formatting code blocks, no text explanations.`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const geminiData = await geminiResponse.json();
    
    // Bắt lỗi nếu Gemini API sai chìa khóa hoặc hết hạn
    if (geminiData.error) {
      return res.status(500).json({ error: `Lỗi từ Gemini API (Check lại key Gemini): ${geminiData.error.message}` });
    }

    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      return res.status(500).json({ error: 'Gemini không trả về kết quả cấu trúc. Hãy thử bấm lại lần nữa.' });
    }

    const cleanJsonText = geminiData.candidates[0].content.parts[0].text;
    return res.status(200).json(JSON.parse(cleanJsonText));

  } catch (error) {
    return res.status(500).json({ error: "Lỗi hệ thống: " + error.message });
  }
}
