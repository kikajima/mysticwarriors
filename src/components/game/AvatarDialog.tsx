'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { uploadAvatarToStorage } from '@/lib/supabase/client';
import type { PlayerView } from '@/lib/game/types';
import { PlayerAvatar } from './Bits';
import { GameButton } from './Bits';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link2, UploadCloud, Trash2 } from 'lucide-react';

// =====================================================================
// Dialog de troca de avatar — duas abas:
//  1) URL externa (validada no servidor: apenas http/https)
//  2) Upload do dispositivo (JPG/PNG/WebP até 5 MB, validado por
//     magic bytes no servidor)
// Toda a validação real é SERVER-SIDE — aqui é só a UX (preview,
// loading, toasts). O servidor devolve o avatarUrl autoritativo.
// =====================================================================

type Tab = 'url' | 'upload';

// =====================================================================
// v0.9.2 — COMPRESSÃO NO NAVEGADOR antes do upload
// ---------------------------------------------------------------------
// Fotos de celular têm 2–8 MB e: (a) demoram para subir em 3G/4G;
// (b) podem ser barradas por limites de tamanho do proxy de produção
// (o usuário via “erro de carregamento”). Aqui a imagem é redimensionada
// para no máximo 512×512 (corte central) e re-codificada em JPEG — cai
// para dezenas de KB, sobe rápido e passa por qualquer proxy.
// Se algo falhar (formato exótico, navegador antigo), envia o original
// e deixa o servidor decidir (validação por magic bytes continua lá).
// =====================================================================
const AVATAR_MAX_EDGE = 512;

async function compressForUpload(file: File): Promise<File> {
  try {
    if (file.size <= 300 * 1024) return file; // já é pequeno — envia direto
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

    const bitmap = await createImageBitmap(file);
    try {
      // corte central (cover): aproveita o quadrado maior da imagem
      const side = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - side) / 2;
      const sy = (bitmap.height - side) / 2;
      const scale = Math.min(1, AVATAR_MAX_EDGE / side);
      const out = Math.max(1, Math.round(side * scale));

      const canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.87)
      );
      if (!blob || blob.size <= 0) return file;
      // só vale a pena se realmente encolheu
      if (blob.size >= file.size && file.size <= 5 * 1024 * 1024) return file;
      return new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
    } finally {
      bitmap.close();
    }
  } catch {
    return file; // qualquer surpresa → original (servidor valida)
  }
}

