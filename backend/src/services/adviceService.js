const { analyze } = require('./analyzeService');
const { ApiError } = require('./errors');

/**
 * Build AI advice from trusted analyze() results.
 * Uses Gemini when GEMINI_API_KEY is set; otherwise deterministic fallback.
 */
async function getAdvice(body) {
  const {
    scenarioId,
    tariffProfileId,
    question,
    selectedFindingIds,
  } = body || {};

  if (!scenarioId || typeof scenarioId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'scenarioId is required');
  }
  if (!tariffProfileId || typeof tariffProfileId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'tariffProfileId is required');
  }

  const analysis = analyze({ scenarioId, tariffProfileId });
  const selectedIds = Array.isArray(selectedFindingIds)
    ? selectedFindingIds
    : [];

  let findings = analysis.findings;
  if (selectedIds.length > 0) {
    findings = analysis.findings.filter((f) => selectedIds.includes(f.id));
  }

  const disclaimer =
    'Simulated-data analysis; estimates depend on configured tariff eligibility and assumptions.';

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim()) {
    try {
      const llmInsights = await callGemini({
        apiKey: apiKey.trim(),
        question: question || 'What should I try changing?',
        analysis,
        findings,
      });
      return {
        provider: 'gemini',
        insights: llmInsights,
        disclaimer,
      };
    } catch (err) {
      // Fall through to deterministic fallback
      console.warn('[advice] Gemini unavailable, using fallback:', err.message);
    }
  }

  return {
    provider: 'fallback',
    insights: buildFallbackInsights(findings, analysis, question),
    disclaimer,
  };
}

function buildFallbackInsights(findings, analysis, question) {
  const insights = [];

  if (findings.length === 0) {
    insights.push({
      title: 'No selected unusual-usage findings',
      findingId: null,
      explanation:
        'The statistical detector did not flag the selected intervals, or none were selected. ' +
        `Dataset total is ${analysis.summary.totalKwh} kWh with peak average hour ${analysis.summary.peakHour}. ` +
        (question
          ? `Regarding “${question}”: review peak-period share and try shifting flexible load in /api/optimize.`
          : 'Review peak-period share and try shifting flexible load via the optimizer.'),
      suggestedAction:
        'Pick a peak-hour interval with shiftable_load_kwh > 0 and compare calculated charges after a shift.',
      estimatedSavings: null,
    });
    return insights;
  }

  for (const f of findings) {
    insights.push({
      title: f.title,
      findingId: f.id,
      explanation:
        `${f.explanation} Observed ${f.observedKwh} kWh vs hour baseline ${f.baselineKwh} kWh` +
        (f.deviationPercent != null
          ? ` (${f.deviationPercent}% above baseline).`
          : '.') +
        ' This uses simulated meter data and configured tariff rules only — not live KSEB readings.',
      suggestedAction:
        'If that interval includes flexible load, test shifting eligible kWh to an off-peak hour and compare the calculated charge. Do not invent savings beyond the optimizer result.',
      estimatedSavings: null,
    });
  }

  const peakPeriod = analysis.periodTotals.find((p) => p.periodId === 'peak');
  if (peakPeriod && peakPeriod.sharePercent >= 25) {
    insights.push({
      title: 'Peak-period share is material',
      findingId: null,
      explanation:
        `About ${peakPeriod.sharePercent}% of simulated consumption falls in the peak tariff window. ` +
        'Tariff profile is illustrative unless marked verified; treat any charge comparison as demo-only.',
      suggestedAction:
        'Use the optimizer on a source row with available shiftable load during peak hours.',
      estimatedSavings: null,
    });
  }

  return insights;
}

async function callGemini({ apiKey, question, analysis, findings }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const trustedPayload = {
    question,
    summary: analysis.summary,
    periodTotals: analysis.periodTotals.map((p) => ({
      periodId: p.periodId,
      label: p.label,
      kwh: p.kwh,
      sharePercent: p.sharePercent,
      // Do not send illustrative invented official rates; charges may be null
      estimatedEnergyCharge: p.estimatedEnergyCharge,
    })),
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      timestamp: f.timestamp,
      observedKwh: f.observedKwh,
      baselineKwh: f.baselineKwh,
      deviationPercent: f.deviationPercent,
      explanation: f.explanation,
    })),
    assumptions: analysis.assumptions,
    rules: [
      'Data is simulated, not live KSEB meter data.',
      'Do not invent tariff rates, kWh values, or savings figures.',
      'estimatedSavings in your output must be null unless a backend number is provided (none are).',
      'Explain findings and suggest trying the optimizer for flexible load.',
    ],
  };

  const prompt =
    'You are Cliff Guard advisor. Explain backend analysis only. ' +
    'Return STRICT JSON: {"insights":[{"title":string,"findingId":string|null,"explanation":string,"suggestedAction":string,"estimatedSavings":null}]}.\n\n' +
    JSON.stringify(trustedPayload);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.insights)) {
    throw new Error('Gemini response missing insights array');
  }

  return parsed.insights.map((ins) => ({
    title: String(ins.title || 'Insight'),
    findingId: ins.findingId ?? null,
    explanation: String(ins.explanation || ''),
    suggestedAction: String(ins.suggestedAction || ''),
    // Never allow the model to invent savings numbers
    estimatedSavings: null,
  }));
}

module.exports = { getAdvice, buildFallbackInsights };
