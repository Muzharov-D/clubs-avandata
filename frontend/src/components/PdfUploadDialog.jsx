import { useRef, useState } from 'react';
import { uploadPdf } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import './PdfUploadDialog.css';

export default function PdfUploadDialog({ onClose, onSuccess }) {
  const inputRef = useRef(null);
  const { selectedTeamId, selectedTeam } = useTeam();
  const [file, setFile] = useState(null);
  const [tournament, setTournament] = useState('league');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function handlePick(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setError(null);
    setResult(null);
  }

  async function handleSubmit() {
    if (!file) return;
    if (!selectedTeamId) {
      setError('Не выбрана команда. Выберите команду в шапке и попробуйте снова.');
      return;
    }
    if (!tournament) {
      setError('Выберите турнир (Турнир или Кубок).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await uploadPdf(file, selectedTeamId, tournament);
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
          <span>Загрузка PDF Sportvisor</span>
          <button className="upload-dialog__x" onClick={onClose}>✕</button>
        </div>
        <div className="upload-dialog__body">
          <p className="upload-dialog__hint">
            Принимается PDF-отчёт Sportvisor (35 страниц). После загрузки парсер автоматически извлечёт данные матча, командные дашборды и индивидуальные карты.
          </p>
          {selectedTeam && (
            <p className="upload-dialog__hint">
              Команда: <b>{selectedTeam.name}</b>{selectedTeam.ageGroup ? ` · ${selectedTeam.ageGroup}` : ''}
            </p>
          )}

          <div className="upload-dialog__tournament">
            <div className="upload-dialog__tournament-label">Турнир:</div>
            <div className="upload-dialog__tournament-buttons">
              {[
                { id: 'league', label: 'Турнир' },
                { id: 'cup',    label: 'Кубок' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={'upload-dialog__tournament-btn' + (tournament === t.id ? ' upload-dialog__tournament-btn--active' : '')}
                  onClick={() => setTournament(t.id)}
                  disabled={busy}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="upload-dialog__pick"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {file ? file.name : 'Выбрать PDF…'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: 'none' }}
            onChange={handlePick}
          />

          {busy && <div className="upload-dialog__progress">Парсинг… это может занять до минуты.</div>}
          {error && <div className="upload-dialog__error">Ошибка: {error}</div>}
          {result && (
            <div className="upload-dialog__success">
              Матч {result.matchId} обработан. Перезагружаем страницу…
            </div>
          )}

          <div className="upload-dialog__actions">
            <button className="upload-dialog__cancel" onClick={onClose}>Закрыть</button>
            <button
              className="upload-dialog__submit"
              onClick={handleSubmit}
              disabled={!file || busy || !selectedTeamId}
            >
              {busy ? 'Парсинг…' : 'Загрузить и разобрать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
