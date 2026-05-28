import { useEffect, useRef, useState } from 'react';
import { uploadPdf } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import './PdfUploadDialog.css';

const MAX_BYTES = 50 * 1024 * 1024;  // 50 MB лимит сервера

export default function PdfUploadDialog({ onClose, onSuccess }) {
  const pdfRef = useRef(null);
  const xlsxRef = useRef(null);
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);
  const { selectedTeamId, selectedTeam } = useTeam();
  const [pdf, setPdf] = useState(null);
  const [xlsx, setXlsx] = useState(null);
  const [tournament, setTournament] = useState('league');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(null);  // 'pdf' | 'xlsx' | null

  // ESC закрывает модал; focus автоматически на первой кнопке
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onClose?.();
    }
    document.addEventListener('keydown', onKey);
    // Лочим scroll body пока модал открыт
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstFocusRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onClose]);

  function validateFile(file, kind, exts) {
    if (!file) return null;
    if (file.size > MAX_BYTES) {
      return `${kind} больше 50 МБ — backend не примет. Размер: ${(file.size / 1024 / 1024).toFixed(1)} МБ.`;
    }
    if (exts && !exts.some((e) => file.name.toLowerCase().endsWith(e))) {
      return `${kind}: неверный формат. Допустимые: ${exts.join(', ')}.`;
    }
    return null;
  }
  function pickPdf(e)  { setFromInput(e.target.files?.[0] || null, 'pdf'); }
  function pickXlsx(e) { setFromInput(e.target.files?.[0] || null, 'xlsx'); }

  function setFromInput(file, kind) {
    const err = kind === 'pdf'
      ? validateFile(file, 'PDF', ['.pdf'])
      : validateFile(file, 'Excel', ['.xlsx']);
    if (err) {
      setError(err);
      if (kind === 'pdf') setPdf(null); else setXlsx(null);
      return;
    }
    if (kind === 'pdf') setPdf(file); else setXlsx(file);
    setError(null); setResult(null);
  }

  // ── Drag & drop ──
  function onDrop(e, kind) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const file = e.dataTransfer?.files?.[0];
    if (file) setFromInput(file, kind);
  }
  function onDragOver(e, kind) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setDragOver(kind);
  }
  function onDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
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
      onSuccess?.(res?.matchId);
    } catch (e) {
      setError(sanitize(e?.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="upload-dialog__backdrop"
      onClick={() => !busy && onClose?.()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="upload-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
      >
        <div className="upload-dialog__head">
          <span id="upload-dialog-title">Загрузка отчёта SportVisor</span>
          <button
            className="upload-dialog__x"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть диалог"
          >✕</button>
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

          {/* PDF drop-zone */}
          <button
            ref={firstFocusRef}
            className={'upload-dialog__pick' + (dragOver === 'pdf' ? ' upload-dialog__pick--drag' : '') + (pdf ? ' upload-dialog__pick--filled' : '')}
            onClick={() => pdfRef.current?.click()}
            onDrop={(e) => onDrop(e, 'pdf')}
            onDragOver={(e) => onDragOver(e, 'pdf')}
            onDragLeave={onDragLeave}
            disabled={busy}
            type="button"
            aria-label="Выбрать PDF файл или перетащить сюда"
          >
            <span className="upload-dialog__pick-icon">📄</span>
            <span className="upload-dialog__pick-text">
              {pdf ? pdf.name : 'Выбрать PDF или перетащить сюда'}
            </span>
            {pdf && <span className="upload-dialog__pick-size">{(pdf.size / 1024 / 1024).toFixed(1)} МБ</span>}
          </button>
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf"
            style={{ display: 'none' }} onChange={pickPdf} />

          {/* Excel drop-zone */}
          <button
            className={'upload-dialog__pick' + (dragOver === 'xlsx' ? ' upload-dialog__pick--drag' : '') + (xlsx ? ' upload-dialog__pick--filled' : '')}
            onClick={() => xlsxRef.current?.click()}
            onDrop={(e) => onDrop(e, 'xlsx')}
            onDragOver={(e) => onDragOver(e, 'xlsx')}
            onDragLeave={onDragLeave}
            disabled={busy}
            type="button"
            style={{ marginTop: 8 }}
            aria-label="Выбрать Excel файл или перетащить сюда (опционально)"
          >
            <span className="upload-dialog__pick-icon">📊</span>
            <span className="upload-dialog__pick-text">
              {xlsx ? xlsx.name : 'Excel (опционально) — выбрать или перетащить'}
            </span>
            {xlsx && <span className="upload-dialog__pick-size">{(xlsx.size / 1024 / 1024).toFixed(1)} МБ</span>}
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
          {error && <div className="upload-dialog__error" role="alert">⚠️ {error}</div>}
          {result && (
            <div className="upload-dialog__success" role="status">
              ✓ Отчёт разобран — {result.playersProcessed ?? '?'} игроков
              {result.excelColumns ? `, ${result.excelColumns} колонок Excel` : ''}.
              {result.matchId ? ' Открываем матч…' : ' Открываем список матчей…'}
            </div>
          )}

          <div className="upload-dialog__actions">
            <button className="upload-dialog__cancel" onClick={onClose} disabled={busy}>
              Закрыть
            </button>
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
