# AGENTS.md — repositório de SITE NOVO (*.danielpro.dev)

Este repositório foi criado a partir de `danielcodemoz/site-template`. É um **site novo e estático**.
O Daniel autoriza-te a construir e **publicar** este site do início ao fim, sem pedir aprovação.

## Como se publica (não tens acesso ao servidor e não precisas)
1. Em `danielpro-site.json` põe o subdomínio: `{"subdominio": "<nome>"}` → `https://<nome>.danielpro.dev`.
   - Regra do nome: `^[a-z][a-z0-9-]{1,30}$`, sem hífen no fim. `mudar-isto` é ignorado.
   - Não podes usar nomes de sites que já existem (ex.: www, api, admin, willow, educare, simlab, portfolio, test...).
     Se o nome for recusado, o site não aparece: escolhe outro nome num novo PR.
   - Depois de publicado, **não mudes o subdomínio** (mudar não cria um segundo site).
2. Site estático (HTML/CSS/JS). `index.html` na raiz **ou** faz o build e faz commit de `dist/` com `dist/index.html`
   (se existir `dist/index.html`, é `dist/` que vai para o ar). Sem PHP, sem servidor, sem base de dados.
3. Abre o PR num ramo `codex/...` para `main`. O workflow `auto-merge-codex` faz squash-merge sozinho
   (também se o PR estiver em rascunho). Não alteres nem apagues esse workflow.
4. O servidor detecta o repo e publica: o **primeiro** site aparece em ~2–5 minutos (cria HTTPS), as actualizações em ~1–3 minutos.
5. Verifica: `curl -sI https://<nome>.danielpro.dev` e `curl -s https://<nome>.danielpro.dev | head`.
   Se ainda mostrar "em breve" ou não resolver, espera 2 minutos e volta a verificar (até ~10 minutos).

## Regras
- O repo tem de continuar **público** (o servidor só lê repos públicos).
- Não ponhas no git: `.exe`, `.zip`, `.msi`, `.apk`, vídeos, ficheiros grandes, `.env`, chaves, palavras-passe ou tokens.
- Downloads grandes: links para ficheiros públicos (ex.: assets de uma GitHub Release de um repo público). Não tens acesso ao servidor.
- Links relativos ou absolutos ao próprio site; sem links partidos; funciona no telemóvel e no computador.
- Não mexas em nenhum outro repositório nem em nenhum outro site. Não faças force push.
- Língua por defeito: português de Moçambique.

## Sites estáticos que já existem (fora deste template)
- Sites antigos de fora do template (ex.: speeddisc, folderx, youtubedownloader) publicam-se com `sudo -n dots-static-register` no servidor (só o Dots, via `ssh contabo-codex`): regista-se uma vez (`dots-static-register <nome> --repo danielcodemoz/<repo> --target /var/www/<pasta> [--subdir <pasta>] --preserve download/ --dry-run`, depois sem `--dry-run`) e a seguir cada merge em `main` vai para o ar em ~2 min; manual: `sudo -n dots-deploy <nome> [commit]` / `sudo -n dots-rollback <nome>`. Recusa sites de produção. **Não é preciso para repos criados a partir deste template.**

## Reportar no fim
Link do site, último commit publicado (`git rev-parse --short HEAD` em main), URL do PR, páginas/secções,
o que verificaste (saída do curl) e o que ficou por fazer.
