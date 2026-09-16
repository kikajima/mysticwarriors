// Verificação visual (VLM) dos screenshots da v0.3
import ZAIModule from 'z-ai-web-dev-sdk';
import fs from 'fs';

const ZAI = ZAIModule.default ?? ZAIModule;

async function main() {
  const zai = await ZAI.create();
  const shots = [
    { file: 'scripts/shot-v03-dash.png', label: 'Dashboard desktop' },
    { file: 'scripts/shot-v03-mobile.png', label: 'Dashboard mobile 390px' },
  ];
  for (const s of shots) {
    if (!fs.existsSync(s.file)) {
      console.log(`${s.label}: arquivo ausente (${s.file})`);
      continue;
    }
    const b64 = fs.readFileSync(s.file).toString('base64');
    const res = await zai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Este é um screenshot de um jogo de navegador estilo RPG (tema escuro âmbar/laranja). ' +
                'Verifique objetivamente: 1) a página renderizou corretamente (sem tela branca/erro)? ' +
                '2) o avatar do personagem aparece? 3) o layout parece íntegro (sem elementos sobrepostos ou quebrados)? ' +
                'Responda em uma linha: "OK" ou "PROBLEMA: <detalhe>".',
            },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
      temperature: 0.1,
    });
    console.log(`${s.label}: ${res.choices[0]?.message?.content?.trim()}`);
  }
}

main().catch((e) => {
  console.error('VLM falhou:', e.message);
  process.exit(1);
});