export function AvatarDialog({
  open,
  onOpenChange,
  player,
  onAvatarChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: PlayerView;
  onAvatarChanged: (avatarUrl: string | null) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // v0.4 — CICLO DE VIDA do objectURL da prévia de upload: criado UMA vez
  // por arquivo (useEffect) e SEMPRE revogado (URL.revokeObjectURL) na
  // troca/limpeza/desmontagem — sem criar novas URLs a cada renderização.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // limpeza extra ao fechar o modal (estado interno descartado)
  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
    }
  }, [open]);

  const reset = () => {
    setUrl('');
    setFile(null);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const close = () => {
    if (loading) return; // nunca fechar durante o envio
    reset();
    onOpenChange(false);
  };

  const applyResult = async (data: { avatarUrl?: string | null }) => {
    // confirma que a NOVA imagem realmente carrega no navegador antes de
    // anunciar sucesso (o servidor já persistiu; o preload é a prova final)
    const url = data.avatarUrl ?? null;
    if (url) {
      const loaded = await new Promise<boolean>((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => resolve(false), 6000);
        img.onload = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        img.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
        img.src = url;
      });
      if (!loaded) {
        // persistiu mas não carregou — mantém, avisa e permite nova tentativa
        onAvatarChanged(url);
        reset();
        onOpenChange(false);
        toast({
          title: '🖼️ Avatar salvo',
          description: 'A imagem demorou para carregar — se o retrato não aparecer, tente outra imagem.',
          className: 'border-amber-600 bg-amber-950 text-amber-100',
        });
        return;
      }
    }
    onAvatarChanged(url);
    reset();
    onOpenChange(false);
    toast({
      title: '🖼️ Avatar atualizado!',
      description: 'Seu guerreiro tem uma nova cara.',
      className: 'border-emerald-600 bg-emerald-950 text-emerald-100',
    });
  };

  const submitUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast({
        title: '⚠ Cole a URL primeiro',
        description: 'Exemplo: https://exemplo.com/minha-imagem.png',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/game/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, type: 'url', url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        toast({
          title: '⚠ URL rejeitada',
          description: data.error?.message ?? 'Use uma URL http/https válida de imagem.',
          variant: 'destructive',
        });
        return;
      }
      applyResult(data);
    } catch {
      toast({
        title: '⚠ Erro de conexão',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const submitUpload = async () => {
    if (!file) {
      toast({
        title: '⚠ Escolha um arquivo',
        description: 'Imagens JPG, PNG ou WebP de até 5 MB.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      // v0.9.2: otimiza a imagem NO NAVEGADOR (máx 512×512, JPEG) —
      // upload leve que passa por proxies restritivos
      const payload = await compressForUpload(file);

      // v0.9.4: conta logada → imagem vai para o SUPABASE STORAGE (nuvem):
      // sobrevive a qualquer limpeza do servidor e volta ao relogar. Se o
      // Storage não estiver disponível (ou for convidado), cai no upload
      // antigo do servidor do jogo.
      const storageUrl = await uploadAvatarToStorage(payload);
      if (storageUrl) {
        const res = await fetch('/api/game/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: player.id, type: 'storage', url: storageUrl }),
        });
        const data = await res.json();
        if (!res.ok || data.success === false) {
          toast({
            title: '⚠ Não foi possível usar a imagem da nuvem',
            description: data.error?.message ?? 'Tente novamente em instantes.',
            variant: 'destructive',
          });
          return;
        }
        applyResult(data);
        return;
      }

      // caminho antigo: upload direto no servidor do jogo
      const form = new FormData();
      form.append('playerId', player.id);
      form.append('type', 'upload');
      form.append('file', payload);
      const res = await fetch('/api/game/avatar', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        toast({
          title: '⚠ Upload rejeitado',
          description: data.error?.message ?? 'Envie uma imagem JPG, PNG ou WebP de até 5 MB.',
          variant: 'destructive',
        });
        return;
      }
      applyResult(data);
    } catch {
      toast({
        title: '⚠ Erro de conexão',
        description: 'Não deu para enviar. Verifique sua internet e tente de novo — fotos grandes são otimizadas automaticamente, mas acima de 5 MB não são aceitas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const removeAvatar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/game/avatar?playerId=${player.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        toast({
          title: '⚠ Não foi possível remover',
          description: data.error?.message ?? 'Tente novamente.',
          variant: 'destructive',
        });
        return;
      }
      onAvatarChanged(null);
      reset();
      onOpenChange(false);
      toast({ description: 'Avatar removido — voltou ao retrato da sua raça.' });
    } catch {
      toast({
        title: '⚠ Erro de conexão',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const previewSrc = tab === 'url' ? url.trim() || null : previewUrl;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="bg-[#1a130c] border-amber-800/60 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-amber-100">🖼️ Mudar Avatar</DialogTitle>
          <DialogDescription className="text-amber-200/50 text-xs">
            {player.name} — use uma URL ou envie do dispositivo.
          </DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-2" role="tablist" aria-label="Modo de avatar">
          {(
            [
              { key: 'url', label: 'URL Externa', icon: <Link2 className="w-3.5 h-3.5" /> },
              { key: 'upload', label: 'Upload', icon: <UploadCloud className="w-3.5 h-3.5" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 font-heading text-xs px-3 py-2 rounded-lg border transition-all ${
                tab === t.key
                  ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white border-orange-400'
                  : 'bg-black/30 text-amber-200/70 border-amber-900/40 hover:border-amber-600/50'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="flex items-center gap-4 py-2">
          {previewSrc ? (
            <img
              src={previewSrc}
              alt="Pré-visualização do avatar"
              className="w-20 h-20 rounded-full object-cover border-2 border-amber-500/40 shadow-lg shadow-orange-900/40"
            />
          ) : (
            <PlayerAvatar
              race={player.race}
              avatarUrl={player.avatarUrl}
              className="w-20 h-20"
              emojiSize="text-4xl"
            />
          )}
          <div className="text-xs text-amber-200/50 leading-relaxed">
            {tab === 'url'
              ? 'Cole o link HTTPS direto de uma imagem. O servidor baixa, valida e espelha o arquivo — link de página, imagem inexistente ou bloqueio do provedor são detectados na hora.'
              : 'JPG, PNG ou WebP de até 5 MB. A imagem é otimizada no seu próprio dispositivo (corte central de até 512×512) e, com conta logada, é guardada na nuvem — volta ao relogar em qualquer aparelho.'}
          </div>
        </div>

        {/* Conteúdo da aba */}
        {tab === 'url' ? (
          <div>
            <label htmlFor="avatar-url" className="sr-only">
              URL da imagem
            </label>
            <input
              id="avatar-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && submitUrl()}
              placeholder="https://exemplo.com/minha-imagem.png"
              maxLength={500}
              disabled={loading}
              className="w-full bg-black/40 border border-amber-800/50 rounded-lg px-4 py-3 text-sm text-amber-100 placeholder:text-amber-200/30 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-900/50 font-heading"
            />
            <div className="flex justify-between items-center gap-2 mt-4">
              <GameButton variant="ghost" size="sm" onClick={removeAvatar} disabled={loading || !player.avatarUrl}>
                <Trash2 className="w-3.5 h-3.5" /> Remover
              </GameButton>
              <GameButton variant="gold" onClick={submitUrl} disabled={loading}>
                {loading ? 'Salvando...' : 'Confirmar'}
              </GameButton>
            </div>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              id="avatar-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={loading}
              className="sr-only"
            />
            <label
              htmlFor="avatar-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-amber-900/50 rounded-xl p-6 cursor-pointer hover:border-orange-500/70 hover:bg-orange-950/10 transition-all text-amber-200/60"
            >
              <UploadCloud className="w-8 h-8" />
              <span className="font-heading text-sm">
                {file ? file.name : 'Toque para escolher uma imagem'}
              </span>
              <span className="text-[11px] text-amber-200/40">
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB selecionados` : 'JPG · PNG · WebP · máx 5 MB'}
              </span>
            </label>
            <div className="flex justify-between items-center gap-2 mt-4">
              <GameButton variant="ghost" size="sm" onClick={removeAvatar} disabled={loading || !player.avatarUrl}>
                <Trash2 className="w-3.5 h-3.5" /> Remover
              </GameButton>
              <GameButton variant="gold" onClick={submitUpload} disabled={loading}>
                {loading ? 'Enviando...' : 'Fazer Upload'}
              </GameButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
