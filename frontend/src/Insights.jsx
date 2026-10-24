import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { fmt, money, Loading, ErrorBox, Empty } from './ui.jsx';

export default function Insights({ scenarioId, tariffProfileId, findings }) {
  const [question, setQuestion] = useState('What should I try changing?');
  const [state, setState] = useState({ status: 'idle' });
  const seq = useRef(0);
  const ids = (findings || []).map((f) => f.id);

  const ask = useCallback(async (q) => {
    const id = ++seq.current;
    setState({ status: 'loading' });
    try {
      const data = await api.advice({ scenarioId, tariffProfileId, question: q, selectedFindingIds: ids });
      if (id === seq.current) setState({ status: 'done', data });
    } catch (err) { if (id === seq.current) setState({ status: 'error', error: err }); }
  }, [scenarioId, tariffProfileId, findings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ask(question); }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = state.data;
  const isFallback = d && /fallback/i.test(d.provider || '');

  return (
    <div>
      <div aria-live="polite">
        {state.status === 'loading' && <Loading label="Preparing your advice…" />}
        {state.status === 'error' && <ErrorBox title="We couldn’t get advice right now" error={state.error} onRetry={() => ask(question)} />}
        {d && (
          <>
            {isFallback && <p className="badge warn">Smart assistant unavailable, so this is our standard explanation.</p>}
            {d.insights?.length ? d.insights.map((i, n) => {
              const f = findings?.find((x) => x.id === i.findingId);
              return (
                <article className="insight" key={`${i.findingId}-${n}`}>
                  <h3>{i.title}</h3>
                  {f && <p className="muted small">At {f.timestamp?.slice(0, 16).replace('T', ' ')}: used {fmt(f.observedKwh)} units, usually about {fmt(f.baselineKwh)}.</p>}
                  <p><strong>What this means. </strong>{i.explanation}</p>
                  <p><strong>What you can try. </strong>{i.suggestedAction}</p>
                  {typeof i.estimatedSavings === 'number' && <p className="small">Possible saving: {money(i.estimatedSavings)}</p>}
                </article>
              );
            }) : <Empty>Nothing unusual to explain right now.</Empty>}
            {d.disclaimer && <p className="muted small">{d.disclaimer}</p>}
          </>
        )}
      </div>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <label className="grow">Ask a question
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} />
        </label>
        <button className="btn primary" disabled={state.status === 'loading' || !question.trim()}>Ask</button>
      </form>
    </div>
  );
}
