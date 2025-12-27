import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ENV } from './types';
import { authMiddleware } from './middleware/auth';
import {
  detectPII,
  redactPII,
  redactSensitiveData,
} from './utils/pii-detection';
import {
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  getPatterns,
  addPattern,
  deletePattern,
  addDetection,
  addDetectionsBatch,
  getDetectionsByDateRange,
  addAuditLog,
  getAuditLogsByDateRange,
} from './utils/storage';

const app = new Hono<{
  Bindings: ENV;
  Variables: { userId: string; user: any };
}>();

// CORS middleware
app.use('/*', cors());

// Health check (no auth required)
app.get('/v1/health', c => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Paste Proof Backend is running',
  });
});

// Auth middleware for all routes
app.use('/*', authMiddleware);

// Whitelist endpoints
app.get('/v1/whitelist', async c => {
  try {
    const whitelist = await getWhitelist(c.env);
    return c.json({ whitelist });
  } catch (error) {
    console.error('Error fetching whitelist:', error);
    return c.json({ error: 'Failed to fetch whitelist' }, 500);
  }
});

app.post('/v1/whitelist', async c => {
  try {
    const body = await c.req.json();
    const { domain } = body;

    if (!domain || typeof domain !== 'string') {
      return c.json({ error: 'Domain is required' }, 400);
    }

    if (domain.length > 253) {
      return c.json({ error: 'Domain is too long (max 253 characters)' }, 400);
    }

    const normalizedDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();

    if (normalizedDomain.length === 0) {
      return c.json({ error: 'Invalid domain format' }, 400);
    }

    const domainRegex =
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
    if (!domainRegex.test(normalizedDomain)) {
      return c.json({ error: 'Invalid domain format' }, 400);
    }

    // Check if already exists
    const existing = await isWhitelisted(c.env, normalizedDomain);
    if (existing) {
      return c.json({ error: 'Domain already exists in whitelist' }, 409);
    }

    const entry = await addToWhitelist(c.env, normalizedDomain);
    return c.json({ success: true, whitelist: entry }, 201);
  } catch (error) {
    console.error('Error adding to whitelist:', error);
    return c.json({ error: 'Failed to add to whitelist' }, 500);
  }
});

