import { useEffect, useState } from 'react';
import type { GameState, Move } from '../types/chess';
import { getAllLegalMoves } from '../game/checkRules';
import { pikafishMoveToPosition, requestPikafishMove, type PikafishSearchResult } from '../ai/pikafishBridge';
import { buildAiPanelDebugReport, getAiPanelRecommendations } from '../ai/aiPanelRecommendations';
import { SIMPLE_AI_NOTE } from '../ai/simpleAiText';
import { getEndgameFeedback } from '../game/endgameFeedback';
import { moveText } from '../game/moveNotation';

type Props = {
  state: GameState;
  version?: number;
  modeName?: string;
  analysisMoves?: Move[];
};

export function AiPanel({ state, version: _version, modeName, analysisMoves }: Props) {
  const [copied, setCopied] = useState(false);
  const [pikafish, setPikafish] = useState<PikafishSearchResult | null>(null);
  const [engineError, setEngineError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    setPikafish(null);
    setEngineError('');
    requestPikafishMove(state, { movetime: 500, signal: abortController.signal })
      .then(result => {
        if (!cancelled) setPikafish(result);
      })
      .catch(error => {
        if (cancelled || abortController.signal.aborted) return;
        setEngineError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [state, _version]);

  const endgame = getEndgameFeedback(state.status);
  if (endgame) {
    return (
      <div className="panel aiEndgamePanel">
        <h3>{endgame.title}</h3>
        <p>{endgame.body}</p>
        <p>{endgame.winnerText}</p>
      </div>
    );
  }

  const { fair: r, oracle, differs } = getAiPanelRecommendations(state);

  function copyReport() {
    const text = buildAiPanelDebugReport({
      modeName: modeName ?? 'AI panel',
      state,
      analysisMoves,
      fair: r,
      oracle,
      differs,
    });
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      /* clipboard unavailable -- silently ignore */
    });
  }

  return (
    <div className="panel aiPanel">
      <h3>Fair AI 推薦</h3>
      <p className="aiDisclaimer">{SIMPLE_AI_NOTE}</p>
      {r.move ? (
        <>
          <p>{moveText(r.move, { showHiddenCaptureRealType: false })}</p>
          <p>分數：{r.score}</p>
          <p>{r.reason}</p>
        </>
      ) : (
        <p>沒有合法走法</p>
      )}

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <strong>Pikafish UCI 推薦</strong>
        {(() => {
          const converted = pikafish ? pikafishMoveToPosition(pikafish.bestMove) : null;
          const engineMove = converted
            ? getAllLegalMoves(state.board, state.turn).find(move =>
                move.from.row === converted.from.row &&
                move.from.col === converted.from.col &&
                move.to.row === converted.to.row &&
                move.to.col === converted.to.col)
            : null;

          if (engineError) return <p>Pikafish 不可用：{engineError}</p>;
          if (!pikafish) return <p>Pikafish 思考中…</p>;
          if (!engineMove) return <p>Pikafish 回傳的著法不在當前合法著法中。</p>;

          return (
            <>
              <p>{moveText(engineMove, { showHiddenCaptureRealType: false })}</p>
              <p>
                {pikafish.mateIn != null
                  ? `分數：mate ${Math.abs(pikafish.mateIn)}`
                  : pikafish.score != null
                    ? `分數：${(pikafish.score / 100).toFixed(2)}`
                    : '分數：未知'}
              </p>
              <p>{[
                pikafish.depth != null ? `depth ${pikafish.depth}` : null,
                pikafish.nodes != null ? `${pikafish.nodes.toLocaleString()} nodes` : null,
              ].filter(Boolean).join(' · ')}</p>
            </>
          );
        })()}
      </div>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <strong>天眼 Debug 推薦</strong>
        {oracle.move ? (
          <>
            <p>{moveText(oracle.move)}</p>
            <p>分數：{oracle.score}</p>
            <p>{oracle.reason}</p>
          </>
        ) : (
          <p>沒有合法走法</p>
        )}
        {differs && (
          <p className="aiDisclaimer">
            正式 AI 不看未翻 realType；天眼 Debug 可看完整資訊，因此推薦可能不同。
          </p>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={copyReport} style={{ fontSize: 13 }}>
          複製 AI 測試報告
        </button>
        {copied && (
          <span style={{ marginLeft: 10, color: '#86efac', fontSize: 13 }}>
            已複製 AI 測試報告
          </span>
        )}
      </div>
    </div>
  );
}
