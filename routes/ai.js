const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { run, get, all } = require('../data/database');

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// POST chat with Active AI Interviewer
router.post('/interview', async (req, res) => {
  try {
    const { project_id, message } = req.body;
    if (!project_id || !message) {
      return res.status(400).json({ success: false, error: 'project_id and message are required' });
    }

    const project = await get(`SELECT * FROM projects WHERE project_id = ?`, [project_id]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Save user message to database
    const userMsgId = `msg_${crypto.randomBytes(6).toString('hex')}`;
    await run(
      `INSERT INTO chat_messages (message_id, project_id, sender, content) VALUES (?, ?, ?, ?)`,
      [userMsgId, project_id, 'user', message]
    );

    // Fetch existing context
    const currentStates = await all(
      `SELECT * FROM project_states WHERE project_id = ? ORDER BY created_at ASC`,
      [project_id]
    );

    const linkedAssets = await all(
      `SELECT a.* FROM global_assets a
       JOIN project_asset_links l ON a.asset_id = l.asset_id
       WHERE l.project_id = ?`,
      [project_id]
    );

    const parsedAssets = linkedAssets.map(a => ({
      name: a.name,
      type: a.type,
      rules: JSON.parse(a.mutability_rules || '{}')
    }));

    const chatHistory = await all(
      `SELECT sender, content FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC`,
      [project_id]
    );

    const ai = getGeminiClient();
    let assistantReply = "";
    let extractedStates = [];

    if (ai) {
      try {
        const systemPrompt = `
You are PlanSmith AI — an Active Project Implementation Interviewer.
Your goal is to guide the user through scoping and building their implementation plan for a ${project.project_type.toUpperCase()} project.

Project Overview:
- Title: ${project.title}
- Type: ${project.project_type}
- Description: ${project.description || 'Not provided yet'}
- GitHub Repo: ${project.github_repo || 'None'}

Global Source of Truth Vault Assets & Governance Rules linked to this project:
${JSON.stringify(parsedAssets, null, 2)}

Current Decision Board State:
- Locked In: ${JSON.stringify(currentStates.filter(s => s.bucket === 'locked').map(s => s.content))}
- Parking Lot: ${JSON.stringify(currentStates.filter(s => s.bucket === 'parking_lot').map(s => s.content))}
- Discarded: ${JSON.stringify(currentStates.filter(s => s.bucket === 'discarded').map(s => s.content))}

INTERVIEWER PROTOCOL:
1. Provide a direct, encouraging response to the user's latest statement.
2. Ask 1-2 sharp, targeted probing questions to narrow down technical stack, dimensions/materials (if physical), architecture, or milestone phases.
3. Keep answers concise, highly structured, and pragmatic.
4. AUTOMATIC STATE EXTRACTION: Identify any NEW decisions, tech choices, or constraints mentioned by the user or agreed upon in conversation. Categorize into:
   - "locked": Firm technical decisions, stack choices, dimension specs, core architecture.
   - "parking_lot": Future features, optional ideas, non-essential enhancements.
   - "discarded": Explicitly rejected tools, approaches, or out-of-scope items.

Return strictly JSON matching this schema:
{
  "reply": "Your conversational interviewer response to the user (markdown supported)",
  "extracted_states": [
    {
      "bucket": "locked|parking_lot|discarded",
      "content": "Specific actionable item description",
      "category": "architecture|tech_stack|material|dimension|feature|constraint",
      "milestone_phase": 1
    }
  ]
}
`;

        // Format recent chat messages
        const promptContext = chatHistory.slice(-10).map(m => `${m.sender.toUpperCase()}: ${m.content}`).join('\n');

        const fullPrompt = `${systemPrompt}\n\nRecent Interview Transcript:\n${promptContext}\n\nUser Input: ${message}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: fullPrompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const parsed = JSON.parse(response.text);
        assistantReply = parsed.reply || "Thank you. Let's continue structuring your project requirements.";
        extractedStates = parsed.extracted_states || [];
      } catch (geminiErr) {
        console.warn('[AI Interviewer] Gemini API error:', geminiErr.message);
        assistantReply = `I've noted that: "${message}". (Note: GEMINI_API_KEY environment variable is missing or rate-limited, operating in local manual mode).`;
      }
    } else {
      // Manual fallback reply if no API key is provided
      assistantReply = `Recorded: "${message}". What is the next key architectural decision or requirement for **${project.title}**?`;
      
      // Heuristic extraction for common keywords
      const lower = message.toLowerCase();
      if (lower.includes('use ') || lower.includes('stack') || lower.includes('must') || lower.includes('require')) {
        extractedStates.push({
          bucket: 'locked',
          content: message.trim(),
          category: 'architecture',
          milestone_phase: 1
        });
      } else if (lower.includes('maybe') || lower.includes('later') || lower.includes('future') || lower.includes('parking')) {
        extractedStates.push({
          bucket: 'parking_lot',
          content: message.trim(),
          category: 'feature',
          milestone_phase: 2
        });
      } else if (lower.includes('no ') || lower.includes('skip') || lower.includes('reject') || lower.includes('avoid')) {
        extractedStates.push({
          bucket: 'discarded',
          content: message.trim(),
          category: 'constraint',
          milestone_phase: 1
        });
      }
    }

    // Save assistant reply to chat history
    const asstMsgId = `msg_${crypto.randomBytes(6).toString('hex')}`;
    await run(
      `INSERT INTO chat_messages (message_id, project_id, sender, content) VALUES (?, ?, ?, ?)`,
      [asstMsgId, project_id, 'assistant', assistantReply]
    );

    // Save automatically extracted state items into project_states
    const savedStates = [];
    for (const item of extractedStates) {
      const state_id = `st_${crypto.randomBytes(8).toString('hex')}`;
      await run(
        `INSERT INTO project_states (state_id, project_id, bucket, content, category, milestone_phase)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          state_id,
          project_id,
          item.bucket || 'locked',
          item.content,
          item.category || 'general',
          item.milestone_phase || 1
        ]
      );
      const inserted = await get(`SELECT * FROM project_states WHERE state_id = ?`, [state_id]);
      savedStates.push(inserted);
    }

    // Return full updated state list
    const allStates = await all(
      `SELECT * FROM project_states WHERE project_id = ? ORDER BY milestone_phase ASC, created_at ASC`,
      [project_id]
    );

    res.json({
      success: true,
      assistant_reply: assistantReply,
      new_extracted_states: savedStates,
      all_states: allStates
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST clear chat history for project
router.post('/clear', async (req, res) => {
  try {
    const { project_id } = req.body;
    await run(`DELETE FROM chat_messages WHERE project_id = ?`, [project_id]);
    res.json({ success: true, message: 'Chat transcript cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
