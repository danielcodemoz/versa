# Versa Pro — proposta (para o Daniel aprovar)

**Princípio:** tudo o que hoje é grátis **continua grátis** (todas as conversões, o editor de PDF, a app Windows), um ficheiro de cada vez. O Pro vende **volume**: tratar muitos ficheiros de uma vez. Quem tem um ficheiro nunca precisa de pagar.

## O que o Pro inclui (implementado neste PR)
- **Lote:** com vários ficheiros na roda, as acções abaixo correm em todos e saem num único ZIP (`primeiro + N (Versa).zip`).
  - PDF: para Word, para texto, comprimir, rodar, OCR, marca de água.
  - Word, Excel, PowerPoint para PDF.
  - Escola: cabeçalho, 2 por A4.
  - Imagens: JPG, PNG, WebP, AVIF, reduzir, redimensionar.
- Sem Pro, largar vários ficheiros nestas acções mostra «Vários ficheiros de uma vez: Versa Pro.» (as acções que já aceitavam vários, como Juntar, continuam livres). Divisão de PDF e «PDF para JPG» não entram no lote (já devolvem ZIP).
- **Apoio directo por mensagem** (compromisso teu, não é código).

## Preços propostos (valores para aprovar)
| Plano | Preço | Para quê |
| --- | --- | --- |
| Individual | **1.200 MT/ano** (100 MT/mês) | 1 computador: professor, estudante, freelancer |
| Escola | **6.000 MT/ano** | até 10 computadores (secretaria + salas) |

Referências: iLovePDF Premium custa US$48/ano (US$9 mês a mês) e o Smallpdf Pro US$9–15/mês, com lote incluído (capterra.com/p/173963/iLovePDF/pricing, trustradius.com/products/ilovepdf/pricing, capterra.com/p/172606/Smallpdf/pricing). Ao câmbio aproximado de 64 MT/US$, 1.200 MT são ~US$19/ano, cerca de 40% do iLovePDF anual, adequado ao poder de compra local e coerente com os outros produtos (GuestFlow 2.500–4.500 MT por evento; Kazi RH Básico 2.500 MT/mês). Os valores estão só em `src/pro-config.ts` (um sítio).

## Como se vende (sem servidor, como no GuestFlow)
1. O cliente paga por M-Pesa/e-Mola e envia o **código da transacção** e o nome.
2. O Daniel confirma o pagamento e emite a chave **no seu computador**:
   `node tools/licence.mjs sign <chave-privada> --name "Escola X" --until 2027-12-31`
3. O cliente cola a chave em `pro.html` («Já tens uma chave?»). A verificação é **offline**.

## Como funciona a licença
- Chave = `VERSA1.<dados>.<assinatura>`, assinada com ECDSA P-256. A app só leva a **chave pública**, por isso verifica mas não consegue criar chaves. Nenhum segredo vai para o git.
- Guarda-se no `localStorage` do browser/app. Expira na data `--until` (ou nunca, sem `--until`). Remover: botão em `pro.html`.
- **Limite honesto:** é uma app local, por isso alguém determinado pode contornar a verificação. Serve para utilizadores honestos; a fricção é baixa de propósito. Chaves não podem ser revogadas (só expiram), e o limite de 10 computadores da licença Escola é de confiança.

## O QUE FALTA / DECISÕES PARA O DANIEL
1. **Gerar o par de chaves (só o Daniel):** `node tools/licence.mjs keygen <pasta fora do repositório>`. Guarda a chave privada com cópia de segurança (sem ela não se emitem mais chaves). Cola a chave pública em `packages/engine/license.ts` (`publicKey`). **Enquanto estiver vazia, «Activar» diz que as licenças ainda não estão activadas e o Pro fica desligado**, ou seja, este PR não muda nada para os utilizadores até esse passo.
2. **Preencher M-Pesa, e-Mola e contacto** em `src/pro-config.ts` (`payment`); até lá a página diz «a confirmar».
3. Aprovar ou ajustar os preços e a lista de funcionalidades Pro (e a duração: anual).
4. Lançar como release (a página `pro.html` e o link «Pro» no menu só chegam à app Windows numa nova versão).
5. Não testei na app Windows (Tauri): só no browser. O arranque da app usa o mesmo código (`main.ts`), mas confirma a activação lá.
