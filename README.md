# site-template — sites novos em *.danielpro.dev

Modelo para o Dots (Codex) criar e publicar um site estático novo sozinho.

## 3 passos do Daniel
1. **GitHub → New repository → Repository template: `danielcodemoz/site-template`**, escolhe um nome e deixa **Public**.
2. **Codex → Environments → Create environment** para esse repositório.
3. **Escreve a tarefa** no Codex (ex.: "Constrói o site de X e publica em x.danielpro.dev").

O Dots lê o `AGENTS.md`, põe o subdomínio em `danielpro-site.json`, abre o PR num ramo `codex/...`,
o workflow faz o merge e o servidor publica em poucos minutos com HTTPS.

Para desligar a criação automática no servidor: `systemctl disable --now novo-site-auto.timer`.
