import React, { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { errorText } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert, cls, Field, Modal, useToast } from './ui';

// "Changer mon mot de passe" from the account menu. Other devices are signed out by the server.
export const ChangePasswordModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!current) return setError('Saisissez votre mot de passe actuel.');
    if (next.length < 8) return setError('Le nouveau mot de passe doit comporter au moins 8 caractères.');
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      toast('Mot de passe modifié.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Changer mon mot de passe"
      subtitle="Vos autres appareils seront déconnectés."
      footer={
        <button className={cls.primary} onClick={submit} disabled={busy}>
          {busy && <LoaderCircle size={14} className="animate-spin" />}
          Enregistrer
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="Mot de passe actuel">
          <input type="password" autoComplete="current-password" className={cls.input} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nouveau mot de passe" hint="8 caractères minimum.">
          <input type="password" autoComplete="new-password" className={cls.input} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <input type="password" autoComplete="new-password" className={cls.input} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
};
