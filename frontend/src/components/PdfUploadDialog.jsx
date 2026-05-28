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

  function pickPdf(e)  { setPdf(e.target.files?.[0] || null);  setError(null); setResult(null); }
  function pickXlsx(e) { setXlsx(e.target.files?.[0] || null); setError(null); setResult(null); }

  async function handleSubmit() {
    if (!pdf) return;
    if (!selectedTeamId) { setError('Не выбрана команда. Выберите в шапке.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await uploadPdf(pdf, selectedTeamId, tournament, xlsx);
      setResult(res);
      onSuccess?.(res?.matchId);
    } catch (e) {
      setError(e.message);
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

          {busy && <div className="upload-dialog__progress">Парсинг… до минуты.</div>}
          {error && <div className="upload-dialog__error">Ошибка: {error}</div>}
          {result && (
            <div className="upload-dialog__success">
              Матч {result.matchId} разобран — {result.playersProcessed} игроков{result.excelColumns ? `, ${result.excelColumns} колонок stats` : ''}. Перенаправляем…
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
