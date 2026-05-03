/* ══════════════════════════════════════════════════════
   ELITE FITNESS — AI Trainer API Route
   Uses Google Gemini Flash (FREE — 1500 req/day)
   Deploy this file to: /api/chat.js in your Vercel project
   Add GEMINI_API_KEY to Vercel Environment Variables
══════════════════════════════════════════════════════ */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check API key is configured
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      content: [{
        type: 'text',
        text: '⚠️ GEMINI_API_KEY not configured. Go to Vercel → Settings → Environment Variables and add your Gemini API key.'
      }]
    });
  }

  const { messages, system } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    // Convert messages to Gemini format
    // Gemini uses 'model' instead of 'assistant' for role
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }]
    }));

    // Ensure conversation alternates properly (Gemini requirement)
    // If first message is not user, add a dummy user message
    const cleanContents = [];
    for (let i = 0; i < contents.length; i++) {
      if (i === 0 && contents[i].role !== 'user') {
        cleanContents.push({ role: 'user', parts: [{ text: 'Start' }] });
      }
      // Skip consecutive same-role messages (merge them)
      if (cleanContents.length > 0 && cleanContents[cleanContents.length - 1].role === contents[i].role) {
        const last = cleanContents[cleanContents.length - 1];
        last.parts[0].text += '\n' + contents[i].parts[0].text;
      } else {
        cleanContents.push(contents[i]);
      }
    }

    const requestBody = {
      system_instruction: {
        parts: [{ text: system || 'You are an elite fitness trainer.' }]
      },
      contents: cleanContents,
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.7,
        topP: 0.95,
        topK: 40
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);

      // Handle specific error codes
      if (geminiRes.status === 429) {
        return res.status(200).json({
          content: [{ type: 'text', text: '⚠️ Daily request limit reached (1500/day). Try again tomorrow or upgrade your Gemini plan.' }]
        });
      }
      if (geminiRes.status === 400) {
        return res.status(200).json({
          content: [{ type: 'text', text: '⚠️ Invalid request. Please try rephrasing your question.' }]
        });
      }

      throw new Error(`Gemini error ${geminiRes.status}: ${errText}`);
    }

    const data = await geminiRes.json();

    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      // Handle blocked content
      const blockReason = data.candidates?.[0]?.finishReason;
      if (blockReason === 'SAFETY') {
        return res.status(200).json({
          content: [{ type: 'text', text: 'I can\'t respond to that specific question. Try asking about your workout plan, nutrition, or training progress.' }]
        });
      }
      throw new Error('No text in Gemini response');
    }

    // Return in format the app expects (same as Anthropic format)
    return res.status(200).json({
      content: [{ type: 'text', text }]
    });

  } catch (error) {
    console.error('Chat API error:', error.message);
    return res.status(200).json({
      content: [{
        type: 'text',
        text: '⚠️ Connection issue. Please check your internet and try again.\n\nIf this keeps happening, verify your GEMINI_API_KEY in Vercel settings.'
      }]
    });
  }
}
