import { useState } from 'react';

export function useQuickMark() {
  const [quickMarkId, setQuickMarkId] = useState<string | null>(null);
  const [quickMarkDate, setQuickMarkDate] = useState('');
  const [quickMarkNotes, setQuickMarkNotes] = useState('');
  const [quickMarkSaving, setQuickMarkSaving] = useState(false);
  const [quickMarkToast, setQuickMarkToast] = useState<string | null>(null);

  return {
    quickMarkId,
    setQuickMarkId,
    quickMarkDate,
    setQuickMarkDate,
    quickMarkNotes,
    setQuickMarkNotes,
    quickMarkSaving,
    setQuickMarkSaving,
    quickMarkToast,
    setQuickMarkToast,
  };
}
