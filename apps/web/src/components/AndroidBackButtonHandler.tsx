'use client';

/**
 * AndroidBackButtonHandler
 *
 * Invisível, no layout. Bug real achado na auditoria física em Android
 * (19/09/2026): com um sheet aberto (SheetShell — Vacinas, Medicação,
 * Loja etc.), o botão Voltar físico não fechava o sheet, fechava o app
 * inteiro (nenhum listener nativo estava registrado; o Capacitor cai no
 * comportamento padrão de sair do app quando não há histórico de
 * navegação pra desfazer).
 *
 * SheetShell já fecha ao receber Escape (ver sheet/SheetShell.tsx) — em
 * vez de duplicar essa lógica sheet por sheet, o Voltar físico só
 * dispara um Escape sintético quando existe um `role="dialog"` na tela.
 * Sem sheet aberto, comportamento inalterado (volta no histórico do
 * WebView ou sai do app, como já era antes desta correção).
 */
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function AndroidBackButtonHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const sub = App.addListener('backButton', ({ canGoBack }) => {
      if (document.querySelector('[role="dialog"]')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return;
      }
      if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });

    return () => { void sub.then((s) => s.remove()); };
  }, []);

  return null;
}
