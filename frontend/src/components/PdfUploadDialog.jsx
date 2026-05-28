import { useRef, useState } from 'react';
import { uploadPdf } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import './PdfUploadDialog.css';

export default function PdfUploadDialog({ onClose, onSuccess }) {
  const pdfRef = useRef(null);
  const xlsxRef = useRef(null);
  const { selectedTeamId, selectedTeam } = useTeam();
  const [pdf, setPdf] = useState(null);
  const [xlsx, setXlsx] = useState(null);
  const [tournament, setTournament] = useState('league');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const MAX_BYTES = 50 * 1024 * 1024;  // 50 MB лимит сервера

  function validateFile(file, kind) {
    if (!file) return null;
    if (file.size > MAX_BYTES) {
      return `${kind} больше 50 МБ — backend не примет. Размер: ${(file.size / 1024 / 1024).toFixed(1)} МБ.`;
    }
    return null;
  }
  function pickPdf(e)  {
    const f = e.target.files?.[0] || null;
    const err = validateFile(f, 'PDF');
    if (err) { setError(err); setPdf(null); return; }
    setPdf(f);  setError(null); setResult(null);
  }
  function pickXlsx(e) {
    const f = e.target.files?.[0] || null;
    const err = validateFile(f, 'Excel');
    if (err) { setError(err); setXlsx(null); return; }
    setXlsx(f); setError(null); setResult(null);
  }

  function sanitize(msg) {
    const s = String(msg || '');
    if (s.length > 280) return s.slice(0, 280) + '…';
    if (/ECONN|ETIMEDOUT|fetch failed|NetworkError/i.test(s)) {
      return 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.';
    }
    if (/timeout|превышено время/i.test(s)) {
      return 'Превышено время ожидания (парсинг большого PDF может занять до 3 минут). Попробуйте ещё раз.';
    }
    return s;
  }

  async function handleSubmit() {
    if (!pdf) return;
    if (!selectedTeamId) { setError('Не выбрана команда. Выберите в шапке.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await uploadPdf(pdf, selectedTeamId, tournament, xlsx);
      setResult(res);
      // Если backend не вернул matchId — всё равно даём вызвать onSuccess (родитель
      // перенаправит на список матчей, например).
      onSuccess?.(res?.matchId);
    } catch (e) {
      setError(sanitize(e?.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-dialog__backdrop" onClick={onClose}>
      <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="upload-dialog__head">
          <span>Загрузка отчёта Sportvisor</span>
          <button className="upload-dialog__x" onClick={onClose}>✕</button>
        </div>
        <div className="upload-dialog__body">
          <p className="upload-dialog__hint">
            <b>PDF</b> — обязательный отчёт SportVisor (рейтинги, формация, командные итоги).
            <br />
            <b>Excel</b> — опционально, даёт детальные per-player stats (136 колонок: пасы 8 типов, удары, дриблинг, дистанции).
            <br />Если загружаешь оба — данные сливаются автоматически.
          </p>
          {selectedTeam && (
            <p className="upload-dialog__hint">
              Команда: <b>{selectedTeam.name}</b>{selectedTeam.ageGroup ? ` · ${selectedTeam.ageGroup}` : ''}
            </p>
          )}

          <div className="upload-dialog__tournament">
            <div className="upload-dialog__tournament-label">Турнир:</div>
            <div className="upload-dialog__tournament-buttons">
              {[{ id: 'league', label: 'Турнир' }, { id: 'cup', label: 'Кубок' }].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={'upload-dialog__tournament-btn' + (tournament === t.id ? ' upload-dialog__tournament-btn--active' : '')}
                  onClick={() => setTournament(t.id)}
                  disabled={busy}
                >{t.label}</button>
              ))}
            </div>
          </div>

          <button className="upload-dialog__pick" onClick={() => pdfRef.current?.click()} disabled={busy}>
            📄 {pdf ? pdf.name : 'Выбрать PDF…'}
          </button>
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf"
            style={{ display: 'none' }} onChange={pickPdf} />

          <button
            className="upload-dialog__pick"
            onClick={() => xlsxRef.current?.click()}
            disabled={busy}
            style={{ marginTop: 8, opacity: 0.85 }}
          >
            📊 {xlsx ? xlsx.name : 'Excel (опционально, .xlsx)…'}
          </button>
          <input ref={xlsxRef} type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }} onChange={pickXlsx} />

          {busy && (
            <div className="upload-dialog__progress">
              Парсинг отчёта — обычно 1-3 минуты. PDF большого матча может потребовать дольше.
              <span className="upload-dialog__progress-spinner" aria-hidden />
            </div>
          )}
          {error && <div className="upload-dialog__error">⚠️ {error}</div>}
          {result && (
            <div className="upload-dialog__success">
              ✓ Отчёт разобран — {result.playersProcessed ?? '?'} игроков
              {result.excelColumns ? `, ${result.excelColumns} колонок Excel` : ''}.
              {result.matchId ? ' Открываем матч…' : ' Открываем список матчей…'}
            </div>
          )}

          <div className="upload-dialog__actions">
            <button className="upload-dialog__cancel" onClick={onClose}>Закрыть</button>
            <button
              className="upload-dialog__submit"
              onClick={handleSubmit}
              disabled={!pdf || busy || !selectedTeamId}
            >
              {busy ? 'Парсинг…' : 'Загрузить и разобрать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
