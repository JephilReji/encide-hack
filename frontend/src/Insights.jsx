import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { fmt, money, Loading, ErrorBox, Empty } from './ui.jsx';

const DEFAULT_Q = 'What should I try changing?';

export default function Insights({ scenarioId, tariffProfileId, findings }) {
  const [question, setQuestion] = useState(DEFAULT_Q);
  const [selected, setSelected] = useState([]);
  const [state, setState] = useState({ status: 'idle' });
  const seq = useRef(0);

  const ask = useCallback(async (q, ids) => {
    const id = ++seq.current;
    setState({ status: 'loading' });
    try {
      const data = await api.advice({ scenarioId, tariffProfileId, question: q, selectedFindingIds: ids });
      if (id === seq.current) setState({ status: 'done', data });
    } catch (err) { if (id === seq.current) setState({ status: 'error', error: err }); }
  }, [scenarioId, tariffProfileId]);

  useEffect(() => { // new analysis -> fresh advice for all detected findings
    const ids = (findings || []).map((f) => f.id);
    setSelected(ids);
    ask(question, ids);
  }, [findings, ask]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const d = state.data;
  const isFallback = d && /fallback/i.test(d.provider || '');

  return (
    <div>
      {findings?.length ? (
        <fieldset className="findings">
          <legend>Detected patterns <span className="muted small">(choose which to explain)</span></legend>
          {findings.map((f) => (
            <label key={f.id} className="finding">
              <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)} />
              <span><strong>{f.title}</strong><br />
                <span className="muted small">{f.timestamp?.slice(0, 16).replace('T', ' ')} · observed {fmt(f.observedKwh)} kWh vs baseline {fmt(f.baselineKwh)} kWh ({fmt(f.deviationPercent, 1)}% above)</span></span>
            </label>
          ))}
        </fieldset>
      ) : <Empty>No unusual patterns were detected in this dataset.</Empty>}

      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(question, selected); }}>
        <label className="grow">Ask the advisor
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} />
        </label>
        <button className="btn primary" disabled={state.status === 'loading' || !question.trim()}>Explain</button>
      </form>

      <div aria-live="polite">
        {state.status === 'loading' && <Loading label="Preparing explanation…" />}
        {state.status === 'error' && <ErrorBox title="The advisor could not respond" error={state.error} onRetry={() => ask(question, selected)} />}
        {d && (
          <>
            <p className={isFallback ? 'badge warn' : 'badge'}>{isFallback ? 'AI unavailable — showing the backend’s built-in explanation' : `Explained by ${d.provider}`}</p>
            {d.insights?.length ? d.insights.map((i, n) => (
              <article className="insight" key={`${i.findingId}-${n}`}>
                <h3>{i.title}</h3>
                <p><strong>Explanation. </strong>{i.explanation}</p>
                <p><strong>Suggested action. </strong>{i.suggestedAction}</p>
                {typeof i.estimatedSavings === 'number' && <p className="small">Estimated saving: {money(i.estimatedSavings)}</p>}
              </article>
            )) : <Empty>The advisor returned no insights for this selection.</Empty>}
            {d.disclaimer && <p className="muted small">{d.disclaimer}</p>}
          </>
        )}
      </div>
    </div>
  );
}