app.delete('/v1/whitelist/:whitelistId', async c => {
  try {
    const whitelistId = c.req.param('whitelistId');
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(whitelistId)) {
      return c.json({ error: 'Invalid whitelist ID format' }, 400);
    }

    const removed = await removeFromWhitelist(c.env, whitelistId);
    if (!removed) {
      return c.json({ error: 'Whitelist entry not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing from whitelist:', error);
    return c.json({ error: 'Failed to remove from whitelist' }, 500);
  }
});

app.post('/v1/whitelist/check', async c => {
  try {
    const body = await c.req.json();
    const { domain } = body;

    if (!domain || typeof domain !== 'string') {
      return c.json({ error: 'Domain is required' }, 400);
    }

    if (domain.length > 253) {
      return c.json({ error: 'Domain is too long (max 253 characters)' }, 400);
    }

    const normalizedDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();

    if (normalizedDomain.length === 0) {
      return c.json({ error: 'Invalid domain format' }, 400);
    }

    const whitelisted = await isWhitelisted(c.env, normalizedDomain);
    return c.json({ whitelisted });
  } catch (error) {
    console.error('Error checking whitelist:', error);
    return c.json({ error: 'Failed to check whitelist' }, 500);
  }
});

// Custom patterns endpoints
app.get('/v1/patterns', async c => {
  try {
    const patterns = await getPatterns(c.env);
    return c.json({ patterns });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    return c.json({ error: 'Failed to fetch patterns' }, 500);
  }
});

app.post('/v1/patterns', async c => {
  try {
    const body = await c.req.json();
    const { name, pattern, pattern_type, description } = body;

    if (!name || !pattern || !pattern_type) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Validate regex
    try {
      new RegExp(pattern);
    } catch (e) {
      return c.json({ error: 'Invalid regex pattern' }, 400);
    }

    const newPattern = await addPattern(c.env, {
      name,
      pattern,
      pattern_type,
      description: description || undefined,
    });

    return c.json({ success: true, pattern: newPattern }, 201);
  } catch (error) {
    console.error('Error creating pattern:', error);
    return c.json({ error: 'Failed to create pattern' }, 500);
  }
});

app.delete('/v1/patterns/:patternId', async c => {
  try {
    const patternId = c.req.param('patternId');
    const removed = await deletePattern(c.env, patternId);
    if (!removed) {
      return c.json({ error: 'Pattern not found' }, 404);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting pattern:', error);
    return c.json({ error: 'Failed to delete pattern' }, 500);
  }
});

// Detections endpoints
app.post('/v1/detections', async c => {
  try {
    const body = await c.req.json();
    const { type, domain, action, metadata } = body;

    if (!type || !domain) {
      return c.json({ error: 'Missing required fields: type, domain' }, 400);
    }

    const detection = await addDetection(c.env, {
      type,
      domain,
      action: action || 'detected',
      metadata: metadata || {},
    });

    return c.json({ success: true, detection });
  } catch (error) {
    console.error('Error logging detection:', error);
    return c.json({ error: 'Failed to log detection' }, 500);
  }
});

app.post('/v1/detections/batch', async c => {
  try {
    const body = await c.req.json();
    const { detections } = body;

    if (!Array.isArray(detections) || detections.length === 0) {
      return c.json({ error: 'Invalid detections array' }, 400);
    }

    const detectionsToInsert = detections.map(d => ({
      type: d.type,
      domain: d.domain,
      action: d.action || 'detected',
      metadata: d.metadata || {},
    }));

    await addDetectionsBatch(c.env, detectionsToInsert);
    return c.json({ success: true, count: detectionsToInsert.length });
  } catch (error) {
    console.error('Error batch logging detections:', error);
    return c.json({ error: 'Failed to log detections' }, 500);
  }
});

// Audit logs endpoints
app.post('/v1/log', async c => {
  try {
    const body = await c.req.json();
    await addAuditLog(c.env, {
      event_type: body.event_type,
      domain: body.domain,
      pii_type: body.pii_type,
      was_anonymized: body.was_anonymized || false,
      metadata: body.metadata || {},
    });
    return c.json({ success: true, logged: true });
  } catch (error) {
    console.error('Error logging audit:', error);
    return c.json({ success: false, logged: false }, 200);
  }
});

app.get('/v1/logs', async c => {
  try {
    const startDate =
      c.req.query('start') ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('end') || new Date().toISOString();
    const limit = parseInt(c.req.query('limit') || '100');
    const eventType = c.req.query('type');

    const logs = await getAuditLogsByDateRange(
      c.env,
      startDate,
      endDate,
      eventType,
      limit
    );
    return c.json({ logs });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return c.json({ error: 'Failed to fetch logs' }, 500);
  }
});

// Analytics endpoint
app.get('/v1/analytics', async c => {
  try {
    const range = c.req.query('range') || '30d';
    const daysAgo = range === '7d' ? 7 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const detections = await getDetectionsByDateRange(
      c.env,
      startDate.toISOString(),
      new Date().toISOString()
    );

    const totalDetections = detections.length;

    // Detections by type
    const typeMap = new Map<string, number>();
    detections.forEach(d => {
      const count = typeMap.get(d.type) || 0;
      typeMap.set(d.type, count + 1);
    });

    const detectionsByType = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Top domains
    const domainMap = new Map<string, number>();
    detections.forEach(d => {
      const count = domainMap.get(d.domain) || 0;
      domainMap.set(d.domain, count + 1);
    });

    const topDomains = Array.from(domainMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    // Recent detections (last 10)
    const recentDetections = detections.slice(0, 10).map(d => ({
      id: d.id,
      type: d.type,
      domain: d.domain,
      timestamp: new Date(d.timestamp).getTime(),
      action: d.action || 'detected',
    }));

    return c.json({
      totalDetections,
      detectionsByType,
      topDomains,
      recentDetections,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Stats endpoint (alias for analytics for compatibility)
app.get('/v1/stats', async c => {
  try {
    const days = parseInt(c.req.query('days') || '7');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const detections = await getDetectionsByDateRange(
      c.env,
      startDate.toISOString(),
      new Date().toISOString()
    );

    const logs = await getAuditLogsByDateRange(
      c.env,
      startDate.toISOString(),
      new Date().toISOString()
    );

    const totalDetections = detections.length;
    const totalAnonymizations = logs.filter(l => l.was_anonymized).length;
    const totalAiScans = detections.filter(d =>
      d.type.startsWith('AI_SCAN_')
    ).length;

    // Most common PII
    const typeMap = new Map<string, number>();
    detections.forEach(d => {
      const count = typeMap.get(d.type) || 0;
      typeMap.set(d.type, count + 1);
    });

    const mostCommonPii = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Riskiest domains
    const domainMap = new Map<string, number>();
    detections.forEach(d => {
      const count = domainMap.get(d.domain) || 0;
      domainMap.set(d.domain, count + 1);
    });

    const riskiestDomains = Array.from(domainMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Detections by day
    const dayMap = new Map<string, number>();
    detections.forEach(d => {
      const day = new Date(d.timestamp).toISOString().split('T')[0];
      const count = dayMap.get(day) || 0;
      dayMap.set(day, count + 1);
    });

    const detectionsByDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return c.json({
      stats: {
        total_detections: totalDetections,
        total_anonymizations: totalAnonymizations,
        total_ai_scans: totalAiScans,
        most_common_pii: mostCommonPii,
        riskiest_domains: riskiestDomains,
        detections_by_day: detectionsByDay,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// User info endpoint
app.get('/v1/user', async c => {
  const user = c.get('user');
  return c.json({
    id: user.id,
    email: user.email,
    subscription_tier: user.subscription_tier,
    subscription_status: user.subscription_status,
  });
});

// AI-Powered Context-Aware PII Detection Endpoint
app.post('/v1/analyze-context', async c => {
  const user = c.get('user');

  try {
    const body = await c.req.json<{
      text: string;
      context?: string;
      fieldType?:
        | 'name'
        | 'email'
        | 'address'
        | 'phone'
        | 'freeform'
        | 'unknown';
    }>();

    if (!body.text || body.text.length === 0) {
      return c.json({ error: 'Text is required' }, 400);
    }

    if (body.text.length > 5000) {
      return c.json(
        {
          error: 'Text too long',
          message: 'Maximum 5000 characters for AI analysis',
          hint: 'Break into smaller chunks',
        },
        400
      );
    }

    const validFieldTypes = [
      'name',
      'email',
      'address',
      'phone',
      'freeform',
      'unknown',
    ];
    if (body.fieldType && !validFieldTypes.includes(body.fieldType)) {
      return c.json(
        {
          error:
            'Invalid fieldType. Must be one of: name, email, address, phone, freeform, unknown',
        },
        400
      );
    }

    // Get custom patterns for detection
    const customPatterns = await getPatterns(c.env);
    const patternOptions = customPatterns.map(p => ({
      name: p.name,
      pattern: p.pattern,
      pattern_type: p.pattern_type,
    }));

    // Build context-aware prompt
    const contextInfo = body.context
      ? `Context: This text is being entered into a "${body.context}" field.`
      : '';
    const fieldTypeInfo =
      body.fieldType &&
      body.fieldType !== 'unknown' &&
      body.fieldType !== 'freeform'
        ? `Field Type: ${body.fieldType.toUpperCase()} field.`
        : '';

    // Call Cloudflare AI
    const aiResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are a privacy-focused data classifier. Analyze text for personally identifiable information (PII) and sensitive data.

Return a JSON object with this exact structure:
{
	"hasPII": boolean,
	"confidence": number (0-100),
	"detections": [
		{
			"type": string (use these exact types: "FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL_ADDRESS", "PHONE_NUMBER", "ADDRESS", "STREET_ADDRESS", "PASSWORD", "API_KEY", "SSN", "CREDIT_CARD", "INTERNAL_ID", "BIRTHDATE", "MEDICAL_INFO"),
			"value": string (the actual detected text),
			"confidence": number (0-100),
			"reason": string (why this was flagged)
		}
	],
	"risk_level": string ("low", "medium", "high", "critical")
}

Rules for context-aware detection:
- If context suggests a name field (e.g., "name", "full name", "recipient", "sender"), a single name is EXPECTED and should NOT be flagged unless it appears alongside other unexpected PII
- If context suggests an address field, an address is EXPECTED and should NOT be flagged
- If context suggests an email field, an email address is EXPECTED and should NOT be flagged
- If context suggests a phone field, a phone number is EXPECTED and should NOT be flagged
- Only flag PII that appears UNEXPECTED for the given context
- Always flag: passwords, API keys, SSNs, credit cards, medical info, regardless of context
- For name fields: Only flag if multiple names appear (suggesting a list) or if names appear with other PII
- Be smart about context - false positives reduce user trust
- If no unexpected PII detected, return hasPII: false with empty detections array

Detection rules:
- Detect PII even if written in natural language (e.g., "five five five one two three four" is a phone number)
- Flag passwords, credentials, API keys, tokens
- Detect addresses, full names, birthdates
- Flag internal project names, codenames, confidential info
- Use high confidence thresholds for common field types (names in name fields, emails in email fields)`,
        },
        {
          role: 'user',
          content: `Analyze this text for PII and sensitive information.

${contextInfo}
${fieldTypeInfo}

Rules for context-aware detection:
${body.fieldType === 'name' ? '- This is a NAME field. A single name is EXPECTED. Only flag if multiple names appear or if other unexpected PII is present.' : ''}
${body.fieldType === 'email' ? '- This is an EMAIL field. An email address is EXPECTED. Only flag if other unexpected PII is present.' : ''}
${body.fieldType === 'address' ? '- This is an ADDRESS field. An address is EXPECTED. Only flag if other unexpected PII is present.' : ''}
${body.fieldType === 'phone' ? '- This is a PHONE field. A phone number is EXPECTED. Only flag if other unexpected PII is present.' : ''}

Text to analyze:

"${body.text}"`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    // Parse AI response
    let analysis;
    try {
      const responseText = aiResponse.response || JSON.stringify(aiResponse);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return c.json({ error: 'AI response parsing failed' }, 500);
    }

    // Post-process: Filter out expected detections based on field type
    if (
      body.fieldType &&
      analysis.detections &&
      Array.isArray(analysis.detections)
    ) {
      const expectedTypes: Record<string, string[]> = {
        name: ['FULL_NAME', 'FIRST_NAME', 'LAST_NAME'],
        email: ['EMAIL_ADDRESS'],
        address: ['ADDRESS', 'STREET_ADDRESS'],
        phone: ['PHONE_NUMBER'],
      };

      const expected = expectedTypes[body.fieldType] || [];

      if (expected.length > 0 && analysis.detections.length > 0) {
        const unexpectedDetections = analysis.detections.filter(
          (d: any) => !expected.includes(d.type)
        );

        if (unexpectedDetections.length > 0) {
          analysis.detections = unexpectedDetections;
        } else {
          analysis.detections = [];
          analysis.hasPII = false;
          analysis.confidence = 0;
          analysis.risk_level = 'low';
        }
      }
    }

    // Also run pattern-based detection and merge results
    const patternDetections = await detectPII(body.text, c.env, {
      customPatterns: patternOptions,
      useAI: false, // Already using AI above
    });

    // Merge pattern detections with AI detections (avoid duplicates)
    for (const patternDet of patternDetections) {
      const isDuplicate = analysis.detections.some(
        (d: any) =>
          d.type === patternDet.type &&
          d.value.toLowerCase() === patternDet.value.toLowerCase()
      );
      if (!isDuplicate) {
        analysis.detections.push({
          type: patternDet.type,
          value: patternDet.value,
          confidence: patternDet.confidence,
          reason: patternDet.reason || 'Pattern match',
        });
      }
    }

    // Update hasPII if we have any detections
    if (analysis.detections.length > 0) {
      analysis.hasPII = true;
      analysis.confidence = Math.max(
        ...analysis.detections.map((d: any) => d.confidence)
      );
    }

    // Log the AI scan event
    try {
      await addDetection(c.env, {
        type: analysis.hasPII ? 'AI_SCAN_PII' : 'AI_SCAN_CLEAN',
        domain: body.context || 'unknown',
        action: 'detected',
        metadata: {
          text_length: body.text.length,
          detections_count: analysis.detections?.length || 0,
          risk_level: analysis.risk_level,
          model: 'llama-3-8b-instruct',
          has_pii: analysis.hasPII,
        },
      });
    } catch (logErr) {
      console.error('Error logging AI scan:', logErr);
    }

    return c.json({
      success: true,
      analysis: {
        hasPII: analysis.hasPII || false,
        confidence: analysis.confidence || 0,
        detections: analysis.detections || [],
        risk_level: analysis.risk_level || 'low',
      },
      metadata: {
        text_length: body.text.length,
        model: 'llama-3-8b-instruct',
        provider: 'cloudflare-ai',
      },
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    return c.json({ error: 'AI analysis failed' }, 500);
  }
});

export default app;
